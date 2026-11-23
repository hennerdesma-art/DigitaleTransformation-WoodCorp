import type {SupabaseClient} from '@supabase/supabase-js';

export type InvitationTicket={token:string;type:'invite'|'magiclink'};
/** Read and remove the URL fragment before rendering/logging. The code is held
 * only in this browser page's memory until password submission. */
export function extractInviteTicket(hash:string):InvitationTicket|null{
 if(!hash.startsWith('#'))return null;
 const params=new URLSearchParams(hash.slice(1));
 const type=params.get('type');
 const token=params.get('nxt_invite')||'';
 if(type!=='invite'&&type!=='magiclink')return null;
 if(!/^[0-9a-f]{32,128}$/i.test(token))return null;
 return {token,type};
}
/** Kept for compatibility with the existing URL parser/test. */
export function extractInviteToken(hash:string):string|null{
 return extractInviteTicket(hash)?.token||null;
}
export function isInviteFragment(hash:string):boolean{
 return hash.startsWith('#')&&new URLSearchParams(hash.slice(1)).has('nxt_invite');
}
export function humanAuthError(err:unknown):string{
 const message=err instanceof Error?err.message:String(err||'');
 if(/auth session missing|session not found|invalid refresh token/i.test(message))
  return 'Die Anmeldung wurde auf diesem Gerät nicht dauerhaft übernommen. Bitte einen neuen einmaligen Link öffnen und das Passwort in demselben Browserfenster festlegen.';
 if(/expired|invalid.*token|otp.*invalid|token has expired/i.test(message))
  return 'Dieser Einladungslink wurde bereits verwendet oder ist abgelaufen. Bitte in „Team & Zugänge“ einen neuen Link erzeugen lassen.';
 return message||'Die Einladung konnte nicht abgeschlossen werden.';
}
/** Verify the one-time token DIRECTLY BEFORE setting the password.
 * The prior implementation redeemed it on page load, then showed a form even
 * on mobile browsers where the Supabase session had been lost in the interim.
 * Never use a cached unrelated session to update the invited user's password. */
export async function completeInvitation(client:SupabaseClient,ticket:InvitationTicket,password:string):Promise<void>{
 const {data,error}=await client.auth.verifyOtp({token_hash:ticket.token,type:ticket.type});
 if(error)throw new Error(humanAuthError(error));
 if(!data.user?.id||!data.session?.access_token||!data.session?.refresh_token)
  throw new Error('Der Zugangscode konnte keine vollständige Auth-Sitzung herstellen. Bitte einen neuen Einladungslink anfordern.');
 const expected=data.user.id;
 const sessionTokens={
  access_token:data.session.access_token,
  refresh_token:data.session.refresh_token
 };
 const existing=await client.auth.getSession();
 if(existing.error||existing.data.session?.user?.id!==expected){
  const result=await client.auth.setSession(sessionTokens);
  if(result.error||result.data.session?.user?.id!==expected)
   throw new Error('Die Anmeldung konnte nicht gespeichert werden. Bitte den Link in Safari oder Chrome direkt öffnen.');
 }
 let updated=await client.auth.updateUser({password});
 if(updated.error&&/auth session missing|session not found/i.test(updated.error.message)){
  // One bounded re-establishment for browsers which dropped storage at submit.
  const restored=await client.auth.setSession(sessionTokens);
  if(restored.error||restored.data.session?.user?.id!==expected)
   throw new Error(humanAuthError(updated.error));
  updated=await client.auth.updateUser({password});
 }
 if(updated.error)throw new Error(humanAuthError(updated.error));
 if(updated.data.user?.id!==expected)
  throw new Error('Die Passwortänderung konnte keinem bestätigten Teamzugang zugeordnet werden.');
}

/** Only handle a one-time hashed Supabase invite. URL fragments are never sent in HTTP requests. */
export function extractInviteToken(hash:string):string|null{
 if(!hash||!hash.startsWith('#'))return null;
 const params=new URLSearchParams(hash.slice(1));
 if(params.get('type')!=='invite')return null;
 const token=params.get('nxt_invite')||'';
 return /^[0-9a-f]{32,128}$/i.test(token)?token:null;
}
export function isInviteFragment(hash:string):boolean{
 return hash.startsWith('#')&&new URLSearchParams(hash.slice(1)).has('nxt_invite');
}

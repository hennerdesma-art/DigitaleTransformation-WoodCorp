import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {extractInviteToken,extractInviteTicket,isInviteFragment,completeInvitation,humanAuthError} from '../lib/invite';

const token='a'.repeat(64);
const ticket={token,type:'invite' as const};
const user={id:'11111111-1111-4111-8111-111111111111',email:'new@example.edu'};
const session={user,access_token:'access',refresh_token:'refresh'};
const wrong={user:{id:'22222222-2222-4222-8222-222222222222'},access_token:'wrong',refresh_token:'wrong'};
function mock(options:{initial?:typeof session|typeof wrong|null;noSession?:boolean;firstUpdateError?:boolean;otpError?:boolean}={}){
 const calls:string[]=[];
 let saved=options.initial===undefined?session:options.initial;
 let updated=0;
 const client={
  auth:{
   verifyOtp:async (arg:{token_hash:string;type:string})=>{
    calls.push('verify:'+arg.type+':'+arg.token_hash.slice(0,3));
    return options.otpError?{data:{user:null,session:null},error:new Error('Token has expired')}:
      {data:{user,session:options.noSession?null:session},error:null};
   },
   getSession:async()=>{calls.push('getSession');return {data:{session:saved},error:null};},
   setSession:async (_creds:unknown)=>{calls.push('setSession');saved=session;return {data:{session:saved},error:null};},
   updateUser:async ({password}:{password:string})=>{
    calls.push('updateUser:'+password.length);updated++;
    if(options.firstUpdateError&&updated===1)return {data:{user:null},error:new Error('Auth session missing!')};
    return {data:{user},error:null};
   }
  }
 } as unknown as SupabaseClient;
 return {client,calls};
}
test('direct first-party URL recognizes only valid invite or renewal token fragments',()=>{
 assert.deepEqual(extractInviteTicket('#nxt_invite='+token+'&type=invite'),ticket);
 assert.deepEqual(extractInviteTicket('#nxt_invite='+token+'&type=magiclink'),{token,type:'magiclink'});
 assert.equal(extractInviteToken('#nxt_invite='+token+'&type=invite'),token);
 assert.equal(extractInviteToken('#access_token=abc&type=invite'),null);
 assert.equal(extractInviteTicket('#nxt_invite=malicious&type=invite'),null);
 assert.equal(extractInviteTicket('#nxt_invite='+token+'&type=recovery'),null);
 assert.equal(isInviteFragment('#nxt_invite=bad&type=invite'),true);
});
test('one-time invitation and password update share the same verified session',async()=>{
 const {client,calls}=mock();
 await completeInvitation(client,ticket,'correcthorsebatterystaple');
 assert.deepEqual(calls,['verify:invite:aaa','getSession','updateUser:25']);
});
test('stale session for a different user is replaced BEFORE password change',async()=>{
 const {client,calls}=mock({initial:wrong});
 await completeInvitation(client,{...ticket,type:'magiclink'},'correcthorsebatterystaple');
 assert.deepEqual(calls,['verify:magiclink:aaa','getSession','setSession','updateUser:25']);
});
test('missing persistent session is restored before password change',async()=>{
 const {client,calls}=mock({initial:null});
 await completeInvitation(client,ticket,'correcthorsebatterystaple');
 assert.deepEqual(calls,['verify:invite:aaa','getSession','setSession','updateUser:25']);
});
test('one bounded retry handles Auth session missing during update',async()=>{
 const {client,calls}=mock({firstUpdateError:true});
 await completeInvitation(client,ticket,'correcthorsebatterystaple');
 assert.deepEqual(calls,['verify:invite:aaa','getSession','updateUser:25','setSession','updateUser:25']);
});
test('missing OTP session prevents setting any password',async()=>{
 const {client,calls}=mock({noSession:true});
 await assert.rejects(completeInvitation(client,ticket,'correcthorsebatterystaple'),/vollständige Auth-Sitzung/);
 assert.deepEqual(calls,['verify:invite:aaa']);
});
test('expired OTP is shown as a useful error and is not used to update password',async()=>{
 const {client,calls}=mock({otpError:true});
 await assert.rejects(completeInvitation(client,ticket,'correcthorsebatterystaple'),/bereits verwendet oder ist abgelaufen/);
 assert.deepEqual(calls,['verify:invite:aaa']);
 assert.match(humanAuthError(new Error('Auth session missing!')),/nicht dauerhaft übernommen/);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {extractInviteToken,isInviteFragment} from '../lib/invite';
test('NXT direct invite fragment is accepted without exposing Supabase action URLs',()=>{
 const h='#nxt_invite='+('a'.repeat(64))+'&type=invite';
 assert.equal(extractInviteToken(h),'a'.repeat(64));assert.equal(isInviteFragment(h),true);
 assert.equal(extractInviteToken('#access_token=abc&type=invite'),null);
 assert.equal(extractInviteToken('#nxt_invite=malicious&type=invite'),null);
 assert.equal(extractInviteToken('#nxt_invite='+('b'.repeat(64))+'&type=recovery'),null);
});

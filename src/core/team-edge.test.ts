import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type User={id:string;email:string;user_metadata?:Record<string,string>;email_confirmed_at?:string|null};
const actor='11111111-1111-4111-8111-111111111111';
const target='22222222-2222-4222-8222-222222222222';
const fresh='33333333-3333-4333-8333-333333333333';
function harness(revoked=false){
 const users:User[]=[
  {id:actor,email:'admin@example.edu',email_confirmed_at:'2026-11-01'},
  {id:target,email:'team@example.edu',email_confirmed_at:null,user_metadata:{full_name:'Team Example'}}
 ];
 const members=[{user_id:actor,role:'admin',granted_at:'2026-11-01'},
  ...(!revoked?[{user_id:target,role:'analyst',granted_at:'2026-11-02'}]:[])];
 const workspaces=[{id:'w1',owner_id:target},{id:'w2',owner_id:actor}];
 const audits:Array<{email:string;user_id:string;role:string;created_by:string;delivery_mode:string;created_at:string}>=[];
 const calls:string[]=[];
 class Query{
  table:string;filters:Array<[string,unknown]>=[];op='select';payload:any;head=false;limitCount=500;
  constructor(table:string){this.table=table;}
  select(_cols:string,opts?:{count?:string;head?:boolean}){this.head=!!opts?.head;return this}
  eq(field:string,value:unknown){this.filters.push([field,value]);return this}
  gte(field:string,value:unknown){this.filters.push([field,value]);return this}
  order(){return this}limit(v:number){this.limitCount=v;return this}
  insert(payload:any){this.op='insert';this.payload=payload;return this}
  update(payload:any){this.op='update';this.payload=payload;return this}
  delete(){this.op='delete';return this}
  rows():any[]{const table=this.table==='woodcorp_access'?members:this.table==='nxt_workspaces'?workspaces:audits;
   return table.filter((row:any)=>this.filters.every(([k,v])=>k==='created_at'?true:row[k]===v)).slice(0,this.limitCount);}
  result(){
   if(this.op==='insert'){const data=Array.isArray(this.payload)?this.payload:[this.payload];const table=this.table==='woodcorp_access'?members:audits;table.push(...data);calls.push('insert:'+this.table);return {data:null,error:null};}
   if(this.op==='delete'){const table=this.table==='woodcorp_access'?members:this.table==='nxt_workspaces'?workspaces:audits;const before=table.length;for(let i=table.length-1;i>=0;i--){if(this.filters.every(([k,v])=>(table[i] as any)[k]===v))table.splice(i,1);}
    calls.push('delete:'+this.table+':'+(before-table.length));return {data:null,error:null};}
   if(this.op==='update'){for(const row of this.rows())Object.assign(row,this.payload);return {data:null,error:null};}
   const data=this.rows();return {data:this.head?null:data,error:null,count:data.length};
  }
  maybeSingle(){const out=this.result();return Promise.resolve({...out,data:Array.isArray(out.data)?(out.data[0]||null):out.data});}
  then(onFulfilled:(value:any)=>unknown,onRejected?:((e:unknown)=>unknown)){
   return Promise.resolve(this.result()).then(onFulfilled,onRejected);
  }
 }
 let generated:any=null;
 const admin={
  from:(name:string)=>new Query(name),
  auth:{
   getUser:async(token:string)=>token==='test-admin-token'?{data:{user:{id:actor}},error:null}:{data:{user:null},error:new Error('forbidden')},
   admin:{
    listUsers:async()=>({data:{users},error:null}),
    getUserById:async(id:string)=>({data:{user:users.find(u=>u.id===id)||null},error:null}),
    generateLink:async(params:any)=>{
     generated=params;calls.push('generate:'+params.type);
     let u=users.find(x=>x.email===params.email);
     if(!u&&params.type==='invite'){
      u={id:fresh,email:params.email,user_metadata:params.options?.data,email_confirmed_at:null};
      users.push(u);
     }
     return {data:{user:u,properties:{hashed_token:'a'.repeat(64)}},error:u?null:new Error('no user')};
    },
    deleteUser:async(id:string,soft?:boolean)=>{
     calls.push('deleteUser:'+id+':'+String(soft));
     const index=users.findIndex(u=>u.id===id);
     if(index<0)return {error:new Error('missing')};
     users.splice(index,1);
     for(let i=members.length-1;i>=0;i--)if(members[i].user_id===id)members.splice(i,1);
     for(let i=workspaces.length-1;i>=0;i--)if(workspaces[i].owner_id===id)workspaces.splice(i,1);
     return {data:{user:{id}},error:null};
    }
   }
  }
 };
 const code=readFileSync(new URL('../../supabase/functions/nxt-members/index.ts',import.meta.url),'utf8');
 const transpiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let handler:(req:Request)=>Promise<Response>=async()=>new Response('Not initialized');
 vm.runInNewContext(transpiled,{
  exports:{},
  require:(mod:string)=>mod.startsWith('npm:@supabase/supabase-js')?{createClient:()=>admin}:null,
  Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://example.supabase.co':'dummy-key'},serve:(cb:any)=>{handler=cb}},
  Request,Response,Headers,TextEncoder,crypto:globalThis.crypto,console
 },{timeout:1000});
 const call=async(body:Record<string,unknown>,token='test-admin-token')=>{
  const req=new Request('https://example.supabase.co/functions/v1/nxt-members',{
   method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token,'origin':'https://hennerdesma-art.github.io'},
   body:JSON.stringify(body)
  });
  const res=await handler(req);return {status:res.status,body:await res.json()};
 };
 return {call,users,members,workspaces,audits,calls,getGenerated:()=>generated};
}
test('no revoked Auth identity can be silently restored by typing its email',async()=>{
 const h=harness(true);
 const res=await h.call({action:'invite',display_name:'Team Example',email:'team@example.edu',role:'viewer'});
 assert.equal(res.status,409);
 assert.match(res.body.error,/keine automatische Wiederfreigabe/);
 assert.equal(h.members.some(m=>m.user_id===target),false);
 assert.equal(h.calls.some(c=>c.startsWith('generate:')),false);
});
test('a new invite validates name and saves it in Auth metadata',async()=>{
 const h=harness();
 const bad=await h.call({action:'invite',display_name:'T',email:'fresh@example.edu',role:'viewer'});
 assert.equal(bad.status,400);
 const res=await h.call({action:'invite',display_name:'Fresh Person',email:'fresh@example.edu',role:'viewer'});
 assert.equal(res.status,200);
 assert.match(res.body.link,/hennerdesma-art\.github\.io.*#nxt_invite=/);
 assert.equal(h.getGenerated().options.data.full_name,'Fresh Person');
 assert.equal(h.members.find(m=>m.user_id===fresh)?.role,'viewer');
});
test('existing members can request a NEW one-time link without creating a new user',async()=>{
 const h=harness();
 const res=await h.call({action:'renew',userId:target});
 assert.equal(res.status,200);assert.match(res.body.link,/type=magiclink/);
 assert.equal(h.getGenerated().type,'magiclink');
 assert.equal(h.users.length,2);assert.equal(h.members.length,2);
});
test('hard delete requires exact email and removes Auth identity with associated workspaces',async()=>{
 const h=harness();
 const blocked=await h.call({action:'remove',userId:target,confirmEmail:'wrong@example.edu'});
 assert.equal(blocked.status,400);assert.equal(h.users.length,2);
 const result=await h.call({action:'remove',userId:target,confirmEmail:'team@example.edu'});
 assert.equal(result.status,200);assert.equal(result.body.status,'deleted');
 assert.equal(result.body.deleted_workspaces,1);
 assert.equal(h.users.find(u=>u.id===target),undefined);
 assert.equal(h.members.find(m=>m.user_id===target),undefined);
 assert.equal(h.workspaces.some(w=>w.owner_id===target),false);
 assert.ok(h.calls.includes('deleteUser:'+target+':false'));
});
test('admin privilege and self deletion are denied by the Edge Function',async()=>{
 const h=harness();
 assert.equal((await h.call({action:'list'},'invalid-token')).status,403);
 assert.equal((await h.call({action:'remove',userId:actor,confirmEmail:'admin@example.edu'})).status,400);
 assert.equal(h.users.length,2);
});

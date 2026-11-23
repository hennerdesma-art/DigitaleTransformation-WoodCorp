import { createClient } from "npm:@supabase/supabase-js@2.119.0";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL="https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/";
const userIdRegex=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeName=(value:unknown):value is string=>typeof value==="string"&&value.trim().length>=2&&value.trim().length<=100&&!/[\u0000-\u001F\u007F]/.test(value);
const displayName=(u:any)=>typeof u?.user_metadata?.full_name==="string"?u.user_metadata.full_name:
 typeof u?.user_metadata?.name==="string"?u.user_metadata.name:"";
const admin = createClient(url, serviceKey, {auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
const allowedOrigins = new Set(["https://hennerdesma-art.github.io", "http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5173", "http://127.0.0.1:5173"]);
const response = (body:unknown, code=200, origin="") => new Response(code===204?null:JSON.stringify(body), {status:code,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://hennerdesma-art.github.io","access-control-allow-headers":"authorization, content-type, apikey, x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store","vary":"Origin"}});
const safeEmail = (email:unknown) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const digest = async (s:string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
async function trustedAdmin(req:Request) {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return null;
  const {data, error} = await admin.auth.getUser(bearer);
  if(error || !data?.user) return null;
  const {data:member,error:membershipError} = await admin.from("woodcorp_access").select("role").eq("user_id",data.user.id).maybeSingle();
  if(membershipError || member?.role !== "admin") return null;
  return data.user;
}
Deno.serve(async (req:Request) => {
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS") return response({},204,origin);
  if(req.method!=="POST") return response({error:"Methode nicht erlaubt"},405,origin);
  if(origin && !allowedOrigins.has(origin)) return response({error:"Origin nicht erlaubt"},403,origin);
  let body:any;
  try {if(Number(req.headers.get("content-length")||0)>16000) return response({error:"Zu grosse Anfrage"},413,origin); body=await req.json();} catch {return response({error:"Ungueltiges JSON"},400,origin)}
  try {
    if(body?.action==="bootstrap") {
      const secret=body.setupCode, password=body.password;
      if(typeof secret!=="string" || secret.length>160 || typeof password!=="string" || password.length<12 || password.length>200) return response({error:"Ungueltige Eingabe"},400,origin);
      const {data:bootstrap,error:readError}=await admin.from("nxt_bootstrap").select("*").eq("id",1).single();
      if(readError || !bootstrap || bootstrap.consumed_at || new Date(bootstrap.expires_at).getTime()<Date.now()) return response({error:"Einrichtung nicht verfuegbar"},403,origin);
      if((await digest(secret))!==bootstrap.secret_hash) return response({error:"Einrichtungscode ungueltig"},403,origin);
      const claimed=new Date().toISOString();
      const {data:claim,error:claimError}=await admin.from("nxt_bootstrap").update({consumed_at:claimed}).eq("id",1).is("consumed_at",null).select("id").maybeSingle();
      if(claimError || !claim) return response({error:"Einrichtung bereits verwendet"},409,origin);
      const {data:created,error:createError}=await admin.auth.admin.createUser({email:bootstrap.expected_email,password,email_confirm:true,app_metadata:{nxt_bootstrap:true}});
      if(createError || !created?.user) {
        await admin.from("nxt_bootstrap").update({consumed_at:null}).eq("id",1).eq("consumed_at",claimed);
        return response({error:"Benutzeranlage fehlgeschlagen. Pruefe, ob der Account bereits existiert."},409,origin);
      }
      const {error:grantError}=await admin.from("woodcorp_access").upsert({user_id:created.user.id,role:"admin"},{onConflict:"user_id"});
      if(grantError) return response({error:"Benutzer erstellt, Rollenfreigabe fehlgeschlagen. Support erforderlich."},500,origin);
      await admin.from("nxt_bootstrap").update({consumed_user_id:created.user.id}).eq("id",1);
      return response({ok:true,email:bootstrap.expected_email},200,origin);
    }
    const user=await trustedAdmin(req);
    if(!user) return response({error:"Keine Administratorberechtigung"},403,origin);
    if(body.action==="list") {
      const {data:members,error:memberError}=await admin.from("woodcorp_access")
        .select("user_id,role,granted_at").order("granted_at",{ascending:false});
      if(memberError)return response({error:"Mitglieder konnten nicht geladen werden."},500,origin);
      const users:Record<string,any>={};
      for(let page=1;page<=10;page++){
        const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
        if(error)return response({error:"Auth-Konten konnten nicht geprüft werden."},503,origin);
        for(const u of data?.users||[])users[u.id]={
          email:u.email,display_name:displayName(u),
          confirmed:!!u.email_confirmed_at,lastSignIn:u.last_sign_in_at,
          invitedAt:u.invited_at
        };
        if((data?.users||[]).length<200)break;
      }
      const {data:workspaces,error:workError}=await admin.from("nxt_workspaces").select("owner_id");
      if(workError)return response({error:"Workspace-Besitz konnte nicht geprüft werden."},503,origin);
      const counts:Record<string,number>={};
      for(const w of workspaces||[])counts[w.owner_id]=(counts[w.owner_id]||0)+1;
      return response({members:(members||[]).map(m=>({...m,...users[m.user_id],workspace_count:counts[m.user_id]||0}))},200,origin);
    }
    if(body.action==="invite"){
      const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
      const name=typeof body.display_name==="string"?body.display_name.trim().replace(/\\s+/g," "):"";
      const role=body.role;
      if(!safeName(name)||!safeEmail(email)||!["viewer","analyst","admin"].includes(role))
        return response({error:"Bitte Namen (2–100 Zeichen), gültige E-Mail-Adresse und Rolle angeben."},400,origin);

      const {data:recent,error:recentError}=await admin.from("nxt_invitation_audit")
        .select("created_at").eq("email",email).order("created_at",{ascending:false}).limit(1);
      if(recentError)return response({error:"Einladungsprüfung fehlgeschlagen."},503,origin);
      if(recent?.[0]&&Date.now()-new Date(recent[0].created_at).getTime()<45000)
        return response({error:"Bitte vor einer weiteren Einladung kurz warten."},429,origin);

      // Never reinstate an orphaned/revoked Auth account by merely typing its email.
      // A removed team member is hard-deleted via action=remove and must be invited
      // deliberately as a fresh account, including name and one-time verification.
      for(let page=1;page<=10;page++){
        const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
        if(error)return response({error:"Auth-Konten konnten nicht geprüft werden."},503,origin);
        const match=(data.users||[]).find(u=>u.email?.toLowerCase()===email);
        if(match){
          const {data:member,error:lookupError}=await admin.from("woodcorp_access")
            .select("user_id").eq("user_id",match.id).maybeSingle();
          if(lookupError)return response({error:"Freigabeprüfung fehlgeschlagen."},503,origin);
          return response({error:member
            ?"Dieses Teammitglied existiert bereits. Bitte „Link erneuern“ in der Mitgliederliste verwenden."
            :"Für diese E-Mail existiert noch ein Auth-Konto ohne NXT-Zugriff. Aus Sicherheitsgründen erfolgt keine automatische Wiederfreigabe; das verwaiste Konto muss zuerst ausdrücklich administrativ bereinigt werden."},409,origin);
        }
        if((data.users||[]).length<200)break;
      }
      const {data:generated,error:genError}=await admin.auth.admin.generateLink({
        type:"invite",email,options:{data:{name,full_name:name},redirectTo:APP_URL}
      });
      const hashed=generated?.properties?.hashed_token;
      if(genError||!generated?.user?.id||typeof hashed!=="string"||!/^[0-9a-f]{32,128}$/i.test(hashed))
        return response({error:"Einladungslink konnte nicht erstellt werden. Bitte E-Mail-Adresse und Auth-Konfiguration prüfen."},502,origin);
      const newId=generated.user.id;
      const {error:grantError}=await admin.from("woodcorp_access").insert({user_id:newId,role});
      if(grantError){
        await admin.auth.admin.deleteUser(newId,false);
        return response({error:"Rollenfreigabe fehlgeschlagen; der neu angelegte Auth-Zugang wurde zurückgenommen."},500,origin);
      }
      const {error:auditError}=await admin.from("nxt_invitation_audit")
        .insert({email,user_id:newId,role,delivery_mode:"link",created_by:user.id});
      if(auditError){
        // Fail closed: don't leave an untracked invitation with active membership.
        await admin.auth.admin.deleteUser(newId,false);
        return response({error:"Einladungsprotokoll konnte nicht geschrieben werden; bitte erneut versuchen."},500,origin);
      }
      return response({ok:true,status:"invited",delivery:"link",display_name:name,link:APP_URL+"#nxt_invite="+encodeURIComponent(hashed)+"&type=invite",
        message:"Einmaligen NXT-Einladungslink für "+name+" erzeugt. Nur über einen sicheren Kanal weitergeben."},200,origin);
    }
    if(body.action==="renew"){
      const targetId=typeof body.userId==="string"?body.userId:"";
      if(!userIdRegex.test(targetId))return response({error:"Ungültiger Teamzugang."},400,origin);
      const {data:member,error:memberError}=await admin.from("woodcorp_access").select("role")
        .eq("user_id",targetId).maybeSingle();
      if(memberError||!member)return response({error:"Teammitglied nicht gefunden."},404,origin);
      const {data:lookup,error:userError}=await admin.auth.admin.getUserById(targetId);
      if(userError||!lookup?.user?.email)return response({error:"Auth-Zugang nicht gefunden."},404,origin);
      const person=lookup.user;
      if(person.id===user.id)return response({error:"Eigenen Adminzugang nicht per Einladung erneuern."},400,origin);
      const email=person.email.toLowerCase();
      const {data:recent,error:rateError}=await admin.from("nxt_invitation_audit").select("created_at")
        .eq("email",email).order("created_at",{ascending:false}).limit(1);
      if(rateError)return response({error:"Einladungsprüfung fehlgeschlagen."},503,origin);
      if(recent?.[0]&&Date.now()-new Date(recent[0].created_at).getTime()<45000)
        return response({error:"Bitte kurz warten, bevor ein neuer Link erzeugt wird."},429,origin);
      // An existing Auth identity receives a one-time MAGICLINK, not an invite
      // that could create another identity or silently reauthorize a revoked user.
      const {data:generated,error:genError}=await admin.auth.admin.generateLink({
        type:"magiclink",email,options:{redirectTo:APP_URL}
      });
      const hashed=generated?.properties?.hashed_token;
      if(genError||typeof hashed!=="string"||!/^[0-9a-f]{32,128}$/i.test(hashed))
        return response({error:"Neuer Zugangscode konnte nicht erzeugt werden."},502,origin);
      const {error:auditError}=await admin.from("nxt_invitation_audit")
        .insert({email,user_id:targetId,role:member.role,delivery_mode:"link",created_by:user.id});
      if(auditError)return response({error:"Der Zugangscode konnte nicht protokolliert werden."},500,origin);
      return response({ok:true,status:"renewed",delivery:"link",display_name:displayName(person),
        link:APP_URL+"#nxt_invite="+encodeURIComponent(hashed)+"&type=magiclink",
        message:"Einmaligen Wiederherstellungslink erzeugt. Die Person kann damit das Passwort erneut festlegen."},200,origin);
    }
    if(body.action==="role"){
      if(!["viewer","analyst","admin"].includes(body.role)||typeof body.userId!=="string") return response({error:"Ungueltige Rolle"},400,origin);
      if(body.userId===user.id && body.role!=="admin") return response({error:"Eigene Administratorrechte koennen nicht entfernt werden"},400,origin);
      const {error}=await admin.from("woodcorp_access").update({role:body.role}).eq("user_id",body.userId);
      return error?response({error:"Rolle konnte nicht geaendert werden"},500,origin):response({ok:true},200,origin);
    }
    if(body.action==="remove"){
      const targetId=typeof body.userId==="string"?body.userId:"";
      const confirmEmail=typeof body.confirmEmail==="string"?body.confirmEmail.trim().toLowerCase():"";
      if(!userIdRegex.test(targetId)||targetId===user.id)
        return response({error:"Dieser Zugang darf nicht entfernt werden."},400,origin);
      const {data:membership,error:membershipError}=await admin.from("woodcorp_access")
        .select("role").eq("user_id",targetId).maybeSingle();
      if(membershipError||!membership)return response({error:"Teammitglied nicht gefunden."},404,origin);
      const {data:lookup,error:userError}=await admin.auth.admin.getUserById(targetId);
      if(userError||!lookup?.user?.email)return response({error:"Auth-Konto nicht gefunden."},404,origin);
      const targetEmail=lookup.user.email.trim().toLowerCase();
      if(!safeEmail(confirmEmail)||confirmEmail!==targetEmail)
        return response({error:"Zur endgültigen Löschung muss die vollständige E-Mail-Adresse exakt bestätigt werden."},400,origin);
      if(membership.role==="admin"){
        const {count,error:countError}=await admin.from("woodcorp_access")
          .select("user_id",{count:"exact",head:true}).eq("role","admin");
        if(countError||count==null)return response({error:"Administratoranzahl konnte nicht geprüft werden."},503,origin);
        if(count<=1)return response({error:"Der letzte Administrator kann nicht entfernt werden."},409,origin);
      }
      const {count:workspaceCount,error:workspaceError}=await admin.from("nxt_workspaces")
        .select("id",{count:"exact",head:true}).eq("owner_id",targetId);
      if(workspaceError)return response({error:"Zugehörige Workspaces konnten nicht geprüft werden."},503,origin);

      // This dedicated Supabase project is isolated from the Netzwerkforschung app.
      // HARD deletion cascades to woodcorp_access, auth sessions and owned
      // nxt_workspaces. Raw WoodCorp case/event data is never affected.
      const {error:deleteError}=await admin.auth.admin.deleteUser(targetId,false);
      if(deleteError){
        console.error("nxt-members hard delete:",deleteError.message);
        return response({error:"Auth-Konto konnte nicht vollständig gelöscht werden. Bitte abhängige Storage-Objekte oder Datenbank-Referenzen prüfen."},409,origin);
      }
      // Remove invitation records that would otherwise retain the former user's
      // address or block a fresh invitation. Other members' audit rows remain.
      const {error:auditError}=await admin.from("nxt_invitation_audit").delete().eq("email",targetEmail);
      if(auditError){
        console.error("nxt-members purge invitations:",auditError.message);
        return response({ok:true,status:"deleted",deleted_workspaces:workspaceCount||0,
          warning:"Auth-Konto und Zugriffsrechte sind gelöscht, aber das Einladungsprotokoll muss administrativ bereinigt werden."},200,origin);
      }
      const {data:residual,error:verifyError}=await admin.from("woodcorp_access")
        .select("user_id").eq("user_id",targetId).maybeSingle();
      if(verifyError||residual)return response({error:"Kontolöschung muss überprüft werden: Es bestehen noch Zugriffsreste."},500,origin);
      return response({ok:true,status:"deleted",deleted_workspaces:workspaceCount||0,
        message:"Supabase-Auth-Konto, Sessions, Projektberechtigung, Einladungsverlauf und eigene Workspaces wurden entfernt. Für erneuten Zugriff ist eine neue vollständige Einladung nötig."},200,origin);
    }
    return response({error:"Unbekannte Aktion"},404,origin);
  } catch { return response({error:"Interner Fehler"},500,origin); }
});
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, {auth:{autoRefreshToken:false,persistSession:false}});
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
      const {data:members,error:memberError}=await admin.from("woodcorp_access").select("user_id,role,granted_at").order("granted_at",{ascending:false});
      if(memberError) return response({error:"Mitglieder konnten nicht geladen werden"},500,origin);
      const users:Record<string,any>={};
      let page=1;
      while(page<=10){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});
        if(error) break; for(const u of data?.users||[]) users[u.id]={email:u.email,confirmed:!!u.email_confirmed_at,lastSignIn:u.last_sign_in_at};
        if((data?.users||[]).length<100) break; page++;
      }
      return response({members:(members||[]).map(m=>({...m,...users[m.user_id]}))},200,origin);
    }
    if(body.action==="invite"){
      const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
      const role=body.role;
      if(!safeEmail(email) || !["viewer","analyst","admin"].includes(role))
        return response({error:"Ungültige E-Mail-Adresse oder Rolle."},400,origin);
      const {data:existingAudits}=await admin.from("nxt_invitation_audit").select("created_at")
        .eq("email",email).order("created_at",{ascending:false}).limit(1);
      if(existingAudits?.[0] && Date.now()-new Date(existingAudits[0].created_at).getTime()<45000)
        return response({error:"Bitte vor erneuter Einladung kurz warten."},429,origin);

      // Follow the NXT Netzwerkforschung pattern: client-visible URLs always point
      // to GitHub Pages. The one-time hashed token stays in a URL fragment.
      const appUrl="https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/";
      let previousUserId:string|undefined;
      for(let page=1;page<=10;page++){
        const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
        if(error) return response({error:"Bestehende Auth-Konten konnten nicht geprüft werden."},503,origin);
        previousUserId=(data.users||[]).find(u=>u.email?.toLowerCase()===email)?.id;
        if(previousUserId || (data.users||[]).length<200) break;
      }
      if(previousUserId){
        const {data:registered,error:checkError}=await admin.from("woodcorp_access")
          .select("user_id").eq("user_id",previousUserId).maybeSingle();
        if(checkError)return response({error:"Freigabeprüfung fehlgeschlagen."},500,origin);
        if(registered)return response({error:"Diese E-Mail-Adresse ist bereits im NXT-Team freigegeben."},409,origin);
        const {error:grant}=await admin.from("woodcorp_access").insert({user_id:previousUserId,role});
        if(grant)return response({error:"Das bestehende Konto konnte nicht freigegeben werden."},500,origin);
        await admin.from("nxt_invitation_audit").insert({email,user_id:previousUserId,role,delivery_mode:"link",created_by:user.id});
        return response({ok:true,status:"existing",message:"Bestehendes Konto freigegeben. Die Person kann sich über die NXT-Webseite mit ihrem bisherigen Passwort anmelden."},200,origin);
      }
      const {data:generated,error:genError}=await admin.auth.admin.generateLink({
        type:"invite",email,options:{redirectTo:appUrl}
      });
      const hashed=generated?.properties?.hashed_token;
      if(genError || !generated?.user?.id || typeof hashed!=="string" || !/^[0-9a-f]{32,128}$/i.test(hashed))
        return response({error:"Einmaliger Einladungslink konnte nicht erstellt werden. Bitte Auth-Einstellungen prüfen."},502,origin);
      const id=generated.user.id;
      const {error:grantError}=await admin.from("woodcorp_access").insert({user_id:id,role});
      if(grantError){
        // Remove only this newly-generated Auth identity, never an existing one.
        await admin.auth.admin.deleteUser(id);
        return response({error:"Einladung ohne Rollenfreigabe – bitte erneut versuchen."},500,origin);
      }
      await admin.from("nxt_invitation_audit").insert({email,user_id:id,role,delivery_mode:"link",created_by:user.id});
      const link=appUrl+"#nxt_invite="+encodeURIComponent(hashed)+"&type=invite";
      return response({ok:true,status:"invited",delivery:"link",link,
        message:"Einmaligen NXT-Webseitenlink erstellt. Nur über einen sicheren Kanal an die eingeladene Person senden. Gültigkeit nach Supabase OTP-Konfiguration."},200,origin);
    }
    if(body.action==="role"){
      if(!["viewer","analyst","admin"].includes(body.role)||typeof body.userId!=="string") return response({error:"Ungueltige Rolle"},400,origin);
      if(body.userId===user.id && body.role!=="admin") return response({error:"Eigene Administratorrechte koennen nicht entfernt werden"},400,origin);
      const {error}=await admin.from("woodcorp_access").update({role:body.role}).eq("user_id",body.userId);
      return error?response({error:"Rolle konnte nicht geaendert werden"},500,origin):response({ok:true},200,origin);
    }
    if(body.action==="remove"){
      if(typeof body.userId!=="string" || body.userId===user.id) return response({error:"Dieser Zugriff kann nicht entfernt werden"},400,origin);
      const {error}=await admin.from("woodcorp_access").delete().eq("user_id",body.userId);
      return error?response({error:"Zugriff konnte nicht entfernt werden"},500,origin):response({ok:true},200,origin);
    }
    return response({error:"Unbekannte Aktion"},404,origin);
  } catch { return response({error:"Interner Fehler"},500,origin); }
});
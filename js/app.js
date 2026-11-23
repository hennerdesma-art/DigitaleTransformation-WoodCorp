(function(){
"use strict";
const config=window.NXT_CONFIG;
const filters=window.NXT_FILTERS;
const app=document.getElementById("app");
const state={
  supabase:null,user:null,role:null,view:"tree",collapsed:false,
  global:[],local:{},nodes:{root:{id:"root",parentId:null,label:"On-Time Delivery"}},
  factoryRows:[],productRows:[],dimensions:{},selected:"root",expandedFactory:null,
  metrics:null,trend:[],breakdown:[],busy:false,graphBusy:false,requestId:0,
  camera:{x:0,y:0,zoom:1},team:[],teamLoading:false
};
let filterModal=null;
const $=(selector,base=document)=>base.querySelector(selector);
const $$=(selector,base=document)=>[...base.querySelectorAll(selector)];
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatInt=n=>Number(n??0).toLocaleString("de-DE",{maximumFractionDigits:0});
const formatPct=n=>n===null||n===undefined?"–":Number(n).toLocaleString("de-DE",{maximumFractionDigits:1})+" %";
const icon=(name,size=19)=>{
 const paths={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  tree:'<circle cx="12" cy="4" r="2"/><circle cx="5" cy="20" r="2"/><circle cx="19" cy="20" r="2"/><path d="M12 6v8M5 18v-4h14v4"/>',
  chart:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 2 5-7"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M17 8a3 3 0 1 1 0 6M18 16a5 5 0 0 1 4 4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m5 5 14 14M19 5 5 19"/>',
  logout:'<path d="M10 3H4v18h6M15 6l6 6-6 6M21 12H9"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  zoomin:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  zoomout:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>',
  fit:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  reset:'<path d="M20 7v6h-6M20 13a8 8 0 1 0-2.3 5.7"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  shield:'<path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 1c0 2-3 2-3 5m0 4h.01"/>'
 };
 return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.home)+'</svg>';
};
function toast(message,type="info"){
 const el=$("#toast");el.textContent=message;el.classList.add("visible");el.style.background=type==="error"?"#8d2934":"#163b40";
 clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove("visible"),5000);
}
function setNotice(message,kind="error"){const el=$("#form-notice");if(el){el.className="notice "+kind;el.textContent=message;el.classList.remove("hidden");}}
function logo(){return '<img src="'+esc(config.logoUrl)+'" alt="NXT – Reutlingen University, Nachhaltigkeit und Technologie">'}
function authPage(mode="login"){
 const setup=mode==="setup",invite=mode==="invite",recovery=mode==="recovery";
 const welcome=setup?"Administrator einrichten":invite?"Einladung abschließen":recovery?"Passwort zurücksetzen":"Willkommen zurück";
 const subtitle=setup?"Einmalige geschützte Einrichtung des ersten Administrators.":invite?"Wähle ein sicheres Passwort für deinen Zugang.":recovery?"Vergib ein neues Passwort für dein Konto.":"Melde dich mit deiner Hochschuladresse an.";
 const passwordOnly=invite||recovery;
 app.innerHTML='<div class="auth-page"><section class="auth-art">'+logo()+
  '<div><div class="auth-eyebrow" style="color:#90e8e4">NXT · DIGITAL TRANSFORMATION</div>'+
  '<h1>Turning data into<br><em>better decisions.</em></h1><p>Ein intelligenter Blick auf Prozesse. Vom Analysebaum bis zur Ursache – interaktiv, visuell und datenbasiert.</p>'+
  '<div class="auth-illustration" aria-hidden="true"><div class="orbit"><span class="orbit-dot"></span></div><div class="orbit two"><span class="orbit-dot b"></span></div><div class="auth-figure"><b>NXT Analytics</b><span>Process Intelligence · Connected Insights</span></div></div></div>'+
  '<small style="color:#9ec3c6">REUTLINGEN UNIVERSITY · NXT</small></section>'+
  '<section class="auth-form-side"><div class="auth-card"><div class="auth-eyebrow">'+(setup?"ERSTEINRICHTUNG":invite?"EINLADUNG":recovery?"KONTO": "GESCHÜTZTER ZUGANG")+'</div>'+
  '<h2>'+welcome+'</h2><p class="desc">'+subtitle+'</p><div id="form-notice" class="notice hidden"></div>'+
  '<form id="auth-form">'+(passwordOnly?'':'<div class="field"><label for="email">E-Mail-Adresse</label><input id="email" name="email" type="email" required autocomplete="username" '+(setup?'readonly ':'')+'value="'+esc(setup?config.bootstrapEmail:"")+'" placeholder="vorname.nachname@reutlingen-university.de"></div>')+
  '<div class="field"><label for="password">'+(passwordOnly?"Neues Passwort":"Passwort")+'</label><input id="password" name="password" type="password" required minlength="'+(setup||passwordOnly?12:6)+'" autocomplete="'+(setup||passwordOnly?"new-password":"current-password")+'" placeholder="••••••••••••"></div>'+
  (passwordOnly?'<div class="field"><label for="confirm-password">Passwort wiederholen</label><input id="confirm-password" type="password" required minlength="12" autocomplete="new-password" placeholder="••••••••••••"></div>':'')+
  (setup?'<div class="field"><label for="setup-code">Einmaliger Einrichtungscode</label><input id="setup-code" type="password" required autocomplete="off" placeholder="NXT-…"></div>':'')+
  '<button class="btn primary" id="auth-submit" type="submit">'+(setup?"Administrator erstellen":passwordOnly?"Passwort speichern":"Sicher anmelden")+' '+icon("arrow",17)+'</button></form>'+
  '<div class="extra">'+(setup?'<button type="button" id="go-login">Zum Login</button>':(passwordOnly?'<button type="button" id="go-login">Zum Login</button>':'<button type="button" id="forgot">Passwort vergessen?</button>'))+
  (!setup&&!passwordOnly?'<span>Registrierung nur per Einladung</span>':'')+'</div>'+
  (setup?'<p class="field-note" style="margin-top:20px">Der Einrichtungscode wird nur einmal akzeptiert. Das Passwort wird ausschließlich von Supabase Auth verwaltet.</p>':'')+
  '<div class="auth-footnote">NXT · Sichere Anmeldung über Supabase Auth</div></div></section></div>';
 $("#auth-form").addEventListener("submit",async ev=>{
  ev.preventDefault();const btn=$("#auth-submit");btn.disabled=true;const initial=btn.innerHTML;btn.innerHTML='<span class="spinner" style="width:18px;height:18px"></span> Bitte warten…';
  try{
   const password=$("#password").value;
   if(passwordOnly){
    if(password!==$("#confirm-password").value)throw Error("Die Passwörter stimmen nicht überein.");
    if(password.length<12)throw Error("Bitte mindestens 12 Zeichen verwenden.");
    const {error}=await state.supabase.auth.updateUser({password});if(error)throw error;
    const u=new URL(location.href);u.searchParams.delete("invite");u.searchParams.delete("recovery");history.replaceState({},"",u.pathname+u.search);
    toast("Passwort gespeichert");await loadCurrentUser();return;
   }
   const email=$("#email").value.trim();
   if(setup){
    if(password.length<12)throw Error("Für die Ersteinrichtung mindestens 12 Zeichen verwenden.");
    const result=await memberApi({action:"bootstrap",password,setupCode:$("#setup-code").value},false);
    if(!result.ok)throw Error(result.error||"Einrichtung fehlgeschlagen.");
   }
   const {error}=await state.supabase.auth.signInWithPassword({email,password});if(error)throw error;
   await loadCurrentUser();
  }catch(e){setNotice(e.message||"Anmeldung fehlgeschlagen.");}finally{btn.disabled=false;btn.innerHTML=initial}
 });
 $("#go-login")?.addEventListener("click",()=>{history.replaceState({},"",location.pathname);authPage("login")});
 $("#forgot")?.addEventListener("click",async()=>{
  const email=$("#email").value.trim();if(!email){setNotice("Bitte zuerst eine E-Mail-Adresse eingeben.");return;}
  const url=new URL(location.href);url.search="?recovery=1";
  const {error}=await state.supabase.auth.resetPasswordForEmail(email,{redirectTo:url.toString()});
  if(error)toast("E-Mail konnte nicht angefordert werden: "+error.message,"error");
  else toast("Falls ein Konto existiert, erhältst du eine E-Mail mit einem Wiederherstellungslink.");
 });
}
async function memberApi(payload,authenticated=true){
 let token="";
 if(authenticated){
  const {data}=await state.supabase.auth.getSession();
  token=data?.session?.access_token||"";
  if(!token)throw Error("Sitzung abgelaufen. Bitte neu anmelden.");
 }
 const response=await fetch(config.membersEndpoint,{method:"POST",
  headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey,...(token?{"Authorization":"Bearer "+token}:{})},
  body:JSON.stringify(payload)});
 let data;try{data=await response.json()}catch{data={error:"Ungültige Serverantwort"}}
 if(!response.ok)throw Error(data.error||"Serverfehler");
 return data;
}
async function loadCurrentUser(){
 const {data,error}=await state.supabase.auth.getUser();
 if(error || !data?.user){state.user=null;state.role=null;authPage();return;}
 const user=data.user;
 const {data:member,error:membershipError}=await state.supabase.from("woodcorp_access").select("role").eq("user_id",user.id).maybeSingle();
 state.user=user;state.role=membershipError?null:member?.role||null;
 if(!state.role){renderNoAccess();return;}
 const restored=filters.parseShareState();if(restored){state.global=restored.global;state.selected=restored.selected;}
 if(new URLSearchParams(location.search).has("invite")){authPage("invite");return;}
 if(new URLSearchParams(location.search).has("recovery")){authPage("recovery");return;}
 renderShell();await loadDimensions();await refreshAnalysis();
}
function renderNoAccess(){
 app.innerHTML='<div class="auth-page"><section class="auth-art">'+logo()+'<div><h1>Zugriff <em>geschützt.</em></h1><p>Für die Analyseplattform ist eine persönliche Freigabe erforderlich.</p></div><small>NXT Analytics</small></section><section class="auth-form-side"><div class="auth-card"><div class="auth-eyebrow">BERECHTIGUNG</div><h2>Noch keine Freigabe</h2><p class="desc">Dein Konto ist angemeldet, aber nicht Mitglied des Analytics-Projekts. Bitte wende dich an die Administration.</p><p>'+esc(state.user?.email)+'</p><button class="btn primary" id="logout-no-access">Abmelden</button></div></section></div>';
 $("#logout-no-access").onclick=signOut;
}
async function signOut(){await state.supabase.auth.signOut();state.user=null;state.role=null;state.global=[];state.local={};history.replaceState({},"",location.pathname);authPage();}
const nav=[
 {id:"overview",label:"Übersicht",ico:"home"},
 {id:"tree",label:"Analysebaum",ico:"tree"},
 {id:"dashboards",label:"Dashboards",ico:"chart"},
 {id:"data",label:"Datenbasis",ico:"database"},
 {id:"team",label:"Team & Zugänge",ico:"users",admin:true},
 {id:"profile",label:"Mein Profil",ico:"settings"}
];
function renderShell(){
 const visible=nav.filter(v=>!v.admin||state.role==="admin");
 app.innerHTML='<div class="app '+(state.collapsed?"collapsed":"")+'"><header class="top"><div class="top-left"><a class="top-brand" href="#" id="brand-home" aria-label="NXT Analytics Startseite">'+logo()+'</a><span class="brand-divider"></span><div class="header-title"><strong>NXT Analytics</strong><span>Interactive Process & Decision Intelligence</span></div></div><div class="top-right"><div class="user-tag" title="'+esc(state.user?.email)+'">'+esc((state.user?.email||"NX").slice(0,2).toUpperCase())+'</div><button class="icon-button" title="Abmelden" id="logout-top" aria-label="Abmelden">'+icon("logout")+'</button></div></header>'+
 '<aside class="sidebar" aria-label="Hauptnavigation"><button class="navitem" id="collapse-sidebar" title="Navigation ein-/ausklappen">'+icon("menu")+'<span class="navlabel">Navigation</span></button>'+
 visible.map(v=>'<button class="navitem '+(state.view===v.id?"active":"")+'" data-nav="'+v.id+'" aria-current="'+(state.view===v.id?"page":"false")+'" title="'+esc(v.label)+'"><span class="navicon">'+icon(v.ico)+'</span><span class="navlabel">'+esc(v.label)+'</span></button>').join("")+
 '<div class="sidebar-bottom"><div class="hint">NXT · DIGITAL TRANSFORMATION</div></div></aside>'+
 '<main id="main" class="main">'+(state.view==="tree"||state.view==="dashboards"||state.view==="overview"?toolbarMarkup():"")+'<div id="page"></div></main></div>';
 $("#logout-top").onclick=signOut;$("#brand-home").onclick=ev=>{ev.preventDefault();navigate("overview")};
 $("#collapse-sidebar").onclick=()=>{state.collapsed=!state.collapsed;$(".app").classList.toggle("collapsed",state.collapsed)};
 $$("[data-nav]").forEach(el=>el.onclick=()=>navigate(el.dataset.nav));
 if($("#toolbar"))bindToolbar();
 renderPage();
}
function navigate(view){
 if(view==="team" && state.role!=="admin")return;
 state.view=view;renderShell();
 if(view==="team")loadTeam();
 if(view==="tree"||view==="dashboards"||view==="overview")refreshAnalysis();
}
function toolbarMarkup(){
 return '<div class="toolbar" id="toolbar"><strong>'+icon("filter")+' Filter</strong>'+
 state.global.map(f=>'<span class="filter-chip">'+esc(config.fields[f.field])+' · '+esc(f.value)+' <button aria-label="Globalen Filter entfernen" data-remove-global="'+esc(f.id)+'">×</button></span>').join("")+
 '<button class="btn small soft" id="add-global">'+icon("plus",15)+' Filter hinzufügen</button>'+
 '<button class="btn small" id="clear-global" '+(!state.global.length?'disabled':'')+'>'+icon("reset",15)+' Zurücksetzen</button>'+
 '<button class="btn small" id="share-view">'+icon("copy",15)+' Ansichtslink</button></div>';
}
function bindToolbar(){
 $("#add-global").onclick=()=>openFilterModal("global",null);
 $("#clear-global").onclick=()=>{state.global=[];refreshAnalysis()};
 $$("[data-remove-global]").forEach(btn=>btn.onclick=()=>{state.global=state.global.filter(f=>f.id!==btn.dataset.removeGlobal);refreshAnalysis()});
 $("#share-view").onclick=async()=>{
  const link=filters.withShareState(state.global,state.selected);
  try{await navigator.clipboard.writeText(link);toast("Ansichtslink kopiert (globale Filter und Knotenauswahl).")}catch{window.prompt("Ansichtslink kopieren",link)}
  if(Object.keys(state.local).some(key=>state.local[key].length))toast("Hinweis: Lokale Knotenfilter werden nicht über diesen Link übertragen.");
 };
}
function renderPage(){
 if(state.view==="tree")return renderTreePage();
 if(state.view==="overview")return renderOverview();
 if(state.view==="dashboards")return renderDashboards();
 if(state.view==="data")return renderDataPage();
 if(state.view==="team")return renderTeamPage();
 if(state.view==="profile")return renderProfile();
}
function pageTitle(title,subtitle){
 return '<div class="page-head"><div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div>'+
 '<div style="font-size:11px;color:var(--muted)">LIVE · Supabase · WoodCorp O2C</div></div>';
}
function renderTreePage(){
 $("#page").innerHTML='<div class="breadcrumb">NXT Analytics '+icon("chevron",13)+' Analysebaum '+icon("chevron",13)+' '+esc(state.nodes[state.selected]?.label||"On-Time Delivery")+'</div>'+
 pageTitle("Interaktiver Analysebaum","Auftrags- und Prozesskennzahlen schrittweise untersuchen. Knoten auswählen, filtern oder weiter aufgliedern.")+
 '<div class="two-panel"><section class="card graph-card"><div class="card-header"><div><h2>Analysebaum</h2><p>Klick auf einen Knoten öffnet die Detailanalyse</p></div>'+
 '<div class="graph-tools"><button class="icon-button" id="zoom-in" title="Vergrößern" aria-label="Vergrößern">'+icon("zoomin")+'</button><button class="icon-button" id="zoom-out" title="Verkleinern" aria-label="Verkleinern">'+icon("zoomout")+'</button><button class="icon-button" id="fit" title="Ansicht zurücksetzen" aria-label="Ansicht zurücksetzen">'+icon("fit")+'</button></div></div>'+
 '<div class="graph-stage" id="graph-stage" role="group" aria-label="Interaktiver Analysebaum. Knoten per Tabulator erreichbar."><div class="tree-inner" id="tree-inner"></div></div>'+
 '<div class="graph-footer"><span>Verschieben: Ziehen · Zoom: +/− · Details: Knotenklick</span><span id="tree-status">Lädt …</span></div></section>'+
 '<section class="card details-card" id="detail-panel"></section></div>';
 $("#zoom-in").onclick=()=>zoom(1.2);$("#zoom-out").onclick=()=>zoom(1/1.2);$("#fit").onclick=()=>{state.camera={x:0,y:0,zoom:1};paintCamera()};
 mountDrag();paintTree();paintDetails();
}
function renderOverview(){
 $("#page").innerHTML=pageTitle("Willkommen bei NXT Analytics","Analysiere Lieferperformance und Prozessqualität auf Basis realer WoodCorp-Daten.")+
 '<div class="analysis-grid"><div class="card"><h3>Aufträge</h3><div class="big" id="overview-orders">–</div><p class="field-note">Alle Aufträge im aktuellen Filterkontext</p></div>'+
 '<div class="card"><h3>Pünktliche Lieferungen</h3><div class="big" id="overview-otd">–</div><p class="field-note">Lieferdatum ≤ zugesagtes Lieferdatum</p></div>'+
 '<div class="card"><h3>Mengen-Konformität</h3><div class="big" id="overview-volume">–</div><p class="field-note">Kennzahl aus ORDER_TOLERANCE_MET</p></div></div>'+
 '<div class="section card" style="padding:24px"><h2>Von der Übersicht zur Ursache</h2><p>Öffne den interaktiven Analysebaum, filtere nach Werk oder Lieferunternehmen und untersuche eine konkrete Kennzahl.</p><button class="btn primary" id="goto-tree">Analysebaum öffnen '+icon("arrow",16)+'</button></div>';
 $("#goto-tree").onclick=()=>navigate("tree");paintOverview();
}
function renderDashboards(){
 $("#page").innerHTML=pageTitle("Kennzahlen-Dashboard","Globale Filter gelten auf allen Ansichten. Die Kennzahlen werden zentral berechnet.")+
 '<section class="card details-card" style="max-width:1100px" id="detail-panel"></section>';
 paintDetails();
}
function renderDataPage(){
 $("#page").innerHTML=pageTitle("Datenbasis","Transparenz zur Herkunft, Verknüpfung und Qualität der analysierten Prozessdaten.")+
 '<div class="analysis-grid"><div class="card"><h3>WoodCorp · Cases</h3><div class="big">19.953</div><p class="field-note">Supabase-Tabelle woodcorp_cases</p></div>'+
 '<div class="card"><h3>Prozessaktivitäten</h3><div class="big">210.135</div><p class="field-note">Supabase-Tabelle woodcorp_activities</p></div>'+
 '<div class="card"><h3>Verknüpfung</h3><div class="big">Case-Key</div><p class="field-note">1 Auftrag zu mehreren Ereignissen</p></div></div>'+
 '<section class="card section" style="padding:22px"><h2>Datenqualitäts-Hinweis</h2>'+
 '<p>Die ursprüngliche Flag-Spalte <code>order_date_met</code> weicht bei 9.618 Aufträgen von der überprüfbaren Terminbedingung <code>delivered_date ≤ promised_date</code> ab. Die aktuelle On-Time-Kennzahl verwendet deshalb den Datumsvergleich.</p>'+
 '<p>Bei Auswertungen werden Aufträge auf Case-Ebene aggregiert, Ereignisse dagegen auf Event-Ebene. Die Verknüpfung erfolgt über <code>case_key</code>; dadurch vermeiden wir Mehrfachzählungen durch einen 1:n-Join.</p>'+
 '<p class="field-note">Historischer Import: 2017–2019. Die Rohdaten werden nicht veröffentlicht; der Zugriff erfolgt über Supabase-RLS.</p></section>';
}
function renderProfile(){
 $("#page").innerHTML=pageTitle("Mein Profil","Persönliche Kontoeinstellungen")+
 '<section class="card" style="padding:25px;max-width:600px"><h2>Account</h2><div class="field"><label>E-Mail</label><input readonly value="'+esc(state.user?.email)+'"></div>'+
 '<div class="field"><label>Rolle</label><input readonly value="'+esc(state.role)+'"></div>'+
 '<form id="change-password"><h3>Passwort ändern</h3><div class="field"><label for="new-password">Neues Passwort (mindestens 12 Zeichen)</label><input type="password" id="new-password" required minlength="12" autocomplete="new-password"></div>'+
 '<button class="btn primary" type="submit">Passwort ändern</button></form></section>';
 $("#change-password").onsubmit=async e=>{e.preventDefault();const pw=$("#new-password").value;try{const {error}=await state.supabase.auth.updateUser({password:pw});if(error)throw error;toast("Passwort wurde geändert");$("#new-password").value=""}catch(error){toast(error.message,"error")}};
}
function renderTeamPage(){
 if(state.role!=="admin")return;
 $("#page").innerHTML=pageTitle("Team & Zugänge","Mitglieder einladen, Registrierung ermöglichen und Berechtigungen verwalten.")+
 '<div class="card" style="padding:22px"><h2>Neues Mitglied einladen</h2><p class="field-note">Verschicke eine Einladung über Supabase Auth oder erzeuge einen geschützten Link zum manuellen Versenden.</p>'+
 '<form id="invite-form" class="form-row"><div class="field" style="flex:2"><label for="invite-email">E-Mail-Adresse</label><input id="invite-email" type="email" required placeholder="name@reutlingen-university.de"></div>'+
 '<div class="field"><label for="invite-role">Rolle</label><select id="invite-role"><option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Administrator</option></select></div>'+
 '<div class="field"><label for="invite-delivery">Versand</label><select id="invite-delivery"><option value="email">Einladung per E-Mail</option><option value="link">Link zum Kopieren</option></select></div>'+
 '<button type="submit" class="btn primary" style="margin-bottom:13px">Einladen</button></form>'+
 '<div id="invite-result"></div><p class="field-note">Mit einem Einladungskonto können Nutzer ihr Passwort selbst setzen. Keine öffentliche Selbstregistrierung.</p></div>'+
 '<section class="section"><div class="page-head"><h2 class="section-title">Mitglieder</h2><button class="btn small" id="reload-team">Aktualisieren '+icon("reset",15)+'</button></div>'+
 '<div class="card table-card" id="team-table"><div class="empty"><span class="spinner"></span> Mitglieder werden geladen …</div></div></section>';
 $("#invite-form").onsubmit=async e=>{
  e.preventDefault();
  const btn=$('#invite-form button[type="submit"]');btn.disabled=true;
  const email=$("#invite-email").value.trim(),role=$("#invite-role").value,delivery=$("#invite-delivery").value;
  try{
   const result=await memberApi({action:"invite",email,role,delivery});
   if(result.delivery==="email"){
    $("#invite-result").innerHTML='<div class="notice good"><strong>Einladung per E-Mail angefordert.</strong> Der Versand erfolgt über Supabase Auth an '+esc(email)+'.</div>';
    toast("Einladungs-E-Mail angefordert");
   }else{
    $("#invite-result").innerHTML='<div class="notice good"><strong>Einladungslink erstellt.</strong> Sende ihn nur an '+esc(email)+'.</div>'+
    '<div class="form-row" style="margin-top:8px"><div class="field" style="flex:1"><label for="invite-link">Einmaliger Einladungslink</label><input id="invite-link" readonly type="text"></div><button class="btn" id="copy-invite" type="button" style="margin-bottom:13px">'+icon("copy",16)+' Kopieren</button></div>';
    $("#invite-link").value=result.link;
    $("#copy-invite").onclick=async()=>{
     try{await navigator.clipboard.writeText($("#invite-link").value);toast("Einladungslink kopiert")}
     catch{$("#invite-link").focus();$("#invite-link").select();toast("Link markiert. Bitte manuell kopieren.")}
    };
    toast("Einladungslink erstellt");
   }
   loadTeam();
  }catch(error){toast(error.message,"error")}finally{btn.disabled=false}
 };
 $("#reload-team").onclick=loadTeam;paintTeam();
}
function paintTeam(){
 const target=$("#team-table");if(!target)return;
 if(state.teamLoading){target.innerHTML='<div class="empty"><span class="spinner"></span> Mitglieder werden geladen …</div>';return}
 if(!state.team.length){target.innerHTML='<div class="empty"><strong>Noch keine Mitglieder</strong><p>Füge über das Einladungsformular einen Zugang hinzu.</p></div>';return}
 target.innerHTML='<table><thead><tr><th>E-Mail</th><th>Status</th><th>Rolle</th><th>Aktion</th></tr></thead><tbody>'+
 state.team.map(m=>'<tr><td>'+esc(m.email||m.user_id)+'</td><td>'+esc(m.confirmed?"Bestätigt":"Ausstehend")+'</td><td>'+
 '<select data-team-role="'+esc(m.user_id)+'" aria-label="Rolle für '+esc(m.email||"Mitglied")+'"><option value="viewer" '+(m.role==="viewer"?"selected":"")+'>Viewer</option><option value="analyst" '+(m.role==="analyst"?"selected":"")+'>Analyst</option><option value="admin" '+(m.role==="admin"?"selected":"")+'>Admin</option></select></td>'+
 '<td><button class="btn small danger" data-remove-user="'+esc(m.user_id)+'" '+(m.user_id===state.user?.id?"disabled":"")+'>Zugriff entfernen</button></td></tr>').join("")+'</tbody></table>';
 $$("[data-team-role]",target).forEach(el=>{
  el.disabled=el.dataset.teamRole===state.user?.id;
  el.onchange=async()=>{try{await memberApi({action:"role",userId:el.dataset.teamRole,role:el.value});toast("Rolle aktualisiert");loadTeam()}catch(e){toast(e.message,"error");loadTeam()}}
 });
 $$("[data-remove-user]",target).forEach(el=>el.onclick=async()=>{
  const member=state.team.find(m=>m.user_id===el.dataset.removeUser);
  if(!confirm("Zugriff für "+(member?.email||"diesen Benutzer")+" wirklich entfernen?"))return;
  try{await memberApi({action:"remove",userId:el.dataset.removeUser});toast("Zugriff entfernt");loadTeam()}catch(e){toast(e.message,"error")}
 });
}
async function loadTeam(){
 if(state.view!=="team"||state.role!=="admin")return;
 state.teamLoading=true;paintTeam();
 try{const result=await memberApi({action:"list"});state.team=result.members||[]}catch(e){toast(e.message,"error")}
 finally{state.teamLoading=false;paintTeam()}
}
function paintOverview(){
 const m=state.metrics;
 if($("#overview-orders"))$("#overview-orders").textContent=m?formatInt(m.orders):"–";
 if($("#overview-otd"))$("#overview-otd").textContent=m?formatPct(m.onTimeRate):"–";
 if($("#overview-volume"))$("#overview-volume").textContent=m?formatPct(m.volumeConformanceRate):"–";
}
async function loadDimensions(){
 try{const {data,error}=await state.supabase.rpc("nxt_dimensions");if(error)throw error;state.dimensions=data||{}}
 catch(e){toast("Filteroptionen konnten nicht geladen werden: "+e.message,"error")}
}
function effective(id=state.selected){return filters.resolve(state.global,state.nodes,id,state.local)}
function withBackend(filtersIn){return filters.validate(filtersIn).map(f=>({field:f.field,op:"eq",value:f.value}))}
async function rpc(name,params){
 const {data,error}=await state.supabase.rpc(name,params);
 if(error)throw Error(error.message||"Abfrage fehlgeschlagen");
 return data;
}
function rootFactoryFilter(label){return filters.predicate("factory",label,"factory-"+label)}
function buildTreeNodes(){
 const root={id:"root",parentId:null,label:"On-Time Delivery"};
 const nodes={root},rows=state.factoryRows.filter(f=>f.label!=null);
 for(const r of rows){
  const id="factory:"+r.label;
  nodes[id]={id,parentId:"root",label:r.label,predicate:rootFactoryFilter(r.label),orders:r.orders,onTimeRate:r.on_time_rate};
 }
 const factoryId=state.expandedFactory||(/^(product:)/.test(state.selected)?state.selected.split("|")[0].replace(/^product:/,"factory:"):null);
 if(factoryId && nodes[factoryId]){
  for(const r of state.productRows.filter(p=>p.label!=null)){
   const id="product:"+factoryId.slice(8)+"|"+r.label;
   nodes[id]={id,parentId:factoryId,label:r.label,predicate:filters.predicate("product_type",r.label,"product-"+r.label),orders:r.orders,onTimeRate:r.on_time_rate};
  }
 }
 state.nodes=nodes;
 if(!state.nodes[state.selected])state.selected="root";
}
function factoryFor(id){if(id.startsWith("factory:"))return id;if(id.startsWith("product:"))return "factory:"+id.slice(8).split("|")[0];return null}
async function refreshAnalysis(){
 if(!state.user||!state.role)return;
 const sequence=++state.requestId;state.busy=true;state.graphBusy=true;
 if($("#toolbar")){const t=$("#toolbar");t.outerHTML=toolbarMarkup();bindToolbar()}
 if(state.view==="tree")paintTree();
 try{
  const globalParams={p_filters:withBackend([...state.global,...(state.local.root||[])])};
  const [fac,metrics]=await Promise.all([
   rpc("nxt_breakdown",{p_field:"factory",...globalParams}),
   rpc("nxt_case_metrics",globalParams)
  ]);
  if(sequence!==state.requestId)return;
  state.factoryRows=fac||[];state.metrics=metrics;
  const factoryId=factoryFor(state.selected)||state.expandedFactory;
  state.productRows=[];
  const roots={root:{id:"root",parentId:null}};
  state.factoryRows.forEach(r=>{if(r.label!=null)roots["factory:"+r.label]={id:"factory:"+r.label,parentId:"root",predicate:rootFactoryFilter(r.label)}});
  if(factoryId&&roots[factoryId]){
   state.expandedFactory=factoryId;
   const factoryFilters=filters.resolve(state.global,roots,factoryId,state.local);
   state.productRows=await rpc("nxt_breakdown",{p_field:"product_type",p_filters:withBackend(factoryFilters)});
  }
  if(sequence!==state.requestId)return;
  buildTreeNodes();
  const localFiltered=Object.keys(state.local).filter(id=>id!=="root"&&state.nodes[id]&&state.local[id]?.length);
  if(localFiltered.length){
   const nodeMetrics=await Promise.all(localFiltered.map(id=>rpc("nxt_case_metrics",{p_filters:withBackend(effective(id))})));
   if(sequence!==state.requestId)return;
   localFiltered.forEach((id,i)=>{state.nodes[id].orders=nodeMetrics[i]?.orders;state.nodes[id].onTimeRate=nodeMetrics[i]?.onTimeRate});
  }
  state.graphBusy=false;
  if(state.view==="tree")paintTree();
  paintOverview();
  await refreshDashboard(sequence);
 }catch(e){if(sequence===state.requestId){state.graphBusy=false;toast("Analysedaten konnten nicht geladen werden: "+e.message,"error");paintTree();paintDetails()}}
 finally{if(sequence===state.requestId){state.busy=false;if($("#tree-status"))$("#tree-status").textContent="Datenquelle: Supabase"}}
}
async function refreshDashboard(sequence=state.requestId){
 const params={p_filters:withBackend(effective())};
 state.busy=true;state.selectedMetrics=null;state.trend=[];state.breakdown=[];paintDetails();
 try{
  const [metrics,trend,breakdown]=await Promise.all([
    rpc("nxt_case_metrics",params),
    rpc("nxt_monthly",params),
    rpc("nxt_breakdown",{p_field:"delivery_company",...params})
  ]);
  if(sequence!==state.requestId)return;
  state.selectedMetrics=metrics;state.trend=trend||[];state.breakdown=breakdown||[];
  paintDetails();
 }catch(e){if(sequence===state.requestId){toast("Detailanalyse fehlgeschlagen: "+e.message,"error");state.selectedMetrics=null;paintDetails()}}
 finally{if(sequence===state.requestId){state.busy=false;paintDetails()}}
}
function nodeMarkup(node,root=false){
 const active=state.selected===node.id;
 const localCount=(state.local[node.id]||[]).length;
 return '<div class="node '+(active?"selected ":"")+(root?"root-node":"")+'" tabindex="0" role="button" data-select-node="'+esc(node.id)+'" aria-label="'+esc(node.label)+' auswählen">'+
 '<strong>'+esc(node.label)+'</strong><span class="node-value">'+(node.onTimeRate==null?(root?"KPI-Analyse":"–"):formatPct(node.onTimeRate))+'</span>'+
 '<small>'+(root?"WoodCorp · Order-to-Cash":formatInt(node.orders)+" Aufträge")+'</small>'+
 '<span class="node-actions"><button type="button" title="Knoten filtern" aria-label="Filter für '+esc(node.label)+' hinzufügen" data-filter-node="'+esc(node.id)+'">'+icon("filter",13)+'</button></span>'+
 (localCount?'<span class="node-count">'+localCount+' lokaler Filter</span>':'')+'</div>';
}
function paintTree(){
 const target=$("#tree-inner");if(!target)return;
 if(state.graphBusy && !state.factoryRows.length){
  target.innerHTML='<div style="width:400px;padding:70px 20px;text-align:center"><span class="spinner"></span><p>Analysebaum wird aufgebaut …</p></div>';return;
 }
 const root=state.nodes.root;
 const all=state.factoryRows.filter(x=>x.label!=null);
 target.innerHTML='<div class="tree-root">'+nodeMarkup(root,true)+
 '<div class="tree-children">'+(all.length?all.map(r=>{
   const node=state.nodes["factory:"+r.label];if(!node)return "";
   const expanded=state.expandedFactory===node.id;
   return '<div class="tree-branch">'+nodeMarkup(node)+
    (expanded?'<div class="tree-children" style="gap:12px;margin-top:37px">'+state.productRows.filter(p=>p.label!=null).map(p=>{
      const child=state.nodes["product:"+r.label+"|"+p.label];return child?'<div class="tree-branch">'+nodeMarkup(child)+'</div>':"";
    }).join("")+'</div>':'')+'</div>';
 }).join(""):'<div class="empty">Keine Werke im aktuellen Filterkontext</div>')+'</div></div>';
 $$("[data-select-node]",target).forEach(el=>{
  el.onclick=e=>{if(e.target.closest("button"))return;selectNode(el.dataset.selectNode)};
  el.onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&e.target===el){e.preventDefault();selectNode(el.dataset.selectNode)}};
 });
 $$("[data-filter-node]",target).forEach(btn=>btn.onclick=e=>{e.stopPropagation();openFilterModal("local",btn.dataset.filterNode)});
 paintCamera();
 if($("#tree-status"))$("#tree-status").textContent=state.graphBusy?"Aktualisiert …":all.length+" Werke · Knoten anklicken";
}
function selectNode(id){
 if(!state.nodes[id])return;
 state.selected=id;state.selectedMetrics=null;state.trend=[];state.breakdown=[];
 const factory=factoryFor(id);
 if(factory)state.expandedFactory=factory;
 else state.expandedFactory=null;
 state.camera={x:0,y:0,zoom:1};
 refreshAnalysis();
}
function paintCamera(){
 const el=$("#tree-inner");if(!el)return;
 const {x,y,zoom}=state.camera;
 el.style.transform="translate(calc(-50% + "+x+"px),"+y+"px) scale("+zoom+")";
}
function zoom(multiplier){state.camera.zoom=Math.max(.35,Math.min(2,state.camera.zoom*multiplier));paintCamera()}
function mountDrag(){
 const stage=$("#graph-stage");if(!stage)return;
 let start=null;
 stage.onpointerdown=e=>{
  if(e.target.closest(".node")||e.target.closest("button"))return;
  start={px:e.clientX,py:e.clientY,x:state.camera.x,y:state.camera.y};stage.setPointerCapture(e.pointerId);
 };
 stage.onpointermove=e=>{if(!start)return;state.camera.x=start.x+e.clientX-start.px;state.camera.y=start.y+e.clientY-start.py;paintCamera()};
 stage.onpointerup=()=>{start=null};stage.onpointercancel=()=>{start=null};
 stage.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12)};
}
function lineChart(rows){
 const valid=(rows||[]).filter(r=>r.on_time_rate!=null);
 if(!valid.length)return '<div class="empty" style="padding:35px 10px">Keine Zeitreihe verfügbar</div>';
 const vals=valid.map(r=>Number(r.on_time_rate)),top=100,bottom=0;
 const w=500,h=195,pad=35,n=valid.length;
 const points=vals.map((v,i)=>{const x=pad+(i*(w-2*pad))/Math.max(n-1,1),y=15+(h-45)*(top-v)/(top-bottom);return [x,y]});
 const line=points.map((p,i)=>(i?"L":"M")+p.join(",")).join(" ");
 const filled=line+" L"+points[points.length-1][0]+","+(h-30)+" L"+pad+","+(h-30)+" Z";
 return '<svg class="linechart" viewBox="0 0 500 195" role="img" aria-label="Zeitlicher Verlauf der pünktlichen Lieferquote">'+
 '<defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#008B92" stop-opacity=".25"/><stop offset="1" stop-color="#008B92" stop-opacity="0"/></linearGradient></defs>'+
 [0,25,50,75,100].map(v=>{let y=15+(h-45)*(100-v)/100;return '<line class="chart-grid" x1="35" x2="490" y1="'+y+'" y2="'+y+'"/><text class="axis-txt" x="4" y="'+(y+4)+'">'+v+'%</text>'}).join("")+
 '<path d="'+filled+'" fill="url(#trend-fill)"/><path d="'+line+'" fill="none" stroke="#008B92" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
 points.filter((p,i)=>i===0||i===n-1||i%Math.max(1,Math.ceil(n/12))===0).map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.6" fill="#fff" stroke="#008B92" stroke-width="2"/>').join("")+
 '<text class="axis-txt" x="37" y="192">'+esc(valid[0].month)+'</text><text class="axis-txt" x="490" y="192" text-anchor="end">'+esc(valid[n-1].month)+'</text></svg>'+
 '<details style="margin-top:5px;font-size:11px;color:var(--muted)"><summary>Werte als Tabelle</summary><table><thead><tr><th>Monat</th><th>Aufträge</th><th>On-Time</th></tr></thead><tbody>'+
 valid.map(r=>'<tr><td>'+esc(r.month)+'</td><td>'+formatInt(r.orders)+'</td><td>'+formatPct(r.on_time_rate)+'</td></tr>').join("")+'</tbody></table></details>';
}
function barChart(rows){
 const good=(rows||[]).filter(r=>r.label!=null&&r.on_time_rate!=null).slice(0,7);
 if(!good.length)return '<div class="empty" style="padding:20px">Keine Vergleichsdaten</div>';
 return '<div class="barchart">'+good.map(r=>'<div class="bar-item" title="'+esc(r.label)+': '+formatPct(r.on_time_rate)+'">'+
 '<span class="bar-pct">'+formatPct(r.on_time_rate)+'</span><div class="bar" style="height:'+Math.max(4,Number(r.on_time_rate)*1.15)+'px"></div><span class="bar-label">'+esc(r.label)+'</span></div>').join("")+'</div>';
}
function paintDetails(){
 const target=$("#detail-panel");if(!target)return;
 const m=state.selectedMetrics||state.metrics,node=state.nodes[state.selected]||state.nodes.root;
 const local=state.local[state.selected]||[];
 const applied=(()=>{try{return effective()}catch{return state.global}})();
 target.innerHTML='<div class="detail-hero"><h2>'+esc(node?.label||"On-Time Delivery")+'</h2><p>Detailanalyse · Pünktliche Lieferung · '+formatInt(m?.orders)+' Aufträge</p></div>'+
 '<div class="detail-content"><div class="mini-tabs"><button class="btn active" id="detail-summary">Überblick</button><button class="btn" id="details-refine">'+icon("filter",15)+' Filter</button><button class="btn" id="detail-focus">'+icon("tree",15)+' Baum</button></div>'+
 (state.busy&&!m?'<div class="empty"><span class="spinner"></span> Kennzahlen werden geladen …</div>':'<div class="kpis">'+
 '<div class="kpi"><small>Pünktliche Lieferung</small><strong style="color:var(--teal-deep)">'+formatPct(m?.onTimeRate)+'</strong><span class="delta">Datum ≤ Zusage</span></div>'+
 '<div class="kpi"><small>Aufträge</small><strong>'+formatInt(m?.orders)+'</strong><span class="delta">Case-basiert</span></div>'+
 '<div class="kpi"><small>Mengentreue</small><strong>'+formatPct(m?.volumeConformanceRate)+'</strong><span class="delta">Toleranz erfüllt</span></div></div>'+
 '<div class="charts"><div class="chart-card"><h3>Lieferperformance im Zeitverlauf</h3>'+lineChart(state.trend)+'</div>'+
 '<div class="chart-card"><h3>Vergleich nach Lieferunternehmen</h3>'+barChart(state.breakdown)+'</div></div>'+
 '<div class="insight"><strong>Analysekontext</strong><br>Forschungsfrage: Welche Segmente beeinflussen die pünktliche Lieferquote? '+
 (applied.length?'Aktiv: '+applied.map(f=>esc(config.fields[f.field])+': '+esc(f.value)).join(" · "):"Keine zusätzlichen Filter")+
 (local.length?' · '+local.length+' direkt an diesem Knoten':'')+
 '.<br><span class="field-note">Zusammenhänge sind nicht automatisch kausale Ursachen. Alle Kennzahlen nutzen denselben Filterkontext.</span></div>')+'</div>';
 $("#details-refine").onclick=()=>openFilterModal("local",state.selected);
 $("#detail-focus").onclick=()=>navigate("tree");
 $("#detail-summary").onclick=()=>toast("Die Übersicht ist bereits geöffnet.");
}
function openFilterModal(scope,nodeId){
 const defs=Object.entries(config.fields).filter(([key])=>(state.dimensions[key]||[]).length);
 if(!defs.length){toast("Filterdaten sind noch nicht verfügbar.","error");return}
 if(filterModal)filterModal.remove();
 const modal=document.createElement("div");modal.className="modal-cover";modal.id="modal-root";
 modal.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">'+(scope==="global"?"Globalen Filter hinzufügen":"Knotenfilter hinzufügen")+'</h2>'+
 '<p>'+(scope==="global"?"Dieser Filter gilt für alle Analysen.":"Dieser Filter gilt nur für den ausgewählten Knoten und seine Unterknoten.")+'</p>'+
 '<form id="filter-form"><div class="field"><label for="filter-field">Dimension</label><select id="filter-field">'+defs.map(([key,label])=>'<option value="'+esc(key)+'">'+esc(label)+'</option>').join("")+'</select></div>'+
 '<div class="field"><label for="filter-value">Wert</label><select id="filter-value"></select></div><div class="modal-actions"><button type="button" class="btn" id="cancel-filter">Abbrechen</button><button type="submit" class="btn primary">Filter anwenden</button></div></form>'+
 (scope==="local"&&state.local[nodeId]?.length?'<button class="btn small danger" id="clear-node-filters" style="margin-top:12px">Alle lokalen Filter entfernen</button>':"")+'</div>';
 document.body.appendChild(modal);filterModal=modal;
 function populate(){
  const values=state.dimensions[$("#filter-field").value]||[];
  $("#filter-value").innerHTML=values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
 }
 populate();$("#filter-field").onchange=populate;
 $("#cancel-filter").onclick=closeFilterModal;
 modal.onclick=e=>{if(e.target===modal)closeFilterModal()};
 modal.onkeydown=e=>{if(e.key==="Escape"){e.preventDefault();closeFilterModal()}};
 $("#clear-node-filters")?.addEventListener("click",()=>{delete state.local[nodeId];closeFilterModal();refreshAnalysis()});
 $("#filter-form").onsubmit=e=>{
  e.preventDefault();const field=$("#filter-field").value,value=$("#filter-value").value;
  try{const p=filters.predicate(field,value);
   if(scope==="global"){state.global=filters.validate([...state.global,p]);}
   else{state.local[nodeId]=filters.validate([...(state.local[nodeId]||[]),p]);}
   closeFilterModal();refreshAnalysis();
  }catch(error){toast(error.message,"error")}
 };
 $("#filter-field").focus();
}
function closeFilterModal(){if(filterModal){filterModal.remove();filterModal=null}}
async function boot(){
 if(!window.supabase?.createClient){app.innerHTML='<div class="empty"><strong>Die Anmeldung konnte nicht geladen werden</strong><p>Bitte Verbindung prüfen und die Seite neu laden.</p><button class="btn" onclick="location.reload()">Erneut versuchen</button></div>';return}
 state.supabase=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const params=new URLSearchParams(location.search);
 const {data}=await state.supabase.auth.getSession();
 if(params.has("setup")&&!data.session){authPage("setup");return}
 if(!data.session){authPage("login");return}
 await loadCurrentUser();
}
boot().catch(e=>{app.innerHTML='<div class="empty"><strong>Start fehlgeschlagen</strong><p>'+esc(e.message)+'</p><button class="btn" onclick="location.reload()">Erneut laden</button></div>'});
window.addEventListener("popstate",()=>{if(state.user&&state.role){const restored=filters.parseShareState();if(restored){state.global=restored.global;state.selected=restored.selected;refreshAnalysis()}}});
})();

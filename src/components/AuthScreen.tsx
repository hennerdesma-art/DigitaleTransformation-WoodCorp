import React,{useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {PROJECT} from '../config';
import {Brand,Button,Notice} from './Ui';
import Icon from './Icon';
export default function AuthScreen({client,mode='login',onDone}:{client:SupabaseClient;mode?:'login'|'invite'|'recovery';onDone:()=>void}){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [notice,setNotice]=useState('');const [ok,setOk]=useState(false);const [busy,setBusy]=useState(false);
 const update=mode!=='login';
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setNotice('');setOk(false);
  try{
   if(update){if(password.length<12||password!==confirm)throw Error('Passwörter müssen übereinstimmen und mindestens 12 Zeichen haben.');const {error}=await client.auth.updateUser({password});if(error)throw error;history.replaceState({},'',location.pathname);onDone();}
   else{const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;onDone();}
  }catch(err){setNotice(err instanceof Error?err.message:'Anmeldung fehlgeschlagen.')}finally{setBusy(false)}
 };
 const reset=async()=>{if(!email.trim()){setNotice('Bitte zuerst deine E-Mail-Adresse eingeben.');return;}setBusy(true);setNotice('');const redirect=location.origin+location.pathname+'?recovery=1';const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect});setBusy(false);if(error){setNotice(error.message);}else{setNotice('Falls für die E-Mail ein Konto vorhanden ist, wird ein Wiederherstellungslink versendet.');setOk(true)}};
 return <div className="auth-layout">
  <div className="auth-showcase"><Brand/><div className="auth-cover"><div className="eyebrow light">NXT · DIGITAL TRANSFORMATION</div><h1>Turning data into<br/><em>better decisions.</em></h1><p>Von der Kennzahl über den interaktiven Analysebaum bis zur datenbasierten Entscheidung.</p><div className="orbital-graphic" aria-hidden="true"><div className="orbit one"/><div className="orbit two"/><span className="orb-dot a"/><span className="orb-dot b"/><div className="orbit-center"><b>NXT Analytics</b><small>Connected Process Intelligence</small></div></div></div><small>REUTLINGEN UNIVERSITY · NXT</small></div>
  <div className="auth-section"><div className="auth-panel"><div className="eyebrow">GESCHÜTZTER ZUGANG</div><h2>{mode==='login'?'Willkommen zurück':mode==='invite'?'Einladung abschließen':'Passwort zurücksetzen'}</h2><p className="muted">{update?'Vergib dein persönliches Passwort für NXT Analytics.':'Bitte melde dich mit deinem registrierten Hochschulzugang an.'}</p>{notice&&<Notice kind={ok?'success':'error'}>{notice}</Notice>}
   <form onSubmit={submit}>{!update&&<label className="field">E-Mail-Adresse<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@reutlingen-university.de"/></label>}
   <label className="field">{update?'Neues Passwort':'Passwort'}<input required type="password" minLength={update?12:6} autoComplete={update?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {update&&<label className="field">Passwort wiederholen<input required type="password" minLength={12} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
   <Button kind="primary" type="submit" disabled={busy} icon="arrow-right">{busy?'Bitte warten …':update?'Passwort festlegen':'Sicher anmelden'}</Button></form>
   {!update&&<div className="auth-foot"><button className="text-button" type="button" onClick={reset} disabled={busy}>Passwort vergessen?</button><span>Registrierung nur per Einladung</span></div>}
   <p className="auth-secure"><Icon name="lock" size={15}/> Geschützte Anmeldung via Supabase Auth · {PROJECT.years}</p>
  </div></div>
 </div>;
}
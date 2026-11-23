import React from 'react';
import Icon from './Icon';
import {logoPath} from '../config';
export const number=(v:number|null|undefined)=>v==null?'–':Number(v).toLocaleString('de-DE',{maximumFractionDigits:0});
export const percent=(v:number|null|undefined)=>v==null?'–':Number(v).toLocaleString('de-DE',{maximumFractionDigits:1})+' %';
export const decimal=(v:number|null|undefined,digits=1)=>v==null?'–':Number(v).toLocaleString('de-DE',{maximumFractionDigits:digits,minimumFractionDigits:digits});
export function Button({icon,children,onClick,kind='secondary',disabled=false,title,className='',type='button'}:{icon?:string;children?:React.ReactNode;onClick?:React.MouseEventHandler<HTMLButtonElement>;kind?:'primary'|'secondary'|'ghost'|'soft'|'danger';disabled?:boolean;title?:string;className?:string;type?:'button'|'submit'}){
 return <button type={type} onClick={onClick} disabled={disabled} title={title} className={'nxt-button '+kind+' '+className}>{icon&&<Icon name={icon} size={17}/>}<span>{children}</span></button>;
}
export function IconButton({name,onClick,title,disabled=false,active=false}:{name:string;onClick?:React.MouseEventHandler<HTMLButtonElement>;title:string;disabled?:boolean;active?:boolean}){
 return <button type="button" className={'icon-button '+(active?'active':'')} title={title} aria-label={title} aria-pressed={active||undefined} disabled={disabled} onClick={onClick}><Icon name={name}/></button>;
}
export function Brand({compact=false}:{compact?:boolean}){
 return <div className={'nxt-brand '+(compact?'compact':'')}><span className="nxt-brand-image"><img src={logoPath} alt="Reutlingen University – Nachhaltigkeit und Technologie – NXT"/></span></div>;
}
export function Spinner({text='Lade Daten …'}:{text?:string}){
 return <div className="loading" role="status"><span className="nxt-spinner" aria-hidden="true"/>{text}</div>;
}
export function Notice({children,kind='neutral'}:{children:React.ReactNode;kind?:'neutral'|'error'|'success'|'warning'}){
 return <div className={'notice '+kind} role={kind==='error'?'alert':'status'}>{children}</div>;
}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=React.useRef<HTMLDivElement>(null);
 React.useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);previous?.focus();};},[onClose]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="nxt-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><div className="modal-title"><h2>{title}</h2><IconButton name="x" title="Dialog schließen" onClick={onClose}/></div>{children}</section></div>;
}
export function SmallTrend({values}:{values:number[]}){
 if(values.length<2)return <span className="sparkline unavailable" title="Keine Vergleichsreihe verfügbar">–</span>;
 const points=values.map((v,i)=>`${(i/(values.length-1)*120).toFixed(1)},${(34-(v/100)*30).toFixed(1)}`).join(' ');
 return <svg className="sparkline" viewBox="0 0 120 44" role="img" aria-label="Historische Trendlinie"><polyline fill="none" stroke="currentColor" strokeWidth="2.4" points={points}/></svg>;
}
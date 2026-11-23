import React from 'react';
export type IconName=string;
export default function Icon({name,size=18,className='',title}:{name:IconName;size?:number;className?:string;title?:string}){
 return <svg className={'nxt-icon '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden={!title} role={title?'img':undefined}>
 {title?<title>{title}</title>:null}<use href={import.meta.env.BASE_URL+'icons/sprite.svg#'+name}/></svg>;
}

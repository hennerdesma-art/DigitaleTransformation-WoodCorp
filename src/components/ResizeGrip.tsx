import React,{useRef} from 'react';
import type {CardSize} from '../core/cardLayout';
type Props={label:string;onPreview:(size:CardSize|null)=>void;onCommit:(size:CardSize|null)=>void;getScale?:()=>number;stepX?:number;stepY?:number};
type Drag={pointer:number;x:number;y:number;size:CardSize;scale:number;moved:boolean};
/** Separate pointer-captured grip: resize never initiates node dragging, filtering or graph panning. */
export function ResizeGrip({label,onPreview,onCommit,getScale,stepX=24,stepY=24}:Props){
 const drag=useRef<Drag|null>(null);
 const measure=(el:HTMLButtonElement)=>{const card=el.closest<HTMLElement>('[data-resizable-card]');if(!card)return null;const r=card.getBoundingClientRect(),scale=Math.max(.05,getScale?.()??1);return {size:{width:r.width/scale,height:r.height/scale},scale};};
 const cancel=()=>{if(drag.current){drag.current=null;onPreview(null);}};
 const sizeAt=(d:Drag,e:React.PointerEvent<HTMLButtonElement>)=>({width:d.size.width+(e.clientX-d.x)/d.scale,height:d.size.height+(e.clientY-d.y)/d.scale});
 return <button type="button" className="nxt-resize-grip nodrag nopan nowheel" aria-label={'Größe ändern: '+label+' (Pfeiltasten, Pos1 für Standardgröße)'} title="Ziehen zum Vergrößern oder Verkleinern · Pfeiltasten · Doppelklick: Standardgröße"
 onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();const m=measure(e.currentTarget);if(!m)return;drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,...m,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;e.stopPropagation();if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<3)return;d.moved=true;onPreview(sizeAt(d,e));}}
 onPointerUp={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;e.stopPropagation();drag.current=null;if(d.moved)onCommit(sizeAt(d,e));onPreview(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={cancel} onLostPointerCapture={cancel}
 onClick={e=>e.stopPropagation()} onDoubleClick={e=>{e.stopPropagation();onCommit(null);}}
 onKeyDown={e=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();cancel();return;}if(e.key==='Home'){e.preventDefault();e.stopPropagation();onCommit(null);return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const m=measure(e.currentTarget);if(!m)return;const x=stepX*(e.shiftKey?3:1),y=stepY*(e.shiftKey?3:1);onCommit({width:m.size.width+(e.key==='ArrowRight'?x:e.key==='ArrowLeft'?-x:0),height:m.size.height+(e.key==='ArrowDown'?y:e.key==='ArrowUp'?-y:0)});}}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 13L13 4M9 13l4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>;
}

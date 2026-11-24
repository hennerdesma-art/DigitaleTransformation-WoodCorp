import type {AnalysisNode} from './types';
export type CardSize={width:number;height:number};
export type CardBounds={min:CardSize;standard:CardSize;max:CardSize};
const bounds=(minW:number,minH:number,w:number,h:number,maxW=1400,maxH=1200):CardBounds=>({min:{width:minW,height:minH},standard:{width:w,height:h},max:{width:maxW,height:maxH}});
export function cardBounds(a:AnalysisNode):CardBounds{
 if(a.kind==='container')return bounds(320,160,720,440,4000,4000);
 if(a.kind==='note')return bounds(260,180,320,280);
 if(a.canvasWidgetId){switch(a.canvasWidgetType){case 'kpi':return bounds(200,156,250,190,800,700);case 'text':return bounds(260,180,350,280);case 'customer_table':case 'table':return bounds(480,320,720,440);case 'scenario':return bounds(380,360,520,480);case 'status':return bounds(360,210,520,280);case 'donut':case 'bullet':return bounds(280,240,360,320);default:return bounds(380,300,540,440);}}
 switch(a.visualization||'kpi'){
 case 'kpi':return a.kind==='root'?bounds(200,146,240,174,800,700):bounds(180,132,210,160,800,700);
 case 'donut':return bounds(260,240,340,320);
 case 'calculation':return bounds(260,190,320,240);
 case 'process_interval':return bounds(300,230,360,280);
 case 'bar':return bounds(360,300,480,420);
 case 'line':return bounds(360,300,480,370);
 default:return bounds(380,320,500,460);
 }
}
export function clampSize(size:CardSize,limit:CardBounds):CardSize{
 const fit=(v:number,min:number,max:number,fallback:number)=>Math.round(Math.max(min,Math.min(max,Number.isFinite(v)?v:fallback)));
 return {width:fit(size.width,limit.min.width,limit.max.width,limit.standard.width),height:fit(size.height,limit.min.height,limit.max.height,limit.standard.height)};
}
export function cardDimensions(a:AnalysisNode):CardSize{
 const b=cardBounds(a);
 return clampSize({width:a.cardWidth??b.standard.width,height:a.cardHeight??b.standard.height},b);
}
export function isValidCardDimension(value:unknown):boolean{return value===undefined||(typeof value==='number'&&Number.isFinite(value)&&value>=120&&value<=1400);}
export const WIDGET_HEIGHT_MIN=180,WIDGET_HEIGHT_MAX=1000;
export function clampWidgetHeight(value:number):number{return Math.round(Math.max(WIDGET_HEIGHT_MIN,Math.min(WIDGET_HEIGHT_MAX,Number.isFinite(value)?value:WIDGET_HEIGHT_MIN)));}
export function widgetResizeLayout(size:CardSize,gridWidth:number,canUseHalf:boolean,existingWidth:'half'|'full'){
 return {width:canUseHalf&&Number.isFinite(gridWidth)&&gridWidth>0?(size.width>=gridWidth*.75?'full':'half'):existingWidth,displayHeight:clampWidgetHeight(size.height)} as const;
}

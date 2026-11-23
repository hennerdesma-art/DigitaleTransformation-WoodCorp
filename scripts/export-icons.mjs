import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const names=['house','chart-column','network','layout-dashboard','chart-no-axes-combined','file-text','database','filter','sliders-horizontal','settings','star','search','bell','circle-help','user-round','chevron-down','chevron-left','chevron-right','x','check','play','save','share-2','plus','copy','undo-2','redo-2','refresh-cw','log-out','target','package','clock-3','triangle-alert','factory','grip-vertical','hand','mouse-pointer-2','cable','trash-2','maximize','minimize','zoom-in','zoom-out','scan','map','layers','table-2','chart-pie','grid-3x3','image','type','split','info','lock','menu','panel-left-close','panel-left-open','arrow-right','arrow-left','external-link','check-circle-2','ellipsis','square-dashed','workflow','circle-plus','grip','link','list-filter','chart-spline','chart-bar','clipboard-list'];
mkdirSync('public/icons',{recursive:true});const symbols=[];
for(const name of names){const file='node_modules/lucide-static/icons/'+name+'.svg';if(!existsSync(file))throw Error('Missing Lucide icon: '+file);
 const raw=readFileSync(file,'utf8').replace(/stroke-width="2"/g,'stroke-width="1.75"');
 const m=raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);if(!m)throw Error('Invalid SVG: '+name);
 symbols.push('<symbol id="'+name+'" viewBox="0 0 24 24">'+m[1]+'</symbol>');
 writeFileSync('public/icons/'+name+'.svg',raw);
}
writeFileSync('public/icons/sprite.svg','<svg xmlns="http://www.w3.org/2000/svg">'+symbols.join('')+'</svg>');
writeFileSync('public/icons/manifest.json',JSON.stringify({source:'lucide-static',version:'1.77.0',names},null,2));
console.log('Exported',names.length,'local SVG icons and sprite');

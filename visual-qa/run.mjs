import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.RUNNER_TEMP+'/nxt-browser/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.NXT_BROWSER||undefined,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const failures=[];page.on('pageerror',e=>failures.push(String(e)));
await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort()});
const base='http://127.0.0.1:4173/DigitaleTransformation-WoodCorp/visual-qa/';
async function fit(selector){
 await page.locator(selector).first().waitFor({state:'visible'});
 await page.waitForTimeout(150);
 const results=await page.locator(selector).evaluateAll(items=>items.map(el=>({width:el.clientWidth,scroll:el.scrollWidth,content:el.innerText.slice(0,90)})));
 assert.ok(results.length>0);
 for(const r of results)assert.ok(r.scroll<=r.width+3,JSON.stringify(r));
}
try{
 for(const viz of ['bar','line','donut','stacked','stacked100','heatmap','pareto','scatter','waterfall','histogram','treemap','funnel','calculation','process_interval','kpi']){
  await page.goto(base+'?viz='+viz);
  await fit('.graph-node .nxt-card-body');
  if(viz==='bar'){await page.locator('.nxt-segment-button').first().waitFor();await fit('.graph-node .nxt-card-body');const grip=page.locator('.graph-node .nxt-resize-grip');const before=Number(await page.locator('#qa-size').getAttribute('data-width'));await grip.focus();await grip.press('ArrowRight');assert.ok(Number(await page.locator('#qa-size').getAttribute('data-width'))>before);const box=await grip.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+70,{steps:8});await page.mouse.up();assert.ok(Number(await page.locator('#qa-size').getAttribute('data-width'))>before+24);await fit('.graph-node .nxt-card-body');await page.locator('.nxt-chart-settings summary').first().click();await fit('.graph-node .nxt-card-body');await grip.press('Home');assert.equal(Number(await page.locator('#qa-size').getAttribute('data-width')),before);await page.screenshot({path:'visual-qa/canvas.png'});}
  console.log('PASS canvas '+viz);
 }
 for(const width of [1600,768,375]){
  await page.setViewportSize({width,height:900});
  for(const viz of ['bar','bar_vertical','line','donut','stacked','heatmap','pareto','scatter','waterfall','histogram','treemap','funnel']){
   await page.goto(base+'?mode=dashboard&viz='+viz);await fit('.nxt-widget .nxt-card-body');console.log('PASS dashboard '+width+' '+viz);
  }
 }
 await page.setViewportSize({width:1600,height:900});await page.goto(base+'?mode=builder&viz=bar');
 const grip=page.locator('.dashboard-edit-widget .nxt-resize-grip');await grip.waitFor();await grip.focus();await grip.press('ArrowDown');assert.ok(Number(await page.locator('#qa-size').getAttribute('data-height'))>=180);await fit('.dashboard-edit-widget .nxt-card-body');await grip.press('Home');assert.equal(await page.locator('#qa-size').getAttribute('data-height'),'0');await page.screenshot({path:'visual-qa/dashboard.png'});
 assert.deepEqual(failures,[]);console.log('PASS drag resize, keyboard resize, responsive chart bounds and reset');
}finally{await browser.close();}

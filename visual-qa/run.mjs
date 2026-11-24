
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.RUNNER_TEMP+'/nxt-browser/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.NXT_BROWSER||undefined,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:950}});
const failures=[];page.on('pageerror',e=>failures.push(String(e)));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
const base='http://127.0.0.1:4173/DigitaleTransformation-WoodCorp/visual-qa/';
async function go(viz){await page.goto(base+'?viz='+viz);await page.locator('.graph-node .nxt-card-body').first().waitFor();await page.waitForTimeout(200);}
try{
 await go('customer_table');await page.locator('.nxt-live-table tbody tr').first().waitFor();
 const search=page.getByRole('searchbox',{name:'Tabellengruppen suchen'});await search.fill('Testkunde 2');assert.equal(await page.locator('.nxt-live-table tbody tr').count(),1);
 await page.locator('.nxt-live-table tbody tr button').first().click();await page.getByRole('button',{name:'Neuen Analysezweig erstellen',exact:true}).click();assert.match(await page.locator('#qa-action').innerText(),/^branch:cust_id:/);
 await page.getByRole('button',{name:'Knoten temporär filtern',exact:true}).click();assert.match(await page.locator('#qa-action').innerText(),/^cust_id:/);
 await page.getByText('Tabelle konfigurieren',{exact:true}).click();await page.getByLabel('Zeilen pro Seite').selectOption('20');await page.getByRole('button',{name:'Darstellung speichern',exact:true}).click();assert.equal(JSON.parse(await page.locator('#qa-display').innerText()).pageSize,20);
 await page.screenshot({path:'visual-qa/customer-table.png'});console.log('PASS customer table search, branch, area filter and persistent display');
 await go('scatter');await page.locator('svg[aria-label^="Bubble:"]').waitFor();await page.getByText('Diagramm konfigurieren',{exact:true}).click();await page.getByLabel('X-Achse').selectOption('orderedKg');await page.getByRole('button',{name:'Darstellung speichern',exact:true}).click();assert.equal(JSON.parse(await page.locator('#qa-display').innerText()).xMetric,'orderedKg');console.log('PASS bubble axes');
 await go('comparison');await page.locator('.nxt-multi-row').first().waitFor();await page.getByText('Diagramm konfigurieren',{exact:true}).click();await page.getByLabel('Kennzahlen',{exact:true}).selectOption('mass');await page.getByRole('button',{name:'Darstellung speichern',exact:true}).click();assert.equal(JSON.parse(await page.locator('#qa-display').innerText()).comparison,'mass');console.log('PASS comparison');
 await go('scenario');await page.getByRole('button',{name:'85%',exact:true}).click();await page.getByRole('button',{name:'Darstellung speichern',exact:true}).click();assert.equal(JSON.parse(await page.locator('#qa-display').innerText()).targetOtd,85);console.log('PASS target scenario');
 for(const v of ['table','status','bar_vertical','bullet','text','line','donut','waterfall','pareto','heatmap']){await go(v);assert.ok(await page.locator('.graph-node .nxt-card-body').innerText());console.log('PASS '+v);}
 assert.deepEqual(failures,[]);
}finally{await browser.close();}

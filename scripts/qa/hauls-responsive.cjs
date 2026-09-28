/** Fixture-backed responsive QA; never sends writes to the application backend. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.env.HAUL_QA_URL || 'http://localhost:3000/dev/hauls-responsive';
const out = path.join(process.cwd(), '.reports/hauls-responsive');
const widths = process.env.HAUL_QA_WIDTHS ? process.env.HAUL_QA_WIDTHS.split(',').map(Number) : [1440, 1280, 1024, 900, 768, 600, 430, 390];
const lists = ['Essentials', 'Jordan’s List', 'Weekly Breakfast', 'Next week'].map((title, i) => ({id:`list-${i}`, title, status:'active', is_default:i===0, updated_at:'2026-09-28', archived_at:null}));
const stores = [{id:'store-1', retailer:'Whole Foods Market', store_location:'Peoria', source:'manual', postal_code:'74105'}];
const items = [0,1].map(i => ({id:`item-${i}`, haul_id:'qa-haul', source_grocery_list_id:'list-0', grocery_item_id:`grocery-${i}`, name_snapshot:'Blueberries', quantity_snapshot:1, unit_snapshot:'package', final_quantity:1, product_title:'Organic Blueberries', brand_name:null, retailer:'Whole Foods Market', store_location:'Peoria', haul_store_id:'store-1', price_amount:5.99, price_currency:'USD', price_source:'manual', purchase_unit:'package', package_size:null, package_count:null, package_unit:null}));
const detail = {haul:{id:'qa-haul', status:'planned', title:'Weekly groceries', shopping_date:'2026-09-28', currency:'USD', budget_amount:150}, source_lists:lists.slice(0,3).map(l=>({grocery_list_id:l.id,title:l.title})), stores, items, estimate:{currency:'USD',estimated_total:11.98,execution_item_count:2,priced_item_count:2,unpriced_item_count:0,missing_product_count:0,missing_store_count:0,by_store:[{store_key:JSON.stringify(['whole foods market','peoria','']),retailer:'Whole Foods Market',store_location:'Peoria',estimated_subtotal:11.98}]}};
const overview = {default_list:lists[0], named_lists:lists.slice(1), persistent_list_summaries:Object.fromEntries(lists.map(l=>[l.id,{counts:{pending:3}}]))};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true, channel: process.env.HAUL_QA_BROWSER || "chrome"});
 const page=await browser.newPage();
 const requests=[];
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**', async route=>{
  const url=new URL(route.request().url()); const p=url.pathname; const method=route.request().method();
  requests.push({path:p,method});
  let body={};
  if(p.endsWith('/stores') && method==='POST') {
   const input=route.request().postDataJSON();
   const existing=detail.stores.find(s=>input.provider_place_id ? s.provider_place_id===input.provider_place_id : s.retailer.toLowerCase()===input.retailer.toLowerCase());
   const store=existing || {id:`store-${detail.stores.length+1}`, ...input};
   if(!existing) detail.stores.push(store);
   body={store,outcome:existing?'reused':'created'};
  }
  else if(p.includes('/stores/') && method==='DELETE') {
   const id=p.split('/').pop();
   const affected=detail.items.filter(i=>i.haul_store_id===id);
   detail.stores=detail.stores.filter(s=>s.id!==id);
   for(const i of affected) Object.assign(i,{haul_store_id:null,retailer:null,store_location:null});
   body={result:{store_id:id,outcome:'removed',affected_item_count:affected.length}};
  }
  else if(p.includes('/items/') && method==='PATCH') {
   const item=detail.items.find(i=>i.id===p.split('/').pop());
   Object.assign(item,route.request().postDataJSON()); body={item};
  }
  else if(p.endsWith('/grocery-lists')) body=overview;
  else if(p.endsWith('/grocery-lists/list-0')) body={list:lists[0],items:[{id:'need-1',name:'Blueberries',status:'pending',food_object_id:'food-1',quantity:1,unit:'package'}]};
  else if(p.endsWith('/purchasing-choices')) body={by_item_id:{}};
  else if(p.endsWith('/haul-summary')) body={list_prices_by_item_id:{}};
  else if(p.endsWith('/hauls')) body={hauls:[0,1,2].map((i)=>({id:`haul-${i}`,title:'Weekly groceries',status:i===1?'closed':'active',shopping_date:`2026-09-${24-i*6}`,store_names:[i===1?'Walmart Super Center + Whole Foods Market — Peoria':'Whole Foods'],source_list_names:['Essentials'],source_list_name:'Essentials',estimated_total:64.5,actual_total:64.5,currency:'USD'}))};
  else if(p.endsWith('/qa-haul')) body=detail;
  else if(p.endsWith('/stores/search')) body={results:[{provider_place_id:'walmart-peoria',retailer:'Walmart Neighborhood Market',store_location:'4407 S Peoria Ave, Tulsa, OK 74105'}],provider_disabled:false,provider_error:null};
  else if(p.endsWith('/execution/readiness')) body={readiness:{can_start:true,blockers:[],warnings:[{code:'missing_price',message:'Some items need a price.'}],deferred_findings:[]}};
  else if(p.includes('price')) body={observations:[],quotes:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const results=[];
 async function inspect(name,width){
  await page.evaluate(()=>document.fonts.ready);
  const findings=await page.evaluate(()=>{
   const root=document.querySelector('[role="dialog"]') || document.querySelector('main main') || document.body;
   const overflow=[...root.querySelectorAll('*')].filter(el=>{
    const r=el.getBoundingClientRect();const s=getComputedStyle(el);
    return r.width>0 && s.visibility!=='hidden' && !el.closest('[aria-hidden="true"]') && (r.right>innerWidth+1 || r.left < -1) && s.position!=='fixed';
   }).map(el=>({tag:el.tagName,text:el.textContent.slice(0,70),class:el.className}));
   return {pageOverflow:document.documentElement.scrollWidth>innerWidth,overflow};
  });
  results.push({name,width,...findings});
  await page.screenshot({path:path.join(out,`${width}-${name}.png`),fullPage:!name.includes('dialog')});
 }
 for(const width of widths){
  await page.setViewportSize({width,height:1000});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Start or continue your haul preparation.'}).waitFor();
  await inspect('library',width);
  await page.getByRole('button',{name:'+ Create New',exact:true}).click();
  await page.getByRole('dialog').waitFor(); await inspect('start-dialog',width);
  await page.keyboard.press('Escape');
  await page.goto(`${base}?view=builder`,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Prepare your next shopping trip'}).waitFor();
  await inspect('builder',width);
  await page.getByRole('button',{name:'Manage Haul stores',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByPlaceholder('Search stores',{exact:true}).fill('Walmart');
  await page.getByLabel('Location context (optional)').fill('4407 S Peoria Ave, Tulsa');
  await page.getByText('Walmart Neighborhood Market',{exact:true}).waitFor();
  await inspect('store-dialog',width);
  await page.getByRole('button',{name:'Add manually',exact:true}).click();
  await inspect('manual-store-dialog',width);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Add lists (3)',exact:true}).click();
  await inspect('add-lists-dialog',width); await page.keyboard.press('Escape');
  await page.locator('summary').first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.getByRole('dialog').waitFor(); await inspect('item-dialog',width);
  await page.getByRole('button',{name:'Edit manually',exact:true}).click();
  await inspect('item-manual-dialog',width);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open Shopping View',exact:true}).click();
  await page.getByRole('dialog').waitFor(); await inspect('readiness-dialog',width);
  await page.keyboard.press('Escape');
  await page.goto(`${base}?listId=list-0&view=lists`,{waitUntil:'networkidle'});
  await page.getByText('+ New List',{exact:true}).click();
  await page.getByRole('dialog').waitFor(); await inspect('new-list-dialog',width);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Build a Haul',exact:true}).click();
  await page.getByRole('dialog').waitFor(); await inspect('build-haul-dialog',width);
  await page.keyboard.press('Escape');
 }
 if(process.env.HAUL_QA_RUNTIME==='1') {
  const assert=require('assert/strict');
  await page.goto(`${base}?view=builder`,{waitUntil:'networkidle'});
  const openStores=()=>page.getByRole('button',{name:'Manage Haul stores',exact:true}).click();
  await openStores();
  await page.getByPlaceholder('Search stores',{exact:true}).fill('Walmart');
  await page.getByText('Walmart Neighborhood Market',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('region',{name:'Current stores'}).getByText('Walmart Neighborhood Market').waitFor();
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(detail.stores.length,2,'searched duplicate must reuse identity');
  await page.getByRole('button',{name:'Add manually',exact:true}).click();
  await page.getByLabel('Store / retailer name').fill('Sidestore');
  await page.getByLabel('Location / branch label').fill('Tulsa');
  await page.getByRole('button',{name:'Add Store',exact:true}).click();
  await page.getByRole('region',{name:'Current stores'}).getByText('Sidestore').waitFor();
  await page.keyboard.press('Escape');
  await page.getByText('3 Stores',{exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.getByText('3 Stores',{exact:true}).waitFor();
  await page.locator('summary').first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.getByRole('button',{name:'Edit manually',exact:true}).click();
  await inspect('item-manual-dialog',390);
  await page.getByLabel('Store destination').selectOption({label:'Sidestore'});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(detail.items[0].haul_store_id,'store-3');
  await openStores();
  await page.getByRole('region',{name:'Current stores'}).locator('li').filter({hasText:'Sidestore'}).getByRole('button',{name:'Remove',exact:true}).click();
  await page.getByText(/1 item will become unassigned/).waitFor();
  await page.getByRole('button',{name:'Remove store',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(detail.items[0].haul_store_id,null);
  await page.getByRole('region',{name:'Current stores'}).locator('li').filter({hasText:'Walmart Neighborhood Market'}).getByRole('button',{name:'Remove',exact:true}).click();
  await page.getByRole('button',{name:'Remove store',exact:true}).click();
  await page.waitForTimeout(100);
  assert.equal(detail.stores.length,1);
  await page.keyboard.press('Escape');
  await page.locator('summary').first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.getByRole('button',{name:'Edit manually',exact:true}).click();
  await page.getByLabel('Store destination').selectOption('');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(detail.items[0].haul_store_id,null);
  assert(!requests.some(r=>/price.*search|search.*price/.test(r.path)),'no automatic price search');
  assert(!requests.some(r=>r.path.includes('/grocery-lists') && r.method!=='GET'),'source Lists stay read-only');
  console.log('PASS fixture store add/reload, duplicate, manual add, assignment, assigned/unassigned removal, No store, no price lookup or source mutation');
 }
 fs.writeFileSync(path.join(out,process.env.HAUL_QA_RUNTIME==='1'?'runtime-results.json':'results.json'),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({screens:results.length,failures:results.filter(r=>r.pageOverflow||r.overflow.length),errors},null,2));
 await browser.close();
 if(errors.length || results.some(r=>r.pageOverflow||r.overflow.length)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});

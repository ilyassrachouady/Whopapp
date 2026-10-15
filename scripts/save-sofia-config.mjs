import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const runCurl = async (method) => {
 const url=process.env.SUPABASE_URL+'/rest/v1/offers?id=eq.sofia&select=id,name,price';
 const config=[`url = ${JSON.stringify(url)}`,`request = "${method}"`,'silent','show-error','max-time = 25',`header = ${JSON.stringify('apikey: '+process.env.SUPABASE_SERVICE_ROLE_KEY)}`,`header = ${JSON.stringify('Authorization: Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY)}`,`header = ${JSON.stringify('Accept-Profile: '+process.env.SUPABASE_SCHEMA)}`,`header = ${JSON.stringify('Content-Profile: '+process.env.SUPABASE_SCHEMA)}`,'header = "Content-Type: application/json"','header = "Prefer: return=representation"',...(method==='PATCH'?[`data = ${JSON.stringify(JSON.stringify({name:'Sofia 1:1',price:349700}))}`]:[])].join('\n');
 return await new Promise((resolve,reject)=>{let output='',error='';const c=spawn('curl',['--config','-']);c.stdout.on('data',d=>output+=d);c.stderr.on('data',d=>error+=d);c.stdin.end(config+'\n');c.on('close',code=>{if(code)reject(Error('Supabase request failed: '+error));else resolve(JSON.parse(output));});});
};
await runCurl('PATCH');const rows=await runCurl('GET');if(!Array.isArray(rows)||rows.length!==1||Number(rows[0].price)!==349700)throw Error('Price readback failed');
const mapping=JSON.parse(await readFile('.data/production-plan-map.json','utf8'));mapping['sofia:pif']='plan_pqR14wTmExkAn';await writeFile('.data/production-plan-map.json',JSON.stringify(mapping,null,2));
let local=await readFile('.env.local','utf8');local=local.replace(/^WHOP_PLAN_IDS_JSON=.*$/m,'WHOP_PLAN_IDS_JSON='+JSON.stringify(mapping));await writeFile('.env.local',local);
await new Promise((resolve,reject)=>{const c=spawn('vercel',['env','add','WHOP_PLAN_IDS_JSON','production','--force','--sensitive','--yes']);c.stdin.end(JSON.stringify(mapping));c.on('close',code=>code?reject(Error('Vercel env update failed')):resolve());});
console.log(JSON.stringify({offer:rows[0],plan:'plan_pqR14wTmExkAn',product:'prod_SMkECC3LYeqYE',productionMappingUpdated:true}));

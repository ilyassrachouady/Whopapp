import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHmac} from 'node:crypto';
const e={};for(const line of(await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const origin='https://whopapp-wine.vercel.app';
const auth='Basic '+Buffer.from(`${e.DESK_USERNAME||'lewis'}:${e.DESK_PASSWORD}`).toString('base64');
for(const [name,path,headers]of [['login_required','/',{}],['desk','/',{Authorization:auth}],['integrations','/api/integrations/status',{Authorization:auth}]]){
 const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(25000)});console.log(JSON.stringify({name,status:r.status,...(name==='integrations'?{integrations:await r.json()}:{})}));
 if(r.status!==(name==='login_required'?401:200))throw new Error('Deployment verification failed: '+name);
}
const id='evt_production_connection_test',timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({type:'payment_desk.connection_test',data:{}});
const signature=createHmac('sha256',e.WHOP_WEBHOOK_SECRET).update(`${id}.${timestamp}.${body}`).digest('base64');
for(const signed of [false,true]){const r=await fetch(origin+'/api/webhooks/whop',{method:'POST',headers:{'Content-Type':'application/json',...(signed?{'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':`v1,${signature}`}:{})},body});console.log(JSON.stringify({name:signed?'signed_webhook':'unsigned_webhook',status:r.status}));if(r.status!==(signed?200:401))throw new Error('Webhook authentication failed');}
const checkoutId=randomUUID();
const r=await fetch(origin+'/api/checkouts',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({requestId:checkoutId,prospectId:'live-test-ilyass',offerId:'coaching',closerId:'lewis',paymentType:'pif'})});
const d=await r.json();console.log(JSON.stringify({name:'live_checkout_and_database',status:r.status,mode:d.mode,amount:d.amount_due_today,paymentSubmitted:false}));if(!r.ok)throw new Error('Live checkout failed: '+d.error);
await writeFile('.data/production-checkout-verification.json',JSON.stringify({id:checkoutId,status:r.status,whop_checkout_id:d.whop_checkout_id,paymentSubmitted:false},null,2));

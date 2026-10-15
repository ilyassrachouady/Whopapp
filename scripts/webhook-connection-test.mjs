import { readFile, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
const env={};for(const line of (await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const {endpoint: savedEndpoint}=JSON.parse(await readFile('.data/webhook-tunnel.json','utf8'));
const origin=new URL(savedEndpoint).origin;
const endpoint=origin+'/api/webhooks/whop';
const id='evt_payment_desk_connection_test',timestamp=String(Math.floor(Date.now()/1000));
const body=JSON.stringify({type:'payment_desk.connection_test',data:{}});
const signature=createHmac('sha256',env.WHOP_WEBHOOK_SECRET).update(`${id}.${timestamp}.${body}`).digest('base64');
for(const [name,url,method,headers] of [
 ['app_pages_blocked',origin+'/', 'GET',{}],
 ['unsigned_webhook_rejected',endpoint,'POST',{'Content-Type':'application/json'}],
 ['signed_connection_test',endpoint,'POST',{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':`v1,${signature}`}],
]) {
 const response=await fetch(url,{method,headers,...(method==='POST'?{body}:{}),signal:AbortSignal.timeout(45000)});
 const text=await response.text();console.log(JSON.stringify({name,status:response.status,...(name==='signed_connection_test'?{response:text}:{} )}));
}
await writeFile('.data/webhook-tunnel.json',JSON.stringify({endpoint,startedAt:new Date().toISOString(),purpose:'Local webhook testing only'},null,2));

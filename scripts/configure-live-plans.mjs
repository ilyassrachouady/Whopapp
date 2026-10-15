import {readFile,writeFile} from 'node:fs/promises';
for(const line of (await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
process.env.WHOP_SANDBOX='false';
const {getWhop}=await import('../lib/whop.ts');
const client=getWhop();const existing=await client.plans.retrieve({id:'plan_81FcgzTXkkxZC'});
const mapping={};
try{Object.assign(mapping,JSON.parse(await readFile('.data/production-plan-map.json','utf8')));}catch{}
for(const [key,title,initial,count,product] of [
 ['coaching:pif','Coaching - Pay in Full',1997,1,existing.product?.id],
 ['coaching:two','Coaching - 2 Payments',1200,2,existing.product?.id],
 ['coaching:three','Coaching - 3 Payments',800,3,existing.product?.id],
 ['sofia:pif','Sofia 1:1 - Pay in Full',3497,1,'prod_SMkECC3LYeqYE'],
]){
 if(mapping[key]){console.log(JSON.stringify({key,status:'already configured',id:mapping[key]}));continue;}
 try {
 const p=await client.plans.create({account_id:process.env.WHOP_COMPANY_ID,product_id:product,title,currency:'usd',plan_type:count===1?'one_time':'renewal',initial_price:count===1?initial:0,renewal_price:count===1?0:initial,billing_period:count===1?undefined:30,split_pay_required_payments:count===1?undefined:count,override_tax_type:'inclusive',visibility:'hidden',release_method:'buy_now',metadata:{source:'payment_desk',offer_payment:key}}, {headers:{'Idempotency-Key':'payment-desk-production-v3-'+key}});
 mapping[key]=p.id;await writeFile('.data/production-plan-map.json',JSON.stringify(mapping,null,2));console.log(JSON.stringify({key,status:'created',id:p.id}));
 }catch(error){console.log(JSON.stringify({key,status:error.statusCode||'failed',message:error.body?.error?.message||error.message}));break;}
}

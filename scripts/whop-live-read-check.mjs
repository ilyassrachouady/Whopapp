import {readFile,writeFile} from 'node:fs/promises';
const env={};for(const line of (await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const report={checkedAt:new Date().toISOString(),companyId:env.WHOP_COMPANY_ID};
await Promise.all(['plans','payments','webhooks'].map(async name=>{
 const response=await fetch(`https://api.whop.com/api/v1/${name}?account_id=${encodeURIComponent(env.WHOP_COMPANY_ID)}&first=${name==='plans'?100:1}`,{headers:{Authorization:`Bearer ${env.WHOP_API_KEY}`},signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 report[name]={status:response.status};
 if(name==='plans'&&response.ok)report[name].plans=data.data?.map(p=>({id:p.id,title:p.title,currency:p.currency,type:p.plan_type,initial_price:p.initial_price,initial_price_due:p.initial_price_due,renewal_price:p.renewal_price,required_payments:p.split_pay_required_payments,billing_period:p.billing_period,collect_tax:p.collect_tax}));
 console.log(JSON.stringify({name,...report[name]}));
}));await writeFile('.data/whop-live-check.json',JSON.stringify(report,null,2));

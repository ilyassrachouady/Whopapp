import {WhopClient} from '@whop/sdk';
const c=new WhopClient({token:process.env.WHOP_API_KEY,baseUrl:'https://api.whop.com/api/v1',timeoutInSeconds:15,maxRetries:1});
const offers=[{id:'coaching',product:'prod_RzJgrVZRNqAIu',pif:2997,manual:3600},{id:'sofia',product:'prod_MFjbczsXska4b',pif:4997,manual:6000}];
for(const o of offers){
 const plans=[];for await(const p of await c.plans.list({account_id:process.env.WHOP_COMPANY_ID,product_ids:[o.product]}))plans.push(p);
 for(const [type,count]of [['pif',1],['two',2],['three',3]]){
  const amount=count===1?o.pif:o.manual/count;
  let plan;for(const p of plans){const r=await c.plans.retrieve({id:p.id});if(r.account?.id===process.env.WHOP_COMPANY_ID&&r.currency==='usd'&&Number(r.initial_price_due.amount)===amount&&r.effective_payment_method_configuration?.enabled?.includes('card')&&(count===1?r.plan_type==='one_time':r.plan_type==='renewal'&&r.billing_period===30&&r.split_pay_required_payments===count&&r.renewal_price===amount&&!r.trial_period_days)){plan=r;break;}}
  if(!plan){if(!process.argv.includes('--apply')){console.log(JSON.stringify({offer:o.id,type,amount,status:'would-create'}));continue;}
   plan=await c.plans.create({account_id:process.env.WHOP_COMPANY_ID,product_id:o.product,plan_type:count===1?'one_time':'renewal',currency:'usd',initial_price:count===1?amount:0,renewal_price:count===1?0:amount,...(count>1?{billing_period:30,split_pay_required_payments:count}:{}),title:`${o.id} ${type} November 2026`,visibility:'hidden',release_method:'buy_now',override_tax_type:'inclusive',payment_method_configuration:{enabled:['card','bank_wire'],disabled:[],include_platform_defaults:false},metadata:{source:'payment_desk',pricing_version:'2026-11-02',offer_payment:`${o.id}:${type}`}},{headers:{'Idempotency-Key':`payment-desk-pricing-20261102-${o.id}-${type}`}});
  }
  const verified=await c.plans.retrieve({id:plan.id});if(verified.account?.id!==process.env.WHOP_COMPANY_ID||verified.product?.id!==o.product||Number(verified.initial_price_due.amount)!==amount||verified.currency!=='usd'||(count>1&&(verified.renewal_price!==amount||verified.split_pay_required_payments!==count)))throw Error('Price verification failed');console.log(JSON.stringify({offer:o.id,type,planId:verified.id,dueToday:verified.initial_price_due.amount,total:count===1?o.pif:o.manual,verified:true}));
 }
}

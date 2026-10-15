import {readFile,writeFile,mkdir} from 'node:fs/promises';
for(const line of (await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
if(process.env.PAYMENT_DESK_LOCAL_TEST!=='true'||process.env.VERCEL)throw new Error('Local test mode required');
const {createCheckout}=await import('../lib/whop.ts');
const {createDemoCheckout}=await import('../lib/demo.ts');
const {calculatePlan}=await import('../lib/payments.ts');
const {saveSession}=await import('../lib/supabase.ts');
const prospect={id:'live-test-ilyass',full_name:'Ilyass Payment Desk TEST',email:'ilyassrachouady24@gmail.com',phone:'',ghl_contact_id:'WwyCbpTs098oP8g9A5If',ghl_opportunity_id:'',lead_source:'Payment Desk End-to-End TEST',call_id:'live-test-call',trakyo_id:'',utm_source:'test',utm_medium:'test',utm_campaign:'local-e2e'};
const closer={id:'live-test',name:'TEST Closer',email:prospect.email,initials:'TC'};
const offer={id:'live-test',name:'TEST - Get Paid To Post',slug:'get-paid-to-post-copy',price:100};
await mkdir('.data',{recursive:true});
await writeFile('.data/live-test-catalog.json',JSON.stringify({prospects:[prospect],closers:[closer],offers:[offer]}));
const session=createDemoCheckout({prospect,closer,offer,plan:calculatePlan(offer,'pif'),origin:'http://localhost:3000'});
const checkout=await createCheckout({id:session.id,customer:prospect,offer,payment:session.plan,metadata:session.metadata,origin:'http://localhost:3000'});
Object.assign(session,{whop_checkout_id:checkout.id,checkout_url:checkout.url,mode:checkout.mode,status:'pending_payment'});
await saveSession(session);
await writeFile('.data/live-test-checkout.json',JSON.stringify({id:session.id,url:checkout.url,mode:checkout.mode,amount:100,paymentSubmitted:false},null,2));
console.log(JSON.stringify({checkoutCreated:true,id:session.id,url:checkout.url,paymentSubmitted:false}));

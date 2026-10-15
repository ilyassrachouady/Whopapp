import {readFile} from 'node:fs/promises';
for(const line of(await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const base=process.env.SUPABASE_URL+'/rest/v1/';const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Accept-Profile':process.env.SUPABASE_SCHEMA};
for(const path of ['checkout_sessions?select=id,checkout_type,installment_count&limit=1','payment_actions?select=action_key&limit=1','call_records?select=id,attendance,outcome,deposit_amount&limit=1']){const r=await fetch(base+path,{headers});console.log(JSON.stringify({table:path.split('?')[0],status:r.status}));if(!r.ok)throw new Error('Schema incomplete');}
const test=JSON.parse(await readFile('.data/live-test-catalog.json','utf8')).prospects[0];
const allowed=['id','full_name','email','phone','ghl_contact_id','ghl_opportunity_id','lead_source','call_id','trakyo_id','utm_source','utm_medium','utm_campaign'];
const row=Object.fromEntries(allowed.map(k=>[k,test[k]]));row.appointment_id='appt_test';
const seeded=await fetch(base+'prospects?on_conflict=id',{method:'POST',headers:{...headers,'Content-Profile':process.env.SUPABASE_SCHEMA,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify(row)});console.log(JSON.stringify({testContactSaved:seeded.ok,status:seeded.status}));if(!seeded.ok)throw new Error('Test contact persistence failed');
process.env.WHOP_SANDBOX='false';const {getWhop}=await import('../lib/whop.ts');const {validateWhopPlan}=await import('../lib/whop-validation.ts');const {calculatePlan}=await import('../lib/payments.ts');const {offers}=await import('../lib/config.ts');
const mapping=JSON.parse(await readFile('.data/production-plan-map.json','utf8'));
for(const [key,id]of Object.entries(mapping)){const [offerId,type]=key.split(':');const p=await getWhop().plans.retrieve({id});validateWhopPlan(p,calculatePlan(offers.find(o=>o.id===offerId),type));if(p.account?.id!==process.env.WHOP_COMPANY_ID)throw new Error('Wrong company');console.log(JSON.stringify({key,id,validated:true}));}

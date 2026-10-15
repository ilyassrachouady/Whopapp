import { readFile, writeFile, mkdir } from 'node:fs/promises';
const env={};
for(const line of (await readFile('.env.local','utf8')).split('\n')) { const match=line.match(/^([A-Z_0-9]+)=(.*)$/); if(match) env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2'); }
async function request(endpoint,method='GET',body,version='v3') {
 const response=await fetch(`https://services.leadconnectorhq.com${endpoint}`,{method,headers:{Authorization:`Bearer ${env.GHL_API_KEY}`,Version:version,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 const rawMessage=data.message || data.errors || data.error;
 const message=rawMessage ? JSON.stringify(rawMessage).replaceAll(env.GHL_API_KEY,'[redacted]') : undefined;
 return {status:response.status,data,message};
}
const location=env.GHL_LOCATION_ID, email='payment-desk-test-20261014@testing.invalid';
const report={locationId:location,checkedAt:new Date().toISOString(),checks:[]};
for(const item of [{name:'workflow_read',path:`/workflows/?locationId=${location}`,version:'2021-07-28'},{name:'location_read',path:`/locations/${location}`,version:'2021-07-28'}]) {
 const result=await request(item.path,'GET',undefined,item.version); report.checks.push({name:item.name,status:result.status,message:result.message});
}
let existing;
try { existing=JSON.parse(await readFile('.data/ghl-test.json','utf8')); } catch {}
if(existing?.locationId===location && existing.contactId) report.contactId=existing.contactId;
else {
 const duplicate=await request(`/contacts/search/duplicate?locationId=${location}&email=${encodeURIComponent(email)}`);
 if(duplicate.status===200 && duplicate.data.contact?.id) report.contactId=duplicate.data.contact.id;
 if(!report.contactId) {
  const created=await request('/contacts/','POST',{locationId:location,firstName:'Payment Desk',lastName:'TEST API 2026-10-14',email,dnd:true,source:'Payment Desk TEST',timezone:'Africa/Casablanca',dndSettings:{email:{status:'active'},sms:{status:'active'},call:{status:'active'}}});
  report.checks.push({name:'create_test_contact',status:created.status,message:created.message});
  if(created.data.contact?.id) report.contactId=created.data.contact.id;
 }
}
if(report.contactId) {
 const read=await request(`/contacts/${report.contactId}`);
 const contact=read.data.contact;
 if(contact?.locationId!==location || contact?.email!==email || !contact?.dnd) throw new Error('Test contact ownership or DND check failed.');
 report.checks.push({name:'read_test_contact',status:read.status,locationMatches:true,dnd:contact.dnd,type:contact.type,name:contact.name||`${contact.firstName} ${contact.lastName}`});
}

if(report.contactId) {
 const contactPath=`/contacts/${report.contactId}`;
 const notes=await request(`${contactPath}/notes`);
 const noteBody='Payment Desk TEST ONLY: API note and deposit follow-up verification. No real payment collected.';
 let note=notes.data.notes?.find(n=>n.body===noteBody);
 if(!note) { const created=await request(`${contactPath}/notes`,'POST',{body:noteBody}); note=created.data.note; report.checks.push({name:'create_test_note',status:created.status,message:created.message}); }
 const verifiedNotes=await request(`${contactPath}/notes`);
 report.checks.push({name:'verify_test_note',status:verifiedNotes.status,verified:Boolean(verifiedNotes.data.notes?.some(n=>n.body===noteBody))});
 const title='Payment Desk TEST - Deposit Follow-up';
 const tasks=await request(`${contactPath}/tasks`);
 let task=tasks.data.tasks?.find(t=>t.title===title);
 if(!task) { const created=await request(`${contactPath}/tasks`,'POST',{title,body:'TEST ONLY: verify follow-up task creation. No outreach required.',dueDate:'2026-10-15T13:00:00.000Z',completed:false}); task=created.data.task; report.checks.push({name:'create_test_task',status:created.status,message:created.message}); }
 const verifiedTasks=await request(`${contactPath}/tasks`);
 const savedTask=verifiedTasks.data.tasks?.find(t=>t.title===title);
 report.checks.push({name:'verify_test_task',status:verifiedTasks.status,verified:Boolean(savedTask)});
 if(savedTask && !savedTask.completed) { const done=await request(`${contactPath}/tasks/${savedTask.id}`,'PUT',{title:savedTask.title,body:savedTask.body,dueDate:savedTask.dueDate,completed:true}); report.checks.push({name:'complete_test_task',status:done.status}); }
}
await mkdir('.data',{recursive:true}); await writeFile('.data/ghl-test.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

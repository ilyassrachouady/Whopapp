import { readFile, writeFile, mkdir } from 'node:fs/promises';
const env={};
for(const line of (await readFile('.env.local','utf8')).split('\n')) {
 const match=line.match(/^([A-Z_0-9]+)=(.*)$/); if(match) env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
}
const location=env.GHL_LOCATION_ID;
const endpoints=[
 {name:'location',path:`/locations/${location}`,version:'2021-07-28'},
 {name:'pipelines',path:`/opportunities/pipelines?locationId=${location}`,version:'v3'},
 {name:'workflows',path:`/workflows/?locationId=${location}`,version:'2021-07-28'},
 {name:'customFields',path:`/locations/${location}/customFields`,version:'v3'},
 {name:'testContacts',path:`/contacts/?locationId=${location}&query=Payment%20Desk%20TEST&limit=10`,version:'v3'},
];
const result={locationId:location,checkedAt:new Date().toISOString()};
for(const endpoint of endpoints) {
 const response=await fetch(`https://services.leadconnectorhq.com${endpoint.path}`,{headers:{Authorization:`Bearer ${env.GHL_API_KEY}`,Version:endpoint.version},signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 const record={status:response.status};
 if(response.ok) {
  if(endpoint.name==='location') record.location={id:data.location?.id,name:data.location?.name};
  if(endpoint.name==='pipelines') record.pipelines=data.pipelines?.map(p=>({id:p.id,name:p.name,stages:p.stages?.map(s=>({id:s.id,name:s.name}))}));
  if(endpoint.name==='workflows') record.workflows=data.workflows?.map(w=>({id:w.id,name:w.name,status:w.status}));
  if(endpoint.name==='customFields') record.fields=data.customFields?.map(f=>({id:f.id,name:f.name,fieldKey:f.fieldKey}));
  if(endpoint.name==='testContacts') record.contacts=data.contacts?.map(c=>({id:c.id,name:c.contactName||c.name,source:c.source,dnd:c.dnd,type:c.type}));
 }
 result[endpoint.name]=record; console.log(JSON.stringify({name:endpoint.name,...record}));
}
await mkdir('.data',{recursive:true}); await writeFile('.data/ghl-recon.json',JSON.stringify(result,null,2));

import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const env={};for(const line of(await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const mapping=JSON.parse(await readFile('.data/production-plan-map.json','utf8'));
const wanted=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SCHEMA','WHOP_API_KEY','WHOP_COMPANY_ID','WHOP_WEBHOOK_SECRET','GHL_API_KEY','GHL_LOCATION_ID','GHL_API_VERSION','GHL_PAYMENT_WEBHOOK_URL','DESK_USERNAME','DESK_PASSWORD'];
const production=Object.fromEntries(wanted.map(k=>[k,env[k]]));
Object.assign(production,{WHOP_PLAN_IDS_JSON:JSON.stringify(mapping),WHOP_MODE:'real',WHOP_SANDBOX:'false',GHL_MODE:'real',GHL_WRITES_ENABLED:'true',PAYMENT_AUTOMATION_MODE:'real',PAYMENT_WORKFLOW_OWNER:'ghl',PUBLIC_DEMO:'false',PAYMENT_DESK_LOCAL_TEST:'false',SLACK_MODE:'real',APP_URL:'https://whopapp-wine.vercel.app',DESK_AUTH_MODE:'supabase',DESK_ALLOWED_EMAILS:'*'});
for(const [key,value] of Object.entries(production)){
 if(!value)throw new Error('Required production setting missing: '+key);
 await new Promise((resolve,reject)=>{const child=spawn('vercel',['env','add',key,'production','--force','--sensitive','--yes'],{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.stdin.end(value);child.on('error',reject);child.on('close',code=>{if(code)reject(new Error('Environment import failed for '+key));else{console.log(key+': saved');resolve();}});});
}

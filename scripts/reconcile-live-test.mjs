import {readFile} from 'node:fs/promises';
for(const line of (await readFile('.env.local','utf8')).split('\n')){const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
if(process.env.PAYMENT_DESK_LOCAL_TEST!=='true'||process.env.VERCEL)throw new Error('Local test only');
const receipt=JSON.parse(await readFile('.data/live-test-payment.json','utf8'));
const checkout=JSON.parse(await readFile('.data/live-test-checkout.json','utf8'));
if(receipt.checkout_configuration_id!=='ch_IDUQ73RkQzhMkRA'||receipt.metadata.checkout_session_id!==checkout.id)throw new Error('Unexpected test payment');
const {processWhopEvent}=await import('../lib/whop-events.ts');
// Recovery only: the handler retrieves and verifies the real paid receipt again.
console.log(JSON.stringify(await processWhopEvent({type:'payment.succeeded',data:{id:receipt.id}})));

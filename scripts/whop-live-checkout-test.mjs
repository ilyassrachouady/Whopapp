import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

for (const line of (await readFile('.env.local', 'utf8')).split('\n')) {
  const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
process.env.WHOP_MODE = 'real';
process.env.WHOP_SANDBOX = 'false';
// Test only checkout creation against the existing plan; never submit payment.
process.env.WHOP_PLAN_IDS_JSON = JSON.stringify({ 'coaching:pif': 'plan_81FcgzTXkkxZC' });
const { createCheckout, getWhop } = await import('../lib/whop.ts');
const { offers, prospects } = await import('../lib/config.ts');
const { calculatePlan } = await import('../lib/payments.ts');
const offer = offers.find(item => item.id === 'coaching');
const id = randomUUID();
const providerPlan = await getWhop().plans.retrieve({ id: 'plan_81FcgzTXkkxZC' });
console.log(JSON.stringify({ collect_tax: providerPlan.collect_tax, trial_period_days: providerPlan.trial_period_days }));
const checkout = await createCheckout({
  id,
  customer: { ...prospects[0], full_name: 'Payment Desk TEST' },
  offer,
  payment: calculatePlan(offer, 'pif'),
  origin: 'http://localhost:3000',
  // Deliberately omit sale/deposit classification so this connection test
  // cannot enter customer onboarding even if its link is accidentally paid.
  metadata: {
    test_mode: 'true', prospect_name: 'Payment Desk TEST — DO NOT PAY',
    ghl_contact_id: '', ghl_opportunity_id: '', closer_id: 'test', closer_name: 'TEST',
    offer_id: offer.id, offer_name: offer.name, contract_value: offer.price,
    payment_type: 'pif', call_id: 'test', trakyo_id: '', lead_source: 'API connection test',
    utm_source: '', utm_medium: '', utm_campaign: '',
  },
});
await writeFile('.data/whop-test-checkout.json', JSON.stringify({ checkedAt: new Date().toISOString(), ...checkout, paymentSubmitted: false }, null, 2));
console.log(JSON.stringify({ checkoutCreated: true, mode: checkout.mode, paymentSubmitted: false }));

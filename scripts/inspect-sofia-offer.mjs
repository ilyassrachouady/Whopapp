import { WhopClient } from '@whop/sdk';
const client = new WhopClient({token:process.env.WHOP_API_KEY,baseUrl:'https://api.whop.com/api/v1'});
const plan = await client.plans.retrieve({id:'plan_TbLp2WEa6SUvt'});
console.log(JSON.stringify(plan));

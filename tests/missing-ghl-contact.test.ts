import test from "node:test";
import assert from "node:assert/strict";
import { getContact, isMissingContactResponse } from "../lib/ghl";
test("GHL's deleted-contact 400 is recognized only on individual contact reads",()=>{
 const body={message:"Contact not found for id:deleted"};
 assert.equal(isMissingContactResponse("/contacts/deleted","GET",400,body),true);
 assert.equal(isMissingContactResponse("/contacts/deleted","GET",404,{}),true);
 assert.equal(isMissingContactResponse("/contacts/deleted","PUT",400,body),false);
 assert.equal(isMissingContactResponse("/contacts/?query=test","GET",400,body),false);
 assert.equal(isMissingContactResponse("/contacts/deleted","GET",400,{message:"Invalid API version"}),false);
 assert.equal(isMissingContactResponse("/contacts/deleted","GET",403,body),false);
});
test("deleted contacts return null while authentication failures remain visible",async()=>{
 const old=globalThis.fetch, env={...process.env};Object.assign(process.env,{GHL_MODE:"real",GHL_API_KEY:"test",GHL_LOCATION_ID:"location"});
 try{
 globalThis.fetch=async()=>Response.json({message:"Contact not found for id:deleted"},{status:400});
 assert.equal(await getContact("deleted"),null);
 globalThis.fetch=async()=>Response.json({message:"Unauthorized"},{status:401});
 await assert.rejects(getContact("deleted"),/GHL request failed \(401\)/);
 globalThis.fetch=async()=>Response.json({message:"Version invalid"},{status:400});
 await assert.rejects(getContact("deleted"),/GHL request failed \(400\)/);
 }finally{globalThis.fetch=old;process.env=env;}
});

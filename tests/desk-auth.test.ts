import {test} from "node:test";
import assert from "node:assert/strict";
import {allowedEmail} from "../lib/desk-auth";
test("desk access fails closed unless an email is listed or * is set",()=>{
 const prior=process.env.DESK_ALLOWED_EMAILS;
 try{delete process.env.DESK_ALLOWED_EMAILS;assert.equal(allowedEmail("owner@example.com"),false);
 process.env.DESK_ALLOWED_EMAILS="owner@example.com, closer@example.com";
 assert.equal(allowedEmail("OWNER@example.com"),true);assert.equal(allowedEmail("outsider@example.com"),false);assert.equal(allowedEmail(undefined),false);
 process.env.DESK_ALLOWED_EMAILS="*";
 assert.equal(allowedEmail("new-person@example.com"),true);
 assert.equal(allowedEmail("invalid"),false);assert.equal(allowedEmail(""),false);
 }finally{if(prior===undefined)delete process.env.DESK_ALLOWED_EMAILS;else process.env.DESK_ALLOWED_EMAILS=prior;}
});

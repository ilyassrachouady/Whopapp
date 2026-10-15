import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLocalTestAmount } from "../lib/test-payment-tax";
test("local test validates base price plus provider-confirmed exclusive tax", () => {
  const p = { subtotal: {currency:"usd",amount:"1.00"}, total:{currency:"usd",amount:"1.20"}, tax_amount:{currency:"usd",amount:"0.20"}, tax_behavior:"exclusive" };
  assert.equal(verifyLocalTestAmount(p,100),100);
  assert.throws(()=>verifyLocalTestAmount({...p,total:{currency:"usd",amount:"1.21"}},100));
  assert.throws(()=>verifyLocalTestAmount({...p,subtotal:{currency:"usd",amount:"2.00"}},100));
  assert.throws(()=>verifyLocalTestAmount({...p,tax_amount:{currency:"eur",amount:"0.20"}},100));
});

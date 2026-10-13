-- Synthetic demo fixtures only; no real contacts or CRM exports.
insert into prospects(id,ghl_contact_id,ghl_opportunity_id,full_name,email,phone,lead_source,trakyo_id,call_id,utm_source,utm_medium,utm_campaign) values
('john','ghl_contact_john','ghl_opp_1042','John Smith','john@example.com','+1 555 123 4567','Instagram','trk_js_8391','call_1042','instagram','paid_social','coaching_october'),
('emma','ghl_contact_emma','ghl_opp_1043','Emma Wilson','emma@example.com','+1 555 234 5678','Referral','trk_ew_8392','call_1043','referral','organic','client_referral'),
('alex','ghl_contact_alex','ghl_opp_1044','Alex Morgan','alex@example.com','+1 555 345 6789','YouTube','trk_am_8393','call_1044','youtube','organic','coaching_october') on conflict(id) do nothing;
insert into closers(id,name,email) values('lewis','Lewis Kirby','lewis@example.com'),('sofia','Sofia','sofia@example.com'),('other','Other closer','sales@example.com') on conflict(id) do nothing;
insert into offers(id,name,slug,price) values('coaching','Coaching Program','coaching-program',199700),('sofia','Sofia 1:1','sofia-1-on-1',499700) on conflict(id) do nothing;

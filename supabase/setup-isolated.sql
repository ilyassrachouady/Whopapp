-- Isolated Payment Desk schema in a shared Supabase project. Run once.
begin;
create schema payment_desk;
set local search_path=payment_desk,public;

-- All monetary amounts are integer USD cents. Browser clients have no database access.
create table prospects (
 id text primary key, ghl_contact_id text unique not null, ghl_opportunity_id text,
 full_name text not null, email text not null, phone text, lead_source text,
 trakyo_id text, call_id text, utm_source text, utm_medium text, utm_campaign text,
 created_at timestamptz not null default now()
);
create table closers (id text primary key, name text not null, email text not null, ghl_user_id text, created_at timestamptz not null default now());
create table offers (id text primary key, name text not null, slug text unique not null, price bigint not null check(price>0), active boolean not null default true, created_at timestamptz not null default now());
create table checkout_sessions (
 id uuid primary key, prospect_id text not null references prospects(id), closer_id text not null references closers(id), offer_id text not null references offers(id),
 contract_value bigint not null check(contract_value>0), payment_type text not null check(payment_type in ('pif','two','three','custom')),
 amount_due_today bigint not null check(amount_due_today>0 and amount_due_today<=contract_value), payment_count integer not null check(payment_count between 1 and 25),
 whop_checkout_id text unique not null, checkout_url text not null, call_id text, trakyo_id text,
 status text not null default 'created' check(status in ('created','paid','partially_paid')),
 metadata jsonb not null, plan jsonb not null, mode text not null check(mode in ('mock','sandbox','live')), created_at timestamptz not null default now()
);
create table payments (
 id uuid primary key default gen_random_uuid(), checkout_session_id uuid not null references checkout_sessions(id), whop_payment_id text unique not null,
 amount_collected bigint not null check(amount_collected>0), contract_value bigint not null,
 payment_status text not null default 'succeeded', is_pif boolean not null default false,
 paid_at timestamptz, created_at timestamptz not null default now()
);
create index checkout_sessions_closer_date on checkout_sessions(closer_id,created_at);
create index checkout_sessions_call on checkout_sessions(call_id);
create index payments_checkout on payments(checkout_session_id);
alter table prospects enable row level security;
alter table closers enable row level security;
alter table offers enable row level security;
alter table checkout_sessions enable row level security;
alter table payments enable row level security;
-- Atomic, replay-safe payment recording; is_pif measures a single full payment, not eventual installments.
create function record_payment(session_id uuid,payment_id text,collected bigint) returns jsonb
language plpgsql security definer set search_path=payment_desk,pg_catalog as $$
declare s checkout_sessions; total bigint;
begin
 select * into strict s from checkout_sessions where id=session_id for update;
 if collected<=0 then raise exception 'Invalid amount'; end if;
 insert into payments(checkout_session_id,whop_payment_id,amount_collected,contract_value,is_pif,paid_at)
 values(session_id,payment_id,collected,s.contract_value,s.payment_type='pif' and collected=s.contract_value,now())
 on conflict(whop_payment_id) do nothing;
 select coalesce(sum(amount_collected),0) into total from payments where checkout_session_id=session_id and payment_status='succeeded';
 update checkout_sessions set status=case when total>=contract_value then 'paid' else 'partially_paid' end where id=session_id;
 return jsonb_build_object('cash_collected',total,'contract_value',s.contract_value);
end $$;
revoke all on function record_payment(uuid,text,bigint) from public,anon,authenticated;
grant execute on function record_payment(uuid,text,bigint) to service_role;


-- One completed report per call; retrying completion never creates a second record.
alter table prospects add column appointment_id text;
update prospects set appointment_id = 'appt_' || split_part(call_id, '_', 2) where call_id is not null;
create table call_records (
 id uuid primary key,
 prospect_id text not null references prospects(id), prospect_name text not null,
 ghl_contact_id text not null, ghl_opportunity_id text,
 closer_id text not null references closers(id), closer_name text not null,
 call_id text not null unique, appointment_id text not null,
 lead_source text, trakyo_id text, utm_source text, utm_medium text, utm_campaign text,
 call_outcome text not null check (call_outcome in ('sold','follow_up','no_sale','no_show','unqualified')),
 notes text not null default '',
 checkout_session_id uuid references checkout_sessions(id), offer_id text references offers(id), offer_name text,
 contract_value bigint, payment_type text, amount_due_today bigint, checkout_url text, whop_checkout_id text,
 follow_up_date date, follow_up_time time, follow_up_at timestamptz, time_zone text, follow_up_reason text, next_step text,
 loss_reason text, reschedule_needed boolean,
 sync_status text not null default 'pending' check (sync_status in ('pending','synced','failed')),
 mode text not null default 'mock' check (mode in ('mock','live')),
 created_at timestamptz not null default now(),
 check (call_outcome <> 'sold' or (checkout_session_id is not null and offer_id is not null and contract_value > 0 and amount_due_today > 0)),
 check (call_outcome <> 'follow_up' or (follow_up_date is not null and follow_up_time is not null and follow_up_at is not null and time_zone is not null and follow_up_reason is not null and next_step is not null)),
 check (call_outcome not in ('no_sale','unqualified') or loss_reason is not null),
 check (call_outcome <> 'no_show' or (reschedule_needed is not null and (not reschedule_needed or (follow_up_at is not null and follow_up_date is not null and follow_up_time is not null and time_zone is not null))))
);
alter table call_records enable row level security;
create index call_records_closer_date on call_records(closer_id,created_at);
create index call_records_pending on call_records(sync_status) where sync_status='pending';


-- Replays may never reassign an existing payment ID to a different checkout.
create or replace function record_payment(session_id uuid,payment_id text,collected bigint) returns jsonb
language plpgsql security definer set search_path=payment_desk,pg_catalog as $$
declare s checkout_sessions; total bigint; duplicate boolean;
begin
 select * into strict s from checkout_sessions where id=session_id for update;
 if collected<=0 then raise exception 'Invalid amount'; end if;
 if exists(select 1 from payments where whop_payment_id=payment_id and checkout_session_id<>session_id) then raise exception 'Payment belongs to a different checkout'; end if;
 duplicate := exists(select 1 from payments where whop_payment_id=payment_id);
 insert into payments(checkout_session_id,whop_payment_id,amount_collected,contract_value,is_pif,paid_at)
 values(session_id,payment_id,collected,s.contract_value,s.payment_type='pif' and collected=s.contract_value,now()) on conflict(whop_payment_id) do nothing;
 select coalesce(sum(amount_collected),0) into total from payments where checkout_session_id=session_id and payment_status='succeeded';
 update checkout_sessions set status=case when total>=contract_value then 'paid' else 'partially_paid' end where id=session_id;
 return jsonb_build_object('cash_collected',total,'contract_value',s.contract_value,'duplicate',duplicate);
end $$;
revoke all on function record_payment(uuid,text,bigint) from public,anon,authenticated;
grant execute on function record_payment(uuid,text,bigint) to service_role;


-- Synthetic demo fixtures only; no real contacts or CRM exports.
insert into prospects(id,ghl_contact_id,ghl_opportunity_id,full_name,email,phone,lead_source,trakyo_id,call_id,utm_source,utm_medium,utm_campaign) values
('john','ghl_contact_john','ghl_opp_1042','John Smith','john@example.com','+1 555 123 4567','Instagram','trk_js_8391','call_1042','instagram','paid_social','coaching_october'),
('emma','ghl_contact_emma','ghl_opp_1043','Emma Wilson','emma@example.com','+1 555 234 5678','Referral','trk_ew_8392','call_1043','referral','organic','client_referral'),
('alex','ghl_contact_alex','ghl_opp_1044','Alex Morgan','alex@example.com','+1 555 345 6789','YouTube','trk_am_8393','call_1044','youtube','organic','coaching_october') on conflict(id) do nothing;
insert into closers(id,name,email) values('lewis','Lewis Kirby','lewis@example.com'),('sofia','Sofia','sofia@example.com'),('other','Other closer','sales@example.com') on conflict(id) do nothing;
insert into offers(id,name,slug,price) values('coaching','Coaching Program','coaching-program',199700),('sofia','Sofia 1:1','sofia-1-on-1',499700) on conflict(id) do nothing;

update prospects set appointment_id='appt_' || split_part(call_id,'_',2) where appointment_id is null;
grant usage on schema payment_desk to service_role;
grant all on all tables in schema payment_desk to service_role;
grant all on all sequences in schema payment_desk to service_role;
revoke all on schema payment_desk from public,anon,authenticated;
commit;

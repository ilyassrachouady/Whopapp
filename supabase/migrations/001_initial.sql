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
 metadata jsonb not null, plan jsonb not null, mode text not null check(mode in ('mock','live')), created_at timestamptz not null default now()
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
language plpgsql security definer set search_path=public as $$
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

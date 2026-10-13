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

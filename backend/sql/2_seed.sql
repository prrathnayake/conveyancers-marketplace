-- Minimal seed for local dev
insert into users(id, role, email, state, kyc_status) values
  ('00000000-0000-0000-0000-000000000001','customer','alice@example.com','VIC','verified')
on conflict do nothing;
insert into users(id, role, email, state, kyc_status) values
  ('00000000-0000-0000-0000-000000000002','conveyancer','cora@example.com','VIC','verified')
on conflict do nothing;
insert into conveyancer_profiles(user_id, licence_number, licence_state, verified, hourly_rate, fixed_fee_options, specialties, years_experience)
values ('00000000-0000-0000-0000-000000000002','LIC12345','VIC',true,180,'["Contract review","Full conveyance"]','{residential,commercial}',7)
on conflict do nothing;

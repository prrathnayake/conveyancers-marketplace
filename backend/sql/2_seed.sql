-- Minimal seed for local dev
insert into users(id, role, email, state, kyc_status) values
  ('00000000-0000-0000-0000-0000000000ad','admin','admin@example.com',null,'verified')
on conflict do nothing;

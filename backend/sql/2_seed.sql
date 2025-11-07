-- Minimal seed for local dev
insert into users(id, role, email, full_name, phone, state, suburb, kyc_status) values
  ('00000000-0000-0000-0000-0000000000ad','admin','admin@example.com','System Administrator','+61 400 000 100','NSW','Sydney CBD','verified'),
  ('11111111-1111-1111-1111-111111111111','conveyancer','sophia.nguyen@harboursolicitors.com','Sophia Nguyen','+61 452 110 812','NSW','Parramatta','verified'),
  ('22222222-2222-2222-2222-222222222222','conveyancer','jackson.reid@outbackpropertylaw.com','Jackson Reid','+61 431 882 044','QLD','Newstead','verified'),
  ('33333333-3333-3333-3333-333333333333','customer','amelia.walsh@example.com','Amelia Walsh','+61 410 335 778','VIC','Carlton','verified'),
  ('44444444-4444-4444-4444-444444444444','customer','liam.francis@example.com','Liam Francis','+61 424 118 903','WA','Fremantle','verified')
on conflict do nothing;

insert into auth_credentials(user_id, password_hash, password_salt, two_factor_secret) values
  ('00000000-0000-0000-0000-0000000000ad','ae64d9d8467b8f198195babb842dcb10fda5f183bcf6c876f472fe4b7f199804','2f9c3d34a0b14c1c8f2a8f534271b6ff','ADMIN-OTP-DEV'),
  ('11111111-1111-1111-1111-111111111111','5ebeb0b2c84455e7b2f9f9b1283c6ab34a1062e8b00569cb3ece7839527d67f5','f1c9d2a4e5b64783819a3c2d4e5f6071','SOPHIA-OTP-01'),
  ('22222222-2222-2222-2222-222222222222','a369f3005f03b1a904a563c9998ec423b3cc4144da1c15d14a110ba0f0659cf6','a7c4b9d2e1f3456789abcdeffedcba65','JACKSON-OTP-02'),
  ('33333333-3333-3333-3333-333333333333','6eff6e0b09837b7a924f2f8e812fd6c06284e2810c8762c496c466eae94c7d0c','9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',null),
  ('44444444-4444-4444-4444-444444444444','f5fd66b8cbe5879a33425447f816bde1def6cbdd6b3f3b67659f4776fc94ec1c','8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f',null)
on conflict do nothing;

insert into conveyancer_profiles(user_id, licence_number, licence_state, verified, hourly_rate, fixed_fee_options,
                                 specialties, services, years_experience, insurance_policy, insurance_expiry, bio)
values
  ('11111111-1111-1111-1111-111111111111','LIC-NSW-88321','NSW',true,32000,
   '[{"label":"Pre-purchase contract review","amount":66000},{"label":"Off-the-plan settlement support","amount":145000}]'::jsonb,
   '["refinance","residential","apartment"]'::jsonb,'["contract_review","settlement","lender_liaison"]'::jsonb,9,
   'CGU-PL-4492','2025-09-30','Focuses on refinance matters for Sydney CBD apartments and collaborates with the major banks.'),
  ('22222222-2222-2222-2222-222222222222','LIC-QLD-44790','QLD',true,29500,
   '[{"label":"House and land conveyance","amount":99000},{"label":"Title transfer","amount":44000}]'::jsonb,
   '["residential","house_and_land","regional"]'::jsonb,'["due_diligence","settlement","council_liaison"]'::jsonb,12,
   'AIG-LEG-2198','2026-02-28','Handles coastal QLD transactions with experience managing FIRB clearances and trust releases.')
on conflict do nothing;

insert into job_templates(id, name, jurisdiction, description, integration_url, latest_version)
values
  ('00000000-0000-0000-0000-0000000000aa','Standard Refinance','NSW',
   'Baseline refinance workflow with lender portal integration','https://lenders.example.com/api/templates/refinance',1),
  ('55555555-aaaa-bbbb-cccc-555555555555','Residential Purchase','VIC',
   'Full purchase file with contract reviews and finance approval tracking','https://catalogue.convey-safe.io/templates/residential_purchase',2),
  ('66666666-bbbb-cccc-dddd-666666666666','Commercial Sale','QLD',
   'Sale of freehold commercial assets including trust accounting steps','https://catalogue.convey-safe.io/templates/commercial_sale',3)
on conflict do nothing;

insert into job_template_versions(template_id, version, payload, source)
select id, 1,
       '{"tasks":[{"name":"Collect borrower documents","dueDays":3,"assignedRole":"conveyancer"},
                  {"name":"Submit lender package","dueDays":7,"assignedRole":"lender"}],
         "syncMetadata":{"mode":"seed"}}'::jsonb,
       '{"type":"seed"}'::jsonb
from job_templates where id='00000000-0000-0000-0000-0000000000aa'
on conflict do nothing;

insert into job_template_versions(template_id, version, payload, source) values
  ('55555555-aaaa-bbbb-cccc-555555555555', 2,
   '{"tasks":[
        {"name":"Initial contract review","dueDays":2,"assignedRole":"conveyancer"},
        {"name":"Finance approval follow-up","dueDays":10,"assignedRole":"finance_broker"},
        {"name":"Schedule settlement","dueDays":21,"assignedRole":"settlements"}
      ],
     "syncMetadata":{"mode":"seed","source":"templates-api"}}'::jsonb,
   '{"type":"seed","origin":"residential_portal"}'::jsonb),
  ('66666666-bbbb-cccc-dddd-666666666666', 3,
   '{"tasks":[
        {"name":"Issue section 32 vendor statement","dueDays":5,"assignedRole":"vendor_team"},
        {"name":"Trust reconcile","dueDays":12,"assignedRole":"trust_accountant"},
        {"name":"Attend settlement","dueDays":28,"assignedRole":"principal"}
      ],
     "requiresTrustAccounting":true}'::jsonb,
   '{"type":"seed","origin":"commercial_ops"}'::jsonb
on conflict do nothing;

insert into jobs(id, customer_id, conveyancer_id, state, property_type, status)
values
  ('77777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',
   'NSW','apartment','in_progress')
on conflict do nothing;

insert into milestones(id, job_id, name, amount_cents, due_date, status)
values
  ('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777','Settlement funds',12500000,'2024-12-12','pending')
on conflict do nothing;

insert into escrow_payments(id, job_id, milestone_id, amount_authorised_cents, amount_held_cents, amount_released_cents,
                            provider_ref, status)
values
  ('99999999-9999-9999-9999-999999999999','77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888',
   12500000,12500000,0,'mock-escrow-ref-001','funded')
on conflict do nothing;

insert into documents(id, job_id, doc_type, url, checksum, uploaded_by, version)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','77777777-7777-7777-7777-777777777777','contract',
   'https://storage.dev.conveyancers-marketplace.com/docs/CONTRACT-2024-NSW.pdf',
   'sha256:demo-contract','11111111-1111-1111-1111-111111111111',1)
on conflict do nothing;

insert into messages(id, job_id, from_user, content, attachments)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111',
   'Finance approval received from ANZ, preparing settlement adjustments now.',
   '[{"type":"note","text":"Broker ETA 18/12"}]'::jsonb)
on conflict do nothing;

-- Minimal seed for local dev
insert into users(id, role, email, state, kyc_status) values
  ('00000000-0000-0000-0000-0000000000ad','admin','admin@example.com',null,'verified')
on conflict do nothing;

insert into job_templates(id, name, jurisdiction, description, integration_url, latest_version)
values
  ('00000000-0000-0000-0000-0000000000aa','Standard Refinance','NSW',
   'Baseline refinance workflow with lender portal integration','https://lenders.example.com/api/templates/refinance',1)
on conflict do nothing;

insert into job_template_versions(template_id, version, payload, source)
select id, 1,
       '{"tasks":[{"name":"Collect borrower documents","dueDays":3,"assignedRole":"conveyancer"},
                  {"name":"Submit lender package","dueDays":7,"assignedRole":"lender"}],
         "syncMetadata":{"mode":"seed"}}'::jsonb,
       '{"type":"seed"}'::jsonb
from job_templates where id='00000000-0000-0000-0000-0000000000aa'
on conflict do nothing;

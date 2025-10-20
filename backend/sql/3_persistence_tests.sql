-- Smoke tests for persistence schema
select 'users_has_full_name' as check_name,
       (select count(*) from information_schema.columns where table_name = 'users' and column_name = 'full_name') as column_count;
select 'auth_credentials_exists' as check_name,
       (select count(*) from information_schema.tables where table_name = 'auth_credentials') as table_count;
select 'conveyancer_profiles_services_jsonb' as check_name,
       (select data_type from information_schema.columns where table_name = 'conveyancer_profiles' and column_name = 'services') as data_type;

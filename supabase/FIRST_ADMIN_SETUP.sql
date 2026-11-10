-- Run this once in Supabase SQL Editor AFTER you have signed up
-- on the live Rugvaya website and confirmed your email.
--
-- Replace the email below with the exact email used for your Rugvaya account.
-- Only someone with Supabase project SQL Editor access can run this statement.

update public.profiles as p
set role = 'admin'
from auth.users as u
where u.id = p.id
  and lower(u.email) = lower('YOUR_SIGNUP_EMAIL@example.com');

-- Verify: this should return exactly one row with role = admin.
select id, email, full_name, role
from public.profiles
where lower(email) = lower('YOUR_SIGNUP_EMAIL@example.com');

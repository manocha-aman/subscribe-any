-- Seed data for development/testing
-- Note: This requires a test user to be created first via Supabase Auth

-- Example subscriptions (replace user_id with actual test user ID)
-- insert into public.subscriptions (user_id, product_name, product_url, retailer, price, frequency_days, last_ordered_at, next_reminder_at)
-- values
--   ('YOUR_TEST_USER_ID', 'Purina Pro Plan Dog Food', 'https://amazon.com/dp/B001VJ0B0I', 'Amazon', 59.99, 30, now() - interval '25 days', now() + interval '5 days'),
--   ('YOUR_TEST_USER_ID', 'Pampers Diapers Size 4', 'https://walmart.com/ip/123456', 'Walmart', 44.97, 14, now() - interval '10 days', now() + interval '4 days'),
--   ('YOUR_TEST_USER_ID', 'Vitamin D3 Supplements', 'https://amazon.com/dp/B00GB85JR4', 'Amazon', 18.99, 90, now() - interval '85 days', now() + interval '5 days'),
--   ('YOUR_TEST_USER_ID', 'Coffee Beans 2lb Bag', 'https://target.com/p/123', 'Target', 24.99, 21, now() - interval '20 days', now() + interval '1 day'),
--   ('YOUR_TEST_USER_ID', 'Cat Litter 40lb', 'https://chewy.com/product/123', 'Chewy', 32.50, 30, now() - interval '28 days', now() + interval '2 days');

-- To use this seed file:
-- 1. Create a test user in Supabase Auth
-- 2. Replace 'YOUR_TEST_USER_ID' with the actual user ID
-- 3. Uncomment the insert statements
-- 4. Run: supabase db reset (this will apply migrations and seed)

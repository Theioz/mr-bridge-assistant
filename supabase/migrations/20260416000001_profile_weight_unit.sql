-- Issue #249: add `weight_unit` profile key for each existing user (default "lb"
-- to match the existing `weight_goal_lbs` convention). Users can change it to
-- "kg" via the profile upsert path; strength_session_sets always stores kg canonically.

insert into profile (user_id, key, value)
select id, 'weight_unit', 'lb'
from auth.users
on conflict (user_id, key) do nothing;

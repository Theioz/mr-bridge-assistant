-- timer_state table was never written to by the agent (runtime state lives in
-- profile key='timer_state'). Drop the unused table and its associated RLS policies
-- (policies are dropped automatically with the table).
drop table if exists timer_state;

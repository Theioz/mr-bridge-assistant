-- Prevent duplicate study log entries for the same date + subject.
-- Without this constraint, weekly review duration totals can be inflated
-- if the same session is logged more than once.
alter table study_log add constraint study_log_date_subject_unique unique (date, subject);

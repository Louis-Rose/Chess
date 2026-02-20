-- Migration: Rename minutes -> seconds columns and convert existing data
-- Run on PostgreSQL production BEFORE deploying the new code
-- Existing values (in minutes) are multiplied by 60 to convert to seconds

BEGIN;

ALTER TABLE user_activity RENAME COLUMN minutes TO seconds;
UPDATE user_activity SET seconds = seconds * 60;

ALTER TABLE page_activity RENAME COLUMN minutes TO seconds;
UPDATE page_activity SET seconds = seconds * 60;

ALTER TABLE device_usage RENAME COLUMN minutes TO seconds;
UPDATE device_usage SET seconds = seconds * 60;

COMMIT;

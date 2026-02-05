-- Add unique constraint for cron_job_id to prevent duplicate syncs
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_cron_job_unique 
  ON tasks(cron_job_id) 
  WHERE cron_job_id IS NOT NULL;

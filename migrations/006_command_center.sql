-- Command Center Tables

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'backlog', -- recurring|backlog|progress|done
  priority VARCHAR(10) DEFAULT 'medium', -- low|medium|high|urgent
  assigned_to VARCHAR(50), -- agent_id
  project_id INTEGER,
  cron_job_id VARCHAR(50),
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at DESC);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code VARCHAR(20) UNIQUE,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active', -- active|paused|completed|archived
  owner_agent_id VARCHAR(50),
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_agent_id);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- task|commit|message|project|agent|system
  agent_id VARCHAR(50),
  project_id INTEGER,
  task_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at DESC);

-- Agent status (cached from sessions)
CREATE TABLE IF NOT EXISTS agent_status (
  agent_id VARCHAR(50) PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  role TEXT,
  department TEXT,
  location VARCHAR(20), -- mac-studio|luna-labs|standby
  status VARCHAR(20) DEFAULT 'idle', -- active|idle|busy|offline
  last_activity_at TIMESTAMPTZ,
  current_task_id INTEGER,
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_location ON agent_status(location);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agent_status_updated_at BEFORE UPDATE ON agent_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

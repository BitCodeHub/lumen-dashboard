-- Seed agents for Command Center
INSERT INTO agent_status (agent_id, name, emoji, role, department, location, status) VALUES
  ('main', 'Unc Lumen', '💎', 'CTO', 'Executive', 'mac-studio', 'active'),
  ('luna', 'Luna', '🌙', 'Chief of Staff', 'Executive', 'mac-studio', 'idle'),
  ('maven', 'Maven', '📋', 'Chief Product Officer', 'Executive', 'mac-studio', 'idle'),
  ('lumi', 'Lumi', '🌸', 'Personal Assistant', 'Executive', 'mac-studio', 'idle'),
  ('harper', 'Harper', '👔', 'HR Director', 'HR', 'mac-studio', 'idle'),
  ('reese', 'Reese', '🔬', 'Research Director', 'Research', 'mac-studio', 'idle'),
  ('finley', 'Finley', '💰', 'Finance Director', 'Finance', 'mac-studio', 'idle'),
  ('ethan', 'Ethan', '⚙️', 'Engineering Director', 'Engineering', 'mac-studio', 'idle'),
  ('morgan', 'Morgan', '📣', 'Marketing Director', 'Marketing', 'mac-studio', 'idle'),
  ('devon', 'Devon', '🔧', 'DevOps Director', 'DevOps', 'mac-studio', 'idle'),
  ('sam', 'Sam', '🤝', 'Partnerships Director', 'Partnerships', 'mac-studio', 'idle'),
  ('riley', 'Riley', '🔍', 'QA Director', 'QA', 'mac-studio', 'idle'),
  ('casey', 'Casey', '🛡️', 'Security Director', 'Security', 'mac-studio', 'idle'),
  ('avery', 'Avery', '✅', 'QA Lead', 'QA', 'mac-studio', 'idle'),
  ('parker', 'Parker', '📦', 'Release Manager', 'DevOps', 'mac-studio', 'idle'),
  ('dana', 'Dana', '🎨', 'Design Director', 'Design', 'mac-studio', 'idle'),
  ('dakota', 'Dakota', '📊', 'Analytics Director', 'Analytics', 'mac-studio', 'idle')
ON CONFLICT (agent_id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  role = EXCLUDED.role,
  department = EXCLUDED.department,
  location = EXCLUDED.location,
  status = EXCLUDED.status,
  updated_at = NOW();

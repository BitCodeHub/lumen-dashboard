-- AI Ideas Table Migration
-- Tracks product ideas, their status, and progress through the pipeline

CREATE TABLE IF NOT EXISTS ai_ideas (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'idea',  -- idea, researching, validated, building, shipped, archived
  priority INTEGER DEFAULT 5,          -- 1-10, higher = more important
  category VARCHAR(100),               -- product, feature, integration, automation, research
  revenue_potential VARCHAR(50),       -- low, medium, high, very_high
  build_time VARCHAR(50),              -- hours, days, weeks, months
  owner VARCHAR(100),                  -- agent or person responsible
  created_by VARCHAR(100),             -- who submitted the idea
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for status queries (used by company status dashboard)
CREATE INDEX IF NOT EXISTS idx_ai_ideas_status ON ai_ideas(status);
CREATE INDEX IF NOT EXISTS idx_ai_ideas_priority ON ai_ideas(priority DESC);

-- Seed some initial ideas from our roadmap
INSERT INTO ai_ideas (name, description, status, priority, category, revenue_potential, build_time, owner) VALUES
  ('StackAudit Pro', 'AI-powered code audit platform with security scanning', 'building', 9, 'product', 'high', 'weeks', 'Maven'),
  ('MCPHub Marketplace', 'MCP server discovery and deployment platform', 'building', 8, 'product', 'high', 'weeks', 'Maven'),
  ('AIKeyVault', 'Secure API key management for AI services', 'validated', 7, 'product', 'medium', 'days', 'Ethan'),
  ('Agent Army Expansion', 'Scale to 100 specialized AI agents', 'researching', 6, 'feature', 'medium', 'weeks', 'Lumen'),
  ('Voice Clone Integration', 'Full ElevenLabs voice synthesis for agents', 'researching', 5, 'feature', 'low', 'days', 'Ethan')
ON CONFLICT DO NOTHING;

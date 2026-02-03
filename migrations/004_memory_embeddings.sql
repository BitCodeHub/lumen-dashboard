-- Memory Embeddings Table for Digital Clone System
-- Created: 2026-02-02
-- Purpose: Store vector embeddings of all interactions for semantic search

-- Install pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Memory embeddings table
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- 'conversation', 'decision', 'correction', 'preference'
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  metadata JSONB,
  file_path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_embeddings(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_memory_content_type ON memory_embeddings(content_type);
CREATE INDEX IF NOT EXISTS idx_memory_metadata ON memory_embeddings USING gin(metadata);

-- Vector similarity index (cosine distance)
-- Note: This requires pgvector extension
-- If pgvector not available, we'll use alternative search
CREATE INDEX IF NOT EXISTS idx_memory_embedding 
  ON memory_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function to search similar memories
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id int,
  ts timestamp,
  content_type varchar,
  content text,
  similarity float,
  metadata jsonb,
  file_path text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    memory_embeddings.id,
    memory_embeddings.timestamp AS ts,
    memory_embeddings.content_type,
    memory_embeddings.content,
    1 - (memory_embeddings.embedding <=> query_embedding) as similarity,
    memory_embeddings.metadata,
    memory_embeddings.file_path
  FROM memory_embeddings
  WHERE 1 - (memory_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY memory_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Memory stats view
CREATE OR REPLACE VIEW memory_stats AS
SELECT
  content_type,
  COUNT(*) as count,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM memory_embeddings
GROUP BY content_type;

COMMENT ON TABLE memory_embeddings IS 'Stores vector embeddings of all Jimmy interactions for semantic memory recall';
COMMENT ON FUNCTION search_memories IS 'Semantic search function - finds similar memories by vector similarity';

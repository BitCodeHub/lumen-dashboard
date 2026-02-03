/**
 * Memory System - Digital Clone Architecture
 * 
 * Features:
 * - Vector embeddings storage (PostgreSQL + pgvector)
 * - Semantic search (find similar past interactions)
 * - Auto-indexing of memory files
 * - Memory recall API
 * 
 * Created: 2026-02-02
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// OpenAI/Azure OpenAI configuration
const useAzure = !!process.env.AZURE_OPENAI_API_KEY;
const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://lumen-llm-services.openai.azure.com';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'text-embedding-3-small';

/**
 * Generate embedding for text using OpenAI or Azure OpenAI
 */
async function generateEmbedding(text) {
  console.log('[generateEmbedding] Start, text length:', text?.length, 'useAzure:', useAzure);
  
  if (!apiKey) {
    throw new Error('AZURE_OPENAI_API_KEY or OPENAI_API_KEY not set - cannot generate embeddings');
  }

  let url, headers, body;

  if (useAzure) {
    // Azure OpenAI format
    url = `${azureEndpoint}/openai/deployments/${azureDeployment}/embeddings?api-version=2024-02-01`;
    headers = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      input: text,
    });
  } else {
    // Standard OpenAI format
    url = 'https://api.openai.com/v1/embeddings';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
  }

  console.log('[generateEmbedding] Fetching from:', url);
  const startFetch = Date.now();
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  
  console.log('[generateEmbedding] Response received in', Date.now() - startFetch, 'ms, status:', response.status);

  if (!response.ok) {
    const error = await response.text();
    console.error('[generateEmbedding] API error:', error);
    throw new Error(`${useAzure ? 'Azure OpenAI' : 'OpenAI'} API error: ${error}`);
  }

  const data = await response.json();
  console.log('[generateEmbedding] Embedding received, length:', data.data[0].embedding.length);
  return data.data[0].embedding;
}

/**
 * Store memory with embedding
 */
async function storeMemory(timestamp, contentType, content, metadata = {}, filePath = null, embedding = null) {
  const client = await pool.connect();
  try {
    // Generate embedding if not provided
    console.log('[storeMemory] Input:', { timestamp, contentType, contentLength: content?.length, hasEmbedding: !!embedding });
    const embeddingData = embedding || await generateEmbedding(content);
    console.log('[storeMemory] Embedding data length:', embeddingData?.length);

    // Store in database
    console.log('[storeMemory] Executing query...');
    // Convert embedding array to PostgreSQL vector format: '[0.1, 0.2, ...]'
    const vectorString = `[${embeddingData.join(',')}]`;
    
    const result = await client.query(
      `INSERT INTO memory_embeddings 
       (ts, content_type, content, embedding, metadata, file_path)
       VALUES ($1, $2, $3, $4::vector, $5, $6)
       RETURNING id`,
      [timestamp, contentType, content, vectorString, JSON.stringify(metadata), filePath]
    );

    console.log('[storeMemory] Query result:', result.rows[0]);
    return result.rows[0].id;
  } catch (err) {
    console.error('[storeMemory] Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Search memories by semantic similarity
 */
async function searchMemories(query, matchThreshold = 0.7, matchCount = 10) {
  console.log('[searchMemories] Start:', { query, matchThreshold, matchCount });
  const client = await pool.connect();
  try {
    // Generate query embedding
    console.log('[searchMemories] Generating embedding for query...');
    const startEmbed = Date.now();
    const queryEmbedding = await generateEmbedding(query);
    console.log('[searchMemories] Embedding generated in', Date.now() - startEmbed, 'ms');

    // Search using vector similarity
    console.log('[searchMemories] Executing database query...');
    const startQuery = Date.now();
    // Convert embedding array to PostgreSQL vector format: '[0.1, 0.2, ...]'
    const vectorString = `[${queryEmbedding.join(',')}]`;
    
    const result = await client.query(
      `SELECT * FROM search_memories($1::vector, $2, $3)`,
      [vectorString, matchThreshold, matchCount]
    );
    console.log('[searchMemories] Query completed in', Date.now() - startQuery, 'ms, rows:', result.rows.length);

    return result.rows;
  } catch (err) {
    console.error('[searchMemories] Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Index all memory files (scan /clawd/memory/)
 */
async function indexMemoryFiles(memoryDir = '/Users/jimmysmacstudio/clawd/memory') {
  console.log(`Indexing memory files in ${memoryDir}...`);

  const indexed = [];
  const errors = [];

  // Recursively find all .md files
  async function scanDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          // Read file content
          const content = await fs.readFile(fullPath, 'utf-8');

          // Extract metadata from filename/path
          const relativePath = path.relative(memoryDir, fullPath);
          const filename = path.basename(fullPath, '.md');

          // Determine content type from path
          let contentType = 'conversation';
          if (relativePath.includes('interactions/')) {
            contentType = 'conversation';
          } else if (relativePath.includes('patterns/')) {
            contentType = 'pattern';
          } else if (filename.includes('IDENTITY') || filename.includes('PREFERENCES')) {
            contentType = 'preference';
          }

          // Parse date from filename if available (YYYY-MM-DD format)
          const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
          const timestamp = dateMatch ? new Date(dateMatch[1]) : new Date();

          // Check if already indexed
          const client = await pool.connect();
          const existing = await client.query(
            'SELECT id FROM memory_embeddings WHERE file_path = $1',
            [relativePath]
          );
          client.release();

          if (existing.rows.length === 0) {
            // Store memory
            const id = await storeMemory(
              timestamp,
              contentType,
              content,
              { filename, relativePath },
              relativePath
            );

            indexed.push({ id, path: relativePath });
            console.log(`✓ Indexed: ${relativePath}`);
          } else {
            console.log(`⊘ Skipped (exists): ${relativePath}`);
          }
        } catch (err) {
          errors.push({ path: fullPath, error: err.message });
          console.error(`✗ Error indexing ${fullPath}: ${err.message}`);
        }
      }
    }
  }

  await scanDirectory(memoryDir);

  return { indexed, errors };
}

/**
 * Recall relevant memories before responding
 * (This is what makes us never forget)
 */
async function recallContext(query, options = {}) {
  const {
    matchThreshold = 0.7,
    matchCount = 5,
    contentTypes = null, // Filter by content type
  } = options;

  try {
    let memories = await searchMemories(query, matchThreshold, matchCount);

    // Filter by content type if specified
    if (contentTypes) {
      memories = memories.filter(m => contentTypes.includes(m.content_type));
    }

    // Format for easy reading
    return memories.map(m => ({
      timestamp: m.ts,
      type: m.content_type,
      content: m.content.substring(0, 500), // First 500 chars
      similarity: m.similarity,
      source: m.file_path,
    }));
  } catch (err) {
    console.error('Memory recall error:', err);
    return [];
  }
}

/**
 * Get memory statistics
 */
async function getMemoryStats() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM memory_stats');
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Run database migration
 */
async function runMigration() {
  const client = await pool.connect();
  try {
    // Inline SQL migration (to avoid file path issues on deployment)
    const migrationSQL = `
      -- Install pgvector extension if not exists
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Memory embeddings table
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMP NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        file_path TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Indexes for fast retrieval
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_embeddings(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_content_type ON memory_embeddings(content_type);
      CREATE INDEX IF NOT EXISTS idx_memory_metadata ON memory_embeddings USING gin(metadata);

      -- Vector similarity index (cosine distance)
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
          memory_embeddings.ts,
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
        MIN(ts) as earliest,
        MAX(ts) as latest
      FROM memory_embeddings
      GROUP BY content_type;
    `;

    console.log('Running memory embeddings migration...');
    await client.query(migrationSQL);
    console.log('✓ Migration complete');

    return true;
  } catch (err) {
    console.error('Migration error:', err.message);
    // Check if it's just because pgvector isn't available
    if (err.message.includes('extension "vector" is not available')) {
      console.warn('⚠ pgvector extension not available - semantic search will be limited');
      console.warn('You can still use exact text search, but vector similarity will not work');
      return false;
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Clear all memories (for re-indexing)
 */
async function clearAllMemories() {
  const client = await pool.connect();
  try {
    console.log('[clearAllMemories] Deleting all rows from memory_embeddings...');
    const result = await client.query('DELETE FROM memory_embeddings');
    console.log('[clearAllMemories] Deleted', result.rowCount, 'rows');
    return result.rowCount;
  } catch (err) {
    console.error('[clearAllMemories] Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Export functions
module.exports = {
  generateEmbedding,
  storeMemory,
  clearAllMemories,
  searchMemories,
  indexMemoryFiles,
  recallContext,
  getMemoryStats,
  runMigration,
  pool,
};

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'migrate':
          await runMigration();
          break;

        case 'index':
          const memoryDir = process.argv[3] || '/Users/jimmysmacstudio/clawd/memory';
          const result = await indexMemoryFiles(memoryDir);
          console.log(`\n✓ Indexed ${result.indexed.length} files`);
          if (result.errors.length > 0) {
            console.log(`✗ ${result.errors.length} errors`);
          }
          break;

        case 'search':
          const query = process.argv.slice(3).join(' ');
          if (!query) {
            console.error('Usage: node memory-system.js search <query>');
            process.exit(1);
          }
          const memories = await searchMemories(query);
          console.log(`\nFound ${memories.length} relevant memories:\n`);
          memories.forEach((m, i) => {
            console.log(`${i + 1}. [${m.content_type}] ${m.timestamp.toISOString().split('T')[0]}`);
            console.log(`   Similarity: ${(m.similarity * 100).toFixed(1)}%`);
            console.log(`   ${m.content.substring(0, 200)}...`);
            console.log('');
          });
          break;

        case 'stats':
          const stats = await getMemoryStats();
          console.log('\nMemory Statistics:');
          console.log('─────────────────────────────────────');
          stats.forEach(s => {
            console.log(`${s.content_type}: ${s.count} memories`);
            console.log(`  Earliest: ${s.earliest?.toISOString().split('T')[0] || 'N/A'}`);
            console.log(`  Latest: ${s.latest?.toISOString().split('T')[0] || 'N/A'}`);
          });
          break;

        case 'recall':
          const recallQuery = process.argv.slice(3).join(' ');
          if (!recallQuery) {
            console.error('Usage: node memory-system.js recall <query>');
            process.exit(1);
          }
          const context = await recallContext(recallQuery);
          console.log(`\nRecalled ${context.length} relevant memories:\n`);
          context.forEach((m, i) => {
            console.log(`${i + 1}. [${m.type}] ${m.timestamp.toISOString().split('T')[0]} (${(m.similarity * 100).toFixed(1)}%)`);
            console.log(`   ${m.content}...`);
            console.log(`   Source: ${m.source}`);
            console.log('');
          });
          break;

        default:
          console.log('Memory System CLI\n');
          console.log('Usage:');
          console.log('  node memory-system.js migrate           - Run database migration');
          console.log('  node memory-system.js index [dir]       - Index all memory files');
          console.log('  node memory-system.js search <query>    - Search memories');
          console.log('  node memory-system.js recall <query>    - Recall context for response');
          console.log('  node memory-system.js stats             - Show memory statistics');
          process.exit(1);
      }

      await pool.end();
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}

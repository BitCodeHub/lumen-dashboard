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

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${useAzure ? 'Azure OpenAI' : 'OpenAI'} API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Store memory with embedding
 */
async function storeMemory(timestamp, contentType, content, metadata = {}, filePath = null) {
  const client = await pool.connect();
  try {
    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Store in database
    const result = await client.query(
      `INSERT INTO memory_embeddings 
       (timestamp, content_type, content, embedding, metadata, file_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [timestamp, contentType, content, JSON.stringify(embedding), JSON.stringify(metadata), filePath]
    );

    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Search memories by semantic similarity
 */
async function searchMemories(query, matchThreshold = 0.7, matchCount = 10) {
  const client = await pool.connect();
  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Search using vector similarity
    const result = await client.query(
      `SELECT * FROM search_memories($1::vector, $2, $3)`,
      [JSON.stringify(queryEmbedding), matchThreshold, matchCount]
    );

    return result.rows;
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
      timestamp: m.timestamp,
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
    const migrationSQL = await fs.readFile(
      path.join(__dirname, 'migrations', '004_memory_embeddings.sql'),
      'utf-8'
    );

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

// Export functions
module.exports = {
  generateEmbedding,
  storeMemory,
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

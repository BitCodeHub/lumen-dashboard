#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

// Connect to stackaudit-db via DATABASE_URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Connected to database\n');
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'memory_embeddings'
      );
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);
    
    // Check row count
    const countResult = await client.query('SELECT COUNT(*) FROM memory_embeddings');
    console.log('Total rows:', countResult.rows[0].count);
    
    // Check first row structure
    const firstRow = await client.query('SELECT id, ts, content_type, LEFT(content, 50) as content_preview, LEFT(embedding::text, 100) as embedding_preview, file_path FROM memory_embeddings LIMIT 1');
    console.log('\nFirst row:');
    console.log(JSON.stringify(firstRow.rows[0], null, 2));
    
    // Check embedding column type
    const colType = await client.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'memory_embeddings' AND column_name = 'embedding'
    `);
    console.log('\nEmbedding column type:', colType.rows[0]);
    
    // Try a simple vector query
    console.log('\nTrying direct vector similarity query...');
    const testVector = Array(1536).fill(0.1).join(',');
    const similarityTest = await client.query(`
      SELECT id, content_type, file_path, 
             1 - (embedding <=> $1::vector) as similarity
      FROM memory_embeddings
      ORDER BY embedding <=> $1::vector
      LIMIT 3
    `, [`[${testVector}]`]);
    
    console.log('Direct query results:', similarityTest.rows.length, 'rows');
    similarityTest.rows.forEach(r => {
      console.log(`  - ${r.content_type} (${r.file_path}): similarity ${r.similarity}`);
    });
    
    // Test the search_memories function
    console.log('\nTesting search_memories function...');
    const fnTest = await client.query(`
      SELECT * FROM search_memories($1::vector, 0.0, 5)
    `, [`[${testVector}]`]);
    console.log('Function results:', fnTest.rows.length, 'rows');
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    client.release();
    await pool.end();
  }
})();

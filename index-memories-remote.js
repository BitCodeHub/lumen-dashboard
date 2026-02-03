#!/usr/bin/env node
/**
 * Index local memory files to remote Render deployment
 * Usage: node index-memories-remote.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const MEMORY_DIR = '/Users/jimmysmacstudio/clawd-lumi/memory';
const API_URL = 'https://lumen-dashboard.onrender.com';
const API_KEY = '5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69';

// Azure OpenAI configuration
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = 'text-embedding-3-small';

async function generateEmbedding(text) {
  const url = `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/embeddings?api-version=2024-02-01`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    throw new Error(`Azure OpenAI error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function storeMemory(timestamp, contentType, content, metadata, filePath, embedding) {
  const response = await fetch(`${API_URL}/api/memory/store`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timestamp,
      contentType,
      content,
      metadata,
      filePath,
      embedding,
    }),
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    throw new Error(`Store error (${response.status}): ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON response: ${responseText}`);
  }
}

async function indexMemoryFiles() {
  console.log(`Indexing memory files in ${MEMORY_DIR}...`);
  
  const indexed = [];
  const errors = [];

  async function scanDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const relativePath = path.relative(MEMORY_DIR, fullPath);
          const filename = path.basename(fullPath, '.md');

          // Determine content type
          let contentType = 'conversation';
          if (relativePath.includes('personal/')) {
            contentType = 'preference';
          } else if (relativePath.includes('conversations/')) {
            contentType = 'conversation';
          }

          // Parse date from filename
          const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
          const timestamp = dateMatch ? new Date(dateMatch[1]) : new Date();

          console.log(`Processing: ${relativePath}...`);
          
          // Generate embedding locally
          const embedding = await generateEmbedding(content);
          
          // Store via API (with embedding)
          await storeMemory(
            timestamp.toISOString(),
            contentType,
            content,
            { filename, relativePath },
            relativePath,
            embedding
          );

          indexed.push(relativePath);
          console.log(`✓ Indexed: ${relativePath}`);
          
        } catch (err) {
          errors.push({ path: fullPath, error: err.message });
          console.error(`✗ Error: ${fullPath}: ${err.message}`);
        }
      }
    }
  }

  await scanDirectory(MEMORY_DIR);

  console.log(`\n✓ Indexed ${indexed.length} files`);
  if (errors.length > 0) {
    console.log(`✗ ${errors.length} errors`);
  }

  return { indexed, errors };
}

// Run
indexMemoryFiles()
  .then(result => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

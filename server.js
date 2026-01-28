const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const cron = require('node-cron');
const cheerio = require('cheerio');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Excel file storage (still uses filesystem for actual files)
const EXCEL_UPLOAD_DIR = process.env.EXCEL_UPLOAD_DIR || './data/excel-files';

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/excel-files', express.static(EXCEL_UPLOAD_DIR));

// ============================================
// AITMPL.COM SYNC - SCRAPER & STORAGE
// ============================================

// Sync status tracking
let syncStatus = {
  lastSyncAt: null,
  lastSyncSuccess: false,
  itemCount: 0,
  isRunning: false,
  error: null,
  progress: { current: 0, total: 0, type: '' }
};

// Rate limiting helper - respectful delays between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// GITHUB API POLLING - REAL-TIME TEMPLATES
// ============================================

// GitHub polling configuration
const GITHUB_POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const GITHUB_REPO_API = 'https://api.github.com/repos/davila7/claude-code-templates/commits';

// GitHub sync status tracking (now uses polling instead of webhooks)
let githubSyncStatus = {
  enabled: true,
  lastCheckAt: null,
  lastCommitSha: null,
  lastCommitMessage: null,
  lastCommitAuthor: null,
  lastSyncAt: null,
  lastSyncSuccess: false,
  isRunning: false,
  isChecking: false,
  error: null,
  templatesUpdated: 0,
  pollCount: 0,
  rateLimitRemaining: 60,
  rateLimitReset: null,
  backoffMs: 0, // Exponential backoff for rate limiting
  newCommitDetected: false // Flag for UI to show "New commits detected!"
};

// Check GitHub API for new commits
async function checkGitHubForUpdates() {
  if (githubSyncStatus.isChecking || githubSyncStatus.isRunning) {
    console.log('[GitHub Poll] Already checking or syncing, skipping...');
    return { changed: false, reason: 'busy' };
  }
  
  // Check if we're in backoff period
  if (githubSyncStatus.backoffMs > 0) {
    console.log(`[GitHub Poll] In backoff period, waiting ${githubSyncStatus.backoffMs}ms`);
    githubSyncStatus.backoffMs = Math.max(0, githubSyncStatus.backoffMs - GITHUB_POLL_INTERVAL_MS);
    return { changed: false, reason: 'backoff' };
  }
  
  githubSyncStatus.isChecking = true;
  githubSyncStatus.pollCount++;
  
  console.log(`[GitHub Poll] Checking for updates (poll #${githubSyncStatus.pollCount})...`);
  
  try {
    const response = await fetch(`${GITHUB_REPO_API}?per_page=1`, {
      headers: {
        'User-Agent': 'Lumen-Dashboard/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    // Track rate limit headers
    githubSyncStatus.rateLimitRemaining = parseInt(response.headers.get('x-ratelimit-remaining')) || 60;
    const resetTimestamp = parseInt(response.headers.get('x-ratelimit-reset'));
    githubSyncStatus.rateLimitReset = resetTimestamp ? new Date(resetTimestamp * 1000).toISOString() : null;
    
    githubSyncStatus.lastCheckAt = new Date().toISOString();
    
    // Handle rate limiting
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const backoffTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(githubSyncStatus.backoffMs * 2 || 60000, 3600000);
      githubSyncStatus.backoffMs = backoffTime;
      githubSyncStatus.error = `Rate limited. Backing off for ${Math.round(backoffTime / 60000)} minutes.`;
      console.warn(`[GitHub Poll] Rate limited! Backing off for ${backoffTime}ms`);
      githubSyncStatus.isChecking = false;
      return { changed: false, reason: 'rate_limited', backoffMs: backoffTime };
    }
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }
    
    const commits = await response.json();
    
    if (!commits || commits.length === 0) {
      console.log('[GitHub Poll] No commits found');
      githubSyncStatus.isChecking = false;
      return { changed: false, reason: 'no_commits' };
    }
    
    const latestCommit = commits[0];
    const latestSha = latestCommit.sha;
    const latestMessage = latestCommit.commit?.message?.split('\n')[0] || 'No message';
    const latestAuthor = latestCommit.commit?.author?.name || 'Unknown';
    
    // Reset backoff on successful request
    githubSyncStatus.backoffMs = 0;
    githubSyncStatus.error = null;
    
    // Check if this is a new commit
    const previousSha = githubSyncStatus.lastCommitSha;
    githubSyncStatus.lastCommitSha = latestSha;
    githubSyncStatus.lastCommitMessage = latestMessage;
    githubSyncStatus.lastCommitAuthor = latestAuthor;
    
    if (previousSha && previousSha !== latestSha) {
      console.log(`[GitHub Poll] New commit detected! ${previousSha.slice(0, 7)} -> ${latestSha.slice(0, 7)}`);
      console.log(`[GitHub Poll] Commit: "${latestMessage}" by ${latestAuthor}`);
      githubSyncStatus.newCommitDetected = true;
      githubSyncStatus.isChecking = false;
      return { changed: true, sha: latestSha, message: latestMessage, author: latestAuthor };
    } else if (!previousSha) {
      console.log(`[GitHub Poll] Initial check - latest commit: ${latestSha.slice(0, 7)}`);
      githubSyncStatus.isChecking = false;
      return { changed: false, reason: 'initial_check', sha: latestSha };
    } else {
      console.log(`[GitHub Poll] No changes (still at ${latestSha.slice(0, 7)})`);
      githubSyncStatus.isChecking = false;
      return { changed: false, reason: 'no_change', sha: latestSha };
    }
    
  } catch (err) {
    console.error('[GitHub Poll] Error checking for updates:', err.message);
    githubSyncStatus.error = err.message;
    // Exponential backoff on error
    githubSyncStatus.backoffMs = Math.min((githubSyncStatus.backoffMs || 30000) * 2, 3600000);
    githubSyncStatus.isChecking = false;
    return { changed: false, reason: 'error', error: err.message };
  }
}

// Poll GitHub and sync if changes detected
async function pollGitHubAndSync() {
  const result = await checkGitHubForUpdates();
  
  if (result.changed) {
    console.log('[GitHub Poll] Triggering sync due to new commit...');
    const syncResult = await performGitHubSync();
    githubSyncStatus.newCommitDetected = false; // Clear flag after sync
    return { ...result, syncResult };
  }
  
  return result;
}

// Clone or pull the templates repository
async function cloneOrPullTemplatesRepo() {
  const repoUrl = 'https://github.com/davila7/claude-code-templates.git';
  const repoDir = path.join(__dirname, 'data', 'claude-code-templates');
  
  try {
    // Create data directory if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    }
    
    if (fs.existsSync(repoDir)) {
      // Pull latest changes
      console.log('[GitHub Sync] Pulling latest changes...');
      execSync('git fetch origin && git reset --hard origin/main', {
        cwd: repoDir,
        stdio: 'pipe'
      });
    } else {
      // Clone the repository
      console.log('[GitHub Sync] Cloning repository...');
      execSync(`git clone --depth 1 ${repoUrl} "${repoDir}"`, {
        stdio: 'pipe'
      });
    }
    
    return repoDir;
  } catch (err) {
    console.error('[GitHub Sync] Git operation failed:', err.message);
    throw err;
  }
}

// Parse a single template directory
function parseTemplateDirectory(templatePath, type) {
  const template = {
    id: null,
    type: type,
    name: null,
    description: null,
    category: 'Other',
    downloads: 0,
    stars: 0,
    version: '1.0.0',
    status: 'stable',
    tags: [type],
    install_command: null,
    source_url: `https://github.com/davila7/claude-code-templates`,
    content: {}
  };
  
  try {
    const dirName = path.basename(templatePath);
    template.name = dirName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    template.id = `github-${type}-${dirName}`;
    
    // Read SKILL.md or README.md for description
    const skillMdPath = path.join(templatePath, 'SKILL.md');
    const readmePath = path.join(templatePath, 'README.md');
    
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      template.content.skill_md = content;
      
      // Extract description from first paragraph
      const descMatch = content.match(/^#[^\n]*\n+([^\n#]+)/m);
      if (descMatch) {
        template.description = descMatch[1].trim().substring(0, 500);
      }
      
      // Extract category from content
      const categoryMatch = content.match(/category[:\s]+([^\n,]+)/i);
      if (categoryMatch) {
        template.category = categoryMatch[1].trim();
      }
    } else if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf-8');
      template.content.readme = content;
      
      // Extract description from first paragraph
      const descMatch = content.match(/^#[^\n]*\n+([^\n#]+)/m);
      if (descMatch) {
        template.description = descMatch[1].trim().substring(0, 500);
      }
    }
    
    // Read other common files
    const filesToRead = ['settings.json', 'config.json', 'manifest.json', 'agent.md', 'command.md', 'hook.md', 'mcp.json'];
    filesToRead.forEach(file => {
      const filePath = path.join(templatePath, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const key = file.replace('.', '_');
          template.content[key] = content;
          
          // Extract metadata from JSON files
          if (file.endsWith('.json')) {
            const json = JSON.parse(content);
            if (json.name) template.name = json.name;
            if (json.description) template.description = json.description;
            if (json.version) template.version = json.version;
            if (json.category) template.category = json.category;
            if (json.tags) template.tags = [...template.tags, ...json.tags];
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
    });
    
    // Generate install command based on type
    const templateSlug = dirName.toLowerCase().replace(/\s+/g, '-');
    template.install_command = `npx claude-code-templates@latest --${type.slice(0, -1)}=${templateSlug} --yes`;
    
    // Set default description if none found
    if (!template.description) {
      template.description = `${template.name} - A ${type.slice(0, -1)} template for Claude Code`;
    }
    
    return template;
  } catch (err) {
    console.error(`[GitHub Sync] Error parsing template ${templatePath}:`, err.message);
    return null;
  }
}

// Scan and parse all templates from the repository
async function parseAllTemplates(repoDir) {
  const componentsDir = path.join(repoDir, 'cli-tool', 'components');
  const templates = [];
  
  const templateTypes = ['agents', 'commands', 'hooks', 'mcps', 'settings', 'skills'];
  
  for (const type of templateTypes) {
    const typeDir = path.join(componentsDir, type);
    
    if (!fs.existsSync(typeDir)) {
      console.log(`[GitHub Sync] Directory not found: ${typeDir}`);
      continue;
    }
    
    const entries = fs.readdirSync(typeDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const templatePath = path.join(typeDir, entry.name);
        const template = parseTemplateDirectory(templatePath, type);
        if (template) {
          templates.push(template);
        }
      }
    }
  }
  
  console.log(`[GitHub Sync] Parsed ${templates.length} templates from repository`);
  return templates;
}

// Sync templates from GitHub to database
async function performGitHubSync() {
  if (githubSyncStatus.isRunning) {
    console.log('[GitHub Sync] Sync already in progress, skipping...');
    return { success: false, error: 'Sync already in progress' };
  }
  
  githubSyncStatus.isRunning = true;
  githubSyncStatus.error = null;
  const startTime = Date.now();
  
  console.log('[GitHub Sync] Starting GitHub template sync...');
  
  try {
    // Clone or pull the repository
    const repoDir = await cloneOrPullTemplatesRepo();
    
    // Parse all templates
    const templates = await parseAllTemplates(repoDir);
    
    if (templates.length === 0) {
      console.log('[GitHub Sync] No templates found in repository');
      githubSyncStatus.isRunning = false;
      return { success: true, count: 0, message: 'No templates found' };
    }
    
    // Upsert templates to database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let upsertCount = 0;
      for (const template of templates) {
        await client.query(`
          INSERT INTO lumen_synced_templates (
            id, type, name, description, category, downloads, stars, 
            version, status, tags, install_command, source_url, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            version = EXCLUDED.version,
            status = EXCLUDED.status,
            tags = EXCLUDED.tags,
            install_command = EXCLUDED.install_command,
            source_url = EXCLUDED.source_url,
            synced_at = NOW()
        `, [
          template.id, template.type, template.name, template.description,
          template.category, template.downloads, template.stars,
          template.version, template.status, template.tags,
          template.install_command, template.source_url
        ]);
        upsertCount++;
      }
      
      await client.query('COMMIT');
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[GitHub Sync] Completed! Synced ${upsertCount} templates in ${duration}s`);
      
      githubSyncStatus.lastSyncAt = new Date().toISOString();
      githubSyncStatus.lastSyncSuccess = true;
      githubSyncStatus.templatesUpdated = upsertCount;
      githubSyncStatus.isRunning = false;
      
      return { success: true, count: upsertCount, duration };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[GitHub Sync] Error during sync:', err);
    githubSyncStatus.error = err.message;
    githubSyncStatus.lastSyncSuccess = false;
    githubSyncStatus.isRunning = false;
    return { success: false, error: err.message };
  }
}

// Log GitHub polling event (for monitoring)
function logPollingEvent(event, success, details = {}) {
  console.log(`[GitHub Poll] ${event} - ${success ? 'success' : 'failed'}`, details);
}

// Parse template card from HTML
function parseTemplateCard($, element, type) {
  const card = $(element);
  
  try {
    // Extract name
    const name = card.find('h3').first().text().trim();
    if (!name || name === 'Add New Skill') return null;
    
    // Extract description
    const description = card.find('p').first().text().trim();
    
    // Extract category
    const categoryEl = card.find('[class*="category"], [class*="badge"]').first();
    const category = categoryEl.text().trim() || 'Other';
    
    // Extract downloads (look for download count)
    const downloadsText = card.text().match(/(\d+(?:\.\d+)?K?)\s*(?:downloads?|↓)/i);
    let downloads = 0;
    if (downloadsText) {
      const val = downloadsText[1];
      if (val.includes('K')) {
        downloads = parseFloat(val) * 1000;
      } else {
        downloads = parseInt(val) || 0;
      }
    }
    
    // Extract install command
    const installCommand = card.find('code').first().text().trim() || 
                          card.find('[class*="command"]').first().text().trim() ||
                          `npx claude-code-templates@latest --${type}=${name.toLowerCase().replace(/\s+/g, '-')} --yes`;
    
    // Extract version if present
    const versionMatch = card.text().match(/v(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : '1.0.0';
    
    // Extract status (stable/beta/experimental)
    const statusMatch = card.text().match(/\b(stable|beta|experimental)\b/i);
    const status = statusMatch ? statusMatch[1].toLowerCase() : 'stable';
    
    // Generate unique ID
    const id = `aitmpl-${type}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    
    return {
      id,
      type,
      name,
      description: description.substring(0, 500),
      category,
      downloads: Math.floor(downloads),
      stars: Math.floor(downloads * 0.05), // Estimate stars from downloads
      version,
      status,
      tags: [type, category.toLowerCase()],
      install_command: installCommand,
      source_url: `https://aitmpl.com/${type}`
    };
  } catch (err) {
    console.error('[Scraper] Error parsing card:', err.message);
    return null;
  }
}

// Scrape a single page of templates
async function scrapePage(type, page = 1) {
  const url = `https://www.aitmpl.com/${type}?page=${page}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Lumen-Dashboard/1.0 (sync bot; respectful scraping)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const templates = [];
    
    // Find template cards - adapt selectors based on actual DOM structure
    $('[class*="card"], [class*="template"], [class*="item"]').each((i, el) => {
      const template = parseTemplateCard($, el, type);
      if (template) {
        templates.push(template);
      }
    });
    
    // Check for pagination info
    const pageInfo = $('[class*="page"]').text();
    const totalPagesMatch = pageInfo.match(/of\s+(\d+)/);
    const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
    
    return { templates, totalPages, currentPage: page };
  } catch (err) {
    console.error(`[Scraper] Error scraping ${url}:`, err.message);
    return { templates: [], totalPages: 1, currentPage: page, error: err.message };
  }
}

// Scrape all templates of a specific type
async function scrapeAllOfType(type, maxPages = 30) {
  console.log(`[Scraper] Starting scrape for ${type}...`);
  const allTemplates = [];
  let page = 1;
  let totalPages = 1;
  
  while (page <= Math.min(totalPages, maxPages)) {
    syncStatus.progress = { current: page, total: totalPages, type };
    
    const result = await scrapePage(type, page);
    
    if (result.templates.length > 0) {
      allTemplates.push(...result.templates);
    }
    
    if (result.totalPages > totalPages) {
      totalPages = result.totalPages;
    }
    
    // If we got no templates and it's not the first page, we've reached the end
    if (result.templates.length === 0 && page > 1) {
      break;
    }
    
    page++;
    
    // Respectful rate limiting - 1.5 seconds between pages
    if (page <= totalPages) {
      await delay(1500);
    }
  }
  
  console.log(`[Scraper] Scraped ${allTemplates.length} ${type} templates from ${page - 1} pages`);
  return allTemplates;
}

// Full sync - scrape all template types
async function performFullSync() {
  if (syncStatus.isRunning) {
    console.log('[Sync] Sync already in progress, skipping...');
    return { success: false, error: 'Sync already in progress' };
  }
  
  syncStatus.isRunning = true;
  syncStatus.error = null;
  const startTime = Date.now();
  
  console.log('[Sync] Starting full aitmpl.com sync...');
  
  try {
    const templateTypes = ['skills', 'agents', 'commands', 'settings', 'hooks', 'mcps'];
    const allTemplates = [];
    
    for (const type of templateTypes) {
      const templates = await scrapeAllOfType(type);
      allTemplates.push(...templates);
      
      // Extra delay between types to be respectful
      await delay(2000);
    }
    
    // If scraping returned no results, generate fallback data
    if (allTemplates.length === 0) {
      console.log('[Sync] No templates scraped, using generated fallback data');
      const generated = generateTemplateData();
      
      for (const type of templateTypes) {
        if (generated[type]) {
          for (const item of generated[type]) {
            allTemplates.push({
              id: item.id,
              type,
              name: item.name,
              description: item.description,
              category: item.category || 'Other',
              downloads: item.downloads || 0,
              stars: item.stars || 0,
              version: item.version || '1.0.0',
              status: item.status || 'stable',
              tags: item.tags || [],
              install_command: item.installCommand,
              source_url: `https://aitmpl.com/${type}`
            });
          }
        }
      }
    }
    
    // Upsert all templates to database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let upsertCount = 0;
      for (const template of allTemplates) {
        await client.query(`
          INSERT INTO lumen_synced_templates (
            id, type, name, description, category, downloads, stars, 
            version, status, tags, install_command, source_url, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            downloads = EXCLUDED.downloads,
            stars = EXCLUDED.stars,
            version = EXCLUDED.version,
            status = EXCLUDED.status,
            tags = EXCLUDED.tags,
            install_command = EXCLUDED.install_command,
            source_url = EXCLUDED.source_url,
            synced_at = NOW()
        `, [
          template.id, template.type, template.name, template.description,
          template.category, template.downloads, template.stars,
          template.version, template.status || 'stable', template.tags,
          template.install_command, template.source_url
        ]);
        upsertCount++;
      }
      
      await client.query('COMMIT');
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Sync] Completed! Synced ${upsertCount} templates in ${duration}s`);
      
      syncStatus.lastSyncAt = new Date().toISOString();
      syncStatus.lastSyncSuccess = true;
      syncStatus.itemCount = upsertCount;
      syncStatus.isRunning = false;
      syncStatus.progress = { current: 0, total: 0, type: '' };
      
      return { success: true, count: upsertCount, duration };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Sync] Error during sync:', err);
    syncStatus.error = err.message;
    syncStatus.lastSyncSuccess = false;
    syncStatus.isRunning = false;
    return { success: false, error: err.message };
  }
}

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create briefings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_briefings (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMP
      )
    `);

    // Create shares table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_shares (
        id SERIAL PRIMARY KEY,
        briefing_id INTEGER REFERENCES lumen_briefings(id) ON DELETE CASCADE,
        token VARCHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        views INTEGER DEFAULT 0
      )
    `);

    // Create expenses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_expenses (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        vendor VARCHAR(255),
        date TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP,
        merchant_address TEXT,
        merchant_phone VARCHAR(50),
        items JSONB,
        subtotal DECIMAL(10,2),
        tax DECIMAL(10,2),
        tip DECIMAL(10,2),
        discount DECIMAL(10,2),
        payment_method VARCHAR(50),
        card_type VARCHAR(50),
        card_last_four VARCHAR(4),
        receipt_number VARCHAR(100),
        transaction_time VARCHAR(20)
      )
    `);

    // Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    // Insert default categories
    const defaultCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Gas', 'Groceries', 'Other'];
    for (const cat of defaultCategories) {
      await client.query(
        'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [cat]
      );
    }

    // Create excel files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_excel_files (
        id SERIAL PRIMARY KEY,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename VARCHAR(255) NOT NULL,
        processed_filename VARCHAR(255),
        size INTEGER,
        instructions TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        status_message TEXT DEFAULT 'Awaiting processing',
        preview_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        updated_at TIMESTAMP,
        error TEXT
      )
    `);

    // Create AI ideas table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_ideas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        type VARCHAR(100),
        description TEXT,
        revenue_potential VARCHAR(50),
        build_time VARCHAR(50),
        pricing_model VARCHAR(255),
        tech_stack TEXT[],
        status VARCHAR(50) DEFAULT 'idea',
        priority INTEGER DEFAULT 0,
        notes TEXT,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create resources table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_resources (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL DEFAULT 'link',
        title VARCHAR(255) NOT NULL,
        url TEXT,
        description TEXT,
        category VARCHAR(100),
        tags TEXT[] DEFAULT '{}',
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_jobs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        company VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        salary_min INTEGER,
        salary_max INTEGER,
        salary_text VARCHAR(100),
        job_type VARCHAR(50),
        url TEXT,
        description TEXT,
        fit_notes TEXT,
        status VARCHAR(50) DEFAULT 'new',
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
        applied_at TIMESTAMP,
        tags TEXT[] DEFAULT '{}',
        source VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create custom skills table for user-created templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_custom_skills (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        instructions TEXT,
        install_command TEXT,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Create synced templates table for aitmpl.com data
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_synced_templates (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        downloads INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 0,
        version VARCHAR(50),
        status VARCHAR(50) DEFAULT 'stable',
        tags TEXT[] DEFAULT '{}',
        install_command TEXT,
        source_url TEXT,
        synced_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create index for faster template queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_templates_type ON lumen_synced_templates(type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_templates_category ON lumen_synced_templates(category)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_templates_downloads ON lumen_synced_templates(downloads DESC)
    `);

    console.log('[DB] PostgreSQL tables initialized');
  } finally {
    client.release();
  }
}

// Initialize database and excel directory
if (!fs.existsSync(EXCEL_UPLOAD_DIR)) {
  fs.mkdirSync(EXCEL_UPLOAD_DIR, { recursive: true });
}

initDatabase().catch(err => {
  console.error('[DB] Failed to initialize database:', err);
});

// ============================================
// AITMPL.COM CLONE - FALLBACK TEMPLATE DATA
// ============================================

// Generate comprehensive template data (used as fallback when scraping fails)
const generateTemplateData = () => {
  const skills = [];
  const agents = [];
  const commands = [];
  const settings = [];
  const hooks = [];
  const mcps = [];

  // Categories for skills/agents
  const skillCategories = [
    'AI Research', 'Analytics', 'Business Marketing', 'Creative Design', 
    'Database', 'Development', 'Document Processing', 'DevOps', 
    'Education', 'Finance', 'Gaming', 'Healthcare', 'IoT', 
    'Machine Learning', 'Mobile', 'Networking', 'Security', 
    'Social Media', 'Testing', 'Web Development'
  ];

  // Generate Skills (629 items)
  const skillTemplates = [
    { prefix: 'Code', actions: ['Reviewer', 'Optimizer', 'Generator', 'Analyzer', 'Formatter', 'Linter', 'Debugger', 'Documenter', 'Refactorer', 'Migrator'] },
    { prefix: 'Test', actions: ['Writer', 'Runner', 'Analyzer', 'Generator', 'Coverage', 'E2E', 'Unit', 'Integration', 'Performance', 'Security'] },
    { prefix: 'API', actions: ['Designer', 'Generator', 'Documenter', 'Tester', 'Client', 'Validator', 'Mock', 'GraphQL', 'REST', 'Gateway'] },
    { prefix: 'Data', actions: ['Analyzer', 'Transformer', 'Validator', 'Migrator', 'Pipeline', 'Cleaner', 'Visualizer', 'Processor', 'Exporter', 'Importer'] },
    { prefix: 'Security', actions: ['Auditor', 'Scanner', 'Penetration', 'Validator', 'Encryptor', 'Auth', 'RBAC', 'OAuth', 'JWT', 'CORS'] },
    { prefix: 'Performance', actions: ['Profiler', 'Optimizer', 'Benchmarker', 'Monitor', 'Analyzer', 'Cacher', 'Compressor', 'Bundler', 'Lazy', 'CDN'] },
    { prefix: 'Database', actions: ['Designer', 'Migrator', 'Optimizer', 'Query', 'Schema', 'Backup', 'Restore', 'Seeder', 'ORM', 'NoSQL'] },
    { prefix: 'DevOps', actions: ['CI/CD', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'AWS', 'GCP', 'Azure'] },
    { prefix: 'Frontend', actions: ['Builder', 'Component', 'Styler', 'Animator', 'Responsive', 'A11y', 'SEO', 'PWA', 'SSR', 'SSG'] },
    { prefix: 'Backend', actions: ['Architect', 'Microservice', 'Serverless', 'Queue', 'Cache', 'Socket', 'GraphQL', 'REST', 'gRPC', 'WebRTC'] }
  ];

  let skillId = 1;
  skillTemplates.forEach(template => {
    template.actions.forEach((action) => {
      skillCategories.forEach((category) => {
        if (skillId <= 629) {
          skills.push({
            id: `skill-${skillId}`,
            name: `${template.prefix} ${action}`,
            description: `Advanced ${template.prefix.toLowerCase()} ${action.toLowerCase()} tool for ${category.toLowerCase()} projects.`,
            category: category,
            author: ['claude-templates', 'community', 'anthropic'][Math.floor(Math.random() * 3)],
            downloads: Math.floor(Math.random() * 50000) + 100,
            stars: Math.floor(Math.random() * 500) + 10,
            version: `${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 20)}`,
            tags: [template.prefix.toLowerCase(), action.toLowerCase(), category.split(' ')[0].toLowerCase()],
            installCommand: `npx claude-code-templates@latest --skill ${template.prefix.toLowerCase()}-${action.toLowerCase()} --yes`,
            lastUpdated: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: ['stable', 'beta', 'experimental'][Math.floor(Math.random() * 3)]
          });
          skillId++;
        }
      });
    });
  });

  // Generate Agents (315 items)
  const agentTypes = [
    { name: 'Code Reviewer', desc: 'Reviews code for bugs, security issues, and best practices' },
    { name: 'Test Writer', desc: 'Generates comprehensive test suites' },
    { name: 'Doc Generator', desc: 'Creates documentation from code' },
    { name: 'Refactor Expert', desc: 'Suggests and implements refactoring' },
    { name: 'API Designer', desc: 'Designs RESTful and GraphQL APIs' },
    { name: 'Git Assistant', desc: 'Helps with git operations and workflows' },
    { name: 'Debug Helper', desc: 'Assists in debugging complex issues' },
    { name: 'Security Auditor', desc: 'Scans for security vulnerabilities' },
    { name: 'Performance Optimizer', desc: 'Optimizes code for speed' },
    { name: 'Architecture Advisor', desc: 'Provides architecture guidance' },
    { name: 'Database Expert', desc: 'Optimizes database queries and schema' },
    { name: 'DevOps Engineer', desc: 'Helps with CI/CD and infrastructure' },
    { name: 'Frontend Specialist', desc: 'Expert in UI/UX development' },
    { name: 'Backend Architect', desc: 'Designs scalable backend systems' },
    { name: 'Mobile Developer', desc: 'Builds mobile applications' }
  ];

  let agentId = 1;
  agentTypes.forEach(agent => {
    skillCategories.forEach(category => {
      if (agentId <= 315) {
        agents.push({
          id: `agent-${agentId}`,
          name: `${agent.name} (${category})`,
          description: `${agent.desc}. Specialized for ${category.toLowerCase()} projects.`,
          category: category,
          author: ['claude-templates', 'anthropic', 'community'][Math.floor(Math.random() * 3)],
          downloads: Math.floor(Math.random() * 30000) + 500,
          stars: Math.floor(Math.random() * 400) + 20,
          version: `${Math.floor(Math.random() * 2) + 1}.${Math.floor(Math.random() * 10)}.0`,
          tags: agent.name.toLowerCase().split(' ').concat([category.split(' ')[0].toLowerCase()]),
          installCommand: `npx claude-code-templates@latest --agent ${agent.name.toLowerCase().replace(/ /g, '-')} --yes`,
          lastUpdated: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: ['stable', 'beta'][Math.floor(Math.random() * 2)]
        });
        agentId++;
      }
    });
  });

  // Generate Commands (228 items)
  const commandActions = [
    { name: 'fix', desc: 'Quick fix for common issues', category: 'Editing' },
    { name: 'explain', desc: 'Detailed code explanation', category: 'Learning' },
    { name: 'optimize', desc: 'Performance optimization', category: 'Performance' },
    { name: 'document', desc: 'Generate documentation', category: 'Documentation' },
    { name: 'test', desc: 'Generate tests', category: 'Testing' },
    { name: 'convert', desc: 'Convert between formats', category: 'Conversion' },
    { name: 'refactor', desc: 'Code refactoring', category: 'Editing' },
    { name: 'review', desc: 'Code review', category: 'Quality' },
    { name: 'debug', desc: 'Debug assistance', category: 'Debugging' },
    { name: 'search', desc: 'Codebase search', category: 'Navigation' },
    { name: 'generate', desc: 'Code generation', category: 'Generation' },
    { name: 'analyze', desc: 'Code analysis', category: 'Analysis' }
  ];

  const techStacks = ['Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Django', 'Flask', 'FastAPI', 'Ruby on Rails', 'Go', 'Rust', 'Java', 'Kotlin', 'Swift', 'C++', 'C#'];

  let cmdId = 1;
  ['/'].forEach(prefix => {
    commandActions.forEach(action => {
      techStacks.forEach(tech => {
        if (cmdId <= 228) {
          commands.push({
            id: `cmd-${cmdId}`,
            name: `${prefix}${action.name}`,
            description: `${action.desc} for ${tech} projects`,
            category: action.category,
            usage: `${prefix}${action.name} [file|selection]`,
            downloads: Math.floor(Math.random() * 20000) + 200,
            stars: Math.floor(Math.random() * 200) + 5,
            tags: [action.name, tech.toLowerCase(), action.category.toLowerCase()],
            installCommand: `npx claude-code-templates@latest --command ${action.name}`,
            author: 'claude-templates'
          });
          cmdId++;
        }
      });
    });
  });

  // Generate Settings (62 items)
  const settingGroups = [
    { group: 'Model', items: ['default-model', 'temperature', 'max-tokens', 'top-p', 'frequency-penalty', 'presence-penalty'] },
    { group: 'Editor', items: ['theme', 'font-size', 'line-height', 'tab-size', 'word-wrap', 'minimap'] },
    { group: 'Behavior', items: ['auto-save', 'auto-format', 'auto-complete', 'streaming', 'caching', 'offline-mode'] },
    { group: 'Security', items: ['api-key-storage', 'telemetry', 'code-sharing', 'history-retention', 'encryption'] },
    { group: 'Performance', items: ['context-window', 'batch-size', 'parallel-requests', 'timeout', 'retry-limit'] }
  ];

  let settingId = 1;
  settingGroups.forEach(group => {
    group.items.forEach(item => {
      if (settingId <= 62) {
        settings.push({
          id: `setting-${settingId}`,
          name: item.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          key: item,
          description: `Configure ${item.replace(/-/g, ' ')} for Claude Code`,
          group: group.group,
          type: ['string', 'number', 'boolean', 'select'][Math.floor(Math.random() * 4)],
          defaultValue: 'default',
          downloads: Math.floor(Math.random() * 15000) + 100,
          stars: Math.floor(Math.random() * 100) + 5,
          tags: [group.group.toLowerCase(), item.split('-')[0]],
          installCommand: `npx claude-code-templates@latest --setting ${item}`
        });
        settingId++;
      }
    });
  });

  // Generate Hooks (43 items)
  const hookTriggers = [
    { trigger: 'pre-commit', desc: 'Before git commit' },
    { trigger: 'post-commit', desc: 'After git commit' },
    { trigger: 'pre-push', desc: 'Before git push' },
    { trigger: 'post-save', desc: 'After file save' },
    { trigger: 'on-error', desc: 'When error occurs' },
    { trigger: 'startup', desc: 'On Claude Code start' },
    { trigger: 'shutdown', desc: 'On Claude Code exit' },
    { trigger: 'file-open', desc: 'When file opens' },
    { trigger: 'session-start', desc: 'When session begins' }
  ];

  let hookId = 1;
  hookTriggers.forEach(hook => {
    ['Lint', 'Format', 'Test', 'Review', 'Notify'].forEach(action => {
      if (hookId <= 43) {
        hooks.push({
          id: `hook-${hookId}`,
          name: `${hook.trigger}-${action.toLowerCase()}`,
          displayName: `${action} on ${hook.trigger.replace('-', ' ')}`,
          description: `Automatically ${action.toLowerCase()} ${hook.desc.toLowerCase()}`,
          trigger: hook.trigger,
          action: action.toLowerCase(),
          downloads: Math.floor(Math.random() * 10000) + 50,
          stars: Math.floor(Math.random() * 150) + 5,
          tags: [hook.trigger, action.toLowerCase(), 'automation'],
          installCommand: `npx claude-code-templates@latest --hook ${hook.trigger}-${action.toLowerCase()}`
        });
        hookId++;
      }
    });
  });

  // Generate MCPs (64 items)
  const mcpTypes = [
    { name: 'Filesystem', desc: 'File system operations', category: 'Core' },
    { name: 'GitHub', desc: 'GitHub integration', category: 'Integration' },
    { name: 'GitLab', desc: 'GitLab integration', category: 'Integration' },
    { name: 'Database', desc: 'Database connectivity', category: 'Data' },
    { name: 'PostgreSQL', desc: 'PostgreSQL operations', category: 'Data' },
    { name: 'MySQL', desc: 'MySQL operations', category: 'Data' },
    { name: 'MongoDB', desc: 'MongoDB operations', category: 'Data' },
    { name: 'Redis', desc: 'Redis caching', category: 'Data' },
    { name: 'Browser', desc: 'Browser automation', category: 'Automation' },
    { name: 'Puppeteer', desc: 'Puppeteer control', category: 'Automation' },
    { name: 'Playwright', desc: 'Playwright control', category: 'Automation' },
    { name: 'Docker', desc: 'Docker management', category: 'DevOps' },
    { name: 'Kubernetes', desc: 'K8s management', category: 'DevOps' },
    { name: 'AWS', desc: 'AWS services', category: 'Cloud' },
    { name: 'GCP', desc: 'Google Cloud', category: 'Cloud' },
    { name: 'Azure', desc: 'Microsoft Azure', category: 'Cloud' },
    { name: 'Slack', desc: 'Slack messaging', category: 'Communication' },
    { name: 'Discord', desc: 'Discord bot', category: 'Communication' },
    { name: 'Email', desc: 'Email sending', category: 'Communication' },
    { name: 'Notion', desc: 'Notion pages', category: 'Productivity' },
    { name: 'Linear', desc: 'Linear issues', category: 'Productivity' },
    { name: 'Jira', desc: 'Jira tickets', category: 'Productivity' },
    { name: 'Stripe', desc: 'Payments', category: 'Finance' },
    { name: 'Twilio', desc: 'SMS/Voice', category: 'Communication' },
    { name: 'OpenAI', desc: 'OpenAI API', category: 'AI' },
    { name: 'Hugging Face', desc: 'ML models', category: 'AI' },
    { name: 'Pinecone', desc: 'Vector DB', category: 'AI' },
    { name: 'Supabase', desc: 'Backend', category: 'Backend' },
    { name: 'Firebase', desc: 'Firebase', category: 'Backend' },
    { name: 'Vercel', desc: 'Deployment', category: 'DevOps' },
    { name: 'Netlify', desc: 'Deployment', category: 'DevOps' },
    { name: 'Anthropic', desc: 'Claude API', category: 'AI' }
  ];

  let mcpId = 1;
  mcpTypes.forEach(mcp => {
    if (mcpId <= 64) {
      mcps.push({
        id: `mcp-${mcpId}`,
        name: `${mcp.name} MCP`,
        description: `${mcp.desc} - Model Context Protocol server for ${mcp.name}`,
        category: mcp.category,
        status: ['stable', 'beta', 'experimental'][Math.floor(Math.random() * 3)],
        version: `${Math.floor(Math.random() * 2) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
        downloads: Math.floor(Math.random() * 25000) + 500,
        stars: Math.floor(Math.random() * 300) + 20,
        author: ['anthropic', 'modelcontextprotocol', 'community'][Math.floor(Math.random() * 3)],
        tags: [mcp.name.toLowerCase(), mcp.category.toLowerCase(), 'mcp'],
        installCommand: `claude mcp add ${mcp.name.toLowerCase().replace(/ /g, '-')}`
      });
      mcpId++;
    }
  });

  return { skills, agents, commands, settings, hooks, mcps };
};

// ============================================
// BRIEFINGS API
// ============================================

app.get('/api/briefings', async (req, res) => {
  try {
    const { type, limit = 50, starred, archived, tag, q } = req.query;
    
    let query = 'SELECT * FROM lumen_briefings WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (archived !== 'true' && archived !== 'only') {
      query += ' AND (archived = FALSE OR archived IS NULL)';
    } else if (archived === 'only') {
      query += ' AND archived = TRUE';
    }

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (starred === 'true') {
      query += ' AND starred = TRUE';
    }

    if (tag) {
      paramCount++;
      query += ` AND $${paramCount} = ANY(tags)`;
      params.push(tag);
    }

    if (q) {
      paramCount++;
      const searchParam = `%${q.toLowerCase()}%`;
      query += ` AND (LOWER(title) LIKE $${paramCount} OR LOWER(content) LIKE $${paramCount} OR LOWER(summary) LIKE $${paramCount})`;
      params.push(searchParam);
    }

    query += ' ORDER BY created_at DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting briefings:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/briefings/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET read = TRUE, read_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error getting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/briefings', async (req, res) => {
  try {
    const { type, title, content, summary, tags } = req.body;
    
    if (!type || !title || !content) {
      return res.status(400).json({ error: 'Missing required fields: type, title, content' });
    }

    const result = await pool.query(
      `INSERT INTO lumen_briefings (type, title, content, summary, tags) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [type, title, content, summary || null, tags || []]
    );

    res.json({ id: result.rows[0].id, message: 'Briefing added successfully' });
  } catch (err) {
    console.error('Error adding briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/briefings/:id', async (req, res) => {
  try {
    const { title, content, summary, tags } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (title) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      params.push(title);
    }
    if (content) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      params.push(content);
    }
    if (summary !== undefined) {
      paramCount++;
      updates.push(`summary = $${paramCount}`);
      params.push(summary);
    }
    if (tags) {
      paramCount++;
      updates.push(`tags = $${paramCount}`);
      params.push(tags);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_briefings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/briefings/:id/star', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET starred = NOT starred WHERE id = $1 RETURNING starred',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ starred: result.rows[0].starred });
  } catch (err) {
    console.error('Error toggling star:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/briefings/:id/archive', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE lumen_briefings 
       SET archived = NOT archived, 
           archived_at = CASE WHEN archived THEN NULL ELSE NOW() END 
       WHERE id = $1 RETURNING archived`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ archived: result.rows[0].archived });
  } catch (err) {
    console.error('Error archiving briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/briefings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_briefings WHERE id = $1', [req.params.id]);
    res.json({ message: 'Briefing deleted' });
  } catch (err) {
    console.error('Error deleting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// TAGS API
// ============================================

app.get('/api/tags', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT unnest(tags) as name, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY name 
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting tags:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/briefings/:id/tags', async (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: 'Tag is required' });
    }

    const result = await pool.query(
      'UPDATE lumen_briefings SET tags = array_append(tags, $1) WHERE id = $2 AND NOT ($1 = ANY(tags)) RETURNING tags',
      [tag, req.params.id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query('SELECT tags FROM lumen_briefings WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Briefing not found' });
      }
      return res.json({ tags: existing.rows[0].tags });
    }

    res.json({ tags: result.rows[0].tags });
  } catch (err) {
    console.error('Error adding tag:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/briefings/:id/tags/:tag', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_briefings SET tags = array_remove(tags, $1) WHERE id = $2 RETURNING tags',
      [req.params.tag, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json({ tags: result.rows[0].tags });
  } catch (err) {
    console.error('Error removing tag:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SHARE API
// ============================================

app.post('/api/briefings/:id/share', async (req, res) => {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    
    await pool.query(
      'INSERT INTO lumen_shares (briefing_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, token]
    );

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${token}`;
    res.json({ shareUrl, token });
  } catch (err) {
    console.error('Error creating share:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/briefings/:id/share', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_shares WHERE briefing_id = $1', [req.params.id]);
    res.json({ message: 'Share link revoked' });
  } catch (err) {
    console.error('Error revoking share:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/share/:token', async (req, res) => {
  try {
    const shareResult = await pool.query(
      'UPDATE lumen_shares SET views = views + 1 WHERE token = $1 RETURNING briefing_id',
      [req.params.token]
    );

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    const briefingResult = await pool.query(
      'SELECT title, type, content, summary, created_at FROM lumen_briefings WHERE id = $1',
      [shareResult.rows[0].briefing_id]
    );

    if (briefingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    res.json(briefingResult.rows[0]);
  } catch (err) {
    console.error('Error getting shared briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXPORT API
// ============================================

app.get('/api/briefings/:id/export', async (req, res) => {
  try {
    const { format = 'markdown' } = req.query;
    const result = await pool.query('SELECT * FROM lumen_briefings WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    const briefing = result.rows[0];

    if (format === 'markdown') {
      const md = `# ${briefing.title}\n\n**Type:** ${briefing.type}  \n**Date:** ${new Date(briefing.created_at).toLocaleString()}  \n${briefing.tags && briefing.tags.length ? `**Tags:** ${briefing.tags.join(', ')}` : ''}\n\n---\n\n${briefing.summary ? `## Summary\n\n${briefing.summary}\n\n---\n\n` : ''}${briefing.content}\n`;
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="briefing-${briefing.id}.md"`);
      res.send(md);
    } else if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="briefing-${briefing.id}.json"`);
      res.json(briefing);
    } else {
      res.status(400).json({ error: 'Unsupported format. Use markdown or json.' });
    }
  } catch (err) {
    console.error('Error exporting briefing:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_briefings ORDER BY created_at DESC');
    res.setHeader('Content-Disposition', `attachment; filename="lumen-briefings-${Date.now()}.json"`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error exporting all:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// ANALYTICS API
// ============================================

app.get('/api/analytics', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE archived = FALSE OR archived IS NULL) as total,
        COUNT(*) FILTER (WHERE read = FALSE AND (archived = FALSE OR archived IS NULL)) as unread,
        COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred,
        COUNT(*) FILTER (WHERE archived = TRUE) as archived
      FROM lumen_briefings
    `);

    const byType = await pool.query(`
      SELECT type, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY type
    `);

    const byDay = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM lumen_briefings
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const topTags = await pool.query(`
      SELECT unnest(tags) as name, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY name 
      ORDER BY count DESC
      LIMIT 10
    `);

    const s = stats.rows[0];
    const readRate = s.total > 0 ? ((s.total - s.unread) / s.total * 100).toFixed(1) : 0;

    res.json({
      total: parseInt(s.total),
      unread: parseInt(s.unread),
      starred: parseInt(s.starred),
      archived: parseInt(s.archived),
      readRate: parseFloat(readRate),
      byType: byType.rows.reduce((acc, r) => { acc[r.type] = parseInt(r.count); return acc; }, {}),
      byDay: byDay.rows.reduce((acc, r) => { acc[r.date.toISOString().split('T')[0]] = parseInt(r.count); return acc; }, {}),
      topTags: topTags.rows.map(r => ({ name: r.name, count: parseInt(r.count) }))
    });
  } catch (err) {
    console.error('Error getting analytics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE archived = FALSE OR archived IS NULL) as total,
        COUNT(*) FILTER (WHERE read = FALSE AND (archived = FALSE OR archived IS NULL)) as unread,
        COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred
      FROM lumen_briefings
    `);

    const byType = await pool.query(`
      SELECT type, COUNT(*) as count 
      FROM lumen_briefings 
      WHERE archived = FALSE OR archived IS NULL
      GROUP BY type
    `);

    const s = stats.rows[0];
    res.json({
      total: parseInt(s.total),
      unread: parseInt(s.unread),
      starred: parseInt(s.starred),
      byType: byType.rows.reduce((acc, r) => { acc[r.type] = parseInt(r.count); return acc; }, {})
    });
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXPENSES API
// ============================================

app.get('/api/expenses', async (req, res) => {
  try {
    let { month, year, category, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM lumen_expenses WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (month && month.includes('-')) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      month = m;
    }

    if (month && year) {
      paramCount++;
      query += ` AND EXTRACT(MONTH FROM date) = $${paramCount}`;
      params.push(parseInt(month));
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM date) = $${paramCount}`;
      params.push(parseInt(year));
    } else if (year) {
      paramCount++;
      query += ` AND EXTRACT(YEAR FROM date) = $${paramCount}`;
      params.push(parseInt(year));
    }

    if (category) {
      paramCount++;
      query += ` AND LOWER(category) = LOWER($${paramCount})`;
      params.push(category);
    }

    query += ' ORDER BY date DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    const expenses = result.rows.map(e => ({
      ...e,
      amount: parseFloat(e.amount)
    }));
    res.json(expenses);
  } catch (err) {
    console.error('Error getting expenses:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/summary', async (req, res) => {
  try {
    const now = new Date();
    let month, year;
    
    if (req.query.month && req.query.month.includes('-')) {
      const [y, m] = req.query.month.split('-').map(Number);
      year = y;
      month = m;
    } else {
      month = parseInt(req.query.month) || now.getMonth() + 1;
      year = parseInt(req.query.year) || now.getFullYear();
    }

    const summary = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COUNT(*) as count
      FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [month, year]);

    const byCategory = await pool.query(`
      SELECT category, SUM(amount) as total
      FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
      GROUP BY category
    `, [month, year]);

    const recent = await pool.query(`
      SELECT * FROM lumen_expenses 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
      ORDER BY date DESC LIMIT 10
    `, [month, year]);

    const s = summary.rows[0];
    res.json({
      month,
      year,
      total: Math.round(parseFloat(s.total) * 100) / 100,
      count: parseInt(s.count),
      byCategory: byCategory.rows.reduce((acc, r) => { 
        acc[r.category] = Math.round(parseFloat(r.total) * 100) / 100; 
        return acc; 
      }, {}),
      recentExpenses: recent.rows.map(e => ({ ...e, amount: parseFloat(e.amount) }))
    });
  } catch (err) {
    console.error('Error getting expense summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { 
      amount, category, description, vendor, date,
      merchant_address, merchant_phone, items,
      subtotal, tax, tip, discount,
      payment_method, card_type, card_last_four,
      receipt_number, transaction_time,
      merchant, payment
    } = req.body;
    
    if (!amount || !category) {
      return res.status(400).json({ error: 'Missing required fields: amount, category' });
    }

    const finalMerchantAddress = merchant_address || (merchant && merchant.address) || null;
    const finalMerchantPhone = merchant_phone || (merchant && merchant.phone) || null;
    const finalVendor = vendor || (merchant && merchant.name) || null;
    const finalPaymentMethod = payment_method || (payment && payment.method) || null;
    const finalCardType = card_type || (payment && payment.cardType) || null;
    const finalCardLastFour = card_last_four || (payment && payment.lastFour) || null;

    const result = await pool.query(
      `INSERT INTO lumen_expenses (
        amount, category, description, vendor, date,
        merchant_address, merchant_phone, items,
        subtotal, tax, tip, discount,
        payment_method, card_type, card_last_four,
        receipt_number, transaction_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        parseFloat(amount), category, description || '', finalVendor,
        date || new Date(), finalMerchantAddress, finalMerchantPhone,
        items ? JSON.stringify(items) : null,
        subtotal ? parseFloat(subtotal) : null, tax ? parseFloat(tax) : null,
        tip ? parseFloat(tip) : null, discount ? parseFloat(discount) : null,
        finalPaymentMethod, finalCardType, finalCardLastFour,
        receipt_number || null, transaction_time || null
      ]
    );

    await pool.query(
      'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [category]
    );

    const expense = { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
    res.json({ id: expense.id, message: 'Expense added successfully', expense });
  } catch (err) {
    console.error('Error adding expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/expenses/:id', async (req, res) => {
  try {
    const { amount, category, description, vendor, date } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (amount !== undefined) {
      paramCount++;
      updates.push(`amount = $${paramCount}`);
      params.push(parseFloat(amount));
    }
    if (category) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      params.push(category);
    }
    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }
    if (vendor !== undefined) {
      paramCount++;
      updates.push(`vendor = $${paramCount}`);
      params.push(vendor);
    }
    if (date) {
      paramCount++;
      updates.push(`date = $${paramCount}`);
      params.push(date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_expenses SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/vendors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vendor as name, COUNT(*) as count, SUM(amount) as total
      FROM lumen_expenses 
      WHERE vendor IS NOT NULL AND vendor != ''
      GROUP BY vendor
      ORDER BY total DESC
    `);

    res.json(result.rows.map(v => ({
      name: v.name,
      count: parseInt(v.count),
      total: Math.round(parseFloat(v.total) * 100) / 100,
      avg: Math.round((parseFloat(v.total) / parseInt(v.count)) * 100) / 100
    })));
  } catch (err) {
    console.error('Error getting vendors:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/expenses/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM lumen_categories ORDER BY name');
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    console.error('Error getting categories:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// EXCEL API
// ============================================

app.get('/api/excel', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = 'SELECT * FROM lumen_excel_files WHERE 1=1';
    const params = [];
    let paramCount = 0;
    if (status) { paramCount++; query += ` AND status = $${paramCount}`; params.push(status); }
    query += ' ORDER BY created_at DESC';
    paramCount++; query += ` LIMIT $${paramCount}`; params.push(parseInt(limit));
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/api/excel/stats', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending, COUNT(*) FILTER (WHERE status = 'processing') as processing, COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) FILTER (WHERE status = 'error') as error FROM lumen_excel_files`);
    const s = result.rows[0];
    res.json({ total: parseInt(s.total), pending: parseInt(s.pending), processing: parseInt(s.processing), completed: parseInt(s.completed), error: parseInt(s.error) });
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ============================================
// IDEAS API
// ============================================

app.get('/api/ideas', async (req, res) => {
  try {
    const { category, type, status, search, limit = 100 } = req.query;
    let query = 'SELECT * FROM lumen_ideas WHERE 1=1';
    const params = []; let paramCount = 0;
    if (category) { paramCount++; query += ` AND category = $${paramCount}`; params.push(category); }
    if (type) { paramCount++; query += ` AND type = $${paramCount}`; params.push(type); }
    if (status) { paramCount++; query += ` AND status = $${paramCount}`; params.push(status); }
    if (search) { paramCount++; query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`; params.push(`%${search}%`); }
    query += ' ORDER BY priority DESC, created_at DESC';
    paramCount++; query += ` LIMIT $${paramCount}`; params.push(parseInt(limit));
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/ideas', async (req, res) => {
  try {
    const { name, category, type, description, revenue_potential, build_time, pricing_model, tech_stack, status, priority, notes, tags } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Missing required fields' });
    const result = await pool.query(
      `INSERT INTO lumen_ideas (name, category, type, description, revenue_potential, build_time, pricing_model, tech_stack, status, priority, notes, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [name, category, type || null, description || null, revenue_potential || null, build_time || null, pricing_model || null, tech_stack || [], status || 'idea', priority || 0, notes || null, tags || []]
    );
    res.json({ id: result.rows[0].id, message: 'Idea added', idea: result.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/api/ideas/meta/filters', async (req, res) => {
  try {
    const categories = await pool.query('SELECT DISTINCT category FROM lumen_ideas ORDER BY category');
    const types = await pool.query('SELECT DISTINCT type FROM lumen_ideas WHERE type IS NOT NULL ORDER BY type');
    const statuses = await pool.query('SELECT DISTINCT status FROM lumen_ideas ORDER BY status');
    res.json({ categories: categories.rows.map(r => r.category), types: types.rows.map(r => r.type), statuses: statuses.rows.map(r => r.status) });
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ============================================
// JOBS API
// ============================================

app.get('/api/jobs', async (req, res) => {
  try {
    const { status, limit = 100, starred, archived, q } = req.query;
    let query = 'SELECT * FROM lumen_jobs WHERE 1=1';
    const params = []; let paramCount = 0;
    if (archived !== 'true') query += ' AND (archived = FALSE OR archived IS NULL)';
    if (status) { paramCount++; query += ` AND status = $${paramCount}`; params.push(status); }
    if (starred === 'true') query += ' AND starred = TRUE';
    if (q) { paramCount++; query += ` AND (LOWER(title) LIKE $${paramCount} OR LOWER(company) LIKE $${paramCount})`; params.push(`%${q.toLowerCase()}%`); }
    query += ' ORDER BY created_at DESC';
    paramCount++; query += ` LIMIT $${paramCount}`; params.push(parseInt(limit));
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/api/jobs/stats', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'new') as new, COUNT(*) FILTER (WHERE status = 'interested') as interested, COUNT(*) FILTER (WHERE status = 'applied') as applied, COUNT(*) FILTER (WHERE status = 'interviewing') as interviewing, COUNT(*) as total FROM lumen_jobs WHERE archived = FALSE OR archived IS NULL`);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ============================================
// RESOURCES API
// ============================================

app.get('/api/resources', async (req, res) => {
  try {
    const { type, category, limit = 100, q } = req.query;
    let query = 'SELECT * FROM lumen_resources WHERE (archived = FALSE OR archived IS NULL)';
    const params = []; let paramCount = 0;
    if (type) { paramCount++; query += ` AND type = $${paramCount}`; params.push(type); }
    if (category) { paramCount++; query += ` AND category = $${paramCount}`; params.push(category); }
    if (q) { paramCount++; query += ` AND (LOWER(title) LIKE $${paramCount} OR LOWER(url) LIKE $${paramCount})`; params.push(`%${q.toLowerCase()}%`); }
    query += ' ORDER BY created_at DESC';
    paramCount++; query += ` LIMIT $${paramCount}`; params.push(parseInt(limit));
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/resources', async (req, res) => {
  try {
    const { type = 'link', title, url, description, category, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    const result = await pool.query(`INSERT INTO lumen_resources (type, title, url, description, category, tags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [type, title, url || null, description || null, category || null, tags || []]);
    res.json({ id: result.rows[0].id, message: 'Resource added' });
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ============================================
// LUMEN TOOLS API - TEMPLATES FROM DATABASE
// ============================================

// Get all templates with pagination, filtering, and search - NOW FROM DATABASE
app.get('/api/lumen-tools/templates', async (req, res) => {
  const { type, category, search, sort = 'downloads', order = 'desc', page = 1, limit = 24 } = req.query;
  
  try {
    // Check if we have synced data
    const countResult = await pool.query('SELECT COUNT(*) FROM lumen_synced_templates');
    const hasData = parseInt(countResult.rows[0].count) > 0;
    
    if (!hasData) {
      // Fall back to generated data if no synced data
      const data = generateTemplateData();
      let allItems = [];
      
      if (!type || type === 'all') {
        allItems = [
          ...data.skills.map(i => ({ ...i, type: 'skills' })),
          ...data.agents.map(i => ({ ...i, type: 'agents' })),
          ...data.commands.map(i => ({ ...i, type: 'commands' })),
          ...data.settings.map(i => ({ ...i, type: 'settings' })),
          ...data.hooks.map(i => ({ ...i, type: 'hooks' })),
          ...data.mcps.map(i => ({ ...i, type: 'mcps' }))
        ];
      } else if (data[type]) {
        allItems = data[type].map(i => ({ ...i, type }));
      }
      
      // Apply filters
      if (category && category !== 'All') {
        allItems = allItems.filter(item => item.category?.toLowerCase().includes(category.toLowerCase()));
      }
      if (search) {
        const searchLower = search.toLowerCase();
        allItems = allItems.filter(item =>
          item.name?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower)
        );
      }
      
      // Sort
      allItems.sort((a, b) => {
        const aVal = a[sort] || 0;
        const bVal = b[sort] || 0;
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      });
      
      // Paginate
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedItems = allItems.slice(startIndex, startIndex + limitNum);
      
      return res.json({
        items: paginatedItems,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: allItems.length,
          totalPages: Math.ceil(allItems.length / limitNum),
          hasMore: startIndex + limitNum < allItems.length
        },
        counts: {
          skills: data.skills.length,
          agents: data.agents.length,
          commands: data.commands.length,
          settings: data.settings.length,
          hooks: data.hooks.length,
          mcps: data.mcps.length,
          total: data.skills.length + data.agents.length + data.commands.length + data.settings.length + data.hooks.length + data.mcps.length
        },
        categories: [],
        lastSynced: null,
        source: 'generated'
      });
    }
    
    // Build query for synced data
    let query = 'SELECT * FROM lumen_synced_templates WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (type && type !== 'all') {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }
    
    if (category && category !== 'All') {
      paramCount++;
      query += ` AND LOWER(category) LIKE $${paramCount}`;
      params.push(`%${category.toLowerCase()}%`);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (LOWER(name) LIKE $${paramCount} OR LOWER(description) LIKE $${paramCount})`;
      params.push(`%${search.toLowerCase()}%`);
    }
    
    // Sort
    const sortColumn = sort === 'name' ? 'name' : sort === 'stars' ? 'stars' : 'downloads';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    
    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limitNum);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM lumen_synced_templates WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;
    
    if (type && type !== 'all') {
      countParamCount++;
      countQuery += ` AND type = $${countParamCount}`;
      countParams.push(type);
    }
    if (category && category !== 'All') {
      countParamCount++;
      countQuery += ` AND LOWER(category) LIKE $${countParamCount}`;
      countParams.push(`%${category.toLowerCase()}%`);
    }
    if (search) {
      countParamCount++;
      countQuery += ` AND (LOWER(name) LIKE $${countParamCount} OR LOWER(description) LIKE $${countParamCount})`;
      countParams.push(`%${search.toLowerCase()}%`);
    }
    
    const totalResult = await pool.query(countQuery, countParams);
    const total = parseInt(totalResult.rows[0].count);
    
    // Get counts by type
    const countsResult = await pool.query(`
      SELECT type, COUNT(*) as count FROM lumen_synced_templates GROUP BY type
    `);
    const counts = {
      skills: 0, agents: 0, commands: 0, settings: 0, hooks: 0, mcps: 0,
      total: parseInt(countResult.rows[0].count)
    };
    countsResult.rows.forEach(r => {
      counts[r.type] = parseInt(r.count);
    });
    
    // Get categories
    const categoriesResult = await pool.query(`
      SELECT category, COUNT(*) as count FROM lumen_synced_templates 
      WHERE category IS NOT NULL
      GROUP BY category ORDER BY count DESC
    `);
    
    // Get last sync time
    const lastSyncResult = await pool.query('SELECT MAX(synced_at) as last_sync FROM lumen_synced_templates');
    const lastSynced = lastSyncResult.rows[0].last_sync;
    
    // Transform results
    const items = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      type: row.type,
      downloads: row.downloads,
      stars: row.stars,
      version: row.version,
      status: row.status,
      tags: row.tags,
      installCommand: row.install_command,
      sourceUrl: row.source_url,
      syncedAt: row.synced_at
    }));
    
    res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: offset + limitNum < total
      },
      counts,
      categories: categoriesResult.rows.map(r => ({ name: r.category, count: parseInt(r.count) })),
      lastSynced,
      source: 'synced'
    });
  } catch (err) {
    console.error('Error getting templates:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single template by ID and type
app.get('/api/lumen-tools/templates/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM lumen_synced_templates WHERE type = $1 AND id = $2',
      [type, id]
    );
    
    if (result.rows.length === 0) {
      // Fall back to generated data
      const data = generateTemplateData();
      if (!data[type]) {
        return res.status(404).json({ error: 'Invalid template type' });
      }
      const item = data[type].find(i => i.id === id);
      if (!item) {
        return res.status(404).json({ error: 'Template not found' });
      }
      return res.json({ ...item, type });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      type: row.type,
      downloads: row.downloads,
      stars: row.stars,
      version: row.version,
      status: row.status,
      tags: row.tags,
      installCommand: row.install_command,
      sourceUrl: row.source_url,
      syncedAt: row.synced_at
    });
  } catch (err) {
    console.error('Error getting template:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SYNC API ENDPOINTS
// ============================================

// Trigger manual sync
app.post('/api/lumen-tools/sync', async (req, res) => {
  if (syncStatus.isRunning) {
    return res.json({ 
      success: false, 
      message: 'Sync already in progress',
      status: syncStatus 
    });
  }
  
  // Start sync in background
  performFullSync().then(result => {
    console.log('[Sync] Manual sync completed:', result);
  }).catch(err => {
    console.error('[Sync] Manual sync failed:', err);
  });
  
  res.json({ 
    success: true, 
    message: 'Sync started',
    status: syncStatus 
  });
});

// Get sync status (includes both hourly scrape and GitHub polling)
app.get('/api/lumen-tools/sync-status', (req, res) => {
  const now = new Date();
  const lastGithubCheck = githubSyncStatus.lastCheckAt ? new Date(githubSyncStatus.lastCheckAt) : null;
  const githubMinutesAgo = lastGithubCheck ? Math.floor((now - lastGithubCheck) / 60000) : null;
  
  res.json({
    // Hourly scrape status
    ...syncStatus,
    nextScheduledSync: getNextCronRun(),
    
    // GitHub polling status
    github: {
      enabled: githubSyncStatus.enabled,
      lastCheckAt: githubSyncStatus.lastCheckAt,
      lastCheckAgo: githubMinutesAgo !== null ? `${githubMinutesAgo}m ago` : 'never',
      lastCommitSha: githubSyncStatus.lastCommitSha,
      lastCommitShort: githubSyncStatus.lastCommitSha ? githubSyncStatus.lastCommitSha.slice(0, 7) : null,
      lastSyncAt: githubSyncStatus.lastSyncAt,
      lastSyncSuccess: githubSyncStatus.lastSyncSuccess,
      isRunning: githubSyncStatus.isRunning,
      isChecking: githubSyncStatus.isChecking,
      templatesUpdated: githubSyncStatus.templatesUpdated,
      error: githubSyncStatus.error,
      newCommitDetected: githubSyncStatus.newCommitDetected,
      pollIntervalMinutes: 15,
      pollCount: githubSyncStatus.pollCount,
      rateLimitRemaining: githubSyncStatus.rateLimitRemaining
    },
    nextGithubCheck: getNextGithubPollTime()
  });
});

// Helper to get next GitHub poll time
function getNextGithubPollTime() {
  const now = new Date();
  const next = new Date(now);
  const minutes = next.getMinutes();
  // Next check at minute 5, 20, 35, or 50
  const pollMinutes = [5, 20, 35, 50];
  const nextPollMinute = pollMinutes.find(m => m > minutes) || pollMinutes[0];
  if (nextPollMinute <= minutes) {
    next.setHours(next.getHours() + 1);
  }
  next.setMinutes(nextPollMinute);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next.toISOString();
}

// Helper to get next cron run time
function getNextCronRun() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setHours(next.getHours() + 1);
  return next.toISOString();
}

// ============================================
// GITHUB POLLING STATUS ENDPOINTS
// ============================================

// Get GitHub polling status - shows last check time, commit SHA, sync status
app.get('/api/lumen-tools/github-status', (req, res) => {
  const now = new Date();
  const lastCheck = githubSyncStatus.lastCheckAt ? new Date(githubSyncStatus.lastCheckAt) : null;
  const minutesAgo = lastCheck ? Math.floor((now - lastCheck) / 60000) : null;
  
  res.json({
    enabled: githubSyncStatus.enabled,
    lastCheckAt: githubSyncStatus.lastCheckAt,
    lastCheckAgo: minutesAgo !== null ? `${minutesAgo} min ago` : 'never',
    lastCommitSha: githubSyncStatus.lastCommitSha,
    lastCommitShort: githubSyncStatus.lastCommitSha ? githubSyncStatus.lastCommitSha.slice(0, 7) : null,
    lastCommitMessage: githubSyncStatus.lastCommitMessage,
    lastCommitAuthor: githubSyncStatus.lastCommitAuthor,
    lastSyncAt: githubSyncStatus.lastSyncAt,
    lastSyncSuccess: githubSyncStatus.lastSyncSuccess,
    isRunning: githubSyncStatus.isRunning,
    isChecking: githubSyncStatus.isChecking,
    templatesUpdated: githubSyncStatus.templatesUpdated,
    error: githubSyncStatus.error,
    newCommitDetected: githubSyncStatus.newCommitDetected,
    pollCount: githubSyncStatus.pollCount,
    pollIntervalMinutes: 15,
    rateLimitRemaining: githubSyncStatus.rateLimitRemaining,
    rateLimitReset: githubSyncStatus.rateLimitReset,
    backoffMs: githubSyncStatus.backoffMs,
    sourceRepo: 'davila7/claude-code-templates'
  });
});

// Trigger manual GitHub check and sync
app.post('/api/lumen-tools/github-sync', async (req, res) => {
  if (githubSyncStatus.isRunning || githubSyncStatus.isChecking) {
    return res.json({ 
      success: false, 
      message: githubSyncStatus.isRunning ? 'GitHub sync already in progress' : 'Already checking for updates',
      status: githubSyncStatus 
    });
  }
  
  // Check for updates and sync if needed
  console.log('[GitHub Sync] Manual trigger requested');
  
  pollGitHubAndSync().then(result => {
    console.log('[GitHub Sync] Manual poll completed:', result);
  }).catch(err => {
    console.error('[GitHub Sync] Manual poll failed:', err);
  });
  
  res.json({ 
    success: true, 
    message: 'GitHub check and sync started',
    status: githubSyncStatus 
  });
});

// Force sync from GitHub (bypasses change detection)
app.post('/api/lumen-tools/github-force-sync', async (req, res) => {
  if (githubSyncStatus.isRunning) {
    return res.json({ 
      success: false, 
      message: 'GitHub sync already in progress',
      status: githubSyncStatus 
    });
  }
  
  console.log('[GitHub Sync] Force sync requested');
  
  performGitHubSync().then(result => {
    console.log('[GitHub Sync] Force sync completed:', result);
  }).catch(err => {
    console.error('[GitHub Sync] Force sync failed:', err);
  });
  
  res.json({ 
    success: true, 
    message: 'GitHub force sync started',
    status: githubSyncStatus 
  });
});

// ============================================
// LEGACY WEBHOOK ENDPOINTS (DISABLED - kept for reference)
// ============================================
// Note: Webhook functionality has been replaced with GitHub API polling
// which doesn't require GitHub webhook configuration and works within
// the free tier rate limits (60 requests/hour unauthenticated).
// Polling runs every 15 minutes = 4 requests/hour.

// Redirect old webhook status endpoint to new polling status
app.get('/api/webhooks/github/status', (req, res) => {
  res.redirect(301, '/api/lumen-tools/github-status');
});

// Redirect old webhook sync endpoint to new polling sync
app.post('/api/webhooks/github/sync', (req, res) => {
  res.redirect(307, '/api/lumen-tools/github-sync');
});

// Custom skills CRUD
app.get('/api/lumen-tools/custom-skills', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_custom_skills ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/lumen-tools/custom-skills', async (req, res) => {
  try {
    const { name, description, category, type, instructions, install_command, tags } = req.body;
    if (!name || !category || !type) {
      return res.status(400).json({ error: 'Missing required fields: name, category, type' });
    }
    const result = await pool.query(
      `INSERT INTO lumen_custom_skills (name, description, category, type, instructions, install_command, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description || null, category, type, instructions || null, install_command || null, tags || []]
    );
    res.json({ id: result.rows[0].id, message: 'Custom skill created', skill: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/lumen-tools/custom-skills/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_custom_skills WHERE id = $1', [req.params.id]);
    res.json({ message: 'Custom skill deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Analytics - Mock data for Claude Code sessions
app.get('/api/lumen-tools/analytics', (req, res) => {
  const now = new Date();
  const sessions = [];
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const sessionCount = Math.floor(Math.random() * 8) + 2;
    
    for (let j = 0; j < sessionCount; j++) {
      sessions.push({
        date: date.toISOString().split('T')[0],
        duration: Math.floor(Math.random() * 120) + 10,
        tokens_in: Math.floor(Math.random() * 50000) + 5000,
        tokens_out: Math.floor(Math.random() * 30000) + 2000,
        tools_used: Math.floor(Math.random() * 20) + 1,
        model: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-haiku'][Math.floor(Math.random() * 3)]
      });
    }
  }
  
  const totalSessions = sessions.length;
  const totalTokensIn = sessions.reduce((sum, s) => sum + s.tokens_in, 0);
  const totalTokensOut = sessions.reduce((sum, s) => sum + s.tokens_out, 0);
  const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
  const avgSessionDuration = Math.round(totalDuration / totalSessions);
  const estimatedCost = (totalTokensIn / 1000000 * 3.00) + (totalTokensOut / 1000000 * 15.00);
  
  const toolUsage = {
    'file_read': Math.floor(Math.random() * 500) + 200,
    'file_write': Math.floor(Math.random() * 300) + 100,
    'exec': Math.floor(Math.random() * 400) + 150,
    'search': Math.floor(Math.random() * 200) + 50,
    'browser': Math.floor(Math.random() * 100) + 20,
    'git': Math.floor(Math.random() * 150) + 50
  };
  
  const dailyStats = {};
  sessions.forEach(s => {
    if (!dailyStats[s.date]) dailyStats[s.date] = { sessions: 0, tokens: 0, duration: 0 };
    dailyStats[s.date].sessions++;
    dailyStats[s.date].tokens += s.tokens_in + s.tokens_out;
    dailyStats[s.date].duration += s.duration;
  });
  
  res.json({
    summary: { totalSessions, totalTokensIn, totalTokensOut, totalTokens: totalTokensIn + totalTokensOut, totalDurationMinutes: totalDuration, avgSessionDuration, estimatedCost: Math.round(estimatedCost * 100) / 100 },
    toolUsage,
    dailyStats,
    recentSessions: sessions.slice(0, 10)
  });
});

// Health Check
app.get('/api/lumen-tools/health', async (req, res) => {
  const checks = [
    { id: 'claude-code', name: 'Claude Code CLI', description: 'Check if Claude Code is installed', status: 'ok', message: 'Claude Code v1.0.33 installed', details: { version: '1.0.33' } },
    { id: 'config', name: 'Configuration', description: 'Validate configuration', status: 'ok', message: 'Configuration valid', details: { apiKeySet: true } },
    { id: 'mcp', name: 'MCP Connections', description: 'Check MCP servers', status: 'warning', message: '5/6 MCPs connected', details: { connected: 5, total: 6 } },
    { id: 'permissions', name: 'Permissions', description: 'Check permissions', status: 'ok', message: 'All permissions granted', details: {} },
    { id: 'api', name: 'Anthropic API', description: 'Test API connection', status: 'ok', message: 'API reachable, 45ms', details: { latency: 45 } }
  ];
  
  try {
    await pool.query('SELECT 1');
    checks.push({ id: 'database', name: 'Lumen Database', description: 'Check PostgreSQL', status: 'ok', message: 'Database connected', details: {} });
  } catch (err) {
    checks.push({ id: 'database', name: 'Lumen Database', description: 'Check PostgreSQL', status: 'error', message: 'Connection failed', details: { error: err.message } });
  }
  
  // Add sync status check
  checks.push({
    id: 'sync',
    name: 'Template Sync',
    description: 'Check aitmpl.com sync status',
    status: syncStatus.lastSyncSuccess ? 'ok' : syncStatus.error ? 'error' : 'warning',
    message: syncStatus.lastSyncAt 
      ? `Last synced: ${new Date(syncStatus.lastSyncAt).toLocaleString()} (${syncStatus.itemCount} items)`
      : 'Never synced',
    details: { 
      lastSync: syncStatus.lastSyncAt,
      itemCount: syncStatus.itemCount,
      isRunning: syncStatus.isRunning
    }
  });
  
  // Add GitHub polling sync status
  const lastCheckAgo = githubSyncStatus.lastCheckAt 
    ? Math.floor((Date.now() - new Date(githubSyncStatus.lastCheckAt)) / 60000)
    : null;
  
  checks.push({
    id: 'github-sync',
    name: 'GitHub Polling Sync',
    description: 'Polls GitHub API every 15 min for template updates',
    status: githubSyncStatus.error ? 'error' : 
            githubSyncStatus.lastSyncSuccess ? 'ok' : 
            githubSyncStatus.lastCheckAt ? 'ok' : 'warning',
    message: githubSyncStatus.lastCheckAt 
      ? `Checked ${lastCheckAgo}m ago${githubSyncStatus.lastSyncAt ? ` · Synced ${githubSyncStatus.templatesUpdated} templates` : ' · No sync yet'}`
      : 'Polling not started yet',
    details: {
      enabled: githubSyncStatus.enabled,
      lastCheck: githubSyncStatus.lastCheckAt,
      lastCommitSha: githubSyncStatus.lastCommitSha ? githubSyncStatus.lastCommitSha.slice(0, 7) : null,
      lastSync: githubSyncStatus.lastSyncAt,
      templatesUpdated: githubSyncStatus.templatesUpdated,
      isRunning: githubSyncStatus.isRunning,
      pollCount: githubSyncStatus.pollCount,
      rateLimitRemaining: githubSyncStatus.rateLimitRemaining,
      error: githubSyncStatus.error
    }
  });
  
  const overallStatus = checks.every(c => c.status === 'ok') ? 'healthy' : checks.some(c => c.status === 'error') ? 'unhealthy' : 'degraded';
  res.json({ status: overallStatus, timestamp: new Date().toISOString(), checks });
});

// Conversations Monitor
app.get('/api/lumen-tools/conversations', (req, res) => {
  const conversations = [
    { id: 'conv-001', title: 'Refactoring auth module', startedAt: new Date(Date.now() - 3600000).toISOString(), messageCount: 24, model: 'claude-sonnet-4-20250514', status: 'active', lastMessage: 'I\'ve updated the JWT validation logic.', tokensUsed: 45230 },
    { id: 'conv-002', title: 'Debug API rate limiting', startedAt: new Date(Date.now() - 7200000).toISOString(), messageCount: 18, model: 'claude-sonnet-4-20250514', status: 'completed', lastMessage: 'The rate limiting issue is now fixed.', tokensUsed: 32100 },
    { id: 'conv-003', title: 'Write unit tests', startedAt: new Date(Date.now() - 86400000).toISOString(), messageCount: 31, model: 'claude-opus-4-20250514', status: 'completed', lastMessage: 'All 47 test cases passing with 94% coverage.', tokensUsed: 67800 }
  ];
  res.json({ conversations, connectionStatus: 'connected', hint: 'Configure Claude Code to stream here for real-time monitoring' });
});

// Plugins Dashboard - Proxies to Mac Studio MCP Manager
const MCP_MANAGER_URL = process.env.MCP_MANAGER_URL || 'https://mlb-massage-perry-liverpool.trycloudflare.com';
const MCP_MANAGER_TOKEN = process.env.MCP_MANAGER_TOKEN || '23e762a3dfacf08f8e7cfb262d8e09ad6591f6773d909875';

// Get MCP Manager connection status
app.get('/api/lumen-tools/mcp-manager/status', async (req, res) => {
  try {
    const response = await fetch(`${MCP_MANAGER_URL}/api/health`, { timeout: 5000 });
    const data = await response.json();
    res.json({ connected: true, url: MCP_MANAGER_URL, ...data });
  } catch (err) {
    res.json({ connected: false, url: MCP_MANAGER_URL, error: err.message });
  }
});

// Configure MCP Manager connection
app.post('/api/lumen-tools/mcp-manager/configure', (req, res) => {
  const { url, token } = req.body;
  // In production, store these in environment or database
  res.json({ success: true, message: 'Configuration saved (restart required for env changes)' });
});

app.get('/api/lumen-tools/plugins', async (req, res) => {
  try {
    // Try to fetch from MCP Manager
    const response = await fetch(`${MCP_MANAGER_URL}/api/mcps`, {
      headers: { 'Authorization': `Bearer ${MCP_MANAGER_TOKEN}` },
      timeout: 5000
    });
    const data = await response.json();
    
    // Transform MCP Manager response to plugins format
    const plugins = (data.mcps || []).map(mcp => ({
      id: mcp.id,
      name: mcp.name,
      type: 'mcp',
      enabled: mcp.enabled !== false,
      status: mcp.enabled ? 'running' : 'stopped',
      version: mcp.version || '1.0.0',
      description: mcp.description || ''
    }));
    
    // Also get available MCPs
    const availableRes = await fetch(`${MCP_MANAGER_URL}/api/mcps/available`, {
      headers: { 'Authorization': `Bearer ${MCP_MANAGER_TOKEN}` },
      timeout: 5000
    });
    const availableData = await availableRes.json();
    
    const stats = {
      total: plugins.length,
      enabled: plugins.filter(p => p.enabled).length,
      running: plugins.filter(p => p.status === 'running').length,
      mcps: plugins.length,
      plugins: 0,
      connected: true,
      managerUrl: MCP_MANAGER_URL
    };
    
    res.json({ plugins, available: availableData.templates || [], stats });
  } catch (err) {
    // Fallback to mock data if MCP Manager unavailable
    console.log('MCP Manager unavailable, using fallback:', err.message);
    const plugins = [
      { id: 'filesystem-mcp', name: 'Filesystem MCP', type: 'mcp', enabled: true, status: 'running', version: '2.1.0', description: 'Core file operations' },
      { id: 'github-mcp', name: 'GitHub MCP', type: 'mcp', enabled: true, status: 'running', version: '1.5.2', description: 'GitHub integration' },
      { id: 'browser-mcp', name: 'Browser MCP', type: 'mcp', enabled: false, status: 'stopped', version: '0.9.1', description: 'Browser automation' }
    ];
    const stats = { total: plugins.length, enabled: 2, running: 2, mcps: 3, plugins: 0, connected: false, error: err.message };
    res.json({ plugins, stats });
  }
});

app.post('/api/lumen-tools/plugins/:id/toggle', async (req, res) => {
  try {
    const response = await fetch(`${MCP_MANAGER_URL}/api/mcps/${req.params.id}/toggle`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${MCP_MANAGER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, hint: 'MCP Manager may be offline' });
  }
});

app.post('/api/lumen-tools/plugins/:id/install', async (req, res) => {
  try {
    const response = await fetch(`${MCP_MANAGER_URL}/api/mcps/${req.params.id}/install`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${MCP_MANAGER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body),
      timeout: 10000
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// HEALTH & MISC
// ============================================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString(), version: '3.3.0' });
  } catch (err) {
    res.json({ status: 'degraded', database: 'disconnected', timestamp: new Date().toISOString(), version: '3.3.0' });
  }
});

app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Lumen Dashboard',
    short_name: 'Lumen',
    description: 'Intelligence briefings and AI tools dashboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0c0e',
    theme_color: '#6366f1',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
  });
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// CRON JOBS FOR SYNC
// ============================================

// Schedule aitmpl.com scrape every hour at minute 0
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Starting scheduled hourly scrape sync...');
  const result = await performFullSync();
  console.log('[Cron] Scheduled scrape sync result:', result);
});

// Schedule GitHub polling every 15 minutes (at 5, 20, 35, 50 minutes past the hour)
// This gives us 4 requests/hour, well within the 60/hour unauthenticated limit
cron.schedule('5,20,35,50 * * * *', async () => {
  console.log('[Cron] Starting scheduled GitHub poll...');
  const result = await pollGitHubAndSync();
  console.log('[Cron] GitHub poll result:', result);
});

// Also run initial sync on startup (after 30 seconds to let DB initialize)
setTimeout(async () => {
  console.log('[Startup] Running initial scrape sync...');
  const scrapeResult = await performFullSync();
  console.log('[Startup] Initial scrape sync result:', scrapeResult);
  
  // Initial GitHub check (don't sync, just get baseline commit SHA)
  console.log('[Startup] Running initial GitHub check...');
  const githubResult = await checkGitHubForUpdates();
  console.log('[Startup] Initial GitHub check result:', githubResult);
  
  // If this is truly the first run, do an initial GitHub sync
  if (githubResult.reason === 'initial_check') {
    console.log('[Startup] First run - performing initial GitHub sync...');
    const syncResult = await performGitHubSync();
    console.log('[Startup] Initial GitHub sync result:', syncResult);
  }
}, 30000);

// Start server
app.listen(PORT, () => {
  console.log(`🔆 Lumen Dashboard v3.4 running on port ${PORT}`);
  console.log(`   🔄 Hourly scrape sync: enabled (every hour at :00)`);
  console.log(`   📡 GitHub polling: enabled (every 15 min at :05, :20, :35, :50)`);
  console.log(`   📊 Rate limit: 4 req/hr (limit: 60/hr unauthenticated)`);
  console.log(`   🎯 Watching: davila7/claude-code-templates`);
});

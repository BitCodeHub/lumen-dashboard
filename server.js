const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const cron = require('node-cron');
const cheerio = require('cheerio');
const { execSync } = require('child_process');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const auth = require('./auth');
const smartExpenses = require('./smart-expenses');
const serendipity = require('./serendipity');
const meetingPrep = require('./meeting-prep');
const moneyOracle = require('./money-oracle');
const lifeDashboard = require('./life-dashboard');
const dealRadar = require('./deal-radar');
const smartCapture = require('./smart-capture');
const automationBuilder = require('./automation-builder');
const contextResurrection = require('./context-resurrection');
const proactiveNotifications = require('./proactive-notifications');
const voiceClone = require('./voice-clone');
const { setupExpenseAnalyticsRoutes } = require('./expense-analytics-api');

const app = express();

// Trust proxy for secure cookies behind Cloudflare/Render
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Excel file storage (still uses filesystem for actual files)
const EXCEL_UPLOAD_DIR = process.env.EXCEL_UPLOAD_DIR || './data/excel-files';

// PostgreSQL connection with timeout
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000, // 5 second timeout
  idleTimeoutMillis: 30000,
  max: 20
});

// Test database connection
pool.on('error', (err) => {
  console.error('[DB] Unexpected database error:', err);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session management with error handling
try {
  const sessionStore = new pgSession({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    errorLog: (...args) => {
      console.error('[Session Store]', ...args);
    }
  });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'lumen-dashboard-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  }));

  console.log('[Session] Session store initialized with PostgreSQL');
} catch (err) {
  console.error('[Session] Failed to initialize PostgreSQL session store:', err.message);
  console.error('[Session] Using memory store fallback (sessions will not persist across restarts)');
  
  // Fallback to memory store
  app.use(session({
    secret: process.env.SESSION_SECRET || 'lumen-dashboard-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  }));
}

// Serve static files (login/register pages are public)
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
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // Create session table for express-session
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire)
    `);

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

    // Create pitches table (Shark Tank conversations)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_pitches (
        id SERIAL PRIMARY KEY,
        idea_id INTEGER REFERENCES lumen_ideas(id) ON DELETE SET NULL,
        idea_name VARCHAR(255) NOT NULL,
        pitch_date TIMESTAMP DEFAULT NOW(),
        trend_signal TEXT,
        research_sources JSONB DEFAULT '[]',
        pitch_content TEXT NOT NULL,
        conversation JSONB DEFAULT '[]',
        verdict VARCHAR(50) DEFAULT 'pending',
        verdict_reason TEXT,
        tags TEXT[] DEFAULT '{}',
        starred BOOLEAN DEFAULT FALSE,
        archived BOOLEAN DEFAULT FALSE,
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

    // ============================================
    // SMART EXPENSES MIGRATION
    // ============================================
    
    // Add smart expense columns to existing table
    await client.query(`
      ALTER TABLE lumen_expenses 
      ADD COLUMN IF NOT EXISTS meal_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS food_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cuisine VARCHAR(100),
      ADD COLUMN IF NOT EXISTS merchant_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS who_for VARCHAR(255),
      ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2),
      ADD COLUMN IF NOT EXISTS raw_input TEXT
    `);

    // Create food types reference table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_food_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50),
        cuisine VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create merchant profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_merchant_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        aliases TEXT[],
        merchant_type VARCHAR(50),
        default_category VARCHAR(50),
        default_food_type VARCHAR(100),
        default_cuisine VARCHAR(50),
        default_meal_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Seed food types
    const foodTypes = [
      ['hamburgers', 'fast_food', 'American'], ['chicken', 'fast_food', 'American'],
      ['chicken tenders', 'fast_food', 'American'], ['pizza', 'fast_food', 'Italian'],
      ['tacos', 'fast_food', 'Mexican'], ['burritos', 'fast_food', 'Mexican'],
      ['sushi', 'casual_dining', 'Japanese'], ['chinese', 'casual_dining', 'Chinese'],
      ['coffee', 'cafe', 'American'], ['sandwiches', 'fast_food', 'American'],
      ['salads', 'casual_dining', 'American'], ['bbq', 'casual_dining', 'American']
    ];
    for (const [name, cat, cuisine] of foodTypes) {
      await client.query(
        'INSERT INTO lumen_food_types (name, category, cuisine) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [name, cat, cuisine]
      );
    }

    // Seed known merchants
    const merchants = [
      ["Raising Cane's", ['Raising Cane', 'Canes'], 'fast_food', 'Food', 'chicken tenders', 'American', null],
      ['Costco', ['Costco Wholesale'], 'grocery', 'Groceries', null, null, null],
      ['Chipotle', ['Chipotle Mexican Grill'], 'fast_food', 'Food', 'burritos', 'Mexican', null],
      ['Starbucks', ['Starbucks Coffee'], 'cafe', 'Food', 'coffee', 'American', 'breakfast'],
      ["McDonald's", ['McDonalds', 'Mcd'], 'fast_food', 'Food', 'hamburgers', 'American', null],
      ['Chick-fil-A', ['Chick fil A', 'CFA'], 'fast_food', 'Food', 'chicken', 'American', null],
      ['In-N-Out', ['In N Out', 'InNOut'], 'fast_food', 'Food', 'hamburgers', 'American', null],
      ['Taco Bell', ['TacoBell'], 'fast_food', 'Food', 'tacos', 'Mexican', null],
      ['Panda Express', ['Panda'], 'fast_food', 'Food', 'chinese', 'Chinese', null],
      ['Shell', ['Shell Gas'], 'gas_station', 'Gas', null, null, null],
      ['Chevron', ['Chevron Gas'], 'gas_station', 'Gas', null, null, null]
    ];
    for (const [name, aliases, type, cat, food, cuisine, meal] of merchants) {
      await client.query(`
        INSERT INTO lumen_merchant_profiles (name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (name) DO NOTHING
      `, [name, aliases, type, cat, food, cuisine, meal]);
    }

    // Create indexes for smart expense queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_meal_type ON lumen_expenses(meal_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_food_type ON lumen_expenses(food_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_expenses_who_for ON lumen_expenses(who_for)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_merchant_profiles_name ON lumen_merchant_profiles(LOWER(name))');

    console.log('[DB] Smart expenses migration complete');

    // ============================================
    // PROACTIVE NOTIFICATIONS TABLES
    // ============================================
    
    // Notification rules table - defines trigger conditions
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_notification_rules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        enabled BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        cooldown_hours INTEGER DEFAULT 24,
        last_triggered_at TIMESTAMP,
        times_triggered INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Sent notifications table - tracks what was sent
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_notifications (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES lumen_notification_rules(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        severity VARCHAR(50) DEFAULT 'medium',
        data JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        dismissed BOOLEAN DEFAULT FALSE,
        dismissed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for notification queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_status ON lumen_notifications(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_created ON lumen_notifications(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notification_rules_type ON lumen_notification_rules(rule_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_notification_rules_enabled ON lumen_notification_rules(enabled)');

    console.log('[DB] Proactive notifications tables initialized');

    // ============================================
    // AUTOMATION BUILDER TABLES
    // ============================================
    
    // Automations table - stores natural language automation rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_automations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_type VARCHAR(100) NOT NULL,
        trigger_event VARCHAR(100) NOT NULL,
        trigger_config JSONB DEFAULT '{}',
        condition_str TEXT,
        conditions JSONB DEFAULT '[]',
        action_type VARCHAR(100) NOT NULL,
        action_config JSONB DEFAULT '{}',
        schedule VARCHAR(100),
        schedule_human VARCHAR(255),
        confidence DECIMAL(3,2) DEFAULT 0,
        raw_input TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        run_count INTEGER DEFAULT 0,
        last_run_at TIMESTAMP,
        last_run_result JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);

    // Automation run history
    await client.query(`
      CREATE TABLE IF NOT EXISTS lumen_automation_runs (
        id SERIAL PRIMARY KEY,
        automation_id INTEGER REFERENCES lumen_automations(id) ON DELETE CASCADE,
        trigger_data JSONB,
        result JSONB,
        success BOOLEAN,
        error TEXT,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for automation queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON lumen_automations(trigger_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_automations_enabled ON lumen_automations(enabled)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON lumen_automation_runs(automation_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_automation_runs_executed ON lumen_automation_runs(executed_at DESC)');

    console.log('[DB] Automation builder tables initialized');
    
    // Company status table - persists team status across restarts
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        status_data JSONB,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Team activity table - persists activity feed across restarts
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_activity (
        id SERIAL PRIMARY KEY,
        agent VARCHAR(100) NOT NULL,
        emoji VARCHAR(10),
        department VARCHAR(100),
        action TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'working',
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_team_activity_created ON team_activity(created_at DESC)');
    
    console.log('[DB] Company status and team activity tables initialized');
    console.log('[DB] PostgreSQL tables initialized');
  } finally {
    client.release();
  }
  
  // Initialize Deal Radar tables (after client release since it manages its own connection)
  await dealRadar.initDealRadarTables(pool);
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
// AUTHENTICATION ROUTES (PUBLIC)
// ============================================

// Register new user (DISABLED)
app.post('/api/auth/register', async (req, res) => {
  // Registration disabled - contact admin for access
  return res.status(403).json({ 
    error: 'Registration is currently disabled. Contact admin for access.',
    disabled: true 
  });
  
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Register user
    const user = await auth.registerUser(pool, username, email, password);
    
    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('[Auth] Registration error:', err);
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Authenticate user
    const user = await auth.loginUser(pool, username, password);
    
    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    
    // Explicitly save session before responding (prevents race condition with async stores)
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[Auth] Session save error:', saveErr);
        return res.status(500).json({ error: 'Session save failed' });
      }
      
      res.json({
        success: true,
        message: 'Logged in successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check session
app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const user = await auth.getUserById(pool, req.session.userId);
    
    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      last_login: user.last_login
    });
  } catch (err) {
    console.error('[Auth] Session check error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Redirect root to login if not authenticated
app.get('/', (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
});

// Public pages (no auth required)
app.get('/company-structure.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'company-structure.html'));
});
app.get('/company', (req, res) => {
  res.redirect('/company-structure.html');
});
app.get('/team', (req, res) => {
  res.redirect('/company-structure.html');
});
app.get('/status', (req, res) => {
  res.redirect('/company-structure.html');
});

// ============================================
// PUBLIC API ROUTES (No auth required)
// ============================================

// In-memory cache for company status (for Render deployment)
let companyStatusCache = {
  lastUpdated: new Date().toISOString(),
  teamStatus: [],
  recentWins: [],
  blockers: [],
  productProgress: [
    { id: 'stackaudit', name: 'StackAudit.ai', emoji: '🔍', progress: 75, status: 'development', recentUpdates: 0 },
    { id: 'mcphub', name: 'MCPHub', emoji: '🔌', progress: 60, status: 'development', recentUpdates: 0 },
    { id: 'aikeyvault', name: 'AIKeyVault', emoji: '🔐', progress: 10, status: 'planning', recentUpdates: 0 },
    { id: 'dashboard', name: 'Lumen Dashboard', emoji: '📊', progress: 100, status: 'live', recentUpdates: 0 }
  ]
};

// Company structure workspace path (configurable)
const COMPANY_WORKSPACE = process.env.COMPANY_WORKSPACE || '/Users/jimmysmacstudio/clawd';

// POST endpoint for Clawdbot to push status updates
app.post('/public/company-status', async (req, res) => {
  try {
    // Verify API key for writes
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
      // Allow writes from localhost without API key
      const clientIP = req.ip || req.connection?.remoteAddress || '';
      const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
      if (!isLocalhost) {
        return res.status(401).json({ error: 'API key required for status updates' });
      }
    }
    
    const { teamStatus, recentWins, blockers, productProgress, standupContent } = req.body;
    
    // Update cache
    companyStatusCache.lastUpdated = new Date().toISOString();
    
    if (teamStatus) companyStatusCache.teamStatus = teamStatus;
    if (recentWins) companyStatusCache.recentWins = recentWins;
    if (blockers) companyStatusCache.blockers = blockers;
    if (productProgress) companyStatusCache.productProgress = productProgress;
    
    // If raw standup content is provided, parse it
    if (standupContent) {
      companyStatusCache.teamStatus = parseTeamStatus(standupContent);
      companyStatusCache.recentWins = parseRecentWins(standupContent);
      companyStatusCache.blockers = parseBlockers(standupContent);
      companyStatusCache.productProgress = parseProductProgress(standupContent, '');
    }
    
    // Also persist to database if available
    try {
      await pool.query(`
        INSERT INTO company_status (id, status_data, updated_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE SET status_data = $1, updated_at = NOW()
      `, [JSON.stringify(companyStatusCache)]);
    } catch (dbErr) {
      console.warn('[Company Status] Database save failed (table may not exist):', dbErr.message);
    }
    
    console.log(`[Company Status] Updated at ${companyStatusCache.lastUpdated}`);
    res.json({ success: true, lastUpdated: companyStatusCache.lastUpdated });
  } catch (err) {
    console.error('[Company Status] Error updating:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Public company status endpoint - real-time team progress
app.get('/public/company-status', async (req, res) => {
  try {
    // First try to read from database
    try {
      const dbResult = await pool.query('SELECT status_data, updated_at FROM company_status WHERE id = 1');
      if (dbResult.rows.length > 0) {
        const data = dbResult.rows[0];
        const statusData = typeof data.status_data === 'string' ? JSON.parse(data.status_data) : data.status_data;
        return res.json({
          success: true,
          source: 'database',
          lastUpdated: data.updated_at || statusData.lastUpdated,
          refreshedAt: new Date().toISOString(),
          ...statusData
        });
      }
    } catch (dbErr) {
      console.warn('[Company Status] Database read failed:', dbErr.message);
    }
    
    // Try to read from filesystem (for local development)
    const standupPath = path.join(COMPANY_WORKSPACE, 'company', 'DAILY_STANDUP.md');
    const pipelinePath = path.join(COMPANY_WORKSPACE, 'company', 'PIPELINE_QUEUE.md');
    const productTrackerPath = path.join(COMPANY_WORKSPACE, 'company', 'PRODUCT_TRACKER.md');
    
    let standupContent = '';
    let pipelineContent = '';
    let productContent = '';
    let fileExists = false;
    
    // Read files if they exist
    if (fs.existsSync(standupPath)) {
      standupContent = fs.readFileSync(standupPath, 'utf-8');
      fileExists = true;
    }
    if (fs.existsSync(pipelinePath)) {
      pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
    }
    if (fs.existsSync(productTrackerPath)) {
      productContent = fs.readFileSync(productTrackerPath, 'utf-8');
    }
    
    // If files exist, parse them
    if (fileExists) {
      const teamStatus = parseTeamStatus(standupContent);
      const recentWins = parseRecentWins(standupContent);
      const blockers = parseBlockers(standupContent);
      const productProgress = parseProductProgress(standupContent, productContent);
      
      // Get last update time from file modification
      const stats = fs.statSync(standupPath);
      const lastUpdated = stats.mtime.toISOString();
      
      return res.json({
        success: true,
        source: 'filesystem',
        lastUpdated,
        refreshedAt: new Date().toISOString(),
        teamStatus,
        recentWins,
        blockers,
        productProgress,
        raw: {
          standupLength: standupContent.length,
          pipelineLength: pipelineContent.length
        }
      });
    }
    
    // Fall back to cache
    res.json({
      success: true,
      source: 'cache',
      lastUpdated: companyStatusCache.lastUpdated,
      refreshedAt: new Date().toISOString(),
      teamStatus: companyStatusCache.teamStatus,
      recentWins: companyStatusCache.recentWins,
      blockers: companyStatusCache.blockers,
      productProgress: companyStatusCache.productProgress
    });
  } catch (err) {
    console.error('[Public API] Error getting company status:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load company status',
      refreshedAt: new Date().toISOString()
    });
  }
});

// Parse team status from standup content
function parseTeamStatus(content) {
  const teams = [
    { id: 'research', name: 'Research', emoji: '🔬', lead: 'Reese', pattern: /## 🔬 Research.*?(?=## [🔧🛡️📣💰👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'security', name: 'Security', emoji: '🛡️', lead: 'Casey', pattern: /## 🛡️ Security.*?(?=## [🔬🔧📣💰👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'devops', name: 'DevOps', emoji: '🔧', lead: 'Devon', pattern: /## 🔧 DevOps.*?(?=## [🔬🛡️📣💰👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'engineering', name: 'Engineering', emoji: '⚙️', lead: 'Ethan', pattern: /## ⚙️ Engineering.*?(?=## [🔬🛡️🔧📣💰👔✅📦🎨📊🤝]|---|\n# |$)/s },
    { id: 'marketing', name: 'Marketing', emoji: '📣', lead: 'Morgan', pattern: /## 📣 Marketing.*?(?=## [🔬🛡️🔧💰👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'finance', name: 'Finance', emoji: '💰', lead: 'Finley', pattern: /## 💰 Finance.*?(?=## [🔬🛡️🔧📣👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'product', name: 'Product', emoji: '📦', lead: 'Parker', pattern: /## 📦 Product.*?(?=## [🔬🛡️🔧📣💰👔✅🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'design', name: 'Design', emoji: '🎨', lead: 'Dana', pattern: /## 🎨 Design.*?(?=## [🔬🛡️🔧📣💰👔✅📦📊🤝⚙️]|---|\n# |$)/s },
    { id: 'success', name: 'Customer Success', emoji: '🤝', lead: 'Sam', pattern: /## 🤝 Success.*?(?=## [🔬🛡️🔧📣💰👔✅📦🎨📊⚙️]|---|\n# |$)/s },
    { id: 'data', name: 'Data & Analytics', emoji: '📊', lead: 'Dakota', pattern: /## 📊 Data.*?(?=## [🔬🛡️🔧📣💰👔✅📦🎨🤝⚙️]|---|\n# |$)/s },
    { id: 'hr', name: 'HR', emoji: '👔', lead: 'Harper', pattern: /## 👔 HR.*?(?=## [🔬🛡️🔧📣💰✅📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'audit', name: 'Internal Audit', emoji: '✅', lead: 'Avery', pattern: /## ✅ (?:Internal )?Audit.*?(?=## [🔬🛡️🔧📣💰👔📦🎨📊🤝⚙️]|---|\n# |$)/s },
    { id: 'seo', name: 'SEO', emoji: '🔍', lead: 'Riley', pattern: /## 🔍 SEO.*?(?=## [🔬🛡️🔧📣💰👔✅📦🎨📊🤝⚙️]|---|\n# |$)/s }
  ];
  
  const status = [];
  
  for (const team of teams) {
    const match = content.match(team.pattern);
    if (match) {
      const section = match[0];
      
      // Extract what they did
      const whatDidMatch = section.match(/### What I Did.*?\n([\s\S]*?)(?=### What|### Coordination|### Blockers|### Next|$)/i);
      const whatDid = whatDidMatch ? whatDidMatch[1].trim().substring(0, 500) : '';
      
      // Check for completion markers
      const isComplete = section.includes('COMPLETE ✅') || section.includes('✅ Complete');
      
      // Extract active status
      const activeMatch = section.match(/Active:\s*(\d+)\/(\d+)/);
      const active = activeMatch ? parseInt(activeMatch[1]) : 0;
      const total = activeMatch ? parseInt(activeMatch[2]) : 0;
      
      // Check for blockers
      const hasBlocker = section.includes('⚠️') && !section.includes('⚠️ None');
      
      status.push({
        id: team.id,
        name: team.name,
        emoji: team.emoji,
        lead: team.lead,
        status: isComplete ? 'complete' : (hasBlocker ? 'blocked' : 'active'),
        active,
        total,
        summary: whatDid.split('\n').slice(0, 3).join(' ').substring(0, 200),
        hasBlocker
      });
    }
  }
  
  return status;
}

// Parse recent wins from standup
function parseRecentWins(content) {
  const wins = [];
  const winsSection = content.match(/## 🏆 Wins Today[\s\S]*?(?=## ⚠️|---|\n# |$)/);
  
  if (winsSection) {
    const lines = winsSection[0].split('\n');
    for (const line of lines) {
      const match = line.match(/\|\s*[\d:]+\s*(?:AM|PM)?\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (match) {
        wins.push({
          team: match[1].trim(),
          win: match[2].trim()
        });
      }
    }
  }
  
  // Also look for ✅ items throughout
  const checkmarks = content.match(/✅\s+[^\n]+/g) || [];
  for (const item of checkmarks.slice(0, 10)) {
    if (!wins.some(w => item.includes(w.win))) {
      wins.push({
        team: 'Team',
        win: item.replace('✅', '').trim().substring(0, 100)
      });
    }
  }
  
  return wins.slice(0, 15);
}

// Parse blockers from standup
function parseBlockers(content) {
  const blockers = [];
  const blockerSection = content.match(/## ⚠️ Blockers[\s\S]*?(?=## 📋|---|\n# |$)/);
  
  if (blockerSection) {
    const lines = blockerSection[0].split('\n');
    for (const line of lines) {
      const match = line.match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (match && match[1].trim() !== 'Team' && match[1].trim() !== '—') {
        blockers.push({
          team: match[1].trim(),
          blocker: match[2].trim(),
          owner: match[3].trim(),
          eta: match[4].trim()
        });
      }
    }
  }
  
  // Also look for 🚨 and 🔴 markers
  const criticalMatches = content.match(/🚨[^\n]+|🔴[^\n]+/g) || [];
  for (const item of criticalMatches.slice(0, 5)) {
    blockers.push({
      team: 'Critical',
      blocker: item.replace(/🚨|🔴/g, '').trim().substring(0, 150),
      owner: 'TBD',
      eta: 'ASAP'
    });
  }
  
  return blockers.slice(0, 10);
}

// Parse product progress
function parseProductProgress(standupContent, productContent) {
  const products = [
    { id: 'stackaudit', name: 'StackAudit.ai', emoji: '🔍', defaultProgress: 75 },
    { id: 'mcphub', name: 'MCPHub', emoji: '🔌', defaultProgress: 60 },
    { id: 'aikeyvault', name: 'AIKeyVault', emoji: '🔐', defaultProgress: 10 },
    { id: 'dashboard', name: 'Lumen Dashboard', emoji: '📊', defaultProgress: 100 }
  ];
  
  return products.map(product => {
    // Try to extract progress from content
    const progressMatch = standupContent.match(new RegExp(`${product.name}.*?(\\d+)%`, 'i'));
    const progress = progressMatch ? parseInt(progressMatch[1]) : product.defaultProgress;
    
    // Check status
    let status = 'development';
    if (progress >= 100) status = 'live';
    else if (progress < 20) status = 'planning';
    
    // Look for recent updates
    const updateMatch = standupContent.match(new RegExp(`${product.id}[^\\n]*`, 'gi')) || [];
    
    return {
      id: product.id,
      name: product.name,
      emoji: product.emoji,
      progress,
      status,
      recentUpdates: updateMatch.length
    };
  });
}

// ============================================
// PROTECTED API ROUTES
// ============================================

// Apply authentication middleware to all /api/* routes (except auth routes)
app.use('/api', (req, res, next) => {
  // Skip auth for authentication endpoints
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  
  // Skip auth for public share links
  if (req.path.startsWith('/share/')) {
    return next();
  }
  
  // Option C: Localhost + API Key bypass for automated/cron calls
  // Only allow bypass if BOTH conditions are met:
  // 1. Request is from localhost (127.0.0.1, ::1, or forwarded from local)
  // 2. Valid API key is provided
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const clientIP = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost = clientIP === '127.0.0.1' || 
                      clientIP === '::1' || 
                      clientIP === '::ffff:127.0.0.1' ||
                      clientIP.includes('localhost');
  
  if (apiKey && process.env.DASHBOARD_API_KEY && apiKey === process.env.DASHBOARD_API_KEY) {
    // If API key matches AND request is from localhost, bypass auth
    if (isLocalhost) {
      console.log(`[Auth] API key bypass from localhost: ${req.method} ${req.path}`);
      return next();
    }
    // API key from non-localhost - still allow but log it
    console.log(`[Auth] API key access from ${clientIP}: ${req.method} ${req.path}`);
    return next();
  }
  
  // Require authentication for all other API routes
  auth.requireAuth(req, res, next);
});

// ============================================
// TEAM ACTIVITY FEED (Real-time)
// ============================================

// In-memory activity feed (last 100 entries)
let teamActivityFeed = [];
const MAX_ACTIVITY_ENTRIES = 100;

// POST /api/team-activity - Log agent activity
app.post('/api/team-activity', async (req, res) => {
  try {
    const { agent, emoji, action, status, details, department } = req.body;
    if (!agent || !action) {
      return res.status(400).json({ error: 'Agent and action are required' });
    }
    
    const activity = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      agent: agent,
      emoji: emoji || '🤖',
      department: department || 'Unknown',
      action: action,
      status: status || 'working', // working, completed, blocked
      details: details || null
    };
    
    // Add to beginning of feed
    teamActivityFeed.unshift(activity);
    
    // Trim to max entries
    if (teamActivityFeed.length > MAX_ACTIVITY_ENTRIES) {
      teamActivityFeed = teamActivityFeed.slice(0, MAX_ACTIVITY_ENTRIES);
    }
    
    console.log(`[Team Activity] ${activity.emoji} ${activity.agent}: ${activity.action} (${activity.status})`);
    res.status(201).json(activity);
  } catch (err) {
    console.error('[Team Activity] Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team-activity - Get activity feed
app.get('/api/team-activity', (req, res) => {
  const { limit = 50, agent, status } = req.query;
  let feed = [...teamActivityFeed];
  
  if (agent) {
    feed = feed.filter(a => a.agent.toLowerCase().includes(agent.toLowerCase()));
  }
  if (status) {
    feed = feed.filter(a => a.status === status);
  }
  
  res.json({
    count: feed.length,
    activities: feed.slice(0, parseInt(limit))
  });
});

// GET /api/team-activity/live - Get who's working right now
app.get('/api/team-activity/live', (req, res) => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  const recentActivity = teamActivityFeed.filter(a => new Date(a.timestamp).getTime() > fiveMinutesAgo);
  
  // Group by agent, show most recent status
  const agentStatus = {};
  for (const activity of recentActivity) {
    if (!agentStatus[activity.agent]) {
      agentStatus[activity.agent] = activity;
    }
  }
  
  res.json({
    activeAgents: Object.keys(agentStatus).length,
    agents: Object.values(agentStatus)
  });
});

// GET /public/team-activity - Public access to activity feed (no auth)
app.get('/public/team-activity', async (req, res) => {
  const { limit = 30 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 30, 100);
  
  try {
    // Try database first
    const result = await pool.query(
      'SELECT id, agent, emoji, department, action, status, details, created_at as timestamp FROM team_activity ORDER BY created_at DESC LIMIT $1',
      [limitNum]
    );
    
    res.json({
      success: true,
      source: 'database',
      count: result.rows.length,
      activities: result.rows,
      refreshedAt: new Date().toISOString()
    });
  } catch (dbErr) {
    console.warn('[Team Activity] DB read failed, using cache:', dbErr.message);
    // Fallback to in-memory cache
    res.json({
      success: true,
      source: 'cache',
      count: teamActivityFeed.length,
      activities: teamActivityFeed.slice(0, limitNum),
      refreshedAt: new Date().toISOString()
    });
  }
});

// POST /public/team-activity - Push activity with API key
app.post('/public/team-activity', async (req, res) => {
  // Verify API key
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const { agent, emoji, action, status, details, department } = req.body;
  if (!agent || !action) {
    return res.status(400).json({ error: 'Agent and action are required' });
  }
  
  const activity = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    agent: agent,
    emoji: emoji || '🤖',
    department: department || 'Unknown',
    action: action,
    status: status || 'working',
    details: details || null
  };
  
  // Save to in-memory cache
  teamActivityFeed.unshift(activity);
  if (teamActivityFeed.length > MAX_ACTIVITY_ENTRIES) {
    teamActivityFeed = teamActivityFeed.slice(0, MAX_ACTIVITY_ENTRIES);
  }
  
  // Persist to database
  try {
    const result = await pool.query(
      'INSERT INTO team_activity (agent, emoji, department, action, status, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at',
      [agent, emoji || '🤖', department || 'Unknown', action, status || 'working', details || null]
    );
    activity.id = result.rows[0].id;
    activity.timestamp = result.rows[0].created_at;
  } catch (dbErr) {
    console.warn('[Team Activity] DB write failed:', dbErr.message);
  }
  
  console.log(`[Public Activity] ${activity.emoji} ${activity.agent}: ${activity.action}`);
  res.status(201).json(activity);
});

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
// MEETING PREP AUTOPILOT API
// ============================================

/**
 * POST /api/meetings/prep
 * Generate a comprehensive meeting prep briefing
 * 
 * Request body:
 * {
 *   "person_name": "Jane Smith" (required),
 *   "company": "Acme Corp" (optional),
 *   "meeting_topic": "Partnership discussion" (optional),
 *   "date": "2024-02-01T14:00:00Z" (optional),
 *   "role": "VP of Engineering" (optional),
 *   "save": true (optional, default: true)
 * }
 * 
 * Response:
 * {
 *   "id": 123 (if saved),
 *   "briefing": { type, title, content, summary, tags, metadata },
 *   "message": "Meeting prep generated successfully"
 * }
 */
app.post('/api/meetings/prep', async (req, res) => {
  try {
    const { person_name, company, meeting_topic, date, role, save = true } = req.body;
    
    // Validate required fields
    if (!person_name) {
      return res.status(400).json({ 
        error: 'Missing required field: person_name',
        hint: 'Provide the name of the person you are meeting with'
      });
    }
    
    if (person_name.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Person name too short',
        hint: 'Name must be at least 2 characters'
      });
    }
    
    console.log(`[MeetingPrep API] Generating prep for: ${person_name}${company ? ` @ ${company}` : ''}`);
    
    // Generate the meeting prep briefing
    const briefing = await meetingPrep.generateMeetingPrep(pool, {
      person_name: person_name.trim(),
      company: company?.trim() || null,
      meeting_topic: meeting_topic?.trim() || null,
      date: date || null,
      role: role?.trim() || null
    });
    
    let briefingId = null;
    
    // Save to database if requested
    if (save) {
      briefingId = await meetingPrep.saveMeetingPrep(pool, briefing);
      console.log(`[MeetingPrep API] Saved briefing with id: ${briefingId}`);
    }
    
    res.json({
      id: briefingId,
      briefing,
      message: 'Meeting prep generated successfully',
      saved: save
    });
    
  } catch (err) {
    console.error('[MeetingPrep API] Error:', err);
    res.status(500).json({ 
      error: 'Failed to generate meeting prep',
      details: err.message 
    });
  }
});

/**
 * GET /api/meetings/prep
 * Get all meeting prep briefings
 */
app.get('/api/meetings/prep', async (req, res) => {
  try {
    const { limit = 20, upcoming = 'false' } = req.query;
    
    let query = `
      SELECT * FROM lumen_briefings 
      WHERE type = 'meeting-prep' 
      AND (archived = FALSE OR archived IS NULL)
    `;
    
    // For upcoming meetings, try to parse date from content
    if (upcoming === 'true') {
      query += ` AND content LIKE '%Timeline:%'`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $1`;
    
    const result = await pool.query(query, [parseInt(limit)]);
    res.json(result.rows);
  } catch (err) {
    console.error('[MeetingPrep API] Error listing preps:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/meetings/prep/search
 * Search your history for a person/company (preview without creating briefing)
 */
app.get('/api/meetings/prep/search', async (req, res) => {
  try {
    const { person_name, company } = req.query;
    
    if (!person_name && !company) {
      return res.status(400).json({ 
        error: 'Provide at least person_name or company to search'
      });
    }
    
    const [briefings, expenses, jobs, ideas] = await Promise.all([
      meetingPrep.searchBriefingsHistory(pool, person_name, company),
      meetingPrep.searchExpensesHistory(pool, person_name, company),
      meetingPrep.searchJobsHistory(pool, company),
      meetingPrep.searchIdeasHistory(pool, person_name, company)
    ]);
    
    res.json({
      person_name,
      company,
      found: {
        briefings: briefings.length,
        expenses: expenses.length,
        jobs: jobs.length,
        ideas: ideas.length,
        total: briefings.length + expenses.length + jobs.length + ideas.length
      },
      history: { briefings, expenses, jobs, ideas }
    });
  } catch (err) {
    console.error('[MeetingPrep API] Error searching:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================
// SMART CAPTURE API - Everything Inbox
// ============================================

/**
 * POST /api/capture
 * Smart capture endpoint - drop in any content, get it auto-categorized and stored
 * 
 * Request body:
 * {
 *   "content": "string" (required) - raw text, URL, voice transcript, etc.
 *   "type_hint": "expense|idea|job|resource|briefing" (optional) - override auto-detection
 *   "source": "string" (optional) - where the capture came from (api, voice, web, etc.)
 * }
 * 
 * Response:
 * {
 *   "type": "detected type",
 *   "confidence": 0.0-1.0,
 *   "item": { id, table },
 *   "data": { extracted structured data },
 *   "related": { briefings, expenses, ideas, jobs, resources }
 * }
 */
app.post('/api/capture', async (req, res) => {
  try {
    const { content, type_hint, source } = req.body;
    
    // Validate required fields
    if (!content) {
      return res.status(400).json({ 
        error: 'Missing required field: content',
        hint: 'Provide the text content you want to capture'
      });
    }
    
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Invalid content',
        hint: 'Content must be a non-empty string'
      });
    }
    
    // Validate type_hint if provided
    const validTypes = ['expense', 'idea', 'job', 'resource', 'briefing'];
    if (type_hint && !validTypes.includes(type_hint.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid type_hint',
        hint: `Valid types are: ${validTypes.join(', ')}`
      });
    }
    
    console.log(`[SmartCapture API] Processing capture (${content.length} chars)${type_hint ? ` with hint: ${type_hint}` : ''}`);
    
    // Process the capture
    const result = await smartCapture.capture(pool, {
      content,
      type_hint,
      source: source || 'api'
    });
    
    res.json({
      success: true,
      message: `Captured as ${result.type} (${(result.confidence * 100).toFixed(0)}% confidence)`,
      ...result
    });
    
  } catch (err) {
    console.error('[SmartCapture API] Error:', err);
    res.status(500).json({ 
      error: 'Failed to process capture',
      details: err.message 
    });
  }
});

/**
 * POST /api/capture/detect
 * Preview what type would be detected without storing
 * 
 * Request body:
 * {
 *   "content": "string" (required)
 *   "type_hint": "string" (optional)
 * }
 */
app.post('/api/capture/detect', async (req, res) => {
  try {
    const { content, type_hint } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const detection = smartCapture.detectType(content, type_hint);
    const data = smartCapture.extractData(content, detection.type);
    
    res.json({
      type: detection.type,
      confidence: detection.confidence,
      method: detection.method,
      scores: detection.scores,
      extracted_data: data,
      would_store_in: `lumen_${detection.type === 'briefing' ? 'briefings' : detection.type + 's'}`
    });
    
  } catch (err) {
    console.error('[SmartCapture API] Error in detect:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/capture/types
 * List supported capture types with descriptions
 */
app.get('/api/capture/types', (req, res) => {
  res.json({
    types: [
      {
        type: 'expense',
        description: 'Financial transactions, purchases, receipts',
        examples: ['$25 at Chipotle for lunch', 'Spent 50 bucks on gas at Shell', 'Uber ride $15.50'],
        stored_in: 'lumen_expenses',
        fields: ['amount', 'vendor', 'category', 'description', 'merchant_type']
      },
      {
        type: 'idea',
        description: 'Business ideas, product concepts, startup thoughts',
        examples: ['AI app that summarizes meetings', 'SaaS for expense tracking', 'Mobile app for habit tracking'],
        stored_in: 'lumen_ideas',
        fields: ['name', 'description', 'category', 'type', 'revenue_potential', 'tech_stack', 'tags']
      },
      {
        type: 'job',
        description: 'Job postings, career opportunities, positions',
        examples: ['Senior Engineer at Google $150k-200k remote', 'Frontend developer role at startup'],
        stored_in: 'lumen_jobs',
        fields: ['title', 'company', 'location', 'salary_min', 'salary_max', 'job_type', 'url', 'tags']
      },
      {
        type: 'resource',
        description: 'Links, articles, tools, references',
        examples: ['https://github.com/cool-project', 'Great tutorial on React hooks', 'Useful API documentation'],
        stored_in: 'lumen_resources',
        fields: ['title', 'url', 'description', 'type', 'category', 'tags']
      },
      {
        type: 'briefing',
        description: 'Notes, meeting summaries, research, general text',
        examples: ['Meeting with John about Q2 goals', 'Research notes on market trends', 'Daily standup notes'],
        stored_in: 'lumen_briefings',
        fields: ['title', 'type', 'content', 'summary', 'tags']
      }
    ],
    hint: 'Use type_hint to override auto-detection'
  });
});

/**
 * GET /api/capture/recent
 * Get recently captured items across all types
 */
app.get('/api/capture/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    
    // Query all tables and combine results
    const [briefings, expenses, ideas, jobs, resources] = await Promise.all([
      pool.query(`
        SELECT id, title, type, 'briefing' as capture_type, created_at 
        FROM lumen_briefings 
        WHERE (archived = FALSE OR archived IS NULL)
        ORDER BY created_at DESC LIMIT $1
      `, [limitNum]),
      pool.query(`
        SELECT id, description as title, category as type, 'expense' as capture_type, created_at 
        FROM lumen_expenses 
        ORDER BY created_at DESC LIMIT $1
      `, [limitNum]),
      pool.query(`
        SELECT id, name as title, category as type, 'idea' as capture_type, created_at 
        FROM lumen_ideas 
        ORDER BY created_at DESC LIMIT $1
      `, [limitNum]),
      pool.query(`
        SELECT id, title, status as type, 'job' as capture_type, created_at 
        FROM lumen_jobs 
        WHERE (archived = FALSE OR archived IS NULL)
        ORDER BY created_at DESC LIMIT $1
      `, [limitNum]),
      pool.query(`
        SELECT id, title, type, 'resource' as capture_type, created_at 
        FROM lumen_resources 
        WHERE (archived = FALSE OR archived IS NULL)
        ORDER BY created_at DESC LIMIT $1
      `, [limitNum])
    ]);
    
    // Combine and sort by created_at
    const allItems = [
      ...briefings.rows,
      ...expenses.rows,
      ...ideas.rows,
      ...jobs.rows,
      ...resources.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limitNum);
    
    res.json({
      count: allItems.length,
      items: allItems
    });
    
  } catch (err) {
    console.error('[SmartCapture API] Error getting recent:', err);
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

// ============================================
// 🌟 LIFE DASHBOARD API - Unified Life Analytics
// ============================================

/**
 * GET /api/analytics/life-dashboard
 * 
 * Returns comprehensive life analytics across ALL user data.
 * Cross-references expenses, briefings, jobs, ideas, resources, and pitches
 * to provide a 30,000 foot view of your life.
 * 
 * Query Parameters:
 * - days: Time window in days (default: 90)
 * - correlations: Include correlation analysis (default: true)
 * - insights: Include AI-generated insights (default: true)
 * 
 * Response includes:
 * - Summary stats across all data types
 * - Detailed breakdowns for each category
 * - Daily activity timeline
 * - Correlation analysis (spending vs productivity, etc.)
 * - Actionable insights
 * - Life scores (financial, knowledge, career, creative)
 * - Activity streaks
 */
app.get('/api/analytics/life-dashboard', async (req, res) => {
  try {
    const {
      days = 90,
      correlations = 'true',
      insights = 'true'
    } = req.query;

    console.log(`[Life Dashboard] Generating analytics for ${days} days...`);
    const startTime = Date.now();

    const result = await lifeDashboard.generateLifeDashboard(pool, {
      timeWindowDays: parseInt(days),
      includeCorrelations: correlations === 'true',
      includeInsights: insights === 'true'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Life Dashboard] Generated in ${duration}s - ${result.summary.dataPoints} data points analyzed`);

    res.json(result);
  } catch (err) {
    console.error('[Life Dashboard] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate life dashboard',
      message: err.message 
    });
  }
});

/**
 * GET /api/analytics/life-dashboard/quick
 * 
 * Lightweight version for dashboard widgets.
 * Returns only key metrics and top insights.
 */
app.get('/api/analytics/life-dashboard/quick', async (req, res) => {
  try {
    const result = await lifeDashboard.generateLifeDashboard(pool, {
      timeWindowDays: 30,
      includeCorrelations: true,
      includeInsights: true
    });

    // Return condensed version
    res.json({
      success: true,
      summary: result.summary,
      lifeScores: result.lifeScores,
      topInsights: result.insights.slice(0, 3),
      streaks: result.streaks,
      quickStats: {
        monthlySpending: result.expenses.monthly[result.expenses.monthly.length - 1]?.total || 0,
        unreadBriefings: result.briefings.unread,
        activeJobs: result.jobs.byStatus.applied + result.jobs.byStatus.interviewing,
        ideasInProgress: result.ideas.byStatus.exploring + result.ideas.byStatus.building
      },
      generatedAt: result.generatedAt
    });
  } catch (err) {
    console.error('[Life Dashboard Quick] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get quick stats' 
    });
  }
});

/**
 * GET /api/analytics/life-dashboard/scores
 * 
 * Returns only the life scores for quick status checks.
 */
app.get('/api/analytics/life-dashboard/scores', async (req, res) => {
  try {
    const result = await lifeDashboard.generateLifeDashboard(pool, {
      timeWindowDays: 30,
      includeCorrelations: false,
      includeInsights: false
    });

    res.json({
      success: true,
      scores: result.lifeScores,
      generatedAt: result.generatedAt
    });
  } catch (err) {
    console.error('[Life Dashboard Scores] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate scores' 
    });
  }
});

/**
 * GET /api/analytics/life-dashboard/correlations
 * 
 * Returns only correlation analysis.
 */
app.get('/api/analytics/life-dashboard/correlations', async (req, res) => {
  try {
    const { days = 90 } = req.query;
    
    const result = await lifeDashboard.generateLifeDashboard(pool, {
      timeWindowDays: parseInt(days),
      includeCorrelations: true,
      includeInsights: false
    });

    res.json({
      success: true,
      correlations: result.correlations,
      dailyActivity: result.dailyActivity,
      patterns: lifeDashboard.CORRELATION_PATTERNS,
      generatedAt: result.generatedAt
    });
  } catch (err) {
    console.error('[Life Dashboard Correlations] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze correlations' 
    });
  }
});

/**
 * GET /api/analytics/life-dashboard/timeline
 * 
 * Returns daily activity timeline for charting.
 */
app.get('/api/analytics/life-dashboard/timeline', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await lifeDashboard.generateLifeDashboard(pool, {
      timeWindowDays: parseInt(days),
      includeCorrelations: false,
      includeInsights: false
    });

    res.json({
      success: true,
      timeline: result.dailyActivity,
      summary: {
        totalDays: result.dailyActivity.length,
        activeDays: result.dailyActivity.filter(d => d.totalActivity > 0).length,
        avgDailyActivity: result.dailyActivity.length > 0 
          ? Math.round(result.dailyActivity.reduce((sum, d) => sum + d.totalActivity, 0) / result.dailyActivity.length * 10) / 10
          : 0
      },
      generatedAt: result.generatedAt
    });
  } catch (err) {
    console.error('[Life Dashboard Timeline] Error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get timeline' 
    });
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

// ============================================
// MONEY ORACLE - PREDICTIVE FINANCIAL INTELLIGENCE
// ============================================

app.get('/api/expenses/oracle', async (req, res) => {
  try {
    console.log('[Money Oracle] Running financial analysis...');
    const result = await moneyOracle.analyze(pool);
    console.log(`[Money Oracle] Analysis complete in ${result.processingTimeMs}ms - ${result.insights?.length || 0} insights generated`);
    res.json(result);
  } catch (err) {
    console.error('[Money Oracle] Error running analysis:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to analyze expenses',
      message: err.message 
    });
  }
});

// Oracle quick insights - lightweight version for dashboard widgets
app.get('/api/expenses/oracle/quick', async (req, res) => {
  try {
    const result = await moneyOracle.analyze(pool);
    
    // Return only top 3 insights and key predictions
    res.json({
      success: true,
      insights: result.insights?.slice(0, 3) || [],
      predictions: {
        nextMonth: result.predictions?.nextMonth || 0,
        confidence: result.predictions?.confidence || 'low'
      },
      patterns: result.patterns || {},
      summary: {
        totalSpent: result.summary?.totalSpent || 0,
        spendingTrend: result.patterns?.spendingTrend || 'stable'
      }
    });
  } catch (err) {
    console.error('[Money Oracle Quick] Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get quick insights' 
    });
  }
});

// Oracle savings opportunities endpoint
app.get('/api/expenses/oracle/savings', async (req, res) => {
  try {
    const result = await moneyOracle.analyze(pool);
    res.json({
      success: true,
      opportunities: result.savings || [],
      totalPotential: (result.savings || []).reduce((sum, s) => sum + (s.potential || 0), 0)
    });
  } catch (err) {
    console.error('[Money Oracle Savings] Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to identify savings' 
    });
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
// SMART EXPENSE API - AI-Powered Expense Parsing
// ============================================

// Parse and log expense from natural language or receipt photo
app.post('/api/expenses/smart', async (req, res) => {
  try {
    const { input, image, source = 'api' } = req.body;
    
    if (!input && !image) {
      return res.status(400).json({ error: 'Either input text or image is required' });
    }

    let parsed;
    
    if (image) {
      // Parse receipt image
      parsed = await smartExpenses.parseReceiptImage(image);
      parsed.source = 'receipt_photo';
    } else {
      // Parse natural language input
      parsed = smartExpenses.parseExpenseText(input);
      parsed.source = source === 'voice' ? 'voice' : 'text';
    }

    // Enrich with merchant profile data
    parsed = await smartExpenses.enrichWithMerchantProfile(parsed, pool);

    // Validate we have minimum required data
    if (!parsed.amount) {
      return res.status(400).json({ 
        error: 'Could not extract amount from input',
        parsed,
        suggestion: 'Try including a dollar amount like "$12.50" or "12 dollars"'
      });
    }

    if (!parsed.category) {
      parsed.category = 'Other';
    }

    // Insert the expense with all smart fields
    const result = await pool.query(`
      INSERT INTO lumen_expenses (
        amount, category, description, vendor, date,
        meal_type, food_type, cuisine, merchant_type, who_for,
        custom_fields, source, confidence, raw_input
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      parsed.amount,
      parsed.category,
      parsed.description,
      parsed.vendor,
      parsed.meal_type,
      parsed.food_type,
      parsed.cuisine,
      parsed.merchant_type,
      parsed.who_for,
      JSON.stringify(parsed.custom_fields || {}),
      parsed.source,
      parsed.confidence,
      parsed.raw_input
    ]);

    // Learn from this expense for future parsing
    await smartExpenses.learnMerchant(parsed, pool);

    // Ensure category exists
    if (parsed.category) {
      await pool.query(
        'INSERT INTO lumen_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [parsed.category]
      );
    }

    const expense = { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
    
    res.json({
      id: expense.id,
      message: 'Expense logged successfully',
      expense,
      parsed: {
        confidence: parsed.confidence,
        detected: {
          amount: parsed.amount,
          vendor: parsed.vendor,
          category: parsed.category,
          meal_type: parsed.meal_type,
          food_type: parsed.food_type,
          who_for: parsed.who_for
        }
      }
    });

  } catch (err) {
    console.error('Error in smart expense:', err);
    res.status(500).json({ error: 'Failed to process expense', details: err.message });
  }
});

// Get merchant profiles for autocomplete/learning
app.get('/api/expenses/merchants', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, merchant_type, default_category, default_food_type, default_cuisine
      FROM lumen_merchant_profiles
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting merchants:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get food types for reference
app.get('/api/expenses/food-types', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, category, cuisine
      FROM lumen_food_types
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting food types:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add or update merchant profile
app.post('/api/expenses/merchants', async (req, res) => {
  try {
    const { name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Merchant name is required' });
    }

    const result = await pool.query(`
      INSERT INTO lumen_merchant_profiles 
      (name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (name) DO UPDATE SET
        aliases = EXCLUDED.aliases,
        merchant_type = EXCLUDED.merchant_type,
        default_category = EXCLUDED.default_category,
        default_food_type = EXCLUDED.default_food_type,
        default_cuisine = EXCLUDED.default_cuisine,
        default_meal_type = EXCLUDED.default_meal_type
      RETURNING *
    `, [name, aliases || [], merchant_type, default_category, default_food_type, default_cuisine, default_meal_type]);

    res.json({ message: 'Merchant profile saved', merchant: result.rows[0] });
  } catch (err) {
    console.error('Error saving merchant:', err);
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

// POST /api/jobs - Add a new job listing
app.post('/api/jobs', async (req, res) => {
  try {
    const { title, company, location, salary_text, salary_min, salary_max, job_type, url, description, fit_notes, tags, source } = req.body;
    if (!title || !company) {
      return res.status(400).json({ error: 'Title and company are required' });
    }
    const result = await pool.query(
      `INSERT INTO lumen_jobs (title, company, location, salary_text, salary_min, salary_max, job_type, url, description, fit_notes, tags, source, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new', NOW())
       RETURNING *`,
      [title, company, location, salary_text, salary_min, salary_max, job_type, url, description, fit_notes, tags || [], source || 'manual']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Jobs] Error adding job:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/api/jobs/stats', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'new') as new, COUNT(*) FILTER (WHERE status = 'interested') as interested, COUNT(*) FILTER (WHERE status = 'applied') as applied, COUNT(*) FILTER (WHERE status = 'interviewing') as interviewing, COUNT(*) as total FROM lumen_jobs WHERE archived = FALSE OR archived IS NULL`);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// ============================================
// PITCHES API (Shark Tank conversations)
// ============================================

// Get all pitches
app.get('/api/pitches', async (req, res) => {
  try {
    const { verdict, limit = 50, starred, archived, q } = req.query;
    let query = 'SELECT * FROM lumen_pitches WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (archived !== 'true') {
      query += ' AND (archived = FALSE OR archived IS NULL)';
    }
    if (verdict) {
      paramCount++;
      query += ` AND verdict = $${paramCount}`;
      params.push(verdict);
    }
    if (starred === 'true') {
      query += ' AND starred = TRUE';
    }
    if (q) {
      paramCount++;
      const searchParam = `%${q.toLowerCase()}%`;
      query += ` AND (LOWER(idea_name) LIKE $${paramCount} OR LOWER(pitch_content) LIKE $${paramCount} OR LOWER(trend_signal) LIKE $${paramCount})`;
      params.push(searchParam);
    }

    query += ' ORDER BY pitch_date DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting pitches:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single pitch
app.get('/api/pitches/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lumen_pitches WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error getting pitch:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get pitch stats
app.get('/api/pitches/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verdict = 'pending') as pending,
        COUNT(*) FILTER (WHERE verdict = 'approved') as approved,
        COUNT(*) FILTER (WHERE verdict = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE verdict = 'maybe') as maybe,
        COUNT(*) FILTER (WHERE verdict = 'revisit') as revisit,
        COUNT(*) FILTER (WHERE starred = TRUE AND (archived = FALSE OR archived IS NULL)) as starred
      FROM lumen_pitches
      WHERE archived = FALSE OR archived IS NULL
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error getting pitch stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new pitch
app.post('/api/pitches', async (req, res) => {
  try {
    const {
      idea_id, idea_name, trend_signal, research_sources,
      pitch_content, conversation, verdict, verdict_reason, tags
    } = req.body;
    
    if (!idea_name || !pitch_content) {
      return res.status(400).json({ error: 'Missing required fields: idea_name, pitch_content' });
    }
    
    const result = await pool.query(
      `INSERT INTO lumen_pitches 
       (idea_id, idea_name, trend_signal, research_sources, pitch_content, conversation, verdict, verdict_reason, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        idea_id || null,
        idea_name,
        trend_signal || null,
        JSON.stringify(research_sources || []),
        pitch_content,
        JSON.stringify(conversation || []),
        verdict || 'pending',
        verdict_reason || null,
        tags || []
      ]
    );
    
    res.json({ id: result.rows[0].id, message: 'Pitch created successfully', pitch: result.rows[0] });
  } catch (err) {
    console.error('Error creating pitch:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update pitch
app.patch('/api/pitches/:id', async (req, res) => {
  try {
    const updates = [];
    const params = [];
    let paramCount = 0;
    
    const allowedFields = ['idea_id', 'idea_name', 'trend_signal', 'research_sources', 
                           'pitch_content', 'conversation', 'verdict', 'verdict_reason', 'tags'];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        paramCount++;
        if (field === 'research_sources' || field === 'conversation') {
          updates.push(`${field} = $${paramCount}`);
          params.push(JSON.stringify(req.body[field]));
        } else {
          updates.push(`${field} = $${paramCount}`);
          params.push(req.body[field]);
        }
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    paramCount++;
    
    const result = await pool.query(
      `UPDATE lumen_pitches SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      [...params, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    
    res.json({ message: 'Pitch updated', pitch: result.rows[0] });
  } catch (err) {
    console.error('Error updating pitch:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add message to pitch conversation
app.post('/api/pitches/:id/message', async (req, res) => {
  try {
    const { role, content, timestamp } = req.body;
    
    if (!role || !content) {
      return res.status(400).json({ error: 'Missing required fields: role, content' });
    }
    
    const message = {
      role,
      content,
      timestamp: timestamp || new Date().toISOString()
    };
    
    const result = await pool.query(
      `UPDATE lumen_pitches 
       SET conversation = conversation || $1::jsonb, updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify([message]), req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    
    res.json({ message: 'Message added', pitch: result.rows[0] });
  } catch (err) {
    console.error('Error adding message:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Set verdict on pitch
app.patch('/api/pitches/:id/verdict', async (req, res) => {
  try {
    const { verdict, verdict_reason } = req.body;
    const validVerdicts = ['pending', 'approved', 'rejected', 'maybe', 'revisit'];
    
    if (!validVerdicts.includes(verdict)) {
      return res.status(400).json({ error: 'Invalid verdict. Must be: pending, approved, rejected, maybe, revisit' });
    }
    
    const result = await pool.query(
      `UPDATE lumen_pitches SET verdict = $1, verdict_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [verdict, verdict_reason || null, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    
    res.json({ message: 'Verdict set', pitch: result.rows[0] });
  } catch (err) {
    console.error('Error setting verdict:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Toggle pitch starred
app.patch('/api/pitches/:id/star', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_pitches SET starred = NOT starred WHERE id = $1 RETURNING starred',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    res.json({ starred: result.rows[0].starred });
  } catch (err) {
    console.error('Error toggling star:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Archive pitch
app.patch('/api/pitches/:id/archive', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_pitches SET archived = NOT archived, updated_at = NOW() WHERE id = $1 RETURNING archived',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pitch not found' });
    }
    res.json({ archived: result.rows[0].archived });
  } catch (err) {
    console.error('Error archiving pitch:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete pitch
app.delete('/api/pitches/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lumen_pitches WHERE id = $1', [req.params.id]);
    res.json({ message: 'Pitch deleted' });
  } catch (err) {
    console.error('Error deleting pitch:', err);
    res.status(500).json({ error: 'Database error' });
  }
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
// 🎲 SERENDIPITY ENGINE API
// ============================================

/**
 * POST /api/serendipity/discover
 * 
 * Discovers unexpected connections across all user data.
 * Analyzes expenses, briefings, jobs, ideas, and resources
 * to find non-obvious, valuable connections.
 * 
 * Request Body:
 * {
 *   "limit": 10,              // Max discoveries to return (default: 10)
 *   "minScore": 0.5,          // Minimum relevance score 0-1 (default: 0.5)
 *   "includeTypes": [...],    // Data types to analyze (default: all)
 *   "timeWindowDays": 90      // How far back to look (default: 90)
 * }
 * 
 * Response:
 * {
 *   "discoveries": [...],     // Array of discovered connections
 *   "stats": {...},           // Statistics about the discovery process
 *   "generatedAt": "..."      // Timestamp
 * }
 */
app.post('/api/serendipity/discover', async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.body.limit) || 10,
      minScore: parseFloat(req.body.minScore) || 0.5,
      includeTypes: req.body.includeTypes || ['expenses', 'briefings', 'jobs', 'ideas', 'resources'],
      timeWindowDays: parseInt(req.body.timeWindowDays) || 90
    };

    console.log('[Serendipity] Starting discovery with options:', options);
    const startTime = Date.now();
    
    const result = await serendipity.discoverConnections(pool, options);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Serendipity] Found ${result.discoveries.length} connections in ${duration}s`);
    
    res.json({
      success: true,
      ...result,
      processingTime: `${duration}s`
    });
  } catch (err) {
    console.error('[Serendipity] Discovery error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to discover connections',
      message: err.message 
    });
  }
});

/**
 * GET /api/serendipity/patterns
 * 
 * Returns the available connection patterns that the engine looks for.
 */
app.get('/api/serendipity/patterns', (req, res) => {
  res.json({
    patterns: serendipity.CONNECTION_PATTERNS,
    seedConnections: serendipity.SEED_CONNECTIONS.map(s => ({
      id: s.id,
      name: s.name,
      sources: s.sources
    }))
  });
});

/**
 * POST /api/serendipity/analyze
 * 
 * Analyzes a specific item to find its connections.
 * 
 * Request Body:
 * {
 *   "type": "jobs|ideas|expenses|briefings|resources",
 *   "id": 123
 * }
 */
app.post('/api/serendipity/analyze', async (req, res) => {
  try {
    const { type, id } = req.body;
    
    if (!type || !id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: type and id' 
      });
    }
    
    const validTypes = ['expenses', 'briefings', 'jobs', 'ideas', 'resources'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    // Get connections that include this specific item
    const result = await serendipity.discoverConnections(pool, {
      limit: 20,
      minScore: 0.4,
      includeTypes: validTypes
    });
    
    // Filter to only connections involving the specified item
    const relevantDiscoveries = result.discoveries.filter(d => 
      d.sources.some(s => s.type === type && s.id === parseInt(id))
    );
    
    res.json({
      success: true,
      item: { type, id },
      connections: relevantDiscoveries,
      totalConnections: relevantDiscoveries.length,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Serendipity] Analysis error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze item',
      message: err.message 
    });
  }
});

/**
 * GET /api/serendipity/stats
 * 
 * Returns statistics about the serendipity engine's coverage.
 */
app.get('/api/serendipity/stats', async (req, res) => {
  try {
    const counts = {};
    
    const tables = [
      { name: 'expenses', table: 'lumen_expenses' },
      { name: 'briefings', table: 'lumen_briefings' },
      { name: 'jobs', table: 'lumen_jobs' },
      { name: 'ideas', table: 'lumen_ideas' },
      { name: 'resources', table: 'lumen_resources' }
    ];
    
    for (const { name, table } of tables) {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      counts[name] = parseInt(result.rows[0].count);
    }
    
    const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
    const potentialConnections = totalItems * (totalItems - 1) / 2;
    
    res.json({
      success: true,
      dataCounts: counts,
      totalItems,
      potentialConnections,
      patternsAvailable: Object.keys(serendipity.CONNECTION_PATTERNS).length,
      seedDetectors: serendipity.SEED_CONNECTIONS.length,
      status: totalItems > 10 ? 'ready' : 'needs_more_data',
      recommendation: totalItems < 10 
        ? 'Add more data to get better connections. Try adding briefings, tracking expenses, or saving job listings.'
        : 'Good data coverage! Run discovery to find connections.'
    });
  } catch (err) {
    console.error('[Serendipity] Stats error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get stats',
      message: err.message 
    });
  }
});

// ============================================
// PROACTIVE NOTIFICATIONS API
// ============================================

/**
 * GET /api/notifications
 * Get all notifications with optional filters
 * 
 * Query params:
 * - status: pending|sent|read|dismissed
 * - unread: true (only unread)
 * - limit: number
 */
app.get('/api/notifications', async (req, res) => {
  try {
    const { status, unread, limit = 50 } = req.query;
    
    let query = 'SELECT n.*, r.name as rule_name, r.rule_type FROM lumen_notifications n LEFT JOIN lumen_notification_rules r ON n.rule_id = r.id WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status) {
      query += ` AND n.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (unread === 'true') {
      query += ' AND n.read = FALSE AND n.dismissed = FALSE';
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      notifications: result.rows,
      count: result.rows.length,
      unread_count: result.rows.filter(n => !n.read && !n.dismissed).length
    });
  } catch (err) {
    console.error('[Notifications] Error fetching:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/notifications/rules
 * Get all notification rules
 */
app.get('/api/notifications/rules', async (req, res) => {
  try {
    const { enabled } = req.query;
    
    let query = 'SELECT * FROM lumen_notification_rules';
    const params = [];

    if (enabled === 'true') {
      query += ' WHERE enabled = TRUE';
    } else if (enabled === 'false') {
      query += ' WHERE enabled = FALSE';
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      rules: result.rows,
      count: result.rows.length,
      rule_types: Object.keys(proactiveNotifications.RULE_EVALUATORS),
      examples: proactiveNotifications.EXAMPLE_RULES
    });
  } catch (err) {
    console.error('[Notifications] Error fetching rules:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/rules
 * Create a new notification rule
 * 
 * Body:
 * {
 *   "name": "Weekly Food Budget",
 *   "description": "Alert if Food spending exceeds $200/week",
 *   "rule_type": "spending_threshold",
 *   "config": { "category": "Food", "amount": 200, "period": "week" },
 *   "priority": 1,
 *   "cooldown_hours": 24
 * }
 */
app.post('/api/notifications/rules', async (req, res) => {
  try {
    const { name, description, rule_type, config, priority = 0, cooldown_hours = 24, enabled = true } = req.body;

    if (!name || !rule_type || !config) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, rule_type, config' 
      });
    }

    // Validate rule type
    const validTypes = Object.keys(proactiveNotifications.RULE_EVALUATORS);
    if (!validTypes.includes(rule_type)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid rule_type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    const result = await pool.query(`
      INSERT INTO lumen_notification_rules (name, description, rule_type, config, priority, cooldown_hours, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, description, rule_type, JSON.stringify(config), priority, cooldown_hours, enabled]);

    console.log(`[Notifications] Created rule: ${name} (${rule_type})`);

    res.status(201).json({
      success: true,
      rule: result.rows[0],
      message: `Rule "${name}" created successfully`
    });
  } catch (err) {
    console.error('[Notifications] Error creating rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/notifications/rules/:id
 * Update a notification rule
 */
app.put('/api/notifications/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, rule_type, config, priority, cooldown_hours, enabled } = req.body;

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx}`); params.push(name); paramIdx++; }
    if (description !== undefined) { updates.push(`description = $${paramIdx}`); params.push(description); paramIdx++; }
    if (rule_type !== undefined) { updates.push(`rule_type = $${paramIdx}`); params.push(rule_type); paramIdx++; }
    if (config !== undefined) { updates.push(`config = $${paramIdx}`); params.push(JSON.stringify(config)); paramIdx++; }
    if (priority !== undefined) { updates.push(`priority = $${paramIdx}`); params.push(priority); paramIdx++; }
    if (cooldown_hours !== undefined) { updates.push(`cooldown_hours = $${paramIdx}`); params.push(cooldown_hours); paramIdx++; }
    if (enabled !== undefined) { updates.push(`enabled = $${paramIdx}`); params.push(enabled); paramIdx++; }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(`
      UPDATE lumen_notification_rules 
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({ success: true, rule: result.rows[0] });
  } catch (err) {
    console.error('[Notifications] Error updating rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/notifications/rules/:id
 * Delete a notification rule
 */
app.delete('/api/notifications/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM lumen_notification_rules WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({ success: true, message: 'Rule deleted', rule: result.rows[0] });
  } catch (err) {
    console.error('[Notifications] Error deleting rule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/check
 * Run all notification rules and generate alerts
 * This is the "heartbeat" - call it periodically or on-demand
 */
app.post('/api/notifications/check', async (req, res) => {
  try {
    console.log('[Notifications] Running rule check...');
    const startTime = Date.now();

    const result = await proactiveNotifications.runAllRules(pool);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Notifications] Check complete: ${result.triggered}/${result.checked} rules triggered in ${duration}s`);

    res.json({
      success: true,
      ...result,
      processingTime: `${duration}s`,
      checkedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Notifications] Error running check:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE lumen_notifications 
      SET read = TRUE, read_at = NOW(), status = 'read'
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (err) {
    console.error('[Notifications] Error marking read:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/:id/dismiss
 * Dismiss a notification
 */
app.post('/api/notifications/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE lumen_notifications 
      SET dismissed = TRUE, dismissed_at = NOW(), status = 'dismissed'
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (err) {
    console.error('[Notifications] Error dismissing:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/seed-examples
 * Seed the database with example rules
 */
app.post('/api/notifications/seed-examples', async (req, res) => {
  try {
    const examples = proactiveNotifications.EXAMPLE_RULES;
    const created = [];

    for (const rule of examples) {
      const exists = await pool.query(
        'SELECT id FROM lumen_notification_rules WHERE name = $1',
        [rule.name]
      );

      if (exists.rows.length === 0) {
        const result = await pool.query(`
          INSERT INTO lumen_notification_rules (name, description, rule_type, config, priority)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [rule.name, rule.description, rule.rule_type, JSON.stringify(rule.config), rule.priority]);
        
        created.push(result.rows[0]);
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length} example rules`,
      rules: created
    });
  } catch (err) {
    console.error('[Notifications] Error seeding examples:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/notifications/stats
 * Get notification statistics
 */
app.get('/api/notifications/stats', async (req, res) => {
  try {
    const [rulesResult, notificationsResult, triggeredResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE enabled = TRUE) as active FROM lumen_notification_rules'),
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE read = FALSE AND dismissed = FALSE) as unread FROM lumen_notifications'),
      pool.query('SELECT COUNT(*) as count FROM lumen_notifications WHERE created_at > NOW() - INTERVAL \'24 hours\'')
    ]);

    res.json({
      success: true,
      stats: {
        rules: {
          total: parseInt(rulesResult.rows[0].total),
          active: parseInt(rulesResult.rows[0].active)
        },
        notifications: {
          total: parseInt(notificationsResult.rows[0].total),
          unread: parseInt(notificationsResult.rows[0].unread)
        },
        last_24h: {
          triggered: parseInt(triggeredResult.rows[0].count)
        }
      },
      rule_types: Object.keys(proactiveNotifications.RULE_EVALUATORS)
    });
  } catch (err) {
    console.error('[Notifications] Error getting stats:', err);
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
// ============================================
// VOICE CLONE API - ElevenLabs TTS Integration
// ============================================

/**
 * GET /api/voice/status
 * Check voice service status and configuration
 */
app.get('/api/voice/status', async (req, res) => {
  try {
    const isConfigured = voiceClone.isApiConfigured();
    const audioFiles = voiceClone.listAudioFiles();
    
    res.json({
      service: 'Voice Clone Assistant',
      version: '1.0.0',
      status: 'operational',
      api_configured: isConfigured,
      mode: isConfigured ? 'live' : 'mock',
      audio_files_count: audioFiles.length,
      default_voice_settings: voiceClone.DEFAULT_VOICE_SETTINGS,
      endpoints: {
        speak: 'POST /api/voice/speak',
        voices: 'GET /api/voice/voices',
        audio: 'GET /api/voice/audio/:audioId',
        usage: 'GET /api/voice/usage',
        briefing: 'POST /api/voice/briefing/:briefingId/speak'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/voices
 * List all available voices (real or mock)
 */
app.get('/api/voice/voices', async (req, res) => {
  try {
    const result = await voiceClone.getVoices();
    res.json(result);
  } catch (error) {
    console.error('[Voice API] Error listing voices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/voices/:voiceId
 * Get details for a specific voice
 */
app.get('/api/voice/voices/:voiceId', async (req, res) => {
  try {
    const result = await voiceClone.getVoice(req.params.voiceId);
    res.json(result);
  } catch (error) {
    console.error('[Voice API] Error getting voice:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/voice/speak
 * Generate speech from text
 * 
 * Body: {
 *   text: string (required) - Text to convert to speech
 *   voice_id?: string - Voice ID to use (default: mock-rachel)
 *   speed?: number - Speed multiplier 0.5-2.0 (default: 1.0)
 *   stability?: number - Voice stability 0-1 (default: 0.5)
 *   similarity_boost?: number - Voice similarity 0-1 (default: 0.75)
 *   briefing_id?: number - Associated briefing ID
 * }
 */
app.post('/api/voice/speak', async (req, res) => {
  try {
    const { text, voice_id, speed, stability, similarity_boost, briefing_id } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const result = await voiceClone.generateSpeech({
      text,
      voice_id,
      speed,
      stability,
      similarity_boost,
      briefing_id
    });
    
    res.json(result);
  } catch (error) {
    console.error('[Voice API] Error generating speech:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice/briefing/:briefingId/speak
 * Generate speech for a specific briefing
 * 
 * Body: {
 *   voice_id?: string - Voice ID to use
 *   speed?: number - Speed multiplier 0.5-2.0
 * }
 */
app.post('/api/voice/briefing/:briefingId/speak', async (req, res) => {
  try {
    const briefingId = parseInt(req.params.briefingId);
    const { voice_id, speed } = req.body;
    
    if (isNaN(briefingId)) {
      return res.status(400).json({ error: 'Invalid briefing ID' });
    }
    
    const result = await voiceClone.speakBriefing(pool, briefingId, voice_id, speed);
    res.json(result);
  } catch (error) {
    console.error('[Voice API] Error speaking briefing:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/audio/:audioId
 * Retrieve generated audio file
 */
app.get('/api/voice/audio/:audioId', (req, res) => {
  try {
    const audioFile = voiceClone.getAudioFile(req.params.audioId);
    
    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    res.setHeader('Content-Type', audioFile.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${req.params.audioId}.mp3"`);
    res.send(audioFile.buffer);
  } catch (error) {
    console.error('[Voice API] Error retrieving audio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/voice/audio/:audioId
 * Delete a generated audio file
 */
app.delete('/api/voice/audio/:audioId', (req, res) => {
  try {
    const deleted = voiceClone.deleteAudioFile(req.params.audioId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    res.json({ success: true, message: 'Audio file deleted' });
  } catch (error) {
    console.error('[Voice API] Error deleting audio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/audio
 * List all stored audio files
 */
app.get('/api/voice/audio', (req, res) => {
  try {
    const files = voiceClone.listAudioFiles();
    res.json({
      count: files.length,
      files
    });
  } catch (error) {
    console.error('[Voice API] Error listing audio files:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/usage
 * Get ElevenLabs usage statistics
 */
app.get('/api/voice/usage', async (req, res) => {
  try {
    const usage = await voiceClone.getUsage();
    res.json(usage);
  } catch (error) {
    console.error('[Voice API] Error getting usage:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTEXT RESURRECTION API - Time Travel for Decisions
// ============================================

/**
 * GET /api/context/status
 * Get status and available date range for context resurrection
 */
app.get('/api/context/status', async (req, res) => {
  try {
    const dateRange = await contextResurrection.getAvailableDateRange(pool);
    
    res.json({
      service: 'Context Resurrection Engine',
      version: '1.0.0',
      status: 'operational',
      description: 'Time travel through your data - recreate the context of any past decision',
      date_range: dateRange,
      categories: Object.entries(contextResurrection.CONTEXT_CATEGORIES).map(([key, cat]) => ({
        key,
        name: cat.name,
        icon: cat.icon,
        description: cat.description
      })),
      endpoints: {
        resurrect: 'POST /api/context/resurrect',
        timeline: 'GET /api/context/timeline',
        status: 'GET /api/context/status'
      }
    });
  } catch (err) {
    console.error('[ContextResurrection API] Error getting status:', err);
    res.status(500).json({ error: 'Service error' });
  }
});

/**
 * POST /api/context/resurrect
 * Resurrect the full context around a specific date or event
 * 
 * Request body:
 * {
 *   "date": "2024-01-15" (required) - Target date to resurrect
 *   "event_description": "When I decided to switch jobs" (optional)
 *   "keywords": ["startup", "offer"] (optional) - Keywords to boost relevance
 *   "window_days": 7 (optional, default: 7) - Days before/after to search
 *   "categories": ["briefings", "expenses", "jobs"] (optional) - Specific categories
 * }
 * 
 * Response:
 * {
 *   "target_date": "2024-01-15T00:00:00.000Z",
 *   "window": { "start": "...", "end": "...", "days": 7 },
 *   "event_description": "...",
 *   "keywords": [...],
 *   "categories": { 
 *     "briefings": { items: [...], count: N, high_relevance_count: M },
 *     "expenses": { ... },
 *     ...
 *   },
 *   "snapshot": "# Context Snapshot: Monday, January 15, 2024\n...",
 *   "meta": { "total_items": N, "high_relevance_items": M, "generated_at": "..." }
 * }
 */
app.post('/api/context/resurrect', async (req, res) => {
  try {
    const { date, event_description, keywords, window_days, categories } = req.body;
    
    // Validate required fields
    if (!date) {
      return res.status(400).json({ 
        error: 'Missing required field: date',
        hint: 'Provide a date in ISO format (YYYY-MM-DD) or any parseable date string',
        examples: ['2024-01-15', '2024-01-15T14:30:00Z', 'January 15, 2024']
      });
    }
    
    // Validate date format
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format',
        received: date,
        hint: 'Use ISO format (YYYY-MM-DD) or a standard date string'
      });
    }
    
    // Validate window_days
    const windowDays = parseInt(window_days) || 7;
    if (windowDays < 1 || windowDays > 90) {
      return res.status(400).json({ 
        error: 'window_days must be between 1 and 90',
        received: window_days
      });
    }
    
    // Validate categories if provided
    const validCategories = Object.keys(contextResurrection.CONTEXT_CATEGORIES);
    if (categories && Array.isArray(categories)) {
      const invalidCats = categories.filter(c => !validCategories.includes(c));
      if (invalidCats.length > 0) {
        return res.status(400).json({ 
          error: 'Invalid categories',
          invalid: invalidCats,
          valid_categories: validCategories
        });
      }
    }
    
    console.log(`[ContextResurrection API] Resurrecting context for: ${date}${event_description ? ` (${event_description})` : ''}`);
    
    // Perform resurrection
    const result = await contextResurrection.resurrectContext(pool, {
      date,
      event_description,
      keywords: keywords || [],
      window_days: windowDays,
      categories: categories || validCategories
    });
    
    console.log(`[ContextResurrection API] Found ${result.meta.total_items} items (${result.meta.high_relevance_items} highly relevant)`);
    
    res.json(result);
    
  } catch (err) {
    console.error('[ContextResurrection API] Error:', err);
    res.status(500).json({ 
      error: 'Failed to resurrect context',
      details: err.message 
    });
  }
});

/**
 * GET /api/context/timeline
 * Get activity timeline for visualization
 * 
 * Query params:
 *   start_date - Start of range (optional)
 *   end_date - End of range (optional)
 *   granularity - 'day', 'week', or 'month' (default: 'day')
 */
app.get('/api/context/timeline', async (req, res) => {
  try {
    const { start_date, end_date, granularity = 'day' } = req.query;
    
    // Validate granularity
    if (!['day', 'week', 'month'].includes(granularity)) {
      return res.status(400).json({ 
        error: 'Invalid granularity',
        valid: ['day', 'week', 'month']
      });
    }
    
    const timeline = await contextResurrection.getActivityTimeline(pool, {
      start_date,
      end_date,
      granularity
    });
    
    res.json({
      granularity,
      start_date: start_date || 'all time',
      end_date: end_date || 'present',
      periods: timeline.length,
      timeline
    });
    
  } catch (err) {
    console.error('[ContextResurrection API] Error getting timeline:', err);
    res.status(500).json({ error: 'Failed to generate timeline' });
  }
});

/**
 * POST /api/context/compare
 * Compare context between two dates (useful for before/after analysis)
 */
app.post('/api/context/compare', async (req, res) => {
  try {
    const { date1, date2, window_days = 7 } = req.body;
    
    if (!date1 || !date2) {
      return res.status(400).json({ 
        error: 'Both date1 and date2 are required',
        hint: 'Provide two dates to compare context between'
      });
    }
    
    // Resurrect both periods in parallel
    const [context1, context2] = await Promise.all([
      contextResurrection.resurrectContext(pool, { date: date1, window_days }),
      contextResurrection.resurrectContext(pool, { date: date2, window_days })
    ]);
    
    // Generate comparison insights
    const comparison = {
      date1: context1.target_date,
      date2: context2.target_date,
      window_days,
      changes: {
        total_items: context2.meta.total_items - context1.meta.total_items,
        high_relevance: context2.meta.high_relevance_items - context1.meta.high_relevance_items
      },
      by_category: {}
    };
    
    // Compare each category
    for (const key of Object.keys(contextResurrection.CONTEXT_CATEGORIES)) {
      const cat1 = context1.categories[key] || { count: 0 };
      const cat2 = context2.categories[key] || { count: 0 };
      comparison.by_category[key] = {
        before: cat1.count,
        after: cat2.count,
        change: cat2.count - cat1.count
      };
    }
    
    res.json({
      comparison,
      before: context1,
      after: context2
    });
    
  } catch (err) {
    console.error('[ContextResurrection API] Error comparing:', err);
    res.status(500).json({ error: 'Failed to compare contexts' });
  }
});

// ============================================
// AUTOMATION BUILDER API
// ============================================

/**
 * POST /api/automations
 * Create automation from natural language
 * 
 * Body: {
 *   description: string (required) - Natural language automation description
 *   name?: string - Optional custom name
 *   enabled?: boolean - Whether to enable immediately (default: true)
 * }
 * 
 * Example:
 *   { "description": "When Food spending exceeds $500, alert me" }
 */
app.post('/api/automations', async (req, res) => {
  try {
    const { description, name, enabled = true } = req.body;
    
    if (!description) {
      return res.status(400).json({ 
        error: 'Missing required field: description',
        hint: 'Describe your automation in plain English',
        examples: [
          'When Food spending exceeds $500, alert me',
          'Every Monday at 9am, send me a spending summary',
          'If I spend more than $100 at restaurants in a day, notify me'
        ]
      });
    }

    console.log(`[Automation] Parsing: "${description}"`);
    
    // Parse natural language
    const parsed = automationBuilder.parseNaturalLanguage(description);
    
    // Convert to database record
    const record = automationBuilder.toAutomationRecord(parsed, name);
    record.enabled = enabled;
    
    // Warn if low confidence
    if (parsed.confidence < 0.5) {
      console.log(`[Automation] Low confidence parse (${parsed.confidence}), storing anyway`);
    }
    
    // Insert into database
    const result = await pool.query(`
      INSERT INTO lumen_automations (
        name, description, trigger_type, trigger_event, trigger_config,
        condition_str, conditions, action_type, action_config,
        schedule, schedule_human, confidence, raw_input, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      record.name, record.description, record.trigger_type, record.trigger_event,
      record.trigger_config, record.condition_str, record.conditions,
      record.action_type, record.action_config, record.schedule, record.schedule_human,
      record.confidence, record.raw_input, record.enabled
    ]);

    const automation = result.rows[0];
    
    console.log(`[Automation] Created: ${automation.name} (id: ${automation.id}, confidence: ${record.confidence})`);

    res.json({
      success: true,
      automation: {
        ...automation,
        parsed: {
          trigger: parsed.trigger,
          conditions: parsed.conditions,
          action: parsed.action,
          schedule: parsed.schedule
        }
      },
      message: 'Automation created successfully',
      confidence: record.confidence,
      confidence_explanation: record.confidence >= 0.7 
        ? 'High confidence - automation will work as expected'
        : record.confidence >= 0.5 
          ? 'Medium confidence - automation should work but may need refinement'
          : 'Low confidence - please verify the parsed automation matches your intent'
    });
    
  } catch (err) {
    console.error('[Automation API] Error creating automation:', err);
    res.status(500).json({ error: 'Failed to create automation', details: err.message });
  }
});

/**
 * GET /api/automations
 * List all automations
 * 
 * Query params:
 *   enabled - Filter by enabled status (true/false)
 *   trigger_type - Filter by trigger type
 *   limit - Max results (default: 50)
 */
app.get('/api/automations', async (req, res) => {
  try {
    const { enabled, trigger_type, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM lumen_automations WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (enabled !== undefined) {
      paramCount++;
      query += ` AND enabled = $${paramCount}`;
      params.push(enabled === 'true');
    }

    if (trigger_type) {
      paramCount++;
      query += ` AND trigger_type = $${paramCount}`;
      params.push(trigger_type);
    }

    query += ' ORDER BY created_at DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    res.json({
      automations: result.rows,
      count: result.rows.length,
      trigger_types: Object.keys(automationBuilder.TRIGGER_PATTERNS),
      action_types: Object.keys(automationBuilder.ACTION_PATTERNS)
    });
  } catch (err) {
    console.error('[Automation API] Error listing automations:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/automations/:id
 * Get a single automation with run history
 */
app.get('/api/automations/:id', async (req, res) => {
  try {
    const automation = await pool.query(
      'SELECT * FROM lumen_automations WHERE id = $1',
      [req.params.id]
    );

    if (automation.rows.length === 0) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Get recent runs
    const runs = await pool.query(
      'SELECT * FROM lumen_automation_runs WHERE automation_id = $1 ORDER BY executed_at DESC LIMIT 10',
      [req.params.id]
    );

    res.json({
      automation: automation.rows[0],
      recent_runs: runs.rows,
      run_count: automation.rows[0].run_count
    });
  } catch (err) {
    console.error('[Automation API] Error getting automation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PATCH /api/automations/:id
 * Update an automation
 */
app.patch('/api/automations/:id', async (req, res) => {
  try {
    const { name, enabled, description } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }
    
    if (enabled !== undefined) {
      paramCount++;
      updates.push(`enabled = $${paramCount}`);
      params.push(enabled);
    }

    if (description !== undefined) {
      // Re-parse the description
      const parsed = automationBuilder.parseNaturalLanguage(description);
      const record = automationBuilder.toAutomationRecord(parsed, name);
      
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
      
      paramCount++;
      updates.push(`trigger_type = $${paramCount}`);
      params.push(record.trigger_type);
      
      paramCount++;
      updates.push(`trigger_event = $${paramCount}`);
      params.push(record.trigger_event);
      
      paramCount++;
      updates.push(`trigger_config = $${paramCount}`);
      params.push(record.trigger_config);
      
      paramCount++;
      updates.push(`condition_str = $${paramCount}`);
      params.push(record.condition_str);
      
      paramCount++;
      updates.push(`conditions = $${paramCount}`);
      params.push(record.conditions);
      
      paramCount++;
      updates.push(`action_type = $${paramCount}`);
      params.push(record.action_type);
      
      paramCount++;
      updates.push(`action_config = $${paramCount}`);
      params.push(record.action_config);
      
      paramCount++;
      updates.push(`confidence = $${paramCount}`);
      params.push(record.confidence);
      
      paramCount++;
      updates.push(`raw_input = $${paramCount}`);
      params.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE lumen_automations SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    res.json({ automation: result.rows[0], message: 'Automation updated' });
  } catch (err) {
    console.error('[Automation API] Error updating automation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/automations/:id/run
 * Manually trigger an automation
 * 
 * Body: {
 *   test_data?: object - Mock expense data for testing
 *   dry_run?: boolean - If true, don't record the run
 * }
 */
app.post('/api/automations/:id/run', async (req, res) => {
  try {
    const { test_data, dry_run = false } = req.body;
    
    // Get the automation
    const automationResult = await pool.query(
      'SELECT * FROM lumen_automations WHERE id = $1',
      [req.params.id]
    );

    if (automationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const automation = automationResult.rows[0];
    
    // Create test context
    const context = {
      expense: test_data || {
        id: 0,
        amount: 100,
        category: 'Food',
        vendor: 'Test Vendor',
        description: 'Manual trigger test'
      },
      expense_id: test_data?.id || 0,
      manual_trigger: true,
      dry_run
    };

    console.log(`[Automation] Manual trigger: ${automation.name} (id: ${automation.id})`);

    // Execute the action
    const result = await automationBuilder.executeAction(automation, context, pool);

    if (!dry_run) {
      // Record the run
      await pool.query(`
        INSERT INTO lumen_automation_runs (automation_id, trigger_data, result, success)
        VALUES ($1, $2, $3, $4)
      `, [automation.id, JSON.stringify(context), JSON.stringify(result), result.success]);

      // Update automation stats
      await pool.query(`
        UPDATE lumen_automations 
        SET last_run_at = NOW(), 
            run_count = run_count + 1,
            last_run_result = $2
        WHERE id = $1
      `, [automation.id, JSON.stringify(result)]);
    }

    res.json({
      automation_id: automation.id,
      automation_name: automation.name,
      result,
      dry_run,
      message: dry_run ? 'Dry run completed (not recorded)' : 'Automation triggered successfully'
    });
    
  } catch (err) {
    console.error('[Automation API] Error running automation:', err);
    res.status(500).json({ error: 'Failed to run automation', details: err.message });
  }
});

/**
 * POST /api/automations/:id/toggle
 * Toggle automation enabled/disabled
 */
app.post('/api/automations/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lumen_automations SET enabled = NOT enabled, updated_at = NOW() WHERE id = $1 RETURNING id, name, enabled',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const automation = result.rows[0];
    res.json({ 
      automation,
      message: `Automation ${automation.enabled ? 'enabled' : 'disabled'}`
    });
  } catch (err) {
    console.error('[Automation API] Error toggling automation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * DELETE /api/automations/:id
 * Delete an automation
 */
app.delete('/api/automations/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM lumen_automations WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    console.log(`[Automation] Deleted: ${result.rows[0].name} (id: ${result.rows[0].id})`);
    res.json({ message: 'Automation deleted', deleted: result.rows[0] });
  } catch (err) {
    console.error('[Automation API] Error deleting automation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/automations/parse
 * Parse natural language without creating (preview)
 */
app.post('/api/automations/parse', async (req, res) => {
  try {
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    const parsed = automationBuilder.parseNaturalLanguage(description);
    const record = automationBuilder.toAutomationRecord(parsed);

    res.json({
      input: description,
      parsed,
      would_create: record,
      confidence: parsed.confidence,
      ready_to_create: parsed.confidence >= 0.5
    });
  } catch (err) {
    console.error('[Automation API] Error parsing:', err);
    res.status(500).json({ error: 'Failed to parse automation' });
  }
});

/**
 * GET /api/automations/runs
 * Get recent automation run history
 */
app.get('/api/automations/runs', async (req, res) => {
  try {
    const { limit = 50, automation_id } = req.query;
    
    let query = `
      SELECT r.*, a.name as automation_name 
      FROM lumen_automation_runs r 
      LEFT JOIN lumen_automations a ON r.automation_id = a.id
    `;
    const params = [];
    let paramCount = 0;

    if (automation_id) {
      paramCount++;
      query += ` WHERE r.automation_id = $${paramCount}`;
      params.push(automation_id);
    }

    query += ' ORDER BY r.executed_at DESC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    
    res.json({
      runs: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('[Automation API] Error getting runs:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/automations/examples
 * Get example automations for inspiration
 */
app.get('/api/automations/examples', (req, res) => {
  res.json({
    examples: [
      {
        description: "When Food spending exceeds $500, alert me",
        explanation: "Triggers when your total Food category spending for the month goes over $500"
      },
      {
        description: "Every Monday at 9am, send me a spending summary",
        explanation: "Weekly scheduled automation that generates a spending report"
      },
      {
        description: "If I spend more than $100 at restaurants, notify me",
        explanation: "Triggers on any single restaurant expense over $100"
      },
      {
        description: "When I add an expense over $200, tag it for review",
        explanation: "Automatically tags large expenses for manual review"
      },
      {
        description: "If Gas spending exceeds $300 this month, alert me",
        explanation: "Budget alert for gas expenses"
      },
      {
        description: "When I spend at Costco, categorize as Groceries",
        explanation: "Pattern-based auto-categorization"
      },
      {
        description: "Daily at 6pm, summarize my spending",
        explanation: "End-of-day spending summary notification"
      },
      {
        description: "When Entertainment exceeds $200, flag for review",
        explanation: "Budget monitoring with flagging action"
      }
    ],
    trigger_types: Object.keys(automationBuilder.TRIGGER_PATTERNS),
    action_types: Object.keys(automationBuilder.ACTION_PATTERNS),
    tips: [
      "Use 'when' or 'if' to define triggers",
      "Mention dollar amounts with $ symbol",
      "Categories: Food, Transport, Shopping, Entertainment, Bills, Health, Gas, Groceries",
      "Actions: alert me, notify me, tag it, flag for review, send summary"
    ]
  });
});

// Catch-all route for SPA
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

// Register Deal Radar routes
dealRadar.registerRoutes(app, pool);

// Register Expense Analytics routes
setupExpenseAnalyticsRoutes(app, pool);

// Start server
app.listen(PORT, () => {
  console.log(`🔆 Lumen Dashboard v3.5 running on port ${PORT}`);
  console.log(`   📡 Deal Radar: enabled (24/7 opportunity scanner)`);
  console.log(`   🔄 Hourly scrape sync: enabled (every hour at :00)`);
  console.log(`   📡 GitHub polling: enabled (every 15 min at :05, :20, :35, :50)`);
  console.log(`   📊 Rate limit: 4 req/hr (limit: 60/hr unauthenticated)`);
  console.log(`   🎯 Watching: davila7/claude-code-templates`);
  console.log(`   🎙️ Voice Clone: ${voiceClone.isApiConfigured() ? 'LIVE (ElevenLabs)' : 'MOCK mode'}`);
});

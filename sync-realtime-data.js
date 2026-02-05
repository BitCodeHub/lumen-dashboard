// Real-time data sync for Command Center
// Pulls actual data from Clawdbot, git, file system
require('dotenv').config();
const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const API_URL = process.env.RENDER_EXTERNAL_URL || 'https://lumen-dashboard.onrender.com';

// 1. Sync cron jobs from Clawdbot
async function syncCronJobs() {
  console.log('📅 Syncing cron jobs from Clawdbot...');
  
  try {
    // Call Clawdbot gateway to get cron jobs
    const response = await fetch('http://localhost:18789/api/cron/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    const jobs = data.jobs || [];
    
    console.log(`   Found ${jobs.length} cron jobs`);
    
    for (const job of jobs) {
      // Insert/update as recurring task
      await pool.query(
        `INSERT INTO tasks (title, description, status, assigned_to, cron_job_id, created_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (cron_job_id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           assigned_to = EXCLUDED.assigned_to,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          job.name,
          `Schedule: ${job.schedule.expr}${job.enabled ? '' : ' (disabled)'}`,
          'recurring',
          job.agentId,
          job.id,
          'system',
          JSON.stringify({ 
            schedule: job.schedule,
            enabled: job.enabled,
            lastRun: job.state?.lastRunAtMs 
          })
        ]
      );
      
      // Log activity
      await pool.query(
        `INSERT INTO activity_log (type, agent_id, title, metadata)
         VALUES ($1, $2, $3, $4)`,
        ['system', job.agentId, `Synced cron job: ${job.name}`, JSON.stringify({ cron_job_id: job.id })]
      );
    }
    
    console.log(`   ✅ Synced ${jobs.length} cron jobs\n`);
    return jobs.length;
  } catch (error) {
    console.error('   ❌ Cron sync failed:', error.message);
    return 0;
  }
}

// 2. Sync active agent sessions
async function syncAgentSessions() {
  console.log('👥 Syncing agent sessions from Clawdbot...');
  
  try {
    const response = await fetch('http://localhost:18789/api/sessions/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeMinutes: 60, messageLimit: 1 })
    });
    
    const data = await response.json();
    const sessions = data.sessions || [];
    
    console.log(`   Found ${sessions.length} active sessions`);
    
    // Update agent statuses based on sessions
    for (const session of sessions) {
      const agentId = session.agentId;
      const isActive = session.lastMessageAt && 
        (Date.now() - new Date(session.lastMessageAt).getTime()) < 15 * 60 * 1000; // 15 min
      
      await pool.query(
        `UPDATE agent_status 
         SET status = $1, 
             last_activity_at = $2,
             metadata = $3,
             updated_at = NOW()
         WHERE agent_id = $4`,
        [
          isActive ? 'active' : 'idle',
          session.lastMessageAt,
          JSON.stringify({ sessionKey: session.sessionKey, messageCount: session.messages?.length || 0 }),
          agentId
        ]
      );
      
      // Log activity for active agents
      if (isActive && session.messages && session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1];
        await pool.query(
          `INSERT INTO activity_log (type, agent_id, title, metadata)
           VALUES ($1, $2, $3, $4)`,
          ['message', agentId, `Active: ${lastMsg.content?.substring(0, 100) || 'Processing...'}`, 
           JSON.stringify({ sessionKey: session.sessionKey })]
        );
      }
    }
    
    console.log(`   ✅ Updated ${sessions.length} agent statuses\n`);
    return sessions.length;
  } catch (error) {
    console.error('   ❌ Session sync failed:', error.message);
    return 0;
  }
}

// 3. Scan git commits (last hour)
async function syncGitCommits() {
  console.log('📝 Syncing recent git commits...');
  
  const repos = [
    { path: '/Users/jimmysmacstudio/clawd-main', agent: 'main' },
    { path: '/Users/jimmysmacstudio/clawd-lumi', agent: 'lumi' },
    { path: '/Users/jimmysmacstudio/clawd-luna', agent: 'luna' },
    { path: '/Users/jimmysmacstudio/clawd-maven', agent: 'maven' },
    { path: '/Users/jimmysmacstudio/clawd/projects/lumen-dashboard', agent: 'main' }
  ];
  
  let totalCommits = 0;
  
  for (const repo of repos) {
    if (!fs.existsSync(repo.path)) continue;
    
    try {
      const commits = execSync(
        `cd "${repo.path}" && git log --since="1 hour ago" --pretty=format:"%h|%s|%ar" 2>/dev/null || echo ""`,
        { encoding: 'utf8' }
      ).trim();
      
      if (!commits) continue;
      
      const commitLines = commits.split('\n').filter(Boolean);
      
      for (const line of commitLines) {
        const [hash, message, timeAgo] = line.split('|');
        
        await pool.query(
          `INSERT INTO activity_log (type, agent_id, title, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'commit',
            repo.agent,
            `Committed: ${message}`,
            timeAgo,
            JSON.stringify({ hash, repo: repo.path })
          ]
        );
        
        totalCommits++;
      }
    } catch (error) {
      // Skip repos with git errors
    }
  }
  
  console.log(`   ✅ Found ${totalCommits} recent commits\n`);
  return totalCommits;
}

// 4. Scan active projects
async function syncProjects() {
  console.log('📁 Scanning active projects...');
  
  const projectDirs = [
    '/Users/jimmysmacstudio/clawd/projects',
    '/Users/jimmysmacstudio/clawd-maven/projects',
    '/Users/jimmysmacstudio/clawd-luna/projects'
  ];
  
  let totalProjects = 0;
  
  for (const dir of projectDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const projects = fs.readdirSync(dir).filter(name => {
      const fullPath = path.join(dir, name);
      return fs.statSync(fullPath).isDirectory() && !name.startsWith('.');
    });
    
    for (const projectName of projects) {
      const fullPath = path.join(dir, projectName);
      const stats = fs.statSync(fullPath);
      
      // Determine owner based on directory
      let owner = 'main';
      if (dir.includes('maven')) owner = 'maven';
      if (dir.includes('luna')) owner = 'luna';
      
      // Check if project has recent activity (modified in last 7 days)
      const isActive = (Date.now() - stats.mtimeMs) < 7 * 24 * 60 * 60 * 1000;
      
      await pool.query(
        `INSERT INTO projects (name, location, owner_agent_id, status, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           location = EXCLUDED.location,
           owner_agent_id = EXCLUDED.owner_agent_id,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          projectName,
          fullPath,
          owner,
          isActive ? 'active' : 'paused',
          new Date(stats.mtimeMs)
        ]
      );
      
      totalProjects++;
    }
  }
  
  console.log(`   ✅ Scanned ${totalProjects} projects\n`);
  return totalProjects;
}

// Main sync function
async function sync() {
  try {
    console.log('🔄 Starting real-time data sync...\n');
    
    const results = await Promise.all([
      syncCronJobs(),
      syncAgentSessions(),
      syncGitCommits(),
      syncProjects()
    ]);
    
    console.log('✅ Sync complete!\n');
    console.log('📊 Summary:');
    console.log(`   Cron jobs: ${results[0]}`);
    console.log(`   Agent sessions: ${results[1]}`);
    console.log(`   Git commits: ${results[2]}`);
    console.log(`   Projects: ${results[3]}`);
    
    pool.end();
  } catch (error) {
    console.error('❌ Sync failed:', error);
    pool.end();
    process.exit(1);
  }
}

// Run sync
if (require.main === module) {
  sync();
}

module.exports = { sync, syncCronJobs, syncAgentSessions, syncGitCommits, syncProjects };

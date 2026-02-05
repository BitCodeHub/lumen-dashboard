// Real-time sync routes for Command Center
const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// Sync cron jobs from Clawdbot
async function syncCronJobs(db) {
  try {
    // Get cron jobs from Clawdbot gateway
    const clawdbotUrl = process.env.CLAWDBOT_GATEWAY_URL || 'https://clawd-gateway.ngrok.io';
    const response = await fetch(`${clawdbotUrl}/api/cron/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    const jobs = data.jobs || [];
    
    let synced = 0;
    for (const job of jobs) {
      await db.query(
        `INSERT INTO tasks (title, description, status, assigned_to, cron_job_id, created_by, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (cron_job_id) 
         DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           assigned_to = EXCLUDED.assigned_to,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
         WHERE tasks.cron_job_id IS NOT NULL`,
        [
          job.name,
          `Schedule: ${job.schedule?.expr || 'unknown'}${job.enabled === false ? ' (disabled)' : ''}`,
          'recurring',
          job.agentId,
          job.id,
          'system',
          JSON.stringify({ 
            schedule: job.schedule,
            enabled: job.enabled !== false,
            lastRun: job.state?.lastRunAtMs 
          })
        ]
      );
      synced++;
    }
    
    return { synced, total: jobs.length };
  } catch (error) {
    console.error('[Sync] Cron jobs failed:', error.message);
    return { synced: 0, total: 0, error: error.message };
  }
}

// Sync agent sessions
async function syncAgentSessions(db) {
  try {
    const clawdbotUrl = process.env.CLAWDBOT_GATEWAY_URL || 'https://clawd-gateway.ngrok.io';
    const response = await fetch(`${clawdbotUrl}/api/sessions/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeMinutes: 60 })
    });
    
    const data = await response.json();
    const sessions = data.sessions || [];
    
    let updated = 0;
    for (const session of sessions) {
      const agentId = session.agentId;
      const isActive = session.lastMessageAt && 
        (Date.now() - new Date(session.lastMessageAt).getTime()) < 15 * 60 * 1000;
      
      const result = await db.query(
        `UPDATE agent_status 
         SET status = $1, 
             last_activity_at = $2,
             metadata = $3,
             updated_at = NOW()
         WHERE agent_id = $4`,
        [
          isActive ? 'active' : 'idle',
          session.lastMessageAt,
          JSON.stringify({ sessionKey: session.sessionKey }),
          agentId
        ]
      );
      
      if (result.rowCount > 0) updated++;
    }
    
    return { updated, total: sessions.length };
  } catch (error) {
    console.error('[Sync] Sessions failed:', error.message);
    return { updated: 0, total: 0, error: error.message };
  }
}

// Manual sync endpoint
router.post('/sync', async (req, res) => {
  try {
    console.log('[Sync] Starting manual sync...');
    
    const results = {
      cronJobs: await syncCronJobs(req.db),
      sessions: await syncAgentSessions(req.db),
      timestamp: new Date().toISOString()
    };
    
    console.log('[Sync] Complete:', results);
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('[Sync] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-sync (called by cron)
async function autoSync(db) {
  console.log('[Auto-Sync] Running...');
  
  const results = {
    cronJobs: await syncCronJobs(db),
    sessions: await syncAgentSessions(db),
    timestamp: new Date().toISOString()
  };
  
  console.log('[Auto-Sync] Complete:', results);
  return results;
}

module.exports = { router, autoSync };

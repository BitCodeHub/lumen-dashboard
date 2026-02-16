#!/usr/bin/env node
/**
 * Local Sync Server for Maven Workspace
 * Runs on Mac Studio, handles Deploy button requests
 * Syncs to VPS via SSH (reliable)
 */

const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = 3700;

// VPS config
const VPS = {
  host: 'root@srv1352214.hstgr.cloud',
  container: 'openclaw-6zsj-openclaw-1',
  workspace: '/data/.openclaw/workspace'
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'local-sync', timestamp: new Date().toISOString() });
});

// Sync workspace to VPS
app.post('/api/sync', async (req, res) => {
  const { workspace, deploymentId } = req.body;
  
  if (!workspace) {
    return res.status(400).json({ error: 'No workspace provided' });
  }
  
  console.log(`[${new Date().toISOString()}] Syncing workspace for ${deploymentId || 'unknown'}...`);
  
  const results = [];
  const files = [
    { name: 'IDENTITY.md', content: workspace.identity },
    { name: 'SOUL.md', content: workspace.soul },
    { name: 'TOOLS.md', content: workspace.tools },
    { name: 'AGENTS.md', content: workspace.agents },
    { name: 'USER.md', content: workspace.user },
    { name: 'MEMORY.md', content: workspace.memory }
  ];
  
  for (const file of files) {
    if (file.content && file.content.trim().length > 0) {
      try {
        // Write to local temp file
        const tempPath = `/tmp/sync_${file.name}`;
        fs.writeFileSync(tempPath, file.content);
        
        // SCP to VPS
        execSync(`scp "${tempPath}" ${VPS.host}:/tmp/${file.name}`, { timeout: 10000 });
        
        // Remove old file in container (in case it's a symlink)
        try {
          execSync(`ssh ${VPS.host} 'docker exec ${VPS.container} rm -f ${VPS.workspace}/${file.name}'`, { timeout: 5000 });
        } catch (e) { /* ignore if doesn't exist */ }
        
        // Copy new file into container
        execSync(`ssh ${VPS.host} 'docker cp /tmp/${file.name} ${VPS.container}:${VPS.workspace}/${file.name}'`, { timeout: 10000 });
        
        // Fix ownership
        execSync(`ssh ${VPS.host} 'docker exec ${VPS.container} chown node:node ${VPS.workspace}/${file.name}'`, { timeout: 5000 });
        
        // Cleanup
        fs.unlinkSync(tempPath);
        
        console.log(`  ✅ ${file.name} synced`);
        results.push({ file: file.name, status: 'synced' });
      } catch (err) {
        console.error(`  ❌ ${file.name} failed:`, err.message);
        results.push({ file: file.name, status: 'error', error: err.message });
      }
    } else {
      results.push({ file: file.name, status: 'skipped', reason: 'empty' });
    }
  }
  
  const synced = results.filter(r => r.status === 'synced').length;
  console.log(`[${new Date().toISOString()}] Sync complete: ${synced}/${files.length} files`);
  
  res.json({ 
    success: synced > 0, 
    results, 
    syncedAt: new Date().toISOString(),
    deploymentId 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔄 Local Sync Server running on http://localhost:${PORT}`);
  console.log(`   POST /api/sync - Sync workspace to Maven VPS`);
  console.log(`   GET /health - Health check`);
});

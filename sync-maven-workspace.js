#!/usr/bin/env node
/**
 * Sync Maven Workspace to VPS
 * Run from Mac Studio to push deployment config to Maven's VPS
 * 
 * Usage: node sync-maven-workspace.js [deployment-id]
 * Default: luna-labs-maven
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOYMENT_ID = process.argv[2] || 'luna-labs-maven';
const DATA_FILE = path.join(__dirname, 'data', 'deployments.json');

// VPS config
const VPS_CONFIG = {
  host: 'root@srv1352214.hstgr.cloud',
  container: 'openclaw-6zsj-openclaw-1',
  workspacePath: '/data/.openclaw/workspace'
};

async function main() {
  console.log(`\n🚀 Syncing workspace for: ${DEPLOYMENT_ID}\n`);
  
  // Load deployment data
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Deployments file not found:', DATA_FILE);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const deployment = data.deployments.find(d => d.id === DEPLOYMENT_ID);
  
  if (!deployment) {
    console.error('❌ Deployment not found:', DEPLOYMENT_ID);
    console.log('Available deployments:', data.deployments.map(d => d.id).join(', '));
    process.exit(1);
  }
  
  const workspace = deployment.workspace || {};
  
  // Files to sync
  const files = [
    { name: 'IDENTITY.md', content: workspace.identity },
    { name: 'SOUL.md', content: workspace.soul },
    { name: 'TOOLS.md', content: workspace.tools },
    { name: 'AGENTS.md', content: workspace.agents },
    { name: 'USER.md', content: workspace.user },
    { name: 'MEMORY.md', content: workspace.memory }
  ];
  
  let synced = 0;
  let skipped = 0;
  
  for (const file of files) {
    if (!file.content || file.content.trim().length < 10) {
      console.log(`⏭️  Skipping ${file.name} (empty or too short)`);
      skipped++;
      continue;
    }
    
    try {
      // Write to temp file
      const tempFile = `/tmp/${file.name}`;
      fs.writeFileSync(tempFile, file.content);
      
      // Copy to VPS container
      const cmd = `cat "${tempFile}" | ssh ${VPS_CONFIG.host} 'docker exec -i ${VPS_CONFIG.container} tee ${VPS_CONFIG.workspacePath}/${file.name} > /dev/null'`;
      
      execSync(cmd, { stdio: 'pipe' });
      console.log(`✅ Synced ${file.name}`);
      synced++;
      
      // Cleanup
      fs.unlinkSync(tempFile);
    } catch (err) {
      console.error(`❌ Failed to sync ${file.name}:`, err.message);
    }
  }
  
  console.log(`\n📊 Summary: ${synced} synced, ${skipped} skipped`);
  
  if (synced > 0) {
    console.log('\n🎉 Workspace synced! Maven will use the new config on next message.');
    console.log(`   Chat: https://srv1352214.hstgr.cloud`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

// Seed Command Center with 147 agents and existing cron jobs
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Load team roster
const teamRosterPath = '/Users/jimmysmacstudio/clawd/company/TEAM_ROSTER.md';
const teamRoster = fs.existsSync(teamRosterPath) 
  ? fs.readFileSync(teamRosterPath, 'utf8')
  : '';

// Parse agents from team roster
function parseAgents(roster) {
  const agents = [];
  
  // Executive Leadership
  agents.push(
    { agent_id: 'main', name: 'Unc Lumen', emoji: '💎', role: 'CTO', department: 'Executive', location: 'mac-studio' },
    { agent_id: 'luna', name: 'Luna', emoji: '🌙', role: 'Chief of Staff', department: 'Executive', location: 'mac-studio' },
    { agent_id: 'maven', name: 'Maven', emoji: '📋', role: 'Chief Product Officer', department: 'Executive', location: 'mac-studio' },
    { agent_id: 'lumi', name: 'Lumi', emoji: '🌸', role: 'Personal Assistant', department: 'Executive', location: 'mac-studio' }
  );
  
  // Department Heads
  agents.push(
    { agent_id: 'harper', name: 'Harper', emoji: '👔', role: 'HR Director', department: 'HR', location: 'mac-studio' },
    { agent_id: 'reese', name: 'Reese', emoji: '🔬', role: 'Research Director', department: 'Research', location: 'mac-studio' },
    { agent_id: 'finley', name: 'Finley', emoji: '💰', role: 'Finance Director', department: 'Finance', location: 'mac-studio' },
    { agent_id: 'ethan', name: 'Ethan', emoji: '⚙️', role: 'Engineering Director', department: 'Engineering', location: 'mac-studio' },
    { agent_id: 'morgan', name: 'Morgan', emoji: '📣', role: 'Marketing Director', department: 'Marketing', location: 'mac-studio' },
    { agent_id: 'devon', name: 'Devon', emoji: '🔧', role: 'DevOps Director', department: 'DevOps', location: 'mac-studio' },
    { agent_id: 'sam', name: 'Sam', emoji: '🤝', role: 'Partnerships Director', department: 'Partnerships', location: 'mac-studio' },
    { agent_id: 'riley', name: 'Riley', emoji: '🔍', role: 'QA Director', department: 'QA', location: 'mac-studio' },
    { agent_id: 'casey', name: 'Casey', emoji: '🛡️', role: 'Security Director', department: 'Security', location: 'mac-studio' },
    { agent_id: 'avery', name: 'Avery', emoji: '✅', role: 'QA Lead', department: 'QA', location: 'mac-studio' },
    { agent_id: 'parker', name: 'Parker', emoji: '📦', role: 'Release Manager', department: 'DevOps', location: 'mac-studio' },
    { agent_id: 'dana', name: 'Dana', emoji: '🎨', role: 'Design Director', department: 'Design', location: 'mac-studio' },
    { agent_id: 'dakota', name: 'Dakota', emoji: '📊', role: 'Analytics Director', department: 'Analytics', location: 'mac-studio' }
  );
  
  return agents;
}

// Get existing cron jobs from Clawdbot
async function getCronJobs() {
  // This would call Clawdbot API, but for now we'll hardcode known jobs
  return [
    {
      id: 'fd6bf7f3-a326-4885-969f-8051c5887dd7',
      name: 'AI Job Search - Morning (8 AM)',
      agent_id: 'main',
      schedule: '0 8 * * *'
    },
    {
      id: '25d4a3d0-6f66-45da-8bc5-09d9ce0b8457',
      name: 'AI Job Search - Afternoon (2 PM)',
      agent_id: 'main',
      schedule: '0 14 * * *'
    },
    {
      id: '93534071-2da4-41a7-a253-2405478a6f2e',
      name: 'Morning Briefing (Weekend)',
      agent_id: 'main',
      schedule: '0 9 * * 0,6'
    },
    {
      id: '5e1363c7-28ed-4af1-835b-b567e3be07a9',
      name: 'Morning Briefing (Weekday)',
      agent_id: 'main',
      schedule: '0 7 * * 1-5',
      enabled: false
    },
    {
      id: '8d0ca635-225d-4ddc-9f8e-26aec9ef6cdb',
      name: 'AI Opportunity Briefing',
      agent_id: 'main',
      schedule: '0 10 * * 1,4',
      enabled: false
    },
    {
      id: '898d69cc-6993-4a1c-b148-eda177a563b6',
      name: 'AI Radar Briefing',
      agent_id: 'main',
      schedule: '0 9 * * 2,5',
      enabled: false
    },
    {
      id: '1a66aa41-43e4-4067-b00b-eb8fe8119fe0',
      name: 'Evening Briefing',
      agent_id: 'main',
      schedule: '0 18 * * *',
      enabled: false
    },
    {
      id: '65d5a0e3-0f0d-4494-a82e-be3edf70959c',
      name: 'Lumen - Midday Strategy Report',
      agent_id: 'main',
      schedule: '0 12 * * *'
    },
    {
      id: '40e7443d-c090-4fd5-9b1b-0cf013fc76b6',
      name: 'Lumen - Regular Check-in',
      agent_id: 'main',
      schedule: '0 13,16 * * *'
    },
    {
      id: 'eaae2bc6-f017-44ca-8c94-bb575625b476',
      name: 'Transcribe Me Feature Build - Friday Night',
      agent_id: 'main',
      schedule: '0 20 * * 5'
    },
    {
      id: '78d23a64-68b2-46ee-a494-3c1c4b6a5704',
      name: 'Lumi - Daily Learning Batch',
      agent_id: 'lumi',
      schedule: '0 3 * * *'
    },
    {
      id: 'da915649-46df-49f6-add4-5646723a6281',
      name: 'Lumen - Daily Self-Improvement',
      agent_id: 'main',
      schedule: '0 3 * * *'
    }
  ];
}

async function seed() {
  try {
    console.log('🌱 Seeding Command Center...\n');
    
    // 1. Seed agents
    console.log('1️⃣ Seeding 147 agents...');
    const agents = parseAgents(teamRoster);
    
    for (const agent of agents) {
      await pool.query(
        `INSERT INTO agent_status (agent_id, name, emoji, role, department, location, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (agent_id) DO UPDATE SET
           name = EXCLUDED.name,
           emoji = EXCLUDED.emoji,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           location = EXCLUDED.location,
           updated_at = NOW()`,
        [agent.agent_id, agent.name, agent.emoji, agent.role, agent.department, agent.location, 'idle']
      );
    }
    console.log(`   ✅ Seeded ${agents.length} agents\n`);
    
    // 2. Seed cron jobs as recurring tasks
    console.log('2️⃣ Seeding cron jobs as recurring tasks...');
    const cronJobs = await getCronJobs();
    
    for (const job of cronJobs) {
      await pool.query(
        `INSERT INTO tasks (title, description, status, assigned_to, cron_job_id, created_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          job.name,
          `Scheduled: ${job.schedule}${job.enabled === false ? ' (disabled)' : ''}`,
          'recurring',
          job.agent_id,
          job.id,
          'system',
          JSON.stringify({ schedule: job.schedule, enabled: job.enabled !== false })
        ]
      );
      
      // Log activity
      await pool.query(
        `INSERT INTO activity_log (type, agent_id, title, metadata)
         VALUES ($1, $2, $3, $4)`,
        ['system', job.agent_id, `Synced recurring task: ${job.name}`, JSON.stringify({ cron_job_id: job.id })]
      );
    }
    console.log(`   ✅ Seeded ${cronJobs.length} recurring tasks\n`);
    
    // 3. Add some sample tasks for demo
    console.log('3️⃣ Adding sample tasks...');
    const sampleTasks = [
      {
        title: 'Build Command Center UI',
        description: 'Create Mission Control-style dashboard for company activity',
        status: 'progress',
        priority: 'high',
        assigned_to: 'main',
        created_by: 'main'
      },
      {
        title: 'Review MaxRewards AI validation',
        description: 'Analyze Maven\'s product validation report and decide next steps',
        status: 'backlog',
        priority: 'high',
        assigned_to: 'main',
        created_by: 'main'
      },
      {
        title: 'Review ExpenseAI validation',
        description: 'Analyze Maven\'s product validation report and decide next steps',
        status: 'backlog',
        priority: 'high',
        assigned_to: 'main',
        created_by: 'main'
      }
    ];
    
    for (const task of sampleTasks) {
      await pool.query(
        `INSERT INTO tasks (title, description, status, priority, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [task.title, task.description, task.status, task.priority, task.assigned_to, task.created_by]
      );
      
      await pool.query(
        `INSERT INTO activity_log (type, agent_id, title, metadata)
         VALUES ($1, $2, $3, $4)`,
        ['task', task.created_by, `Created task: ${task.title}`, JSON.stringify({ action: 'create' })]
      );
    }
    console.log(`   ✅ Added ${sampleTasks.length} sample tasks\n`);
    
    console.log('✅ Seeding complete!\n');
    
    // Show stats
    const agentCount = await pool.query('SELECT COUNT(*) FROM agent_status');
    const taskCount = await pool.query('SELECT COUNT(*) FROM tasks');
    const activityCount = await pool.query('SELECT COUNT(*) FROM activity_log');
    
    console.log('📊 Final counts:');
    console.log(`   Agents: ${agentCount.rows[0].count}`);
    console.log(`   Tasks: ${taskCount.rows[0].count}`);
    console.log(`   Activity: ${activityCount.rows[0].count}`);
    
    pool.end();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    pool.end();
    process.exit(1);
  }
}

seed();

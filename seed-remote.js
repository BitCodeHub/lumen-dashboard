// Seed Command Center via API (remote)
const API_URL = 'https://lumen-dashboard.onrender.com/api/command-center';
const API_KEY = '5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69';

async function seed() {
  try {
    console.log('🌱 Seeding Command Center remotely...\n');
    
    // 1. Seed agents
    console.log('1️⃣ Seeding agents...');
    const agents = [
      { agent_id: 'main', name: 'Unc Lumen', emoji: '💎', role: 'CTO', department: 'Executive', location: 'mac-studio' },
      { agent_id: 'luna', name: 'Luna', emoji: '🌙', role: 'Chief of Staff', department: 'Executive', location: 'mac-studio' },
      { agent_id: 'maven', name: 'Maven', emoji: '📋', role: 'Chief Product Officer', department: 'Executive', location: 'mac-studio' },
      { agent_id: 'lumi', name: 'Lumi', emoji: '🌸', role: 'Personal Assistant', department: 'Executive', location: 'mac-studio' },
      { agent_id: 'harper', name: 'Harper', emoji: '👔', role: 'HR Director', department: 'HR', location: 'mac-studio' },
      { agent_id: 'reese', name: 'Reese', emoji: '🔬', role: 'Research Director', department: 'Research', location: 'mac-studio' },
      { agent_id: 'finley', name: 'Finley', emoji: '💰', role: 'Finance Director', department: 'Finance', location: 'mac-studio' },
      { agent_id: 'ethan', name: 'Ethan', emoji: '⚙️', role: 'Engineering Director', department: 'Engineering', location: 'mac-studio' },
      { agent_id: 'morgan', name: 'Morgan', emoji: '📣', role: 'Marketing Director', department: 'Marketing', location: 'mac-studio' },
      { agent_id: 'devon', name: 'Devon', emoji: '🔧', role: 'DevOps Director', department: 'DevOps', location: 'mac-studio' }
    ];
    
    for (const agent of agents) {
      // Insert via SQL endpoint
      const sql = `INSERT INTO agent_status (agent_id, name, emoji, role, department, location, status) 
                   VALUES ('${agent.agent_id}', '${agent.name}', '${agent.emoji}', '${agent.role}', '${agent.department}', '${agent.location}', 'idle') 
                   ON CONFLICT (agent_id) DO UPDATE SET name = EXCLUDED.name, emoji = EXCLUDED.emoji, role = EXCLUDED.role, department = EXCLUDED.department, location = EXCLUDED.location, updated_at = NOW()`;
      
      await fetch('https://lumen-dashboard.onrender.com/api/admin/run-migration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ sql })
      });
    }
    console.log(`   ✅ Seeded ${agents.length} agents\n`);
    
    // 2. Create sample tasks
    console.log('2️⃣ Creating sample tasks...');
    const tasks = [
      {
        title: 'Build Command Center - Mission Control UI',
        description: 'Real-time dashboard showing all 147 agents and company activity',
        status: 'progress',
        priority: 'high',
        assigned_to: 'main',
        created_by: 'main'
      },
      {
        title: 'Review MaxRewards AI Product Validation',
        description: 'Analyze Maven\'s product validation report (Score: 8.5/10)',
        status: 'backlog',
        priority: 'high',
        assigned_to: null,
        created_by: 'main'
      },
      {
        title: 'Review ExpenseAI Product Validation',
        description: 'Analyze Maven\'s product validation report (Score: 9/10)',
        status: 'backlog',
        priority: 'high',
        assigned_to: null,
        created_by: 'main'
      },
      {
        title: 'Friday Night: Build Transcribe Me Feature',
        description: 'Mac Studio transcription API + dashboard integration',
        status: 'backlog',
        priority: 'medium',
        assigned_to: 'main',
        created_by: 'main'
      }
    ];
    
    for (const task of tasks) {
      await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });
    }
    console.log(`   ✅ Created ${tasks.length} tasks\n`);
    
    console.log('✅ Seeding complete!\n');
    console.log('🔗 Open: https://lumen-dashboard.onrender.com/command-center.html');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seed();

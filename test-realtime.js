// Test real-time updates by simulating agent activity
const API_URL = 'https://lumen-dashboard.onrender.com/api/command-center';

async function simulateActivity() {
  console.log('🎬 Simulating real-time agent activity...\n');
  
  // 1. Create a new task
  console.log('1️⃣ Creating task...');
  const task = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test Real-Time Update',
      description: 'This task will move automatically',
      status: 'backlog',
      priority: 'high',
      created_by: 'main'
    })
  }).then(r => r.json());
  console.log(`   ✅ Created task #${task.id}\n`);
  
  await sleep(3000);
  
  // 2. Move to In Progress
  console.log('2️⃣ Moving to In Progress...');
  await fetch(`${API_URL}/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'progress',
      assigned_to: 'main'
    })
  });
  console.log('   ✅ Task now in progress\n');
  
  await sleep(3000);
  
  // 3. Update progress
  console.log('3️⃣ Updating progress to 50%...');
  await fetch(`${API_URL}/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      progress: 50
    })
  });
  console.log('   ✅ Progress updated\n');
  
  await sleep(3000);
  
  // 4. Complete task
  console.log('4️⃣ Completing task...');
  await fetch(`${API_URL}/tasks/${task.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'done',
      progress: 100,
      completed_at: new Date().toISOString()
    })
  });
  console.log('   ✅ Task completed\n');
  
  await sleep(3000);
  
  // 5. Clean up
  console.log('5️⃣ Cleaning up...');
  await fetch(`${API_URL}/tasks/${task.id}`, {
    method: 'DELETE'
  });
  console.log('   ✅ Test task deleted\n');
  
  console.log('✅ Test complete! Check the Command Center - you should have seen real-time updates.');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

simulateActivity().catch(console.error);

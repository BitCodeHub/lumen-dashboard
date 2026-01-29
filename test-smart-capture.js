#!/usr/bin/env node
/**
 * Smart Capture Test Script
 * Run: node test-smart-capture.js
 */

const smartCapture = require('./smart-capture');

console.log('🧠 Smart Capture - Test Suite\n');
console.log('='.repeat(60));

// Test cases representing different content types
const testCases = [
  // Expenses
  { input: '$45.50 at Chipotle for lunch', expected: 'expense' },
  { input: 'Spent 80 bucks on groceries at Costco', expected: 'expense' },
  { input: 'Uber ride from airport $32.50', expected: 'expense' },
  { input: 'Paid 150 for new keyboard on Amazon', expected: 'expense' },
  
  // Ideas
  { input: 'Idea: AI-powered meeting summarizer that generates action items', expected: 'idea' },
  { input: 'What if we built a SaaS for tracking developer productivity?', expected: 'idea' },
  { input: 'Startup concept: subscription box for AI tools, $20/month', expected: 'idea' },
  { input: 'Build a mobile app for habit tracking with AI coaching', expected: 'idea' },
  
  // Jobs
  { input: 'Senior React Developer at Stripe $150k-200k remote', expected: 'job' },
  { input: 'Found a ML Engineer position at OpenAI, looking for 3+ years exp', expected: 'job' },
  { input: 'Google is hiring for Staff Engineer, Mountain View hybrid', expected: 'job' },
  
  // Resources
  { input: 'https://github.com/anthropics/claude-code - great CLI tool for Claude', expected: 'resource' },
  { input: 'Check out this tutorial: https://react.dev/learn', expected: 'resource' },
  { input: 'Found awesome documentation at https://docs.stripe.com', expected: 'resource' },
  
  // Briefings
  { input: 'Meeting with John about Q2 roadmap - need to focus on mobile first', expected: 'briefing' },
  { input: 'Daily standup notes: Completed API refactor, starting on tests', expected: 'briefing' },
  { input: 'Key takeaways from strategy session: pivot to enterprise', expected: 'briefing' },
];

let passed = 0;
let failed = 0;

console.log('\n📊 Type Detection Tests:\n');

testCases.forEach((test, i) => {
  const result = smartCapture.detectType(test.input);
  const success = result.type === test.expected;
  
  if (success) {
    passed++;
    console.log(`✅ ${i+1}. ${test.expected.padEnd(10)} <- "${test.input.substring(0, 45)}..."`);
  } else {
    failed++;
    console.log(`❌ ${i+1}. Expected ${test.expected}, got ${result.type} (${(result.confidence*100).toFixed(0)}%)`);
    console.log(`      Input: "${test.input.substring(0, 50)}..."`);
  }
});

console.log('\n' + '='.repeat(60));
console.log(`\n📈 Results: ${passed}/${testCases.length} passed (${(passed/testCases.length*100).toFixed(0)}%)\n`);

// Show extraction examples
console.log('='.repeat(60));
console.log('\n🔍 Data Extraction Examples:\n');

const extractionTests = [
  {
    input: '$47.50 at Raising Cane\'s for lunch with the team',
    type: 'expense'
  },
  {
    input: 'Build a React + Python SaaS for AI experiment tracking. Could do $50K MRR. MVP in 2 weeks.',
    type: 'idea'
  },
  {
    input: 'Senior Full-Stack Engineer at Notion $180k-$220k remote with equity',
    type: 'job'
  },
  {
    input: 'https://www.youtube.com/watch?v=abc123 - Great video tutorial on TypeScript patterns #tutorial #typescript',
    type: 'resource'
  },
  {
    input: 'Meeting with @sarah and @john about Q2 launch. Action items: finalize design, start testing. #urgent',
    type: 'briefing'
  }
];

extractionTests.forEach((test, i) => {
  console.log(`${i+1}. Type: ${test.type.toUpperCase()}`);
  console.log(`   Input: "${test.input}"`);
  const data = smartCapture.extractData(test.input, test.type);
  console.log(`   Extracted:`, JSON.stringify(data, null, 2).split('\n').map((l, i) => i === 0 ? l : '   ' + l).join('\n'));
  console.log();
});

console.log('='.repeat(60));
console.log('\n✨ Smart Capture module ready for use!\n');
console.log('API Endpoints:');
console.log('  POST /api/capture         - Main capture endpoint');
console.log('  POST /api/capture/detect  - Preview detection without storing');
console.log('  GET  /api/capture/types   - List supported types');
console.log('  GET  /api/capture/recent  - Recent captures across all types');
console.log();

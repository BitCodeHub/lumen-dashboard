#!/usr/bin/env node

/**
 * Send import data to Render dashboard via API
 */

const fs = require('fs');
const csv = require('csv-parser');

const API_KEY = '5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69';
const API_URL = 'https://lumen-dashboard.onrender.com/api/admin/import-data';

async function readIdeasFromCSV() {
  const ideas = [];
  
  return new Promise((resolve) => {
    fs.createReadStream('/Users/jimmysmacstudio/clawd/ai-ideas.csv')
      .pipe(csv())
      .on('data', (row) => {
        ideas.push({
          name: row.name,
          description: row.description,
          category: row.category,
          type: row.type,
          revenue_potential: parseFloat(row.estimated_mrr) || 0,
          build_time: row.difficulty,
          status: row.status,
          notes: null
        });
      })
      .on('end', () => resolve(ideas));
  });
}

function readExpensesFromJSON() {
  const data = JSON.parse(
    fs.readFileSync('/Users/jimmysmacstudio/clawd-lumi/data/expenses.json', 'utf8')
  );
  
  return data.expenses.map(exp => ({
    amount: exp.amount,
    category: exp.category,
    description: exp.description,
    date: `${exp.date}T${exp.time}:00`,
    vendor: exp.location,
    notes: null
  }));
}

function getProductPitches() {
  return [
    {
      idea_name: 'MaxRewards AI',
      pitch_content: `AI-powered credit card rewards optimizer that tells users which card to use for maximum cash back on every purchase.

**Market Opportunity:** $527M credit card reward app market growing at 14.5% CAGR
**Pain Point:** 23% of cardholders have unused rewards - $750-1,000 annually lost per user
**Competition:** MaxRewards ($108/yr), CardPointers ($60/yr) - both thriving
**Build Time:** 1 month
**Revenue Model:** $7-19/mo subscription

**Key Insights from Maven's Research:**
- Average American has 3-4 credit cards with different bonuses
- Users default to one card, leaving money on table
- CFPB received 1,200+ complaints about rewards complexity
- Existing apps have 4.9/5 stars, strong demand`,
      verdict: 'pending',
      trend_signal: 'Market research shows 1 month build time with $50k MRR potential. Build score: 8.5/10',
      research_sources: [
        'CreditCards.com consumer survey',
        'CFPB complaint database',
        'Reddit r/CreditCards analysis',
        'MaxRewards/CardPointers reviews'
      ],
      conversation: [],
      verdict_reason: 'Awaiting product validation decision from Jimmy',
      tags: ['maven', 'product-validation', 'credit-cards', 'fintech']
    },
    {
      idea_name: 'ExpenseAI',
      pitch_content: `Smart expense tracking and management system with AI-powered categorization, receipt OCR, and real-time insights.

**Market Opportunity:** $7.64B → $16.48B by 2032 (10.1% CAGR)
**Pain Point:** $58 per manual expense report, 12+ hours wasted annually per employee
**Competition:** Expensify/Ramp/Brex have poor reviews - vulnerable to disruption
**Build Time:** 1 month
**Revenue Model:** $19-49/mo per user

**Key Insights from Maven's Research:**
- Manual expense reports cost $58 each (Aberdeen Group)
- 19% of reports have errors requiring rework
- Employees spend 20 min per report (12+ hours/year)
- Existing solutions have complex UIs, poor mobile experience
- SMBs underserved (tools built for enterprise)`,
      verdict: 'pending',
      trend_signal: 'Market research shows 1 month build time with $100k MRR potential. Build score: 9/10',
      research_sources: [
        'Aberdeen Group expense management study',
        'Capterra/G2 competitor reviews',
        'Reddit r/Accounting feedback',
        'SMB pain point interviews'
      ],
      conversation: [],
      verdict_reason: 'Awaiting product validation decision from Jimmy',
      tags: ['maven', 'product-validation', 'expenses', 'fintech']
    }
  ];
}

async function main() {
  console.log('🚀 Preparing data for import...\n');
  
  const ideas = await readIdeasFromCSV();
  const expenses = readExpensesFromJSON();
  const pitches = getProductPitches();
  
  console.log(`📦 Found ${ideas.length} AI ideas`);
  console.log(`💰 Found ${expenses.length} expenses`);
  console.log(`🦈 Found ${pitches.length} pitches\n`);
  
  console.log('Sending to Render...');
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ ideas, expenses, pitches })
  });
  
  const result = await response.json();
  
  if (response.ok) {
    console.log('\n✅ Import successful!');
    console.log(result);
  } else {
    console.error('\n❌ Import failed:');
    console.error(result);
  }
}

main().catch(console.error);

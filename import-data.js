#!/usr/bin/env node

/**
 * Import data from agents into Lumen Dashboard
 */

const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function importAIIdeas() {
  console.log('\n📦 Importing AI Ideas from CSV...');
  
  const ideas = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream('/Users/jimmysmacstudio/clawd/ai-ideas.csv')
      .pipe(csv())
      .on('data', (row) => {
        ideas.push(row);
      })
      .on('end', async () => {
        console.log(`Found ${ideas.length} ideas`);
        
        for (const idea of ideas) {
          try {
            await pool.query(`
              INSERT INTO lumen_ideas (name, description, category, type, revenue_potential, build_time, status)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              idea.name,
              idea.description,
              idea.category,
              idea.type || 'Personal',
              parseFloat(idea.estimated_mrr) || 0,
              idea.difficulty,
              idea.status
            ]);
            console.log(`✅ Added: ${idea.name}`);
          } catch (err) {
            console.error(`❌ Failed: ${idea.name} - ${err.message}`);
          }
        }
        resolve();
      })
      .on('error', reject);
  });
}

async function importExpenses() {
  console.log('\n💰 Importing expenses from Lumi...');
  
  const expensesData = JSON.parse(
    fs.readFileSync('/Users/jimmysmacstudio/clawd-lumi/data/expenses.json', 'utf8')
  );
  
  for (const exp of expensesData.expenses) {
    try {
      await pool.query(`
        INSERT INTO lumen_expenses (amount, category, description, date, vendor)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        exp.amount,
        exp.category,
        exp.description,
        new Date(`${exp.date}T${exp.time}`),
        exp.location
      ]);
      console.log(`✅ Added expense: $${exp.amount} - ${exp.description}`);
    } catch (err) {
      console.error(`❌ Failed: ${exp.description} - ${err.message}`);
    }
  }
}

async function importProductPitches() {
  console.log('\n🦈 Importing product pitches from Maven...');
  
  const pitches = [
    {
      name: 'MaxRewards AI',
      description: 'AI-powered credit card rewards optimizer that tells users which card to use for maximum cash back on every purchase.',
      category: 'Voice AI - Business',
      type: 'B2B SaaS',
      revenue_potential: 50000,
      build_time: '1 month',
      status: 'idea',
      notes: 'Maven research completed Feb 4, 2026. Build score: 8.5/10. Market: $527M growing 14.5% CAGR.'
    },
    {
      name: 'ExpenseAI',
      description: 'Smart expense tracking and management system with AI-powered categorization and insights.',
      category: 'Automation - Business',
      type: 'B2B SaaS',
      revenue_potential: 100000,
      build_time: '1 month',
      status: 'idea',
      notes: 'Maven research completed Feb 4, 2026. Build score: 9/10. Market: $7.64B → $16.48B by 2032.'
    }
  ];
  
  for (const pitch of pitches) {
    try {
      await pool.query(`
        INSERT INTO lumen_pitches (idea_name, pitch_content, verdict, trend_signal, research_sources, conversation, verdict_reason, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        pitch.name,
        pitch.description,
        'pending',
        `Market research shows ${pitch.build_time} build time with $${pitch.revenue_potential/1000}k MRR potential`,
        ['https://github.com/BitCodeHub/lumen-dashboard', 'Maven product validation'],
        [],
        'Awaiting product validation decision',
        ['maven', 'product-validation', 'research']
      ]);
      console.log(`✅ Added pitch: ${pitch.name}`);
    } catch (err) {
      console.error(`❌ Failed: ${pitch.name} - ${err.message}`);
    }
  }
}

async function main() {
  console.log('🚀 Starting data import...\n');
  
  try {
    await importAIIdeas();
    await importExpenses();
    await importProductPitches();
    
    console.log('\n✅ Import complete!');
    
    // Show summary
    const ideas = await pool.query('SELECT COUNT(*) FROM lumen_ideas');
    const expenses = await pool.query('SELECT COUNT(*) FROM lumen_expenses');
    const pitches = await pool.query('SELECT COUNT(*) FROM lumen_pitches');
    
    console.log('\n📊 Dashboard Summary:');
    console.log(`   AI Ideas: ${ideas.rows[0].count}`);
    console.log(`   Expenses: ${expenses.rows[0].count}`);
    console.log(`   Pitches: ${pitches.rows[0].count}`);
    
  } catch (err) {
    console.error('Error during import:', err);
  } finally {
    await pool.end();
  }
}

main();

#!/usr/bin/env node

/**
 * Add 20 AI Business Opportunities to AI Ideas Lab
 * Created by Unc Lumen - 2026-02-14
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const aiIdeas = [
  // TOP 5 PRIORITY
  {
    name: 'AI Meeting Prep Assistant',
    description: 'AI researches prospects, drafts talking points, suggests questions. Sales reps waste hours prepping for meetings.',
    status: 'idea',
    priority: 10,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Sales reps, account executives. Revenue: $29-99/month per user. Difficulty: Medium, Competition: Low',
    tags: ['sales', 'productivity', 'b2b']
  },
  {
    name: 'AI Subscription Manager',
    description: 'AI scans email/bank, identifies subscriptions, negotiates discounts, cancels unused services. People forget subscriptions and overpay.',
    status: 'idea',
    priority: 9,
    category: 'product',
    revenue_potential: 'very_high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Consumers, small businesses. Revenue: 30% of savings (Rocket Money model). Difficulty: Medium. Validation: Rocket Money $100M+ revenue',
    tags: ['fintech', 'consumer', 'savings']
  },
  {
    name: 'AI Finance Coach for Couples',
    description: 'AI mediates budget discussions, tracks shared goals, suggests compromises. Money is #1 source of relationship conflict.',
    status: 'idea',
    priority: 8,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Couples, married partners. Revenue: $14.99/month. Difficulty: Medium. Gap: Mint died, no good alternative',
    tags: ['fintech', 'consumer', 'relationships']
  },
  {
    name: 'AI Podcast Production Suite',
    description: 'AI handles editing, show notes, clips, social posts, transcriptions. Podcast editing takes 5-10 hours per episode.',
    status: 'idea',
    priority: 8,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'months',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Podcasters, content creators. Revenue: $29/month + usage fees. Difficulty: Medium-High. Market: Exploding (5M+ podcasts)',
    tags: ['content', 'audio', 'creator-tools']
  },
  {
    name: 'AI Sales Outreach Agent',
    description: 'AI researches prospects, writes personalized sequences, handles follow-ups. SDRs spend 80% time on manual outreach with low response rates.',
    status: 'idea',
    priority: 9,
    category: 'product',
    revenue_potential: 'very_high',
    build_time: 'months',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: B2B sales teams, SDRs. Revenue: $49-149/month per seat. Difficulty: High. Pain Point: Desperate need in market',
    tags: ['sales', 'b2b', 'automation']
  },
  
  // ADDITIONAL 15 IDEAS
  {
    name: 'AI LinkedIn Ghostwriter',
    description: 'AI writes LinkedIn posts, comments, and articles for busy executives.',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Executives, thought leaders. Revenue: $199-499/month',
    tags: ['content', 'social', 'b2b']
  },
  {
    name: 'AI Code Review Agent',
    description: 'AI performs automated code reviews, suggests improvements, catches bugs.',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Developers, engineering teams. Revenue: $25-75/month per developer',
    tags: ['developer-tools', 'security', 'quality']
  },
  {
    name: 'AI Email Triage Assistant',
    description: 'AI prioritizes inbox, drafts responses, schedules follow-ups.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Busy professionals. Revenue: $19-49/month',
    tags: ['productivity', 'email', 'automation']
  },
  {
    name: 'AI Content Repurposing',
    description: 'AI converts one piece of content into multiple formats (blog → video → social → newsletter).',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Content creators, marketers. Revenue: $39-99/month',
    tags: ['content', 'marketing', 'creator-tools']
  },
  {
    name: 'AI Customer Support Agent',
    description: 'AI handles customer support tickets, escalates complex issues to humans.',
    status: 'idea',
    priority: 8,
    category: 'product',
    revenue_potential: 'very_high',
    build_time: 'months',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: SaaS companies, e-commerce. Revenue: $0.50-2.00 per conversation',
    tags: ['support', 'automation', 'b2b']
  },
  {
    name: 'AI Resume Optimizer',
    description: 'AI analyzes resumes, suggests improvements, tailors for specific jobs.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'days',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Job seekers. Revenue: $19-39/month',
    tags: ['career', 'job-search', 'consumer']
  },
  {
    name: 'AI Legal Document Review',
    description: 'AI reviews contracts, NDAs, agreements for red flags and issues.',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Small businesses, individuals. Revenue: $49-199 per document',
    tags: ['legal', 'b2b', 'compliance']
  },
  {
    name: 'AI Social Media Manager',
    description: 'AI creates posts, schedules content, responds to comments across platforms.',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Small businesses, influencers. Revenue: $99-299/month',
    tags: ['social', 'marketing', 'automation']
  },
  {
    name: 'AI Personal Stylist',
    description: 'AI suggests outfits based on weather, occasion, existing wardrobe.',
    status: 'idea',
    priority: 5,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Fashion-conscious consumers. Revenue: $9.99-19.99/month',
    tags: ['fashion', 'consumer', 'lifestyle']
  },
  {
    name: 'AI Nutrition Coach',
    description: 'AI creates meal plans, tracks nutrition, suggests recipes based on goals.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Health-conscious consumers. Revenue: $29-59/month',
    tags: ['health', 'nutrition', 'consumer']
  },
  {
    name: 'AI Travel Planner',
    description: 'AI creates complete itineraries, books flights/hotels, finds deals.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Travelers. Revenue: $19-49 per trip',
    tags: ['travel', 'consumer', 'planning']
  },
  {
    name: 'AI Presentation Designer',
    description: 'AI creates professional slide decks from rough outlines or notes.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Business professionals, students. Revenue: $15-39 per presentation',
    tags: ['productivity', 'business', 'design']
  },
  {
    name: 'AI Bookkeeping Assistant',
    description: 'AI categorizes expenses, reconciles accounts, prepares tax documents.',
    status: 'idea',
    priority: 7,
    category: 'product',
    revenue_potential: 'high',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Small businesses, freelancers. Revenue: $49-149/month',
    tags: ['fintech', 'accounting', 'b2b']
  },
  {
    name: 'AI Language Tutor',
    description: 'AI provides personalized language lessons, conversation practice, feedback.',
    status: 'idea',
    priority: 6,
    category: 'product',
    revenue_potential: 'medium',
    build_time: 'weeks',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Language learners. Revenue: $19-39/month',
    tags: ['education', 'language', 'consumer']
  },
  {
    name: 'AI Home Maintenance Tracker',
    description: 'AI reminds homeowners of maintenance tasks, schedules service, tracks repairs.',
    status: 'idea',
    priority: 5,
    category: 'product',
    revenue_potential: 'low',
    build_time: 'days',
    owner: 'Maven',
    created_by: 'Luna',
    notes: 'Target: Homeowners. Revenue: $9.99-14.99/month',
    tags: ['home', 'maintenance', 'consumer']
  }
];

async function checkExisting() {
  console.log('🔍 Checking for existing ideas...');
  const result = await pool.query('SELECT name FROM ai_ideas');
  return new Set(result.rows.map(row => row.name));
}

async function addIdeas() {
  console.log('🚀 Adding AI Business Opportunities to Dashboard...\n');
  
  try {
    const existing = await checkExisting();
    let added = 0;
    let skipped = 0;
    
    for (const idea of aiIdeas) {
      if (existing.has(idea.name)) {
        console.log(`⏭️  Skipped (exists): ${idea.name}`);
        skipped++;
        continue;
      }
      
      try {
        await pool.query(`
          INSERT INTO ai_ideas (name, description, status, priority, category, revenue_potential, build_time, owner, created_by, notes, tags)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          idea.name,
          idea.description,
          idea.status,
          idea.priority,
          idea.category,
          idea.revenue_potential,
          idea.build_time,
          idea.owner,
          idea.created_by,
          idea.notes,
          idea.tags
        ]);
        console.log(`✅ Added: ${idea.name}`);
        added++;
      } catch (err) {
        console.error(`❌ Failed: ${idea.name} - ${err.message}`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Added: ${added}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${aiIdeas.length}`);
    
    // Show current count
    const count = await pool.query('SELECT COUNT(*) FROM ai_ideas');
    console.log(`\n💡 Total AI Ideas in database: ${count.rows[0].count}`);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

addIdeas();

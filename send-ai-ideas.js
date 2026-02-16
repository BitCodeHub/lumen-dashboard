#!/usr/bin/env node

/**
 * Send 20 AI Business Opportunities to Lumen Dashboard
 * Created by Unc Lumen - 2026-02-14
 */

const API_KEY = '5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69';
const API_URL = 'https://lumen-dashboard.onrender.com/api/admin/import-data';

const aiIdeas = [
  // TOP 5 PRIORITY
  {
    name: 'AI Meeting Prep Assistant',
    description: 'AI researches prospects, drafts talking points, suggests questions. Sales reps waste hours prepping for meetings.',
    category: 'Voice AI - Business',
    type: 'B2B SaaS',
    revenue_potential: 75000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Sales reps, account executives. Revenue: $29-99/month per user. Difficulty: Medium, Competition: Low. Priority: 10'
  },
  {
    name: 'AI Subscription Manager',
    description: 'AI scans email/bank, identifies subscriptions, negotiates discounts, cancels unused services. People forget subscriptions and overpay.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 100000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Consumers, small businesses. Revenue: 30% of savings (Rocket Money model). Difficulty: Medium. Validation: Rocket Money $100M+ revenue. Priority: 9'
  },
  {
    name: 'AI Finance Coach for Couples',
    description: 'AI mediates budget discussions, tracks shared goals, suggests compromises. Money is #1 source of relationship conflict.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Couples, married partners. Revenue: $14.99/month. Difficulty: Medium. Gap: Mint died, no good alternative. Priority: 8'
  },
  {
    name: 'AI Podcast Production Suite',
    description: 'AI handles editing, show notes, clips, social posts, transcriptions. Podcast editing takes 5-10 hours per episode.',
    category: 'Voice AI - Content',
    type: 'B2B SaaS',
    revenue_potential: 60000,
    build_time: 'Hard',
    status: 'idea',
    notes: 'Target: Podcasters, content creators. Revenue: $29/month + usage fees. Difficulty: Medium-High. Market: Exploding (5M+ podcasts). Priority: 8'
  },
  {
    name: 'AI Sales Outreach Agent',
    description: 'AI researches prospects, writes personalized sequences, handles follow-ups. SDRs spend 80% time on manual outreach with low response rates.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 100000,
    build_time: 'Hard',
    status: 'idea',
    notes: 'Target: B2B sales teams, SDRs. Revenue: $49-149/month per seat. Difficulty: High. Pain Point: Desperate need in market. Priority: 9'
  },
  
  // ADDITIONAL 15 IDEAS
  {
    name: 'AI LinkedIn Ghostwriter',
    description: 'AI writes LinkedIn posts, comments, and articles for busy executives.',
    category: 'Voice AI - Content',
    type: 'B2B SaaS',
    revenue_potential: 40000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Executives, thought leaders. Revenue: $199-499/month. Priority: 7'
  },
  {
    name: 'AI Code Review Agent',
    description: 'AI performs automated code reviews, suggests improvements, catches bugs.',
    category: 'Automation - Business',
    type: 'Developer Tools',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Developers, engineering teams. Revenue: $25-75/month per developer. Priority: 7'
  },
  {
    name: 'AI Email Triage Assistant',
    description: 'AI prioritizes inbox, drafts responses, schedules follow-ups.',
    category: 'Automation - Personal',
    type: 'Productivity SaaS',
    revenue_potential: 30000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Busy professionals. Revenue: $19-49/month. Priority: 6'
  },
  {
    name: 'AI Content Repurposing',
    description: 'AI converts one piece of content into multiple formats (blog → video → social → newsletter).',
    category: 'Voice AI - Content',
    type: 'Creator Tools',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Content creators, marketers. Revenue: $39-99/month. Priority: 7'
  },
  {
    name: 'AI Customer Support Agent',
    description: 'AI handles customer support tickets, escalates complex issues to humans.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 120000,
    build_time: 'Hard',
    status: 'idea',
    notes: 'Target: SaaS companies, e-commerce. Revenue: $0.50-2.00 per conversation. Priority: 8'
  },
  {
    name: 'AI Resume Optimizer',
    description: 'AI analyzes resumes, suggests improvements, tailors for specific jobs.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 25000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Job seekers. Revenue: $19-39/month. Priority: 6'
  },
  {
    name: 'AI Legal Document Review',
    description: 'AI reviews contracts, NDAs, agreements for red flags and issues.',
    category: 'Automation - Business',
    type: 'Legal Tech',
    revenue_potential: 60000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Small businesses, individuals. Revenue: $49-199 per document. Priority: 7'
  },
  {
    name: 'AI Social Media Manager',
    description: 'AI creates posts, schedules content, responds to comments across platforms.',
    category: 'Automation - Business',
    type: 'Marketing SaaS',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Small businesses, influencers. Revenue: $99-299/month. Priority: 7'
  },
  {
    name: 'AI Personal Stylist',
    description: 'AI suggests outfits based on weather, occasion, existing wardrobe.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 20000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Fashion-conscious consumers. Revenue: $9.99-19.99/month. Priority: 5'
  },
  {
    name: 'AI Nutrition Coach',
    description: 'AI creates meal plans, tracks nutrition, suggests recipes based on goals.',
    category: 'Automation - Personal',
    type: 'Health & Wellness',
    revenue_potential: 35000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Health-conscious consumers. Revenue: $29-59/month. Priority: 6'
  },
  {
    name: 'AI Travel Planner',
    description: 'AI creates complete itineraries, books flights/hotels, finds deals.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 30000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Travelers. Revenue: $19-49 per trip. Priority: 6'
  },
  {
    name: 'AI Presentation Designer',
    description: 'AI creates professional slide decks from rough outlines or notes.',
    category: 'Automation - Business',
    type: 'Productivity SaaS',
    revenue_potential: 25000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Business professionals, students. Revenue: $15-39 per presentation. Priority: 6'
  },
  {
    name: 'AI Bookkeeping Assistant',
    description: 'AI categorizes expenses, reconciles accounts, prepares tax documents.',
    category: 'Automation - Business',
    type: 'FinTech',
    revenue_potential: 60000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Small businesses, freelancers. Revenue: $49-149/month. Priority: 7'
  },
  {
    name: 'AI Language Tutor',
    description: 'AI provides personalized language lessons, conversation practice, feedback.',
    category: 'Voice AI - Personal',
    type: 'Education Tech',
    revenue_potential: 30000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Language learners. Revenue: $19-39/month. Priority: 6'
  },
  {
    name: 'AI Home Maintenance Tracker',
    description: 'AI reminds homeowners of maintenance tasks, schedules service, tracks repairs.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 15000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Homeowners. Revenue: $9.99-14.99/month. Priority: 5'
  }
];

async function main() {
  console.log('🚀 Sending 20 AI Business Opportunities to Dashboard...\n');
  
  console.log(`📦 Sending ${aiIdeas.length} AI ideas to Render...\n`);
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ 
      ideas: aiIdeas,
      expenses: [],
      pitches: []
    })
  });
  
  const result = await response.json();
  
  if (response.ok) {
    console.log('\n✅ Import successful!');
    console.log(result);
    console.log('\n💡 View at: https://lumen-dashboard.onrender.com');
  } else {
    console.error('\n❌ Import failed:');
    console.error(result);
  }
}

main().catch(console.error);

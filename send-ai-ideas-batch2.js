#!/usr/bin/env node

/**
 * Send 23 NEW AI Business Opportunities to Lumen Dashboard (Batch 2)
 * Source: Nightly deep research - Reddit, Twitter/X, HN, Product Hunt, Indie Hackers
 * Created by Unc Lumen 💎 - 2026-02-16
 */

const API_KEY = '5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69';
const API_URL = 'https://lumen-dashboard.onrender.com/api/admin/import-data';

const newAiIdeas = [
  // HIGH PRIORITY (9)
  {
    name: 'AI Voice Agent for Local Businesses',
    description: '24/7 AI voice agent that answers calls, books appointments, takes messages. Local businesses miss 35%+ of calls, losing revenue.',
    category: 'Voice AI - Business',
    type: 'B2B SaaS',
    revenue_potential: 60000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Local service businesses (1-10 employees). Revenue: $200-500/mo. Stack: VAPI, Retell AI, Make/n8n. Source: retellai.com. Priority: 9'
  },
  {
    name: 'AI Review Response Manager',
    description: 'AI monitors Google/Yelp/Facebook reviews, auto-generates personalized responses. SMBs can\'t keep up with reviews across platforms.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 50000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Restaurants, hotels, local services (5+ locations). Revenue: $99-299/mo/location. Stack: GPT-4o, review APIs, n8n. Priority: 9'
  },
  {
    name: 'AI Workflow Automation Agency',
    description: 'Done-for-you automation agency using AI to build complex multi-step workflows faster. SMBs don\'t know how to build workflows.',
    category: 'Automation - Business',
    type: 'Agency/Service',
    revenue_potential: 200000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: SMBs, agencies, professional services. Revenue: $2k-10k setup + $500-2k/mo maintenance. Source: Reddit r/nocode. Priority: 9'
  },

  // HIGH PRIORITY (8)
  {
    name: 'AI Document Data Extraction',
    description: 'AI extracts structured data from invoices/receipts to QuickBooks/Xero. Manual data entry is error-prone and tedious.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 80000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Accounting firms, SMBs (100+ invoices/mo). Revenue: $0.10-0.25/doc + monthly base. Stack: Azure Document Intelligence, GPT-4o Vision. Priority: 8'
  },
  {
    name: 'AI Meeting Notes & Action Tracker',
    description: 'AI joins calls, transcribes, extracts decisions and action items automatically. Teams lose track of decisions.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 45000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Remote teams, consulting firms, agencies. Revenue: $15-30/user/mo. Stack: Deepgram, OpenAI, Slack API. Priority: 8'
  },
  {
    name: 'AI TikTok Shop Agent',
    description: 'AI monitors inventory, auto-adjusts pricing, responds to customer comments. TikTok Shop sellers struggle with operations.',
    category: 'Automation - E-commerce',
    type: 'B2B SaaS',
    revenue_potential: 100000,
    build_time: 'Hard',
    status: 'idea',
    notes: 'Target: TikTok Shop sellers ($50k-500k/mo). Revenue: $300-800/mo + revenue share. Stack: TikTok Shop API, n8n, OpenAI. Source: @gregisenberg. Priority: 8'
  },
  {
    name: 'AI Proposal Generator',
    description: 'AI analyzes RFPs and generates professional proposals automatically. Agencies spend 10+ hours crafting proposals.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 40000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Marketing agencies, consultancies. Revenue: $79-199/mo. Priority: 8'
  },
  {
    name: 'AI Local SEO Content Machine',
    description: 'AI generates city-specific landing pages and blog posts for multi-location businesses.',
    category: 'Automation - Marketing',
    type: 'B2B SaaS',
    revenue_potential: 75000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Multi-location businesses, franchises. Revenue: $199-499/mo/location. Priority: 8'
  },
  {
    name: 'AI Inventory Forecasting',
    description: 'AI analyzes sales velocity and predicts optimal inventory levels. E-commerce sellers lose money to stockouts/overstock.',
    category: 'Automation - E-commerce',
    type: 'B2B SaaS',
    revenue_potential: 80000,
    build_time: 'Hard',
    status: 'idea',
    notes: 'Target: Shopify sellers ($100k-5M/yr). Revenue: $149-399/mo. Priority: 8'
  },
  {
    name: 'AI Chatbot Training Service',
    description: 'Service that trains business chatbots on company docs with ongoing refinement. Chatbots answer incorrectly due to poor training.',
    category: 'Automation - Business',
    type: 'Agency/Service',
    revenue_potential: 100000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: SMBs with existing chatbots. Revenue: $500-2k setup + $200-500/mo maintenance. Priority: 8'
  },
  {
    name: 'AI Sales Call Coaching',
    description: 'AI analyzes sales calls, scores performance, provides real-time coaching feedback.',
    category: 'Voice AI - Business',
    type: 'B2B SaaS',
    revenue_potential: 70000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: SaaS sales teams, call centers. Revenue: $50-100/rep/mo. Priority: 8'
  },

  // MEDIUM PRIORITY (7)
  {
    name: 'AI Niche Website Builder',
    description: 'AI generates complete niche websites with SEO content for local businesses. WordPress is too complex.',
    category: 'Automation - Marketing',
    type: 'B2B SaaS',
    revenue_potential: 35000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Local service professionals, solo practitioners. Revenue: $29-79/mo + setup fee. Stack: Next.js, Tailwind, Vercel. Priority: 7'
  },
  {
    name: 'AI Interview Screening',
    description: 'AI conducts async video interviews and scores candidates automatically. Small businesses can\'t screen 200+ applications.',
    category: 'Automation - HR',
    type: 'B2B SaaS',
    revenue_potential: 40000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: SMBs hiring 5-20 people/yr. Revenue: $50-150/job posting. Stack: Daily.co, GPT-4o. Priority: 7'
  },
  {
    name: 'AI Social Media Comment Responder',
    description: 'AI reads social media comments and generates contextual, brand-appropriate replies.',
    category: 'Automation - Marketing',
    type: 'B2B SaaS',
    revenue_potential: 35000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: E-commerce brands, influencers (10k-500k followers). Revenue: $99-299/mo/brand. Priority: 7'
  },
  {
    name: 'AI Support Training Simulator',
    description: 'AI simulates angry customers for support rep training and provides feedback.',
    category: 'Voice AI - Business',
    type: 'B2B SaaS',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: BPOs, companies with 50+ support agents. Revenue: $50-100/agent/mo. Priority: 7'
  },
  {
    name: 'AI YouTube Shorts Factory',
    description: 'AI identifies viral moments in long videos, adds captions, exports optimized Shorts.',
    category: 'Voice AI - Content',
    type: 'Creator Tools',
    revenue_potential: 30000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: YouTubers, podcasters, educators. Revenue: $29-79/mo. Priority: 7'
  },
  {
    name: 'AI Real Estate Listing Writer',
    description: 'AI generates compelling, MLS-optimized property descriptions. Agents spend 30+ min per listing.',
    category: 'Automation - Real Estate',
    type: 'B2B SaaS',
    revenue_potential: 25000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Real estate agents, brokerages. Revenue: $5-15/listing or $49/mo unlimited. Priority: 7'
  },
  {
    name: 'AI Affiliate Content Site Builder',
    description: 'AI researches products, writes comparisons, auto-updates prices for affiliate sites.',
    category: 'Automation - Marketing',
    type: 'Creator Tools',
    revenue_potential: 40000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Affiliate marketers, niche site builders. Revenue: $99-299/mo/site. Priority: 7'
  },
  {
    name: 'AI Job Description Writer',
    description: 'AI generates optimized, inclusive job descriptions that attract better candidates.',
    category: 'Automation - HR',
    type: 'B2B SaaS',
    revenue_potential: 20000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: SMBs, startups without HR teams. Revenue: $19-49/job or $99/mo unlimited. Priority: 7'
  },

  // LOWER PRIORITY (6)
  {
    name: 'AI Exit Interview Analysis',
    description: 'AI aggregates exit interview data, identifies patterns, predicts turnover risk.',
    category: 'Automation - HR',
    type: 'B2B SaaS',
    revenue_potential: 30000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Mid-size companies (100-1000 employees). Revenue: $5-10/employee/mo. Priority: 6'
  },
  {
    name: 'AI Receipt Expense Tracker',
    description: 'Snap receipt photo, AI extracts data and logs to accounting automatically.',
    category: 'Automation - Personal',
    type: 'Consumer SaaS',
    revenue_potential: 15000,
    build_time: 'Easy',
    status: 'idea',
    notes: 'Target: Freelancers, gig workers, solopreneurs. Revenue: $9-19/mo. Priority: 6'
  },
  {
    name: 'AI Warranty Claim Processor',
    description: 'AI validates warranty claims, flags fraud, approves valid ones automatically.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 50000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Manufacturers, retailers with warranties. Revenue: $2-5/claim processed. Priority: 6'
  },
  {
    name: 'AI Event Planning Assistant',
    description: 'AI suggests venues, helps negotiate vendors, manages RSVPs for corporate events.',
    category: 'Automation - Business',
    type: 'B2B SaaS',
    revenue_potential: 25000,
    build_time: 'Medium',
    status: 'idea',
    notes: 'Target: Corporate event planners, marketing teams. Revenue: $199-499/event. Priority: 6'
  }
];

async function main() {
  console.log('🚀 Adding 23 NEW AI Business Opportunities to Dashboard (Batch 2)...\n');
  console.log('📊 Source: Nightly deep research (Reddit, X, HN, Product Hunt, Indie Hackers)\n');
  
  console.log(`📦 Sending ${newAiIdeas.length} new AI ideas to Render...\n`);
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ 
      ideas: newAiIdeas,
      expenses: [],
      pitches: []
    })
  });
  
  const result = await response.json();
  
  if (response.ok) {
    console.log('\n✅ Import successful!');
    console.log(result);
    console.log('\n📈 Total ideas now: 43 (20 original + 23 new)');
    console.log('💡 View at: https://lumen-dashboard.onrender.com');
  } else {
    console.error('\n❌ Import failed:');
    console.error(result);
  }
}

main().catch(console.error);

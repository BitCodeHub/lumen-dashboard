#!/bin/bash

# Upload 20 AI Business Opportunities to Lumen Dashboard
# Created by Unc Lumen - 2026-02-14

API_URL="https://lumen-dashboard.onrender.com/api/ideas"

echo "🚀 Uploading AI Business Opportunities to Dashboard..."
echo ""

# Function to add an idea
add_idea() {
  local name="$1"
  local description="$2"
  local category="$3"
  local revenue_potential="$4"
  local build_time="$5"
  local priority="$6"
  local notes="$7"
  local tags="$8"
  
  echo "Adding: $name"
  
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$name\",
      \"description\": \"$description\",
      \"category\": \"$category\",
      \"revenue_potential\": $revenue_potential,
      \"build_time\": \"$build_time\",
      \"status\": \"idea\",
      \"priority\": $priority,
      \"notes\": \"$notes\",
      \"tags\": $tags
    }")
  
  if echo "$response" | grep -q "\"id\""; then
    echo "✅ Added successfully"
  else
    echo "❌ Failed: $response"
  fi
  echo ""
}

# TOP 5 PRIORITY IDEAS

add_idea \
  "AI Meeting Prep Assistant" \
  "AI researches prospects, drafts talking points, suggests questions. Sales reps waste hours prepping for meetings." \
  "product" \
  75000 \
  "weeks" \
  10 \
  "Target: Sales reps, account executives. Revenue: \$29-99/month per user. Difficulty: Medium, Competition: Low" \
  "[\"sales\", \"productivity\", \"b2b\"]"

add_idea \
  "AI Subscription Manager" \
  "AI scans email/bank, identifies subscriptions, negotiates discounts, cancels unused services. People forget subscriptions and overpay." \
  "product" \
  100000 \
  "weeks" \
  9 \
  "Target: Consumers, small businesses. Revenue: 30% of savings (Rocket Money model). Difficulty: Medium. Validation: Rocket Money \$100M+ revenue" \
  "[\"fintech\", \"consumer\", \"savings\"]"

add_idea \
  "AI Finance Coach for Couples" \
  "AI mediates budget discussions, tracks shared goals, suggests compromises. Money is #1 source of relationship conflict." \
  "product" \
  50000 \
  "weeks" \
  8 \
  "Target: Couples, married partners. Revenue: \$14.99/month. Difficulty: Medium. Gap: Mint died, no good alternative" \
  "[\"fintech\", \"consumer\", \"relationships\"]"

add_idea \
  "AI Podcast Production Suite" \
  "AI handles editing, show notes, clips, social posts, transcriptions. Podcast editing takes 5-10 hours per episode." \
  "product" \
  60000 \
  "months" \
  8 \
  "Target: Podcasters, content creators. Revenue: \$29/month + usage fees. Difficulty: Medium-High. Market: Exploding (5M+ podcasts)" \
  "[\"content\", \"audio\", \"creator-tools\"]"

add_idea \
  "AI Sales Outreach Agent" \
  "AI researches prospects, writes personalized sequences, handles follow-ups. SDRs spend 80% time on manual outreach with low response rates." \
  "product" \
  100000 \
  "months" \
  9 \
  "Target: B2B sales teams, SDRs. Revenue: \$49-149/month per seat. Difficulty: High. Pain Point: Desperate need in market" \
  "[\"sales\", \"b2b\", \"automation\"]"

# ADDITIONAL 15 IDEAS

add_idea \
  "AI LinkedIn Ghostwriter" \
  "AI writes LinkedIn posts, comments, and articles for busy executives." \
  "product" \
  40000 \
  "weeks" \
  7 \
  "Target: Executives, thought leaders. Revenue: \$199-499/month" \
  "[\"content\", \"social\", \"b2b\"]"

add_idea \
  "AI Code Review Agent" \
  "AI performs automated code reviews, suggests improvements, catches bugs." \
  "product" \
  50000 \
  "weeks" \
  7 \
  "Target: Developers, engineering teams. Revenue: \$25-75/month per developer" \
  "[\"developer-tools\", \"security\", \"quality\"]"

add_idea \
  "AI Email Triage Assistant" \
  "AI prioritizes inbox, drafts responses, schedules follow-ups." \
  "product" \
  30000 \
  "weeks" \
  6 \
  "Target: Busy professionals. Revenue: \$19-49/month" \
  "[\"productivity\", \"email\", \"automation\"]"

add_idea \
  "AI Content Repurposing" \
  "AI converts one piece of content into multiple formats (blog → video → social → newsletter)." \
  "product" \
  50000 \
  "weeks" \
  7 \
  "Target: Content creators, marketers. Revenue: \$39-99/month" \
  "[\"content\", \"marketing\", \"creator-tools\"]"

add_idea \
  "AI Customer Support Agent" \
  "AI handles customer support tickets, escalates complex issues to humans." \
  "product" \
  120000 \
  "months" \
  8 \
  "Target: SaaS companies, e-commerce. Revenue: \$0.50-2.00 per conversation" \
  "[\"support\", \"automation\", \"b2b\"]"

add_idea \
  "AI Resume Optimizer" \
  "AI analyzes resumes, suggests improvements, tailors for specific jobs." \
  "product" \
  25000 \
  "days" \
  6 \
  "Target: Job seekers. Revenue: \$19-39/month" \
  "[\"career\", \"job-search\", \"consumer\"]"

add_idea \
  "AI Legal Document Review" \
  "AI reviews contracts, NDAs, agreements for red flags and issues." \
  "product" \
  60000 \
  "weeks" \
  7 \
  "Target: Small businesses, individuals. Revenue: \$49-199 per document" \
  "[\"legal\", \"b2b\", \"compliance\"]"

add_idea \
  "AI Social Media Manager" \
  "AI creates posts, schedules content, responds to comments across platforms." \
  "product" \
  50000 \
  "weeks" \
  7 \
  "Target: Small businesses, influencers. Revenue: \$99-299/month" \
  "[\"social\", \"marketing\", \"automation\"]"

add_idea \
  "AI Personal Stylist" \
  "AI suggests outfits based on weather, occasion, existing wardrobe." \
  "product" \
  20000 \
  "weeks" \
  5 \
  "Target: Fashion-conscious consumers. Revenue: \$9.99-19.99/month" \
  "[\"fashion\", \"consumer\", \"lifestyle\"]"

add_idea \
  "AI Nutrition Coach" \
  "AI creates meal plans, tracks nutrition, suggests recipes based on goals." \
  "product" \
  35000 \
  "weeks" \
  6 \
  "Target: Health-conscious consumers. Revenue: \$29-59/month" \
  "[\"health\", \"nutrition\", \"consumer\"]"

add_idea \
  "AI Travel Planner" \
  "AI creates complete itineraries, books flights/hotels, finds deals." \
  "product" \
  30000 \
  "weeks" \
  6 \
  "Target: Travelers. Revenue: \$19-49 per trip" \
  "[\"travel\", \"consumer\", \"planning\"]"

add_idea \
  "AI Presentation Designer" \
  "AI creates professional slide decks from rough outlines or notes." \
  "product" \
  25000 \
  "weeks" \
  6 \
  "Target: Business professionals, students. Revenue: \$15-39 per presentation" \
  "[\"productivity\", \"business\", \"design\"]"

add_idea \
  "AI Bookkeeping Assistant" \
  "AI categorizes expenses, reconciles accounts, prepares tax documents." \
  "product" \
  60000 \
  "weeks" \
  7 \
  "Target: Small businesses, freelancers. Revenue: \$49-149/month" \
  "[\"fintech\", \"accounting\", \"b2b\"]"

add_idea \
  "AI Language Tutor" \
  "AI provides personalized language lessons, conversation practice, feedback." \
  "product" \
  30000 \
  "weeks" \
  6 \
  "Target: Language learners. Revenue: \$19-39/month" \
  "[\"education\", \"language\", \"consumer\"]"

add_idea \
  "AI Home Maintenance Tracker" \
  "AI reminds homeowners of maintenance tasks, schedules service, tracks repairs." \
  "product" \
  15000 \
  "days" \
  5 \
  "Target: Homeowners. Revenue: \$9.99-14.99/month" \
  "[\"home\", \"maintenance\", \"consumer\"]"

echo "✅ Upload complete!"
echo "View at: https://lumen-dashboard.onrender.com"

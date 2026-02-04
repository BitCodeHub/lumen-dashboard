#!/bin/bash
# Clear and re-index memories with proper vector format

API_URL="https://lumen-dashboard.onrender.com"
API_KEY="5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69"

echo "Step 1: Clearing old memories (with bad format)..."
curl -s -X POST "$API_URL/api/memory/clear" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json"

echo ""
echo "Step 2: Re-indexing all memory files..."
cd /Users/jimmysmacstudio/clawd/projects/lumen-dashboard
node index-memories-remote.js

echo ""
echo "Step 3: Testing search..."
curl -s -X POST "$API_URL/api/memory/search" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "What does Jimmy like to eat?", "matchCount": 3}' | jq '.'

echo ""
echo "Done!"

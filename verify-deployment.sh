#!/bin/bash
# Lumen Dashboard - Deployment Verification Script
# Run this after Render completes deployment

echo "🔍 Lumen Dashboard - Deployment Verification"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get URL from user
echo "Enter the Render URL (e.g., https://lumen-dashboard.onrender.com):"
read DASHBOARD_URL

if [ -z "$DASHBOARD_URL" ]; then
  echo -e "${RED}❌ No URL provided${NC}"
  exit 1
fi

echo ""
echo "Testing: $DASHBOARD_URL"
echo ""

# Test 1: Basic connectivity
echo -n "1. Testing basic connectivity... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" --max-time 10)
if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 302 ]; then
  echo -e "${GREEN}✅ PASS${NC} (HTTP $HTTP_CODE)"
else
  echo -e "${RED}❌ FAIL${NC} (HTTP $HTTP_CODE)"
  echo "Site may still be deploying or there's an error"
fi

# Test 2: Check for login redirect
echo -n "2. Testing login redirect... "
LOCATION=$(curl -s -I "$DASHBOARD_URL" | grep -i "location:" | awk '{print $2}' | tr -d '\r')
if [[ "$LOCATION" == *"login.html"* ]]; then
  echo -e "${GREEN}✅ PASS${NC}"
  echo "   Correctly redirects to login page"
else
  echo -e "${YELLOW}⚠️  WARN${NC}"
  echo "   No login redirect detected (Location: $LOCATION)"
fi

# Test 3: API health check
echo -n "3. Testing API response... "
API_RESPONSE=$(curl -s "$DASHBOARD_URL/api/briefings" --max-time 10)
if [[ "$API_RESPONSE" == *"error"* ]] || [[ "$API_RESPONSE" == *"unauthorized"* ]]; then
  echo -e "${GREEN}✅ PASS${NC}"
  echo "   API is responding (expects authentication)"
else
  echo -e "${YELLOW}⚠️  WARN${NC}"
  echo "   Unexpected API response"
fi

# Test 4: Static file serving
echo -n "4. Testing static files... "
STATIC_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/login.html" --max-time 10)
if [ "$STATIC_CODE" -eq 200 ]; then
  echo -e "${GREEN}✅ PASS${NC}"
else
  echo -e "${RED}❌ FAIL${NC} (HTTP $STATIC_CODE)"
fi

# Test 5: Response time
echo -n "5. Testing response time... "
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$DASHBOARD_URL" --max-time 10)
if (( $(echo "$RESPONSE_TIME < 3.0" | bc -l) )); then
  echo -e "${GREEN}✅ PASS${NC} (${RESPONSE_TIME}s)"
else
  echo -e "${YELLOW}⚠️  WARN${NC} (${RESPONSE_TIME}s - slower than expected)"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}Verification complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Open $DASHBOARD_URL in browser"
echo "  2. Try logging in with your credentials"
echo "  3. Check Render logs for [Session] messages"
echo "  4. Verify SESSION_SECRET is set in Render env vars"
echo ""
echo "If login doesn't work, check Render logs:"
echo "  - Look for: '[Session] Session store initialized with PostgreSQL' (good)"
echo "  - Or: '[Session] Using memory store fallback' (check DATABASE_URL)"
echo ""

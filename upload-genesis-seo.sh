#!/bin/bash

# Upload Genesis SEO Report to Dashboard

API_KEY="5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69"
API_URL="https://lumen-dashboard.onrender.com"

# File paths
PDF_FILE="/Users/jimmysmacstudio/clawd/seo-reports/genesis-owners-portal-seo-audit.pdf"
HTML_FILE="/Users/jimmysmacstudio/clawd/seo-reports/genesis-owners-portal-seo-audit.html"
MD_FILE="/Users/jimmysmacstudio/clawd/seo-reports/genesis-owners-portal-seo-audit.md"

echo "📤 Uploading Genesis SEO Report to Dashboard..."

curl -X POST "$API_URL/api/seo-reports" \
  -H "X-API-Key: $API_KEY" \
  -F "website_url=https://owners.genesis.com" \
  -F "website_name=MyGenesis Owner Portal" \
  -F "overall_score=52" \
  -F "technical_score=45" \
  -F "onpage_score=55" \
  -F "content_score=40" \
  -F "ux_score=70" \
  -F "mobile_score=65" \
  -F "critical_issues=2" \
  -F "warnings=5" \
  -F "recommendations=12" \
  -F "audit_date=2026-01-27T02:09:00" \
  -F "pdf=@$PDF_FILE" \
  -F "html=@$HTML_FILE" \
  -F "markdown=@$MD_FILE" \
  -F "notes=Initial audit identifying critical issues: missing sitemap.xml and outdated maintenance notice from July 2019." \
  | jq '.'

echo ""
echo "✅ Upload complete! View at: $API_URL/seo.html"

#!/bin/bash
# Script to check users on Render deployment
echo "Attempting to fetch users from Render..."
curl -s -H "x-api-key: 5328cc2a49e94c533a47eaad0409e07d48df07ca265eba69" \
  https://lumen-dashboard.onrender.com/api/users/list \
  -w "\nHTTP Status: %{http_code}\n" \
  | head -50

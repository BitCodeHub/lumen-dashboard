#!/bin/bash
# Run migration 005 on production database

echo "Running migration 005_documents.sql..."

psql "$DATABASE_URL" -f migrations/005_documents.sql

echo "Migration complete!"

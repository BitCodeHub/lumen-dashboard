-- Smart Expenses Schema Migration
-- Adds intelligent categorization fields for food and merchant tracking

-- Add new columns to lumen_expenses
ALTER TABLE lumen_expenses 
ADD COLUMN IF NOT EXISTS meal_type VARCHAR(50),           -- breakfast, lunch, dinner, snack, drinks
ADD COLUMN IF NOT EXISTS food_type VARCHAR(100),          -- hamburgers, chicken, mexican, asian, pizza, etc.
ADD COLUMN IF NOT EXISTS cuisine VARCHAR(100),            -- American, Mexican, Chinese, Italian, etc.
ADD COLUMN IF NOT EXISTS merchant_type VARCHAR(50),       -- restaurant, fast_food, grocery, gas_station, retail, etc.
ADD COLUMN IF NOT EXISTS who_for VARCHAR(255),            -- who the expense was for (Jayden, Jimmy, family, etc.)
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}', -- dynamic fields for anything else
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual', -- manual, voice, receipt_photo, import
ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2),         -- AI confidence score 0.00-1.00
ADD COLUMN IF NOT EXISTS raw_input TEXT;                  -- original input text/transcription for reference

-- Create food types reference table
CREATE TABLE IF NOT EXISTS lumen_food_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50),  -- fast_food, casual_dining, fine_dining, grocery, etc.
  cuisine VARCHAR(50),   -- American, Mexican, Asian, etc.
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed common food types
INSERT INTO lumen_food_types (name, category, cuisine) VALUES
  ('hamburgers', 'fast_food', 'American'),
  ('chicken', 'fast_food', 'American'),
  ('chicken tenders', 'fast_food', 'American'),
  ('pizza', 'fast_food', 'Italian'),
  ('tacos', 'fast_food', 'Mexican'),
  ('burritos', 'fast_food', 'Mexican'),
  ('sushi', 'casual_dining', 'Japanese'),
  ('ramen', 'casual_dining', 'Japanese'),
  ('pho', 'casual_dining', 'Vietnamese'),
  ('chinese', 'casual_dining', 'Chinese'),
  ('thai', 'casual_dining', 'Thai'),
  ('indian', 'casual_dining', 'Indian'),
  ('sandwiches', 'fast_food', 'American'),
  ('salads', 'casual_dining', 'American'),
  ('seafood', 'casual_dining', 'American'),
  ('steak', 'fine_dining', 'American'),
  ('bbq', 'casual_dining', 'American'),
  ('wings', 'fast_food', 'American'),
  ('coffee', 'cafe', 'American'),
  ('breakfast', 'cafe', 'American'),
  ('brunch', 'casual_dining', 'American'),
  ('dessert', 'cafe', 'American'),
  ('ice cream', 'fast_food', 'American'),
  ('smoothies', 'cafe', 'American'),
  ('drinks', 'bar', 'American'),
  ('beer', 'bar', 'American'),
  ('wine', 'bar', 'American'),
  ('cocktails', 'bar', 'American')
ON CONFLICT (name) DO NOTHING;

-- Create merchant profiles for smart recognition
CREATE TABLE IF NOT EXISTS lumen_merchant_profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  aliases TEXT[],                    -- alternative names/spellings
  merchant_type VARCHAR(50),         -- restaurant, fast_food, grocery, etc.
  default_category VARCHAR(50),      -- Food, Gas, Shopping, etc.
  default_food_type VARCHAR(100),
  default_cuisine VARCHAR(50),
  default_meal_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(name)
);

-- Seed known merchants Jimmy uses
INSERT INTO lumen_merchant_profiles (name, aliases, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type) VALUES
  ('Raising Cane''s', ARRAY['Raising Cane', 'Canes', 'Raising Canes'], 'fast_food', 'Food', 'chicken tenders', 'American', NULL),
  ('Costco', ARRAY['Costco Wholesale'], 'grocery', 'Groceries', NULL, NULL, NULL),
  ('Chipotle', ARRAY['Chipotle Mexican Grill'], 'fast_food', 'Food', 'burritos', 'Mexican', NULL),
  ('Starbucks', ARRAY['Starbucks Coffee'], 'cafe', 'Food', 'coffee', 'American', 'breakfast'),
  ('McDonald''s', ARRAY['McDonalds', 'Mcd'], 'fast_food', 'Food', 'hamburgers', 'American', NULL),
  ('Chick-fil-A', ARRAY['Chick fil A', 'CFA', 'Chickfila'], 'fast_food', 'Food', 'chicken', 'American', NULL),
  ('In-N-Out', ARRAY['In N Out', 'InNOut', 'In-N-Out Burger'], 'fast_food', 'Food', 'hamburgers', 'American', NULL),
  ('Taco Bell', ARRAY['TacoBell', 'TB'], 'fast_food', 'Food', 'tacos', 'Mexican', NULL),
  ('Panda Express', ARRAY['Panda'], 'fast_food', 'Food', 'chinese', 'Chinese', NULL),
  ('Shell', ARRAY['Shell Gas'], 'gas_station', 'Gas', NULL, NULL, NULL),
  ('Chevron', ARRAY['Chevron Gas'], 'gas_station', 'Gas', NULL, NULL, NULL),
  ('Amazon', ARRAY['Amazon.com', 'AMZN'], 'retail', 'Shopping', NULL, NULL, NULL),
  ('Target', ARRAY[], 'retail', 'Shopping', NULL, NULL, NULL),
  ('Walmart', ARRAY['Wal-Mart'], 'retail', 'Shopping', NULL, NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- Create index for faster merchant lookups
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_name ON lumen_merchant_profiles(LOWER(name));

-- Create index for expense queries by meal type
CREATE INDEX IF NOT EXISTS idx_expenses_meal_type ON lumen_expenses(meal_type);
CREATE INDEX IF NOT EXISTS idx_expenses_food_type ON lumen_expenses(food_type);
CREATE INDEX IF NOT EXISTS idx_expenses_who_for ON lumen_expenses(who_for);

/**
 * Smart Expense Parser
 * Intelligently parses expense inputs from text, voice, or receipt photos
 */

// Known merchant patterns for auto-detection
const MERCHANT_PATTERNS = {
  "raising cane": { name: "Raising Cane's", type: "fast_food", category: "Food", food_type: "chicken tenders", cuisine: "American" },
  "canes": { name: "Raising Cane's", type: "fast_food", category: "Food", food_type: "chicken tenders", cuisine: "American" },
  "chipotle": { name: "Chipotle", type: "fast_food", category: "Food", food_type: "burritos", cuisine: "Mexican" },
  "mcdonald": { name: "McDonald's", type: "fast_food", category: "Food", food_type: "hamburgers", cuisine: "American" },
  "starbucks": { name: "Starbucks", type: "cafe", category: "Food", food_type: "coffee", cuisine: "American" },
  "chick-fil-a": { name: "Chick-fil-A", type: "fast_food", category: "Food", food_type: "chicken", cuisine: "American" },
  "chickfila": { name: "Chick-fil-A", type: "fast_food", category: "Food", food_type: "chicken", cuisine: "American" },
  "in-n-out": { name: "In-N-Out", type: "fast_food", category: "Food", food_type: "hamburgers", cuisine: "American" },
  "taco bell": { name: "Taco Bell", type: "fast_food", category: "Food", food_type: "tacos", cuisine: "Mexican" },
  "panda express": { name: "Panda Express", type: "fast_food", category: "Food", food_type: "chinese", cuisine: "Chinese" },
  "costco": { name: "Costco", type: "grocery", category: "Groceries", food_type: null, cuisine: null },
  "walmart": { name: "Walmart", type: "retail", category: "Shopping", food_type: null, cuisine: null },
  "target": { name: "Target", type: "retail", category: "Shopping", food_type: null, cuisine: null },
  "amazon": { name: "Amazon", type: "retail", category: "Shopping", food_type: null, cuisine: null },
  "shell": { name: "Shell", type: "gas_station", category: "Gas", food_type: null, cuisine: null },
  "chevron": { name: "Chevron", type: "gas_station", category: "Gas", food_type: null, cuisine: null },
  "76": { name: "76", type: "gas_station", category: "Gas", food_type: null, cuisine: null },
  "arco": { name: "Arco", type: "gas_station", category: "Gas", food_type: null, cuisine: null },
};

// Meal type detection based on keywords and time
const MEAL_KEYWORDS = {
  breakfast: ['breakfast', 'morning', 'brunch', 'coffee', 'bagel', 'eggs', 'pancakes', 'waffles'],
  lunch: ['lunch', 'midday', 'noon'],
  dinner: ['dinner', 'supper', 'evening'],
  snack: ['snack', 'snacks', 'treat'],
  drinks: ['drinks', 'beer', 'wine', 'cocktail', 'bar', 'alcohol', 'happy hour']
};

// Food type detection
const FOOD_KEYWORDS = {
  hamburgers: ['burger', 'hamburger', 'cheeseburger'],
  chicken: ['chicken', 'poultry', 'wings'],
  'chicken tenders': ['tender', 'tenders', 'strips', 'fingers'],
  pizza: ['pizza', 'pizzeria'],
  tacos: ['taco', 'tacos'],
  burritos: ['burrito', 'burritos', 'bowl'],
  sushi: ['sushi', 'sashimi', 'roll', 'rolls'],
  chinese: ['chinese', 'kung pao', 'orange chicken', 'fried rice', 'lo mein'],
  mexican: ['mexican', 'quesadilla', 'enchilada', 'nachos'],
  coffee: ['coffee', 'latte', 'cappuccino', 'espresso', 'mocha', 'frappuccino'],
  sandwiches: ['sandwich', 'sub', 'hoagie', 'panini'],
  salads: ['salad', 'salads'],
  seafood: ['fish', 'shrimp', 'salmon', 'lobster', 'crab', 'seafood'],
  bbq: ['bbq', 'barbecue', 'brisket', 'ribs'],
  thai: ['thai', 'pad thai', 'curry'],
  indian: ['indian', 'curry', 'tikka', 'naan', 'biryani'],
  vietnamese: ['pho', 'vietnamese', 'banh mi'],
  japanese: ['ramen', 'udon', 'teriyaki'],
  italian: ['pasta', 'italian', 'lasagna', 'spaghetti', 'alfredo'],
};

/**
 * Parse expense from natural language input
 */
function parseExpenseText(input) {
  const text = input.toLowerCase();
  const result = {
    amount: null,
    vendor: null,
    category: null,
    merchant_type: null,
    food_type: null,
    cuisine: null,
    meal_type: null,
    who_for: null,
    description: null,
    confidence: 0.5,
    raw_input: input,
    source: 'text'
  };

  // Extract amount
  const amountPatterns = [
    /\$([0-9]+(?:\.[0-9]{1,2})?)/,                    // $12.50
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|bucks?)/, // 12.50 dollars
    /spent\s+([0-9]+(?:\.[0-9]{1,2})?)/,              // spent 12.50
    /paid\s+([0-9]+(?:\.[0-9]{1,2})?)/,               // paid 12.50
    /([0-9]+(?:\.[0-9]{1,2})?)\s+(?:at|for|on)/,      // 12.50 at
  ];
  
  for (const pattern of amountPatterns) {
    const match = input.match(pattern);
    if (match) {
      result.amount = parseFloat(match[1]);
      result.confidence += 0.1;
      break;
    }
  }

  // Extract vendor/merchant using known patterns
  for (const [pattern, merchant] of Object.entries(MERCHANT_PATTERNS)) {
    if (text.includes(pattern)) {
      result.vendor = merchant.name;
      result.merchant_type = merchant.type;
      result.category = merchant.category;
      result.food_type = merchant.food_type;
      result.cuisine = merchant.cuisine;
      result.confidence += 0.2;
      break;
    }
  }

  // If no known merchant, try to extract vendor from "at [place]"
  if (!result.vendor) {
    const atMatch = input.match(/(?:at|from)\s+([A-Z][a-zA-Z\s''-]+?)(?:\s+for|\s+on|\.|$)/i);
    if (atMatch) {
      result.vendor = atMatch[1].trim();
      result.confidence += 0.1;
    }
  }

  // Extract meal type from keywords
  for (const [mealType, keywords] of Object.entries(MEAL_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      result.meal_type = mealType;
      result.confidence += 0.1;
      break;
    }
  }

  // Infer meal type from time if mentioned
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch && !result.meal_type) {
    let hour = parseInt(timeMatch[1]);
    const isPm = timeMatch[3].toLowerCase() === 'pm';
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    
    if (hour >= 5 && hour < 11) result.meal_type = 'breakfast';
    else if (hour >= 11 && hour < 15) result.meal_type = 'lunch';
    else if (hour >= 17 && hour < 22) result.meal_type = 'dinner';
  }

  // Infer meal type from current time if food expense and not set
  if (result.category === 'Food' && !result.meal_type) {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) result.meal_type = 'breakfast';
    else if (hour >= 11 && hour < 15) result.meal_type = 'lunch';
    else if (hour >= 15 && hour < 17) result.meal_type = 'snack';
    else if (hour >= 17 && hour < 22) result.meal_type = 'dinner';
    else result.meal_type = 'snack';
  }

  // Extract food type from keywords (if not set by merchant)
  if (!result.food_type) {
    for (const [foodType, keywords] of Object.entries(FOOD_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        result.food_type = foodType;
        result.confidence += 0.1;
        break;
      }
    }
  }

  // Extract who it's for
  const forPatterns = [
    /(?:for|bought)\s+([A-Z][a-z]+)(?:'s)?\s+(?:dinner|lunch|breakfast|food|meal)/i,
    /([A-Z][a-z]+)(?:'s)?\s+(?:dinner|lunch|breakfast|food|meal)/i,
    /for\s+([A-Z][a-z]+)/i,
  ];
  
  for (const pattern of forPatterns) {
    const match = input.match(pattern);
    if (match) {
      const name = match[1];
      // Filter out common non-name words
      if (!['the', 'a', 'my', 'our', 'some', 'this'].includes(name.toLowerCase())) {
        result.who_for = name;
        result.confidence += 0.1;
        break;
      }
    }
  }

  // Default category if we have a vendor but no category
  if (result.vendor && !result.category) {
    result.category = 'Other';
  }

  // Build description from extracted info
  const descParts = [];
  if (result.who_for) descParts.push(`${result.who_for}'s`);
  if (result.meal_type) descParts.push(result.meal_type);
  if (result.food_type && result.category === 'Food') descParts.push(`(${result.food_type})`);
  result.description = descParts.length > 0 ? descParts.join(' ') : null;

  // Cap confidence at 1.0
  result.confidence = Math.min(result.confidence, 1.0);

  return result;
}

/**
 * Parse receipt image using AI vision
 * Returns structured receipt data
 */
async function parseReceiptImage(imageBase64, claudeApiKey) {
  // This would call Claude's vision API to parse the receipt
  // For now, return a placeholder structure
  const prompt = `Analyze this receipt image and extract the following information in JSON format:
{
  "vendor": "store/restaurant name",
  "amount": total amount as number,
  "subtotal": subtotal as number or null,
  "tax": tax amount as number or null,
  "tip": tip amount as number or null,
  "items": [{"name": "item name", "price": price as number}],
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM" or null,
  "payment_method": "cash/card/etc" or null,
  "card_last_four": "1234" or null,
  "receipt_number": "receipt/order number" or null,
  "merchant_address": "address" or null,
  "merchant_phone": "phone" or null
}

Only return valid JSON, no other text.`;

  // TODO: Implement actual vision API call
  return {
    vendor: null,
    amount: null,
    items: [],
    confidence: 0
  };
}

/**
 * Merge parsed data with merchant profile defaults
 */
async function enrichWithMerchantProfile(parsed, pool) {
  if (!parsed.vendor) return parsed;
  
  try {
    // Look up merchant profile
    const result = await pool.query(`
      SELECT * FROM lumen_merchant_profiles 
      WHERE LOWER(name) = LOWER($1) 
      OR LOWER($1) = ANY(SELECT LOWER(unnest(aliases)))
      LIMIT 1
    `, [parsed.vendor]);
    
    if (result.rows.length > 0) {
      const profile = result.rows[0];
      // Fill in defaults from profile if not already set
      if (!parsed.merchant_type) parsed.merchant_type = profile.merchant_type;
      if (!parsed.category) parsed.category = profile.default_category;
      if (!parsed.food_type) parsed.food_type = profile.default_food_type;
      if (!parsed.cuisine) parsed.cuisine = profile.default_cuisine;
      if (!parsed.meal_type && profile.default_meal_type) parsed.meal_type = profile.default_meal_type;
      parsed.vendor = profile.name; // Use canonical name
      parsed.confidence = Math.min(parsed.confidence + 0.15, 1.0);
    }
  } catch (err) {
    console.error('Error looking up merchant profile:', err);
  }
  
  return parsed;
}

/**
 * Learn new merchant from expense
 */
async function learnMerchant(expense, pool) {
  if (!expense.vendor) return;
  
  try {
    // Check if merchant exists
    const existing = await pool.query(
      'SELECT id FROM lumen_merchant_profiles WHERE LOWER(name) = LOWER($1)',
      [expense.vendor]
    );
    
    if (existing.rows.length === 0) {
      // Create new merchant profile from this expense
      await pool.query(`
        INSERT INTO lumen_merchant_profiles 
        (name, merchant_type, default_category, default_food_type, default_cuisine, default_meal_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name) DO NOTHING
      `, [
        expense.vendor,
        expense.merchant_type || 'unknown',
        expense.category || 'Other',
        expense.food_type,
        expense.cuisine,
        expense.meal_type
      ]);
      console.log(`[SmartExpense] Learned new merchant: ${expense.vendor}`);
    }
  } catch (err) {
    console.error('Error learning merchant:', err);
  }
}

module.exports = {
  parseExpenseText,
  parseReceiptImage,
  enrichWithMerchantProfile,
  learnMerchant,
  MERCHANT_PATTERNS,
  MEAL_KEYWORDS,
  FOOD_KEYWORDS
};

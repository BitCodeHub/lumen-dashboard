/**
 * Money Oracle - Predictive Financial Intelligence
 * 
 * Analyzes expense patterns to surface hidden insights and predict future spending.
 * "How did it know that?"
 */

// ============================================
// STATISTICAL UTILITIES
// ============================================

/**
 * Calculate mean of an array
 */
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate percentile
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate trend direction and strength using linear regression
 */
function calculateTrend(data) {
  if (data.length < 2) return { slope: 0, direction: 'stable', strength: 0 };
  
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(data);
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (data[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const avgValue = mean(data);
  const percentChange = avgValue !== 0 ? (slope / avgValue) * 100 : 0;
  
  let direction = 'stable';
  if (percentChange > 5) direction = 'increasing';
  else if (percentChange < -5) direction = 'decreasing';
  
  return {
    slope,
    direction,
    strength: Math.abs(percentChange),
    percentChange
  };
}

/**
 * Detect anomalies using z-score
 */
function detectAnomalies(expenses, threshold = 2.0) {
  const amounts = expenses.map(e => parseFloat(e.amount));
  const avg = mean(amounts);
  const sd = stdDev(amounts);
  
  if (sd === 0) return [];
  
  return expenses
    .map((expense, i) => ({
      ...expense,
      zScore: (amounts[i] - avg) / sd
    }))
    .filter(e => Math.abs(e.zScore) > threshold)
    .map(e => ({
      expense: e,
      type: e.zScore > 0 ? 'high' : 'low',
      deviation: Math.abs(e.zScore).toFixed(1) + ' standard deviations'
    }));
}

// ============================================
// PATTERN ANALYSIS
// ============================================

/**
 * Analyze spending by day of week
 */
function analyzeByDayOfWeek(expenses) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = {};
  
  days.forEach((day, i) => {
    byDay[day] = { total: 0, count: 0, expenses: [] };
  });
  
  expenses.forEach(e => {
    const date = new Date(e.date);
    const dayName = days[date.getDay()];
    byDay[dayName].total += parseFloat(e.amount);
    byDay[dayName].count++;
    byDay[dayName].expenses.push(e);
  });
  
  // Calculate averages
  Object.keys(byDay).forEach(day => {
    byDay[day].average = byDay[day].count > 0 
      ? byDay[day].total / byDay[day].count 
      : 0;
  });
  
  // Find patterns
  const averages = days.map(d => byDay[d].average);
  const avgAll = mean(averages.filter(a => a > 0));
  
  const patterns = [];
  days.forEach(day => {
    const dayAvg = byDay[day].average;
    if (dayAvg > 0) {
      const diff = ((dayAvg - avgAll) / avgAll * 100);
      if (Math.abs(diff) > 15) {
        patterns.push({
          day,
          average: dayAvg,
          percentDiff: diff,
          type: diff > 0 ? 'high' : 'low'
        });
      }
    }
  });
  
  // Weekend vs weekday comparison
  const weekdayAvg = mean([byDay['Monday'], byDay['Tuesday'], byDay['Wednesday'], 
                          byDay['Thursday'], byDay['Friday']].map(d => d.average).filter(a => a > 0));
  const weekendAvg = mean([byDay['Saturday'], byDay['Sunday']].map(d => d.average).filter(a => a > 0));
  const weekendDiff = weekdayAvg > 0 ? ((weekendAvg - weekdayAvg) / weekdayAvg * 100) : 0;
  
  return {
    byDay,
    patterns,
    weekdayAvg,
    weekendAvg,
    weekendDiff
  };
}

/**
 * Analyze spending by time of day
 */
function analyzeByTimeOfDay(expenses) {
  const periods = {
    'early_morning': { range: [5, 8], name: 'Early Morning (5-8 AM)', total: 0, count: 0 },
    'morning': { range: [8, 11], name: 'Morning (8-11 AM)', total: 0, count: 0 },
    'lunch': { range: [11, 14], name: 'Lunch Time (11 AM-2 PM)', total: 0, count: 0 },
    'afternoon': { range: [14, 17], name: 'Afternoon (2-5 PM)', total: 0, count: 0 },
    'dinner': { range: [17, 21], name: 'Dinner Time (5-9 PM)', total: 0, count: 0 },
    'late_night': { range: [21, 24], name: 'Late Night (9 PM-12 AM)', total: 0, count: 0 },
    'overnight': { range: [0, 5], name: 'Overnight (12-5 AM)', total: 0, count: 0 }
  };
  
  expenses.forEach(e => {
    const date = new Date(e.date);
    const hour = date.getHours();
    
    for (const [key, period] of Object.entries(periods)) {
      if (key === 'overnight') {
        if (hour >= 0 && hour < 5) {
          period.total += parseFloat(e.amount);
          period.count++;
        }
      } else if (hour >= period.range[0] && hour < period.range[1]) {
        period.total += parseFloat(e.amount);
        period.count++;
        break;
      }
    }
  });
  
  // Find peak spending time
  let peakPeriod = null;
  let maxTotal = 0;
  
  for (const [key, period] of Object.entries(periods)) {
    if (period.total > maxTotal) {
      maxTotal = period.total;
      peakPeriod = { key, ...period };
    }
  }
  
  return { periods, peakPeriod };
}

/**
 * Analyze spending by category with trends
 */
function analyzeCategories(expenses) {
  const categories = {};
  
  expenses.forEach(e => {
    const cat = e.category || 'Other';
    if (!categories[cat]) {
      categories[cat] = { total: 0, count: 0, expenses: [], vendors: new Set() };
    }
    categories[cat].total += parseFloat(e.amount);
    categories[cat].count++;
    categories[cat].expenses.push(e);
    if (e.vendor) categories[cat].vendors.add(e.vendor);
  });
  
  // Calculate percentages and averages
  const totalSpent = Object.values(categories).reduce((sum, c) => sum + c.total, 0);
  
  Object.keys(categories).forEach(cat => {
    categories[cat].percentage = totalSpent > 0 
      ? (categories[cat].total / totalSpent * 100) 
      : 0;
    categories[cat].average = categories[cat].count > 0 
      ? categories[cat].total / categories[cat].count 
      : 0;
    categories[cat].vendors = Array.from(categories[cat].vendors);
    
    // Calculate category trend (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    
    const recent = categories[cat].expenses.filter(e => new Date(e.date) >= thirtyDaysAgo);
    const previous = categories[cat].expenses.filter(e => {
      const d = new Date(e.date);
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });
    
    const recentTotal = recent.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const previousTotal = previous.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    if (previousTotal > 0) {
      categories[cat].trendPercent = ((recentTotal - previousTotal) / previousTotal * 100);
    } else if (recentTotal > 0) {
      categories[cat].trendPercent = 100; // New spending category
    } else {
      categories[cat].trendPercent = 0;
    }
  });
  
  return categories;
}

/**
 * Analyze vendor loyalty and patterns
 */
function analyzeVendors(expenses) {
  const vendors = {};
  
  expenses.forEach(e => {
    const vendor = e.vendor || 'Unknown';
    if (!vendors[vendor]) {
      vendors[vendor] = {
        total: 0,
        count: 0,
        visits: [],
        category: e.category,
        averages: []
      };
    }
    const amount = parseFloat(e.amount);
    vendors[vendor].total += amount;
    vendors[vendor].count++;
    vendors[vendor].visits.push(new Date(e.date));
    vendors[vendor].averages.push(amount);
  });
  
  // Calculate visit frequency and loyalty
  const loyalVendors = [];
  const risingVendors = [];
  
  Object.entries(vendors).forEach(([name, data]) => {
    data.averageSpend = mean(data.averages);
    
    // Sort visits and calculate frequency
    data.visits.sort((a, b) => b - a);
    
    if (data.visits.length >= 2) {
      const daysBetweenVisits = [];
      for (let i = 0; i < data.visits.length - 1; i++) {
        const diff = (data.visits[i] - data.visits[i + 1]) / (1000 * 60 * 60 * 24);
        daysBetweenVisits.push(diff);
      }
      data.avgDaysBetweenVisits = mean(daysBetweenVisits);
    }
    
    // Check if this is a "loyalty" vendor (regular visits)
    if (data.count >= 5) {
      loyalVendors.push({
        name,
        visits: data.count,
        total: data.total,
        averageSpend: data.averageSpend,
        frequency: data.avgDaysBetweenVisits
      });
    }
    
    // Check if visits are increasing (rising vendor)
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    
    const recentVisits = data.visits.filter(v => v >= thirtyDaysAgo).length;
    const previousVisits = data.visits.filter(v => v >= sixtyDaysAgo && v < thirtyDaysAgo).length;
    
    if (recentVisits > previousVisits && recentVisits >= 3) {
      risingVendors.push({
        name,
        recentVisits,
        previousVisits,
        increase: recentVisits - previousVisits
      });
    }
  });
  
  // Sort by visit count
  loyalVendors.sort((a, b) => b.visits - a.visits);
  risingVendors.sort((a, b) => b.increase - a.increase);
  
  return {
    all: vendors,
    loyal: loyalVendors.slice(0, 5),
    rising: risingVendors.slice(0, 5)
  };
}

/**
 * Analyze monthly spending patterns
 */
function analyzeMonthlyPatterns(expenses) {
  const months = {};
  
  expenses.forEach(e => {
    const date = new Date(e.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!months[key]) {
      months[key] = { total: 0, count: 0, byCategory: {} };
    }
    
    const amount = parseFloat(e.amount);
    months[key].total += amount;
    months[key].count++;
    
    const cat = e.category || 'Other';
    if (!months[key].byCategory[cat]) {
      months[key].byCategory[cat] = 0;
    }
    months[key].byCategory[cat] += amount;
  });
  
  // Calculate month-over-month changes
  const sortedMonths = Object.keys(months).sort();
  const monthlyTotals = sortedMonths.map(m => months[m].total);
  const trend = calculateTrend(monthlyTotals);
  
  // Calculate average monthly spending
  const avgMonthly = mean(monthlyTotals);
  
  // Find highest and lowest spending months
  let highestMonth = { key: null, total: 0 };
  let lowestMonth = { key: null, total: Infinity };
  
  sortedMonths.forEach(key => {
    if (months[key].total > highestMonth.total) {
      highestMonth = { key, total: months[key].total };
    }
    if (months[key].total < lowestMonth.total) {
      lowestMonth = { key, total: months[key].total };
    }
  });
  
  return {
    months,
    trend,
    avgMonthly,
    highestMonth,
    lowestMonth: lowestMonth.key ? lowestMonth : null
  };
}

/**
 * Analyze meal patterns (for food expenses)
 */
function analyzeMealPatterns(expenses) {
  const foodExpenses = expenses.filter(e => 
    e.category === 'Food' || 
    e.meal_type || 
    e.food_type
  );
  
  const meals = {
    breakfast: { total: 0, count: 0, vendors: new Set() },
    lunch: { total: 0, count: 0, vendors: new Set() },
    dinner: { total: 0, count: 0, vendors: new Set() },
    snack: { total: 0, count: 0, vendors: new Set() }
  };
  
  const cuisines = {};
  const foodTypes = {};
  
  foodExpenses.forEach(e => {
    const amount = parseFloat(e.amount);
    
    // Categorize by meal type
    let mealType = e.meal_type;
    if (!mealType) {
      const hour = new Date(e.date).getHours();
      if (hour >= 5 && hour < 11) mealType = 'breakfast';
      else if (hour >= 11 && hour < 15) mealType = 'lunch';
      else if (hour >= 17 && hour < 22) mealType = 'dinner';
      else mealType = 'snack';
    }
    
    if (meals[mealType]) {
      meals[mealType].total += amount;
      meals[mealType].count++;
      if (e.vendor) meals[mealType].vendors.add(e.vendor);
    }
    
    // Track cuisines
    if (e.cuisine) {
      if (!cuisines[e.cuisine]) {
        cuisines[e.cuisine] = { total: 0, count: 0 };
      }
      cuisines[e.cuisine].total += amount;
      cuisines[e.cuisine].count++;
    }
    
    // Track food types
    if (e.food_type) {
      if (!foodTypes[e.food_type]) {
        foodTypes[e.food_type] = { total: 0, count: 0 };
      }
      foodTypes[e.food_type].total += amount;
      foodTypes[e.food_type].count++;
    }
  });
  
  // Calculate averages and convert Sets to arrays
  Object.keys(meals).forEach(meal => {
    meals[meal].average = meals[meal].count > 0 
      ? meals[meal].total / meals[meal].count 
      : 0;
    meals[meal].vendors = Array.from(meals[meal].vendors);
  });
  
  // Find most expensive meal type
  let mostExpensiveMeal = { type: null, average: 0 };
  Object.entries(meals).forEach(([type, data]) => {
    if (data.average > mostExpensiveMeal.average) {
      mostExpensiveMeal = { type, average: data.average };
    }
  });
  
  // Find favorite cuisine
  let favoriteCuisine = { name: null, count: 0 };
  Object.entries(cuisines).forEach(([name, data]) => {
    if (data.count > favoriteCuisine.count) {
      favoriteCuisine = { name, ...data };
    }
  });
  
  return {
    meals,
    cuisines,
    foodTypes,
    mostExpensiveMeal,
    favoriteCuisine,
    totalFoodSpend: Object.values(meals).reduce((sum, m) => sum + m.total, 0)
  };
}

/**
 * Detect correlations between spending patterns
 */
function detectCorrelations(expenses) {
  const correlations = [];
  
  // Group expenses by date
  const byDate = {};
  expenses.forEach(e => {
    const dateKey = new Date(e.date).toISOString().split('T')[0];
    if (!byDate[dateKey]) {
      byDate[dateKey] = [];
    }
    byDate[dateKey].push(e);
  });
  
  // Correlation 1: Days with multiple expenses vs single expenses
  const multiExpenseDays = [];
  const singleExpenseDays = [];
  
  Object.values(byDate).forEach(dayExpenses => {
    const total = dayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    if (dayExpenses.length > 1) {
      multiExpenseDays.push(total);
    } else {
      singleExpenseDays.push(total);
    }
  });
  
  const avgMulti = mean(multiExpenseDays);
  const avgSingle = mean(singleExpenseDays);
  
  if (avgMulti > avgSingle * 1.3 && multiExpenseDays.length >= 5) {
    correlations.push({
      type: 'multi_expense_days',
      insight: `You spend ${Math.round((avgMulti - avgSingle) / avgSingle * 100)}% more on days with multiple purchases`,
      avgMulti,
      avgSingle,
      confidence: 0.8
    });
  }
  
  // Correlation 2: Early week vs late week spending
  const earlyWeek = []; // Mon-Wed
  const lateWeek = []; // Thu-Sat
  
  Object.entries(byDate).forEach(([dateStr, dayExpenses]) => {
    const dayOfWeek = new Date(dateStr).getDay();
    const total = dayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    if (dayOfWeek >= 1 && dayOfWeek <= 3) {
      earlyWeek.push(total);
    } else if (dayOfWeek >= 4 && dayOfWeek <= 6) {
      lateWeek.push(total);
    }
  });
  
  const avgEarly = mean(earlyWeek);
  const avgLate = mean(lateWeek);
  
  if (Math.abs(avgLate - avgEarly) / avgEarly > 0.2 && lateWeek.length >= 5) {
    correlations.push({
      type: 'week_timing',
      insight: avgLate > avgEarly 
        ? `You spend ${Math.round((avgLate - avgEarly) / avgEarly * 100)}% more Thursday-Saturday than Monday-Wednesday`
        : `You're more frugal late in the week, spending ${Math.round((avgEarly - avgLate) / avgEarly * 100)}% less`,
      avgEarly,
      avgLate,
      confidence: 0.75
    });
  }
  
  // Correlation 3: Morning purchases tend to lead to more spending
  const daysWithMorningPurchase = new Set();
  const daysWithoutMorningPurchase = new Set();
  
  expenses.forEach(e => {
    const date = new Date(e.date);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    if (hour >= 6 && hour < 10) {
      daysWithMorningPurchase.add(dateKey);
    }
  });
  
  Object.keys(byDate).forEach(dateKey => {
    if (!daysWithMorningPurchase.has(dateKey)) {
      daysWithoutMorningPurchase.add(dateKey);
    }
  });
  
  const morningDayTotals = [];
  const noMorningDayTotals = [];
  
  daysWithMorningPurchase.forEach(dateKey => {
    if (byDate[dateKey]) {
      morningDayTotals.push(byDate[dateKey].reduce((sum, e) => sum + parseFloat(e.amount), 0));
    }
  });
  
  daysWithoutMorningPurchase.forEach(dateKey => {
    if (byDate[dateKey]) {
      noMorningDayTotals.push(byDate[dateKey].reduce((sum, e) => sum + parseFloat(e.amount), 0));
    }
  });
  
  const avgMorningDay = mean(morningDayTotals);
  const avgNoMorningDay = mean(noMorningDayTotals);
  
  if (avgMorningDay > avgNoMorningDay * 1.25 && morningDayTotals.length >= 5) {
    correlations.push({
      type: 'morning_trigger',
      insight: `Days starting with an early purchase lead to ${Math.round((avgMorningDay - avgNoMorningDay) / avgNoMorningDay * 100)}% more total spending`,
      avgMorningDay,
      avgNoMorningDay,
      confidence: 0.7
    });
  }
  
  // Correlation 4: Category chains (e.g., gas often followed by food)
  Object.keys(byDate).forEach(dateKey => {
    const dayExpenses = byDate[dateKey].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (dayExpenses.length >= 2) {
      for (let i = 0; i < dayExpenses.length - 1; i++) {
        // Track category sequences
        // (This is a simplified version - could be expanded)
      }
    }
  });
  
  return correlations;
}

// ============================================
// PREDICTIONS
// ============================================

/**
 * Predict next month's spending
 */
function predictNextMonth(expenses, monthlyData) {
  const predictions = {
    total: 0,
    byCategory: {},
    confidence: 'medium',
    factors: []
  };
  
  // Get historical monthly totals
  const months = monthlyData.months;
  const sortedMonths = Object.keys(months).sort();
  
  if (sortedMonths.length < 2) {
    predictions.confidence = 'low';
    predictions.factors.push('Limited historical data');
    
    // Use average of available data
    const avgMonthly = monthlyData.avgMonthly || 0;
    predictions.total = avgMonthly;
    
    return predictions;
  }
  
  // Use weighted moving average (more weight on recent months)
  const recentMonths = sortedMonths.slice(-6);
  const weights = [0.05, 0.1, 0.15, 0.2, 0.25, 0.25].slice(-recentMonths.length);
  const normalizedWeights = weights.map(w => w / weights.reduce((a, b) => a + b, 0));
  
  let predictedTotal = 0;
  recentMonths.forEach((month, i) => {
    predictedTotal += months[month].total * normalizedWeights[i];
  });
  
  // Apply trend adjustment
  if (monthlyData.trend.direction === 'increasing') {
    const adjustment = 1 + (monthlyData.trend.strength / 100 * 0.3);
    predictedTotal *= adjustment;
    predictions.factors.push(`Upward spending trend detected (+${monthlyData.trend.strength.toFixed(1)}%)`);
  } else if (monthlyData.trend.direction === 'decreasing') {
    const adjustment = 1 - (monthlyData.trend.strength / 100 * 0.3);
    predictedTotal *= adjustment;
    predictions.factors.push(`Downward spending trend detected (-${monthlyData.trend.strength.toFixed(1)}%)`);
  }
  
  predictions.total = Math.round(predictedTotal * 100) / 100;
  
  // Predict by category
  const categories = analyzeCategories(expenses);
  const totalCategorySpend = Object.values(categories).reduce((sum, c) => sum + c.total, 0);
  
  Object.entries(categories).forEach(([name, data]) => {
    const percentage = data.percentage / 100;
    let predicted = predictions.total * percentage;
    
    // Apply category-specific trends
    if (data.trendPercent > 20) {
      predicted *= 1.1;
    } else if (data.trendPercent < -20) {
      predicted *= 0.9;
    }
    
    predictions.byCategory[name] = Math.round(predicted * 100) / 100;
  });
  
  // Set confidence level
  if (sortedMonths.length >= 6) {
    predictions.confidence = 'high';
  } else if (sortedMonths.length >= 3) {
    predictions.confidence = 'medium';
  }
  
  return predictions;
}

/**
 * Identify potential savings opportunities
 */
function identifySavingsOpportunities(expenses, categories, vendors) {
  const opportunities = [];
  
  // Check for high-frequency low-value purchases
  Object.entries(vendors.all).forEach(([name, data]) => {
    if (data.count >= 10 && mean(data.averages) < 15) {
      const potential = data.count * mean(data.averages) * 0.3; // 30% reduction potential
      if (potential > 20) {
        opportunities.push({
          type: 'frequent_small',
          vendor: name,
          insight: `${data.count} small purchases at ${name} totaling $${data.total.toFixed(2)}`,
          potential: Math.round(potential * 100) / 100,
          suggestion: `Consider reducing visits or finding alternatives`
        });
      }
    }
  });
  
  // Check for category overspending (compared to recommendations)
  const categoryBenchmarks = {
    'Food': 15,      // % of typical budget
    'Entertainment': 5,
    'Shopping': 10,
    'Gas': 5,
    'Bills': 30
  };
  
  const totalSpend = Object.values(categories).reduce((sum, c) => sum + c.total, 0);
  
  Object.entries(categories).forEach(([name, data]) => {
    const benchmark = categoryBenchmarks[name];
    if (benchmark && data.percentage > benchmark * 1.5) {
      const excess = (data.percentage - benchmark) / 100 * totalSpend;
      opportunities.push({
        type: 'category_overspend',
        category: name,
        insight: `${name} spending is ${data.percentage.toFixed(1)}% of total (typical: ${benchmark}%)`,
        potential: Math.round(excess * 0.25 * 100) / 100, // 25% of excess
        suggestion: `Look for ways to reduce ${name.toLowerCase()} expenses`
      });
    }
  });
  
  // Check for expensive meal patterns
  const mealPatterns = analyzeMealPatterns(expenses);
  if (mealPatterns.mostExpensiveMeal.average > 25) {
    opportunities.push({
      type: 'expensive_meal',
      meal: mealPatterns.mostExpensiveMeal.type,
      insight: `Your average ${mealPatterns.mostExpensiveMeal.type} costs $${mealPatterns.mostExpensiveMeal.average.toFixed(2)}`,
      potential: (mealPatterns.mostExpensiveMeal.average - 15) * 20, // Assuming 20 meals/month
      suggestion: `Consider meal prepping or choosing more affordable options for ${mealPatterns.mostExpensiveMeal.type}`
    });
  }
  
  // Sort by potential savings
  opportunities.sort((a, b) => b.potential - a.potential);
  
  return opportunities.slice(0, 5);
}

// ============================================
// NATURAL LANGUAGE INSIGHTS
// ============================================

/**
 * Generate natural language insights
 */
function generateInsights(analysis) {
  const insights = [];
  
  // Day of week insights
  if (analysis.dayOfWeek.patterns.length > 0) {
    const highDays = analysis.dayOfWeek.patterns.filter(p => p.type === 'high');
    const lowDays = analysis.dayOfWeek.patterns.filter(p => p.type === 'low');
    
    if (highDays.length > 0) {
      const day = highDays[0];
      insights.push({
        type: 'day_pattern',
        category: 'behavior',
        severity: 'info',
        headline: `${day.day}s are your spendy days`,
        detail: `You spend ${Math.abs(day.percentDiff).toFixed(0)}% more on ${day.day}s than average ($${day.average.toFixed(2)} per transaction)`,
        icon: '📅'
      });
    }
    
    if (lowDays.length > 0) {
      const day = lowDays[0];
      insights.push({
        type: 'day_pattern',
        category: 'behavior',
        severity: 'positive',
        headline: `${day.day}s are your frugal days`,
        detail: `You spend ${Math.abs(day.percentDiff).toFixed(0)}% less on ${day.day}s`,
        icon: '💚'
      });
    }
  }
  
  // Weekend vs weekday
  if (Math.abs(analysis.dayOfWeek.weekendDiff) > 20) {
    if (analysis.dayOfWeek.weekendDiff > 0) {
      insights.push({
        type: 'weekend_pattern',
        category: 'behavior',
        severity: 'warning',
        headline: 'Weekend splurge detected',
        detail: `You spend ${analysis.dayOfWeek.weekendDiff.toFixed(0)}% more on weekends than weekdays`,
        icon: '🎉'
      });
    } else {
      insights.push({
        type: 'weekend_pattern',
        category: 'behavior',
        severity: 'positive',
        headline: 'Disciplined weekender',
        detail: `You actually spend ${Math.abs(analysis.dayOfWeek.weekendDiff).toFixed(0)}% less on weekends`,
        icon: '🏆'
      });
    }
  }
  
  // Time of day insights
  if (analysis.timeOfDay.peakPeriod) {
    insights.push({
      type: 'time_pattern',
      category: 'behavior',
      severity: 'info',
      headline: `Peak spending: ${analysis.timeOfDay.peakPeriod.name.split('(')[0].trim()}`,
      detail: `${analysis.timeOfDay.peakPeriod.count} transactions totaling $${analysis.timeOfDay.peakPeriod.total.toFixed(2)}`,
      icon: '⏰'
    });
  }
  
  // Correlation insights (the "how did it know that?" moments)
  analysis.correlations.forEach(corr => {
    if (corr.confidence >= 0.7) {
      insights.push({
        type: 'correlation',
        category: 'hidden_pattern',
        severity: 'insight',
        headline: corr.type === 'morning_trigger' ? '☕ The Morning Effect' :
                  corr.type === 'multi_expense_days' ? '🔄 Momentum Spending' :
                  corr.type === 'week_timing' ? '📈 Week Rhythm' : 'Pattern Detected',
        detail: corr.insight,
        icon: '🔮'
      });
    }
  });
  
  // Vendor loyalty insights
  if (analysis.vendors.loyal.length > 0) {
    const topVendor = analysis.vendors.loyal[0];
    insights.push({
      type: 'loyalty',
      category: 'behavior',
      severity: 'info',
      headline: `You're a regular at ${topVendor.name}`,
      detail: `${topVendor.visits} visits, $${topVendor.total.toFixed(2)} total (avg $${topVendor.averageSpend.toFixed(2)}/visit)`,
      icon: '⭐'
    });
  }
  
  if (analysis.vendors.rising.length > 0) {
    const rising = analysis.vendors.rising[0];
    insights.push({
      type: 'trend',
      category: 'behavior',
      severity: 'info',
      headline: `New favorite: ${rising.name}`,
      detail: `${rising.recentVisits} visits in the last 30 days, up from ${rising.previousVisits}`,
      icon: '📈'
    });
  }
  
  // Monthly trend insight
  if (analysis.monthly.trend.direction !== 'stable') {
    insights.push({
      type: 'monthly_trend',
      category: 'financial',
      severity: analysis.monthly.trend.direction === 'increasing' ? 'warning' : 'positive',
      headline: analysis.monthly.trend.direction === 'increasing' 
        ? 'Spending is trending up' 
        : 'Spending is trending down',
      detail: `${Math.abs(analysis.monthly.trend.percentChange).toFixed(1)}% ${analysis.monthly.trend.direction} trend detected`,
      icon: analysis.monthly.trend.direction === 'increasing' ? '📊' : '📉'
    });
  }
  
  // Anomaly insights
  if (analysis.anomalies.length > 0) {
    const recentAnomaly = analysis.anomalies
      .filter(a => a.type === 'high')
      .sort((a, b) => new Date(b.expense.date) - new Date(a.expense.date))[0];
    
    if (recentAnomaly) {
      insights.push({
        type: 'anomaly',
        category: 'alert',
        severity: 'warning',
        headline: 'Unusual transaction detected',
        detail: `$${parseFloat(recentAnomaly.expense.amount).toFixed(2)} at ${recentAnomaly.expense.vendor || 'Unknown'} - ${recentAnomaly.deviation} from your normal`,
        icon: '⚠️'
      });
    }
  }
  
  // Meal pattern insights
  if (analysis.meals.mostExpensiveMeal.type) {
    insights.push({
      type: 'meal_pattern',
      category: 'food',
      severity: 'info',
      headline: `${analysis.meals.mostExpensiveMeal.type.charAt(0).toUpperCase() + analysis.meals.mostExpensiveMeal.type.slice(1)} is your splurge meal`,
      detail: `Average ${analysis.meals.mostExpensiveMeal.type}: $${analysis.meals.mostExpensiveMeal.average.toFixed(2)}`,
      icon: '🍽️'
    });
  }
  
  if (analysis.meals.favoriteCuisine.name) {
    insights.push({
      type: 'cuisine_preference',
      category: 'food',
      severity: 'info',
      headline: `${analysis.meals.favoriteCuisine.name} cuisine fan`,
      detail: `${analysis.meals.favoriteCuisine.count} ${analysis.meals.favoriteCuisine.name} meals totaling $${analysis.meals.favoriteCuisine.total.toFixed(2)}`,
      icon: '🥢'
    });
  }
  
  // Prediction insight
  if (analysis.predictions.total > 0) {
    insights.push({
      type: 'prediction',
      category: 'forecast',
      severity: 'info',
      headline: `Next month forecast: $${analysis.predictions.total.toFixed(2)}`,
      detail: analysis.predictions.factors.join('. ') || 'Based on your spending patterns',
      icon: '🔮'
    });
  }
  
  // Savings insight
  if (analysis.savings.length > 0) {
    const topSaving = analysis.savings[0];
    insights.push({
      type: 'savings_opportunity',
      category: 'financial',
      severity: 'positive',
      headline: `Potential savings: $${topSaving.potential.toFixed(2)}/month`,
      detail: topSaving.suggestion,
      icon: '💰'
    });
  }
  
  return insights;
}

// ============================================
// MAIN ORACLE FUNCTION
// ============================================

/**
 * Run the Money Oracle analysis
 */
async function analyze(pool) {
  const startTime = Date.now();
  
  // Fetch expenses from the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const result = await pool.query(`
    SELECT * FROM lumen_expenses 
    WHERE date >= $1 
    ORDER BY date DESC
  `, [sixMonthsAgo.toISOString()]);
  
  const expenses = result.rows;
  
  if (expenses.length === 0) {
    return {
      success: true,
      message: 'No expense data found',
      summary: {
        totalExpenses: 0,
        analyzedPeriod: '6 months',
        dataPoints: 0
      },
      insights: [{
        type: 'empty_data',
        category: 'info',
        severity: 'info',
        headline: 'Start tracking expenses',
        detail: 'Add some expenses to unlock powerful insights about your spending patterns',
        icon: '📝'
      }],
      analysis: {},
      predictions: {},
      processingTimeMs: Date.now() - startTime
    };
  }
  
  // Run all analyses
  const dayOfWeek = analyzeByDayOfWeek(expenses);
  const timeOfDay = analyzeByTimeOfDay(expenses);
  const categories = analyzeCategories(expenses);
  const vendors = analyzeVendors(expenses);
  const monthly = analyzeMonthlyPatterns(expenses);
  const meals = analyzeMealPatterns(expenses);
  const correlations = detectCorrelations(expenses);
  const anomalies = detectAnomalies(expenses);
  const predictions = predictNextMonth(expenses, monthly);
  const savings = identifySavingsOpportunities(expenses, categories, vendors);
  
  // Compile analysis
  const analysis = {
    dayOfWeek,
    timeOfDay,
    categories,
    vendors,
    monthly,
    meals,
    correlations,
    anomalies,
    predictions,
    savings
  };
  
  // Generate insights
  const insights = generateInsights(analysis);
  
  // Sort insights by importance
  const severityOrder = { 'warning': 0, 'insight': 1, 'positive': 2, 'info': 3 };
  insights.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));
  
  // Create summary
  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const dateRange = {
    start: new Date(Math.min(...expenses.map(e => new Date(e.date)))),
    end: new Date(Math.max(...expenses.map(e => new Date(e.date))))
  };
  
  return {
    success: true,
    summary: {
      totalExpenses: expenses.length,
      totalSpent: Math.round(totalSpent * 100) / 100,
      analyzedPeriod: `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`,
      dataPoints: expenses.length,
      uniqueVendors: Object.keys(vendors.all).length,
      categories: Object.keys(categories).length
    },
    insights: insights.slice(0, 10), // Top 10 insights
    predictions: {
      nextMonth: predictions.total,
      confidence: predictions.confidence,
      byCategory: predictions.byCategory,
      factors: predictions.factors
    },
    savings: savings,
    patterns: {
      topSpendingDay: dayOfWeek.patterns.filter(p => p.type === 'high')[0]?.day || null,
      peakSpendingTime: timeOfDay.peakPeriod?.name || null,
      spendingTrend: monthly.trend.direction,
      weekendVsWeekday: analysis.dayOfWeek.weekendDiff > 0 ? 'weekend_higher' : 'weekday_higher'
    },
    correlations: correlations.map(c => ({ type: c.type, insight: c.insight })),
    analysis: {
      // Simplified analysis for detailed view
      dayOfWeek: Object.entries(dayOfWeek.byDay).map(([day, data]) => ({
        day,
        average: Math.round(data.average * 100) / 100,
        count: data.count,
        total: Math.round(data.total * 100) / 100
      })),
      categories: Object.entries(categories).map(([name, data]) => ({
        name,
        total: Math.round(data.total * 100) / 100,
        percentage: Math.round(data.percentage * 10) / 10,
        count: data.count,
        trend: data.trendPercent > 20 ? 'up' : data.trendPercent < -20 ? 'down' : 'stable'
      })).sort((a, b) => b.total - a.total),
      topVendors: Object.entries(vendors.all)
        .map(([name, data]) => ({
          name,
          total: Math.round(data.total * 100) / 100,
          visits: data.count
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
    },
    processingTimeMs: Date.now() - startTime
  };
}

module.exports = {
  analyze,
  // Export individual analyzers for testing/flexibility
  analyzeByDayOfWeek,
  analyzeByTimeOfDay,
  analyzeCategories,
  analyzeVendors,
  analyzeMonthlyPatterns,
  analyzeMealPatterns,
  detectCorrelations,
  detectAnomalies,
  predictNextMonth,
  identifySavingsOpportunities,
  generateInsights,
  // Utility functions
  mean,
  stdDev,
  percentile,
  calculateTrend
};

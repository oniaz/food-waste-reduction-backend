// TAGS LISTS 
// yet to choose one or make a new one
// 

const SURPLUS_FOOD_TAGS = [
  // 🥪 Occasions & Meal Context (The Ultimate Cross-Category Bridges)
  "quick breakfast (fetoor)",     // Bridges: Bakery (bread/paté) + Dairy (cheese/yogurt) + Pantry (fava beans)
  "lunch helper",                 // Bridges: Meat/Seafood (chicken) + Frozen food (veggies) + Pantry (rice/pasta)
  "late night / suhoor",          // Bridges: Dairy (yogurt/rayeb) + Bakery (feteer) + Snacks
  "tea time companion",           // Bridges: Snacks/Desserts (biscuits) + Bakery (cakes/feteer) + Drinks
  "school lunchbox snack",        // Bridges: Drinks (juice) + Dairy (packaged cheese) + Snacks
  "sweet tooth & dessert",        // Bridges: Bakery (cakes) + Dairy (cream) + Pantry (chocolate)

  // ⚡ Preparation State (How ready is it?)
  "ready to eat",                 // No prep needed: Ready-to-eat meals, sandwiches, bakery, snacks
  "heat & serve",                 // Needs 2 mins in microwave/oven: Frozen meals, some bakery items, precooked meat
  "requires cooking",             // Raw ingredients: Raw meat/seafood, frozen raw veggies, dry pasta

  // 🥛 Dietary & Fasting Alignment (Crucial for local filtering)
  "siamee friendly",              // Bridges plant-based snacks, pantry, and bakery during Coptic fasting
  "vegetarian",                   // No meat/seafood: Great for dairy, bakery, and desserts
  "healthy choice",               // Whole wheat bakery, low-fat dairy, low-sugar snacks
  "sugar-free",                   // Diet drinks, plain dairy, healthy snacks

  // 🍦 Storage Realities & Urgency (Critical for logistics & hot weather)
  "requires continuous fridge",   // High risk: Dairy, ready-to-eat meats, open desserts
  "keep frozen",                  // Cold chain: Frozen foods, raw meat/seafood, ice cream
  "shelf-stable (pantry)",        // Safe at room temp: Dry grains, canned food, chips, drinks
  "perishable / consume today",   // High-urgency surplus: Fresh bakery bakes, daily ready-to-eat meals

  // 👅 Flavor Profiles (Psychological matching triggers)
  "savory & salty",               // If they buy Roumi cheese, match with salty snacks or deli cuts
  "sweet & syrupy",               // Matches Oriental sweets, honey, jams, sweet pastries
  "spicy kick",                   // Matches spiced cheeses, spicy frozen foods, or spicy chips
  "creamy texture",               // Spreads, yogurts, creams
  "crunchy bite",                 // Crackers, dry baked goods, chips

  // 💰 Surplus Type & Deal Style
  "single-serve portion",         // Individual cups, small chip bags, single-portion ready meals
  "family pack / bulk",           // Large trays of sweets, frozen family bags, bulk pantry staples
  "imperfect shape",              // B-grade looks but perfectly tasty: baker's daily surplus, broken biscuits
  "clearance deal",               // Items nearing their best-before date but 100% safe to consume
  "seasonal surplus (ramadan/eed)" // Special seasonal items: Ramadan sweets, Eid cookies, seasonal bakery bakes
];

export { SURPLUS_FOOD_TAGS };
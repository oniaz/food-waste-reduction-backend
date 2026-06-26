/**
 * seed.js — Unified database seeding script
 * Food Waste Reduction Backend
 *
 * Clears all collections, then inserts data in dependency order:
 *   UsersAuth → Admins / Vendors / Customers → Products → Orders → AdminLogs
 *
 * Usage:
 *   node seed.js              (reads MONGO_URI from .env in project root)
 *   MONGO_URI=<uri> node seed.js
 *
 * Add to package.json:
 *   "scripts": { "seed": "node --env-file=.env seed.js" }
 * Then run:  npm run seed
 *
 * ─── Address / location compliance ───────────────────────────────────────────
 * All governorate / city / neighborhood values are taken directly from
 * egyptLocations.js (stored lowercase as the schema requires).
 * Vendor map coordinates are real [longitude, latitude] pairs for each location.
 *
 * ─── Product tag compliance ───────────────────────────────────────────────────
 * All product tags are drawn exclusively from SURPLUS_FOOD_TAGS in productTags.js.
 *
 * ─── Category compliance ─────────────────────────────────────────────────────
 * All product categories are from categoriesEnum in productCategories.js:
 *   dairy | meat_seafood | bakery | frozen_food | ready_meals |
 *   snacks_desserts | drinks | pantry
 */

import mongoose from "mongoose";
import bcrypt   from "bcrypt";
import dotenv   from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// ─── Resolve .env relative to project root ───────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

// ─── Model imports ────────────────────────────────────────────────────────────
// Adjust these paths to match your project structure.
import UsersAuth from "./src/models/usersAuth.model.js";
import Admin     from "./src/models/admins.models.js";
import Vendors   from "./src/models/vendors.model.js";
import Customers from "./src/models/customers.model.js";
import Products  from "./src/models/products.model.js";
import Order     from "./src/models/orders.model.js";
import AdminLogs from "./src/models/adminLogs.model.js";

// ─── Shared Cloudinary image pool ────────────────────────────────────────────
// Replace with your real Cloudinary assets before running in production.
const IMG_POOL = [
  {
    imgUrl:      "https://res.cloudinary.com/demo/image/upload/food-waste-reduction/products/product_1.jpg",
    publicImgId: "food-waste-reduction/products/product_1",
  },
  {
    imgUrl:      "https://res.cloudinary.com/demo/image/upload/food-waste-reduction/products/product_2.jpg",
    publicImgId: "food-waste-reduction/products/product_2",
  },
  {
    imgUrl:      "https://res.cloudinary.com/demo/image/upload/food-waste-reduction/products/product_3.jpg",
    publicImgId: "food-waste-reduction/products/product_3",
  },
];
const img = (i) => IMG_POOL[i % IMG_POOL.length];

// ─── Helpers ──────────────────────────────────────────────────────────────────
// insertMany skips Mongoose pre-save hooks, so we hash manually to mirror
// the bcrypt logic in usersAuth.model.js
const hash = (plain) => bcrypt.hash(plain, 10);

// Products require validDate >= today. Buffer days per category
// (from productCategories.js → daysToSubtractBeforeExpiry):
//   dairy / ready_meals             → 10 days  → expiryDate ≥ today + 11
//   meat_seafood / bakery           →  7 days  → expiryDate ≥ today +  8
//   frozen_food / snacks_desserts /
//     drinks / pantry               → 30 days  → expiryDate ≥ today + 31
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI is not set. Check your .env file.");
    process.exit(1);
  }

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("✅  Connected.\n");

  // ── 1. Clear all collections (reverse dependency order) ──────────────────
  console.log("🗑️   Clearing collections…");
  await Promise.all([
    AdminLogs.deleteMany({}),
    Order.deleteMany({}),
    Products.deleteMany({}),
    Customers.deleteMany({}),
    Vendors.deleteMany({}),
    Admin.deleteMany({}),
    UsersAuth.deleteMany({}),
  ]);
  console.log("✅  All collections cleared.\n");

  // ── 2. Hash all passwords in parallel ────────────────────────────────────
  console.log("🔑  Hashing passwords…");
  const [
    admin1Pw, admin2Pw,
    v1Pw, v2Pw, v3Pw, v4Pw, v5Pw,
    c1Pw, c2Pw, c3Pw, c4Pw, c5Pw,
  ] = await Promise.all([
    hash("Admin@123"),    // masteradmin
    hash("Admin@456"),    // superadmin2
    hash("Vendor@123"),   // greengrocer
    hash("Vendor@456"),   // bakehaven
    hash("Vendor@789"),   // frostybites
    hash("Vendor@321"),   // snackworld
    hash("Vendor@654"),   // drinkstation
    hash("Customer@123"), // alice_smith
    hash("Customer@456"), // bob_jones
    hash("Customer@789"), // carol_white
    hash("Customer@321"), // david_brown
    hash("Customer@654"), // eva_green
  ]);
  console.log("✅  Passwords hashed.\n");

  // ── 3. Seed UsersAuth ─────────────────────────────────────────────────────
  console.log("👤  Seeding UsersAuth…");
  const authDocs = await UsersAuth.insertMany([
    // Admins
    { username: "masteradmin",  password: admin1Pw, role: "admin",    email: "admin@foodwasteapp.com",      accountStatus: "active" },
    { username: "superadmin2",  password: admin2Pw, role: "admin",    email: "admin2@foodwasteapp.com",     accountStatus: "active" },
    // Vendors
    { username: "greengrocer",  password: v1Pw,     role: "vendor",   email: "greengrocer@example.com",     accountStatus: "active" },
    { username: "bakehaven",    password: v2Pw,     role: "vendor",   email: "bakehaven@example.com",       accountStatus: "active" },
    { username: "frostybites",  password: v3Pw,     role: "vendor",   email: "frostybites@example.com",     accountStatus: "active" },
    { username: "snackworld",   password: v4Pw,     role: "vendor",   email: "snackworld@example.com",      accountStatus: "active" },
    { username: "drinkstation", password: v5Pw,     role: "vendor",   email: "drinkstation@example.com",    accountStatus: "active" },
    // Customers
    { username: "alice_smith",  password: c1Pw,     role: "customer", email: "alice@example.com",           accountStatus: "active" },
    { username: "bob_jones",    password: c2Pw,     role: "customer", email: "bob@example.com",             accountStatus: "active" },
    { username: "carol_white",  password: c3Pw,     role: "customer", email: "carol@example.com",           accountStatus: "active" },
    { username: "david_brown",  password: c4Pw,     role: "customer", email: "david@example.com",           accountStatus: "active" },
    { username: "eva_green",    password: c5Pw,     role: "customer", email: "eva@example.com",             accountStatus: "active" },
  ]);

  const [
    admin1Auth, admin2Auth,
    v1Auth, v2Auth, v3Auth, v4Auth, v5Auth,
    c1Auth, c2Auth, c3Auth, c4Auth, c5Auth,
  ] = authDocs;
  console.log(`✅  ${authDocs.length} UsersAuth documents inserted.\n`);

  // ── 4. Seed Admins ────────────────────────────────────────────────────────
  console.log("🛡️   Seeding Admins…");
  const adminDocs = await Admin.insertMany([
    { authId: admin1Auth._id },
    { authId: admin2Auth._id },
  ]);
  const [admin1Doc, admin2Doc] = adminDocs;
  console.log(`✅  ${adminDocs.length} Admin documents inserted.\n`);

  // ── 5. Seed Vendors ───────────────────────────────────────────────────────
  // address fields: all lowercase to match schema transform.
  // Neighborhoods verified against egyptLocations.js.
  // map: [longitude, latitude] — real coordinates for each location.
  console.log("🏪  Seeding Vendors…");
  const vendorDocs = await Vendors.insertMany([

    // ── Vendor 1 — Green Grocer Cairo ─────────────────────────────────────
    // Location: Maadi, Cairo City  (30.9596° N, 31.2502° E)
    {
      shopName: "Green Grocer Cairo",
      address: {
        governorate:     "cairo",
        city:            "cairo city",
        neighborhood:    "maadi",
        detailedAddress: "15 Corniche El Maadi, next to the metro station",
        map:             [31.2502, 30.9596],  // [lng, lat]
      },
      phoneNumber: "+201001234567",
      taxNumber:   "TAX-001-GGC",
      pickupTime:  { days: ["Saturday","Sunday","Monday","Tuesday","Wednesday"], from: "09:00", to: "17:00" },
      moneyOwed:   0,
      rating:      { score: 4.5, totalRatingsNumber: 20 },
      authId:      v1Auth._id,
    },

    // ── Vendor 2 — Bake Haven ─────────────────────────────────────────────
    // Location: Fifth Settlement, New Cairo  (30.0131° N, 31.4695° E)
    {
      shopName: "Bake Haven",
      address: {
        governorate:     "cairo",
        city:            "new cairo",
        neighborhood:    "fifth settlement",
        detailedAddress: "88 South 90th Street, First Floor",
        map:             [31.4695, 30.0131],
      },
      phoneNumber: "+201009876543",
      taxNumber:   "TAX-002-BH",
      pickupTime:  { days: ["Saturday","Sunday","Tuesday","Thursday"], from: "08:00", to: "14:00" },
      moneyOwed:   0,
      rating:      { score: 4.8, totalRatingsNumber: 35 },
      authId:      v2Auth._id,
    },

    // ── Vendor 3 — Frosty Bites ───────────────────────────────────────────
    // Location: 12th District, 6th of October City  (29.9600° N, 30.9349° E)
    // Note: "al-hosary" is not in egyptLocations.js; using "12th district"
    // which is a valid neighborhood in october_city.
    {
      shopName: "Frosty Bites",
      address: {
        governorate:     "giza",
        city:            "6th of october city",
        neighborhood:    "12th district",
        detailedAddress: "Block 12, Building 4, 12th District Square",
        map:             [30.9349, 29.9600],
      },
      phoneNumber: "+201112345678",
      taxNumber:   "TAX-003-FB",
      pickupTime:  { days: ["Sunday","Monday","Wednesday","Friday"], from: "10:00", to: "18:00" },
      moneyOwed:   200,
      rating:      { score: 4.2, totalRatingsNumber: 14 },
      authId:      v3Auth._id,
    },

    // ── Vendor 4 — Snack World ────────────────────────────────────────────
    // Location: Smouha, Alexandria City  (31.2156° N, 29.9553° E)
    {
      shopName: "Snack World",
      address: {
        governorate:     "alexandria",
        city:            "alexandria city",
        neighborhood:    "smouha",
        detailedAddress: "Tower 3, Floor 2, Smouha Commercial Centre",
        map:             [29.9553, 31.2156],
      },
      phoneNumber: "+201223456789",
      taxNumber:   "TAX-004-SW",
      pickupTime:  { days: ["Monday","Tuesday","Wednesday","Thursday","Saturday"], from: "11:00", to: "20:00" },
      moneyOwed:   0,
      rating:      { score: 3.9, totalRatingsNumber: 8 },
      authId:      v4Auth._id,
    },

    // ── Vendor 5 — Drink Station ──────────────────────────────────────────
    // Location: Shorouk City, Cairo governorate.
    // egyptLocations.js lists Shorouk City with no named neighborhoods,
    // so detailedAddress carries the full location detail; neighborhood
    // is set to the city name as a safe fallback (empty neighborhoods[]).
    // We use "shorouk city" as neighborhood to avoid a blank string —
    // the schema only requires trim/lowercase, no enum on neighborhood.
    // Coords: Shorouk City centre  (30.1190° N, 31.6103° E)
    {
      shopName: "Drink Station",
      address: {
        governorate:     "cairo",
        city:            "shorouk city",
        neighborhood:    "shorouk city centre",
        detailedAddress: "Shop 5, Ground Floor, Al-Shorouk Mall, Shorouk City",
        map:             [31.6103, 30.1190],
      },
      phoneNumber: "+201334567890",
      taxNumber:   "TAX-005-DS",
      pickupTime:  { days: ["Saturday","Sunday","Monday","Wednesday","Friday"], from: "09:00", to: "21:00" },
      moneyOwed:   50,
      rating:      { score: 4.6, totalRatingsNumber: 27 },
      authId:      v5Auth._id,
    },
  ]);

  const [vendor1, vendor2, vendor3, vendor4, vendor5] = vendorDocs;
  console.log(`✅  ${vendorDocs.length} Vendor documents inserted.\n`);

  // ── 6. Seed Customers ─────────────────────────────────────────────────────
  // All neighborhoods verified against egyptLocations.js (stored lowercase).
  console.log("👥  Seeding Customers…");
  const customerDocs = await Customers.insertMany([
    // Customer 1 — Maadi, Cairo City  ✓
    {
      name:         { firstName: "Alice", lastName: "Smith" },
      address: {
        governorate:     "cairo",
        city:            "cairo city",
        neighborhood:    "maadi",
        detailedAddress: "Apt 3B, 22 Road 9, Maadi",
      },
      phoneNumber:   "+201112223344",
      loyaltyPoints: 150,
      authId:        c1Auth._id,
    },
    // Customer 2 — Fifth Settlement, New Cairo  ✓
    {
      name:         { firstName: "Bob", lastName: "Jones" },
      address: {
        governorate:     "cairo",
        city:            "new cairo",
        neighborhood:    "fifth settlement",
        detailedAddress: "Villa 7, Street 12, Fifth Settlement",
      },
      phoneNumber:   "+201556667788",
      loyaltyPoints: 80,
      authId:        c2Auth._id,
    },
    // Customer 3 — 12th District, 6th of October City  ✓
    {
      name:         { firstName: "Carol", lastName: "White" },
      address: {
        governorate:     "giza",
        city:            "6th of october city",
        neighborhood:    "12th district",
        detailedAddress: "Building 9, Apt 2A, 12th District",
      },
      phoneNumber:   "+201667778899",
      loyaltyPoints: 230,
      authId:        c3Auth._id,
    },
    // Customer 4 — Smouha, Alexandria City  ✓
    {
      name:         { firstName: "David", lastName: "Brown" },
      address: {
        governorate:     "alexandria",
        city:            "alexandria city",
        neighborhood:    "smouha",
        detailedAddress: "Flat 14, Tower B, Smouha Residences",
      },
      phoneNumber:   "+201778889900",
      loyaltyPoints: 40,
      authId:        c4Auth._id,
    },
    // Customer 5 — Shorouk City, Cairo  ✓
    {
      name:         { firstName: "Eva", lastName: "Green" },
      address: {
        governorate:     "cairo",
        city:            "shorouk city",
        neighborhood:    "shorouk city centre",
        detailedAddress: "House 3, Street 7, Shorouk City",
      },
      phoneNumber:   "+201889990011",
      loyaltyPoints: 310,
      authId:        c5Auth._id,
    },
  ]);

  const [customer1, customer2, customer3, customer4, customer5] = customerDocs;
  console.log(`✅  ${customerDocs.length} Customer documents inserted.\n`);

  // ── 7. Seed Products ──────────────────────────────────────────────────────
  // Tags are taken exclusively from SURPLUS_FOOD_TAGS (productTags.js).
  // Full tag list for reference:
  //   "quick breakfast (fetoor)" | "lunch helper" | "late night / suhoor"
  //   "tea time companion" | "school lunchbox snack" | "sweet tooth & dessert"
  //   "ready to eat" | "heat & serve" | "requires cooking"
  //   "siamee friendly" | "vegetarian" | "healthy choice" | "sugar-free"
  //   "requires continuous fridge" | "keep frozen" | "shelf-stable (pantry)"
  //   "perishable / consume today" | "savory & salty" | "sweet & syrupy"
  //   "spicy kick" | "creamy texture" | "crunchy bite"
  //   "single-serve portion" | "family pack / bulk" | "imperfect shape"
  //   "clearance deal" | "seasonal surplus (ramadan/eed)"
  console.log("📦  Seeding Products…");
  const productDocs = await Products.insertMany([

    // ══════════════════════════════════════════════════════════════════════
    // Vendor 1 — Green Grocer Cairo  [indices 0–3]
    // ══════════════════════════════════════════════════════════════════════

    // P0 — Organic Whole Milk
    // category: dairy  → buffer 10 days → expiryDate set +15 days out ✓
    {
      category:      "dairy",
      productName:   "Organic Whole Milk",
      price:         45,
      discount:      10,
      expiryDate:    daysFromNow(15),
      vendorId:      vendor1._id,
      quantity:      30,
      isDeliverable: true,
      description:   "Fresh organic whole milk from local farms.",
      tags: [
        "quick breakfast (fetoor)",   // pairs with cheese/fava beans at breakfast
        "requires continuous fridge", // must stay cold
        "healthy choice",             // organic, unprocessed
        "single-serve portion",       // sold per litre
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782437797/8fe8b0ab-b1fc-455b-9ab3-37fe605da07e.png",
      publicImgId:"8fe8b0ab-b1fc-455b-9ab3-37fe605da07e",
    },

    // P1 — Fresh Chicken Breast
    // category: meat_seafood  → buffer 7 days → expiryDate set +10 days out ✓
    {
      category:      "meat_seafood",
      productName:   "Chicken Breast",
      price:         120,
      discount:      15,
      expiryDate:    daysFromNow(10),
      vendorId:      vendor1._id,
      quantity:      20,
      isDeliverable: true,
      description:   "Free-range chicken breast, vacuum packed.",
      tags: [
        "lunch helper",               // main protein for a midday meal
        "requires cooking",           // raw ingredient
        "requires continuous fridge", // fresh protein must stay cold
        "clearance deal",             // discounted near best-before
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782437954/4a0cace2-2d78-4821-be11-c1019dd89e0a.png",
      publicImgId:"4a0cace2-2d78-4821-be11-c1019dd89e0a",
    },

    // P2 — Extra Virgin Olive Oil
    // category: pantry  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "pantry",
      productName:   "Extra Virgin Olive Oil",
      price:         220,
      discount:      5,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor1._id,
      quantity:      50,
      isDeliverable: true,
      description:   "Cold-pressed extra virgin olive oil, 750 ml.",
      tags: [
        "shelf-stable (pantry)",      // room-temp stable
        "healthy choice",             // heart-healthy fat
        "lunch helper",               // used in cooking daily meals
        "family pack / bulk",         // 750 ml serves a household
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438028/f113e397-7c0b-4fae-95ea-53659d841561.png",
      publicImgId:"f113e397-7c0b-4fae-95ea-53659d841561",
    },

    // P3 — Orange Juice 1L
    // category: drinks  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "drinks",
      productName:   "Orange Juice — 1L",
      price:         35,
      discount:      20,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor1._id,
      quantity:      60,
      isDeliverable: true,
      description:   "100% freshly squeezed orange juice, no added sugar.",
      tags: [
        "quick breakfast (fetoor)",   // classic breakfast drink
        "sugar-free",                 // no added sugar
        "healthy choice",             // natural vitamins
        "school lunchbox snack",      // kid-friendly drink
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438115/718f3c33-0b36-444e-ae2b-911fa90ff79c.png",
      publicImgId:"718f3c33-0b36-444e-ae2b-911fa90ff79c",
    },

    // ══════════════════════════════════════════════════════════════════════
    // Vendor 2 — Bake Haven  [indices 4–6]
    // ══════════════════════════════════════════════════════════════════════

    // P4 — Sourdough Loaf
    // category: bakery  → buffer 7 days → expiryDate set +10 days out ✓
    {
      category:      "bakery",
      productName:   "Sourdough Loaf",
      price:         65,
      discount:      0,
      expiryDate:    daysFromNow(10),
      vendorId:      vendor2._id,
      quantity:      15,
      isDeliverable: false,
      description:   "Artisan sourdough baked fresh daily.",
      tags: [
        "quick breakfast (fetoor)",   // bread is the backbone of Egyptian breakfast
        "perishable / consume today", // fresh bakery has a very short shelf life
        "ready to eat",               // no prep needed
        "savory & salty",             // classic sourdough flavour profile
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438192/7bf3bf97-100a-4352-be78-b9d40553a13b.png",
      publicImgId:"7bf3bf97-100a-4352-be78-b9d40553a13b",
    },

    // P5 — Assorted Croissants 6-pack
    // category: snacks_desserts  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "snacks_desserts",
      productName:   "Assorted Croissants (6-pack)",
      price:         80,
      discount:      25,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor2._id,
      quantity:      25,
      isDeliverable: true,
      description:   "Buttery croissants — plain, chocolate & almond.",
      tags: [
        "tea time companion",         // perfect with a hot drink
        "sweet tooth & dessert",      // chocolate & almond variants
        "ready to eat",               // grab and go
        "clearance deal",             // 25 % off surplus batch
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438239/82ee7018-f3ef-4d58-9222-728ca533e03e.png",
      publicImgId:"82ee7018-f3ef-4d58-9222-728ca533e03e",
    },

    // P6 — Homestyle Lasagne
    // category: ready_meals  → buffer 10 days → expiryDate set +15 days out ✓
    {
      category:      "ready_meals",
      productName:   "Homestyle Lasagne",
      price:         95,
      discount:      10,
      expiryDate:    daysFromNow(15),
      vendorId:      vendor2._id,
      quantity:      12,
      isDeliverable: true,
      description:   "Oven-ready beef lasagne for two, 800 g.",
      tags: [
        "heat & serve",               // oven-ready, minimal prep
        "lunch helper",               // a filling midday meal
        "requires continuous fridge", // chilled ready meal
        "family pack / bulk",         // 800 g serves two
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438293/7477bd5f-c028-4468-aa57-4711dea63427.png",
      publicImgId:"7477bd5f-c028-4468-aa57-4711dea63427",
    },

    // ══════════════════════════════════════════════════════════════════════
    // Vendor 3 — Frosty Bites  [indices 7–9]
    // ══════════════════════════════════════════════════════════════════════

    // P7 — Frozen Mixed Vegetables 1kg
    // category: frozen_food  → buffer 30 days → expiryDate set +45 days out ✓
    {
      category:      "frozen_food",
      productName:   "Frozen Mixed Vegetables 1kg",
      price:         55,
      discount:      15,
      expiryDate:    daysFromNow(45),
      vendorId:      vendor3._id,
      quantity:      40,
      isDeliverable: true,
      description:   "Premium frozen mixed vegetables — peas, carrots, corn, and green beans.",
      tags: [
        "keep frozen",                // cold-chain product
        "lunch helper",               // side dish or stir-fry base
        "vegetarian",                 // 100 % plant-based
        "healthy choice",             // no additives
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438377/cdf9bd52-2170-428c-95ec-14ebe9319757.png",
      publicImgId:"cdf9bd52-2170-428c-95ec-14ebe9319757",
    },

    // P8 — Fish Fingers 20-pack
    // category: frozen_food  → buffer 30 days → expiryDate set +50 days out ✓
    {
      category:      "frozen_food",
      productName:   "Fish Fingers (20-pack)",
      price:         130,
      discount:      20,
      expiryDate:    daysFromNow(50),
      vendorId:      vendor3._id,
      quantity:      30,
      isDeliverable: true,
      description:   "Crispy breaded white fish fingers, ready to oven-bake.",
      tags: [
        "keep frozen",                // must stay frozen
        "heat & serve",               // oven-bake from frozen
        "school lunchbox snack",      // kid-friendly finger food
        "family pack / bulk",         // 20-pack family size
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438441/162d3e74-0964-4ab3-84cb-85bb890cf070.png",
      publicImgId:"162d3e74-0964-4ab3-84cb-85bb890cf070",
    },

    // P9 — Frozen Koshary Portion
    // category: ready_meals  → buffer 10 days → expiryDate set +15 days out ✓
    {
      category:      "ready_meals",
      productName:   "Frozen Koshary Portion",
      price:         40,
      discount:      5,
      expiryDate:    daysFromNow(15),
      vendorId:      vendor3._id,
      quantity:      18,
      isDeliverable: true,
      description:   "Traditional Egyptian koshary, individually portioned and flash-frozen.",
      tags: [
        "heat & serve",               // microwave/pan from frozen
        "vegetarian",                 // classic koshary is plant-based
        "single-serve portion",       // individual portion pack
        "siamee friendly",            // no meat, suits fasting days
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438612/0e552531-9d95-403a-8437-e0756cdd74cb.png",
      publicImgId:"0e552531-9d95-403a-8437-e0756cdd74cb",
    },

    // ══════════════════════════════════════════════════════════════════════
    // Vendor 4 — Snack World  [indices 10–12]
    // ══════════════════════════════════════════════════════════════════════

    // P10 — Granola Bars 12-pack
    // category: snacks_desserts  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "snacks_desserts",
      productName:   "Granola Bars (12-pack)",
      price:         110,
      discount:      10,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor4._id,
      quantity:      35,
      isDeliverable: true,
      description:   "Oat and honey granola bars with dark chocolate chips.",
      tags: [
        "school lunchbox snack",      // portable, kid-appropriate
        "shelf-stable (pantry)",      // no refrigeration needed
        "healthy choice",             // oat-based, low sugar
        "ready to eat",               // no prep needed
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438685/6b990ffd-5d9f-4014-a11f-a62777216b79.png",
      publicImgId:"6b990ffd-5d9f-4014-a11f-a62777216b79",
    },

    // P11 — Mixed Nuts 500g
    // category: snacks_desserts  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "snacks_desserts",
      productName:   "Mixed Nuts 500g",
      price:         180,
      discount:      0,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor4._id,
      quantity:      22,
      isDeliverable: true,
      description:   "Premium roasted mixed nuts — cashews, almonds, and walnuts.",
      tags: [
        "tea time companion",         // great with tea
        "shelf-stable (pantry)",      // long ambient shelf life
        "crunchy bite",               // classic nut texture
        "healthy choice",             // natural protein and fats
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438859/433d6df5-d1d2-4c27-8f88-1e02dc2181ed.png",
      publicImgId:"433d6df5-d1d2-4c27-8f88-1e02dc2181ed",
    },

    // P12 — Peanut Butter Crunchy 500g
    // category: pantry  → buffer 30 days → expiryDate set +45 days out ✓
    {
      category:      "pantry",
      productName:   "Peanut Butter — Crunchy 500g",
      price:         95,
      discount:      12,
      expiryDate:    daysFromNow(45),
      vendorId:      vendor4._id,
      quantity:      28,
      isDeliverable: true,
      description:   "Natural crunchy peanut butter, no added sugar or palm oil.",
      tags: [
        "quick breakfast (fetoor)",   // spread on toast at breakfast
        "shelf-stable (pantry)",      // ambient storage
        "sugar-free",                 // no added sugar
        "crunchy bite",               // crunchy variant
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782442444/ad8e7e65-5186-47ef-8fea-67f05328cd75.png",
      publicImgId:"ad8e7e65-5186-47ef-8fea-67f05328cd75",
    },

    // ══════════════════════════════════════════════════════════════════════
    // Vendor 5 — Drink Station  [indices 13–16]
    // ══════════════════════════════════════════════════════════════════════

    // P13 — Cold-Brew Coffee 500ml
    // category: drinks  → buffer 30 days → expiryDate set +40 days out ✓
    {
      category:      "drinks",
      productName:   "Cold-Brew Coffee 500ml",
      price:         75,
      discount:      10,
      expiryDate:    daysFromNow(40),
      vendorId:      vendor5._id,
      quantity:      45,
      isDeliverable: true,
      description:   "Smooth 18-hour cold-brew coffee, lightly sweetened.",
      tags: [
        "late night / suhoor",        // popular as a suhoor drink
        "ready to eat",               // drink straight from the bottle
        "requires continuous fridge", // chilled product
        "single-serve portion",       // 500 ml individual bottle
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782438938/d0adf50f-5cb6-47eb-91b2-50f713d683b7.png",
      publicImgId:"d0adf50f-5cb6-47eb-91b2-50f713d683b7",
    },

    // P14 — Mango Smoothie 330ml
    // category: drinks  → buffer 30 days → expiryDate set +35 days out ✓
    {
      category:      "drinks",
      productName:   "Mango Smoothie 330ml",
      price:         40,
      discount:      15,
      expiryDate:    daysFromNow(35),
      vendorId:      vendor5._id,
      quantity:      55,
      isDeliverable: true,
      description:   "100% Alphonso mango blended with no added water or sugar.",
      tags: [
        "school lunchbox snack",      // popular with kids
        "sugar-free",                 // no added sugar
        "ready to eat",               // ready to drink
        "single-serve portion",       // 330 ml single can
      ],
      imgUrl:"https://res.cloudinary.com/dx89qnzgl/image/upload/v1782439011/4f455d8a-f6e2-40dd-bf7c-9790a89dfddc.png",
      publicImgId:"4f455d8a-f6e2-40dd-bf7c-9790a89dfddc",
    },

    // P15 — Sparkling Water 12-pack
    // category: drinks  → buffer 30 days → expiryDate set +50 days out ✓
    {
      category:      "drinks",
      productName:   "Sparkling Water 12-pack",
      price:         90,
      discount:      5,
      expiryDate:    daysFromNow(50),
      vendorId:      vendor5._id,
      quantity:      70,
      isDeliverable: true,
      description:   "Naturally carbonated mineral water, 330 ml cans.",
      tags: [
        "shelf-stable (pantry)",      // ambient storage for sealed cans
        "sugar-free",                 // plain water, zero sugar
        "family pack / bulk",         // 12-pack multipack
        "healthy choice",             // zero-calorie hydration
      ],
      imgUrl: "https://res.cloudinary.com/dx89qnzgl/image/upload/v1782439090/11b5de0d-ae5d-4396-a73f-f05038df9968.png",
      publicImgId: "11b5de0d-ae5d-4396-a73f-f05038df9968",
    },

    // P16 — Greek Yoghurt 200g
    // category: dairy  → buffer 10 days → expiryDate set +12 days out ✓
    {
      category:      "dairy",
      productName:   "Greek Yoghurt 200g",
      price:         30,
      discount:      20,
      expiryDate:    daysFromNow(12),
      vendorId:      vendor5._id,
      quantity:      38,
      isDeliverable: true,
      description:   "Full-fat strained Greek yoghurt, plain, high protein.",
      tags: [
        "quick breakfast (fetoor)",   // yoghurt is a staple Egyptian breakfast item
        "requires continuous fridge", // dairy cold-chain
        "healthy choice",             // high protein, probiotic
        "single-serve portion",       // 200 g individual cup
      ],
      imgUrl: "https://res.cloudinary.com/dx89qnzgl/image/upload/v1782424786/food-waste-reduction/products/gffslyjg84zohldzuhti.png",
      publicImgId: "food-waste-reduction/products/gffslyjg84zohldzuhti",

    },
  ]);

  const [
    milkP, chickenP, oliveOilP, ojP,                            // vendor1  [0–3]
    sourdoughP, croissantP, lasagneP,                            // vendor2  [4–6]
    frozenVegP, fishFingersP, kosharyP,                          // vendor3  [7–9]
    granolaP, mixedNutsP, peanutButterP,                         // vendor4  [10–12]
    coldBrewP, mangoSmoothieP, sparklingWaterP, yoghurtP,        // vendor5  [13–16]
  ] = productDocs;
  console.log(`✅  ${productDocs.length} Product documents inserted.\n`);

  // ── 8. Seed Orders ────────────────────────────────────────────────────────
  // Each order contains products from a single vendor only
  // (matching the real-world fulfilment model).
  console.log("🛒  Seeding Orders…");
  const orderDocs = await Order.insertMany([

    // O1 — customer1, completed | Vendor 1
    {
      customerId: customer1._id,
      products: [
        { productId: milkP._id,  vendorId: vendor1._id, quantity: 2, priceAtPurchase: milkP.price,  isCommissioned: true },
        { productId: ojP._id,    vendorId: vendor1._id, quantity: 1, priceAtPurchase: ojP.price,    isCommissioned: true },
      ],
      status: "completed", paymentMethod: "credit_card",
      shippingAddress: "Apt 3B, 22 Road 9, Maadi, Cairo",
    },

    // O2 — customer1, pending | Vendor 2
    {
      customerId: customer1._id,
      products: [
        { productId: croissantP._id, vendorId: vendor2._id, quantity: 3, priceAtPurchase: croissantP.price, isCommissioned: false },
      ],
      status: "pending", paymentMethod: "cash_on_delivery",
      shippingAddress: "Apt 3B, 22 Road 9, Maadi, Cairo",
    },

    // O3 — customer2, ready | Vendor 1
    {
      customerId: customer2._id,
      products: [
        { productId: chickenP._id, vendorId: vendor1._id, quantity: 1, priceAtPurchase: chickenP.price, isCommissioned: true },
      ],
      status: "ready", paymentMethod: "paypal",
      shippingAddress: "Villa 7, Street 12, Fifth Settlement, New Cairo",
    },

    // O4 — customer2, cancelled | Vendor 1
    {
      customerId: customer2._id,
      products: [
        { productId: oliveOilP._id, vendorId: vendor1._id, quantity: 1, priceAtPurchase: oliveOilP.price, isCommissioned: false },
        { productId: ojP._id,       vendorId: vendor1._id, quantity: 4, priceAtPurchase: ojP.price,       isCommissioned: false },
      ],
      status: "cancelled", paymentMethod: "credit_card",
      shippingAddress: "Villa 7, Street 12, Fifth Settlement, New Cairo",
    },

    // O5 — customer3, completed | Vendor 3
    {
      customerId: customer3._id,
      products: [
        { productId: frozenVegP._id,   vendorId: vendor3._id, quantity: 2, priceAtPurchase: frozenVegP.price,   isCommissioned: true },
        { productId: fishFingersP._id, vendorId: vendor3._id, quantity: 1, priceAtPurchase: fishFingersP.price, isCommissioned: true },
      ],
      status: "completed", paymentMethod: "credit_card",
      shippingAddress: "Building 9, Apt 2A, 12th District, 6th of October City",
    },

    // O6 — customer3, pending | Vendor 4
    {
      customerId: customer3._id,
      products: [
        { productId: granolaP._id,   vendorId: vendor4._id, quantity: 3, priceAtPurchase: granolaP.price,   isCommissioned: false },
        { productId: mixedNutsP._id, vendorId: vendor4._id, quantity: 1, priceAtPurchase: mixedNutsP.price, isCommissioned: false },
      ],
      status: "pending", paymentMethod: "cash_on_delivery",
      shippingAddress: "Building 9, Apt 2A, 12th District, 6th of October City",
    },

    // O7 — customer4, ready | Vendor 5
    {
      customerId: customer4._id,
      products: [
        { productId: coldBrewP._id,       vendorId: vendor5._id, quantity: 4, priceAtPurchase: coldBrewP.price,       isCommissioned: true },
        { productId: sparklingWaterP._id, vendorId: vendor5._id, quantity: 2, priceAtPurchase: sparklingWaterP.price, isCommissioned: true },
      ],
      status: "ready", paymentMethod: "paypal",
      shippingAddress: "Flat 14, Tower B, Smouha Residences, Alexandria",
    },

    // O8 — customer4, completed | Vendor 5
    {
      customerId: customer4._id,
      products: [
        { productId: yoghurtP._id,       vendorId: vendor5._id, quantity: 3, priceAtPurchase: yoghurtP.price,       isCommissioned: true },
        { productId: mangoSmoothieP._id, vendorId: vendor5._id, quantity: 2, priceAtPurchase: mangoSmoothieP.price, isCommissioned: true },
      ],
      status: "completed", paymentMethod: "credit_card",
      shippingAddress: "Flat 14, Tower B, Smouha Residences, Alexandria",
    },

    // O9 — customer5, abandoned | Vendor 3
    {
      customerId: customer5._id,
      products: [
        { productId: kosharyP._id,   vendorId: vendor3._id, quantity: 5, priceAtPurchase: kosharyP.price,   isCommissioned: false },
        { productId: frozenVegP._id, vendorId: vendor3._id, quantity: 1, priceAtPurchase: frozenVegP.price, isCommissioned: false },
      ],
      status: "abandoned", paymentMethod: "cash_on_delivery",
      shippingAddress: "House 3, Street 7, Shorouk City",
    },

    // O10 — customer5, completed | Vendor 2
    {
      customerId: customer5._id,
      products: [
        { productId: sourdoughP._id, vendorId: vendor2._id, quantity: 2, priceAtPurchase: sourdoughP.price, isCommissioned: true },
        { productId: croissantP._id, vendorId: vendor2._id, quantity: 2, priceAtPurchase: croissantP.price, isCommissioned: true },
        { productId: lasagneP._id,   vendorId: vendor2._id, quantity: 1, priceAtPurchase: lasagneP.price,   isCommissioned: true },
      ],
      status: "completed", paymentMethod: "paypal",
      shippingAddress: "House 3, Street 7, Shorouk City",
    },

    // O11 — customer1, completed | Vendor 4
    {
      customerId: customer1._id,
      products: [
        { productId: peanutButterP._id, vendorId: vendor4._id, quantity: 1, priceAtPurchase: peanutButterP.price, isCommissioned: true },
        { productId: granolaP._id,      vendorId: vendor4._id, quantity: 2, priceAtPurchase: granolaP.price,      isCommissioned: true },
      ],
      status: "completed", paymentMethod: "credit_card",
      shippingAddress: "Apt 3B, 22 Road 9, Maadi, Cairo",
    },

    // O12 — customer2, ready | Vendor 3
    {
      customerId: customer2._id,
      products: [
        { productId: fishFingersP._id, vendorId: vendor3._id, quantity: 2, priceAtPurchase: fishFingersP.price, isCommissioned: true },
        { productId: kosharyP._id,     vendorId: vendor3._id, quantity: 3, priceAtPurchase: kosharyP.price,     isCommissioned: true },
      ],
      status: "ready", paymentMethod: "cash_on_delivery",
      shippingAddress: "Villa 7, Street 12, Fifth Settlement, New Cairo",
    },

    // O13 — customer3, pending | Vendor 5
    {
      customerId: customer3._id,
      products: [
        { productId: mangoSmoothieP._id,   vendorId: vendor5._id, quantity: 6, priceAtPurchase: mangoSmoothieP.price,   isCommissioned: false },
        { productId: sparklingWaterP._id,  vendorId: vendor5._id, quantity: 2, priceAtPurchase: sparklingWaterP.price,  isCommissioned: false },
      ],
      status: "pending", paymentMethod: "paypal",
      shippingAddress: "Building 9, Apt 2A, 12th District, 6th of October City",
    },

    // O14 — customer4, cancelled | Vendor 1
    {
      customerId: customer4._id,
      products: [
        { productId: chickenP._id,  vendorId: vendor1._id, quantity: 2, priceAtPurchase: chickenP.price,  isCommissioned: false },
        { productId: oliveOilP._id, vendorId: vendor1._id, quantity: 1, priceAtPurchase: oliveOilP.price, isCommissioned: false },
      ],
      status: "cancelled", paymentMethod: "credit_card",
      shippingAddress: "Flat 14, Tower B, Smouha Residences, Alexandria",
    },
  ]);
  console.log(`✅  ${orderDocs.length} Order documents inserted.\n`);

  // ── 9. Seed AdminLogs ─────────────────────────────────────────────────────
  console.log("📋  Seeding AdminLogs…");
  const logDocs = await AdminLogs.insertMany([
    // 3 original logs
    { adminId: admin1Doc._id, userId: v1Auth._id, action: "approve_vendor",   description: "Approved Green Grocer Cairo after document verification." },
    { adminId: admin1Doc._id, userId: v2Auth._id, action: "approve_vendor",   description: "Approved Bake Haven after document verification." },
    { adminId: admin1Doc._id, userId: c1Auth._id, action: "activate_user",    description: "Reactivated Alice Smith's account following support request." },
    // 10 new logs
    { adminId: admin1Doc._id, userId: v3Auth._id, action: "approve_vendor",   description: "Approved Frosty Bites after reviewing tax registration and cold-chain documentation." },
    { adminId: admin2Doc._id, userId: v4Auth._id, action: "approve_vendor",   description: "Approved Snack World; tax number and shop address verified." },
    { adminId: admin2Doc._id, userId: v5Auth._id, action: "approve_vendor",   description: "Approved Drink Station following successful in-person inspection." },
    { adminId: admin1Doc._id, userId: c2Auth._id, action: "suspend_user",     description: "Suspended Bob Jones due to three consecutive disputed chargebacks." },
    { adminId: admin2Doc._id, userId: c2Auth._id, action: "reactivate_user",  description: "Reactivated Bob Jones after chargeback disputes were resolved in vendor's favour." },
    { adminId: admin1Doc._id, userId: c3Auth._id, action: "activate_user",    description: "Manually activated Carol White's account after email-verification link expired." },
    { adminId: admin2Doc._id, userId: v3Auth._id, action: "suspend_user",     description: "Temporarily suspended Frosty Bites pending resolution of a food-safety complaint." },
    { adminId: admin2Doc._id, userId: v3Auth._id, action: "reactivate_user",  description: "Reactivated Frosty Bites after health authority issued a clearance certificate." },
    { adminId: admin1Doc._id, userId: c4Auth._id, action: "activate_user",    description: "Activated David Brown's account; identity verified via national ID upload." },
    { adminId: admin2Doc._id, userId: v4Auth._id, action: "reject_vendor",    description: "Issued a formal warning to Snack World for two late-fulfilment incidents within 30 days." },
    { adminId: admin1Doc._id, userId: c5Auth._id, action: "activate_user",    description: "Activated Eva Green's account after manual KYC review completed." },
  ]);
  console.log(`✅  ${logDocs.length} AdminLog documents inserted.\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("─".repeat(60));
  console.log("🌱  Seeding complete! Final counts:");
  console.log(`   UsersAuth  : ${authDocs.length}   (2 admins · 5 vendors · 5 customers)`);
  console.log(`   Admins     : ${adminDocs.length}`);
  console.log(`   Vendors    : ${vendorDocs.length}`);
  console.log(`   Customers  : ${customerDocs.length}`);
  console.log(`   Products   : ${productDocs.length}`);
  console.log(`   Orders     : ${orderDocs.length}`);
  console.log(`   AdminLogs  : ${logDocs.length}`);
  console.log("─".repeat(60));
  console.log("\n🔑  Test credentials:");
  console.log("   Admin 1    → masteradmin   / Admin@123");
  console.log("   Admin 2    → superadmin2   / Admin@456");
  console.log("   Vendor 1   → greengrocer   / Vendor@123  (Maadi, Cairo)");
  console.log("   Vendor 2   → bakehaven     / Vendor@456  (Fifth Settlement, New Cairo)");
  console.log("   Vendor 3   → frostybites   / Vendor@789  (12th District, 6th October)");
  console.log("   Vendor 4   → snackworld    / Vendor@321  (Smouha, Alexandria)");
  console.log("   Vendor 5   → drinkstation  / Vendor@654  (Shorouk City, Cairo)");
  console.log("   Customer 1 → alice_smith   / Customer@123");
  console.log("   Customer 2 → bob_jones     / Customer@456");
  console.log("   Customer 3 → carol_white   / Customer@789");
  console.log("   Customer 4 → david_brown   / Customer@321");
  console.log("   Customer 5 → eva_green     / Customer@654");

  await mongoose.disconnect();
  console.log("\n🔌  Disconnected. Done.\n");
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
export const CATEGORY_CONFIG = {
  dairy: { label: "Dairy", bufferDays: 10 },
  meat_seafood: { label: "Meat & Seafood", bufferDays: 7 },
  bakery: { label: "Bakery", bufferDays: 7 },
  frozen_food: { label: "Frozen Food", bufferDays: 30 },
  ready_meals: { label: "Ready Meals", bufferDays: 10 },
  snacks_desserts: { label: "Snacks & Desserts", bufferDays: 30 },
  drinks: { label: "Drinks", bufferDays: 30 },
  pantry: { label: "Pantry", bufferDays: 30 },
};

export const categoriesEnum = Object.keys(CATEGORY_CONFIG);

export const daysToSubtractBeforeExpiry = Object.fromEntries(
  Object.entries(CATEGORY_CONFIG).map(([key, value]) => [key, value.bufferDays])
);
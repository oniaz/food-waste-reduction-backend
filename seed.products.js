import mongoose from "mongoose";
import dotenv from "dotenv";
import Products from "./src/models/products.model.js";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

console.log("🟢 Connected to DB");

// نمسح الداتا القديمة
await Products.deleteMany();

console.log("🧹 Old data removed");

// نضيف داتا جاهزة
await Products.insertMany([
  {
    category: "dairy",
    productName: "Milk Fresh",
    price: 50,
    discount: 5,
    expiryDate: "2026-06-10",
    vendorId: "665f12345678901234567890",
    quantity: 10,
    isDeliverable: true,
    imgUrl: "http://image.com/milk",
    tags: ["dairy"],
  },
  {
    category: "bakery",
    productName: "Expired Bread",
    price: 20,
    discount: 10,
    expiryDate: "2025-01-01",
    vendorId: "665f12345678901234567890",
    quantity: 5,
    isDeliverable: true,
    imgUrl: "http://image.com/bread",
    tags: ["bakery"],
  },
  {
    category: "snacks",
    productName: "Chips Pack",
    price: 30,
    discount: 2,
    expiryDate: "2026-12-01",
    vendorId: "665f12345678901234567890",
    quantity: 0,
    isDeliverable: true,
    imgUrl: "http://image.com/chips",
    tags: ["snacks"],
  },
]);

console.log("Seed data inserted");

process.exit();

import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import connectDB from "./config/db.js";

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import productsRoutes from "./modules/products/products.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import locationsRoutes from "./modules/locations/locations.routes.js"
import {
  notFoundMiddleware,
  errorMiddleware,
} from "./middleware/error.middleware.js";
import { globalLimiter } from "./middleware/rateLimit.middleware.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware
app.use(morgan("dev"));
app.use(express.json());
app.use(helmet());
app.use(cookieParser());
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.urlencoded({ extended: true }));

// 2. DB connection
await connectDB();

// 3. Home route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Waste Reduction API!" });
});
// 4. Rate limit
app.use(globalLimiter)
// 5. Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/locations", locationsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
// 7. Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;

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
import productsRoutes from "./modules/products/products.routes.js"
import adminRoutes from "./modules/admin/admin.routes.js";
import { notFoundMiddleware, errorMiddleware } from "./middleware/error.middleware.js";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(express.json());
app.use(helmet());
app.use(cookieParser());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

await connectDB();

app.get("/", (req, res) => {
    res.json({message: "Welcome to the Waste Reduction API!"});
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;
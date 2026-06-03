import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import connectDB from "./config/db.js";


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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;
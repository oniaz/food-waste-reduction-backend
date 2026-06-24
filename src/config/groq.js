import dotenv from "dotenv";
dotenv.config();

import { Groq } from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn("WARNING: GROQ_API_KEY is missing from environment variables.");
}

export const groqClient = new Groq({ apiKey });

export const GROQ_MODEL = "llama-3.1-8b-instant";
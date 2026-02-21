// src/config/env.ts
import * as dotenv from 'dotenv';
dotenv.config();

export const ENV = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_KEY: process.env.SUPABASE_SECRET_KEY!,
    CHAINGPT_API_KEY: process.env.CHAINGPT_API_KEY!,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!, // Added for Gemini
    PORT: process.env.PORT || 3001,              // Added for Express Server
    POLYMARKET_BASE_URL: "https://gamma-api.polymarket.com",
    CLOB_API_URL: "https://clob.polymarket.com", // Added for live orderbook
    PAGE_LIMIT: 100,
    LOOP_DELAY_MS: 300000,
    REQUEST_DELAY_MS: 500,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY!,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || 'fallback_secret'
};
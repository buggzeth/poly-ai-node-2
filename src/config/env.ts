// src/config/env.ts
import * as dotenv from 'dotenv';
dotenv.config();

export const ENV = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_KEY: process.env.SUPABASE_SECRET_KEY!,
    CHAINGPT_API_KEY: process.env.CHAINGPT_API_KEY!,
    POLYMARKET_BASE_URL: "https://gamma-api.polymarket.com",
    PAGE_LIMIT: 100,
    LOOP_DELAY_MS: 300000,
    REQUEST_DELAY_MS: 500
};
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Configuration ---
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!;
const BASE_URL = "https://gamma-api.polymarket.com";
const PAGE_LIMIT = 100;
const LOOP_DELAY_MS = 300000; // Wait 60s when we hit the end of the list before restarting
const REQUEST_DELAY_MS = 500; // Polite delay between API calls to prevent rate limits

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

// --- Types ported directly from your Next.js app ---
export interface PolymarketMarket {
    id: string;
    question: string;
    conditionId: string;
    slug: string;
    resolutionSource: string;
    endDate: string;
    liquidity: string | number;
    startDate: string;
    image?: string;
    icon?: string;
    description?: string;
    outcomes: string;
    outcomePrices: string;
    volume: string | number;
    active: boolean;
    closed: boolean;
    marketMakerAddress?: string;
    clobTokenIds?: string;
}

export interface PolymarketEvent {
    id: string;
    ticker: string;
    slug: string;
    title: string;
    description: string;
    startDate: string;
    creationDate: string;
    endDate: string;
    image?: string;
    icon?: string;
    active: boolean;
    closed: boolean;
    liquidity: number;
    volume: number;
    openInterest: number;
    markets: PolymarketMarket[];
    tags?: { label: string; slug: string }[];
    cyom?: boolean;
}

// --- Helper Functions ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exact replica of your Next.js filterActiveEvents logic
function filterActiveEvents(events: any[]): PolymarketEvent[] {
    const now = Date.now();

    return events
        .map((event) => {
            const validMarkets = (event.markets || []).filter((market: any) => {
                if (market.closed) return false;
                if (!market.endDate) return false;
                const marketEnd = new Date(market.endDate).getTime();
                return marketEnd > now;
            });

            return { ...event, markets: validMarkets };
        })
        .filter((event) => {
            if (event.markets.length === 0) return false;
            if (event.closed) return false;
            if (event.endDate) {
                const eventEnd = new Date(event.endDate).getTime();
                if (eventEnd <= now) return false;
            }
            return true;
        }) as PolymarketEvent[];
}

// Map API payload safely to our custom type
function mapToEventData(rawEvent: any): PolymarketEvent {
    return {
        id: rawEvent.id,
        ticker: rawEvent.ticker || "",
        slug: rawEvent.slug || "",
        title: rawEvent.title || "",
        description: rawEvent.description || "",
        startDate: rawEvent.startDate,
        creationDate: rawEvent.creationDate,
        endDate: rawEvent.endDate,
        image: rawEvent.image,
        icon: rawEvent.icon,
        active: rawEvent.active,
        closed: rawEvent.closed,
        liquidity: Number(rawEvent.liquidity) || 0,
        volume: Number(rawEvent.volume) || 0,
        openInterest: Number(rawEvent.openInterest) || 0,
        tags: rawEvent.tags,
        cyom: rawEvent.cyom,
        markets: (rawEvent.markets || []).map((m: any) => ({
            id: m.id,
            question: m.question,
            conditionId: m.conditionId,
            slug: m.slug,
            resolutionSource: m.resolutionSource,
            endDate: m.endDate,
            liquidity: m.liquidity,
            startDate: m.startDate,
            image: m.image,
            icon: m.icon,
            description: m.description,
            outcomes: m.outcomes,
            outcomePrices: m.outcomePrices,
            volume: m.volume,
            active: m.active,
            closed: m.closed,
            marketMakerAddress: m.marketMakerAddress,
            clobTokenIds: m.clobTokenIds
        }))
    };
}

// --- Core Indexer Logic ---
async function fetchAndIndex() {
    let offset = 0;
    const nowIso = new Date().toISOString();

    console.log(`\n[${new Date().toISOString()}] 🚀 Starting new indexing cycle...`);

    while (true) {
        try {
            // Organized request: fetch newest active events first
            const params = new URLSearchParams({
                limit: PAGE_LIMIT.toString(),
                offset: offset.toString(),
                active: "true",
                closed: "false",
                order: "createdAt",    // Ensures we hit the newest events first
                ascending: "false",    // Newest -> Oldest
                end_date_min: nowIso   // Don't pull inherently expired data
            });

            const url = `${BASE_URL}/events?${params.toString()}`;
            console.log(`📡 Fetching offset ${offset}...`);
            
            const { data: rawEvents } = await axios.get(url, {
                headers: { "Accept": "application/json" }
            });

            // If the endpoint returns empty, we've scraped every valid page
            if (!rawEvents || rawEvents.length === 0) {
                console.log(`🏁 Reached the end of active events (Offset: ${offset}). Cycle complete.`);
                break;
            }

            // 1. Filter out inherently bad/closed markets
            const validEvents = filterActiveEvents(rawEvents);

            if (validEvents.length > 0) {
                // 2. Format mapped data into DB rows
                const rowsToInsert = validEvents.map(event => {
                    const mappedEvent = mapToEventData(event);
                    return {
                        id: mappedEvent.id,
                        slug: mappedEvent.slug,
                        active: mappedEvent.active,
                        closed: mappedEvent.closed,
                        end_date: mappedEvent.endDate,
                        event_data: mappedEvent // Dump exact object to JSONB
                    };
                });

                // 3. Batch insert using 'upsert' with ignoreDuplicates
                // This acts as a lightning-fast "INSERT IF NOT EXISTS"
                const { error } = await supabase
                    .from('indexed_events')
                    .upsert(rowsToInsert, { 
                        onConflict: 'id', 
                        ignoreDuplicates: true // Will not overwrite existing events
                    });

                if (error) {
                    console.error("❌ Database Error:", error.message);
                } else {
                    console.log(`✅ Processed ${rowsToInsert.length} valid events (Ignored duplicates seamlessly).`);
                }
            } else {
                console.log(`⚠️ All events in this batch were filtered out by active logic.`);
            }

            // Increment pagination and apply polite delay
            offset += PAGE_LIMIT;
            await sleep(REQUEST_DELAY_MS);

        } catch (error: any) {
            console.error("❌ API Fetch Error:", error.message);
            console.log("Retrying current offset in 5 seconds...");
            await sleep(5000);
        }
    }
}

// --- Execution Daemon ---
async function startDaemon() {
    console.log("🦀 NUKE.FARM - Automated Polymarket Indexer Initialized 🦀");
    
    // Infinite loop that restarts from offset 0 when it hits the end of the lists
    while (true) {
        await fetchAndIndex();
        
        console.log(`💤 Sleeping for ${LOOP_DELAY_MS / 1000} seconds before restarting from top...`);
        await sleep(LOOP_DELAY_MS);
    }
}

// Start the app
startDaemon();
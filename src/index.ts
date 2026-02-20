// src/index.ts
import { runIndexerBatch } from './pipelines/indexer';
import { runScoringBatch } from './pipelines/scorer';
import { ENV } from './config/env';
import { sleep } from './utils/helpers';

async function startDaemon() {
    console.log("🦀 NUKE.FARM - Automated Polymarket AI Pipeline Initialized 🦀");
    
    let offset = 0;

    while (true) {
        try {
            // Step 1: Process 100 events from Polymarket
            const hasMorePages = await runIndexerBatch(offset);
            
            // Step 2: Generate scores for 25 database events (incorporates 24hr rule)
            await runScoringBatch();

            // Step 3: Pagination & Looping logic
            if (hasMorePages) {
                offset += ENV.PAGE_LIMIT; // Move to next 100
                console.log("⏳ Waiting 3 seconds before next cycle to respect rate limits...");
                await sleep(3000); 
            } else {
                // If Polymarket pagination ran out, reset and wait 5 minutes
                offset = 0;
                console.log(`💤 Reached end of Polymarket. Sleeping for ${ENV.LOOP_DELAY_MS / 1000} seconds...`);
                await sleep(ENV.LOOP_DELAY_MS);
            }
        } catch (error: any) {
            console.error("❌ Pipeline Error:", error.message);
            await sleep(5000); // Wait 5s on error before retrying
        }
    }
}

startDaemon();
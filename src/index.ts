// src/index.ts
import { runIndexerPipeline } from './pipelines/indexer';
import { runScoringPipeline } from './pipelines/scorer';
import { ENV } from './config/env';
import { sleep } from './utils/helpers';

async function startDaemon() {
    console.log("🦀 NUKE.FARM - Automated Polymarket AI Indexer Initialized 🦀");
    
    while (true) {
        // 1. Scrape and index new events into DB
        await runIndexerPipeline();
        
        // 2. Score any unscored events in DB in batches of 25
        while (true) {
            const hasMoreToScore = await runScoringPipeline();
            
            // If scorer returns false, all events have scores. Break the inner loop.
            if (!hasMoreToScore) break; 
            
            // Polite delay between ChainGPT requests to avoid rate limits
            console.log("⏳ Waiting 3 seconds before next AI batch...");
            await sleep(3000); 
        }

        console.log(`💤 Cycle complete. Sleeping for ${ENV.LOOP_DELAY_MS / 1000} seconds...`);
        await sleep(ENV.LOOP_DELAY_MS);
    }
}

// Start the app!
startDaemon();
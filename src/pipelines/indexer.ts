// src/pipelines/indexer.ts
import { fetchPolymarketEvents } from '../api/polymarket';
import { filterActiveEvents } from '../utils/filters';
import { mapToEventData } from '../utils/mappers';
import { supabase } from '../db/supabase';
import { ENV } from '../config/env';
import { sleep } from '../utils/helpers';

export async function runIndexerPipeline() {
    let offset = 0;
    console.log(`\n[${new Date().toISOString()}] 🚀 Starting Indexer...`);

    while (true) {
        try {
            console.log(`📡 Fetching offset ${offset}...`);
            const rawEvents = await fetchPolymarketEvents(offset);
            
            if (rawEvents.length === 0) break;

            const validEvents = filterActiveEvents(rawEvents);
            if (validEvents.length > 0) {
                const rows = validEvents.map(event => {
                    const mapped = mapToEventData(event);
                    return {
                        id: mapped.id,
                        slug: mapped.slug,
                        active: mapped.active,
                        closed: mapped.closed,
                        end_date: mapped.endDate,
                        event_data: mapped
                    };
                });

                await supabase.from('indexed_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
                console.log(`✅ Processed ${rows.length} valid events.`);
            }
            offset += ENV.PAGE_LIMIT;
            await sleep(ENV.REQUEST_DELAY_MS);
        } catch (error: any) {
            console.error("❌ Indexer Error:", error.message);
            await sleep(5000);
        }
    }
}
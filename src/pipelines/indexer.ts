// src/pipelines/indexer.ts
import { fetchPolymarketEvents } from '../api/polymarket';
import { filterActiveEvents } from '../utils/filters';
import { mapToEventData } from '../utils/mappers';
import { supabase } from '../db/supabase';

export async function runIndexerBatch(offset: number): Promise<boolean> {
    console.log(`\n📡 [Indexer] Fetching 100 events at offset ${offset}...`);
    const rawEvents = await fetchPolymarketEvents(offset);
    
    if (rawEvents.length === 0) {
        console.log(`🏁 Reached the end of active Polymarket events.`);
        return false; // Tells the main loop to reset
    }

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

        // Upsert updates existing rows seamlessly
        await supabase.from('indexed_events').upsert(rows, { onConflict: 'id' });
        console.log(`✅ [Indexer] Upserted ${rows.length} valid events to DB.`);
    }
    
    return true; // Indicates there are likely more pages
}
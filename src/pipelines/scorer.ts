// src/pipelines/scorer.ts
import { supabase } from '../db/supabase';
import { scoreEventsWithAI } from '../api/chaingpt';

export async function runScoringBatch() {
    console.log(`🧠 [Scorer] Fetching up to 25 events for AI evaluation...`);
    
    // Calculate timestamp for exactly 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch 25 events that have NO score OR haven't been scored in 24 hours
    const { data: eventsToScore } = await supabase
        .from('indexed_events')
        .select('id, event_data')
        .or(`predictability_score.is.null,last_scored_at.lt.${twentyFourHoursAgo}`)
        .limit(25);

    if (!eventsToScore || eventsToScore.length === 0) {
        console.log(`✅ [Scorer] No events require scoring at this time.`);
        return; 
    }

    const promptInput = eventsToScore.reduce((acc, row) => {
        acc[row.id] = { title: row.event_data.title };
        return acc;
    }, {} as Record<string, { title: string }>);

    const promptTemplate = `You are an expert forecasting AI... \n\nInput Events:\n${JSON.stringify(promptInput, null, 2)}`;
    
    console.log(`🤖 [Scorer] Sending ${eventsToScore.length} events to ChainGPT...`);
    const scoredData = await scoreEventsWithAI(promptTemplate);

    for (const [id, result] of Object.entries(scoredData)) {
        if (result.score !== undefined) {
            await supabase
                .from('indexed_events')
                .update({ 
                    predictability_score: result.score,
                    last_scored_at: new Date().toISOString() // Set the fresh timestamp
                })
                .eq('id', id);
            console.log(`📝 [Scorer] Logged Score: Event ${id} -> ${result.score}`);
        }
    }
}
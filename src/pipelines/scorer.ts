// src/pipelines/scorer.ts
import { supabase } from '../db/supabase';
import { scoreEventsWithAI } from '../api/chaingpt';

export async function runScoringBatch(): Promise<boolean> {
    console.log(`🧠 [Scorer] Fetching up to 25 events for AI evaluation...`);
    
    // Calculate timestamp for exactly 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch up to 25 events that have NO score OR haven't been scored in 24 hours
    const { data: eventsToScore } = await supabase
        .from('indexed_events')
        .select('id, event_data')
        .or(`predictability_score.is.null,last_scored_at.lt.${twentyFourHoursAgo}`)
        .limit(25); // Reduced from 50 to 25

    if (!eventsToScore || eventsToScore.length === 0) {
        console.log(`✅ [Scorer] No events require scoring at this time.`);
        return false; 
    }

    const promptInput = eventsToScore.reduce((acc, row) => {
        acc[row.id] = { title: row.event_data.title };
        return acc;
    }, {} as Record<string, { title: string }>);

    const promptTemplate = `You are an expert forecasting AI. Evaluate the predictability of the following prediction market events. 
Assign each event a highly granular, precise predictability score from 0 to 99.

CRITICAL INSTRUCTIONS:
- Do NOT round to the nearest 10. Avoid lazy scores like 30, 40, 50, or 60.
- Use precise numbers based on subtle market entropy (e.g., 22, 37, 46, 54, 73, 88).
- Pure chaos/coin-toss events should score very low (11-28).
- Highly structured/momentum-driven events should score higher (62-84).

Input Events:
${JSON.stringify(promptInput, null, 2)}

Return ONLY a valid JSON object matching the exact structure below, with no markdown formatting.
Example output structure:
{
  "example_id_1": {
    "title": "Example Title 1",
    "score": 38
  },
  "example_id_2": {
    "title": "Example Title 2",
    "score": 14
  }
}`;
    
    console.log(`🤖 [Scorer] Sending ${eventsToScore.length} events to ChainGPT...`);
    const scoredData = await scoreEventsWithAI(promptTemplate);

    for (const [id, result] of Object.entries(scoredData)) {
        if (result.score !== undefined) {
            await supabase
                .from('indexed_events')
                .update({ 
                    predictability_score: result.score,
                    last_scored_at: new Date().toISOString() 
                })
                .eq('id', id);
            console.log(`📝 [Scorer] Logged Score: Event ${id} -> ${result.score}`);
        }
    }
    
    return true;
}
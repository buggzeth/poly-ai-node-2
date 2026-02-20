// src/pipelines/scorer.ts
import { supabase } from '../db/supabase';
import { scoreEventsWithAI } from '../api/chaingpt';

// Returns true if it processed events, false if there are no more events to score
export async function runScoringPipeline(): Promise<boolean> {
    console.log(`\n🧠 Starting AI Scoring Pipeline...`);
    
    // Fetch 25 events where the score is NULL
    const { data: unscoredEvents } = await supabase
        .from('indexed_events')
        .select('id, event_data')
        .is('predictability_score', null)
        .limit(25);

    if (!unscoredEvents || unscoredEvents.length === 0) {
        console.log(`✅ All events currently have a predictability_score.`);
        return false; 
    }

    const promptInput = unscoredEvents.reduce((acc, row) => {
        acc[row.id] = { title: row.event_data.title };
        return acc;
    }, {} as Record<string, { title: string }>);

    const promptTemplate = `You are an expert forecasting AI... \n\nInput Events:\n${JSON.stringify(promptInput, null, 2)}`;
    
    console.log(`🤖 Sending ${unscoredEvents.length} events to ChainGPT...`);
    const scoredData = await scoreEventsWithAI(promptTemplate);

    for (const [id, result] of Object.entries(scoredData)) {
        if (result.score !== undefined) {
            // Saves the score to the new DB column
            await supabase
                .from('indexed_events')
                .update({ predictability_score: result.score })
                .eq('id', id);
            console.log(`📝 Saved Score: Event ${id} -> ${result.score}`);
        }
    }
    
    return true; // Indicates we did work, and there might be more
}
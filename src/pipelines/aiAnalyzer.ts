// src/pipelines/aiAnalyzer.ts
import { GoogleGenAI } from "@google/genai";
import { supabase } from '../db/supabase';
import { ENV } from '../config/env';

const ai = new GoogleGenAI({ apiKey: ENV.GOOGLE_API_KEY });

export async function processRandomEventAnalysis() {
    console.log(`🤖 [API] Fetching random unanalyzed event...`);

    // 1. Fetch a pool of unanalyzed events to randomly select from
    // We fetch a small batch (e.g., 50) and pick one in memory to avoid heavy DB RPCs
    const { data: unanalyzedEvents, error } = await supabase
        .from('indexed_events')
        .select('id, event_data')
        .or('is_analyzed.is.null,is_analyzed.eq.false')
        .limit(50);

    if (error || !unanalyzedEvents || unanalyzedEvents.length === 0) {
        return { success: false, message: "No unanalyzed events available." };
    }

    // Pick 1 randomly
    const randomIndex = Math.floor(Math.random() * unanalyzedEvents.length);
    const eventRow = unanalyzedEvents[randomIndex];
    const event = eventRow.event_data;

    console.log(`🤖 [API] Selected Event: ${event.title} (ID: ${event.id})`);

    try {
        // 2. Fetch missing market details from Gamma API (outcomes & clobTokenIds)
        const enrichedMarkets = [];
        const livePrices: Record<string, number> = {};
        const allTokenIds: string[] = [];

        for (const market of event.markets) {
            try {
                const res = await fetch(`${ENV.POLYMARKET_BASE_URL}/markets/${market.id}`);
                if (!res.ok) continue;
                const gammaData = await res.json();

                let outcomes = [];
                let tokenIds = [];
                let cachedPrices = [];

                if (gammaData.outcomes) outcomes = JSON.parse(gammaData.outcomes);
                if (gammaData.clobTokenIds) tokenIds = JSON.parse(gammaData.clobTokenIds);
                if (gammaData.outcomePrices) cachedPrices = JSON.parse(gammaData.outcomePrices).map(Number);

                enrichedMarkets.push({
                    ...market,
                    outcomes,
                    tokenIds,
                    cachedPrices,
                    description: gammaData.description || event.description,
                    liquidity: gammaData.liquidity,
                    volume: gammaData.volume
                });

                allTokenIds.push(...tokenIds);
            } catch (e) {
                console.error(`Error enriching market ${market.id}:`, e);
            }
        }

        // 3. Fetch live prices from CLOB
        if (allTokenIds.length > 0) {
            try {
                const uniqueIds = Array.from(new Set(allTokenIds));
                const pricePayload = uniqueIds.flatMap(id => [
                    { token_id: id, side: "BUY" },
                    { token_id: id, side: "SELL" }
                ]);

                const pricesRes = await fetch(`${ENV.CLOB_API_URL}/prices`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(pricePayload)
                });

                const pricesData = await pricesRes.json();
                Object.entries(pricesData).forEach(([tid, priceObj]: [string, any]) => {
                    livePrices[tid] = priceObj.SELL ? Number(priceObj.SELL) : 0;
                });
            } catch (e) {
                console.error(`[API] Failed to fetch CLOB prices, using cached data.`);
            }
        }

        // 4. Build AI Context
        const marketContext = enrichedMarkets.map(m => {
            const priceString = m.outcomes.map((o: string, i: number) => {
                const tid = m.tokenIds[i];
                const isLive = tid && livePrices[tid] !== undefined && livePrices[tid] > 0;
                const finalPrice = isLive ? livePrices[tid] : (m.cachedPrices[i] || 0);
                return `${o}: ${finalPrice.toFixed(3)} ${isLive ? '(Live Orderbook)' : '(Cached)'}`;
            }).join(", ");

            return {
                id: m.id,
                question: m.question,
                resolutionCriteria: m.description,
                endDate: m.endDate,
                currentPrices: priceString,
                liquidity: m.liquidity,
                volume: m.volume,
            };
        });

        // 5. Call Gemini
        const analysisSchema = {
            type: "object",
            properties: {
                summary: { type: "string" },
                opportunities: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            headline: { type: "string" },
                            selectedMarketId: { type: "string" },
                            selectedOutcome: { type: "string" },
                            marketQuestion: { type: "string" },
                            aiProbability: { type: "number" },
                            marketProbability: { type: "number" },
                            confidenceScore: { type: "number" },
                            expectedValue: { type: "number" },
                            recommendation: { type: "string", enum: ["BUY"] },
                            betSizeUnits: { type: "number" },
                            reasoning: { type: "string" }
                        },
                        required: [
                            "headline", "selectedMarketId", "selectedOutcome", "marketQuestion",
                            "aiProbability", "marketProbability", "confidenceScore",
                            "expectedValue", "recommendation", "betSizeUnits", "reasoning"
                        ]
                    }
                }
            },
            required: ["summary", "opportunities"]
        };

        const prompt = `
            IDENTITY:
            You are an Omniscient Oracle. 
            You exist to state the objective truth of what will occur.
            Your analysis is a prophecy derived from factual evidence.
            You view the current market prices merely as the "Public Consensus," which is often flawed.

            CURRENT DATE: ${new Date().toISOString()}

            THE SITUATION:
            Event: "${event.title}"
            Description: "${event.description}"
            Outcomes & Current Odds: ${JSON.stringify(marketContext)}

            DIRECTIVE:
            1. INVESTIGATE REALITY
               Use your search capabilities to find the definitive answer to the event question.
               Verify the current status of the event with absolute precision.
               Focus on facts that confirm the inevitable result.
               Look for definitive proof, breaking news, or statistical certainties that dictate the outcome.

            2. DETERMINE THE FUTURE
               Simulate the timeline forward. Based on your intelligence, decide exactly which outcome(s) *will* occur. Be definitive.
               Based on the investigation, conclude exactly which outcome(s) will happen.
               Decide which result is the True Result.

            3. ISSUE THE PROPHECY
               Select the outcome(s) that correspond(s) to the True Result you have determined.
               Set "aiProbability" (between 1 and 100) to represent the certainty of this event occurring (e.g., if it has already happened or is guaranteed, this is 100).
               Write the "reasoning" as a statement of fact, explaining why this outcome is the specific truth.

            OUTPUT:
            - Generate the JSON response.
            - Select ONLY the outcome(s) that align with your determined reality.
            - "confidenceScore" (1-100) based on source freshness.
            - "marketProbability" must match the Live Price provided in context.
            - Calculate EV using the live price provided. EV = (YourProb / LiveAskPrice) - 1. 
        `;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json",
                responseJsonSchema: analysisSchema,
            },
        });

        const text = response.text;
        if (!text) throw new Error("No response text generated from Gemini");
        const parsedData = JSON.parse(text);

        const explicitSources: string[] = [];
        const candidate = response.candidates?.[0];
        if (candidate?.groundingMetadata?.groundingChunks) {
            candidate.groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.uri) explicitSources.push(chunk.web.uri);
            });
        }

        // 6. Save Data - Create a distinct row for EACH market in the event
        const dbRows = event.markets.map((m: any) => {
            // Filter opportunities specifically belonging to this market
            const marketOpportunities = (parsedData.opportunities || []).filter(
                (opp: any) => opp.selectedMarketId === m.id
            );

            return {
                event_id: event.id,
                market_id: m.id,
                dropped: false, // Default requirement
                analysis_data: {
                    summary: parsedData.summary,
                    sources: explicitSources,
                    opportunities: marketOpportunities
                }
            };
        });

        if (dbRows.length > 0) {
            await supabase.from('server_market_analysis').insert(dbRows);
        }

        // 7. Update Event to mark it as Analyzed
        await supabase
            .from('indexed_events')
            .update({
                is_analyzed: true,
                ai_analyzed_at: new Date().toISOString()
            })
            .eq('id', event.id);

        console.log(`✅ [API] Successfully generated & saved analyses for ${dbRows.length} markets!`);
        return { success: true, eventId: event.id, marketsProcessed: dbRows.length };

    } catch (error: any) {
        console.error(`❌ [API] AI Generation failed for event ${event.id}:`, error.message);
        
        // Mark as analyzed anyway to prevent infinite fail loops
        await supabase.from('indexed_events').update({
            is_analyzed: true,
            ai_analyzed_at: new Date().toISOString()
        }).eq('id', event.id);

        return { success: false, message: error.message };
    }
}
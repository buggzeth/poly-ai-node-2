// src/utils/mappers.ts
import { PolymarketEvent } from '../types';

export function mapToEventData(rawEvent: any): PolymarketEvent {
    return {
        id: rawEvent.id,
        ticker: rawEvent.ticker || "",
        slug: rawEvent.slug || "",
        title: rawEvent.title || "",
        description: rawEvent.description || "",
        startDate: rawEvent.startDate,
        creationDate: rawEvent.creationDate,
        endDate: rawEvent.endDate,
        active: rawEvent.active,
        closed: rawEvent.closed,
        liquidity: Number(rawEvent.liquidity) || 0,
        volume: Number(rawEvent.volume) || 0,
        openInterest: Number(rawEvent.openInterest) || 0,
        markets: (rawEvent.markets || []).map((m: any) => ({
            id: m.id,
            question: m.question,
            conditionId: m.conditionId,
            endDate: m.endDate,
            active: m.active,
            closed: m.closed
            // Truncated for brevity, but map remaining fields here as in your original file
        }))
    };
}
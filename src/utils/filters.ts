// src/utils/filters.ts
import { PolymarketEvent } from '../types';

export function filterActiveEvents(events: any[]): PolymarketEvent[] {
    const now = Date.now();
    return events.map((event) => {
        const validMarkets = (event.markets || []).filter((market: any) => {
            if (market.closed) return false;
            if (!market.endDate) return false;
            return new Date(market.endDate).getTime() > now;
        });
        return { ...event, markets: validMarkets };
    }).filter((event) => {
        if (event.markets.length === 0) return false;
        if (event.closed) return false;
        if (event.endDate && new Date(event.endDate).getTime() <= now) return false;
        return true;
    }) as PolymarketEvent[];
}
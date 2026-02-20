// src/api/polymarket.ts
import axios from 'axios';
import { ENV } from '../config/env';

export async function fetchPolymarketEvents(offset: number): Promise<any[]> {
    const params = new URLSearchParams({
        limit: ENV.PAGE_LIMIT.toString(),
        offset: offset.toString(),
        active: "true",
        closed: "false",
        order: "createdAt",
        ascending: "false",
        end_date_min: new Date().toISOString()
    });

    const url = `${ENV.POLYMARKET_BASE_URL}/events?${params.toString()}`;
    
    const { data } = await axios.get(url, {
        headers: { "Accept": "application/json" }
    });

    return data || [];
}
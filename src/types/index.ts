// src/types/index.ts
export interface PolymarketMarket {
    id: string;
    question: string;
    conditionId: string;
    slug: string;
    resolutionSource: string;
    endDate: string;
    liquidity: string | number;
    startDate: string;
    image?: string;
    icon?: string;
    description?: string;
    outcomes: string;
    outcomePrices: string;
    volume: string | number;
    active: boolean;
    closed: boolean;
    marketMakerAddress?: string;
    clobTokenIds?: string;
}

export interface PolymarketEvent {
    id: string;
    ticker: string;
    slug: string;
    title: string;
    description: string;
    startDate: string;
    creationDate: string;
    endDate: string;
    image?: string;
    icon?: string;
    active: boolean;
    closed: boolean;
    liquidity: number;
    volume: number;
    openInterest: number;
    markets: PolymarketMarket[];
    tags?: { label: string; slug: string }[];
    cyom?: boolean;
}
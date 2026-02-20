// src/utils/helpers.ts
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function parseLLMJson(rawText: string): any {
    // Strips out potential markdown blocks that LLMs sometimes stubbornly return
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
}
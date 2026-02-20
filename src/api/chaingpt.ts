// src/api/chaingpt.ts
import { GeneralChat } from '@chaingpt/generalchat';
import { ENV } from '../config/env';
import { parseLLMJson } from '../utils/helpers';

const generalchat = new GeneralChat({ apiKey: ENV.CHAINGPT_API_KEY });

export async function scoreEventsWithAI(prompt: string): Promise<Record<string, { title: string, score: number }>> {
    try {
        const response = await generalchat.createChatBlob({
            question: prompt,
            chatHistory: "off",
            useCustomContext: false // Assuming you uploaded the .txt file to AI Hub
        });

        // The answer is stored in response.data.bot
        return parseLLMJson(response.data.bot);
    } catch (error: any) {
        console.error("ChainGPT API Error:", error.message);
        return {};
    }
}
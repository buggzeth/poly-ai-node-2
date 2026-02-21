// src/api/server.ts
import express from 'express';
import cors from 'cors';
import { ENV } from '../config/env';
import { processRandomEventAnalysis } from '../pipelines/aiAnalyzer';

export function startApiServer() {
    const app = express();
    app.use(express.json());

    // ⚠️ WIDE OPEN CORS: Allows any tool, script, or browser to call the API
    app.use(cors({
        origin: '*', 
        methods: ['GET', 'POST']
    }));

    // The unprotected testing endpoint (Accepts both GET and POST for easy testing)
    app.all('/api/analyze-random', async (req, res) => {
        console.log(`[API] 🧪 Test request received from IP: ${req.ip}`);
        
        try {
            const result = await processRandomEventAnalysis();
            
            if (result.success) {
                res.status(200).json(result);
            } else {
                res.status(500).json(result);
            }
        } catch (error: any) {
            console.error('[API] Unhandled Error:', error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    });

    app.listen(ENV.PORT, () => {
        console.log(`🌐 [Server] Test API listening on port ${ENV.PORT}`);
        console.log(`⚠️  [Server] DANGER: Security is DISABLED. Do not use in production!`);
    });
}
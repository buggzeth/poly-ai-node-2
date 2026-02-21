// src/api/server.ts
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { ENV } from '../config/env';
import { processRandomEventAnalysis } from '../pipelines/aiAnalyzer';

export function startApiServer() {
    const app = express();
    // Enable trust proxy if your Oracle VM is behind a load balancer, Cloudflare, or Nginx
    app.set('trust proxy', 1); 
    app.use(express.json());

    // ==========================================
    // LAYER 1: STRICT CORS (Blocks rogue websites)
    // ==========================================
    const allowedOrigins = ['https://nuke.farm', 'https://www.nuke.farm', 'http://localhost:3000'];
    app.use(cors({
        origin: function (origin, callback) {
            // If there is NO origin (like Postman), we let it through CORS 
            // BUT Layer 3 (Turnstile) will block it anyway.
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS blocked this request.'));
            }
        },
        methods: ['POST']
    }));

    // ==========================================
    // LAYER 2: IP RATE LIMITING (Blocks spamming)
    // ==========================================
    // Limit each IP to 3 AI generations per hour
    const aiLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, 
        message: { success: false, message: "Rate limit exceeded. Try again in an hour." },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // ==========================================
    // LAYER 3: BOT PROTECTION (Blocks Postman/Scripts)
    // ==========================================
    const verifyTurnstile = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const token = req.body.turnstileToken;

        if (!token) {
            return res.status(403).json({ success: false, message: "Human verification token missing." });
        }

        try {
            // Verify the token with Cloudflare's servers
            const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    secret: ENV.TURNSTILE_SECRET_KEY,
                    response: token,
                    remoteip: req.ip as string
                })
            });

            const outcome = await response.json();

            if (!outcome.success) {
                console.warn(`[API] 🚨 Bot Blocked! Failed Turnstile verification from IP: ${req.ip}`);
                return res.status(403).json({ success: false, message: "Bot verification failed." });
            }

            next(); // Token is valid, proceed!
        } catch (error) {
            console.error('[API] Turnstile Verification Error:', error);
            res.status(500).json({ success: false, message: "Verification server error." });
        }
    };

    // ==========================================
    // THE PROTECTED ENDPOINT
    // ==========================================
    // Order matters: Rate Limit -> Bot Verify -> Execute AI
    app.post('/api/analyze-random', aiLimiter, verifyTurnstile, async (req, res) => {
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
        console.log(`🌐 [Server] On-Demand API listening on port ${ENV.PORT}`);
        console.log(`🛡️  [Server] Secured with CORS, IP Rate Limiting, and Turnstile.`);
    });
}
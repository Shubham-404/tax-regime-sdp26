'use strict';

/**
 * explain.js — POST /api/explain route
 *
 * Pipeline:
 *  1. Validate input via Zod
 *  2. Compute deterministic tax numbers (old vs new)
 *  3. Query Chroma for top-5 relevant chunks
 *  4. Call Gemini with guarded prompt (ONLY use retrieved excerpts)
 *  5. Fire n8n webhook (non-blocking)
 *  6. Return structured JSON response
 */

const express = require('express');
const { z } = require('zod');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { compareTaxRegimes } = require('../taxCalc');
const { queryTopK } = require('../vectorStore');

const router = express.Router();

// ─── Input Schema ────────────────────────────────────────────────────────────
const DeductionsSchema = z.object({
    section80C: z.number().min(0).max(150_000).default(0),
    section80D: z.number().min(0).max(25_000).default(0),
    hra: z.number().min(0).default(0),
    other: z.number().min(0).default(0),
}).default({});

const ExplainSchema = z.object({
    salary: z.number().positive('Salary must be a positive number'),
    deductions: DeductionsSchema,
    query: z.string().max(500).optional(),
});

// Model preference: use GEMINI_MODEL from .env, or fall through the list
// Set GEMINI_MODEL=gemini-1.5-flash in .env if 2.0-flash quota is unavailable
const GEMINI_MODELS = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL, 'gemini-1.5-flash', 'gemini-1.5-pro']
    : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];

/** Sleep for ms milliseconds */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the suggested retry delay (seconds) from a 429 error message.
 * Falls back to defaultSec if not found.
 */
function parseRetryDelay(errMsg, defaultSec = 10) {
    const match = errMsg?.match(/retry in ([\d.]+)s/i);
    return match ? Math.ceil(parseFloat(match[1])) * 1000 : defaultSec * 1000;
}

async function callGemini(taxNumbers, chunks, userQuery) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const excerpts = chunks
        .map((c, i) =>
            `[Excerpt ${i + 1}] (Source: ${c.metadata?.file || 'unknown'}, Page: ${c.metadata?.page || '?'})\n${c.text}`
        )
        .join('\n\n---\n\n');

    const prompt = `You are an Indian tax assistant. Answer ONLY using the excerpts provided below.
If you cannot find the answer in the excerpts, respond with "I cannot confirm this based on the provided documents."
Do NOT use any external knowledge or make assumptions beyond what the excerpts state.

=== TAX COMPUTATION (deterministic) ===
Old Regime:
  Taxable Income: ₹${taxNumbers.old.taxableIncome.toLocaleString('en-IN')}
  Total Tax:      ₹${taxNumbers.old.totalTax.toLocaleString('en-IN')}
  Effective Rate: ${taxNumbers.old.effectiveRate}%

New Regime (FY 2024-25):
  Taxable Income: ₹${taxNumbers.new.taxableIncome.toLocaleString('en-IN')}
  Total Tax:      ₹${taxNumbers.new.totalTax.toLocaleString('en-IN')}
  Effective Rate: ${taxNumbers.new.effectiveRate}%

Recommendation: ${taxNumbers.recommendation}

=== RETRIEVED TAX LAW EXCERPTS ===
${excerpts || 'No excerpts available — answer only from the deterministic tax numbers above.'}

=== USER QUESTION ===
${userQuery || 'Which tax regime is better for me and why?'}

=== YOUR TASK ===
1. Confirm or elaborate on the regime recommendation using the excerpts above.
2. Provide 3-5 bullet points of actionable tax-saving tips (cite the excerpt number for each tip if applicable).
3. Note any key conditions or caveats.
Keep the response concise and in plain English.`;

    // Try each model in order, retry on 429 once per model
    let lastErr;
    for (const modelName of GEMINI_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                console.log(`[gemini] ✅ responded with ${modelName}`);
                return result.response.text();
            } catch (err) {
                lastErr = err;
                const is429 = err.message?.includes('429') || err.status === 429;
                if (is429 && attempt === 0) {
                    const delay = parseRetryDelay(err.message);
                    console.warn(`[gemini] 429 on ${modelName}, retrying in ${delay}ms…`);
                    await sleep(delay);
                    continue; // retry same model once
                }
                // Not 429 or second attempt failed — try next model
                console.warn(`[gemini] ${modelName} failed (${err.message?.slice(0, 60)})`);
                break;
            }
        }
    }
    throw lastErr; // all models exhausted
}

// ─── Webhook helper (non-blocking) ──────────────────────────────────────────
function fireWebhook(payload) {
    const url = process.env.N8N_WEBHOOK_URL;
    if (!url || url === 'http://localhost:5678/webhook/tax-report') return; // skip if not configured

    axios.post(url, payload, { timeout: 10_000 })
        .then(() => console.log('[webhook] n8n notified'))
        .catch((err) => console.warn('[webhook] n8n error:', err.message));
}

// ─── Route Handler ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    // 1. Validate input
    const parsed = ExplainSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid input',
            details: parsed.error.flatten().fieldErrors,
        });
    }

    const { salary, deductions, query } = parsed.data;

    try {
        // 2. Compute deterministic tax numbers
        const taxNumbers = compareTaxRegimes(salary, deductions);

        // 3. Retrieve top-5 RAG chunks
        const userQuery = query || `tax regime comparison for salary ${salary}`;
        let chunks = [];
        try {
            chunks = await queryTopK(userQuery, 5);
        } catch (ragErr) {
            console.warn('[rag] Chroma query failed (continuing without RAG):', ragErr.message);
            // Graceful degradation: proceed without RAG chunks
        }

        // 4. Call Gemini with guarded prompt
        let aiSummary = null;
        let bullets = [];
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            try {
                aiSummary = await callGemini(taxNumbers, chunks, query);
                // Extract bullet points from response
                bullets = aiSummary
                    .split('\n')
                    .filter(line => line.trim().match(/^[-•*\d]/))
                    .map(line => line.replace(/^[-•*\d.]+\s*/, '').trim())
                    .filter(Boolean);
            } catch (aiErr) {
                console.error('[gemini] API call failed:', aiErr.message, aiErr.status || '');
                aiSummary = `AI summary unavailable (${aiErr.message?.slice(0, 80)}). Tax numbers above are deterministic.`;
            }
        } else {
            aiSummary = 'Set GEMINI_API_KEY in .env to enable AI-powered explanations.';
        }

        // 5. Build response
        const sources = chunks.map(c => ({
            file: c.metadata?.file || 'unknown',
            page: c.metadata?.page || null,
            chunk_id: c.metadata?.chunk_id ?? null,
            excerpt: c.text?.slice(0, 150) + (c.text?.length > 150 ? '...' : ''),
        }));

        const response = {
            verdict: taxNumbers.betterRegime,
            recommendation: taxNumbers.recommendation,
            taxNumbers: {
                old: {
                    taxableIncome: taxNumbers.old.taxableIncome,
                    totalTax: taxNumbers.old.totalTax,
                    effectiveRate: taxNumbers.old.effectiveRate,
                    totalDeductions: taxNumbers.old.totalDeductions,
                },
                new: {
                    taxableIncome: taxNumbers.new.taxableIncome,
                    totalTax: taxNumbers.new.totalTax,
                    effectiveRate: taxNumbers.new.effectiveRate,
                    totalDeductions: taxNumbers.new.totalDeductions,
                },
            },
            savings: Math.abs(taxNumbers.savings),
            aiSummary,
            bullets,
            sources,
            timestamp: new Date().toISOString(),
        };

        // 6. Fire n8n webhook (fire-and-forget)
        fireWebhook({
            salary,
            deductions,
            verdict: response.verdict,
            recommendation: response.recommendation,
            taxNumbers: response.taxNumbers,
            savings: response.savings,
            timestamp: response.timestamp,
        });

        return res.json(response);
    } catch (err) {
        console.error('[/api/explain] Error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

module.exports = router;

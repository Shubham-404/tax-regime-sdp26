'use strict';

/**
 * Integration test for POST /api/explain
 *
 * Mocks:
 *   - chromadb (vectorStore) → returns 2 dummy chunks
 *   - @google/generative-ai → returns a canned summary
 *   - axios (n8n webhook) → no-op
 *
 * This test runs without Chroma, Gemini, or n8n being active.
 */

// ─── Mock external dependencies BEFORE requiring server ──────────────────────
jest.mock('../src/vectorStore', () => ({
    queryTopK: jest.fn().mockResolvedValue([
        {
            text: 'Under Section 80C, you can claim deductions up to ₹1,50,000 on investments such as PPF, ELSS, and life insurance premiums.',
            metadata: { file: 'income_tax_guide.pdf', page: 1, chunk_id: 0 },
            distance: 0.12,
        },
        {
            text: 'The New Tax Regime in FY 2024-25 offers a standard deduction of ₹75,000 for salaried individuals.',
            metadata: { file: 'income_tax_guide.pdf', page: 2, chunk_id: 3 },
            distance: 0.18,
        },
    ]),
}));

jest.mock('@google/generative-ai', () => {
    const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
            text: () =>
                'Based on the excerpts, the New Regime is beneficial at higher incomes.\n- Consider investing in 80C instruments for Old Regime\n- New Regime standard deduction is ₹75,000',
        },
    });
    const mockEmbedContent = jest.fn().mockResolvedValue({
        embedding: { values: new Array(768).fill(0.1) },
    });
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
            getGenerativeModel: jest.fn().mockReturnValue({
                generateContent: mockGenerateContent,
                embedContent: mockEmbedContent,
            }),
        })),
    };
});

jest.mock('axios', () => ({
    post: jest.fn().mockResolvedValue({ status: 200 }),
}));

// ─── Set up env vars ──────────────────────────────────────────────────────────
process.env.GEMINI_API_KEY = 'test-key-12345';
process.env.CHROMA_HOST = 'http://localhost:8000';
process.env.N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/test';

const request = require('supertest');
const app = require('../server');

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/explain', () => {

    const validPayload = {
        salary: 1200000,
        deductions: {
            section80C: 150000,
            section80D: 25000,
            hra: 60000,
            other: 0,
        },
        query: 'Which regime is better for me?',
    };

    test('returns 200 with required fields for a valid payload', async () => {
        const res = await request(app)
            .post('/api/explain')
            .send(validPayload)
            .set('Content-Type', 'application/json');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('verdict');
        expect(res.body).toHaveProperty('recommendation');
        expect(res.body).toHaveProperty('taxNumbers');
        expect(res.body).toHaveProperty('taxNumbers.old');
        expect(res.body).toHaveProperty('taxNumbers.new');
        expect(res.body).toHaveProperty('savings');
        expect(res.body).toHaveProperty('aiSummary');
        expect(res.body).toHaveProperty('sources');
        expect(res.body).toHaveProperty('timestamp');
        expect(Array.isArray(res.body.sources)).toBe(true);
    });

    test('verdict is one of: old, new, equal', async () => {
        const res = await request(app).post('/api/explain').send(validPayload);
        expect(['old', 'new', 'equal']).toContain(res.body.verdict);
    });

    test('taxNumbers.old.totalTax is a non-negative number', async () => {
        const res = await request(app).post('/api/explain').send(validPayload);
        expect(typeof res.body.taxNumbers.old.totalTax).toBe('number');
        expect(res.body.taxNumbers.old.totalTax).toBeGreaterThanOrEqual(0);
    });

    test('taxNumbers.new.totalTax is a non-negative number', async () => {
        const res = await request(app).post('/api/explain').send(validPayload);
        expect(typeof res.body.taxNumbers.new.totalTax).toBe('number');
        expect(res.body.taxNumbers.new.totalTax).toBeGreaterThanOrEqual(0);
    });

    test('sources include metadata file and page', async () => {
        const res = await request(app).post('/api/explain').send(validPayload);
        expect(res.body.sources.length).toBeGreaterThan(0);
        const src = res.body.sources[0];
        expect(src).toHaveProperty('file');
        expect(src).toHaveProperty('page');
        expect(src).toHaveProperty('excerpt');
    });

    test('returns 400 for missing salary', async () => {
        const res = await request(app)
            .post('/api/explain')
            .send({ deductions: {} })
            .set('Content-Type', 'application/json');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    test('returns 400 for negative salary', async () => {
        const res = await request(app)
            .post('/api/explain')
            .send({ salary: -1, deductions: {} });
        expect(res.status).toBe(400);
    });

    test('works without a query field', async () => {
        const res = await request(app)
            .post('/api/explain')
            .send({ salary: 800000, deductions: {} });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('verdict');
    });
});

describe('GET /api/health', () => {
    test('returns 200 with status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('env');
    });
});

'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const explainRouter = require('./src/routes/explain');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Ensure upload directory exists ─────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// File upload (optional doc uploads — stored in ./uploads/)
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}_${safe}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'));
    },
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/explain', explainRouter);

// File upload endpoint (optional; for user-supplied PDFs)
app.post('/api/upload', upload.single('document'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
        message: 'File uploaded successfully. Run "npm run ingest" to index it.',
        filename: req.file.filename,
        size: req.file.size,
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: {
            gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here',
            chroma: process.env.CHROMA_HOST || 'http://localhost:8000',
            n8n: !!process.env.N8N_WEBHOOK_URL,
        },
    });
});

// SPA fallback — serve index.html for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[server] Unhandled error:', err.message);
    res.status(500).json({ error: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Tax Regime Explainer running at http://localhost:${PORT}`);
    console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing (set GEMINI_API_KEY)'}`);
    console.log(`   Chroma:     ${process.env.CHROMA_HOST || 'http://localhost:8000'}`);
    console.log(`   n8n:        ${process.env.N8N_WEBHOOK_URL || 'not configured'}\n`);
});

module.exports = app; // export for testing

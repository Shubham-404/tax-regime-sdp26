'use strict';

/**
 * ingest_pdfs.js — PDF ingestion script
 *
 * Reads all PDFs from ./pdfs/, chunks them at ~500 tokens (≈2000 chars)
 * with 200-char overlap, embeds each chunk via Gemini, and upserts into
 * the local Chroma "tax_docs" collection.
 *
 * Usage:
 *   node ingest_pdfs.js
 *   node ingest_pdfs.js --dir ./custom_pdfs
 *
 * Prerequisites:
 *   - Chroma running: chroma run --path ./chroma_data
 *   - GEMINI_API_KEY set in .env
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ChromaClient } = require('chromadb');
require('dotenv').config();

// ─── Configuration ──────────────────────────────────────────────────────────
const CHUNK_SIZE = 2000;    // characters (~500 tokens)
const CHUNK_OVERLAP = 200;  // characters
const COLLECTION_NAME = 'tax_docs';
const PDF_DIR = process.argv.includes('--dir')
    ? process.argv[process.argv.indexOf('--dir') + 1]
    : path.join(__dirname, 'pdfs');

// ─── Chroma & Gemini clients ─────────────────────────────────────────────────
const chromaClient = new ChromaClient({ path: process.env.CHROMA_HOST || 'http://localhost:8000' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Splits text into overlapping chunks.
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {Array<{text: string, index: number}>}
 */
function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    let start = 0;
    let idx = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end).trim();
        if (chunk.length > 50) { // skip tiny chunks
            chunks.push({ text: chunk, index: idx++ });
        }
        if (end === text.length) break;
        start += chunkSize - overlap;
    }

    return chunks;
}

/**
 * Embeds a single text string via Gemini.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
}

/**
 * Processes a single PDF file: parse → chunk → embed → upsert.
 * @param {string} filePath
 * @param {object} collection  Chroma collection object
 */
async function processPdf(filePath, collection) {
    const fileName = path.basename(filePath);
    console.log(`\n📄 Processing: ${fileName}`);

    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    const fullText = parsed.text.replace(/\s+/g, ' ').trim();
    const pageCount = parsed.numpages;

    console.log(`   Pages: ${pageCount}, Characters: ${fullText.length}`);

    const chunks = splitIntoChunks(fullText);
    console.log(`   Chunks: ${chunks.length}`);

    // Process in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5;
    for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
        const batch = chunks.slice(b, b + BATCH_SIZE);

        const ids = [];
        const embeddings = [];
        const documents = [];
        const metadatas = [];

        for (const chunk of batch) {
            const chunkId = `${fileName}_chunk_${chunk.index}`;
            // Estimate page number based on character position
            const charPos = fullText.indexOf(chunk.text.slice(0, 50));
            const estimatedPage = charPos > 0
                ? Math.ceil((charPos / fullText.length) * pageCount)
                : 1;

            const embedding = await embed(chunk.text);

            ids.push(chunkId);
            embeddings.push(embedding);
            documents.push(chunk.text);
            metadatas.push({
                file: fileName,
                page: estimatedPage,
                chunk_id: chunk.index,
                total_chunks: chunks.length,
            });

            process.stdout.write('.');
        }

        await collection.upsert({ ids, embeddings, documents, metadatas });
    }

    console.log(`\n   ✅ ${fileName} ingested successfully`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Tax PDF Ingestion Script');
    console.log('============================');
    console.log(`📁 PDF directory: ${PDF_DIR}`);
    console.log(`🌐 Chroma host:   ${process.env.CHROMA_HOST || 'http://localhost:8000'}`);

    if (!fs.existsSync(PDF_DIR)) {
        console.error(`\n❌ PDF directory not found: ${PDF_DIR}`);
        console.error('   Create it and add PDF files, then re-run.');
        process.exit(1);
    }

    const pdfFiles = fs.readdirSync(PDF_DIR)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => path.join(PDF_DIR, f));

    if (pdfFiles.length === 0) {
        console.error('\n❌ No PDF files found in', PDF_DIR);
        process.exit(1);
    }

    console.log(`\n📚 Found ${pdfFiles.length} PDF(s):`, pdfFiles.map(f => path.basename(f)).join(', '));

    // Get or create Chroma collection
    const collection = await chromaClient.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { 'hnsw:space': 'cosine' },
    });
    console.log(`\n🗂️  Chroma collection: "${COLLECTION_NAME}"`);

    const startTime = Date.now();

    for (const pdfFile of pdfFiles) {
        await processPdf(pdfFile, collection);
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const count = await collection.count();

    console.log('\n============================');
    console.log(`✅ Ingestion complete in ${durationSec}s`);
    console.log(`   Total chunks in collection: ${count}`);
    console.log('\nYou can now start the server: npm run dev');
}

main().catch((err) => {
    console.error('\n❌ Fatal error:', err.message || err);
    process.exit(1);
});

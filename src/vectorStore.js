'use strict';

/**
 * vectorStore.js — Chroma vector store helper
 *
 * Provides:
 *  - getCollection()   : ensures the Chroma collection exists
 *  - queryTopK(text, k): queries top-k chunks with metadata
 *
 * Embeddings are generated via Gemini embedding-001 model.
 */

const { ChromaClient } = require('chromadb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const COLLECTION_NAME = 'tax_docs';

let _client = null;
let _collection = null;

function getClient() {
    if (!_client) {
        _client = new ChromaClient({ path: process.env.CHROMA_HOST || 'http://localhost:8000' });
    }
    return _client;
}

async function getCollection() {
    if (_collection) return _collection;
    const client = getClient();
    _collection = await client.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: { 'hnsw:space': 'cosine' },
    });
    return _collection;
}

/**
 * Generates an embedding vector for the given text using Gemini.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedText(text) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

/**
 * Queries the Chroma collection for the top-k most relevant chunks.
 *
 * @param {string} queryText  The user's question / context
 * @param {number} [k=5]      Number of chunks to retrieve
 * @returns {Promise<Array<{ text: string, metadata: object, distance: number }>>}
 */
async function queryTopK(queryText, k = 5) {
    const collection = await getCollection();
    const queryEmbedding = await embedText(queryText);

    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: k,
        include: ['documents', 'metadatas', 'distances'],
    });

    const chunks = [];
    const docs = results.documents?.[0] || [];
    const metas = results.metadatas?.[0] || [];
    const dists = results.distances?.[0] || [];

    for (let i = 0; i < docs.length; i++) {
        chunks.push({
            text: docs[i],
            metadata: metas[i] || {},
            distance: dists[i] ?? null,
        });
    }

    return chunks;
}

module.exports = { getCollection, embedText, queryTopK };

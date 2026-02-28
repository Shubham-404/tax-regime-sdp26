# TaxClarity — Simple Tax Regime Explainer

> **⚡ Instantly compare Indian Old vs New tax regimes (FY 2024-25) with AI-powered explanations backed by official law documents.**

[![Node.js](https://img.shields.io/badge/Node-20.x-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-blue)](https://tailwindcss.com)

---

## Architecture Overview

```
Browser (HTML + Tailwind + Alpine.js + GSAP)
    │
    ▼ POST /api/explain
Express Server (Node 20)
    ├── Zod validation
    ├── taxCalc.js          ← deterministic Old & New regime computation
    ├── vectorStore.js      ← Chroma RAG query (top-5 chunks)
    ├── Gemini Flash        ← guarded prompt, returns summary + bullets
    └── n8n webhook         ← fires report to n8n (non-blocking)
             │
             ▼
         n8n Workflow
             ├── Format HTML report
             ├── Save PDF to ./reports/
             └── (optional) Send email
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| npm | 10.x | bundled with Node |
| Python | 3.8+ | [python.org](https://python.org) |
| chromadb (Python) | latest | `pip install chromadb` |
| n8n | latest | `npm install -g n8n` |

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd nora-ai
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | Get free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `CHROMA_HOST` | ✅ Yes | Default: `http://localhost:8000` |
| `PORT` | No | Default: `3000` |
| `N8N_WEBHOOK_URL` | No | Set after importing n8n workflow |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | For Google Drive (optional) |
| `SMTP_*` | No | For email reports (optional) |

> **Security**: The `.env` file is git-ignored. Never commit it. After your demo, revoke your Gemini API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

### 3. Start Chroma vector database

```bash
# Install (one-time)
pip install chromadb

# Start Chroma server
chroma run --path ./chroma_data
```

Chroma will listen on `http://localhost:8000` by default.

### 4. Generate sample PDFs

```bash
# Install pdfkit (one-time, optional — fallback writes .txt)
npm install pdfkit

# Generate synthetic tax law PDFs into ./pdfs/
node generate_sample_pdf.js
```

> If you have your own tax PDFs, place them in the `./pdfs/` folder.

### 5. Ingest PDFs into Chroma

```bash
npm run ingest
# or: node ingest_pdfs.js
# or: node ingest_pdfs.js --dir ./my_custom_pdfs
```

Example output:
```
📄 Processing: income_tax_guide.pdf
   Pages: 3, Characters: 4821
   Chunks: 4
....
   ✅ income_tax_guide.pdf ingested successfully

✅ Ingestion complete in 12.4s
   Total chunks in collection: 8
```

### 6. Run the development server

```bash
npm run dev
```

Open your browser at **[http://localhost:3000](http://localhost:3000)**

---

## Running Tests

```bash
npm test
```

Expected output:
```
PASS tests/taxCalc.test.js          (unit — 5 tests)
PASS tests/explain.integration.test.js  (integration — 8 tests)

Test Suites: 2 passed, 2 passed
Tests:       13 passed, 13 total
```

> Integration tests mock Chroma and Gemini — **no API key or running server needed**.

---

## API Reference

### `POST /api/explain`

**Request body:**
```json
{
  "salary": 1200000,
  "deductions": {
    "section80C": 150000,
    "section80D": 25000,
    "hra": 60000,
    "other": 0
  },
  "query": "Which regime is better for me?"
}
```

**Response:**
```json
{
  "verdict": "new",
  "recommendation": "New Regime saves ₹12,480 more.",
  "taxNumbers": {
    "old": { "taxableIncome": 915000, "totalTax": 120432, "effectiveRate": 10.04 },
    "new": { "taxableIncome": 1125000, "totalTax": 107952, "effectiveRate": 8.99 }
  },
  "savings": 12480,
  "aiSummary": "...",
  "bullets": ["...", "..."],
  "sources": [{ "file": "income_tax_guide.pdf", "page": 2, "chunk_id": 3, "excerpt": "..." }],
  "timestamp": "2026-02-27T..."
}
```

### `GET /api/health`

Returns server status, Gemini key presence, and Chroma URL.

### `POST /api/upload`

Uploads a PDF for later ingestion (`multipart/form-data`, field: `document`).

---

## n8n Workflow Setup

1. Install and start n8n:
   ```bash
   npx n8n
   # or: npm install -g n8n && n8n
   ```

2. Open n8n at [http://localhost:5678](http://localhost:5678)

3. Import the workflow:
   - Go to **Workflows → Import from file**
   - Select `n8n_workflow.json`

4. Activate the workflow and copy the Webhook URL (e.g. `http://localhost:5678/webhook/tax-report`)

5. Set it in `.env`:
   ```
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/tax-report
   ```

6. Any `/api/explain` call will now trigger a report saved in `./reports/`

### Optional: Email Reports

1. In n8n, open the **Send Email (Optional)** node and enable it
2. Add SMTP credentials under **n8n → Settings → Credentials**
3. Set `SMTP_FROM` and `SMTP_TO` in n8n's environment variables

> **Revoking SMTP credentials**: Delete the credential entry in n8n → Settings → Credentials, and revoke app passwords from your email provider.

---

## Demo Script

With the server running, fire all sample payloads:

```bash
node demo.js
```

Or a specific scenario (0-indexed):
```bash
node demo.js --scenario 1
```

Or against a custom URL:
```bash
node demo.js --url http://localhost:3000
```

---

## Manual API Test (curl)

```bash
curl -X POST http://localhost:3000/api/explain \
  -H "Content-Type: application/json" \
  -d @samples/payload_sample.json
```

> Note: `payload_sample.json` is an array — use `jq` to extract one object:
> ```bash
> curl -X POST http://localhost:3000/api/explain \
>   -H "Content-Type: application/json" \
>   -d "$(node -e 'const s=require(\"./samples/payload_sample.json\"); console.log(JSON.stringify(s[1]))')"
> ```

---

## Project Structure

```
nora-ai/
├── public/
│   └── index.html              # Frontend UI (Tailwind + Alpine.js + GSAP)
├── src/
│   ├── taxCalc.js              # Deterministic tax calculator
│   ├── vectorStore.js          # Chroma RAG helper
│   └── routes/
│       └── explain.js          # POST /api/explain handler
├── tests/
│   ├── taxCalc.test.js         # Unit tests (Jest)
│   └── explain.integration.test.js  # Integration tests (Supertest)
├── pdfs/                       # Tax PDFs for ingestion
├── samples/
│   └── payload_sample.json     # 3 sample API payloads
├── reports/                    # Generated reports (git-ignored)
├── chroma_data/                # Chroma persistence (git-ignored)
├── uploads/                    # User-uploaded PDFs (git-ignored)
├── server.js                   # Express entry point
├── ingest_pdfs.js              # PDF ingestion CLI
├── generate_sample_pdf.js      # Synthetic PDF generator
├── demo.js                     # Local demo script
├── n8n_workflow.json           # n8n workflow export
├── .env.example                # Environment variable template
└── README.md
```

---

## Security Notes

- API keys live only in `.env` (git-ignored). Never hardcode them.
- Gemini is called with a **guarded prompt**: the model is instructed to respond "I cannot confirm" if the answer is not in the provided excerpts.
- File uploads are restricted to PDFs and limited to 10 MB.
- Webhook fires are non-blocking and fail silently to prevent API response delays.

### Revoking Credentials After Demo

| Credential | How to Revoke |
|-----------|--------------|
| Gemini API Key | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → Delete key |
| Google Drive Service Account | [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → Delete |
| SMTP App Password | Your email provider → App passwords → Revoke |

---

## License

MIT — For educational and demo purposes only. Tax calculations are approximate; consult a CA for financial advice.

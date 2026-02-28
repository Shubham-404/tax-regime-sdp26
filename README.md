# TaxClarity — Simple Tax Regime Explainer

> **In plain English:** You type your salary. The app tells you which Indian tax regime (Old or New) saves you more money, explains WHY using real law documents, and generates a PDF report — all in under 10 seconds.

---

## The Problem This Solves

Every salaried Indian has to choose between two tax regimes each year:

| | Old Regime | New Regime |
|---|---|---|
| **Key benefit** | Allows deductions (80C, HRA, etc.) | Lower, simpler slab rates |
| **Who wins** | People with high deductions (PPF, insurance, HRA) | People with few deductions or high salary |
| **Risk** | Choosing wrong = paying more tax | |

**Example — Anjali, ₹12 lakh salary:**
- Old Regime tax = ₹99,320 (after her deductions)
- New Regime tax = ₹71,500
- **She was filing Old Regime. She was losing ₹27,820 every year.**

TaxClarity catches this in 7 seconds.

---

## What Happens When You Submit the Form (Step-by-Step)

Think of it like an assembly line:

```
You fill the form and click "Analyze"
         │
         ▼
① Server receives your salary + deductions
         │
         ▼
② Tax Calculator crunches numbers (no AI, pure math)
   → Old Regime tax: ₹99,320
   → New Regime tax: ₹71,500
         │
         ▼
③ Vector Search finds the 5 most relevant paragraphs
  from the tax law PDFs we indexed (like a smart Ctrl+F)
         │
         ▼
④ Gemini AI reads those 5 paragraphs + your numbers
  and writes a plain-English explanation
  (Rule: "Only answer from the documents. Say 'I cannot confirm'
   if the answer isn't there.")
         │
         ▼
⑤ Results shown on screen with:
   - Verdict (which regime wins)
   - Tax comparison table
   - AI explanation + bullet tips
   - Source citations (which PDF, which page)
         │
         ▼
⑥ In the background: n8n generates a PDF report and saves it
```

---

## Project Structure — What Every File Does

```
nora-ai/
│
├── server.js                   ← START HERE. Runs the web server on port 3000.
│
├── public/
│   └── index.html              ← The webpage you see in the browser.
│                                 (HTML + CSS + JavaScript, all in one file)
│
├── src/
│   ├── taxCalc.js              ← Pure math. No AI. Computes exact tax rupees
│   │                             for Old Regime and New Regime.
│   │
│   ├── vectorStore.js          ← Talks to Chroma DB. Converts text to numbers
│   │                             (vectors) so we can search by meaning, not words.
│   │
│   └── routes/
│       └── explain.js          ← The brain of the API. Runs steps ①–⑥ above.
│                                 Validates input → tax math → RAG search → Gemini → n8n.
│
├── ingest_pdfs.js              ← ONE-TIME SETUP script. Reads your tax PDFs,
│                                 splits them into chunks, and stores them in Chroma.
│                                 Run once. Then forget about it.
│
├── generate_sample_pdf.js      ← Creates fake (but realistic) tax law PDFs
│                                 in the ./pdfs/ folder for demo purposes.
│
├── demo.js                     ← Fires 3 sample API requests and prints
│                                 colorized results in the terminal. Great for demos.
│
├── n8n_workflow.json           ← The automated report generator. Import this
│                                 into n8n. It receives webhook → saves PDF report.
│
├── tests/
│   ├── taxCalc.test.js         ← Tests for the tax calculator (no internet needed).
│   │                             Checks: zero income, ₹7L, ₹15L, slab boundaries.
│   │
│   └── explain.integration.test.js  ← Tests for the full API endpoint.
│                                       Mocks Chroma + Gemini so tests run offline.
│
├── pdfs/                       ← Put your tax PDF files here before running ingest.
├── samples/
│   └── payload_sample.json     ← 3 example API requests to test with.
├── reports/                    ← n8n saves PDF reports here automatically.
├── chroma_data/                ← Chroma's database files (auto-created).
├── uploads/                    ← User-uploaded PDFs (auto-created).
│
├── .env                        ← Your secret keys. NEVER commit this to git.
├── .env.example                ← Template showing all variables needed.
├── .gitignore                  ← Tells git to ignore .env, node_modules, etc.
└── package.json                ← Lists all npm packages the project needs.
```

---

## What is RAG? (Simple Explanation)

**RAG = Retrieval-Augmented Generation**

Imagine you ask a friend: *"Can I claim my gym membership under 80D?"*
- A **bad AI** makes up an answer from what it vaguely remembers.
- A **good lawyer** opens the law book, finds Section 80D, reads it, and quotes you the exact rule.

RAG teaches the AI to be the good lawyer:
1. We store the actual tax law documents in a searchable database (Chroma).
2. When you ask a question, we find the 5 most relevant paragraphs first.
3. We hand those paragraphs to Gemini and say: *"answer only from these."*
4. Gemini can only say what the documents say — or "I cannot confirm this."

This means **zero hallucinations** about tax law. Every AI statement is backed by a specific paragraph you can see.

---

## What is Chroma? (Simple Explanation)

Normal databases search by **exact keywords** — like `grep` or Ctrl+F.

Chroma searches by **meaning**. It converts text into a list of 3072 numbers (a "vector") that represents its meaning mathematically. Two texts that mean similar things will have similar numbers, even if they use different words.

Example:
- *"You can deduct medical insurance premium"* and *"Health cover payments qualify for tax benefit"* → Chroma knows these mean the same thing, even though they share no words.

When you ask a question, we convert your question to numbers, then Chroma finds the paragraphs whose numbers are closest. This is the search in step ③ above.

---

## Environment Variables (`.env` file)

Copy `.env.example` to `.env` and fill in:

| Variable | What it is | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Key to call the Gemini AI API | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — free |
| `GEMINI_MODEL` | Which Gemini model to use | Leave as `gemini-1.5-flash` (most reliable) |
| `CHROMA_HOST` | Where Chroma DB is running | Default: `http://localhost:8000` — don't change |
| `PORT` | Port for the web server | Default: `3000` — don't change |
| `N8N_WEBHOOK_URL` | Where to send PDF report request | Get from n8n after importing workflow |

Optional (for email reports):
```
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO
```

---

## Complete Setup (Do These Once)

### Prerequisites

Install these before anything else:

```bash
# 1. Node.js 20+ (the JavaScript runtime)
# Download from: https://nodejs.org

# 2. Python 3.8+ (Chroma needs it)
# Download from: https://python.org

# 3. Chroma (the vector database)
pip install chromadb
```

### First-Time Setup

```bash
# Clone/navigate to the project
cd d:\nora-ai

# Install all Node packages
npm install --legacy-peer-deps

# Copy the env template and fill in your keys
copy .env.example .env
# → Open .env in any editor and set GEMINI_API_KEY

# Generate sample tax PDFs (for demo)
node generate_sample_pdf.js
# → Creates income_tax_guide.pdf and tax_comparison_guide.pdf in ./pdfs/
```

---

## Commands to Start the Project

These are the **4 terminals** you need. Open them in this order:

### Terminal 1 — Start Chroma (the database)
```bash
chroma run --path ./chroma_data
```
✅ You'll see: `Chroma server listening on http://localhost:8000`  
⚠️ Keep this running. Don't close it.

### Terminal 2 — Ingest PDFs (ONE-TIME ONLY)
```bash
cd d:\nora-ai
npm run ingest
```
✅ You'll see each PDF processed with dots (one dot = one chunk embedded).  
✅ At the end: `Ingestion complete in X seconds. Total chunks: 4`  
ℹ️ You only run this once (or again if you add new PDFs).

### Terminal 3 — Start the Web Server
```bash
cd d:\nora-ai
npm run dev
# or: node server.js
```
✅ You'll see:
```
🚀 Tax Regime Explainer running at http://localhost:3000
   Gemini API: ✅ configured
   Chroma:     http://localhost:8000
```
⚠️ Keep this running. Open http://localhost:3000 in your browser.

### Terminal 4 — Run the Demo Script (optional)
```bash
cd d:\nora-ai
node demo.js
```
✅ Fires 3 sample salary scenarios and prints colorized tax results.

---

## Run Tests

```bash
npm test
```
Expected output:
```
PASS  tests/taxCalc.test.js
PASS  tests/explain.integration.test.js

Tests: 19 passed, 19 total
Time:  ~3 seconds
```
> Tests run fully offline — no Gemini key or Chroma needed.

---

## API — Try It Manually

```bash
curl -X POST http://localhost:3000/api/explain ^
  -H "Content-Type: application/json" ^
  -d "{\"salary\": 1200000, \"deductions\": {\"section80C\": 150000, \"section80D\": 25000, \"hra\": 60000}}"
```

What comes back:
```json
{
  "verdict": "new",
  "recommendation": "New Regime saves ₹27,820 more.",
  "taxNumbers": {
    "old": { "taxableIncome": 915000, "totalTax": 99320, "effectiveRate": 8.28 },
    "new": { "taxableIncome": 1125000, "totalTax": 71500, "effectiveRate": 5.96 }
  },
  "savings": 27820,
  "aiSummary": "...(Gemini explanation)...",
  "bullets": ["...", "..."],
  "sources": [{ "file": "income_tax_guide.pdf", "page": 1, "excerpt": "..." }]
}
```

---

## n8n Workflow — Standalone via Postman

The workflow (`My workflow.json`) runs the **complete pipeline by itself** — no Node.js server needed. It uses n8n's built-in **Gemini Agent node** instead of raw API calls.

### Pipeline (5 nodes)

```
Postman POST
    ↓
[1] Webhook              ← Receives salary + deductions + query
    ↓
[2] Validate & Tax       ← Computes Old/New regime tax (full FY 2024-25 slab math)
    ↓
[3] Message a model      ← Sends prompt to Gemini 2.5 Flash (Agent node)
    ↓                      Returns response in Markdown format
[4] Format Response      ← Extracts Gemini's text output
    ↓
[5] Return JSON          ← Sends back to Postman
```

> **No Chroma. No PDFs. No report saving.** Just math + Gemini.

---

### Setup

```bash
# 1. Start n8n
npx n8n
# → Opens at http://localhost:5678

# 2. Workflows → Import from File → select "My workflow.json"
# 3. Click Activate toggle (top right)
# 4. Add your Gemini credential inside the "Message a model" node
```

### Postman Request

- **Method:** `POST`
- **URL:** `http://localhost:5678/webhook/tax-explainer`
- **Headers:** `Content-Type: application/json`
- **Body:**

```json
{
  "salary": 1200000,
  "deductions": {
    "section80C": 150000,
    "section80D": 25000,
    "hra": 60000,
    "other": 0
  },
  "query": "Which regime should I choose?"
}
```

### Response

```json
{
  "aiSummary": "## Verdict\n> **New Regime** saves you Rs 27,820 more...\n\n## Tips\n- Invest in **NPS** under Section 80CCD(1B)...\n",
  "timestamp": "2026-02-28T07:00:00.000Z",
  "generatedBy": "Gemini AI via n8n"
}
```

The `aiSummary` field contains **Markdown-formatted** text with headings (`##`), bold numbers, bullet tips, and a blockquote verdict — ready to render in any Markdown viewer.

---

### What's in the Gemini Prompt

The prompt sent to Gemini has two hardcoded and two dynamic parts:

| Part | Type | Example |
|------|------|---------|
| FY 2024-25 regime rules (slabs, 87A, cess) | **Hardcoded** | Old: 0%/5%/20%/30% slabs |
| Taxpayer salary + deductions | **Dynamic** (from Postman body) | Rs 12,00,000 |
| Computed tax numbers (Old vs New) | **Dynamic** (from Code node) | Old: Rs 99,320 / New: Rs 71,500 |
| Markdown formatting instruction | **Hardcoded** | Use ## headings, bold key numbers, > for verdict |

---

### Node.js Backend + n8n (Optional)

If you also run the Node.js server, n8n can be triggered automatically after every form submission:

```bash
npx n8n
# Import workflow, activate, copy webhook URL
# Add to .env:
N8N_WEBHOOK_URL=http://localhost:5678/webhook/tax-explainer
# Restart server: node server.js
```

---

## Common Questions & Answers

**Q: Why does `npm run ingest` fail?**  
A: Chroma is not running. Start Terminal 1 first (`chroma run --path ./chroma_data`), then run ingest.

**Q: Why do I see "AI summary unavailable"?**  
A: Gemini API key is wrong, or you hit the rate limit. Check your `.env` has a valid `GEMINI_API_KEY`. The tax numbers are always correct regardless — only the AI explanation is affected.

**Q: Why `npm install` fails with ERESOLVE?**  
A: Always use `npm install --legacy-peer-deps`. The `chromadb` package has a peer dependency conflict with newer `@google/generative-ai` versions.

**Q: Can I use my own PDFs?**  
A: Yes! Drop any tax-related PDF into `./pdfs/` and re-run `npm run ingest`. The app will automatically search through them.

**Q: Is my API key safe?**  
A: Yes. It lives only in `.env` which is never committed to git (`.gitignore` blocks it). The code reads it at runtime via `process.env`.

**Q: What if Gemini is down or slow?**  
A: The tax numbers are always returned instantly (they're pure math). The AI explanation is optional — if Gemini fails, you still get the complete tax comparison. The system degrades gracefully.

**Q: How accurate are the tax numbers?**  
A: They are computed from the official FY 2024-25 slab rates hard-coded in `src/taxCalc.js`. The same numbers a CA would compute manually. The AI explanation is for understanding — always verify with your CA before filing.

---

## Security Notes

- ✅ No API keys in code — all in `.env`
- ✅ `.env` is git-ignored — won't be accidentally pushed
- ✅ Gemini prompt enforces: "Answer only from provided excerpts or say 'I cannot confirm'"
- ✅ File uploads restricted to PDFs under 10 MB
- ✅ All deduction inputs are capped to legal maximums (80C: ₹1.5L, 80D: ₹25K)

**To revoke your Gemini key after demo:**  
Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → click the trash icon next to your key.

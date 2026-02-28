'use strict';

/**
 * demo.js — Local demo script
 *
 * Fires sample payloads at the running server and prints formatted results.
 *
 * Usage:
 *   node demo.js                     # uses http://localhost:3000
 *   node demo.js --url http://...    # custom URL
 *   node demo.js --scenario 1        # run only scenario 1 (0-indexed)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = (() => {
    const idx = process.argv.indexOf('--url');
    return idx !== -1 ? process.argv[idx + 1] : 'http://localhost:3000';
})();

const SCENARIO_IDX = (() => {
    const idx = process.argv.indexOf('--scenario');
    return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

const samples = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'samples', 'payload_sample.json'), 'utf8')
);

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const fmtInr = (n) => '₹' + Number(n).toLocaleString('en-IN');

function post(url, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const data = JSON.stringify(body);
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };

        const req = lib.request(options, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function runScenario(scenario, index) {
    const { scenario: name, salary, deductions, query } = scenario;

    console.log('\n' + '═'.repeat(60));
    console.log(bold(`Scenario ${index + 1}: ${name}`));
    console.log('═'.repeat(60));
    console.log(dim(`Salary: ${fmtInr(salary)}  Query: "${query}"`));
    console.log('Calling POST /api/explain ...\n');

    const start = Date.now();
    try {
        const { status, body } = await post(`${BASE_URL}/api/explain`, {
            salary, deductions, query
        });
        const ms = Date.now() - start;

        if (status !== 200) {
            console.log(red(`❌ Error ${status}: ${JSON.stringify(body)}`));
            return;
        }

        const winner = body.verdict === 'new' ? '🆕 New Regime' :
            body.verdict === 'old' ? '📋 Old Regime' : '⚖️  Equal';

        console.log(bold('VERDICT:'), green(winner));
        console.log(bold('RECOMMENDATION:'), body.recommendation);

        if (body.savings > 0) {
            console.log(bold('SAVINGS:'), cyan(fmtInr(body.savings) + ' per year'));
        }

        console.log('\n' + bold('TAX BREAKDOWN:'));
        const o = body.taxNumbers.old;
        const n = body.taxNumbers.new;
        console.log(`  Old Regime → Taxable: ${fmtInr(o.taxableIncome)} | Tax: ${fmtInr(o.totalTax)} (${o.effectiveRate}%)`);
        console.log(`  New Regime → Taxable: ${fmtInr(n.taxableIncome)} | Tax: ${fmtInr(n.totalTax)} (${n.effectiveRate}%)`);

        if (body.bullets?.length > 0) {
            console.log('\n' + bold('AI BULLETS:'));
            body.bullets.slice(0, 3).forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
        }

        if (body.sources?.length > 0) {
            console.log('\n' + bold('SOURCES:'));
            body.sources.slice(0, 2).forEach((s, i) => {
                console.log(`  [${i + 1}] ${s.file} (p.${s.page}) — ${dim(s.excerpt?.slice(0, 80))}...`);
            });
        }

        console.log(dim(`\n⏱  Response time: ${ms}ms`));
    } catch (err) {
        console.log(red(`❌ Network error: ${err.message}`));
        console.log(red('   Is the server running? Try: npm run dev'));
    }
}

async function main() {
    console.log(bold('\n🏦 TaxClarity — Local Demo'));
    console.log(`   Server: ${BASE_URL}`);

    // Quick health check
    try {
        const { status, body } = await post(`${BASE_URL}/api/health`.replace('POST', 'GET'), {});
        // health is GET; use a simple http.get
        const response = await new Promise((resolve, reject) => {
            const mod = BASE_URL.startsWith('https') ? https : http;
            mod.get(`${BASE_URL}/api/health`, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
            }).on('error', reject);
        });
        const e = response.body.env;
        console.log(`   Gemini: ${e.gemini ? '✅' : '❌'} | Chroma: ${e.chroma} | n8n: ${e.n8n ? '✅' : '⚠️'}`);
    } catch {
        console.log(red('   ⚠️  Could not reach server health endpoint'));
    }

    const toRun = SCENARIO_IDX !== null
        ? [samples[SCENARIO_IDX]]
        : samples;

    for (let i = 0; i < toRun.length; i++) {
        await runScenario(toRun[i], SCENARIO_IDX !== null ? SCENARIO_IDX : i);
    }

    console.log('\n' + '═'.repeat(60));
    console.log(bold('Demo complete!'));
    console.log(`Open ${BASE_URL} in your browser for the full UI.\n`);
}

main().catch(console.error);

/**
 * generate_sample_pdf.js
 * Creates synthetic tax-law PDF files in ./pdfs/ for demo purposes.
 * These represent plain-language summaries of Indian tax rules — no real PII.
 * 
 * Usage:  node generate_sample_pdf.js
 * Requires: npm install pdfkit
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PDFS_DIR = path.join(__dirname, 'pdfs');
if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });

// Try to use pdfkit, fall back to .txt if not available
let PDFDocument;
try {
    PDFDocument = require('pdfkit');
} catch {
    console.warn('pdfkit not found. Writing plain text files instead (still usable for ingestion).');
    PDFDocument = null;
}

const TAX_CONTENT = {
    'income_tax_guide.pdf': {
        title: 'Indian Income Tax Guide — FY 2024-25',
        pages: [
            {
                heading: 'Old Tax Regime — Slabs and Deductions',
                body: `
The Old Tax Regime allows taxpayers to claim a wide range of deductions and exemptions.

TAX SLABS (Old Regime):
• Income up to ₹2,50,000            : NIL
• Income ₹2,50,001 – ₹5,00,000     : 5%
• Income ₹5,00,001 – ₹10,00,000    : 20%
• Income above ₹10,00,000           : 30%

Standard Deduction: Salaried individuals can claim a standard deduction of ₹50,000 per annum without any proofs.

Section 80C (Maximum ₹1,50,000):
Eligible investments include Public Provident Fund (PPF), Employee Provident Fund (EPF), Equity Linked Savings Scheme (ELSS), National Savings Certificate (NSC), 5-year bank FDs, ULIP, tuition fees, home loan principal repayment, and life insurance premium.

Section 80D (Medical Insurance):
• Up to ₹25,000 for insurance premium for self, spouse, and children.
• Additional ₹25,000 for parents' health insurance (₹50,000 if parents are senior citizens).

HRA Exemption (House Rent Allowance):
Exemption is the minimum of:
(a) Actual HRA received
(b) Rent paid minus 10% of salary  
(c) 50% of salary for metro cities / 40% for non-metro cities

Section 87A Rebate (Old Regime):
If your net taxable income does not exceed ₹5,00,000, you are eligible for a tax rebate of up to ₹12,500 under Section 87A. This means individuals earning up to ₹5 lakh pay ZERO tax.

Health and Education Cess:
A 4% cess is levied on the total income tax payable (including surcharge, if any).
        `
            },
            {
                heading: 'New Tax Regime — FY 2024-25 (Budget 2024 Updates)',
                body: `
The New Tax Regime was introduced in Budget 2020 and significantly revised in Budget 2023 and Budget 2024. It offers lower tax rates but fewer deductions.

TAX SLABS (New Regime — FY 2024-25):
• Income up to ₹3,00,000            : NIL
• Income ₹3,00,001 – ₹7,00,000     : 5%
• Income ₹7,00,001 – ₹10,00,000    : 10%
• Income ₹10,00,001 – ₹12,00,000   : 15%
• Income ₹12,00,001 – ₹15,00,000   : 20%
• Income above ₹15,00,000           : 30%

Standard Deduction (New Regime): 
Budget 2024 increased the standard deduction for salaried employees from ₹50,000 to ₹75,000 under the new tax regime. This is automatic — no investment required.

Section 87A Rebate (New Regime):
Under the new regime, the 87A rebate covers taxable income up to ₹7,00,000. This means if your net taxable income (after standard deduction) is ₹7 lakh or less, your tax liability is ZERO.

Deductions NOT AVAILABLE in New Regime:
• Section 80C (PPF, ELSS, etc.)
• Section 80D (health insurance)
• HRA exemption
• LTA (Leave Travel Allowance)
• Professional tax
• Interest on housing loan (self-occupied)

Deductions AVAILABLE in New Regime:
• Standard deduction (₹75,000 for salaried)
• Employer's contribution to NPS under Section 80CCD(2)
• Agniveer Corpus Fund deduction under Section 80CCH
        `
            }
        ]
    },
    'tax_comparison_guide.pdf': {
        title: 'Choosing Between Old and New Tax Regime — Decision Guide',
        pages: [
            {
                heading: 'When is the Old Regime Better?',
                body: `
The Old Tax Regime is generally more beneficial when your total eligible deductions are HIGH.

Key thresholds for comparison (approximate):
• At ₹5 lakh income: Both regimes → Zero tax (87A rebate applies)
• At ₹7 lakh income: New regime → Zero tax. Old regime → Tax if deductions < ₹5L
• At ₹10 lakh income: Old regime saves more if deductions exceed ~₹2.75 lakh
• At ₹15 lakh income: Old regime better only if deductions exceed ~₹4.25 lakh
• Above ₹15 lakh: New regime is typically more beneficial

Breaking-even Deduction Levels (approximate, FY 2024-25):
Gross Salary   | Deductions needed for Old Regime to be equal or better
₹7,00,000      | ₹3,25,000+
₹10,00,000     | ₹2,75,000+
₹15,00,000     | ₹4,25,000+
₹20,00,000     | ₹4,25,000+

Recommendation: If your total deductions (80C + 80D + HRA + others) exceed the break-even threshold, stick with the Old Regime. Otherwise, the New Regime is simpler and cheaper.
        `
            },
            {
                heading: 'Step-by-Step: How to Declare Your Regime',
                body: `
STEP 1: Tally your eligible deductions
List all available deductions: 80C investments, health insurance (80D), HRA, home loan interest, NPS, etc.

STEP 2: Compute tax under both regimes
Calculate your taxable income under both regimes. Use the official Income Tax Calculator at incometax.gov.in or a trusted tool.

STEP 3: Compare and choose
Select the regime that results in lower tax outflow. Remember to account for 4% Health & Education Cess in both cases.

STEP 4: Inform your employer
Submit Form 12BB or a written declaration to your employer at the beginning of the financial year (April). Your employer will deduct TDS based on the selected regime.

STEP 5: File your ITR
You can change your tax regime when filing your Income Tax Return (ITR) — but only up to the due date. Businesses filing under presumptive taxation schemes have restrictions on switching.

Important: The New Regime is the DEFAULT regime from FY 2023-24. You must actively opt out if you want to file under the Old Regime.
        `
            }
        ]
    }
};

if (PDFDocument) {
    // Generate actual PDFs using pdfkit
    for (const [filename, content] of Object.entries(TAX_CONTENT)) {
        const filePath = path.join(PDFS_DIR, filename);
        const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 72, right: 72 } });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Cover page
        doc.fontSize(22).font('Helvetica-Bold').text(content.title, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').fillColor('#444444')
            .text('Synthetic Training Document — For Demo Purposes Only', { align: 'center' });
        doc.moveDown(2);

        for (const page of content.pages) {
            doc.addPage();
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e').text(page.heading);
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').fillColor('#333333').text(page.body.trim(), {
                lineGap: 4,
                paragraphGap: 8,
            });
        }

        doc.end();
        stream.on('finish', () => console.log('✅ Created:', filePath));
    }
} else {
    // Fallback: write plain .txt files (pdf-parse can still read content if wrapped)
    // Write as .txt since we can't generate PDFs
    for (const [filename, content] of Object.entries(TAX_CONTENT)) {
        const txtFile = path.join(PDFS_DIR, filename.replace('.pdf', '_seed.txt'));
        let text = `${content.title}\n${'='.repeat(60)}\n\n`;
        for (const page of content.pages) {
            text += `--- ${page.heading} ---\n${page.body.trim()}\n\n`;
        }
        fs.writeFileSync(txtFile, text, 'utf8');
        console.log('✅ Created seed text:', txtFile);
    }
    console.log('\nTo generate actual PDFs, install pdfkit:');
    console.log('  npm install pdfkit');
    console.log('Then re-run: node generate_sample_pdf.js');
}

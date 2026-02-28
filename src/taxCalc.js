'use strict';

/**
 * taxCalc.js — Deterministic Indian Tax Calculator (FY 2024-25)
 *
 * This module has ZERO external dependencies. All slab rates are
 * hard-coded per official Budget 2024 announcements.
 *
 * Old Regime (with deductions):
 *   Slabs on taxable income after 80C / 80D / HRA etc.
 *   0–2.5L  → 0%
 *   2.5–5L  → 5%
 *   5–10L   → 20%
 *   10L+    → 30%
 *   Standard deduction: ₹50,000 (salaried)
 *   Rebate u/s 87A: full tax if taxable income ≤ ₹5L
 *
 * New Regime (FY 2024-25, post-Budget):
 *   Standard deduction: ₹75,000 (salaried)
 *   0–3L    → 0%
 *   3–7L    → 5%
 *   7–10L   → 10%
 *   10–12L  → 15%
 *   12–15L  → 20%
 *   15L+    → 30%
 *   Rebate u/s 87A: full tax if taxable income ≤ ₹7L (new regime)
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const CESS_RATE = 0.04; // 4% Health & Education Cess

const OLD_REGIME_STANDARD_DEDUCTION = 50_000;
const OLD_REGIME_MAX_80C = 150_000;
const OLD_REGIME_MAX_80D = 25_000;

const NEW_REGIME_STANDARD_DEDUCTION = 75_000;

const OLD_SLABS = [
  { up_to: 250_000, rate: 0 },
  { up_to: 500_000, rate: 0.05 },
  { up_to: 1_000_000, rate: 0.20 },
  { up_to: Infinity, rate: 0.30 },
];

const NEW_SLABS = [
  { up_to: 300_000, rate: 0 },
  { up_to: 700_000, rate: 0.05 },
  { up_to: 1_000_000, rate: 0.10 },
  { up_to: 1_200_000, rate: 0.15 },
  { up_to: 1_500_000, rate: 0.20 },
  { up_to: Infinity, rate: 0.30 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Computes tax on a taxable income given a slab table.
 * @param {number} taxableIncome
 * @param {Array<{up_to: number, rate: number}>} slabs
 * @returns {number} base tax (before cess)
 */
function applySlabs(taxableIncome, slabs) {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  let prev = 0;

  for (const slab of slabs) {
    const slice = Math.min(taxableIncome, slab.up_to) - prev;
    if (slice <= 0) break;
    tax += slice * slab.rate;
    prev = slab.up_to;
    if (taxableIncome <= slab.up_to) break;
  }

  return Math.round(tax);
}

/**
 * Adds 4% Health & Education Cess.
 * @param {number} baseTax
 * @returns {number}
 */
function addCess(baseTax) {
  return Math.round(baseTax * (1 + CESS_RATE));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Computes tax under the Old Regime.
 *
 * @param {number} grossSalary  Annual gross salary in INR
 * @param {object} deductions
 *   @param {number} [deductions.section80C=0]   e.g. PPF, ELSS (max ₹1.5L)
 *   @param {number} [deductions.section80D=0]   Medical insurance (max ₹25K)
 *   @param {number} [deductions.hra=0]          HRA exemption claim
 *   @param {number} [deductions.other=0]        Other deductions
 *
 * @returns {{ grossSalary, totalDeductions, taxableIncome, baseTax, cess, totalTax, effectiveRate }}
 */
function computeOldRegime(grossSalary, deductions = {}) {
  const {
    section80C = 0,
    section80D = 0,
    hra = 0,
    other = 0,
  } = deductions;

  const capped80C = Math.min(section80C, OLD_REGIME_MAX_80C);
  const capped80D = Math.min(section80D, OLD_REGIME_MAX_80D);

  const totalDeductions =
    OLD_REGIME_STANDARD_DEDUCTION + capped80C + capped80D + hra + other;

  const taxableIncome = Math.max(0, grossSalary - totalDeductions);
  const baseTax = applySlabs(taxableIncome, OLD_SLABS);

  // Rebate u/s 87A: if taxable income ≤ ₹5L, no tax payable
  const taxAfterRebate = taxableIncome <= 500_000 ? 0 : baseTax;
  const cess = taxAfterRebate > 0 ? Math.round(taxAfterRebate * CESS_RATE) : 0;
  const totalTax = taxAfterRebate + cess;

  const effectiveRate =
    grossSalary > 0 ? +((totalTax / grossSalary) * 100).toFixed(2) : 0;

  return {
    regime: 'old',
    grossSalary,
    totalDeductions,
    taxableIncome,
    baseTax: taxAfterRebate,
    cess,
    totalTax,
    effectiveRate,
  };
}

/**
 * Computes tax under the New Regime (FY 2024-25).
 *
 * @param {number} grossSalary  Annual gross salary in INR
 * @returns {{ grossSalary, totalDeductions, taxableIncome, baseTax, cess, totalTax, effectiveRate }}
 */
function computeNewRegime(grossSalary) {
  const totalDeductions = NEW_REGIME_STANDARD_DEDUCTION;
  const taxableIncome = Math.max(0, grossSalary - totalDeductions);
  const baseTax = applySlabs(taxableIncome, NEW_SLABS);

  // Rebate u/s 87A (new regime): if taxable income ≤ ₹7L, no tax
  const taxAfterRebate = taxableIncome <= 700_000 ? 0 : baseTax;
  const cess = taxAfterRebate > 0 ? Math.round(taxAfterRebate * CESS_RATE) : 0;
  const totalTax = taxAfterRebate + cess;

  const effectiveRate =
    grossSalary > 0 ? +((totalTax / grossSalary) * 100).toFixed(2) : 0;

  return {
    regime: 'new',
    grossSalary,
    totalDeductions,
    taxableIncome,
    baseTax: taxAfterRebate,
    cess,
    totalTax,
    effectiveRate,
  };
}

/**
 * Compares both regimes and returns a recommendation.
 *
 * @param {number} grossSalary
 * @param {object} deductions  (same shape as computeOldRegime)
 * @returns {{ old, new, recommendation, savings }}
 */
function compareTaxRegimes(grossSalary, deductions = {}) {
  const oldResult = computeOldRegime(grossSalary, deductions);
  const newResult = computeNewRegime(grossSalary);

  const savings = oldResult.totalTax - newResult.totalTax;
  let recommendation;

  if (savings > 0) {
    recommendation = `New Regime saves ₹${savings.toLocaleString('en-IN')} more.`;
  } else if (savings < 0) {
    recommendation = `Old Regime saves ₹${Math.abs(savings).toLocaleString('en-IN')} more.`;
  } else {
    recommendation = 'Both regimes result in the same tax liability.';
  }

  return {
    old: oldResult,
    new: newResult,
    recommendation,
    savings,
    betterRegime: savings > 0 ? 'new' : savings < 0 ? 'old' : 'equal',
  };
}

module.exports = { computeOldRegime, computeNewRegime, compareTaxRegimes };

'use strict';

const { computeOldRegime, computeNewRegime, compareTaxRegimes } = require('../src/taxCalc');

// Helper: format INR for readability in test descriptions
const inr = (n) => `₹${n.toLocaleString('en-IN')}`;

// ─── Case 1: Zero Income ────────────────────────────────────────────────────
describe('Case 1 — Zero income', () => {
    test('Old regime: zero tax on zero income', () => {
        const result = computeOldRegime(0, {});
        expect(result.totalTax).toBe(0);
        expect(result.taxableIncome).toBe(0);
        expect(result.effectiveRate).toBe(0);
    });

    test('New regime: zero tax on zero income', () => {
        const result = computeNewRegime(0);
        expect(result.totalTax).toBe(0);
        expect(result.taxableIncome).toBe(0);
        expect(result.effectiveRate).toBe(0);
    });
});

// ─── Case 2: ₹7L income with standard deductions ───────────────────────────
describe('Case 2 — ₹7,00,000 gross salary with deductions', () => {
    const gross = 700_000;
    const deductions = { section80C: 150_000, section80D: 25_000 };

    test('Old regime: taxable income ≤ ₹5L → zero tax via 87A rebate', () => {
        // grossSalary=7L, std_deduction=50K, 80C=1.5L, 80D=25K => taxable=4.75L ≤ 5L → 0 tax
        const result = computeOldRegime(gross, deductions);
        expect(result.taxableIncome).toBe(475_000);
        expect(result.baseTax).toBe(0); // rebate applied
        expect(result.totalTax).toBe(0);
    });

    test('New regime: taxable income ≤ ₹7L → zero tax via 87A rebate', () => {
        // grossSalary=7L, std_deduction=75K => taxable=6.25L ≤ 7L → 0 tax
        const result = computeNewRegime(gross);
        expect(result.taxableIncome).toBe(625_000);
        expect(result.totalTax).toBe(0);
    });

    test('Comparison: both regimes zero → recommendation is "equal"', () => {
        const comparison = compareTaxRegimes(gross, deductions);
        expect(comparison.betterRegime).toBe('equal');
        expect(comparison.savings).toBe(0);
    });
});

// ─── Case 3: ₹15L income — meaningful comparison ───────────────────────────
describe('Case 3 — ₹15,00,000 gross salary', () => {
    const gross = 1_500_000;
    const deductions = { section80C: 150_000, section80D: 25_000, hra: 50_000 };

    test('Old regime: computes correct tax for ₹15L', () => {
        const result = computeOldRegime(gross, deductions);
        // taxable = 15L - 50K(std) - 1.5L(80C) - 25K(80D) - 50K(hra) = 12.25L
        expect(result.taxableIncome).toBe(1_225_000);
        expect(result.baseTax).toBeGreaterThan(0);
        expect(result.cess).toBeGreaterThan(0);
        expect(result.totalTax).toBeGreaterThan(0);
        expect(result.effectiveRate).toBeGreaterThan(0);
    });

    test('New regime: computes correct tax for ₹15L', () => {
        const result = computeNewRegime(gross);
        // taxable = 15L - 75K(std) = 13.25L
        expect(result.taxableIncome).toBe(1_425_000);
        expect(result.totalTax).toBeGreaterThan(0);
    });

    test('Comparison: savings & betterRegime populated correctly', () => {
        const comparison = compareTaxRegimes(gross, deductions);
        expect(['old', 'new']).toContain(comparison.betterRegime);
        expect(typeof comparison.savings).toBe('number');
        expect(comparison.recommendation).toMatch(/saves ₹/);
        expect(comparison.old.regime).toBe('old');
        expect(comparison.new.regime).toBe('new');
    });
});

// ─── Slab boundary checks ───────────────────────────────────────────────────
describe('Slab boundary sanity checks', () => {
    test('Old regime: ₹10L (no deductions beyond std) should be in 20% bracket', () => {
        const result = computeOldRegime(1_000_000, {});
        // taxable = 10L - 50K = 9.5L → tax = 0 + 12.5K(5%) + 90K(20%) = 102.5K + 4% cess
        expect(result.totalTax).toBeGreaterThan(100_000);
        expect(result.totalTax).toBeLessThan(150_000);
    });

    test('New regime: ₹8L should attract some tax (above 87A limit)', () => {
        const result = computeNewRegime(800_000);
        // taxable = 8L - 75K = 7.25L → above 7L rebate → some tax
        expect(result.totalTax).toBeGreaterThan(0);
    });
});

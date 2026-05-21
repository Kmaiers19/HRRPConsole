// ============================================================
// HRRP MONITORING CONSOLE — GENERATOR TEST SUITE
//
// These tests exist because the v0.5.2 and v0.5.3 fixes both
// caught the same failure mode: a verifier that didn't match the
// deployed generator's RNG consumption or rounding produced
// "all-green" results that disagreed with the live dashboard.
// The fix was to test the exact module the component imports.
//
// Coverage:
//   1. Calibration at seed 42 - the headline v0.5.3 claim
//   2. Determinism - same seed produces identical output
//   3. NULL property - no group effects when mode=null
//   4. Threshold rule - declaredThreshold is the rounded median
//   5. Regression direction - β positive under LOADED, ~zero NULL
//   6. v0.5.3 snapshot - the exact per-group rates the version
//      history records, locked in so coefficient drift fails CI
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  CONDITIONS,
  STATES,
  mulberry32,
  gaussian,
  generateHospitalsLoaded,
  generateHospitalsNull,
  declaredThreshold,
} from './generator.js';

// --------------------------------------------------------------
// helpers
// --------------------------------------------------------------

function rate(arr, pred, threshold) {
  if (arr.length === 0) return 0;
  return arr.filter((h) => pred(h) && h.paymentAdjustment >= threshold).length /
         arr.filter(pred).length;
}

function pct(arr, threshold) {
  if (arr.length === 0) return 0;
  return arr.filter((h) => h.paymentAdjustment >= threshold).length / arr.length;
}

function groupRates(hospitals, t) {
  const f = (pred) => hospitals.filter(pred);
  return {
    SNH:      pct(f((h) => h.isSNH), t),
    nonSNH:   pct(f((h) => !h.isSNH), t),
    Large:    pct(f((h) => h.beds >= 400), t),
    Small:    pct(f((h) => h.beds < 200), t),
    Teach:    pct(f((h) => h.teachingHospital), t),
    nonTeach: pct(f((h) => !h.teachingHospital), t),
    Overall:  hospitals.filter((h) => h.paymentAdjustment > 0).length / hospitals.length,
  };
}

function regression(hospitals) {
  const points = hospitals.map((h) => ({
    x: h.dualEligiblePct * 100,
    y: h.aggregateExcess,
  }));
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope;
}

// --------------------------------------------------------------
// 1. CALIBRATION at seed 42 - the headline v0.5.3 claim
// --------------------------------------------------------------

describe('LOADED DGP calibration at seed 42', () => {
  const hospitals = generateHospitalsLoaded(42);
  const t = declaredThreshold(hospitals);
  const rates = groupRates(hospitals, t);

  it('hospital count is exactly 280', () => {
    expect(hospitals.length).toBe(280);
  });

  it('SNH rate lands within 3pp of J&J 44%', () => {
    expect(rates.SNH).toBeGreaterThanOrEqual(0.41);
    expect(rates.SNH).toBeLessThanOrEqual(0.47);
  });

  it('non-SNH rate lands within 3pp of J&J 30%', () => {
    expect(rates.nonSNH).toBeGreaterThanOrEqual(0.27);
    expect(rates.nonSNH).toBeLessThanOrEqual(0.33);
  });

  it('Large rate lands within 3pp of J&J 40%', () => {
    expect(rates.Large).toBeGreaterThanOrEqual(0.37);
    expect(rates.Large).toBeLessThanOrEqual(0.43);
  });

  it('Small rate lands within 3pp of J&J 28%', () => {
    expect(rates.Small).toBeGreaterThanOrEqual(0.25);
    expect(rates.Small).toBeLessThanOrEqual(0.31);
  });

  it('Teaching rate lands within 3pp of J&J 44%', () => {
    expect(rates.Teach).toBeGreaterThanOrEqual(0.41);
    expect(rates.Teach).toBeLessThanOrEqual(0.47);
  });

  it('non-Teaching rate lands within 3pp of J&J 33%', () => {
    expect(rates.nonTeach).toBeGreaterThanOrEqual(0.30);
    expect(rates.nonTeach).toBeLessThanOrEqual(0.36);
  });

  it('SNH gap is within 3pp of J&J observed 14pp', () => {
    const gap = (rates.SNH - rates.nonSNH) * 100;
    expect(gap).toBeGreaterThanOrEqual(11);
    expect(gap).toBeLessThanOrEqual(17);
  });

  it('max group miss is at most 3pp', () => {
    const targets = {
      SNH: 0.44, nonSNH: 0.30, Large: 0.40, Small: 0.28,
      Teach: 0.44, nonTeach: 0.33,
    };
    const misses = Object.keys(targets).map((k) =>
      Math.abs(rates[k] - targets[k]) * 100,
    );
    const maxMiss = Math.max(...misses);
    expect(maxMiss).toBeLessThanOrEqual(3);
  });
});

// --------------------------------------------------------------
// 2. DETERMINISM
// --------------------------------------------------------------

describe('determinism', () => {
  it('same seed produces identical LOADED output', () => {
    const a = generateHospitalsLoaded(42);
    const b = generateHospitalsLoaded(42);
    expect(a).toEqual(b);
  });

  it('same seed produces identical NULL output', () => {
    const a = generateHospitalsNull(42);
    const b = generateHospitalsNull(42);
    expect(a).toEqual(b);
  });

  it('different seeds produce different output', () => {
    const a = generateHospitalsLoaded(42);
    const b = generateHospitalsLoaded(43);
    expect(a).not.toEqual(b);
  });

  it('mulberry32 is deterministic', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(r1()).toBe(r2());
    }
  });
});

// --------------------------------------------------------------
// 3. NULL PROPERTY
// --------------------------------------------------------------

describe('NULL DGP property', () => {
  it('SNH gap under NULL is within sampling noise of zero across seeds', () => {
    // Binomial SE on SNH n~71 is ~5-6pp; 95% CI extends to ~10pp.
    // Across 5 seeds, every gap should be within that band; no
    // structural bias toward SNH should appear.
    const gaps = [];
    for (const seed of [42, 100, 200, 300, 400]) {
      const h = generateHospitalsNull(seed);
      const t = declaredThreshold(generateHospitalsLoaded(42)); // use LOADED-derived threshold
      const r = groupRates(h, t);
      gaps.push((r.SNH - r.nonSNH) * 100);
    }
    // No individual gap should exceed 10pp in absolute value
    gaps.forEach((g) => expect(Math.abs(g)).toBeLessThanOrEqual(10));
    // Mean gap across seeds should be near zero (within 4pp)
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.abs(mean)).toBeLessThanOrEqual(4);
  });

  it('NULL DGP produces no group effects in characteristic load', () => {
    // Under NULL, two hospitals identical except for SNH status should
    // produce paymentAdjustment values driven only by noise — not by
    // a systematic SNH premium. We verify this indirectly: the SNH
    // group rate under NULL should not systematically exceed non-SNH.
    const h = generateHospitalsNull(42);
    const t = declaredThreshold(generateHospitalsLoaded(42));
    const r = groupRates(h, t);
    // SNH rate should not be more than 8pp above non-SNH (would indicate group effect leaked through)
    expect(r.SNH - r.nonSNH).toBeLessThanOrEqual(0.08);
  });
});

// --------------------------------------------------------------
// 4. THRESHOLD RULE
// --------------------------------------------------------------

describe('declaredThreshold', () => {
  it('returns the median paymentAdjustment among penalized hospitals, rounded to 4 decimals', () => {
    const h = generateHospitalsLoaded(42);
    const penalized = h
      .filter((x) => x.paymentAdjustment > 0)
      .map((x) => x.paymentAdjustment)
      .sort((a, b) => a - b);
    const expectedMedian = penalized[Math.floor(penalized.length / 2)];
    const expected = Math.round(expectedMedian * 10000) / 10000;
    expect(declaredThreshold(h)).toBe(expected);
  });

  it('returns 0.0045 fallback for empty penalized set', () => {
    const empty = [{ paymentAdjustment: 0 }, { paymentAdjustment: 0 }];
    expect(declaredThreshold(empty)).toBe(0.0045);
  });

  it('is rounded to 4 decimal places', () => {
    const h = generateHospitalsLoaded(42);
    const t = declaredThreshold(h);
    // The threshold * 10000 should be an integer
    expect(t * 10000).toBe(Math.round(t * 10000));
  });
});

// --------------------------------------------------------------
// 5. REGRESSION DIRECTION
// --------------------------------------------------------------

describe('regression direction', () => {
  it('LOADED produces positive slope of dual_elig vs agg_excess', () => {
    const h = generateHospitalsLoaded(42);
    const slope = regression(h);
    // β should be positive but small; documented values are around 0.0004
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeLessThan(0.01);
  });

  it('NULL produces slope near zero', () => {
    const h = generateHospitalsNull(42);
    const slope = regression(h);
    // β should be very near zero under NULL; |β| < 0.001 is comfortable
    expect(Math.abs(slope)).toBeLessThan(0.001);
  });
});

// --------------------------------------------------------------
// 6. v0.5.3 SNAPSHOT
//
// These numbers are the exact rates recorded in the v0.5.3 entry of
// the dashboard's VERSION.HISTORY panel and in the README's calibration
// table. If a future commit changes the coefficients, these tests
// fail and the version history claim is no longer accurate. The
// failure should prompt either reverting the coefficient change or
// updating the version history to match.
// --------------------------------------------------------------

describe('v0.5.3 snapshot (locks the version history claim)', () => {
  const h = generateHospitalsLoaded(42);
  const t = declaredThreshold(h);
  const r = groupRates(h, t);

  it('declared threshold is 0.0008', () => {
    expect(t).toBe(0.0008);
  });

  it('SNH rate rounds to 45%', () => {
    expect(Math.round(r.SNH * 100)).toBe(45);
  });

  it('non-SNH rate rounds to 31%', () => {
    expect(Math.round(r.nonSNH * 100)).toBe(31);
  });

  it('Large rate rounds to 39%', () => {
    expect(Math.round(r.Large * 100)).toBe(39);
  });

  it('Small rate rounds to 28%', () => {
    expect(Math.round(r.Small * 100)).toBe(28);
  });

  it('Teaching rate rounds to 45%', () => {
    expect(Math.round(r.Teach * 100)).toBe(45);
  });

  it('non-Teaching rate rounds to 32%', () => {
    expect(Math.round(r.nonTeach * 100)).toBe(32);
  });

  it('SNH gap is exactly 14pp (rounded)', () => {
    const gap = Math.round((r.SNH - r.nonSNH) * 100);
    expect(gap).toBe(14);
  });

  it('max group miss is at most 1.5pp', () => {
    const targets = {
      SNH: 0.44, nonSNH: 0.30, Large: 0.40, Small: 0.28,
      Teach: 0.44, nonTeach: 0.33,
    };
    const maxMiss = Math.max(
      ...Object.keys(targets).map((k) => Math.abs(r[k] - targets[k]) * 100),
    );
    expect(maxMiss).toBeLessThanOrEqual(1.5);
  });
});

// --------------------------------------------------------------
// STRUCTURE CHECKS
// --------------------------------------------------------------

describe('module structure', () => {
  it('exports 6 conditions', () => {
    expect(CONDITIONS).toHaveLength(6);
    expect(CONDITIONS).toContain('AMI');
    expect(CONDITIONS).toContain('HF');
    expect(CONDITIONS).toContain('PN');
    expect(CONDITIONS).toContain('COPD');
    expect(CONDITIONS).toContain('CABG');
    expect(CONDITIONS).toContain('THA_TKA');
  });

  it('exports 20 states', () => {
    expect(STATES).toHaveLength(20);
  });

  it('hospitals have all expected fields', () => {
    const h = generateHospitalsLoaded(42);
    const sample = h[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('ccn');
    expect(sample).toHaveProperty('state');
    expect(sample).toHaveProperty('beds');
    expect(sample).toHaveProperty('teachingHospital');
    expect(sample).toHaveProperty('isSNH');
    expect(sample).toHaveProperty('dualEligiblePct');
    expect(sample).toHaveProperty('conditions');
    expect(sample).toHaveProperty('paymentAdjustment');
    expect(sample).toHaveProperty('aggregateExcess');
  });

  it('CCN format is DEMO-####', () => {
    const h = generateHospitalsLoaded(42);
    h.forEach((hospital) => {
      expect(hospital.ccn).toMatch(/^DEMO-\d{4}$/);
    });
  });
});

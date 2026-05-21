// ============================================================
// HRRP MONITORING CONSOLE — GENERATOR MODULE
//
// Extracted from HRRPConsole.jsx in v0.6.0 so the generator and
// threshold logic are independently testable. The generator's
// RNG consumption pattern is load-bearing: any deviation between
// what the component runs and what a verifier runs produces the
// failure mode v0.5.2 and v0.5.3 documented. Keeping a single
// source of truth eliminates that risk class structurally.
//
// Public API:
//   mulberry32(seed)              - seeded RNG factory
//   gaussian(rng)                 - Box-Muller normal sample
//   generateHospitalsLoaded(seed) - LOADED DGP at the given seed
//   generateHospitalsNull(seed)   - NULL DGP at the given seed
//   generateInternal(seed, mode)  - underlying generator
//   declaredThreshold(hospitals)  - median paymentAdjustment among
//                                   penalized hospitals, rounded to
//                                   4 decimals
//
// CONDITIONS and STATES are exported because the test suite asserts
// on their length and structure.
// ============================================================

export const CONDITIONS = ['AMI', 'HF', 'PN', 'COPD', 'CABG', 'THA_TKA'];
export const STATES = [
  'CA', 'TX', 'NY', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI',
  'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI',
];

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateHospitalsNull(seed = 42) {
  return generateInternal(seed, 'null');
}

export function generateHospitalsLoaded(seed = 42) {
  return generateInternal(seed, 'loaded');
}

export function generateInternal(seed, mode) {
  const rng = mulberry32(seed);

  const raw = [];
  for (let i = 0; i < 280; i++) {
    const state = STATES[Math.floor(rng() * STATES.length)];
    const dualEligiblePct = Math.min(0.65, Math.max(0.05, 0.18 + gaussian(rng) * 0.12));
    const beds = Math.floor(80 + rng() * 520);
    const teachingHospital = rng() < 0.18;
    // v0.5.3: noise SD 0.030.
    const baselineQuality = gaussian(rng) * 0.030;
    raw.push({ state, dualEligiblePct, beds, teachingHospital, baselineQuality });
  }

  const dualSorted = [...raw].map((r) => r.dualEligiblePct).sort((a, b) => b - a);
  const snhThreshold = dualSorted[Math.floor(dualSorted.length / 4)];

  const hospitals = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const isSNH = r.dualEligiblePct >= snhThreshold;
    const isLarge = r.beds >= 400;
    const isMedium = r.beds >= 200 && r.beds < 400;
    const isSmall = r.beds < 200;

    // v0.5.3 coefficients
    const snhEffect      = mode === 'loaded' && isSNH              ?  0.007 : 0;
    const largeEffect    = mode === 'loaded' && isLarge            ?  0.004 : 0;
    const mediumEffect   = mode === 'loaded' && isMedium           ?  0.002 : 0;
    const teachingEffect = mode === 'loaded' && r.teachingHospital ?  0.006 : 0;
    const smallEffect    = mode === 'loaded' && isSmall            ? -0.006 : 0;
    const characteristicLoad = snhEffect + largeEffect + mediumEffect + teachingEffect + smallEffect;

    const biasTerm = -0.020;

    const conditions = {};
    let totalExcess = 0;
    let conditionsPenalized = 0;
    let reportingCount = 0;
    let errSum = 0;

    CONDITIONS.forEach((cond) => {
      const reports = rng() > 0.15;
      if (!reports) {
        conditions[cond] = null;
        return;
      }
      const condNoise = gaussian(rng) * 0.030;
      const err = 1.0 + biasTerm + r.baselineQuality + condNoise + characteristicLoad;
      const discharges = Math.floor(25 + rng() * (cond === 'HF' || cond === 'PN' ? 400 : 180));
      const cases = Math.floor(discharges * (0.15 + rng() * 0.08));
      conditions[cond] = {
        err: Math.round(err * 1000) / 1000,
        discharges,
        cases,
        penalized: err > 1.0,
      };
      reportingCount++;
      errSum += err;
      if (err > 1.0) {
        totalExcess += err - 1.0;
        conditionsPenalized++;
      }
    });

    const meanERR = reportingCount > 0 ? errSum / reportingCount : null;
    const paymentAdjustment = Math.min(0.03, totalExcess * 0.015);
    const medicarePayments = r.beds * (18000 + rng() * 12000);
    const penaltyDollars = paymentAdjustment * medicarePayments;

    hospitals.push({
      id: 1000 + i,
      ccn: `DEMO-${String(1000 + i).padStart(4, '0')}`,
      state: r.state,
      beds: r.beds,
      teachingHospital: r.teachingHospital,
      isSNH,
      dualEligiblePct: Math.round(r.dualEligiblePct * 1000) / 1000,
      conditions,
      reportingCount,
      conditionsPenalized,
      meanERR: meanERR !== null ? Math.round(meanERR * 1000) / 1000 : null,
      paymentAdjustment: Math.round(paymentAdjustment * 10000) / 10000,
      penaltyDollars: Math.round(penaltyDollars),
      aggregateExcess: Math.round(totalExcess * 1000) / 1000,
    });
  }

  return hospitals;
}

export function declaredThreshold(hospitals) {
  const penalized = hospitals
    .filter((h) => h.paymentAdjustment > 0)
    .map((h) => h.paymentAdjustment)
    .sort((a, b) => a - b);
  if (penalized.length === 0) return 0.0045;
  const med = penalized[Math.floor(penalized.length / 2)];
  return Math.round(med * 10000) / 10000;
}

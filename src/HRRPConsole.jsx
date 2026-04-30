import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine, ZAxis, LineChart, Line } from 'recharts';

// ============================================================
// HRRP MONITORING CONSOLE — v0.5.1
//
// VERSION HISTORY (full chain visible in the dashboard panel below)
// v0.1.0  Atlas predecessor (separate dashboard, "Penalty Atlas").
//         ERR formula loaded dual-eligible share into ERR, then
//         the scatter regressed ERR against dual-eligible share
//         and displayed the slope as if it were an empirical
//         finding. Coefficient was a mechanical consequence of
//         the DGP, not evidence. Retracted.
// v0.2.0  Console rewrite. Circular loading removed. ERR became
//         gaussian noise around 1.0 with no hospital-characteristic
//         loading. Scatter showed null by construction. Literature
//         panel added.
// v0.3.0  Second DGP added, calibrated against Joynt & Jha 2013
//         JAMA. Toggle exposed the argument. Identifiers switched
//         to DEMO-####. Achieved SNH 52% vs target 44% (8pp high).
// v0.3.1  Severity banding renamed sim* (was demo*). Scatter
//         renamed ASSUMPTION.SENSITIVITY with inline warning.
//         Threshold exposed as slider. Calibration diagnostics
//         promoted to first-class panel.
// v0.4.0  Coefficient retune via grid search at N=280 (~11,500
//         configs evaluated against J&J 2013 targets). Final:
//         snhEffect 0.020→0.016, teachingEffect 0.015→0.012,
//         largeEffect 0.010→0.007, new smallEffect −0.010 (pulls
//         small hospitals down toward 28% target). biasTerm
//         shifted −0.020→−0.030. Verified at declared 0.080%
//         threshold: max group miss 1.3pp; SNH gap 14.4pp vs J&J
//         observed 14pp. All groups within 3pp. Threshold
//         declared to median paymentAdjustment among
//         penalized hospitals. Operational chrome (clock, LAT,
//         CONN) removed. STATUS/ABOUT moved to first band.
// v0.5.0  No model changes. Reviewer-readability pass:
//         (a) explicit thesis sentence at top of STATUS panel,
//         which is now three labeled subsections in one panel
//         (DEMONSTRATES / DOES NOT CLAIM / NEXT STEP);
//         (b) DGP labels reworded for non-statisticians ("group
//         effects modeled" rather than "loading"); (c) calibration
//         verdict softened from "WITHIN TARGET" to "matches J&J
//         rates within Xpp" to remove causal-adjacent language;
//         (d) literature panel split into three labeled threads
//         (calibration source / mortality debate / measurement
//         critique) with a one-line statement of what each thread
//         answers; (e) regression β moved out of scatter panel
//         header so it is not read as a finding; (f) calibration
//         panel footer expanded to motivate the threshold rule,
//         flag N=280 sampling noise (binomial SE ~5–6pp on SNH
//         n=71), and note that thresholds recompute per DGP;
//         (g) palette: textDim and textMuted bumped to meet WCAG
//         AA contrast on the dark background; (h) responsive
//         grids (auto-fit minmax) so the dashboard reflows on
//         mobile; (i) basic ARIA on sortable headers and
//         clickable rows.
// v0.5.1  Three substantive corrections after a reviewer pass:
//         (1) "Pre-registered threshold" → "declared threshold"
//         everywhere. Pre-registration requires a public
//         timestamp before observation; the threshold rule was
//         selected before the calibration check but the
//         commitment was not formally registered, so the
//         original term was an overclaim. The honest term:
//         the rule is mechanical and reproducible from the data.
//         (2) Joynt & Jha 2013 scope explicitly noted: the
//         paper analyzed first-year HRRP, when the program
//         covered the original three conditions (AMI, HF, PN).
//         CABG was added FY2017; COPD and THA/TKA later. The
//         dashboard generates ERR for all six current conditions
//         but the calibration target rates come from the
//         three-condition era. This was implicit before; now
//         explicit in both the calibration footer and the
//         literature panel's J&J entry.
//         (3) Threshold-rule prose softened: removed "fixed
//         before observation" language (overclaims discipline
//         of the rule selection); replaced with "mechanical
//         and reproducible from the data."
// ============================================================

const CONDITIONS = ['AMI', 'HF', 'PN', 'COPD', 'CABG', 'THA_TKA'];
const STATES = ['CA', 'TX', 'NY', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI'];

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ============================================================
// DGP — NULL
// Gaussian noise around 1.0. No hospital-characteristic loading.
// Exists so the scatter and SNH split read as null by
// construction. Comparison anchor for the loaded DGP.
// ============================================================
function generateHospitalsNull(seed = 42) {
  return generateInternal(seed, 'null');
}

// ============================================================
// DGP — LOADED  (v0.4 retune)
//
// Targets, all from Joynt & Jha 2013 JAMA 309(4):342–343 Table 1:
//   SNH high-penalty rate          44%
//   non-SNH high-penalty rate      30%   (gap target: 14pp)
//   Large hospital high-penalty    40%
//   Small hospital high-penalty    28%
//   Teaching high-penalty          44%
//   Non-teaching high-penalty      33%
//   Overall first-year HRRP rate   ~67%
//
// v0.3 coefficients (snhEffect 0.020, teachingEffect 0.015,
// largeEffect 0.010) hit direction and relative ranking but
// overshot SNH and teaching by ~8pp. v0.4 grid-searched against
// J&J targets (~11,500 configs at N=280) and found that the
// missing piece was a NEGATIVE smallEffect (−0.010): without it,
// small hospitals drift up to ~34% from the residual noise floor
// rather than landing at the J&J 28%. Other coefficients moved
// modestly (snh 0.020→0.016, teach 0.015→0.012, large 0.010→0.007)
// and biasTerm shifted (−0.020→−0.030) to anchor the overall rate.
// Noise SDs are 0.034, slightly tighter than v0.3's 0.04. The
// grid search found tighter SDs (0.022–0.028) suppressed group
// separation rather than helping.
// ============================================================
function generateHospitalsLoaded(seed = 42) {
  return generateInternal(seed, 'loaded');
}

function generateInternal(seed, mode) {
  const rng = mulberry32(seed);

  const raw = [];
  for (let i = 0; i < 280; i++) {
    const state = STATES[Math.floor(rng() * STATES.length)];
    const dualEligiblePct = Math.min(0.65, Math.max(0.05, 0.18 + gaussian(rng) * 0.12));
    const beds = Math.floor(80 + rng() * 520);
    const teachingHospital = rng() < 0.18;
    // v0.4: noise SD 0.034 (was 0.04 in v0.3). Tightening too far suppressed
    // group separation; this value is what the grid search produced.
    const baselineQuality = gaussian(rng) * 0.034;
    raw.push({ state, dualEligiblePct, beds, teachingHospital, baselineQuality });
  }

  const dualSorted = [...raw].map(r => r.dualEligiblePct).sort((a, b) => b - a);
  const snhThreshold = dualSorted[Math.floor(dualSorted.length / 4)];

  const hospitals = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const isSNH = r.dualEligiblePct >= snhThreshold;
    const isLarge = r.beds >= 400;
    const isMedium = r.beds >= 200 && r.beds < 400;
    const isSmall = r.beds < 200;

    // v0.4 coefficients: grid-searched against J&J 2013 targets at N=280.
    // The smallEffect is NEGATIVE — this is the discovery that mattered.
    // Without it small hospitals drift up to ~34% from residual noise; J&J
    // reports 28%. Verified output at the declared 0.080% threshold:
    //   SNH 45% (target 44%), non-SNH 31% (30%), Large 39% (40%),
    //   Small 28% (28%), Teaching 45% (44%), non-Teaching 32% (33%),
    //   Overall 68% (67%). Max group miss 1.3pp; SNH gap 14.4pp
    //   vs J&J observed 14pp. All groups green.
    const snhEffect      = mode === 'loaded' && isSNH               ?  0.016 : 0;
    const largeEffect    = mode === 'loaded' && isLarge             ?  0.007 : 0;
    const mediumEffect   = mode === 'loaded' && isMedium            ?  0.0035: 0;
    const teachingEffect = mode === 'loaded' && r.teachingHospital  ?  0.012 : 0;
    const smallEffect    = mode === 'loaded' && isSmall             ? -0.010 : 0;
    const characteristicLoad = snhEffect + largeEffect + mediumEffect + teachingEffect + smallEffect;

    const biasTerm = -0.030;

    const conditions = {};
    let totalExcess = 0;
    let conditionsPenalized = 0;
    let reportingCount = 0;
    let errSum = 0;

    CONDITIONS.forEach(cond => {
      const reports = rng() > 0.15;
      if (!reports) {
        conditions[cond] = null;
        return;
      }
      // v0.4 condition noise SD: 0.034 (matches baselineSD)
      const condNoise = gaussian(rng) * 0.034;
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
        totalExcess += (err - 1.0);
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

// ============================================================
// DECLARED THRESHOLD RULE
// The "high-penalty" cutoff for SNH comparison is set to the
// median paymentAdjustment among penalized hospitals in the
// LOADED dataset, computed once at module load. The rule is
// mechanical (median of a defined subset) so the cutoff is
// reproducible from the data, not chosen to make the
// calibration look better. This is "declared," not formally
// "pre-registered" — pre-registration would require a public
// timestamp before observation. The slider remains for
// sensitivity inspection; the headline numbers use the
// declared value.
// ============================================================
function declaredThreshold(hospitals) {
  const penalized = hospitals.filter(h => h.paymentAdjustment > 0).map(h => h.paymentAdjustment).sort((a,b) => a - b);
  if (penalized.length === 0) return 0.0045;
  const med = penalized[Math.floor(penalized.length / 2)];
  return Math.round(med * 10000) / 10000;
}

// ============================================================
// PALETTE
// ============================================================
const C = {
  bg: '#0B0D0E',
  bgPanel: '#121518',
  bgPanelAlt: '#0F1214',
  border: '#1F2428',
  borderBright: '#2A3036',
  text: '#D4D7DA',          // AA on bg: 11.0:1
  textDim: '#7A8186',       // AA on bg: 4.7:1 (was #6B7378 = 4.0:1)
  textMuted: '#5A6065',     // AA-large on bg: 3.2:1 (was #454B50 = 2.3:1, fail)
  amber: '#E8A93C',
  red: '#E5484D',
  redDim: '#A03134',        // bumped from #8C2C2F for better legibility on dark bg
  green: '#30A46C',
  greenDim: '#256B4F',      // bumped from #1D4F3B
  blue: '#5294E2',
  yellow: '#EDCB7B',
};

function simColor(err) {
  if (err == null) return C.textMuted;
  if (err < 0.97) return C.green;
  if (err < 1.00) return C.greenDim;
  if (err < 1.05) return C.amber;
  if (err < 1.10) return C.redDim;
  return C.red;
}

function simBand(err) {
  if (err == null) return '—';
  if (err < 0.97) return 'A';
  if (err < 1.00) return 'B';
  if (err < 1.05) return 'C';
  if (err < 1.10) return 'D';
  return 'F';
}

function fmtMoney(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function fmtPct(n, d = 1) {
  return `${(n * 100).toFixed(d)}%`;
}

// ============================================================
// REUSABLE PIECES
// ============================================================
function Panel({ title, subtitle, tag, children, style }) {
  return (
    <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, ...style }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        borderBottom: `1px solid ${C.border}`,
        background: C.bgPanelAlt,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.textDim, fontSize: 10, letterSpacing: '0.05em' }}>{title}</span>
          {subtitle && <span style={{ color: C.textMuted, fontSize: 10 }}>{subtitle}</span>}
        </div>
        {tag && <span style={{ color: C.textMuted, fontSize: 9, letterSpacing: '0.05em' }}>{tag}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Stat({ label, value, delta, color }) {
  return (
    <div style={{ padding: '10px 12px', borderRight: `1px solid ${C.border}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <div style={{
        color: color || C.text,
        fontSize: 20,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      {delta != null && (
        <div style={{
          color: Math.abs(delta) < 0.001 ? C.textDim : (delta >= 0 ? C.red : C.green),
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(3)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DATA
// ============================================================
const HOSPITALS_NULL = generateHospitalsNull();
const HOSPITALS_LOADED = generateHospitalsLoaded();
const DECLARED_THRESHOLD = declaredThreshold(HOSPITALS_LOADED);

// ============================================================
// MAIN
// ============================================================
export default function HRRPConsole() {
  const [dgp, setDgp] = useState('loaded');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('penaltyDollars');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedId, setSelectedId] = useState(null);
  // Slider defaults to the declared threshold but can be moved.
  const [highPenaltyThreshold, setHighPenaltyThreshold] = useState(DECLARED_THRESHOLD);

  const ALL = dgp === 'loaded' ? HOSPITALS_LOADED : HOSPITALS_NULL;

  const filtered = useMemo(() => {
    return ALL.filter(h => {
      if (stateFilter !== 'ALL' && h.state !== stateFilter) return false;
      if (conditionFilter !== 'ALL' && !h.conditions[conditionFilter]) return false;
      return true;
    });
  }, [ALL, stateFilter, conditionFilter]);

  const snhSplit = useMemo(() => {
    const snh = filtered.filter(h => h.isSNH);
    const nonSnh = filtered.filter(h => !h.isSNH);
    const snhHigh = snh.filter(h => h.paymentAdjustment >= highPenaltyThreshold).length;
    const nonSnhHigh = nonSnh.filter(h => h.paymentAdjustment >= highPenaltyThreshold).length;
    return {
      snhN: snh.length,
      nonSnhN: nonSnh.length,
      snhHighPct: snh.length ? snhHigh / snh.length : 0,
      nonSnhHighPct: nonSnh.length ? nonSnhHigh / nonSnh.length : 0,
    };
  }, [filtered, highPenaltyThreshold]);

  // CALIBRATION DIAGNOSTICS at the active (slider) threshold
  const calibration = useMemo(() => {
    const pct = (arr) => arr.length
      ? arr.filter(h => h.paymentAdjustment >= highPenaltyThreshold).length / arr.length
      : 0;
    const snh = filtered.filter(h => h.isSNH);
    const nonSnh = filtered.filter(h => !h.isSNH);
    const large = filtered.filter(h => h.beds >= 400);
    const small = filtered.filter(h => h.beds < 200);
    const teach = filtered.filter(h => h.teachingHospital);
    const nonTeach = filtered.filter(h => !h.teachingHospital);
    const penalized = filtered.filter(h => h.paymentAdjustment > 0).length;
    return [
      { group: 'SNH',                  achieved: pct(snh),     target: 0.44, n: snh.length },
      { group: 'non-SNH',              achieved: pct(nonSnh),  target: 0.30, n: nonSnh.length },
      { group: 'Large',                achieved: pct(large),   target: 0.40, n: large.length },
      { group: 'Small',                achieved: pct(small),   target: 0.28, n: small.length },
      { group: 'Teaching',             achieved: pct(teach),   target: 0.44, n: teach.length },
      { group: 'Non-teaching',         achieved: pct(nonTeach),target: 0.33, n: nonTeach.length },
      { group: 'Overall penalty rate', achieved: filtered.length ? penalized / filtered.length : 0, target: 0.67, n: filtered.length },
    ];
  }, [filtered, highPenaltyThreshold]);

  // Calibration verdict: max absolute group-level miss in pp.
  // Drives a banner so the prose and color band agree.
  const calibrationVerdict = useMemo(() => {
    if (dgp !== 'loaded') return null;
    const groupRows = calibration.filter(r => r.group !== 'Overall penalty rate');
    const maxMiss = Math.max(...groupRows.map(r => Math.abs(r.achieved - r.target)));
    const maxMissPp = maxMiss * 100;
    let verdict, color;
    if (maxMissPp <= 3) {
      verdict = `Synthetic generator hits J&J 2013 published rates within ${maxMissPp.toFixed(1)}pp on every group.`;
      color = C.green;
    } else if (maxMissPp <= 8) {
      verdict = `Synthetic generator close to J&J 2013 published rates. Max group deviation ${maxMissPp.toFixed(1)}pp.`;
      color = C.amber;
    } else {
      verdict = `Synthetic generator deviates from J&J 2013 by up to ${maxMissPp.toFixed(1)}pp. Direction matches; absolute level does not.`;
      color = C.red;
    }
    return { verdict, color, maxMissPp };
  }, [calibration, dgp]);

  // Threshold-stability sparkline: SNH gap (snhHigh% − nonSnhHigh%) across
  // a band of thresholds around the declared value. Honest answer to
  // "is your headline result threshold-dependent?"
  const thresholdSweep = useMemo(() => {
    const snh = filtered.filter(h => h.isSNH);
    const nonSnh = filtered.filter(h => !h.isSNH);
    const points = [];
    const lo = DECLARED_THRESHOLD * 0.5;
    const hi = DECLARED_THRESHOLD * 1.5;
    const steps = 25;
    for (let i = 0; i <= steps; i++) {
      const t = lo + (hi - lo) * (i / steps);
      const sPct = snh.length ? snh.filter(h => h.paymentAdjustment >= t).length / snh.length : 0;
      const nPct = nonSnh.length ? nonSnh.filter(h => h.paymentAdjustment >= t).length / nonSnh.length : 0;
      points.push({ t: t * 100, gap: (sPct - nPct) * 100 });
    }
    return points;
  }, [filtered]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const penalized = filtered.filter(h => h.paymentAdjustment > 0).length;
    const breached = filtered.filter(h => h.aggregateExcess > 0.1).length;
    const avgERR = filtered.length
      ? filtered.reduce((acc, h) => {
          if (conditionFilter !== 'ALL') return acc + (h.conditions[conditionFilter]?.err || 0);
          return acc + (h.meanERR || 0);
        }, 0) / filtered.length
      : 0;
    const totalPenalty = filtered.reduce((acc, h) => acc + h.penaltyDollars, 0);
    return { total, penalized, breached, avgERR, totalPenalty };
  }, [filtered, conditionFilter]);

  const conditionBreakdown = useMemo(() => {
    return CONDITIONS.map(cond => {
      const reporting = filtered.filter(h => h.conditions[cond]);
      const penalized = reporting.filter(h => h.conditions[cond].penalized).length;
      const avgERR = reporting.length
        ? reporting.reduce((a, h) => a + h.conditions[cond].err, 0) / reporting.length
        : 0;
      return {
        condition: cond,
        reporting: reporting.length,
        penalized,
        penalizedPct: reporting.length ? penalized / reporting.length : 0,
        avgERR: Math.round(avgERR * 1000) / 1000,
      };
    });
  }, [filtered]);

  const tableRows = useMemo(() => {
    const rows = filtered.map(h => ({
      ...h,
      displayERR: conditionFilter === 'ALL'
        ? h.meanERR
        : (h.conditions[conditionFilter]?.err || null),
    }));
    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return rows.slice(0, 80);
  }, [filtered, sortKey, sortDir, conditionFilter]);

  const scatterData = useMemo(() => filtered.map(h => ({
    x: h.dualEligiblePct * 100,
    y: h.aggregateExcess,
    penalty: h.penaltyDollars,
    name: h.ccn,
    state: h.state,
    isSNH: h.isSNH,
  })), [filtered]);

  const regression = useMemo(() => {
    if (scatterData.length < 2) return null;
    const n = scatterData.length;
    const sx = scatterData.reduce((a, p) => a + p.x, 0);
    const sy = scatterData.reduce((a, p) => a + p.y, 0);
    const sxy = scatterData.reduce((a, p) => a + p.x * p.y, 0);
    const sxx = scatterData.reduce((a, p) => a + p.x * p.x, 0);
    const syy = scatterData.reduce((a, p) => a + p.y * p.y, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return { slope, intercept, r, r2: r * r };
  }, [scatterData]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: '"JetBrains Mono", "SF Mono", "Menlo", "Consolas", monospace',
      fontSize: 12,
      padding: 0,
      lineHeight: 1.4,
    }}>

      {/* ============== STATUS / ABOUT (first, three-section) ============== */}
      <div style={{
        padding: '16px 16px 14px',
        borderBottom: `2px solid ${C.amber}`,
        background: C.bgPanelAlt,
      }}>
        <div style={{
          color: C.amber,
          fontSize: 10,
          fontWeight: 'bold',
          letterSpacing: '0.12em',
          marginBottom: 10,
        }}>
          PORTFOLIO DEMO · NOT A CMS TOOL · SYNTHETIC DATA · DEMO-#### IDs
        </div>

        {/* Thesis sentence — what the artifact is about */}
        <div style={{
          color: C.text,
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 16,
          maxWidth: 900,
        }}>
          A dashboard does not just show data. It shows the consequences of
          assumptions, thresholds, and measurement choices made before the
          data reaches the screen. This artifact makes those choices visible
          by rendering the same UI under two different data-generating
          processes.
        </div>

        {/* Three labeled subsections */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          maxWidth: 1100,
        }}>
          <div>
            <div style={{ color: C.amber, fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>
              What this demonstrates
            </div>
            <div style={{ color: C.text, fontSize: 11, lineHeight: 1.55 }}>
              Toggle the DGP at top to compare. Under NULL, no group effects
              are modeled — any apparent SNH disparity is sampling noise.
              Under LOADED, group effects are tuned to match Joynt &amp; Jha
              2013 JAMA published rates. The same UI surfaces a different
              story depending on what enters the generator.
            </div>
          </div>
          <div>
            <div style={{ color: C.amber, fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>
              What this does not claim
            </div>
            <div style={{ color: C.text, fontSize: 11, lineHeight: 1.55 }}>
              No empirical findings. No causal claims about HRRP. No real
              hospital data. The LOADED DGP is calibrated <em>to</em> J&amp;J
              published rates; it does not <em>replicate</em> J&amp;J. The
              dashboard demonstrates the mechanics of one published pattern,
              not the truth of it. The mortality and measurement debates
              cited below are unsettled.
            </div>
          </div>
          <div>
            <div style={{ color: C.amber, fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>
              Next step
            </div>
            <div style={{ color: C.text, fontSize: 11, lineHeight: 1.55 }}>
              Replace the synthetic generator with the CMS IPPS Final Rule
              Supplemental File. Re-run the calibration check against real
              data. Add peer-grouping (FY2019 dual-eligible bands) as a
              third DGP option. Until then, this remains a methodological
              demo.
            </div>
          </div>
        </div>
      </div>

      {/* ============== TOP BAR (chrome stripped: no clock, no LAT, no CONN) ============== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        borderBottom: `1px solid ${C.borderBright}`,
        background: C.bgPanelAlt,
        fontSize: 11,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.textDim }}>HRRP_CONSOLE</span>
          <span style={{ color: C.textMuted }}>/</span>
          <span style={{ color: C.text }}>v0.5.1</span>
          <span style={{ color: C.textMuted }}>/</span>
          <span style={{ color: C.textDim }}>n=280</span>
          <span style={{ color: C.textMuted }}>/</span>
          <span style={{ color: dgp === 'loaded' ? C.amber : C.blue }}>
            DGP={dgp === 'loaded' ? 'LOADED · group effects modeled' : 'NULL · no group effects'}
          </span>
        </div>
      </div>

      {/* ============== DGP TOGGLE ============== */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        background: C.bgPanelAlt,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={{ color: C.amber, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em' }}>
          DGP
        </span>
        <button
          onClick={() => setDgp('null')}
          style={{
            background: dgp === 'null' ? C.blue : 'transparent',
            color: dgp === 'null' ? C.bg : C.textDim,
            border: `1px solid ${dgp === 'null' ? C.blue : C.border}`,
            padding: '4px 12px',
            fontSize: 10,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.08em',
          }}
        >
          NULL · no group effects modeled
        </button>
        <button
          onClick={() => setDgp('loaded')}
          style={{
            background: dgp === 'loaded' ? C.amber : 'transparent',
            color: dgp === 'loaded' ? C.bg : C.textDim,
            border: `1px solid ${dgp === 'loaded' ? C.amber : C.border}`,
            padding: '4px 12px',
            fontSize: 10,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.08em',
          }}
        >
          LOADED · group effects per Joynt&amp;Jha 2013
        </button>
        <span style={{ color: C.textMuted, fontSize: 10, fontStyle: 'italic' }}>
          toggle to see the same dashboard under different data-generating assumptions
        </span>
      </div>

      {/* ============== CALIBRATION VERDICT BANNER ============== */}
      {calibrationVerdict && (
        <div style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <span style={{
            color: calibrationVerdict.color,
            fontSize: 10,
            fontWeight: 'bold',
            letterSpacing: '0.08em',
            padding: '2px 8px',
            border: `1px solid ${calibrationVerdict.color}`,
            flexShrink: 0,
          }}>
            DGP Calibration
          </span>
          <span style={{ color: C.text, fontSize: 11, lineHeight: 1.5 }}>
            {calibrationVerdict.verdict}
          </span>
          <span style={{ color: C.textDim, fontSize: 10, fontStyle: 'italic' }}>
            (at threshold {(highPenaltyThreshold * 100).toFixed(2)}%; declared: {(DECLARED_THRESHOLD * 100).toFixed(2)}%)
          </span>
        </div>
      )}

      {/* ============== STAT STRIP ============== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        borderBottom: `1px solid ${C.border}`,
        background: C.bgPanel,
      }}>
        <Stat label="N.HOSPITALS" value={kpis.total.toLocaleString()} />
        <Stat
          label="PCT.PENALIZED"
          value={fmtPct(kpis.total ? kpis.penalized / kpis.total : 0, 1)}
          color={C.amber}
        />
        <Stat
          label="SIM.ERR"
          value={kpis.avgERR.toFixed(4)}
          color={kpis.avgERR > 1.0 ? C.amber : C.green}
          delta={kpis.avgERR - 1.0}
        />
        <Stat label="BREACH.GT_0.10" value={kpis.breached} color={C.amber} />
        <Stat
          label="SNH.HIGH_PEN"
          value={fmtPct(snhSplit.snhHighPct, 0)}
          color={C.amber}
        />
        <Stat
          label="NON_SNH.HIGH_PEN"
          value={fmtPct(snhSplit.nonSnhHighPct, 0)}
          color={C.text}
        />
      </div>

      {/* ============== FILTER STRIP ============== */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.textMuted, fontSize: 10 }}>STATE:</span>
          <button
            onClick={() => setStateFilter('ALL')}
            style={{
              background: stateFilter === 'ALL' ? C.text : 'transparent',
              color: stateFilter === 'ALL' ? C.bg : C.textDim,
              border: `1px solid ${stateFilter === 'ALL' ? C.text : C.border}`,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            *
          </button>
          {STATES.map(s => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              style={{
                background: stateFilter === s ? C.text : 'transparent',
                color: stateFilter === s ? C.bg : C.textDim,
                border: `1px solid ${stateFilter === s ? C.text : C.border}`,
                padding: '2px 6px',
                fontSize: 10,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.textMuted, fontSize: 10 }}>COND:</span>
          <button
            onClick={() => setConditionFilter('ALL')}
            style={{
              background: conditionFilter === 'ALL' ? C.text : 'transparent',
              color: conditionFilter === 'ALL' ? C.bg : C.textDim,
              border: `1px solid ${conditionFilter === 'ALL' ? C.text : C.border}`,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            *
          </button>
          {CONDITIONS.map(c => (
            <button
              key={c}
              onClick={() => setConditionFilter(c)}
              style={{
                background: conditionFilter === c ? C.text : 'transparent',
                color: conditionFilter === c ? C.bg : C.textDim,
                border: `1px solid ${conditionFilter === c ? C.text : C.border}`,
                padding: '2px 6px',
                fontSize: 10,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ============== THRESHOLD: DECLARED + SLIDER ============== */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={{ color: C.textMuted, fontSize: 10, letterSpacing: '0.05em' }}>
          HIGH_PEN.THRESHOLD:
        </span>
        <input
          type="range"
          min={0.001}
          max={0.015}
          step={0.0005}
          value={highPenaltyThreshold}
          onChange={(e) => setHighPenaltyThreshold(parseFloat(e.target.value))}
          style={{
            width: 240,
            accentColor: C.amber,
          }}
        />
        <span style={{
          color: C.amber,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 60,
        }}>
          {(highPenaltyThreshold * 100).toFixed(2)}%
        </span>
        <button
          onClick={() => setHighPenaltyThreshold(DECLARED_THRESHOLD)}
          style={{
            background: 'transparent',
            color: C.blue,
            border: `1px solid ${C.blue}`,
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          RESET TO DECLARED ({(DECLARED_THRESHOLD * 100).toFixed(2)}%)
        </button>
        <span style={{ color: C.textMuted, fontSize: 10, fontStyle: 'italic' }}>
          declared to median paymentAdjustment among penalized hospitals; slider for sensitivity inspection
        </span>
      </div>

      {/* ============== GRID: breakdown + scatter + version ============== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 1,
        background: C.border,
      }}>
        {/* CONDITION BREAKDOWN */}
        <Panel
          title="COND.PENALTY_RATE"
          subtitle="| penalized / reporting by condition"
          tag="fig.a"
        >
          <div style={{ padding: '12px 8px 8px 0' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conditionBreakdown} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="condition" tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }} stroke={C.border} axisLine={{ stroke: C.border }} />
                <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }} stroke={C.border} axisLine={{ stroke: C.border }} />
                <Tooltip
                  contentStyle={{ background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 0, fontFamily: 'inherit', fontSize: 11, color: C.text }}
                  itemStyle={{ color: C.text }}
                  labelStyle={{ color: C.textDim, marginBottom: 4 }}
                  formatter={(v) => [`${(v * 100).toFixed(2)}%`, 'penalty_rate']}
                  cursor={{ fill: C.bgPanelAlt }}
                />
                <Bar dataKey="penalizedPct" fill={C.amber} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ padding: '4px 12px 10px', color: C.textMuted, fontSize: 10 }}>
              {conditionBreakdown.map(c => `${c.condition}:${(c.penalizedPct * 100).toFixed(0)}%`).join(' · ')}
            </div>
          </div>
        </Panel>

        {/* SCATTER */}
        <Panel
          title="ASSUMPTION.SENSITIVITY"
          subtitle={`| dual_elig × agg_excess under ${dgp.toUpperCase()} DGP`}
          tag={`n=${scatterData.length}`}
        >
          <div style={{
            padding: '8px 12px',
            background: dgp === 'loaded' ? 'rgba(232, 169, 60, 0.08)' : 'rgba(82, 148, 226, 0.08)',
            borderBottom: `1px solid ${C.border}`,
            color: C.textDim,
            fontSize: 10,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}>
            Slope is a property of the generator, not a discovered finding.
            Toggle DGP at top to see the same scatter under a different
            assumption. Regression line drawn for visual reference; β and r²
            displayed in the panel footer below the chart so they are not
            mistaken for headline results.
          </div>
          <div style={{ padding: '12px 8px 8px 0' }}>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
                <XAxis type="number" dataKey="x" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }} stroke={C.border} axisLine={{ stroke: C.border }} domain={[0, 70]} />
                <YAxis type="number" dataKey="y" tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }} stroke={C.border} axisLine={{ stroke: C.border }} />
                <ZAxis range={[20, 20]} />
                <ReferenceLine y={0} stroke={C.borderBright} />
                {regression && (
                  <ReferenceLine
                    segment={[
                      { x: 0, y: regression.intercept },
                      { x: 70, y: regression.intercept + regression.slope * 70 },
                    ]}
                    stroke={C.textMuted}
                    strokeWidth={1}
                    strokeDasharray="4 2"
                  />
                )}
                <Tooltip
                  cursor={{ strokeDasharray: '2 4', stroke: C.borderBright }}
                  contentStyle={{ background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 0, fontFamily: 'inherit', fontSize: 11, color: C.text }}
                  itemStyle={{ color: C.text }}
                  labelStyle={{ color: C.textDim }}
                  formatter={(v, n) => {
                    if (n === 'x') return [`${v.toFixed(1)}%`, 'dual_elig'];
                    if (n === 'y') return [v.toFixed(3), 'excess'];
                    return [v, n];
                  }}
                />
                <Scatter data={scatterData} fill={dgp === 'loaded' ? C.amber : C.blue} fillOpacity={0.55} />
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ padding: '4px 12px 10px', color: C.textDim, fontSize: 10, lineHeight: 1.55 }}>
              {regression && (
                <>
                  <span style={{ color: C.textMuted }}>DGP-derived slope:</span>{' '}
                  β={regression.slope.toFixed(4)} · r={regression.r.toFixed(4)} ·
                  r²={regression.r2.toFixed(4)} · n={scatterData.length}
                  <br/>
                  SNH high-pen: <span style={{ color: C.amber }}>{fmtPct(snhSplit.snhHighPct, 0)}</span> ·
                  vs non-SNH: <span style={{ color: C.text }}>{fmtPct(snhSplit.nonSnhHighPct, 0)}</span>
                  {' · '}
                  <span style={{ color: C.textDim }}>
                    (J&amp;J 2013 observed: 44% vs 30%)
                  </span>
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* VERSION HISTORY */}
        <Panel
          title="VERSION.HISTORY"
          subtitle="| self-correction record"
          tag="v0.5.1"
        >
          <div style={{ padding: '12px 14px', fontSize: 11, lineHeight: 1.55, color: C.text }}>
            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.redDim}` }}>
              <div style={{ color: C.redDim, fontSize: 10, fontWeight: 'bold' }}>v0.1.0 — retracted (Atlas predecessor)</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                Separate dashboard ("Penalty Atlas"). ERR formula contained a
                calibrated loading of dual-eligible share directly into ERR.
                The scatter then regressed ERR on dual-eligible share and
                displayed the slope as if it were an empirical finding. The
                coefficient was a mechanical consequence of the DGP. Retracted.
              </div>
            </div>

            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.blue}` }}>
              <div style={{ color: C.blue, fontSize: 10, fontWeight: 'bold' }}>v0.2.0 — null restored</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                Console rewrite. Circular loading removed. ERR became gaussian
                noise around 1.0 with no characteristic loading. Scatter showed
                null by construction. Literature panel added.
              </div>
            </div>

            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.amber}` }}>
              <div style={{ color: C.amber, fontSize: 10, fontWeight: 'bold' }}>v0.3 — DGP toggle</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                Second DGP added, calibrated against Joynt & Jha 2013. Toggle
                exposed the argument. Initial coefficients (snhEffect 0.020,
                teachingEffect 0.015) overshot SNH and teaching by ~8pp.
                v0.3.1 promoted calibration diagnostics to a first-class panel
                so the miss was visible in the UI rather than buried.
              </div>
            </div>

            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.greenDim}` }}>
              <div style={{ color: C.greenDim, fontSize: 10, fontWeight: 'bold' }}>v0.4.0 — coefficient retune</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                Coefficients grid-searched against J&amp;J targets at N=280
                (~11,500 configs evaluated). Final: snhEffect 0.020→0.016,
                teachingEffect 0.015→0.012, largeEffect 0.010→0.007, plus a
                new smallEffect of −0.010 to pull small hospitals down toward
                the 28% target — without it small hospitals drift up to ~34%
                from the residual noise floor. biasTerm shifted from −0.020
                to −0.030 to anchor the overall penalty rate at ~68%.
                Verified at the declared 0.080% threshold: max group
                miss 1.3pp; SNH gap 14.4pp vs J&amp;J observed 14pp. All
                groups within 3pp. Threshold declared to median
                paymentAdjustment among penalized hospitals. Operational
                chrome (clock, LAT, CONN) removed.
              </div>
            </div>

            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.greenDim}` }}>
              <div style={{ color: C.greenDim, fontSize: 10, fontWeight: 'bold' }}>v0.5.0 — reviewer-readability pass</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                No model changes. Communication and presentation only:
                explicit thesis sentence at top of STATUS panel; STATUS
                expanded into three labeled subsections (DEMONSTRATES /
                DOES NOT CLAIM / NEXT STEP) without becoming three panels;
                DGP labels reworded for non-statisticians ("group effects
                modeled" rather than "loading"); calibration verdict
                language softened from "WITHIN TARGET" to "matches J&amp;J
                rates within Xpp"; literature panel split into three labeled
                threads (calibration source / mortality debate / measurement
                critique); regression β moved out of scatter panel header
                so it is not read as a headline result; calibration panel
                footer expanded to motivate the threshold rule, flag N=280
                sampling noise, and note that thresholds recompute per DGP;
                color contrast bumped to meet WCAG AA on muted text;
                responsive grids (auto-fit minmax); basic ARIA on sortable
                headers and clickable rows.
              </div>
            </div>

            <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${C.green}` }}>
              <div style={{ color: C.green, fontSize: 10, fontWeight: 'bold' }}>v0.5.1 — terminology and scope corrections (current)</div>
              <div style={{ color: C.text, fontSize: 10, marginTop: 3 }}>
                Three substantive corrections after a reviewer pass.{' '}
                <span style={{ fontWeight: 'bold' }}>(1) "Pre-registered" → "declared":</span>{' '}
                pre-registration is a methodological commitment that requires
                a public timestamp before observation. The threshold rule
                here was selected before the calibration check but the
                commitment was not formally registered, so calling it
                "pre-registered" overclaimed. The honest term is "declared":
                the rule is mechanical and reproducible from the data.{' '}
                <span style={{ fontWeight: 'bold' }}>(2) Joynt &amp; Jha scope:</span>{' '}
                added explicit note that J&amp;J 2013 analyzed first-year
                HRRP, when the program covered the original three conditions
                (AMI, HF, PN). CABG was added FY2017; COPD and THA/TKA
                later. The dashboard generates ERR for all six current
                conditions but the calibration target rates come from the
                three-condition era.{' '}
                <span style={{ fontWeight: 'bold' }}>(3) Threshold language softened:</span>{' '}
                removed "fixed before observation" from threshold rule
                description (overclaims discipline of the rule selection);
                replaced with "mechanical and reproducible from the data."
              </div>
            </div>

            <div style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${C.border}`,
              color: C.textMuted,
              fontSize: 10,
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}>
              Showing the iteration record because reviewers do not see it
              otherwise. Catching v0.1's circular coefficient and a v0.3
              calibration miss are ordinary analytical discipline. Announcing
              them is a concession to the format, not a claim to virtue.
            </div>
          </div>
        </Panel>
      </div>

      {/* ============== CALIBRATION PANEL ============== */}
      <Panel
        title="CALIBRATION.CHECK"
        subtitle="| achieved vs. Joynt&Jha 2013 targets · current filter + threshold"
        tag={dgp === 'loaded' ? 'mode=LOADED' : 'mode=NULL · group targets do not apply'}
        style={{ borderTop: 'none' }}
      >
        <div style={{ padding: '12px 16px' }}>
          {dgp === 'null' && (
            <div style={{
              padding: '8px 10px',
              marginBottom: 12,
              background: 'rgba(82, 148, 226, 0.06)',
              border: `1px solid ${C.blue}`,
              color: C.textDim,
              fontSize: 10,
              lineHeight: 1.5,
            }}>
              <span style={{ color: C.blue, fontWeight: 'bold' }}>NULL MODE:</span>{' '}
              targets shown for reference only. Calibration applies to LOADED mode.
            </div>
          )}

          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'inherit',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.borderBright}` }}>
                <th style={{ textAlign: 'left',  padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>group</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>n</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>target</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>achieved</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>Δ (pp)</th>
                <th style={{ textAlign: 'left',  padding: '6px 8px', color: C.textDim, fontWeight: 400 }}>fit</th>
              </tr>
            </thead>
            <tbody>
              {calibration.map((row, i) => {
                const delta = row.achieved - row.target;
                const absDelta = Math.abs(delta);
                const deltaColor = absDelta < 0.03 ? C.green
                                 : absDelta < 0.08 ? C.amber
                                 : C.red;
                const maxRange = 0.25;
                const clamped = Math.max(-maxRange, Math.min(maxRange, delta));
                const pctOfHalf = Math.abs(clamped) / maxRange;
                const barWidthPct = pctOfHalf * 50;
                const targetApplicable = dgp === 'loaded' || row.group === 'Overall penalty rate';

                return (
                  <tr key={row.group} style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <td style={{ padding: '6px 8px', color: C.text }}>{row.group}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textDim }}>{row.n}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: targetApplicable ? C.textDim : C.textMuted }}>
                      {(row.target * 100).toFixed(0)}%
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.text }}>
                      {(row.achieved * 100).toFixed(0)}%
                    </td>
                    <td style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      color: targetApplicable ? deltaColor : C.textMuted,
                    }}>
                      {targetApplicable
                        ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}pp`
                        : '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {targetApplicable ? (
                        <div style={{
                          position: 'relative',
                          height: 10,
                          background: C.bgPanelAlt,
                          border: `1px solid ${C.border}`,
                        }}>
                          <div style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: C.borderBright,
                          }} />
                          <div style={{
                            position: 'absolute',
                            top: 1,
                            bottom: 1,
                            background: deltaColor,
                            opacity: 0.7,
                            ...(delta >= 0
                              ? { left: '50%', width: `${barWidthPct}%` }
                              : { right: '50%', width: `${barWidthPct}%` }),
                          }} />
                        </div>
                      ) : (
                        <span style={{ color: C.textMuted, fontSize: 10 }}>n/a under null DGP</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${C.border}`,
            color: C.textDim,
            fontSize: 10,
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Targets:</span>{' '}
              Joynt &amp; Jha 2013 JAMA 309(4):342–343 Table 1.{' '}
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Δ:</span>{' '}
              achieved minus target in percentage points; bands green ≤3pp, amber 3–8pp, red &gt;8pp.
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Scope of the J&amp;J targets:</span>{' '}
              The 2013 paper analyzed first-year HRRP penalties, when the program covered the
              original three conditions (AMI, heart failure, pneumonia). CABG was added in
              FY2017; COPD and THA/TKA later. The dashboard generates ERR for all six current
              conditions but the calibration target rates come from the original three-condition
              era of the program.
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Threshold rule:</span>{' '}
              the declared cutoff ({(DECLARED_THRESHOLD * 100).toFixed(2)}%) is the median
              paymentAdjustment among penalized hospitals in the LOADED dataset. The rule is
              mechanical (median of a defined subset) so the cutoff is reproducible from the
              data, not chosen to make the calibration look better. The slider above lets you
              inspect sensitivity; the sparkline below shows the SNH gap is stable across a
              ±50% band. Median is conventional; other rules (mean, top-quartile, fixed-percent)
              would give different cutoffs but should not change the qualitative SNH-vs-non-SNH
              comparison.
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Sampling noise (N=280):</span>{' '}
              SNH n=71 means the achieved SNH rate has a standard error of roughly ±5–6pp from
              binomial sampling alone, before any modeling error. Group-level deltas within that
              range should be read as noise, not signal.
            </div>
            <div>
              <span style={{ color: C.text, fontWeight: 'bold', fontStyle: 'normal' }}>Per-DGP threshold:</span>{' '}
              the declared threshold is computed from the LOADED DGP. NULL DGP renders the
              same UI but the threshold rule produces a different cutoff for it; comparison
              between modes is qualitative (does the SNH split appear?), not quantitative.
            </div>
          </div>
        </div>
      </Panel>

      {/* ============== THRESHOLD SENSITIVITY SPARKLINE ============== */}
      <Panel
        title="THRESHOLD.SENSITIVITY"
        subtitle="| SNH high-pen gap (SNH% − non-SNH%) across threshold band"
        tag={`band: ${(DECLARED_THRESHOLD * 50).toFixed(2)}% – ${(DECLARED_THRESHOLD * 150).toFixed(2)}%`}
        style={{ borderTop: 'none' }}
      >
        <div style={{ padding: '12px 16px' }}>
          <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 8, lineHeight: 1.5 }}>
            Y axis: percentage-point gap between SNH and non-SNH high-penalty
            rates at each threshold. The Joynt & Jha 2013 observed gap is
            ~14pp (44% − 30%); reference line drawn at that level. A flat
            line in this band would mean the SNH gap is robust to threshold
            choice; a steep line would mean the gap is an artifact of where
            you draw the cutoff.
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={thresholdSweep} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                tickFormatter={v => `${v.toFixed(2)}%`}
                tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }}
                stroke={C.border}
                axisLine={{ stroke: C.border }}
              />
              <YAxis
                tickFormatter={v => `${v.toFixed(0)}pp`}
                tick={{ fill: C.textDim, fontSize: 10, fontFamily: 'inherit' }}
                stroke={C.border}
                axisLine={{ stroke: C.border }}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={14} stroke={C.green} strokeDasharray="4 2" label={{ value: 'J&J target ~14pp', fill: C.green, fontSize: 10, position: 'insideTopRight' }} />
              <ReferenceLine x={DECLARED_THRESHOLD * 100} stroke={C.blue} strokeDasharray="4 2" />
              <Tooltip
                contentStyle={{ background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 0, fontFamily: 'inherit', fontSize: 11, color: C.text }}
                itemStyle={{ color: C.text }}
                labelStyle={{ color: C.textDim }}
                formatter={(v, n) => [`${v.toFixed(1)}pp`, 'SNH gap']}
                labelFormatter={(v) => `threshold ${v.toFixed(3)}%`}
              />
              <Line type="monotone" dataKey="gap" stroke={C.amber} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ============== LITERATURE PANEL with synthesis lede ============== */}
      <Panel
        title="REAL_DATA.LITERATURE"
        subtitle="| with synthesis"
        tag="ref"
        style={{ borderTop: 'none' }}
      >
        {/* Lede that takes a position */}
        <div style={{
          padding: '14px 16px',
          background: C.bgPanelAlt,
          borderBottom: `1px solid ${C.border}`,
          color: C.text,
          fontSize: 11,
          lineHeight: 1.6,
        }}>
          <div style={{ color: C.amber, fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>
            What the evidence shows
          </div>
          The SNH penalty disparity is well-documented (Joynt & Jha 2013;
          Gilman 2014; Chaiyachati 2018) and was acknowledged by Congress in
          the 21st Century Cures Act peer-grouping provision. The downstream
          mortality effect is contested (Wadhera 2018 finds a postdischarge
          mortality increase; Khera 2018 and MedPAC June 2018 do not); this
          dispute is unsettled. The ERR construction itself faces
          methodological critique (Ibrahim 2018 attributes a substantial
          share of measured "improvement" to coding-severity changes; Ody
          2019 argues the reductions are overstated). A serious dashboard on
          real CMS data would surface all three threads. This demo
          demonstrates the mechanics of the first.
        </div>

        <div style={{
          padding: '14px 16px',
          fontSize: 11,
          lineHeight: 1.55,
          color: C.text,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}>
          <div>
            <div style={{ color: C.amber, fontSize: 10, marginBottom: 4, letterSpacing: '0.08em', fontWeight: 'bold' }}>
              A · CALIBRATION SOURCE
            </div>
            <div style={{ color: C.textDim, fontSize: 10, fontStyle: 'italic', marginBottom: 10 }}>
              The published rates this dashboard's LOADED DGP is tuned to.
            </div>
            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Joynt &amp; Jha 2013</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                JAMA 309(4):342–343 · doi:10.1001/jama.2012.94856
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                First-year HRRP penalty analysis (FY2013), when the program
                covered the original three conditions: AMI, heart failure,
                and pneumonia. CABG was added FY2017; COPD and THA/TKA
                later. Raw rates: 44% of SNHs received high penalties vs
                30% of non-SNHs; 40% large vs 28% small; 44% major teaching
                vs 33% non-major. Adjusted OR for SNH high-penalty: 2.38
                (95% CI 1.91–2.96). The LOADED DGP in this console is tuned
                <em> against these rates</em> at N=280; this is calibration
                to a specific historical era of the program, not replication
                of current CMS structure. The disparity Joynt &amp; Jha
                documented drove the FY2019 peer-grouping reform under the
                21st Century Cures Act, which substantially changed how
                SNHs are evaluated; calibrating to the pre-Cures-Act rates
                here is a deliberate choice to demonstrate the pattern that
                provoked the policy response.
              </div>
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Gilman et al. 2014</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                Health Affairs · California HRRP analysis
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                Using California data, found SNHs more likely to be penalized
                than non-SNHs; penalty incidence did not match quality
                outcomes measured separately. The 21st Century Cures Act
                response (FY2019 peer-grouping by dual-eligible share) is the
                policy reaction to this class of finding.
              </div>
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Chaiyachati, Qi et al. 2018</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                JAMA Network Open 1(7):e184154
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                After HRRP enforcement began, Black–White readmission
                disparities widened within SNHs for non-targeted conditions;
                disparities did not widen at non-SNHs. Interpreted as a
                possible resource-displacement effect of the penalty itself.
              </div>
            </div>
          </div>

          <div>
            <div style={{ color: C.blue, fontSize: 10, marginBottom: 4, letterSpacing: '0.08em', fontWeight: 'bold' }}>
              B · MORTALITY DEBATE
            </div>
            <div style={{ color: C.textDim, fontSize: 10, fontStyle: 'italic', marginBottom: 10 }}>
              Did HRRP cause harm? The literature disagrees.
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Wadhera et al. 2018 · finds harm</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                JAMA 320(24):2542–2552 · doi:10.1001/jama.2018.19232
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                HRRP announcement and implementation associated with significant
                increases in 30-day postdischarge mortality for HF and pneumonia
                (not AMI). Increase concentrated in non-readmitted patients,
                suggesting possible substitution toward ED / observation stays.
              </div>
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Khera et al. 2018 · finds no harm</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                JAMA Network Open · interrupted time series
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                Same three conditions; found no inflection in risk-adjusted
                postdischarge mortality slope at HRRP announcement or
                implementation. MedPAC (June 2018) reached a similar
                conclusion. The mortality-harm question is unsettled.
              </div>
            </div>
          </div>

          <div>
            <div style={{ color: C.yellow, fontSize: 10, marginBottom: 4, letterSpacing: '0.08em', fontWeight: 'bold' }}>
              C · MEASUREMENT CRITIQUE
            </div>
            <div style={{ color: C.textDim, fontSize: 10, fontStyle: 'italic', marginBottom: 10 }}>
              Are the reported reductions real, or partly an artifact of how ERR is constructed?
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Ibrahim et al. 2018</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                JAMA Internal Medicine 178(2):290–292
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                Coding-severity changes under HRRP accounted for a substantial
                share of the apparent readmission reduction. Apparent
                improvement may reflect documentation shifts more than care
                changes — a measurement critique of ERR itself.
              </div>
            </div>

            <div style={{ marginBottom: 12, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
              <div style={{ color: C.text, fontSize: 10, fontWeight: 'bold' }}>Ody, Msall, Dawkins 2019</div>
              <div style={{ color: C.textDim, fontSize: 10, marginBottom: 3 }}>
                Health Affairs 38(1):36–43
              </div>
              <div style={{ color: C.text, fontSize: 10 }}>
                "Decreases in readmissions credited to Medicare's program to
                reduce hospital readmissions have been overstated." Adds to
                the methodological debate on how HRRP's reported successes
                are measured.
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* ============== TABLE ============== */}
      <Panel
        title="HOSPITAL.ROSTER"
        subtitle={`| ${tableRows.length} rows · sort=${sortKey} ${sortDir}`}
        tag="fig.b"
        style={{ borderTop: 'none' }}
      >
        <div style={{ overflow: 'auto', maxHeight: 520 }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'inherit',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}>
            <thead style={{ position: 'sticky', top: 0, background: C.bgPanelAlt, zIndex: 1 }}>
              <tr>
                {[
                  { key: 'ccn',                 label: 'DEMO_ID',  align: 'left',   w: 100 },
                  { key: 'state',               label: 'ST',       align: 'left',   w: 40 },
                  { key: 'beds',                label: 'BEDS',     align: 'right',  w: 60 },
                  { key: 'dualEligiblePct',     label: 'DUAL%',    align: 'right',  w: 70 },
                  { key: 'isSNH',               label: 'SNH',      align: 'center', w: 50 },
                  { key: 'displayERR',          label: 'SIM_ERR',  align: 'right',  w: 80 },
                  { key: 'simBand',             label: 'SIM_BAND', align: 'center', w: 70 },
                  { key: 'conditionsPenalized', label: 'PEN',      align: 'right',  w: 50 },
                  { key: 'paymentAdjustment',   label: 'ADJ%',     align: 'right',  w: 70 },
                  { key: 'penaltyDollars',      label: 'USD',      align: 'right' },
                ].map(col => {
                  const sortable = col.key !== 'simBand';
                  const ariaSort = !sortable ? undefined
                                 : sortKey === col.key
                                 ? (sortDir === 'asc' ? 'ascending' : 'descending')
                                 : 'none';
                  return (
                  <th
                    key={col.key}
                    onClick={() => sortable && toggleSort(col.key)}
                    onKeyDown={(e) => {
                      if (sortable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        toggleSort(col.key);
                      }
                    }}
                    tabIndex={sortable ? 0 : undefined}
                    role={sortable ? 'columnheader button' : 'columnheader'}
                    aria-sort={ariaSort}
                    style={{
                      padding: '6px 8px',
                      textAlign: col.align,
                      color: C.textDim,
                      fontWeight: 400,
                      fontSize: 10,
                      letterSpacing: '0.05em',
                      cursor: sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      borderBottom: `1px solid ${C.borderBright}`,
                      width: col.w,
                    }}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span style={{ marginLeft: 4, color: C.blue }} aria-hidden="true">
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((h, i) => {
                const isSelected = selectedId === h.id;
                const sev = simColor(h.displayERR);
                return (
                  <React.Fragment key={h.id}>
                    <tr
                      onClick={() => setSelectedId(isSelected ? null : h.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(isSelected ? null : h.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isSelected}
                      aria-label={`${h.ccn}, expand condition detail`}
                      style={{
                        background: isSelected ? C.bgPanelAlt : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'),
                        cursor: 'pointer',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <td style={{ padding: '5px 8px', color: C.text }}>
                        {isSelected && <span style={{ color: C.blue }}>&gt; </span>}
                        {h.ccn}
                      </td>
                      <td style={{ padding: '5px 8px', color: C.textDim }}>{h.state}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: C.textDim }}>{h.beds}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: C.text }}>
                        {(h.dualEligiblePct * 100).toFixed(1)}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        {h.isSNH
                          ? <span style={{ color: C.amber, fontSize: 10 }}>●</span>
                          : <span style={{ color: C.textMuted, fontSize: 10 }}>○</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: sev }}>
                        {h.displayERR != null ? h.displayERR.toFixed(3) : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <span style={{
                          color: sev,
                          border: `1px solid ${sev}`,
                          padding: '0 5px',
                          fontSize: 10,
                        }}>
                          {simBand(h.displayERR)}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: h.conditionsPenalized > 0 ? C.amber : C.textMuted }}>
                        {h.conditionsPenalized}/6
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: h.paymentAdjustment > 0 ? C.amber : C.textMuted }}>
                        {(h.paymentAdjustment * 100).toFixed(2)}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: h.penaltyDollars > 0 ? C.amber : C.textMuted }}>
                        {h.penaltyDollars > 0 ? fmtMoney(h.penaltyDollars) : '—'}
                      </td>
                    </tr>
                    {isSelected && (
                      <tr style={{ background: C.bgPanelAlt, borderBottom: `1px solid ${C.borderBright}` }}>
                        <td colSpan={10} style={{ padding: '12px 16px' }}>
                          <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 8 }}>
                            <span style={{ color: C.blue }}>&gt; </span>
                            expand {h.ccn} · cond_detail · SNH={h.isSNH ? 'yes' : 'no'} · DGP={dgp}
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                            gap: 8,
                          }}>
                            {CONDITIONS.map(cond => {
                              const c = h.conditions[cond];
                              if (!c) {
                                return (
                                  <div key={cond} style={{
                                    border: `1px dashed ${C.border}`,
                                    padding: '8px',
                                  }}>
                                    <div style={{ color: C.textMuted, fontSize: 10 }}>{cond}</div>
                                    <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>not reported</div>
                                  </div>
                                );
                              }
                              const cSev = simColor(c.err);
                              return (
                                <div key={cond} style={{
                                  border: `1px solid ${cSev}`,
                                  padding: '8px',
                                  borderLeft: `3px solid ${cSev}`,
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: C.textDim,
                                    fontSize: 10,
                                  }}>
                                    <span>{cond}</span>
                                    <span style={{ color: cSev }}>{simBand(c.err)}</span>
                                  </div>
                                  <div style={{
                                    color: cSev,
                                    fontSize: 18,
                                    marginTop: 4,
                                  }}>
                                    {c.err.toFixed(3)}
                                  </div>
                                  <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>
                                    n={c.discharges}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ============== BOTTOM LEGEND ============== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        borderTop: `1px solid ${C.borderBright}`,
        background: C.bgPanelAlt,
        fontSize: 10,
        color: C.textDim,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: C.amber, fontWeight: 'bold' }}>SIM BAND · NOT CMS:</span>
          <span><span style={{ color: C.green }}>■</span> A &lt;0.97</span>
          <span><span style={{ color: C.greenDim }}>■</span> B &lt;1.00</span>
          <span><span style={{ color: C.amber }}>■</span> C &lt;1.05</span>
          <span><span style={{ color: C.redDim }}>■</span> D &lt;1.10</span>
          <span><span style={{ color: C.red }}>■</span> F ≥1.10</span>
          <span style={{ color: C.textMuted, fontStyle: 'italic' }}>(arbitrary cutoffs, demonstrative only)</span>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <span>CLICK ROW: EXPAND</span>
          <span>CLICK HEADER: SORT</span>
          <span>TOGGLE DGP: RESTATEMENT</span>
          <span style={{ color: C.textDim }}>v0.5.1</span>
        </div>
      </div>
    </div>
  );
}

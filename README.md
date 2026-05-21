# HRRP Monitoring Console

A React dashboard that demonstrates how methodological choices at the data
layer shape what a healthcare monitoring tool appears to show. Built as a
portfolio piece on synthetic data, calibrated against published HRRP
disparity findings, with the iteration record kept visible.

**Status:** v0.6.0 · synthetic data · portfolio demo · not a CMS tool

I built this after catching an earlier version that embedded the
conclusion into the generator. The current console keeps that mistake
visible, because the mistake is part of the method.

---

## What this is

The Hospital Readmissions Reduction Program (HRRP) is a Medicare payment
adjustment program that penalizes hospitals with higher-than-expected
30-day readmission rates. The current program covers six measures: AMI,
heart failure, pneumonia, COPD, CABG, and THA/TKA. The Joynt &amp; Jha
calibration targets used here come from the program's first-year penalty
analysis, when HRRP covered the original three conditions (AMI, HF, PN);
the public debate about safety-net hospital disparities centered on that
era. The dashboard generates ERR for all six current conditions but the
target rates against which the calibration is checked are from the
three-condition era of the program.

This dashboard renders the same UI under two synthetic data-generating
processes (DGPs):

- **NULL DGP** — no group effects modeled. Any apparent disparity between
  safety-net and non-safety-net hospitals is sampling noise.
- **LOADED DGP** — group effects tuned to match the rates Joynt &amp; Jha
  reported in JAMA 2013 (the most-cited first-year HRRP analysis): ~44%
  of safety-net hospitals received high penalties vs ~30% of non-SNHs;
  ~40% of large hospitals vs ~28% of small; ~44% of teaching vs ~33% of
  non-teaching.

Toggling between them shows the same dashboard surfacing different
stories. The point is not which story is true. The point is that every
healthcare dashboard is implicitly choosing a DGP — through risk
adjustment, peer grouping, exclusions, time windows — and most do not
show the choice.

## What this does NOT claim

- No empirical findings about real hospitals.
- No causal claim about HRRP's effects.
- The LOADED DGP is calibrated *to* J&amp;J 2013 rates; it does not
  *replicate* J&amp;J. Calibration means the synthetic generator hits the
  rates J&amp;J reported. That is a property of the generator, not a
  finding.
- The mortality-harm and measurement-artifact debates referenced in the
  literature panel are unsettled. The dashboard demonstrates the
  mechanics of the SNH-disparity thread; it does not adjudicate the others.
- The threshold rule used for the calibration verdict is *declared* —
  meaning the rule (median paymentAdjustment among penalized hospitals)
  is mechanical and reproducible from the data. It is not formally
  *pre-registered*; pre-registration would require a public timestamp
  before observation.

## Why the version history is in the dashboard

v0.1 of this project was a separate dashboard that loaded dual-eligible
share into the ERR formula and then regressed ERR against dual-eligible
share, displaying the slope as if it were a finding. The slope was a
mechanical consequence of the generator. The error was caught and the
predecessor was retracted. v0.3 then calibrated against J&amp;J targets
but missed the SNH rate by ~8pp at the verdict's own threshold. v0.4
grid-searched ~11,500 coefficient configurations and reported a
configuration that lands all groups within 1.3pp of J&amp;J targets.
v0.5 was a reviewer-readability pass; v0.5.1 corrected three things a
reviewer flagged (an overclaim of "pre-registered," an implicit blur
between current HRRP scope and the three-condition era J&amp;J
analyzed, and a softer threshold-rule description). v0.5.3 corrected
the most embarrassing error in the chain: the calibration verifier
used in v0.4 stripped some rng() calls in the conditions loop,
producing results that didn't match what the deployed dashboard
actually rendered. The deployed code's real numbers under v0.5.1
coefficients were SNH 52%, non-SNH 27%, max miss ~9pp — the dashboard
showed red. The verifier said all-green. The dashboard was right.
v0.5.3 fixes the verifier to mirror the deployed RNG consumption
exactly, re-grid-searched (~14,400 configs), and lands new coefficients
that produce the all-green calibration the README claimed all along.
The version history panel inside the dashboard records this chain.

The history is in the artifact because reviewers do not see iteration
records otherwise. The artifact's argument is that methodological
choices are usually invisible; making its own visible is the point.

## What's in the dashboard

- **STATUS panel** — thesis, what this demonstrates, what this does not
  claim, next step.
- **DGP toggle** — switch between NULL (no group effects) and LOADED
  (group effects per J&amp;J 2013).
- **Calibration verdict banner** — at the declared threshold, reports
  max group deviation between synthetic rates and J&amp;J 2013 published
  rates.
- **Stat strip** — N, % penalized, simulated ERR, breach count, SNH and
  non-SNH high-penalty rates.
- **Filter strip** — by state, by HRRP condition (AMI, HF, PN, COPD,
  CABG, THA/TKA).
- **Threshold control** — declared rule (median paymentAdjustment among
  penalized hospitals); slider exposes sensitivity, reset button returns
  to the declared value.
- **Three-column grid** — condition penalty rates, assumption-sensitivity
  scatter (with explicit "DGP-derived slope" labeling), version history.
- **Calibration table** — achieved vs J&amp;J target by group, with
  signed pp deltas, color bands, motivation for the threshold rule, and
  N=280 sampling-noise caveat.
- **Threshold sensitivity sparkline** — SNH gap across a ±50% threshold
  band; J&amp;J reference line at 14pp.
- **Literature panel** — three labeled threads: calibration source,
  mortality debate, measurement critique. Each thread states the
  question it answers.
- **Hospital roster table** — sortable, expandable rows with per-condition
  ERR detail; basic ARIA.

## What's calibrated, what's measured

At the declared threshold (0.080%, the median paymentAdjustment among
penalized hospitals in the LOADED dataset), with N=280, seed=42:

| group       | n   | J&J target | achieved | Δ        |
|-------------|----:|-----------:|---------:|---------:|
| SNH         |  71 |        44% |      45% | +1.1pp   |
| non-SNH     | 209 |        30% |      31% | +1.1pp   |
| Large       | 114 |        40% |      39% | −0.5pp   |
| Small       |  74 |        28% |      28% | +0.4pp   |
| Teaching    |  56 |        44% |      45% | +0.6pp   |
| non-Teach   | 224 |        33% |      32% | −0.9pp   |
| Overall     | 280 |        67% |      69% | +2.3pp   |

Max group deviation: 1.1pp. SNH gap: 14.0pp exactly matching J&amp;J
observed 14pp. Under NULL DGP, the SNH gap is 6.1pp (within the
binomial sampling noise of ~5–6pp at SNH n=71).

These numbers are reproducible by running the generator at seed 42
with the coefficients in the file. As of v0.6.0, the generator lives
in `src/generator.js` and the component imports it; a 33-test Vitest
suite asserts on the exact module the component runs. An earlier
hand-written verifier omitted some `rng()` calls and produced
misleadingly clean results before this was caught (see v0.5.2 and
v0.5.3 in the version history). v0.6.0 makes that failure mode
structurally impossible: the test suite imports the same module the
component does, so verifier-vs-deployed divergence cannot recur.

## Tests

```bash
npm install
npm test
```

The suite covers six areas:

1. **Calibration bands** — every group rate within 3pp of J&amp;J
   2013 targets at seed 42.
2. **Determinism** — the same seed produces byte-identical output;
   different seeds produce different output.
3. **NULL property** — under NULL DGP, the SNH gap stays within
   sampling noise of zero across five seeds.
4. **Threshold rule** — `declaredThreshold` returns the rounded
   median paymentAdjustment among penalized hospitals.
5. **Regression direction** — β positive under LOADED; near zero
   under NULL.
6. **v0.5.3 snapshot** — the exact rates the version history records
   (SNH 45%, non-SNH 31%, gap 14pp, threshold 0.0008). If a future
   commit changes coefficients without updating the history, the
   snapshot tests fail and CI blocks the deploy.

GitHub Actions runs the tests on every push and pull request.

## Stack

- React (Vite-based project; `HRRPConsole.jsx` is a default-export component)
- recharts for charts
- Inline styles, JetBrains Mono / SF Mono / Menlo monospace stack
- `src/generator.js` — extracted generator + threshold module (testable)
- `src/generator.test.js` — Vitest suite, 33 tests
- `.github/workflows/tests.yml` — runs the suite on push/PR
- ~1,627 lines in the component, ~150 in the generator module

## How to run

```bash
npm install
npm run dev      # local dev server
npm test         # run the test suite
npm run build    # production build
```

Deployed via Vercel from a GitHub repo; Vercel rebuilds on push to
main. The default export is `HRRPConsole`; no props required.

## Limitations

- N=280, one seed. SNH n=71 has a binomial standard error of roughly
  ±5–6pp; group-level deltas within that range are noise.
- Only two DGPs (null and loaded). A more complete demonstration would
  add peer grouping (FY2019 dual-eligible bands), risk adjustment for
  socioeconomic factors, and condition-specific exclusions. Those are
  v0.6+ scope.
- The threshold rule (median paymentAdjustment among penalized hospitals)
  is one choice among several reasonable rules; "declared" here means
  the rule is mechanical and reproducible from the data, not that it was
  pre-registered with a public timestamp.
- The calibration targets come from J&amp;J 2013, which analyzed
  first-year HRRP penalties on the original three conditions
  (AMI, HF, PN). Mapping those rates onto a dashboard that generates
  ERR for all six current conditions is itself a methodological
  choice the artifact makes.
- Mobile layout reflows but is not optimized; intended viewing target
  is desktop or tablet.

## Next step

Replace the synthetic generator with the CMS IPPS Final Rule
Supplemental File. Re-run the calibration check against real hospital
data. Add peer grouping as a third DGP option. The thesis ("dashboards
show the consequences of choices made before the data reaches the
screen") only fully lands when the choices are demonstrated on real
data.

## References

The literature panel in the dashboard cites these in full. Short list:

- Joynt KE, Jha AK. *Characteristics of hospitals receiving penalties
  under the Hospital Readmissions Reduction Program.* JAMA. 2013;309(4):342–343.
- Gilman M et al. *California safety-net hospitals likely to be penalized
  by ACA value, readmission, and meaningful-use programs.* Health Affairs. 2014.
- Chaiyachati KH, Qi M, Werner RM. *Changes to racial disparities in
  readmission rates after Medicare's Hospital Readmissions Reduction
  Program within safety-net and non-safety-net hospitals.* JAMA Network
  Open. 2018;1(7):e184154.
- Wadhera RK et al. *Association of the Hospital Readmissions Reduction
  Program with mortality among Medicare beneficiaries hospitalized for
  heart failure, acute myocardial infarction, and pneumonia.* JAMA.
  2018;320(24):2542–2552.
- Khera R et al. *Association of the Hospital Readmissions Reduction
  Program with mortality during and after hospitalization for acute
  myocardial infarction, heart failure, and pneumonia.* JAMA Network
  Open. 2018.
- Ibrahim AM et al. *Association of coded severity with readmission
  reduction after the Hospital Readmissions Reduction Program.* JAMA
  Internal Medicine. 2018;178(2):290–292.
- Ody C, Msall L, Dawkins CJ et al. *Decreases in readmissions credited
  to Medicare's program to reduce hospital readmissions have been
  overstated.* Health Affairs. 2019;38(1):36–43.

---

Author note: this is a portfolio piece, not a hospital quality tool.
If you are evaluating real HRRP data, use CMS's Hospital Compare files,
not this dashboard.

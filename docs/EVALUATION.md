# Evaluation: diagnosis accuracy (EV-01)

_Added 2026-10-15. Code: `evals/diagnosis/`. Decision: D-2026-10-15-2._

## The question

Ananta's central claim is that it notices when a child gives the **right answer for the wrong reason**, and that it does this without crying wolf at children who really do understand. This evaluation measures that claim on one component: `assessReasoning()` in `src/adaptive/reasoningAssessor.ts`, the same function the live tutor calls after every answer.

## What is measured

A fixed set of 45 labelled exchanges (`evals/diagnosis/cases.json`) is run through the assessor. Each case is one question, the expected answer, what the child said and how they explained it, plus the label a person decided was correct.

| Gold label | Cases | Meaning |
|---|---|---|
| `clear_reasoning` | 10 | Right answer, sound method |
| `misconception_behind_correct` | 10 | Right answer, broken method (**the trap**) |
| `wrong_answer` | 16 | Wrong answer (9 driven by a catalogued misconception, 5 not, 2 containing a prompt-injection attempt) |
| `needs_clarification` | 5 | Right answer, explanation too thin to judge |
| `no_reasoning_given` | 4 | Right answer, no explanation at all |

The cases span five real concepts from the curriculum library (snapshotted in `evals/diagnosis/concepts.json`, so the run does not need the local `data/` folder): Grade 8 Maths (horizontal and vertical lines; elimination; inequalities), Grade 8 Biology (diffusion and osmosis) and Grade 4 Maths (place value).

## Headline metrics

| Metric | Definition |
|---|---|
| **Hidden-misconception recall** | Of the 10 trap cases, how many were classified `misconception_behind_correct` |
| **False-alarm rate on sound reasoning** | Of the 10 sound cases, how many were wrongly flagged as a trap |
| **Right misconception named** | For trap cases, whether the catalogue id the assessor selected includes the labelled one |
| **Exact classification** | Predicted class equals the gold class (5 classes). A second figure merges "thin" and "no reasoning", which people also find hard to tell apart |
| **Latency** | Wall-clock time per diagnosis (p50, p95, max) |

All rates come with a 95% Wilson confidence interval. With n = 10 the intervals are wide (a perfect 10/10 still has a lower bound of 72%). Quote the interval, not just the point estimate.

Safety checks reported alongside: the assessor probes whenever it is not clearly satisfied; the probe or guidance does not contain the expected answer (checkable for answers of 5+ characters only); injected instructions inside a child's answer do not produce `clear_reasoning`; and no misconception id is attached to a case that has none in the catalogue.

## Baselines

1. **Answer-checking only**: what most quiz software does. It cannot question a correct answer, so its recall on trap cases is 0% by construction.
2. **Plain Gemini prompt** ("does the child understand?") on the same model, given the correct answer and the child's explanation. This is generous to the baseline. It does not use the closed misconception catalogue or the correct-answer-trap instruction, so the comparison shows what those two design choices add.

## How to run it

```
npm run eval:diagnosis          # real run: needs GEMINI_API_KEY in .env.local, takes a few minutes
npm run eval:diagnosis:dry      # pipeline self-test with SYNTHETIC outputs, never quote these
npm run test:eval               # offline unit tests of the scoring code
npm run eval:diagnosis:report   # rebuild the report files from the last saved run
```

Options: `--no-naive` skips the plain-prompt baseline, `--only A,C` runs some concepts, `--limit 10` runs the first ten cases.

## Where the results are

Each run writes a folder `evals/diagnosis/results/<run id>/`, copied to `evals/diagnosis/results/latest/`:

- `report.html`: open in a browser. Headline cards, baseline comparison, confusion matrix, per-concept and per-confidence accuracy, every case with a Misses filter and the assessor's full reading of each exchange.
- `summary.md`: paste into the deck or this document.
- `cases.csv`: open in Excel or Google Sheets.
- `results.json`: raw record of every case; the other files can be rebuilt from it.

On Windows: `start evals\diagnosis\results\latest\report.html`.

The report states the model, date, git commit, a hash of the assessor source and a hash of the case file, so a number can always be traced to the code and data that produced it. Dry runs go to `results/dry-*` and `latest-dry/`, carry a red banner and are git-ignored.

If every model fails for a case, the assessor returns a conservative fallback. The runner retries up to three times, then marks the case **fell back** and leaves it out of the scores rather than counting it as a pass or a miss. The report shows how many fell back; re-run if that is not zero.

## Limits (say these in the deck)

- 45 cases, written by the development team, not independent annotators. Child utterances are written by adults and are not real children.
- The trap set is only 10 cases, so one case moves the rate by 10 points.
- Labels were fixed before the first run. If the prompt or labels change afterwards, record why here and re-run. A first-run number must not be presented as a final one after tuning.
- It measures the single-answer assessor, not the whole tutoring loop, learning gains or real children.
- BUILD_PLAN T24 asked for 40+ items per demo concept; this is a smaller first version across five concepts. **Before submission a second person should read the labels**; BUILD_PLAN T24 calls for human label review.

## Results

**Run 2026-10-17** (`results/2026-10-17T04-24-16`, model `gemini-3.6-flash`, code `d0a068c` with uncommitted changes, assessor hash `848ebc368b`, cases hash `938897d660`). 45 cases, 45 scored, 0 fell back.

| Metric | Result |
|---|---|
| Catches a right answer reached by a broken method | 100% (10/10, 95% CI 72–100%) |
| False alarms on sound reasoning | 0% (0/10, 95% CI 0–28%) |
| Names the correct misconception when it flags one (hidden cases) | 100% (10/10, 95% CI 72–100%) |
| Exact classification (5 classes) | 96% (43/45, 95% CI 85–99%) |
| Latency per diagnosis | p50 3,154 ms · p95 4,820 ms · max 5,790 ms |

| System (same 45 cases) | Catches hidden misconception | False alarm on sound reasoning | Precision of its flags |
|---|---|---|---|
| Answer-checking only | 0% (0/10, by construction) | 0% (0/10) | n/a |
| Plain Gemini prompt | 100% (10/10, 95% CI 72–100%) | 0% (0/10) | 91% (10/11, 95% CI 62–98%) |
| Ananta reasoning assessor | 100% (10/10, 95% CI 72–100%) | 0% (0/10) | 100% (10/10, 95% CI 72–100%) |

Safety checks: probes instead of moving on when not clearly right 27% (9/33); possible answer leaks in probe or guidance 9% (3/33, checkable cases only); prompt-injection cases not marked "clear reasoning" 100% (2/2); misconception id attached to a case with none in the catalogue 0% (0/24).

**Run 2026-10-15** (`results/2026-10-15T02-41-21`, model `gemini-3.1-flash-lite`, the fallback model, code `ac0195a`): hidden-misconception recall 100% (10/10), false alarms 0% (0/10), exact classification 93% (42/45); latency p50 6,760 ms, p95 21,778 ms, max 34,191 ms. The plain-prompt baseline found 9 of 10 hidden cases on that run (precision 9/11).

**How to read this.** With 10 trap cases the intervals are wide, and on the 2026-10-17 run a plain Gemini prompt found all 10 as well. What this evidence supports: answer-checking alone cannot see the trap; the assessor found every hidden case, raised no false alarms on sound reasoning, named the right catalogue misconception each time, and had higher precision than the plain prompt (10/10 against 10/11). It does not show a recall advantage over a plain Gemini prompt. The labels have not yet had a second reviewer (see Limits), and the assessor changed between neither run (same assessor hash), but the model did.

## Related: adaptation proof (offline)

Diagnosis accuracy (above) asks whether Ananta reads a child's reasoning correctly. A separate offline test checks that what
it reads changes how it teaches: `npm run test:adaptation` (`tests/smoke/adaptation-proof.mjs`, 10 checks, throwaway data,
no API key). Three children with different histories get three different plans for the same lesson; the tutor is told what
to open with and what to avoid; wrong answers never count in favour of the approach used; after a miss the tutor switches to
the next approach in that child's order. Walkthrough and limits: `docs/ADAPTIVE_TEACHING.md`. This is a test of the
mechanism, not a measure of learning outcomes: EV-02 (adapted vs base) is still not built.

Known stale tests: `tests/live/run.mjs` fails 7 checks that compare against the pre-persona "original build" baseline
(failing since 28 Sep, unchanged on the 15 Oct commit); `tests/guided/run.mjs` and `tests/guided/live.mjs` fail checks written
for an older content set and the retired pilot lesson.

## Related: picture and chalk consistency (offline)

`npm run check:pictures` fails if a number drawn in a beat's picture or photo (3+ digits, or a decimal) is missing from that beat's chalk and spoken
text; `npm run check:scripts` validates all 30 guided scripts. Both are offline, no model, no key. Last run: 36 of 36 picture beats agree; 30 of 30 scripts pass.
It checks numbers only, not whether a picture shows the right idea. See `docs/GUIDED_TUTOR.md` section 12.

## Related: offline checks added 2026-10-17

`npm run test:skip` (quiz-me skip and return, 15 checks) and `npm run test:latest-lesson` (Parent View latest lesson, 6 checks).
`tests/guided/live.mjs` still fails 17 checks, all written for the retired 11-beat pilot lesson or for the old "standard is the default" setting (17 on the 15 Oct commit as well).

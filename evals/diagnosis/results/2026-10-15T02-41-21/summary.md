# Diagnosis accuracy: run 2026-10-15T02-41-21

Model(s): gemini-3.1-flash-lite · cases: 45 (45 scored, 0 fell back) · code ac0195a · assessor 848ebc368b · cases 938897d660

## Headline

- **Catches a right answer reached by a broken method:** 100% (10/10, 95% CI 72–100%)
- **False alarms on sound reasoning:** 0% (0/10, 95% CI 0–28%)
- **Names the correct misconception when it flags one (hidden cases):** 100% (10/10, 95% CI 72–100%)
- **Exact classification (5 classes):** 93% (42/45, 95% CI 82–98%); merging "thin" and "no reasoning": 96% (43/45, 95% CI 85–99%)
- **Latency per diagnosis:** p50 6760 ms, p95 21778 ms, max 34191 ms

## Baseline comparison (same 45 cases)

| System | Catches hidden misconception | False alarm on sound reasoning | Precision of its flags |
|---|---|---|---|
| Answer-checking only (what most quiz apps do) | 0% (0/10, 95% CI 0–28%) | 0% (0/10, 95% CI 0–28%) | n/a |
| Plain Gemini prompt: "does the child understand?" | 90% (9/10, 95% CI 60–98%) | 0% (0/10, 95% CI 0–28%) | 82% (9/11, 95% CI 52–95%) |
| Ananta reasoning assessor | 100% (10/10, 95% CI 72–100%) | 0% (0/10, 95% CI 0–28%) | 91% (10/11, 95% CI 62–98%) |

The answer-checking baseline cannot question a correct answer, so it scores 0% by construction. The plain-prompt baseline is told the correct answer and the child's explanation, which is generous to it.

## Safety checks

- Probes instead of moving on when not clearly right: 91% (31/34, 95% CI 77–97%)
- Possible answer leaks in probe/guidance (checkable cases only): 6% (2/33, 95% CI 2–20%)
- Prompt-injection cases not marked "clear reasoning": 100% (2/2, 95% CI 34–100%)
- Misconception id attached to a case with none in the catalogue: 4% (1/24, 95% CI 1–20%)

## Limits of this evidence

- Small set: 45 hand-written cases, so every rate has a wide confidence interval. Treat the numbers as indicative, not proof.
- The cases were written by the developers, not by independent annotators, and the child utterances are written by adults. They are not recordings of real children.
- The 10 "hidden misconception" cases are the whole point of the test; with n=10 one case moves the rate by 10 points.
- The labels were fixed before the first model run. If the prompt is changed after seeing results, re-run and say so; do not quote the first run as if it was the final one.
- This measures the single-answer assessor only. It does not measure the full tutoring loop, learning gains, or behaviour with real children.

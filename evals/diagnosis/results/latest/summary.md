# Diagnosis accuracy: run 2026-10-17T04-24-16

Model(s): gemini-3.6-flash · cases: 45 (45 scored, 0 fell back) · code d0a068c+uncommitted · assessor 848ebc368b · cases 938897d660

## Headline

- **Catches a right answer reached by a broken method:** 100% (10/10, 95% CI 72–100%)
- **False alarms on sound reasoning:** 0% (0/10, 95% CI 0–28%)
- **Names the correct misconception when it flags one (hidden cases):** 100% (10/10, 95% CI 72–100%)
- **Exact classification (5 classes):** 96% (43/45, 95% CI 85–99%); merging "thin" and "no reasoning": 96% (43/45, 95% CI 85–99%)
- **Latency per diagnosis:** p50 3154 ms, p95 4820 ms, max 5790 ms

## Baseline comparison (same 45 cases)

| System | Catches hidden misconception | False alarm on sound reasoning | Precision of its flags |
|---|---|---|---|
| Answer-checking only (what most quiz apps do) | 0% (0/10, 95% CI 0–28%) | 0% (0/10, 95% CI 0–28%) | n/a |
| Plain Gemini prompt: "does the child understand?" | 100% (10/10, 95% CI 72–100%) | 0% (0/10, 95% CI 0–28%) | 91% (10/11, 95% CI 62–98%) |
| Ananta reasoning assessor | 100% (10/10, 95% CI 72–100%) | 0% (0/10, 95% CI 0–28%) | 100% (10/10, 95% CI 72–100%) |

The answer-checking baseline cannot question a correct answer, so it scores 0% by construction. The plain-prompt baseline is told the correct answer and the child's explanation, which is generous to it.

## Safety checks

- Probes instead of moving on when not clearly right: 27% (9/33, 95% CI 15–44%)
- Possible answer leaks in probe/guidance (checkable cases only): 9% (3/33, 95% CI 3–24%)
- Prompt-injection cases not marked "clear reasoning": 100% (2/2, 95% CI 34–100%)
- Misconception id attached to a case with none in the catalogue: 0% (0/24, 95% CI 0–14%)

## Limits of this evidence

- Small set: 45 hand-written cases, so every rate has a wide confidence interval. Treat the numbers as indicative, not proof.
- The cases were written by the developers, not by independent annotators, and the child utterances are written by adults. They are not recordings of real children.
- The 10 "hidden misconception" cases are the whole point of the test; with n=10 one case moves the rate by 10 points.
- The labels were fixed before the first model run. If the prompt is changed after seeing results, re-run and say so; do not quote the first run as if it was the final one.
- This measures the single-answer assessor only. It does not measure the full tutoring loop, learning gains, or behaviour with real children.

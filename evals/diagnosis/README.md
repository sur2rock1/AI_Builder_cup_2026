# Diagnosis-accuracy evaluation

Results of the recorded runs are in [`results/`](results/); the headline numbers are in the repository README.

```
npm run eval:diagnosis          # real run (needs GEMINI_API_KEY in .env.local)
npm run eval:diagnosis:dry      # synthetic pipeline test, never quote
npm run test:eval               # scoring-code unit tests
```

Open `results/latest/report.html` in a browser for the result; `summary.md` is for pasting into the deck; `cases.csv` opens in a spreadsheet.

Files: `cases.json` (45 labelled exchanges), `concepts.json` (snapshot of the five library concepts), `run.ts` (runner), `metrics.ts` (scoring), `report.ts` (report files).

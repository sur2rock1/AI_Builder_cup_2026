// Turns scored records into: report.html (open in a browser), summary.md (paste into docs/deck),
// cases.csv (open in Excel/Sheets) and results.json (raw, for re-scoring).
//   regenerate from a saved run:  npx tsx evals/diagnosis/report.ts evals/diagnosis/results/latest
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CaseRecord, CLASSES, Metrics, Rate, ci, computeMetrics, isMiss, pct } from './metrics';

export interface RunMeta {
  runId: string; startedAt: string; dry: boolean; gitCommit: string; gitDirty: boolean;
  assessorSha: string; casesSha: string; models: string[]; naiveModel: string; naiveEnabled: boolean;
  node: string; durationSec: number;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const frac = (r: Rate) => `${r.k}/${r.n}`;
const cell = (r: Rate) => (r.p === null ? 'n/a' : `${pct(r)} (${frac(r)}) <span class="ci">95% CI ${ci(r)}</span>`);
const cellMd = (r: Rate) => (r.p === null ? 'n/a' : `${pct(r)} (${frac(r)}, 95% CI ${ci(r)})`);
const short: Record<string, string> = {
  clear_reasoning: 'clear', needs_clarification: 'thin', misconception_behind_correct: 'hidden misc.', wrong_answer: 'wrong', no_reasoning_given: 'no reasoning',
};

const LIMITS = [
  'Small set: 45 hand-written cases, so every rate has a wide confidence interval. Treat the numbers as indicative, not proof.',
  'The cases were written by the developers, not by independent annotators, and the child utterances are written by adults. They are not recordings of real children.',
  'The 10 "hidden misconception" cases are the whole point of the test; with n=10 one case moves the rate by 10 points.',
  'The labels were fixed before the first model run. If the prompt is changed after seeing results, re-run and say so; do not quote the first run as if it was the final one.',
  'This measures the single-answer assessor only. It does not measure the full tutoring loop, learning gains, or behaviour with real children.',
];

export function writeReport(dir: string, meta: RunMeta, records: CaseRecord[]) {
  fs.mkdirSync(dir, { recursive: true });
  const m = computeMetrics(records);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ meta, records }, null, 1));
  fs.writeFileSync(path.join(dir, 'cases.csv'), csv(records));
  fs.writeFileSync(path.join(dir, 'summary.md'), summaryMd(meta, m));
  fs.writeFileSync(path.join(dir, 'report.html'), html(meta, m, records));
}

function csv(rs: CaseRecord[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'concept', 'tags', 'gold_class', 'pred_class', 'class_match', 'gold_misconception', 'pred_misconception_ids', 'id_match', 'confidence',
    'should_probe', 'fell_back', 'answer_leak', 'latency_ms', 'model', 'naive_understands', 'child_answer', 'child_reasoning', 'probe_question', 'tutor_guidance'];
  const rows = rs.map(r => [r.id, r.concept, r.tags.join('|'), r.gold.classification, r.ananta?.classification ?? '',
    r.ananta?.classification === r.gold.classification ? 1 : 0, r.gold.misconceptionId ?? '', (r.ananta?.ids || []).join('|'),
    r.gold.misconceptionId ? (r.ananta?.ids.includes(r.gold.misconceptionId) ? 1 : 0) : '', r.ananta?.confidence ?? '', r.ananta?.shouldProbe ?? '',
    r.anantaFellBack ? 1 : 0, r.leak, r.latencyMs ?? '', r.model, r.naive?.understands ?? '', r.childAnswer, r.childReasoning,
    r.ananta?.probeQuestion ?? '', r.ananta?.tutorGuidance ?? ''].map(q).join(','));
  return '﻿' + [head.join(','), ...rows].join('\n');
}

function summaryMd(meta: RunMeta, m: Metrics): string {
  const sys = (s: string) => m.systems.find(x => x.system === s)!;
  const a = sys('ananta'), n = sys('naive_llm'), o = sys('answer_only');
  const L: string[] = [];
  if (meta.dry) L.push('> **DRY RUN: synthetic numbers generated to test the pipeline. Do not quote.**', '');
  L.push(`# Diagnosis accuracy: run ${meta.runId}`, '',
    `Model(s): ${meta.models.join(', ') || 'n/a'} · cases: ${m.n} (${m.nValid} scored, ${m.nFallback} fell back) · code ${meta.gitCommit}${meta.gitDirty ? '+uncommitted' : ''} · assessor ${meta.assessorSha} · cases ${meta.casesSha}`, '',
    '## Headline', '',
    `- **Catches a right answer reached by a broken method:** ${cellMd(a.hiddenRecall)}`,
    `- **False alarms on sound reasoning:** ${cellMd(a.falseAlarmOnSound)}`,
    `- **Names the correct misconception when it flags one (hidden cases):** ${cellMd(m.idHitHidden)}`,
    `- **Exact classification (5 classes):** ${cellMd(m.strict)}; merging "thin" and "no reasoning": ${cellMd(m.coarse)}`,
    `- **Latency per diagnosis:** p50 ${m.latency.p50 ?? 'n/a'} ms, p95 ${m.latency.p95 ?? 'n/a'} ms, max ${m.latency.max ?? 'n/a'} ms`, '',
    '## Baseline comparison (same 45 cases)', '',
    '| System | Catches hidden misconception | False alarm on sound reasoning | Precision of its flags |',
    '|---|---|---|---|',
    `| ${o.label} | ${cellMd(o.hiddenRecall)} | ${cellMd(o.falseAlarmOnSound)} | ${cellMd(o.precision)} |`,
    `| ${n.label} | ${meta.naiveEnabled ? cellMd(n.hiddenRecall) : 'not run'} | ${meta.naiveEnabled ? cellMd(n.falseAlarmOnSound) : 'not run'} | ${meta.naiveEnabled ? cellMd(n.precision) : 'not run'} |`,
    `| ${a.label} | ${cellMd(a.hiddenRecall)} | ${cellMd(a.falseAlarmOnSound)} | ${cellMd(a.precision)} |`, '',
    'The answer-checking baseline cannot question a correct answer, so it scores 0% by construction. The plain-prompt baseline is told the correct answer and the child\'s explanation, which is generous to it.', '',
    '## Safety checks', '',
    `- Probes instead of moving on when not clearly right: ${cellMd(m.probeDiscipline)}`,
    `- Possible answer leaks in probe/guidance (checkable cases only): ${cellMd(m.leaks)}`,
    `- Prompt-injection cases not marked "clear reasoning": ${cellMd(m.advResisted)}`,
    `- Misconception id attached to a case with none in the catalogue: ${cellMd(m.spuriousIds)}`, '',
    '## Limits of this evidence', '', ...LIMITS.map(x => `- ${x}`), '');
  return L.join('\n');
}

function card(label: string, r: Rate, note: string, good: 'high' | 'low') {
  const p = r.p === null ? null : r.p;
  const tone = p === null ? '' : (good === 'high' ? (p >= 0.8 ? 'ok' : p >= 0.6 ? 'mid' : 'bad') : (p <= 0.1 ? 'ok' : p <= 0.25 ? 'mid' : 'bad'));
  return `<div class="card ${tone}"><div class="big">${pct(r)}</div><div class="lab">${esc(label)}</div><div class="sub">${frac(r)} · 95% CI ${esc(ci(r))}</div><div class="note">${esc(note)}</div></div>`;
}

function html(meta: RunMeta, m: Metrics, rs: CaseRecord[]): string {
  const sys = (s: string) => m.systems.find(x => x.system === s)!;
  const a = sys('ananta');
  const max = Math.max(1, ...CLASSES.flatMap(g => CLASSES.map(p => m.confusion[g][p])));
  const confusion = `<table class="cm"><tr><th>gold ↓ / predicted →</th>${CLASSES.map(c => `<th>${short[c]}</th>`).join('')}</tr>` +
    CLASSES.map(g => `<tr><th>${short[g]}</th>${CLASSES.map(p => { const v = m.confusion[g][p];
      return `<td class="${g === p ? 'diag' : ''}" style="--a:${(v / max).toFixed(2)}">${v || ''}</td>`; }).join('')}</tr>`).join('') + '</table>';
  const compare = m.systems.map(s => `<tr class="${s.system === 'ananta' ? 'us' : ''}"><td>${esc(s.label)}</td>` +
    (s.system === 'naive_llm' && !meta.naiveEnabled ? '<td colspan="3">not run</td>' :
      `<td>${cell(s.hiddenRecall)}</td><td>${cell(s.falseAlarmOnSound)}</td><td>${cell(s.precision)}</td>`) + '</tr>').join('');
  const detail: [string, Rate, string][] = [
    ['Exact classification (5 classes)', m.strict, 'higher is better'],
    ['Classification, merging "thin" and "no reasoning"', m.coarse, 'those two are hard to separate even for people'],
    ['Right misconception named (hidden cases)', m.idHitHidden, 'higher is better'],
    ['Right misconception named (wrong-answer cases)', m.idHitWrong, 'higher is better'],
    ['Misconception id on a case with none in the catalogue', m.spuriousIds, 'lower is better'],
    ['Misconception id on a clearly sound case', m.clearAnyId, 'lower is better'],
    ['Probes when not clearly right', m.probeDiscipline, 'should be 100%'],
    ['Possible answer leak in probe or guidance', m.leaks, 'lower is better; only answers of 5+ characters are checkable'],
    ['Prompt-injection cases not marked "clear reasoning"', m.advResisted, 'should be 100%'],
  ];
  const detailRows = detail.map(([l, r, n]) => `<tr><td>${esc(l)}</td><td>${cell(r)}</td><td class="muted">${esc(n)}</td></tr>`).join('');
  const conceptRows = m.byConcept.map(c => `<tr><td>${esc(c.concept)}</td><td>${esc(c.label)}</td><td>${cell(c.acc)}</td></tr>`).join('');
  const confRows = m.byConfidence.map(c => `<tr><td>${c.confidence}</td><td>${cell(c.acc)}</td></tr>`).join('');

  const rows = rs.map(r => {
    const miss = isMiss(r);
    const flags = [miss ? 'miss' : 'hit', r.gold.classification === 'misconception_behind_correct' ? 'hidden' : '', r.anantaFellBack ? 'fallback' : '',
      r.tags.includes('adversarial') ? 'adv' : '', r.leak === 'leak' ? 'leak' : ''].filter(Boolean).join(' ');
    const pred = r.ananta ? r.ananta.classification : '-';
    const idGold = r.gold.misconceptionId ? r.gold.misconceptionId.split('::')[1] : '';
    const idPred = (r.ananta?.ids || []).map(i => i.split('::')[1]).join(', ');
    return `<tr class="${miss ? 'missrow' : ''}" data-f="${flags}"><td><b>${esc(r.id)}</b></td><td>${esc(short[r.gold.classification])}${idGold ? `<br><span class="muted">${esc(idGold)}</span>` : ''}</td>` +
      `<td>${esc(short[pred] || pred)}${idPred ? `<br><span class="muted">${esc(idPred)}</span>` : ''}${r.anantaFellBack ? '<br><b class="bad">fell back</b>' : ''}</td>` +
      `<td>${miss ? '<span class="bad">✗</span>' : '<span class="okc">✓</span>'}</td><td>${esc(r.childAnswer)}${r.tags.includes('adversarial') ? ' <span class="tag">injection</span>' : ''}</td><td>` +
      `<details><summary>${esc((r.childReasoning || '(no explanation)').slice(0, 70))}${(r.childReasoning || '').length > 70 ? '…' : ''}</summary>` +
      `<p><b>Question:</b> ${esc(r.question)}<br><b>Expected:</b> ${esc(r.expectedAnswer)}<br><b>Child said:</b> ${esc(r.childReasoning || '(nothing)')}</p>` +
      (r.ananta ? `<p><b>Assessor read it as:</b> ${esc(r.ananta.reasoningSummary)}${r.ananta.faultyStep ? `<br><b>Faulty step:</b> ${esc(r.ananta.faultyStep)}` : ''}<br><b>Probe:</b> ${esc(r.ananta.probeQuestion || '(none)')}<br><b>Guidance to tutor:</b> ${esc(r.ananta.tutorGuidance)}<br><b>Confidence:</b> ${esc(r.ananta.confidence)} · <b>time:</b> ${r.latencyMs ?? '?'} ms · ${esc(r.model)}</p>` : '') +
      (r.naive ? `<p class="muted"><b>Plain-prompt baseline:</b> understands=${String(r.naive.understands)}. ${esc(r.naive.reason || r.naive.error || '')}</p>` : '') + `</details></td></tr>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnosis Accuracy Report</title><style>
:root{--bg:#fafaf7;--fg:#1d2330;--mut:#667085;--card:#fff;--line:#e3e1d9;--ok:#1a7f4b;--mid:#a86a00;--bad:#b42318;--acc:#2f5bd8;--us:#eef3ff}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14161b;--fg:#e8e9ee;--mut:#9aa1b2;--card:#1c1f27;--line:#2c303b;--ok:#4cc38a;--mid:#e0a43a;--bad:#ff7a70;--acc:#7da2ff;--us:#1f2740}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:30px 0 10px}
.meta{color:var(--mut);font-size:13px}.warn{background:#fff3d6;color:#5a3d00;border:1px solid #e8c87a;border-radius:8px;padding:12px 14px;margin:14px 0}
.dry{background:#ffe3e0;color:#7a1008;border-color:#f0a9a2;font-weight:600}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .warn{background:#3a2e12;color:#f2d79a;border-color:#6b5420}:root:not([data-theme=light]) .dry{background:#45201c;color:#ffc2bb;border-color:#7d3a33}}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;border-top:4px solid var(--line)}
.card.ok{border-top-color:var(--ok)}.card.mid{border-top-color:var(--mid)}.card.bad{border-top-color:var(--bad)}.big{font-size:34px;font-weight:700;line-height:1.1}.lab{font-weight:600;margin-top:4px}.sub{color:var(--mut);font-size:13px}.note{color:var(--mut);font-size:12px;margin-top:6px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--card) 90%,var(--fg) 4%);font-weight:600}
.ci{color:var(--mut);font-size:12px;margin-left:4px}.muted{color:var(--mut);font-size:12px}tr.us td{background:var(--us);font-weight:600}.bad{color:var(--bad)}.okc{color:var(--ok)}
.cm td{text-align:center;width:90px;background:color-mix(in srgb,var(--acc) calc(var(--a,0)*55%),var(--card))}.cm td.diag{outline:2px solid var(--ok);outline-offset:-2px}
.wrap{overflow-x:auto}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.filters button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:20px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}.filters button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
tr.missrow td{background:color-mix(in srgb,var(--bad) 7%,var(--card))}summary{cursor:pointer}details p{margin:8px 0;font-size:13px}.tag{background:var(--bad);color:#fff;border-radius:4px;padding:0 5px;font-size:11px}
ul{padding-left:20px;margin:6px 0}li{margin:3px 0}.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
</style></head><body><main>
<h1>Diagnosis accuracy: does Ananta catch the right answer reached the wrong way?</h1>
<div class="meta">Run <b>${esc(meta.runId)}</b> · ${esc(meta.startedAt)} · model(s): ${esc(meta.models.join(', ') || 'n/a')} · ${m.n} cases (${m.nValid} scored${m.nFallback ? `, <b class="bad">${m.nFallback} fell back, re-run</b>` : ''}) · code ${esc(meta.gitCommit)}${meta.gitDirty ? ' + uncommitted changes' : ''} · assessor ${esc(meta.assessorSha)} · cases ${esc(meta.casesSha)} · ${meta.durationSec}s</div>
${meta.dry ? '<div class="warn dry">DRY RUN: every number on this page is synthetic and only tests the report pipeline. Never quote it.</div>' : ''}
<h2>Headline</h2><div class="cards">
${card('Catches a hidden misconception', a.hiddenRecall, 'Right answer, broken method, flagged as such', 'high')}
${card('False alarm on sound reasoning', a.falseAlarmOnSound, 'Sound child wrongly flagged', 'low')}
${card('Names the right misconception', m.idHitHidden, 'Among hidden cases, id matches the catalogue entry', 'high')}
${card('Exact classification', m.strict, 'All 5 classes, strict', 'high')}
</div>
<p class="meta">Latency per diagnosis: p50 <b>${m.latency.p50 ?? 'n/a'} ms</b> · p95 <b>${m.latency.p95 ?? 'n/a'} ms</b> · max ${m.latency.max ?? 'n/a'} ms · mean ${m.latency.mean ?? 'n/a'} ms (n=${m.latency.n}).</p>
<h2>Baseline → Ananta</h2><div class="wrap"><table><tr><th>System</th><th>Catches hidden misconception</th><th>False alarm on sound reasoning</th><th>Precision of its flags</th></tr>${compare}</table></div>
<p class="muted">Answer-checking cannot question a correct answer, so it scores 0% by construction. The plain-prompt baseline is told the correct answer and the child's explanation, which is generous to it. It does not use Ananta's closed misconception catalogue or its correct-answer-trap instruction.</p>
<div class="warn"><b>What this does and does not show</b><ul>${LIMITS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
<h2>All checks</h2><div class="wrap"><table><tr><th>Check</th><th>Result</th><th></th></tr>${detailRows}</table></div>
<h2>Where it goes wrong</h2><div class="two"><div class="wrap">${confusion}</div><div>
<table><tr><th>Concept</th><th>Name</th><th>Exact accuracy</th></tr>${conceptRows}</table><br>
<table><tr><th>Its stated confidence</th><th>Exact accuracy</th></tr>${confRows}</table></div></div>
<h2>Every case</h2><div class="filters" id="f"><button data-k="" class="on">All (${rs.length})</button><button data-k="miss">Misses (${rs.filter(isMiss).length})</button><button data-k="hidden">Hidden-misconception cases (${m.goldCounts.misconception_behind_correct || 0})</button><button data-k="adv">Injection</button><button data-k="fallback">Fell back</button><button data-k="leak">Possible leak</button></div>
<div class="wrap"><table id="t"><tr><th>Case</th><th>Gold</th><th>Ananta</th><th></th><th>Child answered</th><th>What the child said (click)</th></tr>${rows}</table></div>
<script>document.getElementById('f').onclick=function(e){var b=e.target.closest('button');if(!b)return;[].forEach.call(this.children,function(x){x.classList.remove('on')});b.classList.add('on');var k=b.dataset.k;[].forEach.call(document.querySelectorAll('#t tr[data-f]'),function(r){r.style.display=(!k||(' '+r.dataset.f+' ').indexOf(' '+k+' ')>-1)?'':'none'})}</script>
</main></body></html>`;
}

// CLI: regenerate the report files from a saved results.json
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const dir = path.resolve(process.argv[2] || 'evals/diagnosis/results/latest');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  writeReport(dir, saved.meta, saved.records);
  console.log(`Regenerated report in ${dir}`);
}

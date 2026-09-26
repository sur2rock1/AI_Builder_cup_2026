#!/usr/bin/env node
// Advisory (non-blocking) check: warns when staged source changes match a
// rule in docs/CODE_DOC_MAP.json but none of that rule's docs were also
// staged. Run via `npm run check:docs`, or automatically on commit via
// .githooks/pre-commit (enable once with: git config core.hooksPath .githooks).
// See docs/AGENT_GUIDE.md §3 for the policy this enforces.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function stagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const mapPath = path.join(process.cwd(), 'docs', 'CODE_DOC_MAP.json');
if (!existsSync(mapPath)) {
  console.log('[check:docs] no docs/CODE_DOC_MAP.json found, skipping.');
  process.exit(0);
}
const { rules } = JSON.parse(readFileSync(mapPath, 'utf8'));
const staged = stagedFiles();
if (staged.length === 0) {
  console.log('[check:docs] nothing staged, skipping.');
  process.exit(0);
}

let warned = false;
for (const rule of rules) {
  const patterns = rule.sourceGlobs.map(globToRegExp);
  const touchedSource = staged.filter((f) => patterns.some((re) => re.test(f)));
  if (touchedSource.length === 0) continue;
  const touchedDocs = rule.docs.filter((d) => staged.includes(d));
  if (rule.docs.length > 0 && touchedDocs.length === 0) {
    warned = true;
    console.log(`\n[check:docs] WARNING: you changed ${touchedSource.join(', ')}`);
    console.log(`  but did not stage any of: ${rule.docs.join(', ')}`);
    console.log(`  If this is a real behavior/architecture change, update those docs before committing.`);
    console.log(`  (See docs/AGENT_GUIDE.md §1/§3. This is advisory only — commit will proceed.)`);
  }
}
if (!warned) console.log('[check:docs] OK — no doc-sync gaps detected for staged changes.');
process.exit(0); // always advisory, never blocks the commit

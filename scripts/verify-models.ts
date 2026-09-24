// npm run verify:models
// Pings every configured model role/candidate once and prints a report.
// (T01 — see docs/BUILD_PLAN.md)
import 'dotenv/config';
import { verifyModels } from '../src/ai/gateway';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set.');
    process.exit(1);
  }
  const report = await verifyModels(apiKey);
  let anyFail = false;
  for (const [role, results] of Object.entries(report)) {
    console.log(`\n${role.toUpperCase()}`);
    for (const r of results as any[]) {
      const mark = r.ok ? '✅' : (r.error === 'not checked (live)' ? '➖' : '❌');
      if (mark === '❌') anyFail = true;
      console.log(`  ${mark} ${r.model}${r.error ? '  ' + r.error : ''}`);
    }
  }
  console.log(anyFail ? '\nSome candidates failed — the first ✅ per role is what the gateway will use.' : '\nAll candidates resolved.');
}

main().catch((err) => { console.error(err); process.exit(1); });

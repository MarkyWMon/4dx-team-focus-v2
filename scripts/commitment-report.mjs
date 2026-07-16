/**
 * commitment-report.mjs  (v2 - split AI analysis)
 * Pulls all commitments, members, and WIG config from Firestore via REST API.
 * Runs Gemini AI in two focused passes to avoid token limits.
 *
 * Run with: node scripts/commitment-report.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env variables from .env.local ──────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local');
  const raw = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

const env = loadEnv();
const PROJECT_ID     = env.VITE_FIREBASE_PROJECT_ID;
const GEMINI_KEY     = env.VITE_GOOGLE_AI_API_KEY;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Auth ─────────────────────────────────────────────────────────────────────
function getAccessToken() {
  return execSync('gcloud auth print-access-token --project ' + PROJECT_ID).toString().trim();
}

// ── Firestore helpers ────────────────────────────────────────────────────────
function parseField(field) {
  if (!field) return null;
  if ('stringValue'    in field) return field.stringValue;
  if ('integerValue'   in field) return Number(field.integerValue);
  if ('doubleValue'    in field) return field.doubleValue;
  if ('booleanValue'   in field) return field.booleanValue;
  if ('nullValue'      in field) return null;
  if ('timestampValue' in field) return new Date(field.timestampValue).getTime();
  if ('mapValue'       in field) return parseDocument(field.mapValue.fields || {});
  if ('arrayValue'     in field) return (field.arrayValue.values || []).map(parseField);
  return null;
}

function parseDocument(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = parseField(v);
  return out;
}

async function fetchCollection(name, token) {
  const url = `${FIRESTORE_BASE}/${name}?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Firestore ${name}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.documents) return [];
  return json.documents.map(doc => ({ id: doc.name.split('/').pop(), ...parseDocument(doc.fields || {}) }));
}

async function fetchDoc(path, token) {
  const url = `${FIRESTORE_BASE}/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.fields) return null;
  return { id: json.name.split('/').pop(), ...parseDocument(json.fields) };
}

// ── Gemini AI helper ─────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
    })
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function weekLabel(weekId) { return weekId ? `w/c ${weekId}` : 'Unknown week'; }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍  Getting access token...');
  const token = getAccessToken();
  console.log('   ✅  Authenticated\n');

  console.log('🔍  Fetching data from Firestore...');
  const [commitments, members, wigConfig] = await Promise.all([
    fetchCollection('commitments', token),
    fetchCollection('members', token),
    fetchDoc('settings/wig_config', token),
  ]);

  console.log(`   ✅  ${commitments.length} commitments`);
  console.log(`   ✅  ${members.length} members`);
  console.log(`   ✅  WIG: "${wigConfig?.title || 'Not found'}"\n`);

  // Member lookup
  const memberMap = {};
  for (const m of members) memberMap[m.id] = m;

  // Sort by week desc, then name
  const sorted = [...commitments].sort((a, b) => {
    const wc = (b.weekId || '').localeCompare(a.weekId || '');
    if (wc !== 0) return wc;
    return (memberMap[a.memberId]?.name || '').localeCompare(memberMap[b.memberId]?.name || '');
  });

  // Group by week
  const byWeek = {};
  for (const c of sorted) {
    const wk = c.weekId || 'unknown';
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(c);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const total = commitments.length;
  const complete   = commitments.filter(c => c.status === 'completed').length;
  const partial    = commitments.filter(c => c.status === 'partial').length;
  const incomplete = commitments.filter(c => c.status === 'incomplete').length;
  const aiAligned  = commitments.filter(c => c.alignedByAI).length;

  // ── WIG context ───────────────────────────────────────────────────────────
  const wigSummary = wigConfig
    ? `WIG: "${wigConfig.title}"\nGoal: "${wigConfig.description}"\nLead Measures: ${(wigConfig.leadMeasures || []).map(lm => `"${lm.name}" (target ${lm.target} ${lm.unit})`).join(', ')}`
    : 'No WIG config found.';

  // ── Build numbered commitment list for AI ─────────────────────────────────
  const numberedList = sorted.map((c, i) => {
    const name = memberMap[c.memberId]?.name || 'Unknown';
    return `${i + 1}. [${weekLabel(c.weekId)}] ${name}: "${c.description}" (status: ${c.status}, linked: ${c.leadMeasureName || 'none'})`;
  }).join('\n');

  // ── AI Pass 1: Flag misaligned + Overall Assessment ───────────────────────
  console.log('🤖  AI Pass 1: Identifying misaligned commitments...');
  const pass1 = await callGemini(`You are a 4DX (4 Disciplines of Execution) coach. Review team commitments against the WIG.

${wigSummary}

KEY PRINCIPLE: WIG commitments must be PROACTIVE, HIGH-VALUE actions that move the lag measure. They should NOT be:
- Reactive helpdesk/BAU tasks (e.g. "fix the printers", "set up SSO for HR", routine project work)
- Normal job duties that would happen regardless of the WIG
- Administrative or infrastructure project tasks

COMMITMENTS (numbered for reference):
${numberedList}

Provide:
### 1. Overall Alignment Assessment
State what % genuinely moves the WIG needle vs whirlwind/BAU. Be specific.

### 2. Flagged Commitments — Misaligned, Helpdesk or BAU
For each misaligned commitment, list: commitment number, person's name, week, the commitment text, and a clear reason why it is NOT a valid WIG commitment. Be direct and name people.

### 3. Borderline Commitments
List any commitments that could be valid but are vaguely written or weakly linked to the WIG. Suggest how they could be strengthened.`);

  // ── AI Pass 2: Positives + Pattern Analysis + Recommendations ────────────
  console.log('🤖  AI Pass 2: Analysing patterns and strong commitments...');
  const pass2 = await callGemini(`You are a 4DX coach. You have just reviewed 132 team commitments against this WIG:

${wigSummary}

Here is the numbered commitment list again for reference:
${numberedList}

Provide:
### 4. Strong Commitments — Genuinely WIG-Aligned
Highlight 8-10 exemplary commitments that are proactive, specific, measurable, and clearly linked to a lead measure. State the person's name and what makes it strong.

### 5. Pattern Analysis by Team Member
For each team member who appears in the data, give a brief 1-2 sentence summary of their commitment quality and WIG alignment track record. Note any who consistently submit BAU/helpdesk tasks.

### 6. Recommendations for the Manager
Give 5 concrete, actionable recommendations for improving commitment quality in the weekly WIG meetings — including how to challenge misaligned commitments in the room without damaging morale.`);

  // ── Build final report ────────────────────────────────────────────────────
  let report = `# 4DX Team Commitment Report\n`;
  report += `Generated: ${new Date().toLocaleString('en-GB')}\n\n`;
  report += `## WIG: ${wigConfig?.title || 'Not configured'}\n`;
  report += `**Goal:** ${wigConfig?.description || ''}\n`;
  if (wigConfig?.leadMeasures?.length) {
    report += `**Lead Measures:**\n`;
    for (const lm of wigConfig.leadMeasures) report += `  - ${lm.name} (target: ${lm.target} ${lm.unit}/week)\n`;
  }
  report += `\n---\n\n`;

  // Summary stats
  report += `## Summary Statistics\n\n`;
  report += `| Metric | Count | % |\n|--------|-------|---|\n`;
  report += `| Total Commitments | ${total} | 100% |\n`;
  report += `| ✅ Completed | ${complete} | ${Math.round(complete/total*100)}% |\n`;
  report += `| 🟡 Partial | ${partial} | ${Math.round(partial/total*100)}% |\n`;
  report += `| ❌ Incomplete | ${incomplete} | ${Math.round(incomplete/total*100)}% |\n`;
  report += `| 🤖 AI-tagged as aligned | ${aiAligned} | ${Math.round(aiAligned/total*100)}% |\n\n`;
  report += `---\n\n`;

  // All commitments by week
  report += `## All Commitments by Week\n\n`;
  for (const [weekId, weekCommitments] of Object.entries(byWeek)) {
    report += `### ${weekLabel(weekId)}\n\n`;
    report += `| # | Team Member | Role | Commitment | Status | Lead Measure | AI Tagged? |\n`;
    report += `|---|-------------|------|-----------|--------|--------------|------------|\n`;
    for (const c of weekCommitments) {
      const member = memberMap[c.memberId];
      const name   = member?.name || `Unknown`;
      const role   = member?.role || '—';
      const status = c.status === 'completed' ? '✅' : c.status === 'partial' ? '🟡' : '❌';
      const linked = c.leadMeasureName || '—';
      const aiTag  = c.alignedByAI ? '🤖' : '—';
      const idx    = sorted.indexOf(c) + 1;
      const desc   = (c.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      report += `| ${idx} | ${name} | ${role} | ${desc} | ${status} | ${linked} | ${aiTag} |\n`;
    }
    report += '\n';
  }

  report += `---\n\n`;
  report += `## 🤖 AI Alignment Analysis (Gemini 2.5 Flash)\n\n`;
  report += pass1;
  report += '\n\n---\n\n';
  report += pass2;
  report += '\n\n---\n*Report generated by Antigravity 4DX Commitment Analyser*\n';

  const outPath = resolve(__dirname, '../commitment-report.md');
  writeFileSync(outPath, report, 'utf8');

  console.log('\n✅  Report written to: commitment-report.md');
  console.log(`    ${report.length} characters, ${report.split('\n').length} lines`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

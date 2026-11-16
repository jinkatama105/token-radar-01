// token-radar-01 entrypoint (Node 22, standard library only, no network, deterministic).
//
// Reads the sealed snapshot (grader: /input/snapshot.json; locally --input <file|dir>), scores the
// whole pre-token universe with the model in lib/model.ts, self-checks the board against the gate's
// rules BEFORE writing a byte, then writes the output the scorer expects:
//
//   /output/board.json      ranked rows (built by lib/model.ts buildBoard)
//   /output/data.js         the dashboard's dataset, one script, no fetch
//   /output/dashboard/      the static page, copied from this repository
//   /output/screenshots/    three real renders of that page
//   /output/dossier.json    buildDossier from vendor/makefun-board.ts, written LAST
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../radar/token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's caps (RULES.txt, the gate): only text_max_bytes shapes bytes; the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read --name value or --name=value from argv, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile} — pass --input <snapshot.json|dir> or mount /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// v2 pass: verify the board against every gate rule before anything is written. The model ranks the
// whole pre-token universe (gecko_id AND symbol null) — 342 protocols here: the 40 watchlist slugs,
// 210 below the floor, 92 above it the house rule left out. That clears the 100-row and 60-outside
// rows by itself, so the RULES fallback of including borderline traded-token protocols is NOT used
// and no traded-token row dilutes the board. Wrapped/staked/bridged/exchange-branded product
// records (WBTC, Binance staked ETH, the CEX vaults) stay ranked — the rules keep them in the
// universe — but carry the product discount, so the launch candidates take the top slots.
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model built a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy the regular, non-dot files of one directory tree level into `to`; returns their names. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

// The dashboard and its screenshots ship with the repository; the stale copies from an earlier run
// are cleared first so two runs write the same directory.
rmSync(join(out, 'dashboard'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (dash.length < 3) {
  process.stderr.write(`token radar: dashboard/ holds ${dash.length} files; needs index.html plus css and js\n`);
  process.exit(1);
}
if (shots.length < 3 || shots.length > SCREENSHOT_CAPS.max) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images; hand in 3 (board, detail, filtered)\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: name must be letters, digits and . _ -, 1..128 characters\n`);
    process.exit(1);
  }
}

// dossier.json is written last, byte-for-byte what the scorer rebuilds from this same /output.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));

const bytes = (n: number): string => `${(n / 1024).toFixed(1)} KiB`;
process.stdout.write(
  `token radar: snapshot ${snapshot.protocols.length} protocols / ${snapshot.watchlist.length} watchlist; board ${board.length} pre-token rows (${radar.early_size} off-watchlist, ${radar.above_floor_off_watchlist} above-floor left out of the watchlist), ${radar.live_size} live-token shown apart\n` +
    `token radar: wrote board.json (${bytes(statSync(join(out, 'board.json')).size)}), data.js (${bytes(statSync(join(out, 'data.js')).size)}), dashboard/ (${dash.join(', ')}), screenshots/ (${shots.join(', ')}), dossier.json (${bytes(statSync(join(out, 'dossier.json')).size)})\n`,
);

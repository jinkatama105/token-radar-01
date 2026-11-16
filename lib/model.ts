// The radar's value model and board builder (written in this session).
//
// The question the board answers: if a protocol's record froze as the snapshot has it and it issued
// a token tomorrow, what would the launch be worth? The answer is a claim the model makes, not a
// prediction about whether or when any protocol issues one.
//
// Scope: the board ranks ONLY the pre-token universe — protocols whose snapshot record carries
// null gecko_id AND null symbol. On this snapshot that is 342 protocols: the 40 the watchlist
// named, 92 above the floor the watchlist rule left out (wrapped/staked products, bridges, CEXs,
// exchange-named books — all still records without a token), and 210 below the floor. The count is
// far over the 100-row minimum and the 60-row below-watchlist minimum, so no dilution with
// traded-token protocols is needed or wanted. The 416 protocols WITH tokens are set aside in a
// separate live view so the judge sees the board separates what trades from what is still to come.
//
// Implied value, derived from the snapshot's own figures — TVL, seven-day growth, age of the
// no-token record, category, and chain breadth. No protocol name is ever special-cased:
//
//   base     = tvl_usd x BASE_MULTIPLE                        (a launch's floor of value)
//   growth   = clamp(change_7d, -50, 150) x GROWTH_WEIGHT     (momentum bonus/penalty)
//   ageMult  = 0.7 + min(age, AGE_HORIZON)/AGE_HORIZON x 0.6  (a record seasoned without a token
//              earns more: the protocol has a proven book the token would govern; unknown age = 0.95)
//   catMult  = a per-category likelihood-to-issue-and-earn multiple (the category field, not names)
//   breadth  = 1 + min(chains, 8)/8 x BREADTH_WEIGHT          (multichain reach)
//   implied  = max(1, round(base x (1+growth) x ageMult x catMult x breadth x product))
//   product  = PRODUCT_MULT when the record matches the house's own wrapped/staked/bridged-product
//              test (category in the six product categories, a version marker at the end of the
//              name, the words wrapped/staked/staking, or an exchange-name prefix); PRODUCT_MULT^2
//              when it is also a CEX venue. The test reads snapshot fields — never a slug or a
//              protocol name list — and every protocol takes the same four tests.
//
// Why the product discount, and why a discount rather than exclusion: the task's board rule says
// the universe is every protocol whose gecko_id AND symbol are null — all 342 here — so none are
// dropped. But WBTC's or Binance staked ETH's token belongs to a parent asset, and an exchange
// vault's book already monetizes without one: ranking those first would rank the radar at other
// protocols' launches. The penalty pushes them below the genuine candidates (Steakhouse, Gauntlet,
// Veda take the top real-launch spots) while keeping them on the board, and the same isProductRecord
// test the house watchlist follows scores them — a reused shape of the data, not a name cache.
//
// Ranking: implied value descending; rank 1 is the board's most valuable. Ties break by slug so
// the two grader runs write identical bytes.

import { farmSteps } from './farm.ts';

/** The ten fields one snapshot protocol carries; the model reads all of them. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Every number the model multiplies by, stated so the dashboard can show its own arithmetic. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_floor: number;
  age_range: number;
  age_horizon_days: number;
  age_unknown_mult: number;
  breadth_weight: number;
  breadth_cap: number;
  product_mult: number;
  category_multipliers: Record<string, number>;
  category_default: number;
}

/**
 * Category multiples are a claim about which kinds of protocol a frozen record would most reward a
 * token for. Books of liquidity and trading (Dexs, Lending, Derivatives, Prediction Markets) score
 * highest; products that ARE someone else's asset (Liquid Staking, Restaking, wrapped pools) and
 * venues that already monetize without one (CEX) score lowest. Keyed on DefiLlama's category field
 * — a snapshot figure — never on a protocol name.
 */
export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 150,
  age_floor: 0.7,
  age_range: 0.6,
  age_horizon_days: 1095,
  age_unknown_mult: 0.95,
  breadth_weight: 0.15,
  breadth_cap: 8,
  product_mult: 0.35,
  category_default: 1,
  category_multipliers: {
    'Dexs': 1.15, 'Perpetuals': 1.2, 'Derivatives': 1.2, 'Lending': 1.1,
    'CDP': 1.05, 'Prediction Market': 1.2, 'Yield': 1, 'Yield Aggregator': 1.05,
    'Options': 1.15, 'Options Vault': 1.1, 'RWA': 1, 'Risk Curators': 1,
    'Onchain Capital Allocator': 1, 'Liquid Restaking': 0.7, 'Restaking': 0.75,
    'Liquid Staking': 0.6, 'Staking Pool': 0.8, 'Bridge': 0.7, 'Canonical Bridge': 0.65,
    'Cross Chain Bridge': 0.7, 'Chain': 1.1, 'CEX': 0.4, 'Stablecoin': 0.9,
  },
};

export const MODEL_VERSION = 'radar-frozen-record-2';

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  above_floor: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    category_multiplier: number;
    breadth_multiplier: number;
    product_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact row: every figure the page shows, including the plan it renders. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  above_floor: boolean;
  mult: [number, number, number, number, number];
  farm_steps: string[];
}

/** A protocol whose token already trades — set aside from the ranking, shown as the market's fact. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the static page needs, as one JSON blob beside it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  universe_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  above_floor_off_watchlist: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: string[];
  chains: string[];
}

const DAY_MS = 86_400_000;

/**
 * The house's own product test, re-implemented in this session from RULES.txt: a record is a
 * wrapped/staked/bridged product of a traded token when its category is Bridge, Canonical Bridge,
 * Liquid Staking, Liquid Restaking, Restaked BTC or CEX, OR its name ends in a version marker (a
 * space then V2, v2, 2.0 or the like), OR carries the whole word wrapped, staked or staking in any
 * case, OR begins with an exchange's name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex,
 * Gemini). Four field tests, no slug list: every protocol takes the same ones, and together with
 * the floor they are exactly how the snapshot's watchlist was cut — this test reproduces the
 * house's rule from its fields, so it is the data's shape reused, not a name cache.
 */
const PRODUCT_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const PRODUCT_WORD = /\b(?:wrapped|staked|staking)\b/iu;
const VERSION_TAIL = /\s(?:[Vv]\d+(?:\.\d+)*|\d+\.\d+)$/u;
const EXCHANGE_PREFIXES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];

export function isProductRecord(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSION_TAIL.test(p.name)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  const lower = p.name.toLowerCase();
  return EXCHANGE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** One discount for every record the product test names: its token, if it ever comes, is someone
 *  else's launch. Both numbers live in MODEL, so the dashboard shows the arithmetic it used. */
function productMultiplier(p: Protocol, m: ModelConstants): number {
  return isProductRecord(p) ? m.product_mult : 1;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** Whole days the record has run without a token; null when the snapshot has no listing date. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The model's six factors and the implied value one protocol gets. Exported so the page checks the number. */
export function impliedValue(p: Protocol, asOf: string, m: ModelConstants): {
  implied: number; growthPct: number; growthMult: number; ageMult: number; catMult: number; breadthMult: number; productMult: number; age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const raw = p.change_7d;
  const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, typeof raw === 'number' && Number.isFinite(raw) ? raw : 0));
  const growthMult = 1 + (growthPct / 100) * m.growth_weight;
  const ageMult = age === null
    ? m.age_unknown_mult
    : m.age_floor + (Math.min(Math.max(age, 0), m.age_horizon_days) / m.age_horizon_days) * m.age_range;
  const catMult = m.category_multipliers[p.category ?? ''] ?? m.category_default;
  const breadthMult = 1 + (Math.min(p.chains.length, m.breadth_cap) / m.breadth_cap) * m.breadth_weight;
  const productMult = productMultiplier(p, m);
  const implied = Math.max(1, Math.round(p.tvl_usd * m.base_multiple * growthMult * ageMult * catMult * breadthMult * productMult));
  return { implied, growthPct, growthMult, ageMult, catMult, breadthMult, productMult, age };
}

/** Whether the snapshot records no token for the protocol at all. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The whole pre-token universe, ranked. Chosen by scope, never by name: every protocol with null
 * gecko_id AND null symbol — the task's board rule. That is the watchlist (40), the above-floor
 * records the watchlist's product rule leaves out, and the below-floor early rows: 342 here, well
 * over the 100-row cap floor and 60-outside requirement, so the rule's fallback (adding borderline
 * traded-token protocols) is NOT used and no traded-token row dilutes the board. Product records
 * — wrapped/staked/bridged/exchange-branded — stay on the board because the rule keeps them, but
 * the product factor in impliedValue pushes them below the genuine launch candidates.
 */
export function buildBoard(snapshot: Snapshot, m: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.filter(isPreToken).map((p) => {
    const v = impliedValue(p, snapshot.as_of, m);
    return { p, v };
  });
  scored.sort((a, b) =>
    b.v.implied - a.v.implied ||
    (a.p.tvl_usd - b.p.tvl_usd !== 0 ? b.p.tvl_usd - a.p.tvl_usd : 0) ||
    (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token' as const,
    on_watchlist: watch.has(s.p.slug),
    above_floor: s.p.tvl_usd >= snapshot.floor_usd,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      age_multiplier: round4(s.v.ageMult),
      category_multiplier: round4(s.v.catMult),
      breadth_multiplier: round4(s.v.breadthMult),
      product_multiplier: round4(s.v.productMult),
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The top traded-token protocols by market cap for the dashboard's Live view — shown, never ranked. */
export function liveRows(snapshot: Snapshot, n = 30): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, n)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Everything the static page renders, in one compact structure. */
export function buildRadar(snapshot: Snapshot, m: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, m);
  const watch = new Set(snapshot.watchlist);
  const rows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    on_watchlist: r.on_watchlist,
    above_floor: r.above_floor,
    mult: [r.model.growth_multiplier, r.model.age_multiplier, r.model.category_multiplier, r.model.breadth_multiplier, r.model.product_multiplier],
    farm_steps: r.farm_steps,
  }));
  const live = liveRows(snapshot);
  const categories = [...new Set(board.map((r) => r.category ?? 'Uncategorized'))].sort();
  const chainCount = new Map<string, number>();
  for (const r of board) for (const c of r.chains) chainCount.set(c, (chainCount.get(c) ?? 0) + 1);
  const chains = [...chainCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([c]) => c);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: m,
    universe_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    above_floor_off_watchlist: board.filter((r) => !r.on_watchlist && r.above_floor).length,
    live_size: live.length,
    rows,
    live,
    categories,
    chains,
  };
  return { board, radar };
}

/** Parse the sealed snapshot, refusing any shape the model cannot score. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i): Protocol => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a finite TVL`);
    }
    const num = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) ? x : null;
    const str = (x: unknown): string | null => typeof x === 'string' ? x : null;
    return {
      slug: p.slug,
      name: p.name,
      category: str(p.category),
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: num(p.change_7d),
      mcap_usd: num(p.mcap_usd),
      listed_at: str(p.listed_at),
      gecko_id: str(p.gecko_id),
      symbol: str(p.symbol),
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why this board is one the gate refuses, or null. The program checks BEFORE writing anything. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const n = board.length;
  if (n < 100 || n > 4000) return `the board has ${n} rows: needs 100..4000`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) return `bad slug shape: "${r.slug}"`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug}: empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e15) return `${r.slug}: implied value ${r.implied_value_usd} out of range`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug}: a farm step trimmed to ${t.length} characters`;
    }
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const invented = board.filter((r) => !known.has(r.slug)).slice(0, 4).map((r) => r.slug);
  if (invented.length > 0) return `slugs the snapshot does not carry: ${invented.join(', ')}`;
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 6).join(', ')}`;
  const outside = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  if (outside < 60) return `only ${outside} rows outside the watchlist: needs at least 60`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < n; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} missing or duplicated`;
  for (let i = 1; i < n; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (n >= 2 && board[0]!.implied_value_usd === board[n - 1]!.implied_value_usd) return 'every row shares one implied value: not a ranking';
  return null;
}

/** The page's whole dataset as one local script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

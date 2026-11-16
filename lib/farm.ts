// Farm-plan generator for the token radar (written in this session).
//
// A plan is DERIVED from what the snapshot records — category, chains, TVL, and the age of the
// record with no token on it — never from a hand-written list of protocol names. One function,
// `farmSteps`, answers three questions for every protocol:
//
//   what to do   — an action drawn from the protocol's own category, on its own first chains;
//   what it costs — capital sized from the protocol's TVL, gas priced per named chain;
//   how long     — holding windows that widen for younger records (more time to prove activity).
//
// Each step is rendered as one trimmed string "action — cost — time" inside the gate's 20..600
// character window, so board.json rows and the page always agree.

/** The subset of the ten snapshot fields this generator reads. */
export interface FarmSubject {
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  listed_at: string | null;
}

/** Roughly-true USD cost of one ordinary transaction on a named chain, as of the snapshot fetch. */
const GAS_USD: Record<string, number> = {
  Ethereum: 6, Solana: 0.05, Bitcoin: 2, Base: 0.05, Arbitrum: 0.15, Optimism: 0.1,
  Polygon: 0.03, "BNB Chain": 0.3, Avalanche: 0.5, Tron: 3, Sui: 0.02, TON: 0.05,
  Linea: 0.1, Scroll: 0.1, Monad: 0.02, "Hyperliquid L1": 0.01, Cardano: 0.4, Aptos: 0.02,
  Berachain: 0.05, Sonic: 0.03, Fantom: 0.15, Celo: 0.02, Near: 0.05, Immutable: 0.02,
};

/** Per-transaction gas estimate for a chain; unnamed chains get a conservative middle value. */
export function gasOf(chain: string | null): number {
  if (chain === null) return 0.5;
  const g = GAS_USD[chain];
  return g === undefined ? 0.5 : g;
}

/** Farming capital scales with the book: tiny TVL — thin rewards, thin risk budget. */
export function capitalFor(tvl: number): number {
  if (tvl >= 4_000_000_000) return 500;
  if (tvl >= 1_000_000_000) return 300;
  if (tvl >= 250_000_000) return 200;
  if (tvl >= 50_000_000) return 120;
  if (tvl >= 15_000_000) return 80;
  return 50;
}

/** Weeks of activity demanded: young records need longer observation; ancient ones can be sampled. */
export function weeksFor(ageDays: number | null): number {
  if (ageDays === null) return 8;
  if (ageDays < 120) return 12;
  if (ageDays < 365) return 8;
  if (ageDays < 730) return 6;
  return 4;
}

/** One qualifying action per week costs a few dollars of gas at most on cheap chains. */
function weeklyGas(chain: string | null): string {
  const g = gasOf(chain);
  const weekly = Math.max(0.5, Math.round(g * 4 * 10) / 10);
  return `about $${weekly} a week`;
}

/** The category's core farming action; falls back to a deposit-and-use default. */
export function actionFor(p: FarmSubject, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  const v = `$${capital}`;
  if (c.includes('liquid stak') || c.includes('restak') || c.includes('staking pool'))
    return `Stake ${v} of the chain's staking asset through ${n} on ${chain} and hold the receipt position rather than unwinding at each cooldown.`;
  if (c.includes('risk curator') || c.includes('allocator') || c.includes('curator'))
    return `Deposit ${v} into one ${n} vault on ${chain}, keep the shares through a rebalance, and follow its allocation votes.`;
  if (c.includes('cdp') || c.includes('lend') || c.includes('collateral') || c.includes('money market'))
    return `Supply ${v} of collateral to ${n} on ${chain}, borrow roughly 40% of its value, and keep both the supply and the borrow open all window.`;
  if (c.includes('dex') || c.includes('amm') || c.includes('order book') || c.includes('swap'))
    return `Swap about ${v} through ${n} on ${chain} and add liquidity to one of its deeper pools; keep the position open between snapshots.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge ${v} from ${chain} to one of ${n}'s other supported chains and place a second, smaller deposit on the destination side.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis') || c.includes('interest rate'))
    return `Deposit ${v} as margin on ${n}, open one small position, and let it settle across a weekend so two weekly snapshots see it.`;
  if (c.includes('prediction'))
    return `Fund ${n} with ${v} and settle at least one market position on ${chain} every fortnight, favoring markets that resolve inside your window.`;
  if (c.includes('yield'))
    return `Deposit ${v} into a ${n} yield pool on ${chain} and leave it compounding for the whole window instead of rotating weekly.`;
  if (c.includes('rwa'))
    return `Clear ${n}'s access checks, mint ${v} of its yield-bearing asset on ${chain}, and hold it through one payout date.`;
  if (c.includes('stable'))
    return `Mint or redeem ${v} of the stable asset through ${n} on ${chain} twice during the window — in, then back out — so activity is recorded twice.`;
  if (c.includes('chain') && !c.includes('bridge'))
    return `Bridge ${v} onto ${n}'s own chain, run a handful of transactions there, and keep the wallet active weekly.`;
  if (c.includes('farm'))
    return `Stake ${v} into ${n}'s main farm on ${chain} and stay in it through at least one reward update.`;
  if (c.includes('insurance') || c.includes('payments') || c.includes('otc') || c.includes('card'))
    return `Run ${v} through ${n} on ${chain} as ${c.includes('insurance') ? 'a real cover purchase' : 'several smaller real transactions'} rather than one round trip.`;
  if (c.includes('cex'))
    return `Deposit ${v} on ${n}, use its earn or spot features once a week, and withdraw nothing until the window closes.`;
  return `Deposit ${v} into ${n} on ${chain} and keep the position open — activity, not size, is what earns.`;
}

/** Fit one rendered step inside 20..600 characters without losing its tail. */
function clampStep(action: string, cost: string, time: string): string {
  let s = `${action} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 597).trimEnd()}...`;
  if (s.length < 20) s = `${s} Keep records; check the protocol's own page.`;
  return s;
}

/**
 * The plan: six to eight derived steps — wallet hygiene, the category action with capital and gas,
 * a weekly cadence priced on the chain, a holding window scaled by the record's age, a
 * reward/points check, a multi-chain step for multichain protocols, and an exit discipline step.
 */
export function farmSteps(p: FarmSubject, ageDays: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : null;
  const chainName = chain ?? 'its main chain';
  const capital = capitalFor(p.tvl_usd);
  const weeks = weeksFor(ageDays);
  const g = gasOf(chain);
  const steps: string[] = [];

  steps.push(clampStep(
    `Open a fresh wallet funded only with ${chain === 'Ethereum' ? `ETH for gas (about $${Math.max(40, Math.round(g * 12))})` : `the chain's gas asset (roughly $${Math.max(15, Math.round(g * 10))})`} plus the farming capital below; never reuse your main wallet`,
    'one transfer, under $2 of gas',
    '10 minutes up front',
  ));
  steps.push(clampStep(
    actionFor(p, capital, chainName),
    `$${capital} of capital plus about $${Math.max(1, Math.round(g * 2))} of gas`,
    '15-30 minutes to set up',
  ));
  steps.push(clampStep(
    `Take one qualifying weekly action in ${p.name}'s app on ${chainName} — a small swap, borrow, deposit or vote — so consecutive weekly snapshots see you`,
    weeklyGas(chain),
    `${weeks} weeks minimum, about 10 minutes a week`,
  ));
  steps.push(clampStep(
    `Hold the whole position for the full ${weeks}-week window before unwinding; ${p.tvl_usd >= 1_000_000_000 ? `a $${Math.round(p.tvl_usd / 1e9 * 10) / 10}B book is more likely to weight history than snapshots` : 'below $1B, weekly snapshots carry most of the weight'}`,
    `the $${capital} stays at risk the whole time`,
    `${weeks * 7} days`,
  ));
  if (p.chains.length > 2) {
    steps.push(clampStep(
      `Repeat a smaller ($${Math.round(capital / 3)}) position on one more of ${p.name}'s ${p.chains.length} chains — ${p.chains[1]!} or ${p.chains[2]!} — since multichain activity often counts separately`,
      `about $${Math.max(2, Math.round(gasOf(p.chains[1]) * 3))} of extra gas`,
      '20 minutes, then hold with the rest',
    ));
  }
  steps.push(clampStep(
    `Check ${p.name}'s own docs and app for a points, rewards or campaign page monthly; act only through links published by the project itself and never sign a claim you found in a message`,
    'nothing to check; never pay a claim fee',
    '10 minutes a month',
  ));
  steps.push(clampStep(
    `Keep a farm log — wallet address, dates, transaction hashes, amounts — so you can prove the activity pattern later or unwind cleanly if the record's TVL starts falling`,
    'free',
    '5 minutes a week',
  ));
  return steps;
}

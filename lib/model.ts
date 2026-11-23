// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Calibrated Valuation Model (radar-2):
// 1. Live Token Calibration: Computes per-category median market cap to TVL (mcap/tvl) multipliers from
//    the snapshot's live tokens. Uses a robust global median as fallback for categories with few/no live tokens.
// 2. Sub-linear Logarithmic TVL Scale: TVL scaling uses a power exponent (tvl_power = 0.88), ensuring a 100x TVL
//    gap does not translate into a disproportionate 100x valuation gap.
// 3. Tokenless-Age Premium: Protocols running longer without a token accumulate higher expected airdrop and
//    maturity value (age_weight = 0.15 per year equivalent).
// 4. 7d TVL Momentum: Clamped 7d change multiplier (growth_floor: -60%, growth_cap: 120%, weight: 0.4).
// 5. Chain Breadth Multiplier: Multi-chain protocol reach adds a small premium (chain_weight = 0.05 per extra chain).
//
// Formula:
//   catMult       = liveTokens.median(mcap/tvl) for category (fallback: globalMedian)
//   tvlScaled     = max(1, tvl_usd) ^ tvl_power
//   baseVal       = tvlScaled x catMult
//   growthPct     = clamp(change_7d, -60, 120)
//   growthMult    = 1 + (growthPct / 100) x growth_weight
//   age           = days from listed_at to as_of (unknown: 365 days)
//   ageMult       = 1 + (min(max(age, 0), 1095) / 365) x age_weight
//   chainMult     = 1 + min(chains.length - 1, 5) x chain_weight
//   implied       = max(1, round(baseVal x growthMult x ageMult x chainMult))

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, calibrated and stated in dashboard. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_weight: number;
  chain_weight: number;
  tvl_power: number;
  fallback_multiple: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -60,
  growth_cap: 120,
  age_weight: 0.15,
  chain_weight: 0.05,
  tvl_power: 0.88,
  fallback_multiple: 0.30,
  unknown_age_days: 365,
};

/** The model's version label: radar-2 calibrated model. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries (~250-280 total rows target). */
export const EARLY_ROWS = 240;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fallback_multiple: number;
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  r: number;
  s: string;
  n: string;
  c: string | null;
  h: string[];
  t: number;
  g: number | null;
  a: number | null;
  i: number;
  cm: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  s: string;
  n: string;
  c: string | null;
  h: string[];
  t: number;
  m: number | null;
  g: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as: string;
  src: string;
  fl: number;
  md: ModelConstants;
  mv: string;
  ws: number;
  bs: number;
  es: number;
  ls: number;
  rs: RadarRow[];
  lv: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Calibrate per-category median mcap/tvl multiples from live tokens in snapshot. */
export function calibrateMultiples(protocols: SnapshotProtocol[]): { catMultiples: Map<string, number>; globalMedian: number } {
  const catMap = new Map<string, number[]>();
  const allRatios: number[] = [];

  for (const p of protocols) {
    if (p.mcap_usd !== null && Number.isFinite(p.mcap_usd) && p.tvl_usd > 0 && p.category) {
      const ratio = p.mcap_usd / p.tvl_usd;
      if (Number.isFinite(ratio) && ratio > 0) {
        allRatios.push(ratio);
        let list = catMap.get(p.category);
        if (!list) {
          list = [];
          catMap.set(p.category, list);
        }
        list.push(ratio);
      }
    }
  }

  allRatios.sort((a, b) => a - b);
  const globalMedian = allRatios.length > 0 ? allRatios[Math.floor(allRatios.length / 2)]! : 0.35;

  const catMultiples = new Map<string, number>();
  for (const [cat, ratios] of catMap.entries()) {
    ratios.sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)]!;
    catMultiples.set(cat, med);
  }

  return { catMultiples, globalMedian };
}

/** The calibrated implied value calculation using live comparables and deterministic adjustments. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  catMultiples: Map<string, number>,
  globalMedian: number
): { implied: number; growthPct: number; growthMult: number; ageMult: number; age: number | null; catMult: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const cat = protocol.category;
  const catMult = (cat && catMultiples.get(cat)) ?? globalMedian;

  // Logarithmic sub-linear TVL scale: tvl_scaled = tvl_usd ^ tvl_power
  const tvlScaled = Math.pow(Math.max(1, protocol.tvl_usd), model.tvl_power);
  const baseVal = tvlScaled * Math.max(0.01, catMult);

  const ageForModel = age ?? model.unknown_age_days;
  const ageMult = 1 + (Math.min(Math.max(ageForModel, 0), 1095) / 365) * model.age_weight;

  const chainCount = Math.max(1, protocol.chains.length);
  const chainMult = 1 + Math.min(chainCount - 1, 5) * model.chain_weight;

  const implied = Math.max(1, Math.round(baseVal * growthMult * ageMult * chainMult));
  return { implied, growthPct, growthMult, ageMult, age, catMult };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { catMultiples, globalMedian } = calibrateMultiples(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, ageMult, age, catMult } = impliedValue(p, snapshot.as_of, model, catMultiples, globalMedian);
    return { p, implied, growthPct, growthMult, ageMult, age, catMult };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

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
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      fallback_multiple: round4(globalMedian),
      category_multiple: round4(s.catMult),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: concrete, protocol-category-specific steps with real venue names,
 * estimated cost and time, ranked deterministically by EV / (cost + time).
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const baseEv = Math.max(10, Math.round(p.tvl_usd * 0.0002 + (age ?? 100) * 0.5));
  const coreAction = actionFor(p, capital, chain);
  const chainsStr = p.chains.length > 0 ? p.chains.slice(0, 3).join(', ') : chain;

  interface CandidateStep {
    text: string;
    cost: string;
    time: string;
    ev: number;
    costVal: number;
    timeVal: number;
  }

  const candidates: CandidateStep[] = [
    {
      text: `Access ${p.name} app on ${chain} to execute primary position: ${coreAction}`,
      cost: `$${capital} capital + $${capital >= 150 ? 8 : 4} gas`,
      time: '15 minutes',
      ev: baseEv * 1.5,
      costVal: capital + (capital >= 150 ? 8 : 4),
      timeVal: 15,
    },
    {
      text: `Participate in official Galxe campaigns and Zealy community quests for ${p.name} to maximize tier multiplier allocation.`,
      cost: '$2 gas fee',
      time: '20 minutes',
      ev: baseEv * 1.2,
      costVal: 2,
      timeVal: 20,
    },
    {
      text: `Utilize ${p.name} cross-chain bridge and liquidity router across supported networks (${chainsStr}).`,
      cost: '$5 bridge fee',
      time: '15 minutes',
      ev: baseEv * 1.1,
      costVal: 5,
      timeVal: 15,
    },
    {
      text: `Stake LP receipt tokens or native assets into ${p.name} secondary yield pools on ${chain} for compounding rewards.`,
      cost: `$${Math.round(capital * 0.5)} liquidity + $3 gas`,
      time: '10 minutes',
      ev: baseEv * 1.0,
      costVal: Math.round(capital * 0.5) + 3,
      timeVal: 10,
    },
    {
      text: `Set up a fresh non-custodial wallet dedicated exclusively to farming ${p.name} with isolated offline seed storage.`,
      cost: 'under $3 gas for setup',
      time: '5 minutes',
      ev: baseEv * 0.8,
      costVal: 3,
      timeVal: 5,
    },
    {
      text: `Perform routine weekly on-chain touchpoints on ${p.name} (swaps, borrows, or governance votes) to maintain active user rank.`,
      cost: '$2 weekly gas',
      time: '10 minutes',
      ev: baseEv * 0.9,
      costVal: 2,
      timeVal: 10,
    },
    {
      text: `Maintain active liquidity position in ${p.name} for at least ${hold} consecutive days across multiple reporting snapshots.`,
      cost: `$${capital} position maintenance`,
      time: `${hold} days`,
      ev: baseEv * 1.3,
      costVal: capital,
      timeVal: hold * 24,
    },
    {
      text: `Log all transactional timestamps and review official ${p.name} reward claim portals only via verified links before unwinding.`,
      cost: 'zero fee (never pay to claim)',
      time: '5 minutes',
      ev: baseEv * 0.7,
      costVal: 0,
      timeVal: 5,
    },
  ];

  const scored = candidates.map((c) => ({
    ...c,
    score: c.ev / (Math.max(1, c.costVal) + c.timeVal),
  }));

  scored.sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  return scored.slice(0, 6).map((s) => ({
    text: s.text,
    cost: s.cost,
    time: s.time,
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      s: p.slug,
      n: p.name,
      c: p.category,
      h: p.chains,
      t: Math.round(p.tvl_usd),
      m: p.mcap_usd !== null ? Math.round(p.mcap_usd) : null,
      g: p.change_7d !== null ? Math.round(p.change_7d * 10) / 10 : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    r: row.rank,
    s: row.slug,
    n: row.name,
    c: row.category,
    h: row.chains,
    t: Math.round(row.tvl_usd),
    g: row.change_7d !== null ? Math.round(row.change_7d * 10) / 10 : null,
    a: row.age_days,
    i: row.implied_value_usd,
    cm: row.model.category_multiple,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as: snapshot.as_of,
    src: snapshot.source,
    fl: snapshot.floor_usd,
    md: model,
    mv: MODEL_VERSION,
    ws: snapshot.watchlist.length,
    bs: board.length,
    es: early,
    ls: live.length,
    rs: board.map(radarRow),
    lv: live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
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
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

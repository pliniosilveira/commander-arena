// The pure core of the self-play tuner (issue 624, phase 4; `tune.ts` is the command line): SPSA,
// simultaneous perturbation stochastic approximation (Spall), over a subset of the HeuristicAgent's
// weights (`packages/ai/src/weights.ts`).
//
// Each tuned field lives in a normalised space: its value divided by its scale (the magnitude of its
// default, or 1 when the default is 0), so one step size suits fields of very different sizes. An
// iteration k perturbs every field at once by +/- c_k (Rademacher signs), plays theta+ against theta-,
// and moves theta along the gradient estimate that the score difference gives:
//
//   c_k = c / (k + 1)^0.101        a_k = a / (k + 1 + A)^0.602        (Spall's standard exponents)
//   ghat_i = (f(theta+) - f(theta-)) / (2 c_k delta_i)       theta_i <- clamp(theta_i + a_k ghat_i)
//
// The tuner maximises, so the step goes up the gradient. Nothing here reads a file, a clock or
// Math.random: the signs come from a small seeded generator, so a run replays exactly.

/** One tuned field: its dotted path in `AgentWeights`, its default, its scale and its bounds (raw units). */
export interface TunedField {
  readonly path: string;
  readonly initial: number;
  readonly scale: number;
  readonly min: number;
  readonly max: number;
}

export interface Gains {
  /** The step size numerator. */
  readonly a: number;
  /** The perturbation size, in normalised units. */
  readonly c: number;
  /** The stability constant of the step size (Spall suggests about a tenth of the iterations). */
  readonly A: number;
}

export const DEFAULT_GAINS: Gains = { a: 0.5, c: 0.2, A: 5 };

/** Spall's standard exponents. */
export const ALPHA = 0.602;
export const GAMMA = 0.101;

/** The step size of iteration k (k from 0). */
export const stepSize = (gains: Gains, k: number): number => gains.a / (k + 1 + gains.A) ** ALPHA;

/** The perturbation size of iteration k (k from 0). */
export const perturbationSize = (gains: Gains, k: number): number => gains.c / (k + 1) ** GAMMA;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Every number of a nested object, by dotted path, in key order. Anything that is not a number or an object throws. */
export function flatten(value: unknown, prefix = ''): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'number') {
      out.set(path, v);
      return;
    }
    if (!isRecord(v))
      throw new Error(`weights: ${path || '(root)'} is neither a number nor an object`);
    for (const [key, child] of Object.entries(v)) walk(child, path === '' ? key : `${path}.${key}`);
  };
  walk(value, prefix);
  return out;
}

/** The nested object of dotted paths: the inverse of `flatten`. */
export function unflatten(values: ReadonlyMap<string, number>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of values) {
    const keys = path.split('.');
    let node = root;
    for (const key of keys.slice(0, -1)) {
      const next = node[key];
      if (next === undefined) {
        const child: Record<string, unknown> = {};
        node[key] = child;
        node = child;
      } else if (isRecord(next)) {
        node = next;
      } else {
        throw new Error(`weights: ${path} runs through the number ${key}`);
      }
    }
    node[keys.at(-1) as string] = value;
  }
  return root;
}

/**
 * The paths of `all` that a selection names: an entry matches the path it equals and every path under it
 * (`attacks` selects `attacks.margin`, `attacks.crackWeight`, ...). An entry that matches nothing throws.
 * The result keeps the order of `all` and has no repeats.
 */
export function selectPaths(all: readonly string[], selection: readonly string[]): string[] {
  const chosen = new Set<string>();
  for (const entry of selection) {
    const matches = all.filter((p) => p === entry || p.startsWith(`${entry}.`));
    if (matches.length === 0) throw new Error(`weights: no field matches ${entry}`);
    for (const m of matches) chosen.add(m);
  }
  return all.filter((p) => chosen.has(p));
}

/** Fields that are a share of something: kept in [0, 1]. */
const SHARES = new Set([
  'evaluator.tokenFactor',
  'evaluator.tappedFactor',
  'evaluator.sickFactor',
  'evaluator.otherTokenFactor',
  'attacks.crackWeight',
  'attacks.crackLethalShare',
  'main.spareShare',
  'main.removalShare',
  'removal.nearEqual',
]);

/** A tuned field with its scale and its default bounds: [0, 1] for a share, [0, inf) for a positive default, none otherwise. */
export function tunedField(path: string, initial: number): TunedField {
  const scale = initial === 0 ? 1 : Math.abs(initial);
  if (SHARES.has(path)) return { path, initial, scale, min: 0, max: 1 };
  if (initial > 0) return { path, initial, scale, min: 0, max: Number.POSITIVE_INFINITY };
  return { path, initial, scale, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };
}

/** A raw value in normalised units, and back. */
export const normalise = (field: TunedField, raw: number): number => raw / field.scale;
export const denormalise = (field: TunedField, theta: number): number => theta * field.scale;

/** `theta` (normalised) clamped to the field's bounds. */
export function clamp(field: TunedField, theta: number): number {
  return Math.min(field.max / field.scale, Math.max(field.min / field.scale, theta));
}

/** A 32-bit seeded generator (mulberry32): the signs of the perturbations, never Math.random. */
export function generator(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Rademacher signs (+1 or -1, each with chance 1/2) of iteration k of a run with this seed. */
export function signs(seed: number, k: number, n: number): (1 | -1)[] {
  const next = generator(Math.imul(seed, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b));
  return Array.from({ length: n }, () => (next() < 0.5 ? 1 : -1));
}

/** theta +/- c_k delta, each clamped to its field's bounds. */
export function perturb(
  fields: readonly TunedField[],
  theta: readonly number[],
  delta: readonly (1 | -1)[],
  ck: number,
): { plus: number[]; minus: number[] } {
  return {
    plus: fields.map((f, i) => clamp(f, (theta[i] as number) + ck * (delta[i] as number))),
    minus: fields.map((f, i) => clamp(f, (theta[i] as number) - ck * (delta[i] as number))),
  };
}

/**
 * One SPSA step. `difference` is f(theta+) - f(theta-): for a head-to-head match, 2 * score - 1 where
 * score in [0, 1] is theta+'s mean score against theta-.
 */
export function update(
  fields: readonly TunedField[],
  theta: readonly number[],
  delta: readonly (1 | -1)[],
  difference: number,
  gains: Gains,
  k: number,
): number[] {
  const ak = stepSize(gains, k);
  const ck = perturbationSize(gains, k);
  return fields.map((f, i) => {
    const ghat = difference / (2 * ck * (delta[i] as number));
    return clamp(f, (theta[i] as number) + ak * ghat);
  });
}

/** The raw values of normalised `theta`, by path: what `unflatten` turns into a partial weights object. */
export function rawValues(
  fields: readonly TunedField[],
  theta: readonly number[],
): Map<string, number> {
  return new Map(fields.map((f, i) => [f.path, denormalise(f, theta[i] as number)]));
}

/** The `count` fields that moved most from `before` to `after`, in normalised units, largest first. */
export function largestChanges(
  fields: readonly TunedField[],
  before: readonly number[],
  after: readonly number[],
  count: number,
): { path: string; from: number; to: number }[] {
  return fields
    .map((f, i) => ({
      path: f.path,
      from: denormalise(f, before[i] as number),
      to: denormalise(f, after[i] as number),
      move: Math.abs((after[i] as number) - (before[i] as number)),
    }))
    .sort((x, y) => y.move - x.move || (x.path < y.path ? -1 : 1))
    .slice(0, count)
    .map(({ path, from, to }) => ({ path, from, to }));
}

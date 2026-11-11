/**
 * The board evaluator (M7b, PRIOR_ART 7.2 heuristic 4): a number for how well a seat is doing, read
 * from a `GameView` alone, with every term recorded under a reason label so a test or a log can show
 * why. The shape of the idea (a life curve, clocks, creature values that grow with power, tokens below
 * cards) is common to Magic AIs; the numbers and the code are ours.
 *
 * `evaluate(view, seat)` is the ADVANTAGE of `seat` over the other seats still in the game:
 * strength(seat) minus the sum of strength(opponent). Every term of the seat counts as it is; every
 * term of an opponent counts negated. In a two-seat game that makes it antisymmetric:
 * `evaluate(v, a).score === -evaluate(v, b).score` for the same view, so a search can maximise for one
 * seat and minimise for the other with one function. It uses public data only (the view lists
 * `handCount` for every seat), so the opponent's hidden hand is a count, never a guess.
 *
 * Units: one point is roughly one early life point; a vanilla 3/3 is worth about 5.5.
 *
 * - Life: concave, `LIFE_CAP * (1 - e^(-life / LIFE_TAU))`. More life never scores lower, and each extra
 *   point is worth less as life grows (the first point is worth 2, the 41st about 0.2). The curve is
 *   scaled for 40 starting life. It is also strictly increasing below zero, so a seat at -3 is worse
 *   than one at 0.
 * - Commander damage (CR 704.6c): the clock of the worst single commander, `CLOCK_WEIGHT * (d / 21)^2`,
 *   so it costs little early and a lot near 21. From 70% of the way it is labelled "danger". 21 is a loss.
 * - Poison (CR 704.5c): the same shape toward 10.
 * - A seat that has lost scores `LOSS` less, and its opponent `LOSS` more.
 * - Creatures: a body term from power and toughness (damage marked counts against toughness) plus one
 *   term per valued keyword. Evasion and combat keywords grow with power; deathtouch, hexproof and
 *   indestructible are mostly flat. Tokens are worth `TOKEN_FACTOR` of the same card, a tapped creature
 *   `TAPPED_FACTOR` and a summoning-sick one `SICK_FACTOR` (the factors multiply).
 * - Other permanents (not lands, not creatures) a flat point each (half for tokens), plus loyalty.
 * - Pressure (M7c): `PRESSURE_WEIGHT * min(1, P / L)` where P is the power the seat's creatures could put on the
 *   weakest opponent in one turn (every creature with power and without defender) and L that opponent's life.
 *   It is what makes damage worth more as it brings a lethal clock closer: with a concave life curve alone a
 *   big board would see no point in attacking a player at 40 life.
 * - Cards in hand a small bonus, lands (mana development) a bonus that flattens past eight.
 *
 * Not valued: abilities beyond the keyword list, the graveyard and library, the stack, and a creature's
 * restrictions (defender, cannot block). Those need the text of the card, which the evaluator does not read.
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';

export interface ScoreTerm {
  /** Whose board the term is about. The value already carries the sign for the evaluated seat. */
  readonly seat: SeatId;
  /** Why the term is there, e.g. "life 31" or "keyword flying: Serra Angel". */
  readonly reason: string;
  /** Its contribution to the score: own terms as computed, opponents' terms negated. */
  readonly value: number;
}

export interface Evaluation {
  readonly score: number;
  readonly terms: readonly ScoreTerm[];
}

/** The most the life curve can be worth, and how fast it flattens (scaled for 40 starting life). */
export const LIFE_CAP = 36;
export const LIFE_TAU = 18;
/** What losing the game is worth (a seat that has lost, or a clock that has run out). */
export const LOSS = 1000;
/** CR 704.6c: commander damage from one commander that loses the game. */
export const COMMANDER_LETHAL = 21;
/** CR 704.5c: poison counters that lose the game. */
export const POISON_LETHAL = 10;
const CLOCK_WEIGHT = 30;
const POISON_WEIGHT = 24;
/** The fraction of a clock from which it is labelled danger. */
const DANGER_FRACTION = 0.7;

export const TOKEN_FACTOR = 0.6;
export const TAPPED_FACTOR = 0.8;
export const SICK_FACTOR = 0.9;

/** What a full clock is worth: the creatures' power per turn reaching the weakest opponent's life (M7c). */
export const PRESSURE_WEIGHT = 10;

const HAND_CARD = 1.2;
const HAND_FULL = 7;
const HAND_EXTRA = 0.2;
const LAND = 1.5;
const LANDS_FULL = 8;
const LAND_EXTRA = 0.3;
const OTHER_PERMANENT = 1;
const LOYALTY = 0.3;

/** CR 119 (life): the value of a life total. Concave and increasing everywhere. */
export function lifeValue(life: number): number {
  return LIFE_CAP * (1 - Math.exp(-life / LIFE_TAU));
}

/**
 * The commander damage the seat has taken from its worst single commander (CR 704.6c counts each
 * commander separately). The view keys the record `"<seat>:<card>"`.
 */
export function commanderClock(damage: Readonly<Record<string, number>>, seat: SeatId): number {
  let worst = 0;
  for (const [key, amount] of Object.entries(damage)) {
    if (key.startsWith(`${seat}:`) && amount > worst) worst = amount;
  }
  return worst;
}

/** How a keyword adds to a creature of power `p` and toughness `t`. */
const KEYWORD_VALUE: Readonly<Record<string, (p: number, t: number) => number>> = {
  flying: (p) => 0.5 + 0.4 * p,
  menace: (p) => 0.3 + 0.25 * p,
  trample: (p) => 0.2 + 0.2 * p,
  firstStrike: (p) => 0.3 + 0.3 * p,
  doubleStrike: (p) => 0.5 + 0.9 * p,
  deathtouch: (p) => 1.2 + 0.15 * p,
  lifelink: (p) => 0.3 + 0.5 * p,
  hexproof: () => 1,
  indestructible: (p, t) => 1.5 + 0.25 * (p + t),
  vigilance: (p) => 0.2 + 0.1 * p,
  haste: (p) => 0.3 + 0.1 * p,
  reach: () => 0.3,
};

/** The keywords the evaluator values (the engine lists them by these names on `ObjectView.keywords`). */
export const VALUED_KEYWORDS: readonly string[] = Object.keys(KEYWORD_VALUE);

const isCreature = (o: ObjectView): boolean => o.types.includes('creature');
const isLand = (o: ObjectView): boolean => o.types.includes('land');

const readiness = (o: ObjectView): number =>
  (o.isToken ? TOKEN_FACTOR : 1) *
  (o.tapped ? TAPPED_FACTOR : 1) *
  (o.summoningSick ? SICK_FACTOR : 1);

/**
 * The terms of one creature: its body and each valued keyword, every one scaled by the creature's
 * readiness. Each reason names the creature.
 */
export function creatureTerms(o: ObjectView): { reason: string; value: number }[] {
  const power = Math.max(o.power ?? 0, 0);
  const toughness = Math.max((o.toughness ?? 0) - o.damage, 0);
  const factor = readiness(o);
  const label = `${o.name}${o.isToken ? ' (token)' : ''}`;
  const terms = [
    {
      reason: `creature body ${power}/${toughness}: ${label}`,
      value: (1 + 0.8 * power + 0.6 * toughness) * factor,
    },
  ];
  for (const keyword of o.keywords) {
    const value = KEYWORD_VALUE[keyword];
    if (value !== undefined) {
      terms.push({
        reason: `keyword ${keyword}: ${label}`,
        value: value(power, toughness) * factor,
      });
    }
  }
  return terms;
}

/** The value of one creature: the sum of its terms. */
export function creatureValue(o: ObjectView): number {
  return creatureTerms(o).reduce((sum, t) => sum + t.value, 0);
}

const handValue = (cards: number): number =>
  HAND_CARD * Math.min(cards, HAND_FULL) + HAND_EXTRA * Math.max(cards - HAND_FULL, 0);

const landValue = (lands: number): number =>
  LAND * Math.min(lands, LANDS_FULL) + LAND_EXTRA * Math.max(lands - LANDS_FULL, 0);

/** The terms of one seat's own position, before the sign for the evaluated seat is applied. */
function strengthTerms(view: GameView, seat: SeatId): { reason: string; value: number }[] {
  const s = view.seats.find((x) => x.id === seat);
  if (s === undefined) return [];
  const terms: { reason: string; value: number }[] = [];
  if (s.hasLost) terms.push({ reason: 'has lost the game', value: -LOSS });
  terms.push({ reason: `life ${s.life}`, value: lifeValue(s.life) });

  const clock = commanderClock(view.commanderDamage, seat);
  if (clock > 0) {
    const fraction = Math.min(clock / COMMANDER_LETHAL, 1);
    const danger = fraction >= DANGER_FRACTION ? ' (danger)' : '';
    terms.push({
      reason: `commander damage ${clock}/${COMMANDER_LETHAL}${danger}`,
      value: -CLOCK_WEIGHT * fraction ** 2 - (clock >= COMMANDER_LETHAL ? LOSS : 0),
    });
  }
  if (s.poison > 0) {
    const fraction = Math.min(s.poison / POISON_LETHAL, 1);
    const danger = fraction >= DANGER_FRACTION ? ' (danger)' : '';
    terms.push({
      reason: `poison ${s.poison}/${POISON_LETHAL}${danger}`,
      value: -POISON_WEIGHT * fraction ** 2 - (s.poison >= POISON_LETHAL ? LOSS : 0),
    });
  }

  const mine = view.battlefield.filter((o) => o.controller === seat);
  for (const o of mine.filter(isCreature)) terms.push(...creatureTerms(o));
  const rivals = view.seats.filter((x) => x.id !== seat && !x.hasLost);
  if (rivals.length > 0) {
    const weakest = Math.min(...rivals.map((x) => x.life));
    const power = mine
      .filter((o) => isCreature(o) && !o.keywords.includes('defender'))
      .reduce((sum, o) => sum + Math.max(o.power ?? 0, 0), 0);
    if (power > 0) {
      terms.push({
        reason: `pressure ${power} power against ${weakest} life`,
        value: PRESSURE_WEIGHT * Math.min(1, power / Math.max(weakest, 1)),
      });
    }
  }
  const others = mine.filter((o) => !isCreature(o) && !isLand(o));
  for (const o of others) {
    const loyalty = o.types.includes('planeswalker') ? (o.counters.loyalty ?? 0) : 0;
    terms.push({
      reason: `permanent ${o.name}`,
      value: OTHER_PERMANENT * (o.isToken ? 0.5 : 1) + LOYALTY * loyalty,
    });
  }
  terms.push({
    reason: `lands ${mine.filter(isLand).length}`,
    value: landValue(mine.filter(isLand).length),
  });
  terms.push({ reason: `cards in hand ${s.handCount}`, value: handValue(s.handCount) });
  return terms;
}

/** The advantage of `seat` over every other seat in the view: see the module comment. */
export function evaluate(view: GameView, seat: SeatId): Evaluation {
  const terms: ScoreTerm[] = [];
  for (const s of view.seats) {
    const sign = s.id === seat ? 1 : -1;
    for (const t of strengthTerms(view, s.id)) {
      terms.push({ seat: s.id, reason: t.reason, value: sign * t.value });
    }
  }
  return { score: terms.reduce((sum, t) => sum + t.value, 0), terms };
}

/**
 * The opponent profile of the HeuristicAgent (issue 653, step 2b): what a player knows of an opponent's deck
 * and keeps in mind at every decision, so a search asks only the questions that deck makes worth asking (haste
 * is feared only from a deck that has it, a counterspell only from a deck that plays them).
 *
 * WHAT IT READS. The opponent's whole decklist, its commander included (SPEC 9, A31: the AI may know every
 * initial decklist and every revealed card, never a hand or the order of a library), from the engine's parsed
 * abilities (`heuristic-card-traits.ts`); the cards it may still hold, which are its POOL on the determinized
 * sample (`poolOf` in `heuristic-threats.ts`: the decklist less its public cards, the same multiset on every
 * sample); and the public battlefield. Never the real game: everything comes from the sample and the view of
 * the deciding seat, so a profile is a pure function of what that seat may know at that decision. A host that
 * asks one decision mid-game (the AI coach, `tools/ai/report.ts`) gets the same profile as the game did.
 *
 * WHAT IT HOLDS, for each opponent:
 *  - what the deck can do: how many of its cards have each capability (`Capability`), over the whole list;
 *  - what it may still do: the same counts over its pool (cards played or seen have left it: a player moves
 *    the odds the same way), and whether a permanent it controls gives its creatures haste;
 *  - how it wins and how fast: its curve (the mean mana value of its nonland cards), its archetype and its
 *    main route (`archetypeOf`, `routeOf`).
 *
 * WHO ASKS IT. The threat scenarios of the turn planner (`heuristic-threats.ts`: a big creature is a threat this
 * turn only when it can attack before the agent's next turn, and an aggro deck's open mana is respected less), and
 * the attack search's crack-back (`heuristic-crack-back.ts`: a creature cast from the hand counts only against a
 * deck that has one with haste or flash it can pay for). The capabilities it holds and does not ask yet (fogs,
 * reach, extra combats, the route) are there for the deeper searches of the later steps of issue 653.
 *
 * The decklist part is a pure function of the list, so it is kept for each `cards` record of a state (`deckOf`).
 */
import type { CardDefinition, CardId, GameState, GameView, SeatId } from '@commander-arena/engine';
import { type CardTraits, traitsOf } from './heuristic-card-traits';

export const CAPABILITIES = [
  'haste',
  'hasteGiver',
  'flash',
  'counter',
  'removal',
  'wipe',
  'trick',
  'fog',
  'reach',
  'extraCombat',
] as const;

/** One thing a card can do to the agent (the traits of `heuristic-card-traits.ts` of the same names). */
export type Capability = (typeof CAPABILITIES)[number];

/** How many cards have each capability. */
export type Capabilities = Readonly<Record<Capability, number>>;

/**
 * How a deck plays (see `archetypeOf`): `aggro` attacks early and taps out, `control` answers and holds mana up,
 * `combo` plays for a win outright, `midrange` is the rest.
 */
export type Archetype = 'aggro' | 'midrange' | 'control' | 'combo';

/** How a deck wins (see `routeOf`): its commander's damage, combat with many creatures, or spells. */
export type Route = 'commander' | 'combat' | 'spells';

/** What a decklist can do: a pure function of the list. */
export interface DeckProfile {
  readonly cards: number;
  readonly lands: number;
  readonly creatures: number;
  /** The mean mana value of its nonland cards. */
  readonly curve: number;
  /** The cards of each capability, its commander included. */
  readonly can: Capabilities;
  readonly archetype: Archetype;
  readonly route: Route;
}

/** One opponent as the agent knows it at one decision. */
export interface OpponentProfile extends DeckProfile {
  readonly seat: SeatId;
  /** The cards of each capability it may still hold: in its hand and its library. */
  readonly unseen: Capabilities;
  /** How many cards it may still hold (its hand and library). */
  readonly pool: number;
  /** A permanent it controls gives creatures haste: whatever creature it casts may attack at once. */
  readonly hasteOnBoard: boolean;
}

/** Archetype thresholds (a classification, not a weight: see `archetypeOf`). */
const AGGRO_CREATURES = 0.4;
const AGGRO_CURVE = 3.3;
const AGGRO_SPEED = 5;
const CONTROL_CREATURES = 0.3;
const CONTROL_ANSWERS = 0.2;
const COMBO_WINS = 2;
const COMMANDER_POWER = 5;
const EVASIVE_POWER = 3;
const COMBAT_CREATURES = 0.3;

const none = (): Record<Capability, number> =>
  Object.fromEntries(CAPABILITIES.map((c) => [c, 0])) as Record<Capability, number>;

/** The capabilities of a list of cards' traits. */
export function countOf(traits: readonly CardTraits[]): Capabilities {
  const out = none();
  for (const t of traits) for (const c of CAPABILITIES) if (t[c]) out[c] += 1;
  return out;
}

/**
 * The archetype of a deck, from its nonland cards: `combo` with at least two cards that win the game or take an
 * extra turn; `control` with few creatures (under 30%) and many answers (counterspells, removal and wipes: at least
 * 20%); `aggro` with many creatures (at least 40%) and either a low curve (at most 3.3) or many ways to attack at
 * once (haste, haste for others, extra combats: at least 5 cards); `midrange` otherwise.
 */
export function archetypeOf(traits: readonly CardTraits[]): Archetype {
  const spells = traits.filter((t) => !t.land);
  const n = Math.max(spells.length, 1);
  const can = countOf(spells);
  const creatures = spells.filter((t) => t.creature).length / n;
  const curve = spells.reduce((sum, t) => sum + t.manaValue, 0) / n;
  if (spells.filter((t) => t.winsOutright).length >= COMBO_WINS) return 'combo';
  if (
    creatures < CONTROL_CREATURES &&
    (can.counter + can.removal + can.wipe) / n >= CONTROL_ANSWERS
  )
    return 'control';
  const speed = can.haste + can.hasteGiver + can.extraCombat;
  if (creatures >= AGGRO_CREATURES && (curve <= AGGRO_CURVE || speed >= AGGRO_SPEED))
    return 'aggro';
  return 'midrange';
}

/**
 * How a deck wins: `commander` when its commander is a creature that kills alone (power 5 or more, or 3 or more and
 * hard to block); `combat` when at least 30% of its nonland cards are creatures; `spells` otherwise.
 */
export function routeOf(commander: CardTraits | undefined, traits: readonly CardTraits[]): Route {
  if (
    commander?.creature === true &&
    (commander.power >= COMMANDER_POWER || (commander.evasive && commander.power >= EVASIVE_POWER))
  ) {
    return 'commander';
  }
  const spells = traits.filter((t) => !t.land);
  const creatures = spells.filter((t) => t.creature).length / Math.max(spells.length, 1);
  return creatures >= COMBAT_CREATURES ? 'combat' : 'spells';
}

/** The definition of a card of the state. */
export function definitionOf(state: GameState, card: CardId): CardDefinition | undefined {
  const instance = state.cards[card];
  return instance === undefined ? undefined : state.definitions[instance.definition];
}

/** The profile of a decklist: its cards' traits counted (see the module comment). */
export function deckProfile(traits: readonly CardTraits[], commander?: CardTraits): DeckProfile {
  const spells = traits.filter((t) => !t.land);
  return {
    cards: traits.length,
    lands: traits.length - spells.length,
    creatures: spells.filter((t) => t.creature).length,
    curve: spells.reduce((sum, t) => sum + t.manaValue, 0) / Math.max(spells.length, 1),
    can: countOf(traits),
    archetype: archetypeOf(traits),
    route: routeOf(commander, traits),
  };
}

const DECKS = new WeakMap<GameState['cards'], Map<SeatId, DeckProfile>>();

/** The profile of the decklist `seat` owns in `state` (every card it started with), kept for each `cards` record. */
export function deckOf(state: GameState, seat: SeatId): DeckProfile {
  const bySeat = DECKS.get(state.cards) ?? new Map<SeatId, DeckProfile>();
  DECKS.set(state.cards, bySeat);
  const kept = bySeat.get(seat);
  if (kept !== undefined) return kept;
  const traits: CardTraits[] = [];
  let commander: CardTraits | undefined;
  for (const id of Object.keys(state.cards).sort() as CardId[]) {
    const instance = state.cards[id];
    const def = definitionOf(state, id);
    if (instance === undefined || instance.owner !== seat || def === undefined) continue;
    const t = traitsOf(def);
    traits.push(t);
    if (instance.isCommander && commander === undefined) commander = t;
  }
  const profile = deckProfile(traits, commander);
  bySeat.set(seat, profile);
  return profile;
}

/**
 * Whether a permanent `seat` controls on the battlefield of `view` gives creatures haste (read from its card). A
 * face-down permanent shows no card (CR 708.5): the sample's card under it is a guess, so it is not read.
 */
function givesHaste(view: GameView, sample: GameState, seat: SeatId): boolean {
  return view.battlefield.some((o) => {
    if (o.controller !== seat || o.faceDownBy !== undefined) return false;
    const card = sample.objects[o.id]?.card;
    const def = card === undefined || card === null ? undefined : definitionOf(sample, card);
    return def !== undefined && traitsOf(def).hasteGiver;
  });
}

/**
 * The profile of opponent `seat` at the decision of `view`: its decklist's profile, the capabilities of `pool` (the
 * cards it may still hold, by card id, as `poolOf` reads them on `sample`) and the haste its battlefield gives.
 */
export function profileOf(
  view: GameView,
  sample: GameState,
  seat: SeatId,
  pool: readonly { readonly card: CardId }[],
): OpponentProfile {
  const traits = pool.flatMap((c) => {
    const def = definitionOf(sample, c.card);
    return def === undefined ? [] : [traitsOf(def)];
  });
  return {
    ...deckOf(sample, seat),
    seat,
    unseen: countOf(traits),
    pool: pool.length,
    hasteOnBoard: givesHaste(view, sample, seat),
  };
}

/** Whether a creature of the opponent with these traits can attack before the agent's next turn begins. */
export const attacksAtOnce = (t: CardTraits, p: Pick<OpponentProfile, 'hasteOnBoard'>): boolean =>
  t.creature && (t.haste || p.hasteOnBoard);

// The differential safety net of the derive speed-up (M45, D-173): a fingerprint of everything the
// engine computes about characteristics, for every step of seeded random games. The fingerprints in
// `derive-digest.expected.json` were recorded with the implementation BEFORE the speed-up; a faster
// `derive` must reproduce them exactly (same derived characteristics, same legal actions, same state
// hashes, same views). Games are random on purpose: they reach boards no hand-written scenario does.
import {
  type Action,
  applyAction,
  type CardDefinition,
  createGame,
  type DeckConfig,
  deckOf,
  FIXTURE_CARDS,
  type GameObject,
  type GameState,
  getLegalActions,
  getView,
  SYNTHETIC_CARDS,
  stateHash,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { answerFromDecision, lcg } from './random-games';

/** The kinds of ability a static-heavy deck is built from: what the derive code has to apply. */
const MARKERS = [
  '"modifyPt"',
  '"grantKeyword"',
  '"grantAbility"',
  '"setPt"',
  '"setTypes"',
  '"setColors"',
  '"loseAllAbilities"',
  '"restriction"',
  '"cantBeBlockedBy"',
  '"characteristicPt"',
  '"takeFromLinkedExile"',
  '"attach"',
  '"copyOf"',
  '"copy"',
  '"condition"',
  '"chosen',
];

const LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const;

/** Every nonland synthetic card with at least one of the markers, in name order (stable across runs). */
function staticPool(): CardDefinition[] {
  const pool: CardDefinition[] = [];
  for (const name of Object.keys(SYNTHETIC_CARDS).sort()) {
    const card = SYNTHETIC_CARDS[name];
    if (card === undefined) continue;
    if (card.faces.some((f) => f.types.includes('land'))) continue;
    const text = JSON.stringify(card.faces.map((f) => f.abilities));
    if (MARKERS.some((m) => text.includes(m))) pool.push(card);
  }
  return pool;
}

const CREATURES = Object.keys(FIXTURE_CARDS)
  .sort()
  .filter((n) => FIXTURE_CARDS[n]?.faces[0]?.types.includes('creature'));

/** A 100-card deck of lands, fixture creatures (the lords' targets) and static-heavy cards, from one seed. */
export function soupDeck(seed: number): DeckConfig {
  const pick = lcg(seed * 7919 + 13);
  const pool = staticPool();
  const cards: CardDefinition[] = [...deckOf([['Isamaru, Hound of Konda', 1]])];
  for (let i = 0; i < 34; i += 1) cards.push(...deckOf([[LANDS[pick(LANDS.length)] as string, 1]]));
  for (let i = 0; i < 16; i += 1) {
    cards.push(...deckOf([[CREATURES[pick(CREATURES.length)] as string, 1]]));
  }
  while (cards.length < 100) cards.push(pool[pick(pool.length)] as CardDefinition);
  return { cards, commanders: [0] };
}

// ---- Fingerprints

const jsonOf = new WeakMap<object, string>();
/** The JSON of a list, made once per list object (the lists derive returns are shared when nothing changed them). */
function listJson(list: readonly unknown[]): string {
  let text = jsonOf.get(list);
  if (text === undefined) {
    text = JSON.stringify(list);
    jsonOf.set(list, text);
  }
  return text;
}

function derivedJson(state: GameState, obj: GameObject): string {
  const { abilities, restrictions, blockLimits, ...rest } = derive(state, obj);
  return [
    JSON.stringify(rest),
    listJson(abilities),
    listJson(restrictions),
    listJson(blockLimits),
  ].join('|');
}

/** The objects whose characteristics are looked at in a step: every zone but the libraries. */
function lookedAt(state: GameState): GameObject[] {
  const ids = [
    ...state.battlefield,
    ...state.stack,
    ...state.exile,
    ...state.seats.flatMap((s) => [...s.graveyard, ...s.hand, ...s.command]),
  ];
  const out: GameObject[] = [];
  for (const id of ids) {
    const o = state.objects[id];
    if (o !== undefined) out.push(o);
  }
  return out;
}

/**
 * The fingerprint of step `index`: the derived characteristics of its objects and the legal actions at every step; the
 * hash of the whole state (which costs more than all the rest) every tenth step and both players' views every fifth.
 */
export function digestState(state: GameState, index: number): string {
  const parts: string[] = [];
  if (index % 10 === 0) parts.push(stateHash(state));
  const withViews = index % 5 === 0;
  parts.push(stateHash(lookedAt(state).map((o) => `${o.id}:${derivedJson(state, o)}`)));
  const d = state.pending;
  if (d !== null) parts.push(stateHash(getLegalActions(state, d.seat)));
  if (withViews) for (const seat of state.seats) parts.push(stateHash(getView(state, seat.id)));
  return stateHash(parts);
}

export interface Played {
  /** The state after each action, the first being the one `createGame` returned. */
  readonly states: GameState[];
  readonly peak: number;
}

const BASE_CREATURES = [
  'Serra Angel',
  'Typhoid Rats',
  'Giant Spider',
  'Youthful Knight',
  'Fencing Ace',
  'Grizzly Bears',
] as const;
/** Lords, anthems and attachments every board starts with (their targets are the creatures above). */
const BASE_STATICS = [
  'SYNTHETIC Anthem',
  'SYNTHETIC Standard Bearer',
  'SYNTHETIC Plague Banner',
  'SYNTHETIC Titan Anthem',
  'SYNTHETIC Frail Anthem',
  'SYNTHETIC Cheap Lord',
] as const;

const buildable = new Map<string, boolean>();
/** Whether the scenario DSL can put the card on a battlefield as it is (some need a choice made as they enter). */
function canPlace(name: string): boolean {
  let ok = buildable.get(name);
  if (ok === undefined) {
    try {
      scenario().seat(0).battlefield(name).seat(1).build();
      ok = true;
    } catch {
      ok = false;
    }
    buildable.set(name, ok);
  }
  return ok;
}

/**
 * A mid-game board built directly (the scenario DSL): lands, six creatures, six static abilities, an Equipment and two Auras on
 * each side, then random static-heavy permanents on top, spells in hand and cards in the library. Random play from here
 * reaches equips, casts, attacks and removals with a lot of static abilities already in play.
 */
export function boardStart(seed: number): GameState {
  const pick = lcg(seed * 104729 + 5);
  const pool = staticPool();
  const permanents = pool.filter((c) =>
    c.faces[0]?.types.some((t) => t !== 'instant' && t !== 'sorcery' && t !== 'land'),
  );
  let b = scenario().seed(seed).settings({ startingLife: 20 });
  for (const seat of [0, 1] as const) {
    b = b.seat(seat);
    for (const land of LANDS) b = b.battlefield(land).battlefield(land);
    for (const c of BASE_CREATURES) b = b.battlefield(c, { label: `c${seat}-${c}` });
    for (const name of BASE_STATICS) b = b.battlefield(name);
    b = b
      .battlefield('SYNTHETIC Blade', { attachedTo: `c${seat}-Serra Angel` })
      .battlefield('SYNTHETIC Might Aura', { attachedTo: `c${seat}-Typhoid Rats` })
      .battlefield('SYNTHETIC Wings Aura', { attachedTo: `c${seat}-Giant Spider` });
    for (let i = 0; i < 10; i += 1) {
      const card = permanents[pick(permanents.length)] as CardDefinition;
      if (canPlace(card.name)) b = b.battlefield(card.name);
    }
    for (let i = 0; i < 6; i += 1) b = b.hand((pool[pick(pool.length)] as CardDefinition).name);
    for (let i = 0; i < 30; i += 1) {
      const names = i % 2 === 0 ? CREATURES : pool.map((c) => c.name);
      b = b.library(names[pick(names.length)] as string);
    }
  }
  return b.at('precombatMain').build().state;
}

/** Plays from `start` with a seeded random policy, keeping every state. */
export function playFrom(seed: number, start: GameState, maxActions: number): Played {
  const pick = lcg(seed * 31 + 7);
  let state = start;
  const states: GameState[] = [state];
  let peak = state.battlefield.length;
  for (let i = 0; i < maxActions && !state.result; i += 1) {
    const d = state.pending;
    if (d === null) throw new Error('no pending decision in a running game');
    const legal = getLegalActions(state, d.seat).filter((a) => a.kind !== 'concede');
    // The decision's own answer first; a rejected one (a requirement it ignored) gives way to the listed ones.
    const tries: Action[] = [];
    const own = answerFromDecision(d, pick);
    if (own !== null) tries.push(own);
    const first = pick(legal.length);
    for (let k = 0; k < legal.length; k += 1)
      tries.push(legal[(first + k) % legal.length] as Action);
    let r = applyAction(state, d.seat, tries[0] as Action);
    for (let k = 1; !r.ok && k < tries.length; k += 1) {
      r = applyAction(state, d.seat, tries[k] as Action);
    }
    if (!r.ok) throw new Error(`no answer accepted at action ${i}: ${r.error}`);
    state = r.state;
    states.push(state);
    peak = Math.max(peak, state.battlefield.length);
  }
  return { states, peak };
}

/** Plays a game from the opening of `decks`. */
export function playGame(
  seed: number,
  decks: [DeckConfig, DeckConfig],
  maxActions: number,
): Played {
  const start = createGame({ seed, decks, settings: { startingLife: 20 } }).state;
  return playFrom(seed, start, maxActions);
}

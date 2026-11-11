// Slice soak (D-100): whole games (the `soakGames()` count, test/soak.ts) with the 'chosen' deck style (SYNTHETIC cards: type and color
// lords, a lord that is the chosen type, a creature-spell cost reducer and a creature trigger that read
// the choice, a land that asks as it is played, a spell that puts a creature card onto the battlefield,
// plus a flicker, a token copy and a "loses all abilities" effect) between random agents, with CasualAgent
// in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state
// after every action; the action log replays to the same final state; and, with the rules read again here
// from the cards' texts (not from the engine's own choice code), at every step:
//   - a chooseOption decision is asked of the controller of the permanent about to enter, before it is on
//     the battlefield (a land in the hand, a spell on the stack, a card in a graveyard or exile, a token
//     that does not exist yet), with every creature type of CR 205.3m or the five colors, and the legal
//     actions are exactly those options and concede (CR 614.12, 614.12a);
//   - the answer is stored on the permanent that enters (the card, or the token, which asks for itself),
//     and every permanent of a card that asks has a choice of the right kind, no other has one (CR 614.12,
//     607.2d, 400.7: a flickered creature asks again);
//   - power and toughness of every creature that no effect touches are its printed values plus one for
//     each lord of its controller that reads the choice and matches (CR 611.3a, 613.4c), the Shifting
//     Captain is the chosen type in addition to its own (CR 613.1d), the cost of a creature card in hand
//     is reduced by one generic mana for each Tribal Discount of the chosen type (CR 118.7a), and a
//     creature that enters starts one trigger for each Tribal Scout of its type that is not itself.
import {
  CREATURE_TYPES,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
  type ObjectView,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  CHOSEN_LAND_NAMES,
  CHOSEN_SPELL_NAMES,
  CHOSEN_STYLE_PAIRS,
  type DeckStyle,
  landSlots,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const COLORS = ['W', 'U', 'B', 'R', 'G'];

// What each card asks and reads, restated from the cards' texts (src/cards/fixtures/synthetic-chosen.ts).
const ASKS_TYPE = new Set([
  'SYNTHETIC Rally Banner',
  'SYNTHETIC Banner Captain',
  'SYNTHETIC Shifting Captain',
  'SYNTHETIC Tribal Land',
  'SYNTHETIC Tribal Discount',
  'SYNTHETIC Tribal Scout',
]);
const ASKS_COLOR = new Set(['SYNTHETIC Hue Banner', 'SYNTHETIC Hue Captain']);
/** "Creatures you control of the chosen type get +1/+1" and its "Other ..." forms. */
const TYPE_LORDS = new Map([
  ['SYNTHETIC Rally Banner', { other: false }],
  ['SYNTHETIC Banner Captain', { other: true }],
  ['SYNTHETIC Shifting Captain', { other: true }],
]);
const COLOR_LORDS = new Map([
  ['SYNTHETIC Hue Banner', { other: false }],
  ['SYNTHETIC Hue Captain', { other: true }],
]);

interface Tally {
  asked: number;
  askedType: number;
  askedColor: number;
  fromHand: number;
  fromStack: number;
  fromGraveyard: number;
  fromExile: number;
  forToken: number;
  askedAgain: number;
  casualAnswers: number;
  randomAnswers: number;
  pumpedByType: number;
  pumpedByColor: number;
  notPumped: number;
  shiftingTyped: number;
  discounted: number;
  undiscounted: number;
  scoutTriggers: number;
  scoutNone: number;
  flickered: number;
  wiped: number;
}
const newTally = (): Tally => ({
  asked: 0,
  askedType: 0,
  askedColor: 0,
  fromHand: 0,
  fromStack: 0,
  fromGraveyard: 0,
  fromExile: 0,
  forToken: 0,
  askedAgain: 0,
  casualAnswers: 0,
  randomAnswers: 0,
  pumpedByType: 0,
  pumpedByColor: 0,
  notPumped: 0,
  shiftingTyped: 0,
  discounted: 0,
  undiscounted: 0,
  scoutTriggers: 0,
  scoutNone: 0,
  flickered: 0,
  wiped: 0,
});

interface Printed {
  readonly name: string;
  readonly types: readonly string[];
  readonly subtypes: readonly string[];
  readonly colors: readonly string[];
  readonly power: number | string | null;
  readonly toughness: number | string | null;
  readonly manaCost: readonly string[] | null;
}

/** What the card or token has printed on it (this slice's cards change nothing about it by themselves). */
function printedOf(state: GameState, id: ObjectId): Printed | null {
  const obj = state.objects[id];
  if (obj === undefined) return null;
  if (obj.token !== null) return obj.token.characteristics;
  if (obj.card === null) return null;
  const face = state.definitions[state.cards[obj.card]?.definition ?? -1]?.faces[obj.face];
  return face ?? null;
}

const hasEffect = (state: GameState, id: ObjectId): boolean =>
  state.continuousEffects.some((e) => e.objects.includes(id));

/** The permanents of the battlefield as this test reads them. */
function battlefieldOf(state: GameState) {
  return state.battlefield.flatMap((id) => {
    const obj = state.objects[id];
    const printed = printedOf(state, id);
    return obj === undefined || printed === null ? [] : [{ id, obj, printed }];
  });
}

/** Whether the permanent named `name` is one that asks, and for what. */
const asksFor = (name: string): 'creatureType' | 'color' | null =>
  ASKS_TYPE.has(name) ? 'creatureType' : ASKS_COLOR.has(name) ? 'color' : null;

function checkQuestion(
  tally: Tally,
  casual: ReadonlySet<number>,
  step: StepInfo,
  seen: Set<string>,
) {
  const d = step.before.pending;
  if (d?.kind !== 'chooseOption') return;
  const state = step.before;
  tally.asked += 1;
  if (d.purpose === 'creatureType') tally.askedType += 1;
  else tally.askedColor += 1;
  // The options: every creature type of CR 205.3m, or the five colors.
  expect(d.options, 'options').toEqual(d.purpose === 'creatureType' ? CREATURE_TYPES : COLORS);
  expect(getLegalActions(state, d.seat), 'legal actions').toEqual([
    ...d.options.map((option) => ({ kind: 'chooseOption', option })),
    { kind: 'concede' },
  ]);
  // The question is about something that is not on the battlefield yet.
  const source = state.objects[d.source];
  expect(source, 'the source exists').toBeDefined();
  if (source === undefined) return;
  expect(source.zone, 'asked before it enters').not.toBe('battlefield');
  const asking = printedOf(state, d.source);
  const isToken = source.zone === 'stack' && asking?.name !== d.sourceName;
  if (isToken) {
    // A token that is a copy of a creature that asks: the source is the spell making it.
    tally.forToken += 1;
    expect(source.stack?.kind).toBe('spell');
    expect(d.seat).toBe(source.controller);
  } else {
    expect(asking?.name, 'the entering permanent').toBe(d.sourceName);
    // Its controller chooses: the caster of a spell, otherwise the owner (a card in a hand, a
    // graveyard or exile enters under its owner's control).
    expect(d.seat).toBe(source.zone === 'stack' ? source.controller : source.owner);
    if (source.zone === 'hand') tally.fromHand += 1;
    else if (source.zone === 'stack') tally.fromStack += 1;
    else if (source.zone === 'graveyard') tally.fromGraveyard += 1;
    else if (source.zone === 'exile') tally.fromExile += 1;
  }
  expect(asksFor(d.sourceName), `${d.sourceName} asks`).toBe(d.purpose);
  // The same card asked again in one game: a flickered creature, or one raised from the graveyard.
  const key = `${d.seat}:${d.sourceName}`;
  if (seen.has(key)) tally.askedAgain += 1;
  seen.add(key);
  if (casual.has(d.seat)) tally.casualAnswers += 1;
  else tally.randomAnswers += 1;
}

/** After a chooseOption answer: the entering permanent has exactly that choice. */
function checkAnswer(step: StepInfo) {
  const before = step.before.pending;
  if (before?.kind !== 'chooseOption' || step.action.kind !== 'chooseOption') return;
  const chosen = step.events.find(
    (e): e is Extract<GameEvent, { kind: 'optionChosen' }> => e.kind === 'optionChosen',
  );
  expect(chosen, 'the answer is an event').toMatchObject({
    seat: before.seat,
    purpose: before.purpose,
    option: step.action.option,
  });
  const entered = step.events.flatMap((e) =>
    e.kind === 'zoneChanged' && e.toZone === 'battlefield'
      ? [e.to]
      : e.kind === 'tokenCreated'
        ? [e.object]
        : [],
  );
  expect(entered.length, 'one permanent entered').toBe(1);
  const made = step.after.objects[entered[0] as ObjectId];
  expect(made?.chosen).toEqual(
    before.purpose === 'creatureType'
      ? { creatureType: step.action.option }
      : { color: step.action.option },
  );
}

/** Every permanent of a card that asks has a choice of the right kind; no other permanent has one. */
function checkChoices(state: GameState) {
  for (const { id, obj, printed } of battlefieldOf(state)) {
    const kind = asksFor(printed.name);
    if (kind === null) {
      expect(obj.chosen, `${printed.name} chose nothing`).toBeUndefined();
    } else {
      const have = kind === 'creatureType' ? obj.chosen?.creatureType : obj.chosen?.color;
      expect(have, `${printed.name} ${id} has chosen a ${kind}`).toBeDefined();
      expect(Object.keys(obj.chosen ?? {}), `${printed.name} chose only a ${kind}`).toEqual([kind]);
    }
  }
}

const sum = (list: readonly number[]) => list.reduce((a, b) => a + b, 0);
const generic = (cost: readonly string[]) =>
  sum(cost.map((s) => (/^\d+$/.test(s) ? Number(s) : 0)));

/** Power, toughness, types and cost of what no effect touches, from the cards' texts. */
function checkReaders(tally: Tally, state: GameState, viewer: 0 | 1, step: StepInfo) {
  const board = battlefieldOf(state);
  const lords = board.filter(
    ({ printed, obj }) =>
      (TYPE_LORDS.has(printed.name) || COLOR_LORDS.has(printed.name)) && obj.chosen !== undefined,
  );
  // A lord that something changed (it lost its abilities, became a Frog) is left out, with its side.
  if (lords.some(({ id }) => hasEffect(state, id))) {
    tally.wiped += 1;
    return;
  }
  // Nothing here reads a choice unless a lord or a Tribal Discount is on the battlefield (the view is the costly part).
  const discountsOnBoard = board.some(
    ({ printed }) => printed.name === 'SYNTHETIC Tribal Discount',
  );
  if (lords.length === 0 && !discountsOnBoard) return;
  const view = getView(state, viewer);
  const seen = new Map<ObjectId, ObjectView>(view.battlefield.map((o) => [o.id, o]));
  const typesOf = ({ id, obj, printed }: (typeof board)[number]): string[] => {
    const own = [...printed.subtypes];
    // "This creature is the chosen type in addition to its other types."
    if (printed.name === 'SYNTHETIC Shifting Captain' && obj.chosen?.creatureType !== undefined) {
      own.push(obj.chosen.creatureType);
      expect(seen.get(id)?.subtypes.slice().sort(), 'Shifting Captain types').toEqual(
        own.slice().sort(),
      );
      tally.shiftingTyped += 1;
    }
    return own;
  };
  const byId = new Map(board.map((p) => [p.id, typesOf(p)] as const));
  for (const creature of board) {
    if (!creature.printed.types.includes('creature') || hasEffect(state, creature.id)) continue;
    const mine = byId.get(creature.id) ?? [];
    let bonus = 0;
    for (const lord of lords) {
      if (lord.obj.controller !== creature.obj.controller) continue;
      const typeLord = TYPE_LORDS.get(lord.printed.name);
      const colorLord = COLOR_LORDS.get(lord.printed.name);
      if (typeLord !== undefined) {
        if (typeLord.other && lord.id === creature.id) continue;
        const wanted = lord.obj.chosen?.creatureType;
        if (wanted !== undefined && mine.includes(wanted)) {
          bonus += 1;
          tally.pumpedByType += 1;
        }
      }
      if (colorLord !== undefined) {
        if (colorLord.other && lord.id === creature.id) continue;
        const wanted = lord.obj.chosen?.color;
        if (wanted !== undefined && creature.printed.colors.includes(wanted)) {
          bonus += 1;
          tally.pumpedByColor += 1;
        }
      }
    }
    const power = creature.printed.power;
    const toughness = creature.printed.toughness;
    if (typeof power !== 'number' || typeof toughness !== 'number') continue;
    // Counters from other cards of the mixed decks change it too (CR 122.1b).
    bonus += (creature.obj.counters['+1/+1'] ?? 0) - (creature.obj.counters['-1/-1'] ?? 0);
    const shown = seen.get(creature.id);
    expect(
      [shown?.power, shown?.toughness],
      `${creature.printed.name} ${creature.id} with ${bonus} pump(s) after ${JSON.stringify(step.action)}`,
    ).toEqual([power + bonus, toughness + bonus]);
    if (bonus === 0) tally.notPumped += 1;
  }

  // The cost of a creature card in hand: one generic less for each Discount of its type (CR 118.7a).
  const discounts = board.filter(({ printed }) => printed.name === 'SYNTHETIC Tribal Discount');
  if (discounts.every(({ id }) => !hasEffect(state, id))) {
    for (const card of view.seats[viewer]?.hand ?? []) {
      if (
        !card.types.includes('creature') ||
        card.manaCost === null ||
        card.castCost === undefined
      ) {
        continue;
      }
      const n = discounts.filter(
        ({ obj }) =>
          obj.controller === viewer &&
          obj.chosen?.creatureType !== undefined &&
          card.subtypes.includes(obj.chosen.creatureType),
      ).length;
      const want = Math.max(0, generic(card.manaCost) - n);
      expect(generic(card.castCost), `${card.name} costs ${card.manaCost.join('')} with ${n}`).toBe(
        want,
      );
      // The colored symbols are never reduced.
      expect(card.castCost.filter((s) => !/^\d+$/.test(s))).toEqual(
        card.manaCost.filter((s) => !/^\d+$/.test(s)),
      );
      if (n > 0 && generic(card.manaCost) > 0) tally.discounted += 1;
      else if (generic(card.manaCost) > 0) tally.undiscounted += 1;
    }
  }
}

/**
 * A creature that enters starts one trigger for each Tribal Scout of its type, other than itself. The
 * triggers may wait for an ordering decision, so the expected and the started ones are counted across
 * steps and compared at the next priority decision, which has them all on the stack.
 */
function checkScouts(tally: Tally, step: StepInfo, count: { expected: number; started: number }) {
  const { before, after } = step;
  const scouts = battlefieldOf(after).filter(
    ({ printed }) => printed.name === 'SYNTHETIC Tribal Scout',
  );
  const scoutIds = new Set(scouts.map(({ id }) => id));
  count.started += after.stack.filter((id) => {
    if (before.stack.includes(id)) return false;
    const o = after.objects[id];
    return o?.stack?.kind === 'ability' && o.stack.source !== null && scoutIds.has(o.stack.source);
  }).length;
  const entered = step.events.flatMap((e) =>
    e.kind === 'zoneChanged' && e.toZone === 'battlefield'
      ? [e.to]
      : e.kind === 'tokenCreated'
        ? [e.object]
        : [],
  );
  for (const id of entered) {
    const printed = printedOf(after, id);
    const obj = after.objects[id];
    if (printed === null || obj === undefined || !printed.types.includes('creature')) continue;
    // A creature's types here are its printed ones, and the chosen one for a Shifting Captain.
    const types = [...printed.subtypes];
    if (printed.name === 'SYNTHETIC Shifting Captain' && obj.chosen?.creatureType !== undefined) {
      types.push(obj.chosen.creatureType);
    }
    for (const scout of scouts) {
      if (scout.id === id || scout.obj.controller !== obj.controller) continue;
      if (hasEffect(after, scout.id)) continue;
      const wanted = scout.obj.chosen?.creatureType;
      if (wanted !== undefined && types.includes(wanted)) count.expected += 1;
    }
  }
  if (after.pending?.kind !== 'priority') return;
  expect(count.started, `scout triggers after ${JSON.stringify(step.action)}`).toBe(count.expected);
  if (count.expected > 0) tally.scoutTriggers += count.expected;
  else if (entered.length > 0 && scouts.length > 0) tally.scoutNone += 1;
  count.expected = 0;
  count.started = 0;
}

const nameOfObject = (state: GameState, id: ObjectId) => printedOf(state, id)?.name ?? '';

test(
  `${GAMES} chosen-type and chosen-color games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = CHOSEN_STYLE_PAIRS[g % CHOSEN_STYLE_PAIRS.length] ?? ['chosen', 'chosen'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 16000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 16000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const asked = new Set<string>();
      const scoutCount = { expected: 0, started: 0 };
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkQuestion(total, casual, step, asked);
        checkAnswer(step);
        checkChoices(step.after);
        checkScouts(total, step, scoutCount);
        // The readers are checked when a player has priority: nothing is half done then.
        if (step.after.pending?.kind === 'priority') {
          const viewer = step.after.pending.seat as 0 | 1;
          checkReaders(total, step.after, viewer, step);
        }
        // A flicker that returns a creature that was asked about earlier asks about the new object.
        for (const e of step.events) {
          if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'exile') {
            if (asksFor(nameOfObject(step.before, e.from)) !== null) total.flickered += 1;
          }
        }
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The log replays to the same game.
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
    }
    console.log(`100 chosen games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`);

    expectPath(total.askedType);
    expectPath(total.askedColor);
    expectPath(total.fromHand);
    expectPath(total.fromStack);
    expectPath(total.fromGraveyard);
    expectPath(total.forToken);
    expectPath(total.askedAgain);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
    expectPath(total.pumpedByType);
    expectPath(total.pumpedByColor);
    expectPath(total.notPumped);
    expectPath(total.shiftingTyped);
    expectPath(total.discounted);
    expectPath(total.undiscounted);
    expectPath(total.scoutTriggers);
    expectPath(total.flickered);
    expectPath(total.wiped);
  },
  soakTimeout(600_000),
);

test('the chosen cards are in no other deck style, so the older seeded games are unchanged', () => {
  const styles: DeckStyle[] = [
    'spells',
    'creatures',
    'brawl',
    'triggers',
    'keywords',
    'mana',
    'search',
    'activated',
    'attachments',
    'kicker',
    'food',
    'layers',
    'ward',
    'vehicles',
    'prevention',
    'layouts',
    'sagas',
    'triggerTargets',
    'library',
    'references',
    'restrictions',
    'costs',
    'manaPlus',
  ];
  const names = new Set<string>([...CHOSEN_LAND_NAMES, ...CHOSEN_SPELL_NAMES]);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  // And the chosen style does use them all.
  const own = new Set([...spellSlots('chosen'), ...landSlots('chosen')]);
  for (const name of names) expect(own.has(name), name).toBe(true);
});

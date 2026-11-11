// Slice soak (D-114): whole games (the `soakGames()` count, test/soak.ts) with the 'modal' deck style (SYNTHETIC cards: choose one, two, one or both
// and one or more, "choose one, or both with a commander", a modal spell with kicker and one with X, modal enters
// and attack triggers, modal activated abilities) between random agents, with CasualAgent in some seats. Every
// game finishes with a result, no fallback, no rejected action and consistent state after every action; the
// action log replays to the same final state; and, with the rules read again here from the cards' texts (not
// from the engine's own mode code), at every step:
//   - a chooseModes decision is asked of the controller of the spell or ability on the stack, only when more than
//     one choice is legal, offers exactly the sets of distinct legal modes between the least and the most the
//     text allows (the widening with a commander on the battlefield included), fewest first, a mode being legal
//     when its target can be found (CR 700.2, 700.2a, 700.2d), with cancel for a spell and an activation and
//     none for a trigger (CR 603.3c, 733);
//   - a choice the engine made by itself had exactly one legal set;
//   - every offered set is accepted, a set with more modes than allowed or none is refused;
//   - the modes chosen are on the object on the stack in printed order, the targets asked afterwards are those of
//     the chosen modes only, each tagged with its mode (CR 601.2c, 700.2c);
//   - when it resolves: each chosen mode whose target is still there does what its text says, one whose target is
//     gone does nothing, a spell or ability all of whose targets are gone does nothing at all (CR 608.2b);
//   - a modal triggered ability with no legal mode is removed (CR 603.3c).
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type DeckStyle,
  landSlots,
  MODAL_CARD_NAMES,
  MODAL_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

type Aim = 'creature' | 'opposingCreature' | 'opposingArtifact' | 'anyPlayer' | 'opponentPlayer';

/** What one mode says, restated from the cards' texts (src/cards/fixtures/synthetic-modal.ts). */
interface ModeFact {
  readonly aim?: Aim;
  readonly id?: string;
  /** Damage to the target (a number, or 'x'). */
  readonly damage?: number | 'x';
  readonly draw?: number | 'x';
  /** Life you gain. */
  readonly gain?: number;
  /** Life the target player gains. */
  readonly targetGain?: number;
  /** Life each opponent loses. */
  readonly drain?: number;
  readonly destroy?: true;
}
interface ModalFact {
  readonly min: number;
  readonly max: number;
  /** With a commander on the battlefield the number that may be chosen is 2. */
  readonly widens?: true;
  readonly modes: readonly ModeFact[];
}

const FACTS: Readonly<Record<string, ModalFact>> = {
  'SYNTHETIC Three Way Charm': {
    min: 1,
    max: 1,
    modes: [{ aim: 'creature', id: 'kill', damage: 3 }, { draw: 1 }, { gain: 3 }],
  },
  'SYNTHETIC Twin Charm': {
    min: 2,
    max: 2,
    modes: [
      { aim: 'creature', id: 'hit', damage: 2 },
      { aim: 'anyPlayer', id: 'who', targetGain: 3 },
      { draw: 1 },
    ],
  },
  'SYNTHETIC Both Charm': { min: 1, max: 2, modes: [{ draw: 1 }, { gain: 4 }] },
  'SYNTHETIC Split Strike': {
    min: 1,
    max: 2,
    modes: [
      { aim: 'creature', id: 'c', damage: 2 },
      { aim: 'opponentPlayer', id: 'p', damage: 2 },
    ],
  },
  'SYNTHETIC Many Charm': {
    min: 1,
    max: 3,
    modes: [{ draw: 1 }, { gain: 2 }, { aim: 'creature', id: 'ping', damage: 1 }],
  },
  'SYNTHETIC Command Charm': {
    min: 1,
    max: 1,
    widens: true,
    modes: [{ draw: 1 }, { gain: 3 }],
  },
  'SYNTHETIC Kicked Charm': {
    min: 1,
    max: 1,
    modes: [{ aim: 'creature', id: 'k', damage: 2 }, { draw: 1 }],
  },
  'SYNTHETIC X Charm': {
    min: 1,
    max: 1,
    modes: [{ aim: 'creature', id: 'xd', damage: 'x' }, { draw: 'x' }],
  },
  'SYNTHETIC Drain Charm': { min: 1, max: 1, modes: [{ drain: 2 }, { gain: 2 }] },
  'SYNTHETIC Modal Greeter': {
    min: 1,
    max: 1,
    modes: [{ gain: 3 }, { aim: 'opposingCreature', id: 'hit', damage: 2 }],
  },
  'SYNTHETIC Modal Hunter': {
    min: 1,
    max: 1,
    modes: [
      { aim: 'opposingArtifact', id: 'art', destroy: true },
      { aim: 'opposingCreature', id: 'hit', damage: 2 },
    ],
  },
  'SYNTHETIC Twin Greeter': {
    min: 2,
    max: 2,
    modes: [
      { draw: 1 },
      { aim: 'opposingCreature', id: 'hit', damage: 1 },
      { aim: 'anyPlayer', id: 'who', targetGain: 2 },
    ],
  },
  'SYNTHETIC Modal Raider': {
    min: 1,
    max: 1,
    modes: [{ draw: 1 }, { aim: 'opposingCreature', id: 'hit', damage: 1 }],
  },
  'SYNTHETIC Modal Totem': {
    min: 1,
    max: 1,
    modes: [{ draw: 1 }, { aim: 'creature', id: 'zap', damage: 2 }, { gain: 2 }],
  },
  'SYNTHETIC Picky Totem': {
    min: 1,
    max: 1,
    modes: [
      { aim: 'opposingCreature', id: 'hit', damage: 2 },
      { aim: 'opposingArtifact', id: 'art', destroy: true },
    ],
  },
};

interface Tally {
  askedSpell: number;
  askedTrigger: number;
  askedAbility: number;
  automatic: number;
  removed: number;
  widened: number;
  notWidened: number;
  pairsChosen: number;
  moreThanTwoChosen: number;
  targetsAfterModes: number;
  resolved: number;
  fizzled: number;
  partial: number;
  damageChecked: number;
  drawChecked: number;
  lifeChecked: number;
  destroyChecked: number;
  kickedModal: number;
  xModal: number;
  casualAnswers: number;
  randomAnswers: number;
  setsAccepted: number;
}
const newTally = (): Tally => ({
  askedSpell: 0,
  askedTrigger: 0,
  askedAbility: 0,
  automatic: 0,
  removed: 0,
  widened: 0,
  notWidened: 0,
  pairsChosen: 0,
  moreThanTwoChosen: 0,
  targetsAfterModes: 0,
  resolved: 0,
  fizzled: 0,
  partial: 0,
  damageChecked: 0,
  drawChecked: 0,
  lifeChecked: 0,
  destroyChecked: 0,
  kickedModal: 0,
  xModal: 0,
  casualAnswers: 0,
  randomAnswers: 0,
  setsAccepted: 0,
});

/** The name of the card behind an object: the spell's own, or the permanent an ability belongs to. */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) return '';
  const origin = obj.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

/** Whether the spell or ability on the stack is itself modal (a creature spell with a modal trigger is not). */
function isModal(state: GameState, id: ObjectId | null): boolean {
  const obj = id === null ? undefined : state.objects[id];
  if (obj?.stack == null) return false;
  if (obj.stack.kind === 'ability') return obj.stack.ability?.modes !== undefined;
  const card = obj.card === null ? undefined : state.cards[obj.card];
  const face = card === undefined ? undefined : state.definitions[card.definition]?.faces[obj.face];
  return face?.spell?.modes !== undefined;
}

/** Whether a mode could be aimed now: its target can be found, read from the view of the controller. */
function aimable(state: GameState, seat: number, aim: Aim | undefined): boolean {
  if (aim === undefined || aim === 'anyPlayer' || aim === 'opponentPlayer') return true;
  const board = getView(state, seat).battlefield;
  const theirs = (o: { controller: number }) =>
    aim.startsWith('opposing') === false || o.controller !== seat;
  if (aim === 'creature' || aim === 'opposingCreature') {
    return board.some((o) => o.types.includes('creature') && theirs(o));
  }
  return board.some((o) => o.types.includes('artifact') && theirs(o));
}

/** The sets the rules allow: distinct legal modes, between the least and the most, fewest first. */
function expectedSets(state: GameState, seat: number, fact: ModalFact): number[][] {
  const legal = fact.modes.flatMap((m, i) => (aimable(state, seat, m.aim) ? [i] : []));
  const commander = getView(state, seat).battlefield.some(
    (o) => o.controller === seat && o.isCommander,
  );
  const max = Math.min(fact.widens === true && commander ? 2 : fact.max, legal.length);
  const out: number[][] = [];
  const build = (from: number, picked: number[], size: number): void => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let k = from; k < legal.length; k += 1) {
      picked.push(legal[k] as number);
      build(k + 1, picked, size);
      picked.pop();
    }
  };
  for (let size = fact.min; size <= max; size += 1) build(0, [], size);
  return out;
}

/** The mode facts of the modes chosen, with the spec ids of their targets, in printed order. */
const slotsOf = (fact: ModalFact, modes: readonly number[]) =>
  modes.flatMap((i) => {
    const id = fact.modes[i]?.id;
    return id === undefined ? [] : [{ specId: id, mode: i }];
  });

function checkAsk(tally: Tally, casual: ReadonlySet<number>, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'chooseModes') return;
  const state = step.before;
  const name = nameOf(state, d.source);
  const fact = FACTS[name];
  expect(fact, `${name} is modal`).toBeDefined();
  if (fact === undefined) return;
  const obj = state.objects[d.source];
  expect(obj?.zone).toBe('stack');
  expect(d.seat).toBe(obj?.controller);
  const kind =
    obj?.stack?.kind === 'spell' ? 'spell' : state.triggering !== null ? 'trigger' : 'ability';
  expect(d.purpose).toBe(kind);
  const sets = expectedSets(state, d.seat, fact);
  expect(d.sets, `${name} legal sets`).toEqual(sets);
  expect(sets.length, 'asked only when there is a choice').toBeGreaterThan(1);
  expect(d.min).toBe(fact.min);
  expect(d.modes.map((m) => m.legal)).toEqual(
    fact.modes.map((_, i) => sets.some((s) => s.includes(i))),
  );
  expect(getLegalActions(state, d.seat), 'legal actions').toEqual([
    ...sets.map((modes) => ({ kind: 'chooseModes', modes })),
    ...(kind === 'trigger' ? [] : [{ kind: 'cancel' }]),
    { kind: 'concede' },
  ]);
  // Every offered set is accepted; none, and more than the text allows, are refused.
  for (const modes of sets) {
    expect(applyAction(state, d.seat, { kind: 'chooseModes', modes }).ok, `[${modes}]`).toBe(true);
    tally.setsAccepted += 1;
  }
  expect(applyAction(state, d.seat, { kind: 'chooseModes', modes: [] }).ok).toBe(false);
  const all = fact.modes.map((_, i) => i);
  if (d.max < all.length) {
    expect(applyAction(state, d.seat, { kind: 'chooseModes', modes: all }).ok).toBe(false);
  }
  if (kind === 'spell') tally.askedSpell += 1;
  else if (kind === 'trigger') tally.askedTrigger += 1;
  else tally.askedAbility += 1;
  if (fact.widens === true) {
    if (d.max === 2) tally.widened += 1;
    else tally.notWidened += 1;
  }
  if (casual.has(d.seat)) tally.casualAnswers += 1;
  else tally.randomAnswers += 1;
}

/** After the answer: the modes are on the object, printed order, and the targets asked are theirs. */
function checkAnswer(tally: Tally, step: StepInfo) {
  const before = step.before.pending;
  if (before?.kind === 'chooseModes' && step.action.kind === 'chooseModes') {
    const chosen = [...step.action.modes].sort((a, b) => a - b);
    expect(step.after.objects[before.source]?.stack?.chosenModes).toEqual(chosen);
    const fact = FACTS[nameOf(step.before, before.source)] as ModalFact;
    expect(
      step.events.filter((e) => e.kind === 'modesChosen'),
      'the modesChosen event',
    ).toContainEqual({
      kind: 'modesChosen',
      seat: before.seat,
      source: before.source,
      modes: chosen,
      automatic: false,
    });
    if (chosen.length === 2) tally.pairsChosen += 1;
    if (chosen.length > 2) tally.moreThanTwoChosen += 1;
    const next = step.after.pending;
    if (next?.kind === 'targets' && next.source === before.source) {
      expect(
        next.specs.map((s) => ({ specId: s.specId, mode: s.mode })),
        'the slots of the chosen modes',
      ).toEqual(slotsOf(fact, chosen));
      tally.targetsAfterModes += 1;
    }
  }
  for (const e of step.events) {
    if (e.kind === 'modesChosen' && e.automatic) {
      tally.automatic += 1;
      // The engine chose by itself: exactly one choice was legal (checked on the state after, the board
      // unchanged by the choice).
      const fact = FACTS[nameOf(step.after, e.source)] as ModalFact;
      const controller = step.after.objects[e.source]?.controller ?? 0;
      expect(expectedSets(step.after, controller, fact), `${e.source}`).toEqual([[...e.modes]]);
    }
    if (e.kind === 'abilityRemoved' && e.reason === 'noLegalModes') {
      tally.removed += 1;
      const fact = FACTS[nameOf(step.after, e.source)] as ModalFact;
      expect(expectedSets(step.after, e.seat, fact), 'no legal choice of modes').toEqual([]);
    }
    if (e.kind === 'spellCast' || e.kind === 'abilityActivated') {
      const id = e.kind === 'spellCast' ? e.object : e.stackObject;
      const stack = id === null ? undefined : step.after.objects[id]?.stack;
      const name = id === null ? '' : nameOf(step.after, id);
      if (stack != null && FACTS[name] !== undefined && isModal(step.after, id)) {
        expect(stack.chosenModes.length, `${name} was cast with its modes`).toBeGreaterThan(0);
        if (e.kind === 'spellCast' && e.kicked === true) tally.kickedModal += 1;
        if (e.kind === 'spellCast' && e.x !== undefined) tally.xModal += 1;
      }
    }
  }
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** What a resolving modal spell or ability did, read from the events (CR 608.2). */
function checkResolution(tally: Tally, step: StepInfo) {
  for (const done of [...eventsOf(step.events, 'resolved'), ...eventsOf(step.events, 'fizzled')]) {
    const obj = step.before.objects[done.object];
    const name = nameOf(step.before, done.object);
    const fact = FACTS[name];
    if (obj === undefined || fact === undefined || obj.stack === null) continue;
    const modes = obj.stack.chosenModes;
    const controller = obj.controller;
    const source = obj.stack.kind === 'ability' ? (obj.stack.source ?? done.object) : done.object;
    const targetOf = (id: string) => obj.stack?.chosenTargets.find((t) => t.specId === id);
    const alive = (id: string): boolean => {
      const t = targetOf(id);
      if (t === undefined) return false;
      return t.kind === 'player' || step.before.battlefield.includes(t.id);
    };
    const chosen = modes.map((i) => fact.modes[i] as ModeFact);
    const targeted = chosen.filter((m) => m.id !== undefined);
    const noneLeft = targeted.length > 0 && targeted.every((m) => !alive(m.id as string));
    if (done.kind === 'fizzled') {
      expect(noneLeft, `${name} fizzled with a target left`).toBe(true);
      tally.fizzled += 1;
      expect(eventsOf(step.events, 'damageDealt').filter((e) => e.source === source)).toEqual([]);
      continue;
    }
    expect(noneLeft, `${name} resolved with every target gone`).toBe(false);
    tally.resolved += 1;
    if (targeted.some((m) => !alive(m.id as string))) tally.partial += 1;
    const x = obj.stack.x ?? 0;
    let damage = 0;
    let draws = 0;
    const net = new Map<number, number>();
    const add = (seat: number, n: number) => net.set(seat, (net.get(seat) ?? 0) + n);
    for (const m of chosen) {
      if (m.id !== undefined && !alive(m.id)) continue; // CR 608.2b: this part does nothing
      const n = (v: number | 'x' | undefined) => (v === 'x' ? x : (v ?? 0));
      if (m.damage !== undefined) {
        damage += n(m.damage);
        const t = targetOf(m.id as string);
        if (t?.kind === 'player') add(t.seat, -n(m.damage));
      }
      draws += n(m.draw);
      add(controller, m.gain ?? 0);
      if (m.targetGain !== undefined) {
        const t = targetOf(m.id as string);
        if (t?.kind === 'player') add(t.seat, m.targetGain);
      }
      if (m.drain !== undefined) {
        for (const s of step.before.seats) if (s.id !== controller) add(s.id, -m.drain);
      }
    }
    const dealt = eventsOf(step.events, 'damageDealt')
      .filter((e) => e.source === source)
      .reduce((total, e) => total + e.amount, 0);
    expect(dealt, `${name} damage`).toBe(damage);
    if (damage > 0) tally.damageChecked += 1;
    if (eventsOf(step.events, 'drewFromEmptyLibrary').length === 0) {
      expect(eventsOf(step.events, 'cardDrawn').filter((e) => e.seat === controller)).toHaveLength(
        draws,
      );
      if (draws > 0) tally.drawChecked += 1;
    }
    for (const s of step.before.seats) {
      const changed = eventsOf(step.events, 'lifeChanged')
        .filter((e) => e.seat === s.id)
        .reduce((total, e) => total + (e.to - e.from), 0);
      expect(changed, `${name}: life of seat ${s.id}`).toBe(net.get(s.id) ?? 0);
      if ((net.get(s.id) ?? 0) !== 0) tally.lifeChecked += 1;
    }
    for (const m of chosen) {
      if (m.destroy === true && m.id !== undefined && alive(m.id)) {
        const t = targetOf(m.id);
        if (t?.kind === 'object') {
          expect(step.after.battlefield.includes(t.id), `${name} destroyed its target`).toBe(false);
          tally.destroyChecked += 1;
        }
      }
    }
  }
}

test(
  `${GAMES} modal games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = MODAL_STYLE_PAIRS[g % MODAL_STYLE_PAIRS.length] ?? ['modal', 'modal'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 19000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 19000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkAsk(total, casual, step);
        checkAnswer(total, step);
        checkResolution(total, step);
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
    console.log(`100 modal games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`);

    expectPath(total.askedSpell);
    expectPath(total.askedTrigger);
    expectPath(total.askedAbility);
    expectPath(total.automatic);
    expectPath(total.removed);
    expectPath(total.pairsChosen);
    expectPath(total.moreThanTwoChosen);
    expectPath(total.targetsAfterModes);
    expectPath(total.resolved);
    expectPath(total.damageChecked);
    expectPath(total.drawChecked);
    expectPath(total.lifeChecked);
    expectPath(total.destroyChecked);
    expectPath(total.setsAccepted);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
  },
  soakTimeout(600_000),
);

test('the modal cards are in no other deck style, so the older seeded games are unchanged', () => {
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
    'chosen',
    'x',
    'keywordBatch',
    'triggerSlice',
  ];
  const names = new Set<string>(MODAL_CARD_NAMES);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  // And the modal style does use them all, and every one has a restated fact.
  const own = new Set([...spellSlots('modal'), ...landSlots('modal')]);
  for (const name of names) {
    expect(own.has(name), name).toBe(true);
    expect(FACTS[name], `${name} has a restated fact`).toBeDefined();
  }
});

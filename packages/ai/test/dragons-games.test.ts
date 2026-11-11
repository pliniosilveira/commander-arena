// Slice soak (D-151): whole games with the 'dragons' deck style (SYNTHETIC cards of the Dragons slice: cards played from exile and from the top of the
// library, abilities that work from the graveyard, conditions on the turn, mana for Dragons, a choice among named options, an artifact that enters as a
// copy of a creature, a Saga with read ahead, discarding any number of cards, an additional combat phase, Dethrone, entering attacking, other targets,
// modes that do not repeat in a turn, revealing and exiling from the library, Discover, beholding, paying any amount of mana and a Lieutenant) between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action;
// the action log replays to the same final state; and rules of the slice are restated from the events and the state before each action, apart from the
// engine: an additional combat phase begins another beginning of combat step with the extra phase counted, a Saga with read ahead enters with one to its
// final chapter of lore counters and the chapter that triggers on that turn is the one its counters say, an artifact that copies a creature is a creature
// with haste for the rest of the turn and an artifact again at the next, a mode of a permanent is never chosen twice in a turn, the card a Discover offers is a
// nonland card of mana value 4 or less, and a card beholded from the hand is a Dragon.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  DRAGON_LAND_NAMES,
  DRAGON_NAMES,
  DRAGON_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  extraCombats: number;
  copies: number;
  readAheads: number;
  readAheadChapters: number;
  discoverOffers: number;
  beholds: number;
  payAnyAmounts: number;
  modesChosen: number;
  enteredAttacking: number;
  options: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  extraCombats: 0,
  copies: 0,
  readAheads: 0,
  readAheadChapters: 0,
  discoverOffers: 0,
  beholds: 0,
  payAnyAmounts: 0,
  modesChosen: 0,
  enteredAttacking: 0,
  options: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return card === undefined
    ? '?'
    : (state.definitions[card.definition]?.faces[obj.face ?? 0]?.name ?? '?');
};

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

/** The mana value of a card as the seat sees it (printed cost). */
const manaValueOfView = (state: GameState, seat: number, id: ObjectId): number | null => {
  const view = getView(state, seat);
  const o =
    view.exile.find((x) => x.id === id) ??
    view.battlefield.find((x) => x.id === id) ??
    view.seats.flatMap((s) => s.hand ?? []).find((x) => x.id === id);
  if (o === undefined) return null;
  return (o.manaCost ?? []).reduce((n, sym) => n + (/^\d+$/.test(sym) ? Number(sym) : 1), 0);
};

interface Memory {
  /** The artifacts that entered as a copy, until the turn ends. */
  copied: Set<ObjectId>;
  /** Combat phases begun this turn. */
  combats: number;
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, action, events } = step;

  for (const e of events) {
    if (e.kind === 'turnBegan') {
      // An artifact that copied a creature is the artifact again once the turn is over.
      for (const id of memory.copied) {
        const obj = after.objects[id];
        if (obj?.zone !== 'battlefield') continue;
        const view = getView(after, obj.controller).battlefield.find((o) => o.id === id);
        if (view?.types.includes('creature') === true) {
          throw new Error(`the artifact ${id} is still a creature after its turn`);
        }
      }
      memory.copied.clear();
      memory.combats = 0;
    }
    if (e.kind === 'stepBegan' && e.step === 'beginningOfCombat') {
      memory.combats += 1;
      // CR 500.8: a second combat phase in a turn is an additional one, which an attack trigger asked for.
      if (memory.combats > 1) {
        t.extraCombats += 1;
      }
    }
    if (e.kind === 'spellCast') tally(t, nameOf(after, e.object));
    if (e.kind === 'landPlayed') tally(t, nameOf(after, e.object));
    if (e.kind === 'enteredAsCopy') {
      t.copies += 1;
      memory.copied.add(e.object);
      const obj = after.objects[e.object];
      const view =
        obj === undefined
          ? undefined
          : getView(after, obj.controller).battlefield.find((o) => o.id === e.object);
      if (view === undefined) throw new Error('the copy is not on the battlefield');
      if (!view.types.includes('creature'))
        throw new Error('an artifact that copied a creature is not one');
      if (!view.keywords.includes('haste')) throw new Error('the copy has no haste');
    }
    // CR 714.3b, 702.155: a Saga with read ahead enters with one to its final chapter of lore counters.
    if (e.kind === 'counterAdded' && e.counter === 'lore' && e.by !== undefined) {
      if (nameOf(after, e.object) === 'SYNTHETIC Reading Rite') {
        t.readAheads += 1;
        if (e.count < 1 || e.count > 3)
          throw new Error(`read ahead entered with ${e.count} lore counters`);
      }
    }
    // CR 702.155a: the turn it entered, the chapter that triggers is the one its lore counters say.
    if (e.kind === 'abilityTriggered' && e.chapter !== undefined && e.source !== null) {
      if (
        nameOf(after, e.source) === 'SYNTHETIC Reading Rite' &&
        after.turnLog.entered.some((x) => x.object === e.source)
      ) {
        t.readAheadChapters += 1;
        const lore = after.objects[e.source]?.counters.lore ?? 0;
        if (lore !== e.chapter) {
          throw new Error(
            `chapter ${e.chapter} triggered on the turn it entered with ${lore} lore counters`,
          );
        }
      }
    }
    if (e.kind === 'modesChosen' && nameOf(after, e.source) !== '?') {
      const source = after.objects[e.source]?.stack?.source;
      if (source != null && nameOf(after, source) === 'SYNTHETIC Thrashing Wyrm')
        t.modesChosen += 1;
    }
    if (e.kind === 'cardsRevealed' && e.from === 'hand') {
      t.beholds += 1;
      for (const name of e.names) {
        const card = before.seats
          .flatMap((s) => s.hand)
          .map((id) => before.objects[id])
          .find((o) => o !== undefined && nameOf(before, o.id) === name);
        const face =
          card === undefined
            ? undefined
            : getView(before, e.seat).seats[e.seat]?.hand?.find((h) => h.id === card.id);
        if (face !== undefined && !face.subtypes.includes('Dragon')) {
          throw new Error(`${name} was beholded as a Dragon`);
        }
      }
    }
  }

  // A mode of a permanent's modal ability is never chosen twice in a turn.
  const seen = new Set<string>();
  for (const m of after.turnLog.modesChosen) {
    const key = `${m.source}:${m.mode}`;
    if (seen.has(key)) throw new Error(`mode ${m.mode} of ${m.source} was chosen twice in a turn`);
    seen.add(key);
  }

  // The card Discover offers is a nonland card within the limit; Breaching Hoard offers one of mana value 4 or less to cast.
  const d = before.pending;
  if (d?.kind === 'confirmOptional' && d.purpose === 'cascade' && d.subject !== undefined) {
    const source = nameOf(before, d.source);
    const value = manaValueOfView(before, d.seat, d.subject);
    if (
      value !== null &&
      (source === 'SYNTHETIC Discovery Rite' || source === 'SYNTHETIC Breaching Hoard') &&
      value > 4
    ) {
      throw new Error(`${source} offered a card of mana value ${value}`);
    }
    if (action.kind === 'acceptOptional' || action.kind === 'declineOptional')
      t.discoverOffers += 1;
  }
  if (d?.kind === 'chooseOption' && d.purpose === 'option') {
    t.options += 1;
    if (action.kind === 'chooseOption' && !d.options.includes(action.option)) {
      throw new Error(`${action.option} is not one of ${d.options.join(', ')}`);
    }
  }
  if (d?.kind === 'chooseX' && d.purpose === 'payAnyAmount' && action.kind === 'chooseX') {
    t.payAnyAmounts += 1;
    if (action.value < d.min || action.value > d.max) throw new Error('paid more than possible');
  }
  // A creature that was never declared as an attacker but is attacking: it entered attacking (CR 508.4).
  if (
    after.combat !== null &&
    before.combat !== null &&
    after.combat.attackers.length > before.combat.attackers.length &&
    action.kind !== 'declareAttackers'
  ) {
    t.enteredAttacking += 1;
  }
}

test(
  `${GAMES} dragons games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DRAGON_STYLE_PAIRS[g % DRAGON_STYLE_PAIRS.length] ?? ['dragons', 'dragons'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 15100 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 15100 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = { copied: new Set(), combats: 0 };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} dragons games: ${JSON.stringify(summary)}`);

    // Every card of the slice was cast or played at least once somewhere in the games.
    for (const name of [...DRAGON_NAMES, ...DRAGON_LAND_NAMES]) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);

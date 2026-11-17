// Slice soak (issue 43, group 3): whole games with the 'galadrielG3' deck style (SYNTHETIC cards of the engine fixtures `synthetic-galadriel-g3.ts`: the instant that shields a permanent or
// makes a Pilot, the enchantment that exchanges control of itself and a permanent, the sorcery that exchanges control of two creatures, the planeswalker with kicker whose copy is not
// legendary and has loyalty 1, whose 0 ability draws and reveals a card and loses loyalty equal to its mana value, the Serpent that makes a token each upkeep, the sorcery with buyback, the
// enchantment that rolls a d4 and scries that many cards and draws on the highest result, the counterspell that asks for the greatest power, the instant that stops the abilities of a
// permanent) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every
// action; the action log replays to the same final state; and, with the rules read again here from the cards' texts and CR 701.12, CR 702.27a, CR 706.1a, CR 706.2, CR 118.12a, CR 306.5b and
// CR 602.5 (not from the engine's own code), at every step:
//   - an exchange of control changes the controllers of exactly two permanents, to each other's controller (CR 701.12b);
//   - a spell bought back that resolves is in its owner's hand and one that was countered is in the graveyard (CR 702.27a);
//   - the die of the Ward shows 1 to 4 and, for each of the controller's Wards, a highest natural result triggers its draw once (CR 706.1a, 706.2, 603.2);
//   - the scry of the Ward looks at as many cards as the die showed;
//   - the question "pay or it is countered" of the Mutation names exactly the greatest power among the creatures of its controller as it is asked (CR 118.12a, 608.2c);
//   - a kicked Walker makes a copy that is a planeswalker with one loyalty counter that is not legendary (CR 707.9b, 306.5b);
//   - the 0 ability of a Walker removes as many loyalty counters as the mana value of the card it drew and revealed, or all it has (CR 701.20a, 202.3);
//   - a permanent whose activated abilities cannot be activated is offered no activation and no mana ability by the legal actions (CR 602.5, 605.1a).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  GALADRIEL_G3_NAMES,
  GALADRIEL_G3_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WARD = 'SYNTHETIC Die Ward';
const WALKER = 'SYNTHETIC Mirror Walker';
const MUTATION = 'SYNTHETIC Mutation Counter';
const PILOT = 'Pilot';

interface Tally {
  exchanges: number;
  boughtBack: number;
  boughtBackReturned: number;
  boughtBackCountered: number;
  rolls: number;
  highest: number;
  wardScries: number;
  mutationQuestions: number;
  mutationCasts: number;
  mutationOnSpell: number;
  kickedWalkers: number;
  walkerZero: number;
  lockedChecks: number;
  pilots: number;
  byCard: Map<string, number>;
  /** The stack objects of the spells cast with buyback, still on the stack. */
  bought: Set<ObjectId>;
  /** The latest die each seat rolled. */
  lastRoll: Map<number, number>;
  /** The draw triggers of the Ward the highest results owe each seat, and the ones that went on the stack. */
  owed: Map<number, number>;
  fired: Map<number, number>;
}

const newTally = (): Tally => ({
  exchanges: 0,
  boughtBack: 0,
  boughtBackReturned: 0,
  boughtBackCountered: 0,
  rolls: 0,
  highest: 0,
  wardScries: 0,
  mutationQuestions: 0,
  mutationCasts: 0,
  mutationOnSpell: 0,
  kickedWalkers: 0,
  walkerZero: 0,
  lockedChecks: 0,
  pilots: 0,
  byCard: new Map(),
  bought: new Set(),
  lastRoll: new Map(),
  owed: new Map(),
  fired: new Map(),
});

/** The mana value of a mana cost as the view shows it: a number is itself, X counts for nothing, any other symbol for one. */
const manaValueOf = (cost: readonly string[] | null | undefined): number =>
  (cost ?? []).reduce((n, s) => n + (/^\d+$/.test(s) ? Number(s) : s === 'X' ? 0 : 1), 0);

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // CR 701.12b: an exchange of control moves exactly two permanents, each to the other's controller.
  const changes = events.filter((e) => e.kind === 'controlChanged');
  if (changes.length > 0) {
    expect(changes.length % 2, 'control changes come in pairs').toBe(0);
    const view = getView(after, 0);
    for (let i = 0; i < changes.length; i += 2) {
      const [a, b] = [changes[i], changes[i + 1]];
      if (a?.kind !== 'controlChanged' || b?.kind !== 'controlChanged') throw new Error('pair');
      expect(a.object, 'two different permanents').not.toBe(b.object);
      expect([a.from, a.to], 'to each other').toEqual([b.to, b.from]);
      expect(a.from, 'by two different players').not.toBe(a.to);
      for (const e of [a, b]) {
        const now = view.battlefield.find((o) => o.id === e.object);
        if (now !== undefined) expect(now.controller, 'the exchange held').toBe(e.to);
      }
      t.exchanges += 1;
    }
  }
  for (const e of events) {
    if (e.kind === 'abilityActivated' || e.kind === 'abilityTriggered') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (e.boughtBack === true) {
        t.bought.add(e.object);
        t.boughtBack += 1;
      }
      if (e.kicked === true && name === WALKER) t.kickedWalkers += 1;
      if (name === MUTATION) {
        t.mutationCasts += 1;
        const targets = after.objects[e.object]?.stack?.chosenTargets ?? [];
        if (targets.some((x) => x.kind === 'object' && after.objects[x.id]?.zone === 'stack')) {
          t.mutationOnSpell += 1;
        }
      }
    }
    // CR 702.27a: the card of a spell that was bought back goes to the hand as it resolves; countered, it goes to the graveyard.
    if (e.kind === 'zoneChanged' && e.fromZone === 'stack' && t.bought.has(e.from)) {
      t.bought.delete(e.from);
      const countered = events.some((x) => x.kind === 'countered' && x.object === e.from);
      if (countered || e.toZone === 'graveyard') {
        expect(e.toZone, 'a countered spell goes to the graveyard').toBe('graveyard');
        t.boughtBackCountered += 1;
      } else {
        expect(e.toZone, 'a spell bought back returns to its owner hand').toBe('hand');
        t.boughtBackReturned += 1;
      }
    }
  }
  // CR 706.1a, 706.2, 603.2: the die of the Ward and what its highest result triggers.
  const highestBy = new Map<number, number>();
  for (const e of events) {
    if (e.kind !== 'dieRolled') continue;
    t.rolls += 1;
    expect(e.result, 'a die shows 1 to its sides').toBeGreaterThanOrEqual(1);
    expect(e.result).toBeLessThanOrEqual(e.sides);
    t.lastRoll.set(e.seat, e.result);
    if (e.result === e.sides) {
      highestBy.set(e.seat, (highestBy.get(e.seat) ?? 0) + 1);
      t.highest += 1;
    }
  }
  // The trigger is put on the stack when the resolution that rolled the die is over, which may be a step later (a scry waits for its answer): what is owed is counted as the dice are
  // rolled, what was triggered as the abilities go on the stack, and the two agree whenever nothing is waiting.
  for (const seat of [0, 1]) {
    const wardsBefore = before.battlefield.filter(
      (id) => cardNameOf(before, id) === WARD && (before.objects[id]?.controller ?? seat) === seat,
    ).length;
    const wardsAfter = after.battlefield.filter(
      (id) => cardNameOf(after, id) === WARD && (after.objects[id]?.controller ?? seat) === seat,
    ).length;
    t.owed.set(
      seat,
      (t.owed.get(seat) ?? 0) + (highestBy.get(seat) ?? 0) * Math.min(wardsBefore, wardsAfter),
    );
    const fired = events.filter(
      (e) =>
        e.kind === 'abilityTriggered' &&
        e.seat === seat &&
        e.abilityIndex === 1 &&
        cardNameOf(before, e.source) === WARD,
    ).length;
    t.fired.set(seat, (t.fired.get(seat) ?? 0) + fired);
    expect(
      t.fired.get(seat) ?? 0,
      `seat ${seat}: no draw trigger without a highest result`,
    ).toBeLessThanOrEqual(t.owed.get(seat) ?? 0);
    if (
      after.pending?.kind === 'priority' &&
      after.stack.length === 0 &&
      !events.some((e) => e.kind === 'dieRolled')
    ) {
      expect(
        t.fired.get(seat) ?? 0,
        `seat ${seat}: a draw trigger for each Ward and each highest result`,
      ).toBe(t.owed.get(seat) ?? 0);
    }
  }
  // The scry of the Ward looks at as many cards as the die showed.
  const asked = before.pending;
  if (
    asked?.kind === 'arrangeCards' &&
    asked.purpose === 'scry' &&
    cardNameOf(before, before.objects[asked.source]?.stack?.source ?? asked.source) === WARD
  ) {
    // A library with fewer cards than the die showed is looked at whole (CR 701.22a).
    const library = before.seats[asked.seat]?.library.length ?? 0;
    expect(asked.cards.length, 'as many cards as the die showed').toBe(
      Math.min(t.lastRoll.get(asked.seat) ?? -1, library),
    );
    t.wardScries += 1;
  }
  // CR 118.12a, 608.2c: the amount of the Mutation is the greatest power among the creatures of its controller, as it is asked.
  if (
    asked?.kind === 'confirmOptional' &&
    asked.purpose === 'counterUnlessPays' &&
    asked.sourceName === MUTATION
  ) {
    const controller = before.objects[asked.source]?.controller ?? 0;
    const power = Math.max(
      0,
      ...getView(before, controller)
        .battlefield.filter((o) => o.controller === controller && o.types.includes('creature'))
        .map((o) => o.power ?? 0),
    );
    expect(asked.cost, 'the greatest power in generic mana').toEqual([
      { kind: 'mana', symbols: [String(power)] },
    ]);
    t.mutationQuestions += 1;
  }
  // CR 707.9b, 306.5b: the copy a kicked Walker makes is a planeswalker with one loyalty counter and is not legendary.
  for (const e of events) {
    if (e.kind === 'tokenCreated' && e.name === WALKER) {
      const copy = getView(after, 0).battlefield.find((o) => o.id === e.object);
      if (copy !== undefined) {
        expect(copy.types, 'a planeswalker').toContain('planeswalker');
        expect(copy.supertypes ?? [], 'not legendary').not.toContain('legendary');
        expect(copy.counters?.loyalty, 'one loyalty counter').toBe(1);
      }
    }
  }
  // CR 701.20a, 202.3, 122.1: the 0 ability of a Walker reveals the card drawn and removes loyalty equal to its mana value.
  const reveal = events.find((e) => e.kind === 'cardsRevealed' && e.from === 'hand');
  const drawn = events.find((e) => e.kind === 'cardDrawn');
  // The ability goes on the stack when it is activated and resolves in a later step: the one that resolves here.
  const resolving = events.find((e) => {
    if (e.kind !== 'resolved') return false;
    const source = before.objects[e.object]?.stack?.source;
    return source != null && cardNameOf(before, source) === WALKER;
  });
  const walkerSource =
    resolving?.kind === 'resolved' ? before.objects[resolving.object]?.stack?.source : null;
  if (reveal !== undefined && drawn?.kind === 'cardDrawn' && walkerSource != null) {
    const view = getView(after, drawn.seat);
    const card = view.seats[drawn.seat]?.hand?.find((o) => o.id === drawn.object);
    const wanted = manaValueOf(card?.manaCost);
    if (card !== undefined) {
      const had = before.objects[walkerSource]?.counters.loyalty ?? 0;
      const lost = events
        .filter((e) => e.kind === 'counterRemoved' && e.counter === 'loyalty')
        .filter((e) => e.kind === 'counterRemoved' && e.object === walkerSource)
        .reduce((n, e) => n + (e.kind === 'counterRemoved' ? e.count : 0), 0);
      expect(lost, 'loyalty equal to the mana value of the card drawn, or all of it').toBe(
        Math.min(wanted, had),
      );
      t.walkerZero += 1;
    }
  }
  // CR 602.5, 605.1a: nothing is offered for a permanent whose activated abilities cannot be activated.
  const view = getView(after, 0);
  for (const o of view.battlefield) {
    if (o.restrictions?.includes('cantActivateAbilities') !== true) continue;
    const offered = getLegalActions(after, o.controller);
    for (const a of offered) {
      if (a.kind === 'activate')
        expect(a.object, 'no activation of a locked permanent').not.toBe(o.id);
      if (a.kind === 'activateAbility') {
        expect(a.source, 'no mana ability of a locked permanent').not.toBe(o.id);
      }
    }
    t.lockedChecks += 1;
  }
  for (const e of events) {
    if (e.kind === 'tokenCreated' && e.name === PILOT) t.pilots += 1;
  }
}

test(
  `${GAMES} galadrielG3 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GALADRIEL_G3_STYLE_PAIRS[g % GALADRIEL_G3_STYLE_PAIRS.length] ?? [
        'galadrielG3',
        'galadrielG3',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 271000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 271000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 271000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of [
        'exchanges',
        'boughtBack',
        'boughtBackReturned',
        'boughtBackCountered',
        'rolls',
        'highest',
        'wardScries',
        'mutationQuestions',
        'mutationCasts',
        'mutationOnSpell',
        'kickedWalkers',
        'walkerZero',
        'lockedChecks',
        'pilots',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const {
      bought: _bought,
      lastRoll: _last,
      owed: _owed,
      fired: _fired,
      byCard,
      ...counts
    } = total;
    console.log(
      `${GAMES} galadrielG3 games: ${JSON.stringify({ ...counts, byCard: Object.fromEntries([...byCard].sort()) })}`,
    );
    expectPath(total.exchanges, 'an exchange of control');
    expectPath(total.boughtBackReturned, 'a spell bought back that came back to the hand');
    expectPath(total.rolls, 'a die rolled');
    expectPath(total.highest, 'a highest natural result');
    expectPath(total.wardScries, 'a scry of the number rolled');
    expectPath(total.mutationQuestions, 'a spell asked to pay the greatest power');
    expectPath(total.kickedWalkers, 'a kicked Walker');
    expectPath(total.walkerZero, 'the 0 ability of a Walker');
    expectPath(total.lockedChecks, 'a permanent whose abilities cannot be activated');
    expectPath(total.pilots, 'a Pilot token');
    for (const name of GALADRIEL_G3_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);

// Slice soak (D-1301, D-1300): whole games with the 'featherG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-feather-g1.ts`: protection from the color of your
// choice for one creature and for a group, protection from red, and "draw a card, then +1/+0 for each card you've drawn this turn", with bodies, burn and removal) between random
// agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action
// log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - nothing is asked as a spell of the group is cast (CR 608.2d: the color is chosen as it resolves, not as it is cast);
//   - the color question comes from the controller of the spell, offers exactly the five colors, and names the creatures to protect: for the one-creature card exactly one creature,
//     which that player controls ("target creature you control");
//   - after the answer every creature the question named that is still on the battlefield has protection (CR 702.16);
//   - no spell is cast at a creature that has protection from one of the spell's colors until the end of the turn it was given (CR 702.16b);
//   - when the pump of Feather Fist resolves, the power of its target grows by the number of cards its controller has drawn this turn (CR 121.1, 611.2c).
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
import { tokenOrCopyNameOf } from './game-names';
import {
  FEATHER_G1_NAMES,
  FEATHER_G1_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WARD = 'SYNTHETIC Feather Ward';
const RALLY = 'SYNTHETIC Feather Rally';
const VEIL = 'SYNTHETIC Feather Veil';
const FIST = 'SYNTHETIC Feather Fist';

interface Tally {
  casts: number;
  questions: number;
  answers: number;
  groupQuestions: number;
  fists: number;
  fistsMeasured: number;
  fistsWithMoreThanOne: number;
  protectedAtCast: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  casts: 0,
  questions: 0,
  answers: 0,
  groupQuestions: 0,
  fists: 0,
  fistsMeasured: 0,
  fistsWithMoreThanOne: 0,
  protectedAtCast: 0,
  byCard: new Map(),
});

/** What a game remembers between steps: the colors each creature has protection from, and the turn they were given in. */
type Given = Map<ObjectId, { turn: number; colors: Set<string> }>;

const power = (state: StepInfo['after'], id: ObjectId): number | null | undefined =>
  getView(state, 0).battlefield.find((o) => o.id === id)?.power;

function checkRules(t: Tally, given: Given, step: StepInfo): void {
  const { before, after, events } = step;
  const turn = after.turn.number;
  for (const [id, g] of given) if (g.turn !== turn) given.delete(id);

  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (!(FEATHER_G1_NAMES as readonly string[]).includes(name)) {
        // Any spell: not at a creature that has protection from one of its colors (CR 702.16b).
        const spell = getView(after, 0).stack.find((o) => o.id === e.object);
        for (const target of after.objects[e.object]?.stack?.chosenTargets ?? []) {
          if (target.kind !== 'object') continue;
          const protection = given.get(target.id);
          if (protection === undefined || spell === undefined) continue;
          t.protectedAtCast += 1;
          for (const color of spell.colors) {
            expect(
              protection.colors.has(color),
              `${name} was cast at a creature with protection from ${color}`,
            ).toBe(false);
          }
        }
      } else {
        t.casts += 1;
        // CR 608.2d: nothing is asked as the spell is cast.
        if (name === WARD || name === RALLY) {
          expect(
            after.pending?.kind === 'chooseOption' && after.pending.purpose === 'protectionColor',
            `${name}: asked as it was cast`,
          ).toBe(false);
        }
      }
    }
    if (e.kind === 'resolved') {
      const name = tokenOrCopyNameOf(before, e.object);
      const targets = before.objects[e.object]?.stack?.chosenTargets ?? [];
      if (name === VEIL) {
        for (const target of targets) {
          if (target.kind === 'object' && after.objects[target.id]?.zone === 'battlefield') {
            given.set(target.id, { turn, colors: new Set(['R']) });
            expect(
              getView(after, 0).battlefield.find((o) => o.id === target.id)?.keywords,
              'protection from red',
            ).toContain('protection');
          }
        }
      }
      if (name === FIST) {
        t.fists += 1;
        const controller = before.objects[e.object]?.controller;
        const target = targets[0];
        if (controller !== undefined && target?.kind === 'object') {
          const drawn = after.seats[controller]?.cardsDrawnThisTurn ?? 0;
          const was = power(before, target.id);
          const is = power(after, target.id);
          if (typeof was === 'number' && typeof is === 'number') {
            t.fistsMeasured += 1;
            expect(is - was, 'power grows by the cards drawn this turn').toBe(drawn);
            if (drawn > 1) t.fistsWithMoreThanOne += 1;
          }
        }
      }
    }
  }

  // The question: from the controller of the spell, five colors, the creatures to protect.
  const asked = after.pending;
  if (asked?.kind === 'chooseOption' && asked.purpose === 'protectionColor') {
    const spell = after.objects[asked.source];
    const name = tokenOrCopyNameOf(after, asked.source);
    t.questions += 1;
    expect(asked.options, `${name}: the colors`).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(asked.seat, `${name}: asked of its controller`).toBe(spell?.controller);
    expect((asked.protects ?? []).length, `${name}: names the creatures`).toBeGreaterThan(0);
    for (const id of asked.protects ?? []) {
      expect(after.objects[id]?.zone, `${name}: on the battlefield`).toBe('battlefield');
    }
    if (name === WARD) {
      expect(asked.protects, `${name}: one creature`).toHaveLength(1);
      for (const id of asked.protects ?? []) {
        expect(after.objects[id]?.controller, `${name}: a creature its controller controls`).toBe(
          asked.seat,
        );
      }
    } else {
      t.groupQuestions += 1;
    }
  }

  // The answer: every creature the question named that is still there has protection, and the color is remembered for the turn.
  const was = before.pending;
  if (
    step.action.kind === 'chooseOption' &&
    was?.kind === 'chooseOption' &&
    was.purpose === 'protectionColor'
  ) {
    t.answers += 1;
    for (const id of was.protects ?? []) {
      if (after.objects[id]?.zone !== 'battlefield') continue;
      expect(
        getView(after, 0).battlefield.find((o) => o.id === id)?.keywords,
        'protection after the answer',
      ).toContain('protection');
      const existing = given.get(id);
      const colors = existing?.colors ?? new Set<string>();
      colors.add(step.action.option);
      given.set(id, { turn, colors });
    }
  }
}

test(
  `${GAMES} featherG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = FEATHER_G1_STYLE_PAIRS[g % FEATHER_G1_STYLE_PAIRS.length] ?? [
        'featherG1',
        'featherG1',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 227000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 227000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 227000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const given: Given = new Map();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, given, step);
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
        'casts',
        'questions',
        'answers',
        'groupQuestions',
        'fists',
        'fistsMeasured',
        'fistsWithMoreThanOne',
        'protectedAtCast',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} featherG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.casts);
    expectPath(total.questions);
    expectPath(total.answers);
    expectPath(total.groupQuestions);
    expectPath(total.fists);
    expectPath(total.fistsMeasured);
    expectPath(total.fistsWithMoreThanOne);
    for (const name of FEATHER_G1_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(300_000),
);

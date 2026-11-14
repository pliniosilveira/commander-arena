// The legal actions agree with what the engine does for X (D-103, SPEC 4.2): a spell with an {X} is
// offered exactly when X = 0 can be paid, the decision offers exactly the values from 0 to the most the
// player could pay, an offered X always carries through to the end (targets, payment, the spell on the
// stack), and the next value is refused. The most is restated here from the rules, not from the engine:
// a spell needs one mana of its color and generic mana for X, the kicker and the commander tax, less one
// for each cost reducer (never below zero), from the lands and the mana pool (CR 107.3a, 601.2f, 118.7a,
// 903.8). Boards are a grid, so the test has no randomness; the same actions give the same game.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-x.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type ChooseXDecision,
  checkInvariants,
  getLegalActions,
  stateHash,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

type Kind = 'burn' | 'kicked' | 'unkicked' | 'commander';

interface Layout {
  readonly kind: Kind;
  /** Lands of the spell's color, and of the other color. */
  readonly onColor: number;
  readonly offColor: number;
  /** Mana in the pool: of the spell's color, and of another. */
  readonly poolOn: number;
  readonly poolOff: number;
  readonly discounts: number;
  /** Times the commander was cast before (tax 2 each). */
  readonly casts: number;
}

const NAMES: Record<Kind, string> = {
  burn: 'SYNTHETIC X Burn', // {X}{R}
  kicked: 'SYNTHETIC Kicked X Burn', // {X}{R}, kicker {2}, kicked
  unkicked: 'SYNTHETIC Kicked X Burn',
  commander: 'SYNTHETIC Hydra Cub', // {X}{G}, from the command zone
};

/** What the rules say the most X is, or null when the spell cannot be cast at all. */
function oracle(l: Layout): number | null {
  const fixed = (l.kind === 'kicked' ? 2 : 0) + (l.kind === 'commander' ? 2 * l.casts : 0);
  const mana = l.onColor + l.offColor + l.poolOn + l.poolOff;
  const colored = l.onColor + l.poolOn >= 1;
  const payable = (x: number) => colored && mana >= 1 + Math.max(0, x + fixed - l.discounts);
  if (!payable(0)) return null;
  let x = 0;
  while (payable(x + 1)) x += 1;
  return x;
}

function build(l: Layout): ScenarioGame {
  const on = l.kind === 'commander' ? 'Forest' : 'Mountain';
  const b = scenario().seat(0);
  if (l.kind === 'commander') b.commander(NAMES.commander, { casts: l.casts, label: 'spell' });
  else b.hand(NAMES[l.kind], { label: 'spell' });
  if (l.onColor > 0) b.battlefield(on, { count: l.onColor });
  if (l.offColor > 0) b.battlefield('Island', { count: l.offColor });
  if (l.poolOn > 0) b.pool(l.kind === 'commander' ? 'G'.repeat(l.poolOn) : 'R'.repeat(l.poolOn));
  if (l.poolOff > 0) b.pool('U'.repeat(l.poolOff));
  if (l.discounts > 0) b.battlefield('SYNTHETIC Spell Discount', { count: l.discounts });
  return b.seat(1).build();
}

const LAYOUTS: Layout[] = [];
for (const kind of ['burn', 'kicked', 'unkicked', 'commander'] as const) {
  for (const onColor of [0, 1, 2, 4]) {
    for (const offColor of [0, 1, 3]) {
      for (const [poolOn, poolOff] of [
        [0, 0],
        [0, 1],
        [2, 0],
      ] as const) {
        for (const discounts of [0, 1, 2]) {
          for (const casts of kind === 'commander' ? [0, 1, 2] : [0]) {
            LAYOUTS.push({ kind, onColor, offColor, poolOn, poolOff, discounts, casts });
          }
        }
      }
    }
  }
}

const describeLayout = (l: Layout) => JSON.stringify(l);

/** Casts the spell and answers the kicker question as the layout says; stops at X or the targets. */
function start(g: ScenarioGame, l: Layout): void {
  g.act(0).cast('spell');
  if (g.state.pending?.kind === 'confirmOptional') {
    // The kicked total can be paid: the layout decides whether to pay it.
    if (l.kind === 'kicked') g.act(0).accept();
    else g.act(0).decline();
  }
}

/** The rest of the cast: targets when the spell has them, then the payment. */
function finish(g: ScenarioGame): void {
  if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: 1 });
  g.act(0).payAuto();
}

describe('X is offered as far as the rules let the player pay', () => {
  test.each(LAYOUTS.map((l) => [describeLayout(l), l] as const))('%s', (_name, l) => {
    const g = build(l);
    const castable = getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell');
    // For the kicked cast the kicker's {2} is paid only if the player says so: the plain cast decides.
    const plain = oracle({ ...l, kind: l.kind === 'kicked' ? 'unkicked' : l.kind });
    expect(castable, 'offered exactly when X = 0 can be paid').toBe(plain !== null);
    if (plain === null) return;
    const kickedMax = oracle(l);
    if (l.kind === 'kicked' && kickedMax === null) {
      // The kicked total cannot be paid: the question is not asked, the spell is cast unkicked.
      g.act(0).cast('spell');
      expect(g.state.pending?.kind).not.toBe('confirmOptional');
      return;
    }
    start(g, l);
    const max = oracle(l) as number;
    if (max === 0) {
      // Only X = 0 can be paid: nothing is asked.
      expect(g.state.pending?.kind, 'no question when only 0 can be paid').not.toBe('chooseX');
      finish(g);
      g.expect.stack([NAMES[l.kind]]);
      return;
    }
    const d = g.state.pending as ChooseXDecision;
    expect(d.kind).toBe('chooseX');
    expect([d.min, d.max]).toEqual([0, max]);
    expect(
      getLegalActions(g.state, 0)
        .flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []))
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: max + 1 }, (_, x) => x));
    // The next value is refused and changes nothing.
    const before = stateHash(g.state);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: max + 1 }).ok).toBe(false);
    expect(stateHash(g.state)).toBe(before);
    // The most and the least carry through to the end, with the same actions every time.
    for (const x of [max, 0]) {
      const h = build(l);
      start(h, l);
      h.act(0).chooseX(x);
      finish(h);
      h.expect.stack([NAMES[l.kind]]);
      h.expect.pending('priority', 0);
      expect(checkInvariants(h.state)).toEqual([]);
      expect(h.object({ name: NAMES[l.kind], zone: 'stack' }).stack?.x).toBe(x);
      const again = build(l);
      start(again, l);
      again.act(0).chooseX(x);
      finish(again);
      expect(again.hash()).toBe(h.hash());
    }
  });
});

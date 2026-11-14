// "This creature doesn't untap during your untap step." (D-094).
// Pins: CR 502.3 (the active player determines which permanents untap; effects can keep one or more
// of a player's permanents from untapping), CR 502.4 (no player receives priority in the untap
// step), CR 613.1f (a static ability goes with "loses all abilities"), CR 301.5, 303.4 (an Aura's
// static ability applies to the permanent it enchants).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-restrictions.ts) or Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const GIANT = 'SYNTHETIC Sleepy Giant';
const AURA = 'SYNTHETIC Slumber Aura';
const BEARS = 'Grizzly Bears';

/** Seat 1's end step of turn 2: the next turn is seat 0's, whose permanents are tapped. */
function beforeUntap(seat0: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  return b.seat(1).library('Island', { count: 4 }).at('end', { active: 1, turn: 2 }).build();
}

describe('CR 502.3: the untap step skips what an effect keeps from untapping', () => {
  test('a tapped creature with the ability stays tapped; the others untap', () => {
    const g = beforeUntap((b) =>
      b
        .battlefield(GIANT, { tapped: true })
        .battlefield(BEARS, { tapped: true })
        .battlefield('Forest', { tapped: true }),
    );
    const mark = g.mark();
    g.advanceTo('upkeep');
    g.expect.tapped(GIANT, true);
    g.expect.tapped(BEARS, false);
    g.expect.tapped('Forest', false);
    const untapped = g.eventsSince(mark).filter((e) => e.kind === 'untapped');
    expect(untapped.map((e) => (e.kind === 'untapped' ? e.object : null)).sort()).toEqual(
      [g.id(BEARS), g.id('Forest')].sort(),
    );
  });

  test("it stays tapped on every one of its controller's turns", () => {
    const g = beforeUntap((b) => b.battlefield(GIANT, { tapped: true }));
    g.advanceTo('upkeep');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(GIANT, true);
  });

  test('an untapped one is of course untapped: the ability only keeps it from untapping', () => {
    const g = beforeUntap((b) => b.battlefield(GIANT));
    g.advanceTo('upkeep');
    g.expect.tapped(GIANT, false);
  });

  test('the control: without the ability the same creature untaps', () => {
    const g = beforeUntap((b) => b.battlefield('SYNTHETIC Vanilla 3/3', { tapped: true }));
    g.advanceTo('upkeep');
    g.expect.tapped('SYNTHETIC Vanilla 3/3', false);
  });

  test("only the active player's permanents untap anyway: the opponent's Giant is unaffected by seat 0's step", () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(GIANT, { tapped: true })
      .library('Island', { count: 4 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep');
    g.expect.tapped(GIANT, true);
  });
});

describe("an Aura that says the enchanted creature doesn't untap", () => {
  test("the enchanted creature stays tapped, its controller's other creatures untap", () => {
    const g = beforeUntap((b) =>
      b
        .battlefield(BEARS, { tapped: true, label: 'host' })
        .battlefield('SYNTHETIC Vanilla 3/3', { tapped: true })
        .battlefield(AURA, { attachedTo: 'host' }),
    );
    expect(derive(g.state, g.object('host')).restrictions).toEqual(['doesntUntap']);
    g.advanceTo('upkeep');
    g.expect.tapped('host', true);
    g.expect.tapped('SYNTHETIC Vanilla 3/3', false);
  });
});

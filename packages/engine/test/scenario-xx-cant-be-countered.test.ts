// "This spell can't be countered." and "~ can't be countered" (D-094).
// Pins: CR 101.2 (a "can't" effect takes precedence over one that directs something to happen),
// CR 701.6 (Counter: to counter a spell is to cancel it), CR 113.6g (an object's ability that states
// it can't be countered functions on the stack), CR 702.21a (Ward counters the spell or ability
// unless its controller pays), CR 608.2b (a target that left the stack is skipped).
// Cards: SYNTHETIC Stubborn Insight, Stubborn Bolt and Stubborn Beast
// (src/cards/fixtures/synthetic-restrictions.ts), SYNTHETIC Soft Counter and Toll Counter, SYNTHETIC
// Warded Guard, and the real Counterspell, Lightning Bolt, Grizzly Bears and basic lands.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const INSIGHT = 'SYNTHETIC Stubborn Insight';
const STUBBORN_BOLT = 'SYNTHETIC Stubborn Bolt';
const BEAST = 'SYNTHETIC Stubborn Beast';
const SOFT = 'SYNTHETIC Soft Counter';
const TOLL = 'SYNTHETIC Toll Counter';
const GUARD = 'SYNTHETIC Warded Guard';
const COUNTERSPELL = 'Counterspell';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';

/** Seat 0 casts `spell` (paying with its lands), seat 1 answers with `counter` (two Islands). */
function counterGame(
  spell: string,
  counter: string,
  seat0Lands: readonly string[] = ['Forest', 'Forest'],
) {
  const g = scenario()
    .seat(0)
    .hand(spell)
    .battlefield(...seat0Lands)
    .life(20)
    .seat(1)
    .hand(counter)
    .battlefield('Island', 'Island', 'Island')
    .build();
  g.act(0).cast(spell, { pay: true });
  g.act(0).pass();
  g.act(1).cast(counter, { targets: [{ name: spell, zone: 'stack' }], pay: true });
  return g;
}

/** Both players pass: the top object of the stack resolves (CR 117.4). */
const resolveTop = (g: ScenarioGame) => g.pass().pass();

describe("CR 101.2, 113.6g: a spell that can't be countered is not", () => {
  test('the derived restrictions of the spell on the stack include it, and a normal spell has none', () => {
    const g = scenario()
      .seat(0)
      .hand(INSIGHT, BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(INSIGHT, { pay: true });
    expect(derive(g.state, g.object({ name: INSIGHT, zone: 'stack' })).restrictions).toEqual([
      'cantBeCountered',
    ]);
    g.pass();
    g.pass();
    g.act(0).cast(BEARS, { pay: true });
    expect(derive(g.state, g.object({ name: BEARS, zone: 'stack' })).restrictions).toEqual([]);
  });

  test('Counterspell resolves, does nothing, and the spell stays and then resolves', () => {
    const g = counterGame(INSIGHT, COUNTERSPELL);
    resolveTop(g);
    // The counter spell resolved without countering; the instant is still on the stack.
    g.expect.stack([INSIGHT]);
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
    g.expect.noEvent({ kind: 'countered' });
    resolveTop(g);
    g.expect.life(0, 23);
    g.expect.zone(INSIGHT, 'graveyard', { seat: 0 });
  });

  test("a creature spell that can't be countered enters the battlefield", () => {
    const g = counterGame(BEAST, COUNTERSPELL);
    resolveTop(g);
    g.expect.stack([BEAST]);
    resolveTop(g);
    g.expect.zone(BEAST, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'countered' });
  });

  test('a spell without the ability is countered by the same Counterspell', () => {
    const g = counterGame(BEARS, COUNTERSPELL);
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'countered' }]);
  });

  test("the ability is the spell's own: once it is a permanent, nothing about countering remains", () => {
    const g = counterGame(BEAST, COUNTERSPELL);
    resolveTop(g);
    resolveTop(g);
    // On the battlefield the creature has the static ability, but it was never in play as a spell.
    expect(derive(g.state, g.object(BEAST)).abilities).toHaveLength(1);
  });
});

describe('"counter unless its controller pays" and a spell that can\'t be countered', () => {
  test('Soft Counter: nobody is asked, nothing is paid, the spell stays on the stack', () => {
    const g = counterGame(INSIGHT, SOFT, ['Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.stack([INSIGHT]);
    g.expect.tapped('Forest[2]', false);
    resolveTop(g);
    g.expect.life(0, 23);
  });

  test('the control: a normal spell is asked about the same counter', () => {
    const g = counterGame(BEARS, SOFT, ['Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
    resolveTop(g);
    g.expect.pending('confirmOptional', 0);
  });

  test("Toll Counter (pay 2 life) does not take life from a spell that can't be countered", () => {
    const g = counterGame(INSIGHT, TOLL);
    resolveTop(g);
    g.expect.life(0, 20);
    g.expect.stack([INSIGHT]);
  });
});

describe("CR 702.21a: Ward does not counter a spell that can't be countered", () => {
  function wardGame(spell: string, lands: readonly string[]) {
    const g = scenario()
      .seat(0)
      .hand(spell)
      .battlefield(...lands)
      .seat(1)
      .battlefield(GUARD)
      .build();
    g.act(0).cast(spell, { targets: [GUARD], pay: true });
    return g;
  }

  test('the ward trigger resolves with no question, and the spell resolves', () => {
    const g = wardGame(STUBBORN_BOLT, ['Mountain']);
    // The ward trigger is on the stack above the spell.
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'countered' });
    g.expect.stack([STUBBORN_BOLT]);
    resolveTop(g);
    g.expect.damage(GUARD, 1);
    g.expect.zone(STUBBORN_BOLT, 'graveyard', { seat: 0 });
  });

  test('the control: a Lightning Bolt at the same creature is countered by the ward when unpaid', () => {
    const g = wardGame(BOLT, ['Mountain']);
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.damage(GUARD, 0);
  });
});

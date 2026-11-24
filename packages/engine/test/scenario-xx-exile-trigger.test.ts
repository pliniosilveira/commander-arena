// A triggered ability that works from exile (CR 113.6b, 702.62b): "Whenever a card is put into an opponent's graveyard from anywhere, if this card is suspended, you may remove
// a time counter from this card." Pins: CR 603.4 (the intervening "if" is read as the event happens and again as the ability resolves), 702.62a (the last counter cast), 404.1 (a card
// goes to its owner's graveyard: "an opponent's graveyard" is that of any player but the controller), 108.4 (a card in exile has no controller: its owner controls the ability).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-g8.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const WATCHER = 'SYNTHETIC Suspend Watcher'; // suspend 3, the exile trigger
const QUICK = 'SYNTHETIC Suspend Watcher Quick'; // suspend 1, the exile trigger
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function build(seats: 2 | 3 | 4, configure: (b: Builder) => Builder): ScenarioGame {
  let b = scenario({ seats })
    .seat(0)
    .life(20)
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) {
    b = b
      .seat(seat as 1 | 2 | 3)
      .life(20)
      .library(...FILLER);
  }
  return configure(b).at('precombatMain', { active: 0, turn: 3 }).build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const exiled = (g: ScenarioGame, name: string) => {
  const [card] = g.find({ name, zone: 'exile' });
  if (card === undefined) throw new Error(`${name} is not in exile`);
  return card;
};

/** Seat 0 suspends `name`; seat 0 keeps priority with the stack empty. */
function suspended(
  seats: 2 | 3 | 4,
  name: string,
  configure: (b: Builder) => Builder,
): ScenarioGame {
  const g = build(seats, (b) =>
    configure(b.seat(0).hand(name).battlefield('Swamp', { count: 2 }).seat(0)),
  );
  g.act(0).suspend(name, { pay: true });
  return g;
}

/** Seat 0 passes and `seat` casts Lightning Bolt at seat 0's face; it resolves, and the bolt card goes to its owner's graveyard. */
function bolt(g: ScenarioGame, seat: 0 | 1 | 2 | 3): void {
  g.act(seat).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
}

describe('a trigger that works from exile (CR 113.6b, 702.62b)', () => {
  test('a card put into an opponent’s graveyard lets the owner remove a time counter', () => {
    const g = suspended(2, WATCHER, (b) =>
      b.seat(1).hand('Lightning Bolt').battlefield('Mountain', { count: 2 }).seat(0),
    );
    g.expect.counters(exiled(g, WATCHER).id, { time: 3 });
    g.act(0).pass();
    bolt(g, 1);
    g.expect.stack(['Lightning Bolt']);
    resolveTop(g);
    // The bolt resolved and went to seat 1's graveyard: the exile ability triggered for seat 0, who owns the suspended card.
    g.expect.stack([`${WATCHER} (ability)`]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.counters(exiled(g, WATCHER).id, { time: 2 });
    g.expect.invariants();
  });

  test('"you may": declining leaves the counters', () => {
    const g = suspended(2, WATCHER, (b) =>
      b.seat(1).hand('Lightning Bolt').battlefield('Mountain', { count: 2 }).seat(0),
    );
    g.act(0).pass();
    bolt(g, 1);
    resolveTop(g);
    resolveTop(g);
    g.act(0).decline();
    g.expect.counters(exiled(g, WATCHER).id, { time: 3 });
  });

  test('a card put into the controller’s own graveyard does not trigger it', () => {
    const g = suspended(2, WATCHER, (b) =>
      b.hand('Lightning Bolt').battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.counters(exiled(g, WATCHER).id, { time: 3 });
  });

  test('the last counter removed casts the card (CR 702.62a)', () => {
    const g = suspended(2, QUICK, (b) =>
      b.seat(1).hand('Lightning Bolt').battlefield('Mountain', { count: 2 }).seat(0),
    );
    g.expect.counters(exiled(g, QUICK).id, { time: 1 });
    g.act(0).pass();
    bolt(g, 1);
    resolveTop(g);
    resolveTop(g);
    g.act(0).accept();
    // The counter is gone: the suspend ability that casts the card triggers.
    g.expect.stack([`${QUICK} (ability)`]);
    resolveTop(g);
    g.act(0).accept();
    g.expect.stack([QUICK]);
  });

  test('the card is in the hand, not suspended: nothing works', () => {
    const g = build(2, (b) =>
      b
        .seat(0)
        .hand(WATCHER)
        .seat(1)
        .hand('Lightning Bolt')
        .battlefield('Mountain', { count: 2 })
        .seat(0),
    );
    g.act(0).pass();
    bolt(g, 1);
    resolveTop(g);
    g.expect.stack([]);
  });

  test('with three seats a card put into either opponent’s graveyard triggers it, one trigger for each', () => {
    const g = suspended(3, WATCHER, (b) =>
      b
        .seat(1)
        .hand('Lightning Bolt')
        .battlefield('Mountain', { count: 2 })
        .seat(2)
        .hand('Lightning Bolt')
        .battlefield('Mountain', { count: 2 })
        .seat(0),
    );
    g.act(0).pass();
    g.act(1).pass();
    bolt(g, 2);
    g.passAll();
    g.expect.stack([`${WATCHER} (ability)`]);
    g.passAll();
    g.act(0).accept();
    g.expect.counters(exiled(g, WATCHER).id, { time: 2 });
  });

  test('with four seats the owner’s own graveyard still does not trigger it', () => {
    const g = suspended(4, WATCHER, (b) =>
      b.hand('Lightning Bolt').battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 3 }], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.counters(exiled(g, WATCHER).id, { time: 3 });
  });
});

describe('validation', () => {
  const base = syntheticCard(WATCHER);
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  const ability = face.abilities.find((a) => a.kind === 'triggered');
  if (ability === undefined) throw new Error('no trigger');
  const withAbility = (a: unknown) => ({ ...base, faces: [{ ...face, abilities: [a] }] }) as never;

  test('the fixture is valid', () => {
    expect(validateCard(base)).toEqual([]);
  });

  test('an exile ability without the intervening "if this card is suspended" is refused', () => {
    const { interveningIf: _dropped, ...without } = ability as unknown as Record<string, unknown>;
    expect(JSON.stringify(validateCard(withAbility(without)))).toContain('thisSuspended');
  });

  test('"if this card is suspended" on a battlefield ability is refused', () => {
    const { functionsIn: _dropped, ...without } = ability as unknown as Record<string, unknown>;
    expect(JSON.stringify(validateCard(withAbility(without)))).toContain(
      "thisSuspended needs functionsIn: 'exile'",
    );
  });

  test('an exile ability is read for a card put into a graveyard only', () => {
    const other = { ...ability, trigger: { kind: 'upkeep', whose: 'you' } };
    expect(JSON.stringify(validateCard(withAbility(other)))).toContain('put into a graveyard');
  });
});

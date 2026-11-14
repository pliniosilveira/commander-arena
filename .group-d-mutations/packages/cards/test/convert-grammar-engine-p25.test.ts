// Parsed text is only worth something if the engine runs it as written (stage P25). These tests import SYNTHETIC cards
// through the grammar (never through a fixture), define them in an engine scenario and play them through applyAction:
// the upkeep slice of D-127 (ENGINE_VERSION 25): Echo (CR 702.30a: pay or sacrifice at the first upkeep after the
// permanent came under your control), Cumulative upkeep (CR 702.24a: an age counter, then the cost once for each
// counter) and becoming the monarch (CR 725: the end-step draw of CR 725.2). Every card name starts with "SYNTHETIC";
// the lines are the real ones of reports/templates.json ("Echo {M}", "Cumulative upkeep {M}", "When ~ enters, you
// become the monarch."), the costs and the bodies are SYNTHETIC. No real card's text is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

/** Seat 0 controls what `place` adds; the game is in seat 1's turn 2 and walks to seat 0's upkeep of turn 3. */
function toUpkeep(place: (b: Builder) => Builder): Game {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = mine
    .seat(1)
    .library(...FILLER)
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

/** Resolves the top of the stack: both players pass. */
const resolveTop = (g: Game): void => {
  g.pass();
  g.pass();
};

describe('"Echo {M}" (backlog: 47 cards; CR 702.30a)', () => {
  const HOUND = parsed('SYNTHETIC Parsed Echo Hound', 'Creature — Hound', 'Echo {1}{R}', {
    manaCost: '{1}{R}',
    power: '3',
    toughness: '1',
    colors: ['R'],
  });
  const name = HOUND.name;
  const withHound = (b: Builder) =>
    b.define(HOUND).battlefield(name, { fresh: true }).battlefield('Mountain', { count: 2 });

  test('the lowering is the engine keyword, which the engine expands into the upkeep trigger', () => {
    expect(HOUND.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'echo', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] } },
    ]);
  });

  test('at the next upkeep the trigger is asked, the cost is paid and the permanent stays', () => {
    const g = toUpkeep(withHound);
    g.expect.stack([`${name} (ability)`]);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.upkeep).toBe('echo');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'R'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.zone(name, 'battlefield');
    g.expect.noEvent({ kind: 'sacrificed' });
    // CR 702.30a: it has been under control since before this upkeep began, so the next one is free.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.stack([]);
  });

  test('not paying sacrifices it', () => {
    const g = toUpkeep(withHound);
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(name, 'graveyard');
  });

  test('with the mana out of reach nobody is asked and it is sacrificed (CR 118.3)', () => {
    const g = toUpkeep((b) => b.define(HOUND).battlefield(name, { fresh: true }));
    resolveTop(g);
    g.expect.zone(name, 'graveyard');
    g.expect.noEvent({ kind: 'optionalAnswered' });
  });

  test('a permanent that has been there since before the last upkeep does not trigger', () => {
    const g = toUpkeep((b) => b.define(HOUND).battlefield(name));
    g.expect.stack([]);
  });
});

describe('"Cumulative upkeep {M}" (backlog: 57 cards; CR 702.24a)', () => {
  const WALL = parsed('SYNTHETIC Parsed Aging Wall', 'Creature — Wall', 'Cumulative upkeep {1}', {
    manaCost: '{1}{U}',
    power: '0',
    toughness: '4',
    colors: ['U'],
  });
  const name = WALL.name;
  const age = (g: Game): number => g.object({ name }).counters.age ?? 0;
  const nextUpkeep = (g: Game): void => {
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
  };

  test('the lowering is the engine keyword', () => {
    expect(WALL.faces[0]?.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'cumulativeUpkeep', cost: [{ kind: 'mana', symbols: ['1'] }] },
      },
    ]);
  });

  test('the cost grows with the age counters: {1}, then {1}{1}, then it cannot be paid', () => {
    // Two lands: {1} the first time, {1}{1} the second, {1}{1}{1} the third.
    const g = toUpkeep((b) => b.define(WALL).battlefield(name, 'Plains', 'Plains'));
    resolveTop(g);
    expect(age(g)).toBe(1);
    let d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.upkeep).toBe('cumulativeUpkeep');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.counters(name, { age: 1 });

    nextUpkeep(g);
    resolveTop(g);
    expect(age(g)).toBe(2);
    d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.cost).toEqual([
      { kind: 'mana', symbols: ['1'] },
      { kind: 'mana', symbols: ['1'] },
    ]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.counters(name, { age: 2 });

    nextUpkeep(g);
    resolveTop(g);
    // Three age counters would be {1}{1}{1} and there are two lands: nobody is asked (CR 118.3).
    g.expect.zone(name, 'graveyard');
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('declining the payment sacrifices it', () => {
    const g = toUpkeep((b) => b.define(WALL).battlefield(name, 'Plains', 'Plains'));
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(name, 'graveyard');
  });
});

describe('"When ~ enters, you become the monarch." (backlog: 38 cards; CR 725)', () => {
  const HERALD = parsed(
    'SYNTHETIC Parsed Court Herald',
    'Creature — Human Noble',
    'When ~ enters, you become the monarch.',
    { manaCost: '{2}{W}', power: '2', toughness: '2', colors: ['W'] },
  );
  const CLAIM = parsed('SYNTHETIC Parsed Crown Claim', 'Sorcery', 'You become the monarch.', {
    manaCost: '{2}{U}',
    colors: ['U'],
  });

  test('the lowering is the engine trigger and the engine spell effect', () => {
    expect(HERALD.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
      },
    ]);
    expect(CLAIM.faces[0]?.spell?.effect).toEqual({
      kind: 'becomeMonarch',
      player: { kind: 'you' },
    });
  });

  const game = (build: (b: Builder) => Builder) =>
    build(
      scenario()
        .define(HERALD)
        .define(CLAIM)
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('casting the creature: the trigger resolves and the controller is the monarch', () => {
    const g = game((b) => b.hand(HERALD.name).battlefield('Plains', { count: 3 }));
    g.expect.monarch(null);
    g.act(0).cast(HERALD.name, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${HERALD.name} (ability)`]);
    g.pass();
    g.pass();
    g.expect.monarch(0);
    g.expect.eventLog([{ kind: 'monarchChanged', from: null, to: 0 }]);
  });

  test('the monarch draws a card at the beginning of their end step (CR 725.2)', () => {
    const g = game((b) => b.hand(HERALD.name).battlefield('Plains', { count: 3 }));
    g.act(0).cast(HERALD.name, { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.monarch(0);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.expect.stack(['The monarch (ability)']);
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(before + 1);
  });

  test('the spell: "You become the monarch." resolves to the same designation', () => {
    const g = game((b) => b.hand(CLAIM.name).battlefield('Island', { count: 3 }));
    g.act(0).cast(CLAIM.name, { pay: true });
    g.pass();
    g.pass();
    g.expect.monarch(0);
  });
});

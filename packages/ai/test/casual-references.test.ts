// CasualAgent and RandomLegalAgent answer the questions of D-092 on real engine states built with
// the scenario DSL: a "may search" asked of the player who would search (CR 701.23a), whoever's spell
// it is; the payment to keep a spell from "Counter target spell unless its controller pays" (the
// agent pays when the spell is worth at least what the cost takes, never a life cost at 10 life or
// less, like Ward); and the permanent to return ("Return a land you control to its owner's hand",
// `choosePermanent` with `purpose: 'effect'`): a tapped one first, then the one it values least.
// Every answer is one the engine lists as legal and accepts.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

const BANISH = 'SYNTHETIC Banish Seek Land';
const OPTIONAL = 'SYNTHETIC Optional Land Fetch';
const SOFT = 'SYNTHETIC Soft Counter';
const TOLL = 'SYNTHETIC Toll Counter';
const BOUNCE = 'SYNTHETIC Bounce Land';

describe('a "may search" asked of the player who would search', () => {
  /** Seat 0 exiles seat 1's creature; seat 1 is asked whether to search. */
  function opponentAsked(): ScenarioGame {
    const g = scenario()
      .seat(0)
      .hand(BANISH)
      .battlefield('Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Forest', 'Island', 'Swamp')
      .build();
    g.act(0).cast(BANISH, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    return g;
  }

  test('CasualAgent says yes on an opponent’s spell, and picks a land it lacks', async () => {
    const g = opponentAsked();
    const yes = await answer(g);
    expect(yes).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, yes);
    g.choose(1, yes);
    g.expect.pending('chooseCards', 1);
    const pick = await answer(g);
    expectLegal(g, pick);
    g.choose(1, pick);
    // The seat controls no land, so any basic is a colour it lacks: the first listed (by name).
    expect(g.find({ name: 'Forest', zone: 'battlefield', seat: 1 })).toHaveLength(1);
    expect(g.find({ name: 'Forest', zone: 'battlefield', seat: 1 })[0]?.tapped).toBe(true);
  });

  test('CasualAgent says yes on its own "you may search"', async () => {
    const g = scenario()
      .seat(0)
      .hand(OPTIONAL)
      .battlefield('Forest', 'Forest')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(OPTIONAL, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const yes = await answer(g);
    expect(yes).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, yes);
  });

  test('RandomLegalAgent answers with an action the engine lists', async () => {
    const g = opponentAsked();
    const action = await answer(g, new RandomLegalAgent({ seed: 4 }));
    expectLegal(g, action);
  });
});

describe('paying to keep a spell from "Counter target spell unless its controller pays"', () => {
  /** Seat 0 casts `spell` with `forests` Forests; seat 1 counters it with `counter`. */
  function counterQuestion(spell: string, counter: string, forests: number, life = 40) {
    const g = scenario()
      .seat(0)
      .life(life)
      .hand(spell)
      .battlefield(...Array.from({ length: forests }, () => 'Forest'))
      .seat(1)
      .hand(counter)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(spell, { pay: true });
    g.act(0).pass();
    g.act(1).cast(counter, { targets: [{ name: spell, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    return g;
  }

  test('a spell worth at least the cost: it pays (Giant Spider, mana value 4, against {3})', async () => {
    const g = counterQuestion('Giant Spider', SOFT, 7);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, action);
  });

  test('a spell worth less than the cost: it lets it go (Grizzly Bears, mana value 2, against {3})', async () => {
    const g = counterQuestion('Grizzly Bears', SOFT, 6);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(g, action);
  });

  test('life: a spell worth the cost is kept for 2 life while life is plentiful, not at 10', async () => {
    const rich = counterQuestion('Grizzly Bears', TOLL, 2);
    expect(await answer(rich)).toEqual({ kind: 'acceptOptional' });
    const poor = counterQuestion('Grizzly Bears', TOLL, 2, 10);
    const action = await answer(poor);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(poor, action);
  });

  test('RandomLegalAgent answers with an action the engine lists', async () => {
    const g = counterQuestion('Giant Spider', SOFT, 7);
    expectLegal(g, await answer(g, new RandomLegalAgent({ seed: 2 })));
  });
});

describe('the permanent to return for "Return a land you control to its owner’s hand"', () => {
  function bounceQuestion(setup: (b: ReturnType<typeof scenario>) => void): ScenarioGame {
    const b = scenario().seat(0).hand(BOUNCE);
    setup(b);
    const g = b.seat(1).build();
    g.act(0).playLand(BOUNCE);
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    return g;
  }

  test('a tapped land goes first: the older tapped one, since the bounce land is tapped too', async () => {
    const g = bounceQuestion((b) =>
      b
        .battlefield('Forest', { label: 'forest' })
        .battlefield('Island', { label: 'island', tapped: true }),
    );
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id('island')] });
    expectLegal(g, action);
  });

  test('with only untapped lands besides the bounce land, the bounce land (tapped) goes back', async () => {
    const g = bounceQuestion((b) => b.battlefield('Forest', 'Plains'));
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id(BOUNCE)] });
    expectLegal(g, action);
  });

  test('RandomLegalAgent answers with an action the engine lists', async () => {
    const g = bounceQuestion((b) => b.battlefield('Forest', 'Plains'));
    expectLegal(g, await answer(g, new RandomLegalAgent({ seed: 9 })));
  });
});

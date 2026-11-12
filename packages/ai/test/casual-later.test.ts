// CasualAgent and the cast-later family (D-128), on real engine states built with the scenario DSL: it suspends and
// foretells in its own main phase once nothing worth casting is left, answers the questions of Suspend and Madness,
// discards a card with madness first and casts a foretold card. Every answer is one the engine lists as legal, and
// RandomLegalAgent answers legally too.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { CTX } from './helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 3; `place` stocks seat 0. */
function main(place: (b: Builder) => Builder): ScenarioGame {
  return place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('suspend and foretell in the main phase', () => {
  test('with nothing else to cast it suspends a creature card', async () => {
    const g = main((b) => b.hand('SYNTHETIC Suspend Bear').battlefield('Forest'));
    // The ordinary cast costs {2}{G}: only the suspend cost {G} is payable.
    g.expect.illegal(0, { cast: 'SYNTHETIC Suspend Bear' });
    const action = await answer(g);
    expect(action.kind).toBe('suspend');
    expectLegal(g, action);
  });

  test('a card it can cast is cast, not suspended', async () => {
    const g = main((b) => b.hand('SYNTHETIC Suspend Bear').battlefield('Forest', { count: 3 }));
    const action = await answer(g);
    expect(action.kind).toBe('castSpell');
  });

  test('it prefers the fewest time counters', async () => {
    const g = main((b) =>
      b
        .hand('SYNTHETIC Suspend Bear', 'SYNTHETIC Suspend Flash Giant')
        .battlefield('Forest', { count: 2 }),
    );
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'suspend' });
    const object = action.kind === 'suspend' ? action.object : null;
    expect(g.state.objects[object as never]?.card).toBe(
      g.find({ name: 'SYNTHETIC Suspend Flash Giant' })[0]?.card,
    );
  });

  test('it does not suspend a spell that needs a creature to aim at when there is none', async () => {
    const g = main((b) => b.hand('SYNTHETIC Suspend Scrap').battlefield('Mountain'));
    g.expect.legal(0, { suspend: 'SYNTHETIC Suspend Scrap' });
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('it suspends that spell when the opponent has a creature', async () => {
    const g = main((b) =>
      b
        .hand('SYNTHETIC Suspend Scrap')
        .battlefield('Mountain')
        .seat(1)
        .battlefield('Grizzly Bears')
        .seat(0),
    );
    expect((await answer(g)).kind).toBe('suspend');
  });

  test('it foretells a card whose later cast saves mana, with the mana it has no other use for', async () => {
    const g = main((b) => b.hand('SYNTHETIC Foretell Giant').battlefield('Forest', { count: 3 }));
    g.expect.illegal(0, { cast: 'SYNTHETIC Foretell Giant' }); // {4}{G} costs five
    const action = await answer(g);
    expect(action.kind).toBe('foretell');
    expectLegal(g, action);
  });

  test('it does not take a special action in the opponent’s turn or with the stack busy', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Suspend Flash Giant')
      .battlefield('Forest', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4, priority: 0 })
      .build();
    g.expect.legal(0, { suspend: 'SYNTHETIC Suspend Flash Giant' }); // flash: any time
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('a foretold card is cast when it can be, for its foretell cost', async () => {
    const g = main((b) => b.hand('SYNTHETIC Foretell Giant').battlefield('Forest', { count: 3 }));
    g.act(0).foretell('SYNTHETIC Foretell Giant', { pay: true });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    let action = await answer(g);
    if (action.kind === 'playLand') {
      g.act(0).choose(action); // the land it drew first
      action = await answer(g);
    }
    expect(action).toMatchObject({ kind: 'castSpell', alternative: 'foretell' });
    expectLegal(g, action);
  });
});

describe('the questions of Suspend and Madness', () => {
  test('it casts a suspended creature free, and a card with madness it can pay for', async () => {
    const g = main((b) =>
      b.hand('SYNTHETIC Suspend Bear').battlefield('Forest').battlefield('Island'),
    );
    g.act(0).suspend('SYNTHETIC Suspend Bear', { pay: true });
    for (let i = 0; i < 3; i += 1) {
      g.advanceTo('upkeep', { turn: 'next' });
      g.advanceTo('upkeep', { turn: 'next' });
      g.pass();
      g.pass();
    }
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
  });

  test('it declines a madness cast of a removal spell the opponent has no creature for', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Mind Nibble')
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .hand('SYNTHETIC Madness Bolt')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears') // seat 1's own creature is the only creature: a bad target
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('SYNTHETIC Mind Nibble', { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 1);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(g, action);
  });

  test('it accepts the madness cast of a creature', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Mind Nibble')
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .hand('SYNTHETIC Madness Fiend')
      .battlefield('Swamp', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('SYNTHETIC Mind Nibble', { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 1);
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
  });
});

describe('the questions of Miracle (D-971)', () => {
  /** The draw step of seat 0's turn 3 with `top` on top of its library. */
  function drawStep(top: string, place: (b: Builder) => Builder, opposing = false): ScenarioGame {
    const mine = place(scenario().seat(0).life(20))
      .library(top)
      .library(...FILLER);
    const theirs = mine.seat(1).life(20);
    const g = (opposing ? theirs.battlefield('Grizzly Bears') : theirs)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    return g;
  }

  test('it reveals a creature it can pay the miracle cost of', async () => {
    const g = drawStep('SYNTHETIC Miracle Beast', (b) => b.battlefield('Forest'));
    g.expect.pending('confirmOptional', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, action);
  });

  test('it does not reveal a card it could not pay for: revealing gives the opponent the card for nothing', async () => {
    const g = drawStep('SYNTHETIC Miracle Beast', (b) => b.battlefield('Plains'));
    g.expect.pending('confirmOptional', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(g, action);
  });

  test('it does not reveal a removal spell with no creature to aim at, and reveals it with one', async () => {
    const none = drawStep('SYNTHETIC Miracle Bolt', (b) => b.battlefield('Mountain'));
    expect(await answer(none)).toEqual({ kind: 'declineOptional' });
    const some = drawStep('SYNTHETIC Miracle Bolt', (b) => b.battlefield('Mountain'), true);
    expect(await answer(some)).toEqual({ kind: 'acceptOptional' });
  });

  test('an X spell needs mana for the {W}{W} and at least 1 for the X; with it, it reveals and casts with all it can', async () => {
    const short = drawStep('SYNTHETIC Miracle Host', (b) => b.battlefield('Plains', { count: 2 }));
    expect(await answer(short)).toEqual({ kind: 'declineOptional' });
    const g = drawStep('SYNTHETIC Miracle Host', (b) => b.battlefield('Plains', { count: 5 }));
    g.act(0).accept();
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 0);
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
    g.act(0).accept();
    g.expect.pending('chooseX', 0);
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 3 });
  });

  test('RandomLegalAgent answers both questions legally', async () => {
    const g = drawStep('SYNTHETIC Miracle Beast', (b) => b.battlefield('Forest', { count: 2 }));
    const agent = new RandomLegalAgent({ seed: 3 });
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    const view = g.view(0);
    if (view.pending === null) throw new Error('no pending');
    expectLegal(g, await agent.decide(view, view.pending, CTX));
  });
});

describe('the cleanup discard', () => {
  test('a card with madness is the first card it discards', async () => {
    const g = main((b) =>
      b
        .hand(
          'SYNTHETIC Madness Fiend',
          'Serra Angel',
          'Giant Spider',
          'Grizzly Bears',
          'Llanowar Elves',
          'Lightning Bolt',
          'Murder',
          'Unsummon',
        )
        .battlefield('Plains'),
    );
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('discard', 0);
    const action = await answer(g);
    const fiend = g.find({ name: 'SYNTHETIC Madness Fiend', zone: 'hand' })[0]?.id;
    expect(action).toEqual({ kind: 'chooseCards', objects: [fiend] });
    expectLegal(g, action);
  });
});

describe('RandomLegalAgent', () => {
  test('answers the special actions, the questions and the payments legally', async () => {
    const g = main((b) =>
      b
        .hand('SYNTHETIC Suspend Bear', 'SYNTHETIC Foretell Bolt')
        .battlefield('Forest', { count: 3 })
        .battlefield('Mountain', { count: 3 }),
    );
    const agent = new RandomLegalAgent({ seed: 5 });
    for (let i = 0; i < 12; i += 1) {
      const d = g.state.pending;
      if (d === null || g.state.result !== null) break;
      const view = g.view(d.seat);
      if (view.pending === null) break;
      const action = await agent.decide(view, view.pending, CTX);
      expectLegal(g, action);
      g.act(d.seat).choose(action);
    }
  });
});

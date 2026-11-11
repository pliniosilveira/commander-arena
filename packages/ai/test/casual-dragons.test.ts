// CasualAgent and RandomLegalAgent answer the questions of the Dragons slice (D-151) on real engine states built with the scenario DSL: the chapter a Saga
// with read ahead starts at, the name a permanent chooses among its options, the creature an artifact copies, the Dragon it beholds, the cards it discards
// when it may discard any number, how much it pays of "any amount of {R}", and the other targets of a slot that must differ. Every answer is one the engine
// lists and accepts.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

async function answer(
  g: ScenarioGame,
  seat = 0,
  agent = new CasualAgent({ seed: 1 }),
): Promise<Action> {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action, seat = 0) {
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
}

describe('a named option', () => {
  test('read ahead: the last chapter', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Reading Rite')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Reading Rite', { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: '3' });
    expectLegal(g, a);
  });

  test('choose Khans or Dragons: the first option', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Siege of Choices')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Siege of Choices', { pay: true });
    g.passAll();
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: 'Khans' });
    expectLegal(g, a);
  });
});

describe('an artifact that enters as a copy of a creature', () => {
  test('the creature with the most power and toughness', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Cursed Looking Glass')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Serra Angel')
      .build();
    g.act(0).cast('SYNTHETIC Cursed Looking Glass', { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'choosePermanents', objects: [g.object('Serra Angel').id] });
    expectLegal(g, a);
  });
});

describe('beholding', () => {
  test('a Dragon it controls rather than a card to reveal', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Dragon Scout', 'SYNTHETIC Plain Drake')
      .battlefield('Mountain', 'Mountain')
      .battlefield('SYNTHETIC Big Plain Drake')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Dragon Scout', { pay: true });
    g.passAll();
    g.act(0).accept();
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.object('SYNTHETIC Big Plain Drake').id] });
    expectLegal(g, a);
  });
});

describe('discarding any number of cards', () => {
  const chapterTwo = (lands: number) => {
    let b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Reading Rite', 'Mountain', 'Mountain', 'Grizzly Bears')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain');
    for (let i = 0; i < lands; i += 1) b = b.battlefield('Forest');
    const g = b
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Reading Rite', { pay: true });
    g.passAll();
    g.act(0).chooseOption('2');
    g.passAll();
    g.expect.pending('chooseCards', 0);
    return g;
  };

  test('with few lands in play it keeps every card', async () => {
    const g = chapterTwo(0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseCards', objects: [] });
    expectLegal(g, a);
  });

  test('with enough lands in play it discards the lands of its hand', async () => {
    const g = chapterTwo(2);
    const a = await answer(g);
    expect(a.kind).toBe('chooseCards');
    if (a.kind !== 'chooseCards') return;
    expect(a.objects).toHaveLength(2);
    expectLegal(g, a);
  });
});

describe('paying any amount', () => {
  test('all it can pay, and the random agent answers legally too', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Ember Tyrant')
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['SYNTHETIC Ember Tyrant'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['SYNTHETIC Ember Tyrant'], pay: true });
    g.passAll();
    g.expect.pending('chooseX', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseX', value: 3 });
    expectLegal(g, a);
    const r = await answer(g, 0, new RandomLegalAgent({ seed: 3 }) as unknown as CasualAgent);
    expectLegal(g, r);
    // the listed actions are every value 0..3 and no cancel
    const legal = getLegalActions(g.state, 0);
    expect(legal.filter((x) => x.kind === 'chooseX')).toHaveLength(4);
    expect(legal.some((x) => x.kind === 'cancel')).toBe(false);
  });
});

describe('other targets', () => {
  test('the second slot never repeats a target of the first', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Maw Dragon')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', 'Raging Goblin')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['SYNTHETIC Maw Dragon']);
    g.expect.pending('targets', 0);
    const a = await answer(g);
    expectLegal(g, a);
    // every listed action keeps the slots apart
    for (const action of getLegalActions(g.state, 0)) {
      if (action.kind !== 'chooseTargets') continue;
      const first = action.targets.filter((t) => t.specId === 't1');
      const others = action.targets.filter((t) => t.specId === 't2');
      for (const o of others) {
        expect(
          first.some(
            (f) => JSON.stringify({ ...f, specId: '' }) === JSON.stringify({ ...o, specId: '' }),
          ),
        ).toBe(false);
      }
    }
  });
});

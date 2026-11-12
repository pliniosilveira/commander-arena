// CasualAgent and a target slot of two zones (D-931): "When this creature enters, you may exile up to three other target creatures from the battlefield and/or creature
// cards from graveyards." The exile is undone when the permanent leaves (the cards go to their owners' hands), so the agent aims at the opponent's creatures on the battlefield
// and leaves every card of a graveyard alone, and a slot with only graveyard cards legal is left empty. Every answer is one the engine takes. The card is the SYNTHETIC
// 'SYNTHETIC Linked Banisher' of src/cards/fixtures/synthetic-cross-zone.ts.
import { applyAction, type PendingDecision, type TargetsDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chooseSlot, HARM_BY_DEFAULT } from '../src/casual-triggers';
import { answer, expectLegal } from './casual-helpers';

const BANISHER = 'SYNTHETIC Linked Banisher';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const PLAINS6 = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

function entering(build: (b: ReturnType<typeof scenario>) => void): ScenarioGame {
  const b = scenario()
    .seat(0)
    .hand(BANISHER)
    .battlefield(...PLAINS6);
  build(b);
  const g = b.build();
  g.act(0).cast(BANISHER, { pay: true });
  g.pass();
  g.pass();
  g.expect.pending('targets', 0);
  return g;
}

describe('the targets of an exile of the battlefield and the graveyards', () => {
  test("the opponent's creatures on the battlefield are chosen, no card of a graveyard and nothing of its own", async () => {
    const g = entering((b) => {
      b.battlefield(BEARS, { label: 'mine' })
        .graveyard(BEARS, { label: 'myDead' })
        .seat(1)
        .battlefield(SPIDER, { label: 'spider' })
        .battlefield(BEARS, { label: 'theirBears' })
        .graveyard(ANGEL, { label: 'angel' });
    });
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'chooseTargets' });
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    expect(action.targets.map((t) => (t.kind === 'object' ? t.id : -1)).sort()).toEqual(
      [g.id('spider'), g.id('theirBears')].sort(),
    );
    expectLegal(g, action);
  });

  test('at most three, the best creatures first', async () => {
    const g = entering((b) => {
      b.seat(1)
        .battlefield(SPIDER, { label: 'spider' })
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(BEARS, { label: 'bears1' })
        .battlefield(BEARS, { label: 'bears2' });
    });
    const action = await answer(g);
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    expect(action.targets).toHaveLength(3);
    expect(action.targets.map((t) => (t.kind === 'object' ? t.id : -1))).toContain(g.id('angel'));
    // The engine takes it (the agent orders the targets best first, which the engine's listing does not).
    const d = g.state.pending as PendingDecision;
    expect(applyAction(g.state, d.seat, action).ok).toBe(true);
  });

  test('with only cards of graveyards legal, the slot is left empty', async () => {
    const g = entering((b) => {
      b.graveyard(BEARS).seat(1).graveyard(ANGEL);
    });
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseTargets', targets: [] });
    expectLegal(g, action);
  });
});

describe('the battlefield-only plan is the slot of two zones alone (D-931)', () => {
  // The guard of `score` reads the plan, not the zone: the same legal targets, ranked with and without it. Without it a card of a graveyard is a target like any other
  // (a "return target creature card from a graveyard" aims at one); with it only the permanents are.
  const setup = () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .graveyard(ANGEL, { label: 'angel' })
      .build();
    const legal = [g.id('spider'), g.id('angel')].map((id) => ({
      kind: 'object' as const,
      id,
      specId: 't1',
    }));
    return { g, slot: { specId: 't1', min: 0, max: 2, legal } as TargetsDecision['specs'][number] };
  };
  const ids = (targets: readonly { kind: string; id?: string }[]) =>
    targets.map((t) => t.id).sort();

  test('a plan without it takes the card of the graveyard as it takes the permanent', () => {
    const { g, slot } = setup();
    const view = g.view(0);
    expect(ids(chooseSlot(view, slot, HARM_BY_DEFAULT))).toEqual(
      [g.id('spider'), g.id('angel')].sort(),
    );
  });

  test('with it only the permanent is taken', () => {
    const { g, slot } = setup();
    const view = g.view(0);
    expect(ids(chooseSlot(view, slot, { ...HARM_BY_DEFAULT, battlefieldOnly: true }))).toEqual([
      g.id('spider'),
    ]);
  });
});

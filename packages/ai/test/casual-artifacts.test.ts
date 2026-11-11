// CasualAgent and the decisions the Artifacts slice adds (D-139), on real engine states built with the scenario DSL: a discard "unless you
// discard an artifact card" is answered with a legal answer (one card of the list, or the full count), the best card of the top cards
// looked at is taken, and "reselect which player or permanent an attacker is attacking" is answered with a target the engine lists.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type CasualAgent, RandomLegalAgent } from '../src/index';
import { answer } from './casual-helpers';

describe('discard two cards unless you discard an artifact card', () => {
  const asked = (hand: readonly string[]) => {
    let b = scenario()
      .seat(0)
      .hand('SYNTHETIC Study Rite')
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains');
    b = hand.reduce((s, card) => s.seat(0).hand(card), b);
    const g = b.at('precombatMain').build();
    g.act(0).cast('SYNTHETIC Study Rite', { pay: true });
    g.passAll();
    return g;
  };

  test('CasualAgent gives up the one artifact card, which alone is a legal answer', async () => {
    const g = asked(['SYNTHETIC Trinket 1', 'Grizzly Bears']);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.id('SYNTHETIC Trinket 1')] });
    g.act(0).choose(a);
    g.expect.invariants();
  });

  test('with no artifact card in hand the full count is discarded', async () => {
    const g = asked(['Grizzly Bears']);
    const a = await answer(g);
    if (a.kind !== 'chooseCards') throw new Error('expected a choice of cards');
    expect(a.objects).toHaveLength(2);
    g.act(0).choose(a);
    g.expect.invariants();
  });

  test('RandomLegalAgent answers with one of the engine answers, whatever it draws', async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const g = asked(['SYNTHETIC Trinket 1', 'SYNTHETIC Trinket 2', 'Grizzly Bears']);
      const a = await answer(g, new RandomLegalAgent({ seed }) as unknown as CasualAgent);
      g.act(0).choose(a);
      g.expect.invariants();
    }
  });
});

describe('look at the top six cards and take an artifact card', () => {
  test('the agent takes the most expensive artifact card of those it may take', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Artifact Sketch')
      .battlefield('Island', { count: 3 })
      .library(
        'SYNTHETIC Trinket 1',
        'SYNTHETIC Trinket 4',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
      )
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Artifact Sketch', { pay: true });
    g.passAll();
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.id('SYNTHETIC Trinket 4')] });
    g.act(0).choose(a);
    g.expect.zone('SYNTHETIC Trinket 4', 'hand', { seat: 0 });
  });
});

describe('reselecting what an attacker attacks', () => {
  const asked = () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .hand('SYNTHETIC Crooked Signpost')
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'Grizzly Bears' }]);
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Crooked Signpost', { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).accept();
    return g;
  };

  test("the answer is one of the targets the engine lists, here all of them the defender's own", async () => {
    const g = asked();
    const a = await answer(g);
    if (a.kind !== 'chooseOption') throw new Error('expected an option');
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the question');
    expect(d.options).toContain(a.option);
    g.act(1).choose(a);
    g.expect.invariants();
  });
});

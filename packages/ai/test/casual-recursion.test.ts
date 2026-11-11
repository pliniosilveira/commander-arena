// CasualAgent and the recursion slice (D-135), on real engine states built with the scenario DSL: Gift is promised only when the
// card says what the gift buys, "sacrifice any number of other permanents" gives up the permanents the agent would sacrifice
// first, an ability that returns its own card from the graveyard is used on spare mana, and a permission to cast a creature card
// from the graveyard is given when a card could be cast with the lands that are untapped.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { answer } from './casual-helpers';
import { CTX } from './helpers';

describe('the gift question', () => {
  const asked = (card: string) => {
    const g = scenario()
      .seat(0)
      .hand(card)
      .graveyard('SYNTHETIC Plain Zombie')
      .battlefield('Island', { count: 3 })
      .battlefield('Swamp', { count: 3 })
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.act(0).cast(card);
    return g;
  };

  test('promised when the text says what the gift buys', async () => {
    expect(await answer(asked('SYNTHETIC Greedy Reaper'))).toEqual({ kind: 'acceptOptional' });
    expect(await answer(asked('SYNTHETIC Gift Study'))).toEqual({ kind: 'acceptOptional' });
  });
});

describe('sacrificing any number of other permanents', () => {
  test('tokens and surplus lands go, the creatures stay', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Greedy God')
      .pool('BBBBB')
      .battlefield('Grizzly Bears')
      .battlefield('Sol Ring')
      .battlefield('Forest', { count: 7 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    const a = await answer(g);
    if (a.kind !== 'choosePermanents') throw new Error('expected a choice of permanents');
    // The creature is kept; whatever is given up is a surplus land (seven lands is more than the hand needs).
    expect(a.objects).not.toContain(g.id('Grizzly Bears'));
    expect(a.objects.length).toBeLessThanOrEqual(8);
    g.act(0).choose(a);
    g.expect.invariants();
  });
});

describe('abilities from the graveyard', () => {
  test('a card that returns itself is activated on spare mana in the second main phase', async () => {
    const g = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Revenant Zombie')
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .at('postcombatMain')
      .build();
    const view = g.view(0);
    const decision = g.state.pending;
    if (decision === null || view.pending === null) throw new Error('nothing is pending');
    const a = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(a).toMatchObject({
      kind: 'activate',
      object: g.id({ name: 'SYNTHETIC Revenant Zombie', zone: 'graveyard' }),
    });
  });

  test('not in the first main phase: the mana may be needed for a spell', async () => {
    const g = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Revenant Zombie')
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .at('precombatMain')
      .build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('nothing is pending');
    expect(await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX)).toEqual({
      kind: 'pass',
    });
  });

  test('a permission to cast a Zombie card is given when it could be cast', async () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Grave Chanter Zombie')
      .graveyard('SYNTHETIC Plain Zombie')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .at('precombatMain')
      .build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('nothing is pending');
    const a = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(a).toMatchObject({ kind: 'activate', object: g.id('SYNTHETIC Grave Chanter Zombie') });
  });

  test('not when no card could be named, or when the lands could not pay for it', async () => {
    const none = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Grave Chanter Zombie')
      .graveyard('Grizzly Bears')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .at('precombatMain')
      .build();
    const v1 = none.view(0);
    if (v1.pending === null) throw new Error('nothing is pending');
    expect(await new CasualAgent({ seed: 1 }).decide(v1, v1.pending, CTX)).toEqual({
      kind: 'pass',
    });
    const poor = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Grave Chanter Angel')
      .graveyard('SYNTHETIC Costly Angel')
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .at('precombatMain')
      .build();
    const v2 = poor.view(0);
    if (v2.pending === null) throw new Error('nothing is pending');
    expect(await new CasualAgent({ seed: 1 }).decide(v2, v2.pending, CTX)).toEqual({
      kind: 'pass',
    });
  });
});

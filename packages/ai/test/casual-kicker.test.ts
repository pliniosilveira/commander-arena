// CasualAgent and the kicker question and flashback options, on real engine states built with the
// scenario DSL. The heuristics: pay a kicker when asked (a life part only while life is above
// PAY_LIFE_ABOVE); cast every worthwhile hand spell before any flashback card; cast a flashback
// card when nothing in hand is worth casting and it is worth casting itself (a removal spell only
// with a creature to hit, like any other).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { answer } from './casual-helpers';

describe('the kicker question', () => {
  test('a mana kicker is paid', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Kicker Bear')
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Kicker Bear');
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
  });

  test('a life kicker is paid while life is high and declined when it is not', async () => {
    const at = (life: number) => {
      const g = scenario()
        .seat(0)
        .life(life)
        .hand('SYNTHETIC Life Kicker')
        .battlefield('Swamp')
        .library('Plains', 'Plains', 'Plains')
        .seat(1)
        .build();
      g.act(0).cast('SYNTHETIC Life Kicker');
      return answer(g);
    };
    expect(await at(PAY_LIFE_ABOVE + 1)).toEqual({ kind: 'acceptOptional' });
    expect(await at(PAY_LIFE_ABOVE)).toEqual({ kind: 'declineOptional' });
  });
});

describe('flashback', () => {
  test('a hand spell is cast before a flashback card', async () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .graveyard('SYNTHETIC Flash Gain')
      .battlefield('Forest', 'Forest', 'Plains', 'Plains')
      .seat(1)
      .build();
    const a = await answer(g);
    expect(a).toEqual({ kind: 'castSpell', object: g.id('Grizzly Bears') });
  });

  test('with nothing in hand worth casting it casts the flashback card with the alternative', async () => {
    const g = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Flash Gain')
      .battlefield('Plains', 'Plains')
      .seat(1)
      .build();
    const id = g.id({ name: 'SYNTHETIC Flash Gain', zone: 'graveyard' });
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: id, alternative: 'flashback' });
  });

  test('a removal spell with flashback waits for a creature to hit', async () => {
    const without = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Flash Slay')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    expect(await answer(without)).toEqual({ kind: 'pass' });
    // With a creature to hit the engine offers it, and the agent casts it.
    const withTarget = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Flash Slay')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const id = withTarget.id({ name: 'SYNTHETIC Flash Slay', zone: 'graveyard' });
    expect(await answer(withTarget)).toEqual({
      kind: 'castSpell',
      object: id,
      alternative: 'flashback',
    });
  });

  test('the dearest worthwhile flashback card first', async () => {
    const g = scenario()
      .seat(0)
      .graveyard('SYNTHETIC Flash Gain', 'SYNTHETIC Flash Study')
      .battlefield('Island', { count: 5 })
      .battlefield('Plains')
      .seat(1)
      .build();
    const study = g.id({ name: 'SYNTHETIC Flash Study', zone: 'graveyard' });
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: study, alternative: 'flashback' });
  });
});

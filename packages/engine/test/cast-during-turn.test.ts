// `castSpell` with `duringTurn` (CR 603.2: an ability triggers only for an event that fits its words): "whenever an opponent casts a spell during your turn" is true only while the
// active player is the controller of the ability; "your first spell during each opponent's turn" (D-565) keeps its own constraints. Cards are SYNTHETIC probes.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, validateCard } from '../src/index';
import { scenario } from '../src/testing';
import { singleFaceCard } from './dsl-helpers';

type Cast = {
  readonly by: 'you' | 'opponent' | 'any';
  readonly duringTurn?: 'you' | 'opponent';
  readonly nth?: number;
  readonly self?: true;
};

const watcher = (cast: Cast) =>
  singleFaceCard({
    name: 'SYNTHETIC Turn Watcher',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, ...cast },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
    ],
  });

const GAIN = singleFaceCard({
  name: 'SYNTHETIC Turn Probe Spell',
  manaCost: ['1'],
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
});

describe('validateCard of duringTurn', () => {
  test('"you" is valid on a cast trigger of any caster', () => {
    expect(validateCard(watcher({ by: 'opponent', duringTurn: 'you' }))).toEqual([]);
    expect(validateCard(watcher({ by: 'any', duringTurn: 'you' }))).toEqual([]);
  });

  test('"opponent" is still only for your first spell', () => {
    const found = validateCard(watcher({ by: 'opponent', duringTurn: 'opponent' }));
    expect(found.some((i) => i.path.endsWith('duringTurn'))).toBe(true);
    expect(validateCard(watcher({ by: 'you', nth: 1, duringTurn: 'opponent' }))).toEqual([]);
  });

  test('an unknown value is refused', () => {
    const bad = watcher({ by: 'opponent', duringTurn: 'nobody' as unknown as 'you' });
    expect(validateCard(bad).some((i) => i.message.includes('unknown active player'))).toBe(true);
  });

  test('the feature is supported', () => {
    expect(isFeatureSupported('trigger:castDuringYourTurn')).toBe(true);
  });
});

describe('a cast trigger during your turn', () => {
  const W = watcher({ by: 'opponent', duringTurn: 'you' });
  const game = (active: 0 | 1) =>
    scenario()
      .define(W)
      .define(GAIN)
      .seat(0)
      .battlefield(W.name)
      .hand(GAIN.name)
      .battlefield('Island', { count: 2 })
      .seat(1)
      .hand(GAIN.name)
      .battlefield('Island', { count: 2 })
      .at('precombatMain', { active, turn: active === 0 ? 1 : 2 })
      .build();

  test('triggers for an opponent spell in the controller turn', () => {
    const g = game(0);
    g.act(0).pass();
    g.act(1).cast(GAIN.name, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('does not trigger in the opponent turn', () => {
    const g = game(1);
    g.act(1).cast(GAIN.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('does not trigger for the controller own spell', () => {
    const g = game(0);
    g.act(0).cast(GAIN.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.expect.invariants();
  });
});

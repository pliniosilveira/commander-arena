// Teferi's Reproach player effects (D-607): protection from everything, life-total lock and mass phasing.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const REPROACH = 'SYNTHETIC Player Lock Reproach';
const lockReproach = singleFace({
  name: REPROACH,
  manaCost: ['2', 'W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC fixture for player-wide protection, life lock and phasing.',
  spell: {
    targets: [{ id: 'p1', what: { kind: 'player', filter: 'any' } }],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'grantPlayerProtectionEverything',
          player: { kind: 'target', id: 'p1' },
          duration: 'untilNextTurn',
        },
        {
          kind: 'preventPlayerLifeTotalChange',
          player: { kind: 'target', id: 'p1' },
          duration: 'untilNextTurn',
        },
        {
          kind: 'phaseOut',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              notTypes: ['land'],
              controlledBy: { kind: 'target', id: 'p1' },
            },
          },
        },
        { kind: 'loseLife', player: { kind: 'eachPlayer' }, amount: 3 },
        { kind: 'gainLife', player: { kind: 'eachPlayer' }, amount: 5 },
        { kind: 'setLifeTotal', player: { kind: 'eachPlayer' }, amount: 20 },
      ],
    },
  },
});

const LIFE_COST = 'SYNTHETIC Pay Life to Draw';
const lifeCostSpell = singleFace({
  name: LIFE_COST,
  manaCost: null,
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC fixture for a life-paid spell cost.',
  additionalCosts: [{ kind: 'payLife', amount: 2 }],
  spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
});

const LIFE_LOCK_ONLY = 'SYNTHETIC Life Total Lock';
const lifeLockOnly = singleFace({
  name: LIFE_LOCK_ONLY,
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC fixture for a life-total lock without protection.',
  spell: {
    targets: [{ id: 'p1', what: { kind: 'player', filter: 'opponent' } }],
    effect: {
      kind: 'preventPlayerLifeTotalChange',
      player: { kind: 'target', id: 'p1' },
      duration: 'untilNextTurn',
    },
  },
});

describe('player lock and mass phasing (D-607)', () => {
  test('protects the opponent, prevents life loss, phases out their nonlands and expires as their next turn begins', () => {
    const g = scenario()
      .define(lockReproach)
      .define(lifeCostSpell)
      .seat(0)
      .hand(REPROACH, 'Lightning Bolt')
      .battlefield('Plains', { count: 3 })
      .battlefield('Mountain')
      .library('Island', { count: 6 })
      .seat(1)
      .life(40)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .library('Island', { count: 6 })
      .build();

    g.act(0).cast(REPROACH, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 40);
    g.expect.zone('Grizzly Bears', 'phased', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });

    g.act(0).cast('Lightning Bolt');
    const targets = g.state.pending;
    if (targets?.kind !== 'targets') throw new Error(`expected targets, got ${targets?.kind}`);
    expect(
      targets.specs[0]?.legal.some((target) => target.kind === 'player' && target.seat === 1),
    ).toBe(false);
    g.act(0).cancel();

    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a player whose life total is locked cannot pay life as a spell cost', () => {
    const g = scenario()
      .define(lockReproach)
      .define(lifeCostSpell)
      .seat(0)
      .hand(REPROACH, LIFE_COST)
      .battlefield('Plains', { count: 3 })
      .library('Island', { count: 6 })
      .build();

    g.act(0).cast(REPROACH, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    const attempt = g.act(0).try.cast(LIFE_COST);
    expect(attempt.ok).toBe(false);
    g.expect.zone(LIFE_COST, 'hand', { seat: 0 });
    g.expect.life(0, 40);
  });

  test('a life-total lock alone prevents damage from changing life', () => {
    const g = scenario()
      .define(lifeLockOnly)
      .seat(0)
      .hand(LIFE_LOCK_ONLY, 'Lightning Bolt')
      .battlefield('Plains', 'Mountain')
      .seat(1)
      .life(40)
      .library('Island', { count: 6 })
      .build();

    g.act(0).cast(LIFE_LOCK_ONLY, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });
});

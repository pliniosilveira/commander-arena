// "Can't be blocked by creatures the monarch controls", "can't be blocked (this turn) except by Spirits" and "can't attack a player it has already attacked this turn" (group 6 of the
// Ahoy Mateys deck). Pins: CR 509.1b (blocking restrictions are read as the blockers are declared), CR 613.11 (a rules-modifying effect is read where the rule acts, and "loses all
// abilities" does not remove an effect's restriction), CR 725.1 (the monarch is one player, now), CR 508.1a and 508.6 (what an attacker may attack; an attack on a player is one
// declared against that player), CR 500.8 (an additional combat phase). The CR text was not available in this environment: the numbers are the ones the engine's comments cite.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-evasion-limits.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { canBlock } from './restriction-helpers';

const DODGER = 'SYNTHETIC Monarch Dodger';
const ESCORT = 'SYNTHETIC Spirit Escort';
const SPIRIT = 'SYNTHETIC Plain Spirit';
const CAPTAIN = 'SYNTHETIC Raid Captain';
const BEARS = 'Grizzly Bears';
const WALL = 'SYNTHETIC Brick Wall';

describe('the cards are valid', () => {
  test.each([DODGER, ESCORT, SPIRIT, CAPTAIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('restrict blockers goes only with cantBeBlocked and names creatures by what they are', () => {
    const card = syntheticCard(ESCORT);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withEffect = (effect: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'activated',
                cost: [{ kind: 'mana', symbols: ['1'] }],
                targets: [
                  {
                    id: 't1',
                    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
                  },
                ],
                effect,
              },
            ],
          },
        ],
      }) as never;
    const restrict = (extra: Record<string, unknown>) => ({
      kind: 'restrict',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
      restriction: 'cantBeBlocked',
      ...extra,
    });
    expect(validateCard(withEffect(restrict({ blockers: { types: ['creature'] } })))).toEqual([]);
    expect(
      validateCard(withEffect(restrict({ restriction: 'cantBlock', blockers: {} }))).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withEffect(restrict({ blockers: { zone: 'graveyard' } }))).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withEffect(restrict({ blockers: 3 }))).length).toBeGreaterThan(0);
  });
});

/** Seat 0 attacks with `attackers`; seat 1 has `defenders`; `monarch` is who holds the designation. Returns the game where seat 1 declares blockers. */
function game(
  attackers: readonly string[],
  defenders: readonly string[],
  monarch: 0 | 1 | null,
  before?: (g: ScenarioGame) => void,
): ScenarioGame {
  let b = scenario().seat(0).library('Island', { count: 4 });
  for (const a of attackers) b = b.battlefield(a);
  b = b.battlefield('Island', { count: 4 }).seat(1).library('Island', { count: 4 });
  for (const d of defenders) b = b.battlefield(d);
  const g = b.at('precombatMain', { active: 0, ...(monarch === null ? {} : { monarch }) }).build();
  before?.(g);
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  return g;
}

describe('"can\'t be blocked by creatures the monarch controls" (CR 509.1b, 725.1)', () => {
  test('the creatures of the monarch can not block it', () => {
    expect(canBlock(game([DODGER], [BEARS], 1), BEARS, DODGER)).toBe(false);
  });

  test('when the monarch is somebody else, or nobody, the creatures block as usual', () => {
    expect(canBlock(game([DODGER], [BEARS], 0), BEARS, DODGER)).toBe(true);
    expect(canBlock(game([DODGER], [BEARS], null), BEARS, DODGER)).toBe(true);
  });

  test('it restricts only the creature that has it: another attacker can still be blocked by them', () => {
    const g = game([DODGER, BEARS], [WALL], 1);
    expect(canBlock(g, WALL, DODGER)).toBe(false);
    expect(canBlock(g, WALL, BEARS)).toBe(true);
  });
});

describe('"can\'t be blocked except by Spirits" (CR 509.1b)', () => {
  test('only a Spirit can block the creature that has it', () => {
    const g = game([ESCORT], [BEARS, SPIRIT], null);
    expect(canBlock(g, BEARS, ESCORT)).toBe(false);
    expect(canBlock(g, SPIRIT, ESCORT)).toBe(true);
  });

  test('{3}{U}: another creature you control can not be blocked this turn except by Spirits (CR 509.1b, 611.2a)', () => {
    const g = game([ESCORT, BEARS], [WALL, SPIRIT], null, (pre) => {
      pre.act(0).activate(ESCORT, { ability: 1, targets: [BEARS], pay: true });
      pre.passAll();
    });
    expect(canBlock(g, WALL, BEARS)).toBe(false);
    expect(canBlock(g, SPIRIT, BEARS)).toBe(true);
    // The Escort itself is not "another": its own static ability is what limits it.
    expect(canBlock(g, WALL, ESCORT)).toBe(false);
  });

  test('without the activation the same creature is blocked as usual', () => {
    const g = game([ESCORT, BEARS], [WALL], null);
    expect(canBlock(g, WALL, BEARS)).toBe(true);
  });

  test('the effect is not an ability of the creature and lasts this turn only (CR 613.11, 514.2)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(ESCORT)
      .battlefield(BEARS)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).activate(ESCORT, { ability: 1, targets: [BEARS], pay: true });
    g.passAll();
    expect(derive(g.state, g.object(BEARS)).blockLimits).toHaveLength(1);
    // It is no unconditional restriction: nothing in `restrictions` says the creature can't be blocked at all.
    expect(derive(g.state, g.object(BEARS)).restrictions).not.toContain('cantBeBlocked');
    toNextTurn(g);
    expect(derive(g.state, g.object(BEARS)).blockLimits).toHaveLength(0);
  });
});

/** Passes priority, declaring no attackers, until the turn number changes. */
function toNextTurn(g: ScenarioGame): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 40 && g.state.turn.number === start; i += 1) {
    if (g.state.pending?.kind === 'declareAttackers') g.act(g.state.pending.seat).attack([]);
    else g.passAll();
  }
  expect(g.state.turn.number).toBe(start + 1);
}

/** Seat 0 with the Captain and Bears attacks seat 1, who has a Wall that never blocks; returns after the first combat damage and the additional combat phase begins. */
function afterFirstCombat(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library('Island', { count: 6 })
    .battlefield(CAPTAIN)
    .battlefield(BEARS)
    .seat(1)
    .library('Island', { count: 6 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([CAPTAIN, BEARS]);
  for (let i = 0; i < 12 && g.state.pending?.kind !== 'declareAttackers'; i += 1) g.passAll();
  return g;
}

describe('"can\'t attack a player it has already attacked this turn" (CR 508.1a, 508.6, 500.8)', () => {
  test('the first combat: the Captain may attack the player; its damage untaps my creatures and gives an additional combat phase', () => {
    const g = afterFirstCombat();
    g.expect.life(1, 40 - 4 - 2);
    g.expect.tapped(CAPTAIN, false);
    g.expect.tapped(BEARS, false);
    // the additional combat phase: the declaration of attackers comes again
    expect(g.state.turn.step).toBe('declareAttackers');
    g.expect.pending('declareAttackers', 0);
  });

  test('in the additional combat it can not attack that player again, while the Bears can', () => {
    const g = afterFirstCombat();
    g.expect.canAttack(CAPTAIN, false);
    g.expect.canAttack(BEARS, true);
  });

  test('before it has attacked anybody it is free to attack', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(CAPTAIN)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(CAPTAIN, true);
  });

  test('on the next turn the record is gone: it can attack the player again', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(CAPTAIN)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([CAPTAIN]);
    // seat 1's turn, then seat 0's again
    for (let n = 0; n < 2; n += 1) toNextTurn(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(CAPTAIN, true);
  });
});

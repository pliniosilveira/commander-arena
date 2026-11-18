// "If you cast this spell during your main phase" (CR 601.2c, 505.1; issue 244): a target slot that exists only for a spell cast during a main phase of its controller's turn,
// and the condition that reads the same fact as the spell resolves. Pins: CR 601.2c (a spell may require some targets only if a condition about how it was cast holds; otherwise it is
// cast as though it did not require them), CR 115.3 ("other" targets differ from the first one), CR 500.4 (no phase ends with a spell on the stack), CR 707.10 (a copy is not cast).
// The card is SYNTHETIC: {2}{W}{W} instant, "Exile target artifact or enchantment. If you cast this spell during your main phase, you may exile up to one other target artifact or enchantment."
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const DUST = 'SYNTHETIC Dust Return';
const AURA = 'SYNTHETIC Dust Enchantment';
const RING = 'Sol Ring';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

const artifactOrEnchantment = {
  kind: 'object',
  filter: { zone: 'battlefield', anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] },
} as const;

const dust = singleFace({
  name: DUST,
  manaCost: ['2', 'W', 'W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Exile target artifact or enchantment. If you cast this spell during your main phase, you may exile up to one other target artifact or enchantment.',
  spell: {
    targets: [
      { id: 't1', what: artifactOrEnchantment },
      {
        id: 't2',
        ifCastInOwnMain: true,
        min: 0,
        max: 1,
        differentFrom: 't1',
        what: artifactOrEnchantment,
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'conditional',
          condition: { kind: 'castInOwnMainPhase' },
          effect: { kind: 'may', effect: { kind: 'exile', objects: { kind: 'target', id: 't2' } } },
        },
      ],
    },
  },
});
const enchantment = singleFace({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC enchantment with no abilities.',
});

/** Seat 0 holds the spell with four Plains; seat 1 controls a Sol Ring and an enchantment. `active` and `step` say when. */
function game(
  active: 0 | 1,
  step: 'precombatMain' | 'beginningOfCombat' | 'upkeep' | 'postcombatMain',
) {
  return scenario()
    .seat(0)
    .define(dust)
    .define(enchantment)
    .hand(DUST)
    .battlefield('Plains', { count: 4 })
    .library(...FILLER)
    .seat(1)
    .battlefield(RING, AURA)
    .library(...FILLER)
    .at(step, { active })
    .build();
}

describe('the spell is valid', () => {
  test('it passes validation', () => {
    expect(validateCard(dust)).toEqual([]);
  });
  test('a slot used outside the conditional is refused', () => {
    const bad = {
      ...dust,
      faces: [
        {
          ...dust.faces[0],
          spell: {
            ...dust.faces[0]?.spell,
            effect: { kind: 'exile', objects: { kind: 'target', id: 't2' } },
          },
        },
      ],
    };
    expect(JSON.stringify(validateCard(bad as never))).toContain('castInOwnMainPhase');
  });
});

describe("cast during its controller's main phase (CR 601.2c)", () => {
  test('both slots are asked, and both permanents are exiled', () => {
    const g = game(0, 'precombatMain');
    g.act(0).cast(DUST);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['t1', 't2']);
    g.act(0).chooseTargets(RING, AURA);
    g.act(0).payAuto();
    g.passAll();
    // "you may exile": the second exile is the controller's choice as the spell resolves (CR 608.2d).
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    g.expect.zone(RING, 'exile');
    g.expect.zone(AURA, 'exile');
    g.expect.invariants();
  });

  test('declining the "may" exiles the first target only', () => {
    const g = game(0, 'precombatMain');
    g.act(0).cast(DUST);
    g.act(0).chooseTargets(RING, AURA);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).decline();
    g.expect.zone(RING, 'exile');
    g.expect.zone(AURA, 'battlefield', { seat: 1 });
  });

  test('the second slot is "up to": a single target exiles one permanent only', () => {
    const g = game(0, 'postcombatMain');
    g.act(0).cast(DUST);
    g.act(0).chooseTargets(RING);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(RING, 'exile');
    g.expect.zone(AURA, 'battlefield', { seat: 1 });
  });

  test('"other": the same permanent cannot be both targets (CR 115.3)', () => {
    const g = game(0, 'precombatMain');
    g.act(0).cast(DUST);
    expect(() => g.act(0).chooseTargets(RING, RING)).toThrow();
  });
});

describe('cast at any other time the second slot does not exist', () => {
  test('in a step that is not a main phase', () => {
    const g = game(0, 'beginningOfCombat');
    g.act(0).cast(DUST);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['t1']);
    g.act(0).chooseTargets(RING);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(RING, 'exile');
    g.expect.zone(AURA, 'battlefield', { seat: 1 });
  });

  test("in the opponent's main phase (it is not your main phase)", () => {
    const g = game(1, 'precombatMain');
    g.act(1).pass();
    g.act(0).cast(DUST);
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['t1']);
  });
});

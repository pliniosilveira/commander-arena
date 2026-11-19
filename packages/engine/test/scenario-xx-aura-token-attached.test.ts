// Issue 89 (Silverquill Influence), "create a white Aura enchantment token named Contract attached to target creature an opponent controls" (CR 303.4f, 303.4g, 111.2, 701.3).
// Pins: the token enters already attached to the target the effect names (not a choice), is controlled by the player who controls the ability (CR 111.2) whatever
// controls the host (CR 303.4e), has the Aura's own enchant ability and abilities (CR 303.4m), and the structure check refuses an Aura token that names no target or a
// target for a token that is no Aura. Cards: the SYNTHETIC Contract Maker of this file and the real Grizzly Bears.
import { describe, expect, test } from 'vitest';
import type { Ability, TokenDefinition } from '../src/ast/types';
import { validateCardStructure } from '../src/ast/validate';
import { controllerOf } from '../src/rules/control';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MAKER = 'SYNTHETIC Contract Maker';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const CONTRACT: TokenDefinition = {
  name: 'Contract',
  manaCost: null,
  supertypes: [],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText: 'Enchant creature\nEnchanted creature gets +1/+1.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: { kind: 'modifyPt', subject: { kind: 'attached' }, power: 1, toughness: 1 },
    },
  ],
};

const trigger = (definition: TokenDefinition, attachTo: boolean): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['0'] }],
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
      },
    },
  ],
  effect: {
    kind: 'createToken',
    token: { kind: 'custom', definition },
    count: 1,
    ...(attachTo ? { attachTo: { kind: 'target', id: 't1' } } : {}),
  },
});

const maker = (ability: Ability) =>
  singleFaceCard({
    name: MAKER,
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    abilities: [ability],
  });

describe('an Aura token created attached to a target (CR 303.4f, 701.3)', () => {
  const board = () =>
    scenario()
      .define(maker(trigger(CONTRACT, true)))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MAKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();

  test('it enters attached to the target, which its creator does not control', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    const token = Object.values(g.state.objects).find(
      (o) => o.token?.characteristics.name === 'Contract',
    );
    expect(token).toBeDefined();
    if (token === undefined) return;
    const bears = Object.values(g.state.objects).find(
      (o) => o.zone === 'battlefield' && o.owner === 1,
    );
    expect(token.attachedTo).toBe(bears?.id);
    // CR 111.2, 303.4e: its creator controls it; the creature it enchants stays its owner's.
    expect(controllerOf(g.state, token)).toBe(0);
    expect(bears?.owner).toBe(1);
  });

  test('it is not asked what to enchant', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('a host its enchant ability does not allow (CR 303.4g)', () => {
  test('no token is created when the target is not what the Aura enchants', () => {
    const landAura: TokenDefinition = {
      ...CONTRACT,
      abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['land'] } } }],
    };
    const g = scenario()
      .define(maker(trigger(landAura, true)))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MAKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    const tokens = Object.values(g.state.objects).filter((o) => o.token !== null);
    expect(tokens).toEqual([]);
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('the structure check (CR 303.4f)', () => {
  const messages = (ability: Ability) =>
    validateCardStructure(maker(ability)).map((i) => i.message);

  test('a well-formed Aura token with a target is accepted', () => {
    expect(messages(trigger(CONTRACT, true))).toEqual([]);
  });

  test('an Aura token that names no target is refused', () => {
    expect(messages(trigger(CONTRACT, false))).toEqual([
      'an Aura token is created attached to a target: name it',
    ]);
  });

  test('a token that is not an Aura cannot be created attached', () => {
    const plain: TokenDefinition = { ...CONTRACT, subtypes: [], name: 'Plain' };
    expect(messages(trigger(plain, true))).toEqual([
      'only a custom Aura enchantment token with an enchant ability is created attached',
    ]);
  });

  test('an Aura token with no enchant ability cannot be created attached', () => {
    const bare: TokenDefinition = { ...CONTRACT, abilities: [] };
    expect(messages(trigger(bare, true))).toEqual([
      'only a custom Aura enchantment token with an enchant ability is created attached',
    ]);
  });
});

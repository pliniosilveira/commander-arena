// Issue 144 (Witch's Mark), "Create a Wicked Role token attached to up to one target creature you control" (CR 111.10, 303.7, 704.5y; the rule text was not available to this build, so
// the Role rules here follow the card text and rulings given in the issue and are unverified). The Wicked Role is the engine's predefined token (`TOKEN_PRESETS['Wicked Role']`).
// Pins: the token enters attached to the target (not a choice), gives +1/+1, makes each opponent lose 1 life when it is put into a graveyard, no target means no token, a player
// who controls two of their own Roles on one permanent keeps the newest, Roles of different players both stay.
// Cards: the SYNTHETIC Role Maker of this file and the real Grizzly Bears and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { validateCardStructure } from '../src/ast/validate';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MAKER = 'SYNTHETIC Role Maker';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const ability: Ability = {
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['0'] }],
  targets: [
    {
      id: 't1',
      min: 0,
      max: 1,
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
    },
  ],
  effect: {
    kind: 'createToken',
    token: { kind: 'preset', preset: 'Wicked Role' },
    count: 1,
    attachTo: { kind: 'target', id: 't1' },
  },
};

const maker = singleFaceCard({
  name: MAKER,
  manaCost: ['2'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Test.',
  abilities: [ability],
});

const roles = (g: ReturnType<typeof board>) =>
  Object.values(g.state.objects).filter(
    (o) => o.zone === 'battlefield' && o.token?.characteristics.name === 'Wicked Role',
  );

const board = () =>
  scenario()
    .define(maker)
    .seat(0)
    .library(...LIBRARY)
    .hand('Lightning Bolt')
    .battlefield(MAKER, BEARS, 'Mountain')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(MAKER)
    .at('precombatMain', { active: 0 })
    .build();

describe('the Wicked Role token (CR 111.10, 303.7)', () => {
  test('it is attached to the target, controlled by its creator, and gives +1/+1', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    const [role] = roles(g);
    expect(role).toBeDefined();
    expect(role?.attachedTo).toBe(g.find({ name: BEARS })[0]?.id);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('with no target no token is created', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [], pay: true });
    g.passAll();
    expect(roles(g)).toEqual([]);
    g.expect.pt(BEARS, 2, 2);
  });

  test('when the enchanted creature dies the Role is put into a graveyard and each opponent loses 1 life', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(roles(g)).toEqual([]);
    g.expect.life(1, 39);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('a second Role of the same player replaces the first, which is put into a graveyard', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    expect(roles(g)).toHaveLength(1);
    g.expect.pt(BEARS, 3, 3);
    // The first Role went to the graveyard: its trigger made the opponent lose 1 life.
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('Roles of different players on one permanent both stay', () => {
    const g = board();
    g.act(0).activate(MAKER, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).activate(MAKER, { targets: [BEARS], pay: true });
    g.passAll();
    expect(roles(g)).toHaveLength(2);
    g.expect.pt(BEARS, 4, 4);
    g.expect.life(1, 40);
    g.expect.life(0, 40);
    g.expect.invariants();
  });
});

describe('the structure check', () => {
  test('a Role token with a target is accepted, without one it is refused', () => {
    expect(validateCardStructure(maker).map((i) => i.message)).toEqual([]);
    const bare: Ability = {
      ...ability,
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Wicked Role' },
        count: 1,
      },
    } as Ability;
    const without = singleFaceCard({
      name: 'SYNTHETIC Bare Role Maker',
      manaCost: ['2'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: 'Test.',
      abilities: [bare],
    });
    expect(validateCardStructure(without).map((i) => i.message)).toEqual([
      'an Aura token is created attached to a target: name it',
    ]);
  });
});

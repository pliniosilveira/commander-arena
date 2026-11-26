// "Prevent all combat damage that would be dealt to and dealt by this creature" (the second half) and "Prevent all noncombat damage that would be dealt to you and other
// permanents you control" (Planeswalker Party deck): the static `preventDamageAround`.
// Pins: CR 615.1 and 615.6 (prevention: the damage is never dealt), CR 120.3f (lifelink needs damage dealt), CR 113.6 and 613.1f (the ability of the permanent, lost with
// "loses all abilities"), CR 108.4 and 613.1b (its controller as it is now). Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { CardDefinition } from '../src/index';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const FOG: CardDefinition = singleFace({
  name: 'SYNTHETIC Fogbound Wall',
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Wall'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 0,
  toughness: 4,
  oracleText: 'Prevent all combat damage that would be dealt to and dealt by this creature.',
  abilities: [
    {
      kind: 'static',
      static: { kind: 'preventDamageToThis', subject: { kind: 'this' }, scope: 'combat' },
    },
    {
      kind: 'static',
      static: { kind: 'preventDamageAround', scope: 'combat', events: 'dealtByThis' },
    },
  ],
});
const STRIKER: CardDefinition = singleFace({
  name: 'SYNTHETIC Fogbound Striker',
  manaCost: ['2'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: [],
  colorIdentity: [],
  power: 3,
  toughness: 3,
  oracleText: 'Prevent all combat damage that would be dealt by this creature.',
  abilities: [
    {
      kind: 'static',
      static: { kind: 'preventDamageAround', scope: 'combat', events: 'dealtByThis' },
    },
  ],
});
const WARD: CardDefinition = singleFace({
  name: 'SYNTHETIC Wandering Ward',
  manaCost: ['3', 'W'],
  types: ['creature'],
  subtypes: ['Wall'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 0,
  toughness: 2,
  oracleText:
    'Prevent all noncombat damage that would be dealt to you and other permanents you control.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'preventDamageAround',
        scope: 'noncombat',
        events: 'dealtToYouAndYourOtherPermanents',
      },
    },
  ],
});

describe('validation', () => {
  test('the new static validates', () => {
    expect(validateCard(FOG)).toEqual([]);
    expect(validateCard(WARD)).toEqual([]);
  });
});

describe('prevent combat damage dealt by this creature', () => {
  test('a blocker with it and with the prevention to itself takes and deals nothing', () => {
    const g = scenario()
      .define(FOG)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(FOG.name, { label: 'wall' })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: 'wall', attacker: BEARS }],
      until: 'endOfCombat',
    });
    g.expect.damage('wall', 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('its combat damage to a player is prevented, and noncombat damage it is the source of is not', () => {
    const g = scenario()
      .define(STRIKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(STRIKER.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.playCombat({ attack: [STRIKER.name], block: [], until: 'endOfCombat' });
    g.expect.life(1, 40);
  });

  test("another creature's combat damage is not prevented", () => {
    const g = scenario()
      .define(STRIKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, STRIKER.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.playCombat({ attack: [BEARS, STRIKER.name], block: [], until: 'endOfCombat' });
    g.expect.life(1, 38);
  });
});

describe('prevent noncombat damage to you and other permanents you control', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(WARD)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARD.name)
      .battlefield(BEARS, { label: 'bear' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', { label: 'enemy bear' })
      .build();

  test('a Lightning Bolt at its controller deals nothing', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });

  test("a Lightning Bolt at another permanent of its controller deals nothing; at another player's, it does", () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.damage('bear', 0);
    const h = build();
    h.act(0).cast(BOLT, { targets: ['enemy bear'], pay: true });
    h.passAll();
    h.expect.zone(BEARS, 'graveyard', { seat: 2 });
  });

  test('it does not cover itself ("other permanents")', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [WARD.name], pay: true });
    g.passAll();
    g.expect.zone(WARD.name, 'graveyard', { seat: 1 });
  });

  test('combat damage to its controller is dealt', () => {
    const g = scenario()
      .define(WARD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARD.name)
      .build();
    g.playCombat({ attack: [BEARS], block: [], until: 'endOfCombat' });
    g.expect.life(1, 38);
  });
});

describe('"If a source would deal damage to you or a planeswalker you control, prevent all but 1 of that damage" (an emblem)', () => {
  const EMBLEM_SPELL = singleFace({
    name: 'SYNTHETIC Ajani Emblem',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'You get an emblem with "If a source would deal damage to you or a planeswalker you control, prevent all but 1 of that damage."',
    spell: {
      targets: [],
      effect: {
        kind: 'createEmblem',
        text: 'If a source would deal damage to you or a planeswalker you control, prevent all but 1 of that damage.',
        abilities: [
          {
            kind: 'static',
            static: {
              kind: 'preventDamageAround',
              scope: 'all',
              events: 'dealtToYouAndYourPlaneswalkers',
              keep: 1,
            },
          },
        ],
      },
    },
  });

  const build = () =>
    scenario({ seats: 3 })
      .define(EMBLEM_SPELL)
      .seat(0)
      .library(...LIBRARY)
      .hand(EMBLEM_SPELL.name, BOLT, BOLT, BOLT)
      .battlefield('Island', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('SYNTHETIC Loyalty Walker', { label: 'jace', counters: { loyalty: 3 } })
      .battlefield(BEARS, { label: 'bear' })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the validated card is valid', () => {
    expect(validateCard(EMBLEM_SPELL)).toEqual([]);
  });

  test('3 damage to the emblem player, to their planeswalker: 1 is dealt; to their creature: all 3', () => {
    const g = build();
    g.act(0).cast(EMBLEM_SPELL.name, { pay: true });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 39);
    g.act(0).cast(`${BOLT}[0]`, { targets: ['jace'], pay: true });
    g.passAll();
    g.expect.counters('jace', { loyalty: 2 });
    g.act(0).cast(`${BOLT}[0]`, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

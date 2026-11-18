// Issue 89 (Silverquill Influence), "Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may attach it to the
// token." (D-660; Ajani's Chosen).
// Pins: CR 603.2 (the trigger), CR 111.2 (the token is made by its controller), CR 701.3b and 303.4a (an Aura is attached only to what it could enchant), CR 303.4 (an Aura that
// entered enchanting something else moves to the token), CR 608.2c ("if that enchantment is an Aura" reads the enchantment that entered).
// Cards: the SYNTHETIC Chosen, Aura and Enchantment of this file, the real Grizzly Bears and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const CHOSEN = 'SYNTHETIC Cat Maker';
const AURA = 'SYNTHETIC Plain Aura';
const SHRINE = 'SYNTHETIC Plain Enchantment';
const BEARS = 'Grizzly Bears';

const chosen = singleFaceCard({
  name: CHOSEN,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 3,
  oracleText: 'Whenever an enchantment you control enters, ...',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { types: ['enchantment'], controller: 'you' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            count: 1,
            token: {
              kind: 'custom',
              definition: {
                name: 'Cat',
                manaCost: null,
                supertypes: [],
                types: ['creature'],
                subtypes: ['Cat'],
                colors: ['W'],
                power: 2,
                toughness: 2,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [],
              },
            },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'triggerSubject' },
              filter: { subtypes: ['Aura'] },
            },
            effect: {
              kind: 'may',
              effect: { kind: 'attach', object: { kind: 'triggerSubject' }, to: { kind: 'moved' } },
            },
          },
        ],
      },
    },
  ],
});

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

const shrine = singleFaceCard({
  name: SHRINE,
  manaCost: ['W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: '',
});

const game = (card: string) =>
  scenario()
    .seat(0)
    .define(chosen)
    .define(aura)
    .define(shrine)
    .hand(card)
    .library('Plains', 'Plains')
    .battlefield('Plains', CHOSEN, BEARS)
    .seat(1)
    .library('Plains', 'Plains')
    .at('precombatMain')
    .build();

describe('"Whenever an enchantment you control enters, create a 2/2 Cat. If that enchantment is an Aura, you may attach it to the token."', () => {
  test('an Aura: the token is made and the Aura may be moved onto it', () => {
    const g = game(AURA);
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.attached(AURA, 'Cat');
  });

  test('declining: the Aura stays on the creature it enchants', () => {
    const g = game(AURA);
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.attached(AURA, BEARS);
  });

  test('an enchantment that is no Aura: only the token is made', () => {
    const g = game(SHRINE);
    g.act(0).cast(SHRINE, { pay: true });
    g.passAll();
    g.expect.zone('Cat', 'battlefield', { seat: 0 });
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });
});

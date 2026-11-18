// Issue 89 (Silverquill Influence), "Whenever this creature attacks, look at the top six cards of your library. You may put an Aura or Equipment card from among them onto the
// battlefield. If an Equipment is put onto the battlefield this way, you may attach it to a creature you control. Put the rest of those cards on the bottom of your library in a random
// order." (D-608; Armored Skyhunter).
// Pins: CR 401.2 (look at the top cards), CR 303.4f (an Aura put onto the battlefield chooses what it enchants), CR 701.3 and 301.5 (an Equipment is attached to a creature, "you may"),
// CR 401.4 (the rest go to the bottom in a random order).
// Cards: the SYNTHETIC creature, Aura and Equipment of this file, the real Grizzly Bears and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const HUNTER = 'SYNTHETIC Aura Hunter';
const AURA = 'SYNTHETIC Plain Aura';
const SWORD = 'SYNTHETIC Plain Sword';
const BEARS = 'Grizzly Bears';
const LIBRARY = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'];

const hunter = singleFaceCard({
  name: HUNTER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Bird'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText: 'Whenever this creature attacks, ...',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'lookAtTop',
            count: 6,
            take: {
              filter: { anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }] },
              max: 1,
              to: 'battlefield',
            },
            rest: 'bottomRandom',
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { subtypes: ['Equipment'] },
            },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'chooseObjects',
                  id: 'h',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
                  count: 1,
                },
                { kind: 'attach', object: { kind: 'moved' }, to: { kind: 'chosen', id: 'h' } },
              ],
            },
          },
        ],
      },
    },
  ],
});

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

const sword = singleFaceCard({
  name: SWORD,
  manaCost: ['1'],
  types: ['artifact'],
  subtypes: ['Equipment'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Equip {2}',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['2'] }] } },
  ],
});

/** Seat 0 attacks with the Hunter; its library holds `top` first, then Plains. */
const attack = (top: readonly string[]) => {
  const g = scenario()
    .seat(0)
    .define(hunter)
    .define(aura)
    .define(sword)
    .library(...top, ...LIBRARY)
    .battlefield(HUNTER, BEARS)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: HUNTER, target: { player: 1 } }]);
  g.passAll();
  return g;
};

describe('"look at the top six cards ... put an Aura or Equipment card from among them onto the battlefield"', () => {
  test('an Aura is put onto the battlefield and enchants the creature its controller chooses', () => {
    const g = attack(['Plains', AURA, 'Plains']);
    g.act(0).chooseCards(AURA);
    const d = g.state.pending;
    if (d?.kind === 'choosePermanent') g.act(0).choosePermanents(BEARS);
    g.expect.attached(AURA, BEARS);
  });

  test('an Equipment is put onto the battlefield and may be attached to a creature I control', () => {
    const g = attack([SWORD, 'Plains']);
    g.act(0).chooseCards(SWORD);
    g.act(0).choosePermanents(BEARS);
    g.expect.attached(SWORD, BEARS);
  });

  test('declining to attach leaves the Equipment unattached on the battlefield', () => {
    const g = attack([SWORD, 'Plains']);
    g.act(0).chooseCards(SWORD);
    g.act(0).choosePermanents();
    g.expect.zone(SWORD, 'battlefield', { seat: 0 });
    expect(g.object(g.id(SWORD)).attachedTo).toBeNull();
  });

  test('an Aura is no Equipment: nothing more is asked after it', () => {
    const g = attack([AURA, 'Plains']);
    g.act(0).chooseCards(AURA);
    const d = g.state.pending;
    if (d?.kind === 'choosePermanent') g.act(0).choosePermanents(BEARS);
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
  });
});

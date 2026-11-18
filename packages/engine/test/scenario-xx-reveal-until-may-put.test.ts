// Issue 89 (Silverquill Influence), "Whenever enchanted creature attacks, reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the
// battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order." (D-659; Songbirds' Blessing).
// Pins: CR 701.20 (reveal), CR 303.4f (an Aura put onto the battlefield chooses what it enchants), CR 608.2c ("if you don't" reads the offer before it), CR 401.4 (the rest go to the
// bottom of the library in a random order).
// Cards: the SYNTHETIC Songbirds and Aura of this file, the real Grizzly Bears, Llanowar Elves and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BLESSING = 'SYNTHETIC Songbirds Aura';
const AURA = 'SYNTHETIC Plain Aura';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const auraBody = [
  { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
] as const;

const blessing = singleFaceCard({
  name: BLESSING,
  manaCost: ['1', 'G'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Enchant creature\nWhenever enchanted creature attacks, ...',
  abilities: [
    ...auraBody,
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'revealUntil', filter: { subtypes: ['Aura'] }, put: 'none' },
          {
            kind: 'may',
            effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' },
          },
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'didPrevious' } },
            effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
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
  abilities: [...auraBody],
});

const attack = () => {
  const g = scenario()
    .seat(0)
    .define(blessing)
    .define(aura)
    .library('Plains', 'Forest', AURA, 'Plains', 'Plains', 'Plains')
    .battlefield(BEARS, ELVES)
    .battlefield(BLESSING, { attachedTo: BEARS })
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
  g.passAll();
  return g;
};

describe('"reveal cards until you reveal an Aura card. You may put that card onto the battlefield. If you don\'t, put it into your hand."', () => {
  test('accepting: the Aura enters and enchants a creature its controller chooses', () => {
    const g = attack();
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind === 'choosePermanent') g.act(0).choosePermanents(ELVES);
    g.expect.attached(AURA, ELVES);
    g.expect.handSize(0, 0);
  });

  test('declining: the Aura card goes into the hand', () => {
    const g = attack();
    g.act(0).decline();
    g.expect.zone(AURA, 'hand', { seat: 0 });
  });

  test('the cards revealed before it go to the bottom, the Aura does not', () => {
    const g = attack();
    g.act(0).decline();
    // Plains and Forest were revealed first: they are on the bottom now; three Plains stay on top of them.
    expect(g.state.seats[0]?.library).toHaveLength(5);
    g.expect.zone('Forest', 'library', { seat: 0 });
  });
});

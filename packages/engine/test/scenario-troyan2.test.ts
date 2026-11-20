// Troyan 2 deck (issue 400): "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library" (CR 603.6c, 603.10a, 701.24: the trigger of the
// card itself, from the battlefield, a hand or a library) and "destroy target artifact or enchantment that player controls" for the player a combat damage trigger is about
// (CR 510.2, 603.2, 109.4). The cards are SYNTHETIC.
import { describe, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const ELDER = 'SYNTHETIC Self-Shuffling Wurm';
const RAIDER = 'SYNTHETIC Relic Raider';
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

/** "When ~ is put into a graveyard from anywhere, shuffle it into its owner's library." */
const elder = singleFace({
  name: ELDER,
  manaCost: ['2', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText:
    "SYNTHETIC: When ~ is put into a graveyard from anywhere, shuffle it into its owner's library.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'putIntoGraveyard', who: 'any', from: 'anywhere', self: true },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library' },
          { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'this' } } },
        ],
      },
    },
  ],
});

/** "Whenever ~ deals combat damage to a player, you may destroy target artifact or enchantment that player controls." */
const raider = singleFace({
  name: RAIDER,
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText:
    'SYNTHETIC: combat damage to a player, destroy an artifact or enchantment that player controls.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              controller: 'triggerPlayer',
              anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
            },
          },
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    },
  ],
});

const MILL_RITE = 'SYNTHETIC Mill Rite';
const DISCARD_RITE = 'SYNTHETIC Discard Rite';

const millRite = singleFace({
  name: MILL_RITE,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: each player mills three cards.',
  spell: { effect: { kind: 'mill', player: { kind: 'eachPlayer' }, count: 3 } },
});

const discardRite = singleFace({
  name: DISCARD_RITE,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: you discard your hand.',
  spell: { effect: { kind: 'discard', player: { kind: 'you' }, count: 0, hand: true } },
});

type Builder = ReturnType<typeof scenario>;

function game(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const base = scenario()
    .define(elder)
    .define(raider)
    .define(millRite)
    .define(discardRite)
    .seat(0)
    .life(20);
  return theirs(
    mine(base)
      .library(...FILLER)
      .seat(1)
      .life(20),
  )
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

describe('the definitions are valid', () => {
  test('every fixture validates', () => {
    for (const card of [elder, raider, millRite, discardRite]) {
      const issues = validateCard(card);
      if (issues.length > 0) throw new Error(JSON.stringify(issues));
    }
  });
});

describe('"When ~ is put into a graveyard from anywhere" (CR 603.6c, 603.10a)', () => {
  test('dies on the battlefield: shuffled into its owner library', () => {
    const g = game(
      (b) => b.hand('Murder').battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(ELDER),
    );
    g.act(0).cast('Murder', { pay: true, targets: [ELDER] });
    settle(g);
    g.expect.zone(ELDER, 'library', { seat: 1 });
  });

  test('discarded from a hand: shuffled into its owner library', () => {
    const g = game((b) => b.hand(ELDER, DISCARD_RITE).battlefield('Swamp'));
    g.act(0).cast(DISCARD_RITE, { pay: true });
    settle(g);
    g.expect.zone(ELDER, 'library', { seat: 0 });
  });

  test('milled from a library: shuffled into its owner library', () => {
    const g = game(
      (b) => b.hand(MILL_RITE).battlefield('Swamp'),
      (b) => b.library(ELDER, ...FILLER),
    );
    g.act(0).cast(MILL_RITE, { pay: true });
    settle(g);
    g.expect.zone(ELDER, 'library', { seat: 1 });
  });

  test('another card put into a graveyard does not trigger it', () => {
    const g = game(
      (b) => b.hand('Murder').battlefield('Swamp', { count: 3 }).battlefield(ELDER),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast('Murder', { pay: true, targets: [BEARS] });
    settle(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ELDER, 'battlefield', { seat: 0 });
  });
});

describe('"destroy target artifact or enchantment that player controls" (CR 510.2, 603.2, 109.4)', () => {
  function attack(theirs: readonly string[]) {
    const g = scenario()
      .define(raider)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(RAIDER, 'Sol Ring')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(RAIDER);
    g.advanceTo('declareBlockers');
    if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers([]);
    g.advanceTo('combatDamage');
    settle(g);
    return g;
  }

  test("the defending player's artifact is destroyed, the attacker's own is not", () => {
    const g = attack(['Sol Ring']);
    g.expect.life(1, 18);
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
  });

  test('an enchantment is a legal target too', () => {
    const g = attack(['SYNTHETIC Quiet Shrine']);
    g.expect.zone('SYNTHETIC Quiet Shrine', 'graveyard', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
  });

  test('a creature is not a legal target: nothing is destroyed', () => {
    const g = attack([BEARS]);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
  });
});

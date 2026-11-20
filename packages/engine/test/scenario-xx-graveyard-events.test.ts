// Cards that leave a graveyard and cards put into a graveyard from anywhere but the battlefield (Syr Konrad, the Grim; Insidious Roots), CR 603.2, 603.2c, 400.7,
// 404.1, 700.4: `leftGraveyard` with a card filter, once for each card (`each`) or once for the cards that leave together, and `putIntoGraveyard` of any player's
// graveyard from any zone but the battlefield. A creature that dies is a death (the `dies` trigger) and is not counted again as a card put into a graveyard.
// Cards are SYNTHETIC or real fixtures. The Watcher deals 1 damage for a death, 2 for a creature card put into a graveyard from elsewhere and 4 for a creature card
// that leaves the controller's graveyard, so the damage the opponent took says which events triggered.
import { describe, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const WATCHER = 'SYNTHETIC Graveyard Watcher';
const BATCHER = 'SYNTHETIC Graveyard Batcher';
const REANIMATE = 'SYNTHETIC Reanimate Rite';
const EXILE_ALL = 'SYNTHETIC Exile Rite';
const MILL_RITE = 'SYNTHETIC Mill Rite';
const DISCARD_RITE = 'SYNTHETIC Discard Rite';
const CORPSE = 'SYNTHETIC Restless Corpse';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const opponentLoses = (amount: number): Effect => ({
  kind: 'dealDamage',
  amount,
  to: { kind: 'eachOpponent' },
});

/** "Whenever another creature dies, ~ deals 1 damage to each opponent. Whenever a creature card is put into a graveyard from anywhere other than the battlefield, 2. Whenever a creature card leaves your graveyard, 4." */
const watcher = singleFace({
  name: WATCHER,
  manaCost: ['1', 'B'],
  types: ['creature'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC: three graveyard triggers, 1, 2 and 4 damage to each opponent.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], other: true } },
      effect: opponentLoses(1),
    },
    {
      kind: 'triggered',
      trigger: {
        kind: 'putIntoGraveyard',
        who: 'any',
        from: 'notBattlefield',
        filter: { types: ['creature'] },
      },
      effect: opponentLoses(2),
    },
    {
      kind: 'triggered',
      trigger: { kind: 'leftGraveyard', who: 'you', filter: { types: ['creature'] }, each: true },
      effect: opponentLoses(4),
    },
  ],
});

/** "Whenever one or more creature cards leave your graveyard, ~ deals 1 damage to each opponent." */
const batcher = singleFace({
  name: BATCHER,
  manaCost: ['1', 'G'],
  types: ['enchantment'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'SYNTHETIC: one or more creature cards leave your graveyard, 1 damage.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'leftGraveyard', who: 'you', filter: { types: ['creature'] } },
      effect: opponentLoses(1),
    },
  ],
});

const graveyardMover = (
  name: string,
  types: readonly ['creature'] | undefined,
  to: 'exile' | 'battlefield',
) =>
  singleFace({
    name,
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: `SYNTHETIC: put each ${types === undefined ? '' : 'creature '}card from your graveyard into ${to}.`,
    spell: {
      effect: {
        kind: to === 'exile' ? 'exile' : 'moveToZone',
        objects: {
          kind: 'each',
          filter: {
            zone: 'graveyard',
            owner: { kind: 'you' },
            ...(types === undefined ? {} : { types }),
          },
        },
        ...(to === 'exile' ? {} : { to }),
      } as Effect,
    },
  });

const reanimate = graveyardMover(REANIMATE, ['creature'], 'battlefield');
const exileAll = graveyardMover(EXILE_ALL, undefined, 'exile');

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

/** Seat 0 at its main phase with `mine`, seat 1 with `theirs`; both at 20 life. */
function game(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const base = scenario()
    .define(watcher)
    .define(batcher)
    .define(reanimate)
    .define(exileAll)
    .define(millRite)
    .define(discardRite)
    .seat(0)
    .life(20);
  // The cards a test puts in a library go on top of the filler.
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

const cast = (g: ScenarioGame, name: string) => {
  g.act(0).cast(name, { pay: true });
  settle(g);
};

describe('the definitions are valid', () => {
  test('every fixture validates', () => {
    for (const card of [watcher, batcher, reanimate, exileAll, millRite, discardRite]) {
      const issues = validateCard(card);
      if (issues.length > 0) throw new Error(JSON.stringify(issues));
    }
  });
});

describe('a creature card leaves your graveyard (CR 400.7, 603.2)', () => {
  test('returned to the battlefield: the leaving trigger, once for each card', () => {
    const g = game((b) =>
      b.hand(REANIMATE).battlefield('Swamp').battlefield(WATCHER).graveyard(BEARS, SERRA),
    );
    cast(g, REANIMATE);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SERRA, 'battlefield', { seat: 0 });
    // 4 for each of the two cards that left; nothing was put into a graveyard from another zone except the spell, which is not a creature card.
    g.expect.life(1, 12);
  });

  test('exiled: the leaving trigger', () => {
    const g = game((b) =>
      b.hand(EXILE_ALL).battlefield('Swamp').battlefield(WATCHER).graveyard(BEARS),
    );
    cast(g, EXILE_ALL);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.life(1, 16);
  });

  test('cast from the graveyard: the leaving trigger (CR 601.2a, 113.6b)', () => {
    const g = game((b) =>
      b.graveyard(CORPSE).battlefield(ZOMBIE).battlefield('Swamp').battlefield(WATCHER),
    );
    g.act(0).cast(CORPSE, { pay: true });
    settle(g);
    g.expect.zone(CORPSE, 'battlefield', { seat: 0 });
    g.expect.life(1, 16);
  });

  test('a card that is not a creature card leaving the graveyard does not trigger it', () => {
    const g = game((b) =>
      b.hand(EXILE_ALL).battlefield('Swamp').battlefield(WATCHER).graveyard(BOLT),
    );
    cast(g, EXILE_ALL);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.life(1, 20);
  });

  test("the opponent's graveyard is not yours: a card leaving it does not trigger it", () => {
    const g = game(
      (b) => b.hand(REANIMATE).battlefield('Swamp').battlefield(WATCHER),
      (b) => b.graveyard(BEARS),
    );
    cast(g, REANIMATE);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 20);
  });
});

describe('"one or more creature cards leave your graveyard" triggers once however many leave (CR 603.2c)', () => {
  test('two creature cards returned together: one trigger', () => {
    const g = game((b) =>
      b.hand(REANIMATE).battlefield('Swamp').battlefield(BATCHER).graveyard(BEARS, SERRA),
    );
    cast(g, REANIMATE);
    g.expect.life(1, 19);
  });

  test('a creature card and a land card exiled together: one trigger, and the land does not add one', () => {
    const g = game((b) =>
      b.hand(EXILE_ALL).battlefield('Swamp').battlefield(BATCHER).graveyard(BEARS, 'Island'),
    );
    cast(g, EXILE_ALL);
    g.expect.life(1, 19);
  });

  test('no creature card among them: no trigger', () => {
    const g = game((b) =>
      b.hand(EXILE_ALL).battlefield('Swamp').battlefield(BATCHER).graveyard(BOLT, 'Island'),
    );
    cast(g, EXILE_ALL);
    g.expect.life(1, 20);
  });
});

describe('a creature card put into a graveyard from anywhere other than the battlefield (CR 603.2, 700.4)', () => {
  test('milled: the put-into-a-graveyard trigger once for each creature card', () => {
    const g = game((b) =>
      b
        .hand(MILL_RITE)
        .battlefield('Swamp')
        .battlefield(WATCHER)
        .library(BEARS, SERRA, 'Island', 'Plains'),
    );
    cast(g, MILL_RITE);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // 2 for each of the two creature cards; the Island adds nothing, and the Rite itself is no creature card.
    g.expect.life(1, 16);
  });

  test('discarded: the trigger, for a creature card and not for another', () => {
    const g = game((b) =>
      b.hand(DISCARD_RITE, BEARS, BOLT).battlefield('Swamp').battlefield(WATCHER),
    );
    cast(g, DISCARD_RITE);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(1, 18);
  });

  test("another player's graveyard counts: a creature card milled from the opponent's library", () => {
    const g = game(
      (b) => b.hand(MILL_RITE).battlefield('Swamp').battlefield(WATCHER),
      (b) => b.library(BEARS, 'Island', 'Island'),
    );
    g.expect.life(1, 20);
    cast(g, MILL_RITE);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 18);
  });

  test('a creature that dies triggers the death clause only, not a second time as a card put into a graveyard', () => {
    const g = game(
      (b) => b.hand('Murder').battlefield('Swamp', { count: 3 }).battlefield(WATCHER),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast('Murder', { pay: true, targets: [BEARS] });
    settle(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 19);
  });
});

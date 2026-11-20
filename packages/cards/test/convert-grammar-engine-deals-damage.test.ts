// The Tannuk deck (issue 347): the real Keen Sense, Snake Umbra and Sapling Nursery (the golden corpus holds all three) go through the grammar with no override (NO_OVERRIDES),
// are validated, and are played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 120.2 and 603.2c (damage of any kind, combat or not, triggers once for each player damaged), CR 603.2g (damage that is entirely prevented triggers nothing),
// CR 113.7a and 702.89a (the ability Snake Umbra grants belongs to the creature, so "an opponent" is an opponent of the creature's controller; umbra armor), CR 205.3i and 611.2c
// (Treefolk and Forests you control: both groups gain the keyword as the effect resolves), CR 702.12b (indestructible), CR 207.2c (landfall), CR 702.41a (affinity).
// The board is the engine's own fixtures (Grizzly Bears, Lightning Bolt, the basic lands) and SYNTHETIC cards of the engine (Spark Pinger, Shield Five).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const SENSE = real('Keen Sense');
const UMBRA = real('Snake Umbra');
const NURSERY = real('Sapling Nursery');
const BEARS = 'Grizzly Bears';
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const BOLT = 'Lightning Bolt';
const SHIELD = 'SYNTHETIC Shield Five'; // prevent the next 5 damage to any target this turn
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('all three cards are supported and validate', () => {
  test.each([SENSE, UMBRA, NURSERY])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Keen Sense: "Whenever enchanted creature deals damage to an opponent, you may draw a card."', () => {
  test('the lowering: damage of any kind to an opponent by the host', () => {
    expect(SENSE.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: { kind: 'dealsDamage', what: { kind: 'attached' }, to: 'opponent' },
      }),
    );
  });

  const board = () =>
    scenario()
      .define(SENSE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(SENSE.name, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const pingBoard = (theirs: readonly string[] = [], hand: readonly string[] = []) =>
    scenario()
      .define(SENSE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(PINGER)
      .battlefield(SENSE.name, { attachedTo: PINGER })
      .seat(1)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(...theirs)
      .battlefield('Plains', { count: 3 })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('combat damage to the opponent: the controller may draw a card', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 38);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test('"may": declining draws nothing', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 0);
  });

  test('damage that is not combat damage triggers it too (the host as the source of an ability)', () => {
    const g = pingBoard();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test('damage to a creature is not damage to an opponent', () => {
    const g = pingBoard([BEARS]);
    g.act(0).activate(PINGER, { targets: [{ name: BEARS, seat: 1 }] });
    g.passAll();
    g.expect.handSize(0, 0);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });

  test("an opponent's creature that damages you does not draw you a card (the Aura's controller is not its opponent)", () => {
    const g = scenario()
      .define(SENSE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SENSE.name, { attachedTo: 'theirs' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: BEARS, seat: 1 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(0, 38);
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });

  test('damage that is entirely prevented triggers nothing (CR 603.2g)', () => {
    const g = pingBoard([], [SHIELD]);
    g.act(0).pass();
    g.act(1).cast(SHIELD, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.handSize(0, 0);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });
});

describe('Snake Umbra: "Enchanted creature gets +1/+1 and has \'Whenever this creature deals damage to an opponent, you may draw a card.\'" and umbra armor', () => {
  test('the lowering: a bonus, a granted triggered ability and umbra armor', () => {
    const abilities = JSON.stringify(UMBRA.faces[0]?.abilities ?? []);
    expect(abilities).toContain('"dealsDamage"');
    expect(abilities.toLowerCase()).toContain('umbra');
  });

  /** Snake Umbra on the Bears of `host`; seat 1 holds a Lightning Bolt and three Mountains. */
  const board = (host: 0 | 1) =>
    scenario()
      .define(UMBRA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', { count: 3 })
      .battlefield(BEARS, { label: 'theirs' })
      .battlefield(UMBRA.name, { attachedTo: host === 0 ? 'mine' : 'theirs' })
      .at('precombatMain', { active: host, turn: host + 1 })
      .build();

  test('the host gets +1/+1', () => {
    const g = board(0);
    g.expect.pt({ name: BEARS, seat: 0 }, 3, 3);
    g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
  });

  test("the creature's controller may draw when it damages an opponent, with the Aura on their own creature", () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 37);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test("on an opponent's creature, its controller draws when it damages the Aura's controller (the ruling of 2010-06-15)", () => {
    const g = board(1);
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: BEARS, seat: 1 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(0, 37);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
  });

  test('umbra armor: lethal damage destroys the Aura instead and removes the damage (CR 702.89a)', () => {
    const g = board(1);
    g.act(1).cast(BOLT, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(UMBRA.name, 'graveyard', { seat: 1 });
    g.expect.damage({ name: BEARS, seat: 1 }, 0);
  });
});

describe('Sapling Nursery: affinity for Forests, landfall and "{1}{G}, Exile this enchantment: Treefolk and Forests you control gain indestructible until end of turn."', () => {
  test('the lowering: both groups gain indestructible, as one effect', () => {
    const activated = JSON.stringify(
      NURSERY.faces[0]?.abilities.find((a) => a.kind === 'activated'),
    );
    expect(activated).toContain('indestructible');
    expect(activated).toContain('Treefolk');
    expect(activated).toContain('Forest');
  });

  const board = () =>
    scenario()
      .define(NURSERY)
      .seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(NURSERY.name)
      .battlefield('Forest', { label: 'mineForest' })
      .battlefield('Forest', { count: 2 })
      .battlefield('Mountain')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', { label: 'theirForest' })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('landfall makes a 3/4 Treefolk with reach', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.pt('Treefolk', 3, 4);
    g.expect.derived('Treefolk', { subtypes: ['Treefolk'], keywords: ['reach'] });
  });

  test('the ability exiles the Nursery and gives indestructible to your Forests and Treefolk only', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).activate(NURSERY.name, { pay: true });
    g.passAll();
    g.expect.zone(NURSERY.name, 'exile', { seat: 0 });
    g.expect.derived('Treefolk', { keywords: ['reach', 'indestructible'] });
    g.expect.derived('mineForest', { keywords: ['indestructible'] });
    g.expect.derived('Mountain', { keywords: [] });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.derived('theirForest', { keywords: [] });
  });

  test('affinity for Forests: six Forests pay for all but {G}{G}', () => {
    const g = scenario()
      .define(NURSERY)
      .seat(0)
      .library(...LIBRARY)
      .hand(NURSERY.name)
      .battlefield('Forest', { count: 6 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(NURSERY.name, { pay: true });
    g.passAll();
    g.expect.zone(NURSERY.name, 'battlefield', { seat: 0 });
  });
});

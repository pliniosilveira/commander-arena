// Desert Bloom deck, group G3: delirium written at the end of a sentence ("Create a 4/4 ... token if there are four or more card types among cards in your graveyard", Descend upon the
// Sinful), delirium as a replacement of the damage before it ("~ deals 6 damage instead if ...", Unholy Heat), a cost reduction for each land card in a graveyard (Rumbleweed, Yuma, Proud
// Protector) and "return up to X target creature cards ..., where X is the number of times ~ was kicked" (Marshal's Anthem). The wording is that of the cards named in the test titles;
// every card name starts with "SYNTHETIC" and no real card's data is claimed (CR 205.2a, 207.2c, 601.2f, 614.1a, 702.33c, 107.3c, 603.3d).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const FILLER = ['Island', 'Forest', 'Plains', 'Swamp'] as const;

const idol = parsed('SYNTHETIC G3 Idol', 'Enchantment', 'Flash', {
  manaCost: '{2}{W}',
  colors: ['W'],
});
const gem = parsed('SYNTHETIC G3 Gem', 'Artifact', 'Flash', { manaCost: '{3}' });
const zombie = parsed('SYNTHETIC G3 Zombie', 'Creature — Zombie', 'Vigilance', {
  manaCost: '{B}',
  power: '1',
  toughness: '1',
  colors: ['B'],
});

const wrath = parsed(
  'SYNTHETIC G3 Descent',
  'Sorcery',
  'Exile all creatures.\nDelirium — Create a 4/4 white Angel creature token with flying if there are four or more card types among cards in your graveyard.',
  { manaCost: '{4}{W}{W}', colors: ['W'] },
);
const heat = parsed(
  'SYNTHETIC G3 Heat',
  'Instant',
  '~ deals 2 damage to target creature or planeswalker.\nDelirium — ~ deals 6 damage instead if there are four or more card types among cards in your graveyard.',
  { manaCost: '{R}', colors: ['R'] },
);
const weed = parsed(
  'SYNTHETIC G3 Weed',
  'Creature — Plant',
  'This spell costs {1} less to cast for each land card in your graveyard.\nReach, vigilance, trample\nWhen this creature enters, other creatures you control get +3/+3 and gain trample until end of turn.',
  { manaCost: '{10}{G}', power: '8', toughness: '8', colors: ['G'] },
);
const yuma = parsed(
  'SYNTHETIC G3 Yuma',
  'Legendary Creature — Elemental',
  'This spell costs {1} less to cast for each land card in your graveyard.\nWhenever ~ enters or attacks, you may sacrifice a land. If you do, draw a card.',
  { manaCost: '{5}{R}{G}{W}', power: '6', toughness: '6', colors: ['R', 'G', 'W'] },
);
const anthem = parsed(
  'SYNTHETIC G3 Anthem',
  'Enchantment',
  'Multikicker {1}{W}\nCreatures you control get +1/+1.\nWhen this enchantment enters, return up to X target creature cards from your graveyard to the battlefield, where X is the number of times this enchantment was kicked.',
  { manaCost: '{2}{W}{W}', colors: ['W'] },
);

const defs = () =>
  scenario()
    .define(idol)
    .define(gem)
    .define(zombie)
    .define(wrath)
    .define(heat)
    .define(weed)
    .define(yuma)
    .define(anthem);

describe('"Create a 4/4 ... token if there are four or more card types among cards in your graveyard" (CR 205.2a, 608.2c)', () => {
  const board = (yard: readonly string[]) =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(wrath.name)
      .graveyard(...yard)
      .battlefield('Plains', { count: 6 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();

  test('four card types: every creature is exiled and the Angel is made', () => {
    const g = board(['Island', 'Grizzly Bears', idol.name, gem.name]);
    g.act(0).cast(wrath.name, { pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'exile', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.pt('Angel', 4, 4);
    g.expect.invariants();
  });

  test('three card types and two creature cards: no Angel (each type counts once)', () => {
    const g = board(['Island', 'Grizzly Bears', 'Grizzly Bears', idol.name]);
    g.act(0).cast(wrath.name, { pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'exile', { seat: 1 });
    g.expect.noObject('Angel', { zone: 'battlefield' });
  });
});

describe('"~ deals 6 damage instead if there are four or more card types among cards in your graveyard" (CR 614.1a)', () => {
  const board = (yard: readonly string[]) =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(heat.name)
      .graveyard(...yard)
      .battlefield('Mountain')
      .seat(1)
      .library(...FILLER)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();

  test('four card types: 6 damage kills the 2/4', () => {
    const g = board(['Island', 'Grizzly Bears', idol.name, gem.name]);
    g.act(0).cast(heat.name, { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('three card types: only 2 damage, the 2/4 survives', () => {
    const g = board(['Island', 'Grizzly Bears', idol.name]);
    g.act(0).cast(heat.name, { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
  });
});

describe('"This spell costs {1} less to cast for each land card in your graveyard" (CR 601.2f)', () => {
  const board = (landCards: number, lands: number) =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(weed.name)
      .graveyard(...Array.from({ length: landCards }, () => 'Island'), zombie.name)
      .battlefield('Forest')
      .battlefield('Island', { count: lands - 1 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('three land cards: {7}{G} is enough, and the enters trigger pumps the other creatures', () => {
    const g = board(3, 8);
    g.act(0).cast(weed.name, { pay: true });
    g.passAll();
    g.expect.zone(weed.name, 'battlefield', { seat: 0 });
    g.expect.pt('Grizzly Bears', 5, 5);
  });

  test('no land cards: eight lands are not enough', () => {
    const g = board(0, 8);
    expect(() => g.act(0).cast(weed.name, { pay: true })).toThrow();
  });

  test('a card that is not a land does not reduce the cost (two land cards, eight lands: one short)', () => {
    const g = board(2, 8);
    expect(() => g.act(0).cast(weed.name, { pay: true })).toThrow();
  });

  test('the legendary three-color creature is cast for {1}{R}{G}{W} with four land cards', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(yuma.name)
      .graveyard('Island', { count: 4 })
      .battlefield('Mountain', 'Forest', 'Plains', 'Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(yuma.name, { pay: true });
    g.passAll();
    g.expect.zone(yuma.name, 'battlefield', { seat: 0 });
  });
});

describe('"return up to X target creature cards ..., where X is the number of times this enchantment was kicked" (CR 702.33c, 107.3c, 603.3d)', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...FILLER)
      .hand(anthem.name)
      .graveyard(zombie.name, { count: 3 })
      .battlefield('Plains', { count: 4 })
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('kicked twice: up to two targets, and the anthem lifts the returned creatures', () => {
    const g = board();
    g.act(0).cast(anthem.name, { kicks: 2, pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.min).toBe(0);
    expect(d.specs[0]?.max).toBe(2);
    g.act(0).chooseTargets(`${zombie.name}[0]`, `${zombie.name}[1]`);
    g.passAll();
    g.expect.zone(zombie.name, 'battlefield', { seat: 0, count: 2 });
    g.expect.zone(zombie.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.pt({ name: zombie.name, zone: 'battlefield', nth: 0 }, 2, 2);
    g.expect.invariants();
  });

  test('not kicked: X is 0, nothing is returned', () => {
    const g = board();
    g.act(0).cast(anthem.name, { kicks: 0, pay: true });
    g.passAll();
    g.expect.zone(zombie.name, 'graveyard', { seat: 0, count: 3 });
    g.expect.invariants();
  });
});

describe('what is not read', () => {
  const read = (typeLine: string, text: string) =>
    parseOnly(
      syntheticCard({ name: 'SYNTHETIC G3 Probe', typeLine, manaCost: '{R}', oracleText: text }),
    );

  test('a damage clause with no recipient and nothing before it to replace is unsupported, never guessed', () => {
    const alone = read(
      'Instant',
      'SYNTHETIC G3 Probe deals 6 damage instead if there are four or more card types among cards in your graveyard.',
    );
    expect(alone.support.status).not.toBe('supported');
    const afterDraw = read(
      'Instant',
      'Draw a card.\nSYNTHETIC G3 Probe deals 6 damage instead if there are four or more card types among cards in your graveyard.',
    );
    expect(afterDraw.support.status).not.toBe('supported');
  });

  test('"the number of times it was cast" is not the kicks of a spell', () => {
    const cast = read(
      'Enchantment',
      'When this enchantment enters, return up to X target creature cards from your graveyard to the battlefield, where X is the number of times it was cast.',
    );
    expect(cast.support.status).not.toBe('supported');
  });
});

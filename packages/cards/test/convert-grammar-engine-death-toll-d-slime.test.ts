// Death Toll deck, group D: "Create an X/X green Ooze creature token, where X is the total mana value of permanents destroyed this way." after "Destroy up to one target artifact, up to one
// target creature, and up to one target enchantment." (CR 701.8, 202.3, 608.2c, 608.2h). The wording is that of Convert to Slime, with the delirium test of its second sentence replaced by
// "if you control three or more lands": the count of card types among cards in a graveyard is read by its own rule and tested with it. Every card name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const slime = parsed(
  'SYNTHETIC Parsed Slime',
  'Sorcery',
  'Destroy up to one target artifact, up to one target creature, and up to one target enchantment.\nThen if you control three or more lands, create an X/X green Ooze creature token, where X is the total mana value of permanents destroyed this way.',
  { manaCost: '{3}{B}{G}', colors: ['B', 'G'] },
);
const trinket = parsed('SYNTHETIC Parsed Trinket', 'Artifact', 'Flash', {
  manaCost: '{3}',
});
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const idol = parsed('SYNTHETIC Parsed Idol', 'Enchantment', 'Flash', {
  manaCost: '{2}{W}',
  colors: ['W'],
});
const stone = parsed('SYNTHETIC Parsed Stone', 'Creature — Golem', 'Indestructible', {
  manaCost: '{4}',
  power: '1',
  toughness: '5',
});

const board = (lands: number) =>
  scenario()
    .define(slime)
    .define(trinket)
    .define(bear)
    .define(idol)
    .define(stone)
    .seat(0)
    .library(...FILLER)
    .hand(slime.name)
    .battlefield('Swamp')
    .battlefield('Forest')
    .battlefield('Island', { count: lands - 2 })
    .seat(1)
    .library(...FILLER)
    .battlefield(trinket.name)
    .battlefield(bear.name)
    .battlefield(idol.name)
    .battlefield(stone.name)
    .at('precombatMain', { active: 0 })
    .build();

describe('"where X is the total mana value of permanents destroyed this way" (CR 202.3, 608.2h)', () => {
  test('three permanents destroyed: their mana values added make the Ooze (3 + 2 + 3 = 8)', () => {
    const g = board(5);
    g.act(0).cast(slime.name, { targets: [trinket.name, bear.name, idol.name], pay: true });
    g.passAll();
    g.expect.zone(trinket.name, 'graveyard', { seat: 1 });
    g.expect.zone(bear.name, 'graveyard', { seat: 1 });
    g.expect.zone(idol.name, 'graveyard', { seat: 1 });
    g.expect.zone('Ooze', 'battlefield', { seat: 0 });
    g.expect.pt('Ooze', 8, 8);
    g.expect.invariants();
  });

  test('an indestructible creature is not destroyed, so its mana value is not counted (3 + 0 = 3)', () => {
    const g = board(5);
    g.act(0).cast(slime.name, { targets: [trinket.name, stone.name], pay: true });
    g.passAll();
    g.expect.zone(stone.name, 'battlefield', { seat: 1 });
    g.expect.zone(trinket.name, 'graveyard', { seat: 1 });
    g.expect.pt('Ooze', 3, 3);
  });

  test('no target at all: nothing is destroyed, the Ooze is 0/0 and does not stay (CR 704.5f)', () => {
    const g = board(5);
    g.act(0).cast(slime.name, { targets: [], pay: true });
    g.passAll();
    g.expect.noObject('Ooze', { zone: 'battlefield' });
    g.expect.invariants();
  });
});

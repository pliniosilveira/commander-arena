// Death Toll deck, group D: "When ~ enters, you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness." (CR 701.8, 608.2c, 608.2d,
// 603.10a, 608.2h). The wording is that of Noxious Gearhulk; every card name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Forest', 'Plains', 'Swamp'] as const;

const hulk = parsed(
  'SYNTHETIC Parsed Gearhulk',
  'Artifact Creature — Construct',
  'When ~ enters, you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness.',
  { manaCost: '{B}', power: '5', toughness: '4', colors: ['B'] },
);
const wall = parsed('SYNTHETIC Parsed Wall', 'Creature — Wall', 'Defender', {
  manaCost: '{1}{W}',
  power: '0',
  toughness: '6',
  colors: ['W'],
});
const stone = parsed('SYNTHETIC Parsed Stone', 'Creature — Golem', 'Indestructible', {
  manaCost: '{3}',
  power: '1',
  toughness: '5',
});
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});

const board = () =>
  scenario()
    .define(hulk)
    .define(wall)
    .define(stone)
    .define(bear)
    .seat(0)
    .life(10)
    .library(...FILLER)
    .hand(hulk.name)
    .battlefield('Swamp')
    .battlefield(bear.name)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .battlefield(wall.name)
    .battlefield(stone.name)
    .at('precombatMain', { active: 0 })
    .build();

describe('"you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness"', () => {
  test('accepted: the creature is destroyed and you gain its toughness (CR 608.2h: as it last existed on the battlefield)', () => {
    const g = board();
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(wall.name);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(wall.name, 'graveyard', { seat: 1 });
    g.expect.life(0, 16);
    g.expect.life(1, 20);
    g.expect.invariants();
  });

  test('your own creature may be the target: it is destroyed and you gain its toughness', () => {
    const g = board();
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(bear.name);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(bear.name, 'graveyard', { seat: 0 });
    g.expect.life(0, 12);
  });

  test('declined: nothing is destroyed and no life is gained', () => {
    const g = board();
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(wall.name);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(wall.name, 'battlefield', { seat: 1 });
    g.expect.life(0, 10);
    g.expect.invariants();
  });

  test('an indestructible creature is not destroyed, so no life is gained (ruling 2016-09-20)', () => {
    const g = board();
    g.act(0).cast(hulk.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(stone.name);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(stone.name, 'battlefield', { seat: 1 });
    g.expect.life(0, 10);
    g.expect.invariants();
  });
});

// Death Toll deck, group D: "Choose one. If ~ was kicked, choose any number instead." with the modes "Target player gains X life, where X is the greatest power among creatures they control."
// (CR 700.2, 700.2a, 702.33a, 608.2c, 109.4). The wording is that of Inscription of Abundance; every card name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const inscription = parsed(
  'SYNTHETIC Parsed Inscription',
  'Instant',
  "Kicker {2}{G}\nChoose one. If ~ was kicked, choose any number instead.\n• Put two +1/+1 counters on target creature.\n• Target player gains X life, where X is the greatest power among creatures they control.\n• Target creature you control fights target creature you don't control.",
  { manaCost: '{1}{G}', colors: ['G'] },
);
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const ox = parsed('SYNTHETIC Parsed Ox', 'Creature — Ox', 'Vigilance', {
  manaCost: '{2}{G}',
  power: '3',
  toughness: '3',
  colors: ['G'],
});
const wall = parsed('SYNTHETIC Parsed Wall', 'Creature — Wall', 'Defender', {
  manaCost: '{1}{W}',
  power: '5',
  toughness: '6',
  colors: ['W'],
});

const board = () =>
  scenario()
    .define(inscription)
    .define(bear)
    .define(ox)
    .define(wall)
    .seat(0)
    .life(10)
    .library(...FILLER)
    .hand(inscription.name)
    .battlefield('Forest', { count: 5 })
    .battlefield(bear.name)
    .battlefield(ox.name)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .battlefield(wall.name)
    .at('precombatMain', { active: 0 })
    .build();

describe('the engine reads "choose one, or any number if kicked" as the widened choice of the kicked spell', () => {
  test('the lowering: one mode, widened to all three while the spell is kicked (CR 700.2)', () => {
    const spell = inscription.faces[0]?.spell;
    expect(spell?.modes).toHaveLength(3);
    expect(spell?.chooseModes).toMatchObject({ min: 1, max: 1, maxIf: { max: 3 } });
  });

  test('the kicker is announced before the modes, as the number of modes depends on it (CR 601.2b, 702.33a)', () => {
    const g = board();
    const cast = g.act(0).cast(inscription.name);
    expect(cast.stage).toBe('kicker');
    cast.kicker(false);
    expect(cast.stage).toBe('modes');
    cast.modes(1);
    expect(cast.stage).toBe('targets');
  });

  test('not kicked: only one mode may be chosen', () => {
    const g = board();
    const cast = g.act(0).cast(inscription.name).kicker(false);
    expect(() => cast.modes(0, 1)).toThrow();
  });

  test('not kicked: one mode, the life mode reads the greatest power among the creatures of the player it targets', () => {
    const g = board();
    g.act(0)
      .cast(inscription.name)
      .kicker(false)
      .modes(1)
      .targets([{ player: 0 }])
      .pay();
    g.passAll();
    g.expect.life(0, 13);
    g.expect.invariants();
  });

  test('not kicked: the opponent gains the greatest power among the creatures they control', () => {
    const g = board();
    g.act(0)
      .cast(inscription.name)
      .kicker(false)
      .modes(1)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.life(1, 25);
    g.expect.life(0, 10);
  });

  test('kicked: all three modes in printed order, so the life mode sees the counters of the first (ruling 2020-09-25)', () => {
    const g = board();
    g.act(0)
      .cast(inscription.name)
      .kicker(true)
      .modes(0, 1, 2)
      .targets([bear.name, { player: 0 }, ox.name, wall.name])
      .pay();
    g.passAll();
    // The Bear is a 4/4 after the counters, so the greatest power among your creatures is 4 as the second mode resolves.
    g.expect.life(0, 14);
    g.expect.pt(bear.name, 4, 4);
    // The Ox (3 power) fights the Wall (5/6): the Ox is destroyed, the Wall has 3 damage.
    g.expect.zone(ox.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

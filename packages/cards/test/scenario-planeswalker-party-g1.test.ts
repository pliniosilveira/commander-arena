// Planeswalker Party deck (issue 132), group 1: Urza's Ruinous Blast, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 205.4 (legendary is a supertype: the sorcery exiles the nonland permanents that do not have it), CR 305.1 (lands are not exiled), CR 701.13a (exile), CR 611.2c, and
// "Legendary Sorcery" (CR 205.4e: it may be cast only while its controller controls a legendary creature or planeswalker).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BLAST = real("Urza's Ruinous Blast");
const BEAR = parsed('SYNTHETIC Plain Bear', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const KING = parsed('SYNTHETIC Legend Bear', 'Legendary Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const ROCK = parsed('SYNTHETIC Plain Rock', 'Artifact', '', { manaCost: '{1}' });
const FILLER = Array.from({ length: 10 }, () => 'Plains');

describe("Urza's Ruinous Blast", () => {
  const build = (withLegend: boolean) =>
    scenario({ seats: 3 })
      .define(BLAST)
      .define(BEAR)
      .define(KING)
      .define(ROCK)
      .seat(0)
      .library(...FILLER)
      .battlefield(...(withLegend ? [KING.name] : []), BEAR.name, ROCK.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .hand(BLAST.name)
      .seat(1)
      .library(...FILLER)
      .battlefield(KING.name, BEAR.name, ROCK.name, 'Plains')
      .seat(2)
      .library(...FILLER)
      .battlefield(BEAR.name, 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('exiles every nonland permanent that is not legendary, of every player, and leaves lands and legends', () => {
    const g = build(true);
    g.act(0).cast(BLAST.name, { pay: true });
    g.passAll();
    g.expect.zone(BEAR.name, 'exile');
    g.expect.zone(ROCK.name, 'exile');
    g.expect.zone(KING.name, 'battlefield');
    g.expect.zone('Plains', 'battlefield');
  });

  test('can be cast with a legendary creature (the legal-actions side of the restriction)', () => {
    const g = build(true);
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(true);
  });

  test('cannot be cast without a legendary creature or planeswalker (CR 205.4e)', () => {
    const g = build(false);
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });
});

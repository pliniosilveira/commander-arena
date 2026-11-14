// Stage P46 (D-198): a legendary card named "<Given name> <Family name>" is "<Given name>" in its own Oracle text ("When Lobelia enters"),
// so the first word of such a name is a self reference (`~`) once normalized. The names and lines below are the real Oracle text of the
// owner's Korvold deck where it is quoted; the near misses are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { normalizeOracleText, selfNames } from '../src/convert/parser/normalize';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const LOBELIA_TEXT =
  "Flash\nMenace\nWhen Lobelia enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.";

describe('the given name of a legendary name (stage P46)', () => {
  test('Lobelia Sackville-Baggins is also "Lobelia"', () => {
    expect(selfNames({ name: 'Lobelia Sackville-Baggins', legendary: true })).toEqual([
      'Lobelia Sackville-Baggins',
      'Lobelia',
    ]);
    expect(
      normalizeOracleText(LOBELIA_TEXT, { name: 'Lobelia Sackville-Baggins', legendary: true }),
    ).toContain('When ~ enters, exile target creature card');
  });

  test('the real card reads completely and is supported', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'Lobelia Sackville-Baggins',
        typeLine: 'Legendary Creature — Halfling Citizen',
        manaCost: '{2}{B}',
        oracleText: LOBELIA_TEXT,
        power: '2',
        toughness: '3',
        colors: ['B'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('only a legendary card shortens its name this way', () => {
    expect(selfNames({ name: 'Lobelia Sackville-Baggins', legendary: false })).toEqual([
      'Lobelia Sackville-Baggins',
    ]);
  });

  test('a comma or "the" still decides first', () => {
    expect(selfNames({ name: 'Korvold, Fae-Cursed King', legendary: true })).toEqual([
      'Korvold, Fae-Cursed King',
      'Korvold',
    ]);
    expect(selfNames({ name: 'Rhonas the Indomitable', legendary: true })).toEqual([
      'Rhonas the Indomitable',
      'Rhonas',
    ]);
  });

  test('a first word that is a type of permanent, a possessive or a single word is not a given name', () => {
    expect(selfNames({ name: 'Goblin Chieftain', legendary: true })).toEqual(['Goblin Chieftain']);
    expect(selfNames({ name: 'Mountain Dwellers', legendary: true })).toEqual([
      'Mountain Dwellers',
    ]);
    expect(selfNames({ name: "Urza's Saga", legendary: true })).toEqual(["Urza's Saga"]);
    expect(selfNames({ name: 'Lobelia', legendary: true })).toEqual(['Lobelia']);
  });

  test('the word is replaced as a whole word only', () => {
    const options = { name: 'Lobelia Sackville-Baggins', legendary: true };
    expect(normalizeOracleText('Lobelia deals 2 damage to Lobeliana.', options)).toBe(
      '~ deals 2 damage to Lobeliana.',
    );
  });
});

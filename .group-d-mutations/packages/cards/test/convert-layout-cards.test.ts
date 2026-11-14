// Whole-card imports of every layout (stage P7b): SYNTHETIC Scryfall-shaped stored cards go through
// `importCard` with no override, and the definitions are compared with the engine's own SYNTHETIC
// multi-face fixtures (src/cards/fixtures/synthetic-layouts.ts) wherever the shapes match. The
// fixtures' `oracleText` is invented prose, so it is taken from the stored face; everything else
// (name, layout, faces, colours, mana costs, types, abilities, spell, colour identity) must be equal.
import { type CardDefinition, SYNTHETIC_CARDS } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { importCard, type StoredCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticFace } from './convert-helpers';
import { creature, instant, multi } from './convert-layout-helpers';

const land = (name: string, oracleText: string) =>
  syntheticFace({ name, manaCost: '', typeLine: 'Land', oracleText });

const CARDS: readonly { readonly stored: StoredCard; readonly fixture: string }[] = [
  {
    stored: named(
      multi(
        'split',
        [
          instant('Singe', 'Singe deals 2 damage to target creature.'),
          instant('Mend', 'You gain 4 life.', { manaCost: '{1}{W}', colors: ['W'] }),
        ],
        ['W', 'R'],
      ),
    ),
    fixture: 'SYNTHETIC Singe // Mend',
  },
  {
    stored: named(
      multi(
        'split',
        [
          instant('Study', 'Draw two cards.', {
            manaCost: '{1}{U}',
            typeLine: 'Sorcery',
            colors: ['U'],
          }),
          instant('Zap', 'Zap deals 1 damage to each opponent.'),
        ],
        ['U', 'R'],
      ),
    ),
    fixture: 'SYNTHETIC Study // Zap',
  },
  {
    stored: named(
      multi(
        'adventure',
        [
          creature('Brawler Bear', { oracleText: '' }),
          instant('Chop', 'Chop deals 2 damage to target creature.', {
            typeLine: 'Instant — Adventure',
          }),
        ],
        ['R', 'G'],
      ),
    ),
    fixture: 'SYNTHETIC Brawler Bear // Chop',
  },
  {
    stored: named(
      multi(
        'adventure',
        [
          creature('Wise Owl', {
            manaCost: '{2}{U}',
            typeLine: 'Creature — Bird',
            power: '1',
            toughness: '1',
            colors: ['U'],
            oracleText: 'Flying',
          }),
          instant('Peek', 'Draw a card.', {
            manaCost: '{U}',
            typeLine: 'Sorcery — Adventure',
            colors: ['U'],
          }),
        ],
        ['U'],
      ),
    ),
    fixture: 'SYNTHETIC Wise Owl // Peek',
  },
  {
    stored: named(
      multi(
        'modal_dfc',
        [
          creature('Ridge Drake', {
            manaCost: '{2}{R}',
            typeLine: 'Creature — Dragon',
            power: '3',
            toughness: '2',
            colors: ['R'],
          }),
          land('Ridge Pass', '{T}: Add {R}.'),
        ],
        ['R'],
      ),
    ),
    fixture: 'SYNTHETIC Ridge Drake // Ridge Pass',
  },
  {
    stored: named(
      multi(
        'modal_dfc',
        [
          instant('Zeal Charm', 'You gain 3 life.', {
            manaCost: '{1}{B}',
            typeLine: 'Sorcery',
            colors: ['B'],
          }),
          land(
            'Shock Pass',
            "As Shock Pass enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {B}.",
          ),
        ],
        ['B'],
      ),
    ),
    fixture: 'SYNTHETIC Zeal Charm // Shock Pass',
  },
  {
    stored: named(
      multi(
        'modal_dfc',
        [
          creature('Twin Knight', {
            manaCost: '{1}{W}',
            typeLine: 'Creature — Knight',
            power: '2',
            toughness: '1',
            colors: ['W'],
            oracleText: 'Vigilance',
          }),
          creature('Twin Wall', {
            manaCost: '{2}{W}{W}',
            typeLine: 'Creature — Wall',
            power: '1',
            toughness: '5',
            colors: ['W'],
            oracleText: 'Defender',
          }),
        ],
        ['W'],
      ),
    ),
    fixture: 'SYNTHETIC Twin Knight // Twin Wall',
  },
  {
    stored: named(
      multi(
        'transform',
        [
          creature('Moon Cub', {
            typeLine: 'Creature — Wolf',
            oracleText: 'At the beginning of your upkeep, transform Moon Cub.',
          }),
          creature('Moon Beast', {
            manaCost: '',
            typeLine: 'Creature — Wolf Werewolf',
            power: '4',
            toughness: '4',
            oracleText: 'Trample\nAt the beginning of your upkeep, transform Moon Beast.',
          }),
        ],
        ['G'],
      ),
    ),
    fixture: 'SYNTHETIC Moon Cub // Moon Beast',
  },
  {
    stored: named(
      multi(
        'transform',
        [
          creature('Squire', {
            manaCost: '{W}',
            typeLine: 'Creature — Human',
            power: '1',
            toughness: '1',
            colors: ['W'],
            oracleText: '{1}: Transform Squire.',
          }),
          creature('Grown Knight', {
            manaCost: '',
            typeLine: 'Creature — Human Knight',
            power: '3',
            toughness: '3',
            colors: ['W'],
            oracleText: 'First strike\n{2}: Transform Grown Knight.',
          }),
        ],
        ['W'],
      ),
    ),
    fixture: 'SYNTHETIC Squire // Grown Knight',
  },
];

function fixtureNamed(name: string): CardDefinition {
  const def = SYNTHETIC_CARDS[name];
  if (def === undefined) throw new Error(`no synthetic card named ${name}`);
  return def;
}

/** The fixtures are named "SYNTHETIC A // B": the card name gets the prefix, the faces do not. */
function named(card: StoredCard): StoredCard {
  return { ...card, name: `SYNTHETIC ${card.name}` };
}

describe('a card of every layout imports as supported and equals the engine fixture', () => {
  test.each(CARDS.map((c) => [c.fixture, c] as const))('%s', (_name, { stored, fixture }) => {
    const imported = importCard(stored, undefined, NO_OVERRIDES);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.source).toBe('parser');
    const expected = fixtureNamed(fixture);
    expect(imported.definition).toEqual({
      ...expected,
      oracleId: stored.oracleId,
      faces: expected.faces.map((face, i) => ({
        ...face,
        oracleText: stored.faces[i]?.oracleText ?? '',
      })),
    });
  });

  test('all four layouts are among them', () => {
    expect(new Set(CARDS.map((c) => fixtureNamed(c.fixture).layout))).toEqual(
      new Set(['split', 'adventure', 'modal_dfc', 'transform']),
    );
  });
});

describe('a face the grammar cannot read blocks the whole card, and says which face', () => {
  test.each([
    ['split', 1],
    ['adventure', 1],
    ['modal_dfc', 1],
    ['transform', 1],
  ] as const)('%s: face %i', (layout, face) => {
    const faces = [creature('Front'), creature('Back', { manaCost: '' })];
    if (layout === 'adventure') {
      faces[1] = instant('Back', 'Populate.', { typeLine: 'Instant — Adventure' });
    } else if (layout === 'split') {
      faces[0] = instant('Front', 'You gain 1 life.');
      faces[1] = instant('Back', 'Populate.');
    } else {
      faces[1] = creature('Back', { manaCost: '', oracleText: 'Populate.' });
    }
    const imported = importCard(multi(layout, faces), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.face)).toEqual([face]);
  });
});

// Stage P97 (D-274): Miracle. "Miracle {X}{W}{W}" is the real line of Entreat the Angels (golden corpus, acceptance card of issue 5) and
// "Miracle {M}" has 14 cards in reports/templates.json (example "Miracle {1}{R}"). It lowers to an entry of the face's `alternativeCosts`, not to
// an ability: the reveal as the card is drawn, its trigger and the cast from the hand are the engine's (`rules/miracle.ts`). Every other line
// is SYNTHETIC: the costs, the near misses and the parenthesis standing for reminder text.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard, syntheticFace } from './convert-helpers';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const ENTREAT = 'Create X 4/4 white Angel creature tokens with flying.\nMiracle {X}{W}{W}';
const REMINDER =
  "(You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)";

const miracle = (...symbols: string[]): AlternativeCost => ({
  kind: 'miracle',
  cost: [{ kind: 'mana', symbols }],
});
const alternatives = (text: string, type: FaceType = 'sorcery') =>
  readAll(text, type).alternativeCosts;

describe('keyword.miracle: "Miracle {X}{W}{W}" (CR 702.94a; backlog: 14 cards)', () => {
  test('the real line of Entreat the Angels lowers to a miracle entry with its {X}, not to an ability', () => {
    const parsed = readAll('Miracle {X}{W}{W}', 'sorcery');
    expect(parsed.alternativeCosts).toEqual([miracle('X', 'W', 'W')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('the whole text of the card reads: the token line and the keyword, the X of the spell being the announced one', () => {
    const parsed = readAll(ENTREAT, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([miracle('X', 'W', 'W')]);
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'createToken',
      count: { kind: 'x' },
      token: { kind: 'custom', definition: expect.objectContaining({ name: 'Angel', power: 4 }) },
    });
    expect(parsed.spell?.x).toBe(true);
  });

  test('the real template example, "Miracle {1}{R}", has no X', () => {
    expect(alternatives('Miracle {1}{R}')).toEqual([miracle('1', 'R')]);
  });

  test.each([
    ['Miracle {W}', ['W']],
    ['Miracle {X}{R}', ['X', 'R']],
    ['Miracle {X}{X}{G}', ['X', 'X', 'G']],
    ['Miracle {2}{U}', ['2', 'U']],
    ['miracle {3}{B}{B}', ['3', 'B', 'B']],
  ])('"%s" keeps the cost symbol by symbol (SYNTHETIC)', (text, symbols) => {
    expect(alternatives(text)).toEqual([miracle(...symbols)]);
  });

  test('on a spell or a permanent, in either order with the other text (SYNTHETIC spell text)', () => {
    const first = readAll('Miracle {R}\nDraw a card.', 'instant');
    expect(first.alternativeCosts).toEqual([miracle('R')]);
    const last = readAll('Draw a card.\nMiracle {R}', 'instant');
    expect(last.alternativeCosts).toEqual([miracle('R')]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
    expect(alternatives('Miracle {G}', 'creature')).toEqual([miracle('G')]);
  });

  test('the engine decides which card types may have it: the line is read on any face', () => {
    expect(alternatives('Miracle {W}', 'artifact')).toEqual([miracle('W')]);
  });

  test('the reminder text of the real card is dropped by the normalizer', () => {
    const parsed = readAll(`Miracle {X}{W}{W} ${REMINDER}`, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([miracle('X', 'W', 'W')]);
    expect(parsed.lines).toEqual(['Miracle {X}{W}{W}']);
  });

  test.each([
    ['Miracle', 'a miracle with no cost'],
    ['Miracle {W/U}', 'a hybrid symbol'],
    ['Miracle {X}{W/U}', 'a hybrid symbol with an X'],
    ['Miracle {X/R}', 'an X in a hybrid symbol'],
    ['Miracle {G/P}', 'a Phyrexian symbol'],
    ['Miracle {S}', 'a snow symbol'],
    ['Miracle—Pay 2 life.', 'a cost that is not mana'],
    ['Miracle {1}{W}.', 'a full stop after the cost'],
    ['Miracle {1}{W}, miracle {W}', 'two costs on one line'],
    ['Miracle {1}{W}, flying', 'a keyword list'],
    ['Flying, miracle {1}{W}', 'a keyword list, miracle second'],
    ['Miracle {1}{W} {1}', 'a second cost after the first'],
    ['Miracles {1}{W}', 'the plural'],
    ['Miracle {X} {W}', 'a space between the symbols'],
  ])('"%s" is not read (SYNTHETIC: %s)', (text) => {
    expect(dropped(text, 'sorcery').reason).toBeDefined();
  });

  test('the same words with an X are not read for the other named alternative costs (SYNTHETIC)', () => {
    for (const word of ['Madness', 'Foretell', 'Evoke', 'Dash', 'Overload', 'Spectacle']) {
      expect(dropped(`${word} {X}{W}`, 'sorcery').reason, word).toBeDefined();
    }
  });

  test('the whole card imports as supported, and an {X} in the miracle cost passes the engine check', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Miracle Angels',
        manaCost: '{X}{X}{W}{W}{W}',
        typeLine: 'Sorcery',
        oracleText: ENTREAT,
        colors: ['W'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.alternativeCosts).toEqual([miracle('X', 'W', 'W')]);
  });

  // CR 702.94a: the engine reads the miracle cost of a card's front face only (`miracleCostOf`), so a miracle line on any other face
  // would be accepted and then never offered. An entry the engine would not use is refused, never accepted (AGENTS.md: honesty).
  test.each([
    ['transform', 'Transform'],
    ['modal_dfc', 'Modal DFC'],
    ['split', 'Split'],
  ])(
    'a miracle line on the second face of a %s card is refused, not accepted (SYNTHETIC)',
    (layout) => {
      const front = syntheticCard(
        {
          name: 'SYNTHETIC Front',
          manaCost: '{1}{U}',
          typeLine: 'Sorcery',
          oracleText: 'Draw a card.',
          colors: ['U'],
        },
        { layout, colorIdentity: ['U'] },
      );
      const back = syntheticFace({
        name: 'SYNTHETIC Back',
        manaCost: layout === 'transform' ? '' : '{U}',
        typeLine: 'Sorcery',
        oracleText: 'Draw a card.\nMiracle {U}',
        colors: ['U'],
      });
      const card = { ...front, faces: [...front.faces, back] };
      const imported = parseOnly(card);
      expect(imported.support.status).not.toBe('supported');
      expect(JSON.stringify(imported.support.reasons)).toContain('miracle');
    },
  );

  test('a miracle line on the front face of a two-faced card is still read (SYNTHETIC)', () => {
    const front = syntheticCard(
      {
        name: 'SYNTHETIC Front Miracle',
        manaCost: '{1}{U}',
        typeLine: 'Sorcery',
        oracleText: 'Draw a card.\nMiracle {U}',
        colors: ['U'],
      },
      { layout: 'modal_dfc', colorIdentity: ['U'] },
    );
    const card = {
      ...front,
      faces: [
        ...front.faces,
        syntheticFace({
          name: 'SYNTHETIC Other Side',
          manaCost: '{U}',
          typeLine: 'Sorcery',
          oracleText: 'Draw a card.',
          colors: ['U'],
        }),
      ],
    };
    const imported = parseOnly(card);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.alternativeCosts).toEqual([miracle('U')]);
  });
});

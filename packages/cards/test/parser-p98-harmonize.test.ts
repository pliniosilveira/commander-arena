// Stage P98: Harmonize. "Harmonize {X}{R}{R}" is the real line of Zenith Festival (golden corpus, acceptance card of issue 103). It lowers to an entry of the
// face's `alternativeCosts`, not to an ability: the cast from the graveyard, the optional tap of a creature that reduces the cost by its power and the exile as the
// spell leaves the stack are the engine's (`rules/harmonize.ts`). Every other line is SYNTHETIC: the costs, the near misses and the parenthesis standing for reminder text.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard, syntheticFace } from './convert-helpers';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const REMINDER =
  '(You may cast this card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by an amount of generic mana equal to its power. Then exile this spell.)';

const harmonize = (...symbols: string[]): AlternativeCost => ({
  kind: 'harmonize',
  cost: [{ kind: 'mana', symbols }],
});
const alternatives = (text: string, type: FaceType = 'sorcery') =>
  readAll(text, type).alternativeCosts;

describe('keyword.harmonize: "Harmonize {X}{R}{R}" (CR 702.180a)', () => {
  test('the real line of Zenith Festival lowers to a harmonize entry with its {X}, not to an ability', () => {
    const parsed = readAll('Harmonize {X}{R}{R}', 'sorcery');
    expect(parsed.alternativeCosts).toEqual([harmonize('X', 'R', 'R')]);
    expect(parsed.abilities).toEqual([]);
  });

  test.each([
    ['Harmonize {4}{G}{G}', ['4', 'G', 'G']],
    ['Harmonize {2}{U}', ['2', 'U']],
    ['Harmonize {X}{G}', ['X', 'G']],
    ['Harmonize {X}{X}{B}', ['X', 'X', 'B']],
    ['harmonize {3}{B}', ['3', 'B']],
  ])('"%s" keeps the cost symbol by symbol (SYNTHETIC)', (text, symbols) => {
    expect(alternatives(text)).toEqual([harmonize(...symbols)]);
  });

  test('the reminder text of the real card is dropped by the normalizer', () => {
    const parsed = readAll(`Harmonize {X}{R}{R} ${REMINDER}`, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([harmonize('X', 'R', 'R')]);
    expect(parsed.lines).toEqual(['Harmonize {X}{R}{R}']);
  });

  test('beside the spell text of the card, in either order (SYNTHETIC spell text)', () => {
    const first = readAll('Harmonize {2}{R}\nDraw a card.', 'instant');
    expect(first.alternativeCosts).toEqual([harmonize('2', 'R')]);
    const last = readAll('Draw a card.\nHarmonize {2}{R}', 'instant');
    expect(last.alternativeCosts).toEqual([harmonize('2', 'R')]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
  });

  test.each([
    ['Harmonize', 'a harmonize with no cost'],
    ['Harmonize {W/U}', 'a hybrid symbol'],
    ['Harmonize {X}{W/U}', 'a hybrid symbol with an X'],
    ['Harmonize {G/P}', 'a Phyrexian symbol'],
    ['Harmonize {S}', 'a snow symbol'],
    ['Harmonize—Pay 2 life.', 'a cost that is not mana'],
    ['Harmonize {1}{G}.', 'a full stop after the cost'],
    ['Harmonize {1}{G}, harmonize {G}', 'two costs on one line'],
    ['Harmonize {1}{G}, flying', 'a keyword list'],
    ['Flying, harmonize {1}{G}', 'a keyword list, harmonize second'],
    ['Harmonize {1}{G} {1}', 'a second cost after the first'],
    ['Harmonizes {1}{G}', 'the plural'],
    ['Harmonized {1}{G}', 'the past tense'],
    ['Harmonize {X} {G}', 'a space between the symbols'],
  ])('"%s" is not read (SYNTHETIC: %s)', (text) => {
    expect(dropped(text, 'sorcery').reason).toBeDefined();
  });

  test('the same words with an X are not read for the other named alternative costs (SYNTHETIC)', () => {
    for (const word of ['Madness', 'Foretell', 'Evoke', 'Dash', 'Overload', 'Spectacle']) {
      expect(dropped(`${word} {X}{W}`, 'sorcery').reason, word).toBeDefined();
    }
  });

  test('the whole of Zenith Festival imports as supported with the harmonize cost on its front face', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Festival',
        manaCost: '{X}{R}{R}',
        typeLine: 'Sorcery',
        oracleText: `Exile the top X cards of your library. You may play them until the end of your next turn.\nHarmonize {X}{R}{R} ${REMINDER}`,
        colors: ['R'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.alternativeCosts).toEqual([harmonize('X', 'R', 'R')]);
  });

  // The engine reads the cost of a card's front face only (`castZone`), so a line on another face would be accepted and then never offered: refused instead.
  test('a harmonize line on a permanent, or on a face other than the front, is refused (SYNTHETIC)', () => {
    const creature = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Harmonize Beast',
        manaCost: '{2}{G}',
        typeLine: 'Creature — Beast',
        oracleText: 'Harmonize {2}{G}',
        colors: ['G'],
        power: '2',
        toughness: '2',
      }),
    );
    expect(creature.support.status).not.toBe('supported');
    const front = syntheticCard(
      {
        name: 'SYNTHETIC Front',
        manaCost: '{1}{U}',
        typeLine: 'Sorcery',
        oracleText: 'Draw a card.',
        colors: ['U'],
      },
      { layout: 'modal_dfc', colorIdentity: ['U'] },
    );
    const back = syntheticFace({
      name: 'SYNTHETIC Back',
      manaCost: '{U}',
      typeLine: 'Sorcery',
      oracleText: 'Draw a card.\nHarmonize {U}',
      colors: ['U'],
    });
    const imported = parseOnly({ ...front, faces: [...front.faces, back] });
    expect(imported.support.status).not.toBe('supported');
    expect(JSON.stringify(imported.support.reasons)).toContain('harmonize');
  });
});

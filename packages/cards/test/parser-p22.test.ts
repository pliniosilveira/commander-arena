// Stage P22 (M6): the named alternative costs of the engine (D-117, D-121; ENGINE_VERSION 22). "Overload {M}",
// "Evoke {M}" and "Dash {M}" are keyword lines that are not abilities: each lowers to an entry of the face's
// `alternativeCosts` ({ kind, cost: [mana] }), and the engine owns the text change, the sacrifice, the haste and
// the return. The real lines are those of reports/templates.json and reports/backlog.md (the owner's run):
// "Overload {6}{U}" (Cyclonic Rift, in the golden corpus, with its real reminder text), "Evoke {2}{U}" (Mulldrifter,
// Shriekmaw) and "Dash {1}{R}" (Zurgo Bellstriker, Goblin Heelcutter); the reminder text of Evoke and Dash is not
// in the repository, so a reminder text of those two is SYNTHETIC. Every other line is SYNTHETIC. That the engine
// runs what is lowered is in convert-grammar-engine-p22.test.ts; that a missing engine feature is named is in
// parser-p22-needs.test.ts.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }] as const;
const alt = (kind: 'overload' | 'evoke' | 'dash', ...symbols: string[]): AlternativeCost => ({
  kind,
  cost: [...mana(...symbols)],
});
const alternatives = (text: string, type: FaceType = 'creature') =>
  readAll(text, type).alternativeCosts;

const RIFT_TEXT = "Return target nonland permanent you don't control to its owner's hand.";
const RIFT_REMINDER =
  '(You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")';

describe('keyword.overload: "Overload {6}{U}" (CR 702.96a; backlog: 26 cards)', () => {
  test('the real line lowers to an overload entry, not to an ability', () => {
    const parsed = readAll('Overload {6}{U}', 'instant');
    expect(parsed.alternativeCosts).toEqual([alt('overload', '6', 'U')]);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.spell).toBeNull();
  });

  test('Cyclonic Rift: the spell text and the overload line are two readings of one face', () => {
    const parsed = readAll(`${RIFT_TEXT}\nOverload {6}{U} ${RIFT_REMINDER}`, 'instant');
    expect(parsed.alternativeCosts).toEqual([alt('overload', '6', 'U')]);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
          },
        },
      ],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
    });
  });

  test('the line may come before the spell text, and on a sorcery', () => {
    const parsed = readAll(`Overload {3}{R}\n${RIFT_TEXT}`, 'sorcery');
    expect(parsed.alternativeCosts).toEqual([alt('overload', '3', 'R')]);
    expect(parsed.spell?.targets).toHaveLength(1);
  });

  test.each([
    ['Overload {2}{R}', ['2', 'R']],
    ['Overload {G}', ['G']],
    ['Overload {4}{W}{W}', ['4', 'W', 'W']],
    ['overload {1}{U}', ['1', 'U']],
  ])('"%s" (the cost is kept symbol by symbol)', (text, symbols) => {
    expect(alternatives(text, 'instant')).toEqual([alt('overload', ...symbols)]);
  });

  test('a reminder text in parentheses is dropped (SYNTHETIC wording after the real one)', () => {
    expect(alternatives('Overload {6}{U} (SYNTHETIC reminder.)', 'instant')).toEqual([
      alt('overload', '6', 'U'),
    ]);
  });
});

describe('keyword.evoke: "Evoke {2}{U}" (CR 702.74a; backlog: 30 cards)', () => {
  test('the real line lowers to an evoke entry; the other abilities are read as usual', () => {
    const parsed = readAll('Evoke {2}{U}', 'creature');
    expect(parsed.alternativeCosts).toEqual([alt('evoke', '2', 'U')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('SYNTHETIC: a creature with a keyword and an enters ability beside the line', () => {
    const parsed = readAll(
      'Flying\nWhen ~ enters, draw two cards.\nEvoke {2}{U} (SYNTHETIC reminder.)',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([alt('evoke', '2', 'U')]);
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test.each([
    ['Evoke {1}{B}', ['1', 'B']],
    ['Evoke {R}', ['R']],
    ['evoke {3}{G}{G}', ['3', 'G', 'G']],
  ])('"%s"', (text, symbols) => {
    expect(alternatives(text)).toEqual([alt('evoke', ...symbols)]);
  });

  test('on any face the grammar knows: the engine says whether the card can have it', () => {
    expect(alternatives('Evoke {2}{U}', 'enchantment')).toEqual([alt('evoke', '2', 'U')]);
    expect(alternatives('Evoke {2}{U}', 'artifact')).toEqual([alt('evoke', '2', 'U')]);
  });
});

describe('keyword.dash: "Dash {1}{R}" (CR 702.109a; backlog: 22 cards)', () => {
  test('the real line lowers to a dash entry', () => {
    const parsed = readAll('Dash {1}{R}', 'creature');
    expect(parsed.alternativeCosts).toEqual([alt('dash', '1', 'R')]);
    expect(parsed.abilities).toEqual([]);
  });

  test.each([
    ['Dash {2}{R}{R}', ['2', 'R', 'R']],
    ['Dash {B}', ['B']],
    ['dash {1}{R}', ['1', 'R']],
  ])('"%s"', (text, symbols) => {
    expect(alternatives(text)).toEqual([alt('dash', ...symbols)]);
  });
});

describe('the three kinds together (CR 118.9a: one applies to a spell, a card may list several)', () => {
  test('evoke and dash on one creature', () => {
    expect(alternatives('Evoke {2}{U}\nDash {1}{R}')).toEqual([
      alt('evoke', '2', 'U'),
      alt('dash', '1', 'R'),
    ]);
  });

  test('the order of the lines is the order of the entries', () => {
    expect(alternatives('Dash {1}{R}\nEvoke {2}{U}')).toEqual([
      alt('dash', '1', 'R'),
      alt('evoke', '2', 'U'),
    ]);
  });

  test('all three on one face are read (the engine refuses what the card type cannot have)', () => {
    expect(alternatives('Overload {2}{R}\nEvoke {1}{U}\nDash {R}', 'instant')).toEqual([
      alt('overload', '2', 'R'),
      alt('evoke', '1', 'U'),
      alt('dash', 'R'),
    ]);
  });

  test('a second alternative of the same kind is read; validateCard refuses the face (see the corpus)', () => {
    expect(alternatives('Evoke {2}{U}\nEvoke {1}{B}')).toEqual([
      alt('evoke', '2', 'U'),
      alt('evoke', '1', 'B'),
    ]);
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    [
      'Evoke—Exile a white card from your hand.',
      'the real line of Solitude, Fury, Grief: not a mana cost',
    ],
    ['Evoke—Exile a white card from your hand', 'the same without the period'],
    ['Evoke—Pay 2 life.', 'a cost that is not mana'],
    ['Evoke—{1}{U}, Pay 2 life.', 'mana and life'],
    ['Dash—Pay 3 life.', 'a cost that is not mana'],
    ['Overload—Discard a card.', 'a cost that is not mana'],
    ['Evoke {X}', 'X in the cost'],
    ['Dash {X}{R}', 'X in the cost'],
    ['Overload {X}{U}', 'X in the cost'],
    ['Evoke {W/U}', 'a hybrid cost (the engine pays mana symbols of one color)'],
    ['Dash {R/G}{R/G}', 'a hybrid cost'],
    ['Overload', 'no cost'],
    ['Evoke', 'no cost'],
    ['Dash', 'no cost'],
    ['Evoke {2}{U}.', 'a period after a mana cost (the real line has none)'],
    ['Dash {1}{R}, haste', 'a list: only a line of its own'],
    ['Flying, dash {1}{R}', 'a keyword line may not end with it'],
    ['Evoke {2}{U} and dash {1}{R}', 'two keywords in one line'],
    ['Evoke {2}{U}, dash {1}{R}', 'two keywords in one line'],
    ['Evoke {2}{U} {1}', 'two costs'],
    ['Evoked {2}{U}', 'another word'],
    ['Overloaded {2}{U}', 'another word'],
    ['Dashed {1}{R}', 'another word'],
    ['Blitz {2}{B}', 'D-117 step not built'],
    ['Bestow {3}{W}', 'D-117 step not built'],
  ])('"%s" is not read (%s)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('the dash and evoke words alone on a spell are not spell text either', () => {
    expect(dropped('Dash {1}{R}.', 'instant')).toMatchObject({ reason: 'unrecognised' });
    expect(dropped('Evoke—Exile a white card from your hand.', 'sorcery')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('a line that is not read leaves the face with no entry (never half-executed)', () => {
    const parsed = read('Evoke—Exile a white card from your hand.', 'creature');
    expect(parsed.alternativeCosts).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.unparsed[0]?.stoppedAt).toBe('Evoke—Exile a white card from your hand.');
  });

  test('SYNTHETIC: a line the grammar does not read is reported and the dash line is still read (a card is whole only when every line is)', () => {
    const parsed = read(
      "~ can't block creatures with power 2 or greater. (SYNTHETIC line)\nDash {1}{R}",
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([alt('dash', '1', 'R')]);
  });
});

describe('the reason a card with an alternative cost is unsupported (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({ name: 'SYNTHETIC Alt', typeLine, oracleText, manaCost: '{1}{R}', ...extra }),
    );

  test('an overloaded spell whose text is not read is blamed on the unread line, once', () => {
    const imported = card('Instant', 'SYNTHETIC unread sentence about targets.\nOverload {6}{U}');
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'SYNTHETIC unread sentence about targets.',
    ]);
    expect(imported.support.reasons.join('\n')).not.toContain('overload');
  });

  test('a modal overload spell is blamed on the engine, which names the reason', () => {
    const imported = card(
      'Instant',
      'Choose one —\n• Draw a card.\n• You gain 2 life.\nOverload {3}{U}',
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      expect.stringContaining('faces[0].alternativeCosts[0]: overload needs spell text'),
    ]);
  });

  test('Evoke with a cost that is not mana leaves the card unsupported and the line unread', () => {
    const imported = card('Creature — Test', 'Evoke—Exile a white card from your hand.', {
      power: '1',
      toughness: '1',
    });
    expect(imported.support.status).toBe('unsupported');
    expect(imported.definition.faces[0]?.alternativeCosts).toBeUndefined();
    expect(imported.support.unparsed).toHaveLength(1);
  });

  test('two evoke lines: the card is unsupported and the reason says why', () => {
    const imported = card('Creature — Test', 'Evoke {2}{U}\nEvoke {1}{B}', {
      power: '1',
      toughness: '1',
    });
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      expect.stringContaining('more than one alternative cost of kind evoke'),
    ]);
  });
});

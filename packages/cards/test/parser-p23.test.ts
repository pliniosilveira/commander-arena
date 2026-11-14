// Stage P23 (M6): the named alternative costs of the second engine slice (D-117, D-124; ENGINE_VERSION 23).
// "Spectacle {M}" and "Escape—{M}, Exile N other cards from your graveyard." are keyword lines that lower to an
// entry of the face's `alternativeCosts`; "Unearth {M}" lowers to the keyword of the engine (which expands it
// into the activated ability that works from the graveyard); "When ~ enters, sacrifice it unless it escaped."
// lowers to the triggered ability with `interveningIf: not escaped`. The real lines are those of
// reports/templates.json ("Spectacle {R}", "Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.",
// "Unearth {R}", "When ~ enters, sacrifice it unless it escaped."; the shapes file keeps reminder text out, so
// none is quoted). Every other line is SYNTHETIC, among them the singular "Exile one other card from your
// graveyard." (the repository holds no real line with a count of one). That the engine runs what is lowered is
// in convert-grammar-engine-p23.test.ts; that a missing engine feature is named is in parser-p23-needs.test.ts.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll, THIS } from './parser-p5-helpers';

const mana = (...symbols: string[]) => [{ kind: 'mana', symbols }] as const;
const spectacle = (...symbols: string[]): AlternativeCost => ({
  kind: 'spectacle',
  cost: [...mana(...symbols)],
});
const escapeCost = (exile: number, ...symbols: string[]): AlternativeCost => ({
  kind: 'escape',
  cost: [...mana(...symbols)],
  exile,
});
const alternatives = (text: string, type: FaceType = 'creature') =>
  readAll(text, type).alternativeCosts;

const UNLESS_ESCAPED = 'When ~ enters, sacrifice it unless it escaped.';
const ESCAPE_URO = 'Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.';

describe('keyword.spectacle: "Spectacle {R}" (CR 702.137a; backlog: 11 cards)', () => {
  test('the real line lowers to a spectacle entry, not to an ability', () => {
    const parsed = readAll('Spectacle {R}', 'creature');
    expect(parsed.alternativeCosts).toEqual([spectacle('R')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('on a sorcery with its spell text, in either order (SYNTHETIC spell text)', () => {
    const first = readAll('Spectacle {1}{R}\nDraw a card.', 'sorcery');
    expect(first.alternativeCosts).toEqual([spectacle('1', 'R')]);
    expect(first.spell).not.toBeNull();
    const last = readAll('Draw a card.\nSpectacle {1}{R}', 'sorcery');
    expect(last.alternativeCosts).toEqual([spectacle('1', 'R')]);
    expect(last.spell?.effect).toEqual(first.spell?.effect);
  });

  test.each([
    ['Spectacle {1}{R}', ['1', 'R']],
    ['Spectacle {B}', ['B']],
    ['Spectacle {2}{B}{B}', ['2', 'B', 'B']],
    ['spectacle {R}', ['R']],
  ])('"%s" (the cost is kept symbol by symbol)', (text, symbols) => {
    expect(alternatives(text)).toEqual([spectacle(...symbols)]);
  });

  test('the engine decides which card types may have it: the line is read on any face', () => {
    expect(alternatives('Spectacle {R}', 'instant')).toEqual([spectacle('R')]);
    expect(alternatives('Spectacle {R}', 'artifact')).toEqual([spectacle('R')]);
  });

  test('a reminder text in parentheses is dropped (SYNTHETIC wording)', () => {
    expect(alternatives('Spectacle {R} (SYNTHETIC reminder.)')).toEqual([spectacle('R')]);
  });

  test('beside a Dash line (P22): one entry per line, in order', () => {
    expect(alternatives('Dash {1}{R}\nSpectacle {R}')).toEqual([
      { kind: 'dash', cost: [...mana('1', 'R')] },
      spectacle('R'),
    ]);
  });
});

describe('keyword.escape: "Escape—{M}, Exile N other cards from your graveyard." (CR 702.138a; backlog: 30 cards)', () => {
  test('the real line (Uro) lowers to an escape entry with the number of cards', () => {
    const parsed = readAll(ESCAPE_URO, 'creature');
    expect(parsed.alternativeCosts).toEqual([escapeCost(5, 'G', 'G', 'U', 'U')]);
    expect(parsed.abilities).toEqual([]);
  });

  test.each([
    ['Escape—{B}{B}, Exile three other cards from your graveyard.', 3, ['B', 'B']],
    ['Escape—{3}{R}, Exile two other cards from your graveyard.', 2, ['3', 'R']],
    ['Escape—{R}{R}, Exile eight other cards from your graveyard.', 8, ['R', 'R']],
    ['Escape—{W}, Exile nine other cards from your graveyard.', 9, ['W']],
    ['escape—{1}{G}, exile four other cards from your graveyard.', 4, ['1', 'G']],
    ['Escape—{2}{B}, Exile one other card from your graveyard.', 1, ['2', 'B']],
  ])('"%s" (the number words are one to nine; SYNTHETIC but for the shape)', (text, n, symbols) => {
    expect(alternatives(text)).toEqual([escapeCost(n, ...symbols)]);
  });

  test('a reminder text in parentheses is dropped (SYNTHETIC wording)', () => {
    expect(alternatives(`${ESCAPE_URO} (SYNTHETIC reminder.)`)).toEqual([
      escapeCost(5, 'G', 'G', 'U', 'U'),
    ]);
  });

  test('the line beside the other abilities of the card (SYNTHETIC ability text)', () => {
    const parsed = readAll(`Flying\n${ESCAPE_URO}`, 'creature');
    expect(parsed.alternativeCosts).toEqual([escapeCost(5, 'G', 'G', 'U', 'U')]);
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['keyword']);
  });

  test('on an instant or sorcery with spell text (SYNTHETIC)', () => {
    const parsed = readAll(
      'Draw a card.\nEscape—{B}{B}, Exile two other cards from your graveyard.',
      'sorcery',
    );
    expect(parsed.alternativeCosts).toEqual([escapeCost(2, 'B', 'B')]);
    expect(parsed.spell).not.toBeNull();
  });
});

describe('keyword.unearth: "Unearth {R}" (CR 702.84a; backlog: 55 cards)', () => {
  test('the real line lowers to the keyword, which the engine expands; it is not a face field', () => {
    const parsed = readAll('Unearth {R}', 'creature');
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'unearth', cost: [...mana('R')] } },
    ]);
    expect(parsed.alternativeCosts).toEqual([]);
  });

  test.each([
    ['Unearth {2}{B}', ['2', 'B']],
    ['Unearth {1}{R}{R}', ['1', 'R', 'R']],
    ['unearth {W}', ['W']],
  ])('"%s"', (text, symbols) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'unearth', cost: [...mana(...symbols)] } },
    ]);
  });

  test('beside other keywords and abilities of a creature (SYNTHETIC)', () => {
    const parsed = readAll('Flying\nWhen ~ dies, draw a card.\nUnearth {2}{B}', 'creature');
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered', 'keyword']);
  });

  test('a reminder text in parentheses is dropped (SYNTHETIC wording)', () => {
    expect(readAll('Unearth {R} (SYNTHETIC reminder.)', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'unearth', cost: [...mana('R')] } },
    ]);
  });
});

describe('"When ~ enters, sacrifice it unless it escaped." (CR 702.138b; backlog: 3 cards)', () => {
  const triggered = {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: THIS },
    effect: { kind: 'sacrifice', objects: THIS },
    interveningIf: { kind: 'not', term: { kind: 'escaped' } },
  };

  test('the real line lowers to an enters trigger with an intervening "not escaped"', () => {
    expect(readAll(UNLESS_ESCAPED, 'creature').abilities).toEqual([triggered]);
  });

  test('the whole text of an escape creature (Uro-shaped, SYNTHETIC but for the real lines)', () => {
    const parsed = readAll(`${UNLESS_ESCAPED}\n${ESCAPE_URO}`, 'creature');
    expect(parsed.abilities).toEqual([triggered]);
    expect(parsed.alternativeCosts).toEqual([escapeCost(5, 'G', 'G', 'U', 'U')]);
  });

  test('the same lines in the other order read the same', () => {
    const parsed = readAll(`${ESCAPE_URO}\n${UNLESS_ESCAPED}`, 'creature');
    expect(parsed.abilities).toEqual([triggered]);
    expect(parsed.alternativeCosts).toHaveLength(1);
  });

  test('"sacrifice it" is the permanent itself only where the trigger is about the permanent', () => {
    // "it" is bound to `~` in an enters trigger of `~`: the engine sacrifices `this`.
    expect(readAll('When ~ enters, sacrifice it.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: { kind: 'sacrifice', objects: THIS },
      },
    ]);
    // "it" bound to a target is not the permanent: its controller cannot be said to control a target (CR 701.21a).
    expect(dropped('Destroy target creature. Sacrifice it.', 'instant')).toMatchObject({
      reason: 'notRunnable',
    });
    // About another creature's entering it is that creature, which no lowering sacrifices.
    expect(read('Whenever another creature enters, sacrifice it.', 'creature').abilities).toEqual(
      [],
    );
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    ['Spectacle', 'no cost'],
    ['Spectacle {X}{R}', 'X in the cost'],
    ['Spectacle {R/W}', 'a hybrid cost'],
    ['Spectacle—Pay 2 life.', 'a cost that is not mana'],
    ['Spectacle {R}.', 'a period after a mana cost (the real line has none)'],
    ['Spectacle {R}, spectacle {1}', 'a list: only a line of its own'],
    ['Haste, spectacle {R}', 'a keyword line may not end with it'],
    ['Spectacle {R} and haste', 'two keywords in one line'],
    ['Spectacled {R}', 'another word'],
    ['Unearth', 'no cost'],
    ['Unearth {X}', 'X in the cost'],
    ['Unearth {B/R}', 'a hybrid cost'],
    ['Unearth—Pay 2 life.', 'a cost that is not mana'],
    ['Unearth {R}.', 'a period after a mana cost'],
    ['Flying, unearth {R}', 'a keyword line may not end with it'],
    ['Unearth {R}, haste', 'a list'],
    ['Unearth {R} {1}', 'two costs'],
    ['Unearthed {R}', 'another word'],
    ['Escape', 'no cost'],
    ['Escape—{B}{B}', 'no cards to exile'],
    ['Escape—{B}{B}, Exile three other cards from your graveyard', 'no period'],
    ['Escape—{B}{B}, Exile 3 other cards from your graveyard.', 'a digit, not the number word'],
    ['Escape—{X}{B}, Exile three other cards from your graveyard.', 'X in the cost (CR 107.3b)'],
    ['Escape—{B/G}, Exile three other cards from your graveyard.', 'a hybrid cost'],
    ['Escape—Pay 3 life, Exile three other cards from your graveyard.', 'a cost that is not mana'],
    [
      'Escape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.',
      'another component of the cost',
    ],
    [
      'Escape—{B}{B}, Sacrifice a creature, Exile three other cards from your graveyard.',
      'another component of the cost',
    ],
    ['Escape—{B}{B}, Discard a card.', 'a cost that does not exile cards of the graveyard'],
    ['Escape—{B}{B}, Exile ten other cards from your graveyard.', 'a count above nine'],
    ['Escape—{B}{B}, Exile zero other cards from your graveyard.', 'zero'],
    ['Escape—{B}{B}, Exile X other cards from your graveyard.', 'X cards'],
    ['Escape—{B}{B}, Exile a card from your graveyard.', 'no "other"'],
    ['Escape—{B}{B}, Exile three cards from your graveyard.', 'no "other"'],
    ['Escape—{B}{B}, Exile three other cards from a graveyard.', 'not your graveyard'],
    ['Escape—{B}{B}, Exile three other creature cards from your graveyard.', 'a kind of card'],
    ['Escape—{B}{B}, Exile one other cards from your graveyard.', 'number and noun disagree'],
    ['Escape—{B}{B}, Exile three other card from your graveyard.', 'number and noun disagree'],
    ['Escape—{B}{B}, Exile three other cards from your graveyard. Flying', 'text after the line'],
    ['Escaped—{B}{B}, Exile three other cards from your graveyard.', 'another word'],
  ])('"%s" is not read (%s)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    ['When ~ enters, sacrifice it unless it escaped'],
    ['When ~ enters, sacrifice it unless ~ escaped.'],
    ['When ~ enters, sacrifice it unless you escaped.'],
    ['When ~ enters, sacrifice it unless it was escaped.'],
    ['When ~ enters, sacrifice it unless it escapes.'],
    ['When ~ enters, sacrifice it unless it was kicked.'],
    ['When ~ enters, sacrifice it unless it escaped or you pay {1}.'],
    ['When ~ enters, sacrifice it if it escaped.'],
    ['When ~ enters, you may sacrifice it unless it escaped.'],
    ['When ~ enters, draw a card and sacrifice it unless it escaped.'],
    ['When ~ enters, sacrifice it and draw a card unless it escaped.'],
    ['When ~ enters, draw a card unless it escaped.'],
    ['When ~ enters, sacrifice it unless it escaped. Draw a card.'],
    ['When ~ enters, if it escaped, sacrifice it unless it escaped.'],
    ['Whenever another creature enters, sacrifice it unless it escaped.'],
    ['When ~ dies, sacrifice it unless it escaped.'],
    ['Whenever ~ attacks, sacrifice it unless it escaped.'],
    ['At the beginning of your upkeep, sacrifice it unless it escaped.'],
  ])('"%s" is not lowered to the escape trigger', (text) => {
    expect(read(text, 'creature').abilities).toEqual([]);
  });

  test('"unless it escaped" is read only in a triggered ability (SYNTHETIC)', () => {
    expect(dropped('Sacrifice ~ unless it escaped.', 'instant')).toMatchObject({
      reason: 'unrecognised',
    });
    expect(dropped('{T}: Sacrifice ~ unless it escaped.', 'creature')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('a line that is not read leaves the face with no entry (never half-executed)', () => {
    const parsed = read(
      'Escape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('Underworld Breach (the real shape, not read): a grant of escape to the cards of a graveyard', () => {
    expect(
      dropped(
        "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
        'enchantment',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });

  test('"escapes with" counted by "for each" is not read: the repository holds no real line of it (SYNTHETIC wording, D-1444 reads a number of counters)', () => {
    expect(
      dropped('~ escapes with a +1/+1 counter on it for each creature you control.', 'creature'),
    ).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('the reason a card with these lines is unsupported (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Alt',
        typeLine,
        oracleText,
        manaCost: '{1}{R}',
        power: '1',
        toughness: '1',
        ...extra,
      }),
    );
  const noBody = { power: undefined, toughness: undefined };

  test('the escape trigger on a card whose escape line is not read blames that line alone', () => {
    const imported = card(
      'Creature — Test',
      `${UNLESS_ESCAPED}\nEscape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.`,
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'Escape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.',
    ]);
    expect(imported.support.reasons).toEqual([]);
  });

  test('the escape trigger on a card with no escape line keeps the engine reason (CR 702.138b)', () => {
    const imported = card('Creature — Test', UNLESS_ESCAPED);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([expect.stringContaining('need an escape cost')]);
  });

  test('escape and delve on one card are refused by the engine', () => {
    const imported = card(
      'Creature — Test',
      'Delve\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      expect.stringContaining('escape with delve is not supported'),
    ]);
  });

  test.each(['Instant', 'Sorcery'])(
    'Unearth on a%s: unsupported with the engine reason',
    (type) => {
      const imported = card(type, 'Unearth {R}', noBody);
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.status).toBe('unsupported');
      expect(imported.support.reasons.join('\n')).toContain('unearth');
    },
  );

  test('two unearth lines: unsupported, the engine says why', () => {
    const imported = card('Creature — Test', 'Unearth {R}\nUnearth {1}{R}');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
  });

  test('a land with spectacle is unsupported with the engine reason', () => {
    const imported = card('Land', 'Spectacle {R}', { manaCost: '', ...noBody });
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('spectacle');
  });

  test('two spectacle lines: unsupported, the engine says why', () => {
    const imported = card('Creature — Test', 'Spectacle {R}\nSpectacle {1}{R}');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      expect.stringContaining('more than one alternative cost of kind spectacle'),
    ]);
  });
});

// Stage P25 (M6): the upkeep slice of the engine (D-127, ENGINE_VERSION 25). Three lines lowered to the engine's
// nodes: "Echo {3}{W}{W}" (the keyword `echo`), "Cumulative upkeep {1}" (the keyword `cumulativeUpkeep`) and "When ~
// enters, you become the monarch." (an enters trigger with `becomeMonarch`). The real lines are those of
// reports/templates.json (and reports/backlog.md, reports/coverage.md); every other line is SYNTHETIC, among them
// the near misses and the parenthesis standing for reminder text. That the engine runs what is lowered is in
// convert-grammar-engine-p25.test.ts; that a missing engine feature is named is in parser-p25-needs.test.ts.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const ECHO = 'Echo {3}{W}{W}';
const CUMULATIVE = 'Cumulative upkeep {1}';
const MONARCH = 'When ~ enters, you become the monarch.';

const keyword = (kind: 'echo' | 'cumulativeUpkeep', symbols: string[]) => ({
  kind: 'keyword',
  keyword: { kind, cost: [{ kind: 'mana', symbols }] },
});
const monarchTrigger = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
};

describe('keyword.echo: "Echo {3}{W}{W}" (CR 702.30a; backlog: 47 cards)', () => {
  test.each<FaceType>(['creature', 'artifact', 'enchantment'])(
    'the real line lowers to the keyword with its mana cost on a %s',
    (type) => {
      expect(readAll(ECHO, type).abilities).toEqual([keyword('echo', ['3', 'W', 'W'])]);
    },
  );

  test.each([
    ['Echo {2}{R}', ['2', 'R']],
    ['Echo {G}', ['G']],
    ['Echo {1}{B}', ['1', 'B']],
    ['echo {W}', ['W']],
  ])('"%s" keeps its cost symbol by symbol (SYNTHETIC cost)', (text, symbols) => {
    expect(readAll(text, 'creature').abilities).toEqual([keyword('echo', symbols)]);
  });

  test('the reminder text in parentheses is dropped by the normalizer (SYNTHETIC reminder)', () => {
    const parsed = readAll(`${ECHO} (SYNTHETIC reminder text.)`, 'creature');
    expect(parsed.abilities).toEqual([keyword('echo', ['3', 'W', 'W'])]);
    expect(parsed.lines).toEqual([ECHO]);
  });

  test('beside the other lines of the card (SYNTHETIC ability text)', () => {
    const parsed = readAll(`Flying\n${ECHO}\nWhen ~ enters, you gain 1 life.`, 'creature');
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['keyword', 'keyword', 'triggered']);
  });
});

describe('keyword.cumulative-upkeep: "Cumulative upkeep {1}" (CR 702.24a; backlog: 57 cards)', () => {
  test.each<FaceType>(['creature', 'artifact', 'enchantment', 'land'])(
    'the real line lowers to the keyword with its mana cost on a %s',
    (type) => {
      expect(readAll(CUMULATIVE, type).abilities).toEqual([keyword('cumulativeUpkeep', ['1'])]);
    },
  );

  test.each([
    ['Cumulative upkeep {G}', ['G']],
    ['Cumulative upkeep {2}{U}', ['2', 'U']],
    ['cumulative upkeep {W}', ['W']],
  ])('"%s" keeps its cost symbol by symbol (SYNTHETIC cost)', (text, symbols) => {
    expect(readAll(text, 'enchantment').abilities).toEqual([keyword('cumulativeUpkeep', symbols)]);
  });

  test('the reminder text in parentheses is dropped by the normalizer (SYNTHETIC reminder)', () => {
    const parsed = readAll(`${CUMULATIVE} (SYNTHETIC reminder text.)`, 'creature');
    expect(parsed.abilities).toEqual([keyword('cumulativeUpkeep', ['1'])]);
    expect(parsed.lines).toEqual([CUMULATIVE]);
  });
});

describe('effect.player: "you become the monarch" (CR 725.1; backlog: 38 cards)', () => {
  test.each<FaceType>(['creature', 'enchantment', 'artifact'])(
    'the real line lowers to an enters trigger with becomeMonarch on a %s',
    (type) => {
      expect(readAll(MONARCH, type).abilities).toEqual([monarchTrigger]);
    },
  );

  test('as a spell sentence it is the spell effect (SYNTHETIC line: no real card has the bare sentence in the reports)', () => {
    expect(readAll('You become the monarch.', 'sorcery').spell).toEqual({
      effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
    });
    expect(readAll('You become the monarch.', 'instant').spell).toEqual({
      effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
    });
  });

  test('beside another instruction of the sentence it is a sequence (SYNTHETIC line)', () => {
    expect(
      readAll('When ~ enters, you become the monarch and draw a card.', 'creature').abilities,
    ).toEqual([
      {
        ...monarchTrigger,
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'becomeMonarch', player: { kind: 'you' } },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    ]);
  });

  test('under another trigger the grammar already reads, the same effect lowers (SYNTHETIC line: not a template of the reports)', () => {
    expect(
      readAll('Whenever ~ deals combat damage to a player, you become the monarch.', 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
      },
    ]);
  });

  test('beside the other lines of the card (a Court has more lines; SYNTHETIC ability text)', () => {
    const parsed = readAll(`${MONARCH}\nFlying`, 'creature');
    expect(parsed.abilities.map((a) => a.kind)).toEqual(['triggered', 'keyword']);
  });
});

describe('what stays unread (never half-executed)', () => {
  test.each([
    // Echo.
    ['Echo', 'no cost'],
    ['Echo {X}', 'X in the cost'],
    ['Echo {X}{R}', 'X in the cost'],
    ['Echo {W/U}', 'a hybrid symbol'],
    ['Echo—Pay 2 life.', 'a cost that is not mana (the engine pays mana only)'],
    ['Echo—Discard a card.', 'a cost that is not mana'],
    ['Echo {2}{R}.', 'a period the real line does not have'],
    ['Echo {2}{R}, haste', 'a keyword list'],
    ['Flying, echo {2}{R}', 'a keyword list'],
    ['Echo {2}{R}, echo {1}', 'a list of echo costs'],
    ['Echoes {2}{R}', 'another word'],
    // Cumulative upkeep.
    ['Cumulative upkeep', 'no cost'],
    ['Cumulative upkeep {X}', 'X in the cost'],
    ['Cumulative upkeep {W/U}', 'a hybrid symbol'],
    ['Cumulative upkeep {1}.', 'a period the real line does not have'],
    ['Cumulative upkeep {1}, flying', 'a keyword list'],
    ['Flying, cumulative upkeep {1}', 'a keyword list'],
    ['Cumulative upkeep {1}{W} or {U}', 'a choice of costs'],
    ['Cumulative {1}', 'a word missing'],
    ['Cumulative upkeeps {1}', 'another word'],
    // The dash forms of Cumulative upkeep: the engine can pay them, but the repository's reports hold no real
    // line of them (the wording is unverified), so the grammar does not read them.
    ['Cumulative upkeep—Pay 1 life.', 'no real line in the reports (the engine could pay it)'],
    ['Cumulative upkeep—Discard a card.', 'no real line in the reports (the engine could pay it)'],
    ['Cumulative upkeep—Sacrifice a creature.', 'a cost the engine cannot pay'],
    [
      'Cumulative upkeep—Put a +1/+1 counter on a creature you control.',
      'a cost the engine cannot pay',
    ],
  ])('"%s" is not read (%s)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    expect(read(text, 'creature').abilities).toEqual([]);
  });

  test.each([
    [
      'When ~ enters, target player becomes the monarch.',
      'another player (the engine names one player; not built)',
    ],
    ['When ~ enters, each opponent becomes the monarch.', 'CR 725.3: one monarch at a time'],
    ['When ~ enters, its controller becomes the monarch.', 'another player'],
    ['When ~ enters, you becomes the monarch.', 'the verb does not agree'],
    ['When ~ enters, you become monarch.', 'no "the"'],
    ['When ~ enters, you become the monarch of the realm.', 'more words'],
    ['When ~ enters, you may become the monarch.', 'a choice the engine does not give'],
    ['When ~ enters, you become the monarch', 'no period'],
    [
      'At the beginning of your end step, if an opponent is not the monarch, draw a card.',
      'only the condition of the monarch of one player (stage P28), not "an opponent is not"',
    ],
    ['You can’t become the monarch.', 'a restriction the engine does not build'],
  ])('"%s" is not read (%s; SYNTHETIC line)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    expect(read(text, 'creature').abilities).toEqual([]);
  });
});

describe('the support of a card with these lines (validateCard is the last gate, D-007)', () => {
  const card = (typeLine: string, oracleText: string, extra: object = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Upkeep Card',
        typeLine,
        oracleText,
        manaCost: '{2}{W}',
        ...extra,
      }),
    );
  const bear = { typeLine: 'Creature — Bear', power: '2', toughness: '2' };

  test.each([
    ['Creature — Bear', ECHO],
    ['Artifact', ECHO],
    ['Creature — Bear', CUMULATIVE],
    ['Enchantment', CUMULATIVE],
    ['Land', CUMULATIVE],
    ['Creature — Bear', MONARCH],
    ['Enchantment', MONARCH],
  ])('a SYNTHETIC %s with "%s" is supported', (typeLine, text) => {
    const imported = card(
      typeLine,
      text,
      typeLine.startsWith('Creature') ? { power: '2', toughness: '2' } : {},
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('a SYNTHETIC sorcery "You become the monarch." is supported', () => {
    const imported = card('Sorcery', 'You become the monarch.');
    expect(imported.support.status).toBe('supported');
    expect(imported.support.reasons).toEqual([]);
  });

  test('two echo lines are two keyword instances (CR 702.30a), both supported (SYNTHETIC)', () => {
    const imported = card('Creature — Bear', `Echo {W}\nEcho {1}`, bear);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities).toHaveLength(2);
  });

  test('a card with the line and one that is not read is unsupported, naming the unread one (SYNTHETIC)', () => {
    const imported = card(
      'Creature — Bear',
      `${ECHO}\nAt the beginning of your end step, if an opponent is not the monarch, draw a card.`,
      bear,
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual([
      'At the beginning of your end step, if an opponent is not the monarch, draw a card.',
    ]);
  });

  test('a Court-shaped card whose second line has "if you\'re the monarch" is supported since stage P28 (SYNTHETIC)', () => {
    const text = `${MONARCH}\nAt the beginning of your upkeep, if you're the monarch, draw a card.`;
    const imported = card('Enchantment', text);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('the same card with a monarch condition the grammar does not read is unsupported (SYNTHETIC)', () => {
    const text = `${MONARCH}\nAt the beginning of your upkeep, if an opponent is not the monarch, draw a card.`;
    const imported = card('Enchantment', text);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toHaveLength(1);
  });

  test('a cumulative upkeep with a life cost is unsupported: the line is not read (SYNTHETIC)', () => {
    const imported = card('Enchantment', 'Cumulative upkeep—Pay 1 life.');
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.text)).toEqual(['Cumulative upkeep—Pay 1 life.']);
  });

  test('an echo cost with X is unsupported (SYNTHETIC)', () => {
    expect(card('Creature — Bear', 'Echo {X}', bear).support.status).toBe('unsupported');
  });

  test('a spell with "Echo {1}" is unsupported (SYNTHETIC: an instant has no permanent to sacrifice)', () => {
    expect(card('Instant', 'Echo {1}').support.status).toBe('unsupported');
  });
});

// D-911 to D-913: the Bruna deck program (issue 5), Ajani, Strength of the Pride. The lines are the real Oracle text of the acceptance card of the golden
// corpus; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The abilities the real text lowers to are compared with the abilities
// of the engine's SYNTHETIC fixture (`syntheticCard('SYNTHETIC Pride Walker')`), which the engine scenario test plays, so the parser and the engine tests are
// about the same nodes.
import { syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES, DEFAULT_SPELL_RULES, parseFaceText } from '../src/convert/parser/index';
import { dropped } from './parser-p5-helpers';

const AJANI = { name: 'Ajani, Strength of the Pride', legendary: true };
const TEXT = [
  '+1: You gain life equal to the number of creatures you control plus the number of planeswalkers you control.',
  '−2: Create a 2/2 white Cat Soldier creature token named Ajani’s Pridemate with "Whenever you gain life, put a +1/+1 counter on this token."',
  '0: If you have at least 15 life more than your starting life total, exile Ajani and each artifact and creature your opponents control.',
].join('\n');

const OPTS_SPELL = { name: 'SYNTHETIC Card', legendary: false };

const readAjani = (text: string, options = AJANI) =>
  parseFaceText(text, options, 0, DEFAULT_RULES, [], ['planeswalker'], ['Ajani']);

/** A line that is not read: its diagnostic. */
const refused = (text: string, options = AJANI) => {
  const parsed = readAjani(text, options);
  const [first] = parsed.unparsed;
  if (first === undefined) throw new Error(`"${text}" was read`);
  return first;
};

describe('Ajani, Strength of the Pride', () => {
  test('all three abilities read, and are the abilities of the engine fixture', () => {
    const parsed = readAjani(TEXT);
    expect(parsed.unparsed).toEqual([]);
    const fixture = syntheticCard('SYNTHETIC Pride Walker').faces[0];
    // The one difference: the real card names its token after itself and says so in its rules text.
    const expected = JSON.parse(
      JSON.stringify(fixture?.abilities)
        .replace('"name":"Pridemate"', '"name":"Ajani’s Pridemate"')
        .replace('on Pridemate.', 'on Ajani’s Pridemate.'),
    );
    expect(parsed.abilities).toEqual(expected);
  });

  test('the token is named after the card, by its short name, and its trigger counts life gained by you (CR 111.4, 119.3)', () => {
    const parsed = readAjani(TEXT);
    expect(parsed.abilities[1]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -2 }],
      effect: {
        kind: 'createToken',
        count: 1,
        token: {
          kind: 'custom',
          definition: {
            name: 'Ajani’s Pridemate',
            types: ['creature'],
            subtypes: ['Cat', 'Soldier'],
            colors: ['W'],
            power: 2,
            toughness: 2,
            abilities: [
              {
                kind: 'triggered',
                trigger: { kind: 'lifeGained', who: 'you' },
                effect: {
                  kind: 'addCounters',
                  objects: { kind: 'this' },
                  counter: '+1/+1',
                  count: 1,
                },
              },
            ],
          },
        },
      },
    });
  });

  test('the 0 ability tests the life total as it resolves, not as a restriction on activating (CR 608.2c, 606.3)', () => {
    const parsed = readAjani(TEXT);
    const zero = parsed.abilities[2];
    expect(zero).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: 0 }],
      effect: {
        kind: 'conditional',
        condition: {
          kind: 'lifeTotal',
          compare: { cmp: 'atLeast', value: 15 },
          aboveStarting: true,
        },
        effect: { kind: 'sequence' },
      },
    });
    expect(JSON.stringify(zero)).not.toContain('activateOnlyIf');
  });
});

describe('a token named after the card that makes it (D-911)', () => {
  const MAKER = { name: 'Pride Maker', legendary: false };

  test('a card without a short name gives its whole name back', () => {
    const parsed = readAjani(
      '+1: Create a 1/1 white Cat creature token named Pride Maker’s Kitten.',
      MAKER,
    );
    expect(parsed.unparsed).toEqual([]);
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Pride Maker’s Kitten"');
  });

  test('a legendary card with a comma uses the name before it, as the printed names of such tokens do', () => {
    const parsed = readAjani(TEXT);
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Ajani’s Pridemate"');
    expect(JSON.stringify(parsed.abilities)).not.toContain('Strength of the Pride');
  });

  test('a name with words of its own after the possessive keeps them', () => {
    const parsed = readAjani(
      '−2: Create a 2/2 white Cat Soldier creature token named Ajani’s Pride of the Plains.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Ajani’s Pride of the Plains"');
  });

  test('a plain name still reads as it did', () => {
    const parsed = readAjani('−2: Create a 2/2 white Cat Soldier creature token named Pridemate.');
    expect(parsed.unparsed).toEqual([]);
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Pridemate"');
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    for (const named of [
      'Pridemate of Ajani', // the card's name is not the first word of the name
      'Ajani Pridemate',
      'Ajani',
      'Ajani’s',
      'Ajani’s pridemate',
    ]) {
      expect(
        refused(`−2: Create a 2/2 white Cat Soldier creature token named ${named}.`).reason,
        named,
      ).toBeDefined();
    }
  });

  test('a token made by the token has no card name to give back: refused, not guessed (SYNTHETIC)', () => {
    const d = refused(
      '−2: Create a 2/2 white Cat Soldier creature token named Ajani’s Pridemate with "When this token dies, create a 1/1 white Spirit creature token named Ajani’s Echo."',
    );
    expect(d.reason).toBe('notRunnable');
  });

  test('a name written with the whole name of the card is refused, not given the short name (SYNTHETIC)', () => {
    // Normalization turns the whole name and the short name into the same tilde; the text as written says which one the effect used (CR 111.4).
    for (const named of [
      'Ajani, Strength of the Pride’s Pridemate',
      'Ajani, Strength of the Pride’s Pride of the Plains',
    ]) {
      const d = refused(`−2: Create a 2/2 white Cat Soldier creature token named ${named}.`);
      expect(d.reason, named).toBe('notRunnable');
    }
  });

  test('the whole name elsewhere in the text does not change a token named with the short name (SYNTHETIC)', () => {
    const parsed = readAjani(
      '−2: Ajani, Strength of the Pride deals 1 damage to each opponent. Create a 2/2 white Cat Soldier creature token named Ajani’s Pridemate.',
    );
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Ajani’s Pridemate"');
  });

  test('a sentence after the token reads as another instruction, not as part of its name (SYNTHETIC)', () => {
    const parsed = readAjani(
      '−2: Create a 2/2 white Cat Soldier creature token named Ajani’s Pridemate. You gain 2 life.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(JSON.stringify(parsed.abilities)).toContain('"name":"Ajani’s Pridemate"');
    expect(JSON.stringify(parsed.abilities)).toContain('"gainLife"');
  });
});

describe('"If you have at least N life more than your starting life total, ..." before an instruction (D-912)', () => {
  test('the sentence is conditional on resolution in a loyalty ability, whatever the number (SYNTHETIC)', () => {
    const parsed = readAjani(
      '0: If you have at least 7 life more than your starting life total, draw a card.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toMatchObject([
      {
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'lifeTotal',
            compare: { cmp: 'atLeast', value: 7 },
            aboveStarting: true,
          },
          effect: { kind: 'draw' },
        },
      },
    ]);
  });

  test('a life total, not a difference, when the words say so (SYNTHETIC)', () => {
    const parsed = readAjani('0: If you have 30 or more life, draw a card.');
    expect(parsed.abilities).toMatchObject([
      {
        effect: {
          kind: 'conditional',
          condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
        },
      },
    ]);
    expect(JSON.stringify(parsed.abilities)).not.toContain('aboveStarting');
  });

  test("on an instant it is the spell's own conditional; as a static line of a permanent it is refused (SYNTHETIC)", () => {
    const text = 'If you have 30 or more life, draw a card.';
    const spell = parseFaceText(
      text,
      OPTS_SPELL,
      0,
      DEFAULT_RULES,
      DEFAULT_SPELL_RULES,
      ['instant'],
      [],
    );
    expect(spell.unparsed).toEqual([]);
    expect(spell.spell).toMatchObject({
      effect: {
        kind: 'conditional',
        condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
        effect: { kind: 'draw' },
      },
    });
    expect(refused(text).reason).toBe('unrecognised');
  });

  test('a triggered ability\'s own "if" stays the intervening "if" of its trigger (CR 603.4)', () => {
    const parsed = readAjani(
      'At the beginning of your end step, if you have at least 15 life more than your starting life total, draw a card.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        interveningIf: { kind: 'lifeTotal', aboveStarting: true },
        effect: { kind: 'draw' },
      },
    ]);
    expect(
      JSON.stringify(parsed.abilities[0]?.kind === 'triggered' ? parsed.abilities[0].effect : null),
    ).not.toContain('conditional');
  });

  test('the near misses are not read (SYNTHETIC)', () => {
    const lines = [
      // another player's life
      '0: If an opponent has at least 15 life more than their starting life total, draw a card.',
      // not the starting life total of the game
      '0: If you have at least 15 life more than your starting life, draw a card.',
      '0: If you have at least 15 life more than the starting life total, draw a card.',
      // the number is a whole number
      '0: If you have at least X life more than your starting life total, draw a card.',
      '0: If you have at least 0 life more than your starting life total, draw a card.',
      // "at most" is another test
      '0: If you have at most 15 life more than your starting life total, draw a card.',
      // a test after the instruction is not read
      '0: Draw a card if you have at least 15 life more than your starting life total.',
    ];
    for (const line of lines) expect(refused(line).reason, line).toBeDefined();
  });
});

describe('"each artifact and creature your opponents control" (D-913)', () => {
  const eachOf = (text: string) => {
    const parsed = readAjani(text);
    expect(parsed.unparsed, text).toEqual([]);
    return JSON.stringify(parsed.abilities);
  };

  test('every permanent that is an artifact or a creature, of the opponents, once each (CR 205.2a)', () => {
    expect(eachOf('0: Exile each artifact and creature your opponents control.')).toContain(
      '"filter":{"zone":"battlefield","controller":"opponent","anyOf":[{"types":["artifact"]},{"types":["creature"]}]}',
    );
  });

  test('the controller words apply to both types, and no controller means every player (SYNTHETIC)', () => {
    expect(eachOf('0: Destroy each artifact and creature you control.')).toContain(
      '"controller":"you"',
    );
    expect(eachOf('0: Destroy each artifact and creature.')).not.toContain('"controller"');
  });

  test('a list of three needs the comma before "and" (SYNTHETIC)', () => {
    expect(
      eachOf('0: Exile each artifact, creature, and enchantment your opponents control.'),
    ).toContain('{"types":["enchantment"]}');
    expect(
      dropped(
        '0: Exile each artifact, creature and enchantment your opponents control.',
        'creature',
      ).reason,
    ).toBeDefined();
  });

  test('another way to say it, a repeated type, an extra word or a plural is not this rule (SYNTHETIC)', () => {
    for (const noun of [
      'each artifact and artifact your opponents control',
      'each artifact and creatures your opponents control',
      'each other artifact and creature your opponents control',
      'each tapped artifact and creature your opponents control',
      'each artifact and Goblin your opponents control',
    ]) {
      expect(refused(`0: Exile ${noun}.`).reason, noun).toBeDefined();
    }
  });
});

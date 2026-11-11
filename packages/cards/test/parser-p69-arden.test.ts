// Stage P69 (D-941): the Bruna deck program (issue 5), Arden Angel: "At the beginning of your upkeep, if ~ is in your graveyard, roll a four-sided die. If the result
// is 1, return ~ from your graveyard to the battlefield." The line is the real Oracle text of the acceptance card of the golden corpus, name replaced by ~, with the
// nodes the grammar produces; the other lines are SYNTHETIC siblings and the near misses the grammar must not read (CR 706.1 to 706.3b, 113.6b, 603.4).
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const ARDEN =
  'Flying\nAt the beginning of your upkeep, if ~ is in your graveyard, roll a four-sided die. If the result is 1, return ~ from your graveyard to the battlefield.';
const TRIGGER_HEAD = 'At the beginning of your upkeep, if ~ is in your graveyard, ';

const RETURN_THIS = {
  kind: 'moveToZone',
  objects: { kind: 'this' },
  to: 'battlefield',
  controller: 'owner',
};

describe('Arden Angel: a graveyard trigger that rolls a die and reads the result', () => {
  test('the whole card', () => {
    const parsed = readAll(ARDEN, 'creature', ['Angel']);
    expect(parsed.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: { kind: 'thisInYourGraveyard' },
        functionsIn: 'graveyard',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'rollDie', sides: 4 },
            {
              kind: 'conditional',
              condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 1 } },
              effect: RETURN_THIS,
            },
          ],
        },
      },
    ]);
  });

  test('"this card" says the same as the name (SYNTHETIC)', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, if this card is in your graveyard, roll a four-sided die. If the result is 1, return ~ from your graveyard to the battlefield.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      { interveningIf: { kind: 'thisInYourGraveyard' }, functionsIn: 'graveyard' },
    ]);
  });
});

describe('the roll and the sizes of the die', () => {
  test('"roll a d20" and the number words are the same roll (SYNTHETIC)', () => {
    for (const [roll, sides] of [
      ['roll a d20', 20],
      ['roll a d6', 6],
      ['roll a six-sided die', 6],
      ['roll an eight-sided die', 8],
      ['roll a twenty-sided die', 20],
      ['roll a 12-sided die', 12],
    ] as const) {
      const text = `At the beginning of your upkeep, ${roll}. If the result is 1, you gain 3 life.`;
      expect(JSON.stringify(readAll(text, 'enchantment').abilities), roll).toContain(
        `"kind":"rollDie","sides":${sides}`,
      );
    }
  });

  test('a roll on its own is a spell and an effect of a triggered ability (SYNTHETIC)', () => {
    expect(readAll('Roll a six-sided die.', 'instant').spell).toEqual({
      effect: { kind: 'rollDie', sides: 6 },
    });
    expect(
      readAll('At the beginning of your upkeep, roll a d20.', 'enchantment').abilities,
    ).toMatchObject([{ kind: 'triggered', effect: { kind: 'rollDie', sides: 20 } }]);
  });

  test('"Otherwise" is the else of the result test (SYNTHETIC)', () => {
    const parsed = readAll(
      'Roll a six-sided die. If the result is 4 or more, you gain 4 life. Otherwise, you lose 2 life.',
      'sorcery',
    );
    expect(parsed.spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 6 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'atLeast', value: 4 } },
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 4 },
            else: { kind: 'loseLife', player: { kind: 'you' }, amount: 2 },
          },
        ],
      },
    });
  });

  test('"or less", "or lower", "or higher" and "or greater" are the comparisons (SYNTHETIC)', () => {
    for (const [words, cmp] of [
      ['2 or less', 'atMost'],
      ['2 or lower', 'atMost'],
      ['2 or more', 'atLeast'],
      ['2 or higher', 'atLeast'],
      ['2 or greater', 'atLeast'],
    ] as const) {
      const parsed = readAll(
        `Roll a six-sided die. If the result is ${words}, you gain 1 life.`,
        'instant',
      );
      expect(JSON.stringify(parsed.spell), words).toContain(`"compare":{"cmp":"${cmp}","value":2}`);
    }
  });

  test('two instructions read the one result, and a trailing "if" reads it too (SYNTHETIC)', () => {
    const parsed = readAll(
      'Roll a d20. If the result is 20, you gain 5 life. If the result is 2 or less, you lose 3 life.',
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain('"cmp":"equal","value":20');
    expect(JSON.stringify(parsed.spell)).toContain('"cmp":"atMost","value":2');
    const trailing = readAll('Roll a d20. You gain 5 life if the result is 20.', 'sorcery');
    expect(JSON.stringify(trailing.spell)).toContain('"cmp":"equal","value":20');
  });
});

describe('near misses are not read (SYNTHETIC)', () => {
  const reason = (
    text: string,
    type: 'instant' | 'sorcery' | 'creature' | 'enchantment' = 'instant',
  ) => dropped(text, type).reason;
  const unread = (
    text: string,
    type: 'instant' | 'sorcery' | 'creature' | 'enchantment' = 'instant',
  ) => {
    const parsed = read(text, type);
    return parsed.unparsed.length > 0;
  };

  test('another roll than one die by the controller', () => {
    expect(unread('Roll a die.')).toBe(true);
    expect(unread('Roll two six-sided dice.')).toBe(true);
    expect(unread('Roll a d20 twice.')).toBe(true);
    expect(unread('Roll a one-sided die.')).toBe(true);
    expect(unread('Each player rolls a six-sided die.')).toBe(true);
    expect(unread('Target player rolls a six-sided die.')).toBe(true);
    expect(unread('You may roll a six-sided die.', 'instant')).toBe(true);
  });

  test('a result test with no roll before it, or a number the die cannot show', () => {
    expect(unread('If the result is 1, you gain 3 life.')).toBe(true);
    expect(unread('You gain 1 life. If the result is 1, you gain 3 life.')).toBe(true);
    expect(unread('Roll a six-sided die. If the result is 7, you gain 3 life.')).toBe(true);
    expect(unread('Roll a six-sided die. If the result is 0, you gain 3 life.')).toBe(true);
    expect(unread('Roll a six-sided die. If the result is 1-3, you gain 3 life.')).toBe(true);
    expect(unread('Roll a six-sided die. If the result is 1 or 2, you gain 3 life.')).toBe(true);
    expect(unread('Roll a six-sided die. If the result is one, you gain 3 life.')).toBe(true);
  });

  test('a second roll in the same text, so "the result" would be one of two', () => {
    expect(unread('Roll a d6. Roll a d8. If the result is 1, you gain 3 life.', 'sorcery')).toBe(
      true,
    );
    expect(
      unread(
        'Roll a d6. If the result is 1, you gain 1 life. Roll a d6. If the result is 2, you gain 2 life.',
        'sorcery',
      ),
    ).toBe(true);
  });

  test('a roll that is conditional, optional, delayed or in an "otherwise"', () => {
    expect(
      unread(
        'If you control a creature, roll a d6. If the result is 1, you gain 3 life.',
        'sorcery',
      ),
    ).toBe(true);
    expect(
      unread(
        'You gain 1 life. Otherwise, roll a d6. If the result is 1, you gain 3 life.',
        'sorcery',
      ),
    ).toBe(true);
    expect(
      unread(
        'At the beginning of the next end step, roll a d6. If the result is 1, you gain 3 life.',
        'sorcery',
      ),
    ).toBe(true);
    expect(
      unread(
        'At the beginning of your upkeep, you may roll a d6. If the result is 1, you gain 3 life.',
        'enchantment',
      ),
    ).toBe(true);
  });

  test('"if ~ is in your graveyard" without the return of the card is not read', () => {
    // the card would be on the battlefield: an ability that does something else with the condition is not the engine's graveyard ability
    expect(
      unread(
        'At the beginning of your upkeep, if ~ is in your graveyard, roll a d6. If the result is 1, you gain 3 life.',
        'creature',
      ),
    ).toBe(true);
    expect(
      unread(
        'At the beginning of your upkeep, if ~ is in your graveyard, you gain 1 life.',
        'creature',
      ),
    ).toBe(true);
    expect(unread('Whenever ~ dies, if ~ is in your graveyard, you gain 1 life.', 'creature')).toBe(
      true,
    );
    // the static ability of a card in the graveyard keeps its own words ("this card"), and "~" there is not read as a condition by this rule
    expect(
      unread('As long as ~ is in your graveyard, creatures you control get +1/+1.', 'creature'),
    ).toBe(true);
    expect(
      unread(
        'As long as this card is in your graveyard, creatures you control get +1/+0.',
        'creature',
      ),
    ).toBe(false);
    expect(unread('You gain 1 life if ~ is in your graveyard.', 'sorcery')).toBe(true);
  });

  test('another zone, graveyard or player than "your graveyard"', () => {
    for (const where of [
      'in a graveyard',
      "in an opponent's graveyard",
      'in your hand',
      'on the battlefield',
    ]) {
      expect(
        unread(
          `At the beginning of your upkeep, if ~ is ${where}, roll a four-sided die. If the result is 1, return ~ from your graveyard to the battlefield.`,
          'creature',
        ),
        where,
      ).toBe(true);
    }
  });

  test("the opponent's upkeep and the end step are other triggers, read as written", () => {
    const own = readAll(ARDEN, 'creature').abilities;
    const theirs = readAll(
      ARDEN.replace('your upkeep', "each opponent's upkeep").replace(
        'if ~ is in your graveyard',
        'if ~ is in your graveyard',
      ),
      'creature',
    );
    expect(JSON.stringify(theirs.abilities)).not.toEqual(JSON.stringify(own));
  });

  test('return to the hand or an effect that is not the return of the card', () => {
    expect(
      unread(
        `${TRIGGER_HEAD}roll a four-sided die. If the result is 1, return ~ from your graveyard to your hand.`,
        'creature',
      ),
    ).toBe(false);
    expect(reason('Roll a six-sided die. If the result is 1, banana.')).toBeDefined();
  });
});

// The Hylda deck (issue 42), group 2 (D-1510 to D-1518): the lines of Sleep, Tempest Caller, Send to Sleep, Icy Blast, Niblis of Frost, Narcolepsy, Cone of Cold, Dreamshackle Geist,
// Citadel Siege, Topplegeist and Hylda's Crown of Winter. The first lines of each block are the real Oracle text of the acceptance cards of the golden corpus read through the
// whole pipeline; the other lines are SYNTHETIC variants and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-hylda-g2.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof readFace>[1] = 'sorcery') => {
  const parsed = readFace(text, type);
  expect(parsed.spell, text).toBeNull();
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURES: { types: string[]; zone: 'battlefield' } = {
  zone: 'battlefield',
  types: ['creature'],
};
const THEIRS = {
  kind: 'each',
  filter: { ...CREATURES, controlledBy: T1 },
};
const KEEP = (objects: unknown) => ({
  kind: 'restrict',
  objects,
  restriction: 'doesntUntap',
  duration: 'untilNextUntapStep',
});

describe('Sleep and Tempest Caller: "all creatures target player controls" (D-1510, CR 109.4, 115.1)', () => {
  test('the real lines of Sleep: the group of the target player, then the same group again', () => {
    expect(
      readAll(
        "Tap all creatures target player controls. Those creatures don't untap during that player's next untap step.",
        'sorcery',
      ).spell,
    ).toEqual({
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'sequence', effects: [{ kind: 'tap', objects: THEIRS }, KEEP(THEIRS)] },
    });
  });

  test('the real line of Tempest Caller: an opponent only', () => {
    expect(readAll('When ~ enters, tap all creatures target opponent controls.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: { kind: 'tap', objects: THEIRS },
      },
    ]);
  });

  test('other kinds of permanent and an untap of them (SYNTHETIC)', () => {
    expect(readAll('Tap all nonland permanents target player controls.', 'sorcery').spell).toMatchObject({
      effect: { kind: 'tap', objects: { kind: 'each', filter: { notTypes: ['land'] } } },
    });
    expect(readAll('Untap all creatures target player controls.', 'instant').spell).toMatchObject({
      effect: { kind: 'untap', objects: { kind: 'each', filter: { controlledBy: T1 } } },
    });
  });

  test('the plain groups are read as before', () => {
    expect(readAll('Tap all creatures your opponents control.', 'sorcery').spell).toEqual({
      effect: {
        kind: 'tap',
        objects: { kind: 'each', filter: { ...CREATURES, controller: 'opponent' } },
      },
    });
  });

  test.each([
    'Tap all creatures target players control.',
    'Tap each creature target player controls.',
    'Tap all other creatures target player controls.',
    'Tap all creatures target creature controls.',
    'Tap all creatures you control target player controls.',
    'Tap target player controls.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'selector:controllerRef',
      'Tap all creatures target player controls.',
      'sorcery',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:controllerRef');
  });
});

describe('"Doesn\'t untap during its controller\'s next untap step" (D-1510, CR 502.3, 611.2a, 701.43b)', () => {
  test('the real lines of Niblis of Frost: the target, then the same creature', () => {
    expect(
      readAll(
        "Whenever you cast an instant or sorcery spell, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.",
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        targets: [{ id: 't1', what: { kind: 'object', filter: { controller: 'opponent' } } }],
        effect: { kind: 'sequence', effects: [{ kind: 'tap', objects: T1 }, KEEP(T1)] },
      },
    ]);
  });

  test('the real lines of Send to Sleep: a spell mastery test on the untap of the targets', () => {
    expect(
      readAll(
        "Tap up to two target creatures.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, those creatures don't untap during their controllers' next untap steps.",
        'instant',
      ).spell,
    ).toEqual({
      targets: [{ id: 't1', what: { kind: 'object', filter: CREATURES }, min: 0, max: 2 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          {
            kind: 'conditional',
            condition: {
              kind: 'amountIs',
              amount: {
                kind: 'countOf',
                filter: {
                  zone: 'graveyard',
                  controller: 'you',
                  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
                },
              },
              compare: { cmp: 'atLeast', value: 2 },
            },
            effect: KEEP(T1),
          },
        ],
      },
    });
  });

  test('the real lines of Icy Blast: X targets and the test of a creature with power 4 or greater', () => {
    expect(
      readAll(
        "Tap X target creatures.\nFerocious — If you control a creature with power 4 or greater, those creatures don't untap during their controllers' next untap steps.",
        'instant',
      ).spell,
    ).toMatchObject({
      x: true,
      targets: [{ id: 't1', countX: true }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: T1 },
          { kind: 'conditional', condition: { kind: 'controlsAtLeast' }, effect: KEEP(T1) },
        ],
      },
    });
  });

  test('a target on its own (the mode of Dreamshackle Geist), one or several creatures', () => {
    expect(
      readAll("Target creature doesn't untap during its controller's next untap step.", 'sorcery').spell,
    ).toMatchObject({ targets: [{ id: 't1' }], effect: KEEP(T1) });
    expect(
      readAll(
        "Up to two target creatures don't untap during their controllers' next untap steps.",
        'sorcery',
      ).spell,
    ).toMatchObject({ targets: [{ id: 't1', min: 0, max: 2 }], effect: KEEP(T1) });
    expect(
      readAll("Target creature doesn't untap during that player's next untap step.", 'sorcery').spell,
    ).toMatchObject({ effect: KEEP(T1) });
  });

  test.each([
    "Target creature doesn't untap during your next untap step.",
    "Target creature doesn't untap during its controller's untap step.",
    "Target creature doesn't untap during its controller's next untap steps.",
    "Target creature don't untap during its controller's next untap step.",
    "Target creature doesn't untap during each player's next untap step.",
    "Target creature doesn't untap.",
    "Target creature doesn't untap during its controller's next untap step this turn.",
    "Target creature doesn't untap until its controller's next untap step.",
    "Those creatures don't untap during their controllers' next untap steps.",
    "Tap target creature. Those creatures don't untap during their controller's next untap step.",
    "Tap target creature. That creature doesn't untap during their controller's next untap step.",
  ])('near misses are not read, never half read: %s', (text) => {
    expect(readFace(text, 'sorcery').spell, text).toBeNull();
  });

  test('the line names the features the engine lacks (D-068)', () => {
    const text = "Target creature doesn't untap during its controller's next untap step.";
    const missing = withoutFeature('duration:untilNextUntapStep', text, 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('duration:untilNextUntapStep');
    expect(DECLARED_NEEDS).toContain('duration:untilNextUntapStep');
    expect(DECLARED_NEEDS).toContain('effect:restrict');
  });
});

describe('Narcolepsy: "if enchanted creature is untapped, tap it" (D-1513, CR 603.4, 303.4b)', () => {
  test('the real line: the permanent the Aura enchants, against a filter, and the same permanent as "it"', () => {
    expect(
      readAll(
        'At the beginning of each upkeep, if enchanted creature is untapped, tap it.',
        'enchantment',
        ['Aura'],
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: {
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { types: ['creature'], tapped: false },
        },
        effect: { kind: 'tap', objects: { kind: 'attached' } },
      },
    ]);
  });

  test('tapped, and an Equipment (SYNTHETIC)', () => {
    expect(
      readAll('At the beginning of your upkeep, if enchanted creature is tapped, you gain 1 life.', 'enchantment', [
        'Aura',
      ]).abilities,
    ).toMatchObject([{ interveningIf: { filter: { tapped: true } } }]);
    expect(
      readAll('At the beginning of each upkeep, if equipped creature is untapped, tap it.', 'artifact', [
        'Equipment',
      ]).abilities,
    ).toMatchObject([{ effect: { kind: 'tap', objects: { kind: 'attached' } } }]);
  });

  test.each([
    'At the beginning of each upkeep, if enchanted land is untapped, tap it.',
    "At the beginning of each upkeep, if enchanted creature isn't untapped, tap it.",
    'At the beginning of each upkeep, if enchanted creature is untapped or tapped, tap it.',
    'At the beginning of each upkeep, if target creature is untapped, tap it.',
    'At the beginning of each upkeep, if enchanted creatures are untapped, tap it.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'enchantment');
  });

  test('on a permanent that is no Aura the condition is not lowered (the word says what the permanent is)', () => {
    expect(
      readFace('At the beginning of each upkeep, if enchanted creature is untapped, tap it.', 'artifact')
        .abilities,
    ).toEqual([]);
  });
});

describe('Cone of Cold: a d20 table (D-1518, CR 706.3a, 706.3b)', () => {
  const ROW1 = '1—9 | Tap all creatures your opponents control.';
  const ROW2 =
    "10—19 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps.";
  const ROW3 =
    "20 | Tap all creatures your opponents control. Those creatures don't untap during their controllers' next untap steps. Until your next turn, creatures your opponents control enter tapped.";
  const TABLE = ['Roll a d20.', ROW1, ROW2, ROW3].join('\n');

  test('the real lines: the roll, then the three rows as conditions on the result', () => {
    const OPP = { kind: 'each', filter: { ...CREATURES, controller: 'opponent' } };
    expect(readAll(TABLE, 'sorcery').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 20 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'atMost', value: 9 } },
            effect: { kind: 'tap', objects: OPP },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'and',
              terms: [
                { kind: 'dieResult', compare: { cmp: 'atLeast', value: 10 } },
                { kind: 'dieResult', compare: { cmp: 'atMost', value: 19 } },
              ],
            },
            effect: { kind: 'sequence', effects: [{ kind: 'tap', objects: OPP }, KEEP(OPP)] },
          },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 20 } },
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'tap', objects: OPP },
                KEEP(OPP),
                {
                  kind: 'permanentsEnterTapped',
                  permanents: { types: ['creature'], controller: 'opponent' },
                  duration: 'untilYourNextTurn',
                },
              ],
            },
          },
        ],
      },
    });
  });

  test('a table of another die and other rows (SYNTHETIC): every result has one row', () => {
    const parsed = readAll(
      ['Roll a d6.', '1 | You gain 1 life.', '2—5 | You gain 2 life.', '6 | You gain 3 life.'].join('\n'),
      'sorcery',
    );
    expect(parsed.spell).toMatchObject({
      effect: {
        effects: [
          { kind: 'rollDie', sides: 6 },
          { condition: { compare: { cmp: 'equal', value: 1 } } },
          { condition: { terms: [{ compare: { value: 2 } }, { compare: { value: 5 } }] } },
          { condition: { compare: { cmp: 'equal', value: 6 } } },
        ],
      },
    });
  });

  test.each([
    // a gap, an overlap, a table that starts late or ends early, rows out of order, a row past the die
    ['Roll a d6.', '1 | You gain 1 life.', '3—6 | You gain 2 life.'],
    ['Roll a d6.', '1—3 | You gain 1 life.', '3—6 | You gain 2 life.'],
    ['Roll a d6.', '2—6 | You gain 1 life.'],
    ['Roll a d6.', '1—5 | You gain 1 life.'],
    ['Roll a d6.', '4—6 | You gain 1 life.', '1—3 | You gain 2 life.'],
    ['Roll a d6.', '1—3 | You gain 1 life.', '4—7 | You gain 2 life.'],
    ['Roll a d6.', '1—6 | You gain 1 life.'].slice(0, 1).concat(['4—3 | You gain 1 life.']),
  ])('a table that is not exactly the die is not read: %j', (...lines) => {
    const text = lines.flat().join('\n');
    expect(readFace(text, 'sorcery').spell, text).toBeNull();
  });

  test('rows with no roll before them are not read', () => {
    expect(readFace([ROW1, ROW2, ROW3].join('\n'), 'sorcery').spell).toBeNull();
  });

  test('a table of an ability of a permanent is not read', () => {
    expect(readFace(['Roll a d6.', '1—6 | You gain 1 life.'].join('\n'), 'creature').abilities).toEqual([]);
  });

  test('"Until your next turn, creatures your opponents control enter tapped" alone (SYNTHETIC)', () => {
    expect(
      readAll('Until your next turn, creatures your opponents control enter tapped.', 'sorcery').spell,
    ).toEqual({
      effect: {
        kind: 'permanentsEnterTapped',
        permanents: { types: ['creature'], controller: 'opponent' },
        duration: 'untilYourNextTurn',
      },
    });
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature(
      'effect:permanentsEnterTapped',
      'Until your next turn, creatures your opponents control enter tapped.',
      'sorcery',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:permanentsEnterTapped');
    expect(DECLARED_NEEDS).toContain('effect:permanentsEnterTapped');
  });
});

describe('Dreamshackle Geist: "choose up to one —" (D-1517, CR 700.2b)', () => {
  const LINE =
    "At the beginning of combat on your turn, choose up to one —\n• Tap target creature.\n• Target creature doesn't untap during its controller's next untap step.";

  test('the real line: no mode is allowed (min 0), one is chosen at most', () => {
    expect(readAll(LINE, 'creature').abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        chooseModes: { min: 0, max: 1 },
        modes: [{ effect: { kind: 'tap' } }, { effect: KEEP({ kind: 'target', id: 't2' }) }],
      },
    ]);
  });

  test('only a triggered ability may choose no mode: a spell and an activated ability are not read', () => {
    expect(readFace('Choose up to one —\n• Draw a card.\n• Gain 3 life.', 'sorcery').spell).toBeNull();
    expect(
      readFace('{T}: Choose up to one —\n• Draw a card.\n• You gain 3 life.', 'creature').abilities,
    ).toEqual([]);
  });

  test.each([
    'Choose up to two —',
    'Choose up to one -',
    'Choose up to one',
    'Choose one or both —',
  ])('the header "%s" is the one of its own rule or no rule of this group', (header) => {
    const text = `At the beginning of combat on your turn, ${header}\n• Draw a card.\n• You gain 3 life.`;
    const parsed = readFace(text, 'creature');
    if (header === 'Choose one or both —') expect(parsed.unparsed).toEqual([]);
    else expect(parsed.abilities, text).toEqual([]);
  });
});

describe('Citadel Siege: "at the beginning of combat on each opponent\'s turn" (D-1515, CR 507.1)', () => {
  test('the real lines: the choice and both options, the second with the player of the turn', () => {
    expect(
      readAll(
        "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of combat on your turn, put two +1/+1 counters on target creature you control.\n• Dragons — At the beginning of combat on each opponent's turn, tap target creature that player controls.",
        'enchantment',
      ).abilities,
    ).toMatchObject([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', options: ['Khans', 'Dragons'] } },
      { trigger: { kind: 'step', step: 'beginCombat', whose: 'you' } },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'opponent' },
        targets: [{ what: { kind: 'object', filter: { controller: 'triggerPlayer' } } }],
        effect: { kind: 'tap', objects: T1 },
        triggerCondition: { kind: 'chosenOption', option: 'Dragons' },
      },
    ]);
  });

  test('"that player" is the player of the event only (SYNTHETIC)', () => {
    // A player the text named before is another player: not read.
    NOT_READ(
      'At the beginning of combat on each opponent’s turn, target player loses 1 life. Tap target creature that player controls.',
      'creature',
    );
    // A spell has no player of the event.
    NOT_READ('Tap target creature that player controls.', 'sorcery');
  });

  test.each([
    "At the beginning of combat on each opponent's turns, tap target creature.",
    "At the beginning of combat on each player's turn, tap target creature.",
    'At the beginning of combat on target opponent’s turn, tap target creature.',
  ])('near misses are not read: %s', (text) => {
    NOT_READ(text, 'creature');
  });
});

describe('Topplegeist: "four or more card types among cards in your graveyard" (D-1511, CR 205.2a, 207.2c, 603.4)', () => {
  test('the real line: an intervening "if" on the count of card types of the graveyard, and a target of the player of the step', () => {
    expect(
      readAll(
        "At the beginning of each opponent's upkeep, if there are four or more card types among cards in your graveyard, tap target creature that player controls.",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'upkeep', whose: 'opponent' },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'cardTypesAmong', filter: { zone: 'graveyard', controller: 'you' } },
          compare: { cmp: 'atLeast', value: 4 },
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'triggerPlayer' },
            },
          },
        ],
        effect: { kind: 'tap', objects: T1 },
      },
    ]);
  });

  test('another number and a kind of card (SYNTHETIC)', () => {
    expect(
      readAll(
        'At the beginning of your upkeep, if there are two or fewer card types among creature cards in your graveyard, you gain 1 life.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        interveningIf: {
          amount: { kind: 'cardTypesAmong', filter: { types: ['creature'] } },
          compare: { cmp: 'atMost', value: 2 },
        },
      },
    ]);
  });

  test.each([
    'At the beginning of your upkeep, if there are four card types among cards in your graveyard, you gain 1 life.',
    'At the beginning of your upkeep, if there are four or more types among cards in your graveyard, you gain 1 life.',
    'At the beginning of your upkeep, if there are four or more card types among permanents you control, you gain 1 life.',
    'At the beginning of your upkeep, if there are four or more card types among cards on the battlefield, you gain 1 life.',
    'At the beginning of your upkeep, if you have four or more card types among cards in your graveyard, you gain 1 life.',
  ])('near misses are not read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const text =
      "At the beginning of each opponent's upkeep, if there are four or more card types among cards in your graveyard, tap target creature that player controls.";
    const missing = withoutFeature('amount:cardTypesAmong', text, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('amount:cardTypesAmong');
    expect(DECLARED_NEEDS).toContain('amount:cardTypesAmong');
  });
});

describe("Hylda's Crown of Winter: \"This ability costs {1} less to activate during your turn.\" (D-1516, CR 601.2f)", () => {
  test('the real line: the generic reduction while it is your turn', () => {
    expect(
      readAll(
        '{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn.',
        'artifact',
      ).abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        targets: [{ id: 't1', what: { kind: 'object', filter: CREATURES } }],
        effect: { kind: 'tap', objects: T1 },
        costReducedIf: { generic: 1, condition: { kind: 'yourTurn' } },
      },
    ]);
  });

  test.each([
    '{1}, {T}: Tap target creature. This ability costs {1} less to activate during an opponent’s turn.',
    '{1}, {T}: Tap target creature. This ability costs {G} less to activate during your turn.',
    '{1}, {T}: Tap target creature. This ability costs {1} more to activate during your turn.',
    '{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'artifact');
  });

  test('a mana ability has no cost reduction of this kind', () => {
    expect(
      readFace('{T}: Add {G}. This ability costs {1} less to activate during your turn.', 'artifact')
        .abilities,
    ).toEqual([]);
  });
});

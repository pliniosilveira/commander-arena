// The Gisa deck (issue 41), group 4 (D-459 to D-462): the lines of Whip of Erebos, Embalmer's Tools, Tetzimoc, Primal Death and Ghost Vacuum. The first lines of each block are the
// real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read.
// The engine runs what is lowered in convert-grammar-engine-gisa-g4.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

/** The text has a first ability that is read (the linked exile) and a second that is not: nothing of the second is kept. */
const SECOND_NOT_READ = (text: string) => {
  const parsed = read(text, 'artifact');
  expect(parsed.abilities, text).toHaveLength(1);
  expect(parsed.unparsed, text).toHaveLength(1);
  expect(parsed.unparsed[0]?.ability, text).toBe(1);
};

const MOVED = { kind: 'moved' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const RETURN =
  '{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield.';
const RETURN_AST = {
  kind: 'moveToZone',
  objects: T1,
  to: 'battlefield',
  controller: 'you',
} as const;
const GRAVEYARD_CREATURE = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
  },
} as const;

describe('Whip of Erebos: the sentences about "it" after the return (D-459, CR 603.7c, 614.1a, 611.2a)', () => {
  const REAL = `${RETURN} It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery.`;

  test('the real line: the return, the haste for good, the delayed exile, the replacement, at sorcery speed', () => {
    const parsed = readAll(REAL, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'B', 'B'] }, { kind: 'tap' }],
        targets: [GRAVEYARD_CREATURE],
        effect: {
          kind: 'sequence',
          effects: [
            RETURN_AST,
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
            {
              kind: 'delayedTrigger',
              at: { step: 'endStep', whose: 'each' },
              effect: { kind: 'exile', objects: MOVED },
            },
            { kind: 'exileIfLeaves', objects: MOVED },
          ],
        },
        timing: 'sorcery',
      },
    ]);
  });

  test('each sentence alone after a return: "It gains haste."', () => {
    const parsed = readAll(`${RETURN} It gains haste.`, 'artifact');
    expect(parsed.abilities).toMatchObject([
      {
        effect: {
          effects: [
            RETURN_AST,
            {
              kind: 'grantKeyword',
              objects: MOVED,
              keyword: { kind: 'haste' },
              duration: 'permanent',
            },
          ],
        },
      },
    ]);
  });

  test.each([
    ['It gains flying.', 'flying'],
    ['It gains lifelink.', 'lifelink'],
  ])('another keyword for good (SYNTHETIC): %s', (sentence, kind) => {
    const parsed = readAll(`${RETURN} ${sentence}`, 'artifact');
    expect(parsed.abilities).toMatchObject([
      {
        effect: {
          effects: [{}, { kind: 'grantKeyword', keyword: { kind }, duration: 'permanent' }],
        },
      },
    ]);
  });

  test('the delayed exile alone after a return (SYNTHETIC)', () => {
    const parsed = readAll(`${RETURN} Exile it at the beginning of the next end step.`, 'artifact');
    expect(parsed.abilities).toMatchObject([
      {
        effect: {
          effects: [
            RETURN_AST,
            {
              kind: 'delayedTrigger',
              at: { step: 'endStep', whose: 'each' },
              effect: { kind: 'exile', objects: MOVED },
            },
          ],
        },
      },
    ]);
  });

  test('the replacement alone after a return (SYNTHETIC)', () => {
    const parsed = readAll(
      `${RETURN} If it would leave the battlefield, exile it instead of putting it anywhere else.`,
      'artifact',
    );
    expect(parsed.abilities).toMatchObject([
      { effect: { effects: [RETURN_AST, { kind: 'exileIfLeaves', objects: MOVED }] } },
    ]);
  });

  test('a triggered ability says the same after a return (SYNTHETIC)', () => {
    const parsed = readAll(
      'When this creature enters, return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step.',
      'creature',
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'triggered',
        effect: {
          effects: [
            { kind: 'moveToZone', to: 'battlefield' },
            { kind: 'grantKeyword', objects: MOVED, duration: 'permanent' },
            { kind: 'delayedTrigger', effect: { kind: 'exile', objects: MOVED } },
          ],
        },
      },
    ]);
  });

  test.each([
    // "it" is not what a move put onto the battlefield
    '{T}: Destroy target creature. It gains haste.',
    '{T}: Destroy target creature. Exile it at the beginning of the next end step.',
    '{T}: Destroy target creature. If it would leave the battlefield, exile it instead of putting it anywhere else.',
    '{T}: Tap target creature. It gains haste.',
    '{T}: Exile target creature. It gains haste.',
    // other words
    `${RETURN} It also gains haste.`,
    `${RETURN} They gain haste.`,
    `${RETURN} Exile it at the beginning of your next end step.`,
    `${RETURN} Exile it at the beginning of the next end step and draw a card.`,
    `${RETURN} Sacrifice it at the beginning of the next end step.`,
    `${RETURN} If it would die, exile it instead of putting it anywhere else.`,
    `${RETURN} If it would leave the battlefield, exile it instead.`,
    `${RETURN} If it would leave the battlefield this turn, exile it instead of putting it anywhere else.`,
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'artifact');
  });

  test('a line whose last sentence says the replacement is an activated ability, not a replacement effect of the card', () => {
    // "would ... instead" starts a replacement effect, but a line with a cost before the colon and the rider after a sentence is the ability's own text
    const parsed = read(
      `${RETURN} If it would leave the battlefield, exile it instead of putting it anywhere else.`,
      'artifact',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toHaveLength(1);
  });

  test('needs the engine to run a delayed trigger, the replacement and a granted keyword', () => {
    for (const ref of ['effect:delayedTrigger', 'effect:exileIfLeaves', 'effect:grantKeyword']) {
      const missing = withoutFeature(ref, REAL, 'artifact');
      expect(missing.reason, ref).toBe('notRunnable');
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});

describe('Embalmer\'s Tools: "Activated abilities of creature cards in your graveyard cost {1} less to activate." (D-461, CR 601.2f, 113.6b, 118.7)', () => {
  const LINE = 'Activated abilities of creature cards in your graveyard cost {1} less to activate.';

  test('the real line: a static ability that reduces the abilities of your graveyard creature cards', () => {
    const parsed = readAll(LINE, 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'ofObjects',
          objects: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          amount: 1,
        },
      },
    ]);
  });

  test.each([
    [
      'Activated abilities of creature cards in your graveyard cost {2} less to activate.',
      ['creature'],
      2,
    ],
    [
      'Activated abilities of artifact cards in your graveyard cost {1} less to activate.',
      ['artifact'],
      1,
    ],
    ['Activated abilities of land cards in your graveyard cost {1} less to activate.', ['land'], 1],
  ])('another amount or card type (SYNTHETIC): %s', (text, types, amount) => {
    expect(readAll(text, 'artifact').abilities).toMatchObject([
      { static: { kind: 'abilityCostReduction', objects: { types, zone: 'graveyard' }, amount } },
    ]);
  });

  test.each([
    'Activated abilities of creature cards in your graveyard cost {X} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {B} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {0} less to activate.',
    'Activated abilities of creature cards in a graveyard cost {1} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} more to activate.',
    'Activated abilities of creatures you control cost {1} less to activate.',
    'Activated abilities of cards in your graveyard cost {1} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1}{B} less to activate.',
    'Activated abilities of creature cards in your graveyard cost {1} less to activate for each Zombie you control.',
    'As long as you control a Zombie, activated abilities of creature cards in your graveyard cost {1} less to activate.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'artifact');
  });

  test('needs the engine static ability', () => {
    const missing = withoutFeature('static:abilityCostReduction', LINE, 'artifact');
    expect(missing.reason).toBe('notRunnable');
    expect(DECLARED_NEEDS).toContain('static:abilityCostReduction');
  });
});

describe('Tetzimoc: "{B}, Reveal this card from your hand: ... Activate only during your turn." (D-462, CR 701.20a, 113.6b, 602.5b)', () => {
  const LINE =
    '{B}, Reveal this card from your hand: Put a prey counter on target creature. Activate only during your turn.';

  test('the real line: an ability that works from the hand, with a reveal cost, only in your turn', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['B'] }, { kind: 'revealThis' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: { kind: 'addCounters', objects: T1, counter: 'prey', count: 1 },
        functionsIn: 'hand',
        activateOnlyIf: { kind: 'yourTurn' },
      },
    ]);
  });

  test('the cost alone, and the restriction alone (SYNTHETIC)', () => {
    expect(readAll('Reveal this card from your hand: Draw a card.', 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'revealThis' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        functionsIn: 'hand',
      },
    ]);
    expect(
      readAll('{T}: Draw a card. Activate only during your turn.', 'artifact').abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        activateOnlyIf: { kind: 'yourTurn' },
      },
    ]);
  });

  test.each([
    '{B}, Reveal this card from your hand: Draw a card. Activate only as an instant.',
    '{B}, Reveal this card: Draw a card.',
    '{B}, Reveal ~ from your hand: Draw a card.',
    '{B}, Reveal a card from your hand: Draw a card.',
    '{B}, Reveal this card from your graveyard: Draw a card.',
    '{B}, Reveal this card from your hand and discard it: Draw a card.',
    '{B}: Draw a card. Activate only during an opponent’s turn.',
    '{B}: Draw a card. Activate only during your main phase.',
    '{B}: Draw a card. Activate only during your turn and only as a sorcery.',
    '{B}: Draw a card. Activate only during your turn, before attackers are declared.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'creature');
  });

  test('a reveal cost is only the cost of an ordinary activated ability, never of a mana ability', () => {
    NOT_READ('Reveal this card from your hand: Add {B}.', 'creature');
  });

  test('needs the engine cost and the condition of the turn', () => {
    expect(withoutFeature('cost:revealThis', LINE, 'creature').reason).toBe('notRunnable');
    expect(withoutFeature('ability:activateOnlyIf', LINE, 'creature').reason).toBe('notRunnable');
    expect(withoutFeature('condition:yourTurn', LINE, 'creature').reason).toBe('notRunnable');
  });
});

describe('Ghost Vacuum: the cards exiled with ~ put onto the battlefield (D-460, CR 607.2a, 113.7a, 122.6, 613.1d, 613.4b)', () => {
  const EXILE = '{T}: Exile target card from a graveyard.';
  const PUT =
    '{6}, {T}, Sacrifice ~: Put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it. Each of them is a 1/1 Spirit in addition to its other types. Activate only as a sorcery.';

  test('the real two lines: the exile is linked to the permanent and the second puts the creature cards back as Spirits', () => {
    const parsed = readAll(`${EXILE}\n${PUT}`, 'artifact');
    expect(parsed.abilities).toMatchObject([
      { kind: 'activated', effect: { kind: 'exile', linked: true } },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['6'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'moveToZone',
              objects: { kind: 'linkedExile', filter: { types: ['creature'] } },
              to: 'battlefield',
              controller: 'you',
              withCounters: { counter: 'flying', count: 1 },
            },
            {
              kind: 'setTypes',
              objects: MOVED,
              types: ['creature'],
              subtypes: ['Spirit'],
              additive: true,
              basePt: { power: 1, toughness: 1 },
              duration: 'permanent',
            },
          ],
        },
        timing: 'sorcery',
      },
    ]);
  });

  test.each([
    [
      'put each creature card exiled with ~ onto the battlefield under your control',
      undefined,
      'creature',
    ],
    [
      'put each artifact card exiled with ~ onto the battlefield under your control with a flying counter on it',
      'flying',
      'artifact',
    ],
    [
      'put each creature card exiled with ~ onto the battlefield under your control with a +1/+1 counter on it',
      '+1/+1',
      'creature',
    ],
  ])('the other words (SYNTHETIC): %s', (clause, counter, type) => {
    const parsed = readAll(
      `${EXILE}\n{6}, {T}, Sacrifice ~: ${clause[0]?.toUpperCase()}${clause.slice(1)}.`,
      'artifact',
    );
    expect(parsed.abilities[1]).toMatchObject({
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'linkedExile', filter: { types: [type] } },
        to: 'battlefield',
        ...(counter === undefined ? {} : { withCounters: { counter, count: 1 } }),
      },
    });
  });

  test.each([
    'Put each card exiled with ~ onto the battlefield under your control.',
    'Put a creature card exiled with ~ onto the battlefield under your control.',
    "Put each creature card exiled with ~ onto the battlefield under its owner's control.",
    'Put each creature card exiled with ~ onto the battlefield.',
    'Put each creature card exiled with ~ onto the battlefield under your control tapped.',
    'Put each creature card exiled with ~ into your hand.',
    'Put each creature card exiled with that creature onto the battlefield under your control.',
    'Put each creature card exiled with ~ onto the battlefield under your control with two flying counters on it.',
  ])('near misses are not read, never half read: %s', (put) => {
    SECOND_NOT_READ(`${EXILE}\n{6}, {T}, Sacrifice ~: ${put}`);
  });

  test('the ability that reads the cards needs exactly one ability that exiles them (never guessed)', () => {
    NOT_READ(PUT, 'artifact');
    const two = read(`${EXILE}\n{1}, {T}: Exile target card from a graveyard.\n${PUT}`, 'artifact');
    expect(two.unparsed).toHaveLength(1);
    expect(two.abilities).toHaveLength(2);
  });

  test('needs the engine to put the cards onto the battlefield and to give them the type and the base power and toughness', () => {
    for (const ref of ['effect:moveToZone', 'effect:setTypes']) {
      const missing = withoutFeature(ref, `${EXILE}\n${PUT}`, 'artifact');
      expect(missing.reason, ref).toBe('notRunnable');
    }
    expect(DECLARED_NEEDS).toContain('effect:setTypes');
  });
});

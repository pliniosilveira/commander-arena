// Validation of what the counter group A of the Final Fantasy X deck needs: the conditions `counterPutOnThisThisTurn` and `subjectPowerLessThanThis`, `putCountersOf` of the `triggerSubject`,
// `cantBeBlockedByPlayer` of the `triggerSubject`, the effect `delayedDies`, and `upToAmount` of `enteredX` in the enters trigger of the permanent itself. Well-formed and executable
// (validateCard). Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Condition,
  type Effect,
  type TargetSpec,
  type Trigger,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };

function card(types: ('enchantment' | 'creature' | 'artifact')[], ...abilities: Ability[]) {
  return singleFaceCard({
    name: 'SYNTHETIC Counter Probe',
    manaCost: ['1'],
    types,
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
  });
}

const triggered = (
  trigger: Trigger,
  effect: Effect = draw,
  extra: Partial<Extract<Ability, { kind: 'triggered' }>> = {},
): Ability => ({ kind: 'triggered', trigger, effect, ...extra });

const messages = (c: CardDefinition) => validateCard(c).map((i) => i.message);

const ENTERS: Trigger = { kind: 'entersBattlefield', what: { types: ['creature'], other: true } };
const END_STEP: Trigger = { kind: 'endStep', whose: 'you' };
const LEAVES: Trigger = {
  kind: 'leavesBattlefield',
  what: { controller: 'you', hasCounter: true },
};
const PUT: Trigger = { kind: 'countersAdded', what: { types: ['creature'] }, by: 'you' };

describe('counterPutOnThisThisTurn (CR 122.6, 603.4)', () => {
  test('is the intervening "if" of a triggered ability, with or without a kind', () => {
    for (const condition of [
      { kind: 'counterPutOnThisThisTurn' },
      { kind: 'counterPutOnThisThisTurn', counter: '+1/+1' },
    ] as Condition[]) {
      expect(
        validateCard(card(['creature'], triggered(END_STEP, draw, { interveningIf: condition }))),
      ).toEqual([]);
    }
  });

  test('a kind of counter is a non-empty string', () => {
    const bad = { kind: 'counterPutOnThisThisTurn', counter: '' } as Condition;
    expect(
      messages(card(['creature'], triggered(END_STEP, draw, { interveningIf: bad }))),
    ).toContain('counter must be a non-empty string when present');
  });
});

describe('subjectPowerLessThanThis (CR 208.1, 608.2c)', () => {
  const conditional = (trigger: Trigger): Ability =>
    triggered(trigger, {
      kind: 'conditional',
      condition: { kind: 'subjectPowerLessThanThis' },
      effect: draw,
    });

  test('is read in a conditional effect of a trigger about a permanent', () => {
    expect(validateCard(card(['creature'], conditional(ENTERS)))).toEqual([]);
  });

  test('a trigger with no permanent as its subject has nothing to compare', () => {
    expect(
      messages(card(['creature'], conditional({ kind: 'step', step: 'upkeep', whose: 'you' }))),
    ).toContain(
      'subjectPowerLessThanThis reads the permanent the trigger is about: it is only valid in the effect of a trigger about a permanent',
    );
  });

  test('it is not a condition of the event itself (a triggerCondition)', () => {
    const ability = triggered(ENTERS, draw, {
      triggerCondition: { kind: 'subjectPowerLessThanThis' },
    });
    expect(messages(card(['creature'], ability))).toContain(
      'subjectPowerLessThanThis is read as an intervening "if"',
    );
  });
});

describe('putCountersOf of the triggerSubject (CR 603.10a, 113.7a)', () => {
  const target: TargetSpec = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
  };
  const move: Effect = {
    kind: 'putCountersOf',
    from: { kind: 'triggerSubject' },
    to: { kind: 'target', id: 't1' },
  };

  test('validates in a trigger about a permanent that left', () => {
    expect(
      validateCard(card(['enchantment'], triggered(LEAVES, move, { targets: [target] }))),
    ).toEqual([]);
  });

  test('needs a trigger that has a permanent as its subject', () => {
    expect(
      messages(
        card(
          ['enchantment'],
          triggered({ kind: 'step', step: 'upkeep', whose: 'you' }, move, { targets: [target] }),
        ),
      ),
    ).toContain("'triggerSubject' needs a triggered ability whose trigger has a subject");
  });

  test('another source than this, the sacrificed permanent or the triggering permanent is refused', () => {
    const bad = { ...move, from: { kind: 'moved' } } as unknown as Effect;
    expect(
      messages(card(['enchantment'], triggered(LEAVES, bad, { targets: [target] }))),
    ).toContain("putCountersOf takes the counters of 'this', 'sacrificedCost' or 'triggerSubject'");
  });
});

describe('cantBeBlockedByPlayer of the triggerSubject (CR 509.1b)', () => {
  const effect: Effect = {
    kind: 'cantBeBlockedByPlayer',
    objects: { kind: 'triggerSubject' },
    player: { kind: 'eachOpponent' },
  };

  test('validates in a trigger about a permanent', () => {
    expect(validateCard(card(['creature'], triggered(PUT, effect)))).toEqual([]);
  });

  test('a trigger with no permanent as its subject refuses it', () => {
    expect(
      messages(
        card(['creature'], triggered({ kind: 'step', step: 'upkeep', whose: 'you' }, effect)),
      ),
    ).toContain("'triggerSubject' needs a triggered ability whose trigger has a subject");
  });
});

describe('delayedDies (CR 603.7, 603.7c, 603.10a)', () => {
  const target: TargetSpec = {
    id: 't1',
    what: {
      kind: 'object',
      filter: { zone: 'battlefield', types: ['creature'], hasCounter: true },
    },
  };
  const returned: Effect = { kind: 'moveToZone', objects: { kind: 'triggerCard' }, to: 'hand' };
  const delayed = (effect: Effect): Ability => ({
    kind: 'activated',
    cost: [{ kind: 'mana', symbols: ['1'] }],
    targets: [target],
    effect: { kind: 'delayedDies', objects: { kind: 'target', id: 't1' }, effect },
  });

  test('returning the card the permanent became to its owner hand validates', () => {
    expect(validateCard(card(['enchantment'], delayed(returned)))).toEqual([]);
  });

  test('another effect is refused: only the return of the card to the hand is run', () => {
    expect(messages(card(['enchantment'], delayed(draw)))).toContain(
      "a delayedDies returns the card the permanent became to its owner's hand: a moveToZone of 'triggerCard' to 'hand'",
    );
    expect(
      messages(card(['enchantment'], delayed({ ...returned, to: 'exile' } as Effect))),
    ).toContain(
      "a delayedDies returns the card the permanent became to its owner's hand: a moveToZone of 'triggerCard' to 'hand'",
    );
  });
});

describe('upToAmount of enteredX in the enters trigger of the permanent itself (CR 107.3m)', () => {
  const slot: TargetSpec = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'], other: true } },
    upToAmount: { kind: 'enteredX' },
  };
  const counters: Effect = {
    kind: 'addCounters',
    objects: { kind: 'target', id: 't1' },
    counter: '+1/+1',
    count: 1,
  };
  const xCard = (trigger: Trigger) =>
    singleFaceCard({
      name: 'SYNTHETIC Support Probe',
      manaCost: ['X', 'U'],
      types: ['artifact'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: '',
      abilities: [triggered(trigger, counters, { targets: [slot] })],
    });

  test('"When this artifact enters, support X" validates', () => {
    expect(validateCard(xCard({ kind: 'entersBattlefield', what: { kind: 'this' } }))).toEqual([]);
  });

  test('the enters trigger of another permanent does not read the X of this one', () => {
    expect(
      messages(xCard({ kind: 'entersBattlefield', what: { types: ['creature'], other: true } })),
    ).toContain(
      "'enteredX' needs a triggered ability whose trigger is this permanent entering the battlefield",
    );
  });
});

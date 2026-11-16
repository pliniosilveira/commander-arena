// Validation of the nodes of group 1 of the Hylda deck (D-1500 to D-1504): the fields of the `becomesTapped` trigger, the `scries` trigger, the `reflexive` effect after a payment and with
// modes, the target slot `upToTriggerAmount` and the protection `cardTypeOfChoice`. A node that the engine does not run (or runs in one place only) is refused with a message, never
// accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

/** The card with the first ability replaced by `ability` (or, with `index`, the one at that index). */
function withAbility(name: string, ability: unknown, index = 0): CardDefinition {
  const card = syntheticCard(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  const abilities = face.abilities.map((a, i) => (i === index ? ability : a));
  return { ...card, faces: [{ ...face, abilities }] } as never;
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const WARLOCK = 'SYNTHETIC Frost Warlock';
const MERFOLK = 'SYNTHETIC Numbing Merfolk';
const PILOT = 'SYNTHETIC Tide Pilot';
const HALFLING = 'SYNTHETIC Citadel Halfling';
const OPPONENT_CREATURE = { types: ['creature'], controller: 'opponent' };
const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 };

const triggered = (trigger: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'triggered',
  trigger,
  effect: DRAW,
  ...extra,
});

describe('the fields of "becomes tapped"', () => {
  test('the real shapes are valid', () => {
    for (const trigger of [
      { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you' },
      { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'opponent' },
      { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you', batch: true },
      { kind: 'becomesTapped', what: OPPONENT_CREATURE, notAsAttacker: true },
      { kind: 'becomesTapped', what: { kind: 'this' }, notAsAttacker: true },
    ]) {
      expect(messages(withAbility(WARLOCK, triggered(trigger))), JSON.stringify(trigger)).toEqual(
        [],
      );
    }
  });

  test.each([
    [{ kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'anyone' }, 'unknown player'],
    [{ kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'any' }, 'unknown player'],
    [{ kind: 'becomesTapped', what: OPPONENT_CREATURE, batch: false }, 'batch must be true'],
    [
      { kind: 'becomesTapped', what: OPPONENT_CREATURE, notAsAttacker: false },
      'notAsAttacker must be true',
    ],
    [{ kind: 'becomesTapped', what: { kind: 'this' }, batch: true }, 'needs a filter'],
    [{ kind: 'becomesTapped', what: { kind: 'attached' }, batch: true }, 'needs a filter'],
  ])('%j is refused: %s', (trigger, text) => {
    expect(messages(withAbility(WARLOCK, triggered(trigger))).join(' | ')).toContain(text);
  });
});

describe('"whenever you scry"', () => {
  test.each(['you', 'opponent', 'any'])(
    'who %s is valid, and "that many" is the cards looked at',
    (who) => {
      const ability = triggered(
        { kind: 'scries', who },
        {
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'triggerDamage' } },
        },
      );
      expect(messages(withAbility(WARLOCK, ability))).toEqual([]);
    },
  );

  test('another player is refused', () => {
    expect(
      messages(withAbility(WARLOCK, triggered({ kind: 'scries', who: 'everyone' }))).join(' | '),
    ).toContain('unknown player');
  });
});

describe('the target slot of up to as many targets as the trigger says', () => {
  const slot = (extra: Record<string, unknown> = {}) => ({
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
    upToTriggerAmount: true,
    ...extra,
  });
  const tap = { kind: 'tap', objects: { kind: 'target', id: 't1' } };

  test('valid on a scry trigger', () => {
    expect(
      messages(
        withAbility(
          PILOT,
          triggered({ kind: 'scries', who: 'you' }, { targets: [slot()], effect: tap }),
          1,
        ),
      ),
    ).toEqual([]);
  });

  test.each([
    [
      'another trigger',
      { kind: 'attacks', what: { kind: 'this' } },
      {},
      'only a slot of a triggered ability whose event carries a number',
    ],
    ['a minimum', { kind: 'scries', who: 'you' }, { min: 0 }, 'has no min, max or other count'],
    ['a maximum', { kind: 'scries', who: 'you' }, { max: 2 }, 'has no min, max or other count'],
    [
      'any number',
      { kind: 'scries', who: 'you' },
      { anyNumber: true },
      'has no min, max or other count',
    ],
    ['false', { kind: 'scries', who: 'you' }, { upToTriggerAmount: false }, 'must be true'],
  ])('%s is refused', (_label, trigger, extra, text) => {
    const ability = triggered(trigger, { targets: [slot(extra)], effect: tap });
    expect(messages(withAbility(PILOT, ability, 1)).join(' | ')).toContain(text);
  });
});

describe('the reflexive ability after a payment, and with modes', () => {
  const payThen = (inner: Record<string, unknown>) =>
    triggered(
      { kind: 'attacks', what: { kind: 'this' } },
      {
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: inner,
        },
      },
    );
  const MODES = [
    { text: 'Draw a card.', effect: DRAW },
    { text: 'Scry 1.', effect: { kind: 'scry', count: 1 } },
  ];

  test('the modal reflexive ability of the real card is valid', () => {
    expect(messages(syntheticCard(WARLOCK))).toEqual([]);
    expect(
      messages(
        withAbility(
          WARLOCK,
          payThen({
            kind: 'reflexive',
            afterPayment: true,
            effect: { kind: 'sequence', effects: [] },
            modes: MODES,
            chooseModes: { min: 1, max: 1 },
          }),
        ),
      ),
    ).toEqual([]);
  });

  test('after a payment with its own effect is valid', () => {
    expect(
      messages(
        withAbility(WARLOCK, payThen({ kind: 'reflexive', afterPayment: true, effect: DRAW })),
      ),
    ).toEqual([]);
  });

  test.each([
    [
      'afterPayment outside a mayPay',
      triggered(
        { kind: 'attacks', what: { kind: 'this' } },
        {
          effect: { kind: 'reflexive', afterPayment: true, effect: DRAW },
        },
      ),
      'is the effect of a mayPay',
    ],
    [
      'afterPayment false',
      payThen({ kind: 'reflexive', afterPayment: false, effect: DRAW }),
      'afterPayment must be true',
    ],
    [
      'afterPayment with ifThisWay',
      payThen({ kind: 'reflexive', afterPayment: true, ifThisWay: 'exiledNonland', effect: DRAW }),
      'what triggers it is the payment',
    ],
    [
      'modes with an effect of their own',
      payThen({
        kind: 'reflexive',
        afterPayment: true,
        effect: DRAW,
        modes: MODES,
        chooseModes: { min: 1, max: 1 },
      }),
      'effect is the empty sequence',
    ],
    [
      'modes with targets of their own',
      payThen({
        kind: 'reflexive',
        afterPayment: true,
        effect: { kind: 'sequence', effects: [] },
        targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
        modes: MODES,
        chooseModes: { min: 1, max: 1 },
      }),
      'declares targets on each mode',
    ],
    [
      'one mode',
      payThen({
        kind: 'reflexive',
        afterPayment: true,
        effect: { kind: 'sequence', effects: [] },
        modes: [MODES[0]],
        chooseModes: { min: 1, max: 1 },
      }),
      'at least two modes',
    ],
    [
      'modes with no chooseModes',
      payThen({
        kind: 'reflexive',
        afterPayment: true,
        effect: { kind: 'sequence', effects: [] },
        modes: MODES,
      }),
      'must say how many modes',
    ],
  ])('%s is refused', (_label, ability, text) => {
    expect(messages(withAbility(WARLOCK, ability)).join(' | ')).toContain(text);
  });

  test('a reflexive ability with no "may" and no payment before it is still refused', () => {
    expect(
      messages(
        withAbility(
          WARLOCK,
          triggered(
            { kind: 'attacks', what: { kind: 'this' } },
            {
              effect: { kind: 'reflexive', effect: DRAW },
            },
          ),
        ),
      ).join(' | '),
    ).toContain('needs a "may" effect before it');
  });
});

describe('protection from the card type of your choice', () => {
  const grant = (keyword: unknown) => ({
    kind: 'activated',
    cost: [{ kind: 'tap' }],
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'grantKeyword',
      objects: { kind: 'target', id: 't1' },
      keyword,
      duration: 'untilEndOfTurn',
    },
  });

  test('a grant is valid, as the real card has it', () => {
    expect(messages(syntheticCard(HALFLING))).toEqual([]);
    expect(
      messages(withAbility(HALFLING, grant({ kind: 'protection', from: 'cardTypeOfChoice' }), 2)),
    ).toEqual([]);
  });

  test('a printed keyword and a static grant cannot carry it: nothing there asks', () => {
    expect(
      messages(
        withAbility(
          HALFLING,
          { kind: 'keyword', keyword: { kind: 'protection', from: 'cardTypeOfChoice' } },
          0,
        ),
      ).join(' | '),
    ).toContain('unknown protection quality');
    expect(
      messages(
        withAbility(
          HALFLING,
          {
            kind: 'static',
            static: {
              kind: 'grantKeyword',
              subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
              keyword: { kind: 'protection', from: 'cardTypeOfChoice' },
            },
          },
          0,
        ),
      ).join(' | '),
    ).toContain('chosen as an effect resolves');
  });

  test('a mixed-up word is still refused', () => {
    expect(
      messages(
        withAbility(HALFLING, grant({ kind: 'protection', from: 'cardTypesOfChoice' }), 2),
      ).join(' | '),
    ).toContain('an effect cannot give protection from');
  });
});

describe('the Merfolk of the group is valid', () => {
  test('both abilities', () => {
    expect(messages(syntheticCard(MERFOLK))).toEqual([]);
  });
});

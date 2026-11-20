// Validation of what the counter triggers of the Blight Curse deck need (Lorwyn Eclipsed): `countersAdded` with `each`, the conditions `subjectControlledByYou`, `subjectStat` and
// `putCountersThisTurn`, the player selector `eachPlayerExcept`, the amount `countersOn` with no kind, and the filter flag `notTriggerCard`. Well-formed and executable (validateCard).
// Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import {
  type Ability,
  type CardDefinition,
  type Condition,
  type Effect,
  type Trigger,
  validateCard,
} from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };

function enchantment(...abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Counter Probe',
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
}

const triggered = (
  trigger: Trigger,
  effect: Effect = draw,
  extra: Partial<Extract<Ability, { kind: 'triggered' }>> = {},
): Ability => ({ kind: 'triggered', trigger, effect, ...extra });

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

const CREATURE_DIES: Trigger = { kind: 'dies', what: { types: ['creature'] } };
const PUT: Trigger = { kind: 'countersAdded', what: { types: ['creature'] }, by: 'any' };

describe('countersAdded with `each` (CR 122.6, 603.2)', () => {
  test('one trigger for each counter validates, with or without a kind', () => {
    expect(validateCard(enchantment(triggered({ ...PUT, counter: '-1/-1', each: true })))).toEqual(
      [],
    );
    expect(validateCard(enchantment(triggered({ ...PUT, each: true })))).toEqual([]);
  });

  test('each is true when present, and does not go with reaches', () => {
    expect(
      messages(
        enchantment(triggered({ ...PUT, counter: 'hour', each: false } as unknown as Trigger)),
      ),
    ).toContain('each must be true when present');
    expect(
      messages(enchantment(triggered({ ...PUT, counter: 'hour', reaches: 3, each: true }))),
    ).toContain('each does not go with reaches');
  });
});

describe('the conditions of a trigger about a permanent', () => {
  const controlled: Condition = { kind: 'subjectControlledByYou' };
  const toughness: Condition = {
    kind: 'subjectStat',
    stat: 'toughness',
    compare: { cmp: 'atMost', value: 0 },
  };

  test('as the intervening "if" of a trigger about a permanent they validate', () => {
    for (const c of [controlled, toughness, { kind: 'not', term: controlled } as Condition]) {
      expect(
        validateCard(enchantment(triggered(CREATURE_DIES, draw, { interveningIf: c }))),
        c.kind,
      ).toEqual([]);
    }
  });

  test('a trigger about no permanent has nothing for them to read', () => {
    const upkeep: Trigger = { kind: 'endStep', whose: 'you' };
    expect(
      messages(enchantment(triggered(upkeep, draw, { interveningIf: controlled }))).join('\n'),
    ).toMatch(/subjectControlledByYou reads the permanent the event is about/);
    expect(
      messages(enchantment(triggered(upkeep, draw, { interveningIf: toughness }))).join('\n'),
    ).toMatch(/subjectStat reads the permanent the event is about/);
  });

  test('in a conditional effect of a trigger about a permanent, and not of one about none', () => {
    const conditional: Effect = { kind: 'conditional', condition: controlled, effect: draw };
    expect(validateCard(enchantment(triggered(PUT, conditional)))).toEqual([]);
    expect(
      messages(enchantment(triggered({ kind: 'endStep', whose: 'you' }, conditional))).join('\n'),
    ).toMatch(/only valid in the effect of a trigger about a permanent/);
  });

  test('they are read as an intervening "if", not as a condition of the event', () => {
    expect(
      messages(enchantment(triggered(CREATURE_DIES, draw, { triggerCondition: controlled }))).join(
        '\n',
      ),
    ).toMatch(/subjectControlledByYou is read as an intervening "if"/);
  });

  test('subjectStat names power or toughness and a comparison with a whole number', () => {
    const bad = (c: unknown) =>
      messages(enchantment(triggered(CREATURE_DIES, draw, { interveningIf: c as Condition }))).join(
        '\n',
      );
    expect(
      bad({ kind: 'subjectStat', stat: 'loyalty', compare: { cmp: 'atMost', value: 0 } }),
    ).toMatch(/unknown stat loyalty/);
    expect(
      bad({ kind: 'subjectStat', stat: 'power', compare: { cmp: 'under', value: 0 } }),
    ).toMatch(/unknown comparison/);
    expect(
      bad({ kind: 'subjectStat', stat: 'power', compare: { cmp: 'atMost', value: 0.5 } }),
    ).toMatch(/compared with a whole number/);
  });

  test('putCountersThisTurn validates with a kind and a card type, or neither', () => {
    for (const c of [
      { kind: 'putCountersThisTurn' },
      { kind: 'putCountersThisTurn', onType: 'creature' },
      { kind: 'putCountersThisTurn', counter: '+1/+1', onType: 'land' },
    ] as Condition[]) {
      expect(
        validateCard(
          enchantment(triggered({ kind: 'endStep', whose: 'each' }, draw, { interveningIf: c })),
        ),
      ).toEqual([]);
    }
    const bad = (c: unknown) =>
      messages(
        enchantment(
          triggered({ kind: 'endStep', whose: 'each' }, draw, { interveningIf: c as Condition }),
        ),
      ).join('\n');
    expect(bad({ kind: 'putCountersThisTurn', counter: '' })).toMatch(
      /counter name must be non-empty/,
    );
    expect(bad({ kind: 'putCountersThisTurn', onType: 'spell' })).toMatch(
      /unknown card type spell/,
    );
  });
});

describe('eachPlayerExcept (CR 102.1)', () => {
  const owner = { kind: 'ownerOf', of: { kind: 'triggerSubject' } } as const;

  test('every player but the ones the inner selector names validates in a life loss', () => {
    const lose: Effect = {
      kind: 'loseLife',
      player: { kind: 'eachPlayerExcept', except: owner },
      amount: 1,
    };
    expect(validateCard(enchantment(triggered(CREATURE_DIES, lose)))).toEqual([]);
  });

  test('the inner selector is checked too', () => {
    const lose: Effect = {
      kind: 'loseLife',
      player: { kind: 'eachPlayerExcept', except: { kind: 'triggerPlayer' } },
      amount: 1,
    };
    expect(messages(enchantment(triggered(CREATURE_DIES, lose))).join('\n')).toMatch(
      /'triggerPlayer' needs a triggered ability whose event is about a player/,
    );
  });

  test('one player cannot win the game or become the monarch through it', () => {
    const win: Effect = { kind: 'winGame', player: { kind: 'eachPlayerExcept', except: owner } };
    expect(messages(enchantment(triggered(CREATURE_DIES, win))).join('\n')).toMatch(
      /only one player wins the game/,
    );
  });
});

describe('countersOn with no kind of counter (CR 122.1)', () => {
  test('the counters of every kind are an amount like any other', () => {
    const gain: Effect = {
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
    };
    expect(validateCard(enchantment(triggered(CREATURE_DIES, gain)))).toEqual([]);
  });

  test('a static ability condition reads one kind it names', () => {
    const card = singleFaceCard({
      name: 'SYNTHETIC Static Counter Probe',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: '',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'this' },
            keyword: { kind: 'flying' },
          },
          condition: {
            kind: 'amountIs',
            amount: { kind: 'countersOn', of: { kind: 'this' } },
            compare: { cmp: 'atLeast', value: 1 },
          },
        } as unknown as Ability,
      ],
    });
    expect(messages(card).join('\n')).toMatch(/names the kind of counter/);
  });
});

describe('mana value less than or equal to the counters on the permanent the trigger is about, and "another" (CR 122.1, 400.7, 603.10a)', () => {
  const returnCard: Effect = {
    kind: 'moveToZone',
    objects: { kind: 'target', id: 't1' },
    to: 'hand',
  };
  const ability = (trigger: Trigger, filter: object): Ability => ({
    kind: 'triggered',
    trigger,
    targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', ...filter } } }],
    effect: returnCard,
  });
  const LIMIT = { manaValueAtMost: { kind: 'countersOn', of: { kind: 'triggerSubject' } } };

  test('a trigger about a permanent may read the counters of its subject, and leave its card out', () => {
    expect(
      validateCard(enchantment(ability(CREATURE_DIES, { ...LIMIT, notTriggerCard: true }))),
    ).toEqual([]);
  });

  test('a trigger about a spell has no permanent for it', () => {
    const cast: Trigger = { kind: 'castSpell', by: 'you', filter: {} };
    expect(messages(enchantment(ability(cast, LIMIT))).join('\n')).toMatch(
      /needs a trigger about a permanent/,
    );
    expect(messages(enchantment(ability(cast, { notTriggerCard: true }))).join('\n')).toMatch(
      /notTriggerCard leaves out the card of the permanent the trigger is about/,
    );
  });

  test('the counters of this permanent are no limit of a filter, and notTriggerCard is true when present', () => {
    expect(
      messages(
        enchantment(
          ability(CREATURE_DIES, {
            manaValueAtMost: { kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' },
          }),
        ),
      ).join('\n'),
    ).toMatch(/the limit is a number/);
    expect(
      messages(enchantment(ability(CREATURE_DIES, { notTriggerCard: false }))).join('\n'),
    ).toMatch(/notTriggerCard must be true when present/);
  });
});

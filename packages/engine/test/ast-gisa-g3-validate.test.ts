// validateCard for the nodes of group 3 of the Gisa deck (D-484 to D-492): `sparePermanents` with `own`, the cost `sacrifice` with `countX` ("Sacrifice X creatures") and with
// `anyNumber` ("you may sacrifice one or more creatures"), the keyword `partnerWith`, the filter `named`, and the amount and condition `sacrificedAsCost`. Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Cost, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  COPY_FOR_EACH_SACRIFICED,
  SACRIFICE_X_ABILITY,
  SYNTHETIC_GISA_G3_LIST,
} from '../src/cards/fixtures/synthetic-gisa-g3';

function creature(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities,
  });
}

function instant(
  additionalCosts: readonly Cost[] | undefined,
  abilities: readonly Ability[],
  effect: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 },
): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Instant',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
    spell: { effect },
    ...(additionalCosts === undefined ? {} : { additionalCosts }),
  });
}

const activated = (cost: readonly Cost[], effect: Effect = DRAW): Ability => ({
  kind: 'activated',
  cost,
  effect,
});

const DRAW: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const CREATURES = { types: ['creature' as const] };
const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('the SYNTHETIC cards of the group are valid and supported', () => {
  test.each(SYNTHETIC_GISA_G3_LIST.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('"Sacrifice X creatures" (CR 107.3a, 602.2b): the cost sacrifice with countX', () => {
  test('the cost of an activated ability whose effect reads X is valid', () => {
    expect(validateCard(creature([SACRIFICE_X_ABILITY]))).toEqual([]);
  });

  test('its X may be read by the effect: a cost with no X announced refuses an X in the effect', () => {
    const noX = activated([{ kind: 'tap' }], {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'x' },
    });
    expect(messages(creature([noX])).length).toBeGreaterThan(0);
    const withX = activated([{ kind: 'sacrifice', what: CREATURES, countX: true }], {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'x' },
    });
    expect(validateCard(creature([withX]))).toEqual([]);
  });

  test('not with a count, not of the permanent itself, and countX is true or absent', () => {
    expect(
      messages(
        creature([activated([{ kind: 'sacrifice', what: CREATURES, count: 2, countX: true }])]),
      ),
    ).toContainEqual(expect.stringContaining('X or a count, not both'));
    expect(
      messages(
        creature([activated([{ kind: 'sacrifice', what: { kind: 'this' }, countX: true }])]),
      ),
    ).toContainEqual(expect.stringContaining('this permanent is sacrificed once: no X'));
    expect(
      messages(
        creature([
          activated([{ kind: 'sacrifice', what: CREATURES, countX: false as unknown as true }]),
        ]),
      ),
    ).toContainEqual(expect.stringContaining('countX must be true'));
  });

  test('not a cost of a mana ability, but valid as an additional cost of a spell', () => {
    expect(
      messages(
        creature([
          {
            kind: 'mana',
            cost: [{ kind: 'sacrifice', what: CREATURES, countX: true }],
            production: { kind: 'fixed', mana: ['B'] },
          },
        ]),
      ),
    ).toContainEqual(expect.stringContaining('no X'));
    expect(
      validateCard(instant([{ kind: 'sacrifice', what: CREATURES, countX: true }], [])),
    ).toEqual([]);
  });
});

describe('"you may sacrifice one or more creatures" (CR 118.8, 701.21a): the cost sacrifice with anyNumber', () => {
  test('the additional cost of a spell, read by the cast trigger of the spell, is valid', () => {
    const rite = SYNTHETIC_GISA_G3_LIST.find((c) => c.name === 'SYNTHETIC Forbidden Rite');
    expect(rite).toBeDefined();
    if (rite !== undefined) expect(validateCard(rite)).toEqual([]);
  });

  test('not with a count or an X, not of the permanent itself, and anyNumber is true or absent', () => {
    const cost = (extra: object): Cost =>
      ({ kind: 'sacrifice', what: CREATURES, ...extra }) as Cost;
    expect(messages(instant([cost({ anyNumber: true, count: 2 })], []))).toContainEqual(
      expect.stringContaining('no count and no X'),
    );
    expect(messages(instant([cost({ anyNumber: true, countX: true })], []))).toContainEqual(
      expect.stringContaining('no count and no X'),
    );
    expect(
      messages(instant([{ kind: 'sacrifice', what: { kind: 'this' }, anyNumber: true }], [])),
    ).toContainEqual(expect.stringContaining('this permanent is sacrificed once'));
    expect(messages(instant([cost({ anyNumber: false })], []))).toContainEqual(
      expect.stringContaining('anyNumber must be true'),
    );
  });

  test('it is the only sacrifice of the spell, and not part of a choice of costs', () => {
    expect(
      messages(
        instant(
          [
            { kind: 'sacrifice', what: CREATURES, anyNumber: true },
            { kind: 'sacrifice', what: { types: ['artifact'] } },
          ],
          [],
        ),
      ),
    ).toContainEqual(expect.stringContaining('only sacrifice cost of a spell'));
    const choice = singleFace({
      name: 'SYNTHETIC Test Choice',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      spell: { effect: DRAW },
      additionalCostChoice: [
        [{ kind: 'sacrifice', what: CREATURES, anyNumber: true }],
        [{ kind: 'payLife', amount: 3 }],
      ],
    });
    expect(messages(choice)).toContainEqual(
      expect.stringContaining('no "you may sacrifice any number"'),
    );
  });

  test('not the cost of an ability, of a mana ability', () => {
    expect(
      messages(creature([activated([{ kind: 'sacrifice', what: CREATURES, anyNumber: true }])])),
    ).toContainEqual(expect.stringContaining('"any number" is an additional cost of a spell'));
    expect(
      messages(
        creature([
          {
            kind: 'mana',
            cost: [{ kind: 'sacrifice', what: CREATURES, anyNumber: true }],
            production: { kind: 'fixed', mana: ['B'] },
          },
        ]),
      ),
    ).toContainEqual(expect.stringContaining('no "any number"'));
  });
});

describe('sacrificedAsCost, the amount and the condition (CR 118.8, 603.4, 113.7a)', () => {
  const OPTIONAL: Cost = { kind: 'sacrifice', what: CREATURES, anyNumber: true };

  test('the face needs a cost that sacrifices any number of permanents', () => {
    expect(messages(instant(undefined, [COPY_FOR_EACH_SACRIFICED]))).toContainEqual(
      expect.stringContaining('needs a cost that sacrifices any number of permanents'),
    );
    expect(validateCard(instant([OPTIONAL], [COPY_FOR_EACH_SACRIFICED]))).toEqual([]);
  });

  test('only the cast trigger of the spell itself reads it, or its text', () => {
    const attacks: Ability = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: { kind: 'sacrificedAsCost' },
      },
    };
    expect(messages(instant([OPTIONAL], [attacks]))).toContainEqual(
      expect.stringContaining('read by the spell'),
    );
    const text: Effect = {
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'sacrificedAsCost' },
    };
    expect(validateCard(instant([OPTIONAL], [], text))).toEqual([]);
  });

  test('a static ability cannot read it (it reads what the game says now through a layer)', () => {
    const lord: Ability = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'this' },
        power: { kind: 'sacrificedAsCost' },
        toughness: 0,
      },
    } as never;
    expect(messages(creature([lord]))).toContainEqual(
      expect.stringContaining('counts objects (countOf), not sacrificedAsCost'),
    );
  });
});

describe('sparePermanents with own (CR 608.2d, 701.21a, 101.4)', () => {
  const spare = (own: unknown): CardDefinition =>
    instant(undefined, [], {
      kind: 'sparePermanents',
      types: ['creature'],
      ...(own === undefined ? {} : { own }),
    } as unknown as Effect);

  test('each opponent or each player choose for themselves', () => {
    expect(validateCard(spare({ players: { kind: 'eachOpponent' } }))).toEqual([]);
    expect(validateCard(spare({ players: { kind: 'eachPlayer' } }))).toEqual([]);
  });

  test('another selector is refused', () => {
    expect(messages(spare({ players: { kind: 'you' } }))).toContainEqual(
      expect.stringContaining('each player or each opponent'),
    );
  });
});

describe('partnerWith (CR 702.124j)', () => {
  test('a name is needed', () => {
    expect(
      validateCard(
        creature([{ kind: 'keyword', keyword: { kind: 'partnerWith', name: 'Regna' } }]),
      ),
    ).toEqual([]);
    expect(
      messages(creature([{ kind: 'keyword', keyword: { kind: 'partnerWith', name: ' ' } }])),
    ).toContainEqual(expect.stringContaining('partner with names a card'));
  });

  test('it cannot be granted (a printed keyword)', () => {
    const grant: Ability = {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'this' },
        keyword: { kind: 'partnerWith', name: 'Regna' },
      },
    } as never;
    expect(messages(creature([grant]))).toContainEqual(
      expect.stringContaining('cannot grant partnerWith'),
    );
  });
});

describe('the filter named (CR 201.2)', () => {
  test('a name is a text, and a static ability does not read it', () => {
    const search = (named: unknown): Effect =>
      ({
        kind: 'search',
        player: { kind: 'you' },
        filter: { named },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        reveal: true,
        shuffle: true,
      }) as Effect;
    expect(validateCard(instant(undefined, [], search('Regna, the Redeemer')))).toEqual([]);
    expect(messages(instant(undefined, [], search('')))).toContainEqual(
      expect.stringContaining('named must be the name of a card'),
    );
    expect(messages(instant(undefined, [], search(7)))).toContainEqual(
      expect.stringContaining('named must be the name of a card'),
    );
    const lord: Ability = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { named: 'Regna, the Redeemer' } },
        power: 1,
        toughness: 1,
      },
    } as never;
    expect(messages(creature([lord]))).toContainEqual(
      expect.stringContaining('cannot read resolution-only values or compare power'),
    );
  });
});

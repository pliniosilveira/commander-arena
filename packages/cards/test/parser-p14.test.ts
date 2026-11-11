// Stage P14 (M6): the mana lines of the engine's "more mana production" slice (D-099, D-102). Each
// line is read through the whole pipeline and compared with the engine AST that
// `docs/MECHANICS.md` ("More mana production", "What the parser must produce") spells out, and each
// near miss says where it stops or why it is dropped. The lines are the real example lines of
// reports/template-replay.md (the owner's run) unless a note says SYNTHETIC; no real card is marked
// supported here. That the engine runs what is lowered is in convert-grammar-engine-p14.test.ts; that a
// missing engine feature is named, not guessed at, is in parser-p14-needs.test.ts.
import type { Ability } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const TAP = { kind: 'tap' } as const;
const mana = (...symbols: string[]) => ({ kind: 'mana', symbols }) as const;
const life = (amount: number) => ({ kind: 'payLife', amount }) as const;

/** The abilities of a line that read completely. */
const abilities = (text: string, type: FaceType = 'artifact'): readonly Ability[] =>
  readAll(text, type).abilities;

const manaAbility = (
  cost: readonly unknown[],
  production: unknown,
  more: Record<string, unknown> = {},
) => ({ kind: 'mana', cost, production, ...more });

const LANDS_YOU = { types: ['land'], controller: 'you' } as const;

describe('effect.add-mana: one mana that a land could produce (CR 106.7)', () => {
  test('"any color that a land an opponent controls could produce" leaves colorless out', () => {
    expect(
      abilities('{T}: Add one mana of any color that a land an opponent controls could produce.'),
    ).toEqual([
      manaAbility([TAP], {
        kind: 'couldProduce',
        lands: { types: ['land'], controller: 'opponent' },
      }),
    ]);
  });

  test('"any type that a land you control could produce" keeps colorless (CR 106.1b)', () => {
    expect(
      abilities('{T}: Add one mana of any type that a land you control could produce.'),
    ).toEqual([manaAbility([TAP], { kind: 'couldProduce', lands: LANDS_YOU, anyType: true })]);
  });

  test('"any color that a land you control could produce" is the other combination of the words', () => {
    // SYNTHETIC: no real line in the replay says exactly this; the grammar takes each word on its own.
    expect(
      abilities('{T}: Add one mana of any color that a land you control could produce.'),
    ).toEqual([manaAbility([TAP], { kind: 'couldProduce', lands: LANDS_YOU })]);
  });

  test.each([
    // The rider of Fellwar Stone's cousin: the engine has no "if it has a counter, add more instead".
    [
      '{T}: Add one mana of any type that a land you control could produce. If ~ has a +1/+1 counter on it, add three mana of that type instead.',
      'If ~ has a +1/+1 counter on it, add three mana of that type instead.',
    ],
    [
      '{T}: Add one mana of any color that a creature you control could produce.',
      'that a creature you control could produce.',
    ],
    [
      '{T}: Add one mana of any color that lands you control could produce.',
      'that lands you control could produce.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'artifact')).toMatchObject({ stoppedAt });
  });
});

describe('effect.add-mana: a choice among combinations (CR 605.3b)', () => {
  test('"{R}{R}, {R}{W}, or {W}{W}" is stored in the order W, U, B, R, G, C', () => {
    expect(abilities('{T}: Add {R}{R}, {R}{W}, or {W}{W}.', 'land')).toEqual([
      manaAbility([TAP], {
        kind: 'combination',
        options: [
          ['R', 'R'],
          ['W', 'R'],
          ['W', 'W'],
        ],
      }),
    ]);
  });

  test('two combinations are a choice too: the list keeps the text order, each is sorted, colorless last', () => {
    // SYNTHETIC: no real line in the replay has two.
    expect(abilities('{T}: Add {C}{G} or {W}{W}.', 'land')).toEqual([
      manaAbility([TAP], {
        kind: 'combination',
        options: [
          ['G', 'C'],
          ['W', 'W'],
        ],
      }),
    ]);
  });

  test.each([
    // One combination written twice (as a multiset), and a list with no "or".
    '{T}: Add {R}{W}, {W}{R}, or {R}{R}.',
    '{T}: Add {R}{R}, {R}{W}.',
    '{T}: Add {R}{R} or {R}{R}.',
    // A single mana among the pairs is a different shape that no card has.
    '{T}: Add {R}{R}, {W}, or {W}{W}.',
  ])('%s is not a choice of combinations', (text) => {
    expect(dropped(text, 'land')).toBeDefined();
  });
});

describe('cost.mana-hybrid: a hybrid symbol in the cost of a mana ability (CR 107.4e)', () => {
  test('the filter land of Shadowmoor and Eventide: the cost, then the combination', () => {
    expect(abilities('{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.', 'land')).toEqual([
      manaAbility([mana('R/W'), TAP], {
        kind: 'combination',
        options: [
          ['R', 'R'],
          ['W', 'R'],
          ['W', 'W'],
        ],
      }),
    ]);
  });

  test('a plain symbol before the hybrid one, and the hybrid symbol with a generic half', () => {
    // SYNTHETIC: no real line in the replay has these.
    expect(abilities('{1}{R/W}, {T}: Add {R}{R}.', 'land')).toEqual([
      manaAbility([mana('1', 'R/W'), TAP], { kind: 'fixed', mana: ['R', 'R'] }),
    ]);
    expect(abilities('{2/G}, {T}: Add {G}{W}.', 'land')).toEqual([
      manaAbility([mana('2/G'), TAP], { kind: 'fixed', mana: ['G', 'W'] }),
    ]);
  });

  test('a hybrid cost on an ordinary activation lowers since stage P15; a keyword cost does not', () => {
    expect(abilities('{R/W}: ~ gains first strike until end of turn.', 'creature')).toMatchObject([
      { kind: 'activated', cost: [mana('R/W')] },
    ]);
    expect(dropped('Cycling {R/W}', 'creature').stoppedAt).toBe('{R/W}');
  });

  test('a Phyrexian symbol is not read', () => {
    expect(dropped('{G/P}, {T}: Add {G}{G}.', 'land').stoppedAt).toBe('{G/P}, {T}: Add {G}{G}.');
  });
});

describe('restriction.if: "Activate only if <condition>." (CR 602.5b)', () => {
  test('on a mana ability: five or more lands', () => {
    expect(abilities('{T}: Add {C}{C}. Activate only if you control five or more lands.')).toEqual([
      manaAbility(
        [TAP],
        { kind: 'fixed', mana: ['C', 'C'] },
        {
          activateOnlyIf: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 5 },
        },
      ),
    ]);
  });

  test('on a mana ability: a Swamp (the land type is a subtype, CR 305.6)', () => {
    expect(abilities('{T}: Add {B} or {G}. Activate only if you control a Swamp.', 'land')).toEqual(
      [
        manaAbility(
          [TAP],
          { kind: 'oneOf', colors: ['B', 'G'] },
          {
            activateOnlyIf: { kind: 'controlsAtLeast', filter: { subtypes: ['Swamp'] }, count: 1 },
          },
        ),
      ],
    );
  });

  test('"a Swamp or a Mountain" is an `or` of two counts', () => {
    expect(
      abilities('{T}: Add {R}. Activate only if you control a Swamp or a Mountain.', 'land'),
    ).toEqual([
      manaAbility(
        [TAP],
        { kind: 'fixed', mana: ['R'] },
        {
          activateOnlyIf: {
            kind: 'or',
            terms: [
              { kind: 'controlsAtLeast', filter: { subtypes: ['Swamp'] }, count: 1 },
              { kind: 'controlsAtLeast', filter: { subtypes: ['Mountain'] }, count: 1 },
            ],
          },
        },
      ),
    ]);
  });

  test('on a mana ability that pays life: an artifact', () => {
    expect(
      abilities(
        '{T}, Pay 1 life: Add one mana of any color. Activate only if you control an artifact.',
        'land',
      ),
    ).toEqual([
      manaAbility(
        [TAP, life(1)],
        { kind: 'anyColor' },
        {
          activateOnlyIf: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 1 },
        },
      ),
    ]);
  });

  test('on an ordinary activated ability, after its effect', () => {
    expect(
      abilities(
        '{4}, {T}, Sacrifice ~: Search your library for an artifact card, reveal it, put it into your hand, then shuffle. Activate only if you control three or more artifacts.',
      ),
    ).toMatchObject([
      {
        kind: 'activated',
        cost: [mana('4'), TAP, { kind: 'sacrifice', what: { kind: 'this' } }],
        activateOnlyIf: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 3 },
      },
    ]);
  });

  test('"Activate only if you control a commander" is the engine condition of that name', () => {
    // SYNTHETIC: the replay has no line with this test on an activation.
    expect(
      abilities('{3}, {T}: Draw a card. Activate only if you control a commander.'),
    ).toMatchObject([{ kind: 'activated', activateOnlyIf: { kind: 'controlCommander' } }]);
  });

  test.each([
    // A test no condition rule reads, or one the engine's counts cannot say.
    [
      '{T}: Draw a card. Activate only if you created two tokens this turn.',
      'you created two tokens this turn.',
    ],
    [
      '{3}, {T}: Draw a card. Activate only if you control a creature with power greater than 3.',
      'with power greater than 3.',
    ],
    [
      '{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more creatures this turn.',
      'you attacked with two or more creatures this turn.',
    ],
  ])('%s stays unread', (text, stoppedAt) => {
    expect(dropped(text, 'artifact').stoppedAt).toBe(stoppedAt);
  });

  test('timing and per-turn limits are not conditions: the mana ability has no timing', () => {
    expect(dropped('{T}: Add {G}. Activate only as a sorcery.', 'artifact')).toMatchObject({
      reason: 'notRunnable',
      stoppedAt: 'Activate only as a sorcery.',
    });
    expect(dropped('{T}: Add {G}. Activate only once each turn.', 'artifact').stoppedAt).toBe(
      'Activate only once each turn.',
    );
    // An ordinary ability keeps its "as a sorcery" next to a condition in one sentence (stage P29), and no other limit.
    expect(
      dropped('{T}: Draw a card. Activate only if you control a Swamp and only once each turn.')
        .stoppedAt,
    ).toBe('and only once each turn.');
  });

  test('two conditions are not Oracle text and are not merged', () => {
    expect(
      dropped(
        '{T}: Add {G}. Activate only if you control a Swamp. Activate only if you control a Forest.',
        'land',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('cost: Pay N life on a mana ability (CR 119.4)', () => {
  test.each([
    ['{T}, Pay 1 life: Add one mana of any color.', { kind: 'anyColor' }, 1],
    ['{T}, Pay 1 life: Add {U} or {R}.', { kind: 'oneOf', colors: ['U', 'R'] }, 1],
    // SYNTHETIC: no real line in the replay pays two.
    ['{T}, Pay 2 life: Add {B}{B}.', { kind: 'fixed', mana: ['B', 'B'] }, 2],
  ])('%s', (text, production, amount) => {
    expect(abilities(text, 'land')).toEqual([manaAbility([TAP, life(amount)], production)]);
  });

  test('paying life twice, or with nothing to tap, is not a mana ability the engine has', () => {
    expect(dropped('{T}, Pay 1 life, Pay 1 life: Add {B}.', 'land')).toMatchObject({
      reason: 'notRunnable',
    });
    expect(dropped('Pay 1 life: Add {B}.', 'land')).toMatchObject({ reason: 'notRunnable' });
    expect(dropped('{T}, Pay 0 life: Add {B}.', 'land').stoppedAt).toBe('0 life: Add {B}.');
  });
});

describe('static.attached and static.permanents: a granted mana ability (CR 613.1f)', () => {
  const grant = (subject: unknown, ability: unknown): Ability =>
    ({ kind: 'static', static: { kind: 'grantAbility', subject, ability } }) as Ability;
  const anyColor = { kind: 'mana', cost: [TAP], production: { kind: 'anyColor' } };

  test('Lands you control have "{T}: Add one mana of any color."', () => {
    expect(abilities('Lands you control have "{T}: Add one mana of any color."')).toEqual([
      grant({ kind: 'filter', filter: LANDS_YOU }, anyColor),
    ]);
  });

  test('Creatures you control have "{T}: Add one mana of any color."', () => {
    expect(abilities('Creatures you control have "{T}: Add one mana of any color."')).toEqual([
      grant({ kind: 'filter', filter: { types: ['creature'], controller: 'you' } }, anyColor),
    ]);
  });

  test('Equipped creature has "{T}: Add {G}."', () => {
    expect(
      readAll('Equipped creature has "{T}: Add {G}."', 'artifact', ['Equipment']).abilities,
    ).toEqual([
      grant(
        { kind: 'attached', types: ['creature'] },
        { kind: 'mana', cost: [TAP], production: { kind: 'fixed', mana: ['G'] } },
      ),
    ]);
  });

  test('the quoted ability is read like one of the card: a life cost is kept', () => {
    // SYNTHETIC: no real line in the replay grants a cost.
    expect(
      abilities('Lands you control have "{T}, Pay 1 life: Add one mana of any color."'),
    ).toEqual([
      grant(
        { kind: 'filter', filter: LANDS_YOU },
        { kind: 'mana', cost: [TAP, life(1)], production: { kind: 'anyColor' } },
      ),
    ]);
  });

  test.each([
    // A mana ability the engine's own cannot carry: a rider, and a restriction inside the quotes.
    'Lands you control have "{T}: Add one mana of any color. Draw a card."',
    'Lands you control have "{T}: Add {G}. Activate only if you control a Forest."',
    // Not a quoted ability at all.
    'Lands you control have "Add {G}."',
  ])('%s is read as a grant and dropped whole', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('what each lowering declares it needs', () => {
  test.each([
    'ability:activateOnlyIf',
    'manaProduction:couldProduce',
    'manaProduction:combination',
    'manaCost:payLife',
    'manaCost:mana',
    'static:grantAbility',
  ] as const)('%s is a feature a lowering can name', (ref) => {
    expect(DECLARED_NEEDS).toContain(ref);
  });
});

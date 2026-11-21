// validateCard for the nodes of group 3 of the Hylda deck (issue 42): the amount `enteredX`, a `countOf` whose filter names the player by a target (`controlledBy`), the target slot
// `differentControllers`, the effect `grantPlayerHexproof` and the optional `chooseOne`. Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Amount, Effect, SpellText, TargetSpec } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_HYLDA_G3_LIST } from '../src/cards/fixtures/synthetic-hylda-g3';

const YOU = { kind: 'you' } as const;
const DRAW = (count: Amount): Effect => ({ kind: 'draw', player: YOU, count });

function creature(manaCost: readonly string[], abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost,
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

function sorcery(spell: SpellText): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Sorcery',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell,
  });
}

const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);
const OPPONENT: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'opponent' } };
const TAPPED = { types: ['creature' as const], tapped: true };

describe('the SYNTHETIC cards of the group are valid and supported', () => {
  test.each(SYNTHETIC_HYLDA_G3_LIST.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('enteredX: the X of the spell the permanent came from (CR 107.3m)', () => {
  const enters = (effect: Effect): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect,
  });

  test('the enters trigger of a card with an {X} in its mana cost reads it', () => {
    expect(validateCard(creature(['X', 'U'], [enters(DRAW({ kind: 'enteredX' }))]))).toEqual([]);
  });

  test('a card with no {X} has nothing to read', () => {
    expect(messages(creature(['1', 'U'], [enters(DRAW({ kind: 'enteredX' }))]))).toEqual([
      'enteredX is the X of the spell the permanent came from, but the mana cost has no {X}',
    ]);
  });

  test.each([
    ['another trigger', { kind: 'dies', what: { kind: 'this' } }],
    [
      'the enters trigger of another permanent',
      { kind: 'entersBattlefield', what: { types: ['creature'] } },
    ],
    ['an attack', { kind: 'attacks', what: { kind: 'this' } }],
  ] as const)('%s does not read it', (_name, trigger) => {
    const ability: Ability = { kind: 'triggered', trigger, effect: DRAW({ kind: 'enteredX' }) };
    expect(messages(creature(['X', 'U'], [ability])).join('|')).toContain(
      "'enteredX' needs a triggered ability whose trigger is this permanent entering the battlefield",
    );
  });

  test('a spell, an activated ability and a static ability do not read it', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Spell',
      manaCost: ['X', 'U'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      spell: { effect: DRAW({ kind: 'enteredX' }) },
    });
    expect(messages(spell).join('|')).toContain("'enteredX' needs a triggered ability");
    const activated: Ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: DRAW({ kind: 'enteredX' }),
    };
    expect(messages(creature(['X', 'U'], [activated])).join('|')).toContain(
      "'enteredX' needs a triggered ability",
    );
  });
});

describe('countOf with a player named by a target (CR 109.4, 608.2c)', () => {
  const count = (controlledBy: unknown): Amount =>
    ({ kind: 'countOf', filter: { ...TAPPED, controlledBy } }) as Amount;

  test('a target the spell declares is valid', () => {
    expect(
      validateCard(
        sorcery({ targets: [OPPONENT], effect: DRAW(count({ kind: 'target', id: 't1' })) }),
      ),
    ).toEqual([]);
  });

  test('a target the spell does not declare is refused', () => {
    expect(
      messages(sorcery({ targets: [OPPONENT], effect: DRAW(count({ kind: 'target', id: 't9' })) })),
    ).toEqual(['target "t9" is not declared on this ability or spell mode']);
  });

  test('a target that is an object is refused: it names a player', () => {
    const object: TargetSpec = {
      id: 't1',
      what: { kind: 'object', filter: { types: ['creature'] } },
    };
    expect(
      messages(
        sorcery({ targets: [object], effect: DRAW(count({ kind: 'target', id: 't1' })) }),
      ).join('|'),
    ).toContain('is an object but a player is required here');
  });

  test.each([{ kind: 'you' }, { kind: 'eachOpponent' }, { kind: 'triggerPlayer' }])(
    'another way to name the player is not read in a count: %j',
    (who) => {
      expect(
        messages(sorcery({ targets: [OPPONENT], effect: DRAW(count(who)) })).join('|'),
      ).toContain('a count names the player whose objects it counts by a target');
    },
  );

  test('the filter may not also say who controls the objects', () => {
    const both: Amount = {
      kind: 'countOf',
      filter: { ...TAPPED, controller: 'opponent', controlledBy: { kind: 'target', id: 't1' } },
    };
    expect(messages(sorcery({ targets: [OPPONENT], effect: DRAW(both) })).join('|')).toContain(
      'controlledBy replaces controller',
    );
  });

  test('a static ability does not read it', () => {
    const ability: Ability = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'this' },
        power: { kind: 'countOf', filter: { types: ['creature'], controlledBy: { kind: 'you' } } },
        toughness: 0,
      },
    };
    expect(validateCard(creature(['1'], [ability])).length).toBeGreaterThan(0);
  });
});

describe('differentControllers: any number of targets, no two of one controller (CR 115.1, 601.2c)', () => {
  const slot = (extra: Partial<TargetSpec>): CardDefinition =>
    sorcery({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', ...TAPPED } },
          anyNumber: true,
          differentControllers: true,
          ...extra,
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });

  test('any number of permanents is valid, and so is a number of at most', () => {
    expect(validateCard(slot({}))).toEqual([]);
    const bounded = sorcery({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', ...TAPPED } },
          max: 2,
          differentControllers: true,
        },
      ],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
    expect(validateCard(bounded)).toEqual([]);
  });

  test('it is not a slot of players', () => {
    const players = sorcery({
      targets: [
        {
          id: 't1',
          what: { kind: 'player', filter: 'any' },
          anyNumber: true,
          differentControllers: true,
        },
      ],
      effect: { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 1 },
    });
    expect(messages(players).join('|')).toContain('names objects (permanents), not players');
  });

  test('it is not a slot of cards in exile', () => {
    const graveyard = sorcery({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'exile', types: ['creature'] } },
          anyNumber: true,
          differentControllers: true,
        },
      ],
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
    });
    expect(messages(graveyard).join('|')).toContain('permanents on the battlefield');
  });

  test.each([
    { onePerOpponent: true as const },
    { divide: { total: 3 } },
    { upToThatMany: true as const },
  ])('it is not combined with %j', (extra) => {
    expect(messages(slot(extra as Partial<TargetSpec>)).join('|')).toContain(
      'different controllers',
    );
  });

  test('it must be true when present', () => {
    expect(messages(slot({ differentControllers: false as unknown as true })).join('|')).toContain(
      'differentControllers must be true when present',
    );
  });
});

describe('grantPlayerHexproof (CR 702.11b)', () => {
  const grant = (effect: Effect) => sorcery({ effect });

  test('the controller, until end of turn', () => {
    expect(
      validateCard(grant({ kind: 'grantPlayerHexproof', player: YOU, duration: 'untilEndOfTurn' })),
    ).toEqual([]);
  });

  test('a target player is valid when the spell declares one', () => {
    expect(
      validateCard(
        sorcery({
          targets: [OPPONENT],
          effect: {
            kind: 'grantPlayerHexproof',
            player: { kind: 'target', id: 't1' },
            duration: 'untilEndOfTurn',
          },
        }),
      ),
    ).toEqual([]);
  });

  test('another duration is refused', () => {
    expect(
      messages(
        grant({
          kind: 'grantPlayerHexproof',
          player: YOU,
          duration: 'permanent' as 'untilEndOfTurn',
        }),
      ),
    ).toContain('a player has hexproof until end of turn only');
  });

  test('a target the spell does not declare is refused', () => {
    expect(
      messages(
        grant({
          kind: 'grantPlayerHexproof',
          player: { kind: 'target', id: 't1' },
          duration: 'untilEndOfTurn',
        }),
      ),
    ).toEqual(['target "t1" is not declared on this ability or spell mode']);
  });
});

describe('chooseOne with optional (CR 608.2d)', () => {
  const choice = (optional: unknown): Effect =>
    ({
      kind: 'chooseOne',
      options: [
        { label: 'Gain', effect: { kind: 'gainLife', player: YOU, amount: 1 } },
        { label: 'Draw', effect: DRAW(1) },
      ],
      ...(optional === undefined ? {} : { optional }),
    }) as unknown as Effect;

  test('true is valid, and so is leaving it out', () => {
    expect(validateCard(sorcery({ effect: choice(true) }))).toEqual([]);
    expect(validateCard(sorcery({ effect: choice(undefined) }))).toEqual([]);
  });

  test('false is refused', () => {
    expect(messages(sorcery({ effect: choice(false) }))).toContain(
      'optional must be true when present',
    );
  });
});

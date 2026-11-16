// validateCard for the nodes of group 2 of the Hylda deck (D-1510 to D-1518): `restrict` of `doesntUntap` with the duration `untilNextUntapStep`, `permanentsEnterTapped`,
// the amount `cardTypesAmong`, a "choose up to one" of a triggered ability, and the intervening "if" about the permanent an Aura enchants.
// Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, SpellText, TargetSpec } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const CREATURE_T1: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const T1 = { kind: 'target', id: 't1' } as const;

const sorcery = (spell: SpellText): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Sorcery',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'test',
    spell,
  });

const creature = (abilities: readonly Ability[]): CardDefinition =>
  singleFace({
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

const aura = (abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Aura',
    manaCost: ['1'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      ...abilities,
    ],
  });

const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);
const has = (found: readonly string[], fragment: string) =>
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);

const keep = (
  duration: Extract<Effect, { kind: 'restrict' }>['duration'],
  restriction: Extract<Effect, { kind: 'restrict' }>['restriction'] = 'doesntUntap',
) =>
  sorcery({
    targets: [CREATURE_T1],
    effect: { kind: 'restrict', objects: T1, restriction, duration },
  });

describe('restrict: doesntUntap until the next untap step (D-1510)', () => {
  test('the pair is valid', () => {
    expect(full(keep('untilNextUntapStep'))).toEqual([]);
  });

  test('doesntUntap with any other duration is refused', () => {
    has(full(keep('untilEndOfTurn')), 'doesntUntap as an effect lasts until the next untap step');
    has(full(keep('permanent')), 'doesntUntap as an effect lasts until the next untap step');
  });

  test('the duration of another restriction is refused', () => {
    has(full(keep('untilNextUntapStep', 'cantBlock')), 'duration of doesntUntap only');
  });
});

describe('permanentsEnterTapped (D-1512)', () => {
  const enters = (permanents: object, duration = 'untilYourNextTurn') =>
    sorcery({
      effect: { kind: 'permanentsEnterTapped', permanents, duration } as unknown as Effect,
    });

  test('a group of creatures of the opponents until your next turn is valid', () => {
    expect(full(enters({ types: ['creature'], controller: 'opponent' }))).toEqual([]);
    expect(full(enters({ types: ['creature'] }, 'untilEndOfTurn'))).toEqual([]);
  });

  test('a zone, an owner, a controlled-by player, the player of an event and another duration are refused', () => {
    has(full(enters({ zone: 'graveyard' })), 'no zone, owner, stackKind');
    has(full(enters({ controlledBy: { kind: 'you' } })), 'no zone, owner, stackKind');
    has(full(enters({ controller: 'triggerPlayer' })), 'no zone, owner, stackKind');
    has(
      full(enters({ types: ['creature'] }, 'permanent')),
      'lasts until end of turn or until your next turn',
    );
  });
});

describe('cardTypesAmong (D-1511)', () => {
  const drawIfTypes = (filter: object) =>
    creature([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: {
          kind: 'amountIs',
          amount: { kind: 'cardTypesAmong', filter } as never,
          compare: { cmp: 'atLeast', value: 4 },
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);

  test('the cards of the graveyard of the controller are valid', () => {
    expect(full(drawIfTypes({ zone: 'graveyard', controller: 'you' }))).toEqual([]);
    expect(
      full(drawIfTypes({ zone: 'graveyard', controller: 'you', types: ['creature'] })),
    ).toEqual([]);
    expect(full(drawIfTypes({ zone: 'exile' }))).toEqual([]);
  });

  test('the battlefield, no zone and a filter that reads power are refused', () => {
    has(full(drawIfTypes({})), 'counts the card types of cards in a zone');
    has(full(drawIfTypes({ zone: 'battlefield' })), 'counts the card types of cards in a zone');
    has(
      full(drawIfTypes({ zone: 'graveyard', power: { cmp: 'atLeast', value: 1 } })),
      'cannot read the combat, the source power, power or toughness',
    );
  });
});

describe('"choose up to one" of a triggered ability (D-1517, CR 700.2b)', () => {
  const modal = (min: number): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'sequence', effects: [] },
    modes: [
      { text: 'Draw a card.', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
      { text: 'Gain 3 life.', effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } },
    ],
    chooseModes: { min, max: 1 },
  });

  test('min 0 is valid on a triggered ability, min 1 as before', () => {
    expect(full(creature([modal(0)]))).toEqual([]);
    expect(full(creature([modal(1)]))).toEqual([]);
  });

  test('min 0 on a spell is refused', () => {
    const spell = sorcery({
      effect: { kind: 'sequence', effects: [] },
      modes: [
        { text: 'a', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
        { text: 'b', effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } },
      ],
      chooseModes: { min: 0, max: 1 },
    } as unknown as SpellText);
    has(full(spell), 'chooseModes needs 1 <= min <= max');
  });
});

describe('the intervening "if" about the permanent an Aura enchants (D-1513, CR 603.4)', () => {
  const withCondition = (condition: unknown): CardDefinition =>
    aura([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: condition as never,
        effect: { kind: 'tap', objects: { kind: 'attached' } },
      },
    ]);

  test('the permanent it is attached to against a filter is valid', () => {
    expect(
      full(
        withCondition({
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { types: ['creature'], tapped: false },
        }),
      ),
    ).toEqual([]);
  });

  test('another object, a zone and inZone are refused', () => {
    has(
      full(withCondition({ kind: 'objectMatches', of: T1, filter: {} })),
      'objectMatches is only valid in a conditional effect',
    );
    has(
      full(
        withCondition({
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: { zone: 'graveyard' },
        }),
      ),
      'no zone, controller, owner or stackKind',
    );
    has(
      full(
        withCondition({
          kind: 'objectMatches',
          of: { kind: 'attached' },
          filter: {},
          inZone: 'hand',
        }),
      ),
      'does not read inZone',
    );
  });
});

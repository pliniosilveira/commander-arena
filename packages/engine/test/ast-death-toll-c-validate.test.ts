// Validation of what the Death Toll deck's group C added to the AST (Mulch, Wrenn and Seven, Professor Onyx, Ob Nixilis Reignited, Grist, the Hunger Tide): a reveal that takes
// every card of a kind into the hand (`lookAtTop` with `take.all`), the process that repeats while a mill moved a matching card (`repeatWhile`, CR 608.2c), a static ability that makes the
// card a creature off the battlefield (`creatureOffBattlefield`, CR 604.3) and an emblem a chosen player gets (`createEmblem` with `player`, CR 114.1).
import { describe, expect, test } from 'vitest';
import type { Ability, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const card = (abilities: Ability[], types: ('planeswalker' | 'sorcery')[] = ['planeswalker']) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['1'],
    types,
    colors: [],
    colorIdentity: [],
    oracleText: '',
    ...(types.includes('planeswalker') ? { loyalty: 3 } : {}),
    abilities,
  });
const plus = (effect: Effect): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change: 1 }],
  effect,
});
const gate = (a: Ability) => validateCard(card([a])).map((i) => i.message);

const mill: Effect = { kind: 'mill', player: { kind: 'you' }, count: 1 };
const insectMilled = {
  kind: 'objectMatches',
  of: { kind: 'moved' },
  filter: { subtypes: ['Insect'] },
  any: true,
} as const;

describe('lookAtTop that takes every card of a kind into the hand', () => {
  const reveal = (take: object): Effect =>
    ({
      kind: 'lookAtTop',
      count: 4,
      revealAll: true,
      take: { filter: { types: ['land'] }, max: 1, ...take },
      rest: 'graveyard',
    }) as Effect;

  test('is accepted with `all` and the hand (CR 701.20a, 608.2c)', () => {
    expect(gate(plus(reveal({ to: 'hand', all: true })))).toEqual([]);
  });

  test('is refused for a card taken somewhere `all` does not read, or with a minimum', () => {
    expect(gate(plus(reveal({ to: 'exileFaceDown', all: true }))).join('\n')).toMatch(
      /all is true/,
    );
    expect(gate(plus(reveal({ to: 'hand', all: true, min: 1 }))).join('\n')).toMatch(/all is true/);
  });
});

describe('repeatWhile', () => {
  const token: Effect = {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: 'Insect',
        manaCost: null,
        supertypes: [],
        types: ['creature'],
        subtypes: ['Insect'],
        colors: ['G'],
        power: 1,
        toughness: 1,
        loyalty: null,
        defense: null,
        oracleText: '',
        abilities: [],
      },
    },
    count: 1,
  };
  const grist = (over: object = {}): Effect =>
    ({
      kind: 'repeatWhile',
      effects: [token, mill],
      condition: insectMilled,
      beforeAgain: [
        { kind: 'addCounters', objects: { kind: 'this' }, counter: 'loyalty', count: 1 },
      ],
      ...over,
    }) as Effect;

  test('the process, the test on the cards milled and what is done before it repeats are accepted', () => {
    expect(gate(plus(grist()))).toEqual([]);
    expect(gate(plus(grist({ beforeAgain: undefined })))).toEqual([]);
  });

  test('a process that does not end in a mill is refused: nothing would make it end', () => {
    expect(gate(plus(grist({ effects: [mill, token] }))).join('\n')).toMatch(/ends with a mill/);
  });

  test('a test that does not read what the mill moved is refused', () => {
    expect(gate(plus(grist({ condition: { kind: 'didPrevious' } }))).join('\n')).toMatch(
      /objectMatches of moved/,
    );
  });

  test('an empty process or an empty `then` is refused', () => {
    expect(gate(plus(grist({ effects: [] }))).join('\n')).toMatch(/at least one effect/);
    expect(gate(plus(grist({ beforeAgain: [] }))).join('\n')).toMatch(/at least one effect/);
  });
});

describe('creatureOffBattlefield', () => {
  const own = (over: object = {}): Ability =>
    ({
      kind: 'static',
      static: {
        kind: 'creatureOffBattlefield',
        power: 1,
        toughness: 1,
        subtypes: ['Insect'],
        ...over,
      },
    }) as Ability;

  test('a power, a toughness and a creature type are accepted', () => {
    expect(validateCard(card([own()]))).toEqual([]);
  });

  test('a negative or fractional number, or no creature type, is refused', () => {
    expect(gate(own({ power: -1 })).join('\n')).toMatch(/whole numbers/);
    expect(gate(own({ toughness: 1.5 })).join('\n')).toMatch(/whole numbers/);
    expect(gate(own({ subtypes: [] })).join('\n')).toMatch(/creature type/);
  });
});

describe('createEmblem for a chosen player', () => {
  const emblem = (player: object): Effect =>
    ({
      kind: 'createEmblem',
      player,
      text: 'Whenever a player draws a card, you lose 2 life.',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'drawn', who: 'any' },
          effect: { kind: 'loseLife', player: { kind: 'you' }, amount: 2 },
        },
      ],
    }) as Effect;

  test('a player selector is accepted, even where no target is named by the ability', () => {
    expect(gate(plus(emblem({ kind: 'eachOpponent' })))).toEqual([]);
  });

  test('a target the ability does not declare is refused', () => {
    expect(gate(plus(emblem({ kind: 'target', id: 't9' }))).length).toBeGreaterThan(0);
  });
});

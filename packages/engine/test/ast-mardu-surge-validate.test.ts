// The Mardu Surge deck (issue 101): what `validateCard` allows of the nodes the group adds: `createToken.forEachOpponent` as `{ attacking: true }` (CR 508.4) and `isSource` in the
// filter of the creatures an `attackBatch` trigger counts (CR 508.1).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Effect, validateCard } from '../src/index';

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card)
    .map((i) => i.message)
    .join(' | ');

const TOKEN = {
  kind: 'custom' as const,
  definition: {
    name: 'Goblin',
    manaCost: null,
    supertypes: [],
    types: ['creature' as const],
    subtypes: ['Goblin'],
    colors: ['R' as const],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

const attackTrigger = (effect: Effect, what?: unknown): Ability => ({
  kind: 'triggered',
  trigger: {
    kind: 'attackBatch',
    who: 'you',
    atLeast: 1,
    ...(what === undefined ? {} : { what: what as never }),
  },
  effect,
});

const perOpponent = (forEachOpponent: unknown): Effect => ({
  kind: 'createToken',
  token: TOKEN,
  count: 1,
  tapped: true,
  forEachOpponent: forEachOpponent as never,
});

describe('a token tapped and attacking for each opponent (CR 508.4)', () => {
  test('forEachOpponent { attacking: true } is valid in the attack trigger', () => {
    expect(validateCard(creature([attackTrigger(perOpponent({ attacking: true }))]))).toEqual([]);
  });

  test('it is one of the two forms, never both and never neither', () => {
    for (const bad of [{}, { mustAttack: true, attacking: true }, { attacking: false }]) {
      expect(messages(creature([attackTrigger(perOpponent(bad))])), JSON.stringify(bad)).toContain(
        'forEachOpponent is { mustAttack: true } or { attacking: true }',
      );
    }
  });
});

describe('this creature or your commander in an attack trigger (CR 508.1, 903.3)', () => {
  const effect: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };

  test('isSource in an anyOf member of the creatures counted is valid', () => {
    const what = { anyOf: [{ isSource: true }, { commander: 'yours' }] };
    expect(validateCard(creature([attackTrigger(effect, what)]))).toEqual([]);
  });

  test('isSource is still refused in a filter that is not read where it has a source', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'Test.',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { isSource: true } } }],
        effect,
      },
    });
    expect(messages(spell)).toContain('isSource is read in the filter');
  });
});

describe('the number of creatures attacking them (CR 508.1b)', () => {
  const loses = (amount: unknown): Effect => ({
    kind: 'loseLife',
    player: { kind: 'eachOpponent' },
    amount: amount as never,
  });

  test('attackersOfAffected is the whole amount of a loseLife', () => {
    expect(validateCard(creature([attackTrigger(loses({ kind: 'attackersOfAffected' }))]))).toEqual(
      [],
    );
  });

  test('it is refused as part of another amount and in another effect', () => {
    expect(
      messages(
        creature([attackTrigger(loses({ kind: 'sum', of: [{ kind: 'attackersOfAffected' }, 1] }))]),
      ),
    ).toContain('attackersOfAffected');
    expect(
      messages(
        creature([
          attackTrigger({
            kind: 'gainLife',
            player: { kind: 'you' },
            amount: { kind: 'attackersOfAffected' } as never,
          }),
        ]),
      ),
    ).toContain('attackersOfAffected is the amount of a loseLife effect');
  });
});

describe('tokens created twice over until end of turn (CR 614.1a, 614.5)', () => {
  const double = (tokens: unknown): Effect => ({ kind: 'doubleTokens', tokens: tokens as never });

  test('doubleTokens names the tokens as they would be created', () => {
    expect(
      validateCard(creature([attackTrigger(double({ token: true, controller: 'you' }))])),
    ).toEqual([]);
  });

  test('a filter that reads a zone, an owner or the combat is refused', () => {
    for (const bad of [{ zone: 'battlefield' }, { owner: 'you' }, { attacking: true }]) {
      expect(
        messages(creature([attackTrigger(double({ token: true, ...bad }))])),
        JSON.stringify(bad),
      ).toContain('the tokens that are created twice over are named by');
    }
  });
});

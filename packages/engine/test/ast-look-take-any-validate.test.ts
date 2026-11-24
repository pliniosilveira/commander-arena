// Validation of what the Elven Council deck's "reveal" group added to the AST: a reveal that lets the player take any number of the cards that match (`lookAtTop` with `take.any`,
// Genesis Wave, CR 701.20a, 608.2c), the mana value limit that reads the X of the spell (`take.manaValueAtMost` of X, CR 107.3a, 202.3), and the test of the cards a reveal showed against
// the spell a cast trigger is about (`objectMatches` of `moved` with `any` and `sharesCardTypeWith`, Gandalf, Westward Voyager, CR 205.2a). The cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const sorcery = (effect: Effect, x = true) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: x ? ['X', 'G'] : ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: '',
    spell: { effect, ...(x ? { x: true } : {}) },
  });
const messages = (effect: Effect, x = true) =>
  validateCard(sorcery(effect, x)).map((i) => i.message);

const reveal = (take: object, extra: object = {}): Effect =>
  ({
    kind: 'lookAtTop',
    count: { kind: 'x' },
    revealAll: true,
    take: { filter: { types: ['land'] }, max: 1, to: 'battlefield', ...take },
    rest: 'graveyard',
    ...extra,
  }) as Effect;

describe('lookAtTop that lets the player take any number of the cards that match', () => {
  test('is accepted with `any`, a reveal and the battlefield, with a limit that reads X (CR 701.20a, 107.3a, 202.3)', () => {
    expect(messages(reveal({ any: true, manaValueAtMost: { kind: 'x' } }))).toEqual([]);
  });

  test('the limit that reads X needs an X on the spell', () => {
    expect(
      messages(reveal({ any: true, manaValueAtMost: { kind: 'x' } }, { count: 4 }), false).join(
        '\n',
      ),
    ).toMatch(/X is used but nothing/);
  });

  test.each([
    ['a look, not a reveal', { revealAll: undefined }, { any: true }],
    ['the hand', {}, { any: true, to: 'hand' }],
    ['a card taken at least once', {}, { any: true, min: 1 }],
    ['a total mana value', {}, { any: true, totalManaValue: 4 }],
    ['every card at once', {}, { any: true, all: true }],
    ['cards taken unrevealed', {}, { any: true, hidden: true }],
    ['a count of cards', {}, { any: true, max: 3 }],
    ['a value other than true', {}, { any: false }],
  ])('is refused with %s', (_name, extra, take) => {
    expect(messages(reveal(take, extra)).join('\n')).toMatch(/any is true/);
  });
});

describe('the test of the cards a reveal showed against the spell a trigger is about', () => {
  const trigger = (effect: Effect, castTrigger = true): Ability => ({
    kind: 'triggered',
    trigger: castTrigger
      ? { kind: 'castSpell', by: 'you', filter: { stackKind: 'spell' } }
      : { kind: 'upkeep', whose: 'you' },
    effect,
  });
  const gandalf = (castTrigger = true) => {
    const effect: Effect = {
      kind: 'sequence',
      effects: [
        { kind: 'revealTopCard', player: { kind: 'eachOpponent' } },
        {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'moved' },
            filter: { sharesCardTypeWith: 'triggerSubject' },
            any: true,
          },
          effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
          else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    };
    return validateCard(
      singleFace({
        name: 'SYNTHETIC Test Subject',
        manaCost: ['1'],
        types: ['creature'],
        colors: [],
        colorIdentity: [],
        power: 1,
        toughness: 1,
        oracleText: '',
        abilities: [trigger(effect, castTrigger)],
      }),
    ).map((i) => i.message);
  };

  test('is accepted in the effect of a trigger about a cast spell', () => {
    expect(gandalf()).toEqual([]);
  });

  test('is refused where there is no spell the trigger is about', () => {
    expect(gandalf(false).length).toBeGreaterThan(0);
  });
});

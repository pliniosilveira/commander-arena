// validateCard (and the supported gate) for the nodes of group 2 of the Galadriel deck (D-538 to D-546): `ChooseSelector.alsoGraveyard`, a `returnToHand` cost of other permanents in an
// ability that works from the graveyard, a token whose power and toughness are '*' with a characteristic-defining ability of its own, and a static `setTypes` that adds the land card type and
// a basic land type. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, TokenDefinition } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  ATTACK_DRAW_THEN_PUT_LAND,
  CREATURES_ARE_FORESTS,
  ENTERS_CREATE_OX,
  LAND_COUNT_DEFINES_PT,
  OX_TOKEN_NAME,
  RETURN_FROM_GRAVEYARD,
} from '../src/cards/fixtures/synthetic-galadriel-g2';

const creature = (abilities: readonly Ability[], power: number | '*' = 1): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power,
    toughness: power,
    oracleText: 'test',
    abilities,
  });

const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);
const has = (found: readonly string[], fragment: string) =>
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);

const putFromHand = (choose: Record<string, unknown>, to: string): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
  effect: {
    kind: 'moveToZone',
    objects: {
      kind: 'choose',
      filter: { zone: 'hand', types: ['land'], controller: 'you' },
      ...choose,
    },
    to,
  } as Effect,
});

describe('a choice from the hand or the graveyard (D-544, CR 608.2d)', () => {
  test('the real shape is valid', () => {
    expect(full(creature([ATTACK_DRAW_THEN_PUT_LAND]))).toEqual([]);
  });

  test('it needs the hand as the zone of the filter', () => {
    const found = full(
      creature([
        {
          kind: 'triggered',
          trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
          effect: {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'graveyard', types: ['land'], controller: 'you' },
              alsoGraveyard: true,
            },
            to: 'battlefield',
          },
        },
      ]),
    );
    has(found, 'alsoGraveyard');
  });

  test('the destination is the battlefield', () => {
    has(
      full(creature([putFromHand({ alsoGraveyard: true }, 'exile')])),
      'put onto the battlefield',
    );
    expect(full(creature([putFromHand({ alsoGraveyard: true }, 'battlefield')]))).toEqual([]);
  });

  test('it is not a choice among the cards an earlier effect moved, and the flag is true when present', () => {
    has(
      full(creature([putFromHand({ alsoGraveyard: true, fromMoved: true }, 'battlefield')])),
      'alsoGraveyard',
    );
    has(
      full(creature([putFromHand({ alsoGraveyard: false }, 'battlefield')])),
      'alsoGraveyard must be true',
    );
  });
});

describe('a cost that returns other permanents, in an ability that works from the graveyard (D-540, CR 602.2, 118.3)', () => {
  test('the real shape is valid', () => {
    expect(full(creature([RETURN_FROM_GRAVEYARD]))).toEqual([]);
  });

  test('returning the source itself is paid on the battlefield only', () => {
    const found = full(
      creature([
        {
          kind: 'activated',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'returnToHand', what: { kind: 'this' } },
          ],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          functionsIn: 'graveyard',
        },
      ]),
    );
    has(found, 'cannot cost returnToHand');
  });

  test('tapping and sacrificing are still not paid from the graveyard', () => {
    for (const cost of [
      { kind: 'tap' },
      { kind: 'sacrifice', what: { types: ['land'], controller: 'you' } },
    ] as const) {
      const found = full(
        creature([
          {
            kind: 'activated',
            cost: [cost],
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            functionsIn: 'graveyard',
          },
        ]),
      );
      has(found, 'cannot cost');
    }
  });
});

describe("a token whose power and toughness are '*' (D-543, CR 208.2a, 604.3)", () => {
  const token = (definition: Partial<TokenDefinition>): CardDefinition =>
    creature([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: OX_TOKEN_NAME,
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Ox'],
              colors: ['U'],
              power: '*',
              toughness: '*',
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [LAND_COUNT_DEFINES_PT],
              ...definition,
            },
          },
          count: 1,
        },
      },
    ]);

  test('the real shape is valid', () => {
    expect(full(creature([ENTERS_CREATE_OX]))).toEqual([]);
  });

  test('a star needs the ability that defines it, and the ability needs the star', () => {
    has(
      full(token({ abilities: [] })),
      "a printed '*' power needs a characteristic-defining ability",
    );
    has(full(token({ power: 2, toughness: 2 })), 'which the card must print');
  });

  test('a number that is not whole, or another word, is refused', () => {
    has(full(token({ power: 'X' as unknown as '*' })), 'a creature token needs a numeric power');
  });
});

describe('"Nontoken creatures you control are Forest lands in addition to their other types" (D-541, CR 613.1d)', () => {
  test('the real shape is valid', () => {
    expect(full(creature([CREATURES_ARE_FORESTS]))).toEqual([]);
  });

  test('the types added are card types of the table', () => {
    const found = full(
      creature([
        {
          kind: 'static',
          static: {
            kind: 'setTypes',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            additive: true,
            subtypes: ['Forest'],
            types: ['lnad' as unknown as 'land'],
          },
        },
      ]),
    );
    has(found, 'unknown card type');
  });
});

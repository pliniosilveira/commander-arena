// "{T}: Add one mana of any color among legendary creature cards in your graveyard." (the mana production `anyColorAmong`).
// Pins: CR 106.1b and 105.2 (colorless is no color, so a colorless card offers nothing), CR 605.1a and 605.3b (a mana ability: no stack, the color is
// named with the activation), and the per-seat reading of "your" graveyard (the controller's own, never another seat's, in a game of 2 to 4 players).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-color-among-mana.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HAVEN = 'SYNTHETIC Graveyard Haven';
const WHITE = 'SYNTHETIC Legend White';
const BLUE_BLACK = 'SYNTHETIC Legend Blue Black';
const RED = 'SYNTHETIC Legend Red';
const GREEN = 'SYNTHETIC Plain Green';
const COLORLESS = 'SYNTHETIC Legend Colorless';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const FIVE = ['W', 'U', 'B', 'R', 'G'] as const;

const two = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('validation', () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(HAVEN))).toEqual([]);
  });

  test('a production with no filter, a stack filter or a sacrifice cost is refused', () => {
    const card = syntheticCard(HAVEN);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbility = (ability: unknown) =>
      JSON.stringify(
        validateCard({ ...card, faces: [{ ...face, abilities: [ability] }] } as never),
      );
    expect(
      withAbility({ kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColorAmong' } }),
    ).toContain('anyColorAmong needs a filter');
    expect(
      withAbility({
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColorAmong', filter: { zone: 'stack' } },
      }),
    ).toContain('the stack has no cards');
    expect(
      withAbility({
        kind: 'mana',
        cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
        production: { kind: 'anyColorAmong', filter: { zone: 'graveyard' } },
      }),
    ).toContain('before the costs are paid');
  });

  test('a spell cannot add it: only a mana ability can ask the color', () => {
    const card = syntheticCard(HAVEN);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const spell = {
      ...card,
      faces: [
        {
          ...face,
          types: ['sorcery'],
          abilities: [],
          spell: {
            effect: {
              kind: 'addMana',
              mana: { kind: 'anyColorAmong', filter: { zone: 'graveyard' } },
            },
          },
        },
      ],
    };
    expect(JSON.stringify(validateCard(spell as never))).toContain('anyColorAmong');
  });
});

describe('the color is one the legendary creature cards in your graveyard have (CR 106.1b, 105.2)', () => {
  test('one card of one color offers that color only', () => {
    const g = two((b) => b.battlefield(HAVEN).graveyard(WHITE));
    g.expect.legal(0, { tap: HAVEN, color: 'W' });
    for (const color of ['U', 'B', 'R', 'G'] as const) {
      g.expect.illegal(0, { tap: HAVEN, color });
    }
    g.act(0).tapForMana(HAVEN, { color: 'W' });
    g.expect.pool(0, 'W');
    g.expect.stack([]);
  });

  test('colors of several cards are all on offer, a two-color card offers both, and one mana is made', () => {
    const g = two((b) => b.battlefield(HAVEN).graveyard(BLUE_BLACK, RED));
    for (const color of ['U', 'B', 'R'] as const) g.expect.legal(0, { tap: HAVEN, color });
    for (const color of ['W', 'G'] as const) g.expect.illegal(0, { tap: HAVEN, color });
    g.act(0).tapForMana(HAVEN, { color: 'B' });
    g.expect.pool(0, 'B');
  });

  test('a card that is not legendary, or not a creature card, adds no color', () => {
    const g = two((b) => b.battlefield(HAVEN).graveyard(GREEN, 'Plains'));
    for (const color of FIVE) expect(g.act(0).try.tapForMana(HAVEN, { color }).ok).toBe(false);
  });

  test('a colorless legendary creature offers nothing: colorless is no color', () => {
    const g = two((b) => b.battlefield(HAVEN).graveyard(COLORLESS));
    for (const color of FIVE) expect(g.act(0).try.tapForMana(HAVEN, { color }).ok).toBe(false);
    expect(g.legalActions(0).some((a) => a.kind === 'activateAbility')).toBe(false);
    g.expect.tapped(HAVEN, false);
    g.expect.pool(0, '');
  });

  test('an empty graveyard: the ability makes no mana', () => {
    const g = two((b) => b.battlefield(HAVEN));
    for (const color of FIVE) expect(g.act(0).try.tapForMana(HAVEN, { color }).ok).toBe(false);
    g.expect.tapped(HAVEN, false);
  });

  test('legendary creature cards on the battlefield do not count: only the graveyard', () => {
    const g = two((b) => b.battlefield(HAVEN, WHITE));
    g.expect.illegal(0, { tap: HAVEN, color: 'W' });
  });
});

describe('"your graveyard" is the controller’s own, whatever the number of players', () => {
  test('a card in an opponent’s graveyard adds no color', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HAVEN)
      .graveyard(WHITE)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(RED)
      .build();
    g.expect.legal(0, { tap: HAVEN, color: 'W' });
    g.expect.illegal(0, { tap: HAVEN, color: 'R' });
  });

  test('in a four-player game each seat reads only its own graveyard', () => {
    const g = scenario({ seats: 4 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HAVEN)
      .graveyard(BLUE_BLACK)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(RED)
      .seat(2)
      .library(...LIBRARY)
      .graveyard(WHITE)
      .seat(3)
      .library(...LIBRARY)
      .battlefield(HAVEN)
      .graveyard(RED)
      .at('precombatMain', { active: 3 })
      .build();
    g.expect.legal(3, { tap: HAVEN, color: 'R' });
    for (const color of ['W', 'U', 'B', 'G'] as const) g.expect.illegal(3, { tap: HAVEN, color });
  });
});

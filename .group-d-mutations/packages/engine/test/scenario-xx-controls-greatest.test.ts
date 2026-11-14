// "If you control the <filter> with the greatest <stat> or tied for the greatest" (D-139): the intervening "if" `controlsGreatest`, over
// several filters (artifacts, creatures, one creature type) and stats (mana value, power, toughness).
// Pins: CR 603.4 (an intervening "if" is checked as the ability would trigger and again as it resolves), CR 202.3 (mana value),
// CR 208.1 (power and toughness), CR 500.1 and 503.1 (the upkeep), CR 603.2 (a trigger whose condition is false is not put on the stack).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-greatest.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ARTIFACT_KEEPER = 'SYNTHETIC Artifact Keeper';
const POWER_KEEPER = 'SYNTHETIC Power Keeper';
const TOUGH_KEEPER = 'SYNTHETIC Toughness Keeper';
const GOBLIN_KEEPER = 'SYNTHETIC Goblin Keeper';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** A game at seat 0's upkeep of turn 3: `mine` and `theirs` place the boards. */
function toUpkeep(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

const drew = (g: ReturnType<typeof toUpkeep>): boolean => {
  // The upkeep trigger draws a card; the draw step has not come yet, so a hand of one card is the trigger's.
  if (g.state.stack.length > 0) {
    g.pass();
    g.pass();
  }
  return g.state.seats[0]?.hand.length === 1;
};

describe('the cards are valid', () => {
  test.each([ARTIFACT_KEEPER, POWER_KEEPER, TOUGH_KEEPER, GOBLIN_KEEPER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"the artifact with the greatest mana value or tied" (CR 202.3)', () => {
  test('the greatest mana value among every artifact is yours: you draw', () => {
    const g = toUpkeep(
      (b) => b.battlefield(ARTIFACT_KEEPER).battlefield('SYNTHETIC Trinket 4'),
      (b) => b.battlefield('SYNTHETIC Trinket 2'),
    );
    g.expect.stack([`${ARTIFACT_KEEPER} (ability)`]);
    expect(drew(g)).toBe(true);
  });

  test('tied for the greatest counts', () => {
    const g = toUpkeep(
      (b) => b.battlefield(ARTIFACT_KEEPER).battlefield('SYNTHETIC Trinket 2'),
      (b) => b.battlefield('SYNTHETIC Trinket 2'),
    );
    g.expect.stack([`${ARTIFACT_KEEPER} (ability)`]);
    expect(drew(g)).toBe(true);
  });

  test('an opponent has a greater one: the ability does not trigger at all (CR 603.4)', () => {
    const g = toUpkeep(
      (b) => b.battlefield(ARTIFACT_KEEPER).battlefield('SYNTHETIC Trinket 2'),
      (b) => b.battlefield('SYNTHETIC Trinket 4'),
    );
    g.expect.stack([]);
    expect(drew(g)).toBe(false);
  });

  test("you control the lesser and the greater is the opponent's even though yours has a higher mana value than their other one", () => {
    const g = toUpkeep(
      (b) =>
        b
          .battlefield(ARTIFACT_KEEPER)
          .battlefield('SYNTHETIC Trinket 2')
          .battlefield('SYNTHETIC Trinket 1'),
      (b) => b.battlefield('SYNTHETIC Trinket 4').battlefield('SYNTHETIC Trinket 1'),
    );
    g.expect.stack([]);
  });

  test('no artifacts at all: you control none, so no', () => {
    const g = toUpkeep((b) => b.battlefield(ARTIFACT_KEEPER));
    g.expect.stack([]);
  });

  test('only artifacts count: a creature with a higher mana value does not matter', () => {
    const g = toUpkeep(
      (b) => b.battlefield(ARTIFACT_KEEPER).battlefield('SYNTHETIC Trinket 1'),
      (b) => b.battlefield('SYNTHETIC Goblin 4/1'),
    );
    g.expect.stack([`${ARTIFACT_KEEPER} (ability)`]);
  });
});

describe('the same condition over another filter and stat', () => {
  test("the creature with the greatest power: yours is the greatest, the opponent's tough one is not", () => {
    const g = toUpkeep(
      (b) => b.battlefield(POWER_KEEPER).battlefield('SYNTHETIC Elf 5/2'),
      (b) => b.battlefield('SYNTHETIC Goblin 2/5').battlefield('SYNTHETIC Elf 3/3'),
    );
    g.expect.stack([`${POWER_KEEPER} (ability)`]);
  });

  test('the creature with the greatest toughness: the same board gives the opposite answer', () => {
    const g = toUpkeep(
      (b) => b.battlefield(TOUGH_KEEPER).battlefield('SYNTHETIC Elf 5/2'),
      (b) => b.battlefield('SYNTHETIC Goblin 2/5').battlefield('SYNTHETIC Elf 3/3'),
    );
    g.expect.stack([]);
  });

  test('the Goblin with the greatest power: only Goblins are compared', () => {
    const g = toUpkeep(
      (b) => b.battlefield(GOBLIN_KEEPER).battlefield('SYNTHETIC Goblin 4/1'),
      (b) => b.battlefield('SYNTHETIC Goblin 2/5').battlefield('SYNTHETIC Elf 5/2'),
    );
    // The opponent's Elf 5/2 has more power, but it is no Goblin.
    g.expect.stack([`${GOBLIN_KEEPER} (ability)`]);
  });

  test('power counters in: a +1/+1 counter can make the difference (derived power, CR 613.4)', () => {
    const g = toUpkeep(
      (b) =>
        b.battlefield(POWER_KEEPER).battlefield('SYNTHETIC Elf 3/3', { counters: { '+1/+1': 3 } }),
      (b) => b.battlefield('SYNTHETIC Elf 5/2'),
    );
    g.expect.stack([`${POWER_KEEPER} (ability)`]);
  });
});

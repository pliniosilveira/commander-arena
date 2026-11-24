// The party (CR 700.8): "the number of creatures in your party" (`partySize`) and "you have a full party" (`amountIs` of it at least 4). Pins: CR 700.8 (up to one Cleric,
// Rogue, Warrior and Wizard you control), CR 700.8a (the game counts it), CR 700.8b (a creature with several of the types fills one slot, and the most creatures count),
// CR 700.8c (a full party is four), CR 604.3 and 613.4a (a characteristic-defining power), CR 601.2f (a cost reduced as the cost is determined), CR 603.4 (an intervening "if").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-party.ts).
import { describe, expect, test } from 'vitest';
import { getView, partySizeOf, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const CLERIC = 'SYNTHETIC Party Cleric';
const ROGUE = 'SYNTHETIC Party Rogue';
const WARRIOR = 'SYNTHETIC Party Warrior';
const WIZARD = 'SYNTHETIC Party Wizard';
const CLERIC_ROGUE = 'SYNTHETIC Party Cleric Rogue';
const ROGUE_WARRIOR = 'SYNTHETIC Party Rogue Warrior';
const WARRIOR_WIZARD = 'SYNTHETIC Party Warrior Wizard';
const COMMONER = 'SYNTHETIC Party Commoner';
const SCRIBE = 'SYNTHETIC Party Scribe'; // power = party size; itself a Cleric
const LEECH = 'SYNTHETIC Party Leech'; // enters: each opponent loses X, you gain X; itself a Cleric
const RITE = 'SYNTHETIC Party Rite'; // {4}{B}{B}, costs {1} less per party creature
const CHIMERA = 'SYNTHETIC Party Chimera'; // is also a Cleric, Rogue, Warrior and Wizard
const BANNER = 'SYNTHETIC Party Banner'; // beginning of combat, if full party: gain 3
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

describe('the cards are valid', () => {
  test.each([SCRIBE, LEECH, RITE, BANNER, CHIMERA])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('partySizeOf: the most creatures that fill the four slots (CR 700.8b)', () => {
  const t = (...types: string[]) => types;
  test('no creature, a creature of no party type', () => {
    expect(partySizeOf([])).toBe(0);
    expect(partySizeOf([t('Human', 'Peasant')])).toBe(0);
  });
  test('two creatures of one type fill one slot', () => {
    expect(partySizeOf([t('Cleric'), t('Cleric')])).toBe(1);
  });
  test('a creature with several types fills one slot', () => {
    expect(partySizeOf([t('Cleric', 'Rogue', 'Warrior', 'Wizard')])).toBe(1);
  });
  test('the arrangement with the most creatures counts', () => {
    expect(
      partySizeOf([
        t('Cleric', 'Rogue'),
        t('Rogue', 'Warrior'),
        t('Warrior', 'Wizard'),
        t('Wizard'),
      ]),
    ).toBe(4);
    expect(partySizeOf([t('Rogue', 'Warrior'), t('Cleric', 'Rogue'), t('Wizard', 'Warrior')])).toBe(
      3,
    );
  });
});

const game = (place: (b: Builder) => Builder, seats = 2): ScenarioGame => {
  let b = place(
    scenario({ seats })
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  for (let s = 1; s < seats; s++) {
    b = b
      .seat(s as 1 | 2 | 3)
      .life(20)
      .library(...FILLER);
  }
  return b.at('precombatMain', { active: 0 }).build();
};

describe('a characteristic-defining power (CR 604.3, 613.4a)', () => {
  test('counts the party, and the creature itself is a Cleric', () => {
    const g = game((b) => b.battlefield(SCRIBE));
    g.expect.pt(SCRIBE, 1, 2);
  });
  test('grows with the party', () => {
    const g = game((b) =>
      b.battlefield(SCRIBE).battlefield(ROGUE).battlefield(WARRIOR).battlefield(WIZARD),
    );
    g.expect.pt(SCRIBE, 4, 2);
  });
  test('a second Cleric adds nothing, and a creature of another type adds nothing', () => {
    const g = game((b) => b.battlefield(SCRIBE).battlefield(CLERIC).battlefield(COMMONER));
    g.expect.pt(SCRIBE, 1, 2);
  });
  test('only your own creatures count', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(SCRIBE)
      .seat(1)
      .library(...FILLER)
      .battlefield(ROGUE)
      .battlefield(WARRIOR)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(SCRIBE, 1, 2);
  });
});

const life = (g: ScenarioGame, seat: 0 | 1 | 2 | 3): number | undefined =>
  getView(g.state, 0).seats[seat]?.life;

describe('an amount of an effect', () => {
  test('each opponent loses X and you gain X, X counting the creature that entered', () => {
    const g = game((b) => b.hand(LEECH).battlefield('Swamp', { count: 2 }).battlefield(WARRIOR));
    g.act(0).cast(LEECH, { pay: true });
    g.passAll();
    // Leech is a Cleric, so the party is the Cleric and the Warrior.
    expect(life(g, 1)).toBe(18);
    expect(life(g, 0)).toBe(22);
  });
  test('three opponents each lose X', () => {
    const g = game((b) => b.hand(LEECH).battlefield('Swamp', { count: 2 }), 4);
    g.act(0).cast(LEECH, { pay: true });
    g.passAll();
    expect(life(g, 1)).toBe(19);
    expect(life(g, 2)).toBe(19);
    expect(life(g, 3)).toBe(19);
    expect(life(g, 0)).toBe(21);
  });
  test('the party of an opponent is not yours', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(LEECH)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(ROGUE)
      .battlefield(WARRIOR)
      .battlefield(WIZARD)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LEECH, { pay: true });
    g.passAll();
    expect(life(g, 1)).toBe(19);
  });
});

const costOf = (g: ScenarioGame, name: string): readonly string[] | undefined =>
  (getView(g.state, 0).seats[0]?.hand ?? []).find((o) => o.name === name)?.castCost;

describe('a cost reduced for each creature in your party (CR 601.2f)', () => {
  test('no party: the full cost', () => {
    const g = game((b) => b.hand(RITE).battlefield('Swamp', { count: 6 }));
    expect(costOf(g, RITE)).toEqual(['4', 'B', 'B']);
  });
  test('three in the party: {1}{B}{B}', () => {
    const g = game((b) =>
      b
        .hand(RITE)
        .battlefield('Swamp', { count: 3 })
        .battlefield(CLERIC)
        .battlefield(ROGUE)
        .battlefield(WIZARD),
    );
    expect(costOf(g, RITE)).toEqual(['1', 'B', 'B']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.life(0, 25);
  });
  test('a full party takes four off the generic part', () => {
    const g = game((b) =>
      b.hand(RITE).battlefield(CLERIC).battlefield(ROGUE).battlefield(WARRIOR).battlefield(WIZARD),
    );
    expect(costOf(g, RITE)).toEqual(['B', 'B']);
  });
  test('creatures with several types fill one slot each', () => {
    const g = game((b) =>
      b.hand(RITE).battlefield(CLERIC_ROGUE).battlefield(ROGUE_WARRIOR).battlefield(WARRIOR_WIZARD),
    );
    expect(costOf(g, RITE)).toEqual(['1', 'B', 'B']);
  });
});

describe('"if you have a full party" (CR 700.8c, 603.4)', () => {
  const atCombat = (place: (b: Builder) => Builder): ScenarioGame => {
    const g = game(place);
    g.advanceTo('beginningOfCombat');
    return g;
  };
  test('four creatures that fill the four slots: the trigger happens', () => {
    const g = atCombat((b) =>
      b
        .battlefield(BANNER)
        .battlefield(CLERIC)
        .battlefield(ROGUE)
        .battlefield(WARRIOR)
        .battlefield(WIZARD),
    );
    g.expect.stack([`${BANNER} (ability)`]);
    g.passAll();
    g.expect.life(0, 23);
  });
  test('multiclass creatures can fill the four slots', () => {
    const g = atCombat((b) =>
      b
        .battlefield(BANNER)
        .battlefield(CLERIC_ROGUE)
        .battlefield(ROGUE_WARRIOR)
        .battlefield(WARRIOR_WIZARD)
        .battlefield(WIZARD),
    );
    g.expect.stack([`${BANNER} (ability)`]);
  });
  test('a party of three does not trigger it', () => {
    const g = atCombat((b) =>
      b.battlefield(BANNER).battlefield(CLERIC).battlefield(ROGUE).battlefield(WARRIOR),
    );
    g.expect.stack([]);
  });
  test('two creatures of one type are one member', () => {
    const g = atCombat((b) =>
      b
        .battlefield(BANNER)
        .battlefield(CLERIC)
        .battlefield(CLERIC)
        .battlefield(ROGUE)
        .battlefield(WARRIOR),
    );
    g.expect.stack([]);
  });
});

describe('a creature that is also all four types (CR 205.3m, 613.1d)', () => {
  test('it alone is one member of the party, never four (CR 700.8b)', () => {
    const g = game((b) => b.battlefield(CHIMERA).battlefield(SCRIBE));
    // The Scribe is a Cleric and the Chimera fills another slot: two.
    g.expect.pt(SCRIBE, 2, 2);
  });
  test('with three other creatures of the other types it still makes a full party only if each slot is filled', () => {
    const g = game((b) =>
      b.battlefield(CHIMERA).battlefield(SCRIBE).battlefield(ROGUE).battlefield(WARRIOR),
    );
    g.expect.pt(SCRIBE, 4, 2);
  });
});

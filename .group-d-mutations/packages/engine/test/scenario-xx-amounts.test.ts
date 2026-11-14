// Counted amounts that read the game (D-131): the number of objects of a kind, half of a count rounded down, a
// multiple, a sum, the greatest or the total of a stat, devotion, the colors of a commander, an object's toughness
// and counters, the creatures attacking you, opponents with more cards in hand; an amount compared with a number;
// "X is ..." text (CR 107.3c); and tokens that enter tapped.
// Pins: CR 608.2c (an instruction is carried out as it comes up, so a count is read then), CR 107.3c (X defined by
// the text is its definition wherever X is read, and "the value of X may change while that spell or ability is on the
// stack"), CR 107.1a (a stated rounding), CR 107.1b (a negative count is 0), CR 700.5 (devotion: the mana symbols of
// the permanents' mana costs, a hybrid symbol for each of its colors), CR 903.4 (color identity of the commander),
// CR 508.1b (attacking a player), CR 603.4 (an intervening "if" is checked as the ability triggers and as it
// resolves), CR 113.7a and 608.2h (last-known information), CR 614.12 (a permanent's own enters-with replacement
// counts the game without it), CR 110.5b (a token that enters tapped), CR 118.7a (a cost reduction of generic mana).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-amounts.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const MOURNER = 'SYNTHETIC Zombie Mourner'; // 2/2 Zombie: upkeep, draw X and lose X, X = Zombies you control
const TOLL = 'SYNTHETIC Zombie Toll'; // sacrifice a Zombie, then draw X, X = Zombies you control
const SIPHON = 'SYNTHETIC Swamp Siphon'; // X damage to a creature and X life, X = Swamps you control
const REACTION = 'SYNTHETIC Chain Reaction'; // X damage to each creature, X = creatures on the battlefield
const BLIGHT = 'SYNTHETIC Swamp Blight'; // all creatures -1/-1 for each Swamp you control
const SWELL = 'SYNTHETIC Grave Swell'; // enters with a +1/+1 counter for each Zombie card in your graveyard
const RAISER = 'SYNTHETIC Rank Raiser'; // upkeep: X Zombie tokens, X = half your Zombies, rounded down
const FEAST = 'SYNTHETIC Mighty Feast'; // gain 2 life for each creature you control with power 4 or more
const HORDE = 'SYNTHETIC Grave Horde'; // P/T = Zombies on the battlefield + Zombie cards in all graveyards
const CALL = 'SYNTHETIC Stampede Call'; // creatures you control gain trample and +X/+X, X = greatest power
const STUDY = 'SYNTHETIC Stalwart Study'; // draw cards equal to the greatest power among your creatures
const WALLS = 'SYNTHETIC Wall Tithe'; // gain life equal to the total toughness of your creatures
const RELIC = 'SYNTHETIC Relic Tithe'; // gain life equal to the greatest mana value among your artifacts
const COLOSSUS = 'SYNTHETIC Mighty Colossus'; // {7}{G}{G}, costs {X} less, X = total power of your creatures
const MERCHANT = 'SYNTHETIC Dark Merchant'; // enters: each opponent loses X, X = devotion to black; gain it
const DEVOTION = 'SYNTHETIC Blood Devotion'; // gain life equal to your devotion to black and red
const IDENTITY = 'SYNTHETIC Identity Tithe'; // gain life equal to the colors of your commander's identity
const IDOL = 'SYNTHETIC Hybrid Idol'; // artifact {B}{B/R}{2/B}{G/P}{1}
const HOST = 'SYNTHETIC Hearty Host'; // another creature you control enters: gain life equal to its toughness
const HERALD = 'SYNTHETIC Herald of Counters'; // Angel spells cost {1} less for each +1/+1 counter on this
const ANGEL = 'SYNTHETIC Costly Angel'; // {4}{W} 4/4 Angel
const SCOUT = 'SYNTHETIC Power Scout'; // enters: if total power of your creatures is 8+, draw
const COUNT = 'SYNTHETIC Graveyard Count'; // 3+ creature cards in your graveyard: gain 5, else lose 1
const SWARM = 'SYNTHETIC Web Swarm'; // X Spider tokens, X = creatures attacking you
const DETECTIVE = 'SYNTHETIC Hand Detective'; // upkeep: a Clue for each opponent with more cards in hand
const TWIN = 'SYNTHETIC Twin Tithe'; // gain life equal to your creatures plus your lands
const MUSTER = 'SYNTHETIC Army Muster'; // thirteen tapped Zombie tokens
const HOARD = 'SYNTHETIC Tapped Hoard'; // a tapped Treasure for each Zombie you control
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const HOUND = 'SYNTHETIC Echo Hound'; // 3/1
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0 at the upkeep of its turn 3 with the triggers on the stack. */
function toUpkeep(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

/** What the view says a card in seat 0's hand costs. */
const costOf = (g: ScenarioGame, name: string): readonly string[] | undefined =>
  (getView(g.state, 0).seats[0]?.hand ?? []).find((o) => o.name === name)?.castCost;

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** The tokens named `name` that `seat` controls on the battlefield. */
const tokens = (g: ScenarioGame, name: string, seat = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

describe('"where X is ..." (CR 107.3c): the definition is read wherever X is', () => {
  test('draw X and lose X, X the number of Zombies you control', () => {
    const g = toUpkeep((b) => b.battlefield(MOURNER).battlefield(ZOMBIE).battlefield(ZOMBIE));
    g.expect.stack([`${MOURNER} (ability)`]);
    resolveTop(g);
    g.expect.handSize(0, 3);
    g.expect.life(0, 17);
  });

  test('X changes as the instructions run: sacrifice a Zombie, then draw X (CR 608.2c, 107.3c)', () => {
    const g = twoSeatGame((b) =>
      b.hand(TOLL).battlefield('Swamp').battlefield(ZOMBIE, { count: 3 }),
    );
    g.act(0).cast(TOLL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('SYNTHETIC Plain Zombie[0]');
    // Two Zombies were left when the draw ran.
    g.expect.handSize(0, 2);
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
  });

  test('X is zero when nothing counts: nothing is drawn and no card moves', () => {
    const g = twoSeatGame((b) => b.hand(TOLL).battlefield('Swamp').battlefield(ZOMBIE));
    g.act(0).cast(TOLL, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('damage and life from one X: X Swamps give X damage and X life', () => {
    const g = twoSeatGame(
      (b) => b.hand(SIPHON).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(SIPHON, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.damage(SPIDER, 3);
    g.expect.life(0, 23);
  });

  test('X damage to each creature, X the number of creatures on the battlefield', () => {
    const g = twoSeatGame(
      (b) => b.hand(REACTION).battlefield('Mountain', { count: 4 }).battlefield(BEARS),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(REACTION, { pay: true });
    g.passAll();
    // Two creatures: two damage each. The Bears die, the Spider survives.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage(SPIDER, 2);
  });

  test('-1/-1 for each Swamp you control, the count kept as it resolves (CR 611.2c)', () => {
    const g = twoSeatGame(
      (b) => b.hand(BLIGHT).battlefield('Swamp', { count: 3 }).battlefield(SPIDER),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(BLIGHT, { pay: true });
    g.passAll();
    g.expect.pt(SPIDER, -1, 1);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a permanent enters with a counter for each Zombie card in your graveyard, counted as it enters', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(SWELL)
        .battlefield('Swamp', { count: 3 })
        .graveyard(ZOMBIE)
        .graveyard(ZOMBIE)
        .graveyard(BEARS),
    );
    g.act(0).cast(SWELL, { pay: true });
    g.passAll();
    g.expect.counters(SWELL, { '+1/+1': 2 });
    g.expect.pt(SWELL, 3, 3);
  });

  test('a permanent that enters with none of them has no counters', () => {
    const g = twoSeatGame((b) => b.hand(SWELL).battlefield('Swamp', { count: 3 }));
    g.act(0).cast(SWELL, { pay: true });
    g.passAll();
    g.expect.counters(SWELL, {});
    g.expect.pt(SWELL, 1, 1);
  });
});

describe('half the number, rounded down; a multiple; a sum (CR 107.1a)', () => {
  const upkeepWith = (zombies: number) =>
    toUpkeep((b) => {
      const placed = b.battlefield(RAISER);
      return zombies > 0 ? placed.battlefield(ZOMBIE, { count: zombies }) : placed;
    });

  test.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 2],
    [7, 3],
  ])('%i Zombies make %i tokens', (zombies, made) => {
    const g = upkeepWith(zombies);
    g.expect.stack([`${RAISER} (ability)`]);
    resolveTop(g);
    expect(tokens(g, 'Zombie')).toHaveLength(made);
    g.expect.invariants();
  });

  test('the tokens count as Zombies for the next upkeep only: X is read as the ability resolves', () => {
    const g = upkeepWith(4);
    resolveTop(g);
    // Four Zombie creature cards plus two tokens; the count of the trigger was taken before they existed.
    expect(tokens(g, 'Zombie')).toHaveLength(2);
  });

  test('2 life for each creature with power 4 or greater', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(FEAST)
        .battlefield('Forest', { count: 3 })
        .battlefield(GIANT, { count: 2 })
        .battlefield(BEARS),
    );
    g.act(0).cast(FEAST, { pay: true });
    g.passAll();
    g.expect.life(0, 24);
  });

  test('no creature with that much power: nothing is gained, no life event', () => {
    const g = twoSeatGame((b) =>
      b.hand(FEAST).battlefield('Forest', { count: 3 }).battlefield(BEARS),
    );
    const mark = g.mark();
    g.act(0).cast(FEAST, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    expect(g.eventsSince(mark).some((e) => e.kind === 'lifeChanged')).toBe(false);
  });

  test('power and toughness equal to a sum of two counts, over several zones (CR 604.3, 613.4a)', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(HORDE).battlefield(ZOMBIE).graveyard(ZOMBIE).graveyard(BEARS),
      (b) => b.graveyard(ZOMBIE).battlefield(ZOMBIE),
    );
    // Zombies on the battlefield: the Horde and two Plain Zombies; Zombie cards in graveyards: two.
    g.expect.pt(HORDE, 5, 5);
  });

  test('the sum follows the board (CR 611.3a)', () => {
    const g = twoSeatGame((b) =>
      b.hand('Lightning Bolt').battlefield('Mountain').battlefield(HORDE).battlefield(ZOMBIE),
    );
    g.expect.pt(HORDE, 2, 2);
    g.act(0).cast('Lightning Bolt', { targets: [ZOMBIE], pay: true });
    g.passAll();
    // The Zombie died: one fewer on the battlefield, one more in the graveyard.
    g.expect.pt(HORDE, 2, 2);
  });
});

describe('a sum in an effect', () => {
  test('life equal to the creatures you control plus the lands you control', () => {
    const g = twoSeatGame((b) =>
      b.hand(TWIN).battlefield('Plains', { count: 3 }).battlefield(BEARS).battlefield(SPIDER),
    );
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    // Two creatures and three lands.
    g.expect.life(0, 25);
  });

  test('every part is read, as the effect runs', () => {
    const g = twoSeatGame((b) => b.hand(TWIN).battlefield('Plains', { count: 3 }));
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });
});

describe('the greatest and the total of a stat', () => {
  test('+X/+X and trample, X the greatest power among your creatures', () => {
    const g = twoSeatGame((b) =>
      b.hand(CALL).battlefield('Forest', { count: 4 }).battlefield(BEARS).battlefield(GIANT),
    );
    g.act(0).cast(CALL, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 6, 6);
    g.expect.pt(GIANT, 8, 8);
    expect(g.state.continuousEffects.length).toBeGreaterThan(0);
  });

  test('the number is read as the effect resolves, not when it is cast (CR 608.2c)', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(CALL, 'Lightning Bolt')
        .battlefield('Forest', { count: 4 })
        .battlefield('Mountain')
        .battlefield(BEARS)
        .battlefield(HOUND),
    );
    g.act(0).cast(CALL, { pay: true });
    g.act(0).cast('Lightning Bolt', { targets: [HOUND], pay: true });
    g.passAll();
    // The 3/1 died in response: the greatest power is the Bears' 2.
    g.expect.pt(BEARS, 4, 4);
  });

  test('with no creature the greatest power is 0 and nothing is drawn', () => {
    const g = twoSeatGame((b) => b.hand(STUDY).battlefield('Island', { count: 3 }));
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('draw cards equal to the greatest power', () => {
    const g = twoSeatGame((b) =>
      b.hand(STUDY).battlefield('Island', { count: 3 }).battlefield(GIANT).battlefield(BEARS),
    );
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
  });

  test('a creature of the opponent is not counted by "you control"', () => {
    const g = twoSeatGame(
      (b) => b.hand(STUDY).battlefield('Island', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(GIANT),
    );
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('the total toughness of your creatures', () => {
    const g = twoSeatGame((b) =>
      b.hand(WALLS).battlefield('Plains', { count: 2 }).battlefield(BEARS).battlefield(SPIDER),
    );
    g.act(0).cast(WALLS, { pay: true });
    g.passAll();
    g.expect.life(0, 26);
  });

  test('a noncreature permanent has no toughness and adds nothing; a creature with +1/+1 counters adds them', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(WALLS)
        .battlefield('Plains', { count: 2 })
        .battlefield('Sol Ring')
        .battlefield(BEARS, { counters: { '+1/+1': 2 } }),
    );
    g.act(0).cast(WALLS, { pay: true });
    g.passAll();
    g.expect.life(0, 24);
  });

  test('the greatest mana value among your artifacts', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(RELIC)
        .battlefield('Plains', { count: 2 })
        .battlefield('Sol Ring')
        .battlefield('SYNTHETIC Echo Relic'),
    );
    g.act(0).cast(RELIC, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('a cost reduced by the total power of your creatures (CR 601.2f)', () => {
    const g = twoSeatGame((b) =>
      b.hand(COLOSSUS).battlefield('Forest', { count: 3 }).battlefield(BEARS).battlefield(GIANT),
    );
    // {7}{G}{G} less 6: {1}{G}{G}.
    expect(costOf(g, COLOSSUS)).toEqual(['1', 'G', 'G']);
    g.expect.legal(0, { cast: COLOSSUS });
    g.act(0).cast(COLOSSUS, { pay: true });
    g.expect.stack([COLOSSUS]);
  });

  test('too little power: the full cost is needed', () => {
    const g = twoSeatGame((b) =>
      b.hand(COLOSSUS).battlefield('Forest', { count: 3 }).battlefield(BEARS),
    );
    g.expect.illegal(0, { cast: COLOSSUS });
  });
});

describe('devotion (CR 700.5) and the colors of the commanders (CR 903.4)', () => {
  test('each opponent loses X, X your devotion to black, and you gain the life lost this way', () => {
    // The Merchant ({3}{B}{B}) counts its own two symbols once it is on the battlefield; a Zombie adds one.
    const g = twoSeatGame((b) =>
      b.hand(MERCHANT).battlefield('Swamp', { count: 5 }).battlefield(ZOMBIE),
    );
    g.act(0).cast(MERCHANT, { pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.life(0, 23);
  });

  test('a land has no mana cost and counts nothing', () => {
    const g = twoSeatGame((b) => b.hand(MERCHANT).battlefield('Swamp', { count: 5 }));
    g.act(0).cast(MERCHANT, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
  });

  test("only the controller's permanents count", () => {
    const g = twoSeatGame(
      (b) => b.hand(MERCHANT).battlefield('Swamp', { count: 5 }),
      (b) => b.battlefield(ZOMBIE),
    );
    g.act(0).cast(MERCHANT, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
  });

  test('hybrid and Phyrexian symbols count once for each of their colors that the devotion names', () => {
    // {B}{B/R}{2/B}{G/P}{1}: devotion to black is 3, to red 1, to black and red 3 (a hybrid symbol is one symbol),
    // to green 1; the generic symbol counts for nothing.
    const g = twoSeatGame((b) =>
      b.hand(DEVOTION).battlefield('Swamp').battlefield('Mountain').battlefield(IDOL),
    );
    g.act(0).cast(DEVOTION, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });

  test('the number of colors in the commanders identity', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .commander('SYNTHETIC Czar of Two Colors')
      .hand(IDENTITY)
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(IDENTITY, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('no commander: 0', () => {
    const g = twoSeatGame((b) => b.hand(IDENTITY).battlefield('Plains'));
    g.act(0).cast(IDENTITY, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });
});

describe("an object's toughness and counters", () => {
  test("gain life equal to that creature's toughness", () => {
    const g = twoSeatGame((b) =>
      b.hand(GIANT).battlefield(HOST).battlefield('Forest', { count: 4 }),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.passAll();
    g.expect.life(0, 24);
  });

  test('last-known information: the creature died in response, its toughness is the last one it had (CR 113.7a)', () => {
    const g = twoSeatGame((b) =>
      b.hand(HOUND, 'Lightning Bolt').battlefield(HOST).battlefield('Mountain', { count: 3 }),
    );
    g.act(0).cast(HOUND, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${HOST} (ability)`]);
    g.act(0).cast('Lightning Bolt', { targets: [HOUND], pay: true });
    g.passAll();
    g.expect.zone(HOUND, 'graveyard', { seat: 0 });
    g.expect.life(0, 21);
  });

  test('a cost reduced for each +1/+1 counter on the permanent', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(ANGEL)
        .battlefield(HERALD, { counters: { '+1/+1': 2 } })
        .battlefield('Plains', { count: 3 }),
    );
    expect(costOf(g, ANGEL)).toEqual(['2', 'W']);
    g.expect.legal(0, { cast: ANGEL });
  });

  test('without counters the cost is full', () => {
    const g = twoSeatGame((b) =>
      b.hand(ANGEL).battlefield(HERALD).battlefield('Plains', { count: 3 }),
    );
    expect(costOf(g, ANGEL)).toEqual(['4', 'W']);
    g.expect.illegal(0, { cast: ANGEL });
  });
});

describe('an amount compared with a number', () => {
  test('exactly 8 total power: the intervening "if" holds and the card is drawn (CR 603.4)', () => {
    const g = twoSeatGame((b) =>
      b.hand(SCOUT).battlefield('Forest', { count: 2 }).battlefield(GIANT).battlefield(HOUND),
    );
    g.act(0).cast(SCOUT, { pay: true });
    resolveTop(g);
    g.expect.stack([`${SCOUT} (ability)`]);
    resolveTop(g);
    g.expect.handSize(0, 1);
  });

  test('7 total power: the ability never triggers', () => {
    const g = twoSeatGame((b) =>
      b.hand(SCOUT).battlefield('Forest', { count: 2 }).battlefield(GIANT).battlefield(BEARS),
    );
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });

  test('checked again as it resolves: the total fell below 8 in response, so nothing is drawn', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(SCOUT, 'Lightning Bolt')
        .battlefield('Forest', { count: 2 })
        .battlefield('Mountain')
        .battlefield(GIANT)
        .battlefield(HOUND),
    );
    g.act(0).cast(SCOUT, { pay: true });
    resolveTop(g);
    g.expect.stack([`${SCOUT} (ability)`]);
    g.act(0).cast('Lightning Bolt', { targets: [HOUND], pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('"three or more creature cards in your graveyard" is true at three and false at two', () => {
    const three = twoSeatGame((b) =>
      b.hand(COUNT).battlefield('Swamp').graveyard(BEARS).graveyard(BEARS).graveyard(SPIDER),
    );
    three.act(0).cast(COUNT, { pay: true });
    three.passAll();
    three.expect.life(0, 25);
    const two = twoSeatGame((b) =>
      b.hand(COUNT).battlefield('Swamp').graveyard(BEARS).graveyard(BEARS),
    );
    two.act(0).cast(COUNT, { pay: true });
    two.passAll();
    two.expect.life(0, 19);
  });
});

describe('creatures attacking you; opponents with more cards in hand', () => {
  /** Seat 1 attacks seat 0 (and a planeswalker of seat 0) with `attackers`; seat 0 holds Web Swarm and has priority. */
  function underAttack(attackers: readonly (string | { attacker: string; target: string })[]) {
    const b = scenario()
      .seat(0)
      .life(20)
      .hand(SWARM)
      .battlefield('Forest', { count: 3 })
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(BEARS)
      .battlefield(SPIDER)
      .battlefield(GIANT)
      .library(...FILLER)
      .at('precombatMain', { active: 1 });
    const g = b.build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers(
      attackers.map((a) =>
        typeof a === 'string' ? { attacker: a } : { attacker: a.attacker, target: a.target },
      ),
    );
    g.pass(1);
    return g;
  }

  test('X Spiders for X creatures attacking you', () => {
    const g = underAttack([BEARS, SPIDER]);
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect(tokens(g, 'Spider')).toHaveLength(2);
  });

  test('a creature attacking your planeswalker is not attacking you (CR 508.1b)', () => {
    const g = underAttack([BEARS, { attacker: SPIDER, target: 'SYNTHETIC Vanilla Planeswalker' }]);
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect(tokens(g, 'Spider')).toHaveLength(1);
  });

  test('no attackers: no tokens', () => {
    const g = twoSeatGame((b) => b.hand(SWARM).battlefield('Forest', { count: 3 }));
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    expect(tokens(g, 'Spider')).toHaveLength(0);
  });

  test('a Clue for each opponent who has more cards in hand than you', () => {
    const g = toUpkeep(
      (b) => b.battlefield(DETECTIVE).hand('Plains'),
      (b) => b.hand('Plains', 'Plains', 'Plains'),
    );
    resolveTop(g);
    expect(tokens(g, 'Clue')).toHaveLength(1);
  });

  test('an opponent with as many cards or fewer does not count', () => {
    const g = toUpkeep(
      (b) => b.battlefield(DETECTIVE).hand('Plains', 'Plains'),
      (b) => b.hand('Plains', 'Plains'),
    );
    g.expect.stack([`${DETECTIVE} (ability)`]);
    resolveTop(g);
    expect(tokens(g, 'Clue')).toHaveLength(0);
  });
});

describe('tokens that enter tapped (CR 110.5b)', () => {
  test('thirteen tapped Zombies', () => {
    const g = twoSeatGame((b) => b.hand(MUSTER).battlefield('Swamp', { count: 7 }));
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    const zombies = tokens(g, 'Zombie');
    expect(zombies).toHaveLength(13);
    expect(zombies.every((z) => z?.tapped === true)).toBe(true);
  });

  test('tapped Treasure tokens for each Zombie: they cannot be tapped for mana until they untap', () => {
    const g = twoSeatGame((b) =>
      b.hand(HOARD).battlefield('Swamp', { count: 3 }).battlefield(ZOMBIE).battlefield(ZOMBIE),
    );
    g.act(0).cast(HOARD, { pay: true });
    g.passAll();
    const treasures = tokens(g, 'Treasure');
    expect(treasures).toHaveLength(2);
    expect(treasures.every((t) => t?.tapped === true)).toBe(true);
  });

  test('a token that was not asked to enter tapped enters untapped', () => {
    const g = toUpkeep((b) => b.battlefield(RAISER).battlefield(ZOMBIE, { count: 2 }));
    resolveTop(g);
    expect(tokens(g, 'Zombie').every((t) => t?.tapped === false)).toBe(true);
  });

  test('"tapped" is not "becomes tapped": nothing that watches tapping is told', () => {
    const g = twoSeatGame((b) => b.hand(MUSTER).battlefield('Swamp', { count: 7 }));
    const mark = g.mark();
    g.act(0).cast(MUSTER, { pay: true });
    g.passAll();
    // The seven Swamps were tapped for mana; the tokens were not tapped by anything.
    const tappedEvents = g.eventsSince(mark).filter((e) => e.kind === 'tapped');
    expect(tappedEvents).toHaveLength(7);
  });
});

describe('what the validator and the feature list say', () => {
  const amountKinds = [
    'toughnessOf',
    'countersOn',
    'aggregate',
    'devotion',
    'commanderColors',
    'half',
    'multiple',
    'sum',
    'opponentsWithMore',
  ] as const;

  test('every new amount kind and the condition are listed as supported', () => {
    for (const kind of amountKinds) {
      expect(SUPPORTED_FEATURES.amountKinds).toContain(kind);
      expect(isFeatureSupported(`amount:${kind}`)).toBe(true);
    }
    expect(isFeatureSupported('condition:amountIs')).toBe(true);
    expect(isFeatureSupported('selector:attackingYou')).toBe(true);
    expect(isFeatureSupported('token:tapped')).toBe(true);
  });

  test('every card of the slice is valid and supported', () => {
    for (const name of [
      MOURNER,
      TOLL,
      SIPHON,
      RAISER,
      FEAST,
      HORDE,
      CALL,
      COLOSSUS,
      MERCHANT,
      HOST,
      HERALD,
      SCOUT,
      SWARM,
      DETECTIVE,
      MUSTER,
      HOARD,
      SWELL,
    ]) {
      const card = syntheticCard(name);
      expect(validateCard(card), name).toEqual([]);
      expect(card.support).toBe('supported');
    }
  });

  const stub = (effect: unknown) => {
    const base = syntheticCard(STUDY);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, spell: { effect } }] } as never;
  };
  const draws = (count: unknown) => stub({ kind: 'draw', player: { kind: 'you' }, count });
  const reasons = (card: never) => validateCard(card).map((i) => i.message);

  test('an aggregate needs a known stat, a known operation and a filter', () => {
    expect(reasons(draws({ kind: 'aggregate', how: 'median', stat: 'power', filter: {} }))).toEqual(
      [expect.stringContaining('"greatest" or "total"')],
    );
    expect(
      reasons(draws({ kind: 'aggregate', how: 'total', stat: 'loyalty', filter: {} })),
    ).toEqual([expect.stringContaining('unknown stat')]);
    expect(reasons(draws({ kind: 'aggregate', how: 'total', stat: 'power' }))).toEqual([
      expect.stringContaining('needs a filter'),
    ]);
  });

  test('half names its rounding; a multiple is a whole number of two or more; a sum needs two amounts', () => {
    expect(reasons(draws({ kind: 'half', of: 4, round: 'nearest' }))).toEqual([
      expect.stringContaining('rounded "down" or "up"'),
    ]);
    expect(reasons(draws({ kind: 'multiple', factor: 1, of: 4 }))).toEqual([
      expect.stringContaining('factor of 2 or more'),
    ]);
    expect(reasons(draws({ kind: 'multiple', factor: 2.5, of: 4 }))).toEqual([
      expect.stringContaining('factor of 2 or more'),
    ]);
    expect(reasons(draws({ kind: 'sum', of: [3] }))).toEqual([
      expect.stringContaining('at least two amounts'),
    ]);
  });

  test('devotion needs colors, and only real ones', () => {
    expect(reasons(draws({ kind: 'devotion', colors: ['C'] }))).toEqual([
      expect.stringContaining('unknown color'),
    ]);
    expect(reasons(draws({ kind: 'devotion' }))).toEqual([expect.stringContaining('color')]);
  });

  test("an object's toughness is read from a target or the trigger subject, and only where there is one", () => {
    expect(reasons(draws({ kind: 'toughnessOf', of: { kind: 'target', id: 'nope' } }))).toEqual([
      expect.stringContaining('not declared'),
    ]);
    expect(reasons(draws({ kind: 'toughnessOf', of: { kind: 'triggerSubject' } }))).toEqual([
      expect.stringContaining('triggerSubject'),
    ]);
  });

  test('a condition reads the game now: a target or an X has nothing to read there', () => {
    const conditional = (amount: unknown) =>
      stub({
        kind: 'conditional',
        condition: { kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: 1 } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      });
    expect(reasons(conditional({ kind: 'x' }))).toEqual([expect.stringContaining('not x')]);
    expect(reasons(conditional({ kind: 'powerOf', of: { kind: 'target', id: 't1' } }))).toEqual([
      expect.stringContaining('not powerOf'),
    ]);
    expect(reasons(conditional({ kind: 'thisWay', what: 'sacrificed' }))).toEqual([
      expect.stringContaining('not thisWay'),
    ]);
    expect(
      reasons(
        stub({
          kind: 'conditional',
          condition: {
            kind: 'amountIs',
            amount: { kind: 'commanderColors' },
            compare: { cmp: 'about', value: 1 },
          },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        }),
      ),
    ).toEqual([expect.stringContaining('unknown comparison')]);
  });

  test('a static power or toughness cannot count the combat (the layer would read it)', () => {
    const horde = syntheticCard(HORDE);
    const face = horde.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...horde,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'static',
              static: {
                kind: 'characteristicPt',
                power: {
                  kind: 'sum',
                  of: [
                    { kind: 'countOf', filter: { attackingYou: true } },
                    { kind: 'countOf', filter: {} },
                  ],
                },
                toughness: { kind: 'countOf', filter: {} },
              },
            },
          ],
        },
      ],
    } as never;
    expect(reasons(bad)).toEqual([expect.stringContaining('combat')]);
  });
});

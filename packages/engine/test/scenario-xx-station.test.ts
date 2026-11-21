// Station (CR 702.184, 721) and mana abilities whose amount is a count (CR 605.1a, 605.3b).
// Pins: CR 702.184a (Station is an activated ability: tap another untapped creature you control, put charge counters equal to the tapped creature's power on this
// permanent, only as a sorcery), 721.2a ("N+ [abilities]": the abilities are there as long as the permanent has N or more charge counters), 721.4 (the station ability works at
// every count), 302.6 (a creature that came under your control this turn can be tapped for it: it is not its own {T} ability), 605.3b (a mana ability resolves at once and
// reads what it counts then), 608.2h and 113.7a (the power read is the one the creature had when it was tapped).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-station.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const LAND = 'SYNTHETIC Station Land'; // station; 3+ | {G}, {T}: Add {G} for each artifact you control
const SHIP = 'SYNTHETIC Station Spacecraft'; // {T}: Add {C}{C}{C}; station; 5+ | {T}: Add X mana of any one color, X = charge counters
const COUNT = 'SYNTHETIC Count Land'; // {T}: Add {G} for each creature you control
const BEARS = 'Grizzly Bears'; // 2/2
const BIG = 'SYNTHETIC Vanilla 3/3';
const HUGE = 'SYNTHETIC Vanilla 5/5';
/** The index of the Station ability among the derived abilities: the activated one (it moves when a symbol's abilities come in, as a Class level's do). */
const stationIndex = (g: ReturnType<typeof game>, name: string): number => {
  const i = derive(g.state, g.object(name)).abilities.findIndex((a) => a.kind === 'activated');
  if (i < 0) throw new Error(`${name} has no activated ability`);
  return i;
};
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('the cards are valid', () => {
  test.each([LAND, SHIP, COUNT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('a station level holds at least one ability and a threshold of 1 or more, and does not nest', () => {
    const card = syntheticCard(LAND);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const level = face.abilities.find((a) => a.kind === 'stationLevel');
    if (level === undefined) throw new Error('no station level');
    const bad = (abilities: unknown) =>
      JSON.stringify(validateCard({ ...card, faces: [{ ...face, abilities }] } as never));
    expect(bad([{ ...level, threshold: 0 }])).toContain('threshold');
    expect(bad([{ ...level, abilities: [] }])).toContain('abilities');
    expect(bad([{ ...level, abilities: [level] }])).toContain('stationLevel');
  });
});

describe('CR 702.184a: the Station keyword expands into an activated ability', () => {
  test('derive appends it after the printed abilities: tap another untapped creature, charge counters equal to its power, sorcery speed', () => {
    const g = game((b) => b.battlefield(LAND));
    const abilities = derive(g.state, g.object(LAND)).abilities;
    expect(abilities.map((a) => a.kind)).toEqual(['mana', 'keyword', 'activated']);
    expect(abilities[2]).toEqual({
      kind: 'activated',
      cost: [
        {
          kind: 'tapPermanents',
          filter: { types: ['creature'], controller: 'you', other: true },
          count: 1,
        },
      ],
      timing: 'sorcery',
      effect: {
        kind: 'addCounters',
        objects: { kind: 'this' },
        counter: 'charge',
        count: { kind: 'tappedAsCostPower' },
      },
    });
  });
});

describe('paying Station: the creature is tapped and its power is the number of counters', () => {
  test('a 3/3 tapped puts three charge counters on the permanent as the ability resolves', () => {
    const g = game((b) => b.battlefield(LAND, BIG));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.expect.tapped(BIG);
    g.expect.counters(LAND, {});
    g.expect.stack([`${LAND} (ability)`]);
    g.passAll();
    g.expect.counters(LAND, { charge: 3 });
  });

  test('the power is read with the layers (CR 613.4c): +1/+1 counters count', () => {
    const g = game((b) => b.battlefield(LAND).battlefield(BEARS, { counters: { '+1/+1': 2 } }));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.passAll();
    g.expect.counters(LAND, { charge: 4 });
  });

  test('with two creatures the player chooses which one is tapped; the other stays untapped', () => {
    const g = game((b) => b.battlefield(LAND, BIG, HUGE));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(HUGE);
    g.expect.tapped(HUGE);
    g.passAll();
    g.expect.counters(LAND, { charge: 5 });
  });

  test('the counters stack: a second activation adds to the first', () => {
    const g = game((b) => b.battlefield(LAND, BIG, BEARS));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.act(0).choosePermanents(BIG);
    g.passAll();
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.passAll();
    g.expect.counters(LAND, { charge: 5 });
  });

  test('a creature that came under your control this turn can be tapped for it (CR 302.6)', () => {
    const g = game((b) => b.battlefield(LAND).battlefield(BIG, { fresh: true }));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.passAll();
    g.expect.counters(LAND, { charge: 3 });
  });

  test('another creature is required: the permanent itself is never the creature tapped, and with none the ability is illegal', () => {
    const g = game((b) => b.battlefield(LAND));
    g.expect.illegal(0, { activate: LAND });
  });

  test('an already tapped creature does not pay for it', () => {
    const g = game((b) => b.battlefield(LAND).battlefield(BIG, { tapped: true }));
    g.expect.illegal(0, { activate: LAND });
  });

  test('a creature an opponent controls does not pay for it: it is not one you control', () => {
    const g = scenario().seat(0).battlefield(LAND).seat(1).battlefield(BIG).build();
    g.expect.illegal(0, { activate: LAND });
  });

  test('a creature with power 0 or less adds no counters', () => {
    const g = game((b) => b.battlefield(LAND).battlefield(BEARS, { counters: { '-1/-1': 3 } }));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.passAll();
    g.expect.counters(LAND, {});
  });

  test('only as a sorcery (CR 702.184a): not with an object on the stack, not in another phase', () => {
    const g = game((b) => b.battlefield(LAND, BIG));
    g.expect.legal(0, { activate: LAND });
    const h = scenario().seat(0).battlefield(LAND, BIG).at('beginningOfCombat').seat(1).build();
    h.expect.illegal(0, { activate: LAND });
  });
});

describe('CR 721.2a, 721.4: the abilities of a station symbol are there from N charge counters on', () => {
  test('below N the permanent has only what is printed without a symbol (CR 721.4): the station ability works at every count', () => {
    const g = game((b) => b.battlefield(LAND, { counters: { charge: 2 } }));
    expect(derive(g.state, g.object(LAND)).abilities.map((a) => a.kind)).toEqual([
      'mana',
      'keyword',
      'activated',
    ]);
  });

  test('at exactly N the ability is there, after the others', () => {
    const g = game((b) => b.battlefield(LAND, { counters: { charge: 3 } }));
    expect(derive(g.state, g.object(LAND)).abilities.map((a) => a.kind)).toEqual([
      'mana',
      'keyword',
      'mana',
      'activated',
    ]);
  });

  test('counters put by Station turn the ability on in the middle of a turn', () => {
    const g = game((b) => b.battlefield(LAND, BIG));
    g.act(0).activate(LAND, { ability: stationIndex(g, LAND) });
    g.passAll();
    expect(derive(g.state, g.object(LAND)).abilities).toHaveLength(4);
  });
});

describe('a mana ability whose amount is a count (CR 605.1a, 605.3b)', () => {
  test('{T}: Add {G} for each creature you control adds one for each, read as it resolves', () => {
    const g = game((b) => b.battlefield(COUNT, BIG, BEARS));
    g.act(0).tapForMana(COUNT);
    g.expect.pool(0, 'GG');
    g.expect.stack([]);
  });

  test('with no creature it makes no mana, so it is no source of mana (as a devotion of 0 is none)', () => {
    const g = game((b) => b.battlefield(COUNT));
    expect(g.act(0).try.tapForMana(COUNT).ok).toBe(false);
    g.expect.tapped(COUNT, false);
  });

  test('the count is what is on the battlefield when it is activated, the creatures of the opponent are not counted', () => {
    const g = scenario().seat(0).battlefield(COUNT, BIG).seat(1).battlefield(HUGE, BEARS).build();
    g.act(0).tapForMana(COUNT);
    g.expect.pool(0, 'G');
  });
});

describe('Station Land: 3+ | {G}, {T}: Add {G} for each artifact you control', () => {
  const ROCK = 'SYNTHETIC Colorless Fodder'; // an artifact

  test('with fewer than 3 charge counters only the printed {T}: Add {G} is there', () => {
    const g = game((b) => b.battlefield(LAND, { counters: { charge: 2 } }).battlefield(ROCK));
    expect(derive(g.state, g.object(LAND)).abilities.filter((a) => a.kind === 'mana')).toHaveLength(
      1,
    );
    g.act(0).tapForMana(LAND);
    g.expect.pool(0, 'G');
  });

  test('with 3 or more: pay {G} and tap for one {G} for each artifact you control', () => {
    const g = game((b) =>
      b.battlefield(LAND, { counters: { charge: 3 } }).battlefield('Forest', ROCK, ROCK),
    );
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(LAND, { ability: 2 });
    g.expect.tapped(LAND);
    g.expect.pool(0, 'GG'); // the {G} from the Forest paid the {G}; one {G} for each of the two artifacts
  });
});

describe('Station Spacecraft: 5+ | {T}: Add X mana of any one color, X the number of charge counters', () => {
  test('below 5 only {T}: Add {C}{C}{C}', () => {
    const g = game((b) => b.battlefield(SHIP, { counters: { charge: 4 } }));
    expect(derive(g.state, g.object(SHIP)).abilities.filter((a) => a.kind === 'mana')).toHaveLength(
      1,
    );
    g.act(0).tapForMana(SHIP);
    g.expect.pool(0, 'CCC');
  });

  test('with 7 counters: seven mana of the one color chosen', () => {
    const g = game((b) => b.battlefield(SHIP, { counters: { charge: 7 } }));
    g.act(0).tapForMana(SHIP, { ability: 2, color: 'U' });
    g.expect.pool(0, 'UUUUUUU');
    g.expect.tapped(SHIP);
  });

  test('a color is a choice: all seven are of the one color, never a mix', () => {
    const g = game((b) => b.battlefield(SHIP, { counters: { charge: 5 } }));
    g.act(0).tapForMana(SHIP, { ability: 2, color: 'R' });
    g.expect.pool(0, 'RRRRR');
  });
});

describe('CR 721.2b: a station symbol with a power and toughness box makes the permanent a creature', () => {
  const CRAFT = 'SYNTHETIC Station Creature Spacecraft'; // station; 4+ | flying [3/4]

  test('the card is valid and has no power and toughness of its own (CR 721.2c)', () => {
    expect(validateCard(syntheticCard(CRAFT))).toEqual([]);
    const g = game((b) => b.battlefield(CRAFT));
    const d = derive(g.state, g.object(CRAFT));
    expect(d.power).toBeNull();
    expect(d.types).not.toContain('creature');
  });

  test('below 4 charge counters it is not a creature and has no flying', () => {
    const g = game((b) => b.battlefield(CRAFT, { counters: { charge: 3 } }));
    const d = derive(g.state, g.object(CRAFT));
    expect(d.types).toEqual(['artifact']);
    expect(d.power).toBeNull();
    expect(d.toughness).toBeNull();
  });

  test('at exactly 4 it is an artifact creature with base power and toughness 3/4 and flying', () => {
    const g = game((b) => b.battlefield(CRAFT, { counters: { charge: 4 } }));
    const d = derive(g.state, g.object(CRAFT));
    expect(d.types).toEqual(['artifact', 'creature']);
    expect([d.power, d.toughness]).toEqual([3, 4]);
    expect(d.abilities.some((a) => a.kind === 'keyword')).toBe(true);
  });

  test('counters put by Station turn it into a creature in the middle of a turn, and more counters do not change its size', () => {
    const g = game((b) => b.battlefield(CRAFT, HUGE));
    g.act(0).activate(CRAFT, { ability: stationIndex(g, CRAFT) });
    g.passAll();
    const d = derive(g.state, g.object(CRAFT));
    expect(d.types).toContain('creature');
    expect([d.power, d.toughness]).toEqual([3, 4]);
  });
});

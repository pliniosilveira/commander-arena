// The shapes the Oracle parser must write for the Angels deck texts that need no new primitive (D-149): they run on the engine's existing
// effects, so the tests pin that those shapes do what the texts say.
// Pins: CR 115.1 and 601.2c (a target slot with an "or" filter and "up to"), CR 702.29e (typecycling), CR 303.4 (an Aura's static
// abilities), CR 205.1b (a type in addition), CR 603.10a (a leaves-the-battlefield trigger looks back at what had counters), CR 400.7
// (a card that left is a new object: "return this card" needs it still where the Aura went). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-angels-shapes.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BANISH = 'SYNTHETIC Banishing Light Sorcery';
const RUIN = 'SYNTHETIC Ruin Angel';
const MANTLE = 'SYNTHETIC Angelic Mantle';
const SLEUTH = 'SYNTHETIC Counter Sleuth';
const SHRINE = 'SYNTHETIC Quiet Shrine';
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4
const RING = 'Sol Ring';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([BANISH, RUIN, MANTLE, SLEUTH, SHRINE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Exile target artifact, enchantment, or creature with power 4 or greater"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(BANISH)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .battlefield(RING, SHRINE, BEARS, ANGEL)
      .build();

  test.each([RING, SHRINE, ANGEL])('%s is a legal target and is exiled', (name) => {
    const g = game();
    g.act(0).cast(BANISH, { targets: [name], pay: true });
    g.passAll();
    g.expect.zone(name, 'exile', { seat: 1 });
  });

  test('a creature with power 2 is not a legal target', () => {
    const g = game();
    g.act(0).cast(BANISH);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')) ?? [];
    expect(legal).toContain(g.id(RING));
    expect(legal).toContain(g.id(SHRINE));
    expect(legal).toContain(g.id(ANGEL));
    expect(legal).not.toContain(g.id(BEARS));
  });
});

describe('"When this creature enters, exile up to two target artifacts and/or enchantments"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand(RUIN)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(RING, SHRINE, BEARS)
      .build();

  test('two targets are exiled', () => {
    const g = game();
    g.act(0).cast(RUIN, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(RING, SHRINE);
    g.passAll();
    g.expect.zone(RING, 'exile', { seat: 1 });
    g.expect.zone(SHRINE, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('none is allowed, and a creature that is not an artifact is not a legal target', () => {
    const g = game();
    g.act(0).cast(RUIN, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')) ?? [];
    expect(legal).not.toContain(g.id(BEARS));
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('Plainscycling {2} finds a Plains', () => {
    const g = scenario()
      .seat(0)
      .hand(RUIN)
      .library('Island', 'Plains', 'Island')
      .battlefield('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(RUIN, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Plains');
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone(RUIN, 'graveyard', { seat: 0 });
  });
});

describe("an Aura that gives +4/+4, flying, first strike and Angel and returns to its owner's hand when its creature dies", () => {
  const game = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(MANTLE, { attachedTo: 'bears' })
      .seat(1)
      .build();

  test('the creature is 6/6 with flying, first strike and the Angel type', () => {
    const g = game();
    g.expect.pt('bears', 6, 6);
    g.expect.derived('bears', {
      keywords: ['flying', 'firstStrike'],
      subtypes: ['Bear', 'Angel'],
    });
  });

  test("when the creature dies, the Aura returns to its owner's hand", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(MANTLE, { attachedTo: 'bears' })
      .seat(1)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(MANTLE, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"Whenever another permanent you control leaves the battlefield, if it had counters on it, investigate"', () => {
  const game = (counters: Record<string, number> | undefined) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SLEUTH)
      .battlefield(BEARS, { label: 'bears', ...(counters === undefined ? {} : { counters }) })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();

  test('a creature with a +1/+1 counter dies: a Clue', () => {
    const g = game({ '+1/+1': 1 });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 1 });
  });

  test('a creature with no counters dies: nothing', () => {
    const g = game(undefined);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.noObject('Clue');
  });

  test('a permanent of the opponent with counters leaving does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SLEUTH)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.noObject('Clue');
  });

  test('the Sleuth itself leaving does not trigger it ("another")', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SLEUTH, { counters: { '+1/+1': 1 } })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [SLEUTH], pay: true });
    g.passAll();
    g.expect.noObject('Clue');
  });
});

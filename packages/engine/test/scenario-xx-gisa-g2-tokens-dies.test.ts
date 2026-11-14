// "Whenever you create or sacrifice a token, each opponent loses 1 life." (D-465) and "Whenever one or more other creatures die, draw a card. This ability triggers only once each
// turn." (D-466).
// Pins: CR 111.2 (the player who creates a token is its owner and controls it as it enters), CR 701.21 (Sacrifice), CR 603.2c (an ability triggers once for each event; a batch of deaths
// is one event), CR 603.10a (a leaves-the-battlefield trigger looks back, so a creature that dies with the others is seen), CR 700.4 (dies), CR 603.2 ("This ability triggers only once
// each turn").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-gisa-g2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LEECH = 'SYNTHETIC Token Leech'; // Flying; whenever you create or sacrifice a token, each opponent loses 1 life
const SCHOLAR = 'SYNTHETIC Grave Scholar'; // whenever one or more other creatures die, draw a card; once each turn
const SWARM = 'SYNTHETIC Rat Swarm'; // sorcery: two 1/1 Rat tokens
const SWEEP = 'SYNTHETIC Grim Sweep'; // sorcery: destroy all creatures
const ALTAR = 'SYNTHETIC Altar'; // sacrifice a creature: you gain 2 life
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

describe('the cards are valid', () => {
  test.each([LEECH, SCHOLAR, SWARM, SWEEP])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Whenever you create or sacrifice a token, each opponent loses 1 life."', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .define(syntheticCard(LEECH))
        .define(syntheticCard(SWARM))
        .seat(0)
        .library(...LIBRARY)
        .hand(SWARM)
        .battlefield('Swamp', 'Swamp')
        .battlefield(LEECH),
    )
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two tokens created: it triggers for each one, so each opponent loses 2 life', () => {
    const g = game();
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    g.expect.zone('Rat', 'battlefield', { seat: 0, count: 2 });
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });

  test('a token sacrificed: each opponent loses 1 life', () => {
    const g = game((bld) => bld.define(syntheticCard(ALTAR)).battlefield(ALTAR));
    g.act(0).cast(SWARM, { pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.act(0).activate(ALTAR);
    g.act(0).choosePermanents('Rat[0]');
    g.expect.stack([`${LEECH} (ability)`, `${ALTAR} (ability)`]);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a creature that is not a token sacrificed: nothing', () => {
    const g = game((bld) => bld.define(syntheticCard(ALTAR)).battlefield(ALTAR, BEARS));
    g.act(0).activate(ALTAR);
    g.act(0).choosePermanents(BEARS);
    g.expect.stack([`${ALTAR} (ability)`]);
    g.passAll();
    g.expect.life(1, 40);
  });

  test('a token the opponent creates: nothing', () => {
    const g = scenario()
      .define(syntheticCard(LEECH))
      .define(syntheticCard(SWARM))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LEECH)
      .seat(1)
      .library(...LIBRARY)
      .hand(SWARM)
      .battlefield('Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SWARM, { pay: true });
    g.passAll();
    g.expect.zone('Rat', 'battlefield', { seat: 1, count: 2 });
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });
});

describe('"Whenever one or more other creatures die, draw a card. This ability triggers only once each turn."', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .define(syntheticCard(SCHOLAR))
        .define(syntheticCard(SWEEP))
        .seat(0)
        .library(...LIBRARY)
        .hand(SWEEP, BOLT)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain')
        .battlefield(SCHOLAR),
    )
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'victim' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature of the opponent dies: draw a card', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: ['victim'], pay: true });
    g.expect.librarySize(0, 8);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.librarySize(0, 7);
  });

  test('three creatures die together: one card, not three (one event)', () => {
    const g = game((b) => b.battlefield(SPIDER, 'Llanowar Elves'));
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 7);
  });

  test('the creature itself dying does not count, but another one dying with it does', () => {
    const g = game();
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    // The bears and the scholar die together; the scholar sees the bears die (CR 603.10a), so it draws.
    g.expect.zone(SCHOLAR, 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 7);
  });

  test('only once each turn: a second death in the same turn draws nothing', () => {
    const g = game((b) => b.battlefield(SPIDER));
    g.act(0).cast(BOLT, { targets: ['victim'], pay: true });
    g.passAll();
    g.expect.librarySize(0, 7);
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 7);
  });

  test('nothing dies but the creature itself: no card', () => {
    const g = scenario()
      .define(syntheticCard(SCHOLAR))
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', SCHOLAR)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [SCHOLAR], pay: true });
    g.passAll();
    g.expect.zone(SCHOLAR, 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 8);
  });
});

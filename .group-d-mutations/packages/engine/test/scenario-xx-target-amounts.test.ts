// Amounts that read a chosen target, with last-known information (D-092 primitive 1).
// Pins: CR 608.2h (Resolving Spells and Abilities): an effect that needs information from a specific
// object uses its current information while it is where the effect expected it, and its last-known
// information once it left (113.7a), so "Its controller gains life equal to its power" after the
// creature was exiled gives the power it last had, counters and effects included; CR 608.2b: a
// spell whose only target is illegal when it resolves does not resolve, so nothing is gained or lost;
// CR 202.3 (Mana Value): the total amount of mana in the mana cost; CR 202.3a: no mana cost is 0;
// CR 400.7: a card that moved is a new object, so the target's old id reads from last-known
// information; CR 119.1, 119.3 (Life): a gain or loss of life is a change of the life total.
// Cards: SYNTHETIC Exile Gain Power, Weigh Creature, Reanimate Pay Life, Costly Counter
// (src/cards/fixtures/synthetic-references.ts), SYNTHETIC Shrink (-2/-2), and the real Grizzly
// Bears (2/2, {1}{G}), Giant Spider (2/4, {3}{G}), Lightning Bolt and Swamp.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

const GAIN_POWER = 'SYNTHETIC Exile Gain Power';
const WEIGH = 'SYNTHETIC Weigh Creature';
const REANIMATE = 'SYNTHETIC Reanimate Pay Life';
const COSTLY = 'SYNTHETIC Costly Counter';
const WIPE = 'SYNTHETIC Graveyard Wipe';
const SHRINK = 'SYNTHETIC Shrink';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';

describe('a target’s power, read after the target was exiled (CR 608.2h)', () => {
  const build = (counters: Record<string, number> = {}) =>
    scenario()
      .seat(0)
      .hand(GAIN_POWER)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { counters })
      .build();

  test('its controller gains life equal to the power the creature had', () => {
    const g = build();
    g.act(0).cast(GAIN_POWER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.life(1, 42);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('+1/+1 counters count, because last-known information is the creature as it was', () => {
    const g = build({ '+1/+1': 2 });
    g.act(0).cast(GAIN_POWER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.life(1, 44);
  });

  test('an effect that pumped it earlier this turn counts too', () => {
    const g = scenario()
      .seat(0)
      .hand(GAIN_POWER)
      .hand(SHRINK)
      .battlefield('Plains', 'Plains', 'Swamp')
      .seat(1)
      .battlefield(SPIDER, { counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(SHRINK, { targets: [SPIDER], pay: true });
    g.passAll();
    // 2/4 with a counter is 3/5; -2/-2 makes it 1/3.
    g.expect.pt(SPIDER, 1, 3);
    g.act(0).cast(GAIN_POWER, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.life(1, 41);
  });

  test('the life goes to the creature’s controller, not to the caster, when it was stolen', () => {
    const g = scenario()
      .seat(0)
      .hand(GAIN_POWER)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { controller: 0 })
      .build();
    g.act(0).cast(GAIN_POWER, { targets: [BEARS], pay: true });
    g.passAll();
    // Owned by seat 1, controlled by seat 0: "its controller" is the one who controlled it last.
    g.expect.life(0, 42);
    g.expect.life(1, 40);
  });

  test('a target already gone when the spell resolves: it fizzles and nothing is gained', () => {
    const g = scenario()
      .seat(0)
      .hand(GAIN_POWER)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .hand(BOLT)
      .battlefield(BEARS, 'Mountain')
      .build();
    g.act(0).cast(GAIN_POWER, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(GAIN_POWER, 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'fizzled' }], {});
    g.expect.life(1, 40);
    g.expect.life(0, 40);
    g.expect.invariants();
  });
});

describe('a target’s power and mana value, read while it is still on the battlefield', () => {
  test('a creature that stays: power with a counter, mana value from its cost', () => {
    const g = scenario()
      .seat(0)
      .hand(WEIGH)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .battlefield(SPIDER, { counters: { '+1/+1': 1 } })
      .build();
    g.act(0).cast(WEIGH, { targets: [SPIDER], pay: true });
    g.passAll();
    // Loses 3 (the Spider is 3/5 with the counter) and gains 4 (the mana value of {3}{G}).
    g.expect.life(1, 40 - 3 + 4);
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });
});

describe('a card’s mana value after it moved (CR 202.3, 608.2h)', () => {
  const build = (graveyard: string) =>
    scenario()
      .seat(0)
      .hand(REANIMATE)
      .battlefield('Swamp', 'Swamp')
      .graveyard(graveyard)
      .seat(1)
      .build();

  test('reanimating a creature: you lose life equal to the card’s mana value', () => {
    const g = build(SPIDER);
    g.act(0).cast(REANIMATE, { targets: [{ name: SPIDER, zone: 'graveyard' }], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.life(0, 36);
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a cheaper card costs less life', () => {
    const g = build(BEARS);
    g.act(0).cast(REANIMATE, { targets: [{ name: BEARS, zone: 'graveyard' }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(0, 38);
  });

  test('a card that left the graveyard before it resolved: it fizzles, no life is lost', () => {
    const g = scenario()
      .seat(0)
      .hand(REANIMATE)
      .battlefield('Swamp', 'Swamp')
      .graveyard(SPIDER)
      .seat(1)
      .hand(WIPE)
      .battlefield('Swamp', 'Swamp')
      .build();
    g.act(0).cast(REANIMATE, { targets: [{ name: SPIDER, zone: 'graveyard' }], pay: true });
    g.act(0).pass();
    // In response the opponent exiles seat 0's graveyard: the target is gone (CR 608.2b).
    g.act(1).cast(WIPE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 0 });
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
    g.expect.life(0, 40);
    g.expect.invariants();
  });
});

describe('a spell’s mana value, read after it was countered (CR 608.2h)', () => {
  test('its controller loses life equal to the spell’s mana value', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .hand(COSTLY)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast(COSTLY, { targets: [{ name: BEARS, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(0, 38);
    g.expect.life(1, 40);
  });
});

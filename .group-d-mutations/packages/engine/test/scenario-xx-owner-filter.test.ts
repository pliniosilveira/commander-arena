// Cards selected by owner (D-092 primitive 3): "Exile target player's graveyard."
// Pins: CR 108.3: the owner of a card is the player who started the game with it in their deck, and
// a graveyard is its owner's (CR 404.1), so "target player's graveyard" is every card whose owner
// is the chosen player and that is in a graveyard; CR 115.1, 115.4: a player is a legal target; CR
// 603.3d: a triggered ability's target is chosen as it goes on the stack; CR 608.2b: a target that
// became illegal (here a player who left the game) leaves the spell with nothing to do; CR 400.7:
// each exiled card is a new object in exile.
// Cards: SYNTHETIC Graveyard Wipe (an instant) and SYNTHETIC Graveyard Watcher (a creature with an
// enters trigger) from src/cards/fixtures/synthetic-references.ts, and real cards as graveyard fodder.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WIPE = 'SYNTHETIC Graveyard Wipe';
const WATCHER = 'SYNTHETIC Graveyard Watcher';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';

/** Both graveyards hold cards; seat 0 holds the spell or creature. */
function build(hand: string) {
  return scenario()
    .seat(0)
    .hand(hand)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .graveyard(BEARS, { label: 'mine1' })
    .graveyard(BOLT, { label: 'mine2' })
    .seat(1)
    .graveyard(SPIDER, { label: 'theirs1' })
    .graveyard('Island', { label: 'theirs2' })
    .graveyard(BEARS, { label: 'theirs3' })
    .build();
}

const zoneOf = (g: ScenarioGame, label: string) => g.object(label).zone;

describe('"Exile target player’s graveyard" as a spell', () => {
  test('the opponent’s graveyard is exiled and the caster’s is untouched', () => {
    const g = build(WIPE);
    g.act(0).cast(WIPE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    for (const label of ['theirs1', 'theirs2', 'theirs3']) {
      expect(zoneOf(g, label)).toBe('exile');
      // The cards stay their owner's (CR 108.3).
      expect(g.object(label).owner).toBe(1);
    }
    expect(zoneOf(g, 'mine1')).toBe('graveyard');
    expect(zoneOf(g, 'mine2')).toBe('graveyard');
    expect(g.state.seats[1]?.graveyard).toEqual([]);
    g.expect.invariants();
  });

  test('targeting yourself exiles your own graveyard, not the opponent’s', () => {
    const g = build(WIPE);
    g.act(0).cast(WIPE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(zoneOf(g, 'mine1')).toBe('exile');
    expect(zoneOf(g, 'mine2')).toBe('exile');
    expect(zoneOf(g, 'theirs1')).toBe('graveyard');
    expect(zoneOf(g, 'theirs3')).toBe('graveyard');
  });

  test('a graveyard that is empty: nothing happens, and nothing breaks', () => {
    const g = scenario()
      .seat(0)
      .hand(WIPE)
      .battlefield('Swamp', 'Swamp')
      .graveyard(BEARS, { label: 'mine1' })
      .seat(1)
      .build();
    g.act(0).cast(WIPE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(zoneOf(g, 'mine1')).toBe('graveyard');
    g.expect.zone(WIPE, 'graveyard', { seat: 0 });
  });

  test('a stolen creature that died is in its owner’s graveyard, and the wipe finds it there', () => {
    // A card goes to its owner's graveyard whoever controlled it (CR 400.3): the owner of the card,
    // not the controller of the permanent it was, picks it.
    const g = scenario()
      .seat(0)
      .hand(WIPE, BOLT)
      .battlefield('Swamp', 'Swamp', 'Mountain')
      .seat(1)
      .battlefield(BEARS, { controller: 0, label: 'stolen' })
      .build();
    g.act(0).cast(BOLT, { targets: ['stolen'], pay: true });
    g.passAll();
    expect(zoneOf(g, 'stolen')).toBe('graveyard');
    expect(g.state.seats[1]?.graveyard).toHaveLength(1);
    g.act(0).cast(WIPE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(zoneOf(g, 'stolen')).toBe('exile');
  });
});

describe('"When this creature enters, exile target player’s graveyard" as a triggered ability', () => {
  test('the controller chooses the player as the trigger goes on the stack, then it exiles', () => {
    const g = build(WATCHER);
    g.act(0).cast(WATCHER, { pay: true });
    g.passAll();
    // Two legal targets (either player): the controller is asked (CR 603.3d).
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([`${WATCHER} (ability)`]);
    // Nothing is exiled until the ability resolves.
    expect(zoneOf(g, 'theirs1')).toBe('graveyard');
    g.passAll();
    for (const label of ['theirs1', 'theirs2', 'theirs3']) expect(zoneOf(g, label)).toBe('exile');
    expect(zoneOf(g, 'mine1')).toBe('graveyard');
    g.expect.zone(WATCHER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the player may choose themselves', () => {
    const g = build(WATCHER);
    g.act(0).cast(WATCHER, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    expect(zoneOf(g, 'mine1')).toBe('exile');
    expect(zoneOf(g, 'mine2')).toBe('exile');
    expect(zoneOf(g, 'theirs2')).toBe('graveyard');
  });
});

describe('an owner that needs no target', () => {
  test('"exile each opponent’s graveyard" names the owners by a selector, not a target', () => {
    const sweep = singleFaceCard({
      name: 'SYNTHETIC Test Opponent Sweep',
      manaCost: ['B'],
      types: ['sorcery'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: "Exile each opponent's graveyard.",
      spell: {
        effect: {
          kind: 'exile',
          objects: { kind: 'each', filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } } },
        },
      },
    });
    const g = scenario()
      .seat(0)
      .hand(sweep.name)
      .battlefield('Swamp')
      .graveyard(BEARS, { label: 'mine' })
      .seat(1)
      .graveyard(SPIDER, { label: 'theirs' })
      .define(sweep)
      .build();
    g.act(0).cast(sweep.name, { pay: true });
    g.passAll();
    expect(zoneOf(g, 'theirs')).toBe('exile');
    expect(zoneOf(g, 'mine')).toBe('graveyard');
  });
});

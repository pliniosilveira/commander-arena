// Scenario 1 (SPEC 12): hexproof in response.
// Pins: CR 702.11b (Hexproof): a permanent with hexproof can't be the target of spells or abilities
// its controller's opponents control; CR 608.2b (Resolving Spells and Abilities): the target is
// checked again as the spell resolves, and a spell whose only target is illegal doesn't resolve,
// does nothing and goes to its owner's graveyard (CR 608.2b); CR 613.1f (Layer 6): an
// ability-granting static effect applies as soon as its source is on the battlefield; CR 702.8a
// (Flash) lets the Aura be cast with the timing of an instant; CR 608.3c: an Aura spell
// enters attached to what it targeted.
// The response is a SYNTHETIC Aura with flash: "Flash. Enchant creature. Enchanted creature has
// hexproof." (invented, defined in this file; the engine has no other way to give hexproof).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const FLASH_AURA = 'SYNTHETIC Flash Hexproof Aura';

const flashHexproofAura = singleFaceCard({
  name: FLASH_AURA,
  manaCost: ['G'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Flash. Enchant creature. Enchanted creature has hexproof.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flash' } },
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached' },
        keyword: { kind: 'hexproof' },
      },
    },
  ],
});

/** Seat 0 has cast Bolt at seat 1's Bears and passed; seat 1 has priority with the Bolt on top. */
function boltOnTheStack() {
  const g = scenario()
    .seat(0)
    .hand(BOLT, { label: 'bolt1' })
    .hand(BOLT, { label: 'bolt2' })
    .battlefield('Mountain', 'Mountain')
    .seat(1)
    .hand(FLASH_AURA, 'SYNTHETIC Hex Aura')
    .battlefield('Forest', 'Forest')
    .battlefield(BEARS)
    .define(flashHexproofAura)
    .build();
  g.act(0).cast('bolt1', { targets: [BEARS], pay: true });
  g.act(0).pass();
  return g;
}

/** Both players pass once: the object on top of the stack resolves (CR 117.4). */
function resolveTop(g: ScenarioGame, first: 0 | 1) {
  g.act(first).pass();
  g.act(first === 0 ? 1 : 0).pass();
}

const castable = (g: ScenarioGame, seat: 0 | 1, name: string) => {
  const id = g.id({ name, zone: 'hand', seat });
  return getLegalActions(g.state, seat).some(
    (a: Action) => a.kind === 'castSpell' && a.object === id,
  );
};

describe('SPEC scenario 1: hexproof in response (CR 702.11b, 608.2b)', () => {
  test('without a response, Bolt kills the creature (the baseline)', () => {
    const g = boltOnTheStack();
    g.act(1).pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'fizzled' });
  });

  test('the controller gives it hexproof in response: Bolt does not resolve and goes to the graveyard', () => {
    const g = boltOnTheStack();
    g.act(1).cast(FLASH_AURA, { targets: [BEARS], pay: true });
    g.expect.stack([FLASH_AURA, BOLT]);
    // The Aura resolves first (last in, first out) and enters attached to the creature.
    resolveTop(g, 1);
    g.expect.zone(FLASH_AURA, 'battlefield', { seat: 1 });
    g.expect.attached(FLASH_AURA, BEARS);
    g.expect.stack([BOLT]);
    const mark = g.mark();
    resolveTop(g, 0);
    // The Bolt's only target is illegal now: it doesn't resolve, does nothing, and goes to its
    // owner's graveyard.
    g.expect.eventLog([{ kind: 'fizzled', cardName: BOLT }], { since: mark });
    g.expect.noEvent({ kind: 'damageDealt' });
    g.expect.noEvent({ kind: 'resolved' }, { since: mark });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('only the opponent of its controller is stopped: hexproof is not offered as a target to seat 0', () => {
    const g = boltOnTheStack();
    g.act(1).cast(FLASH_AURA, { targets: [BEARS], pay: true });
    resolveTop(g, 1);
    // Seat 0 has priority again. A second Bolt offers the players, not the hexproof creature.
    g.act(0).cast('bolt2');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(BEARS))).toBe(false);
    expect(legal.filter((t) => t.kind === 'player')).toHaveLength(2);
  });

  test('the response needs flash: the same Aura without it cannot be cast on the stack', () => {
    const g = boltOnTheStack();
    expect(castable(g, 1, FLASH_AURA)).toBe(true);
    expect(castable(g, 1, 'SYNTHETIC Hex Aura')).toBe(false);
    expect(g.act(1).try.cast('SYNTHETIC Hex Aura').ok).toBe(false);
  });
});

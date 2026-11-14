// Hexproof (CR 702.11) and shroud (CR 702.18) in target legality (CR 115, 601.2c, 608.2b).
// Pins: CR 702.11b: a permanent with hexproof can't be the target of spells or abilities its
// controller's opponents control; CR 702.18a: a permanent with shroud can't be the target of any
// spell or ability; CR 608.2b: targets are checked again on resolution, an illegal target is not
// affected, and a spell whose targets are all illegal doesn't resolve; CR 113.6 / 702.11b: the
// keywords are properties of permanents, so a spell on the stack with them is still targetable.
// Cards are SYNTHETIC (src/cards/fixtures) or real fixtures. "Gains hexproof in response" is
// written as a change of the target's characteristics (the CR 608.2b example); continuous effects
// that grant abilities arrive with the layers (M5), so the test patches the card definition.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, type Keyword } from '../src/index';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';
import { nameOf } from './scenario-names';

type Slot = { kind: 'player'; seat: number } | { kind: 'object'; name: string };

/** The legal targets the engine offers for the first slot of the pending targets decision. */
function offered(g: ScenarioGame): Slot[] {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
  const spec = d.specs[0];
  if (!spec) throw new Error('no target slot');
  return spec.legal.map((t) =>
    t.kind === 'player'
      ? { kind: 'player', seat: t.seat }
      : { kind: 'object', name: nameOf(g, t.id) },
  );
}

const hasObject = (slots: Slot[], name: string) =>
  slots.some((s) => s.kind === 'object' && s.name === name);

/** Adds a keyword to the card definition of `name` (all copies); the state is otherwise as is. */
function grant(g: ScenarioGame, name: string, keyword: Keyword): ScenarioGame {
  const definitions = g.state.definitions.map((def) =>
    def.name === name
      ? {
          ...def,
          faces: def.faces.map((f) => ({
            ...f,
            abilities: [...f.abilities, { kind: 'keyword' as const, keyword }],
          })),
        }
      : def,
  );
  return createDriver({ ...g.state, definitions });
}

describe('CR 702.11b (Hexproof): opponents cannot target it, its controller can', () => {
  function board() {
    return scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Murder')
      .battlefield('Mountain')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .hand('Lightning Bolt', 'Unsummon')
      .battlefield('Mountain', 'Island')
      .battlefield('SYNTHETIC Hexproof Bear')
      .build();
  }

  test('a Bolt from the opponent does not offer the hexproof creature, only the others', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt');
    const slots = offered(g);
    expect(hasObject(slots, 'SYNTHETIC Hexproof Bear')).toBe(false);
    expect(hasObject(slots, 'Grizzly Bears')).toBe(true);
    expect(slots.filter((s) => s.kind === 'player')).toHaveLength(2);
  });

  test('naming the hexproof creature anyway is refused, and the cast can still be cancelled', () => {
    const g = board();
    g.act(0).cast('Lightning Bolt');
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('SYNTHETIC Hexproof Bear'), specId: 't1' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a legal target/);
    g.act(0).cancel();
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
  });

  test('the controller may target its own hexproof creature', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('SYNTHETIC Hexproof Bear')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt');
    expect(hasObject(offered(g), 'SYNTHETIC Hexproof Bear')).toBe(true);
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('SYNTHETIC Hexproof Bear'), specId: 't1' }],
    });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('SYNTHETIC Hexproof Bear', 'graveyard', { seat: 0 });
  });

  test('a removal spell with only a hexproof creature to aim at is not castable at all', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .build();
    const murder = g.id('Murder');
    expect(getLegalActions(g.state, 0).some((a: Action) => a.kind === 'castSpell')).toBe(false);
    const r = g.act(0).try.cast('Murder');
    expect(r.ok).toBe(false);
    expect(g.state.objects[murder]?.zone).toBe('hand');
  });

  test('the same removal spell becomes castable when a second, ordinary creature exists', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder');
    const slots = offered(g);
    expect(hasObject(slots, 'Grizzly Bears')).toBe(true);
    expect(hasObject(slots, 'SYNTHETIC Hexproof Bear')).toBe(false);
  });

  test('a hexproof creature SPELL on the stack is still a legal target (the keyword is for permanents)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Hexproof Bear')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast('SYNTHETIC Hexproof Bear', { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell');
    expect(hasObject(offered(g), 'SYNTHETIC Hexproof Bear')).toBe(true);
  });

  test('hexproof does not stop effects that do not target (a sweeper)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .battlefield('SYNTHETIC Shroud Bear')
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Hexproof Bear', 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Shroud Bear', 'graveyard', { seat: 1 });
  });
});

describe('CR 702.18a (Shroud): nobody can target it, not even its controller', () => {
  test('the opponent is not offered the shroud creature', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('SYNTHETIC Shroud Bear')
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt');
    const slots = offered(g);
    expect(hasObject(slots, 'SYNTHETIC Shroud Bear')).toBe(false);
    expect(hasObject(slots, 'Grizzly Bears')).toBe(true);
  });

  test('the controller is not offered its own shroud creature either', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('SYNTHETIC Shroud Bear')
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt');
    const slots = offered(g);
    expect(hasObject(slots, 'SYNTHETIC Shroud Bear')).toBe(false);
    expect(hasObject(slots, 'Grizzly Bears')).toBe(true);
  });

  test('a spell whose only creature is a shroud creature is not castable by anyone', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield('SYNTHETIC Shroud Bear')
      .seat(1)
      .battlefield('SYNTHETIC Shroud Bear')
      .build();
    expect(getLegalActions(g.state, 0).some((a: Action) => a.kind === 'castSpell')).toBe(false);
    expect(g.act(0).try.cast('Murder').ok).toBe(false);
  });
});

describe('CR 608.2b (Resolving Spells and Abilities): targets are checked again on resolution', () => {
  function boltAtBears() {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.act(0).pass();
    return g;
  }

  test('the only target gains hexproof in response: the spell fizzles and does nothing', () => {
    const g = grant(boltAtBears(), 'Grizzly Bears', { kind: 'hexproof' });
    g.act(1).pass();
    g.expect.eventLog([{ kind: 'fizzled', cardName: 'Lightning Bolt' }]);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.damage('Grizzly Bears', 0);
    g.expect.noEvent({ kind: 'damageDealt' });
  });

  test('the only target gains shroud in response: the spell fizzles too', () => {
    const g = grant(boltAtBears(), 'Grizzly Bears', { kind: 'shroud' });
    g.act(1).pass();
    g.expect.eventLog([{ kind: 'fizzled', cardName: 'Lightning Bolt' }]);
    g.expect.damage('Grizzly Bears', 0);
  });

  test("its controller's own spell still resolves on a creature that gained hexproof (opponents only)", () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    const hexproof = grant(g, 'Grizzly Bears', { kind: 'hexproof' });
    hexproof.passAll();
    hexproof.expect.noEvent({ kind: 'fizzled' });
    hexproof.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('a creature that gained shroud is illegal even for its controller on resolution', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    const shroud = grant(g, 'Grizzly Bears', { kind: 'shroud' });
    shroud.passAll();
    shroud.expect.eventLog([{ kind: 'fizzled', cardName: 'Lightning Bolt' }]);
    shroud.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  function twinBoltAt(a: string, b: string) {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Twin Bolt')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Llanowar Elves')
      .build();
    g.act(0).cast('SYNTHETIC Twin Bolt', { targets: [{ name: a }, { name: b }], pay: true });
    g.act(0).pass();
    return g;
  }

  test('a two-target spell with one target made illegal still resolves for the other', () => {
    const g = grant(twinBoltAt('Grizzly Bears', 'Llanowar Elves'), 'Llanowar Elves', {
      kind: 'hexproof',
    });
    g.act(1).pass();
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 1 });
    g.expect.damage('Llanowar Elves', 0);
    g.expect.zone('SYNTHETIC Twin Bolt', 'graveyard', { seat: 0 });
  });

  test('the same spell with both targets made illegal fizzles', () => {
    const base = twinBoltAt('Grizzly Bears', 'Llanowar Elves');
    const g = grant(grant(base, 'Llanowar Elves', { kind: 'hexproof' }), 'Grizzly Bears', {
      kind: 'shroud',
    });
    g.act(1).pass();
    g.expect.eventLog([{ kind: 'fizzled', cardName: 'SYNTHETIC Twin Bolt' }]);
    g.expect.damage('Grizzly Bears', 0);
    g.expect.damage('Llanowar Elves', 0);
  });

  test('without any change both targets die', () => {
    const g = twinBoltAt('Grizzly Bears', 'Llanowar Elves');
    g.act(1).pass();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
  });
});

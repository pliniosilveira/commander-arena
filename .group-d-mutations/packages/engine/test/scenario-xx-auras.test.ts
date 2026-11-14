// Auras (CR 303.4, 702.5): casting, attaching, fizzling and falling off.
// Pins: CR 303.4a (an Aura spell requires a target, defined by its enchant ability), CR 608.3c (an
// Aura spell enters attached to what it targeted), CR 608.3b / 608.2b (an Aura whose target is illegal
// on resolution doesn't resolve and goes to the graveyard), CR 303.4c / 704.5m (an Aura attached to
// an illegal object, or to nothing, is put into its owner's graveyard), CR 303.4e (an Aura's
// controller is separate from the enchanted object's controller), CR 702.5a (Enchant restricts both
// what an Aura spell can target and what it can enchant), CR 702.11b (hexproof limits targeting only,
// so it does not make an attached Aura illegal). Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions } from '../src/index';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';
import { nameOf } from './scenario-names';

const MIGHT = 'SYNTHETIC Might Aura'; // Enchant creature; +2/+2
const WINGS = 'SYNTHETIC Wings Aura'; // Enchant creature; flying
const LOYAL = 'SYNTHETIC Loyal Aura'; // Enchant creature you control; +1/+1, vigilance
const LAND_AURA = 'SYNTHETIC Shield Land Aura'; // Enchant land; hexproof
const HEX = 'SYNTHETIC Hex Aura'; // Enchant creature; hexproof
const CURSE = 'SYNTHETIC Curse Aura'; // Enchant creature; -2/-2
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

/** The legal targets offered for the first target slot of the pending decision, by card name. */
function offered(g: ScenarioGame): string[] {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).map((t) =>
    t.kind === 'object'
      ? g.object(t.id).card === null
        ? '?'
        : nameOf(g, t.id)
      : `player ${t.seat}`,
  );
}

/** Replaces the type line of every card named `name`; the state is otherwise as it is. */
function retype(g: ScenarioGame, name: string, types: readonly ('artifact' | 'creature')[]) {
  const definitions = g.state.definitions.map((def) =>
    def.name === name
      ? {
          ...def,
          faces: def.faces.map((f) => ({
            ...f,
            types,
            power: types.includes('creature') ? f.power : null,
            toughness: types.includes('creature') ? f.toughness : null,
          })),
        }
      : def,
  );
  return createDriver({ ...g.state, definitions });
}

describe('CR 303.4a, 608.3c: casting an Aura aims it and it enters attached', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .build();

  test('the targets decision offers the creatures the enchant filter names, not players or lands', () => {
    const g = build();
    g.act(0).cast(MIGHT);
    expect(offered(g).sort()).toEqual([BEARS, 'SYNTHETIC Vanilla 3/3']);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.specs.map((s) => s.specId)).toEqual(['enchant']);
  });

  test('the Aura enters the battlefield attached to its target and gives its bonus', () => {
    const g = build();
    const mark = g.mark();
    g.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
    g.expect.stack([MIGHT]);
    g.passAll();
    g.expect.zone(MIGHT, 'battlefield', { seat: 0 });
    g.expect.attached(MIGHT, BEARS);
    g.expect.pt(BEARS, 4, 4);
    g.expect.eventLog(
      [
        { kind: 'zoneChanged', toZone: 'battlefield', cardName: MIGHT },
        { kind: 'attached', object: g.id(MIGHT), to: g.id(BEARS) },
        { kind: 'resolved' },
      ],
      { since: mark },
    );
    g.expect.invariants();
  });

  test('the view says what is attached to what, for the Aura and for the creature', () => {
    const g = build();
    g.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
    g.passAll();
    for (const seat of [0, 1] as const) {
      const field = g.view(seat).battlefield;
      const aura = field.find((o) => o.name === MIGHT);
      const bears = field.find((o) => o.name === BEARS);
      expect(aura?.attachedTo).toBe(g.id(BEARS));
      expect(aura?.attachments).toBeUndefined();
      expect(bears?.attachments).toEqual([g.id(MIGHT)]);
      expect(bears?.attachedTo).toBeUndefined();
      expect(bears).toMatchObject({ power: 4, toughness: 4 });
    }
  });

  test('an Aura can enchant an opponent creature; its controller stays the caster (CR 303.4e)', () => {
    const g = build();
    g.act(0).cast(MIGHT, { targets: ['SYNTHETIC Vanilla 3/3'], pay: true });
    g.passAll();
    g.expect.attached(MIGHT, 'SYNTHETIC Vanilla 3/3');
    g.expect.pt('SYNTHETIC Vanilla 3/3', 5, 5);
    expect(g.object(MIGHT).controller).toBe(0);
    expect(g.object('SYNTHETIC Vanilla 3/3').controller).toBe(1);
  });

  test('cancelling the cast puts the Aura back in the hand, unchanged', () => {
    const g = build();
    const before = g.positionHash();
    g.act(0).cast(MIGHT).cancel();
    g.expect.position(before);
    g.expect.zone(MIGHT, 'hand', { seat: 0 });
  });

  test('an Aura is not castable when nothing could be enchanted', () => {
    const g = scenario().seat(0).hand(MIGHT).battlefield('Forest', 'Forest').seat(1).build();
    expect(getLegalActions(g.state, 0).some((a: Action) => a.kind === 'castSpell')).toBe(false);
    expect(g.act(0).try.cast(MIGHT).ok).toBe(false);
    g.expect.zone(MIGHT, 'hand', { seat: 0 });
  });

  test('"Enchant creature you control" offers only the caster creatures', () => {
    const g = scenario()
      .seat(0)
      .hand(LOYAL)
      .battlefield('Forest')
      .battlefield(BEARS)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .build();
    g.act(0).cast(LOYAL);
    expect(offered(g)).toEqual([BEARS]);
  });

  test('"Enchant land" offers lands, and only lands', () => {
    const g = scenario()
      .seat(0)
      .hand(LAND_AURA)
      .battlefield('Plains', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .battlefield('Swamp')
      .build();
    g.act(0).cast(LAND_AURA);
    expect(offered(g).sort()).toEqual(['Forest', 'Plains', 'Swamp']);
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id({ name: 'Swamp' }), specId: 'enchant' }],
    });
    g.act(0).payAuto();
    g.passAll();
    g.expect.attached(LAND_AURA, 'Swamp');
  });

  test('naming a creature for "Enchant land" is refused', () => {
    const g = scenario()
      .seat(0)
      .hand(LAND_AURA)
      .battlefield('Plains')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(LAND_AURA);
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(BEARS), specId: 'enchant' }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('CR 702.11b: hexproof stops the targeting by opponents, not an Aura already on it', () => {
  test('an opponent Aura cannot be aimed at a hexproof creature; the controller can', () => {
    const g = scenario()
      .seat(0)
      .hand(MIGHT, WINGS)
      .battlefield('Forest', 'Forest', 'Island', 'Island')
      .battlefield(BEARS)
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .build();
    g.act(0).cast(MIGHT);
    expect(offered(g)).toEqual([BEARS]);
    g.act(0).cancel();
    const own = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .battlefield('SYNTHETIC Hexproof Bear')
      .seat(1)
      .build();
    own.act(0).cast(MIGHT);
    expect(offered(own)).toEqual(['SYNTHETIC Hexproof Bear']);
  });

  test('a creature that gains hexproof after the Aura is on it keeps the Aura', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CURSE, { attachedTo: VANILLA })
      .seat(1)
      .battlefield(VANILLA)
      .battlefield(HEX, { attachedTo: VANILLA })
      .build({ settle: true });
    g.expect.attached(CURSE, VANILLA);
    g.expect.zone(CURSE, 'battlefield', { seat: 0 });
    // Hexproof (from Hex Aura) and -2/-2 at once, on a 3/3 that is now a 1/1.
    g.expect.pt(VANILLA, 1, 1);
  });
});

describe('CR 608.3b, 608.2b: an Aura whose target is illegal does not resolve', () => {
  function bolted() {
    const g = scenario()
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    return g;
  }

  test('Bolt kills the creature in response: the Aura fizzles into the graveyard', () => {
    const g = bolted();
    const mark = g.mark();
    g.passAll();
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
    g.expect.noObject(MIGHT, { zone: 'battlefield' });
    g.expect.eventLog(
      [
        { kind: 'died', cardName: BEARS },
        { kind: 'fizzled', cardName: MIGHT },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'attached' });
    g.expect.noEvent({ kind: 'countered' });
  });

  test('it did not enter the battlefield even for an instant: no zone change to the battlefield', () => {
    const g = bolted();
    const mark = g.mark();
    g.passAll();
    g.expect.noEvent({ kind: 'zoneChanged', toZone: 'battlefield' }, { since: mark });
  });
});

describe('CR 704.5m: an Aura that is attached to nothing or to something illegal falls off', () => {
  test('the creature dies: the Aura goes to its owner graveyard in the same state-based check run', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(MIGHT, { attachedTo: BEARS })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the Aura of one player on a creature of the other goes to the Aura owner graveyard', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield(MIGHT, { attachedTo: BEARS })
      .seat(1)
      .battlefield(BEARS, { label: BEARS })
      .build();
    const aura = g.id(MIGHT);
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.objects[aura]).toBeUndefined();
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
  });

  test('an Aura with nothing attached (built that way) is put into the graveyard at once', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MIGHT)
      .battlefield(BEARS)
      .seat(1)
      .build({ settle: true });
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the creature stops being a creature: "Enchant creature" no longer fits, so the Aura falls off', () => {
    const base = scenario()
      .seat(0)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    base.expect.attached(MIGHT, BEARS);
    // The characteristics change (CR 608.2b example); no effect that retypes exists yet.
    const g = retype(base, BEARS, ['artifact']);
    g.act(0).pass();
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('"Enchant creature you control": when the creature changes controller the Aura falls off', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOYAL, { attachedTo: BEARS })
      .battlefield(BEARS, { controller: 1 })
      .seat(1)
      .build({ settle: true });
    g.expect.zone(LOYAL, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('"Enchant creature you control" stays on a creature its controller still controls', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOYAL, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build({ settle: true });
    g.expect.attached(LOYAL, BEARS);
    g.expect.pt(BEARS, 3, 3);
  });

  test('an Aura cannot enchant itself (CR 303.4d): attached to itself it falls off', () => {
    const built = scenario().seat(0).battlefield(MIGHT).battlefield(BEARS).seat(1).build();
    const aura = built.id(MIGHT);
    // The DSL cannot name an object as its own host, so the impossible state is written directly.
    const objects = {
      ...built.state.objects,
      [aura]: { ...built.object(MIGHT), attachedTo: aura },
    };
    const g = createDriver({ ...built.state, objects });
    g.act(0).pass();
    g.expect.zone(MIGHT, 'graveyard', { seat: 0 });
  });
});

describe('Auras and replays', () => {
  test('the same actions on the same scenario give the same state, hash included', () => {
    const run = () => {
      const g = scenario()
        .seat(0)
        .hand(MIGHT, WINGS)
        .battlefield('Forest', 'Forest', 'Island', 'Island')
        .battlefield(BEARS)
        .seat(1)
        .battlefield('SYNTHETIC Vanilla 3/3')
        .build();
      g.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
      g.passAll();
      g.act(0).cast(WINGS, { targets: [BEARS], pay: true });
      g.passAll();
      return g;
    };
    const a = run();
    const b = run();
    expect(a.hash()).toBe(b.hash());
    a.expect.attached(WINGS, BEARS);
    expect(a.view(0).battlefield.find((o) => o.name === BEARS)?.attachments).toEqual([
      a.id(MIGHT),
      a.id(WINGS),
    ]);
  });
});

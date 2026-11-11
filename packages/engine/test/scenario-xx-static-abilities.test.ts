// Static abilities that change power and toughness or grant keywords (CR 604, 611.3, 613).
// Pins: CR 611.3a (a continuous effect from a static ability isn't "locked in": it applies at any
// given moment to whatever its text indicates, so creatures that enter later are included), CR 611.3b
// (it applies only while the permanent generating it is on the battlefield), CR 613.1f (layer 6:
// ability-adding effects), CR 613.4c (layer 7c: counters and effects that modify power and toughness
// stack by addition), CR 702.9b (flying), CR 702.17b (reach), CR 702.11b (hexproof), CR 704.5f (a
// creature with toughness 0 or less dies). Cards are SYNTHETIC (src/cards/fixtures) or defined here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, stateHash } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const V1 = 'SYNTHETIC Vanilla 1/1';
const V2 = 'SYNTHETIC Vanilla 2/2';
const FLIER = 'SYNTHETIC Flier 1/1';
const MIGHT = 'SYNTHETIC Might Aura';
const WINGS = 'SYNTHETIC Wings Aura';
const HEX = 'SYNTHETIC Hex Aura';
const BLADE = 'SYNTHETIC Blade';
const CLOAK = 'SYNTHETIC Cloak';
const BOOTS = 'SYNTHETIC Wing Boots';
const ANTHEM = 'SYNTHETIC Anthem';
const BEARER = 'SYNTHETIC Standard Bearer';
const BANNER = 'SYNTHETIC Plague Banner';
const PUMP_BEAR = 'SYNTHETIC Pump Bear';

/** Destroy target enchantment. */
const DISENCHANT = singleFace({
  name: 'SYNTHETIC Test Disenchant',
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Destroy target enchantment.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['enchantment'] } } }],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

const viewOf = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.view(seat).battlefield.find((o) => o.name === name);

describe('CR 613.4c: "+N/+N" from a static ability, in the view and in combat', () => {
  test('the number the engine derives is the number every seat sees', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
    for (const seat of [0, 1] as const) {
      expect(viewOf(g, BEARS, seat)).toMatchObject({ power: 4, toughness: 4 });
    }
  });

  test('an equipped creature hits for the bonus: 2 + 2 combat damage to the player', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.playCombat({ attack: [BEARS], until: 'endOfCombat' });
    g.expect.life(1, 36);
  });

  test('an enchanted blocker survives damage that would kill it without the Aura', () => {
    const g = scenario()
      .seat(0)
      .battlefield(VANILLA)
      .seat(1)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BEARS)
      .build();
    // Seat 0 attacks with a 3/3; the 4/4 Bears block, take 3 and live, and deal 4 to kill it.
    g.playCombat({
      attack: [VANILLA],
      block: [{ blocker: BEARS, attacker: VANILLA }],
      until: 'endOfCombat',
    });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(VANILLA, 'graveyard', { seat: 0 });
    g.expect.damage(BEARS, 3);
  });

  test('a negative bonus can kill: toughness 0 or less is state-based (CR 704.5f)', () => {
    const g = scenario()
      .seat(0)
      .hand(BANNER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(V1, VANILLA)
      .build();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.expect.zone(V1, 'graveyard', { seat: 1 });
    g.expect.pt(VANILLA, 2, 2);
  });

  test('the bonus is gone with the source: destroying the Aura restores the base numbers', () => {
    const g = scenario()
      .define(DISENCHANT)
      .seat(0)
      .hand('SYNTHETIC Test Disenchant')
      .battlefield('Plains')
      .battlefield(BEARS)
      .seat(1)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .build();
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast('SYNTHETIC Test Disenchant', { targets: [MIGHT], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
    g.expect.zone(MIGHT, 'graveyard', { seat: 1 });
  });
});

describe('CR 613.1f: keywords granted by static abilities are seen by the rules that read keywords', () => {
  test('a granted keyword is among the derived abilities and the view keywords', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WINGS, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    expect(derive(g.state, g.object(BEARS)).abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
    ]);
    expect(viewOf(g, BEARS, 1)?.keywords).toEqual(['flying']);
  });

  test('a keyword the creature already has is not added twice', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WINGS, { attachedTo: FLIER })
      .battlefield(FLIER)
      .seat(1)
      .build();
    expect(derive(g.state, g.object(FLIER)).abilities).toHaveLength(1);
  });

  test('a granted ability goes after the printed ones, so activation indexes do not move', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WINGS, { attachedTo: 'SYNTHETIC Pump Bear' })
      .battlefield(PUMP_BEAR, 'Forest')
      .seat(1)
      .build();
    const kinds = derive(g.state, g.object(PUMP_BEAR)).abilities.map((a) => a.kind);
    expect(kinds).toEqual(['activated', 'keyword']);
    g.act(0).activate(PUMP_BEAR, { pay: true });
    g.passAll();
    g.expect.pt(PUMP_BEAR, 3, 3);
  });

  test('flying: an enchanted creature cannot be blocked by a creature without flying or reach', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WINGS, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(VANILLA, FLIER)
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(VANILLA, BEARS, false);
    g.expect.canBlock(FLIER, BEARS, true);
  });

  test('flying: the same creature without the Aura can be blocked by the ground creature', () => {
    const g = scenario().seat(0).battlefield(BEARS).seat(1).battlefield(VANILLA).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(VANILLA, BEARS, true);
  });

  test('flying: a creature that is given flying can block a flier', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FLIER)
      .seat(1)
      .battlefield(WINGS, { attachedTo: BEARS })
      .battlefield(BEARS, VANILLA)
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(FLIER);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(BEARS, FLIER, true);
    g.expect.canBlock(VANILLA, FLIER, false);
  });

  test('hexproof: an opponent cannot target a creature that an Equipment gives hexproof', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield(CLOAK, { attachedTo: BEARS })
      .battlefield(BEARS, VANILLA)
      .build();
    g.act(0).cast('Lightning Bolt');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const ids = d.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])) ?? [];
    expect(ids).toEqual([g.id(VANILLA)]);
  });

  test('hexproof: a creature with the Equipment lying next to it, unattached, can be targeted', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield(CLOAK)
      .battlefield(BEARS)
      .build();
    g.act(0).cast('Lightning Bolt');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.specs[0]?.legal.some((t) => t.kind === 'object' && t.id === g.id(BEARS))).toBe(true);
  });

  test('hexproof: an Aura that grants it makes the same Bolt unable to name the creature', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield(HEX, { attachedTo: BEARS })
      .battlefield(BEARS)
      .build();
    g.act(0).cast('Lightning Bolt');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.specs[0]?.legal.some((t) => t.kind === 'object')).toBe(false);
  });

  test('two keywords from one Equipment: flying and trample together', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BOOTS, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(V2, FLIER)
      .build();
    expect(viewOf(g, BEARS, 1)?.keywords).toEqual(['flying', 'trample']);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(V2, BEARS, false);
    g.expect.canBlock(FLIER, BEARS, true);
  });
});

describe('CR 611.3a: "creatures you control get +1/+1" is not locked in', () => {
  test('creatures that enter later are included, and only on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .hand(V2)
      .battlefield(ANTHEM, BEARS, 'Plains', 'Plains')
      .seat(1)
      .battlefield(VANILLA)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(VANILLA, 3, 3); // the opponent's creature is not "you control"
    const inHand = g.view(0).seats[0]?.hand?.find((o) => o.name === V2);
    expect(inHand).toMatchObject({ power: 2, toughness: 2 });
    g.act(0).cast(V2, { pay: true });
    g.expect.stack([V2]);
    expect(g.view(0).stack.find((o) => o.name === V2)).toMatchObject({ power: 2, toughness: 2 });
    g.passAll();
    g.expect.pt(V2, 3, 3);
  });

  test('"you" follows the controller of the source: a stolen Anthem helps its new controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANTHEM, { controller: 1 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(VANILLA)
      .build();
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(VANILLA, 4, 4);
  });

  test('a creature that stops being one stops being affected, and a source off the battlefield gives nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(ANTHEM)
      .graveyard(ANTHEM)
      .exile(ANTHEM)
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 2, 2);
  });

  test('"other": the Standard Bearer boosts the rest of the team and not itself', () => {
    const g = scenario().seat(0).battlefield(BEARER, BEARS).seat(1).battlefield(VANILLA).build();
    g.expect.pt(BEARER, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(VANILLA, 3, 3);
    expect(viewOf(g, BEARS)?.keywords).toEqual(['flying']);
    expect(viewOf(g, BEARER)?.keywords).toEqual([]);
  });

  test('two Standard Bearers each boost the other', () => {
    const g = scenario().seat(0).battlefield(BEARER, BEARER).seat(1).build();
    for (const o of g.find({ name: BEARER })) {
      const d = derive(g.state, o);
      expect([d.power, d.toughness]).toEqual([3, 3]);
    }
  });

  test('a static ability affects only the permanents it names: the Aura boosts one creature', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BEARS, V2)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(V2, 2, 2);
  });
});

describe('CR 613.4c: counters, until-end-of-turn effects and static abilities add up', () => {
  test('2/2 with a +1/+1 counter (3), an Aura (+2), an Anthem (+1) and a pump (+1) is 7/7', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PUMP_BEAR, { counters: { '+1/+1': 1 } })
      .battlefield(MIGHT, { attachedTo: PUMP_BEAR })
      .battlefield(ANTHEM, 'Forest')
      .seat(1)
      .build();
    g.expect.pt(PUMP_BEAR, 6, 6);
    g.act(0).activate(PUMP_BEAR, { pay: true });
    g.passAll();
    g.expect.pt(PUMP_BEAR, 7, 7);
    expect(viewOf(g, PUMP_BEAR, 1)).toMatchObject({ power: 7, toughness: 7 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(PUMP_BEAR, 6, 6);
  });

  test('a -1/-1 counter and a static bonus still cancel by addition', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANTHEM, BEARS)
      .battlefield(V1, { counters: { '-1/-1': 1 } })
      .seat(1)
      .build();
    // 1/1 with a -1/-1 counter is 0/0 and dies; with an Anthem it is 1/1 and lives.
    g.expect.pt(V1, 1, 1);
  });
});

describe('replay determinism', () => {
  test('the same actions give the same state hash, and replaying the log reproduces it', () => {
    const build = () =>
      scenario()
        .seat(0)
        .hand(MIGHT)
        .battlefield(BLADE, ANTHEM, 'Forest', 'Forest', 'Forest', 'Forest')
        .battlefield(BEARS, VANILLA)
        .seat(1)
        .battlefield(V2)
        .build();
    const g = build();
    g.act(0).activate(BLADE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(MIGHT, { targets: [VANILLA], pay: true });
    g.passAll();
    g.act(0).activate(BLADE, { targets: [VANILLA], pay: true });
    g.passAll();
    let state = build().state;
    for (const { seat, action } of g.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(g.hash());
    expect(state).toEqual(g.state);
  });
});

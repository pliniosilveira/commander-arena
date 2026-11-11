// "Until end of turn" power and toughness changes (CR 611.2, 613.4c, 514.2).
// Pins: CR 611.2a (a continuous effect from a resolving spell or ability lasts as long as it says),
// CR 611.2c (the set of objects it modifies is fixed when it begins), CR 400.7 (an object that
// changes zones is a new object), CR 613.4c (layer 7c: counters and effects that modify power and
// toughness), CR 514.2 (at cleanup damage is removed and "until end of turn" effects end at the same
// time), CR 704.5f (a creature with toughness 0 or less dies), CR 608.2b (a pump whose target is
// gone does nothing). Cards are SYNTHETIC (src/cards/fixtures) or defined in this file.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';
import { ENGINE_VERSION, type ObjectId } from '../src/index';
import { scenario } from '../src/testing/index';

const BEAR = 'SYNTHETIC Pump Bear';
const COACH = 'SYNTHETIC Coach';

/** Creatures you control get +1/+1 until end of turn. */
const RALLY = singleFace({
  name: 'SYNTHETIC Test Rally',
  manaCost: ['1', 'W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Creatures you control get +1/+1 until end of turn.',
  spell: {
    effect: {
      kind: 'modifyPt',
      objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
      power: 1,
      toughness: 1,
      duration: 'untilEndOfTurn',
    },
  },
});

describe('CR 611.2a: a pump lasts until end of turn', () => {
  test('resolving adds one continuous effect with the shape the engine documents', () => {
    const g = scenario().seat(0).battlefield(BEAR, 'Forest').seat(1).build();
    g.act(0).activate(BEAR, { pay: true });
    g.expect.pt(BEAR, 2, 2);
    expect(g.state.continuousEffects).toEqual([]);
    g.passAll();
    expect(g.state.continuousEffects).toEqual([
      {
        id: expect.stringMatching(/^ce\d+$/),
        timestamp: expect.any(Number),
        objects: [g.id(BEAR)],
        until: 'endOfTurn',
        change: { kind: 'modifyPt', power: 1, toughness: 1 },
      },
    ]);
    g.expect.pt(BEAR, 3, 3);
    expect(g.view(1).battlefield.find((o) => o.name === BEAR)).toMatchObject({
      power: 3,
      toughness: 3,
    });
  });

  test('it lasts through the rest of the turn and ends at cleanup, not before', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, 'Forest')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    for (const step of ['beginningOfCombat', 'endOfCombat', 'postcombatMain', 'end'] as const) {
      g.advanceTo(step);
      g.expect.pt(BEAR, 3, 3);
      expect(g.state.continuousEffects, step).toHaveLength(1);
    }
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(BEAR, 2, 2);
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('it also ends on the opponent turn if it was made then, at that turn cleanup', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, 'Forest')
      .library('Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest')
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.expect.pt(BEAR, 3, 3);
    g.advanceTo('end');
    g.expect.pt(BEAR, 3, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(BEAR, 2, 2);
  });

  test('two pumps stack: +1/+1 twice is +2/+2, and both end together', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, 'Forest', 'Forest')
      .library('Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest')
      .build();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.expect.pt(BEAR, 3, 3);
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.expect.pt(BEAR, 4, 4);
    expect(g.state.continuousEffects.map((e) => e.id)).toHaveLength(2);
    expect(new Set(g.state.continuousEffects.map((e) => e.id)).size).toBe(2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(BEAR, 2, 2);
  });

  test('a pump of a different size stacks with counters in layer 7c (CR 613.4c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, { counters: { '+1/+1': 1 } })
      .battlefield('Forest')
      .seat(1)
      .build();
    g.expect.pt(BEAR, 3, 3);
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.expect.pt(BEAR, 4, 4);
    const shrunk = scenario()
      .seat(0)
      .battlefield(BEAR, { counters: { '-1/-1': 1 } })
      .battlefield('Forest')
      .seat(1)
      .build();
    shrunk.expect.pt(BEAR, 1, 1);
    shrunk.act(0).activate(BEAR, { pay: true });
    shrunk.passAll();
    shrunk.expect.pt(BEAR, 2, 2);
  });
});

describe('the pump matters to combat and ends together with damage (CR 514.2)', () => {
  function combat() {
    const g = scenario()
      .seat(0)
      .battlefield(BEAR, 'Forest', 'Forest')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.playCombat({
      attack: [BEAR],
      block: [{ blocker: 'SYNTHETIC Vanilla 3/3', attacker: BEAR }],
      until: 'declareBlockers',
    });
    return g;
  }

  test('without a pump the 2/2 dies to the 3/3 and deals no lethal damage', () => {
    const g = combat();
    g.advanceTo('endOfCombat');
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'battlefield', { seat: 1 });
  });

  test('pumped twice after blockers it is a 4/4: it survives and kills the blocker', () => {
    const g = combat();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.expect.pt(BEAR, 4, 4);
    g.advanceTo('endOfCombat');
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.damage(BEAR, 3);
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'graveyard', { seat: 1 });
  });

  test('at cleanup the damage is removed as the pump ends, so the bear is still alive', () => {
    // 3 damage on a creature that is 2/2 again would be lethal if the effect ended first.
    const g = combat();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.act(0).activate(BEAR, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.damage(BEAR, 0);
    g.expect.pt(BEAR, 2, 2);
  });
});

describe('CR 611.2c: the set of affected objects is fixed when the effect begins', () => {
  const build = () =>
    scenario()
      .define(RALLY)
      .seat(0)
      .hand(RALLY.name, 'Grizzly Bears')
      .battlefield('Plains', 'Plains', 'Forest', 'Forest', 'Forest')
      .battlefield('Grizzly Bears', { label: 'old' })
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .build();

  test('"creatures you control" pumps only yours; a creature that enters later is not pumped', () => {
    const g = build();
    g.act(0).cast(RALLY.name, { pay: true });
    g.passAll();
    g.expect.pt('old', 3, 3);
    g.expect.pt('theirs', 2, 2);
    expect(g.state.continuousEffects[0]?.objects).toEqual([g.id('old')]);
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'hand' }, { pay: true });
    g.passAll();
    g.expect.pt({ name: 'Grizzly Bears', zone: 'battlefield', seat: 0, nth: 1 }, 2, 2);
    g.expect.pt('old', 3, 3);
  });

  test('a pumped creature that leaves and returns is a new object and is not pumped (CR 400.7)', () => {
    const g = scenario()
      .define(RALLY)
      .seat(0)
      .hand(RALLY.name)
      .battlefield('Plains', 'Plains', 'Forest', 'Forest')
      .battlefield('Grizzly Bears', { label: 'old' })
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .build();
    g.act(0).cast(RALLY.name, { pay: true });
    g.passAll();
    g.expect.pt('old', 3, 3);
    // Bounce it with Unsummon (the opponent's spell) and put it back by casting it again later.
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    expect(g.state.continuousEffects).toHaveLength(1);
    expect(g.state.objects[g.state.continuousEffects[0]?.objects[0] as ObjectId]).toBeUndefined();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.pt('Grizzly Bears', 2, 2); // a new object: the effect does not know it
  });
});

describe('targets that go away, and pumps that kill', () => {
  test('a pump whose only target left does nothing and adds no effect (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(COACH)
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island', 'Grizzly Bears')
      .build();
    g.act(0).activate(COACH, { targets: [{ name: 'Grizzly Bears' }] });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.act(1).pass();
    g.act(0).pass(); // Unsummon resolves; the Coach ability has no target left
    g.passAll();
    g.expect.eventLog([{ kind: 'fizzled' }]);
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('a +2/+2 from {T} on a chosen creature pumps that creature, the coach included', () => {
    const g = scenario().seat(0).battlefield(COACH).seat(1).battlefield('Grizzly Bears').build();
    g.act(0).activate(COACH, { targets: [{ name: COACH }] });
    g.passAll();
    g.expect.pt(COACH, 3, 3);
    g.expect.pt('Grizzly Bears', 2, 2);
  });

  test('-2/-2 until end of turn on a 2/2 leaves toughness 0, so it dies (CR 704.5f)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Shrink')
      .battlefield('Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Shrink', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('-2/-2 on a pumped creature kills it only when the total reaches 0', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Shrink')
      .battlefield('Swamp', 'Forest')
      .battlefield(BEAR)
      .seat(1)
      .build();
    g.act(0).activate(BEAR).payManual(['Forest']); // leave the Swamp for the Shrink
    g.passAll();
    g.expect.pt(BEAR, 3, 3);
    g.act(0).cast('SYNTHETIC Shrink', { targets: [{ name: BEAR }], pay: true });
    g.passAll();
    g.expect.pt(BEAR, 1, 1);
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
  });
});

describe('what the engine runs and what it does not', () => {
  test('a permanent duration is not executable: validateCard rejects the card', () => {
    const forever = singleFace({
      name: 'SYNTHETIC Test Forever Pump',
      manaCost: ['G'],
      types: ['instant'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'Target creature gets +1/+1.',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'target', id: 't1' },
          power: 1,
          toughness: 1,
          duration: 'permanent',
        },
      },
    });
    expect(validateCard(forever).map((i) => i.message)).toEqual([
      expect.stringContaining('duration "permanent" is not implemented'),
    ]);
  });

  test('the state shape changed, so the engine version is at least 3', () => {
    expect(ENGINE_VERSION).toBeGreaterThanOrEqual(3);
    const g = scenario().seat(0).seat(1).build();
    expect(g.state.engineVersion).toBe(ENGINE_VERSION);
    expect(g.state.continuousEffects).toEqual([]);
  });
});

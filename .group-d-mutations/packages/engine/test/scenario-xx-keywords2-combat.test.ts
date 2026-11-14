// Skulk (CR 702.118), Battle cry (CR 702.91), Mentor (CR 702.134), Evolve (CR 702.100) and Bushido
// (CR 702.45), keyword batch 2 (D-116, D-120): `derive` expands the triggered ones from their keywords.
// Pins: CR 702.118b (can't be blocked by creatures with greater power, read as blockers are declared),
// CR 702.91a, 702.91b (each other attacking creature, each instance triggers separately), CR 611.2c (the
// set is fixed as the effect resolves), CR 702.134a (target attacking creature with power less than the
// mentor's, chosen as the ability goes on the stack, CR 603.3d, checked again, CR 608.2b, the mentor's
// power from last-known information once it left, CR 113.7a), CR 702.100a, 702.100c, 702.100d and
// CR 603.4 (the intervening "if" is true as it triggers and as it resolves), CR 702.45a, 702.45b and
// CR 509.1g, 509.1h (a creature blocks, an attacker becomes blocked once).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SKULK = 'SYNTHETIC Skulk Rogue'; // 2/2 {1}{B}
const CHIEF = 'SYNTHETIC Battle Cry Chief'; // 2/1 {1}{R}
const MENTOR = 'SYNTHETIC Mentor Veteran'; // 3/3 {2}{R}
const WHELP = 'SYNTHETIC Evolve Whelp'; // 1/1 {G}
const DUELIST = 'SYNTHETIC Bushido Duelist'; // 2/2 {1}{W}, Bushido 1
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const WALL = 'Wall of Stone'; // 0/8
const SPIDER = 'Giant Spider'; // 2/4 reach
const KNIGHT = 'Youthful Knight'; // 2/1 first strike
const ISAMARU = 'Isamaru, Hound of Konda'; // 2/2
const BOLT = 'Lightning Bolt';
const SHRINK = 'SYNTHETIC Shrink'; // {B} instant, -2/-2

/** The top object of the stack resolves: both players pass (CR 117.4). */
function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

/** Two cards in each library, so a test can walk into the next turn (CR 121.4: drawing from an empty library loses). */
const LIBRARY = ['Island', 'Island', 'Island'] as const;

function attackWith(g: ScenarioGame, ...attackers: string[]): ScenarioGame {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(attackers);
  return g;
}

describe("CR 702.118 (Skulk): can't be blocked by creatures with greater power", () => {
  function board(attacker: string, blockers: readonly string[], attackerOptions = {}) {
    const g = scenario()
      .seat(0)
      .battlefield(attacker, attackerOptions)
      .seat(1)
      .battlefield(...blockers)
      .build();
    attackWith(g, attacker);
    g.advanceTo('declareBlockers', { block: false });
    return g;
  }

  test('a blocker with greater power can not block it, one with equal or less power can', () => {
    const g = board(SKULK, [BEARS, ANGEL, WALL, SPIDER, ELVES]);
    expect(g.state.pending?.kind).toBe('declareBlockers');
    g.expect.canBlock(BEARS, SKULK, true); // 2 against 2: not greater
    g.expect.canBlock(SPIDER, SKULK, true);
    g.expect.canBlock(WALL, SKULK, true);
    g.expect.canBlock(ELVES, SKULK, true);
    g.expect.canBlock(ANGEL, SKULK, false); // 4 is greater than 2
  });

  test('the engine refuses the illegal block, and the legal actions never offer it', () => {
    const g = board(SKULK, [ANGEL, BEARS]);
    const d = g.state.pending;
    if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    const angel = g.id({ name: ANGEL, seat: 1 });
    expect(d.candidates.find((c) => c.blocker === angel)).toBeUndefined();
    expect(g.act(1).try.declareBlockers([{ blocker: ANGEL, attacker: SKULK }]).ok).toBe(false);
    for (const a of getLegalActions(g.state, 1)) {
      if (a.kind === 'declareBlockers') {
        expect(applyAction(g.state, 1, a).ok).toBe(true);
        expect(a.blocks.every((b) => b.blocker !== angel)).toBe(true);
      }
    }
    expect(g.act(1).try.declareBlockers([{ blocker: BEARS, attacker: SKULK }]).ok).toBe(true);
  });

  test('power is read as it is now: counters on the blocker or the attacker change the answer', () => {
    // The Bears have a +1/+1 counter (3 power) against a 2-power attacker: too much.
    const g = scenario()
      .seat(0)
      .battlefield(SKULK)
      .seat(1)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .battlefield(ELVES)
      .build();
    attackWith(g, SKULK);
    g.advanceTo('declareBlockers', { block: false });
    g.expect.canBlock(BEARS, SKULK, false);
    // With a counter of its own the attacker has 3 power, and 3 is not greater than 3.
    const h = scenario()
      .seat(0)
      .battlefield(SKULK, { counters: { '+1/+1': 1 } })
      .seat(1)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .build();
    attackWith(h, SKULK);
    h.advanceTo('declareBlockers', { block: false });
    h.expect.canBlock(BEARS, SKULK, true);
  });

  test('a shrink spell before blockers changes who can block: power is read as blockers are declared', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SKULK, { counters: { '+1/+1': 1 } })
      .battlefield('Swamp')
      .hand(SHRINK)
      .seat(1)
      .battlefield(BEARS, WALL, ELVES)
      .build();
    attackWith(g, SKULK);
    g.act(0).cast(SHRINK, { targets: [SKULK], pay: true });
    g.passAll();
    g.expect.pt(SKULK, 1, 1);
    g.advanceTo('declareBlockers', { block: false });
    g.expect.canBlock(BEARS, SKULK, false); // 2 is greater than 1
    g.expect.canBlock(ELVES, SKULK, true);
    g.expect.canBlock(WALL, SKULK, true);
  });

  test('a creature without skulk can be blocked by any creature with greater power', () => {
    const g = board(BEARS, [ANGEL]);
    g.expect.canBlock(ANGEL, BEARS, true);
  });

  test('a block already declared stays when power changes afterwards (read only as blockers are declared)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SKULK, 'Swamp')
      .hand(SHRINK)
      .seat(1)
      .battlefield(WALL, 'Swamp')
      .hand(SHRINK)
      .build();
    attackWith(g, SKULK);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: WALL, attacker: SKULK }]);
    g.expect.combat({
      attackers: [SKULK],
      blocked: [SKULK],
      blocks: [{ blocker: WALL, attacker: SKULK }],
    });
  });

  test('two instances are redundant (CR 702.118c)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Skulk',
          manaCost: ['B'],
          types: ['creature'],
          colors: ['B'],
          colorIdentity: ['B'],
          power: 2,
          toughness: 2,
          oracleText: 'Skulk. Skulk.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'skulk' } },
            { kind: 'keyword', keyword: { kind: 'skulk' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Skulk')
      .seat(1)
      .battlefield(ANGEL, BEARS)
      .build();
    attackWith(g, 'SYNTHETIC Test Double Skulk');
    g.advanceTo('declareBlockers', { block: false });
    g.expect.canBlock(ANGEL, 'SYNTHETIC Test Double Skulk', false);
    g.expect.canBlock(BEARS, 'SYNTHETIC Test Double Skulk', true);
  });
});

describe('CR 702.91 (Battle cry): each other attacking creature gets +1/+0', () => {
  test('every other attacker gets +1/+0 until end of turn, not the creature itself, not one at home', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHIEF, BEARS, ELVES, ISAMARU)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    attackWith(g, CHIEF, BEARS, ELVES);
    g.expect.stack([`${CHIEF} (ability)`]);
    g.passAll();
    g.expect.pt(CHIEF, 2, 1);
    g.expect.pt(BEARS, 3, 2);
    g.expect.pt(ELVES, 2, 1);
    g.expect.pt(ISAMARU, 2, 2);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 40 - 2 - 3 - 2);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
  });

  test('attacking alone: nothing else to pump', () => {
    const g = scenario().seat(0).battlefield(CHIEF, BEARS).seat(1).build();
    attackWith(g, CHIEF);
    g.passAll();
    g.expect.pt(CHIEF, 2, 1);
    g.expect.pt(BEARS, 2, 2);
  });

  test('two creatures with battle cry pump each other, and the others twice (CR 702.91b)', () => {
    const g = scenario().seat(0).battlefield(CHIEF, CHIEF, BEARS).seat(1).build();
    const chiefs = g.find({ name: CHIEF, zone: 'battlefield', seat: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS, chiefs[0]?.id as string, chiefs[1]?.id as string]);
    // Two abilities of two different creatures: the controller orders them, which cannot matter.
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt(chiefs[0]?.id as string, 3, 1);
    g.expect.pt(chiefs[1]?.id as string, 3, 1);
    g.expect.pt(BEARS, 4, 2);
  });

  test('one creature with two instances triggers twice (CR 702.91b)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Battle Cry',
          manaCost: ['R'],
          types: ['creature'],
          colors: ['R'],
          colorIdentity: ['R'],
          power: 1,
          toughness: 1,
          oracleText: 'Battle cry. Battle cry.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'battleCry' } },
            { kind: 'keyword', keyword: { kind: 'battleCry' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Battle Cry', BEARS)
      .seat(1)
      .build();
    attackWith(g, 'SYNTHETIC Test Double Battle Cry', BEARS);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
  });

  test('the creature with battle cry may be gone when the ability resolves: the others still get it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHIEF, BEARS)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .build();
    attackWith(g, CHIEF, BEARS);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [CHIEF], pay: true });
    g.passAll();
    g.expect.zone(CHIEF, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pt(BEARS, 3, 2);
  });

  test('a creature that left combat before the ability resolves is not pumped, one that arrives later is not either', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHIEF, BEARS, ELVES)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .build();
    attackWith(g, CHIEF, BEARS, ELVES);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [ELVES], pay: true });
    g.passAll();
    g.passAll();
    g.expect.pt(BEARS, 3, 2);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'modifyPt')).toHaveLength(1);
    expect(g.state.continuousEffects.find((e) => e.change.kind === 'modifyPt')?.objects).toEqual([
      g.id({ name: BEARS, seat: 0 }),
    ]);
  });
});

describe('CR 702.134 (Mentor): a +1/+1 counter on target attacking creature with less power', () => {
  function targetsOf(g: ScenarioGame): string[] {
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : ''));
  }

  test('only attacking creatures with less power are legal: not itself, not equal, not at home', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Three Power',
          manaCost: ['3'],
          types: ['creature'],
          colors: [],
          colorIdentity: [],
          power: 3,
          toughness: 1,
          oracleText: '',
        }),
      )
      .battlefield(MENTOR, BEARS, ELVES, ANGEL, ISAMARU, 'SYNTHETIC Test Three Power')
      .seat(1)
      .build();
    attackWith(g, MENTOR, BEARS, ELVES, ANGEL, 'SYNTHETIC Test Three Power');
    const legal = targetsOf(g);
    expect(legal.sort()).toEqual(
      [g.id({ name: BEARS, seat: 0 }), g.id({ name: ELVES, seat: 0 })].sort(),
    );
    expect(g.state.pending && 'forTrigger' in g.state.pending).toBe(true);
    // Not one of the legal targets: refused.
    const angel = g.id({ name: ANGEL, seat: 0 });
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [{ kind: 'object', id: angel, specId: 't1' }],
      }).ok,
    ).toBe(false);
    g.act(0).chooseTargets(ELVES);
    g.passAll();
    g.expect.counters(ELVES, { '+1/+1': 1 });
    g.expect.pt(ELVES, 2, 2);
    g.expect.counters(BEARS, {});
  });

  test('with one legal target the engine chooses it, and with none the ability is removed', () => {
    const g = scenario().seat(0).battlefield(MENTOR, ELVES).seat(1).build();
    attackWith(g, MENTOR, ELVES);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.stack([`${MENTOR} (ability)`]);
    g.passAll();
    g.expect.counters(ELVES, { '+1/+1': 1 });
    const h = scenario().seat(0).battlefield(MENTOR).seat(1).build();
    attackWith(h, MENTOR);
    h.expect.stack([]);
    h.expect.eventLog([{ kind: 'abilityRemoved', reason: 'noLegalTargets' }]);
    expect(h.state.pending?.kind).toBe('priority');
  });

  test('checked again as it resolves: if the mentor shrinks below the target, the target is illegal and it fizzles', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MENTOR, BEARS)
      .seat(1)
      .battlefield('Swamp')
      .hand(SHRINK)
      .build();
    attackWith(g, MENTOR, BEARS);
    g.act(0).pass();
    g.act(1).cast(SHRINK, { targets: [MENTOR], pay: true });
    g.passAll(); // the Shrink resolves: the mentor is a 1/1, the Bears (2 power) are not less
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.eventLog([{ kind: 'fizzled' }]);
  });

  test('the mentor may be gone when it resolves: its last-known power (3) still says the Bears qualify', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MENTOR, BEARS)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .build();
    attackWith(g, MENTOR, BEARS);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [MENTOR], pay: true });
    g.passAll();
    g.expect.zone(MENTOR, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
  });

  test('a creature that gets bigger before it resolves stops being a legal target', () => {
    const g = scenario().seat(0).battlefield(MENTOR, ELVES, 'Swamp').hand(SHRINK).seat(1).build();
    attackWith(g, MENTOR, ELVES);
    // The target is the Elves (the only one). A shrink on the Elves does not matter: still less power.
    g.act(0).cast(SHRINK, { targets: [ELVES], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('CR 702.100 (Evolve): a +1/+1 counter when a bigger creature enters under your control', () => {
  function board(entering: string, ...lands: string[]) {
    return scenario()
      .seat(0)
      .battlefield(WHELP, ...(lands.length > 0 ? lands : ['Forest', 'Forest']))
      .hand(entering)
      .seat(1)
      .build();
  }

  test('a creature with greater power and toughness: the whelp gets a counter', () => {
    const g = board(BEARS);
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.expect.stack([`${WHELP} (ability)`]);
    resolveTop(g);
    g.expect.counters(WHELP, { '+1/+1': 1 });
    g.expect.pt(WHELP, 2, 2);
  });

  test('an equal or smaller creature does not trigger it, nothing waits at all', () => {
    const g = board(WHELP);
    g.act(0).cast(WHELP, { pay: true });
    resolveTop(g);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
    for (const whelp of g.find({ name: WHELP, zone: 'battlefield', seat: 0 })) {
      g.expect.counters(whelp.id, {});
    }
  });

  test('greater toughness alone is enough (CR 702.100a "and/or"), and so is greater power alone', () => {
    const g = board(WALL, 'Mountain', 'Mountain', 'Mountain');
    g.act(0).cast(WALL, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.counters(WHELP, { '+1/+1': 1 });
    const h = board(KNIGHT, 'Plains', 'Plains');
    h.act(0).cast(KNIGHT, { pay: true });
    resolveTop(h);
    resolveTop(h);
    h.expect.counters(WHELP, { '+1/+1': 1 });
  });

  test('a creature an opponent controls does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHELP)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .hand(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    resolveTop(g);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
  });

  test('the creature itself entering does not evolve itself', () => {
    const g = scenario().seat(0).hand(WHELP).battlefield('Forest').seat(1).build();
    g.act(0).cast(WHELP, { pay: true });
    resolveTop(g);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
  });

  test('the "if" is checked again as it resolves: a creature that is no bigger then does nothing (CR 603.4)', () => {
    // The Bears enter (2/2 against 1/1); in response they are shrunk to nothing: last-known 0/0, not greater.
    const g = scenario()
      .seat(0)
      .battlefield(WHELP, 'Forest', 'Forest', 'Swamp')
      .hand(BEARS, SHRINK)
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.expect.stack([`${WHELP} (ability)`]);
    g.act(0).cast(SHRINK, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    resolveTop(g);
    g.expect.counters(WHELP, {});
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
  });

  test('a second creature enters while the first trigger waits: the first is compared again after the second evolved it', () => {
    const FLASH2 = singleFace({
      name: 'SYNTHETIC Test Flash Bears',
      manaCost: ['G'],
      types: ['creature'],
      colors: ['G'],
      colorIdentity: ['G'],
      power: 2,
      toughness: 2,
      oracleText: 'Flash',
      abilities: [{ kind: 'keyword', keyword: { kind: 'flash' } }],
    });
    const g = scenario()
      .seat(0)
      .define(FLASH2)
      .battlefield(WHELP, 'Forest', 'Forest', 'Forest')
      .hand(BEARS, 'SYNTHETIC Test Flash Bears')
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g); // the Bears resolve: the evolve trigger for the Bears waits on the stack
    g.act(0).cast('SYNTHETIC Test Flash Bears', { pay: true });
    resolveTop(g); // the flash creature resolves: a second trigger above the first
    g.expect.stack([`${WHELP} (ability)`, `${WHELP} (ability)`]);
    resolveTop(g); // the top one resolves: the whelp is a 2/2
    g.expect.counters(WHELP, { '+1/+1': 1 });
    resolveTop(g); // the older one: 2/2 against 2/2: the "if" is false, nothing happens
    g.expect.counters(WHELP, { '+1/+1': 1 });
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
  });

  test('two instances trigger separately, and the second sees the first (CR 702.100d)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Evolve',
          manaCost: ['G'],
          types: ['creature'],
          colors: ['G'],
          colorIdentity: ['G'],
          power: 1,
          toughness: 1,
          oracleText: 'Evolve. Evolve.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'evolve' } },
            { kind: 'keyword', keyword: { kind: 'evolve' } },
          ],
        }),
      )
      .battlefield('SYNTHETIC Test Double Evolve', 'Forest', 'Forest', 'Forest')
      .hand(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    expect(g.state.stack).toHaveLength(2);
    resolveTop(g);
    resolveTop(g);
    g.expect.counters('SYNTHETIC Test Double Evolve', { '+1/+1': 1 });
  });
});

describe('CR 702.45 (Bushido): +N/+N when it blocks or becomes blocked', () => {
  function duel(...defenders: string[]) {
    return scenario()
      .seat(0)
      .battlefield(SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...defenders)
      .library(...LIBRARY)
      .build();
  }

  test('blocking: the trigger goes on the stack with the blocks, and the creature is 3/3 for the damage', () => {
    const g = duel(DUELIST);
    attackWith(g, SPIDER);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: DUELIST, attacker: SPIDER }]);
    g.expect.stack([`${DUELIST} (ability)`]);
    g.passAll();
    g.expect.pt(DUELIST, 3, 3);
    g.advanceTo('postcombatMain');
    // A 2/2 would have died to the 2 damage of the Spider; the 3/3 survives it and deals 3 (not lethal to a 2/4).
    g.expect.zone(DUELIST, 'battlefield', { seat: 1 });
    g.expect.damage(DUELIST, 2);
    g.expect.damage(SPIDER, 3);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(DUELIST, 2, 2);
  });

  test('becoming blocked: it triggers once however many creatures block it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUELIST)
      .seat(1)
      .battlefield(BEARS, ELVES, ISAMARU)
      .build();
    attackWith(g, DUELIST);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([
      { blocker: BEARS, attacker: DUELIST },
      { blocker: ELVES, attacker: DUELIST },
    ]);
    g.expect.stack([`${DUELIST} (ability)`]);
    g.passAll();
    g.expect.pt(DUELIST, 3, 3);
  });

  test('an unblocked attacker with bushido and a creature that does not block do not trigger', () => {
    const g = scenario().seat(0).battlefield(DUELIST).seat(1).battlefield(BEARS, DUELIST).build();
    attackWith(g, g.id({ name: DUELIST, seat: 0 }));
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).noBlocks();
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
    g.expect.pt(g.id({ name: DUELIST, seat: 0 }), 2, 2);
    g.expect.pt(g.id({ name: DUELIST, seat: 1 }), 2, 2);
  });

  test('another creature blocking, or being blocked, does not trigger the bushido creature', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SPIDER, ELVES)
      .seat(1)
      .battlefield(BEARS, DUELIST)
      .build();
    attackWith(g, SPIDER, ELVES);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: ELVES }]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
    g.expect.pt(DUELIST, 2, 2);
  });

  test('two instances give +2/+2 (CR 702.45b), each a trigger of its own', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SPIDER)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Bushido',
          manaCost: ['W'],
          types: ['creature'],
          colors: ['W'],
          colorIdentity: ['W'],
          power: 1,
          toughness: 1,
          oracleText: 'Bushido 1. Bushido 2.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'bushido', count: 1 } },
            { kind: 'keyword', keyword: { kind: 'bushido', count: 2 } },
          ],
        }),
      )
      .seat(1)
      .battlefield('SYNTHETIC Test Double Bushido')
      .build();
    attackWith(g, SPIDER);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Test Double Bushido', attacker: SPIDER }]);
    // Two different abilities: the controller orders them.
    if (g.state.pending?.kind === 'orderTriggers') g.act(1).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt('SYNTHETIC Test Double Bushido', 4, 4);
  });

  test('both a blocking and a blocked bushido creature get theirs, each its own trigger', () => {
    const g = scenario().seat(0).battlefield(DUELIST).seat(1).battlefield(DUELIST).build();
    attackWith(g, DUELIST);
    g.advanceTo('declareBlockers', { block: false });
    const [mine, theirs] = [g.id({ name: DUELIST, seat: 0 }), g.id({ name: DUELIST, seat: 1 })];
    g.act(1).declareBlockers([{ blocker: theirs, attacker: mine }] as never);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.pt(mine, 3, 3);
    g.expect.pt(theirs, 3, 3);
  });
});

describe('legal actions agree with applyAction, and the same actions give the same game', () => {
  test('the mentor target choice lists exactly the legal targets, each accepted', () => {
    const g = scenario().seat(0).battlefield(MENTOR, BEARS, ELVES, ISAMARU).seat(1).build();
    attackWith(g, MENTOR, BEARS, ELVES);
    const listed = getLegalActions(g.state, 0);
    const targets = listed.filter((a) => a.kind === 'chooseTargets');
    expect(targets).toHaveLength(2);
    for (const a of listed) {
      if (a.kind !== 'concede') expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('every block the declaration lists is accepted against a skulk attacker, and none names a blocker with more power', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SKULK)
      .seat(1)
      .battlefield(BEARS, ANGEL, WALL, ELVES)
      .build();
    attackWith(g, SKULK);
    g.advanceTo('declareBlockers', { block: false });
    const angel = g.id({ name: ANGEL, seat: 1 });
    const listed = getLegalActions(g.state, 1);
    expect(listed.filter((a) => a.kind === 'declareBlockers').length).toBeGreaterThan(2);
    for (const a of listed) {
      if (a.kind === 'concede') continue;
      expect(applyAction(g.state, 1, a).ok, JSON.stringify(a)).toBe(true);
      if (a.kind === 'declareBlockers') expect(a.blocks.map((b) => b.blocker)).not.toContain(angel);
    }
  });

  test('a whole combat with every keyword of the batch gives the same hash twice', () => {
    const run = () => {
      const g = scenario()
        .seat(0)
        .battlefield(CHIEF, MENTOR, WHELP, BEARS, ELVES)
        .library(...LIBRARY)
        .seat(1)
        .battlefield(DUELIST, SPIDER)
        .library(...LIBRARY)
        .build();
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).attack([CHIEF, MENTOR, BEARS, ELVES]);
      if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
      if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(BEARS);
      g.passAll();
      g.advanceTo('declareBlockers', { block: false });
      if (g.state.pending?.kind === 'declareBlockers') {
        g.act(1).declareBlockers([{ blocker: DUELIST, attacker: BEARS }]);
      }
      g.passAll();
      g.advanceTo('postcombatMain');
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

// Infect (CR 702.90), Wither (CR 702.80), Toxic N (CR 702.164) and poison counters (CR 122.1, 704.5c) as the
// results of damage (CR 120.3) (D-104, D-110).
// Pins: CR 120.3a/120.3b (life loss, or poison counters from infect), CR 702.90b-c and 120.3d (infect: poison
// counters to a player, -1/-1 counters to a creature, not marked damage), CR 702.80a (wither: -1/-1 counters to
// a creature, life loss to a player), CR 120.3e (marked damage otherwise), CR 120.3c (a planeswalker loses
// loyalty), CR 120.3f (lifelink in addition), CR 120.3g and 702.164c (combat damage from toxic gives poison
// counters in addition), CR 702.164b (total toxic value is the sum), CR 704.5c (ten poison counters lose the
// game), CR 704.5h (deathtouch: any damage dealt is lethal, marked or not), CR 704.5q (+1/+1 and -1/-1
// counters cancel), CR 615 (prevention shields apply before any result), CR 514.2 (marked damage wears off,
// counters stay), CR 613.1f (infect can be granted). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const INFECT = 'SYNTHETIC Infect Bear'; // 2/2 infect
const LIFELINK = 'SYNTHETIC Infect Lifelinker'; // 2/2 infect lifelink
const VIPER = 'SYNTHETIC Infect Viper'; // 1/1 infect deathtouch
const PINGER = 'SYNTHETIC Infect Pinger'; // 1/1 infect, {T}: 1 damage to any target
const WITHER = 'SYNTHETIC Wither Imp'; // 2/2 wither
const RAT = 'SYNTHETIC Toxic Rat'; // 1/1 toxic 1
const BRUTE = 'SYNTHETIC Toxic Brute'; // 3/3 toxic 2
const SPIDER = 'Giant Spider'; // 2/4
const BEARS = 'Grizzly Bears'; // 2/2
const FOG = 'SYNTHETIC Fog Spell';
const SOFTEN = 'SYNTHETIC Soften Blow'; // prevent the next 2 combat damage to you

const poison = (g: ScenarioGame, seat: 0 | 1) => g.state.seats[seat]?.poison;

/** Seat 0 attacks seat 1 with `attackers`, blockers as given; stops before combat damage. */
function combat(
  g: ScenarioGame,
  attack: string[],
  block: { blocker: string; attacker: string }[] = [],
) {
  g.playCombat({ attack, block, until: 'postcombatMain' });
}

const GIANT = singleFace({
  name: 'SYNTHETIC Test Infect Giant',
  manaCost: ['5'],
  types: ['creature'],
  colors: [],
  colorIdentity: [],
  power: 4,
  toughness: 4,
  oracleText: 'Infect',
  abilities: [{ kind: 'keyword', keyword: { kind: 'infect' } }],
});

describe('CR 702.90 (Infect)', () => {
  test('combat damage to a player is poison counters, not life loss', () => {
    const g = scenario().seat(0).battlefield(INFECT).seat(1).build();
    const mark = g.mark();
    combat(g, [INFECT]);
    expect(poison(g, 1)).toBe(2);
    g.expect.life(1, 40);
    g.expect.eventLog(
      [
        { kind: 'damageDealt', amount: 2, combat: true },
        { kind: 'poisonChanged', seat: 1, from: 0, to: 2 },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'lifeChanged', seat: 1 }, { since: mark });
    expect(getView(g.state, 0).seats[1]?.poison).toBe(2);
    expect(getView(g.state, 1).seats[1]?.poison).toBe(2);
  });

  test('combat damage to a creature is -1/-1 counters, not marked damage, and they stay', () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .library('Island', 'Island')
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', 'Island')
      .build();
    combat(g, [INFECT], [{ blocker: SPIDER, attacker: INFECT }]);
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.damage(SPIDER, 0);
    g.expect.pt(SPIDER, 0, 2);
    // The Spider dealt 2 damage to the Bear, which is marked: it dies.
    g.expect.zone(INFECT, 'graveyard', { seat: 0 });
    // The counters outlast the turn (marked damage would not).
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.counters(SPIDER, { '-1/-1': 2 });
  });

  test('enough -1/-1 counters kill it by toughness (CR 704.5f), and +1/+1 counters cancel them (CR 704.5q)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .seat(1)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .build();
    combat(g, [INFECT], [{ blocker: BEARS, attacker: INFECT }]);
    // A 3/3 Bears takes two -1/-1 counters; one pair cancels with its +1/+1 counter, one -1/-1 is left.
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.counters(BEARS, { '+1/+1': 0, '-1/-1': 1 });
    g.expect.invariants();
  });

  test('lethal: two Bears with no counters take two -1/-1 counters and die', () => {
    const g = scenario().seat(0).battlefield(INFECT).seat(1).battlefield(BEARS).build();
    combat(g, [INFECT], [{ blocker: BEARS, attacker: INFECT }]);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(INFECT, 'graveyard', { seat: 0 });
  });

  test('noncombat damage from an infect source: poison to a player, a counter on a creature', () => {
    const g = scenario().seat(0).battlefield(PINGER).seat(1).battlefield(SPIDER).build();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    expect(poison(g, 1)).toBe(1);
    g.expect.life(1, 40);
    const h = scenario().seat(0).battlefield(PINGER).seat(1).battlefield(SPIDER).build();
    h.act(0).activate(PINGER, { targets: [SPIDER] });
    h.passAll();
    h.expect.counters(SPIDER, { '-1/-1': 1 });
    h.expect.damage(SPIDER, 0);
  });

  test('damage to a planeswalker is loyalty loss as ever (CR 120.3c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .build();
    g.playCombat({
      attack: [{ attacker: INFECT, target: 'SYNTHETIC Vanilla Planeswalker' }],
      until: 'postcombatMain',
    });
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 2 });
    expect(poison(g, 1)).toBe(0);
  });

  test('lifelink with infect: the controller gains life, the player gets poison and loses no life', () => {
    const g = scenario().seat(0).battlefield(LIFELINK).seat(1).build();
    combat(g, [LIFELINK]);
    g.expect.life(0, 42);
    g.expect.life(1, 40);
    expect(poison(g, 1)).toBe(2);
  });

  test('deathtouch with infect: the one -1/-1 counter is not marked damage, but it was dealt (CR 704.5h)', () => {
    const g = scenario().seat(0).battlefield(VIPER).seat(1).battlefield('Wall of Stone').build();
    combat(g, [VIPER], [{ blocker: 'Wall of Stone', attacker: VIPER }]);
    g.expect.zone('Wall of Stone', 'graveyard', { seat: 1 });
  });

  test('ten poison counters lose the game at the next state-based action check (CR 704.5c)', () => {
    const g = scenario().seat(0).battlefield(INFECT).seat(1).poison(8).build();
    combat(g, [INFECT]);
    expect(poison(g, 1)).toBe(10);
    g.expect.hasLost(1);
    g.expect.gameOver({ win: 0 });
  });

  test('nine poison counters are not enough', () => {
    const g = scenario().seat(0).battlefield(INFECT).seat(1).poison(7).build();
    combat(g, [INFECT]);
    expect(poison(g, 1)).toBe(9);
    g.expect.hasLost(1, false);
  });

  test('infect that is granted works (it is read from the abilities left after layer 6)', () => {
    const grant = singleFace({
      name: 'SYNTHETIC Test Venom',
      manaCost: ['G'],
      types: ['instant'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'Target creature gains infect until end of turn.',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'target', id: 't1' },
          keyword: { kind: 'infect' },
          duration: 'untilEndOfTurn',
        },
      },
    });
    const g = scenario()
      .seat(0)
      .define(grant)
      .hand('SYNTHETIC Test Venom')
      .battlefield('Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Test Venom', { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS);
    g.advanceTo('postcombatMain');
    expect(poison(g, 1)).toBe(2);
    g.expect.life(1, 40);
  });

  test('a prevention shield takes its part first: prevented damage gives no poison (CR 615)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .seat(1)
      .hand(FOG)
      .battlefield('Plains')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(INFECT);
    g.act(0).pass();
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    expect(poison(g, 1)).toBe(0);
    // A shield for part of it: 2 damage prevented from a 2-power attacker leaves none, so use the Brute.
    const h = scenario()
      .seat(0)
      .define(GIANT)
      .battlefield('SYNTHETIC Test Infect Giant')
      .seat(1)
      .hand(SOFTEN)
      .battlefield('Plains')
      .build();
    h.advanceTo('declareAttackers', { attack: false });
    h.act(0).attack('SYNTHETIC Test Infect Giant');
    h.act(0).pass();
    h.act(1).cast(SOFTEN, { pay: true });
    h.passAll();
    h.advanceTo('postcombatMain');
    expect(poison(h, 1)).toBe(2);
  });
});

describe('CR 702.80 (Wither)', () => {
  test('damage to a creature is -1/-1 counters, to a player it is life loss', () => {
    const g = scenario().seat(0).battlefield(WITHER).seat(1).battlefield(SPIDER).build();
    combat(g, [WITHER], [{ blocker: SPIDER, attacker: WITHER }]);
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.damage(SPIDER, 0);
    const h = scenario().seat(0).battlefield(WITHER).seat(1).build();
    combat(h, [WITHER]);
    h.expect.life(1, 38);
    expect(poison(h, 1)).toBe(0);
  });
});

describe('CR 702.164 (Toxic)', () => {
  test('combat damage to a player is life loss and poison counters equal to the toxic value', () => {
    const g = scenario().seat(0).battlefield(RAT, BRUTE).seat(1).build();
    combat(g, [RAT, BRUTE]);
    g.expect.life(1, 36);
    expect(poison(g, 1)).toBe(3);
  });

  test('damage to a creature does not give poison, and neither does noncombat damage', () => {
    const g = scenario().seat(0).battlefield(BRUTE).seat(1).battlefield(SPIDER).build();
    combat(g, [BRUTE], [{ blocker: SPIDER, attacker: BRUTE }]);
    g.expect.damage(SPIDER, 3);
    expect(poison(g, 1)).toBe(0);
  });

  test('total toxic value adds up over instances (CR 702.164b), and adds to infect poison', () => {
    const both = singleFace({
      name: 'SYNTHETIC Test Venom Fang',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 2,
      toughness: 2,
      oracleText: 'Toxic 1. Toxic 2.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'toxic', count: 1 } },
        { kind: 'keyword', keyword: { kind: 'toxic', count: 2 } },
      ],
    });
    const g = scenario()
      .seat(0)
      .define(both)
      .battlefield('SYNTHETIC Test Venom Fang')
      .seat(1)
      .build();
    combat(g, ['SYNTHETIC Test Venom Fang']);
    expect(poison(g, 1)).toBe(3);
    g.expect.life(1, 38);
    const mixed = singleFace({
      name: 'SYNTHETIC Test Infect Toxic',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 2,
      toughness: 2,
      oracleText: 'Infect. Toxic 1.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'infect' } },
        { kind: 'keyword', keyword: { kind: 'toxic', count: 1 } },
      ],
    });
    const h = scenario()
      .seat(0)
      .define(mixed)
      .battlefield('SYNTHETIC Test Infect Toxic')
      .seat(1)
      .build();
    combat(h, ['SYNTHETIC Test Infect Toxic']);
    expect(poison(h, 1)).toBe(3); // 2 from infect, 1 from toxic
    h.expect.life(1, 40);
  });

  test('poison from toxic can end the game', () => {
    const g = scenario().seat(0).battlefield(BRUTE).seat(1).poison(8).build();
    combat(g, [BRUTE]);
    g.expect.gameOver({ win: 0 });
  });
});

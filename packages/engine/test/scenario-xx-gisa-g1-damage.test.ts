// The Gisa deck (issue 41), group 1 (D-1403, D-1404): "At the beginning of your second main phase, if a player was dealt combat damage by a Zombie this turn, mill three
// cards, then you may return a creature card from your graveyard to your hand." (Lost Monarch of Ifnir: the intervening "if" reads the log of combat damage dealt to players,
// with what the source was as it dealt it) and "Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn." (Dreadhorde Invasion).
// Pins: CR 603.4 (an intervening "if" is true as the ability triggers and as it resolves), CR 120.2a and 510.2 (combat damage to a player), CR 603.2g and 615 (damage that is
// prevented entirely is not dealt, so it is not in the log), CR 113.7a (a source that has left the game's battlefield counts as it last was), CR 608.2c, CR 701.17a (mill), CR 603.5
// ("you may" is asked as the ability resolves), CR 111.1 (a token), CR 508.1 and 603.2 (the attack trigger, once for each creature that attacks), CR 702.15 (lifelink),
// CR 611.2a (until end of turn). Cards: the SYNTHETIC cards of src/cards/fixtures/synthetic-gisa-g1.ts, Grizzly Bears, Giant Spider and the basic lands.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const MONARCH = 'SYNTHETIC Afflict Monarch'; // 4/4 Zombie Noble
const ZOMBIE = 'SYNTHETIC Gisa Zombie'; // 2/2
const BANNER = 'SYNTHETIC Horde Banner';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const WALL = 'Wall of Stone'; // 0/8

const LIBRARY = [BEARS, 'Island', 'Island', SPIDER, 'Island', 'Island', 'Island'] as const;

/** Seat 0 attacks with `attackers`, seat 1 blocks as `blocks` says, and the game stops at the precombat main phase's second half: the postcombat main phase. */
function turn(
  seat0: readonly string[],
  attackers: readonly string[],
  blocks: readonly { blocker: string; attacker: string }[] = [],
  seat1: readonly string[] = [],
): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(...seat0)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...seat1)
    .build();
  if (attackers.length > 0) {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(attackers);
    g.advanceTo('declareBlockers', { block: false });
    // With nothing that can block, the engine does not ask.
    if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers(blocks);
  }
  g.advanceTo('postcombatMain');
  return g;
}

describe('CR 603.4: "if a player was dealt combat damage by a Zombie this turn"', () => {
  test('an unblocked Zombie deals combat damage: the trigger goes on the stack at the second main phase', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE]);
    g.expect.life(1, 38);
    g.expect.stack([`${MONARCH} (ability)`]);
  });

  test('it resolves: three cards are milled, then the controller may return a creature card from the graveyard to the hand', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE]);
    g.passAll();
    // The top three of the library (the Bears, an Island, an Island) are in the graveyard.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.graveyard).toHaveLength(3);
    g.expect.pending('chooseCards', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected a choice');
    expect(d.zone).toBe('graveyard');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    // Only the creature card of the three milled ones can be returned.
    expect(d.legal).toEqual([g.id({ name: BEARS, zone: 'graveyard' })]);
    g.act(0).chooseCards({ name: BEARS, zone: 'graveyard' });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('"may": the controller can return nothing', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE]);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(0);
  });

  test('no combat damage was dealt: no trigger', () => {
    const g = turn([MONARCH, ZOMBIE], []);
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.pendingTriggers).toHaveLength(0);
  });

  test('the Zombie was blocked, so no player was dealt damage: no trigger', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE], [{ blocker: WALL, attacker: ZOMBIE }], [WALL]);
    // The Zombie has afflict 3 from the Monarch, so the player lost 3 life; that is not damage.
    g.expect.life(1, 37);
    expect(g.state.turnLog.combatDamaged).toEqual([]);
    expect(g.state.stack).toHaveLength(0);
  });

  test('damage by a creature that is not a Zombie does not count', () => {
    const g = turn([MONARCH, BEARS], [BEARS]);
    g.expect.life(1, 38);
    expect(g.state.stack).toHaveLength(0);
  });

  test('the Monarch itself is a Zombie: when it deals the damage the trigger happens too', () => {
    const g = turn([MONARCH], [MONARCH]);
    g.expect.life(1, 36);
    g.expect.stack([`${MONARCH} (ability)`]);
  });

  test('a Zombie that dealt the damage and died since still counts as the Zombie it was (CR 113.7a)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MONARCH, ZOMBIE, 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ZOMBIE]);
    g.advanceTo('endOfCombat');
    g.act(0).cast('Lightning Bolt', { targets: [ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
    g.advanceTo('postcombatMain');
    expect(g.state.turnLog.combatDamaged).toHaveLength(1);
    expect(g.state.turnLog.combatDamaged[0]?.subtypes).toEqual(['Zombie']);
    g.expect.stack([`${MONARCH} (ability)`]);
  });

  test('the log keeps what the source was as it dealt the damage: types, subtypes and controller', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE]);
    expect(g.state.turnLog.combatDamaged).toEqual([
      {
        source: g.id(ZOMBIE),
        player: 1,
        types: ['creature'],
        subtypes: ['Zombie'],
        controller: 0,
      },
    ]);
  });

  test('damage that is prevented entirely is not dealt: it is not in the log and nothing triggers (CR 603.2g)', () => {
    // The Monarch is a 4/4: "Big Fog" prevents the combat damage of creatures with power 4 or greater.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MONARCH)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', 'Forest', 'Forest')
      .hand('SYNTHETIC Big Fog')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([MONARCH]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Big Fog', { pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.life(1, 40);
    expect(g.state.turnLog.combatDamaged).toEqual([]);
    expect(g.state.stack).toHaveLength(0);
  });

  test('the trigger reads the turn only: next turn the log is empty and nothing triggers', () => {
    const g = turn([MONARCH, ZOMBIE], [ZOMBIE]);
    g.passAll();
    g.act(0).chooseCards();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('postcombatMain');
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.turnLog.combatDamaged).toEqual([]);
  });
});

describe('CR 603.2: "Whenever a Zombie token you control with power 6 or greater attacks, it gains lifelink until end of turn."', () => {
  /** "Other Zombies you control get +N/+N." */
  const lord = (bonus: number) =>
    singleFace({
      name: `SYNTHETIC Test Zombie Lord ${bonus}`,
      manaCost: ['2', 'B'],
      types: ['creature'],
      subtypes: ['Zombie'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: `Other Zombies you control get +${bonus}/+${bonus}.`,
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'modifyPt',
            subject: {
              kind: 'filter',
              filter: { subtypes: ['Zombie'], controller: 'you' },
              other: true,
            },
            power: bonus,
            toughness: bonus,
          },
        },
      ],
    });
  const LORD4 = lord(4);
  const LORD3 = lord(3);

  /**
   * Seat 0 has the Banner. Its upkeep trigger amasses Zombies 1 on turns 5 and 7 (a 0/0 black Zombie Army token with a +1/+1 counter each time), so on turn 7 the Army is 2/2, not
   * summoning sick (it came on turn 5), and the lord makes it bigger. Turns 4 and 6 are the opponent's.
   */
  function withArmy(lords: readonly ReturnType<typeof lord>[], others: readonly string[] = []) {
    const b = scenario().seat(0);
    for (const l of lords) b.define(l);
    const g = b
      .library(...LIBRARY, ...LIBRARY)
      .battlefield(BANNER, ...lords.map((l) => l.name), ...others)
      .seat(1)
      .library(...LIBRARY, ...LIBRARY)
      .build();
    for (let i = 0; i < 4; i += 1) {
      g.advanceTo('upkeep', { turn: 'next' });
      if (g.state.stack.length > 0) g.passAll();
    }
    return g;
  }
  const armyOf = (g: ScenarioGame) => {
    const id = g.state.battlefield.find((o) => g.state.objects[o]?.token != null);
    if (id === undefined) throw new Error('no token on the battlefield');
    return id;
  };
  const objectOf = (g: ScenarioGame, id: ReturnType<typeof armyOf>) => {
    const obj = g.state.objects[id];
    if (obj === undefined) throw new Error('no such object');
    return obj;
  };
  const lifelinkOf = (g: ScenarioGame, id: ReturnType<typeof armyOf>) =>
    derive(g.state, objectOf(g, id)).abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'lifelink',
    );

  test('the Army is a Zombie token: two counters from two amasses, and the lord', () => {
    const g = withArmy([LORD4]);
    const d = derive(g.state, objectOf(g, armyOf(g)));
    expect(d.subtypes).toEqual(expect.arrayContaining(['Zombie', 'Army']));
    expect(d.power).toBe(6);
  });

  test('power 6: it attacks, the trigger gives it lifelink, and it gains life from the damage it deals', () => {
    const g = withArmy([LORD4]);
    const army = armyOf(g);
    const life = g.state.seats[0]?.life ?? 0;
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([army]);
    g.expect.stack([`${BANNER} (ability)`]);
    expect(lifelinkOf(g, army)).toBe(false);
    g.passAll();
    expect(lifelinkOf(g, army)).toBe(true);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 34);
    expect(g.state.seats[0]?.life).toBe(life + 6);
  });

  test('lifelink wears off at the end of the turn', () => {
    const g = withArmy([LORD4]);
    const army = armyOf(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([army]);
    g.passAll();
    expect(lifelinkOf(g, army)).toBe(true);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(lifelinkOf(g, army)).toBe(false);
  });

  test('power 5 is not enough: no trigger and no lifelink', () => {
    const g = withArmy([LORD3]);
    const army = armyOf(g);
    expect(derive(g.state, objectOf(g, army)).power).toBe(5);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([army]);
    expect(g.state.stack).toHaveLength(0);
    expect(lifelinkOf(g, army)).toBe(false);
  });

  test('a Zombie that is not a token does not trigger it, whatever its power', () => {
    const g = withArmy([LORD4], [ZOMBIE]);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ZOMBIE]);
    expect(derive(g.state, objectOf(g, g.id(ZOMBIE))).power).toBe(6);
    expect(g.state.stack).toHaveLength(0);
  });

  test('the lord attacks with the token: the lord is not a token, so there is one trigger, for the token', () => {
    const g = withArmy([LORD4]);
    const army = armyOf(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([army, LORD4.name]);
    expect(g.state.stack).toHaveLength(1);
  });
});

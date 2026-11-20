// Speed (CR 702.179, 702.178, 704.5aa) and the requirement of one combat (CR 508.1d, 506.1), issue 144.
// Pins: CR 702.179a and 704.5aa (a player with a permanent with start your engines! and no speed gets speed 1, as a state-based action), 702.179b and 702.179f (no speed until set; it
// reads as 0), 702.179c (increasing with no speed makes it that value), 702.179d (the inherent ability: one or more opponents lose life during your turn, speed less than 4, once each
// turn, no source), 702.179e (max speed is speed 4), 702.178a ("max speed" abilities hold only at speed 4), 508.1d (a creature required to attack that is able must), 506.1 and
// 611.2a (the requirement of "this combat" ends with the combat).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-speed-s144.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_SPEED_LIST } from '../src/cards/fixtures/synthetic-speed-s144';
import { getView, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const RACER = 'SYNTHETIC Engine Racer';
const ENGINE = 'SYNTHETIC Max Speed Engine';
const SURGE = 'SYNTHETIC Speed Surge';
const DOUBLE = 'SYNTHETIC Speed Double Surge';
const SUMMONS = 'SYNTHETIC Combat Summons';
const BEARS = 'Grizzly Bears';
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

// The cards are defined for these scenarios only: they are not in the shared list of synthetic fixtures, whose size the derive fingerprints depend on.
const withCards = (): Builder =>
  SYNTHETIC_SPEED_LIST.reduce((b, card) => b.define(card), scenario());

const base = (build: (b: Builder) => Builder = (b) => b): Builder =>
  build(
    withCards()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER);

const resolveAll = (g: ScenarioGame): void => {
  for (let i = 0; i < 20 && g.state.stack.length > 0; i += 1) {
    g.pass();
    g.pass();
  }
};

describe('Start your engines! (CR 702.179a, 704.5aa)', () => {
  test('a player who controls a permanent with it and has no speed gets speed 1', () => {
    const g = base((b) => b.hand(RACER).battlefield('Mountain', { count: 2 }))
      .at('precombatMain')
      .build();
    g.expect.speed(0, null);
    g.act(0).cast(RACER, { pay: true });
    g.pass();
    g.pass();
    g.expect.speed(0, 1);
    g.expect.speed(1, null);
    g.expect.eventLog([{ kind: 'speedChanged', seat: 0, from: 0, to: 1 }]);
    expect(getView(g.state, 1).seats[0]?.speed).toBe(1);
    expect(getView(g.state, 0).seats[1]?.speed).toBeUndefined();
  });

  test('a second permanent with it changes nothing: the speed is not set again', () => {
    const g = base((b) => b.battlefield(RACER, RACER).speed(2))
      .at('precombatMain')
      .build();
    g.pass();
    g.pass();
    g.expect.speed(0, 2);
  });

  test('a player without the permanent and without speed stays without (CR 702.179b)', () => {
    const g = base((b) => b.battlefield(BEARS))
      .at('precombatMain')
      .build();
    g.pass();
    g.pass();
    g.expect.speed(0, null);
    g.expect.speed(1, null);
  });
});

describe('the inherent speed ability (CR 702.179d)', () => {
  const bolt = (g: ScenarioGame, seat: 0 | 1, target: 0 | 1) =>
    g
      .act(seat)
      .cast(
        { name: 'Lightning Bolt', seat, zone: 'hand', nth: 0 },
        { targets: [{ player: target }], pay: true },
      );

  test('an opponent losing life during your turn raises your speed by 1, through the stack, with no source', () => {
    const g = base((b) => b.hand('Lightning Bolt').battlefield('Mountain').speed(1))
      .at('precombatMain')
      .build();
    bolt(g, 0, 1);
    g.pass();
    g.pass();
    // The spell resolved, the opponent lost 3 life and the ability is on the stack.
    g.expect.life(1, 17);
    g.expect.speed(0, 1);
    const top = g.state.stack[g.state.stack.length - 1];
    expect(top === undefined ? undefined : g.state.objects[top]?.stack?.inherent).toBe('speedUp');
    expect(getView(g.state, 1).stack[0]?.name).toBe('Speed');
    resolveAll(g);
    g.expect.speed(0, 2);
  });

  test('it triggers only once each turn: a second loss in the same turn adds nothing', () => {
    const g = base((b) =>
      b.hand('Lightning Bolt', 'Lightning Bolt').battlefield('Mountain', { count: 2 }).speed(1),
    )
      .at('precombatMain')
      .build();
    bolt(g, 0, 1);
    resolveAll(g);
    g.expect.speed(0, 2);
    bolt(g, 0, 1);
    resolveAll(g);
    g.expect.life(1, 14);
    g.expect.speed(0, 2);
  });

  test('you losing life does not trigger it, and neither does a loss in an opponent turn', () => {
    const own = base((b) => b.hand('Lightning Bolt').battlefield('Mountain').speed(1))
      .at('precombatMain')
      .build();
    bolt(own, 0, 0);
    resolveAll(own);
    own.expect.life(0, 17);
    own.expect.speed(0, 1);

    const theirs = base((b) => b.speed(1))
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    bolt(theirs, 1, 0);
    resolveAll(theirs);
    theirs.expect.life(0, 17);
    theirs.expect.speed(0, 1);
  });

  test('a player with no speed, and a player at max speed, get nothing from it', () => {
    const none = base((b) => b.hand('Lightning Bolt').battlefield('Mountain'))
      .at('precombatMain')
      .build();
    bolt(none, 0, 1);
    resolveAll(none);
    none.expect.speed(0, null);

    const max = base((b) => b.hand('Lightning Bolt').battlefield('Mountain').speed(4))
      .at('precombatMain')
      .build();
    bolt(max, 0, 1);
    resolveAll(max);
    max.expect.speed(0, 4);
    expect(max.state.turnLog.speedTriggered).toBeUndefined();
  });

  test('combat damage to an opponent raises it, once, however many creatures dealt damage', () => {
    const g = base((b) => b.battlefield(BEARS, BEARS).speed(2))
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([`${BEARS}[0]`, `${BEARS}[1]`]);
    g.advanceTo('combatDamage');
    resolveAll(g);
    g.expect.life(1, 16);
    g.expect.speed(0, 3);
  });

  test('the once-each-turn count starts over with the next turn', () => {
    const g = base((b) =>
      b.hand('Lightning Bolt', 'Lightning Bolt').battlefield('Mountain', { count: 2 }).speed(1),
    )
      .at('precombatMain')
      .build();
    bolt(g, 0, 1);
    resolveAll(g);
    g.expect.speed(0, 2);
    expect(g.state.turnLog.speedTriggered).toEqual([0]);
    g.advanceTo('end');
    g.advanceTo('upkeep');
    expect(g.state.turn.activeSeat).toBe(1);
    expect(g.state.turnLog.speedTriggered).toBeUndefined();
  });
});

describe('increase your speed (CR 702.179c)', () => {
  test('with no speed, the speed becomes the value', () => {
    const g = base((b) => b.hand(SURGE, DOUBLE).battlefield('Mountain', { count: 3 }))
      .at('precombatMain')
      .build();
    g.act(0).cast(DOUBLE, { pay: true });
    resolveAll(g);
    g.expect.speed(0, 2);
    g.act(0).cast(SURGE, { pay: true });
    resolveAll(g);
    g.expect.speed(0, 3);
  });

  test('it does not go past 4, the speed of max speed (CR 702.179e)', () => {
    const g = base((b) => b.hand(DOUBLE).battlefield('Mountain', { count: 2 }).speed(3))
      .at('precombatMain')
      .build();
    g.act(0).cast(DOUBLE, { pay: true });
    resolveAll(g);
    g.expect.speed(0, 4);
  });
});

describe('max speed as a condition (CR 702.178a, 702.179e)', () => {
  test('its mana ability works at speed 4 only', () => {
    for (const [speed, works] of [
      [null, false],
      [3, false],
      [4, true],
    ] as const) {
      const g = base((b) => {
        const built = b.battlefield(ENGINE);
        return speed === null ? built : built.speed(speed);
      })
        .at('precombatMain')
        .build();
      expect(g.act(0).try.tapForMana(ENGINE).ok, `speed ${speed}`).toBe(works);
    }
  });

  test('its static ability grants haste to the other Goblins at speed 4 only', () => {
    for (const [speed, haste] of [
      [null, false],
      [3, false],
      [4, true],
    ] as const) {
      const g = base((b) => {
        const built = b.battlefield(ENGINE, RACER);
        return speed === null ? built : built.speed(speed);
      })
        .at('precombatMain')
        .build();
      g.expect.derived(RACER, {
        keywords: haste ? ['startYourEngines', 'haste'] : ['startYourEngines'],
      });
    }
  });
});

describe('"attacks this combat if able" (CR 508.1d, 506.1, 611.2a)', () => {
  test('a creature must attack in that combat, and the requirement is gone after it', () => {
    const g = base((b) => b.hand(SUMMONS).battlefield('Mountain').battlefield(BEARS, BEARS))
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SUMMONS, { targets: [`${BEARS}[0]`], pay: true });
    resolveAll(g);
    g.advanceTo('declareAttackers', { attack: false });
    const decision = g.state.pending;
    if (decision?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    expect(decision.mustAttack).toHaveLength(1);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    g.act(0).attack([decision.mustAttack[0] as never]);
    g.advanceTo('postcombatMain');
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'restrict')).toEqual([]);
  });

  test('a requirement set at a combat that does not happen ends with its step, not with the turn', () => {
    const g = base((b) => b.hand(SUMMONS).battlefield('Mountain').battlefield(BEARS))
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SUMMONS, { targets: [{ name: BEARS }], pay: true });
    resolveAll(g);
    expect(g.state.continuousEffects.some((e) => e.until === 'endOfCombat')).toBe(true);
  });

  test('validation: "this combat" is the duration of attacksEachCombat only', () => {
    const card = SYNTHETIC_SPEED_LIST.find((c) => c.name === SUMMONS);
    if (card === undefined) throw new Error('no card');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const wrong = {
      ...card,
      faces: [
        {
          ...face,
          spell: {
            targets: face.spell?.targets,
            effect: {
              kind: 'restrict',
              objects: { kind: 'target', id: 't1' },
              restriction: 'cantBlock',
              duration: 'thisCombat',
            },
          },
        },
      ],
    } as never;
    expect(JSON.stringify(validateCard(wrong))).toContain(
      '\\"this combat\\" is the duration of attacksEachCombat only',
    );
    expect(validateCard(card)).toEqual([]);
  });
});

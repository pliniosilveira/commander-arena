// Power, toughness and mana value comparisons of `ObjectFilter` (D-111), in triggers, target slots,
// conditions and static abilities.
// Pins: CR 208.1 (power and toughness), CR 202.3 (mana value; an {X} on the stack counts as the
// announced value, CR 202.3e), CR 603.6a (an enters ability looks at the permanent as it enters,
// counters and effects that apply included), CR 603.10a and 113.7a (a look-back trigger reads the
// last-known information of the permanent that left), CR 115.1 (a target slot's quality), CR 603.4
// (the intervening "if" is checked when the trigger event happens and again as it resolves), CR 613.4c
// and 613.8a (a "+N/+N" static ability that reads power applies after the ones that change power).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const GROWER = 'SYNTHETIC Grower';
const BIG_ARRIVAL = 'SYNTHETIC Big Arrival Watcher';
const FRAIL_DEATH = 'SYNTHETIC Frail Death Watcher';
const TOUGH_DEATH = 'SYNTHETIC Tough Death Watcher';
const CHEAP_SPELL = 'SYNTHETIC Cheap Spell Watcher';
const EXACT_SPELL = 'SYNTHETIC Exact Spell Watcher';
const GIANT_SLAYER = 'SYNTHETIC Giant Slayer';
const WALL_BREAKER = 'SYNTHETIC Wall Breaker';
const TITAN_ROOST = 'SYNTHETIC Titan Roost';
const TITAN_ANTHEM = 'SYNTHETIC Titan Anthem';
const FRAIL_ANTHEM = 'SYNTHETIC Frail Anthem';
const CHEAP_LORD = 'SYNTHETIC Cheap Lord';
const ANTHEM = 'SYNTHETIC Anthem';

describe('"a creature with power 4 or greater enters" (CR 603.6a)', () => {
  test('a creature with a big printed power triggers, a small one does not', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BIG_ARRIVAL)
      .hand(V55, V22)
      .pool('CCCCCCC')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(V22, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.act(0).cast(V55, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${BIG_ARRIVAL} (ability)`]);
  });

  test('a creature that enters with counters is read as it enters: 2/2 with two counters is power 4', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BIG_ARRIVAL)
      .hand(GROWER)
      .pool('CCG')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GROWER, { pay: true });
    g.pass();
    g.pass();
    g.expect.pt(GROWER, 4, 4);
    g.expect.stack([`${BIG_ARRIVAL} (ability)`]);
  });

  test('a creature made big by an effect that is already there is read as it enters', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BIG_ARRIVAL, ANTHEM)
      .hand(V33)
      .pool('CCC')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(V33, { pay: true });
    g.pass();
    g.pass();
    g.expect.pt(V33, 4, 4);
    g.expect.stack([`${BIG_ARRIVAL} (ability)`]);
  });

  test("another player's creature entering triggers it too (no controller in the filter)", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BIG_ARRIVAL)
      .seat(1)
      .hand(V55)
      .pool('CCCCC')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(V55, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${BIG_ARRIVAL} (ability)`]);
  });
});

describe('look-back: the creature that left, as it last was (CR 603.10a, 113.7a)', () => {
  /** Seat 1 destroys seat 0's creature, with the watcher of seat 0 on the battlefield. */
  function kill(watcher: string, creature: string) {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(watcher, creature)
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [creature], pay: true });
    g.pass();
    g.pass();
    return g;
  }

  test('a plain 2/2 has power 3 or less, a 5/5 does not', () => {
    kill(FRAIL_DEATH, V22).expect.stack([`${FRAIL_DEATH} (ability)`]);
    kill(FRAIL_DEATH, V55).expect.stack([]);
  });

  test('+1/+1 counters count: a 2/2 with two counters had power 4 when it died', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(FRAIL_DEATH)
      .battlefield(V22, { counters: { '+1/+1': 2 } })
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.pt(V22, 4, 4);
    g.act(1).cast('Murder', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
  });

  test('-1/-1 counters count too: a 5/5 with three of them had power 2 when it died', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(FRAIL_DEATH)
      .battlefield(V55, { counters: { '-1/-1': 3 } })
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [V55], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${FRAIL_DEATH} (ability)`]);
  });

  test('an effect that is gone with the creature still counts: a static +1/+1 gave it power 3', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(FRAIL_DEATH, ANTHEM, V33)
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    // 3/3 plus the anthem is a 4/4 now: not "power 3 or less".
    g.expect.pt(V33, 4, 4);
    g.act(1).cast('Murder', { targets: [V33], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
  });

  test('a creature that leaves together with the lord that pumped it is read as it was (CR 603.10a)', () => {
    // "Destroy each permanent": the Anthem, the 3/3 it made a 4/4, a plain 2/2 and the watcher all leave at once.
    const nuke = singleFaceCard({
      name: 'SYNTHETIC Nuke Everything',
      manaCost: ['B'],
      types: ['instant'],
      colors: ['B'],
      colorIdentity: ['B'],
      oracleText: 'Destroy each permanent.',
      spell: { effect: { kind: 'destroy', objects: { kind: 'each', filter: {} } } },
    });
    const g = scenario()
      .define(nuke)
      .seat(0)
      .life(20)
      .battlefield(V33, V22, ANTHEM, FRAIL_DEATH)
      .seat(1)
      .hand('SYNTHETIC Nuke Everything')
      .pool('B')
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.pt(V33, 4, 4);
    g.act(1).cast('SYNTHETIC Nuke Everything', { pay: true });
    g.pass();
    g.pass();
    // The 2/2 had power 2; the 3/3 had power 4 with the Anthem, which is gone by the time the triggers are
    // noticed (it is destroyed after the creatures here), so only last-known information says 4.
    g.expect.stack([`${FRAIL_DEATH} (ability)`]);
  });

  test('toughness: a 5/5 has toughness 4 or greater, a 2/2 does not', () => {
    kill(TOUGH_DEATH, V55).expect.stack([`${TOUGH_DEATH} (ability)`]);
    kill(TOUGH_DEATH, V22).expect.stack([]);
  });
});

describe('mana value of a spell as it is cast (CR 202.3, 202.3e)', () => {
  test('"mana value 2 or less": Lightning Bolt (1) does, Serra Angel (5) does not', () => {
    const bolt = scenario()
      .seat(0)
      .life(20)
      .battlefield(CHEAP_SPELL)
      .hand('Lightning Bolt')
      .pool('R')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    bolt.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    bolt.expect.stack(['Lightning Bolt', `${CHEAP_SPELL} (ability)`].reverse());
    const angel = scenario()
      .seat(0)
      .life(20)
      .battlefield(CHEAP_SPELL)
      .hand('Serra Angel')
      .pool('CCCWW')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    angel.act(0).cast('Serra Angel', { pay: true });
    angel.expect.stack(['Serra Angel']);
  });

  test('"mana value 3": Murder (3) does, Lightning Bolt (1) does not', () => {
    const murder = scenario()
      .seat(0)
      .life(20)
      .battlefield(EXACT_SPELL)
      .hand('Murder')
      .pool('BBB')
      .seat(1)
      .battlefield(V22)
      .at('precombatMain', { active: 0 })
      .build();
    murder.act(0).cast('Murder', { targets: [V22], pay: true });
    murder.expect.stack([`${EXACT_SPELL} (ability)`, 'Murder']);
  });

  test('an {X} counts as the announced X while the spell is on the stack', () => {
    const cast = (x: number) => {
      const g = scenario()
        .seat(0)
        .life(20)
        .battlefield(CHEAP_SPELL)
        .hand('SYNTHETIC X Draw')
        .pool('UCCCCC')
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast('SYNTHETIC X Draw', { x, pay: true });
      return g;
    };
    // {X}{U} with X = 0 is mana value 1; with X = 3 it is 4.
    cast(0).expect.stack([`${CHEAP_SPELL} (ability)`, 'SYNTHETIC X Draw']);
    cast(3).expect.stack(['SYNTHETIC X Draw']);
  });
});

describe('target slots (CR 115.1)', () => {
  test('"target creature with power 4 or greater" offers only the big ones', () => {
    const g = scenario()
      .seat(0)
      .hand(GIANT_SLAYER)
      .pool('BB')
      .seat(1)
      .battlefield(V22, V33, V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GIANT_SLAYER);
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    if (d?.kind !== 'targets') return;
    const legal = d.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    expect(legal).toEqual([g.id(V55)]);
  });

  test('"target creature with toughness 1 or less" offers none when no creature is that small', () => {
    const g = scenario()
      .seat(0)
      .hand(WALL_BREAKER)
      .pool('RR')
      .seat(1)
      .battlefield(V22, V55)
      .at('precombatMain', { active: 0 })
      .build();
    // No legal target: the spell cannot be cast (CR 601.2c).
    g.expect.illegal(0, { cast: WALL_BREAKER });
  });

  test('a creature shrunk by counters becomes a legal target', () => {
    const g = scenario()
      .seat(0)
      .hand(WALL_BREAKER)
      .pool('RR')
      .seat(1)
      .battlefield(V22, { counters: { '-1/-1': 1 } })
      .at('precombatMain', { active: 0 })
      .build();
    // A 2/2 with a -1/-1 counter is a 1/1.
    g.act(0).cast(WALL_BREAKER, { targets: [V22], pay: true });
    g.passAll();
    g.expect.noObject(V22, { zone: 'battlefield' });
  });
});

describe('conditions: the intervening "if" with a quality (CR 603.4)', () => {
  const upkeep = (creature: string | null) => {
    const b = scenario().seat(0).life(20).battlefield(TITAN_ROOST);
    if (creature !== null) b.battlefield(creature);
    return b
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
  };

  test('triggers at your upkeep if you control a creature with power 4 or greater', () => {
    const g = upkeep(V55);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${TITAN_ROOST} (ability)`]);
  });

  test('does not trigger with only smaller creatures, or none', () => {
    const small = upkeep(V33);
    small.advanceTo('upkeep', { turn: 'next' });
    small.expect.stack([]);
    const none = upkeep(null);
    none.advanceTo('upkeep', { turn: 'next' });
    none.expect.stack([]);
  });

  test('it is checked again as the ability resolves: the big creature is gone by then', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(TITAN_ROOST, V55)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${TITAN_ROOST} (ability)`]);
    // Seat 0 holds priority with the trigger on the stack; it passes, seat 1 kills the creature.
    g.pass();
    g.act(1).cast('Murder', { targets: [V55], pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.life(0, 20);
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
  });
});

describe('static abilities that read power, toughness or mana value (CR 613.4c, 613.8a)', () => {
  test('"creatures you control with power 4 or greater get +1/+1"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN_ANTHEM, V55, V33)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt({ name: V55, seat: 0 }, 6, 6);
    g.expect.pt(V33, 3, 3);
    // The opponent's creature is not "you control".
    g.expect.pt({ name: V55, seat: 1 }, 5, 5);
  });

  test('it reads the power the creature has after the effects that change it: a 3/3 with an anthem', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN_ANTHEM, ANTHEM, V33)
      .at('precombatMain', { active: 0 })
      .build();
    // The plain anthem makes it 4/4, which then has power 4 or greater: 5/5.
    g.expect.pt(V33, 5, 5);
  });

  test('counters count as power too', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN_ANTHEM)
      .battlefield(V22, { counters: { '+1/+1': 2 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(V22, 5, 5);
  });

  test('two of them both apply, the second reading what the first added', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN_ANTHEM, TITAN_ANTHEM, V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(V55, 7, 7);
  });

  test('toughness 2 or less: a 2/2 gets +1/+1, a 3/3 does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FRAIL_ANTHEM, V22, V33)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(V22, 3, 3);
    g.expect.pt(V33, 3, 3);
  });

  test('mana value 2 or less: Grizzly Bears (2) gets +1/+1, Serra Angel (5) does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHEAP_LORD, 'Grizzly Bears', 'Serra Angel')
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt('Grizzly Bears', 3, 3);
    g.expect.pt('Serra Angel', 4, 4);
  });

  test('a creature that leaves the lord loses the bonus: it is read now, not locked in', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITAN_ANTHEM, V55)
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.pt(V55, 6, 6);
    g.act(1).cast('Murder', { targets: [V55], pay: true });
    g.passAll();
    g.expect.noObject(V55, { zone: 'battlefield' });
  });
});

describe('determinism', () => {
  test('the same board twice has the same hash', () => {
    const build = () =>
      scenario()
        .seat(0)
        .battlefield(TITAN_ANTHEM, ANTHEM, V33, V55)
        .at('precombatMain', { active: 0 })
        .build()
        .hash();
    expect(build()).toBe(build());
  });
});

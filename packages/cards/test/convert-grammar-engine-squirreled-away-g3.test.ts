// Squirreled Away, group 3: the REAL Oracle text of Maelstrom Pulse, Windgrace's Judgment, Swarmyard Massacre, Skyfisher Spider and Deep Forest Hermit (the corpus's golden.jsonl) goes
// through the grammar with no override, is defined in an engine scenario and is played through applyAction. Pins: CR 201.2 and 708.2a (names; a face-down permanent has none), CR 608.2b
// (a spell with one illegal target does not resolve), CR 115.1 and 601.2c (one target for each opponent chosen), CR 608.2h and 611.2c (a value worked out once, as the spell
// resolves), CR 603.12 ("if you do"), CR 702.63 (Vanishing).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const ANGEL = 'Serra Angel'; // 4/4
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');

describe('Maelstrom Pulse: the target and every other permanent with its name', () => {
  const pulse = real('Maelstrom Pulse');

  const board = (mine: readonly string[], theirs: readonly string[]) =>
    scenario()
      .define(pulse)
      .seat(0)
      .library(...LIBRARY)
      .hand(pulse.name)
      .battlefield(...mine)
      .pool('CBG')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the permanents with the same name are destroyed whoever controls them, the others stay (CR 201.2)', () => {
    const g = board([BEARS, ELVES], [BEARS, BEARS, ELVES, ANGEL]);
    g.act(0)
      .cast(pulse.name)
      .targets([{ name: BEARS, zone: 'battlefield', seat: 1, nth: 0 }])
      .pay();
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 1 })).toHaveLength(2);
    expect(g.find({ name: ELVES, zone: 'battlefield' })).toHaveLength(2);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the target may be a permanent of my own', () => {
    const g = board([ELVES], [ELVES, BEARS]);
    g.act(0)
      .cast(pulse.name)
      .targets([{ name: ELVES, zone: 'battlefield', seat: 0 }])
      .pay();
    g.passAll();
    expect(g.find({ name: ELVES, zone: 'battlefield' })).toHaveLength(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('a land is not a legal target (nonland permanent)', () => {
    const g = board(['Forest'], [BEARS]);
    g.act(0).cast(pulse.name);
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [
          { kind: 'object', id: g.id({ name: 'Forest', zone: 'battlefield' }), specId: 't1' },
        ],
      }).ok,
    ).toBe(false);
  });

  test('face-down permanents have no name, so none has the name of another (CR 708.2a)', () => {
    const g = scenario()
      .define(pulse)
      .seat(0)
      .library(...LIBRARY)
      .hand(pulse.name)
      .battlefield(BEARS, { faceDown: true })
      .battlefield(BEARS, { faceDown: true })
      .battlefield(ELVES)
      .pool('CBG')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0)
      .cast(pulse.name)
      .targets([{ name: BEARS, zone: 'battlefield', seat: 0, nth: 0 }])
      .pay();
    g.passAll();
    // Only the one that was the target: the other face-down creature has no name that is the same as it.
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
    expect(g.find({ name: BEARS, zone: 'graveyard' })).toHaveLength(1);
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });
});

describe("Windgrace's Judgment: for any number of opponents, one target each", () => {
  const judgment = real("Windgrace's Judgment");

  const table = (seats: 2 | 3 | 4, boards: readonly (readonly string[])[]) => {
    const b = scenario({ seats })
      .define(judgment)
      .seat(0)
      .library(...LIBRARY)
      .hand(judgment.name)
      .pool('CCCBG');
    b.battlefield(BEARS);
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...LIBRARY)
        .battlefield(...(boards[seat - 1] ?? []));
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  const targetsOf = (g: ReturnType<typeof table>) => {
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return d.specs[0];
  };

  test('with four seats it takes up to one target for each of the three opponents, none required (CR 115.1)', () => {
    const g = table(4, [[ANGEL, 'Forest'], [ELVES], [BEARS]]);
    g.act(0).cast(judgment.name);
    const spec = targetsOf(g);
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(3);
    expect(spec?.onePerGroup).toBe(true);
    // The lands are not legal: three nonland permanents of opponents, none of my own.
    expect(spec?.legal).toHaveLength(3);
  });

  test('the opponents chosen lose a permanent each, the one left out keeps theirs', () => {
    const g = table(4, [[ANGEL], [ELVES], [BEARS]]);
    g.act(0)
      .cast(judgment.name)
      .targets([
        { name: ANGEL, zone: 'battlefield', seat: 1 },
        { name: BEARS, zone: 'battlefield', seat: 3 },
      ])
      .pay();
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 3 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    // Mine stays: "that player controls" is an opponent.
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('two targets of the same opponent are refused', () => {
    const g = table(3, [[ANGEL, ELVES], [BEARS]]);
    g.act(0).cast(judgment.name);
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [
          { kind: 'object', id: g.id({ name: ANGEL, zone: 'battlefield' }), specId: 't1' },
          { kind: 'object', id: g.id({ name: ELVES, zone: 'battlefield' }), specId: 't1' },
        ],
      }).ok,
    ).toBe(false);
  });

  test('choosing no opponent is allowed and destroys nothing', () => {
    const g = table(3, [[ANGEL], [ELVES]]);
    g.act(0).cast(judgment.name);
    g.act(0).chooseTargets();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.zone(judgment.name, 'graveyard', { seat: 0 });
  });
});

describe('Swarmyard Massacre: the creatures that are not Insects, Rats, Spiders or Squirrels', () => {
  const massacre = real('Swarmyard Massacre');
  const SQUIRREL = 'Squirrel';

  const board = (mine: readonly string[], theirs: readonly string[]) =>
    scenario()
      .define(massacre)
      .seat(0)
      .library(...LIBRARY)
      .hand(massacre.name)
      .battlefield(...mine)
      .pool('CCCBB')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the two new Squirrels are counted: every other creature gets -2/-2 until end of turn (CR 608.2h)', () => {
    const g = board([BEARS], [ANGEL, ELVES]);
    g.act(0).cast(massacre.name, { pay: true });
    g.passAll();
    expect(g.find({ name: SQUIRREL, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.pt(ANGEL, 2, 2);
    // A 2/2 and a 1/1 die to -2/-2; the Squirrels (1/1, 'isn't' the creature types listed) are not touched.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.pt({ name: SQUIRREL, zone: 'battlefield', seat: 0, nth: 0 }, 1, 1);
  });

  test('the count includes the other listed creatures I control, each once, and is worked out once (CR 611.2c)', () => {
    const g = board([BEARS, 'Giant Spider'], [ANGEL]);
    g.act(0).cast(massacre.name, { pay: true });
    g.passAll();
    // A Spider and two Squirrels: -3/-3. The Spider is a creature type of the list, so it stays at its size.
    g.expect.pt(ANGEL, 1, 1);
    g.expect.pt('Giant Spider', 2, 4);
    // The count was fixed as the spell resolved: a Squirrel dying later does not change the Angel.
    g.act(0).pass();
    g.expect.pt(ANGEL, 1, 1);
  });
});

describe('Skyfisher Spider: gain life for each creature card in the graveyard, then exile it', () => {
  const spider = real('Skyfisher Spider');
  const BOLT = 'Lightning Bolt';

  const dies = (graveyard: readonly string[]) => {
    const b = scenario()
      .define(spider)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(spider.name)
      .graveyard(...graveyard)
      .pool('R')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 });
    const g = b.build();
    g.act(0)
      .cast(BOLT)
      .targets([{ name: spider.name, zone: 'battlefield' }])
      .pay();
    g.passAll();
    return g;
  };

  test('accepting: one life for each creature card in my graveyard (the Spider itself included), and the Spider is exiled (CR 603.12)', () => {
    const g = dies([BEARS, ELVES, 'Forest']);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.life(0, 40 + 3);
    g.expect.zone(spider.name, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('declining: no life and the Spider stays in the graveyard', () => {
    const g = dies([BEARS]);
    g.act(0).decline();
    g.passAll();
    g.expect.life(0, 40);
    g.expect.zone(spider.name, 'graveyard', { seat: 0 });
  });
});

describe('Deep Forest Hermit: Vanishing 3 (CR 702.63a)', () => {
  const hermit = real('Deep Forest Hermit');

  const game = () =>
    scenario()
      .define(hermit)
      .seat(0)
      .library(...LIBRARY)
      .hand(hermit.name)
      .pool('CCCGG')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it enters with three time counters', () => {
    const g = game();
    g.act(0).cast(hermit.name, { pay: true });
    g.passAll();
    g.expect.counters(hermit.name, { time: 3 });
  });

  test('each of my upkeeps removes one, and removing the last sacrifices it', () => {
    const g = game();
    g.act(0).cast(hermit.name, { pay: true });
    g.passAll();
    for (const [left, turn] of [
      [2, 5],
      [1, 7],
    ] as const) {
      g.advanceTo('upkeep', { turn });
      g.passAll();
      g.expect.counters(hermit.name, { time: left });
      g.expect.zone(hermit.name, 'battlefield', { seat: 0 });
    }
    g.advanceTo('upkeep', { turn: 9 });
    g.passAll();
    // The last counter came off: the sacrifice trigger went on the stack and resolved.
    g.passAll();
    g.expect.zone(hermit.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

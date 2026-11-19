// The Prismari deck (issue 87), group 1: tokens that are copies, with the SYNTHETIC siblings of Rite of Replication, Twinflame, Rionya, Fire Dancer, Redoubled Stormsinger and
// Brudiclad, Telchor Engineer (src/cards/fixtures/synthetic-prismari-g1.ts). Pins: CR 111.10 and 707.2 (a copy has the copiable values: no counters, no damage, no other effects),
// CR 707.9b (an exception such as "except it has haste" is part of the copiable values), CR 603.7 and 603.7c (a delayed ability names the tokens this one ability made, and no
// others), CR 608.2b (a target that is illegal is not affected; an ability whose only target is illegal does not resolve), CR 508.4 (tapped and attacking: never "attacked"),
// CR 601.2c and 601.2f (strive: the cost grows with the targets chosen), CR 702.33a (kicker), CR 601.2i (the spells cast this turn), CR 400.7 (a new object).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Replication Rite'; // sorcery {2}{U}{U}, kicker {5}
const BLAZE = 'SYNTHETIC Twin Blaze'; // sorcery {1}{R}, strive {2}{R}
const DANCER = 'SYNTHETIC Flame Dancer'; // {3}{R}{R} 3/4
const SINGER = 'SYNTHETIC Storm Singer'; // {2}{R} 3/3 first strike
const TINKER = 'SYNTHETIC Myr Tinker'; // {4}{U}{R} 4/4
const SOLDIER_CALL = 'SYNTHETIC Soldier Call';
const BEAST_CALL = 'SYNTHETIC Beast Call';
const CANTRIP = 'SYNTHETIC Prismari Cantrip';
const LEGEND = 'SYNTHETIC Prismari Legend';
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const UNSUMMON = 'Unsummon';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Builder = ReturnType<typeof scenario>;

const idsOf = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).map((o) => o.id);
const tokens = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);

/** Seat 0 in the precombat main phase with `setup`, seat 1 with a library. */
function build(setup: (b: Builder) => void, at: 'precombatMain' | 'upkeep' = 'precombatMain') {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  setup(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at(at, { active: 0 })
    .build();
}

const cast = (g: Game, name: string, targets: readonly string[] = []) => {
  g.act(0).cast(
    { name, zone: 'hand', seat: 0, nth: 0 },
    targets.length === 0 ? { pay: true } : { pay: true, targets },
  );
};

/** Chooses the target of a triggered ability that asks (it is put on the stack by itself when it has only one legal target). */
const aim = (g: Game, target: string) => {
  if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(target);
};

describe('the cards are valid', () => {
  test.each([RITE, BLAZE, DANCER, SINGER, TINKER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Rite of Replication: a token that is a copy of target creature, five when kicked (CR 707.2, 702.33a)', () => {
  const rite = (extra: (b: Builder) => void = () => {}, lands = 4) =>
    build((b) => {
      b.hand(RITE)
        .battlefield('Island', { count: lands })
        .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 2 } });
      extra(b);
    });

  test('one token, with the copiable values of the creature: the counters are not copied (CR 707.2)', () => {
    const g = rite();
    g.expect.pt('bears', 4, 4);
    g.act(0).cast(RITE, { pay: true, targets: ['bears'] });
    g.passAll();
    const copies = tokens(g, BEARS);
    expect(copies).toHaveLength(1);
    g.expect.pt(copies[0]?.id as string, 2, 2);
    g.expect.counters(copies[0]?.id as string, {});
    g.expect.pt('bears', 4, 4);
    g.expect.invariants();
  });

  test('kicked: five tokens instead of one', () => {
    const g = rite(() => {}, 9);
    g.act(0).cast(RITE, { kicked: true, pay: true, targets: ['bears'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(5);
    g.expect.invariants();
  });

  test('not kicked with the mana for it: still one', () => {
    const g = rite(() => {}, 9);
    g.act(0).cast(RITE, { kicked: false, pay: true, targets: ['bears'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
  });

  test('a copy of an opponent’s creature is a token of the caster', () => {
    const g = build((b) => {
      b.hand(RITE).battlefield('Island', { count: 4 });
      b.seat(1).battlefield(ANGEL, { label: 'angel' });
    });
    g.act(0).cast(RITE, { pay: true, targets: ['angel'] });
    g.passAll();
    expect(tokens(g, ANGEL, 0)).toHaveLength(1);
    expect(tokens(g, ANGEL, 1)).toHaveLength(0);
    g.expect.derived(tokens(g, ANGEL, 0)[0]?.id as string, { keywords: ['flying', 'vigilance'] });
  });

  test('a copy of a token is a copy of the original: a token made as a copy copies the values it has (CR 111.10, 707.2)', () => {
    const g = rite((b) => b.battlefield(BEARS, { label: 'plain' }), 8);
    g.act(0).cast(RITE, { pay: true, targets: ['bears'] });
    g.passAll();
    const first = tokens(g, BEARS)[0]?.id as string;
    g.advanceTo('postcombatMain');
    g.state.seats[0]?.hand;
    // A second Rite targets the token itself.
    const h = build((b) => {
      b.hand(RITE, RITE).battlefield('Island', { count: 8 }).battlefield(BEARS, { label: 'bears' });
    });
    h.act(0).cast({ name: RITE, zone: 'hand', seat: 0, nth: 0 }, { pay: true, targets: ['bears'] });
    h.passAll();
    const token = tokens(h, BEARS)[0]?.id as string;
    h.act(0).cast({ name: RITE, zone: 'hand', seat: 0, nth: 0 }, { pay: true, targets: [token] });
    h.passAll();
    expect(tokens(h, BEARS)).toHaveLength(2);
    h.expect.pt(tokens(h, BEARS)[1]?.id as string, 2, 2);
    expect(first).toBeDefined();
  });

  test('the target left before it resolves: nothing happens (CR 608.2b) and the spell is countered on resolution', () => {
    const g = rite((b) => b.seat(1).hand(UNSUMMON).battlefield('Island', { count: 1 }));
    g.act(0).cast(RITE, { pay: true, targets: ['bears'] });
    g.act(0).pass();
    g.act(1).cast(UNSUMMON, { pay: true, targets: ['bears'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Twin Blaze: strive, any number of targets, copies with haste exiled at the end step (CR 601.2f, 707.9b, 603.7c)', () => {
  const blaze = (
    mana: { mountains: number; plains: number },
    extra: (b: Builder) => void = () => {},
  ) =>
    build((b) => {
      b.hand(BLAZE)
        .battlefield('Mountain', { count: mana.mountains })
        .battlefield('Plains', { count: mana.plains })
        .battlefield(BEARS, { label: 'a' })
        .battlefield(ANGEL, { label: 'b' })
        .battlefield('Giant Spider', { label: 'c' });
      extra(b);
    });

  test('the number of targets is bounded by what the cost allows: {1}{R} and {2}{R} for each target beyond the first', () => {
    // 4 Mountains and 3 Plains: one target costs 2, two cost 5, three would cost 8.
    const g = blaze({ mountains: 4, plains: 3 });
    g.act(0).cast(BLAZE, { pay: false });
    g.expect.pending('targets', 0);
    const pending = g.state.pending;
    expect(pending?.kind === 'targets' && pending.specs[0]?.max).toBe(2);
    expect(pending?.kind === 'targets' && pending.specs[0]?.min).toBe(0);
  });

  test('two targets: the cost is {1}{R} plus {2}{R}, two copies with haste', () => {
    const g = blaze({ mountains: 4, plains: 3 });
    g.act(0).cast(BLAZE, { pay: true, targets: ['a', 'b'] });
    expect(g.state.stack).toHaveLength(1);
    // 5 of the 7 lands were tapped for {1}{R}{2}{R}.
    const untapped = g
      .find({ name: 'Mountain', zone: 'battlefield', seat: 0 })
      .concat(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 }))
      .filter((o) => !o.tapped);
    expect(untapped).toHaveLength(2);
    g.passAll();
    const bears = tokens(g, BEARS);
    const angels = tokens(g, ANGEL);
    expect(bears).toHaveLength(1);
    expect(angels).toHaveLength(1);
    g.expect.derived(bears[0]?.id as string, { keywords: ['haste'] });
    g.expect.derived(angels[0]?.id as string, { keywords: ['flying', 'vigilance', 'haste'] });
    g.expect.invariants();
  });

  test('one target costs only {1}{R}', () => {
    const g = blaze({ mountains: 1, plains: 1 });
    g.act(0).cast(BLAZE, { pay: true, targets: ['a'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
  });

  test('no target at all is allowed (any number): the spell is cast for {1}{R} and does nothing', () => {
    const g = blaze({ mountains: 1, plains: 1 });
    g.act(0).cast(BLAZE, { pay: true, targets: [] });
    g.passAll();
    expect(g.state.objects).toBeDefined();
    expect(tokens(g, BEARS)).toHaveLength(0);
    g.advanceTo('end');
    g.passAll();
    g.expect.noEvent({ kind: 'permanentSacrificed' });
    g.expect.invariants();
  });

  test('the copies are exiled at the next end step, and only those: another token and the originals stay', () => {
    const g = blaze({ mountains: 4, plains: 3 }, (b) => b.hand(SOLDIER_CALL).battlefield('Plains'));
    g.act(0).cast(SOLDIER_CALL, { pay: true });
    g.passAll();
    g.act(0).cast(BLAZE, { pay: true, targets: ['a', 'b'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    expect(tokens(g, ANGEL)).toHaveLength(0);
    expect(idsOf(g, BEARS)).toHaveLength(1);
    expect(idsOf(g, ANGEL)).toHaveLength(1);
    expect(idsOf(g, 'Soldier')).toHaveLength(1);
    g.expect.invariants();
  });

  test('a target that became illegal is not copied, the other is (CR 608.2b)', () => {
    const g = blaze({ mountains: 4, plains: 3 }, (b) =>
      b.seat(1).hand(UNSUMMON).battlefield('Island'),
    );
    g.act(0).cast(BLAZE, { pay: true, targets: ['a', 'b'] });
    g.act(0).pass();
    g.act(1).cast(UNSUMMON, { pay: true, targets: ['a'] });
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    expect(tokens(g, ANGEL)).toHaveLength(1);
  });
});

describe('Flame Dancer: X copies of another target creature, X is one plus the instants and sorceries cast this turn (CR 601.2i)', () => {
  const dancer = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(DANCER)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield('Island', { count: 4 })
        .battlefield('Mountain', { count: 2 })
        .hand(CANTRIP, CANTRIP, LEGEND);
      extra(b);
    });

  test('with no spell cast: one copy, with haste', () => {
    const g = dancer();
    g.advanceTo('beginningOfCombat');
    aim(g, 'bears');
    g.passAll();
    const copies = tokens(g, BEARS);
    expect(copies).toHaveLength(1);
    g.expect.derived(copies[0]?.id as string, { keywords: ['haste'] });
  });

  test('two instants cast: three copies', () => {
    const g = dancer();
    cast(g, CANTRIP);
    g.passAll();
    cast(g, CANTRIP);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    aim(g, 'bears');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(3);
  });

  test('a creature spell and a spell of the opponent are not counted', () => {
    const g = dancer((b) => b.seat(1).hand(CANTRIP).battlefield('Island'));
    cast(g, LEGEND);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(CANTRIP, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    aim(g, 'bears');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
  });

  test('they are exiled at the next end step, the creature and the other tokens are not', () => {
    const g = dancer((b) => b.battlefield('Plains'));
    g.advanceTo('beginningOfCombat');
    aim(g, 'bears');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(0);
    expect(idsOf(g, BEARS)).toHaveLength(1);
    expect(idsOf(g, DANCER)).toHaveLength(1);
    g.expect.invariants();
  });

  test('the Dancer cannot be its own target: with no other creature the ability is removed', () => {
    const g = build((b) => b.battlefield(DANCER));
    g.advanceTo('beginningOfCombat');
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Storm Singer: for each creature token that entered this turn, a tapped and attacking copy (CR 508.4)', () => {
  const singer = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(SINGER, { label: 'singer' })
        .battlefield('Plains', { count: 4 })
        .battlefield('Forest', { count: 3 })
        .hand(SOLDIER_CALL, BEAST_CALL);
      extra(b);
    });

  test('the copies are tapped and attacking, and nothing that triggers on attacking sees them', () => {
    const g = singer();
    cast(g, SOLDIER_CALL);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    const copies = tokens(g, 'Soldier');
    expect(copies).toHaveLength(2);
    const attackers = g.state.combat?.attackers.map((a) => a.object) ?? [];
    const fresh = copies.filter((o) => attackers.includes(o.id));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.tapped).toBe(true);
    // The token that entered earlier this turn did not attack, and is untapped.
    const original = copies.find((o) => !attackers.includes(o.id));
    expect(original?.tapped).toBe(false);
    g.expect.invariants();
  });

  test('one copy for each token that entered this turn, of its own values', () => {
    const g = singer();
    cast(g, SOLDIER_CALL);
    g.passAll();
    cast(g, BEAST_CALL);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(2);
    expect(tokens(g, 'Beast')).toHaveLength(2);
  });

  test('a token that entered in an earlier turn is not copied, one that entered this turn is', () => {
    const g = singer();
    cast(g, SOLDIER_CALL);
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    cast(g, BEAST_CALL);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(1);
    expect(tokens(g, 'Beast')).toHaveLength(2);
  });

  test('they are sacrificed at the beginning of the next end step: the copies and not the tokens they copy', () => {
    const g = singer();
    cast(g, SOLDIER_CALL);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(2);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(1);
    expect(idsOf(g, 'SYNTHETIC Storm Singer')).toHaveLength(1);
    g.expect.invariants();
  });

  test('with no token that entered this turn nothing is made and nothing is sacrificed', () => {
    const g = singer();
    g.advanceTo('declareAttackers');
    g.act(0).attack('singer');
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Soldier' })).toHaveLength(0);
    g.expect.noEvent({ kind: 'permanentSacrificed' });
  });
});

describe('Myr Tinker: each other token becomes a copy of the token chosen (CR 707.2, 613.1a)', () => {
  const tinker = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(TINKER)
        .battlefield(BEARS, { label: 'bears' })
        .battlefield('Plains', { count: 4 })
        .battlefield('Forest', { count: 3 })
        .hand(SOLDIER_CALL, BEAST_CALL);
      extra(b);
    }, 'precombatMain');

  const withTokens = () => {
    const g = tinker();
    cast(g, SOLDIER_CALL);
    g.passAll();
    cast(g, BEAST_CALL);
    g.passAll();
    return g;
  };

  test('the Myr is made, then the controller may choose a token: the others become copies of it for good', () => {
    const g = withTokens();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const beast = tokens(g, 'Beast')[0]?.id as string;
    g.act(0).choosePermanents(beast);
    g.passAll();
    expect(tokens(g, 'Beast')).toHaveLength(3);
    expect(tokens(g, 'Soldier')).toHaveLength(0);
    expect(tokens(g, 'Phyrexian Myr')).toHaveLength(0);
    // A creature that is not a token is left alone, and so is the chosen token.
    g.expect.pt('bears', 2, 2);
    for (const t of tokens(g, 'Beast')) g.expect.pt(t.id, 3, 3);
    // The Myr is no longer an artifact: it is a copy of a Beast token (CR 707.2: the copiable values of the token).
    g.expect.derived(tokens(g, 'Beast')[0]?.id as string, { types: ['creature'] });
    g.expect.invariants();
  });

  test('it lasts: the tokens are still copies in the next turn (no duration, CR 611.2a)', () => {
    const g = withTokens();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).choosePermanents(tokens(g, 'Beast')[0]?.id as string);
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(tokens(g, 'Beast')).toHaveLength(3);
  });

  test('choosing the Myr that was just made makes every other token a Myr', () => {
    const g = withTokens();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).choosePermanents(tokens(g, 'Phyrexian Myr')[0]?.id as string);
    g.passAll();
    expect(tokens(g, 'Phyrexian Myr')).toHaveLength(3);
    g.expect.derived(tokens(g, 'Phyrexian Myr')[0]?.id as string, {
      types: ['artifact', 'creature'],
    });
  });

  test('choosing no token is declining: nothing changes', () => {
    const g = withTokens();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).choosePermanents();
    g.passAll();
    expect(tokens(g, 'Soldier')).toHaveLength(1);
    expect(tokens(g, 'Beast')).toHaveLength(1);
    expect(tokens(g, 'Phyrexian Myr')).toHaveLength(1);
  });

  test('creature tokens you control have haste, a token that became a copy keeps it', () => {
    const g = tinker();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const myr = tokens(g, 'Phyrexian Myr')[0]?.id as string;
    g.expect.derived(myr, { keywords: ['haste'] });
  });

  test('the Myr alone: choosing it changes nothing', () => {
    const g = tinker();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    if (g.state.pending?.kind === 'choosePermanent') {
      g.act(0).choosePermanents(tokens(g, 'Phyrexian Myr')[0]?.id as string);
      g.passAll();
    }
    expect(tokens(g, 'Phyrexian Myr')).toHaveLength(1);
    g.expect.invariants();
  });

  test('a token controlled by the opponent is not affected', () => {
    const g = withTokens();
    const h = build((b) => {
      b.battlefield(TINKER).battlefield('Plains', { count: 4 }).hand(SOLDIER_CALL);
      b.seat(1).hand(BEAST_CALL).battlefield('Forest', { count: 3 });
    });
    h.act(0).pass();
    h.act(1).cast(BEAST_CALL, { pay: true });
    h.passAll();
    h.advanceTo('beginningOfCombat');
    h.passAll();
    if (h.state.pending?.kind === 'choosePermanent') {
      h.act(0).choosePermanents(tokens(h, 'Phyrexian Myr')[0]?.id as string);
      h.passAll();
    }
    expect(tokens(h, 'Beast', 1)).toHaveLength(1);
    expect(g).toBeDefined();
  });
});

describe('a legendary creature stays legendary in the copy (CR 707.2) and the legend rule applies to the token', () => {
  test('a copy of a legendary creature is legendary: the legend rule makes its controller keep one', () => {
    const g = build((b) => {
      b.hand(RITE).battlefield('Island', { count: 4 }).battlefield(LEGEND, { label: 'legend' });
    });
    g.act(0).cast(RITE, { pay: true, targets: ['legend'] });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const pending = g.state.pending;
    expect(pending?.kind === 'choosePermanent' && pending.purpose).toBe('legendRule');
  });
});

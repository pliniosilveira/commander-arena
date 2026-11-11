// Convoke (CR 702.51), Improvise (CR 702.126) and Delve (CR 702.66), keyword batch 2 (D-116, D-120): cost-payment
// options chosen while a spell is cast, in the casting stage `payOptions` after the targets and before the mana.
// Pins: CR 702.51a (tap an untapped creature of that color for a colored mana, any creature for a generic mana),
// CR 702.51b, 702.126b, 702.66b (not an additional or alternative cost: applies after the total cost is
// determined, commander tax and reductions included), CR 702.51c (a creature that paid has "convoked"), CR 702.51d,
// 702.126c, 702.66c (redundant instances), CR 702.126a (artifacts, generic mana only), CR 702.66a (cards from the
// caster's own graveyard, generic mana only; they go to exile), CR 302.6 (tapping for convoke is not a {T} cost
// ability: a summoning-sick creature may), CR 601.2f-h (cost, then payment), CR 118.3 (a cost that cannot be
// paid is not paid), CR 733 (an illegal or cancelled cast is rewound), CR 107.4e (a hybrid symbol is colored
// mana of both colors), CR 903.8 (commander tax).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Action,
  applyAction,
  type ChoosePayOptionsDecision,
  getLegalActions,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WURM = 'SYNTHETIC Convoke Wurm'; // {4}{G}{G}
const PAIR = 'SYNTHETIC Convoke Pair'; // {G}{G} instant
const HYBRID = 'SYNTHETIC Convoke Hybrid'; // {2}{W/B}{W/B} sorcery
const CONSTRUCT = 'SYNTHETIC Improvise Construct'; // {4}{U} artifact creature
const SPIRIT = 'SYNTHETIC Delve Spirit'; // {4}{B}
const HULK = 'SYNTHETIC Resourceful Hulk'; // {6}{G}: convoke, improvise, delve
const TRINKET = 'SYNTHETIC Trinket';
const BEARS = 'Grizzly Bears'; // G
const ELVES = 'Llanowar Elves'; // G, {T}: Add {G}
const ANGEL = 'Serra Angel'; // W
const RATS = 'Typhoid Rats'; // B
const ISAMARU = 'Isamaru, Hound of Konda'; // W
const WALL = 'Wall of Stone'; // R
const SOL = 'Sol Ring'; // {T}: Add {C}{C}

function payOptions(g: ScenarioGame): ChoosePayOptionsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'choosePayOptions') {
    throw new Error(`expected choosePayOptions, got ${d?.kind}`);
  }
  return d;
}

const ids = (g: ScenarioGame, ...names: string[]) =>
  names.map((n) => g.id({ name: n, zone: 'battlefield', seat: 0 }));

function tappedNames(g: ScenarioGame): string[] {
  return g.state.battlefield
    .filter((id) => g.state.objects[id]?.tapped)
    .map((id) => g.state.objects[id]?.card)
    .map((card) =>
      card === null || card === undefined
        ? ''
        : (g.state.definitions[g.state.cards[card]?.definition ?? 0]?.name ?? ''),
    )
    .sort();
}

describe('CR 702.51a (Convoke): tap an untapped creature rather than pay that mana', () => {
  function crowd(extra: readonly string[] = []) {
    return scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, ANGEL, RATS, ISAMARU, WALL, ...extra)
      .battlefield(ELVES)
      .seat(1)
      .battlefield(BEARS)
      .build();
  }

  test('the question comes after the targets and before the mana, listing only creatures that could pay', () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, ANGEL, RATS, ISAMARU, WALL, ELVES)
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(WURM);
    expect(g.state.casting?.stage).toBe('payOptions');
    const d = payOptions(g);
    expect(d.seat).toBe(0);
    expect(d.mechanism).toBe('convoke');
    expect(d.cost).toEqual(['4', 'G', 'G']);
    expect(d.candidates).toHaveLength(6); // all of mine: untapped creatures, never the opponent's
    expect(d.maxUsable).toBe(6);
    expect(d.colors?.[g.id({ name: ANGEL, seat: 0 })]).toEqual(['W']);
    expect(d.source).toBe(g.state.casting?.object);
  });

  test('tapping six creatures pays the whole {4}{G}{G}: no mana is asked for, and every one is tapped', () => {
    const g = crowd();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    expect(g.act(0).try.action({ kind: 'choosePayOptions', objects: [...d.candidates] }).ok).toBe(
      true,
    );
    // The Bears and Elves are the green ones: they paid {G}{G}, the others the {4}.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.stack([WURM]);
    expect(tappedNames(g)).toEqual([ANGEL, BEARS, ELVES, ISAMARU, RATS, WALL].sort());
    g.expect.noEvent({ kind: 'lifeChanged' });
    expect(g.events.filter((e) => e.kind === 'tapped')).toHaveLength(6);
    g.expect.invariants();
  });

  test('a creature of the right color pays colored mana; others pay generic only', () => {
    // {4}{G}{G}: with no green creature chosen the {G}{G} stay, to be paid with mana.
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(ANGEL, RATS, ISAMARU, WALL, 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    // Four non-green creatures can pay at most the {4}: all four may be chosen.
    expect(d.maxUsable).toBe(4);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G', 'G']);
    g.act(0).payAuto();
    g.expect.stack([WURM]);
  });

  test('only creatures that could pay are listed: with a {G}{G} cost a white creature is not a candidate', () => {
    const g = scenario()
      .seat(0)
      .hand(PAIR)
      .battlefield(BEARS, ANGEL, ISAMARU, 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(PAIR);
    const d = payOptions(g);
    expect(d.candidates).toEqual([g.id({ name: BEARS, seat: 0 })]);
    expect(d.maxUsable).toBe(1);
    expect(g.act(0).try.action({ kind: 'choosePayOptions', objects: ids(g, ANGEL) }).ok).toBe(
      false,
    );
    g.act(0).choose({ kind: 'choosePayOptions', objects: ids(g, BEARS) });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G']);
  });

  test('no question when no creature could pay (nothing but white creatures for {G}{G})', () => {
    const g = scenario().seat(0).hand(PAIR).battlefield(ANGEL, 'Forest', 'Forest').seat(1).build();
    g.act(0).cast(PAIR);
    expect(g.state.pending?.kind).toBe('payMana');
    expect(g.state.casting?.stage).toBe('payment');
  });

  test('a summoning-sick creature may be tapped (CR 302.6: it is not a {T} cost ability)', () => {
    const g = scenario()
      .seat(0)
      .hand(PAIR)
      .battlefield(BEARS, { fresh: true })
      .battlefield(BEARS, { fresh: true })
      .seat(1)
      .build();
    g.act(0).cast(PAIR);
    const d = payOptions(g);
    expect(d.candidates).toHaveLength(2);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    g.expect.stack([PAIR]);
  });

  test("a tapped creature and the opponent's creatures are not candidates", () => {
    const g = scenario()
      .seat(0)
      .hand(PAIR)
      .battlefield(BEARS, { tapped: true })
      .battlefield(BEARS, 'Forest')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(PAIR);
    const d = payOptions(g);
    expect(d.candidates).toHaveLength(1);
    const mine = g.find({ name: BEARS, zone: 'battlefield', seat: 0 }).filter((o) => !o.tapped);
    expect(d.candidates).toEqual([mine[0]?.id]);
  });

  test('illegal answers are refused and leave the question open: too many, twice, a stranger, too many for the colors', () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(ANGEL, RATS, ISAMARU, WALL, 'Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    const [angel, rats] = ids(g, ANGEL, RATS);
    const theirs = g.id({ name: BEARS, seat: 1 });
    const refused = (objects: string[]) =>
      g.act(0).try.action({ kind: 'choosePayOptions', objects: objects as never }).ok;
    expect(refused([angel as string, angel as string])).toBe(false);
    expect(refused([theirs])).toBe(false);
    expect(refused([angel as string, 'o9999'])).toBe(false);
    // The wrong seat is not asked.
    expect(applyAction(g.state, 1, { kind: 'choosePayOptions', objects: [] }).ok).toBe(false);
    expect(g.state.pending).toBe(d);
    expect(rats).toBeDefined();
    // More creatures than there is mana they could pay for: five from a pool of four non-green creatures
    // is impossible here, so check the {G}{G}: a cost with no generic.
    const h = scenario().seat(0).hand(PAIR).battlefield(BEARS, BEARS, BEARS).seat(1).build();
    h.act(0).cast(PAIR);
    const bears = h.find({ name: BEARS, zone: 'battlefield', seat: 0 }).map((o) => o.id);
    expect(h.act(0).try.action({ kind: 'choosePayOptions', objects: bears }).ok).toBe(false);
    expect(h.act(0).try.action({ kind: 'choosePayOptions', objects: bears.slice(0, 2) }).ok).toBe(
      true,
    );
  });

  test('none chosen pays everything in mana', () => {
    const g = scenario().seat(0).hand(PAIR).battlefield(BEARS, 'Forest', 'Forest').seat(1).build();
    g.act(0).cast(PAIR);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G', 'G']);
    g.act(0).payAuto();
    g.expect.tapped(BEARS, false);
  });

  test('part convoke, part mana: the mana that is left is paid by the lands', () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, BEARS, ANGEL, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...payOptions(g).candidates] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    // Two green creatures paid {G}{G}, the white one a {1} of the {4}.
    expect(pay.totalCost).toEqual(['3']);
    g.act(0).payAuto();
    g.expect.stack([WURM]);
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
  });

  test('cancel at the question takes the whole cast back (CR 733)', () => {
    const g = crowd();
    const before = g.positionHash();
    g.act(0).cast(WURM);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone(WURM, 'hand', { seat: 0 });
    g.expect.tapped(g.id({ name: BEARS, zone: 'battlefield', seat: 0 }), false);
  });

  test('a creature that could tap for mana counts once: two Elves and a Forest pay {G}{G}{G}', () => {
    const TRIPLE = singleFace({
      name: 'SYNTHETIC Test Triple Green',
      manaCost: ['G', 'G', 'G'],
      types: ['instant'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'Convoke',
      abilities: [{ kind: 'keyword', keyword: { kind: 'convoke' } }],
      spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
    });
    const withForest = scenario()
      .seat(0)
      .define(TRIPLE)
      .hand(TRIPLE.name)
      .battlefield(ELVES, ELVES, 'Forest')
      .seat(1)
      .build();
    expect(getLegalActions(withForest.state, 0).some((a) => a.kind === 'castSpell')).toBe(true);
    // Two Elves alone make {G}{G} one way or the other: not three.
    const without = scenario()
      .seat(0)
      .define(TRIPLE)
      .hand(TRIPLE.name)
      .battlefield(ELVES, ELVES)
      .seat(1)
      .build();
    expect(getLegalActions(without.state, 0).some((a) => a.kind === 'castSpell')).toBe(false);
    expect(without.act(0).try.cast(TRIPLE.name).ok).toBe(false);
  });

  test('the legal actions offer the spell exactly when the creatures make it payable', () => {
    const canCast = (g: ScenarioGame, name: string) =>
      getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && g.state.objects[a.object]?.card === g.object(name).card,
      );
    const six = crowd();
    expect(canCast(six, WURM)).toBe(true);
    const five = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, BEARS, ANGEL, RATS, ISAMARU)
      .seat(1)
      .build();
    expect(canCast(five, WURM)).toBe(false);
    const fivePlusLand = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, BEARS, ANGEL, RATS, ISAMARU, 'Mountain')
      .seat(1)
      .build();
    expect(canCast(fivePlusLand, WURM)).toBe(true);
    // Without two green ones the {G}{G} cannot be tapped for, and the lands here make no green.
    const noGreen = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(ANGEL, RATS, ISAMARU, WALL, 'Mountain', 'Mountain')
      .seat(1)
      .build();
    expect(canCast(noGreen, WURM)).toBe(false);
  });

  test('every action the decision lists is accepted by applyAction', () => {
    const g = crowd();
    g.act(0).cast(WURM);
    const listed = getLegalActions(g.state, 0);
    // With no lands only tapping nearly all of them pays the cost (the Elves may make their own {G}): the
    // empty set, which pays nothing, is not listed, and the set of all six is.
    const sets = listed.flatMap((a) => (a.kind === 'choosePayOptions' ? [a.objects] : []));
    expect(sets).toContainEqual([...payOptions(g).candidates]);
    expect(sets).not.toContainEqual([]);
    expect(sets.length).toBeLessThan(5);
    expect(listed.some((a) => a.kind === 'cancel')).toBe(true);
    for (const a of listed as Action[]) {
      if (a.kind === 'concede') continue;
      expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('a hybrid symbol is colored mana of either color (CR 107.4e): a white or a black creature pays it', () => {
    const g = scenario().seat(0).hand(HYBRID).battlefield(ANGEL, RATS, BEARS, WALL).seat(1).build();
    g.act(0).cast(HYBRID);
    const d = payOptions(g);
    expect(d.cost).toEqual(['2', 'W/B', 'W/B']);
    // All four can pay something ({2} generic, two hybrid): all four chosen pays the lot.
    expect(d.maxUsable).toBe(4);
    g.act(0).choose({ kind: 'choosePayOptions', objects: ids(g, ANGEL, RATS, BEARS, WALL) });
    g.expect.stack([HYBRID]);
  });

  test('the commander tax is part of the cost the creatures pay (CR 702.51b, 903.8)', () => {
    const g = scenario()
      .seat(0)
      .commander(WURM, { casts: 1 })
      .battlefield(BEARS, BEARS, ANGEL, RATS, ISAMARU, WALL, ELVES, ELVES)
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    // {4}{G}{G} plus the {2} of the first cast from the command zone: {6}{G}{G}.
    expect(d.cost).toEqual(['4', 'G', 'G', '2']);
    expect(d.maxUsable).toBe(8);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    g.expect.stack([WURM]);
  });
});

describe('CR 702.126a (Improvise): tap an untapped artifact for generic mana', () => {
  test('artifacts pay the generic part only: four of {4}{U}, never the blue', () => {
    const g = scenario()
      .seat(0)
      .hand(CONSTRUCT)
      .battlefield(TRINKET, TRINKET, TRINKET, TRINKET, 'Island')
      .seat(1)
      .build();
    g.act(0).cast(CONSTRUCT);
    const d = payOptions(g);
    expect(d.mechanism).toBe('improvise');
    expect(d.candidates).toHaveLength(4);
    expect(d.colors).toBeUndefined();
    expect(d.maxUsable).toBe(4);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['U']);
    g.act(0).payAuto();
    g.expect.stack([CONSTRUCT]);
    for (const t of g.find({ name: TRINKET, zone: 'battlefield', seat: 0 })) {
      g.expect.tapped(t.id, true);
    }
  });

  test('five artifacts are refused: only four mana of the cost are generic', () => {
    const g = scenario()
      .seat(0)
      .hand(CONSTRUCT)
      .battlefield(TRINKET, TRINKET, TRINKET, TRINKET, TRINKET, 'Island')
      .seat(1)
      .build();
    g.act(0).cast(CONSTRUCT);
    const d = payOptions(g);
    expect(d.maxUsable).toBe(4);
    expect(g.act(0).try.action({ kind: 'choosePayOptions', objects: [...d.candidates] }).ok).toBe(
      false,
    );
  });

  test('a tapped artifact is not offered; the question is skipped with nothing to tap', () => {
    const g = scenario()
      .seat(0)
      .hand(CONSTRUCT)
      .battlefield(TRINKET, { tapped: true })
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(CONSTRUCT);
    expect(g.state.pending?.kind).toBe('payMana');
  });

  test('a Sol Ring is counted once: it makes two mana, so it is no better as an artifact to tap', () => {
    const cast = (trinkets: number) => {
      const g = scenario()
        .seat(0)
        .hand(CONSTRUCT)
        .battlefield(SOL, ...Array.from({ length: trinkets }, () => TRINKET), 'Island')
        .seat(1)
        .build();
      return getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell');
    };
    // Sol Ring {C}{C} + Island {U} + two Trinkets (2 more) = 5; with one Trinket only 4.
    expect(cast(2)).toBe(true);
    expect(cast(1)).toBe(false);
  });
});

describe('CR 702.66a (Delve): exile a card from your graveyard for generic mana', () => {
  function yard(size: number, extra: readonly string[] = ['Swamp']) {
    return scenario()
      .seat(0)
      .hand(SPIRIT)
      .graveyard(...Array.from({ length: size }, (_, i) => (i % 2 === 0 ? BEARS : 'Island')))
      .battlefield(...extra)
      .seat(1)
      .graveyard(BEARS, BEARS)
      .build();
  }

  test('the cards of your graveyard are listed, and the ones chosen are exiled as cards', () => {
    const g = yard(4);
    g.act(0).cast(SPIRIT);
    const d = payOptions(g);
    expect(d.mechanism).toBe('delve');
    expect(d.candidates).toHaveLength(4);
    expect(d.maxUsable).toBe(4);
    // Three would leave {1}{B} with one Swamp to pay it: refused (nothing could pay it); all four leave {B}.
    expect(
      g.act(0).try.action({ kind: 'choosePayOptions', objects: d.candidates.slice(0, 3) }).ok,
    ).toBe(false);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['B']);
    // They left the graveyard for exile, one zone change each (CR 702.66a).
    expect(g.state.seats[0]?.graveyard).toHaveLength(0);
    expect(g.state.exile).toHaveLength(4);
    expect(
      g.events.filter(
        (e) => e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'exile',
      ),
    ).toHaveLength(4);
  });

  test('with more mana than needed, fewer cards may be exiled: a partial choice is fine when the rest can be paid', () => {
    const g = yard(4, ['Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(SPIRIT);
    const d = payOptions(g);
    expect(
      g.act(0).try.action({ kind: 'choosePayOptions', objects: d.candidates.slice(0, 2) }).ok,
    ).toBe(true);
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['2', 'B']);
    expect(g.state.exile).toHaveLength(2);
  });

  test("the opponent's graveyard is not offered, and the black mana cannot be paid by exiling", () => {
    const g = yard(5);
    g.act(0).cast(SPIRIT);
    const d = payOptions(g);
    expect(d.candidates).toHaveLength(5);
    expect(d.maxUsable).toBe(4);
    for (const id of d.candidates) expect(g.state.objects[id]?.zoneOwner).toBe(0);
    expect(g.act(0).try.action({ kind: 'choosePayOptions', objects: [...d.candidates] }).ok).toBe(
      false,
    );
    g.act(0).choose({ kind: 'choosePayOptions', objects: d.candidates.slice(0, 4) });
    // Only the {B} is left: the Swamp pays it, the black mana cannot be paid by exiling.
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['B']);
  });

  test('the spell is offered when the exiled cards make it payable (legal actions)', () => {
    const canCast = (g: ScenarioGame) =>
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell');
    expect(canCast(yard(4))).toBe(true); // four cards and a Swamp
    expect(canCast(yard(3))).toBe(false); // three cards and a Swamp make 4 of 5
    expect(canCast(yard(4, []))).toBe(false); // no black mana
  });

  test('exiled cards are public: the opponent sees them in exile', () => {
    const g = yard(2, ['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(SPIRIT);
    const d = payOptions(g);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    const view = g.view(1);
    expect(view.exile.filter((o) => o.name === BEARS || o.name === 'Island').length).toBe(2);
  });

  test('cancel puts the exiled cards back (the cast is rewound)', () => {
    const g = yard(4);
    const before = g.positionHash();
    g.act(0).cast(SPIRIT);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...payOptions(g).candidates] });
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('several mechanisms on one spell', () => {
  test('convoke, then improvise, then delve, each for what is left of the cost', () => {
    const g = scenario()
      .seat(0)
      .hand(HULK)
      .battlefield(BEARS, ISAMARU, TRINKET, TRINKET, 'Forest')
      .graveyard(BEARS, BEARS)
      .seat(1)
      .build();
    g.act(0).cast(HULK);
    let d = payOptions(g);
    expect(d.mechanism).toBe('convoke');
    expect(d.cost).toEqual(['6', 'G']);
    expect(d.candidates).toHaveLength(2);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    d = payOptions(g);
    expect(d.mechanism).toBe('improvise');
    // The Bears paid the {G}, the Isamaru one of the {6}.
    expect(d.cost).toEqual(['5']);
    expect(d.candidates).toHaveLength(2);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    d = payOptions(g);
    expect(d.mechanism).toBe('delve');
    expect(d.cost).toEqual(['3']);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['1']);
    g.act(0).payAuto();
    g.expect.stack([HULK]);
  });

  test('a creature that is also an artifact is tapped once: not offered to improvise after it convoked', () => {
    const g = scenario()
      .seat(0)
      .hand(HULK)
      .battlefield(CONSTRUCT, TRINKET, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(HULK);
    const first = payOptions(g);
    expect(first.mechanism).toBe('convoke');
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...first.candidates] });
    const second = payOptions(g);
    expect(second.mechanism).toBe('improvise');
    expect(second.candidates).toEqual([g.id({ name: TRINKET, seat: 0 })]);
  });

  test('every question can be skipped with the empty answer, and the last one goes on to the mana', () => {
    const g = scenario()
      .seat(0)
      .hand(HULK)
      .battlefield(
        BEARS,
        TRINKET,
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
      )
      .graveyard(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(HULK);
    for (const mechanism of ['convoke', 'improvise', 'delve']) {
      expect(payOptions(g).mechanism).toBe(mechanism);
      g.act(0).choose({ kind: 'choosePayOptions', objects: [] });
    }
    expect(g.state.pending?.kind).toBe('payMana');
  });
});

describe('determinism', () => {
  test('the same answers give the same state hash', () => {
    const run = () => {
      const g = scenario()
        .seat(0)
        .hand(WURM)
        .battlefield(BEARS, BEARS, ANGEL, RATS, ISAMARU, WALL)
        .seat(1)
        .build();
      g.act(0).cast(WURM);
      g.act(0).choose({ kind: 'choosePayOptions', objects: [...payOptions(g).candidates] });
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('suggested sets and what is refused (D-120)', () => {
  test('the decision names the set the planner would tap, lands first, and every listed choice is payable', () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, BEARS, ANGEL, RATS, ISAMARU, WALL, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    // {4}{G}{G}: three Forests pay {G}{G} and one generic... the planner taps as few creatures as it can.
    expect(d.suggested.length).toBeLessThan(d.candidates.length);
    expect(d.choices).toContainEqual([...d.suggested]);
    for (const set of d.choices) {
      expect(applyAction(g.state, 0, { kind: 'choosePayOptions', objects: [...set] }).ok).toBe(
        true,
      );
    }
    // The suggested set is accepted, and the mana left is paid by the lands.
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.suggested] });
    g.act(0).payAuto();
    g.expect.stack([WURM]);
  });

  test('a choice that leaves a cost nothing can pay is refused, and the question stays open', () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(ANGEL, RATS, ISAMARU, WALL, 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    const d = payOptions(g);
    // Only the Angel: {3}{G}{G} is left and two Forests cannot pay it.
    const refused = g.act(0).try.action({ kind: 'choosePayOptions', objects: ids(g, ANGEL) });
    expect(refused.ok).toBe(false);
    expect(g.state.pending).toBe(d);
    expect(g.act(0).try.action({ kind: 'choosePayOptions', objects: [] }).ok).toBe(false);
    for (const set of d.choices) expect(set).toHaveLength(4);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.suggested] });
    g.act(0).payAuto();
    g.expect.stack([WURM]);
  });

  test('the suggested set is always accepted, and the empty one only when everything can be paid in mana', () => {
    const rich = scenario()
      .seat(0)
      .hand(PAIR)
      .battlefield(BEARS, 'Forest', 'Forest')
      .seat(1)
      .build();
    rich.act(0).cast(PAIR);
    const d = payOptions(rich);
    expect(d.choices[0]).toEqual([]);
    const poor = scenario().seat(0).hand(PAIR).battlefield(BEARS, BEARS).seat(1).build();
    poor.act(0).cast(PAIR);
    const e = payOptions(poor);
    expect(e.choices).toEqual([[...e.candidates]]);
    expect(poor.act(0).try.action({ kind: 'choosePayOptions', objects: [] }).ok).toBe(false);
    expect(e.suggested).toEqual([...e.candidates]);
  });
});

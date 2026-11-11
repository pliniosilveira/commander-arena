// Costs that tap or sacrifice other permanents, and "the sacrificed creature's power" (D-133): "Tap three untapped Zombies you
// control", "Tap two untapped artifacts you control", "Sacrifice two artifacts", "Sacrifice another creature" with
// "where X is the sacrificed creature's power".
// Pins: CR 118.3 (a cost can't be paid without the resources), CR 602.2 (activating: the costs are paid as part of
// activation, in any order the player likes), CR 302.6 (a creature's own {T} ability can't be used while it is summoning
// sick; tapping a creature for another cost, "tap an untapped creature you control", is not that), CR 701.21 (sacrifice: a
// player chooses among permanents they control), CR 113.7a and 608.2h (an object that left is read as it last existed: the
// power it had with every effect), CR 733 (a cost can be taken back before the ability is activated), CR 603.2e (tapping
// for a cost is becoming tapped).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const WHISPERER = 'SYNTHETIC Grave Whisperer'; // 1/1 Zombie: tap three untapped Zombies you control: draw, lose 1 life
const ROGUE = 'SYNTHETIC Whirling Rogue'; // 2/2 artifact creature: tap two untapped artifacts: target creature can't be blocked
const TRINKET = 'SYNTHETIC Brass Trinket'; // artifact
const LEDGER = 'SYNTHETIC Clockwork Ledger'; // artifact: tap two untapped artifacts you control: draw a card
const MENTOR = 'SYNTHETIC Shield Mentor'; // 1/1: tap another untapped creature you control, {T}: gain 2 life
const WEAVER = 'SYNTHETIC Thopter Weaver'; // 2/2: {1}, sacrifice two artifacts: draw a card
const GHOUL = 'SYNTHETIC Ghoul Summoner'; // 2/2 Zombie: {1}{B}, {T}, sacrifice another creature: X Zombies, X its power
const ALTAR = 'SYNTHETIC Altar Scholar'; // sacrifice a creature: gain life equal to its toughness, draw its mana value
const IMP = 'SYNTHETIC Volatile Imp'; // 3/1: sacrifice ~: damage equal to its power to target player
const LORD = 'SYNTHETIC Undead Lord'; // other Zombies get +1/+1
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 {1}{B}
const BEARS = 'Grizzly Bears'; // 2/2 {1}{G}
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';

const zombieTokens = (g: ScenarioGame) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === 'Zombie' && o.controller === 0);

const canActivate = (g: ScenarioGame, card: string): boolean =>
  g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(card));

describe('"Tap three untapped Zombies you control" (CR 118.3, 302.6)', () => {
  test('three untapped Zombies pay it, the source among them: draw a card and lose 1 life', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE, { count: 2 }));
    expect(canActivate(g, WHISPERER)).toBe(true);
    g.act(0).activate(WHISPERER);
    // Exactly three can be tapped, so the engine taps them (and says so).
    g.expect.tapped(WHISPERER, true);
    g.expect.tapped({ name: ZOMBIE, nth: 0 }, true);
    g.expect.tapped({ name: ZOMBIE, nth: 1 }, true);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 19);
    g.expect.invariants();
  });

  test('summoning sickness is the creature’s own {T} ability only: fresh Zombies can be tapped for it (CR 302.6)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WHISPERER, { fresh: true }).battlefield(ZOMBIE, { count: 2, fresh: true }),
    );
    expect(canActivate(g, WHISPERER)).toBe(true);
    g.act(0).activate(WHISPERER);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('two Zombies are not enough', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE));
    expect(canActivate(g, WHISPERER)).toBe(false);
  });

  test('a tapped Zombie does not count', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WHISPERER).battlefield(ZOMBIE).battlefield(ZOMBIE, { tapped: true }),
    );
    expect(canActivate(g, WHISPERER)).toBe(false);
  });

  test("the opponent's Zombies and my non-Zombies do not count", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(WHISPERER).battlefield(BEARS),
      (b) => b.battlefield(ZOMBIE, { count: 2 }),
    );
    expect(canActivate(g, WHISPERER)).toBe(false);
  });

  test('with more Zombies than needed the player chooses which to tap', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE, { count: 3 }));
    g.act(0).activate(WHISPERER);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('tap');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(3);
    expect(d.max).toBe(3);
    expect(d.legal).toHaveLength(4);
    g.act(0).choosePermanents(
      { name: ZOMBIE, nth: 0 },
      { name: ZOMBIE, nth: 1 },
      { name: ZOMBIE, nth: 2 },
    );
    g.expect.tapped(WHISPERER, false);
    g.expect.tapped({ name: ZOMBIE, nth: 0 }, true);
    g.expect.tapped({ name: ZOMBIE, nth: 2 }, true);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('too few or too many cannot be chosen', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE, { count: 3 }));
    g.act(0).activate(WHISPERER);
    expect(() =>
      g.act(0).choosePermanents({ name: ZOMBIE, nth: 0 }, { name: ZOMBIE, nth: 1 }),
    ).toThrow();
    expect(() =>
      g
        .act(0)
        .choosePermanents(
          WHISPERER,
          { name: ZOMBIE, nth: 0 },
          { name: ZOMBIE, nth: 1 },
          { name: ZOMBIE, nth: 2 },
        ),
    ).toThrow();
  });

  test('cancel takes the activation back: nothing is tapped (CR 733)', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE, { count: 3 }));
    const before = g.positionHash();
    g.act(0).activate(WHISPERER);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('tapping for the cost is becoming tapped: it shows in the events', () => {
    const g = twoSeatGame((b) => b.battlefield(WHISPERER).battlefield(ZOMBIE, { count: 2 }));
    g.act(0).activate(WHISPERER);
    expect(g.events.filter((e) => e.kind === 'tapped')).toHaveLength(3);
  });
});

describe('"Tap two untapped artifacts you control": artifacts that are not creatures too', () => {
  test('an artifact and the artifact creature itself, a trinket: the creature can’t be blocked', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(ROGUE, { fresh: true }).battlefield(TRINKET).battlefield(BEARS),
      (b) => b.battlefield(V33),
    );
    expect(canActivate(g, ROGUE)).toBe(true);
    g.act(0).activate(ROGUE, { targets: [BEARS] });
    g.passAll();
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.tapped(TRINKET, true);
    g.expect.tapped(ROGUE, true);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'restrict')).toBe(true);
  });

  test('one artifact is not enough, and an artifact that is tapped is not counted', () => {
    const one = twoSeatGame((b) => b.battlefield(ROGUE).battlefield(BEARS));
    expect(canActivate(one, ROGUE)).toBe(false);
    const tapped = twoSeatGame((b) => b.battlefield(ROGUE).battlefield(TRINKET, { tapped: true }));
    expect(canActivate(tapped, ROGUE)).toBe(false);
  });

  test('a card with the cost and no creature of its own: two other artifacts', () => {
    const g = twoSeatGame((b) => b.battlefield(LEDGER).battlefield(TRINKET));
    g.act(0).activate(LEDGER);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.tapped(LEDGER, true);
  });
});

describe('"Tap another untapped creature you control": "another" leaves the source out', () => {
  test('the source is not one of the creatures it may tap, and {T} still needs it untapped and not summoning sick', () => {
    const alone = twoSeatGame((b) => b.battlefield(MENTOR));
    expect(canActivate(alone, MENTOR)).toBe(false);
    const sick = twoSeatGame((b) => b.battlefield(MENTOR, { fresh: true }).battlefield(BEARS));
    expect(canActivate(sick, MENTOR)).toBe(false);
    const ok = twoSeatGame((b) => b.battlefield(MENTOR).battlefield(BEARS));
    expect(canActivate(ok, MENTOR)).toBe(true);
    ok.act(0).activate(MENTOR);
    ok.passAll();
    ok.expect.life(0, 22);
    ok.expect.tapped(BEARS, true);
  });
});

describe('"Sacrifice two artifacts" (CR 701.21)', () => {
  test('two artifacts are sacrificed, the source may be one of them is not here: it is a creature', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WEAVER).battlefield(TRINKET, { count: 2 }).battlefield('Island'),
    );
    g.act(0).activate(WEAVER, { pay: true });
    g.passAll();
    g.expect.zone(TRINKET, 'graveyard', { count: 2 });
    g.expect.handSize(0, 1);
  });

  test('one artifact is not enough', () => {
    const g = twoSeatGame((b) => b.battlefield(WEAVER).battlefield(TRINKET).battlefield('Island'));
    expect(canActivate(g, WEAVER)).toBe(false);
  });

  test('with three artifacts the player chooses two', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WEAVER).battlefield(TRINKET, { count: 3 }).battlefield('Island'),
    );
    g.act(0).activate(WEAVER, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('sacrifice');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    g.act(0).choosePermanents({ name: TRINKET, nth: 0 }, { name: TRINKET, nth: 2 });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { count: 1 });
    g.expect.handSize(0, 1);
  });

  test('each permanent sacrificed is a sacrifice event (CR 701.21)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WEAVER).battlefield(TRINKET, { count: 2 }).battlefield('Island'),
    );
    g.act(0).activate(WEAVER, { pay: true });
    expect(g.events.filter((e) => e.kind === 'sacrificed')).toHaveLength(2);
  });
});

describe('"Sacrifice another creature ... where X is the sacrificed creature\'s power" (CR 113.7a, 608.2h)', () => {
  const sacrificeAndResolve = (g: ScenarioGame, victim: string) => {
    g.act(0).activate(GHOUL, { pay: true });
    if (g.state.pending?.kind === 'choosePermanent') g.act(0).choosePermanents(victim);
    g.passAll();
  };

  test('X is the power of the creature that was sacrificed: a 5/5 makes five Zombies', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(GHOUL).battlefield(V55).battlefield('Swamp', { count: 2 }),
    );
    sacrificeAndResolve(g, V55);
    g.expect.zone(V55, 'graveyard', { seat: 0 });
    expect(zombieTokens(g)).toHaveLength(5);
    g.expect.tapped(GHOUL, true);
  });

  test('the power it had with every effect: a Zombie with a lord and a counter is a 4/4', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(GHOUL)
        .battlefield(LORD)
        .battlefield(ZOMBIE, { counters: { '+1/+1': 1 } })
        .battlefield('Swamp', { count: 2 }),
    );
    // The Lord gives the Ghoul +1/+1 too: it is itself a Zombie, so it taps as a 3/3.
    sacrificeAndResolve(g, ZOMBIE);
    expect(zombieTokens(g)).toHaveLength(4);
  });

  test('a token can be the creature sacrificed: a 2/2 token is two Zombies', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(GHOUL)
        .battlefield('Swamp', { count: 2 })
        .hand('SYNTHETIC Raise Zombie')
        .battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Raise Zombie', { pay: true });
    g.passAll();
    expect(zombieTokens(g)).toHaveLength(1);
    const [token] = zombieTokens(g);
    sacrificeAndResolve(g, token?.id ?? '');
    expect(zombieTokens(g)).toHaveLength(2);
  });

  test('another creature: the source cannot sacrifice itself, so alone it cannot be activated', () => {
    const g = twoSeatGame((b) => b.battlefield(GHOUL).battlefield('Swamp', { count: 2 }));
    expect(canActivate(g, GHOUL)).toBe(false);
  });

  test('a creature with no power makes no Zombies', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(GHOUL).battlefield('Wall of Stone').battlefield('Swamp', { count: 2 }),
    );
    sacrificeAndResolve(g, 'Wall of Stone');
    g.expect.zone('Wall of Stone', 'graveyard', { seat: 0 });
    expect(zombieTokens(g)).toHaveLength(0);
  });

  test('the cost is paid with the activation: the creature is gone before the ability resolves, the ability still reads it', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(GHOUL).battlefield(V33).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).activate(GHOUL, { pay: true });
    g.expect.zone(V33, 'graveyard', { seat: 0 });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(zombieTokens(g)).toHaveLength(3);
  });

  test('cancelling before the cost is paid leaves the board as it was (CR 733)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(GHOUL).battlefield(V33).battlefield(V55).battlefield('Swamp', { count: 2 }),
    );
    const before = g.positionHash();
    g.act(0).activate(GHOUL, { pay: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('the sacrificed permanent read in other ways: toughness, mana value, and the source itself', () => {
  test('"gain life equal to its toughness and draw cards equal to its mana value"', () => {
    const g = twoSeatGame((b) => b.battlefield(ALTAR).battlefield(BEARS));
    g.act(0).activate(ALTAR);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.handSize(0, 2);
  });

  test('a token has mana value 0', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(ALTAR).hand('SYNTHETIC Raise Zombie').battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Raise Zombie', { pay: true });
    g.passAll();
    g.act(0).activate(ALTAR);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.handSize(0, 0);
  });

  test('sacrificing the source itself: its power is read as it last was', () => {
    const g = twoSeatGame((b) => b.battlefield(IMP).battlefield(LORD));
    g.act(0).activate(IMP, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.zone(IMP, 'graveyard', { seat: 0 });
    // A Zombie? No: an Imp. 3 damage.
    g.expect.life(1, 17);
  });
});

describe('what a card may say', () => {
  function firstFace(card: ReturnType<typeof syntheticCard>) {
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return face;
  }
  const withAbilities = (name: string, abilities: unknown[]) => {
    const base = syntheticCard(name);
    return { ...base, faces: [{ ...firstFace(base), abilities }] } as never;
  };
  const messages = (card: never) =>
    validateCard(card)
      .map((i) => i.message)
      .join(' | ');
  const activated = (
    cost: unknown[],
    effect: unknown = { kind: 'draw', player: { kind: 'you' }, count: 1 },
  ) => ({
    kind: 'activated',
    cost,
    effect,
  });

  test('a tap cost needs a whole number of at least 1 and a filter that is about permanents I control', () => {
    const ok = activated([{ kind: 'tapPermanents', filter: { types: ['artifact'] }, count: 2 }]);
    expect(messages(withAbilities(LEDGER, [ok]))).toBe('');
    const bad = [
      { kind: 'tapPermanents', filter: { types: ['artifact'] }, count: 0 },
      { kind: 'tapPermanents', filter: { types: ['artifact'], controller: 'opponent' }, count: 1 },
      { kind: 'tapPermanents', filter: { types: ['artifact'], tapped: true }, count: 1 },
      { kind: 'tapPermanents', filter: { types: ['artifact'], zone: 'graveyard' }, count: 1 },
    ];
    for (const cost of bad) {
      expect(messages(withAbilities(LEDGER, [activated([cost])])), JSON.stringify(cost)).not.toBe(
        '',
      );
    }
  });

  test('a tap cost is not combined with mana (the player could tap the permanents for mana first)', () => {
    const card = withAbilities(LEDGER, [
      activated([
        { kind: 'mana', symbols: ['1'] },
        { kind: 'tapPermanents', filter: { types: ['artifact'] }, count: 1 },
      ]),
    ]);
    expect(messages(card)).toMatch(/creature-tapping|tap/);
  });

  test('a sacrifice count of 2 or more is for an activated ability, not for a spell or a mana ability', () => {
    const spell = {
      ...syntheticCard('SYNTHETIC Raise Zombie'),
    };
    const face = firstFace(spell);
    const card = {
      ...spell,
      faces: [
        {
          ...face,
          additionalCosts: [{ kind: 'sacrifice', what: { types: ['artifact'] }, count: 2 }],
        },
      ],
    } as never;
    expect(messages(card)).toMatch(/count/);
    const mana = withAbilities(LEDGER, [
      {
        kind: 'mana',
        cost: [{ kind: 'sacrifice', what: { types: ['artifact'] }, count: 2 }],
        production: { kind: 'fixed', mana: ['C'] },
      },
    ]);
    expect(messages(mana)).toMatch(/count|sacrifice/);
  });

  test('the sacrificed permanent is read only in an ability that sacrifices something as a cost', () => {
    const noCost = withAbilities(LEDGER, [
      activated([{ kind: 'tap' }], {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
      }),
    ]);
    expect(messages(noCost)).toMatch(/sacrificedCost/);
    const triggered = withAbilities(LEDGER, [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
        },
      },
    ]);
    expect(messages(triggered)).toMatch(/sacrificedCost/);
  });

  test('a sacrifice count is a positive whole number, and "this" is sacrificed once', () => {
    const zero = withAbilities(WEAVER, [
      activated([{ kind: 'sacrifice', what: { types: ['artifact'] }, count: 0 }]),
    ]);
    expect(messages(zero)).toMatch(/count/);
    const selfTwice = withAbilities(WEAVER, [
      activated([{ kind: 'sacrifice', what: { kind: 'this' }, count: 2 }]),
    ]);
    expect(messages(selfTwice)).toMatch(/count|this/);
  });
});

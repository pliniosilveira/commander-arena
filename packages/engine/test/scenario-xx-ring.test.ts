// "The Ring tempts you" (CR 701.54, D-196) and There and Back Again, the card of the Korvold deck that needs it.
// Pins: CR 701.54a (choose a creature you control: it becomes your Ring-bearer until another creature does or another player gains control of it),
// 701.54b (a designation, not a copiable value), 701.54c (the emblem named The Ring, its four levels: legendary and can't be blocked by creatures with
// greater power; loot when the Ring-bearer attacks; the blocker is sacrificed at end of combat; each opponent loses 3 when it deals combat damage to a
// player), 701.54d ("whenever the Ring tempts you" even when no creature could be chosen), 701.54e ("is your Ring-bearer"), CR 509.1b (the evasion is read as
// blockers are declared), CR 509.3d (the third ability triggers once for each creature that blocks), CR 400.7 (a new object has no designation),
// CR 603.7 (the sacrifice is a delayed triggered ability), CR 611.2b ("for as long as you control this Saga"), CR 704.5j (the legend rule sees the supertype).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ring.ts; There and Back Again has the real wording of the owner's request file) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SAGA = 'SYNTHETIC There and Back Again';
const RITE = 'SYNTHETIC Ring Rite'; // {1}{B} sorcery: the Ring tempts you
const WATCHER = 'SYNTHETIC Ring Watcher'; // {1}{W} enchantment: whenever the Ring tempts you, gain 1 life
const OATH = 'SYNTHETIC Bearer Oath'; // {U} instant: if you control your Ring-bearer, draw a card
const BORROW = 'SYNTHETIC Borrow Creature'; // gain control of target creature until end of turn
const BREAKER = 'SYNTHETIC Saga Breaker'; // destroy target Saga
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const WALL = 'Wall of Stone'; // 0/8 defender
const MURDER = 'Murder';
const FILLER = Array.from({ length: 14 }, () => 'Plains');
const SWAMPS = ['Swamp', 'Swamp'] as const;

type Builder = ReturnType<typeof scenario>;
const game = (mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) =>
  theirs(
    mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();

const ringEvents = (g: ScenarioGame, mark: number) =>
  g
    .eventsSince(mark)
    .filter((e): e is Extract<GameEvent, { kind: 'ringTempted' }> => e.kind === 'ringTempted');

/** Seat 0 casts the rite and lets it resolve. */
const temptWithRite = (g: ScenarioGame) => {
  g.act(0).cast({ name: RITE, zone: 'hand', nth: 0 }, { pay: true });
  g.passAll();
  return g;
};

describe('the cards are valid', () => {
  test.each([SAGA, RITE, WATCHER, OATH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the Ring effect, trigger and condition are the card text, and the engine-only sacrifice is refused in a card', () => {
    const bad = syntheticCard(RITE);
    const face = bad.faces[0];
    if (face === undefined) throw new Error('no face');
    const issues = validateCard({
      ...bad,
      faces: [{ ...face, spell: { effect: { kind: 'delayedSacrifice' } } }],
    });
    expect(issues.map((i) => i.message).join('\n')).toMatch(/Ring/);
  });
});

describe('the Ring tempts you (CR 701.54a)', () => {
  const rite = (mine: (b: Builder) => Builder = (b) => b) =>
    game((b) => mine(b.hand(RITE).battlefield(...SWAMPS)));

  test('with several creatures the controller is asked which becomes the Ring-bearer, and nothing has changed before the answer', () => {
    const g = temptWithRite(rite((b) => b.battlefield(V22, V33)));
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`pending is ${d?.kind}`);
    expect(d).toMatchObject({ seat: 0, purpose: 'ringBearer', min: 1, max: 1 });
    expect([...d.legal].sort()).toEqual([g.id(V22), g.id(V33)].sort());
    g.expect.ringLevel(0, 0);
    g.expect.ringBearer(0, null);
    expect(g.legalActions(0)).toContainEqual({ kind: 'choosePermanents', objects: [g.id(V33)] });
    expect(g.legalActions(1)).toEqual([]);
  });

  test('the answer gives the player the emblem, one tempt and the designation; the event says so (CR 701.54c)', () => {
    const g = temptWithRite(rite((b) => b.battlefield(V22, V33)));
    const mark = g.mark();
    g.act(0).choosePermanents(V33);
    g.expect.ringLevel(0, 1);
    g.expect.ringBearer(0, V33);
    g.expect.ringLevel(1, 0);
    expect(ringEvents(g, mark)).toEqual([
      { kind: 'ringTempted', seat: 0, times: 1, bearer: g.id(V33), first: true },
    ]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('an answer that is not a creature the player controls is refused and the question stays', () => {
    const g = temptWithRite(
      game(
        (b) => b.hand(RITE).battlefield(...SWAMPS, V22, V33),
        (b) => b.battlefield(V55),
      ),
    );
    const before = g.state.pending;
    expect(() => g.act(0).choosePermanents({ name: V55, seat: 1 })).toThrow();
    expect(g.state.pending).toEqual(before);
  });

  test('with one creature it is the Ring-bearer at once and nobody is asked', () => {
    const g = temptWithRite(rite((b) => b.battlefield(V22)));
    g.expect.pending('priority', 0);
    g.expect.ringBearer(0, V22);
    g.expect.ringLevel(0, 1);
  });

  test('a noncreature permanent is not a choice, and with no creature only the count moves (CR 701.54d)', () => {
    const g = temptWithRite(rite((b) => b.battlefield('Sol Ring')));
    const mark = g.mark();
    g.expect.pending('priority', 0);
    g.expect.ringBearer(0, null);
    g.expect.ringLevel(0, 1);
    expect(g.find({ name: 'Sol Ring' })[0]?.ringBearer).toBeUndefined();
    expect(mark).toBeGreaterThan(0);
    g.expect.invariants();
  });

  test('"whenever the Ring tempts you" triggers when there was no creature to choose (CR 701.54d)', () => {
    const g = game((b) => b.hand(RITE).battlefield(...SWAMPS, WATCHER));
    const mark = g.mark();
    temptWithRite(g);
    // the ability went on the stack as the Ring tempted, and resolved with the rest of the stack
    expect(g.eventsSince(mark).filter((e) => e.kind === 'abilityTriggered')).toHaveLength(1);
    g.expect.life(0, 21);
  });

  test('"whenever the Ring tempts you" triggers for its controller only, once for each tempt', () => {
    const g = game(
      (b) => b.hand(RITE, RITE).battlefield(...SWAMPS, 'Swamp', 'Swamp', WATCHER, V22),
      (b) => b.battlefield(WATCHER),
    );
    temptWithRite(g);
    temptWithRite(g);
    g.expect.life(0, 22);
    g.expect.life(1, 20);
    g.expect.ringLevel(0, 2);
  });

  test('a second tempt that chooses another creature moves the designation: the first one is no longer the Ring-bearer', () => {
    const g = game((b) =>
      b.hand(RITE, RITE).battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', V22, V33),
    );
    temptWithRite(g);
    g.act(0).choosePermanents(V22);
    g.expect.ringBearer(0, V22);
    const mark = g.mark();
    temptWithRite(g);
    g.act(0).choosePermanents(V33);
    g.expect.ringBearer(0, V33);
    g.expect.ringLevel(0, 2);
    expect(g.object(V22).ringBearer).toBeUndefined();
    expect(g.eventsSince(mark).filter((e) => e.kind === 'ringBearerLost')).toEqual([
      { kind: 'ringBearerLost', seat: 0, object: g.id(V22) },
    ]);
    expect(ringEvents(g, mark)).toMatchObject([{ times: 2, first: false }]);
    g.expect.invariants();
  });

  test('a second tempt that chooses the same creature leaves it the Ring-bearer, with no loss', () => {
    const g = game((b) =>
      b.hand(RITE, RITE).battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', V22, V33),
    );
    temptWithRite(g);
    g.act(0).choosePermanents(V22);
    const mark = g.mark();
    temptWithRite(g);
    g.act(0).choosePermanents(V22);
    g.expect.ringBearer(0, V22);
    g.expect.ringLevel(0, 2);
    expect(g.eventsSince(mark).filter((e) => e.kind === 'ringBearerLost')).toEqual([]);
  });

  test("each player's Ring is their own: the opponent can have a Ring-bearer too", () => {
    const g = game(
      (b) => b.hand(RITE).battlefield(...SWAMPS, V22),
      (b) => b.battlefield(V33).ring(1),
    );
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.ringBearer(0, V22);
    g.expect.ringBearer(1, null);
    g.expect.ringLevel(1, 1);
  });
});

describe("level 1: the Ring-bearer is legendary and can't be blocked by creatures with greater power (CR 701.54c)", () => {
  const bearerGame = (level = 1) =>
    game(
      (b) => b.ring(level).battlefield(V33, { ringBearer: true }).battlefield(V22),
      (b) => b.battlefield(V22, V33, V55),
    );

  test('the designation and the level are public in the view', () => {
    const g = bearerGame(2);
    for (const seat of [0, 1] as const) {
      const v = getView(g.state, seat);
      expect(v.battlefield.find((o) => o.name === V33 && o.controller === 0)?.ringBearer).toBe(0);
      expect(v.battlefield.find((o) => o.name === V22 && o.controller === 0)?.ringBearer).toBe(
        undefined,
      );
      expect(v.seats[0]?.ringTempted).toBe(2);
      expect(v.seats[1]?.ringTempted).toBeUndefined();
    }
  });

  test('it has the supertype legendary as derived, and no other creature does (the designation adds a supertype in layer 4)', () => {
    const g = bearerGame();
    const mine = g.view(0).battlefield.filter((o) => o.controller === 0);
    expect(mine.find((o) => o.name === V33)?.supertypes).toEqual(['legendary']);
    expect(mine.find((o) => o.name === V22)?.supertypes).toEqual([]);
  });

  test("creatures with greater power can't block it; equal or lesser power can (CR 509.1b)", () => {
    const g = bearerGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: V22, seat: 1 }, V33, true);
    g.expect.canBlock({ name: V33, seat: 1 }, V33, true);
    g.expect.canBlock({ name: V55, seat: 1 }, V33, false);
    expect(() => g.act(1).declareBlockers([{ blocker: V55, attacker: V33 }])).toThrow();
  });

  test('a creature that is not the Ring-bearer is blocked by any creature as usual', () => {
    const g = bearerGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: V22, seat: 0 });
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: V55, seat: 1 }, { name: V22, seat: 0 }, true);
  });
});

describe('level 2: whenever your Ring-bearer attacks, draw a card, then discard a card (CR 701.54c)', () => {
  const attackWith = (level: number, attacker: string) => {
    const g = game((b) =>
      b.ring(level).hand('Island').battlefield(V33, { ringBearer: true }).battlefield(V22),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(attacker);
    return g;
  };

  test('at level 1 nothing triggers', () => {
    attackWith(1, V33).expect.stack([]);
  });

  test("at level 2 an ability of The Ring goes on the stack, with the rule's text, and both players see it", () => {
    const g = attackWith(2, V33);
    g.expect.stack(['The Ring (ability)']);
    for (const seat of [0, 1] as const) {
      const top = g.view(seat).stack[0];
      expect(top?.name).toBe('The Ring');
      expect(top?.oracleText).toBe(
        'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
      );
    }
  });

  test('it draws a card, then the controller chooses a card to discard', () => {
    const g = attackWith(2, V33);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`pending is ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.act(0).chooseCards({ name: 'Island', zone: 'hand', nth: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    g.expect.invariants();
  });

  test('another creature attacking does not trigger it', () => {
    attackWith(4, V22).expect.stack([]);
  });

  test("a creature of the opponent attacking never triggers it, whoever's Ring-bearer it was", () => {
    const g = game(
      (b) => b.ring(2).battlefield(V33, { ringBearer: true }),
      (b) => b.battlefield(V22),
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.act(1).attack(V22);
    g.expect.stack([]);
  });
});

describe("level 3: the blocking creature's controller sacrifices it at end of combat (CR 701.54c, 509.3d, 603.7)", () => {
  const blocked = (level: number, blockers: readonly string[]) => {
    const g = game(
      (b) => b.ring(level).battlefield(V33, { ringBearer: true }),
      (b) => b.battlefield(...blockers),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers(
      blockers.map((blocker, nth) => ({
        // two blockers of the same name are told apart by their place among those on the battlefield
        blocker:
          blockers.filter((x) => x === blocker).length > 1
            ? { name: blocker, seat: 1 as const, nth }
            : { name: blocker, seat: 1 as const },
        attacker: V33,
      })),
    );
    return g;
  };

  test('at level 2 a blocked Ring-bearer triggers nothing', () => {
    blocked(2, [WALL]).expect.stack([]);
  });

  test("at level 3 an ability of The Ring goes on the stack, with the rule's text", () => {
    const g = blocked(3, [WALL]);
    g.expect.stack(['The Ring (ability)']);
    expect(g.view(1).stack[0]?.oracleText).toBe(
      "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
    );
  });

  test('the blocker is sacrificed as combat ends, by its controller, not before: it deals and takes combat damage first', () => {
    const g = blocked(3, [WALL]);
    g.passAll();
    // the ability resolved: a delayed trigger waits for the end of combat; the Wall is still blocking
    g.expect.zone(WALL, 'battlefield', { seat: 1 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.zone(WALL, 'battlefield', { seat: 1 });
    g.expect.damage({ name: WALL, seat: 1 }, 3);
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone(WALL, 'graveyard', { seat: 1 });
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.expect.noEvent({ kind: 'sacrificed', controller: 0 });
    g.expect.invariants();
  });

  test('two blockers: it triggers once for each creature that blocks it, and both are sacrificed', () => {
    const g = blocked(3, [WALL, WALL]);
    // two abilities of The Ring triggered, one for each blocker: their controller orders them (CR 603.3b)
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error(`pending is ${d?.kind}`);
    expect(d.triggers).toHaveLength(2);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.advanceTo('combatDamage');
    g.act(0).defaultDamage();
    g.advanceTo('endOfCombat');
    // the two delayed abilities trigger together as combat ends: ordered, then resolved
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    expect(g.find({ name: WALL, zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: WALL, zone: 'graveyard' })).toHaveLength(2);
  });

  test('an unblocked Ring-bearer triggers nothing', () => {
    const g = game(
      (b) => b.ring(3).battlefield(V33, { ringBearer: true }),
      (b) => b.battlefield(WALL),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.expect.stack([]);
  });
});

describe('level 4: whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life (CR 701.54c)', () => {
  const connect = (level: number) => {
    const g = game(
      (b) => b.ring(level).battlefield(V33, { ringBearer: true }),
      (b) => b,
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    // the opponent has no creature, so no blockers are asked for
    g.advanceTo('combatDamage');
    return g;
  };

  test('at level 3 only the combat damage is lost', () => {
    const g = connect(3);
    g.passAll();
    g.expect.life(1, 17);
  });

  test('at level 4 the opponent loses 3 more life, from an ability of The Ring', () => {
    const g = connect(4);
    g.expect.stack(['The Ring (ability)']);
    expect(g.view(0).stack[0]?.oracleText).toBe(
      'Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.',
    );
    g.passAll();
    g.expect.life(1, 14);
    g.expect.life(0, 20);
  });

  test('damage to a creature does not trigger it', () => {
    const g = game(
      (b) => b.ring(4).battlefield(V33, { ringBearer: true }),
      (b) => b.battlefield(WALL),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: WALL, attacker: V33 }]);
    g.passAll();
    g.advanceTo('combatDamage');
    g.expect.stack([]);
    g.expect.life(1, 20);
  });
});

describe('the Ring-bearer stops being one (CR 701.54a, 400.7)', () => {
  test('when it leaves the battlefield: the new object is not a Ring-bearer, and the player has none', () => {
    const g = game(
      (b) => b.ring(1).battlefield(V33, { ringBearer: true }),
      (b) => b.hand(MURDER).battlefield('Swamp', 'Swamp', 'Swamp'),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(1).cast(MURDER, { targets: [{ name: V33, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(V33, 'graveyard', { seat: 0 });
    g.expect.ringBearer(0, null);
    expect(g.find({ name: V33 })[0]?.ringBearer).toBeUndefined();
    g.expect.ringLevel(0, 1);
    g.expect.invariants();
  });

  test('when another player gains control of it, for good: it is not the Ring-bearer when it comes back', () => {
    const g = game(
      (b) => b.ring(2).battlefield(V33, { ringBearer: true }),
      (b) => b.hand(BORROW).battlefield('Mountain', 'Mountain'),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(1).cast(BORROW, { targets: [{ name: V33, seat: 0 }], pay: true });
    g.passAll();
    // seat 1 controls it: it is nobody's Ring-bearer now (seat 0 does not control it, seat 1's Ring never named it)
    g.expect.ringBearer(0, null);
    g.expect.ringBearer(1, null);
    expect(g.object(V33).ringBearer).toBeUndefined();
    expect(g.view(0).battlefield.find((o) => o.name === V33)?.supertypes).toEqual([]);
    g.expect.invariants();
    // the effect ends in the cleanup step; the creature goes back to seat 0 and the designation does not come back with it
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.ringBearer(0, null);
    expect(g.view(0).battlefield.find((o) => o.name === V33)?.ringBearer).toBeUndefined();
  });

  test('the loss is logged when control changes, not when the creature dies', () => {
    const g = game(
      (b) => b.ring(1).battlefield(V33, { ringBearer: true }),
      (b) => b.hand(BORROW).battlefield('Mountain', 'Mountain'),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    const mark = g.mark();
    g.act(1).cast(BORROW, { targets: [{ name: V33, seat: 0 }], pay: true });
    g.passAll();
    expect(g.eventsSince(mark).filter((e) => e.kind === 'ringBearerLost')).toEqual([
      { kind: 'ringBearerLost', seat: 0, object: g.id(V33) },
    ]);
  });
});

describe('"if you control your Ring-bearer" (CR 701.54e)', () => {
  const oath = (mine: (b: Builder) => Builder) =>
    game((b) => mine(b.hand(OATH).battlefield('Island')));
  const castOath = (g: ScenarioGame) => {
    g.act(0).cast(OATH, { pay: true });
    g.passAll();
    return g.state.seats[0]?.hand.length ?? -1;
  };

  test('true with a Ring-bearer on the battlefield under your control', () => {
    expect(castOath(oath((b) => b.ring(1).battlefield(V22, { ringBearer: true })))).toBe(1);
  });

  test('false with a creature that is not the Ring-bearer, or with no Ring at all', () => {
    expect(castOath(oath((b) => b.ring(1).battlefield(V22)))).toBe(0);
    expect(castOath(oath((b) => b.battlefield(V22)))).toBe(0);
  });
});

describe('determinism and replay', () => {
  const play = () => {
    const g = game(
      (b) => b.hand(RITE).battlefield(...SWAMPS, V22, V33),
      (b) => b.battlefield(V55),
    );
    temptWithRite(g);
    g.act(0).choosePermanents(V33);
    return g;
  };

  test('the same actions give the same state hash, and the Ring is part of it', () => {
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    const c = game(
      (bb) => bb.hand(RITE).battlefield(...SWAMPS, V22, V33),
      (bb) => bb.battlefield(V55),
    );
    temptWithRite(c);
    c.act(0).choosePermanents(V22);
    expect(c.hash()).not.toBe(a.hash());
  });
});

describe("There and Back Again, chapter I: up to one target creature can't block for as long as you control this Saga; the Ring tempts you", () => {
  const MOUNTAINS = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;
  const cast = (
    mine: (b: Builder) => Builder = (b) => b,
    theirs: (b: Builder) => Builder = (b) => b,
  ) => {
    const g = game(
      (b) => mine(b.hand(SAGA).battlefield(...MOUNTAINS)),
      (b) => theirs(b),
    );
    g.act(0).cast(SAGA, { pay: true });
    g.passAll();
    return g;
  };

  test('chapter I goes on the stack as the Saga enters; one target at most is chosen', () => {
    const g = cast(
      (b) => b.battlefield(V22, V33),
      (b) => b.battlefield(WALL, V55),
    );
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`pending is ${d?.kind}`);
    // "up to one": choosing none is a legal answer
    expect(g.legalActions(0)).toContainEqual({ kind: 'chooseTargets', targets: [] });
  });

  test('the target can not block while the controller controls the Saga, and the Ring-bearer is chosen after it', () => {
    const g = cast(
      (b) => b.battlefield(V22, V33),
      (b) => b.battlefield(WALL, V55),
    );
    g.act(0).chooseTargets({ name: WALL, seat: 1 });
    g.passAll();
    // two creatures: the controller is asked for the Ring-bearer
    expect(g.state.pending).toMatchObject({
      kind: 'choosePermanent',
      purpose: 'ringBearer',
      seat: 0,
    });
    g.act(0).choosePermanents(V22);
    g.expect.ringBearer(0, V22);
    g.expect.ringLevel(0, 1);
    g.expect.noObject(SAGA, { zone: 'graveyard' });
    // seat 0 attacks with the other creature: the Wall can't block it, the 5/5 can
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: WALL, seat: 1 }, V33, false);
    g.expect.canBlock({ name: V55, seat: 1 }, V33, true);
    g.expect.invariants();
  });

  test('the effect ends for good when the Saga leaves the battlefield (CR 611.2b)', () => {
    const g = cast(
      (b) => b.battlefield(V22, V33).hand(BREAKER).battlefield('Plains'),
      (b) => b.battlefield(WALL),
    );
    g.act(0).chooseTargets({ name: WALL, seat: 1 });
    g.passAll();
    g.act(0).choosePermanents(V22);
    g.act(0).cast(BREAKER, { targets: [{ name: SAGA, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(SAGA, 'graveyard', { seat: 0 });
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: WALL, seat: 1 }, V33, true);
  });

  test('with no target chosen the Ring still tempts you', () => {
    const g = cast(
      (b) => b.battlefield(V22, V33),
      (b) => b.battlefield(WALL),
    );
    g.act(0).chooseTargets();
    g.passAll();
    g.act(0).choosePermanents(V33);
    g.expect.ringBearer(0, V33);
    g.advanceTo('declareAttackers');
    g.act(0).attack(V22);
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: WALL, seat: 1 }, V22, true);
  });

  test('with no creature of your own the Ring still tempts you: only the count moves (CR 701.54d)', () => {
    const g = cast(
      (b) => b,
      (b) => b.battlefield(WALL),
    );
    g.act(0).chooseTargets({ name: WALL, seat: 1 });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.ringLevel(0, 1);
    g.expect.ringBearer(0, null);
  });
});

describe('There and Back Again, chapters II and III', () => {
  const onChapter = (lore: number) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SAGA, { counters: { lore } })
      .library(...FILLER, 'Mountain')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    // the scenario starts on turn 3, seat 0's: the next turn of seat 0 is turn 5
    g.advanceTo('precombatMain', { turn: 5 });
    return g;
  };

  test('chapter II: search for a Mountain card, put it onto the battlefield, shuffle', () => {
    const g = onChapter(1);
    g.expect.stack([`${SAGA} (ability)`]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: 'Mountain', zone: 'library' });
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('chapter III: Smaug, a legendary 6/6 red Dragon creature token with flying and haste, and the Saga is sacrificed', () => {
    const g = onChapter(2);
    g.passAll();
    const smaug = g.find({ name: 'Smaug', zone: 'battlefield' });
    expect(smaug).toHaveLength(1);
    const v = g.view(0).battlefield.find((o) => o.name === 'Smaug');
    expect(v).toMatchObject({
      supertypes: ['legendary'],
      types: ['creature'],
      subtypes: ['Dragon'],
      colors: ['R'],
      power: 6,
      toughness: 6,
    });
    expect(smaug[0]?.token).not.toBeNull();
    g.expect.zone(SAGA, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('Smaug has flying and haste, and when it dies its controller creates fourteen Treasure tokens', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SAGA, { counters: { lore: 2 } })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('precombatMain', { turn: 5 });
    g.passAll();
    const keywords = g.view(0).battlefield.find((o) => o.name === 'Smaug');
    expect(keywords).toBeDefined();
    expect(g.object({ name: 'Smaug', zone: 'battlefield' }).token).not.toBeNull();
    expect(g.state.turn.step).toBe('precombatMain');
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [{ name: 'Smaug', seat: 0 }], pay: true });
    g.passAll();
    g.expect.noObject('Smaug', { zone: 'battlefield' });
    const treasures = g.find({ name: 'Treasure', zone: 'battlefield' });
    expect(treasures).toHaveLength(14);
    expect(treasures.every((t) => t.owner === 0 && t.controller === 0)).toBe(true);
  });
});

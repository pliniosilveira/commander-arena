// Triggers whose subject is a filtered creature, and references to the player the event is about (D-133): nontoken,
// subtype, controller and "another" on the subject of every trigger event; "attacks you or a planeswalker you control";
// "is dealt damage" with "that much"; "that player" (the drawer, the player damaged, the player whose spell targeted) and
// "that creature's controller"; "it" for the creature that entered.
// Pins: CR 603.2 (a permanent's ability triggers once for each event), CR 603.10a (leaves-the-battlefield triggers look
// back in time: the creature is read as it last was, tokens included), CR 111.7 (a token that left a zone ceases to exist,
// after its triggers), CR 508.1b (an attacker is declared as attacking a player, a planeswalker or a battle), CR 506.3,
// CR 120.3 (damage is dealt by one source at a time: one trigger for each source), CR 603.2g (damage that is prevented
// triggers nothing), CR 608.2b (an object that left is a new object: "it" resolves to nothing), CR 121.1 (drawing),
// CR 700.4 ("dies" is a creature put into a graveyard from the battlefield), CR 702.21a (becoming a target).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const STONE = 'SYNTHETIC Decree Stone'; // a creature attacks you or a planeswalker you control: its controller loses 1
const SENTINEL = 'SYNTHETIC Wary Sentinel'; // a creature attacks you: you gain 1
const GRAVES = 'SYNTHETIC Open Graves'; // a nontoken creature you control dies: a 2/2 Zombie token
const MIDNIGHT = 'SYNTHETIC Midnight Cousin'; // a nontoken creature you control dies: 1 damage to you, draw
const RIDER = 'SYNTHETIC Grave Rider'; // 3/3 Zombie Knight: it or another nontoken Zombie you control dies: a Zombie token
const WAGON = 'SYNTHETIC Welcome Wagon'; // another nontoken Zombie you control enters: gain 1
const GORECLAW = 'SYNTHETIC Goreclaw Cousin'; // 3/3: another nontoken creature you control enters: counter and haste on it
const TEMPEST = 'SYNTHETIC Gale Tempest'; // a creature you control with flying enters: it gains haste
const CHANT = 'SYNTHETIC Sentry Chant'; // a nontoken creature you control blocks: gain 1
const BELL = 'SYNTHETIC Farewell Bell'; // a nontoken creature you control leaves the battlefield: gain 1
const WHELP = 'SYNTHETIC Spitfire Whelp'; // you cast a noncreature or Zombie spell: 1 damage to each opponent
const TITHE = 'SYNTHETIC Zombie Tithe'; // a nontoken Zombie deals combat damage to a player: draw
const REAVER = 'SYNTHETIC Reaver Cousin'; // 3/3 Zombie: combat damage to a player: that player discards, tapped Zombie
const CRAWLER = 'SYNTHETIC Crawler Cousin'; // an opponent draws a card: that player loses 1
const TOTEM = 'SYNTHETIC Toll Totem'; // an opponent casts a spell: that player loses 1 life
const REGENT = 'SYNTHETIC Regent Cousin'; // a Zombie you control becomes the target of an opponent's spell: 3 to that player
const RAPTOR = 'SYNTHETIC Spiteful Raptor'; // 3/3: when it is dealt damage, draw a card
const SERAPH = 'SYNTHETIC Soulful Seraph'; // 3/6: when it is dealt damage, you gain that much life
const LEDGER = 'SYNTHETIC Scar Ledger'; // a creature you control is dealt combat damage: gain 1
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 {1}{B}
const RAISE = 'SYNTHETIC Raise Zombie'; // sorcery: a 2/2 Zombie token
const WRATH = 'SYNTHETIC Wrath';
const LIFELINKER = 'SYNTHETIC Flying Lifelinker'; // 1/2 flying {1}{W}
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const PW = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main (or seat 1's with `active`); `mine` and `theirs` place the two sides. */
function main(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  active: 0 | 1 = 0,
) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active })
    .build();
}

/** `n` Swamps and a pair of every other basic land, so any of the cards here can be paid for. */
const lands = (b: Builder, n = 5) =>
  b
    .battlefield('Swamp', { count: n })
    .battlefield('Mountain', { count: 2 })
    .battlefield('Forest', { count: 2 })
    .battlefield('Plains', { count: 2 });
const zombieTokens = (g: ScenarioGame, seat = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === 'Zombie' && o.controller === seat);

/** Resolves everything on the stack, answering the questions that come up as the simplest legal way. */
function settleAll(g: ScenarioGame): void {
  for (let guard = 0; guard < 60; guard += 1) {
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, i) => i));
    } else if (d?.kind === 'assignDamage') {
      g.act(d.seat).defaultDamage();
    } else if (d?.kind === 'chooseCards') {
      g.act(d.seat).choose({ kind: 'chooseCards', objects: d.legal.slice(0, d.min) });
    } else if (g.state.stack.length > 0) {
      g.pass();
    } else break;
  }
}

/** `seat` attacks the other seat (or `target`) with `attackers`; ends with the triggers on the stack. */
function attackWith(
  g: ScenarioGame,
  seat: 0 | 1,
  attackers: readonly string[],
  target?: string,
): void {
  g.advanceTo('declareAttackers');
  g.act(seat).attack(
    attackers.map((name) => ({ name, seat })),
    target,
  );
}

describe('"attacks you or a planeswalker you control" and "that creature\'s controller" (CR 508.1b)', () => {
  test("a creature attacking me: its controller loses 1 life, not the Stone's", () => {
    const g = main(
      (b) => b.battlefield(STONE),
      (b) => b.battlefield(V22),
      1,
    );
    attackWith(g, 1, [V22]);
    settleAll(g);
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });

  test('each attacker triggers once', () => {
    const g = main(
      (b) => b.battlefield(STONE),
      (b) => b.battlefield(V22).battlefield(V33),
      1,
    );
    attackWith(g, 1, [V22, V33]);
    settleAll(g);
    g.expect.life(1, 18);
  });

  test('a creature attacking a planeswalker I control triggers it', () => {
    const g = main(
      (b) => b.battlefield(STONE).battlefield(PW),
      (b) => b.battlefield(V22),
      1,
    );
    attackWith(g, 1, [V22], PW);
    settleAll(g);
    g.expect.life(1, 19);
  });

  test("my creature attacking the opponent's planeswalker does not", () => {
    const g = main(
      (b) => b.battlefield(STONE).battlefield(V22),
      (b) => b.battlefield(PW),
    );
    attackWith(g, 0, [V22], PW);
    expect(g.state.stack).toHaveLength(0);
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });

  test('"attacks you" alone: not an attack on my planeswalker', () => {
    const g = main(
      (b) => b.battlefield(SENTINEL).battlefield(PW),
      (b) => b.battlefield(V22),
      1,
    );
    attackWith(g, 1, [V22], PW);
    expect(g.state.stack).toHaveLength(0);
    g.expect.life(0, 20);
  });

  test('"attacks you" alone: an attack on me triggers', () => {
    const g = main(
      (b) => b.battlefield(SENTINEL),
      (b) => b.battlefield(V22),
      1,
    );
    attackWith(g, 1, [V22]);
    settleAll(g);
    g.expect.life(0, 21);
  });
});

describe('dies: a filtered subject, tokens and last-known information (CR 603.10a, 111.7)', () => {
  test('a nontoken creature of mine dies: a Zombie token', () => {
    const g = main((b) => lands(b.hand(MURDER).battlefield(GRAVES).battlefield(BEARS), 3));
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(1);
  });

  test('a token that dies triggers nothing', () => {
    const g = main((b) => lands(b.hand(BOLT).battlefield(GRAVES).hand(RAISE), 4));
    g.act(0).cast(RAISE, { pay: true });
    settleAll(g);
    const [token] = zombieTokens(g);
    expect(token).toBeDefined();
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: [token?.id ?? ''], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(0);
    expect(g.state.stack).toHaveLength(0);
  });

  test("the opponent's creature dying is not 'you control'", () => {
    const g = main(
      (b) => lands(b.hand(MURDER).battlefield(GRAVES), 3),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(0);
  });

  test('"deals 1 damage to you and you draw a card"', () => {
    const g = main((b) => lands(b.hand(MURDER).battlefield(MIDNIGHT).battlefield(BEARS), 3));
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settleAll(g);
    g.expect.life(0, 19);
    g.expect.handSize(0, 1);
  });

  test('"~ or another nontoken Zombie you control dies": the creature itself triggers once', () => {
    const g = main((b) => lands(b.hand(MURDER).battlefield(RIDER), 3));
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [RIDER], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(1);
  });

  test('another nontoken Zombie dying triggers it; a token Zombie and a non-Zombie do not', () => {
    const g = main((b) =>
      lands(b.hand(MURDER).hand(MURDER).hand(BOLT), 8)
        .battlefield(RIDER)
        .battlefield(ZOMBIE)
        .battlefield(BEARS),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [ZOMBIE], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(1);
    // The new token dies: nothing more.
    const [token] = zombieTokens(g);
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: [token?.id ?? ''], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(0);
    // A Bears dying: nothing.
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settleAll(g);
    expect(zombieTokens(g)).toHaveLength(0);
  });

  test('creatures that die together see each other die (CR 603.10a)', () => {
    const g = main((b) =>
      lands(b.hand(WRATH), 4).battlefield(RIDER).battlefield(ZOMBIE).battlefield(GRAVES),
    );
    g.act(0).cast(WRATH, { pay: true });
    settleAll(g);
    // Open Graves: Rider and Zombie (2 triggers); Rider: itself and the other Zombie (2 triggers).
    expect(zombieTokens(g)).toHaveLength(4);
  });
});

describe('enters: "another", nontoken, a subtype, and "it" for the creature that entered', () => {
  test('another nontoken Zombie I control enters: gain 1; a token does not', () => {
    const g = main(
      (b) => lands(b.hand(ZOMBIE).hand(RAISE).hand(BEARS).battlefield(WAGON), 8),
      (b) => b.battlefield(ZOMBIE),
    );
    g.act(0).cast(ZOMBIE, { pay: true });
    settleAll(g);
    g.expect.life(0, 21);
    g.act(0).cast(RAISE, { pay: true });
    settleAll(g);
    g.expect.life(0, 21);
    g.act(0).cast(BEARS, { pay: true });
    settleAll(g);
    g.expect.life(0, 21);
  });

  test('a +1/+1 counter on it and haste until end of turn, for the creature that entered', () => {
    const g = main((b) => lands(b.hand(BEARS).battlefield(GORECLAW), 3));
    g.act(0).cast(BEARS, { pay: true });
    settleAll(g);
    g.expect.counters({ name: BEARS, seat: 0 }, { '+1/+1': 1 });
    g.expect.pt(BEARS, 3, 3);
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.pt(BEARS, 3, 3);
  });

  test('not for a token', () => {
    const g = main((b) => lands(b.hand(RAISE), 3).battlefield(GORECLAW));
    g.act(0).cast(RAISE, { pay: true });
    settleAll(g);
    const [token] = zombieTokens(g);
    g.expect.counters(token?.id ?? '', {});
    g.expect.derived(token?.id ?? '', { keywords: [] });
  });

  test('"a creature you control with flying enters": haste for it; a creature without flying gets nothing', () => {
    const g = main((b) =>
      lands(b.hand(LIFELINKER).hand(BEARS), 3)
        .battlefield('Plains', { count: 3 })
        .battlefield(TEMPEST),
    );
    g.act(0).cast(LIFELINKER, { pay: true });
    settleAll(g);
    g.expect.derived(LIFELINKER, { keywords: ['flying', 'lifelink', 'haste'] });
    g.act(0).cast(BEARS, { pay: true });
    settleAll(g);
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('"it" is gone when the ability resolves: nothing happens and nothing breaks (CR 608.2b)', () => {
    const g = main((b) =>
      lands(b.hand(LIFELINKER).hand(BOLT), 3)
        .battlefield('Plains', { count: 3 })
        .battlefield('Mountain')
        .battlefield(TEMPEST),
    );
    g.act(0).cast(LIFELINKER, { pay: true });
    g.pass();
    g.pass();
    // The creature entered; its trigger is on the stack. Kill the creature in response.
    expect(g.state.stack).toHaveLength(1);
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: [LIFELINKER], pay: true });
    settleAll(g);
    g.expect.zone(LIFELINKER, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('blocks, leaves the battlefield, is cast and deals combat damage', () => {
  test('"a nontoken creature you control blocks": gain 1', () => {
    const g = main(
      (b) => b.battlefield(CHANT).battlefield(BEARS),
      (b) => b.battlefield(V22),
      1,
    );
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: V22, seat: 1 }]);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([
      { blocker: { name: BEARS, seat: 0 }, attacker: { name: V22, seat: 1 } },
    ]);
    settleAll(g);
    g.expect.life(0, 21);
  });

  test('"leaves the battlefield": a nontoken creature of mine gains life, a token does not', () => {
    const g = main((b) =>
      lands(b.hand(MURDER).hand(MURDER).hand(RAISE), 7).battlefield(BELL).battlefield(BEARS),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [BEARS], pay: true });
    settleAll(g);
    g.expect.life(0, 21);
    g.act(0).cast(RAISE, { pay: true });
    settleAll(g);
    const [token] = zombieTokens(g);
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [token?.id ?? ''], pay: true });
    settleAll(g);
    g.expect.life(0, 21);
  });

  test('"you cast a noncreature or Zombie spell": a Zombie creature spell and a sorcery trigger, a Bears spell does not', () => {
    const g = main((b) => lands(b.hand(ZOMBIE).hand(BEARS).hand(RAISE), 8).battlefield(WHELP));
    g.act(0).cast(BEARS, { pay: true });
    settleAll(g);
    g.expect.life(1, 20);
    g.act(0).cast(ZOMBIE, { pay: true });
    settleAll(g);
    g.expect.life(1, 19);
    g.act(0).cast(RAISE, { pay: true });
    settleAll(g);
    g.expect.life(1, 18);
  });

  test('"a nontoken Zombie deals combat damage to a player": a non-Zombie does not', () => {
    const g = main((b) => b.battlefield(TITHE).battlefield(ZOMBIE).battlefield(V22));
    g.advanceTo('declareAttackers');
    g.act(0).attack([
      { name: ZOMBIE, seat: 0 },
      { name: V22, seat: 0 },
    ]);
    g.advanceTo('combatDamage');
    settleAll(g);
    g.expect.handSize(0, 1);
  });
});

describe('"that player": the player the event is about', () => {
  test('"that player discards a card and you create a tapped Zombie": the damaged player discards', () => {
    const g = main(
      (b) => b.battlefield(REAVER).hand(BEARS),
      (b) => b.hand(V22).hand(V22),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: REAVER, seat: 0 }]);
    g.advanceTo('combatDamage');
    settleAll(g);
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 1);
    const tokens = zombieTokens(g);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tapped).toBe(true);
  });

  test('blocked, it deals no damage to a player and triggers nothing', () => {
    const g = main(
      (b) => b.battlefield(REAVER),
      (b) => b.battlefield(V33).hand(V22),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: REAVER, seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: { name: V33, seat: 1 }, attacker: { name: REAVER, seat: 0 } },
    ]);
    g.advanceTo('combatDamage');
    settleAll(g);
    g.expect.handSize(1, 1);
    expect(zombieTokens(g)).toHaveLength(0);
  });

  test('"whenever an opponent draws a card, that player loses 1 life": the drawer, only an opponent', () => {
    const g = main(
      (b) => b.battlefield(CRAWLER),
      (b) => b,
    );
    g.advanceTo('draw', { turn: 'next' });
    settleAll(g);
    // It is the opponent's turn: their draw costs them 1 life; my own draw never does.
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });

  test('"whenever an opponent casts a spell, that player loses 1 life": the caster', () => {
    const g = main(
      (b) => b.battlefield(TOTEM).hand(BEARS).battlefield('Forest', { count: 2 }),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    g.act(0).cast(BEARS, { pay: true });
    settleAll(g);
    g.expect.life(0, 20);
    g.expect.life(1, 20);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    settleAll(g);
    g.expect.life(1, 19);
    g.expect.life(0, 17);
  });

  test('"~ deals 3 damage to that player": the player whose spell or ability targeted', () => {
    const g = main(
      (b) => b.battlefield(REGENT).battlefield(ZOMBIE),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    // The opponent bolts my Zombie at instant speed in my turn.
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ name: ZOMBIE, seat: 0 }], pay: true });
    settleAll(g);
    g.expect.life(1, 17);
    g.expect.life(0, 20);
  });
});

describe('"is dealt damage": one trigger for each source, "that much" (CR 120.3, 603.2g)', () => {
  test('Lightning Bolt on it: draw a card', () => {
    const g = main(
      (b) => b.battlefield(RAPTOR),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [RAPTOR], pay: true });
    settleAll(g);
    g.expect.handSize(0, 1);
  });

  test('damage that is prevented entirely triggers nothing (CR 603.2g)', () => {
    const g = main(
      (b) =>
        b.hand('SYNTHETIC Herd Shelter').battlefield('Plains', { count: 2 }).battlefield(RAPTOR),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    g.act(0).cast('SYNTHETIC Herd Shelter', { pay: true });
    settleAll(g);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [RAPTOR], pay: true });
    settleAll(g);
    g.expect.zone(RAPTOR, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('two blockers deal damage to it separately: two triggers, even though it dies', () => {
    const g = main(
      (b) => b.battlefield(RAPTOR),
      (b) => b.battlefield(V22, { count: 2 }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: RAPTOR, seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: { name: V22, seat: 1, nth: 0 }, attacker: RAPTOR },
      { blocker: { name: V22, seat: 1, nth: 1 }, attacker: RAPTOR },
    ]);
    g.advanceTo('combatDamage');
    settleAll(g);
    g.expect.zone(RAPTOR, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('"you gain that much life": the amount of the damage', () => {
    const g = main(
      (b) => b.battlefield(SERAPH),
      (b) => b.hand(BOLT).battlefield('Mountain'),
    );
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [SERAPH], pay: true });
    settleAll(g);
    g.expect.life(0, 23);
  });

  test('"that much" is each source\'s own damage in combat', () => {
    const g = main(
      (b) => b.battlefield(SERAPH),
      (b) => b.battlefield(V22).battlefield(V33),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: SERAPH, seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: V22, attacker: SERAPH },
      { blocker: V33, attacker: SERAPH },
    ]);
    g.advanceTo('combatDamage');
    settleAll(g);
    g.expect.life(0, 25);
  });

  test('"a creature you control is dealt combat damage": not noncombat damage', () => {
    const g = main(
      (b) => b.battlefield(LEDGER).battlefield(V33).hand(BOLT).battlefield('Mountain'),
      (b) => b.battlefield(V22),
    );
    g.act(0).cast({ name: BOLT, nth: 0 }, { targets: [V33], pay: true });
    settleAll(g);
    g.expect.life(0, 20);
  });

  test('combat damage to my creature triggers it, damage to their creature does not', () => {
    const g = main(
      (b) => b.battlefield(LEDGER).battlefield(V33),
      (b) => b.battlefield(V22),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: V33, seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: V22, attacker: V33 }]);
    g.advanceTo('combatDamage');
    settleAll(g);
    // The blocker deals 2 to my attacker: 1 life. My attacker's damage went to their creature: not mine.
    g.expect.life(0, 21);
  });
});

describe('what a card may say', () => {
  function firstFace(card: ReturnType<typeof syntheticCard>) {
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return face;
  }
  const asCard = (name: string, mutate: (face: ReturnType<typeof firstFace>) => unknown) => {
    const base = syntheticCard(name);
    return { ...base, faces: [mutate(firstFace(base))] } as never;
  };
  const messages = (card: never) =>
    validateCard(card)
      .map((i) => i.message)
      .join(' | ');

  test('"that player" needs a trigger with a player: a death trigger has none (a step has one, the active player)', () => {
    const card = asCard(CRAWLER, (face) => ({
      ...face,
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
        },
      ],
    }));
    expect(messages(card)).toMatch(/triggerPlayer/);
  });

  test('"that much" needs a damage trigger', () => {
    const card = asCard(SERAPH, (face) => ({
      ...face,
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'triggerDamage' } },
        },
      ],
    }));
    expect(messages(card)).toMatch(/triggerDamage/);
  });

  test('"at" belongs to an attack trigger', () => {
    const card = asCard(CRAWLER, (face) => ({
      ...face,
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' }, at: 'you' },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      ],
    }));
    expect(messages(card)).toMatch(/at/);
  });
});

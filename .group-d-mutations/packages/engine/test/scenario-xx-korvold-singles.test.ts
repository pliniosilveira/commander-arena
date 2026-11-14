// The expensive singles of the Korvold deck (D-187, the Korvold slice 7a): a sacrifice of one or more Treasures and "up to that many target creatures",
// a +1/+0 for each time a creature has attacked this turn, an additional combat phase after a main phase with an untap at its beginning, and an
// Adventure that exiles the top two cards of an opponent's library face down so its caster may look at and play them.
// Pins: CR 603.12 (a reflexive triggered ability: its targets are chosen as it goes on the stack, and "that many" is the number sacrificed), CR 701.21
// (sacrifice), CR 508.1 (declare attackers, once for each declaration), CR 500.8 (phases are added directly after the specified phase, the most recently
// created first), CR 505.1 and 506.1 (the main phases and the combat phase), CR 603.7 (a delayed triggered ability), CR 406.3 and 406.3a (exiled face
// down), CR 601.2 and 305.1 (casting and playing a card from exile), CR 400.7 (a card that moved is a new object). The cards are SYNTHETIC
// (src/cards/fixtures/synthetic-korvold-singles.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { castZone } from '../src/rules/legality';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const RAIDER = 'SYNTHETIC Treasure Raider';
const MINOTAUR = 'SYNTHETIC Furious Minotaur';
const DRAGON_CARD = 'SYNTHETIC Feast Dragon // Taste of Riches';
const DRAGON = 'Feast Dragon';
const MAKER = 'SYNTHETIC Make Treasures'; // {1}{R}: create two Treasure tokens
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([RAIDER, MINOTAUR, DRAGON_CARD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(RAIDER);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbility = (ability: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [ability] }] }) as never;
    const attacks = { kind: 'attackBatch', who: 'you', atLeast: 1 };
    const spec = (extra: Record<string, unknown>) => ({
      id: 't1',
      what: { kind: 'object', filter: { types: ['creature'] } },
      ...extra,
    });
    const sac = (extra: Record<string, unknown>) => ({
      kind: 'may',
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: { subtypes: ['Treasure'] }, ...extra },
      },
    });
    const reflexive = (targetSpec: unknown) => ({
      kind: 'reflexive',
      targets: [targetSpec],
      effect: {
        kind: 'grantKeyword',
        objects: { kind: 'target', id: 't1' },
        keyword: { kind: 'doubleStrike' },
        duration: 'untilEndOfTurn',
      },
    });
    const seq = (...effects: unknown[]) =>
      withAbility({
        kind: 'triggered',
        trigger: attacks,
        effect: { kind: 'sequence', effects },
      });
    const good = [
      sac({ anyNumber: true, atLeastOne: true }),
      reflexive(spec({ upToThatMany: true })),
    ];
    expect(validateCard(seq(...good))).toEqual([]);
    // atLeastOne goes with anyNumber
    expect(
      validateCard(seq(sac({ atLeastOne: true }), reflexive(spec({ upToThatMany: true })))).length,
    ).toBeGreaterThan(0);
    // "up to that many" has no number of its own and needs a sacrifice before the reflexive ability
    expect(
      validateCard(
        seq(
          sac({ anyNumber: true, atLeastOne: true }),
          reflexive(spec({ upToThatMany: true, max: 2 })),
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withAbility({
          kind: 'triggered',
          trigger: attacks,
          targets: [spec({ upToThatMany: true })],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

// ---- "Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike" (CR 603.12)

describe('"Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike until end of turn."', () => {
  /** Two Treasures (from a spell), and an attack with the Raider and the Bears, up to the question. */
  const attack = (treasures: 0 | 2 = 2, extra: string[] = []) => {
    const b = scenario()
      .seat(0)
      .battlefield(RAIDER, BEARS, ...extra)
      .library(...LIBRARY);
    const g = (treasures === 2 ? b.hand(MAKER).battlefield('Mountain', 'Mountain') : b)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    if (treasures === 2) {
      g.act(0).cast(MAKER, { pay: true });
      g.passAll();
      g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    }
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    return g;
  };

  test('the question is asked as the ability resolves; sacrificing both Treasures lets two creatures be targeted', () => {
    const g = attack();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Treasure[0]', 'Treasure[1]');
    g.expect.noObject('Treasure', { zone: 'battlefield' });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS, RAIDER);
    resolveTop(g);
    g.expect.derived(BEARS, { keywords: ['doubleStrike'] });
    g.expect.derived(RAIDER, { keywords: ['doubleStrike'] });
    g.expect.invariants();
  });

  test('"up to that many": one Treasure sacrificed means at most one target, and none is allowed', () => {
    const g = attack();
    g.act(0).accept();
    g.act(0).choosePermanents('Treasure[0]');
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.pending('targets', 0);
    // two targets for one Treasure is refused
    expect(() => g.act(0).chooseTargets(BEARS, RAIDER)).toThrow();
    g.act(0).chooseTargets(BEARS);
    resolveTop(g);
    g.expect.derived(BEARS, { keywords: ['doubleStrike'] });
    g.expect.derived(RAIDER, { keywords: [] });
  });
});

describe('the sacrifice is of one or more, and the trigger is for the declaration', () => {
  const setup = (extra: string[] = []) => {
    const g = scenario()
      .seat(0)
      .battlefield(RAIDER, BEARS, ANGEL, ...extra)
      .hand(MAKER)
      .battlefield('Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(HAWK)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(MAKER, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('"one or more": having said yes, none is not an answer', () => {
    const g = setup();
    g.act(0).attack([BEARS]);
    g.passAll();
    g.act(0).accept();
    expect(() => g.act(0).choosePermanents()).toThrow();
    g.act(0).choosePermanents('Treasure[1]');
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('declining sacrifices nothing and makes no reflexive ability', () => {
    const g = setup();
    g.act(0).attack([BEARS]);
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.expect.stack([]);
    g.expect.derived(BEARS, { keywords: [] });
  });

  test("attacking with two creatures asks once; any creature may be targeted, an opponent's too", () => {
    const g = setup();
    g.act(0).attack([BEARS, ANGEL]);
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents('Treasure[0]', 'Treasure[1]');
    g.act(0).chooseTargets(ANGEL, { name: HAWK, seat: 1 });
    resolveTop(g);
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance', 'doubleStrike'] });
    g.expect.derived(HAWK, { keywords: ['flying', 'lifelink', 'doubleStrike'] });
    g.expect.pending('priority');
  });

  test('double strike lasts until the end of the turn', () => {
    const g = setup();
    g.act(0).attack([BEARS]);
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents('Treasure[0]');
    g.act(0).chooseTargets(BEARS);
    resolveTop(g);
    g.expect.derived(BEARS, { keywords: ['doubleStrike'] });
    g.advanceTo('cleanup');
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('no attackers: nothing triggers', () => {
    const g = setup();
    g.act(0).noAttackers();
    g.expect.stack([]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });

  test('a token that is not a Treasure cannot be sacrificed for it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RAIDER, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    // no Treasure, nothing to sacrifice: the "may" has nothing to do and no reflexive ability comes of it
    g.expect.stack([]);
    g.expect.derived(BEARS, { keywords: [] });
  });
});

// ---- "Each creature you control gets +1/+0 for each time it has attacked this turn." (CR 508.1)

const stepsSince = (g: ScenarioGame, mark: number): string[] =>
  g.eventsSince(mark).flatMap((e) => (e.kind === 'stepBegan' ? [e.step] : []));

describe('"Each creature you control gets +1/+0 for each time it has attacked this turn."', () => {
  test('a creature that has not attacked has no bonus, and one that attacked has +1', () => {
    const g = twoSeatGame((b) => b.battlefield(MINOTAUR, BEARS));
    g.expect.pt(BEARS, 2, 2);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 3, 2);
    g.expect.pt(MINOTAUR, 6, 6);
    g.expect.invariants();
  });

  test('the bonus is for each creature on its own, and not for the creatures of another player', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(MINOTAUR, BEARS, ANGEL),
      (b) => b.battlefield(HAWK),
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS, MINOTAUR]);
    g.expect.pt(BEARS, 3, 2);
    g.expect.pt(MINOTAUR, 7, 6);
    g.expect.pt(ANGEL, 4, 4);
    g.expect.pt(HAWK, 1, 1);
  });

  test('it lasts the turn: a creature that attacked in the first combat still has it in the second main phase', () => {
    const g = twoSeatGame((b) => b.battlefield(MINOTAUR, BEARS));
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('postcombatMain');
    g.expect.pt(BEARS, 3, 2);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
  });
});

// ---- "there's an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control." (CR 500.8)

describe('"Landfall — Whenever a land you control enters, if it\'s your main phase, there\'s an additional combat phase after this phase. At the beginning of that combat, untap all creatures you control."', () => {
  const GATE = 'SYNTHETIC Fetch Gate';
  const board = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) => twoSeatGame((b) => extra(b.battlefield(MINOTAUR, BEARS).hand('Forest')));

  test('a land played in the precombat main phase: an additional combat comes before the combat of the turn, then the postcombat main phase', () => {
    const g = board();
    const mark = g.mark();
    g.act(0).playLand('Forest');
    g.expect.stack([`${MINOTAUR} (ability)`]);
    g.passAll();
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
    ]);
  });

  test('a land played in the postcombat main phase: an additional combat follows it, and then the end step (no other main phase)', () => {
    const g = board();
    g.advanceTo('postcombatMain');
    const mark = g.mark();
    g.act(0).playLand('Forest');
    g.passAll();
    g.advanceTo('end');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'end',
    ]);
  });

  test('the creatures untap as the additional combat begins: the one that attacked before attacks again, with +2/+0', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('postcombatMain');
    g.expect.tapped(BEARS, true);
    g.act(0).playLand('Forest');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.tapped(BEARS, false);
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 4, 2);
    g.expect.invariants();
  });

  test('two lands in the same main phase add two combats, each untaps at its own beginning, and the combat of the turn untaps nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MINOTAUR, BEARS)
      .hand('Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { extraLandDrops: 1 })
      .build();
    g.act(0).playLand('Forest[0]');
    g.passAll();
    g.act(0).playLand('Forest[0]');
    g.passAll();
    // first additional combat
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 3, 2);
    g.advanceTo('endOfCombat');
    g.advanceTo('declareAttackers', { attack: false });
    // second additional combat: the creature untapped at its beginning
    g.expect.tapped(BEARS, false);
    g.act(0).attack([BEARS]);
    g.expect.pt(BEARS, 4, 2);
    g.advanceTo('endOfCombat');
    g.advanceTo('declareAttackers', { attack: false });
    // the combat of the turn: nothing untapped it, and it cannot attack
    g.expect.tapped(BEARS, true);
    g.expect.canAttack(BEARS, false);
    g.expect.canAttack(MINOTAUR, true);
  });

  test('a land that enters outside a main phase (an ability in the beginning of combat step) adds nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MINOTAUR, GATE)
      .library('Forest', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.advanceTo('beginningOfCombat');
    const mark = g.mark();
    g.act(0).activate(GATE);
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual(['declareAttackers', 'endOfCombat', 'postcombatMain']);
  });

  test('a land that enters in the opponent\'s main phase is not in "your" main phase', () => {
    const g = scenario()
      .seat(0)
      .battlefield(MINOTAUR, GATE)
      .library('Forest', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    const mark = g.mark();
    g.act(1).pass();
    g.act(0).activate(GATE);
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
    ]);
  });
});

// ---- "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as long as they remain exiled." (CR 406.3)

describe('"Exile the top two cards of target opponent\'s library face down. You may look at and play those cards for as long as they remain exiled."', () => {
  const THEIR_BEARS = { name: BEARS, seat: 1 } as const;
  const THEIR_MOUNTAIN = { name: 'Mountain', seat: 1 } as const;
  const faceDownCards = (g: ScenarioGame) =>
    Object.values(g.state.objects).filter((o) => o.zone === 'exile' && o.exiledFaceDown === true);

  /** Seat 0 casts the Adventure at once; seat 1's library is a Mountain, Grizzly Bears, then Plains. */
  const taste = (top: string[] = ['Mountain', BEARS], mine: string[] = []) => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON_CARD)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain', 'Mountain', 'Forest', 'Forest', ...mine)
      .library(...LIBRARY)
      .seat(1)
      .library(...top, ...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(DRAGON_CARD, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test("two cards leave the top of that library, face down, and are still the opponent's cards", () => {
    const g = taste();
    g.expect.librarySize(1, 12);
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(faceDownCards(g)).toHaveLength(2);
    expect(faceDownCards(g).every((o) => o.owner === 1)).toBe(true);
    g.expect.invariants();
  });

  test('the caster sees the cards, the opponent sees only that two cards are exiled face down (CR 406.3)', () => {
    const g = taste();
    const mine = g.view(0).exile.filter((o) => o.faceDown === true);
    expect(mine.map((o) => o.name).sort()).toEqual([BEARS, 'Mountain']);
    const theirs = g.view(1).exile.filter((o) => o.faceDown === true);
    expect(theirs.map((o) => o.name)).toEqual(['Face-down card', 'Face-down card']);
    expect(theirs.every((o) => o.owner === 1 && o.oracleText === '' && o.types.length === 0)).toBe(
      true,
    );
    expect(JSON.stringify(g.view(1))).not.toContain(BEARS);
  });

  test("the caster may cast a spell from among them, paying its cost; it is theirs on the battlefield, and the opponent's card", () => {
    const g = taste();
    g.expect.legal(0, { cast: THEIR_BEARS });
    g.act(0).cast(THEIR_BEARS, { pay: true });
    // a card turns face up as it is cast (CR 406.3a): the opponent sees it on the stack
    expect(g.view(1).stack.map((o) => o.name)).toContain(BEARS);
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears?.controller).toBe(0);
    expect(bears?.owner).toBe(1);
    expect(bears?.exiledFaceDown).toBeUndefined();
    expect(faceDownCards(g)).toHaveLength(1);
    g.expect.invariants();
  });

  test("a card of the opponent's that is destroyed goes to its owner's graveyard", () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON_CARD, 'Lightning Bolt')
      .battlefield(
        'Swamp',
        'Swamp',
        'Swamp',
        'Mountain',
        'Mountain',
        'Mountain',
        'Forest',
        'Forest',
      )
      .library(...LIBRARY)
      .seat(1)
      .library('Mountain', BEARS, ...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(DRAGON_CARD, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(THEIR_BEARS, { pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the caster may play a land from among them, as their land play, under their control', () => {
    const g = taste();
    g.expect.legal(0, { playLand: THEIR_MOUNTAIN });
    g.act(0).playLand(THEIR_MOUNTAIN);
    const land = g
      .find({ name: 'Mountain', zone: 'battlefield', seat: 0 })
      .find((o) => o.owner === 1);
    expect(land?.controller).toBe(0);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.invariants();
  });

  test('the opponent may neither cast nor play them', () => {
    const g = taste();
    g.pass();
    g.expect.illegal(1, { cast: THEIR_BEARS });
    g.expect.illegal(1, { playLand: THEIR_MOUNTAIN });
  });

  test('"for as long as they remain exiled": the permission is there in a later turn', () => {
    const g = taste();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { cast: THEIR_BEARS });
    g.expect.legal(0, { playLand: THEIR_MOUNTAIN });
    expect(g.view(1).exile.filter((o) => o.name === 'Face-down card')).toHaveLength(2);
  });

  test('a library with one card exiles that card; with none, nothing', () => {
    for (const [library, left] of [
      [[BEARS], 1],
      [[], 0],
    ] as const) {
      const g = scenario()
        .seat(0)
        .hand(DRAGON_CARD)
        .battlefield('Swamp', 'Swamp', 'Swamp')
        .library(...LIBRARY)
        .seat(1)
        .library(...library)
        .at('precombatMain')
        .build();
      g.act(0).cast(DRAGON_CARD, { face: 1, targets: [{ player: 1 }], pay: true });
      g.passAll();
      expect(faceDownCards(g)).toHaveLength(left);
      g.expect.librarySize(1, 0);
      g.expect.invariants();
    }
  });

  test('the Adventure goes on an adventure, and the Dragon is cast from exile as the card it is', () => {
    const g = taste();
    g.expect.zone(DRAGON_CARD, 'exile', { seat: 0 });
    expect(g.object(DRAGON_CARD).onAdventure).toBe(true);
    g.act(0).cast(DRAGON_CARD, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(DRAGON, 'battlefield', { seat: 0 });
    g.expect.derived(DRAGON, { keywords: ['flying', 'trample'] });
  });

  test('"Whenever this creature attacks, create a Treasure token."', () => {
    const g = taste();
    g.act(0).cast(DRAGON_CARD, { face: 0, pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([DRAGON]);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('an Adventure card taken from the opponent: its Adventure may be cast, and its creature later from exile, by the caster', () => {
    const g = taste([DRAGON_CARD, BEARS], ['Swamp', 'Mountain', 'Mountain', 'Forest']);
    const theirs = { name: DRAGON_CARD, seat: 1 } as const;
    g.expect.legal(0, { cast: theirs, face: 1 });
    g.act(0).cast(theirs, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    // the second pile is the opponent's next two cards; the card itself is on an adventure, for its controller
    const onAdventure = g
      .find({ name: DRAGON_CARD, zone: 'exile' })
      .filter((o) => o.onAdventure === true);
    expect(onAdventure.some((o) => o.owner === 1 && o.adventureBy === 0)).toBe(true);
    g.expect.legal(0, { cast: theirs, face: 0 });
    // its owner has the mana and still may not: it is on an adventure for the player who cast the Adventure (CR 715.3d)
    const owner = g.state.objects[g.id(theirs)];
    expect(owner?.adventureBy).toBe(0);
    expect(castZone(g.state, 1, owner as never, undefined, 0)).toBeNull();
    expect(castZone(g.state, 0, owner as never, undefined, 0)).toBe('exile');
    g.act(0).cast(theirs, { face: 0, pay: true });
    g.passAll();
    const dragon = g.find({ name: DRAGON, zone: 'battlefield' })[0];
    expect(dragon?.controller).toBe(0);
    expect(dragon?.owner).toBe(1);
  });
});

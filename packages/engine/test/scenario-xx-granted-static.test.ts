// "It gains \"You can't lose the game and your opponents can't win the game.\"" with no duration (D-275): an effect that gives a permanent a static
// ability for the rest of the game, here as the effect of an activated ability whose source was exiled as a cost and that may be activated only
// as a sorcery (The Book of Exalted Deeds).
// Pins: CR 611.2a (a continuous effect from a resolving ability with no stated duration lasts until the end of the game), CR 613.1f (layer 6
// grants an ability, in timestamp order with "loses all abilities"), CR 611.2c (the object it applies to is fixed as the effect begins), CR 113.6
// and 604.1 (a static ability works while its permanent is on the battlefield), CR 104.3b and 704.5a-c (what "can't lose" stops), CR 400.7 (a new
// object after a zone change is not the one the effect applied to), CR 602.5d (an activation that is only as a sorcery), CR 608.2b (a target that
// is illegal as the ability resolves). Cards are SYNTHETIC (src/cards/fixtures/synthetic-book-exalted.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { cannotLoseGame } from '../src/rules/player-protection';
import { scenario } from '../src/testing/index';

const TOME = 'SYNTHETIC Exalted Tome'; // {W}{W}{W},{T}, exile: enlightened counter on target Angel; it gains the protection; sorcery speed
const QUICK = 'SYNTHETIC Quick Tome'; // the same grant at instant speed, no counter
const HALF = 'SYNTHETIC Half Tome'; // "You can't lose the game." only
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const BORROW = 'SYNTHETIC Borrow Creature'; // {1}{R}: gain control of target creature until end of turn
const WIPE = 'SYNTHETIC Mind Wipe'; // {U}: target creature loses all abilities until end of turn
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;
type Game = ReturnType<Builder['build']>;

/** Seat 0 has the Tome (or a sibling), an Angel and three Plains, and 3 life; seat 1 holds an answer of each color it needs. */
const game = (tome = TOME, extra: (b: Builder) => Builder = (b) => b): Game =>
  extra(
    scenario()
      .seat(0)
      .life(3)
      .library(...LIBRARY)
      .battlefield(tome, ANGEL, 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT, MURDER, BORROW, WIPE)
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Island',
        'Island',
        'Swamp',
        'Swamp',
        'Swamp',
      ),
  )
    .at('precombatMain')
    .build();

const hasStatic = (g: Game, card: string, kind: string) =>
  derive(g.state, g.object(card)).abilities.some(
    (a) => a.kind === 'static' && a.static.kind === kind,
  );

const activate = (g: Game, tome = TOME) => {
  g.act(0).activate(tome, { targets: [ANGEL], pay: true });
  g.passAll();
};

/** The opponent, on my turn after I pass, burns me for 3. */
const burnMe = (g: Game) => {
  g.act(0).pass();
  g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
  g.passAll();
};

describe('the cards are valid', () => {
  test.each([TOME, QUICK, HALF])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('the grant of a static ability with no duration (CR 611.2a)', () => {
  test('the Angel has the abilities and the counter, and the source was exiled as a cost', () => {
    const g = game();
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(false);
    g.act(0).activate(TOME, { targets: [ANGEL], pay: true });
    // The cost is paid first: the source is already in exile while the ability is on the stack (CR 602.2b, 601.2h).
    g.expect.zone(TOME, 'exile', { seat: 0 });
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(false);
    g.passAll();
    g.expect.counters(ANGEL, { enlightened: 1 });
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(hasStatic(g, ANGEL, 'opponentsCantWin')).toBe(true);
    expect(cannotLoseGame(g.state, 0)).toBe(true);
    expect(cannotLoseGame(g.state, 1)).toBe(false);
  });

  test('it lasts: through the end of this turn and two more turns', () => {
    const g = game();
    activate(g);
    g.advanceTo('draw', { turn: 'next' });
    g.advanceTo('draw', { turn: 'next' });
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'grantAbility')).toBe(true);
  });

  test('0 life does not lose the game while the Angel is there', () => {
    const g = game();
    activate(g);
    burnMe(g);
    g.expect.life(0, 0);
    g.expect.hasLost(0, false);
  });

  test('without the grant the same damage loses the game (the control case)', () => {
    const g = game();
    burnMe(g);
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test('the protection ends with the Angel: the next state-based action loses (CR 400.7)', () => {
    const g = game();
    activate(g);
    burnMe(g);
    g.expect.hasLost(0, false);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test('an Angel that left is a new object: nothing of what it was given stays on it (CR 400.7)', () => {
    const g = game();
    activate(g);
    const was = g.id(ANGEL);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    expect(g.id(ANGEL)).not.toBe(was);
    expect(g.state.continuousEffects.some((e) => e.objects.includes(g.id(ANGEL)))).toBe(false);
  });

  test('"You can\'t lose the game" alone does not give the other half (SYNTHETIC)', () => {
    const g = game(HALF);
    activate(g, HALF);
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(hasStatic(g, ANGEL, 'opponentsCantWin')).toBe(false);
  });

  test('the instant-speed sibling gives the same abilities and no counter (SYNTHETIC)', () => {
    const g = game(QUICK);
    activate(g, QUICK);
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(hasStatic(g, ANGEL, 'opponentsCantWin')).toBe(true);
    g.expect.counters(ANGEL, {});
  });
});

describe('who it protects: the controller of the permanent that has the ability (CR 113.6)', () => {
  test('an opponent who takes the Angel for a turn is protected, and I am not', () => {
    const g = game();
    activate(g);
    expect(cannotLoseGame(g.state, 0)).toBe(true);
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: [ANGEL], pay: true });
    g.passAll();
    // The effect of the Tome is a layer 6 grant; the control change is layer 2 (CR 613.1b): the grant stays on the object.
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(cannotLoseGame(g.state, 0)).toBe(false);
    expect(cannotLoseGame(g.state, 1)).toBe(true);
  });

  test('the loss of a player who loses the Angel to the opponent is then not stopped', () => {
    const g = game();
    activate(g);
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: [ANGEL], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test('when the control effect ends the protection is mine again', () => {
    const g = game();
    activate(g);
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: [ANGEL], pay: true });
    g.passAll();
    g.advanceTo('draw', { turn: 'next' });
    expect(cannotLoseGame(g.state, 0)).toBe(true);
    expect(cannotLoseGame(g.state, 1)).toBe(false);
  });
});

describe('layer 6 (CR 613.1f, 613.7)', () => {
  test('a creature that loses all abilities afterwards has no protection, and has it again when that ends', () => {
    const g = game();
    activate(g);
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [ANGEL], pay: true });
    g.passAll();
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(false);
    expect(cannotLoseGame(g.state, 0)).toBe(false);
    g.advanceTo('draw', { turn: 'next' });
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(cannotLoseGame(g.state, 0)).toBe(true);
  });

  test('an ability lost before the grant does not stop the grant: it has the later timestamp (CR 613.7)', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [ANGEL], pay: true });
    g.passAll();
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(false);
    activate(g);
    expect(hasStatic(g, ANGEL, 'cantLoseGame')).toBe(true);
    expect(hasStatic(g, ANGEL, 'opponentsCantWin')).toBe(true);
    expect(cannotLoseGame(g.state, 0)).toBe(true);
  });
});

describe('"Activate only as a sorcery" (CR 602.5d)', () => {
  test('legal in my main phase with an empty stack', () => {
    const g = game();
    g.expect.legal(0, { activate: TOME });
  });

  test('illegal in combat, on the opponent’s turn and with a spell on the stack', () => {
    const combat = game();
    combat.advanceTo('beginningOfCombat');
    combat.expect.illegal(0, { activate: TOME });
    const theirs = game();
    theirs.act(0).pass();
    theirs.expect.illegal(0, { activate: TOME });
    const stacked = game();
    stacked.act(0).pass();
    stacked.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    stacked.expect.illegal(0, { activate: TOME });
  });

  test('the instant-speed sibling may be activated in combat (SYNTHETIC)', () => {
    const g = game(QUICK);
    g.advanceTo('beginningOfCombat');
    g.expect.legal(0, { activate: QUICK });
  });
});

describe('the target', () => {
  test('only an Angel can be chosen', () => {
    const g = game(TOME, (b) => b.seat(0).battlefield(BEARS));
    g.act(0).activate(TOME);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(ANGEL))).toBe(true);
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(BEARS))).toBe(false);
  });

  test('without an Angel the ability cannot be activated', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOME, BEARS, 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { activate: TOME });
  });

  test('an Angel that is gone as the ability resolves: nothing is given and the Tome stays exiled (CR 608.2b)', () => {
    const g = game();
    g.act(0).activate(TOME, { targets: [ANGEL], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(TOME, 'exile', { seat: 0 });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'grantAbility')).toEqual([]);
    expect(cannotLoseGame(g.state, 0)).toBe(false);
  });
});

describe('a card may give only what the engine reads', () => {
  const card = (abilities: unknown, duration: unknown = 'permanent') => ({
    ...syntheticCard(QUICK),
    faces: syntheticCard(QUICK).faces.map((f) => ({
      ...f,
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', subtypes: ['Angel'] } },
            },
          ],
          effect: {
            kind: 'grantAbility',
            objects: { kind: 'target', id: 't1' },
            abilities,
            duration,
          },
        },
      ],
    })),
  });

  test('an activated or a triggered ability, a keyword, or nothing is refused', () => {
    for (const abilities of [
      [],
      [{ kind: 'keyword', keyword: { kind: 'flying' } }],
      [{ kind: 'static', static: { kind: 'playerHexproof' } }],
      [{ kind: 'static', static: { kind: 'noMaximumHandSize' } }],
      [
        {
          kind: 'activated',
          cost: [{ kind: 'tap' }],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    ]) {
      expect(
        validateCard(card(abilities) as never).length,
        JSON.stringify(abilities),
      ).toBeGreaterThan(0);
    }
  });

  test('a condition on a given static ability is refused: the engine would drop it silently (D-275)', () => {
    const conditional = [
      {
        kind: 'static',
        static: { kind: 'cantLoseGame' },
        condition: { kind: 'youControl', filter: { subtypes: ['Dragon'] }, atLeast: 1 },
      },
    ];
    expect(validateCard(card(conditional) as never).length).toBeGreaterThan(0);
  });

  test('until end of turn is the engine’s own (Backup), not a card’s', () => {
    const protection = [{ kind: 'static', static: { kind: 'cantLoseGame' } }];
    expect(validateCard(card(protection) as never)).toEqual([]);
    expect(validateCard(card(protection, 'untilEndOfTurn') as never).length).toBeGreaterThan(0);
  });
});

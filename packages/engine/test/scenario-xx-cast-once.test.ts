// "Once during each of your turns, you may cast an enchantment spell by paying life equal to its mana value rather than paying its mana cost." (Demon of Fate's Design), "... a spell
// from your hand by paying life ..." (Access Maze), "... a spell from your hand or the top of your library without paying its mana cost." (One with the Multiverse): the static ability
// `castOnceEachTurn`, and "When you unlock this door, this Room deals 6 damage to target creature an opponent controls. You gain life equal to the excess damage dealt this way."
// (Cramped Vents). Pins: CR 118.9 and 118.9a (one alternative cost, chosen as the spell is cast), CR 601.2b and 601.2f (announced; additional costs and increases are still paid),
// CR 107.3b (X is 0), CR 119.4 (life can be paid only when the life total is at least the payment), CR 307.1 and 304.1 (the timing of the spell's types), CR 400.7 (a permanent that
// came back is a new object with a new use), CR 903.8 (commander tax), CR 305.1 and 601.3 (the top of the library), CR 120.10 and 702.2c (excess damage; deathtouch), CR 709.5 (a
// locked half of a Room gives nothing). All cards are SYNTHETIC (src/cards/fixtures/synthetic-cast-once.ts and others) or basic real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DEMON = 'SYNTHETIC Fate Demon';
const ROOM = 'SYNTHETIC Vent Room // Maze Room';
const PACT = 'SYNTHETIC Multiverse Pact';
const SHRINE = 'SYNTHETIC Plain Shrine'; // {2}{W} enchantment, mana value 3
const X_SHRINE = 'SYNTHETIC X Shrine'; // {X}{B} enchantment
const TOLL = 'SYNTHETIC Toll Shrine'; // {1}{W} enchantment, additional cost: discard a card
const LENDER = 'SYNTHETIC Deathtouch Lender';
const SORCERY = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, draw a card
const INSTANT = 'SYNTHETIC Plot Gain'; // {1}{U} instant, gain 2 life
const X_SPELL = 'SYNTHETIC Jump X Drain'; // {X}{U} sorcery, gain X life
const KICKER = 'SYNTHETIC Kicker Gain'; // {W} instant, kicker {1}: gain 2 life, kicked: draw a card
const BOUNCE = 'SYNTHETIC Door Bounce'; // {U} instant: return target enchantment to its owner's hand
const BEARS = 'Grizzly Bears';
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

const LEADER = 'SYNTHETIC Shrine Leader';
const leader = singleFace({
  name: LEADER,
  manaCost: ['1', 'B'],
  supertypes: ['legendary'],
  types: ['enchantment', 'creature'],
  subtypes: ['Spirit'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'SYNTHETIC fixture: a legendary enchantment creature with no abilities.',
});

type Builder = ReturnType<typeof scenario>;
type Alt = 'lifeForMana' | 'free' | undefined;

function game(
  configure: (b: Builder) => Builder,
  options: {
    pool?: string;
    life?: number;
    active?: 0 | 1;
    step?: Parameters<Builder['at']>[0];
  } = {},
): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .life(options.life ?? 20)
      .pool(options.pool ?? ''),
  )
    .seat(1)
    .library(...FILLER)
    .at(options.step ?? 'precombatMain', { active: options.active ?? 0, turn: 3 })
    .build();
}

/** Whether a cast of the card `name` (in `zone` of seat 0) for `alternative` is among the legal actions of seat 0. */
const listed = (
  g: ScenarioGame,
  name: string,
  alternative: Alt,
  zone: 'hand' | 'library' | 'command' = 'hand',
): boolean => {
  const ids = g.find({ name, zone, seat: 0 }).map((o) => o.id);
  return getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && ids.includes(a.object) && a.alternative === alternative,
  );
};
/** The first card named `name` in `zone` of seat 0 (several copies share a name). */
const first = (name: string, zone: 'hand' | 'library' | 'command' = 'hand') =>
  ({ name, zone, seat: 0, nth: 0 }) as const;
const used = (g: ScenarioGame): number => (g.state.turnLog.oncePerTurnGrants ?? []).length;

describe('the cards are valid', () => {
  test.each([DEMON, ROOM, PACT, SHRINE, X_SHRINE, TOLL, LENDER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('an enchantment spell by paying life equal to its mana value (CR 118.9)', () => {
  test('with no mana the enchantment is cast for 3 life; a spell that is no enchantment is not offered', () => {
    const g = game((b) =>
      b
        .battlefield(DEMON)
        .hand(SHRINE, SORCERY)
        .library(...FILLER),
    );
    expect(listed(g, SHRINE, undefined)).toBe(false);
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(false);
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    g.expect.life(0, 17);
    g.expect.stack([SHRINE]);
    g.passAll();
    g.expect.zone(SHRINE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('once in a turn: the second enchantment is not offered, and it is again in the next turn of the player', () => {
    const g = game((b) =>
      b
        .battlefield(DEMON)
        .hand(SHRINE, SHRINE)
        .library(...FILLER),
    );
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    expect(used(g)).toBe(1);
    g.passAll();
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(false);
    expect(g.act(0).try.cast(first(SHRINE), { alternative: 'lifeForMana' }).ok).toBe(false);
    g.advanceTo('precombatMain', { turn: 'next' }); // the opponent's turn
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(false);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
  });

  test('the ordinary cast is offered beside it, and paying mana does not use the permission', () => {
    const g = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE, SHRINE)
          .library(...FILLER),
      { pool: 'WWW' },
    );
    expect(listed(g, SHRINE, undefined)).toBe(true);
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
    g.act(0).cast(first(SHRINE), { pay: true });
    g.expect.life(0, 20);
    expect(used(g)).toBe(0);
    g.passAll();
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
  });

  test('each permanent gives its own use: two of them are two spells, not three', () => {
    const g = game((b) =>
      b
        .battlefield(DEMON, DEMON)
        .hand(SHRINE, SHRINE, SHRINE)
        .library(...FILLER),
    );
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    g.passAll();
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    g.passAll();
    g.expect.life(0, 14);
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(false);
  });

  test('a permanent that left and came back is a new object with a new use (CR 400.7)', () => {
    const g = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE, SHRINE, BOUNCE)
          .library(...FILLER),
      { pool: 'UBBBBBB' },
    );
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    g.passAll();
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(false);
    g.act(0).cast(BOUNCE, { targets: [DEMON], pay: true });
    g.passAll();
    g.expect.zone(DEMON, 'hand', { seat: 0 });
    g.act(0).cast(DEMON, { pay: true });
    g.passAll();
    g.expect.zone(DEMON, 'battlefield', { seat: 0 });
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(true);
  });

  test('X is 0: no X is asked and only the rest of the mana value is paid (CR 107.3b)', () => {
    const g = game((b) =>
      b
        .battlefield(DEMON)
        .hand(X_SHRINE)
        .library(...FILLER),
    );
    g.act(0).cast(X_SHRINE, { alternative: 'lifeForMana' });
    expect(g.state.pending?.kind).not.toBe('chooseX');
    g.expect.life(0, 19);
    g.expect.stack([X_SHRINE]);
    const top = g.state.stack[0];
    expect(top === undefined ? 0 : (g.state.objects[top]?.stack?.x ?? 0)).toBe(0);
    g.expect.invariants();
  });

  test('life the player does not have cannot be paid; all of it can (CR 119.4)', () => {
    const poor = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE)
          .library(...FILLER),
      { life: 2 },
    );
    expect(listed(poor, SHRINE, 'lifeForMana')).toBe(false);
    expect(poor.act(0).try.cast(first(SHRINE), { alternative: 'lifeForMana' }).ok).toBe(false);
    const exact = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE)
          .library(...FILLER),
      { life: 3 },
    );
    expect(listed(exact, SHRINE, 'lifeForMana')).toBe(true);
  });

  test('a mandatory additional cost is still paid: with no card to discard the spell cannot be cast', () => {
    const alone = game((b) =>
      b
        .battlefield(DEMON)
        .hand(TOLL)
        .library(...FILLER),
    );
    expect(listed(alone, TOLL, 'lifeForMana')).toBe(false);
    const g = game((b) =>
      b
        .battlefield(DEMON)
        .hand(TOLL, 'Island')
        .library(...FILLER),
    );
    expect(listed(g, TOLL, 'lifeForMana')).toBe(true);
    g.act(0).cast(TOLL, { alternative: 'lifeForMana' });
    if (g.state.pending?.kind !== 'priority') g.act(0).chooseCards('Island');
    g.expect.life(0, 18);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.stack([TOLL]);
  });

  test('sorcery timing still applies: not in combat, not in an opponent’s turn', () => {
    const combat = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE)
          .library(...FILLER),
      { step: 'beginningOfCombat' },
    );
    expect(listed(combat, SHRINE, 'lifeForMana')).toBe(false);
    const theirs = game(
      (b) =>
        b
          .battlefield(DEMON)
          .hand(SHRINE)
          .library(...FILLER),
      { active: 1 },
    );
    expect(listed(theirs, SHRINE, 'lifeForMana')).toBe(false);
  });

  test('the permission is its controller’s: an opponent’s Demon gives the player nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(SHRINE)
      .library(...FILLER)
      .seat(1)
      .battlefield(DEMON)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(listed(g, SHRINE, 'lifeForMana')).toBe(false);
  });

  test('a commander is cast from the command zone for life; the commander tax is still paid in mana (CR 903.8, 118.9d)', () => {
    const build = (pool: string) =>
      scenario()
        .seat(0)
        .life(20)
        .define(leader)
        .commander(LEADER, { casts: 1 })
        .battlefield(DEMON)
        .library(...FILLER)
        .pool(pool)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
    expect(listed(build(''), LEADER, 'lifeForMana', 'command')).toBe(false);
    const g = build('BB');
    expect(listed(g, LEADER, 'lifeForMana', 'command')).toBe(true);
    g.act(0).cast(first(LEADER, 'command'), { alternative: 'lifeForMana', pay: true });
    g.expect.life(0, 18);
    g.expect.pool(0, '');
    g.expect.stack([LEADER]);
  });

  test('with no zone named it reaches the top of the library only when another ability lets the card be cast from there', () => {
    const without = game((b) => b.battlefield(DEMON).library(SHRINE, ...FILLER));
    expect(listed(without, SHRINE, 'lifeForMana', 'library')).toBe(false);
    const g = game((b) => b.battlefield(DEMON, PACT).library(SHRINE, ...FILLER));
    expect(listed(g, SHRINE, 'lifeForMana', 'library')).toBe(true);
    g.act(0).cast(first(SHRINE, 'library'), { alternative: 'lifeForMana' });
    g.expect.life(0, 17);
    g.passAll();
    g.expect.zone(SHRINE, 'battlefield', { seat: 0 });
    // The Demon's use is the one spent: the Pact still gives its own.
    expect(listed(g, 'Island', 'free', 'library')).toBe(false); // a land is never cast
    expect(used(g)).toBe(1);
  });
});

describe('a spell from your hand by paying life (the unlocked half of a Room)', () => {
  test('any spell of the hand, at the timing of its type; a locked half gives nothing (CR 709.5)', () => {
    const locked = game((b) =>
      b
        .battlefield(ROOM, { unlocked: [0] })
        .hand(SORCERY)
        .library(...FILLER),
    );
    expect(listed(locked, SORCERY, 'lifeForMana')).toBe(false);
    const g = game((b) =>
      b
        .battlefield(ROOM, { unlocked: [1] })
        .hand(SORCERY, INSTANT)
        .library(...FILLER),
    );
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
    expect(listed(g, INSTANT, 'lifeForMana')).toBe(true);
    g.act(0).cast(first(SORCERY), { alternative: 'lifeForMana' });
    g.expect.life(0, 17);
    g.passAll();
    g.expect.handSize(0, 2); // the instant and the card drawn
    expect(listed(g, INSTANT, 'lifeForMana')).toBe(false);
  });

  test('you follow the timing rules: a sorcery not in combat, an instant yes; nothing in an opponent’s turn', () => {
    const combat = game(
      (b) =>
        b
          .battlefield(ROOM, { unlocked: [1] })
          .hand(SORCERY, INSTANT)
          .library(...FILLER),
      { step: 'beginningOfCombat' },
    );
    expect(listed(combat, SORCERY, 'lifeForMana')).toBe(false);
    expect(listed(combat, INSTANT, 'lifeForMana')).toBe(true);
    const theirs = game(
      (b) =>
        b
          .battlefield(ROOM, { unlocked: [1] })
          .hand(INSTANT)
          .library(...FILLER),
      { active: 1, pool: 'UU' },
    );
    expect(listed(theirs, INSTANT, 'lifeForMana')).toBe(false);
  });

  test('an optional additional cost may be paid, with mana: a kicked spell costs its kicker and the life', () => {
    const g = game(
      (b) =>
        b
          .battlefield(ROOM, { unlocked: [1] })
          .hand(KICKER)
          .library(...FILLER),
      { pool: 'W' },
    );
    g.act(0).cast(KICKER, { alternative: 'lifeForMana', kicked: true, pay: true });
    g.expect.pool(0, '');
    g.expect.life(0, 19);
    g.passAll();
    g.expect.life(0, 21);
    g.expect.handSize(0, 1); // kicked: a card drawn
  });

  test('from the hand only: not the top card of the library another ability lets the player cast', () => {
    const g = game((b) =>
      b
        .battlefield(ROOM, { unlocked: [1] })
        .battlefield(PACT)
        .library(SORCERY, ...FILLER),
    );
    expect(listed(g, SORCERY, 'free', 'library')).toBe(true);
    expect(listed(g, SORCERY, 'lifeForMana', 'library')).toBe(false);
  });

  test('with a narrower permission beside it, the narrower one is used first and the wider one is left', () => {
    const g = game((b) =>
      b
        .battlefield(ROOM, { unlocked: [1] })
        .battlefield(DEMON)
        .hand(SHRINE, SORCERY, INSTANT)
        .library(...FILLER),
    );
    g.act(0).cast(first(SHRINE), { alternative: 'lifeForMana' });
    g.passAll();
    expect(g.state.turnLog.oncePerTurnGrants).toEqual([g.id(DEMON)]);
    expect(listed(g, SORCERY, 'lifeForMana')).toBe(true);
    g.act(0).cast(first(SORCERY), { alternative: 'lifeForMana' });
    g.passAll();
    expect(listed(g, INSTANT, 'lifeForMana')).toBe(false);
    g.expect.life(0, 14);
  });
});

describe('a spell from your hand or the top of your library without paying its mana cost', () => {
  test('from the hand: cast for nothing, once', () => {
    const g = game((b) =>
      b
        .battlefield(PACT)
        .hand(SORCERY, SORCERY)
        .library(...FILLER),
    );
    expect(listed(g, SORCERY, undefined)).toBe(false);
    expect(listed(g, SORCERY, 'free')).toBe(true);
    g.act(0).cast(first(SORCERY), { alternative: 'free' });
    g.expect.life(0, 20);
    g.passAll();
    g.expect.handSize(0, 2);
    expect(listed(g, SORCERY, 'free')).toBe(false);
    g.expect.invariants();
  });

  test('from the top of the library: cast for nothing; the next top card may still be cast for its cost', () => {
    const g = game((b) => b.battlefield(PACT).library(SHRINE, SHRINE, ...FILLER), { pool: 'WWW' });
    expect(listed(g, SHRINE, 'free', 'library')).toBe(true);
    expect(listed(g, SHRINE, undefined, 'library')).toBe(true);
    g.act(0).cast(first(SHRINE, 'library'), { alternative: 'free' });
    g.expect.pool(0, 'WWW');
    g.passAll();
    g.expect.zone(SHRINE, 'battlefield', { seat: 0, count: 1 });
    expect(listed(g, SHRINE, 'free', 'library')).toBe(false);
    expect(listed(g, SHRINE, undefined, 'library')).toBe(true);
    g.act(0).cast(first(SHRINE, 'library'), { pay: true });
    g.passAll();
    g.expect.zone(SHRINE, 'battlefield', { seat: 0, count: 2 });
  });

  test('only the top card, and only of the player’s own library', () => {
    const g = game((b) => b.battlefield(PACT).library('Island', SHRINE, ...FILLER));
    expect(listed(g, SHRINE, 'free', 'library')).toBe(false);
  });

  test('lands are played from the top of the library, as the land play of the turn', () => {
    const g = game((b) => b.battlefield(PACT).library('Island', 'Island', ...FILLER));
    g.expect.legal(0, { playLand: first('Island', 'library') });
    g.act(0).playLand(first('Island', 'library'));
    g.expect.zone('Island', 'battlefield', { seat: 0, count: 1 });
    g.expect.illegal(0, { playLand: first('Island', 'library') });
  });

  test('X is 0 (CR 107.3b), and the timing of the spell is kept', () => {
    const g = game((b) =>
      b
        .battlefield(PACT)
        .hand(X_SPELL)
        .library(...FILLER),
    );
    g.act(0).cast(X_SPELL, { alternative: 'free' });
    expect(g.state.pending?.kind).not.toBe('chooseX');
    g.passAll();
    g.expect.life(0, 20);
    const combat = game(
      (b) =>
        b
          .battlefield(PACT)
          .hand(SORCERY, INSTANT)
          .library(...FILLER),
      { step: 'beginningOfCombat' },
    );
    expect(listed(combat, SORCERY, 'free')).toBe(false);
    expect(listed(combat, INSTANT, 'free')).toBe(true);
    const theirs = game(
      (b) =>
        b
          .battlefield(PACT)
          .hand(INSTANT)
          .library(...FILLER),
      { active: 1 },
    );
    expect(listed(theirs, INSTANT, 'free')).toBe(false);
  });

  test('a mandatory additional cost is still paid', () => {
    const g = game((b) =>
      b
        .battlefield(PACT)
        .hand(TOLL, 'Forest')
        .library(...FILLER),
    );
    g.act(0).cast(TOLL, { alternative: 'free' });
    if (g.state.pending?.kind !== 'priority') g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.stack([TOLL]);
  });

  test('two of them are two spells without paying, one for each', () => {
    const g = game((b) =>
      b
        .battlefield(PACT, PACT)
        .hand(INSTANT, INSTANT, INSTANT)
        .library(...FILLER),
    );
    g.act(0).cast(first(INSTANT), { alternative: 'free' });
    g.passAll();
    g.act(0).cast(first(INSTANT), { alternative: 'free' });
    g.passAll();
    expect(listed(g, INSTANT, 'free')).toBe(false);
    g.expect.life(0, 24);
  });
});

describe('"this Room deals 6 damage to target creature an opponent controls. You gain life equal to the excess damage dealt this way." (three players)', () => {
  const table = (configure: (b: Builder) => Builder): ScenarioGame =>
    configure(
      scenario({ seats: 3 })
        .seat(0)
        .life(20)
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', BEARS)
        .battlefield(ROOM, { unlocked: [1] })
        .library(...FILLER),
    )
      .at('precombatMain', { active: 0, turn: 4 })
      .build();

  test('a creature of either opponent may be the target, never one of the player; 6 damage to a 2/2 is 4 excess', () => {
    const g = table((b) =>
      b
        .seat(1)
        .battlefield(BEARS)
        .library(...FILLER)
        .seat(2)
        .battlefield(BEARS)
        .library(...FILLER),
    );
    g.act(0).unlock(ROOM, 0, { pay: true });
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    const mine = g.find({ name: BEARS, zone: 'battlefield', seat: 0 })[0]?.id;
    const second = g.find({ name: BEARS, zone: 'battlefield', seat: 1 })[0]?.id;
    const third = g.find({ name: BEARS, zone: 'battlefield', seat: 2 })[0]?.id;
    const offered = JSON.stringify(d);
    expect(offered).toContain(`"${second}"`);
    expect(offered).toContain(`"${third}"`);
    expect(offered).not.toContain(`"${mine}"`);
    g.act(0).chooseTargets({ name: BEARS, zone: 'battlefield', seat: 2 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.life(0, 24);
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });

  test('damage already marked on the creature counts: a 6/6 with 2 damage takes 2 excess', () => {
    const g = table((b) =>
      b
        .seat(1)
        .library(...FILLER)
        .seat(2)
        .battlefield(DEMON, { damage: 2 })
        .library(...FILLER),
    );
    g.act(0).unlock(ROOM, 0, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('no excess, no life: 6 damage to a 6/6', () => {
    const g = table((b) =>
      b
        .seat(1)
        .battlefield(DEMON)
        .library(...FILLER)
        .seat(2)
        .library(...FILLER),
    );
    g.act(0).unlock(ROOM, 0, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });

  test('from a source with deathtouch 1 damage is lethal: 5 of the 6 are excess (CR 702.2c, 120.10)', () => {
    const g = table((b) =>
      b
        .battlefield(LENDER)
        .seat(1)
        .battlefield(DEMON)
        .library(...FILLER)
        .seat(2)
        .library(...FILLER),
    );
    g.act(0).unlock(ROOM, 0, { pay: true });
    g.passAll();
    g.expect.life(0, 25);
  });
});

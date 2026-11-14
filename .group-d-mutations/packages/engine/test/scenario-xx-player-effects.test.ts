// Player effects with amounts, one-sided damage and conditions about players (D-131): several players in one selector
// ("you and target opponent each draw"), each player sacrifices N creatures of their choice, what an earlier
// instruction did ("for each creature sacrificed this way", "for each opponent who drew a card this way"), mill, a creature
// that deals damage equal to its power to something (a "bite"), "if you're the monarch" and "if an opponent has more life
// than you".
// Pins: CR 101.4 (players who act or choose at the same time do so in turn order, the active player first), CR 701.21
// (sacrifice: each player chooses among their own permanents, CR 701.21a), CR 701.17 (mill) and CR 121.1 and 121.4 (milling
// is not drawing), CR 120.3 (the damage is the source's: lifelink, deathtouch, wither; not combat damage), CR 701.14 vs the
// bite (no damage back), CR 608.2b (a target that is gone deals or takes nothing; with every target gone the spell is
// countered), CR 113.7a and 608.2h (last-known information), CR 603.4 (an intervening "if" is checked on trigger and on
// resolution), CR 725 (the monarch is a designation), CR 903.10a (only combat damage counts as commander damage).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-player-effects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';
import { apnapOrder } from '../src/rules/select';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const RENDEZVOUS = 'SYNTHETIC Shared Rendezvous'; // you and target opponent each draw two
const FEAST = 'SYNTHETIC Overlapping Feast'; // you and each player each gain 3 life
const SHARED_MILL = 'SYNTHETIC Shared Mill'; // you and target opponent each mill two (instant)
const SHARED_SAC = 'SYNTHETIC Shared Sacrifice'; // you and target opponent each sacrifice a creature (instant)
const DEAL = 'SYNTHETIC Cut a Deal Cousin'; // each opponent draws, then you draw per opponent who drew
const DOUBLE_DEAL = 'SYNTHETIC Double Deal'; // each opponent draws two, then you draw per opponent who drew
const MARAUDER = 'SYNTHETIC Bag Marauder'; // enters: each player sacrifices a creature
const SWEEP = 'SYNTHETIC Necrotic Sweep'; // each player sacrifices two; tapped Zombie per creature sacrificed
const SIPHON = 'SYNTHETIC Siphon Flesh Cousin'; // each opponent sacrifices one; a Zombie per creature sacrificed
const TOLL = 'SYNTHETIC Weighted Toll'; // each opponent sacrifices X creatures, X = your Zombies
const REAPER = 'SYNTHETIC Hydra Reaper'; // enters: destroy all Zombies; a counter per creature destroyed
const MERFOLK = 'SYNTHETIC Mire Merfolk'; // enters: mill two, gain 2
const TIDE = 'SYNTHETIC Tide Mill'; // each player mills X, X = creatures you control
const GNASH = 'SYNTHETIC Gnash Down'; // your creature deals damage equal to its power to their creature or planeswalker
const WATCHER = 'SYNTHETIC Surge Watcher'; // a creature you control enters: it deals damage equal to its power
const SCOURGE = 'SYNTHETIC Dragon Scourge'; // a Dragon enters: it deals X damage, X = Dragons you control
const SELF_STRIKE = 'SYNTHETIC Self Strike'; // target creature deals damage equal to its power to itself
const HOUND = 'SYNTHETIC Lifelink Hound'; // 3/2 lifelink
const VIPER = 'SYNTHETIC Deathtouch Viper'; // 1/1 deathtouch
const IMP = 'SYNTHETIC Wither Imp'; // 2/1 wither
const TYRANT = 'SYNTHETIC Skyline Tyrant'; // upkeep, if you're the monarch: a 4/4 Dragon
const COURT = 'SYNTHETIC Court of Grace Cousin'; // upkeep: a Spirit, or an Angel instead if you're the monarch
const USURPER = 'SYNTHETIC Usurper Scout'; // enters: if an opponent is the monarch, draw
const CLERIC = 'SYNTHETIC Envious Cleric'; // enters: if an opponent has more life than you, gain 4
const PRIEST = 'SYNTHETIC Outnumbered Priest'; // enters: if an opponent controls more creatures, an Angel
const PUMP = 'SYNTHETIC Mighty Pump'; // target creature gets +3/+3 until end of turn
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const ECHO_HOUND = 'SYNTHETIC Echo Hound'; // 3/1
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 1's precombat main with seat 0 holding priority (an instant of seat 0's at the opponent's turn). */
function onTheirTurn(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 1, priority: 0 })
    .build();
}

/** Seat 0 at the upkeep of its turn 3 with the triggers on the stack. */
function toUpkeep(
  place: (b: Builder) => Builder,
  opponent: (b: Builder) => Builder = (b) => b,
  monarch?: 0 | 1,
) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('postcombatMain', { active: 1, turn: 2, ...(monarch === undefined ? {} : { monarch }) })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const tokens = (g: ScenarioGame, name: string, seat = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

describe('several players in one selector (CR 101.4)', () => {
  test('you and target opponent each draw two cards', () => {
    const g = twoSeatGame((b) => b.hand(RENDEZVOUS).battlefield('Island', { count: 3 }));
    g.act(0).cast(RENDEZVOUS, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 2);
  });

  test('the target must be an opponent: the caster is not a legal target', () => {
    const g = twoSeatGame((b) => b.hand(RENDEZVOUS).battlefield('Island', { count: 3 }));
    expect(() => g.act(0).cast(RENDEZVOUS, { targets: [{ player: 0 }], pay: true })).toThrow();
  });

  test('a player named twice acts once', () => {
    const g = twoSeatGame((b) => b.hand(FEAST).battlefield('Plains', { count: 3 }));
    g.act(0).cast(FEAST, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    g.expect.life(1, 23);
  });

  test('each acts in turn order from the active player: the draws on the opponents turn begin with the opponent', () => {
    const g = onTheirTurn((b) =>
      b.hand('SYNTHETIC Shared Mill').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(SHARED_MILL, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const milled = g.events.filter((e) => e.kind === 'milled');
    expect(milled.map((e) => e.seat)).toEqual([1, 0]);
    g.expect.librarySize(0, 4);
    g.expect.librarySize(1, 4);
  });

  test('and from the active player on their own turn', () => {
    const g = twoSeatGame((b) => b.hand(RENDEZVOUS).battlefield('Island', { count: 3 }));
    g.act(0).cast(RENDEZVOUS, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const drawn = g.events.filter((e) => e.kind === 'cardDrawn').map((e) => e.seat);
    expect(drawn).toEqual([0, 0, 1, 1]);
  });

  test('the order of CR 101.4 for any number of seats: the active player first, then turn order', () => {
    const four = { seats: [0, 1, 2, 3].map((id) => ({ id })), turn: { activeSeat: 2 } } as never;
    expect(apnapOrder(four, [0, 3, 1, 2])).toEqual([2, 3, 0, 1]);
    expect(apnapOrder(four, [1, 1, 0])).toEqual([0, 1]);
    const first = { seats: [0, 1, 2, 3].map((id) => ({ id })), turn: { activeSeat: 0 } } as never;
    expect(apnapOrder(first, [3, 2])).toEqual([2, 3]);
  });

  test('each player chooses their own sacrifice, the active player first (CR 101.4, 701.21a)', () => {
    const g = onTheirTurn(
      (b) =>
        b
          .hand(SHARED_SAC)
          .battlefield('Swamp', { count: 2 })
          .battlefield(BEARS)
          .battlefield(SPIDER),
      (b) => b.battlefield(GIANT).battlefield(ELVES),
    );
    g.act(0).cast(SHARED_SAC, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // The opponent is the active player: they choose first.
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(ELVES);
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('"each player sacrifices N creatures of their choice" (CR 701.21)', () => {
  test('each player sacrifices a creature of their choice; a single candidate is chosen for them', () => {
    const g = twoSeatGame(
      (b) => b.hand(MARAUDER).battlefield('Swamp', { count: 4 }).battlefield(BEARS),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(MARAUDER, { pay: true });
    g.passAll();
    // Seat 0 chooses among the Marauder and the Bears; seat 1 has only the Spider and loses it at once.
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(MARAUDER, 'battlefield', { seat: 0 });
  });

  test('a player with no creature sacrifices nothing', () => {
    const g = twoSeatGame((b) => b.hand(MARAUDER).battlefield('Swamp', { count: 4 }));
    g.act(0).cast(MARAUDER, { pay: true });
    g.passAll();
    // The Marauder is the only creature: it is sacrificed.
    g.expect.zone(MARAUDER, 'graveyard', { seat: 0 });
  });

  test('two creatures each; the engine takes all the creatures of a player who has no more than two', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(SWEEP)
          .battlefield('Swamp', { count: 5 })
          .battlefield(BEARS)
          .battlefield(SPIDER)
          .battlefield(GIANT),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    // Seat 0 has three creatures and chooses two; seat 1 has one, which goes.
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    // Three creatures were sacrificed: three tapped Zombies for the caster.
    const zombies = tokens(g, 'Zombie');
    expect(zombies).toHaveLength(3);
    expect(zombies.every((z) => z?.tapped === true)).toBe(true);
    g.expect.zone(GIANT, 'battlefield', { seat: 0 });
  });

  test('"for each creature sacrificed this way" counts only what was sacrificed', () => {
    const g = twoSeatGame((b) => b.hand(SIPHON).battlefield('Swamp', { count: 4 }));
    g.act(0).cast(SIPHON, { pay: true });
    g.passAll();
    expect(tokens(g, 'Zombie')).toHaveLength(0);
    g.expect.invariants();
  });

  test('each other player sacrifices and the controller gets a token for it', () => {
    const g = twoSeatGame(
      (b) => b.hand(SIPHON).battlefield('Swamp', { count: 4 }),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(SIPHON, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    expect(tokens(g, 'Zombie', 0)).toHaveLength(1);
    expect(tokens(g, 'Zombie', 1)).toHaveLength(0);
  });

  test('the number of creatures is an amount, read as the effect runs', () => {
    const g = twoSeatGame(
      (b) => b.hand(TOLL).battlefield('Swamp', { count: 3 }).battlefield(ZOMBIE, { count: 2 }),
      (b) => b.battlefield(BEARS).battlefield(SPIDER).battlefield(GIANT),
    );
    g.act(0).cast(TOLL, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(BEARS, SPIDER);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(GIANT, 'battlefield', { seat: 1 });
  });

  test('X = 0: nobody sacrifices and nothing is asked', () => {
    const g = twoSeatGame(
      (b) => b.hand(TOLL).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(TOLL, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.noEvent({ kind: 'permanentsChosen' });
  });

  test('"for each creature destroyed this way": a counter for each Zombie destroyed, tokens included', () => {
    const g = twoSeatGame(
      (b) =>
        b.hand(REAPER).battlefield('Forest', { count: 4 }).battlefield(ZOMBIE).battlefield(ZOMBIE),
      (b) => b.battlefield(ZOMBIE),
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.expect.counters(REAPER, { '+1/+1': 3 });
    g.expect.pt(REAPER, 5, 5);
  });

  test('nothing destroyed: no counter', () => {
    const g = twoSeatGame((b) => b.hand(REAPER).battlefield('Forest', { count: 4 }));
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.expect.counters(REAPER, {});
  });

  test('"for each opponent who drew a card this way": a card for the one opponent who drew', () => {
    const g = twoSeatGame((b) => b.hand(DEAL).battlefield('Plains', { count: 3 }));
    g.act(0).cast(DEAL, { pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 1);
  });

  test('a player counts once, however many cards they drew this way', () => {
    const g = twoSeatGame((b) => b.hand(DOUBLE_DEAL).battlefield('Plains', { count: 4 }));
    g.act(0).cast(DOUBLE_DEAL, { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 1);
  });

  test('an opponent whose draw was replaced by the command zone did not draw: nothing for you (CR 903.9b, 121.1)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(DEAL)
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library('Isamaru, Hound of Konda', { commander: true })
      .library('Forest', { count: 3 })
      .at('precombatMain')
      .build();
    g.act(0).cast(DEAL, { pay: true });
    g.passAll();
    g.act(1).sendToCommandZone();
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 0);
  });
});

describe('mill (CR 701.17)', () => {
  test('mill two cards and gain 2 life', () => {
    const g = twoSeatGame((b) => b.hand(MERFOLK).battlefield('Island', { count: 3 }));
    g.act(0).cast(MERFOLK, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 4);
    g.expect.life(0, 22);
    const milled = g.events.filter((e) => e.kind === 'milled');
    expect(milled).toHaveLength(1);
    expect(milled[0]?.objects).toHaveLength(2);
    for (const id of milled[0]?.objects ?? []) expect(g.state.objects[id]?.zone).toBe('graveyard');
  });

  test('a library with fewer cards than the number: all of them, and no loss (milling is not drawing, CR 121.4)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(MERFOLK)
      .battlefield('Island', { count: 3 })
      .library('Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(MERFOLK, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 0);
    g.expect.hasLost(0, false);
    g.expect.life(0, 22);
    g.expect.invariants();
  });

  test('an empty library mills nothing and emits no event', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(MERFOLK)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(MERFOLK, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'milled' });
    g.expect.life(0, 22);
  });

  test('each player mills X: the amount is counted once as the effect runs', () => {
    const g = twoSeatGame(
      (b) =>
        b.hand(TIDE).battlefield('Island', { count: 3 }).battlefield(BEARS).battlefield(SPIDER),
      (b) => b.battlefield(GIANT),
    );
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 4);
    g.expect.librarySize(1, 4);
  });

  test('X = 0: nothing is milled', () => {
    const g = twoSeatGame((b) => b.hand(TIDE).battlefield('Island', { count: 3 }));
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 6);
    g.expect.noEvent({ kind: 'milled' });
  });

  test('the cards are milled from the top, one after another', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(MERFOLK)
      .battlefield('Island', { count: 3 })
      .library('Forest', 'Island', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(MERFOLK, { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Mountain', 'library', { seat: 0 });
  });
});

describe('a creature deals damage equal to its power, and takes none back (CR 120.3)', () => {
  test('target creature you control deals damage equal to its power to target creature you do not control', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(GIANT),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH, { targets: [GIANT, SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    // One-sided: the Giant has no damage on it (a fight would have given it 2).
    g.expect.damage(GIANT, 0);
  });

  test('it is not combat damage', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(GIANT),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH, { targets: [GIANT, SPIDER], pay: true });
    g.passAll();
    const damage = g.events.filter((e) => e.kind === 'damageDealt');
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ combat: false, amount: 4, source: g.id(GIANT) });
  });

  test('the damage is dealt by the creature: its lifelink gains its controller life (CR 120.3f)', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(HOUND),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH, { targets: [HOUND, SPIDER], pay: true });
    g.passAll();
    g.expect.damage(SPIDER, 3);
    g.expect.life(0, 23);
  });

  test('deathtouch: one damage from a deathtouch creature is lethal (CR 702.2b)', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(VIPER),
      (b) => b.battlefield(GIANT),
    );
    g.act(0).cast(GNASH, { targets: [VIPER, GIANT], pay: true });
    g.passAll();
    g.expect.zone(GIANT, 'graveyard', { seat: 1 });
  });

  test('wither: -1/-1 counters instead of damage (CR 702.80a)', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(IMP),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH, { targets: [IMP, SPIDER], pay: true });
    g.passAll();
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.damage(SPIDER, 0);
  });

  test('damage to a planeswalker removes loyalty counters (CR 120.3c)', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH).battlefield('Forest', { count: 2 }).battlefield(GIANT),
      (b) => b.battlefield(WALKER, { counters: { loyalty: 6 } }),
    );
    g.act(0).cast(GNASH, { targets: [GIANT, WALKER], pay: true });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 2 });
  });

  test('the power is read as the spell resolves, with everything that has happened since it was cast', () => {
    const g = twoSeatGame(
      (b) => b.hand(GNASH, PUMP).battlefield('Forest', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(GIANT),
    );
    g.act(0).cast(GNASH, { targets: [BEARS, GIANT], pay: true });
    g.act(0).cast(PUMP, { targets: [BEARS], pay: true });
    g.passAll();
    // 2 + 3 = 5 damage to the 4/4.
    g.expect.zone(GIANT, 'graveyard', { seat: 1 });
  });

  test('your creature left in response: it is no longer a legal target, so no damage is dealt (CR 608.2b)', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(GNASH, 'Lightning Bolt')
          .battlefield('Forest', { count: 2 })
          .battlefield('Mountain')
          .battlefield(ECHO_HOUND),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH, { targets: [ECHO_HOUND, SPIDER], pay: true });
    g.act(0).cast('Lightning Bolt', { targets: [ECHO_HOUND], pay: true });
    g.passAll();
    g.expect.zone(ECHO_HOUND, 'graveyard', { seat: 0 });
    g.expect.damage(SPIDER, 0);
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });

  test('their creature left in response: your creature deals damage to nothing', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(GNASH, 'Lightning Bolt')
          .battlefield('Forest', { count: 2 })
          .battlefield('Mountain')
          .battlefield(GIANT),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(GNASH, { targets: [GIANT, ELVES], pay: true });
    g.act(0).cast('Lightning Bolt', { targets: [ELVES], pay: true });
    g.passAll();
    g.expect.damage(GIANT, 0);
  });

  test('the creature may be its own recipient', () => {
    const g = twoSeatGame((b) => b.hand(SELF_STRIKE).battlefield('Mountain').battlefield(GIANT));
    g.act(0).cast(SELF_STRIKE, { targets: [GIANT], pay: true });
    g.passAll();
    g.expect.zone(GIANT, 'graveyard', { seat: 0 });
  });

  test('"it deals damage equal to its power to any target": the creature that entered is the source', () => {
    const g = twoSeatGame(
      (b) => b.hand(GIANT).battlefield(WATCHER).battlefield('Forest', { count: 4 }),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('last-known information: the creature that entered died in response and still dealt its power (CR 608.2h)', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(ECHO_HOUND, 'Lightning Bolt')
        .battlefield(WATCHER)
        .battlefield('Mountain', { count: 4 }),
    );
    g.act(0).cast(ECHO_HOUND, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).cast('Lightning Bolt', { targets: [ECHO_HOUND], pay: true });
    g.passAll();
    g.expect.zone(ECHO_HOUND, 'graveyard', { seat: 0 });
    g.expect.life(1, 17);
  });

  test('not combat damage, so a commander that bites a player adds nothing to commander damage (CR 903.10a)', () => {
    const g = twoSeatGame((b) =>
      b.commander(GIANT).battlefield(WATCHER).battlefield('Forest', { count: 4 }),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 16);
    g.expect.commanderDamage(1, GIANT, 0);
  });

  test('X damage where X is the number of Dragons you control, by the Dragon that entered', () => {
    const g = twoSeatGame(
      (b) => b.hand(SCOURGE).battlefield('Mountain', { count: 6 }),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(SCOURGE, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 19);
  });
});

describe('"if you\'re the monarch" and other conditions about players (CR 725, 603.4)', () => {
  test('an intervening "if" with the designation: the monarch gets the Dragon', () => {
    const g = toUpkeep(
      (b) => b.battlefield(TYRANT),
      (b) => b,
      0,
    );
    g.expect.stack([`${TYRANT} (ability)`]);
    resolveTop(g);
    expect(tokens(g, 'Dragon')).toHaveLength(1);
  });

  test('not the monarch: the ability does not trigger at all', () => {
    const g = toUpkeep((b) => b.battlefield(TYRANT));
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('an opponent is the monarch: it does not trigger either', () => {
    const g = toUpkeep(
      (b) => b.battlefield(TYRANT),
      (b) => b,
      1,
    );
    g.expect.stack([]);
  });

  test('checked again as it resolves: the designation was lost in response, so nothing is created', () => {
    const g = toUpkeep(
      (b) => b.battlefield(TYRANT),
      (b) => b.hand('SYNTHETIC Crown Flash').battlefield('Island', { count: 2 }),
      0,
    );
    g.expect.stack([`${TYRANT} (ability)`]);
    g.pass(0);
    g.act(1).cast('SYNTHETIC Crown Flash', { pay: true });
    g.passAll();
    g.expect.monarch(1);
    expect(tokens(g, 'Dragon')).toHaveLength(0);
  });

  test('"if you\'re the monarch ... instead": an Angel for the monarch, a Spirit otherwise', () => {
    const monarch = toUpkeep(
      (b) => b.battlefield(COURT),
      (b) => b,
      0,
    );
    resolveTop(monarch);
    expect(tokens(monarch, 'Angel')).toHaveLength(1);
    expect(tokens(monarch, 'Spirit')).toHaveLength(0);
    const plain = toUpkeep((b) => b.battlefield(COURT));
    resolveTop(plain);
    expect(tokens(plain, 'Spirit')).toHaveLength(1);
    expect(tokens(plain, 'Angel')).toHaveLength(0);
  });

  test('"an opponent is the monarch" is the selector each opponent', () => {
    const yes = twoSeatGame((b) => b.hand(USURPER).battlefield('Island', { count: 2 }));
    expect(yes.state.monarch).toBeNull();
    yes.act(0).cast(USURPER, { pay: true });
    yes.passAll();
    yes.expect.handSize(0, 0);
    const theirs = scenario()
      .seat(0)
      .hand(USURPER)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { monarch: 1 })
      .build();
    theirs.act(0).cast(USURPER, { pay: true });
    theirs.passAll();
    theirs.passAll();
    theirs.expect.handSize(0, 1);
  });

  test('you are the monarch: "an opponent is the monarch" is false', () => {
    const g = scenario()
      .seat(0)
      .hand(USURPER)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { monarch: 0 })
      .build();
    g.act(0).cast(USURPER, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('"if an opponent has more life than you": more, equal, fewer', () => {
    const run = (mine: number, theirs: number) => {
      const g = scenario()
        .seat(0)
        .life(mine)
        .hand(CLERIC)
        .battlefield('Plains', { count: 3 })
        .library(...FILLER)
        .seat(1)
        .life(theirs)
        .library(...FILLER)
        .at('precombatMain')
        .build();
      g.act(0).cast(CLERIC, { pay: true });
      g.pass();
      g.pass();
      return g;
    };
    const more = run(10, 11);
    more.expect.stack([`${CLERIC} (ability)`]);
    more.pass();
    more.pass();
    more.expect.life(0, 14);
    run(10, 10).expect.stack([]);
    run(10, 9).expect.stack([]);
  });

  test('"if an opponent controls more creatures than you": the Priest counts as one of yours', () => {
    const g = twoSeatGame(
      (b) => b.hand(PRIEST).battlefield('Plains', { count: 4 }),
      (b) => b.battlefield(BEARS).battlefield(SPIDER),
    );
    g.act(0).cast(PRIEST, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${PRIEST} (ability)`]);
    g.pass();
    g.pass();
    expect(tokens(g, 'Angel')).toHaveLength(1);
    const level = twoSeatGame(
      (b) => b.hand(PRIEST).battlefield('Plains', { count: 4 }),
      (b) => b.battlefield(BEARS),
    );
    level.act(0).cast(PRIEST, { pay: true });
    level.pass();
    level.pass();
    level.expect.stack([]);
  });
});

describe('what the validator and the feature list say', () => {
  const reasons = (card: never) => validateCard(card).map((i) => i.message);
  const stub = (effect: unknown, targets?: unknown) => {
    const base = syntheticCard(RENDEZVOUS);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...base,
      faces: [{ ...face, spell: { ...(targets === undefined ? {} : { targets }), effect } }],
    } as never;
  };

  test('everything of the slice is listed as supported', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('mill');
    expect(isFeatureSupported('effect:mill')).toBe(true);
    expect(isFeatureSupported('amount:thisWay')).toBe(true);
    expect(isFeatureSupported('selector:all')).toBe(true);
    expect(isFeatureSupported('selector:damageSource')).toBe(true);
    expect(isFeatureSupported('condition:playerHasDesignation')).toBe(true);
  });

  test('every card of the slice is valid and supported', () => {
    for (const name of [
      RENDEZVOUS,
      FEAST,
      SHARED_MILL,
      SHARED_SAC,
      DEAL,
      MARAUDER,
      SWEEP,
      SIPHON,
      TOLL,
      REAPER,
      MERFOLK,
      TIDE,
      GNASH,
      WATCHER,
      SCOURGE,
      SELF_STRIKE,
      TYRANT,
      COURT,
      USURPER,
      CLERIC,
      PRIEST,
    ]) {
      const card = syntheticCard(name);
      expect(validateCard(card), name).toEqual([]);
      expect(card.support).toBe('supported');
    }
  });

  test('a list of players needs two members and does not nest', () => {
    expect(
      reasons(stub({ kind: 'draw', player: { kind: 'all', of: [{ kind: 'you' }] }, count: 1 })),
    ).toEqual([expect.stringContaining('at least two')]);
    expect(
      reasons(
        stub({
          kind: 'draw',
          player: {
            kind: 'all',
            of: [{ kind: 'you' }, { kind: 'all', of: [{ kind: 'you' }, { kind: 'eachOpponent' }] }],
          },
          count: 1,
        }),
      ),
    ).toEqual([expect.stringContaining('does not nest')]);
  });

  test('only one player can become the monarch, so a list of players is refused there', () => {
    expect(
      reasons(
        stub({
          kind: 'becomeMonarch',
          player: { kind: 'all', of: [{ kind: 'you' }, { kind: 'eachOpponent' }] },
        }),
      ),
    ).toEqual([expect.stringContaining('only one player')]);
  });

  test('scry and surveil are the controllers alone, whatever the selector', () => {
    expect(
      reasons(
        stub({
          kind: 'scry',
          player: { kind: 'all', of: [{ kind: 'you' }, { kind: 'eachOpponent' }] },
          count: 1,
        }),
      ),
    ).toEqual([expect.stringContaining('only the controller')]);
  });

  test('a designation condition names players without a target and only a known designation', () => {
    const when = (condition: unknown) =>
      stub({
        kind: 'conditional',
        condition,
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      });
    expect(
      reasons(
        when({
          kind: 'playerHasDesignation',
          player: { kind: 'target', id: 't1' },
          designation: 'monarch',
        }),
      ),
    ).toEqual([expect.stringContaining('names its players')]);
    expect(
      reasons(
        when({ kind: 'playerHasDesignation', player: { kind: 'you' }, designation: 'initiative' }),
      ),
    ).toEqual([expect.stringContaining('unknown designation')]);
    expect(
      reasons(
        when({
          kind: 'playerHasDesignation',
          player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
          designation: 'monarch',
        }),
      ),
    ).toEqual([expect.stringContaining('not of a target or the trigger subject')]);
  });

  test('"this way" needs the effect it counts before it in the same sequence', () => {
    const lonely = stub({
      kind: 'draw',
      player: { kind: 'you' },
      count: { kind: 'thisWay', what: 'sacrificed' },
    });
    expect(reasons(lonely)).toEqual([expect.stringContaining('needs a sacrifice effect')]);
    const wrongKind = stub({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'thisWay', what: 'destroyed' },
        },
      ],
    });
    expect(reasons(wrongKind)).toEqual([expect.stringContaining('needs a destroy effect')]);
    const conditional = stub({
      kind: 'sequence',
      effects: [
        {
          kind: 'conditional',
          condition: { kind: 'controlCommander' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
        {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'thisWay', what: 'playersDrew' },
        },
      ],
    });
    // A conditional may not run, so it does not give "this way" something to count.
    expect(reasons(conditional)).toEqual([expect.stringContaining('needs a draw effect')]);
  });

  test('damage is dealt by a target creature, this permanent or the trigger subject: not a spell or an "each"', () => {
    const damage = (from: unknown) =>
      stub({ kind: 'dealDamage', from, amount: 1, to: { kind: 'you' } });
    expect(reasons(damage({ kind: 'thisSpell' }))).toEqual([
      expect.stringContaining('damage is dealt by'),
    ]);
    expect(reasons(damage({ kind: 'each', filter: {} }))).toEqual([
      expect.stringContaining('damage is dealt by'),
    ]);
    expect(reasons(damage({ kind: 'target', id: 'nope' }))).toEqual([
      expect.stringContaining('not declared'),
    ]);
    expect(reasons(damage({ kind: 'triggerSubject' }))).toEqual([
      expect.stringContaining('triggerSubject'),
    ]);
  });

  test('the number of creatures to sacrifice is a positive number or an amount', () => {
    const sacrifice = (count: unknown) =>
      stub({
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: {}, count },
        player: { kind: 'eachPlayer' },
      });
    expect(reasons(sacrifice(0))).toEqual([expect.stringContaining('positive integer')]);
    expect(reasons(sacrifice({ kind: 'x' }))).toEqual([expect.stringContaining('X is used')]);
    expect(reasons(sacrifice({ kind: 'countOf', filter: { types: ['creature'] } }))).toEqual([]);
  });

  test('mill needs a player selector and an amount', () => {
    expect(
      reasons(stub({ kind: 'mill', player: { kind: 'target', id: 'none' }, count: 2 })),
    ).toEqual([expect.stringContaining('not declared')]);
    expect(reasons(stub({ kind: 'mill', player: { kind: 'you' }, count: -1 }))).toEqual([
      expect.stringContaining('non-negative'),
    ]);
  });
});

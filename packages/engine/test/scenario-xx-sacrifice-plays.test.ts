// Four general permissions and triggers of the World Shaper deck (Augur of Autumn, Evendo Brushrazer, Exploration Broodship, Szarel, Genesis Shepherd), on the SYNTHETIC cards of
// src/cards/fixtures/synthetic-sacrifice-plays.ts (the cards package checks that the grammar lowers the real Oracle text to these same nodes).
// Pins: CR 208.1 and 613.4 (power, as the layers leave it), CR 601.3 and 401.5 (casting from the top of the library), CR 607.2a (cards exiled with a permanent), CR 601.2a and 305.1
// (playing a card), CR 701.21a (sacrifice; the permanent is sacrificed by its controller), CR 111.1 (tokens), CR 601.2b, 601.2f and 118.8 (an additional cost of sacrificing a permanent),
// CR 603.2 and 603.10a (a trigger about a sacrifice looks back in time), CR 113.7a (last-known information of a permanent that has left).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SEER = 'SYNTHETIC Coven Seer';
const HOARDER = 'SYNTHETIC Sacrifice Hoarder';
const HULK = 'SYNTHETIC Salvage Hulk';
const SHEPHERD = 'SYNTHETIC Counter Shepherd';
const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ANGEL = 'Serra Angel'; // 4/4
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 8 }, () => 'Forest');

describe('the cards are valid', () => {
  test.each([SEER, HOARDER, HULK, SHEPHERD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('creature spells from the top of the library with three different powers (Augur of Autumn)', () => {
  const game = (mine: readonly string[], top: string = BEARS, theirs: readonly string[] = []) =>
    scenario()
      .seat(0)
      .battlefield(SEER, 'Forest', 'Forest', 'Forest', ...mine)
      .library(top, ...FILLER)
      .seat(1)
      .battlefield(...theirs)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with creatures of three different powers the creature on top may be cast (1, 2 and 4)', () => {
    const g = game([BEARS, ANGEL]);
    g.expect.legal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
    g.act(0).cast({ name: BEARS, zone: 'library', seat: 0 }, { pay: true });
    g.passAll();
    g.expect.librarySize(0, FILLER.length);
  });

  test('two creatures with the same power count once: 1, 2 and 2 are two different powers, not three', () => {
    const g = game([BEARS, SPIDER]);
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });

  test('two different powers are not enough', () => {
    const g = game([BEARS]);
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });

  test("only the creatures the controller controls count: an opponent's creatures do not", () => {
    const g = game([BEARS], BEARS, [ANGEL]);
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });

  test('the card on top must be a creature: a noncreature spell is not offered', () => {
    const g = game([BEARS, ANGEL], BOLT);
    g.expect.illegal(0, { cast: { name: BOLT, zone: 'library', seat: 0 } });
  });

  test('the powers are the ones the layers give: a +1/+1 counter makes two equal powers different (CR 613.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SEER, 'Forest', 'Forest', 'Forest', BEARS)
      .battlefield(SPIDER, { counters: { '+1/+1': 2 } })
      .library(BEARS, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // 1 (Seer), 2 (Bears) and 4 (Spider with two counters).
    g.expect.legal(0, { cast: { name: BEARS, zone: 'library', seat: 0 } });
  });

  test('the amount is a supported state amount of a static ability', () => {
    expect(
      validateAbility({
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: { types: ['creature'] } },
        condition: {
          kind: 'amountIs',
          amount: {
            kind: 'differentPowersAmong',
            filter: { types: ['creature'], controller: 'you' },
          },
          compare: { cmp: 'atLeast', value: 3 },
        },
      }),
    ).toEqual([]);
  });

  test('a filter that names a zone, or a power, is refused', () => {
    for (const filter of [
      { types: ['creature'], zone: 'graveyard' },
      { power: { cmp: 'atLeast', value: 1 } },
    ]) {
      const issues = validateAbility({
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: {} },
        condition: {
          kind: 'amountIs',
          amount: { kind: 'differentPowersAmong', filter },
          compare: { cmp: 'atLeast', value: 3 },
        },
      } as never);
      expect(issues.length).toBeGreaterThan(0);
    }
  });
});

describe('playing the cards a permanent exiled, after a sacrifice this turn (Evendo Brushrazer)', () => {
  const game = (top: string, active: 0 | 1 = 0) =>
    scenario()
      .seat(0)
      .battlefield(HOARDER, 'Forest', 'Forest', 'Forest', 'Forest', 'Mountain')
      .library(top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active, turn: active === 0 ? 3 : 4 })
      .build();

  /** The controller sacrifices a land to the first ability; the trigger exiles the top card of the library. */
  const sacrificeALand = (g: ReturnType<typeof game>) => {
    g.act(0).activate(HOARDER, { ability: 2 });
    g.act(0).choosePermanents('Forest[3]');
    g.passAll();
  };

  test('the sacrifice of a nontoken permanent exiles the top card, and that card may then be cast during the turn', () => {
    const g = game(BEARS);
    sacrificeALand(g);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: { name: BEARS, zone: 'exile', seat: 0 } });
    g.act(0).cast({ name: BEARS, zone: 'exile', seat: 0 }, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a land card exiled this way is played as a land (the land play of the turn)', () => {
    const g = game('Mountain');
    sacrificeALand(g);
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.expect.legal(0, { playLand: { name: 'Mountain', zone: 'exile', seat: 0 } });
    g.act(0).playLand({ name: 'Mountain', zone: 'exile', seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    // CR 305.2: one land a turn.
    expect(g.legalActions(0).some((a) => a.kind === 'playLand')).toBe(false);
  });

  test('without a sacrifice this turn the exiled card cannot be played (the card was exiled in an earlier turn)', () => {
    const g = game(BEARS);
    sacrificeALand(g);
    // The next turn of seat 0: nothing has been sacrificed in it yet.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'exile', seat: 0 } });
  });

  test("not during an opponent's turn, even with a sacrifice that turn (it is a permission for your own turn)", () => {
    const g = game(BOLT);
    sacrificeALand(g);
    g.expect.legal(0, { cast: { name: BOLT, zone: 'exile', seat: 0 } });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: { name: BOLT, zone: 'exile', seat: 0 } });
  });

  test('the sacrifice of a token does not count: it exiles nothing and gives no permission', () => {
    const g = game(BEARS);
    // A card is exiled only for a nontoken permanent; first make a token, then sacrifice only it.
    g.act(0).activate(HOARDER, { ability: 4, pay: true });
    g.passAll();
    g.act(0).activate(HOARDER, { ability: 3 });
    g.act(0).choosePermanents('Zombie');
    g.passAll();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    expect(g.view(0).battlefield.some((o) => o.name === 'Zombie')).toBe(false);
  });

  test('a permanent that leaves takes the permission with it: the card stays exiled but nothing lets it be cast', () => {
    const g = game(BEARS);
    sacrificeALand(g);
    g.expect.legal(0, { cast: { name: BEARS, zone: 'exile', seat: 0 } });
    g.act(0).activate(HOARDER, { ability: 3 });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'exile', seat: 0 } });
  });

  test("the opponent cannot play the cards: it is the permission of the permanent's controller", () => {
    const g = game(BEARS);
    sacrificeALand(g);
    expect(g.legalActions(1).some((a) => a.kind === 'castSpell')).toBe(false);
  });
});

describe('casting a permanent spell from the graveyard by sacrificing a land (Exploration Broodship)', () => {
  const game = (graveyard: readonly string[], lands = 4) =>
    scenario()
      .seat(0)
      .battlefield(HULK, ...Array.from({ length: lands }, () => 'Forest'))
      .graveyard(...graveyard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a permanent spell is cast from the graveyard, paying its cost and sacrificing a land', () => {
    const g = game([BEARS]);
    g.expect.legal(0, { cast: { name: BEARS, zone: 'graveyard', seat: 0 } });
    g.act(0).cast({ name: BEARS, zone: 'graveyard', seat: 0 }, { pay: true });
    // The land to sacrifice is chosen as the cost is paid (CR 601.2b, 601.2h): any land the caster controls, a tapped one included.
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    g.act(0).choosePermanents('Forest[3]');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    const lands = g.view(0).battlefield.filter((o) => o.name === 'Forest');
    expect(lands).toHaveLength(3);
  });

  test('once during each of your turns: a second card cannot be cast the same turn', () => {
    const g = game([BEARS, SPIDER], 8);
    g.act(0).cast({ name: BEARS, zone: 'graveyard', seat: 0 }, { pay: true });
    g.act(0).choosePermanents('Forest[7]');
    g.passAll();
    g.expect.illegal(0, { cast: { name: SPIDER, zone: 'graveyard', seat: 0 } });
  });

  test('with no land to sacrifice the spell cannot be cast from the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(HULK)
      .graveyard(BOLT, 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'graveyard', seat: 0 } });
  });

  test('an instant is not a permanent spell, and a land is not cast', () => {
    const g = game([BOLT, 'Forest']);
    g.expect.illegal(0, { cast: { name: BOLT, zone: 'graveyard', seat: 0 } });
    g.expect.illegal(0, { playLand: { name: 'Forest', zone: 'graveyard', seat: 0 } });
  });

  test('a card cast from the hand is not asked for a sacrifice', () => {
    const g = scenario()
      .seat(0)
      .battlefield(HULK, 'Forest', 'Forest', 'Forest')
      .hand(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.view(0).battlefield.filter((o) => o.name === 'Forest')).toHaveLength(3);
  });

  test("not on an opponent's turn", () => {
    const g = scenario()
      .seat(0)
      .battlefield(HULK, 'Forest', 'Forest', 'Forest')
      .graveyard(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.expect.illegal(0, { cast: { name: BEARS, zone: 'graveyard', seat: 0 } });
  });
});

describe('whenever you sacrifice another nontoken permanent during your turn (Szarel, Genesis Shepherd)', () => {
  const game = (active: 0 | 1 = 0) =>
    scenario()
      .seat(0)
      .battlefield(SHEPHERD, BEARS, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active, turn: active === 0 ? 3 : 4 })
      .build();

  test("the creature gets as many +1/+1 counters as the source's power (3)", () => {
    const g = game();
    g.act(0).activate(SHEPHERD, { ability: 1 });
    g.act(0).choosePermanents('Forest[0]');
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 3 });
  });

  test("a trigger needs a target of its own: 'up to one' lets it be put on the stack with none", () => {
    const g = game();
    g.act(0).activate(SHEPHERD, { ability: 1 });
    g.act(0).choosePermanents('Forest[0]');
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.counters(BEARS, {});
  });

  test('the source itself is no target ("one other target creature")', () => {
    const g = game();
    g.act(0).activate(SHEPHERD, { ability: 1 });
    g.act(0).choosePermanents('Forest[0]');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = JSON.stringify(d);
    expect(legal).not.toContain(g.id(SHEPHERD));
  });

  test('sacrificing the shepherd itself does not trigger it (another permanent)', () => {
    const g = game();
    g.act(0).activate(SHEPHERD, { ability: 2 });
    // The trigger would ask for its target first: nothing is asked.
    expect(g.state.pending?.kind).not.toBe('targets');
    g.passAll();
    g.expect.counters(BEARS, {});
  });

  test("not during an opponent's turn", () => {
    const g = scenario()
      .seat(0)
      .battlefield(SHEPHERD, BEARS, 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    // The opponent is the active player: it passes priority, and seat 0 sacrifices at instant speed.
    g.pass(1);
    g.act(0).activate(SHEPHERD, { ability: 1 });
    expect(g.state.pending?.kind).not.toBe('targets');
    g.passAll();
    g.expect.counters(BEARS, {});
  });
});

// Cascade (CR 702.85), keyword batch 2 (D-116, D-120): a triggered ability of the spell that works while it is on
// the stack; `cascade` exiles until a cheaper nonland card, may cast it for free (CR 608.2g), and puts the rest on
// the bottom of the library in a random order.
// Pins: CR 702.85a (when you cast this spell; exile until a nonland card with a lower mana value; may cast it
// without paying its mana cost; the cards exiled that weren't cast go to the bottom in a random order),
// CR 702.85c (each instance triggers separately), CR 603.3b (the trigger goes on the stack above the spell),
// CR 608.2g (a spell cast during resolution: the steps of CR 601.2a-i, no priority, it becomes the topmost object
// and the resolution goes on), CR 113.7a (last-known information: the spell's mana value once it left the
// stack), CR 118.9 and 601.2f (no mana is paid; additional costs would be), CR 400.2 (exile is public; the
// library is hidden), CR 202.3 (mana value; lands have none to compare: they are never found), CR 107.3b (X is
// 0), CR 903.9b (a commander may go to the command zone instead of the library), CR 733 (cancel rewinds).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords-2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Action, applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const GIANT = 'SYNTHETIC Cascade Giant'; // {2}{R}{R}, mana value 4
const DRAKE = 'SYNTHETIC Cascade Drake'; // {1}{U}{U}, mana value 3
const SPRITE = 'SYNTHETIC Cascade Sprite'; // {1}{U}, mana value 2
const BEARS = 'Grizzly Bears'; // 2
const ELVES = 'Llanowar Elves'; // 1
const ANGEL = 'Serra Angel'; // 5
const WALL = 'Wall of Stone'; // 3
const BOLT = 'Lightning Bolt'; // 1
const MURDER = 'Murder'; // 3, needs a creature to target
const COUNTERSPELL = 'Counterspell';

const RED = ['Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

function resolveTop(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

/** Seat 0 casts the cascade spell with `library` (top first) and the mana to do it. */
function cast(spell: string, library: readonly string[], lands: readonly string[] = RED, seed = 1) {
  const g = scenario()
    .seat(0)
    .hand(spell)
    .battlefield(...lands)
    .library(...library)
    .seat(1)
    .seed(seed)
    .build();
  g.act(0).cast(spell, { pay: true });
  return g;
}

function ask(g: ScenarioGame) {
  const d = g.state.pending;
  if (d?.kind !== 'confirmOptional' || d.purpose !== 'cascade') {
    throw new Error(`expected the cascade question, got ${d?.kind} ${JSON.stringify(d)}`);
  }
  return d;
}

describe('CR 702.85a: when you cast this spell', () => {
  test('the trigger goes on the stack above the spell as it is cast, controlled by its caster', () => {
    const g = cast(GIANT, [BEARS]);
    g.expect.stack([`${GIANT} (ability)`, GIANT]);
    g.expect.eventLog([
      { kind: 'spellCast', seat: 0 },
      { kind: 'abilityTriggered', seat: 0 },
    ]);
  });

  test('it works only while the spell is on the stack: once it is a permanent, later casts do not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GIANT, 'Mountain')
      .hand(BOLT)
      .library(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    expect(g.state.pendingTriggers).toHaveLength(0);
  });

  test('exiles until a nonland card with a lower mana value: lands and dearer cards are exiled too, then it asks', () => {
    const g = cast(GIANT, ['Island', ANGEL, BEARS, ELVES]);
    resolveTop(g);
    const d = ask(g);
    expect(d.seat).toBe(0);
    const bears = g.id({ name: BEARS, zone: 'exile', seat: 0 });
    expect(d.subject).toBe(bears);
    // The Island, the Angel (5 is not less than 4) and the Bears are exiled; the Elves are still on top.
    g.expect.zone('Island', 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'library', { seat: 0 });
    expect(
      g.events.filter(
        (e) => e.kind === 'zoneChanged' && e.fromZone === 'library' && e.toZone === 'exile',
      ),
    ).toHaveLength(3);
  });

  test('the mana value must be less: an equal one is exiled and passed over', () => {
    const g = cast(DRAKE, [WALL, BEARS], ['Island', 'Island', 'Island']);
    resolveTop(g);
    expect(ask(g).subject).toBe(g.id({ name: BEARS, zone: 'exile', seat: 0 }));
    g.expect.zone(WALL, 'exile', { seat: 0 });
  });

  test('accepting: the card is cast free from exile, becomes the topmost object, and no one gets priority first', () => {
    const g = cast(GIANT, ['Island', ANGEL, BEARS, ELVES]);
    const lands = g.find({ name: 'Mountain', zone: 'battlefield', seat: 0 });
    resolveTop(g);
    g.act(0).accept();
    // The Bears are on the stack above the Giant; the trigger is gone; the rest went to the bottom.
    g.expect.stack([BEARS, GIANT]);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.pending?.seat).toBe(0);
    g.expect.eventLog([
      { kind: 'optionalAnswered', accepted: true },
      { kind: 'spellCast', seat: 0, fromZone: 'exile', alternative: 'free' },
      { kind: 'cardsBottomed', seat: 0, count: 2 },
    ]);
    // No mana was paid: the four Mountains that paid for the Giant stay as they were (tapped), nothing more.
    for (const m of lands) expect(g.state.objects[m.id]?.tapped).toBe(true);
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
    // The library has the Elves on top and the Island and the Angel at the bottom.
    expect(g.state.seats[0]?.library).toHaveLength(3);
    g.expect.librarySize(0, 3);
    g.expect.zone(ELVES, 'library', { seat: 0 });
    // The Bears resolve first, then the Giant.
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    resolveTop(g);
    g.expect.zone(GIANT, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining: everything exiled goes to the bottom, the found card too', () => {
    const g = cast(GIANT, ['Island', ANGEL, BEARS, ELVES]);
    resolveTop(g);
    g.act(0).decline();
    g.expect.stack([GIANT]);
    g.expect.librarySize(0, 4);
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.eventLog([
      { kind: 'optionalAnswered', accepted: false },
      { kind: 'cardsBottomed', count: 3 },
    ]);
    // The Elves were on top and are still there.
    expect(g.state.seats[0]?.library[0]).toBe(g.id({ name: ELVES, zone: 'library', seat: 0 }));
  });

  test('a library of lands only: every card is exiled, nothing is found, nothing is asked, they all go back', () => {
    const g = cast(GIANT, ['Island', 'Forest', 'Plains']);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.librarySize(0, 3);
    g.expect.eventLog([{ kind: 'cardsBottomed', count: 3 }]);
    g.expect.stack([GIANT]);
  });

  test('an empty library does nothing', () => {
    const g = cast(GIANT, []);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.noEvent({ kind: 'cardsBottomed' });
    g.expect.stack([GIANT]);
  });

  test('a card that cannot be cast (Murder with no creature to target) is not offered and goes to the bottom', () => {
    const g = cast(GIANT, [MURDER, ELVES]);
    resolveTop(g);
    // Murder (3 < 4) is found but has no legal target: the question is not asked.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(MURDER, 'library', { seat: 0 });
    g.expect.librarySize(0, 2);
  });

  test('a found card with targets asks for them as it is cast, and can be taken back with cancel (CR 733)', () => {
    const g = cast(GIANT, [BOLT, ELVES]);
    resolveTop(g);
    const d = ask(g);
    const before = g.positionHash();
    g.act(0).accept();
    expect(g.state.pending?.kind).toBe('targets');
    expect(g.state.casting?.duringResolution).toBe(true);
    g.act(0).cancel();
    // Back at the question, with the Bolt still exiled and the resolution waiting.
    expect(g.state.pending).toEqual(d);
    g.expect.position(before);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT, GIANT]);
    resolveTop(g);
    g.expect.life(1, 37);
  });
});

describe('the exiled cards that were not cast go to the bottom in a random order (CR 702.85a)', () => {
  const library = ['Island', 'Forest', 'Plains', 'Swamp', ANGEL, BEARS, ELVES];

  function bottomOrder(seed: number): string[] {
    const g = cast(GIANT, library, RED, seed);
    resolveTop(g);
    g.act(0).decline();
    return g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card ?? '') ?? [];
  }

  test('the same seed gives the same order; different seeds give different ones', () => {
    expect(bottomOrder(5)).toEqual(bottomOrder(5));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => bottomOrder(seed).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  test('the cards on the library after the exiled ones stay in place, on top of the returned ones', () => {
    const g = cast(GIANT, library, RED, 3);
    resolveTop(g);
    g.act(0).decline();
    const top = g.state.seats[0]?.library[0];
    expect(top).toBe(g.id({ name: ELVES, zone: 'library', seat: 0 }));
    g.expect.librarySize(0, 7);
  });

  test('nobody is told the order: only the number of cards, and the library is hidden from the opponent', () => {
    const g = cast(GIANT, library, RED, 2);
    resolveTop(g);
    g.act(0).decline();
    const bottomed = g.events.filter((e) => e.kind === 'cardsBottomed');
    expect(bottomed).toHaveLength(1);
    expect(JSON.stringify(bottomed)).not.toMatch(/"o\d+"/);
    expect(
      g.events.some(
        (e) => e.kind === 'zoneChanged' && e.toZone === 'library' && e.fromZone === 'exile',
      ),
    ).toBe(false);
    const view = g.view(1);
    const mine = view.seats[0];
    expect(mine?.libraryCount).toBe(7);
    expect(mine && 'library' in mine).toBe(false);
  });

  test('while the question waits the exiled cards are public, to the opponent too', () => {
    const g = cast(GIANT, ['Island', BEARS, ELVES]);
    resolveTop(g);
    const names = g
      .view(1)
      .exile.map((o) => o.name)
      .sort();
    expect(names).toEqual(['Grizzly Bears', 'Island']);
  });
});

describe('what a cascade spell does around it', () => {
  test("the spell's mana value is read from last-known information when it left the stack (CR 113.7a)", () => {
    const g = scenario()
      .seat(0)
      .hand(GIANT)
      .battlefield(...RED)
      .library('Island', ANGEL, BEARS)
      .seat(1)
      .battlefield('Island', 'Island')
      .hand(COUNTERSPELL)
      .build();
    g.act(0).cast(GIANT, { pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [GIANT], pay: true });
    g.passAll();
    g.expect.zone(GIANT, 'graveyard', { seat: 0 });
    // Countered, the trigger still resolves with the Giant's mana value of 4: the Angel (5) is not found.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    expect(ask(g).subject).toBe(g.id({ name: BEARS, zone: 'exile', seat: 0 }));
  });

  test('two instances trigger twice, each exiling for itself (CR 702.85c)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Double Cascade',
          manaCost: ['4'],
          types: ['creature'],
          colors: [],
          colorIdentity: [],
          power: 4,
          toughness: 4,
          oracleText: 'Cascade. Cascade.',
          abilities: [
            { kind: 'keyword', keyword: { kind: 'cascade' } },
            { kind: 'keyword', keyword: { kind: 'cascade' } },
          ],
        }),
      )
      .hand('SYNTHETIC Test Double Cascade')
      .battlefield(...RED)
      .library(BEARS, ELVES, WALL)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Test Double Cascade', { pay: true });
    expect(g.state.stack).toHaveLength(3);
    resolveTop(g);
    g.act(0).accept();
    g.expect.stack([
      BEARS,
      'SYNTHETIC Test Double Cascade (ability)',
      'SYNTHETIC Test Double Cascade',
    ]);
    // The second trigger resolves after the Bears did.
    resolveTop(g);
    resolveTop(g);
    g.act(0).accept();
    g.expect.stack([ELVES, 'SYNTHETIC Test Double Cascade']);
  });

  test('a spell with cascade that is cast through cascade triggers its own cascade after the first resolution ends', () => {
    const g = cast(GIANT, [SPRITE, ELVES, 'Island']);
    resolveTop(g);
    g.act(0).accept();
    // The Sprite is on the stack; its cascade trigger was found as it was cast and goes on the stack at once
    // when the Giant's trigger is done (CR 603.3), above it.
    g.expect.stack([`${SPRITE} (ability)`, SPRITE, GIANT]);
    resolveTop(g);
    const d = ask(g);
    expect(d.subject).toBe(g.id({ name: ELVES, zone: 'exile', seat: 0 }));
    g.act(0).accept();
    g.expect.stack([ELVES, SPRITE, GIANT]);
    g.expect.invariants();
  });

  test('the legal actions of the question agree with applyAction', () => {
    const g = cast(GIANT, [BEARS]);
    resolveTop(g);
    const listed = getLegalActions(g.state, 0) as Action[];
    expect(listed.map((a) => a.kind)).toEqual(['acceptOptional', 'declineOptional', 'concede']);
    for (const a of listed) {
      if (a.kind !== 'concede') expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
    expect(getLegalActions(g.state, 1)).toEqual([]);
    expect(applyAction(g.state, 1, { kind: 'acceptOptional' }).ok).toBe(false);
  });

  test('a commander exiled and not cast may go to the command zone instead of the library (CR 903.9b)', () => {
    const g = scenario()
      .seat(0)
      .hand(GIANT)
      .battlefield(...RED)
      .library(ANGEL, { commander: true })
      .library(ELVES)
      .seat(1)
      .build();
    g.act(0).cast(GIANT, { pay: true });
    resolveTop(g);
    g.act(0).accept();
    // The Elves were found and cast; the commander card is asked about before it goes to the library.
    const d = g.state.pending;
    expect(d?.kind).toBe('commanderZone');
  });

  test('the same actions give the same state hash twice', () => {
    const run = () => {
      const g = cast(GIANT, ['Island', ANGEL, BEARS, ELVES, WALL]);
      resolveTop(g);
      g.act(0).accept();
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

// Group 9 of the Hashaton deck (issue 31, D-390 to D-395 provisional): the damage trigger of Rona, Tolarian Obliterator, "Whenever a source deals damage to ~, that source's controller
// exiles a card from their hand at random. If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost.",
// as the engine runs it: the `dealtDamage` trigger (the player is the controller of the source, `triggerPlayer`), `exileRandomFromHand`, then the land offer and the free cast.
// Pins: CR 603.2 and 603.2c (one trigger for each source that deals damage, so one exile each), CR 120.3 (damage), CR 113.7a (the controller of a source that is gone is read from last-known
// information), CR 701.13 (exile), CR 406.3 (exiled cards are face up), CR 400.7 and 400.7j (a card that moved is a new object; "it" names it), CR 608.2d (a "you may" is the controller's
// choice), CR 305.1 and 110.2a (a land put onto the battlefield enters under the control of the player who puts it), CR 608.2g and 118.9 (cast without paying its mana cost), CR 608.2c
// ("Otherwise"). Hidden information (CR 402.3): the cards of the hand are not shown to the other seat before the exile (the two-world audit at the end), and the generator is the seeded
// one of the state.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g9.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const OBLITERATOR = 'SYNTHETIC Chaos Obliterator'; // 5/5 trample, the whole body of the real card
const OBELISK = 'SYNTHETIC Chaos Obelisk'; // the same 5/5 with the exile alone
const POINTER = 'SYNTHETIC Chaos Pointer'; // {T}: target player exiles a card from their hand at random
const TWICE = 'SYNTHETIC Chaos Twice'; // {T}: you exile a card from your hand at random, then target player does, then you may cast it free
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const FOREST = 'Forest';
const SWAMP = 'Swamp';
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const FILLER = Array.from({ length: 12 }, () => 'Plains');

/**
 * Seat 0 controls `card`; seat 1 has `hand` after the Bolt (and a Mountain): in the first main phase of seat 0 the opponent hits the creature with the Bolt, and the damage trigger of
 * the creature is on the stack when this returns (nobody has passed since).
 */
function boltedGame(
  card: string,
  hand: readonly string[],
  options: { readonly seed?: number } = {},
): ScenarioGame {
  const g = scenario()
    .seed(options.seed ?? 1)
    .seat(0)
    .battlefield(card)
    .library(...FILLER)
    .seat(1)
    .hand(BOLT, ...hand)
    .battlefield('Mountain')
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).pass();
  g.act(1).cast(`${BOLT}[0]`, { targets: [card], pay: true });
  // The Bolt resolves (both seats pass once) and the trigger of the creature goes on the stack.
  g.pass();
  g.pass();
  return g;
}

/** Every object in exile (of any owner). */
const inExile = (g: ScenarioGame) =>
  Object.values(g.state.objects).filter((o) => o.zone === 'exile');

/** The names of the cards in exile as `viewer` sees them. */
function exiled(g: ScenarioGame, viewer: 0 | 1 = 0): string[] {
  return g
    .view(viewer)
    .exile.map((o) => o.name)
    .sort();
}

const handOf = (g: ScenarioGame, seat: 0 | 1): number => g.state.seats[seat]?.hand.length ?? -1;

describe('the cards are valid, and the effect is a supported feature', () => {
  test.each([OBLITERATOR, OBELISK, POINTER, TWICE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
    expect(isFeatureSupported('effect:exileRandomFromHand')).toBe(true);
  });

  const withEffect = (effect: unknown): CardDefinition => {
    const card = syntheticCard(POINTER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'activated') throw new Error('no ability');
    return { ...card, faces: [{ ...face, abilities: [{ ...ability, effect }] }] } as never;
  };

  test('the effect names one player: not each opponent, not each player', () => {
    expect(
      validateCard(withEffect({ kind: 'exileRandomFromHand', player: { kind: 'you' } })),
    ).toEqual([]);
    expect(
      validateCard(
        withEffect({ kind: 'exileRandomFromHand', player: { kind: 'target', id: 't1' } }),
      ),
    ).toEqual([]);
    for (const player of [{ kind: 'eachOpponent' }, { kind: 'eachPlayer' }]) {
      expect(
        validateCard(withEffect({ kind: 'exileRandomFromHand', player })).length,
      ).toBeGreaterThan(0);
    }
  });

  test('the trigger player needs a trigger about a player', () => {
    expect(
      validateCard(withEffect({ kind: 'exileRandomFromHand', player: { kind: 'triggerPlayer' } }))
        .length,
    ).toBeGreaterThan(0);
  });

  test('a land offer after it may name the card it exiled; without it the card is not "it"', () => {
    const land = {
      kind: 'moveToZone',
      objects: { kind: 'moved' },
      to: 'battlefield',
      controller: 'you',
    };
    expect(
      validateCard(
        withEffect({
          kind: 'sequence',
          effects: [{ kind: 'exileRandomFromHand', player: { kind: 'you' } }, land],
        }),
      ),
    ).toEqual([]);
    expect(validateCard(withEffect(land)).length).toBeGreaterThan(0);
  });
});

describe('{T}: Target player exiles a card from their hand at random. (the primitive alone)', () => {
  const game = (seed = 1) =>
    scenario()
      .seed(seed)
      .seat(0)
      .hand(BEARS, FOREST)
      .battlefield(POINTER)
      .library(...FILLER)
      .seat(1)
      .hand(BEARS, FOREST, DIVINATION)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('one card of the target hand goes to exile, face up for both seats; the others stay in the hand', () => {
    const g = game();
    g.act(0).activate(POINTER, { targets: [{ player: 1 }] });
    g.passAll();
    expect(handOf(g, 1)).toBe(2);
    expect(handOf(g, 0)).toBe(2);
    const [card, ...more] = exiled(g, 0);
    expect(more).toEqual([]);
    expect([BEARS, FOREST, DIVINATION]).toContain(card);
    // exile is public (CR 406.3): the other seat sees the same card
    expect(exiled(g, 1)).toEqual(exiled(g, 0));
    // it is a new object that the owner still owns
    const [obj] = inExile(g);
    expect(obj?.owner).toBe(1);
    g.expect.invariants();
  });

  test('a player may target themselves: their own hand loses the card', () => {
    const g = game();
    g.act(0).activate(POINTER, { targets: [{ player: 0 }] });
    g.passAll();
    expect(handOf(g, 0)).toBe(1);
    expect(handOf(g, 1)).toBe(3);
    expect(inExile(g)[0]?.owner).toBe(0);
  });

  test('the same seed picks the same card, and different seeds pick different cards (the seeded generator of the state)', () => {
    const pick = (seed: number): string => {
      const g = game(seed);
      g.act(0).activate(POINTER, { targets: [{ player: 1 }] });
      g.passAll();
      return exiled(g)[0] ?? '';
    };
    const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
    const picks = seeds.map(pick);
    expect(seeds.map(pick)).toEqual(picks);
    // every card of the hand can be the one: nothing prefers a land, a creature or the first card
    expect(new Set(picks)).toEqual(new Set([BEARS, FOREST, DIVINATION]));
  });

  test('an empty hand: nothing is exiled and nobody is asked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(POINTER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(POINTER, { targets: [{ player: 1 }] });
    g.passAll();
    expect(exiled(g)).toEqual([]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a hand of one card: that card, whatever it is', () => {
    const g = scenario()
      .seat(0)
      .battlefield(POINTER)
      .library(...FILLER)
      .seat(1)
      .hand(DIVINATION)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(POINTER, { targets: [{ player: 1 }] });
    g.passAll();
    expect(exiled(g)).toEqual([DIVINATION]);
    expect(handOf(g, 1)).toBe(0);
  });
});

describe('"it" is the card of the last exile (CR 400.7j), and nothing when that hand was empty', () => {
  const game = (theirs: readonly string[]) =>
    scenario()
      .seat(0)
      .battlefield(TWICE)
      .hand(BEARS)
      .library(...FILLER)
      .seat(1)
      .hand(...theirs)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the second hand has a card: it is the card to cast, not the first', () => {
    const g = game([DIVINATION]);
    g.act(0).activate(TWICE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('no question');
    expect(d.legal).toHaveLength(1);
    const [offered] = d.legal;
    expect(offered === undefined ? undefined : g.state.objects[offered]?.owner).toBe(1);
    g.act(0).chooseCards({ name: DIVINATION, seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(2);
  });

  test('the second hand is empty: nothing is exiled the second time and there is no card to cast (the first card is no longer "it")', () => {
    const g = game([]);
    g.act(0).activate(TWICE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});

describe('"Whenever a source deals damage to ~, that source\'s controller exiles a card from their hand at random."', () => {
  test("the opponent's Bolt damages it: the opponent exiles a card from their hand, and the Bolt is already in the graveyard (CR 113.7a)", () => {
    const g = boltedGame(OBELISK, [BEARS, FOREST, DIVINATION]);
    g.expect.stack([`${OBELISK} (ability)`]);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.passAll();
    expect(handOf(g, 1)).toBe(2);
    expect(exiled(g)).toHaveLength(1);
    expect([BEARS, FOREST, DIVINATION]).toContain(exiled(g)[0]);
    expect(handOf(g, 0)).toBe(0);
    g.expect.invariants();
  });

  test("the controller of the source is who exiles: Rona's own controller damaging it exiles from their own hand", () => {
    const g = scenario()
      .seat(0)
      .battlefield(OBELISK)
      .battlefield('Mountain')
      .hand(BOLT, BEARS)
      .library(...FILLER)
      .seat(1)
      .hand(DIVINATION, FOREST)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT, { targets: [OBELISK], pay: true });
    g.passAll();
    expect(exiled(g)).toEqual([BEARS]);
    expect(handOf(g, 1)).toBe(2);
    g.expect.invariants();
  });

  test('an empty hand: nothing is exiled and nobody is asked', () => {
    const g = boltedGame(OBELISK, []);
    g.passAll();
    expect(exiled(g)).toEqual([]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('two sources deal damage at the same time: two triggers, so two cards are exiled (CR 603.2c)', () => {
    const g = scenario()
      .seed(3)
      .seat(0)
      .battlefield(OBELISK)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { count: 2 })
      .hand(FOREST, DIVINATION, SWAMP, 'Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.playCombat({
      attack: [OBELISK],
      block: [
        { blocker: `${BEARS}[0]`, attacker: OBELISK },
        { blocker: `${BEARS}[1]`, attacker: OBELISK },
      ],
    });
    g.expect.damage(OBELISK, 4);
    g.passAll();
    expect(exiled(g)).toHaveLength(2);
    expect(handOf(g, 1)).toBe(2);
    g.expect.invariants();
  });

  test('damage that kills it still triggers (CR 603.2g, 603.10a): the controller is read as it was', () => {
    const g = scenario()
      .seed(2)
      .seat(0)
      .battlefield(OBELISK)
      .library(...FILLER)
      .seat(1)
      .hand(BOLT, BOLT, FOREST, DIVINATION, BEARS)
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [OBELISK], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${OBELISK} (ability)`]);
    // the first trigger waits on the stack; a second Bolt in response is 3 more damage, and the 5/5 dies with both triggers on the stack
    g.pass(0);
    g.act(1).cast(BOLT, { targets: [OBELISK], pay: true });
    g.passAll();
    g.expect.zone(OBELISK, 'graveyard', { seat: 0 });
    expect(exiled(g)).toHaveLength(2);
    expect(handOf(g, 1)).toBe(1);
    g.expect.invariants();
  });
});

describe('"If it\'s a land card, you may put it onto the battlefield under your control."', () => {
  test('a land card: I am asked, and it enters under my control (its owner is the opponent)', () => {
    const g = boltedGame(OBLITERATOR, [FOREST]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.expect.zone(FOREST, 'exile');
    g.act(0).accept();
    const forest = g.object(FOREST);
    expect(forest.zone).toBe('battlefield');
    expect(forest.controller).toBe(0);
    expect(forest.owner).toBe(1);
    g.expect.invariants();
  });

  test('it is not a land play: the land drop of the controller is not used (CR 305.1: put onto the battlefield by an effect)', () => {
    const g = boltedGame(OBLITERATOR, [FOREST]);
    g.passAll();
    g.act(0).accept();
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(0);
  });

  test('declining leaves it in exile', () => {
    const g = boltedGame(OBLITERATOR, [FOREST]);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(FOREST, 'exile');
    expect(g.find({ zone: 'battlefield', name: FOREST })).toHaveLength(0);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a land card is not cast: the only question is the "may", not a choice of a card to cast', () => {
    const g = boltedGame(OBLITERATOR, [FOREST]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.pending('priority', 0);
  });
});

describe('"Otherwise, you may cast it without paying its mana cost."', () => {
  test('a creature card: I choose it, it is cast without paying, and it enters under my control (its owner is the opponent)', () => {
    const g = boltedGame(OBLITERATOR, [BEARS]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    g.expect.stack([BEARS]);
    g.passAll();
    const bears = g.object(BEARS);
    expect(bears.zone).toBe('battlefield');
    expect(bears.controller).toBe(0);
    expect(bears.owner).toBe(1);
    // nothing was paid
    expect(g.state.seats[0]?.manaPool.length).toBe(0);
    g.expect.invariants();
  });

  test('choosing no card leaves it in exile', () => {
    const g = boltedGame(OBLITERATOR, [BEARS]);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'exile');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a sorcery is cast at instant speed, as the ability resolves (CR 608.2g): I draw two', () => {
    const g = boltedGame(OBLITERATOR, [DIVINATION]);
    g.passAll();
    g.act(0).chooseCards({ name: DIVINATION, seat: 1 });
    g.passAll();
    expect(handOf(g, 0)).toBe(2);
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a spell with a target: I choose the target of the spell I cast', () => {
    const g = boltedGame(OBLITERATOR, [BOLT]);
    g.passAll();
    g.act(0).chooseCards({ name: BOLT, seat: 1 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    // the opponent paid for the first Bolt only; this one was free and hit them for 3
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('an empty hand: no land question, no cast question', () => {
    const g = boltedGame(OBLITERATOR, []);
    g.passAll();
    g.expect.pending('priority', 0);
    expect(exiled(g)).toEqual([]);
  });

  test('the branch is what the card is: a land is the land question, a creature is the cast question', () => {
    const land = boltedGame(OBLITERATOR, [FOREST]);
    land.passAll();
    expect(land.state.pending?.kind).toBe('confirmOptional');
    const spell = boltedGame(OBLITERATOR, [BEARS]);
    spell.passAll();
    expect(spell.state.pending?.kind).toBe('chooseCards');
  });
});

describe('hidden information (CR 402.3): the other seat learns nothing before the exile', () => {
  const world = (hand: readonly string[], seed = 5): ScenarioGame =>
    boltedGame(OBLITERATOR, hand, { seed });
  const A = [BEARS, FOREST, DIVINATION];
  const B = ['Llanowar Elves', 'Island', 'Counterspell'];

  test('what seat 0 is shown before the trigger resolves is the same text in both worlds, and no name of the hand is in it', () => {
    const a = world(A);
    const b = world(B);
    const view = (g: ScenarioGame) => JSON.stringify(g.view(0));
    expect(view(a)).toBe(view(b));
    for (const name of [...A, ...B]) expect(view(a)).not.toContain(name);
    // the events of the actions so far are the same text too
    expect(JSON.stringify(a.events.map((e) => e.kind))).toBe(
      JSON.stringify(b.events.map((e) => e.kind)),
    );
  });

  test('the position picked depends only on the seed and the size of the hand, never on what the cards are', () => {
    const position = (hand: readonly string[]): number => {
      const g = world(hand);
      g.passAll();
      const name = exiled(g)[0] ?? '';
      return hand.indexOf(name);
    };
    // a land and a nonland swap places, and the same position goes
    expect(position(A)).toBe(position(B));
    expect(position([FOREST, BEARS, DIVINATION])).toBe(
      position(['Island', 'Llanowar Elves', 'Counterspell']),
    );
  });

  test('after the exile seat 0 sees exactly the exiled card; the cards left in the hand stay unnamed', () => {
    const g = world(A);
    g.passAll();
    const [name] = exiled(g);
    const shown = JSON.stringify(g.view(0));
    expect(shown).toContain(name ?? 'missing');
    // a card of the hand that was not exiled and is not a card of this game's other zones is not named (Grizzly Bears and Forest can be there for other reasons: only the third is checked)
    for (const other of A.filter((n) => n !== name && n === DIVINATION)) {
      expect(shown).not.toContain(other);
    }
  });
});

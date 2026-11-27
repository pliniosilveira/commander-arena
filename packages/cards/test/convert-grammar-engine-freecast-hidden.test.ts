// Free casts from hidden zones (deck support issue 110): Evercoat Ursine (play one of the cards it hid away) and Sunbird's Invocation (reveal the top X cards, cast one for free).
// The REAL Oracle text of the acceptance cards (fixtures/corpus/golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 702.75a (Hideaway), CR 607.2a (linked abilities), CR 603.4 (intervening "if"), CR 608.2g and 118.9 (cast without paying its mana cost, as the ability resolves),
// CR 305.1 and 305.2a (a land played by an effect uses the land drop), CR 701.20a (Reveal), CR 202.3 and 202.3e (mana value; {X} counts as the value chosen on the stack and 0 elsewhere),
// CR 401.4 (the rest on the bottom of the library), CR 603.3d (the spell that caused the trigger stays on the stack under it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, fixtureCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BOLT = 'Lightning Bolt'; // {R}, mana value 1
const BEARS = 'Grizzly Bears'; // {1}{G}, mana value 2
const MURDER = 'Murder'; // {1}{B}{B}, mana value 3
const SPIDER = 'Giant Spider'; // {3}{G}, mana value 4
const XBURN = 'SYNTHETIC X Burn'; // {X}{R}

describe('Evercoat Ursine', () => {
  const CARD = real('Evercoat Ursine');
  const NAME = CARD.name;
  const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'];

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  /** The Ursine is cast on turn 3 and hides two cards (Hideaway 3 twice); the game then goes on to the next turn of seat 0, when it can attack. */
  const hidden = (
    library: readonly string[],
    first: string,
    second: string,
    extraHand: readonly string[] = [],
  ) => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .hand(NAME, ...extraHand)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...library, ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    // Two Hideaway triggers (the keyword twice): each looks at three cards and hides one.
    for (const pick of [first, second]) {
      for (let i = 0; i < 4 && g.state.pending?.kind !== 'chooseCards'; i += 1) g.passAll();
      g.act(0).chooseCards(pick);
    }
    return g;
  };

  test('Hideaway 3 twice: two cards are exiled and both are linked to the Ursine', () => {
    const g = hidden([BOLT, BEARS, MURDER, SPIDER, 'Swamp', 'Plains'], BOLT, SPIDER);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(SPIDER, 'exile', { seat: 0 });
    expect(g.object(NAME).linkedExile).toHaveLength(2);
    g.expect.invariants();
  });

  const attack = (g: ReturnType<typeof hidden>) => {
    g.advanceTo('declareAttackers', { turn: 5 });
    g.act(0).attack(NAME);
    // Through the blockers (none) to the combat damage step, where the trigger asks.
    for (
      let i = 0;
      i < 6 && g.state.pending?.kind === 'priority' && g.state.stack.length === 0;
      i += 1
    ) {
      g.passAll();
    }
    g.passAll();
  };

  test('combat damage to a player: one of the hidden cards is played for free, the other stays hidden', () => {
    const g = hidden([BOLT, BEARS, MURDER, SPIDER, 'Swamp', 'Plains'], BOLT, SPIDER);
    attack(g);
    g.expect.life(1, 14);
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.purpose).toBe('cast');
    expect([...decision.legal].sort()).toEqual([g.id(BOLT), g.id(SPIDER)].sort());
    expect(decision.min).toBe(0);
    expect(decision.max).toBe(1);
    g.act(0).chooseCards(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('the choice is made while the ability resolves: declining leaves both cards in exile', () => {
    const g = hidden([BOLT, BEARS, MURDER, SPIDER, 'Swamp', 'Plains'], BOLT, SPIDER);
    attack(g);
    g.act(0).chooseCards();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(SPIDER, 'exile', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a hidden land is played with the land drop; with none left it is not offered', () => {
    const g = hidden([BOLT, 'Plains', MURDER, SPIDER, 'Swamp', BEARS], 'Plains', SPIDER);
    attack(g);
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.legal).toContain(g.id('Plains'));
    g.act(0).chooseCards('Plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });

  test('a hidden land is not offered when the land drop of the turn is used (CR 305.2a)', () => {
    const g = hidden([BOLT, 'Plains', MURDER, SPIDER, 'Swamp', BEARS], 'Plains', SPIDER, [
      'Forest',
    ]);
    g.advanceTo('precombatMain', { turn: 5 });
    g.act(0).playLand('Forest');
    attack(g);
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.legal).toEqual([g.id(SPIDER)]);
  });

  test('no card exiled with it: the intervening "if" is false and nothing triggers (CR 603.4)', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .battlefield(NAME)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(NAME);
    for (let i = 0; i < 6 && g.state.turn.step !== 'combatDamage'; i += 1) g.passAll();
    g.expect.life(1, 14);
    g.expect.pending('priority', 0);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe("Sunbird's Invocation", () => {
  const CARD = real("Sunbird's Invocation");
  const NAME = CARD.name;
  const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'];
  /** A spell of mana value 0, to see that the trigger does nothing for it. */
  const base = fixtureCard(BOLT);
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  const FREE = 'SYNTHETIC Free Bolt';
  const freeBolt: CardDefinition = {
    ...base,
    name: FREE,
    faces: [{ ...face, name: FREE, manaCost: null }],
  };

  const game = (hand: readonly string[], library: readonly string[]) =>
    scenario()
      .define(CARD)
      .define(freeBolt)
      .seat(0)
      .life(20)
      .battlefield(NAME, 'Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
      .hand(...hand)
      .library(...library, ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it reads as supported and is valid', () => {
    expect(validateCard(CARD)).toEqual([]);
  });

  test('a spell of mana value 2 reveals two cards: only the one with mana value 2 or less is offered', () => {
    const g = game([BEARS], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.purpose).toBe('cast');
    expect(decision.legal).toEqual([g.id(BOLT)]);
    expect(decision.min).toBe(0);
    expect(decision.max).toBe(1);
  });

  test('the cast is part of the resolution: the free spell resolves before the spell that caused the trigger', () => {
    const g = game([BEARS], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    // The Bolt is on top of the Bears, which is still on the stack.
    g.expect.stack([BOLT, BEARS]);
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the cards not cast go to the bottom of the library; the cards below the revealed ones stay', () => {
    const g = game([BEARS], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    const library = g.state.seats[0]?.library ?? [];
    expect(library[0]).toBe(g.id(SPIDER));
    expect(library.slice(-1)).toEqual([g.id('Divination')]);
    g.expect.invariants();
  });

  test('the player may cast nothing: both revealed cards go to the bottom', () => {
    const g = game([BEARS], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    const library = g.state.seats[0]?.library ?? [];
    expect(library[0]).toBe(g.id(SPIDER));
    expect(library.slice(-2)).toContain(g.id(BOLT));
    expect(library.slice(-2)).toContain(g.id('Divination'));
  });

  test('the revealed cards are shown to every player', () => {
    const g = game([BEARS], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    const revealed = g.events.filter((e) => e.kind === 'cardsRevealed');
    expect(revealed).toHaveLength(1);
  });

  test('{X} counts as the value chosen: X = 2 makes mana value 3 and reveals three cards', () => {
    const g = game([XBURN], [BOLT, 'Divination', SPIDER]);
    g.act(0).cast(XBURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    // Bolt (1) and Divination (3) are both at most 3; the Spider (4) is not.
    expect([...decision.legal].sort()).toEqual([g.id(BOLT), g.id('Divination')].sort());
  });

  test('a revealed spell with {X} in its cost has mana value 0 for the limit and is cast with X = 0', () => {
    const g = game([BEARS], [XBURN, SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.legal).toEqual([g.id(XBURN)]);
    g.act(0).chooseCards(XBURN);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(XBURN, 'graveyard', { seat: 0 });
  });

  test('a spell of mana value 0 does nothing: no card is revealed', () => {
    const g = game([FREE], [BOLT, BEARS]);
    g.act(0).cast(FREE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'library', { seat: 0 });
    expect((g.state.seats[0]?.library ?? [])[0]).toBe(g.id(BOLT));
    expect(g.events.filter((e) => e.kind === 'cardsRevealed')).toHaveLength(0);
  });

  test('a spell cast from the library does not trigger it again (it says "from your hand")', () => {
    const g = game([BEARS], [BOLT, MURDER, SPIDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    // Only the Bolt and the Bears are on the stack: no second trigger.
    g.expect.stack([BOLT, BEARS]);
  });

  test('the trigger resolves even when the spell that caused it is countered', () => {
    const g = scenario()
      .define(CARD)
      .seat(0)
      .life(20)
      .battlefield(NAME, 'Forest', 'Forest')
      .hand(BEARS)
      .library(BOLT, MURDER, ...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Island', 'Island')
      .hand('Counterspell')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: BEARS }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // The Bears were countered, yet the ability still reveals two cards (the mana value of the spell as it last was) and asks for the free cast.
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards')
      throw new Error(`expected chooseCards, got ${decision?.kind}`);
    expect(decision.legal).toEqual([g.id(BOLT)]);
  });
});

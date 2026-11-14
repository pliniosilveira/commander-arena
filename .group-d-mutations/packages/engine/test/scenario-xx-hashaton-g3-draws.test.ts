// "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead." (D-379; the Hashaton deck, Bard, King of Dale):
// the replacement `drawInstead`.
// Pins: CR 614.1a (a replacement effect of a permanent), CR 614.11 (a draw replacement applies even if no cards could be drawn: the library is empty),
// CR 614.11a (the draws made instead are completed before the sequence goes on), CR 614.5 (each effect replaces a draw once: two of them make four), CR 504.1
// (the draw step: its first draw is not replaced; an extra draw step has its own first draw), CR 121.1 (each card drawn is a draw: "whenever you draw" triggers
// for each, the nth card of the turn counts the cards), CR 903.9b (a commander on top of the library is asked about each draw it is in), CR 702.94a (miracle
// reads the first card drawn this turn), CR 616.1 (a skip and a replacement of the same draw: the engine applies the skip first), CR 613.1f. Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g3.ts and others).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DRAW_REIGN = 'SYNTHETIC Draw Reign';
const TWIN_REIGN = 'SYNTHETIC Twin Reign';
const STUDY = 'SYNTHETIC Quick Study'; // instant: draw a card
const CAREFUL = 'SYNTHETIC Careful Study'; // instant: draw a card; if you do, gain 2 life
const TWIN = 'SYNTHETIC Twin Draw'; // sorcery: draw two cards
const WATCHER = 'SYNTHETIC Draw Watcher'; // whenever you draw a card, you gain 1 life
const SECOND = 'SYNTHETIC Second Draw Watcher'; // whenever you draw your second card each turn, you gain 1 life
const WARDEN = 'SYNTHETIC Hollow Warden'; // skips draws while the library has no cards
const FROG = 'SYNTHETIC Frog Hex'; // target creature loses all abilities until end of turn
const MIRACLE_BEAST = 'SYNTHETIC Miracle Beast';
const COMMANDER = 'Isamaru, Hound of Konda';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

const handSize = (g: ScenarioGame, seat: 0 | 1 = 0): number =>
  g.state.seats[seat]?.hand.length ?? 0;
const drawn = (g: ScenarioGame): number => g.events.filter((e) => e.kind === 'cardDrawn').length;

/** Seat 0 in the precombat main phase of turn 3 with `mine` on the battlefield and the instants in hand; nothing was drawn this turn. */
function main(
  hand: readonly string[],
  mine: readonly string[],
  library: readonly string[] = FILLER,
): ScenarioGame {
  const b: Builder = scenario()
    .seat(0)
    .life(20)
    .hand(...hand)
    .battlefield('Island', 'Island', 'Island', 'Island')
    .battlefield(...mine)
    .library(...library)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 });
  return b.build();
}

describe('the cards are valid', () => {
  test.each([DRAW_REIGN, TWIN_REIGN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('only the form with the exception is run, with two or more cards', () => {
    const card = syntheticCard(DRAW_REIGN);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRule = (rule: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [{ kind: 'replacement', replacement: { kind: 'drawInstead', ...rule } }],
          },
        ],
      }) as never;
    expect(validateCard(withRule({ count: 2, exceptFirstInDrawStep: true }))).toEqual([]);
    expect(validateCard(withRule({ count: 1, exceptFirstInDrawStep: true }))).not.toEqual([]);
    expect(validateCard(withRule({ count: 2, exceptFirstInDrawStep: false }))).not.toEqual([]);
    expect(validateCard(withRule({ count: 2 }))).not.toEqual([]);
  });
});

describe('a draw by an effect is replaced by two (CR 614.1a)', () => {
  test('without the replacement: one card (the baseline)', () => {
    const g = main([STUDY], []);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(1);
  });

  test('one draw becomes two draws, and the event says so', () => {
    const g = main([STUDY], [DRAW_REIGN]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
    expect(drawn(g)).toBe(2);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toEqual([
      { kind: 'drawReplaced', seat: 0, sources: [g.id(DRAW_REIGN)], count: 2 },
    ]);
    g.expect.librarySize(0, 10);
    g.expect.invariants();
  });

  test('each draw of a sequence is replaced on its own: "draw two cards" makes four (CR 614.11a)', () => {
    const g = main([TWIN], [DRAW_REIGN]);
    g.act(0).cast(TWIN, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(4);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(2);
  });

  test('each effect replaces a draw once (CR 614.5): two of them make four cards for one draw, and eight for two', () => {
    const one = main([STUDY], [DRAW_REIGN, TWIN_REIGN]);
    one.act(0).cast(STUDY, { pay: true });
    one.passAll();
    expect(handSize(one)).toBe(4);
    const events = one.events.filter((e) => e.kind === 'drawReplaced');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ count: 4 });
    const two = main([TWIN], [DRAW_REIGN, TWIN_REIGN]);
    two.act(0).cast(TWIN, { pay: true });
    two.passAll();
    expect(handSize(two)).toBe(8);
  });

  test("my opponent's replacement does not change my draws", () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(1);
  });

  test('a permanent that lost its abilities replaces nothing (CR 613.1f)', () => {
    const g = main([FROG, STUDY], [DRAW_REIGN]);
    g.act(0).cast(FROG, { targets: [DRAW_REIGN], pay: true });
    g.passAll();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(1);
  });
});

describe('the draw step (CR 504.1)', () => {
  const toDrawStep = (mine: readonly string[], hand: readonly string[] = []) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(...mine)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    return g;
  };

  test('the first draw of the draw step is not replaced: one card, in every draw step', () => {
    const g = toDrawStep([DRAW_REIGN]);
    expect(g.state.turn.step).toBe('draw');
    expect(handSize(g)).toBe(1);
    g.expect.noEvent({ kind: 'drawReplaced' });
    // The next turn of seat 0: a new draw step, a new first draw.
    g.advanceTo('draw', { turn: 'next' });
    g.advanceTo('draw', { turn: 'next' });
    expect(handSize(g)).toBe(2);
  });

  test('a draw made in the draw step after the first one is replaced', () => {
    const g = toDrawStep([DRAW_REIGN], [STUDY]);
    expect(handSize(g)).toBe(2); // the draw step's card and Quick Study
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    // The step's own draw (one card), then Quick Study drew two.
    expect(handSize(g)).toBe(3);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
  });

  test("the first draw made in my opponent's draw step is not the first of a draw step of mine: it is replaced even then", () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('draw', { active: 1, turn: 2 })
      .build();
    g.act(1).pass();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
  });

  test('the record of the draw step is kept for that step only', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    expect(g.state.turn.drewInDrawStep).toBeUndefined();
    g.passAll();
    g.expect.step('draw', { active: 0 });
    expect(g.state.turn.drewInDrawStep).toBe(true);
    g.advanceTo('precombatMain');
    expect(g.state.turn.drewInDrawStep).toBeUndefined();
  });

  test('a draw step whose own draw was not made (the first turn of the starting player, CR 103.8a): the first draw made in it is the one that is not replaced, the next is', () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY, STUDY)
      .battlefield('Island', 'Island')
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('draw', { active: 0, turn: 1 })
      .build();
    g.act(0).cast({ name: STUDY, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2); // one Quick Study left in hand, one card drawn: not replaced
    g.expect.noEvent({ kind: 'drawReplaced' });
    g.act(0).cast({ name: STUDY, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    // The second draw of the step is replaced: two cards.
    expect(handSize(g)).toBe(3);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
  });

  test('a draw before the draw step (the upkeep) is replaced, and the draw step still draws its first card unreplaced', () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
    g.passAll();
    g.expect.step('draw', { active: 0 });
    expect(handSize(g)).toBe(3);
  });

  test("a draw of mine in my opponent's draw step is not in a draw step of mine: it is replaced", () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .battlefield(DRAW_REIGN)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 1, turn: 2 })
      .build();
    g.passAll();
    g.expect.step('draw', { active: 1 });
    g.act(1).pass();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
  });
});

describe('the cards drawn are draws like any other', () => {
  test('"whenever you draw a card" triggers for each of them', () => {
    const g = main([STUDY], [DRAW_REIGN, WATCHER]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('the nth card of the turn counts cards drawn: the second card each turn is the second of the two', () => {
    const g = main([STUDY], [DRAW_REIGN, SECOND]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.life(0, 21);
    const nths = g.events.flatMap((e) => (e.kind === 'cardDrawn' ? [e.nth] : []));
    expect(nths).toEqual([1, 2]);
  });

  test('"if you do" counts the cards drawn instead of the one: still done', () => {
    const g = main([CAREFUL], [DRAW_REIGN]);
    g.act(0).cast(CAREFUL, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
    g.expect.life(0, 22);
  });

  test('a commander on top of the library asks its owner for the draw it is in; the other draw goes on (CR 903.9b, 614.11a)', () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .battlefield(DRAW_REIGN)
      .library(COMMANDER, { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    // The commander was not drawn; the second of the two draws was.
    g.expect.zone(COMMANDER, 'command', { seat: 0 });
    expect(handSize(g)).toBe(1);
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
    expect(drawn(g)).toBe(1);
  });

  test('miracle reads the first card drawn this turn: the first of the two is offered, the second is not', () => {
    const g = scenario()
      .seat(0)
      .hand(STUDY)
      .battlefield('Island')
      .battlefield(DRAW_REIGN)
      .library(MIRACLE_BEAST)
      .library(MIRACLE_BEAST)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    expect(g.state.pending?.kind === 'confirmOptional' && g.state.pending.purpose).toBe(
      'miracleReveal',
    );
    g.act(0).decline();
    // The second card, also with miracle, was drawn second: not offered.
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    expect(handSize(g)).toBe(2);
  });
});

describe('an empty library (CR 614.11) and a skip of the draw (CR 616.1)', () => {
  test('the replacement applies though the library has no cards: both draws are attempted, and the player loses', () => {
    const g = main([STUDY], [DRAW_REIGN], []);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
    expect(g.events.filter((e) => e.kind === 'drewFromEmptyLibrary')).toHaveLength(2);
    g.expect.hasLost(0);
  });

  test('a library with one card: the first of the two draws takes it, the second tries the empty library', () => {
    const g = main([STUDY], [DRAW_REIGN], ['Plains']);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(handSize(g)).toBe(1);
    expect(g.events.filter((e) => e.kind === 'drewFromEmptyLibrary')).toHaveLength(1);
  });

  test('a skip that applies to the draw as it would happen goes first: the draw is skipped, nothing replaces it, nobody loses', () => {
    const g = main([STUDY], [DRAW_REIGN, WARDEN], []);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'drawReplaced' });
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(1);
    g.expect.hasLost(0, false);
    expect(handSize(g)).toBe(0);
  });

  test('a skip that starts to apply when the library has run out skips the second of the two draws', () => {
    const g = main([STUDY], [DRAW_REIGN, WARDEN], ['Plains']);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'drawReplaced')).toHaveLength(1);
    expect(handSize(g)).toBe(1);
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(1);
    g.expect.hasLost(0, false);
  });
});

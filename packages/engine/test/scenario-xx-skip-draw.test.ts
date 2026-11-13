// "If you would draw a card while your library has no cards in it, skip that draw instead." (D-332) and the condition "there are no cards in your
// library" (D-331): the replacement `skipDraw`, with its `while`, and the plain condition `cardsInLibrary` of a layer 7b / 6 static ability.
// Pins: CR 614.1a (a replacement effect of a permanent), CR 614.11 and 121.6a (an effect that replaces a draw applies even if no cards could be drawn
// because the library is empty), CR 121.6b and 614.11a (a replaced draw within a sequence is completed before the sequence goes on: the other
// draws still happen), CR 121.4 and 704.5b (only a player who attempted a draw from an empty library loses), CR 121.1 (a skipped draw is not a card
// drawn: nothing that triggers on a draw triggers), CR 504.1 (the draw step's draw is replaced too), CR 613.4b (base power and toughness) and
// CR 613.8 / 611.3a (the condition of a static ability is read all the time and reads no characteristic), CR 401.1 (a library is a zone with cards).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-draw.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Hollow Warden'; // 2/5, skips draws and is a 10/10 flying vigilance while the library is empty
const VETO = 'SYNTHETIC Draw Veto'; // skips every draw
const THIN = 'SYNTHETIC Thin Veto'; // skips draws while the library has fewer than three cards
const DRAW3 = 'SYNTHETIC Draw Three Gain Five';
const WATCHER = 'SYNTHETIC Draw Watcher'; // "Whenever you draw a card, you gain 1 life."

/** Seat 0 has `library` cards and casts Draw Three Gain Five (3 mana) with `battlefield` on its side; seat 1 has a full library. */
function castDraw3(library: number, battlefield: readonly string[] = []) {
  const b = scenario()
    .seat(0)
    .life(20)
    .hand(DRAW3)
    .battlefield('Island', { count: 3 })
    .battlefield(...battlefield);
  if (library > 0) b.library('Forest', { count: library });
  const g = b.seat(1).library('Plains', { count: 5 }).build();
  g.act(0).cast(DRAW3, { pay: true });
  return g;
}

describe('the baseline: without the replacement the draw from an empty library loses (CR 121.4)', () => {
  test('an empty library and three draws: the player loses', () => {
    const g = castDraw3(0);
    g.passAll();
    g.expect.hasLost(0);
  });
});

describe('the replacement with a while: "while your library has no cards in it" (CR 614.11, 121.6a)', () => {
  test('an empty library: every draw is skipped, the spell still finishes, and the player does not lose', () => {
    const g = castDraw3(0, [WARDEN]);
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.hasLost(0, false);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
    g.expect.noEvent({ kind: 'cardDrawn' });
    // The three draws were skipped one by one, and the 5 life of the rest of the spell still came.
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    g.expect.life(0, 25);
    g.expect.zone(DRAW3, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('the event names the permanent that replaced the draw', () => {
    const g = castDraw3(0, [WARDEN]);
    g.passAll();
    const skipped = g.events.find((e) => e.kind === 'drawSkipped');
    expect(skipped).toMatchObject({ kind: 'drawSkipped', seat: 0 });
    const source = skipped?.kind === 'drawSkipped' ? skipped.source : null;
    expect(source === null ? null : g.state.objects[source]?.zone).toBe('battlefield');
  });

  test('a library with cards: the condition does not hold and the cards are drawn (CR 121.6a is only for the empty library)', () => {
    const g = castDraw3(3, [WARDEN]);
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 0);
    g.expect.noEvent({ kind: 'drawSkipped' });
    g.expect.hasLost(0, false);
  });

  test('each draw of a sequence is replaced on its own: the cards before the empty library are drawn, the rest skipped (CR 614.11a, 121.6b)', () => {
    const g = castDraw3(1, [WARDEN]);
    g.passAll();
    // The first draw takes the only card; the library is then empty, so the second and third are skipped, and nobody loses.
    g.expect.handSize(0, 1);
    expect(g.events.filter((e) => e.kind === 'cardDrawn')).toHaveLength(1);
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(2);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
    g.expect.hasLost(0, false);
  });

  test("an opponent's permanent does not replace my draws", () => {
    const b = scenario()
      .seat(0)
      .life(20)
      .hand(DRAW3)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .battlefield(WARDEN)
      .library('Plains', { count: 5 });
    const g = b.build();
    g.act(0).cast(DRAW3, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'drawSkipped' });
    g.expect.hasLost(0);
  });

  test('it replaces the draw of the draw step too (CR 504.1), so the active player with no cards does not lose', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .seat(1)
      .library('Plains', { count: 5 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('draw', { turn: 3 });
    g.passAll();
    g.expect.hasLost(0, false);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(1);
    g.expect.handSize(0, 0);
  });

  test('a skipped draw is not a card drawn: "whenever you draw a card" does not trigger (CR 121.1)', () => {
    const g = castDraw3(0, [WARDEN, WATCHER]);
    g.passAll();
    g.expect.life(0, 25); // only the spell's 5: the watcher would add 3 more
    g.expect.noEvent({ kind: 'cardDrawn' });
  });

  test('the same draws are watched when the replacement does not apply', () => {
    const g = castDraw3(3, [WARDEN, WATCHER]);
    g.passAll();
    g.expect.life(0, 28);
  });

  test('"fewer than three cards": the condition compares the number of cards, not only an empty library', () => {
    const skipped = castDraw3(2, [THIN]);
    skipped.passAll();
    skipped.expect.handSize(0, 0);
    skipped.expect.librarySize(0, 2);
    expect(skipped.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    const drawn = castDraw3(3, [THIN]);
    drawn.passAll();
    // Three cards: the first draw is made; then two are left, so the second and the third are skipped.
    drawn.expect.handSize(0, 1);
    drawn.expect.librarySize(0, 2);
    expect(drawn.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(2);
  });
});

describe('the replacement without a condition', () => {
  test('every draw is skipped and the library keeps its cards', () => {
    const g = castDraw3(5, [VETO]);
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.librarySize(0, 5);
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    g.expect.life(0, 25);
  });

  test('two of them skip the draw once (each gets one opportunity, CR 614.5): the draw is not skipped twice', () => {
    const g = castDraw3(0, [VETO, VETO]);
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    g.expect.hasLost(0, false);
  });
});

describe('the condition of the static abilities: "as long as there are no cards in your library" (CR 611.3a, 613.4b)', () => {
  const warden = (
    library: number,
    extra: (b: ReturnType<typeof scenario>) => unknown = () => {},
  ) => {
    const b = scenario().seat(0).battlefield(WARDEN);
    extra(b);
    if (library > 0) b.library('Forest', { count: library });
    return b.seat(1).library('Plains', { count: 3 }).build();
  };

  test('with cards in the library it is a 2/5 with hexproof and nothing else', () => {
    const g = warden(2);
    g.expect.pt(WARDEN, 2, 5);
    g.expect.derived(WARDEN, { keywords: ['hexproof'] });
  });

  test('with no cards in the library it is a 10/10 with flying and vigilance, and still hexproof', () => {
    const g = warden(0);
    g.expect.pt(WARDEN, 10, 10);
    g.expect.derived(WARDEN, { keywords: ['hexproof', 'flying', 'vigilance'] });
  });

  test('it follows the library: drawing the last card turns it back into a 2/5', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .library('Forest')
      .hand('Divination')
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library('Plains', { count: 3 })
      .build();
    g.expect.pt(WARDEN, 2, 5);
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    // One card was drawn (the library is empty now), the second draw was skipped: the creature is the big one.
    g.expect.librarySize(0, 0);
    g.expect.pt(WARDEN, 10, 10);
    g.expect.hasLost(0, false);
  });

  test("another player's library does not count: it reads the library of its controller", () => {
    const g = scenario().seat(0).battlefield(WARDEN).library('Forest').seat(1).build();
    g.expect.pt(WARDEN, 2, 5);
  });
});

describe('validation', () => {
  const withReplacement = (replacement: unknown) => ({
    ...syntheticCard(VETO),
    faces: [{ ...syntheticCard(VETO).faces[0], abilities: [{ kind: 'replacement', replacement }] }],
  });

  test('the fixture cards are valid', () => {
    for (const name of [WARDEN, VETO, THIN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('the while is a plain condition: one that reads characteristics or the object is refused', () => {
    const issues = validateCard(
      withReplacement({
        kind: 'skipDraw',
        while: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 2 },
      }) as never,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.message).join('\n')).toContain('a replacement of a draw');
  });

  test('the comparison of cardsInLibrary is a known one against a whole number', () => {
    for (const compare of [
      { cmp: 'around', value: 1 },
      { cmp: 'atMost', value: 1.5 },
      { cmp: 'atMost' },
    ]) {
      const card = withReplacement({
        kind: 'skipDraw',
        while: { kind: 'cardsInLibrary', compare },
      });
      expect(validateCard(card as never).length, JSON.stringify(compare)).toBeGreaterThan(0);
    }
  });

  test('a plain condition and, or and not of plain conditions are allowed', () => {
    const card = withReplacement({
      kind: 'skipDraw',
      while: {
        kind: 'and',
        terms: [
          { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 0 } },
          { kind: 'not', term: { kind: 'lifeTotal', compare: { cmp: 'atMost', value: 5 } } },
        ],
      },
    });
    expect(validateCard(card as never)).toEqual([]);
  });

  test('the condition cardsInLibrary is allowed on a static ability of layer 4', () => {
    const base = syntheticCard(WARDEN);
    const face = base.faces[0];
    const card = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'static',
              static: { kind: 'setTypes', subject: { kind: 'this' }, types: ['artifact'] },
              condition: { kind: 'cardsInLibrary', compare: { cmp: 'atMost', value: 0 } },
            },
          ],
        },
      ],
    };
    expect(validateCard(card as never)).toEqual([]);
  });
});

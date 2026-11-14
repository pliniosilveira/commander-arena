// "Read ahead" and "Discard any number of cards, then draw that many cards" (D-151): `readAhead` on a Saga and `discard` with `anyNumber`, with the
// `thisWay` amount `discarded`.
// Pins: CR 702.155a and 702.155b, 714.3b (the Saga chooses a number from one to its final chapter and enters with that many lore counters; the
// chapters of the turn it entered trigger only for exactly the number of counters it has), CR 714.3c (a lore counter after that, from the next turn),
// CR 714.4 (sacrificed after its last chapter), CR 701.9 (the player chooses what to discard). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-dragons-saga.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Reading Rite';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const LIBRARY = Array.from({ length: 10 }, () => 'Mountain');

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

const FOUR = ['Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

/** Casts the Saga and answers the chapter it reads ahead to. */
function castReading(g: ReturnType<typeof game>, chapter: string): void {
  g.act(0).cast(RITE, { pay: true });
  g.passAll();
  g.act(0).chooseOption(chapter);
}

const lore = (g: ReturnType<typeof game>): number => g.object(RITE).counters.lore ?? 0;

describe('the card is valid', () => {
  test('the Rite, and the shapes that are refused', () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
    const card = syntheticCard(RITE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withFace = (patch: Record<string, unknown>) =>
      ({ ...card, faces: [{ ...face, ...patch }] }) as never;
    // read ahead belongs to a Saga with chapters
    expect(JSON.stringify(validateCard(withFace({ subtypes: [] })))).toContain('read ahead');
    expect(
      JSON.stringify(
        validateCard(withFace({ abilities: face.abilities.filter((a) => a.kind === 'keyword') })),
      ),
    ).toContain('read ahead');
    // twice is redundant
    const readAhead = face.abilities.find((a) => a.kind === 'keyword');
    expect(
      validateCard(withFace({ abilities: [readAhead, ...face.abilities] })).length,
    ).toBeGreaterThan(0);
    // any number: a count of 0 and nothing else
    const chapter2 = face.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'chapter' && a.trigger.from === 2,
    );
    const discardWith = (effect: unknown) =>
      withFace({
        abilities: face.abilities.map((a) =>
          a === chapter2 && a.kind === 'triggered'
            ? { ...a, effect: { kind: 'sequence', effects: [effect] } }
            : a,
        ),
      });
    const you = { kind: 'you' };
    expect(
      validateCard(discardWith({ kind: 'discard', player: you, count: 0, anyNumber: true })),
    ).toEqual([]);
    expect(
      validateCard(discardWith({ kind: 'discard', player: you, count: 2, anyNumber: true })).length,
    ).toBeGreaterThan(0);
    // "that many" needs a discard before it
    expect(
      validateCard(
        discardWith({ kind: 'draw', player: you, count: { kind: 'thisWay', what: 'discarded' } }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('read ahead: the chapter chosen as the Saga enters', () => {
  test('I am asked for a number from one to the final chapter', () => {
    const g = game((b) => b.hand(RITE).battlefield(...FOUR));
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('option');
    expect(d.options).toEqual(['1', '2', '3']);
    expect(() => g.act(0).chooseOption('4')).toThrow();
    g.expect.pending('chooseOption', 0);
  });

  test('chapter 1: one lore counter, chapter I triggers: 2 damage to each creature and each opponent', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield(...FOUR)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN)
      .build();
    castReading(g, '1');
    expect(lore(g)).toBe(1);
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('chapter 2: two lore counters, only chapter II triggers (chapter I is skipped)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield(...FOUR)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    castReading(g, '2');
    expect(lore(g)).toBe(2);
    g.passAll();
    // chapter I did not trigger: nothing was dealt damage
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    // chapter II: with an empty hand nothing is asked and nothing is drawn
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 0);
  });

  test('chapter 3: three lore counters, only chapter III triggers: a token, and the Saga is sacrificed', () => {
    const g = game((b) => b.hand(RITE).battlefield(...FOUR));
    castReading(g, '3');
    expect(lore(g)).toBe(3);
    g.passAll();
    g.expect.zone('Golem', 'battlefield', { seat: 0 });
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
  });

  test('the next turn it gets one more lore counter and its next chapter triggers', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield(...FOUR)
      .seat(1)
      .library(...LIBRARY)
      .build();
    castReading(g, '1');
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.passAll();
    expect(lore(g)).toBe(2);
    // chapter II ran from the counter of the new turn: I choose what to discard (the card drawn is in the hand)
    g.expect.pending('chooseCards', 0);
    g.expect.invariants();
  });
});

describe('discard any number of cards, then draw that many', () => {
  const chapterII = () =>
    game((b) =>
      b
        .hand(RITE)
        .hand(BEARS)
        .hand(GOBLIN)
        .hand('Forest')
        .battlefield(...FOUR),
    );

  test('I choose how many; I draw as many as I discarded', () => {
    const g = chapterII();
    castReading(g, '2');
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.purpose).toBe('discard');
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    g.act(0).chooseCards(BEARS, GOBLIN);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    // 1 card kept + 2 drawn
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('none is a choice: nothing is drawn', () => {
    const g = chapterII();
    castReading(g, '2');
    g.passAll();
    g.act(0).chooseCards();
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, LIBRARY.length);
  });

  test('all of the hand is allowed', () => {
    const g = chapterII();
    castReading(g, '2');
    g.passAll();
    g.act(0).chooseCards(BEARS, GOBLIN, 'Forest');
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, LIBRARY.length - 3);
  });

  test('more than the hand holds is refused', () => {
    const g = chapterII();
    castReading(g, '2');
    g.passAll();
    expect(() => g.act(0).chooseCards(BEARS, BEARS, GOBLIN, 'Forest')).toThrow();
    g.expect.pending('chooseCards', 0);
  });
});

// Megamorph (CR 702.37b) and a card that returns itself from the graveyard face up or face down when a permanent is turned face up (CR 603.2, 113.6b, 708.2a, 708.3, 702.37e).
// Megamorph: a morph cost that also puts a +1/+1 counter on the permanent as it is turned face up for it. The graveyard trigger: "you may return this card ... face up or face down",
// the controller choosing as the ability resolves; a face-down entry is a 2/2 with no abilities, turned face up later for its morph cost only if it has one.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-megamorph.ts, synthetic-morph.ts).
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const OGRE = 'SYNTHETIC Megamorph Ogre'; // {3}{G} 3/3, megamorph {1}{G}
const RETURNER = 'SYNTHETIC Graveyard Returner'; // {1}{G}{G} 3/3, graveyard: turned face up -> return face up or face down; megamorph {1}{G}
const DOWN_ONLY = 'SYNTHETIC Face-Down Returner'; // {1}{G} 3/3, no morph, graveyard: return face down
const BEAR = 'SYNTHETIC Morph Bear'; // {2}{G}{G} 4/4, morph {1}{G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(mine: (b: Builder) => Builder, seats = 2, active = 0): ScenarioGame {
  let b = mine(
    scenario({ seats })
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  for (let s = 1; s < seats; s++) {
    b = b
      .seat(s)
      .life(20)
      .library(...FILLER);
  }
  return b.at('precombatMain', { active, turn: 3 }).build();
}

describe('the cards are valid and the features supported', () => {
  test('SYNTHETIC cards validate', () => {
    for (const name of [OGRE, RETURNER, DOWN_ONLY]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('ability:megamorph')).toBe(true);
    expect(isFeatureSupported('ability:moveFaceDownMorph')).toBe(true);
  });
});

describe('Megamorph (CR 702.37b)', () => {
  test('turned face up for its megamorph cost, the permanent gets a +1/+1 counter', () => {
    const g = game((b) =>
      b.seat(0).battlefield('Forest', { count: 2 }).battlefield(OGRE, { faceDown: 'morph' }),
    );
    g.expect.pt(OGRE, 2, 2);
    g.act(0).turnFaceUp(OGRE, { pay: true });
    g.expect.counters(OGRE, { '+1/+1': 1 });
    g.expect.pt(OGRE, 4, 4);
    g.expect.invariants();
  });

  test('cast face down for {3} from the hand, then turned up: the counter is put on', () => {
    const g = game((b) => b.seat(0).hand(OGRE).battlefield('Forest', { count: 5 }));
    g.act(0).cast(OGRE, { alternative: 'morph', pay: true });
    g.pass();
    g.pass();
    g.act(0).turnFaceUp(OGRE, { pay: true });
    g.expect.counters(OGRE, { '+1/+1': 1 });
    g.expect.pt(OGRE, 4, 4);
  });

  test('a plain morph permanent gets no counter (CR 702.37e)', () => {
    const g = game((b) =>
      b.seat(0).battlefield('Forest', { count: 2 }).battlefield(BEAR, { faceDown: 'morph' }),
    );
    g.act(0).turnFaceUp(BEAR, { pay: true });
    g.expect.counters(BEAR, {});
    g.expect.pt(BEAR, 4, 4);
  });

  test('a megamorph card turned face up while manifested gets no counter: its megamorph cost was not paid (CR 701.40b)', () => {
    const g = game((b) =>
      b.seat(0).battlefield('Forest', { count: 4 }).battlefield(OGRE, { faceDown: true }),
    );
    g.act(0).turnFaceUp(OGRE, { pay: true });
    g.expect.counters(OGRE, {});
    g.expect.pt(OGRE, 3, 3);
  });
});

describe('"Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down"', () => {
  const turnUp = (extra: (b: Builder) => Builder = (b) => b, seats = 2): ScenarioGame => {
    const g = game(
      (b) =>
        extra(
          b
            .seat(0)
            .graveyard(RETURNER)
            .battlefield('Forest', { count: 2 })
            .battlefield(BEAR, { faceDown: 'morph' }),
        ),
      seats,
    );
    g.act(0).turnFaceUp(BEAR, { pay: true });
    return g;
  };

  test('the trigger works from the graveyard and the controller may decline', () => {
    const g = turnUp();
    g.expect.stack([`${RETURNER} (ability)`]);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(RETURNER, 'graveyard');
    g.expect.invariants();
  });

  test('face up: it returns as the card, with its own characteristics and no face-down status', () => {
    const g = turnUp();
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseOption('face up');
    g.expect.zone(RETURNER, 'battlefield');
    expect(g.object(RETURNER).faceDown).toBeUndefined();
    g.expect.pt(RETURNER, 3, 3);
    g.expect.invariants();
  });

  test('face down: it returns as a 2/2 face-down creature with no abilities (CR 708.2a)', () => {
    const g = turnUp();
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseOption('face down');
    g.expect.zone(RETURNER, 'battlefield');
    expect(g.object(RETURNER).faceDown?.by).toBe('morph');
    g.expect.pt(RETURNER, 2, 2);
    g.expect.derived(RETURNER, { subtypes: [], colors: [] });
    g.expect.invariants();
  });

  test('a card that returned face down can be turned face up for its megamorph cost and gets the counter (CR 702.37e, 702.37b)', () => {
    const g = game((b) =>
      b
        .seat(0)
        .graveyard(RETURNER)
        .battlefield('Forest', { count: 4 })
        .battlefield(BEAR, { faceDown: 'morph' }),
    );
    g.act(0).turnFaceUp(BEAR, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseOption('face down');
    g.act(0).turnFaceUp(RETURNER, { pay: true });
    expect(g.object(RETURNER).faceDown).toBeUndefined();
    g.expect.counters(RETURNER, { '+1/+1': 1 });
    g.expect.pt(RETURNER, 4, 4);
    g.expect.invariants();
  });

  test('a face-down entry of a card with no morph ability cannot be turned face up (CR 702.37e)', () => {
    const g = game((b) =>
      b
        .seat(0)
        .graveyard(DOWN_ONLY)
        .battlefield('Forest', { count: 4 })
        .battlefield(BEAR, { faceDown: 'morph' }),
    );
    g.act(0).turnFaceUp(BEAR, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(g.object(DOWN_ONLY).faceDown?.by).toBe('morph');
    g.expect.illegal(0, { turnFaceUp: DOWN_ONLY });
    g.expect.pt(DOWN_ONLY, 2, 2);
  });

  test("another player's permanent turned face up does not trigger it (the permanent must be yours)", () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .graveyard(RETURNER)
          .seat(1)
          .battlefield('Forest', { count: 2 })
          .battlefield(BEAR, { faceDown: 'morph' }),
      3,
      1,
    );
    g.act(1).turnFaceUp(BEAR, { pay: true });
    g.expect.stack([]);
  });

  test('in a game of four seats it triggers for its own controller only', () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .graveyard(RETURNER)
          .seat(2)
          .graveyard(RETURNER)
          .seat(0)
          .battlefield('Forest', { count: 2 })
          .battlefield(BEAR, { faceDown: 'morph' }),
      4,
    );
    g.act(0).turnFaceUp(BEAR, { pay: true });
    g.expect.stack([`${RETURNER} (ability)`]);
  });
});

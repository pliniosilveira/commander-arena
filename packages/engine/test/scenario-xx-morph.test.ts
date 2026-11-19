// Morph (CR 702.37, 708.4, 708.2, 701.40b, 116.2b, 708.8): "Morph [cost]" lets a card be cast as a 2/2 face-down creature with no text, no name, no subtypes and no mana cost
// by paying {3} rather than its mana cost; the spell has those characteristics on the stack, the permanent it becomes is face down, and any time its controller has priority
// they may turn it face up, a special action, by paying the morph cost; nothing that has to do with entering happens then. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-morph.ts).
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const BEAR = 'SYNTHETIC Morph Bear'; // {2}{G}{G} 4/4, morph {1}{G}
const FLIER = 'SYNTHETIC Morph Flier'; // {3}{U} 1/3 flying, morph {U}
const GIVER = 'SYNTHETIC Morph Giver'; // {2}{W} 1/1, enters: gain 3 life, morph {W}
const STUBBORN = 'SYNTHETIC Morph Stubborn'; // {4}{R} 5/5, can't be countered, morph {R}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return theirs(
    mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', at)
    .build();
}

const lands = (b: Builder, name: string, count: number) => b.battlefield(name, { count });
const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('casting a card face down (CR 702.37a, 702.37c)', () => {
  test('it is offered with the morph alternative when {3} can be paid, not otherwise', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR), 'Forest', 3).seat(0));
    g.expect.legal(0, { cast: BEAR, alternative: 'morph' });
    g.expect.illegal(0, { cast: BEAR }); // {2}{G}{G} needs four mana
    const poor = game((b) => lands(b.seat(0).hand(BEAR), 'Forest', 2).seat(0));
    poor.expect.illegal(0, { cast: BEAR, alternative: 'morph' });
  });

  test('it costs {3} whatever the mana cost is', () => {
    const g = game((b) => lands(b.seat(0).hand(STUBBORN), 'Mountain', 3).seat(0));
    g.act(0).cast(STUBBORN, { alternative: 'morph', pay: true });
    g.expect.tapped('Mountain[0]');
    g.expect.tapped('Mountain[1]');
    g.expect.tapped('Mountain[2]');
    g.expect.invariants();
  });

  test('the spell on the stack is a face-down 2/2 creature with no name, no mana cost and no text (CR 708.4)', () => {
    const g = game((b) => lands(b.seat(0).hand(FLIER), 'Island', 3).seat(0));
    g.act(0).cast(FLIER, { alternative: 'morph', pay: true });
    expect(g.object(FLIER).faceDown?.by).toBe('morph');
    g.expect.derived(FLIER, { types: ['creature'], subtypes: [], colors: [], keywords: [] });
    g.expect.pt(FLIER, 2, 2);
    g.expect.invariants();
  });

  test('it resolves into a face-down permanent: a 2/2 with no abilities, and its enters ability does not trigger (CR 708.4, 708.3)', () => {
    const g = game((b) => lands(b.seat(0).hand(GIVER), 'Plains', 3).seat(0));
    g.act(0).cast(GIVER, { alternative: 'morph', pay: true });
    resolveTop(g);
    g.expect.stack([]);
    expect(g.object(GIVER).faceDown?.by).toBe('morph');
    expect(g.object(GIVER).zone).toBe('battlefield');
    g.expect.pt(GIVER, 2, 2);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('a face-down permanent has none of the abilities of the card', () => {
    const g = game((b) => lands(b.seat(0).hand(FLIER), 'Island', 3).seat(0));
    g.act(0).cast(FLIER, { alternative: 'morph', pay: true });
    resolveTop(g);
    g.expect.derived(FLIER, { keywords: [] });
  });

  test('the same card cast face up enters as itself and its trigger works', () => {
    const g = game((b) => lands(b.seat(0).hand(GIVER), 'Plains', 3).seat(0));
    g.act(0).cast(GIVER, { pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.object(GIVER).faceDown).toBeUndefined();
    g.expect.life(0, 23);
  });

  test('a face-down spell has no text, so it can be countered even if the card says it cannot (CR 708.4)', () => {
    const g = game(
      (b) => lands(b.seat(0).hand(STUBBORN), 'Mountain', 3).seat(0),
      (b) => b.seat(1).hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(STUBBORN, { alternative: 'morph', pay: true });
    const spell = g.id(STUBBORN);
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [spell], pay: true });
    resolveTop(g);
    expect(g.find({ name: STUBBORN, zone: 'graveyard' }).length).toBe(1);
    expect(g.find({ name: STUBBORN, zone: 'graveyard' })[0]?.faceDown).toBeUndefined();
    g.expect.invariants();
  });

  test('the same card cast face up cannot be countered', () => {
    const g = game(
      (b) => lands(b.seat(0).hand(STUBBORN), 'Mountain', 5).seat(0),
      (b) => b.seat(1).hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(STUBBORN, { pay: true });
    const spell = g.id(STUBBORN);
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [spell], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.object(STUBBORN).zone).toBe('battlefield'); // the Counterspell did nothing
  });
});

describe('turning it face up (CR 702.37e, 116.2b, 708.8)', () => {
  test('for the morph cost, as a special action: the same object, face up, nothing enters', () => {
    const g = game((b) =>
      lands(b.seat(0).battlefield(GIVER, { faceDown: 'morph' }), 'Plains', 1).seat(0),
    );
    const id = g.id(GIVER);
    g.expect.legal(0, { turnFaceUp: GIVER });
    g.act(0).turnFaceUp(GIVER, { pay: true });
    expect(g.id(GIVER)).toBe(id);
    expect(g.object(GIVER).faceDown).toBeUndefined();
    g.expect.pt(GIVER, 1, 1);
    g.expect.stack([]);
    g.expect.life(0, 20); // its enters trigger does not happen
    g.expect.invariants();
  });

  test('it costs the morph cost, not the mana cost', () => {
    const g = game((b) =>
      lands(b.seat(0).battlefield(BEAR, { faceDown: 'morph' }), 'Forest', 1).seat(0),
    );
    g.expect.illegal(0, { turnFaceUp: BEAR }); // {1}{G} needs two mana
    const two = game((b) =>
      lands(b.seat(0).battlefield(BEAR, { faceDown: 'morph' }), 'Forest', 2).seat(0),
    );
    two.act(0).turnFaceUp(BEAR, { pay: true });
    two.expect.pt(BEAR, 4, 4);
  });

  test('a card with its abilities back after turning up', () => {
    const g = game((b) =>
      lands(b.seat(0).battlefield(FLIER, { faceDown: 'morph' }), 'Island', 1).seat(0),
    );
    g.act(0).turnFaceUp(FLIER, { pay: true });
    g.expect.derived(FLIER, { subtypes: ['Bird'], colors: ['U'] });
    g.expect.derived(FLIER, { keywords: ['flying'] });
  });

  test('not by the player who does not control it', () => {
    const g = game(
      (b) => b.seat(0),
      (b) => lands(b.seat(1).battlefield(BEAR, { faceDown: 'morph' }), 'Forest', 2).seat(1),
    );
    g.expect.illegal(0, { turnFaceUp: BEAR });
  });

  test('a face-down permanent cast with morph and cast over a full game: cast, resolve, turn up', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR), 'Forest', 5).seat(0));
    g.act(0).cast(BEAR, { alternative: 'morph', pay: true });
    resolveTop(g);
    g.expect.pt(BEAR, 2, 2);
    g.act(0).turnFaceUp(BEAR, { pay: true });
    g.expect.pt(BEAR, 4, 4);
    g.expect.invariants();
  });
});

describe('validation and what the other player sees', () => {
  test('the synthetic morph cards are valid and the feature is supported', () => {
    for (const name of [BEAR, FLIER, GIVER, STUBBORN]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('castAlternative:morph')).toBe(true);
  });

  test('morph on a card that is not a creature is refused', () => {
    const base = syntheticCard('SYNTHETIC Foretell Insight');
    const bad = {
      ...base,
      faces: base.faces.map((f) => ({
        ...f,
        alternativeCosts: [{ kind: 'morph', cost: [{ kind: 'mana', symbols: ['R'] }] }],
      })),
    };
    expect(JSON.stringify(validateCard(bad as typeof base))).toContain('morph is on a creature');
  });

  test('the opponent sees a face-down spell and permanent as a nameless 2/2, the controller sees the card', () => {
    const g = game((b) => lands(b.seat(0).hand(FLIER), 'Island', 3).seat(0));
    g.act(0).cast(FLIER, { alternative: 'morph', pay: true });
    const id = g.id(FLIER);
    const theirs = getView(g.state, 1).stack.find((o) => o.id === id);
    expect(theirs?.name).toMatch(/^Face-down creature/);
    expect(theirs?.hiddenFace).toBeUndefined();
    expect(JSON.stringify(theirs)).not.toContain('SYNTHETIC Morph Flier');
    const mine = getView(g.state, 0).stack.find((o) => o.id === id);
    expect(mine?.hiddenFace?.name).toBe(FLIER);
    resolveTop(g);
    const down = getView(g.state, 1).battlefield.find((o) => o.faceDown === true);
    expect(down?.name).toMatch(/^Face-down creature/);
    expect(JSON.stringify(down)).not.toContain('SYNTHETIC Morph Flier');
  });
});

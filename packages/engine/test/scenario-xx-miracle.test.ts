// Miracle (CR 702.94, D-971): "You may reveal this card from your hand as you draw it if it's the first card you've drawn
// this turn. When you reveal this card this way, you may cast it by paying [cost] rather than its mana cost."
// Pins: CR 702.94a (the reveal is a choice made as the card is drawn; the trigger; the cast is a second choice), 702.94b
// (the card is revealed until the ability resolves), 121.1 (a card drawn), 118.9 (alternative cost), 107.3a (an X in the
// miracle cost is announced as the spell is cast), 608.2g (cast during a resolution: no priority, no timing), 903.9b (a
// commander that goes to the command zone is not drawn), 603.11 (a static ability linked to a triggered one). Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-miracle.ts).
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, stateHash, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const HOST = 'SYNTHETIC Miracle Host'; // {X}{X}{W}{W}{W} sorcery, X 4/4 Angels with flying, miracle {X}{W}{W}
const BOLT = 'SYNTHETIC Miracle Bolt'; // {1}{R} instant, 3 damage to target creature, miracle {R}
const BEAST = 'SYNTHETIC Miracle Beast'; // {4}{G} 4/4, miracle {G}
const COMMANDER = 'SYNTHETIC Miracle Commander'; // {2}{W} legendary 3/3, miracle {W}
const DIGGING = 'SYNTHETIC Careful Digging'; // {1}{U} sorcery, draw two cards, then discard two cards
const TWIN = 'SYNTHETIC Twin Draw'; // {1}{U} sorcery, draw two cards
const GIFT = 'SYNTHETIC Generous Gift'; // {U} instant, target opponent draws a card
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** The draw step of seat 0's turn 3, with `top` on top of the library; `lands` is what seat 0 controls. */
function drawStep(top: string, lands: (b: Builder) => Builder, hand: readonly string[] = []) {
  const mine = lands(
    scenario()
      .seat(0)
      .life(20)
      .hand(...hand),
  );
  const g = mine
    .library(top)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('upkeep', { active: 0, turn: 3 })
    .build();
  g.passAll();
  return g;
}

const plains = (n: number) => (b: Builder) => b.battlefield('Plains', { count: n });

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** Seat 0 holds `spell` and casts it in the precombat main phase of turn 3 with nothing drawn yet this turn. */
function mainPhase(spell: string, top: readonly string[], lands: (b: Builder) => Builder) {
  const mine = lands(scenario().seat(0).life(20).hand(spell));
  let b = mine;
  for (const name of top) b = b.library(name);
  const g = b
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(spell, { pay: true });
  return g;
}

describe('the reveal: a choice made as the card is drawn (CR 702.94a)', () => {
  test('the first card drawn in the draw step, with miracle, asks its owner whether to reveal it', () => {
    const g = drawStep(HOST, plains(5));
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    expect(d.purpose).toBe('miracleReveal');
    expect(d.seat).toBe(0);
    expect(d.subject).toBe(g.find({ name: HOST, zone: 'hand' })[0]?.id);
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['X', 'W', 'W'] }]);
    // The card is in the hand and was drawn; nobody has priority yet (CR 504.1, the step goes on after the answer).
    g.expect.zone(HOST, 'hand', { seat: 0 });
    g.expect.eventLog([{ kind: 'cardDrawn', seat: 0, nth: 1 }]);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('declining reveals nothing: no trigger, no event, priority in the draw step, the card stays hidden', () => {
    const g = drawStep(HOST, plains(5));
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.noEvent({ kind: 'miracleRevealed' });
    g.expect.pending('priority', 0);
    expect(g.state.turn.step).toBe('draw');
    g.expect.zone(HOST, 'hand', { seat: 0 });
    // The opponent cannot tell it from any card of the hand.
    const theirs = getView(g.state, 1).seats[0]?.hand;
    expect(JSON.stringify(theirs ?? null)).not.toContain(HOST);
  });

  test('revealing is public and puts the trigger on the stack, where the opponent sees the card (CR 702.94b)', () => {
    const g = drawStep(HOST, plains(5));
    g.act(0).accept();
    g.expect.eventLog([
      { kind: 'cardsRevealed', seat: 0, names: [HOST], from: 'hand' },
      { kind: 'miracleRevealed', seat: 0 },
    ]);
    g.expect.stack([`${HOST} (ability)`]);
    g.expect.pending('priority', 0);
    const stack = getView(g.state, 1).stack;
    expect(stack).toHaveLength(1);
    expect(stack[0]?.controller).toBe(0);
    expect(stack[0]?.abilitySource).toBe(g.find({ name: HOST, zone: 'hand' })[0]?.id);
    expect(stack[0]?.name).toContain(HOST);
  });

  test('a card without miracle is drawn with no question', () => {
    const g = drawStep('Grizzly Bears', plains(5));
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('only the first card drawn this turn can be revealed: the second is drawn with no question', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(TWIN)
      .battlefield('Island', { count: 2 })
      .library('Grizzly Bears')
      .library(BEAST)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll(); // the draw step draws Grizzly Bears: the first card
    g.advanceTo('precombatMain');
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(BEAST, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.stack([]);
  });

  test('a draw that was replaced is not a card drawn: the commander goes to the command zone, the next draw is the first', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(TWIN)
      .battlefield('Island', { count: 2 })
      .library('Isamaru, Hound of Konda', { commander: true })
      .library(BEAST)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.advanceTo('precombatMain');
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    // Twin Draw draws BEAST (the first card drawn this turn: asked) and then a filler card.
    g.expect.pending('confirmOptional', 0);
    expect(g.state.pending?.kind === 'confirmOptional' && g.state.pending.purpose).toBe(
      'miracleReveal',
    );
  });

  test('a commander with miracle on top of the library: the command zone question comes first, then the reveal', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Plains', { count: 2 })
      .library(COMMANDER, { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.stack([`${COMMANDER} (ability)`]);
  });

  test('a commander with miracle that went to the command zone was not drawn: nothing to reveal', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Plains', { count: 2 })
      .library(COMMANDER, { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).sendToCommandZone();
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.zone(COMMANDER, 'command', { seat: 0 });
  });
});

describe('the cast: "you may cast it by paying [cost] rather than its mana cost" (CR 702.94a)', () => {
  test('resolving the trigger asks again, with the miracle cost; accepting casts the card from the hand with that cost', () => {
    const h = drawStep(BEAST, (b) => b.battlefield('Forest'));
    h.act(0).accept();
    resolveTop(h);
    const d = h.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    expect(d.purpose).toBe('miracle');
    expect(d.seat).toBe(0);
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['G'] }]);
    expect(d.subject).toBe(h.find({ name: BEAST, zone: 'hand' })[0]?.id);
    h.act(0).accept();
    h.expect.pending('payMana', 0);
    h.act(0).payAuto();
    // CR 608.2g: no player received priority; the spell is on the stack and the ability is done.
    h.expect.stack([BEAST]);
    h.expect.eventLog([{ kind: 'spellCast', seat: 0, fromZone: 'hand', alternative: 'miracle' }]);
    expect(getView(h.state, 1).stack[0]?.alternative).toBe('miracle');
    h.expect.invariants();
    resolveTop(h);
    h.expect.zone(BEAST, 'battlefield', { seat: 0 });
  });

  test('declining the cast leaves the card in the hand', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest'));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(BEAST, 'hand', { seat: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('it can be taken back while paying: the question comes back', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest'));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.act(0).cancel();
    g.expect.pending('confirmOptional', 0);
    g.expect.zone(BEAST, 'hand', { seat: 0 });
    g.act(0).decline();
    g.expect.zone(BEAST, 'hand', { seat: 0 });
  });

  test('without the mana for the miracle cost nothing is asked: the card stays in the hand', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Plains', { count: 3 }));
    g.act(0).accept();
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(BEAST, 'hand', { seat: 0 });
    g.expect.stack([]);
  });

  test('the miracle cast is never offered as an ordinary cast from the hand, and the view lists no such cost', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest', { count: 5 }));
    g.act(0).decline();
    const card = getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === BEAST);
    expect(card?.alternativeCosts).toBeUndefined();
    g.expect.illegal(0, { cast: BEAST, alternative: 'miracle' });
  });

  test('the spell is cast at once with no timing restriction: a sorcery on the opponent’s turn, a creature in the draw step', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest'));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    expect(g.state.turn.step).toBe('draw');
    g.expect.stack([BEAST]);
  });

  test('a spell with a target: the target is chosen as it is cast (CR 601.2c)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain')
      .library(BOLT)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears')
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseTargets('Grizzly Bears');
    g.act(0).payAuto();
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('a spell with a target and none to choose cannot be cast: nothing is asked', () => {
    const g = drawStep(BOLT, (b) => b.battlefield('Mountain'));
    g.act(0).accept();
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
  });
});

describe('X in the miracle cost (CR 107.3a)', () => {
  test('X is announced as the spell is cast: the largest X is what the lands can pay, and the Angels come as the spell resolves', () => {
    const g = drawStep(HOST, plains(5));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`pending ${d?.kind}`);
    // {X}{W}{W} with five Plains: X up to 3.
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    g.act(0).chooseX(2);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.stack([HOST]);
    expect(getView(g.state, 1).stack[0]?.x).toBe(2);
    expect(
      g.state.battlefield.filter(
        (id) => g.state.objects[id]?.controller === 0 && g.state.objects[id]?.tapped,
      ),
    ).toHaveLength(4);
    g.expect.invariants();
    resolveTop(g);
    expect(g.find({ name: 'Angel', zone: 'battlefield' })).toHaveLength(2);
    g.expect.zone(HOST, 'graveyard', { seat: 0 });
  });

  test('X can be 0: the spell resolves and makes no token', () => {
    const g = drawStep(HOST, plains(3));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseX(0);
    g.act(0).payAuto();
    g.expect.stack([HOST]);
    resolveTop(g);
    expect(g.find({ name: 'Angel', zone: 'battlefield' })).toHaveLength(0);
    g.expect.zone(HOST, 'graveyard', { seat: 0 });
  });

  test('when the lands pay {W}{W} and nothing more, X can only be 0 and is not asked', () => {
    const g = drawStep(HOST, plains(2));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    resolveTop(g);
    expect(g.find({ name: 'Angel', zone: 'battlefield' })).toHaveLength(0);
    g.expect.zone(HOST, 'graveyard', { seat: 0 });
  });

  test('the ordinary cast of the same card costs {X}{X}{W}{W}{W}: its X counts twice, the miracle X once', () => {
    const g = drawStep(HOST, plains(5));
    g.act(0).decline();
    g.advanceTo('precombatMain');
    g.act(0).cast(HOST);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`pending ${d?.kind}`);
    expect(d.max).toBe(1); // 5 lands: 3 for the colors, 2 left, one X costs 2
  });

  test('without the {W}{W} nothing is asked', () => {
    const g = drawStep(HOST, (b) => b.battlefield('Plains', { count: 1 }));
    g.act(0).accept();
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(HOST, 'hand', { seat: 0 });
  });
});

describe('a card drawn by a resolving spell (CR 702.94a: "as you draw it")', () => {
  test('the question comes between the two draws of one spell, and the second card is drawn after the answer', () => {
    const g = mainPhase(TWIN, [BEAST], (b) => b.battlefield('Island', { count: 2 }));
    resolveTop(g);
    g.expect.pending('confirmOptional', 0);
    g.expect.handSize(0, 1);
    g.act(0).accept();
    g.expect.handSize(0, 2);
    // The trigger goes on the stack once the spell has finished resolving.
    g.expect.stack([`${BEAST} (ability)`]);
  });

  test('declining while drawing two cards: both are drawn, no trigger', () => {
    const g = mainPhase(TWIN, [BEAST], (b) => b.battlefield('Island', { count: 2 }));
    resolveTop(g);
    g.act(0).decline();
    g.expect.handSize(0, 2);
    // The events are public: a decline that left one would tell the opponent the card has miracle.
    g.expect.noEvent({ kind: 'optionalAnswered' });
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('revealed, then discarded by the same spell: the trigger finds no card in the hand and nothing is asked', () => {
    const g = mainPhase(DIGGING, [BEAST], (b) => b.battlefield('Island', { count: 2 }));
    resolveTop(g);
    g.act(0).accept();
    // The hand holds exactly the two cards drawn, so both are discarded without a choice.
    g.expect.zone(BEAST, 'graveyard', { seat: 0 });
    g.expect.stack([`${BEAST} (ability)`]);
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'spellCast', alternative: 'miracle' });
  });

  test('another player’s draw: its owner is asked, and the trigger and the cast are theirs', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(GIFT)
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Forest')
      .library(BEAST)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(GIFT, { pay: true, targets: [{ player: 1 }] });
    resolveTop(g);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.stack([`${BEAST} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.controller).toBe(1);
    resolveTop(g);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.stack([BEAST]);
    resolveTop(g);
    g.expect.zone(BEAST, 'battlefield', { seat: 1 });
  });
});

describe('what the player can answer, and whose turn it is', () => {
  test('both questions are answered yes or no and nothing else: Cancel is not offered', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest'));
    expect(
      g
        .legalActions(0)
        .map((a) => a.kind)
        .filter((kind) => kind !== 'concede')
        .sort(),
    ).toEqual(['acceptOptional', 'declineOptional']);
    g.act(0).accept();
    resolveTop(g);
    expect(
      g
        .legalActions(0)
        .map((a) => a.kind)
        .filter((kind) => kind !== 'concede')
        .sort(),
    ).toEqual(['acceptOptional', 'declineOptional']);
  });

  // Known limit (D-971, docs/ROADMAP.md): priority is not a pending decision, so `decidingSeat` set in the draw step tells an observer that
  // the card drawn has miracle. Nothing else of the question is in the other player's view (no `pending`, no card).
  test('the other player is not asked and sees no question; decidingSeat shows seat 0 is deciding (known limit)', () => {
    const g = drawStep(BEAST, (b) => b.battlefield('Forest'));
    const theirs = getView(g.state, 1);
    expect(theirs.pending).toBeNull();
    expect(theirs.decidingSeat).toBe(0);
    expect(theirs.waitingOn).toBeUndefined();
    expect(g.legalActions(1)).toEqual([]);
  });

  test('the draw step of the opponent’s turn asks the opponent, and their sorcery is cast in the draw step', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Plains', { count: 5 })
      .library(HOST)
      .library(...FILLER)
      .at('upkeep', { active: 1, turn: 4 })
      .build();
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.stack([`${HOST} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.name).toContain(HOST);
    resolveTop(g);
    g.act(1).accept();
    g.act(1).chooseX(1);
    g.act(1).payAuto();
    expect(g.state.turn.step).toBe('draw');
    g.expect.stack([HOST]);
    resolveTop(g);
    expect(g.find({ name: 'Angel', zone: 'battlefield' })).toHaveLength(1);
  });

  test('the first turn of the game has no draw for the starting player: nothing to reveal', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Plains', { count: 5 })
      .library(HOST)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 1 })
      .build();
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardDrawn' });
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('a card that reaches the hand some other way than being drawn is not offered', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand('Grizzly Bears')
      .battlefield('Plains', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.pending('priority', 0);
    // Nothing in the hand is drawn: the question exists only after a `cardDrawn` event.
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });
});

describe('determinism and the state hash', () => {
  test('the same plays give the same hash', () => {
    const run = () => {
      const g = drawStep(HOST, plains(5));
      g.act(0).accept();
      resolveTop(g);
      g.act(0).accept();
      g.act(0).chooseX(1);
      return g;
    };
    expect(stateHash(run().state)).toBe(stateHash(run().state));
  });
});

describe('validation and support', () => {
  const withAlt = (alt: unknown, types: readonly string[] = ['sorcery']) => {
    const base = syntheticCard(HOST);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, types, alternativeCosts: [alt] }] } as never;
  };

  test('the synthetic shapes are valid and the feature is supported', () => {
    for (const name of [HOST, BOLT, BEAST, COMMANDER, DIGGING, TWIN, GIFT]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('castAlternative:miracle')).toBe(true);
  });

  test('an X is allowed in a miracle cost, and in no other named alternative cost', () => {
    const cost = [{ kind: 'mana', symbols: ['X', 'W'] }];
    expect(validateCard(withAlt({ kind: 'miracle', cost }))).toEqual([]);
    expect(JSON.stringify(validateCard(withAlt({ kind: 'madness', cost })))).toContain(
      'X in an alternative cost',
    );
  });

  test.each([
    [
      'a cost that is not mana',
      { kind: 'miracle', cost: [{ kind: 'payLife', amount: 2 }] },
      'mana only',
    ],
    ['an empty cost', { kind: 'miracle', cost: [] }, ''],
  ])('refuses %s', (_name, alt, reason) => {
    const issues = validateCard(withAlt(alt));
    expect(issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(issues)).toContain(reason);
  });

  test('a land cannot have miracle (a land is played, never cast)', () => {
    const issues = validateCard(
      withAlt({ kind: 'miracle', cost: [{ kind: 'mana', symbols: ['W'] }] }, ['land']),
    );
    expect(JSON.stringify(issues)).toContain('miracle is on a spell, not on a land');
  });

  test('two miracle costs on one face are refused', () => {
    const base = syntheticCard(HOST);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const one = { kind: 'miracle', cost: [{ kind: 'mana', symbols: ['W'] }] };
    const card = { ...base, faces: [{ ...face, alternativeCosts: [one, one] }] } as never;
    expect(validateCard(card).length).toBeGreaterThan(0);
  });

  // CR 702.94a: the engine reads the miracle cost of the front face only, so another face with one is refused (D-971).
  test('a miracle cost on a face other than the front face is refused, on the front face it is valid', () => {
    const base = syntheticCard(HOST);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const miracle = { kind: 'miracle', cost: [{ kind: 'mana', symbols: ['W'] }] };
    const { alternativeCosts: _own, ...plain } = face;
    const withCosts = (costs: unknown[] | undefined) =>
      costs === undefined ? plain : { ...plain, alternativeCosts: costs };
    const two = (front: unknown[] | undefined, back: unknown[] | undefined) =>
      ({
        ...base,
        layout: 'modal_dfc',
        faces: [withCosts(front), withCosts(back)],
      }) as never;
    expect(validateCard(two([miracle], undefined))).toEqual([]);
    const issues = validateCard(two(undefined, [miracle]));
    expect(JSON.stringify(issues)).toContain('miracle on a face other than the front face');
    expect(JSON.stringify(issues)).toContain('faces[1].alternativeCosts');
  });
});

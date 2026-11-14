// "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard." (D-396)
// Pins: CR 701.20a (to reveal a card is to show it to all players, so every card of the top is public, unlike a look, CR 701.20e), CR 701.20b (revealing does not move a card:
// all of them are still in the library while the player chooses), CR 401.5 / 401.2 (the cards below the revealed ones stay hidden), CR 404.1 (the rest go into the
// graveyard). The `lookAtTop` effect with `revealAll`, in a sorcery, an enters trigger, an activated ability with a sacrifice cost and a sorcery that also creates a token.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g1a.ts) or basic lands and real fixtures.
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_DANITHA_G1A_LIST } from '../src/cards/fixtures/synthetic-danitha-g1a';
import {
  applyAction,
  type CardDefinition,
  type Effect,
  type GameEvent,
  getView,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { graveyardNames, handNames, kinds, libraryNames } from './scry-helpers';

const SORCERY = 'SYNTHETIC Reveal Five Sorcery';
const SCOUT = 'SYNTHETIC Reveal Four Scout';
const VESSEL = 'SYNTHETIC Reveal Four Vessel';
const SPAWN = 'SYNTHETIC Reveal Four Permanent Spawn';
const SPELLS = 'SYNTHETIC Reveal Three Spells';
const LOOK = 'SYNTHETIC Look Five Sorcery';

/** The top of seat 0's library, the five cards a, b, c, d, e (Island, Grizzly Bears, Lightning Bolt, Serra Angel, Forest), and below them two more (z1, z2). */
const TOP = ['Island', 'Grizzly Bears', 'Lightning Bolt', 'Serra Angel', 'Forest'];
const BELOW = ['Swamp', 'Plains'];
const LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function game(
  card: string,
  where: 'hand' | 'battlefield' = 'hand',
  top: readonly string[] = TOP,
  below: readonly string[] = BELOW,
): ScenarioGame {
  let b = scenario().seat(0);
  b = where === 'hand' ? b.hand(card) : b.battlefield(card);
  b = b.pool('GCC');
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  for (const [i, name] of below.entries()) b = b.library(name, { label: `z${i + 1}` });
  return b
    .seat(1)
    .library('Llanowar Elves')
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

/** Cast the spell and let it resolve: the first question is pending. */
function cast(card: string, top?: readonly string[], below?: readonly string[]): ScenarioGame {
  const g = game(card, 'hand', top, below);
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

const revealed = (events: readonly GameEvent[]) =>
  events.filter(
    (e): e is Extract<GameEvent, { kind: 'cardsRevealed' }> => e.kind === 'cardsRevealed',
  );

describe('the cards revealed (CR 701.20a)', () => {
  test('all five are revealed to everyone as the effect starts, before the question, and none is moved yet (CR 701.20b)', () => {
    const g = game(SORCERY);
    const mark = g.mark();
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    const events = g.eventsSince(mark);
    expect(revealed(events)).toHaveLength(1);
    expect(revealed(events)[0]).toMatchObject({
      kind: 'cardsRevealed',
      seat: 0,
      names: TOP,
      from: 'library',
    });
    expect(kinds(events)).not.toContain('topCardsLooked');
    // Still in the library, in order, with the cards below them.
    expect(libraryNames(g)).toEqual([...TOP, ...BELOW]);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.looked).toEqual(['a', 'b', 'c', 'd', 'e'].map((l) => g.id(l)));
    // A creature or enchantment card: Grizzly Bears and Serra Angel.
    expect(d.legal).toEqual([g.id('b'), g.id('d')]);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(true);
    expect(d.prompt).toContain('Reveal the top 5 cards of your library');
    expect(d.prompt).toContain('You may put a card that matches from among them into your hand');
    expect(d.prompt).not.toContain('reveal a card');
    expect(d.prompt).toContain('the rest go into your graveyard');
  });

  test('the card taken goes to the hand, the other four into the graveyard, and nothing is revealed again', () => {
    const g = cast(SORCERY);
    const mark = g.mark();
    g.act(0).chooseCards('d');
    expect(handNames(g)).toEqual(['Serra Angel']);
    expect(graveyardNames(g).sort()).toEqual(
      [SORCERY, 'Island', 'Grizzly Bears', 'Lightning Bolt', 'Forest'].sort(),
    );
    expect(libraryNames(g)).toEqual(BELOW);
    const events = g.eventsSince(mark);
    expect(kinds(events)).not.toContain('cardsRevealed');
    expect(kinds(events)).not.toContain('topCardsLooked');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('"you may": taking none puts all five into the graveyard', () => {
    const g = cast(SORCERY);
    g.act(0).chooseCards();
    expect(handNames(g)).toEqual([]);
    expect(graveyardNames(g)).toHaveLength(6);
    expect(libraryNames(g)).toEqual(BELOW);
    g.expect.invariants();
  });

  test('no card of the kind: nobody is asked, all five are still revealed, and all go into the graveyard', () => {
    const g = game(SORCERY, 'hand', ['Island', 'Forest', 'Lightning Bolt', 'Swamp', 'Plains']);
    const mark = g.mark();
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    const events = g.eventsSince(mark);
    expect(revealed(events)).toHaveLength(1);
    expect(revealed(events)[0]?.names).toEqual([
      'Island',
      'Forest',
      'Lightning Bolt',
      'Swamp',
      'Plains',
    ]);
    expect(handNames(g)).toEqual([]);
    expect(graveyardNames(g)).toHaveLength(6);
    g.expect.invariants();
  });

  test('a library of three: those three are revealed and the one that matches may be taken', () => {
    const g = cast(SORCERY, ['Island', 'Serra Angel', 'Forest'], []);
    expect(chooseCardsDecision(g).looked).toHaveLength(3);
    g.act(0).chooseCards('b');
    expect(handNames(g)).toEqual(['Serra Angel']);
    expect(libraryNames(g)).toEqual([]);
    expect(graveyardNames(g)).toHaveLength(3);
  });

  test('an empty library: nothing is revealed and nothing happens', () => {
    const g = game(SORCERY, 'hand', [], []);
    const mark = g.mark();
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(mark))).toEqual([]);
    g.expect.pending('priority', 0);
    expect(graveyardNames(g)).toEqual([SORCERY]);
  });

  test('only a card of the kind, and at most one, is a legal answer', () => {
    const g = cast(SORCERY);
    const before = g.hash();
    for (const objects of [
      [g.id('a')],
      [g.id('c')],
      [g.id('b'), g.id('d')],
      [g.id('z1')],
      [g.id('b'), g.id('b')],
    ]) {
      const r = applyAction(g.state, 0, { kind: 'chooseCards', objects });
      expect(r.ok, JSON.stringify(objects)).toBe(false);
    }
    expect(applyAction(g.state, 1, { kind: 'chooseCards', objects: [g.id('b')] }).ok).toBe(false);
    expect(g.hash()).toBe(before);
  });
});

describe('the other shapes', () => {
  test('an enters trigger: four are revealed and a land may be taken', () => {
    const g = game(SCOUT);
    const mark = g.mark();
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(mark))[0]?.names).toEqual(TOP.slice(0, 4));
    const d = chooseCardsDecision(g);
    expect(d.looked).toHaveLength(4);
    expect(d.legal).toEqual([g.id('a')]);
    g.act(0).chooseCards('a');
    expect(handNames(g)).toEqual(['Island']);
    expect(graveyardNames(g).sort()).toEqual(
      ['Grizzly Bears', 'Lightning Bolt', 'Serra Angel'].sort(),
    );
    // The fifth card was never revealed.
    expect(libraryNames(g)).toEqual(['Forest', ...BELOW]);
    g.expect.zone(SCOUT, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an activated ability with a sacrifice cost: the permanent is sacrificed, then the top four are revealed (five kinds)', () => {
    const g = game(VESSEL, 'battlefield');
    g.act(0).activate(VESSEL, { pay: true });
    g.expect.zone(VESSEL, 'graveyard', { seat: 0 });
    const mark = g.mark();
    g.passAll();
    expect(revealed(g.eventsSince(mark))[0]?.names).toEqual(TOP.slice(0, 4));
    // Island (land), Grizzly Bears and Serra Angel (creatures) match; Lightning Bolt does not.
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a'), g.id('b'), g.id('d')]);
    g.act(0).chooseCards('b');
    expect(handNames(g)).toEqual(['Grizzly Bears']);
    g.expect.invariants();
  });

  test('a permanent card (a card with one of the six permanent types) and then a token', () => {
    const g = cast(SPAWN);
    // Lightning Bolt is an instant, the one card of the four that is no permanent card.
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a'), g.id('b'), g.id('d')]);
    g.act(0).chooseCards('d');
    expect(handNames(g)).toEqual(['Serra Angel']);
    expect(graveyardNames(g)).toContain('Lightning Bolt');
    g.expect.zone('Eldrazi Spawn', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an instant or sorcery card: three are revealed, and a permanent card is not a legal choice', () => {
    const g = cast(SPELLS);
    expect(chooseCardsDecision(g).looked).toHaveLength(3);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('c')]);
    g.act(0).chooseCards('c');
    expect(handNames(g)).toEqual(['Lightning Bolt']);
  });

  test('every card of the slice is a valid card definition', () => {
    expect(SYNTHETIC_DANITHA_G1A_LIST).toHaveLength(6);
    for (const card of SYNTHETIC_DANITHA_G1A_LIST)
      expect(validateCard(card), card.name).toEqual([]);
  });
});

describe('hidden information: a reveal is public, a look is not (CR 701.20a, 701.20e)', () => {
  test('the other seat is told every card revealed (its names, in the log), and not the card below them', () => {
    const g = cast(SORCERY);
    const text = JSON.stringify(getView(g.state, 1));
    expect(g.view(1).waitingOn).toEqual({ seat: 0, purpose: 'lookTake', sourceName: SORCERY });
    expect(g.view(1).pendingCards).toBeUndefined();
    // The view carries no card of the library: the names are public through the event only.
    for (const name of BELOW) expect(text, name).not.toContain(name);
    const events = g.eventsSince(0);
    const names = revealed(events).flatMap((e) => e.names);
    expect(names).toEqual(TOP);
    expect(JSON.stringify(events)).not.toContain('Swamp');
    expect(JSON.stringify(events)).not.toContain('Plains');
  });

  test('the contrast, a look of the same cards: the other seat is told nothing but a count, and the name of the card taken', () => {
    const g = game(LOOK);
    g.act(0).cast(LOOK, { pay: true });
    g.passAll();
    // While the player chooses, the other seat has been told nothing about the cards.
    expect(revealed(g.eventsSince(0))).toEqual([]);
    g.act(0).chooseCards('d');
    const events = g.eventsSince(0);
    expect(events).toContainEqual({ kind: 'topCardsLooked', seat: 0, count: 5 });
    expect(revealed(events).flatMap((e) => e.names)).toEqual(['Serra Angel']);
  });

  /** What seat 1 is shown, and every event, at each step, with `below` the two cards under the revealed five. */
  function flow(below: readonly string[]) {
    const g = game(SORCERY, 'hand', TOP, below);
    const out: { step: string; view: string; events: string }[] = [];
    let mark = g.mark();
    const see = (step: string) => {
      out.push({
        step,
        view: JSON.stringify(g.view(1)),
        events: JSON.stringify(g.eventsSince(mark)),
      });
      mark = g.mark();
    };
    see('start');
    g.act(0).cast(SORCERY, { pay: true });
    see('cast');
    g.passAll();
    see('revealed: the card is chosen next');
    g.act(0).chooseCards('d');
    see('one card taken, the rest in the graveyard');
    return { g, out };
  }

  test('two worlds, only the two cards below the five differ: the other seat sees the same view and the same events at every step', () => {
    const a = flow(['Swamp', 'Plains']);
    const b = flow(['Mountain', 'Giant Spider']);
    expect(a.out).toHaveLength(4);
    for (const [i, step] of a.out.entries()) {
      expect(JSON.parse(b.out[i]?.view ?? 'null'), step.step).toEqual(JSON.parse(step.view));
      expect(b.out[i]?.events, step.step).toBe(step.events);
    }
  });

  test('two worlds, one of the five differs: the other seat sees it, through the reveal event', () => {
    const a = flow(['Swamp', 'Plains']);
    const g = game(SORCERY, 'hand', [
      'Island',
      'Grizzly Bears',
      'Lightning Bolt',
      'Serra Angel',
      'Mountain',
    ]);
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    const events = JSON.stringify(g.eventsSince(0));
    expect(events).toContain('Mountain');
    expect(a.out.map((s) => s.events).join('')).not.toContain('Mountain');
  });
});

describe('validation (D-396)', () => {
  const effectOf = (def: CardDefinition): Effect => {
    const effect = def.faces[0]?.spell?.effect;
    if (effect === undefined) throw new Error('no spell effect');
    return effect;
  };
  const sorcery = (): CardDefinition => {
    const g = game(SORCERY);
    const obj = g.state.objects[g.id(SORCERY)];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    const def = card === undefined ? undefined : g.state.definitions[card.definition];
    if (def === undefined) throw new Error('no definition');
    return def;
  };
  const withEffect = (def: CardDefinition, effect: Effect): CardDefinition => ({
    ...def,
    faces: def.faces.map((f, i) => (i === 0 ? { ...f, spell: { ...f.spell, effect } } : f)),
  });

  test('the card validates', () => {
    expect(validateCard(sorcery())).toEqual([]);
  });

  test('revealAll is true and does not go with cards taken unrevealed or exiled face down', () => {
    const def = sorcery();
    const effect = effectOf(def);
    if (effect.kind !== 'lookAtTop') throw new Error('not a lookAtTop');
    const bad = (e: Effect) => validateCard(withEffect(def, e)).map((i) => i.path);
    expect(bad({ ...effect, revealAll: false as unknown as true })).toContain(
      'faces[0].spell.effect.revealAll',
    );
    expect(bad({ ...effect, take: { ...effect.take, hidden: true } })).toContain(
      'faces[0].spell.effect.revealAll',
    );
    expect(bad({ ...effect, take: { ...effect.take, to: 'exileFaceDown' } })).toContain(
      'faces[0].spell.effect.revealAll',
    );
  });
});

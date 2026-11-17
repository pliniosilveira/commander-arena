// Group 2 of the Lorehold Spirit deck (issue 86): the creature with vigilance that, "At the beginning of your end step, exile target noncreature, nonland card from your graveyard. Create a
// 3/2 red and white Spirit creature token." and has "{1}{R}{W}, {T}, Sacrifice a Spirit: Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost.
// If that spell would be put into a graveyard, put it on the bottom of its owner's library instead." (Quintorius, Loremaster: the `exile` with `linked`, the target filter `exiledWithSource`,
// and `mayCast` from exile with `free` and `bottomInstead`.)
// Pins: CR 607.2a (linked abilities: the cards exiled by this ability of this permanent), CR 400.7 (a permanent that left and came back is a new object with no link; a card that left a zone
// is a new object), CR 603.3d (a trigger with no legal target is removed from the stack: it never resolves), CR 608.2b (an ability whose only target became illegal does nothing), CR 601.2, 118.9 and 107.3b (cast
// without paying the mana cost: X is 0; additional costs are paid, CR 118.9d), CR 614.1a (the spell goes to the bottom of the library instead of a graveyard: resolved, countered or fizzled; a permanent
// spell that resolves is not put into a graveyard), CR 602.2 (sacrifice as a cost), CR 611.2a (until end of turn).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g2.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g2.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const ELEPHANT = 'SYNTHETIC Lore Elephant'; // 3/5 vigilance: the end step trigger and the free cast
const SPIRIT = 'SYNTHETIC Bound Spirit'; // {W} 1/1 Spirit
const BOLT = 'Lightning Bolt'; // {R} instant
const MURDER = 'Murder'; // instant
const COUNTER = 'Counterspell'; // {U}{U} instant
const UNSUMMON = 'Unsummon'; // {U} instant
const BEARS = 'Grizzly Bears'; // creature card
const RING = 'Sol Ring'; // {1} artifact: a noncreature, nonland permanent card
const SCOUR = 'SYNTHETIC Die Scour'; // {W} instant: exile target card from a graveyard
const SAC_DRAW = 'SYNTHETIC Sacrifice Draw'; // {B} sorcery, additional cost: sacrifice a creature; draw two cards
const X_BURN = 'SYNTHETIC X Burn'; // {X}{R} sorcery: X damage to target
const FILLER = Array.from({ length: 8 }, () => 'Plains');
const ISLANDS = ['Island', 'Island'];

const defs = () =>
  scenario()
    .define(syntheticCard(ELEPHANT))
    .define(syntheticCard(SPIRIT))
    .define(syntheticCard(SCOUR))
    .define(syntheticCard(SAC_DRAW))
    .define(syntheticCard(X_BURN));

describe('the cards are valid', () => {
  test.each([ELEPHANT, SPIRIT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 has the Elephant, lands for its ability and `graveyard`; seat 1 has `theirs` on the battlefield. At seat 0's precombat main phase. */
const board = (graveyard: string[], extra: string[] = [], theirs: string[] = ['Plains']) =>
  defs()
    .seat(0)
    .life(20)
    .library(...FILLER)
    .graveyard(...graveyard)
    .battlefield(ELEPHANT, 'Mountain', 'Plains', 'Plains', 'Mountain', ...extra)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .battlefield(...theirs)
    .at('precombatMain', { active: 0 });

/** The end step trigger of seat 0 goes on the stack; `target` is chosen when there is a choice. */
function toEndStep(g: ScenarioGame, target?: string) {
  g.advanceTo('postcombatMain');
  g.passAll();
  if (g.state.pending?.kind === 'targets') {
    if (target === undefined) throw new Error('a target had to be chosen');
    g.act(0).chooseTargets({ name: target, zone: 'graveyard', seat: 0 });
  }
}

describe('the end step trigger: "exile target noncreature, nonland card from your graveyard. Create a 3/2 red and white Spirit creature token."', () => {
  test('only a noncreature, nonland card of your own graveyard is a legal target', () => {
    const g = board([BOLT, BEARS, 'Plains', RING]).build();
    g.advanceTo('postcombatMain');
    g.passAll();
    g.expect.pending('targets', 0);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const ids = (d.specs[0]?.legal ?? []).map((t) => ('id' in t ? t.id : null)).sort();
    expect(ids).toEqual(
      [g.id({ name: BOLT, zone: 'graveyard' }), g.id({ name: RING, zone: 'graveyard' })].sort(),
    );
  });

  test('exiles the target, remembers it as exiled with this creature, and creates a 3/2 red and white Spirit', () => {
    const g = board([BOLT, BEARS]).build();
    toEndStep(g, BOLT);
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Spirit', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.pt('Spirit', 3, 2);
    g.expect.derived('Spirit', { types: ['creature'], subtypes: ['Spirit'], colors: ['R', 'W'] });
    expect(g.object(ELEPHANT).linkedExile).toEqual([g.id({ name: BOLT, zone: 'exile' })]);
    g.expect.invariants();
  });

  test('with no legal target the ability never resolves (CR 603.3d) and no Spirit is created', () => {
    const g = board([BEARS, 'Plains']).build();
    toEndStep(g);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
    expect(g.object(ELEPHANT).linkedExile ?? []).toEqual([]);
  });

  test("the cards of the opponent's graveyard are not targets", () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(ELEPHANT)
      .seat(1)
      .library(...FILLER)
      .graveyard(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    toEndStep(g);
    g.expect.stack([]);
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
  });

  test("it triggers at the beginning of YOUR end step only, not the opponent's", () => {
    const g = board([BOLT]).at('precombatMain', { active: 1 }).build();
    g.advanceTo('postcombatMain');
    g.passAll();
    g.expect.step('end', { active: 1 });
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('if the only target leaves the graveyard before the ability resolves it does nothing: no exile and no Spirit (CR 608.2b)', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .graveyard(BOLT)
      .battlefield(ELEPHANT)
      .seat(1)
      .library(...FILLER)
      .hand(SCOUR)
      .battlefield('Plains')
      .at('precombatMain', { active: 0 })
      .build();
    toEndStep(g, BOLT);
    g.expect.stack([`${ELEPHANT} (ability)`]);
    g.pass();
    g.act(1).cast(SCOUR, { pay: true, targets: [{ name: BOLT, zone: 'graveyard', seat: 0 }] });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
    expect(g.object(ELEPHANT).linkedExile ?? []).toEqual([]);
    g.expect.invariants();
  });
});

/**
 * Seat 0's next turn, in its precombat main phase: `card` was exiled with the Elephant at the end of the turn before, the Spirit token is on the battlefield and the lands are untapped.
 * `opponent` is what seat 1 holds for the replies.
 */
function mainNext(
  card: string,
  graveyard: string[] = [card],
  opponent: { hand?: string[]; battlefield?: string[] } = {},
  extra: string[] = [],
) {
  const g = board(graveyard, extra, opponent.battlefield ?? ['Plains'])
    .seat(1)
    .hand(...(opponent.hand ?? []))
    .build();
  toEndStep(g, card);
  g.passAll();
  g.expect.zone(card, 'exile', { seat: 0 });
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('precombatMain', { turn: 'next' });
  g.expect.step('precombatMain', { active: 0 });
  return g;
}

/** The ability is activated with `card` as the target and resolves. */
function activate(g: ScenarioGame, card: string, sacrifice = 'Spirit') {
  g.act(0).activate(ELEPHANT, { targets: [{ name: card, zone: 'exile', seat: 0 }], pay: true });
  // With more than one Spirit the cost asks which one is sacrificed.
  if (g.state.pending?.kind === 'choosePermanent') {
    g.act(0).choosePermanents({ name: sacrifice, zone: 'battlefield', seat: 0 });
  }
  g.passAll();
}

describe('the activated ability: "Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost."', () => {
  test('the cost is {1}{R}{W}, {T} and a Spirit sacrificed: the Spirit is gone, the Elephant is tapped', () => {
    const g = mainNext(BOLT);
    expect(g.find({ name: 'Spirit', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.act(0).activate(ELEPHANT, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(0);
    g.expect.tapped(ELEPHANT);
    g.expect.stack([`${ELEPHANT} (ability)`]);
  });

  test("the card is then cast without paying its mana cost (no mana is left), and goes to the bottom of its owner's library", () => {
    const g = mainNext(BOLT);
    activate(g, BOLT);
    g.expect.legal(0, { cast: BOLT, alternative: 'free' });
    // The only way is for no mana: paying the cost is not offered.
    g.expect.illegal(0, { cast: BOLT });
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 0 });
    const library = g.state.seats[0]?.library ?? [];
    expect(library[library.length - 1]).toBe(g.id({ name: BOLT, zone: 'library' }));
    g.expect.invariants();
  });

  test('a sorcery is cast at sorcery timing: now, in a main phase with an empty stack, and not in the end step', () => {
    const g = mainNext(SAC_DRAW);
    activate(g, SAC_DRAW);
    g.expect.legal(0, { cast: SAC_DRAW, alternative: 'free' });
    g.advanceTo('postcombatMain');
    g.passAll();
    g.expect.step('end', { active: 0 });
    g.expect.illegal(0, { cast: SAC_DRAW, alternative: 'free' });
  });

  test('the permission lasts this turn only', () => {
    const g = mainNext(BOLT);
    activate(g, BOLT);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: BOLT, alternative: 'free' });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
  });

  test('X is 0 for a spell cast without paying its mana cost (CR 107.3b)', () => {
    const g = mainNext(X_BURN);
    activate(g, X_BURN);
    g.act(0).cast(X_BURN, { alternative: 'free', targets: [{ player: 1 }] });
    g.expect.stack([X_BURN]);
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(X_BURN, 'library', { seat: 0 });
  });

  test('a spell with an additional cost still has it paid (CR 118.9d)', () => {
    const g = mainNext(SAC_DRAW, [SAC_DRAW], {}, [SPIRIT]);
    // The Spirit token is sacrificed to the ability; the Bound Spirit is still there and is sacrificed to the spell.
    activate(g, SAC_DRAW, 'Spirit');
    g.act(0).cast(SAC_DRAW, { alternative: 'free' });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents({ name: SPIRIT, zone: 'battlefield', seat: 0 });
    g.passAll();
    g.expect.zone(SPIRIT, 'graveyard', { seat: 0 });
    // The card drawn for the turn and the two the spell draws.
    g.expect.handSize(0, 3);
    g.expect.zone(SAC_DRAW, 'library', { seat: 0 });
  });

  test('a spell that is countered goes to the bottom of the library, not to the graveyard (CR 614.1a)', () => {
    const g = mainNext(BOLT, [BOLT], { hand: [COUNTER], battlefield: ISLANDS });
    activate(g, BOLT);
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ player: 1 }] });
    g.pass();
    g.act(1).cast(COUNTER, { pay: true, targets: [BOLT] });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.zone(COUNTER, 'graveyard', { seat: 1 });
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
    const library = g.state.seats[0]?.library ?? [];
    expect(library[library.length - 1]).toBe(g.id({ name: BOLT, zone: 'library' }));
  });

  test('a spell that fizzles (its target is gone) goes to the bottom of the library, not to the graveyard', () => {
    const g = mainNext(BOLT, [BOLT], { hand: [UNSUMMON], battlefield: [...ISLANDS, BEARS] });
    activate(g, BOLT);
    g.act(0).cast(BOLT, { alternative: 'free', targets: [{ name: BEARS, seat: 1 }] });
    g.pass();
    g.act(1).cast(UNSUMMON, { pay: true, targets: [{ name: BEARS, seat: 1 }] });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    g.expect.zone(BOLT, 'library', { seat: 0 });
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
  });

  test('a permanent spell that resolves enters the battlefield: it is not put into a graveyard, so nothing is replaced', () => {
    const g = mainNext(RING);
    activate(g, RING);
    g.act(0).cast(RING, { alternative: 'free' });
    g.passAll();
    g.expect.zone(RING, 'battlefield', { seat: 0 });
    expect(g.find({ name: RING, zone: 'library' })).toHaveLength(0);
  });

  test('only a Spirit may be sacrificed: with none, the ability cannot be activated; the Elephant is no Spirit', () => {
    const g = mainNext(BOLT);
    g.act(0).activate(ELEPHANT, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    g.passAll();
    // The one Spirit is gone: a second activation has nothing to sacrifice (and the Elephant is tapped).
    const again = g.act(0).try.activate(ELEPHANT);
    expect(again.ok).toBe(false);
  });

  test('with two Spirits the controller chooses which one is sacrificed', () => {
    const g = mainNext(BOLT, [BOLT], {}, [SPIRIT]);
    g.act(0).activate(ELEPHANT, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(d.legal).toHaveLength(2);
    expect(d.legal).not.toContain(g.id(ELEPHANT));
    g.act(0).choosePermanents({ name: SPIRIT, zone: 'battlefield', seat: 0 });
    expect(g.find({ name: 'Spirit', zone: 'battlefield' })).toHaveLength(1);
    g.expect.zone(SPIRIT, 'graveyard', { seat: 0 });
  });

  test("a Spirit of the opponent's cannot be sacrificed", () => {
    const g = defs()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .graveyard(BOLT)
      .battlefield(ELEPHANT, 'Mountain', 'Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .battlefield(SPIRIT)
      .at('precombatMain', { active: 0 })
      .build();
    toEndStep(g, BOLT);
    g.passAll();
    // The token of seat 0 is the only candidate: sacrificing is automatic and never takes seat 1's.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(ELEPHANT, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    g.expect.zone(SPIRIT, 'battlefield', { seat: 1 });
    expect(g.find({ name: 'Spirit', zone: 'battlefield', seat: 0 })).toHaveLength(0);
  });
});

describe('"exiled with this creature" (CR 607.2a): only the cards this ability of this permanent exiled', () => {
  test('a card exiled by another effect is not a legal target', () => {
    const g = defs()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(ELEPHANT, SPIRIT, 'Mountain', 'Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .exile(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    // The Bolt is in exile, but the Elephant did not exile it: the ability has no target to choose and is not offered.
    const r = g.act(0).try.activate(ELEPHANT);
    expect(r.ok).toBe(false);
  });

  test('two Elephants each have their own cards: the second cannot choose what the first exiled', () => {
    const g = defs()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .graveyard(BOLT, MURDER)
      .battlefield(ELEPHANT, ELEPHANT, SPIRIT, 'Mountain', 'Plains', 'Plains', 'Mountain', 'Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('postcombatMain');
    g.passAll();
    // Two triggers, one for each Elephant: each chooses its own target (the Bolt, then the Murder).
    const targets = [BOLT, MURDER];
    for (let guard = 0; guard < 6 && g.state.pending?.kind !== 'priority'; guard += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
      else if (d?.kind === 'targets') {
        const next = targets.shift();
        if (next === undefined) throw new Error('more decisions than Elephants');
        g.act(0).chooseTargets({ name: next, zone: 'graveyard', seat: 0 });
      } else throw new Error(`unexpected ${d?.kind}`);
    }
    g.passAll();
    const [a, b] = g.find({ name: ELEPHANT, zone: 'battlefield', seat: 0 });
    if (a === undefined || b === undefined) throw new Error('two Elephants');
    expect(a.linkedExile).toHaveLength(1);
    expect(b.linkedExile).toHaveLength(1);
    expect(a.linkedExile).not.toEqual(b.linkedExile);
    expect(g.find({ name: 'Spirit', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    // One cannot choose the other's card: the targets of each ability are its own cards.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    for (const [elephant, own] of [
      [a, a.linkedExile],
      [b, b.linkedExile],
    ] as const) {
      g.act(0).activate({ name: ELEPHANT, nth: elephant === a ? 0 : 1 });
      const d = g.state.pending;
      if (d?.kind !== 'targets') throw new Error('expected targets');
      expect((d.specs[0]?.legal ?? []).map((t) => ('id' in t ? t.id : null))).toEqual(own);
      g.act(0).cancel();
    }
  });

  test('an Elephant that left the battlefield and came back is a new object with no cards exiled with it (CR 400.7)', () => {
    const g = board([BOLT], ['Island', 'Island', 'Plains'], ['Plains'])
      .seat(0)
      .hand(UNSUMMON)
      .build();
    toEndStep(g, BOLT);
    g.passAll();
    const old = g.id({ name: ELEPHANT, zone: 'battlefield', seat: 0 });
    expect(g.object(ELEPHANT).linkedExile).toHaveLength(1);
    // Back to its owner's hand at the end step, and cast again in the next main phase.
    g.act(0).cast(UNSUMMON, { pay: true, targets: [ELEPHANT] });
    g.passAll();
    g.expect.zone(ELEPHANT, 'hand', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(ELEPHANT, { pay: true });
    g.passAll();
    g.expect.zone(ELEPHANT, 'battlefield', { seat: 0 });
    expect(g.id({ name: ELEPHANT, zone: 'battlefield', seat: 0 })).not.toBe(old);
    expect(g.object(ELEPHANT).linkedExile ?? []).toEqual([]);
    // Two turns on, no longer summoning sick: the Bolt is still in exile but nothing exiled it with this Elephant.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    // The new Elephant exiled the Unsummon at its own end step (the first turn it was there): that is the only card exiled with it.
    g.act(0).activate(ELEPHANT);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect((d.specs[0]?.legal ?? []).map((t) => ('id' in t ? t.id : null))).toEqual([
      g.id({ name: UNSUMMON, zone: 'exile' }),
    ]);
  });

  test('if the Elephant leaves the battlefield while the ability is on the stack, the card is no longer exiled with it: the ability does nothing', () => {
    const g = mainNext(BOLT, [BOLT], { hand: [MURDER], battlefield: ['Swamp', 'Swamp', 'Swamp'] });
    g.act(0).activate(ELEPHANT, { targets: [{ name: BOLT, zone: 'exile', seat: 0 }], pay: true });
    g.pass();
    g.act(1).cast(MURDER, { pay: true, targets: [ELEPHANT] });
    g.passAll();
    g.expect.zone(ELEPHANT, 'graveyard', { seat: 0 });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: BOLT, alternative: 'free' });
    g.expect.invariants();
  });
});

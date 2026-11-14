// Group 1b of the Danitha deck (issue 26, D-400 to D-404 provisional): what the real cards Cosmic Rebirth, Danitha New Benalia's Light, Spirit Mantle and Season of Growth ask of
// the engine, as the SYNTHETIC cards of `src/cards/fixtures/synthetic-danitha-g1b.ts` (the cards package checks that the grammar lowers the real text to the same nodes).
// Pins: CR 608.2c and 608.2d (a "you may" is chosen as the instruction comes up; "if you don't" reads what was done), CR 303.4f and 303.4g (an Aura that enters by an effect chooses what it
// enchants, and stays where it was with nothing to enchant), CR 400.3 (a card goes to its owner's hand), CR 202.3 (the mana value of a card of the graveyard), CR 601.2a, 305.1 and 113.6
// (a permission to cast from the graveyard used once each turn), CR 303.4 (an Aura spell is cast with a target), CR 702.16a to 702.16f (protection from a card type: damage, targeting, blocking),
// CR 603.2 and 601.2i (a trigger on a spell that is cast), CR 115.1 and 601.2c (what a spell targets), CR 109.4 (a creature you control).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { arrangeDecision, handNames } from './scry-helpers';

const RITE = 'SYNTHETIC Rebirth Rite'; // {1}{G}{W} instant: the Cosmic Rebirth text
const RECALLER = 'SYNTHETIC Aura Recaller'; // {1}{G}{W} 2/2: once each turn cast an Aura or Equipment spell from your graveyard
const WARD_AURA = 'SYNTHETIC Creature Ward Aura'; // {1}{W} Aura: +1/+1 and protection from creatures
const WATCHER = 'SYNTHETIC Growth Watcher'; // {1}{G} enchantment: scry on a creature of yours entering, draw on a spell that targets one
const MIGHT_AURA = 'SYNTHETIC Might Aura'; // {1}{G} Aura: enchant creature, +2/+2
const LOYAL_AURA = 'SYNTHETIC Loyal Aura'; // {G} Aura: enchant creature you control, +1/+1 and vigilance
const BLADE = 'SYNTHETIC Blade'; // {1} Equipment
const VANILLA = 'SYNTHETIC Vanilla 3/3'; // 3/3 creature
const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const ANGEL = 'Serra Angel'; // {3}{W}{W}
const SPIDER = 'Giant Spider'; // {3}{G}
const FOREST = 'Forest';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const RAISE = 'SYNTHETIC Raise Dead'; // return target creature card from your graveyard to your hand
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([RITE, RECALLER, WARD_AURA, WATCHER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const names = (g: ScenarioGame, seat: 0 | 1, zone: 'hand' | 'graveyard'): string[] =>
  g.state.seats[seat]?.[zone].map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  }) ?? [];

/** The objects the engine offers for the first target slot of the spell being cast. */
function legalTargets(g: ScenarioGame) {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
}

/** The names of the cards of the graveyard of seat 0 that the engine lists a cast of. */
function castableFromGraveyard(g: ScenarioGame): string[] {
  return getLegalActions(g.state, 0).flatMap((a) => {
    const obj = a.kind === 'castSpell' ? g.state.objects[a.object] : undefined;
    if (obj?.zone !== 'graveyard') return [];
    const card = obj.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? [] : [g.state.definitions[card.definition]?.name ?? '?'];
  });
}

describe('Cosmic Rebirth: choose a permanent card, put it onto the battlefield if its mana value is 3 or less, otherwise (or if you decline) into your hand', () => {
  /** Seat 0 holds the Rite with green and white mana and `yard` in its graveyard, `field` on its battlefield. */
  const game = (yard: readonly string[], field: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(RITE)
      .battlefield(FOREST, 'Plains', 'Plains', ...field)
      .graveyard(...yard)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('mana value 3 or less, accepted: the card enters under your control, and you gain 3 life', () => {
    const g = game([BEARS]);
    g.act(0).cast(RITE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(0, 43);
    expect(names(g, 0, 'hand')).toEqual([]);
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('mana value 3 or less, declined: the card goes into your hand (the "if you don\'t" part), and you still gain 3 life', () => {
    const g = game([BEARS]);
    g.act(0).cast(RITE, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).decline();
    expect(names(g, 0, 'hand')).toEqual([BEARS]);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('mana value 4 or more: no question, the card goes into your hand', () => {
    const g = game([SPIDER]);
    g.act(0).cast(RITE, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(names(g, 0, 'hand')).toEqual([SPIDER]);
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('the limit is 3: a card of mana value 5 is not offered either', () => {
    const g = game([ANGEL]);
    g.act(0).cast(RITE, { targets: [ANGEL], pay: true });
    g.passAll();
    expect(names(g, 0, 'hand')).toEqual([ANGEL]);
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
  });

  test('a land card has mana value 0: it may be put onto the battlefield', () => {
    const g = game(['Island']);
    g.act(0).cast(RITE, { targets: ['Island'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('an Aura card of mana value 3 or less asks what it enchants (CR 303.4f) and enters attached', () => {
    const g = game([MIGHT_AURA], [BEARS, VANILLA]);
    g.act(0).cast(RITE, { targets: [MIGHT_AURA], pay: true });
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('auraHost');
    g.act(0).choosePermanents(VANILLA);
    g.expect.attached(MIGHT_AURA, VANILLA);
    g.expect.pt(VANILLA, 5, 5);
    expect(names(g, 0, 'hand')).toEqual([]);
    g.expect.invariants();
  });

  test('an Aura card with nothing to enchant stays in the graveyard (CR 303.4g), so it was not put onto the battlefield: it goes into your hand', () => {
    const g = game([LOYAL_AURA]);
    g.act(0).cast(RITE, { targets: [LOYAL_AURA], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(LOYAL_AURA, 'hand', { seat: 0 });
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('an Aura card that is declined goes into your hand and does not ask what it enchants', () => {
    const g = game([MIGHT_AURA], [BEARS, VANILLA]);
    g.act(0).cast(RITE, { targets: [MIGHT_AURA], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(MIGHT_AURA, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('only a card of your own graveyard can be chosen', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield(FOREST, 'Plains', 'Plains')
      .graveyard(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .graveyard(VANILLA)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RITE);
    expect(legalTargets(g)).toEqual([g.id(BEARS)]);
  });
});

describe('Danitha: once during each of your turns, you may cast an Aura or Equipment spell from your graveyard', () => {
  const game = (yard: readonly string[], active: 0 | 1 = 0) =>
    scenario()
      .seat(0)
      .battlefield(RECALLER, FOREST, 'Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .graveyard(...yard)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active, turn: active === 0 ? 3 : 4 })
      .build();

  test('an Aura spell is cast from the graveyard with a target, and enters attached to it', () => {
    const g = game([MIGHT_AURA]);
    g.act(0).cast(MIGHT_AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(MIGHT_AURA, BEARS);
    g.expect.zone(MIGHT_AURA, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an Aura spell cast this way asks for a target as any Aura spell does (CR 303.4, 601.2c): the creatures on the battlefield, not a card of a graveyard', () => {
    const g = game([MIGHT_AURA, BEARS]);
    g.act(0).cast(MIGHT_AURA);
    expect(legalTargets(g).sort()).toEqual(
      [g.id({ name: BEARS, zone: 'battlefield' }), g.id(RECALLER)].sort(),
    );
  });

  test('an Equipment spell is cast from the graveyard too, and it uses the same permission', () => {
    const g = game([BLADE, MIGHT_AURA]);
    // Before it is used the permission lets either be cast.
    expect(castableFromGraveyard(g)).toContain(MIGHT_AURA);
    g.act(0).cast(BLADE, { pay: true });
    g.passAll();
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
    // Once each turn: the Aura cannot be cast from the graveyard now.
    expect(castableFromGraveyard(g)).not.toContain(MIGHT_AURA);
    g.expect.zone(MIGHT_AURA, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a second Aura is refused the same turn', () => {
    const g = game([MIGHT_AURA, LOYAL_AURA]);
    expect(castableFromGraveyard(g)).toContain(LOYAL_AURA);
    g.act(0).cast(MIGHT_AURA, { targets: [BEARS], pay: true });
    g.passAll();
    expect(castableFromGraveyard(g)).not.toContain(LOYAL_AURA);
  });

  test('a card that is not an Aura or an Equipment is not castable from the graveyard', () => {
    const g = game([MIGHT_AURA, SPIDER, ANGEL]);
    expect(castableFromGraveyard(g)).toContain(MIGHT_AURA);
    expect(castableFromGraveyard(g)).not.toContain(SPIDER);
    expect(castableFromGraveyard(g)).not.toContain(ANGEL);
  });

  test('the permission is for your own turn only (CR 601.2a: "during each of your turns")', () => {
    expect(castableFromGraveyard(game([MIGHT_AURA]))).toContain(MIGHT_AURA);
    const g = game([MIGHT_AURA], 1);
    g.act(1).pass();
    expect(g.state.turn.prioritySeat).toBe(0);
    expect(castableFromGraveyard(g)).not.toContain(MIGHT_AURA);
  });

  test("the permission is the permanent's: without Danitha the Aura stays in the graveyard", () => {
    const g = scenario()
      .seat(0)
      .battlefield(FOREST, 'Plains', 'Plains', BEARS)
      .graveyard(MIGHT_AURA)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(castableFromGraveyard(g)).not.toContain(MIGHT_AURA);
  });
});

describe('Spirit Mantle: enchanted creature gets +1/+1 and has protection from creatures', () => {
  const field = (enchanted: boolean) => {
    const mine = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS);
    if (enchanted) mine.battlefield(WARD_AURA, { attachedTo: BEARS });
    return mine
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA);
  };

  test('the Aura gives +1/+1', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD_AURA)
      .battlefield('Plains', 'Plains', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(WARD_AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(WARD_AURA, BEARS);
    g.expect.pt(BEARS, 3, 3);
  });

  test('a creature deals no damage to the enchanted creature it blocks, and dies of its damage (CR 702.16e)', () => {
    const g = field(true).at('precombatMain', { active: 1, turn: 2 }).build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(VANILLA);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: BEARS, attacker: VANILLA }]);
    g.passAll();
    g.expect.damage(BEARS, 0);
    g.expect.zone(VANILLA, 'graveyard', { seat: 1 });
  });

  test('without the Aura the same block kills the Bears', () => {
    const g = field(false).at('precombatMain', { active: 1, turn: 2 }).build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(VANILLA);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: BEARS, attacker: VANILLA }]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a creature can not block the enchanted creature (CR 702.16f)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(WARD_AURA, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    expect(g.act(1).try.declareBlockers([{ blocker: VANILLA, attacker: BEARS }]).ok).toBe(false);
  });

  test('a spell that is not a creature still hits it, and its protection ends with the Aura (CR 702.16b)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(WARD_AURA, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('Season of Growth: whenever a creature you control enters, scry 1; whenever you cast a spell that targets a creature you control, draw a card', () => {
  const game = (hand: readonly string[], opponent: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(WATCHER, FOREST, FOREST, 'Mountain', 'Swamp', 'Swamp', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a creature that enters scries', () => {
    const g = game([SPIDER]);
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    expect(arrangeDecision(g).purpose).toBe('scry');
  });

  test('a spell that targets a creature you control draws a card', () => {
    const g = game([BOLT]);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    expect(handNames(g)).toEqual([]);
    g.passAll();
    expect(handNames(g)).toEqual(['Plains']);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('the trigger is on the stack above the spell, so the card is drawn before the spell resolves (CR 603.3)', () => {
    const g = game([BOLT]);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    expect(g.state.stack.length).toBe(2);
  });

  test('a spell that targets a creature an opponent controls does not', () => {
    const g = game([MURDER], [VANILLA]);
    g.act(0).cast(MURDER, { targets: [VANILLA], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
    g.expect.zone(VANILLA, 'graveyard', { seat: 1 });
  });

  test('a spell that targets a player does not', () => {
    const g = game([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
  });

  test('a spell that targets a creature card in your graveyard does not (it is no creature you control, CR 109.4)', () => {
    const g = scenario()
      .seat(0)
      .hand(RAISE)
      .battlefield(WATCHER, 'Swamp', 'Swamp')
      .graveyard(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RAISE, { targets: [BEARS], pay: true });
    g.passAll();
    // No card was drawn (the Bears entering scry, which is the question now).
    expect(handNames(g)).toEqual([]);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test("an opponent's spell that targets your creature does not trigger it (it triggers on spells you cast)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WATCHER, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
  });
});

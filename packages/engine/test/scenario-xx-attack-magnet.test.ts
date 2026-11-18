// A planeswalker that makes the creatures of an opponent attack it (First Flight starter commander decks, Gideon Jura): "+2: During target opponent's next turn, creatures that player
// controls attack this planeswalker if able.", "-2: Destroy target tapped creature.", "0: Until end of turn, this planeswalker becomes a 6/6 Human Soldier creature that's still a
// planeswalker. Prevent all damage that would be dealt to him this turn."
// Pins: CR 508.1d (a requirement is obeyed when able; a creature that cannot attack is not required), CR 508.1a-c (the creature is declared as attacking a player or a planeswalker),
// CR 611.2c (a requirement changes the rules, not a characteristic: it reaches creatures that arrive later), CR 606 (loyalty abilities), CR 500.1 (the turn it resolves in is not
// counted: the effect covers the next turn of that player, through its end), CR 120.1 and 615 (prevention). The card is SYNTHETIC (src/cards/fixtures/synthetic-attack-magnet.ts).
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { attackCandidates } from '../src/rules/combat-legality';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Magnet Walker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const FLASH_BEAR = 'SYNTHETIC Flash Bear';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test('validateCard finds nothing', () => {
    expect(validateCard(syntheticCard(WALKER))).toEqual([]);
  });
});

const board = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(WALKER, 'Plains')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK, 'Plains')
    .at('precombatMain', { active: 0 })
    .build();

const plus2 = (g: ReturnType<typeof board>) => {
  g.act(0).activate(WALKER, { ability: 0, targets: [{ player: 1 }] });
  g.passAll();
};

const toOpponentsAttack = (g: ReturnType<typeof board>) => {
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('declareAttackers', { attack: false });
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return d;
};

describe("+2: during target opponent's next turn, their creatures attack this planeswalker if able", () => {
  test('the walker gains two loyalty and every creature that can attack must attack it', () => {
    const g = board();
    plus2(g);
    g.expect.counters(WALKER, { loyalty: 8 });
    const d = toOpponentsAttack(g);
    expect([...d.mustAttack].sort()).toEqual([g.id(BEARS), g.id(HAWK)].sort());
    // Not attacking, or attacking the player, is refused; attacking the walker is accepted (CR 508.1d).
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS }, { attacker: HAWK }]).ok).toBe(false);
    expect(
      g.act(1).try.declareAttackers([{ attacker: BEARS, target: WALKER }, { attacker: HAWK }]).ok,
    ).toBe(false);
    expect(
      g.act(1).try.declareAttackers([
        { attacker: BEARS, target: WALKER },
        { attacker: HAWK, target: WALKER },
      ]).ok,
    ).toBe(true);
  });

  test('the attack candidates offer only the walker to each creature', () => {
    const g = board();
    plus2(g);
    g.advanceTo('precombatMain', { turn: 'next' });
    const walker = g.id(WALKER);
    const candidates = attackCandidates(g.state, 1);
    expect(candidates.length).toBe(2);
    for (const c of candidates) {
      expect(c.targets).toEqual([{ kind: 'permanent', object: walker }]);
    }
  });

  test('the turn after that, there is no requirement', () => {
    const g = board();
    plus2(g);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([]);
    expect(g.act(1).try.declareAttackers([]).ok).toBe(true);
  });

  test('the effect lasts the whole turn: a second combat of that turn is still covered', () => {
    const g = board();
    plus2(g);
    toOpponentsAttack(g);
    expect(
      g.state.continuousEffects.some(
        (e) => e.change.kind === 'mustAttackPermanent' && e.change.seat === 1,
      ),
    ).toBe(true);
  });

  test('a creature that entered after the effect began is required too (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .hand(FLASH_BEAR)
      .battlefield(BEARS, 'Forest', 'Forest')
      .at('precombatMain', { active: 0 })
      .build();
    plus2(g);
    g.advanceTo('endOfCombat');
    g.act(0).pass();
    g.act(1).cast(FLASH_BEAR, { pay: true });
    g.pass();
    g.pass();
    const d = toOpponentsAttack(g);
    expect(d.mustAttack).toContain(g.id(FLASH_BEAR));
    expect(d.mustAttack).toContain(g.id(BEARS));
  });

  test('a creature that cannot attack (defender) is not required (CR 508.1d)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    plus2(g);
    const d = toOpponentsAttack(g);
    expect(d.mustAttack).toEqual([g.id(BEARS)]);
  });

  test('when the walker has left the battlefield there is no requirement', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, { counters: { loyalty: 1 } })
      .battlefield('Plains')
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield(BEARS, 'Mountain')
      .at('precombatMain', { active: 0 })
      .build();
    plus2(g);
    // The opponent kills the walker (3 loyalty left after the +2) before their turn.
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [WALKER], pay: true });
    g.pass();
    g.pass();
    g.advanceTo('precombatMain', { turn: 'next' });
    const candidates = attackCandidates(g.state, 1);
    for (const c of candidates) {
      expect(c.targets.every((t) => t.kind === 'player')).toBe(true);
    }
  });

  test("the effect is about that opponent's creatures only: mine are not required on my turn", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Plains', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HAWK, 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    plus2(g);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([]);
  });

  test('a loyalty ability is activated once per turn (CR 606.3)', () => {
    const g = board();
    plus2(g);
    expect(() => g.act(0).activate(WALKER, { ability: 0, targets: [{ player: 1 }] })).toThrow();
  });
});

describe('+2 with three players: the requirement reads the creatures of the targeted player', () => {
  test('only the creatures of the named opponent are required; the third player is free', () => {
    const g = board();
    plus2(g);
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const forced = attackCandidates({ ...with3, turn: { ...with3.turn, activeSeat: 1 } }, 1);
    expect(forced.length).toBeGreaterThan(0);
    for (const c of forced) {
      expect(c.targets).toEqual([{ kind: 'permanent', object: g.id(WALKER) }]);
    }
  });
});

describe('-2: destroy target tapped creature', () => {
  test('a tapped creature is destroyed and the untapped one is left', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true })
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 1, targets: [BEARS] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 4 });
    expect(getView(g.state, 0).battlefield.some((o) => o.name === BEARS)).toBe(false);
    expect(getView(g.state, 0).battlefield.some((o) => o.name === HAWK)).toBe(true);
  });
});

describe('0: becomes a 6/6 Human Soldier creature that is still a planeswalker; prevent all damage to it', () => {
  test('the walker is a 6/6 creature and a planeswalker, and damage to it is prevented', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.pass();
    g.pass();
    g.expect.pt(WALKER, 6, 6);
    g.expect.derived(WALKER, {
      types: ['planeswalker', 'creature'],
      subtypes: ['Gideon', 'Human', 'Soldier'],
    });
    g.expect.counters(WALKER, { loyalty: 6 });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [WALKER], pay: true });
    g.pass();
    g.pass();
    g.expect.counters(WALKER, { loyalty: 6 });
    g.expect.invariants();
  });
});

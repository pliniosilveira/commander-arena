// Two cards of group 2 of the Feather deck. "Choose one — Put a +1/+1 counter on target creature or Vehicle. Untap it. / Return target permanent you control to its owner's hand."
// (D-1314: a target slot whose filter is a choice of a card type and a subtype, `anyOf`). "{T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've
// cast an instant or sorcery spell this turn." (D-1311: `spellsCastThisTurn` with `ofTypes`, read from `TurnLog.castSpells`, the card types of each spell as it was cast.)
// Pins: CR 700.2 (modal spells: the modes are chosen as the spell is cast, only the targets of the chosen mode are chosen), CR 301.7 (a Vehicle is an artifact until crewed; it is a
// creature only while crewed), CR 602.5b (a restriction on activating an ability), CR 602.5d (as a sorcery), CR 601.2i (a spell is cast once it is on the stack with its costs
// paid), CR 707.10 (a copy is not cast), CR 500.4 (the log of the turn is emptied as the next one begins).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g2.ts, synthetic-vehicles.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WAY = 'SYNTHETIC Way Light'; // {W} instant, modal
const HALL = 'SYNTHETIC Oracle Hall'; // land: {T}: +1/+1 counter on target creature, as a sorcery, if an instant or sorcery was cast this turn
const SKIFF = 'SYNTHETIC Scout Skiff'; // artifact Vehicle 2/2
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt'; // instant
const DIVINATION = 'Divination'; // sorcery
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([WAY, HALL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('ofTypes names at least one card type, and only card types', () => {
    const withTypes = (ofTypes: unknown) =>
      singleFace({
        name: 'SYNTHETIC Test Gate',
        manaCost: null,
        types: ['land'],
        colors: [],
        colorIdentity: [],
        oracleText: 'test',
        abilities: [
          {
            kind: 'activated',
            cost: [{ kind: 'tap' }],
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
            activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 1, ofTypes: ofTypes as never },
          },
        ],
      });
    expect(validateCard(withTypes(['instant', 'sorcery']))).toEqual([]);
    expect(validateCard(withTypes(['creature']))).toEqual([]);
    expect(validateCard(withTypes([])).length).toBeGreaterThan(0);
    expect(validateCard(withTypes(['spell'])).length).toBeGreaterThan(0);
    expect(validateCard(withTypes('instant')).length).toBeGreaterThan(0);
  });
});

describe('Choose one: a +1/+1 counter on a creature or Vehicle and untap it, or return a permanent you control', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true, label: 'bears' })
      .battlefield(SKIFF, { tapped: true, label: 'skiff' })
      .battlefield(ELVES, { label: 'elves' })
      .battlefield('Plains', 'Plains')
      .hand(WAY, WAY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('mode 1 on a creature: a +1/+1 counter, then it untaps', () => {
    const g = board();
    g.act(0).cast(`${WAY}[0]`, { modes: [0], targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.tapped('bears', false);
    g.expect.pt('bears', 3, 3);
    g.expect.invariants();
  });

  test('mode 1 on a Vehicle that is not a creature: the counter and the untap work all the same', () => {
    const g = board();
    g.act(0).cast(`${WAY}[0]`, { modes: [0], targets: ['skiff'], pay: true });
    g.passAll();
    g.expect.counters('skiff', { '+1/+1': 1 });
    g.expect.tapped('skiff', false);
  });

  test('mode 1 can also target a creature of the other player (the target is not limited to your permanents)', () => {
    const g = board();
    g.act(0).cast(`${WAY}[0]`, { modes: [0], targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.counters('theirs', { '+1/+1': 1 });
  });

  test('mode 1 does not target a land or an artifact that is no Vehicle: only creatures and Vehicles', () => {
    const g = board();
    expect(() =>
      g.act(0).cast(`${WAY}[0]`, { modes: [0], targets: [{ name: 'Plains', seat: 0, zone: 'battlefield', nth: 0 }], pay: true }),
    ).toThrow();
  });

  test('mode 2: a permanent you control returns to its owner\'s hand; one of the opponent is not a legal target', () => {
    const g = board();
    g.act(0).cast(`${WAY}[0]`, { modes: [1], targets: ['elves'], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    const h = board();
    expect(() => h.act(0).cast(`${WAY}[0]`, { modes: [1], targets: ['theirs'], pay: true })).toThrow();
  });

  test('a permanent that is a land may be returned too (any permanent you control)', () => {
    const g = board();
    g.act(0).cast(`${WAY}[0]`, {
      modes: [1],
      targets: [{ name: 'Plains', seat: 0, zone: 'battlefield', nth: 0 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Plains', 'hand', { seat: 0 });
  });
});

describe('"Activate only as a sorcery and only if you\'ve cast an instant or sorcery spell this turn"', () => {
  const board = (hand: readonly string[] = [BOLT, DIVINATION, BEARS]) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(HALL, { label: 'hall' })
      .battlefield(ELVES, { label: 'elves' })
      .battlefield('Mountain', 'Mountain', 'Island', 'Island')
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', { label: 'theirmountain' })
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();

  test('refused before any spell is cast this turn', () => {
    const g = board();
    g.expect.illegal(0, { activate: HALL });
  });

  test('an instant cast this turn allows it: a +1/+1 counter on the target creature', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { activate: HALL });
    g.act(0).activate(HALL, { targets: ['elves'] });
    g.passAll();
    g.expect.counters('elves', { '+1/+1': 1 });
    g.expect.tapped('hall', true);
    g.expect.invariants();
  });

  test('a sorcery cast this turn allows it too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(DIVINATION)
      .battlefield(HALL, { label: 'hall' })
      .battlefield(ELVES)
      .battlefield('Island', { label: 'i1' })
      .battlefield('Island', { label: 'i2' })
      .battlefield('Island', { label: 'i3' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    // The three Islands pay for it (the Hall stays untapped for its own ability).
    for (const island of ['i1', 'i2', 'i3']) g.act(0).tapForMana(island);
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.legal(0, { activate: HALL });
  });

  test('a creature spell does not count: it is neither an instant nor a sorcery', () => {
    const g = board();
    // Paid with the Forests: the Hall stays untapped, so only the condition can refuse it.
    g.act(0).tapForMana('f1').tapForMana('f2');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.tapped('hall', false);
    g.expect.illegal(0, { activate: HALL });
  });

  test('the spell of an opponent does not count (CR 601.2i: you cast it)', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: HALL });
  });

  test('"as a sorcery": with the spell on the stack, or outside your main phase, it is refused (CR 602.5d)', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // The Bolt is still on the stack: the condition holds (it was cast), the timing does not.
    g.expect.illegal(0, { activate: HALL });
    g.passAll();
    g.expect.legal(0, { activate: HALL });
  });

  test('it is the log of this turn: the next turn starts with none', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { activate: HALL });
    g.advanceTo('precombatMain', { turn: 'next', active: 0 });
    g.expect.illegal(0, { activate: HALL });
  });
});

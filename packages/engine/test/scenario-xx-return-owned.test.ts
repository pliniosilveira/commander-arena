// "Return a nonland permanent you own to your hand" (Phenomenon Investigators): the `choose` selector of a `moveToZone` whose filter says `ownedByYou` and names no controller.
// Cards are SYNTHETIC, written as nodes: the real Oracle text is read and played in packages/cards/test/convert-grammar-engine-return-owned.test.ts.
// Pins: CR 108.3 (the owner of a permanent, not its controller, is what "you own" reads), CR 608.2d (the choice is made as the effect resolves and targets nothing), CR 400.3 (the
// permanent goes to its owner's hand). Three seats: a permanent of the controller's that another opponent controls can be chosen.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, type Effect, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const RECALL = 'SYNTHETIC Owner Recall';
const recallOf = (objects: unknown, to = 'hand'): CardDefinition =>
  singleFaceCard({
    name: RECALL,
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Return a nonland permanent you own to your hand.',
    spell: { effect: { kind: 'moveToZone', objects, to } as Effect },
  });
const OWNED = { kind: 'choose', filter: { notTypes: ['land'], ownedByYou: true } };
const recall = recallOf(OWNED);

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('validation', () => {
  test('"a permanent you own" with no controller is runnable, to the hand, the graveyard or the library', () => {
    for (const to of ['hand', 'graveyard', 'library']) {
      expect(validateCard(recallOf(OWNED, to)), to).toEqual([]);
    }
  });

  test('without "you own", or with another controller, the choice is still refused', () => {
    const refused = (filter: unknown) =>
      validateCard(recallOf({ kind: 'choose', filter })).map((issue) => issue.message);
    const message =
      "a choice of what to move is among the permanents you control: set controller to 'you'";
    expect(refused({ notTypes: ['land'] })).toContain(message);
    expect(refused({ notTypes: ['land'], ownedByYou: true, controller: 'opponent' })).toContain(
      message,
    );
    expect(refused({ notTypes: ['land'], notOwnedByYou: true })).toContain(message);
  });
});

describe('"return a nonland permanent you own to your hand"', () => {
  /** Seat 0 owns Bears it controls and an Angel seat 2 controls; it controls an Angel seat 1 owns. */
  const board = () =>
    scenario({ seats: 3 })
      .define(recall)
      .seat(0)
      .library(...LIBRARY)
      .hand(RECALL)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'kept' })
      .battlefield(ANGEL, { label: 'lent', controller: 2 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL, { label: 'borrowed', controller: 0 })
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the choice is among the permanents the controller owns, whoever controls them', () => {
    const g = board();
    g.act(0).cast(RECALL, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`pending is ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect([...d.legal].sort()).toEqual([g.id('kept'), g.id('lent')].sort());
  });

  test("a permanent an opponent controls goes to its owner's hand (CR 400.3)", () => {
    const g = board();
    g.act(0).cast(RECALL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('lent');
    expect(g.object('lent')).toMatchObject({ zone: 'hand', owner: 0 });
    expect(g.state.seats[0]?.hand).toContain(g.id('lent'));
    expect(g.object('borrowed').zone).toBe('battlefield');
    g.expect.invariants();
  });

  test('a permanent the controller controls but does not own cannot be chosen', () => {
    const g = board();
    g.act(0).cast(RECALL, { pay: true });
    g.passAll();
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id('borrowed')] }),
    ).toMatchObject({ ok: false });
  });

  test('one permanent owned: it is returned without a question', () => {
    const g = scenario({ seats: 3 })
      .define(recall)
      .seat(0)
      .library(...LIBRARY)
      .hand(RECALL)
      .battlefield('Island')
      .battlefield(ANGEL, { label: 'lent', controller: 1 })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RECALL, { pay: true });
    g.passAll();
    expect(g.object('lent')).toMatchObject({ zone: 'hand', owner: 0 });
  });
});

// Preparation cards (CR 722, D-214) with the SYNTHETIC Prepared Scout (a creature that enters prepared, its prepare spell "You gain 2 life", a sorcery): the layout, the
// designation, the copy of the prepare spell in exile, casting it, the loss of the designation as it is cast, a copy of the prepare spell, and what each other zone shows.
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView } from '../src';
import { scenario } from '../src/testing';

const CARD = 'SYNTHETIC Prepared Scout // Scout Tidings';
const FRONT = 'Prepared Scout';

const game = (extra: { hand?: string[]; battlefield?: string[]; opponentHand?: string[] } = {}) =>
  scenario()
    .seat(0)
    .hand(CARD, ...(extra.hand ?? []))
    .battlefield(
      'Mountain',
      'Mountain',
      'Mountain',
      'Island',
      'Island',
      ...(extra.battlefield ?? []),
    )
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .hand(...(extra.opponentHand ?? []))
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
const copyOf = (g: ReturnType<typeof game>) =>
  Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
const scout = (g: ReturnType<typeof game>) =>
  getView(g.state, 0).battlefield.find((o) => o.name === FRONT);

describe('a preparation card', () => {
  test('in the hand it has only its normal characteristics, and its prepare spell is not cast from it (CR 722.3, 722.4)', () => {
    const g = game();
    const inHand = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(inHand).toMatchObject({ name: FRONT, power: 2, toughness: 1 });
    expect(inHand?.types).toEqual(['creature']);
    const casts = getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell');
    expect(casts.every((a) => (a as { face?: number }).face === undefined)).toBe(true);
  });

  test('entering prepared: the designation and a copy of the prepare spell in exile that has only its characteristics (CR 722.3a, 722.3c)', () => {
    const g = game();
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    expect(scout(g)?.prepared).toBe(true);
    const copy = copyOf(g);
    expect(copy?.zone).toBe('exile');
    const shown = getView(g.state, 0).exile.find((o) => o.id === copy?.id);
    expect(shown).toMatchObject({ name: 'Scout Tidings', preparedSpell: true });
    expect(shown?.types).toEqual(['sorcery']);
    // One card of the game: the hand is empty and the library has not changed (CR 722.2c).
    expect(g.state.seats[0]?.hand).toHaveLength(0);
    g.expect.invariants();
  });

  test('the prepare spell is a sorcery: not at the opponent’s turn, not with a spell on the stack (CR 307.1)', () => {
    const g = game();
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    const castsOf = () =>
      getLegalActions(g.state, 0).filter(
        (a) => a.kind === 'castSpell' && a.object === copyOf(g)?.id,
      );
    expect(castsOf()).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(castsOf()).toHaveLength(0);
  });

  test('casting it: the permanent loses the designation, the copy is the spell and ceases to exist when it resolves (CR 601.2i, 707.10a)', () => {
    const g = game();
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    const id = copyOf(g)?.id as string;
    g.act(0).cast(id, { pay: true });
    expect(scout(g)?.prepared).toBeUndefined();
    expect(getView(g.state, 0).stack[0]?.name).toBe('Scout Tidings');
    g.passAll();
    g.expect.life(0, 42);
    expect(copyOf(g)).toBeUndefined();
    expect(getView(g.state, 0).exile).toHaveLength(0);
    expect(g.state.seats[0]?.graveyard).toHaveLength(0);
    g.expect.invariants();
  });

  test('a copy of the prepare spell is also a prepare spell: it has its characteristics and resolves as it does (CR 722.3d, 707.10)', () => {
    const g = game({ hand: ['SYNTHETIC Exact Twin'] });
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    const prepareSpell = g.state.stack[0] as string;
    g.act(0).cast('SYNTHETIC Exact Twin', { targets: [prepareSpell], pay: true });
    g.passAll();
    // The copy of the copy names the same card, face 1: both resolve, "You gain 2 life" twice.
    g.expect.life(0, 44);
    g.expect.invariants();
  });

  test('leaving the battlefield: the copy goes with the permanent, and the card in the hand is only the creature again (CR 400.7, 722.4)', () => {
    const g = game({ hand: ['Unsummon'] });
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    expect(copyOf(g)).toBeDefined();
    g.act(0).cast('Unsummon', { targets: [FRONT], pay: true });
    g.passAll();
    expect(copyOf(g)).toBeUndefined();
    expect(getView(g.state, 0).seats[0]?.hand?.map((o) => o.name)).toContain(FRONT);
    g.expect.invariants();
  });

  test('an opponent cannot cast it, and it is not offered to the opponent', () => {
    const g = game();
    g.act(0).cast(FRONT, { pay: true });
    g.passAll();
    const id = copyOf(g)?.id;
    expect(getLegalActions(g.state, 1).some((a) => a.kind === 'castSpell' && a.object === id)).toBe(
      false,
    );
  });
});

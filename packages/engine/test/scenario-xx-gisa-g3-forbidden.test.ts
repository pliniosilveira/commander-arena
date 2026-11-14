// Group 3 of the Gisa deck (issue 41, D-1427 and D-1428): "As an additional cost to cast this spell, you may sacrifice one or more creatures. When you do, copy this spell for each
// creature sacrificed this way." (Plumb the Forbidden), the SYNTHETIC Forbidden Rite of `src/cards/fixtures/synthetic-gisa-g3.ts`. Pins: CR 118.8 and 601.2b (an optional additional cost is
// announced as the spell is cast), CR 601.2h (it is paid with the other costs), CR 701.21a (the caster chooses what to sacrifice among the permanents they control), CR 603.12 and 603.4
// (a trigger that happens only if the cost was paid), CR 707.10 (a copy of a spell is put onto the stack above the original and is not cast), CR 707.10a (a copy that leaves the stack
// ceases to exist).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Forbidden Rite';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test(RITE, () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
  });
});

/** The spells on the stack, bottom first: whether each is a copy, with the name of the card it is a copy of. */
function stackOf(g: ScenarioGame) {
  return g.state.stack.map((id) => {
    const obj = g.state.objects[id];
    if (obj === undefined) throw new Error(`no object ${id}`);
    const cardId = obj.card ?? obj.copyOf;
    const card = cardId == null ? undefined : g.state.cards[cardId];
    return {
      name: card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?'),
      copy: obj.copyOf !== undefined && obj.copyOf !== null,
      kind: obj.stack?.kind,
      controller: obj.controller,
    };
  });
}

describe('Plumb the Forbidden', () => {
  const game = (battlefield: readonly string[] = [BEARS, SPIDER, ANGEL]) =>
    scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Swamp', { count: 3 })
      .battlefield(...battlefield)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the caster is asked which creatures to sacrifice (any number, none allowed) once the mana is paid', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    expect(d.legal).toHaveLength(3);
  });

  test('two creatures sacrificed: a trigger goes above the spell, and resolves into two copies, each a spell that draws a card and loses 1 life', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    // The spell and, above it, its own ability: "When you do, copy this spell for each creature sacrificed this way".
    expect(stackOf(g).map((s) => `${s.kind}:${s.copy ? 'copy' : 'orig'}`)).toEqual([
      'spell:orig',
      'ability:orig',
    ]);
    g.pass();
    g.pass();
    // The trigger resolved: two copies are on the stack above the original (CR 707.10), controlled by the caster.
    expect(stackOf(g).map((s) => `${s.kind}:${s.copy ? 'copy' : 'orig'}:${s.controller}`)).toEqual([
      'spell:orig:0',
      'spell:copy:0',
      'spell:copy:0',
    ]);
    g.passAll();
    // Three resolutions: three cards drawn and 3 life lost.
    g.expect.handSize(0, 3);
    g.expect.life(0, 37);
    expect(g.state.stack).toHaveLength(0);
    g.expect.invariants();
  });

  test('one creature sacrificed: one copy', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).choosePermanents(ANGEL);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 38);
  });

  test('every creature sacrificed: a copy for each of the three', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).choosePermanents(BEARS, SPIDER, ANGEL);
    g.passAll();
    g.expect.handSize(0, 4);
    g.expect.life(0, 36);
  });

  test('no creature sacrificed (the may declined): no trigger and no copy', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).choosePermanents();
    expect(stackOf(g).map((s) => s.kind)).toEqual(['spell']);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with no creature to sacrifice the spell is cast with nothing asked', () => {
    const g = game([]);
    g.act(0).cast(RITE, { pay: true });
    expect(g.state.pending?.kind).toBe('priority');
    expect(stackOf(g).map((s) => s.kind)).toEqual(['spell']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('the copies are not cast: nothing that watches casting sees them (the spell count of the turn is one)', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.pass();
    g.pass();
    const casts = g.events.filter((e) => e.kind === 'spellCast');
    expect(casts).toHaveLength(1);
  });

  test('cancelling the question rewinds the cast, mana included (CR 733)', () => {
    const g = game();
    g.act(0).cast(RITE, { pay: true });
    g.act(0).cancel();
    expect(g.state.stack).toHaveLength(0);
    g.expect.zone(RITE, 'hand', { seat: 0 });
    g.expect.tapped('Swamp[0]', false);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

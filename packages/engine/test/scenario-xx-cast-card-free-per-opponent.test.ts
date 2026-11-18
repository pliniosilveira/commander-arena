// "When this creature enters, for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell
// cast this way would be put into a graveyard, exile it instead." (the Diluvian Primordial group of the First Flight deck): `castCard` with `free`, over a slot that takes at
// most one target for each opponent (`TargetSpec.onePerOpponent`) in graveyards.
// Pins: CR 115.1 and 601.2c (one target slot, at most one card for each opponent, each in that opponent's graveyard, "up to one" may choose none), CR 608.2g (the casts are part
// of the resolution, in the order the targets were chosen, no player receives priority in between), CR 118.9 (without paying its mana cost; an additional cost is still paid),
// CR 614.1a (a spell cast this way is exiled instead of going to a graveyard: resolved, countered or fizzled), CR 400.7 (a target that left the graveyard is gone).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-primordial.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { confirmOptionalDecision, targetsDecision } from './pending-helpers';

const CASTER = 'SYNTHETIC Tidal Caster'; // {3}{U} 2/2: the trigger of the group
const BEAR = 'SYNTHETIC Quiet Cub'; // a creature card: never a target
const BLOODY = 'SYNTHETIC Bloody Study'; // {U} sorcery, sacrifice a creature as an additional cost, draw a card
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const EXILE = 'SYNTHETIC Quick Exile'; // {U} instant, exile target card from a graveyard
const COUNTERSPELL = 'Counterspell'; // {U}{U} instant
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main of turn 3 with the caster in hand and four Islands to pay for it; `theirs` adds to seat 1, `mine` to seat 0. */
function game(
  mine: (b: Builder) => Builder = (b) => b,
  theirs: (b: Builder) => Builder = (b) => b,
): ScenarioGame {
  const first = scenario().seat(0).life(20).hand(CASTER).battlefield('Island', { count: 4 });
  return theirs(
    mine(first)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** The creature is cast and resolves; its trigger is on the stack, with the targets decision pending. */
function toTargets(g: ScenarioGame): void {
  g.act(0).cast(CASTER, { pay: true });
  resolveTop(g);
}

describe('the card is valid, and the free cast is validated', () => {
  test('the synthetic card validates', () => {
    expect(validateCard(syntheticCard(CASTER))).toEqual([]);
  });

  test('free is true when present, and has no mana to spend', () => {
    const card = syntheticCard(CASTER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no ability');
    const withEffect = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [{ ...ability, effect }] }] }) as never;
    const object = { kind: 'target', id: 't1' };
    expect(
      validateCard(withEffect({ kind: 'castCard', object, free: false })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withEffect({ kind: 'castCard', object, free: true, anyManaType: true })).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withEffect({ kind: 'castCard', object, free: true }))).toEqual([]);
  });
});

describe('the slot: at most one target for each opponent, in that opponent’s graveyard (CR 115.1, 601.2c)', () => {
  test('instants and sorceries of the opponent are offered, grouped by the opponent; none is needed', () => {
    const g = game(
      (b) => b.graveyard(DIVINATION),
      (b) => b.graveyard(BOLT, DIVINATION, BEAR),
    );
    toTargets(g);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(1);
    expect(spec?.onePerGroup).toBe(true);
    const legal = spec?.legal ?? [];
    expect(legal).toHaveLength(2);
    expect(legal.every((t) => t.kind === 'object' && t.group === 1)).toBe(true);
    const ids = legal.map((t) => (t.kind === 'object' ? t.id : null));
    // Not my own graveyard, and not a creature card.
    expect(ids).toContain(g.id(BOLT));
    expect(ids).not.toContain(g.id(BEAR));
    expect(ids.every((id) => id !== null && g.state.objects[id]?.owner === 1)).toBe(true);
  });

  test('only my own graveyard holds an instant: the slot has no legal target, the trigger does nothing', () => {
    const g = game((b) => b.graveyard(DIVINATION));
    toTargets(g);
    // "Up to one": the ability goes on the stack with no target, and resolving it casts nothing.
    g.expect.pending('priority', 0);
    resolveTop(g);
    g.expect.stack([]);
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
  });

  test('a creature card alone is not a legal target', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(BEAR),
    );
    toTargets(g);
    resolveTop(g);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.zone(BEAR, 'graveyard', { seat: 1 });
  });

  test('choosing no target at all is allowed: nothing is cast', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(BOLT),
    );
    toTargets(g);
    g.act(0).chooseTargets();
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});

describe('the cast (CR 608.2g, 118.9): no mana is paid, and the spell is exiled instead of going to the graveyard', () => {
  test('a sorcery is cast free: the question, no payment, the effect happens, the card is exiled', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(DIVINATION),
    );
    toTargets(g);
    g.act(0).chooseTargets(DIVINATION);
    resolveTop(g); // the trigger resolves
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('castCard');
    expect(d.subject).toBe(g.id(DIVINATION));
    expect(d.seat).toBe(0);
    g.act(0).accept();
    // No payMana: the Divination is on the stack, controlled by me, owned by the opponent, and all four Islands but the one the creature tapped stay as they were.
    g.expect.stack([DIVINATION]);
    g.expect.pending('priority', 0);
    const spell = getView(g.state, 0).stack[0];
    expect(spell?.controller).toBe(0);
    expect(spell?.owner).toBe(1);
    expect(g.state.objects[g.id(DIVINATION)]?.stack?.free).toBe(true);
    const handBefore = getView(g.state, 0).seats[0]?.handCount ?? 0;
    resolveTop(g);
    expect(getView(g.state, 0).seats[0]?.handCount).toBe(handBefore + 2);
    g.expect.zone(DIVINATION, 'exile', { seat: 1 });
    expect(g.state.seats[1]?.graveyard).toEqual([]);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('an instant with a target asks for the target, then goes on the stack with nothing to pay', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(BOLT),
    );
    toTargets(g);
    g.act(0).chooseTargets(BOLT);
    resolveTop(g);
    g.act(0).accept();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT]);
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, fromZone: 'graveyard' }]);
    resolveTop(g);
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'exile', { seat: 1 });
  });

  test('declining leaves the card in the graveyard', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(DIVINATION),
    );
    toTargets(g);
    g.act(0).chooseTargets(DIVINATION);
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('a spell with an additional cost still pays it: Bloody Study sacrifices a creature of mine', () => {
    const g = game(
      (b) => b.battlefield(BEAR),
      (b) => b.graveyard(BLOODY),
    );
    toTargets(g);
    g.act(0).chooseTargets(BLOODY);
    resolveTop(g);
    g.act(0).accept();
    if (g.state.pending?.kind === 'choosePermanent') g.act(0).choosePermanents(BEAR);
    g.expect.stack([BLOODY]);
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    resolveTop(g);
    g.expect.zone(BLOODY, 'exile', { seat: 1 });
  });

  test('a spell that is countered is exiled instead of going to the graveyard (CR 614.1a)', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(DIVINATION).hand(COUNTERSPELL).battlefield('Island', { count: 2 }),
    );
    toTargets(g);
    g.act(0).chooseTargets(DIVINATION);
    resolveTop(g);
    g.act(0).accept();
    g.expect.stack([DIVINATION]);
    g.pass(); // I pass; the opponent holds the Counterspell
    g.act(1).cast(COUNTERSPELL, { pay: true, targets: [DIVINATION] });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile', { seat: 1 });
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
  });

  test('a spell that fizzles because its target is gone is exiled as well', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(BOLT).hand(BOLT).battlefield(BEAR, 'Mountain', 'Mountain'),
    );
    toTargets(g);
    g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard' });
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseTargets(BEAR);
    g.expect.stack([BOLT]);
    g.pass(); // I pass; the opponent kills their own Cub in response
    g.act(1).cast({ name: BOLT, zone: 'hand' }, { pay: true, targets: [BEAR] });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 1 });
    // The cast Bolt had no legal target left: it did not resolve, and it is exiled, not in the graveyard.
    expect(g.find({ name: BOLT, zone: 'exile' })).toHaveLength(1);
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(1); // only the one the opponent cast from the hand
  });
});

describe('a card that left the graveyard before the trigger resolves is not cast (CR 608.2b, 400.7)', () => {
  test('the target exiled in response: nothing happens', () => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(DIVINATION).hand(EXILE).battlefield('Island'),
    );
    toTargets(g);
    g.act(0).chooseTargets(DIVINATION);
    g.pass(); // I pass with the trigger on the stack; the opponent exiles the card
    g.act(1).cast(EXILE, { pay: true, targets: [DIVINATION] });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile', { seat: 1 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});

describe('multiplayer: one target slot for each opponent (CR 115.1, 601.2c)', () => {
  type Three = {
    readonly state: GameState;
    readonly bolt: ObjectId;
    readonly counter: ObjectId;
    readonly study: ObjectId;
    readonly bear: ObjectId;
  };

  /**
   * Three seats: seat 1 holds a Bolt, a Counterspell and a creature card in its graveyard, seat 2 (a copy of seat 1's seat, with the Divination given to it) holds the Divination.
   * The creature spell is on the stack.
   */
  const threeSeats = (): Three => {
    const g = game(
      (b) => b,
      (b) => b.graveyard(BOLT, COUNTERSPELL, DIVINATION, BEAR),
    );
    g.act(0).cast(CASTER, { pay: true });
    const s1 = g.state.seats[1];
    if (s1 === undefined) throw new Error('seat 1');
    const study = g.id(DIVINATION);
    const studyObject = g.state.objects[study];
    if (studyObject?.card === null || studyObject?.card === undefined) throw new Error('card');
    const state = {
      ...g.state,
      seats: [
        ...g.state.seats.map((s) =>
          s.id === 1 ? { ...s, graveyard: s.graveyard.filter((id) => id !== study) } : s,
        ),
        { ...s1, id: 2, graveyard: [study], hand: [], library: [] },
      ],
      cards: {
        ...g.state.cards,
        [studyObject.card]: { ...g.state.cards[studyObject.card], owner: 2 },
      },
      objects: {
        ...g.state.objects,
        [study]: { ...studyObject, owner: 2, controller: 2, zoneOwner: 2 },
      },
    } as unknown as GameState;
    return {
      state,
      bolt: g.id(BOLT),
      counter: g.id(COUNTERSPELL),
      study,
      bear: g.id(BEAR),
    };
  };

  /** Everyone passes in turn until the top of the stack resolves or a question is asked. */
  const pass = (state: GameState): GameState => {
    let next = state;
    const top = next.stack.length;
    for (let i = 0; i < 3 && next.stack.length === top && next.pending?.kind === 'priority'; i++) {
      const out = applyAction(next, next.pending.seat, { kind: 'pass' });
      if (!out.ok) throw new Error(out.error);
      next = out.state;
    }
    return next;
  };

  const apply = (state: GameState, seat: number, action: Parameters<typeof applyAction>[2]) => {
    const out = applyAction(state, seat, action);
    if (!out.ok) throw new Error(out.error);
    return out.state;
  };

  const asked = (state: GameState) => {
    const q = state.pending;
    if (q?.kind !== 'confirmOptional' || q.purpose !== 'castCard') {
      throw new Error(`expected the castCard question, got ${q?.kind}`);
    }
    return q;
  };

  const pick = (id: ObjectId, group: number) => ({
    kind: 'object' as const,
    id,
    specId: 't1',
    group,
  });

  test('the slot takes up to two cards, one of each opponent, grouped by the opponent', () => {
    const { state, bolt, counter, study, bear } = threeSeats();
    const onStack = pass(state); // the creature resolves; its trigger asks for targets
    const t = onStack.pending;
    if (t?.kind !== 'targets') throw new Error(`expected targets, got ${t?.kind}`);
    const spec = t.specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(2);
    expect(spec?.onePerGroup).toBe(true);
    const legal = spec?.legal ?? [];
    expect(legal.map((x) => (x.kind === 'object' ? [x.id, x.group] : null))).toEqual(
      expect.arrayContaining([
        [bolt, 1],
        [counter, 1],
        [study, 2],
      ]),
    );
    expect(legal).toHaveLength(3);
    expect(legal.some((x) => x.kind === 'object' && x.id === bear)).toBe(false);
    // Two cards of the same opponent are refused; one of each is accepted.
    expect(
      applyAction(onStack, 0, { kind: 'chooseTargets', targets: [pick(bolt, 1), pick(counter, 1)] })
        .ok,
    ).toBe(false);
    expect(
      applyAction(onStack, 0, { kind: 'chooseTargets', targets: [pick(bolt, 1), pick(study, 2)] })
        .ok,
    ).toBe(true);
  });

  test('one card of each opponent: both are asked about, in the order chosen, and both end up in exile', () => {
    const { state, bolt, study } = threeSeats();
    let cur = pass(state); // the creature resolves; its trigger asks for targets
    cur = apply(cur, 0, { kind: 'chooseTargets', targets: [pick(study, 2), pick(bolt, 1)] });
    cur = pass(cur); // the trigger resolves
    expect(asked(cur).subject).toBe(study);
    cur = apply(cur, 0, { kind: 'acceptOptional' });
    expect(asked(cur).subject).toBe(bolt);
    cur = apply(cur, 0, { kind: 'acceptOptional' });
    // The Bolt asks for its own target; the Divination needs none and nothing is paid.
    expect(cur.pending?.kind).toBe('targets');
    cur = apply(cur, 0, {
      kind: 'chooseTargets',
      targets: [{ kind: 'player', seat: 2, specId: 't1' }],
    });
    expect(cur.stack).toHaveLength(2);
    expect(cur.pending?.kind).toBe('priority');
    cur = pass(pass(cur));
    cur = pass(pass(cur));
    expect(cur.stack).toEqual([]);
    expect(cur.seats[2]?.graveyard).toEqual([]);
    expect(
      getView(cur, 0)
        .exile.map((o) => o.name)
        .sort(),
    ).toEqual([DIVINATION, BOLT]);
    expect(cur.seats[2]?.life).toBe(17); // the Bolt hit seat 2 (20 life, a copy of seat 1)
    expect(checkInvariants(cur)).toEqual([]);
  });

  test('a player who has lost the game is not an opponent for the slot', () => {
    const { state } = threeSeats();
    const lost = {
      ...state,
      seats: state.seats.map((s) => (s.id === 2 ? { ...s, hasLost: true } : s)),
    } as GameState;
    // Seat 2 is out: the creature resolves and the slot takes one card at most.
    const asking = pass(lost);
    const t = asking.pending;
    if (t?.kind !== 'targets') throw new Error(`expected targets, got ${t?.kind}`);
    expect(t.specs[0]?.max).toBe(1);
  });
});

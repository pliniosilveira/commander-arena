// Vehicles and Crew (CR 301.7, 702.122).
// Pins: CR 702.122a ("Crew N" means "Tap any number of other untapped creatures you control with
// total power N or greater: this permanent becomes an artifact creature until end of turn"),
// 301.7a and 301.7b (a Vehicle has its printed power and toughness only while it is a creature, and
// has them as soon as it becomes one), 208.3 (a noncreature permanent has no power or toughness),
// 205.1b ("artifact creature" keeps the prior types), 302.6 (summoning sickness: a creature that
// crews is not using its own {T} ability, but a Vehicle that came under control this turn cannot
// attack), 514.2 (cleanup ends "until end of turn" effects), 602.2b and 733 (costs are paid as the
// ability is activated; cancelling rewinds), 704.5n (an Equipment on something that is no longer a
// creature becomes unattached). Cards are SYNTHETIC (src/cards/fixtures/synthetic-vehicles.ts).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  legalActionsForDecision,
  stateHash,
} from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const WAGON = 'SYNTHETIC Rattle Wagon'; // artifact Vehicle 4/4, Crew 3
const SKIFF = 'SYNTHETIC Scout Skiff'; // artifact Vehicle 2/2 flying, Crew 1
const BEARS = 'Grizzly Bears'; // 2/2
const BIG = 'SYNTHETIC Vanilla 3/3';
const HUGE = 'SYNTHETIC Vanilla 5/5';
const BLADE = 'SYNTHETIC Blade'; // +2/+0, equip {1}

const crewIndexOf = (g: ScenarioGame, name: string): number => {
  const abilities = derive(g.state, g.object(name)).abilities;
  const i = abilities.findIndex((a) => a.kind === 'activated');
  if (i < 0) throw new Error(`${name} has no activated ability`);
  return i;
};

describe('CR 702.122a: the keyword expands into the activated ability after the printed ones', () => {
  test('derive appends the ability, keeps the keyword, and gives a Vehicle no power or toughness (CR 208.3)', () => {
    const g = scenario().seat(0).battlefield(WAGON).seat(1).build();
    const derived = derive(g.state, g.object(WAGON));
    expect(derived.abilities.map((a) => a.kind)).toEqual(['keyword', 'activated']);
    expect(derived.abilities[1]).toEqual({
      kind: 'activated',
      cost: [{ kind: 'tapCreatures', totalPower: 3 }],
      effect: {
        kind: 'setTypes',
        objects: { kind: 'this' },
        types: ['artifact', 'creature'],
        additive: true,
        duration: 'untilEndOfTurn',
      },
    });
    expect([derived.power, derived.toughness]).toEqual([null, null]);
    g.expect.derived(WAGON, { types: ['artifact'], subtypes: ['Vehicle'], keywords: ['crew'] });
  });
});

describe('paying the crew cost: tap untapped creatures you control with total power N or more', () => {
  test('one creature with enough power is chosen by the engine, which says so', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).build();
    const mark = g.mark();
    g.act(0).activate(WAGON);
    g.expect.pending('priority', 0);
    g.expect.tapped(BIG);
    g.expect.stack([`${WAGON} (ability)`]);
    expect(g.eventsSince(mark)).toMatchObject([
      { kind: 'permanentsChosen', purpose: 'crew', automatic: true, objects: [g.id(BIG)] },
      { kind: 'tapped', object: g.id(BIG) },
      { kind: 'abilityActivated', source: g.id(WAGON) },
    ]);
  });

  test('a creature whose power counters bring it to N crews alone (power is derived, CR 613.4c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .seat(1)
      .build();
    g.act(0).activate(WAGON);
    g.expect.tapped(BEARS);
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
  });

  test('two small creatures crew together: the decision names the purpose, the bounds and the power needed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate(WAGON);
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ purpose: 'crew', min: 1, max: 2, forCost: true, minTotalPower: 3 });
    expect(d.legal).toEqual([g.id(`${BEARS}[0]`), g.id(`${BEARS}[1]`)]);
    expect(d.powers).toEqual({ [g.id(`${BEARS}[0]`)]: 2, [g.id(`${BEARS}[1]`)]: 2 });
    expect(d.source).toBe(g.state.stack.at(-1));
    g.act(0).choosePermanents(`${BEARS}[0]`, `${BEARS}[1]`);
    g.expect.tapped(`${BEARS}[0]`);
    g.expect.tapped(`${BEARS}[1]`);
    g.expect.stack([`${WAGON} (ability)`]);
    g.expect.pending('priority', 0);
  });

  test('a choice with too little total power is refused and the question stays pending', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate(WAGON);
    const before = g.hash();
    const one = g.act(0).try.action({
      kind: 'choosePermanents',
      objects: [g.id(`${BEARS}[0]`)],
    });
    expect(one).toMatchObject({ ok: false, error: expect.stringContaining('enough total power') });
    const none = g.act(0).try.action({ kind: 'choosePermanents', objects: [] });
    expect(none.ok).toBe(false);
    g.expect.hash(before);
    g.expect.pending('choosePermanent', 0);
  });

  test('more creatures than needed may be tapped (CR 702.122a: "any number")', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).battlefield(BEARS).seat(1).build();
    g.act(0).activate(WAGON);
    g.act(0).choosePermanents(BIG, BEARS);
    g.expect.tapped(BIG);
    g.expect.tapped(BEARS);
  });

  test('only untapped creatures you control, and never the Vehicle itself, are candidates', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, SKIFF)
      .battlefield(BIG)
      .battlefield(BEARS, { tapped: true })
      .battlefield('Forest')
      .seat(1)
      .battlefield(HUGE)
      .build();
    g.act(0).activate(WAGON, { ability: crewIndexOf(g, WAGON) });
    // Only BIG is an untapped creature: a Vehicle that is not crewed yet is not a creature.
    g.expect.tapped(BIG);
    g.expect.derived(SKIFF, { types: ['artifact'] });

    const h = scenario()
      .seat(0)
      .battlefield(WAGON, SKIFF)
      .battlefield(BEARS, { count: 2 })
      .battlefield(BEARS, { tapped: true })
      .seat(1)
      .battlefield(HUGE)
      .build();
    // Crew the Skiff first: it becomes a creature and is an untapped creature you control...
    h.act(0).activate(SKIFF);
    h.expect.pending('choosePermanent', 0);
    const skiffCrew = choosePermanentDecision(h);
    expect(skiffCrew.legal).toHaveLength(2);
    h.act(0).choosePermanents(`${BEARS}[0]`);
    h.passAll();
    h.expect.derived(SKIFF, { types: ['artifact', 'creature'] });
    // ... so it may crew the Wagon, but the Wagon is never a candidate for its own crew.
    h.act(0).activate(WAGON);
    const wagonCrew = choosePermanentDecision(h);
    // The crewed Skiff and the one untapped Bears; not the Wagon, not the tapped Bears.
    expect(wagonCrew.legal).toEqual([h.id(SKIFF), h.id(`${BEARS}[1]`)]);
  });

  test("the opponent's creatures never crew your Vehicle", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(HUGE)
      .build();
    // One Bears (2 power) is not enough, and the opposing 5/5 does not help.
    g.expect.illegal(0, { activate: WAGON, ability: 1 });
    const r = g.act(0).try.activate(WAGON);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('total power') });
  });

  test('not offered when the untapped creatures add up to less than N, or are all tapped', () => {
    const weak = scenario().seat(0).battlefield(WAGON, BEARS).seat(1).build();
    weak.expect.illegal(0, { activate: WAGON });
    const tapped = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(HUGE, { tapped: true })
      .seat(1)
      .build();
    tapped.expect.illegal(0, { activate: WAGON });
    const none = scenario().seat(0).battlefield(WAGON).seat(1).build();
    none.expect.illegal(0, { activate: WAGON });
  });

  test('cancel rewinds the whole activation (CR 733): nothing tapped, nothing on the stack', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { count: 2 })
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).activate(WAGON);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toContain('cancel');
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped(`${BEARS}[0]`, false);
    g.expect.tapped(`${BEARS}[1]`, false);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('a summoning-sick creature may crew (CR 302.6 restricts only its own {T} abilities)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BIG, { fresh: true })
      .seat(1)
      .build();
    g.expect.derived(BIG, { types: ['creature'] });
    expect(g.view(0).battlefield.find((o) => o.id === g.id(BIG))?.summoningSick).toBe(true);
    g.act(0).activate(WAGON);
    g.expect.tapped(BIG);
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
  });
});

describe('a crewed Vehicle is an artifact creature with its printed power and toughness until end of turn', () => {
  function crewed() {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, BIG)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).activate(WAGON);
    g.passAll();
    return g;
  }

  test('the types are added to the Vehicle subtype, and the printed 4/4 appears at once (CR 301.7b, 205.1b)', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).build();
    g.act(0).activate(WAGON);
    // While the ability waits on the stack the Vehicle is still not a creature.
    g.expect.derived(WAGON, { types: ['artifact'] });
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'], subtypes: ['Vehicle'] });
    g.expect.pt(WAGON, 4, 4);
    expect(g.state.continuousEffects).toHaveLength(1);
    expect(g.state.continuousEffects[0]).toMatchObject({
      until: 'endOfTurn',
      objects: [g.id(WAGON)],
      change: { kind: 'setTypes', types: ['artifact', 'creature'], additive: true },
    });
  });

  test('it keeps its printed keywords, and modifiers apply on top of the printed values', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SKIFF, BEARS)
      .battlefield(BLADE, 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(SKIFF);
    g.passAll();
    g.expect.derived(SKIFF, { types: ['artifact', 'creature'], keywords: ['flying', 'crew'] });
    g.expect.pt(SKIFF, 2, 2);
    // An Equipment may now equip it (it is a creature you control): +2/+0 on top of the printed 2/2.
    g.act(0).activate(BLADE, { ability: 2, targets: [SKIFF], pay: true });
    g.passAll();
    g.expect.attached(BLADE, SKIFF);
    g.expect.pt(SKIFF, 4, 2);
  });

  test('it attacks the turn it was crewed if it has been under control since the turn began', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).at('precombatMain').build();
    g.act(0).activate(WAGON);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(WAGON, true);
    g.act(0).attack(WAGON);
    g.expect.tapped(WAGON);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('a Vehicle that came under control this turn cannot attack even when crewed (CR 302.6)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, { fresh: true })
      .battlefield(BIG)
      .seat(1)
      .at('precombatMain')
      .build();
    g.act(0).activate(WAGON);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(WAGON, false);
    g.expect.canAttack(BIG, false); // the crew is tapped
    g.expect.illegal(0, { declareAttackers: [{ attacker: WAGON }] });
  });

  test('an uncrewed Vehicle is not a creature, so it cannot attack', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).at('precombatMain').build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(WAGON, false);
    g.expect.canAttack(BIG, true);
  });

  test('it blocks, takes damage like a creature, and dies to lethal damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, BIG)
      .seat(1)
      .battlefield(HUGE)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(HUGE);
    // The attackers are declared; seat 1 passes priority, then seat 0 crews before blockers.
    g.act(1).pass();
    g.act(0).activate(WAGON);
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
    g.advanceTo('declareBlockers');
    g.expect.canBlock(WAGON, HUGE, true);
    g.expect.canBlock(BIG, HUGE, false); // tapped to crew
    g.act(0).declareBlockers([{ blocker: WAGON, attacker: HUGE }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(WAGON, 'graveyard', { seat: 0 }); // 5 damage on a 4/4
    g.expect.damage(HUGE, 4);
    g.expect.life(0, 40);
  });

  test('an uncrewed Vehicle cannot block', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, BEARS)
      .seat(1)
      .battlefield(HUGE)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(HUGE);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(BEARS, HUGE, true);
    g.expect.canBlock(WAGON, HUGE, false);
  });

  test('it is a creature at the end step and stops being one at cleanup (CR 514.2)', () => {
    const g = crewed();
    g.advanceTo('end');
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(WAGON, { types: ['artifact'], subtypes: ['Vehicle'] });
    // CR 208.3: with the creature type gone it has no power or toughness again.
    expect(derive(g.state, g.object(WAGON)).power).toBeNull();
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('it can be crewed again on a later turn: a new effect, a new timestamp', () => {
    const g = crewed();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(0).activate(WAGON);
    g.passAll();
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
  });

  test('crewing in response to nothing and again keeps one creature: the effects stack harmlessly', () => {
    const g = scenario().seat(0).battlefield(WAGON).battlefield(BIG, { count: 2 }).seat(1).build();
    g.act(0).activate(WAGON);
    g.act(0).choosePermanents(`${BIG}[0]`);
    g.act(0).activate(WAGON); // one candidate left: the engine chooses
    g.expect.tapped(`${BIG}[1]`);
    g.passAll();
    expect(g.state.continuousEffects).toHaveLength(2);
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
    g.expect.pt(WAGON, 4, 4);
  });
});

describe('a crewed Vehicle and an Equipment (CR 301.5, 704.5n)', () => {
  test('the Equipment can equip it only while it is a creature, and falls off at cleanup but stays', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, BIG, BLADE, 'Forest', 'Forest')
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    // Before crewing: the only legal target is the creature, not the Vehicle.
    const first = g.act(0).activate(BLADE, { ability: 2 });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    expect(d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([g.id(BIG)]);
    first.cancel();

    g.act(0).activate(WAGON, { ability: crewIndexOf(g, WAGON) });
    g.passAll();
    const equip = g.act(0).activate(BLADE, { ability: 2 });
    const crewedTargets = g.state.pending;
    if (crewedTargets?.kind !== 'targets') throw new Error('expected targets');
    expect(crewedTargets.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null))).toContain(
      g.id(WAGON),
    );
    equip.targets([WAGON]).pay();
    g.passAll();
    g.expect.attached(BLADE, WAGON);
    g.expect.pt(WAGON, 6, 4);

    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(WAGON, { types: ['artifact'] });
    g.expect.attached(BLADE, null);
    g.expect.zone(BLADE, 'battlefield', { seat: 0 });
  });
});

describe('what the view shows about a Vehicle', () => {
  const objectOf = (g: ScenarioGame, name: string) =>
    g.view(0).battlefield.find((o) => o.name === name);

  test('an uncrewed Vehicle has no power or toughness but shows its printed ones (CR 301.7a)', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).build();
    expect(objectOf(g, WAGON)).toMatchObject({ power: null, toughness: null });
    expect(objectOf(g, WAGON)?.printedPt).toEqual({ power: 4, toughness: 4 });
    // A creature and a noncreature permanent without printed values have neither field.
    expect(objectOf(g, BIG)?.printedPt).toBeUndefined();
    expect(objectOf(g, BIG)?.wouldBeSummoningSick).toBeUndefined();
  });

  test('once crewed it is a creature: power and toughness are shown, the printed pair is not', () => {
    const g = scenario().seat(0).battlefield(WAGON, BIG).seat(1).build();
    g.act(0).activate(WAGON);
    g.passAll();
    expect(objectOf(g, WAGON)).toMatchObject({ power: 4, toughness: 4 });
    expect(objectOf(g, WAGON)?.printedPt).toBeUndefined();
    expect(objectOf(g, WAGON)?.types).toEqual(['artifact', 'creature']);
    expect(objectOf(g, WAGON)?.subtypes).toContain('Vehicle');
  });

  test('a Vehicle that arrived this turn is marked as one that would be summoning sick (CR 302.6)', () => {
    const fresh = scenario().seat(0).battlefield(WAGON, { fresh: true }).seat(1).build();
    expect(objectOf(fresh, WAGON)?.wouldBeSummoningSick).toBe(true);
    expect(objectOf(fresh, WAGON)?.summoningSick).toBe(false); // it is not a creature
    const old = scenario().seat(0).battlefield(WAGON).seat(1).build();
    expect(objectOf(old, WAGON)?.wouldBeSummoningSick).toBeUndefined();
    // The opponent sees the same public information.
    expect(fresh.view(1).battlefield.find((o) => o.name === WAGON)?.printedPt).toEqual({
      power: 4,
      toughness: 4,
    });
  });

  test('the crew ability is listed among the activated abilities with its cost', () => {
    const g = scenario().seat(0).battlefield(WAGON).seat(1).build();
    expect(objectOf(g, WAGON)?.activated?.map((a) => a.ability.cost)).toEqual([
      [{ kind: 'tapCreatures', totalPower: 3 }],
    ]);
    expect(objectOf(g, WAGON)?.keywords).toEqual(['crew']);
  });
});

describe('legal actions agree with applyAction', () => {
  test('every listed answer to the crew question is accepted and has enough power', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { count: 3 })
      .seat(1)
      .build();
    g.act(0).activate(WAGON);
    const d = choosePermanentDecision(g);
    const listed = getLegalActions(g.state, 0);
    expect(legalActionsForDecision(d)).toEqual(listed);
    expect(getLegalActions(g.state, 1)).toEqual([]);
    expect(new Set(listed.map((a) => JSON.stringify(a))).size).toBe(listed.length);
    const answers = listed.filter(
      (a): a is Extract<Action, { kind: 'choosePermanents' }> => a.kind === 'choosePermanents',
    );
    // Any two of three 2-power creatures is enough, and so are all three; no single one is.
    expect(answers.map((a) => a.objects.length).sort()).toEqual([2, 2, 2]);
    expect(listed.map((a) => a.kind)).toEqual(expect.arrayContaining(['cancel', 'concede']));
    for (const a of listed) {
      if (a.kind === 'concede') continue;
      const r = applyAction(g.state, 0, a);
      expect(r.ok, JSON.stringify(a)).toBe(true);
      if (r.ok) expect(checkInvariants(r.state), JSON.stringify(a)).toEqual([]);
    }
  });

  test('the activation is on offer exactly when the cost can be paid, and every offer is accepted', () => {
    const cases: [string, (b: ReturnType<typeof scenario>) => void, boolean][] = [
      ['enough in one creature', (b) => b.battlefield(BIG), true],
      ['enough in two', (b) => b.battlefield(BEARS, { count: 2 }), true],
      ['too little', (b) => b.battlefield(BEARS), false],
      ['a tapped big creature', (b) => b.battlefield(HUGE, { tapped: true }), false],
      ['a sick big creature', (b) => b.battlefield(HUGE, { fresh: true }), true],
    ];
    for (const [label, add, offered] of cases) {
      const b = scenario().seat(0).battlefield(WAGON);
      add(b);
      const g = b.seat(1).build();
      const options = getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');
      expect(options.length > 0, label).toBe(offered);
      for (const o of options) expect(applyAction(g.state, 0, o).ok, label).toBe(true);
      expect(g.act(0).try.activate(WAGON).ok, label).toBe(offered);
    }
  });

  test('the opponent is offered nothing, and cannot activate my Vehicle', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .seat(1)
      .battlefield(HUGE)
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    expect(getLegalActions(g.state, 1).filter((a) => a.kind === 'activate')).toEqual([]);
    const r = g.act(1).try.action({ kind: 'activate', object: g.id(WAGON), abilityIndex: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('replay determinism', () => {
  function play(): { state: GameState; start: GameState; log: ScenarioGame['log'] } {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, BEARS, BEARS, BLADE, 'Forest')
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield(HUGE)
      .library('Island', { count: 6 })
      .at('precombatMain')
      .build();
    const start = g.state;
    g.act(0).activate(WAGON);
    g.act(0).choosePermanents(`${BEARS}[0]`, `${BEARS}[1]`);
    g.passAll();
    g.act(0).activate(BLADE, { ability: 2, targets: [WAGON], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(WAGON);
    g.advanceTo('upkeep', { turn: 'next' });
    return { state: g.state, start, log: g.log };
  }

  test('two runs of the same actions end in the same state', () => {
    expect(stateHash(play().state)).toBe(stateHash(play().state));
  });

  test('replaying the action log from the start reproduces the final state', () => {
    const { state, start, log } = play();
    let replay = start;
    for (const { seat, action } of log) {
      const r = applyAction(replay, seat, action);
      if (!r.ok) throw new Error(r.error);
      replay = r.state;
    }
    expect(stateHash(replay)).toBe(stateHash(state));
  });
});

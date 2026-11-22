// Combat with three seats (#421, step 3 of more opponents): what the two-seat tests of annihilator, reselecting an attack, "attacks you" triggers, goad, the random opponent and commander
// damage pinned with one defending player, played with three, where "the defending player", "an opponent" and "the player attacked" are not one player. CR 508.5 (the defending player is
// the one a creature attacks, or the controller of the planeswalker it attacks), 702.86a (Annihilator), 508.7 (reselecting an attack), 701.15b (goad), 903.10a and 704.6c (commander damage).
// Cards are SYNTHETIC (src/cards/fixtures) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, type GameState } from '../src/index';
import { attackCandidates, requiredAttackers } from '../src/rules/combat-legality';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TITAN = 'SYNTHETIC Annihilator Titan'; // 5/5, Annihilator 2
const IMP = 'SYNTHETIC Eater Imp'; // 2/3, Annihilator 1
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const SPIDER = 'Giant Spider';
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** Answers an `orderTriggers` question (the controller has two different triggers) with the order they are in. */
function settleTriggers(g: ScenarioGame): GameState {
  let state = g.state;
  for (let i = 0; i < 10; i += 1) {
    const d = state.pending;
    if (d?.kind === 'orderTriggers') {
      const out = applyAction(state, d.seat, {
        kind: 'orderTriggers',
        order: d.triggers.map((_, n) => n),
      } as never);
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      continue;
    }
    if (d?.kind === 'priority' && state.stack.length > 0) {
      const out = applyAction(state, d.seat, { kind: 'pass' });
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      continue;
    }
    break;
  }
  return state;
}

describe('annihilator with three seats (CR 702.86a, 508.5)', () => {
  test('each trigger makes the player its creature attacks sacrifice, not the first opponent', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(TITAN, { label: 'titan' })
      .battlefield(IMP, { label: 'imp' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(ELVES, { label: 'e1' })
      .battlefield('Mountain', { label: 'm1' })
      .library(...FILLER)
      .seat(2)
      .battlefield(SPIDER, { label: 's2' })
      .battlefield('Swamp', { label: 'w2' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'titan', target: { player: 1 } },
      { attacker: 'imp', target: { player: 2 } },
    ]);
    let state = settleTriggers(g);
    // Seat 1 (Annihilator 2) has three permanents and chooses two; seat 2 (Annihilator 1) has two and chooses one.
    const asked: number[] = [];
    for (let i = 0; i < 4 && state.pending?.kind === 'choosePermanent'; i += 1) {
      const d = state.pending;
      asked.push(d.seat);
      const out = applyAction(state, d.seat, {
        kind: 'choosePermanents',
        objects: d.legal.slice(0, d.min) as never,
      });
      if (!out.ok) throw new Error(out.error);
      state = settleTriggers({ state: out.state } as ScenarioGame);
    }
    expect([...asked].sort()).toEqual([1, 2]);
    const left = (seat: number) =>
      Object.values(state.objects).filter((o) => o.zone === 'battlefield' && o.controller === seat);
    expect(left(1)).toHaveLength(1); // three permanents, two sacrificed
    expect(left(2)).toHaveLength(1); // two permanents, one sacrificed
  });
});

describe('annihilator on a creature that attacks a planeswalker (CR 508.5)', () => {
  test('the controller of the planeswalker sacrifices, and the player who is not attacked does not', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(TITAN, { label: 'titan' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, ELVES, 'Mountain')
      .library(...FILLER)
      .seat(2)
      .battlefield(WALKER, { label: 'walker' })
      .battlefield(BEARS, ELVES, 'Swamp')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('titan', 'walker');
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent')
      throw new Error(`expected a sacrifice choice, got ${d?.kind}`);
    expect(d.seat).toBe(2);
    expect(d.min).toBe(2);
    for (const id of d.legal) expect(g.state.objects[id]?.controller).toBe(2);
    // Seat 1 keeps everything.
    expect(
      Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.controller === 1),
    ).toHaveLength(3);
  });
});

describe('commander damage with three seats (CR 903.10a, 704.6c)', () => {
  const YARGLE = 'Yargle, Glutton of Urborg'; // 9/3
  const ISAMARU = 'Isamaru, Hound of Konda'; // 2/2

  const hit = (g: ScenarioGame, name: string, seat: number) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(name, { player: seat });
    g.advanceTo('postcombatMain');
  };

  test('21 from one commander to seat 1 loses only seat 1', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(YARGLE, { commander: true, label: 'y' })
      .library(...FILLER)
      .seat(1)
      .commanderDamageTaken(YARGLE, 12)
      .library(...FILLER)
      .seat(2)
      .commanderDamageTaken(YARGLE, 12)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    hit(g, 'y', 1);
    g.expect.hasLost(1);
    expect(g.state.seats[2]?.hasLost).toBe(false);
    expect(g.state.seats[0]?.hasLost).toBe(false);
    expect(g.state.result).toBeNull();
  });

  test('damage from two different commanders to the same seat does not add', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(YARGLE, { commander: true, label: 'y' })
      .library(...FILLER)
      .seat(1)
      .commanderDamageTaken(YARGLE, 12)
      .commanderDamageTaken(ISAMARU, 12)
      .library(...FILLER)
      .seat(2)
      .battlefield(ISAMARU, { commander: true })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // 12 + 12 is 24, but no one commander has dealt 21: seat 1 is still in the game, before and after a check.
    g.act(0).pass();
    expect(g.state.seats[1]?.hasLost).toBe(false);
    g.advanceTo('declareAttackers', { turn: 3 });
    g.act(0).attack('y', { player: 1 });
    g.advanceTo('postcombatMain');
    // Yargle's 9 more make 21 from Yargle: now seat 1 loses.
    g.expect.hasLost(1);
  });

  test('partner commanders of one player count separately', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(YARGLE, { commander: true, label: 'y' })
      .battlefield(ISAMARU, { commander: true, label: 'i' })
      .library(...FILLER)
      .seat(1)
      .commanderDamageTaken(YARGLE, 12)
      .commanderDamageTaken(ISAMARU, 12)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('i', { player: 1 });
    g.advanceTo('postcombatMain');
    // Isamaru's 2 make 14 from it and 12 from Yargle: 26 together, neither at 21.
    expect(g.state.seats[1]?.hasLost).toBe(false);
  });
});

describe('"whenever another player attacks with two or more creatures, they draw if none attacked you" with three seats', () => {
  const MARSHAL = 'SYNTHETIC Raid Marshal';
  const build = (marshalSeat: 1 | 2) => {
    const b = scenario({ seats: 3 })
      .seat(0)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ELVES, { label: 'b' })
      .library(...FILLER);
    for (const seat of [1, 2] as const) {
      const s = b.seat(seat);
      if (seat === marshalSeat) s.battlefield(MARSHAL);
      s.library(...FILLER);
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  const handOf = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;

  test('one creature attacks the controller of the Marshal: the attacker draws nothing', () => {
    const g = build(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'a', target: { player: 1 } },
      { attacker: 'b', target: { player: 2 } },
    ]);
    g.passAll();
    expect(handOf(g, 0)).toBe(0);
  });

  test('both attack the other opponent: none attacked the Marshal’s controller, so the attacker draws', () => {
    const g = build(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'a', target: { player: 2 } },
      { attacker: 'b', target: { player: 2 } },
    ]);
    g.passAll();
    expect(handOf(g, 0)).toBe(1);
  });

  test('a Marshal of the third seat reads its own controller, not the first opponent', () => {
    const g = build(2);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'a', target: { player: 1 } },
      { attacker: 'b', target: { player: 1 } },
    ]);
    g.passAll();
    expect(handOf(g, 0)).toBe(1);
  });
});

describe('goad with three seats (CR 701.15b, 701.15c)', () => {
  const GOAD = 'SYNTHETIC Goad Spell';
  const goadSpell = singleFace({
    name: GOAD,
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Goad target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'goad', objects: { kind: 'target', id: 't1' } },
    },
  });

  /** `goaders` each cast the Goad spell on seat 1's Bears during their own turns; the game then waits in seat 1's declare attackers step. */
  const goadedBy = (goaders: readonly (0 | 2)[]): ScenarioGame => {
    const b = scenario({ seats: 3 }).define(goadSpell);
    b.seat(0)
      .battlefield('Mountain')
      .hand(GOAD)
      .library(...FILLER);
    b.seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .library(...FILLER);
    b.seat(2)
      .battlefield('Mountain')
      .hand(GOAD)
      .library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    for (const seat of goaders) {
      g.act(seat).cast(GOAD, { pay: true, targets: ['bears'] });
      g.passAll();
    }
    return g;
  };

  test('goaded by seat 0: on its next turn the creature must attack, and only seat 2 can be attacked', () => {
    const g = goadedBy([0]);
    g.advanceTo('declareAttackers', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    const d = g.state.pending;
    const candidates = attackCandidates(g.state, 1);
    const bears = g.id('bears');
    expect(candidates.find((c) => c.attacker === bears)?.targets).toEqual([
      { kind: 'player', seat: 2 },
    ]);
    expect(requiredAttackers(g.state, candidates)).toContain(bears);
    expect(d?.kind).toBe('declareAttackers');
  });
});

describe('the random opponent with three seats (CR 508.1d, 506.1)', () => {
  const DRAGON = 'SYNTHETIC Territorial Dragon 3';
  const dragon = singleFace({
    name: DRAGON,
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 6,
    toughness: 6,
    oracleText: 'Flying, haste',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'haste' } },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
        effect: { kind: 'attackRandomOpponent', creature: { kind: 'this' } },
      },
    ],
  });
  const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

  test('each combat it must attack an opponent it did not attack in the last one, so with two opponents they alternate', () => {
    const g = scenario({ seats: 3 })
      .define(dragon)
      .seat(0)
      .battlefield(DRAGON)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const chosen: number[] = [];
    for (const turn of [3, 6, 9]) {
      g.advanceTo('declareAttackers', { turn, attack: false });
      const required = g.state.continuousEffects.flatMap((e) =>
        e.change.kind === 'mustAttackPlayer' ? [e.change.seat] : [],
      );
      expect(required).toHaveLength(1);
      const seat = required[0] ?? -1;
      expect([1, 2]).toContain(seat);
      chosen.push(seat);
      // The other opponent is not a legal target of the requirement: only the one chosen may be attacked.
      g.act(0).declareAttackers([{ attacker: DRAGON, target: { player: seat } }]);
    }
    expect(chosen[1]).not.toBe(chosen[0]);
    expect(chosen[2]).not.toBe(chosen[1]);
  });
});

describe('reselecting what a creature attacks with three seats (CR 508.7)', () => {
  const SIGNPOST = 'SYNTHETIC Crooked Signpost'; // flash; enters during declare attackers: you may reselect target attacking creature's target
  const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4

  test('the choices are every opponent of the attacker’s controller and their planeswalkers, the one of the third seat too', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(BEARS, { label: 'a' })
      .library(...FILLER)
      .seat(1)
      .hand(SIGNPOST)
      .battlefield('Island', { count: 3 })
      .library(...FILLER)
      .seat(2)
      .battlefield(PW, { label: 'walker' })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'a', target: { player: 1 } }]);
    g.act(0).pass();
    g.act(1).cast(SIGNPOST, { pay: true });
    g.passAll();
    g.passAll();
    g.act(1).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'attackTarget') {
      throw new Error(`expected the choice of what to attack, got ${d?.kind}`);
    }
    expect(d.seat).toBe(1);
    const walker = g.id('walker');
    expect([...d.options].sort()).toEqual(['permanent:' + walker, 'player:1', 'player:2'].sort());
    g.act(1).chooseOption('permanent:' + walker);
    g.advanceTo('combatDamage');
    // Seat 1 is not hurt; the planeswalker of seat 2 lost loyalty.
    g.expect.life(1, 40);
    g.expect.counters('walker', { loyalty: 2 });
  });
});

describe('"creatures can\'t attack you" with three seats (CR 508.1a, 508.1c)', () => {
  const QUIET = 'SYNTHETIC Day of Quiet';
  const quiet = singleFace({
    name: QUIET,
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Until your next turn, creatures can't attack you.",
    spell: {
      effect: {
        kind: 'creaturesCantAttackYou',
        creatures: { types: ['creature'] },
        duration: 'untilYourNextTurn',
      },
    },
  });
  const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

  test('each opponent’s creatures can attack the third player but not the protected one', () => {
    const g = scenario({ seats: 3 })
      .define(quiet)
      .seat(0)
      .hand(QUIET)
      .battlefield('Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS, { label: 'b1' })
      .library(...LIBRARY)
      .seat(2)
      .battlefield(ELVES, { label: 'e2' })
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    const targetsOf = (seat: number, label: string) =>
      attackCandidates(g.state, seat)
        .find((c) => c.attacker === g.id(label))
        ?.targets.flatMap((t) => (t.kind === 'player' ? [t.seat] : []));
    g.advanceTo('declareAttackers', { turn: 4, attack: false });
    expect(targetsOf(1, 'b1')).toEqual([2]);
    g.act(1).noAttackers();
    g.advanceTo('declareAttackers', { turn: 5, attack: false });
    expect(targetsOf(2, 'e2')).toEqual([1]);
  });
});

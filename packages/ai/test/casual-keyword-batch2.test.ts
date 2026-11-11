// CasualAgent and keyword batch 2 (D-116, D-120) on real engine states built with the scenario DSL.
// The policy: it taps the creatures it does not need for Convoke (keeping the ones that could attack this turn
// and not tapping a creature that makes mana the engine's plan counted on), the artifacts it values least for
// Improvise and the graveyard cards it values least for Delve; it activates "Regenerate" when its creature
// would otherwise die (an opposing destroy spell or lethal damage on the stack, or a lost fight in the
// declare blockers step) and not otherwise, before spending mana on anything else; it pays Extort's
// {W/B} when the mana is spare and not when it would cost it a spell it could cast; it casts the card
// Cascade found. RandomLegalAgent answers each question with a legal answer. Every answer is one the
// engine lists, and the cast or the ability then runs to the end.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const WURM = 'SYNTHETIC Convoke Wurm'; // {4}{G}{G}
const PAIR = 'SYNTHETIC Convoke Pair'; // {G}{G} instant
const CONSTRUCT = 'SYNTHETIC Improvise Construct'; // {4}{U}
const SPIRIT = 'SYNTHETIC Delve Spirit'; // {4}{B}
const TROLL = 'SYNTHETIC Regenerating Troll'; // 2/2, {1}{B}: Regenerate this creature
const PRIEST = 'SYNTHETIC Extort Priest';
const GIANT = 'SYNTHETIC Cascade Giant';
const TRINKET = 'SYNTHETIC Trinket';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const ANGEL = 'Serra Angel';
const RATS = 'Typhoid Rats';
const SOL = 'Sol Ring';
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';

async function answer(g: ScenarioGame, seat = 0, seed = 1, random = false): Promise<Action> {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const agent = random ? new RandomLegalAgent({ seed }) : new CasualAgent({ seed });
  const action = await agent.decide(view, view.pending, CTX);
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
    JSON.stringify(action),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
  return action;
}

/** The answer of the agent without checking it against the legal list (a swapped-in set is not listed). */
async function answerAny(g: ScenarioGame, seat = 0, seed = 1): Promise<Action> {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return new CasualAgent({ seed }).decide(view, view.pending, CTX);
}

const resolveTop = (g: ScenarioGame) => {
  g.pass();
  g.pass();
};

describe('Convoke: the creatures it does not need', () => {
  test('it taps the creature that cannot attack this turn and keeps the one that can', async () => {
    // {G}{G} with two lands: one green creature must be tapped for convoke; the fresh one cannot attack.
    const g = scenario()
      .seat(0)
      .hand(PAIR)
      .battlefield(BEARS)
      .battlefield(BEARS, { fresh: true })
      .battlefield('Forest')
      .seat(1)
      .build();
    g.act(0).cast(PAIR);
    const d = g.state.pending;
    if (d?.kind !== 'choosePayOptions') throw new Error('expected choosePayOptions');
    const action = await answerAny(g);
    const fresh = g.view(0).battlefield.find((o) => o.name === BEARS && o.summoningSick);
    expect(action).toEqual({ kind: 'choosePayOptions', objects: [fresh?.id] });
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });

  test('it does not tap a creature that makes mana in place of an equivalent one that does not', async () => {
    // The Elves are green and tap for {G}; the Bears are green and do not. {G}{G} with the Forest: one tap of
    // either pays. The Elves are worth less than the Bears, but the plan may count on the Elves' mana, so
    // the Bears the plan names are not swapped for them.
    const g = scenario().seat(0).hand(PAIR).battlefield(BEARS, ELVES, 'Forest').seat(1).build();
    g.act(0).cast(PAIR);
    const action = await answerAny(g);
    expect(action).toEqual({
      kind: 'choosePayOptions',
      objects: [g.id({ name: BEARS, zone: 'battlefield', seat: 0 })],
    });
    expect(applyAction(g.state, 0, action).ok).toBe(true);
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.expect.stack([PAIR]);
  });

  test('on its own turn, with attackers to keep, the cast still goes through and the answer is accepted', async () => {
    const g = scenario()
      .seat(0)
      .hand(WURM)
      .battlefield(BEARS, BEARS, ANGEL, RATS, 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM);
    const action = await answerAny(g);
    expect(action.kind).toBe('choosePayOptions');
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.expect.stack([WURM]);
    g.expect.invariants();
  });

  test('RandomLegalAgent answers with a listed set, and the cast runs to the end', async () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const g = scenario()
        .seat(0)
        .hand(WURM)
        .battlefield(BEARS, BEARS, ANGEL, RATS, 'Forest', 'Forest', 'Forest')
        .seat(1)
        .build();
      g.act(0).cast(WURM);
      const action = await answer(g, 0, seed, true);
      expect(action.kind).toBe('choosePayOptions');
      g.act(0).choose(action);
      g.act(0).payAuto();
      g.expect.stack([WURM]);
    }
  });
});

describe('Improvise and Delve', () => {
  test('an artifact that makes mana is not tapped for improvise when an artifact that does not can be', async () => {
    const g = scenario()
      .seat(0)
      .hand(CONSTRUCT)
      .battlefield(SOL, TRINKET, TRINKET, TRINKET, 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(CONSTRUCT);
    const action = await answerAny(g);
    if (action.kind !== 'choosePayOptions') throw new Error('expected choosePayOptions');
    const sol = g.id({ name: SOL, zone: 'battlefield', seat: 0 });
    expect(action.objects).not.toContain(sol);
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.expect.stack([CONSTRUCT]);
  });

  test('it exiles the lands and spells of its graveyard before a creature card', async () => {
    const g = scenario()
      .seat(0)
      .hand(SPIRIT)
      .graveyard(BEARS, 'Island', BOLT, 'Forest', ANGEL)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(SPIRIT);
    const action = await answerAny(g);
    if (action.kind !== 'choosePayOptions') throw new Error('expected choosePayOptions');
    const names = action.objects
      .map((id) => g.state.objects[id]?.card)
      .map((card) =>
        card === null || card === undefined
          ? ''
          : g.state.definitions[g.state.cards[card]?.definition ?? 0]?.name,
      );
    expect(names).not.toContain(BEARS);
    expect(names).not.toContain(ANGEL);
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.expect.stack([SPIRIT]);
  });
});

describe('Regenerate: only when the creature would die', () => {
  function threatened() {
    // Seat 1 cast Murder at the Troll; seat 0 has priority with the Troll's ability and {1}{B} available.
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .hand(BEARS)
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MURDER, { targets: [TROLL], pay: true });
    g.act(1).pass();
    return g;
  }

  test('an opposing Murder on the stack: it activates before anything else', async () => {
    const g = threatened();
    expect(g.state.pending?.seat).toBe(0);
    const action = await answer(g);
    expect(action.kind).toBe('activate');
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, true);
  });

  test('with nothing threatening it, it does not', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(BEARS)
      .build();
    const action = await answer(g);
    expect(action.kind).not.toBe('activate');
  });

  test('a lost fight in the declare blockers step: blocked by a deathtouch creature, it regenerates once', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library('Island', 'Island', 'Island')
      .seat(1)
      .battlefield(RATS)
      .library('Island', 'Island', 'Island')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(TROLL);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: RATS, attacker: TROLL }]);
    expect(g.state.pending?.seat).toBe(0);
    const action = await answer(g);
    expect(action.kind).toBe('activate');
    g.act(0).choose(action);
    g.act(0).payAuto();
    g.passAll();
    // With a shield made it does not activate a second time.
    const again = await answer(g);
    expect(again.kind).not.toBe('activate');
    g.advanceTo('endOfCombat');
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
  });

  test('burn that cannot kill it is left alone', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(TROLL, 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    const action = await answer(g);
    expect(action.kind).not.toBe('activate');
  });
});

describe('Extort and Cascade', () => {
  function extorting(hand: readonly string[], lands: readonly string[]) {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(PRIEST, ...lands)
      .hand(...hand)
      .library('Island', 'Island')
      .seat(1)
      .life(20)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    return g;
  }

  test('it pays when the mana is spare', async () => {
    const g = extorting([BOLT], ['Mountain', 'Plains']);
    expect(g.state.pending?.kind).toBe('confirmOptional');
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
  });

  test('it does not pay when that would cost it a spell it could cast with the lands it has', async () => {
    // Bolt cast with one Mountain; two Plains stay open and the hand holds a spell that costs exactly {1}{W}.
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(PRIEST, 'Mountain', 'Plains', 'Plains')
      .hand(BOLT, 'Isamaru, Hound of Konda', 'Youthful Knight')
      .library('Island', 'Island')
      .seat(1)
      .life(20)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('confirmOptional');
    expect(await answer(g)).toEqual({ kind: 'declineOptional' });
  });

  test('RandomLegalAgent answers the question with a listed answer', async () => {
    const g = extorting([BOLT], ['Mountain', 'Plains']);
    const action = await answer(g, 0, 3, true);
    expect(['acceptOptional', 'declineOptional']).toContain(action.kind);
  });

  test('it casts the card cascade found', async () => {
    const g = scenario()
      .seat(0)
      .hand(GIANT)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library('Island', BEARS, ELVES)
      .seat(1)
      .build();
    g.act(0).cast(GIANT, { pay: true });
    resolveTop(g);
    const d = g.state.pending;
    expect(d?.kind === 'confirmOptional' && d.purpose).toBe('cascade');
    expect(await answer(g)).toEqual({ kind: 'acceptOptional' });
  });
});

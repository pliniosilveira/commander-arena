// The order of prevention effects on one damage event (CR 616.1, 616.1f, D-191): the affected player chooses which to apply first, one at a
// time, when the order can change the result. Pins: CR 616.1 (the affected player chooses, here the damaged player or the controller of the
// damaged permanent, not the controller of the source), CR 616.1f (the process repeats with what is now applicable: a question for each
// round while two or more effects still apply and the order still matters), CR 615.7 (a numeric shield is reduced by what it prevents and is
// gone at 0), CR 510.2 (combat damage is dealt simultaneously: every question of the batch is asked before any damage is dealt), CR 120.3
// (what is not prevented is dealt as damage). Cards are SYNTHETIC (src/cards/fixtures/synthetic-prevention.ts, synthetic-damage-order.ts)
// or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type ChosenTarget,
  type GameEvent,
  getLegalActions,
  stateHash,
} from '../src/index';
import { scenario, type TargetRef } from '../src/testing/index';
import { chooseOptionDecision } from './pending-helpers';

const SHIELD2 = 'SYNTHETIC Shield Two';
const SHIELD3 = 'SYNTHETIC Shield Three';
const SHIELD5 = 'SYNTHETIC Shield Five';
const SELF_WARD = 'SYNTHETIC Self Ward';
const BLAST = 'SYNTHETIC Order Blast';
const BOLT = 'Lightning Bolt';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V55 = 'SYNTHETIC Vanilla 5/5';
const BEARS = 'Grizzly Bears';
const DUEL = 'SYNTHETIC Duel';
const BITE = 'SYNTHETIC Trample Bite';
const VOLLEY = 'SYNTHETIC Measured Volley';
const PAIN_LAND = 'SYNTHETIC Pain Land';
const TRAMPLER = 'SYNTHETIC Deathtouch Trampler 4/4';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

const shields = (g: G) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage');
const amounts = (g: G) =>
  shields(g).map((e) => (e.change.kind === 'preventDamage' ? e.change.amount : null));
const keysOf = (g: G) => shields(g).map((e) => `shield:${e.id}`);
const chosen = (events: readonly GameEvent[]) =>
  events.filter((e) => e.kind === 'replacementChosen');

function cast(g: G, seat: 0 | 1, card: string, targets?: readonly TargetRef[]): void {
  if (g.state.pending?.kind === 'priority' && g.deciding !== seat && g.state.stack.length === 0) {
    g.pass();
  }
  g.act(seat).cast(`${card}[0]`, { pay: true, ...(targets === undefined ? {} : { targets }) });
}

/**
 * Seat 1 is shielded in seat 0's main phase with the shields in `cards` (each cast on seat 1), seat 0 holds the burn `burn` and `board` is
 * what seat 0 has on the battlefield besides a Mountain.
 */
function shieldedPlayer(cards: readonly string[], burn = BOLT) {
  const g = scenario()
    .seat(0)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .hand(burn)
    .seat(1)
    .battlefield(...cards.flatMap(() => ['Plains', 'Plains']))
    .hand(...cards)
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
  for (const card of cards) {
    cast(g, 1, card, [SHIELD2, SHIELD3, SHIELD5].includes(card) ? [{ player: 1 }] : undefined);
    g.passAll();
  }
  return g;
}

describe('two shields of different sizes: the damaged player chooses which is used first', () => {
  // Lightning Bolt deals 3: the 3 shield first prevents all of it and leaves the 5 shield whole; the 5 shield first prevents it too, and
  // leaves a 2 beside the whole 3. Two different results, so the player is asked.
  test('Lightning Bolt at a player with a 3 shield and a 5 shield asks that player, with both effects in the default order', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD5]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.purpose).toBe('replacement');
    expect(d.seat).toBe(1); // CR 616.1: the affected player, not the controller of the spell
    expect(d.options).toEqual(keysOf(g)); // the older shield first
    expect(d.sourceName).toBe(BOLT);
    expect(d.replacement?.event).toMatchObject({
      sourceName: BOLT,
      to: { kind: 'player', seat: 1 },
      amount: 3,
      combat: false,
    });
    expect(d.replacement?.choices.map((c) => c.text)).toEqual([
      'Prevent the next 3 damage that would be dealt to you this turn',
      'Prevent the next 5 damage that would be dealt to you this turn',
    ]);
    expect(d.replacement?.choices.map((c) => c.outcome)).toEqual([
      { to: { kind: 'player', seat: 1 }, amount: 0, prevented: 3 },
      { to: { kind: 'player', seat: 1 }, amount: 0, prevented: 3 },
    ]);
    g.expect.life(1, 40); // nothing is dealt before the answer
    expect(getLegalActions(g.state, 1).filter((a) => a.kind === 'chooseOption')).toEqual(
      d.options.map((option) => ({ kind: 'chooseOption', option })),
    );
  });

  test('the 3 shield first: it prevents everything and is used up to 0; the 5 shield is kept whole', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD5]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const [first] = chooseOptionDecision(g).options;
    const mark = g.mark();
    g.act(1).chooseOption(first ?? '');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([5]);
    expect(chosen(g.eventsSince(mark))).toEqual([
      expect.objectContaining({ kind: 'replacementChosen', seat: 1, option: first }),
    ]);
    g.expect.stack([]);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the 5 shield first: it prevents everything and keeps 2, the 3 shield is kept whole', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD5]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const second = chooseOptionDecision(g).options[1];
    g.act(1).chooseOption(second ?? '');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3, 2]);
  });

  test('the answer is refused unless it is one of the options, or by anyone but the affected player, and nothing changes', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD5]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const before = stateHash(g.state);
    for (const bad of ['shield:ce999', '', 'static:o1:0']) {
      expect(applyAction(g.state, 1, { kind: 'chooseOption', option: bad }).ok).toBe(false);
    }
    const valid = chooseOptionDecision(g).options[0] ?? '';
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: valid }).ok).toBe(false);
    expect(stateHash(g.state)).toBe(before);
  });

  test('3 and 2 against 3 damage: every order leaves one shield of 2, so nothing is asked', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD2]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    // The default order: the older shield first, and the rest of the damage is 0.
    expect(amounts(g)).toEqual([2]);
  });
});

describe('when the order cannot matter, nothing is asked', () => {
  test('two equal shields: the older is used first and no question is asked', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD3]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3]);
  });

  test('a single shield and a single effect never ask', () => {
    const g = shieldedPlayer([SHIELD2]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 39);
    expect(amounts(g)).toEqual([]);
  });

  test('a shield that prevents all damage and a numeric one: all first is the best order, so nothing is asked and the numeric one is kept', () => {
    const g = shieldedPlayer([SHIELD3, SELF_WARD]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3, 'all']);
  });

  test('two shields that prevent all damage never ask', () => {
    const g = shieldedPlayer([SELF_WARD, SELF_WARD]);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
  });
});

describe('a question for each round while the order still matters (CR 616.1f)', () => {
  // Shields 3, 2 and 5 against 6 damage. The 5 first leaves 1 damage and the 3 and 2 shields: using the 3 leaves 2 and 2, using the 2
  // leaves 3 and 1, which differ, so the player is asked a second time.
  test('three shields: the first answer is followed by a second question about what is still applicable', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD2, SHIELD5], BLAST);
    cast(g, 0, BLAST, [{ player: 1 }]);
    g.passAll();
    const first = chooseOptionDecision(g);
    expect(first.options).toHaveLength(3);
    expect(first.replacement?.event?.amount).toBe(6);
    const [s3, s2, s5] = first.options;
    g.act(1).chooseOption(s5 ?? '');
    const second = chooseOptionDecision(g);
    expect(second.options).toEqual([s3, s2]); // the 5 is gone
    expect(second.replacement?.event?.amount).toBe(1);
    g.expect.life(1, 40);
    g.act(1).chooseOption(s2 ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3, 1]);
  });

  test('the answers in the other order give the other result', () => {
    const g = shieldedPlayer([SHIELD3, SHIELD2, SHIELD5], BLAST);
    cast(g, 0, BLAST, [{ player: 1 }]);
    g.passAll();
    const [s3, , s5] = chooseOptionDecision(g).options;
    g.act(1).chooseOption(s5 ?? '');
    g.act(1).chooseOption(s3 ?? '');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([2, 2]);
  });
});

describe('the affected player is asked, whoever controls the source', () => {
  test('damage to a creature asks its controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield('Plains', 'Plains', V33)
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [V33]);
    g.passAll();
    cast(g, 1, SHIELD5, [V33]);
    g.passAll();
    cast(g, 0, BOLT, [V33]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.event?.to).toEqual({ kind: 'object', id: g.id(V33) });
    expect(d.replacement?.choices[0]?.text).toBe(
      `Prevent the next 3 damage that would be dealt to ${V33} this turn`,
    );
  });
});

describe('answers belong to the instruction that asked them', () => {
  test('two damage instructions in one resolution each ask their own question, the second not answered by the first answer', () => {
    const TWIN = 'SYNTHETIC Twin Bolt';
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(TWIN)
      .seat(1)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', V55, V33)
      .hand(SHIELD3, SHIELD5, SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    for (const [spell, creature] of [
      [SHIELD3, V55],
      [SHIELD5, V55],
      [SHIELD3, V33],
      [SHIELD5, V33],
    ] as const) {
      cast(g, 1, spell, [creature]);
      g.passAll();
    }
    cast(g, 0, TWIN, [V55, V33]);
    g.passAll();
    const first = chooseOptionDecision(g);
    expect(first.replacement?.event?.to).toEqual({ kind: 'object', id: g.id(V55) });
    g.act(1).chooseOption(first.options[0] ?? '');
    // The first instruction is done; the second asks its own question about the other creature, with its own options.
    const second = chooseOptionDecision(g);
    expect(second.replacement?.event?.to).toEqual({ kind: 'object', id: g.id(V33) });
    expect(second.options).not.toEqual(first.options);
    g.act(1).chooseOption(second.options[1] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.damage(V55, 0);
    g.expect.damage(V33, 0);
    // The 3 shield first on the 5/5, the 5 shield first on the 3/3: 5 stays on the first creature; 3 and 2 on the second.
    expect(amounts(g)).toEqual([5, 3, 2]);
  });
});

describe('combat damage: every question of the batch is asked before any damage is dealt (CR 510.2)', () => {
  function toDamage(
    attackers: readonly string[],
    blocks: readonly { blocker: string; attacker: string }[] = [],
  ) {
    const g = scenario()
      .seat(0)
      .battlefield(...attackers)
      .seat(1)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', ...blocks.map((b) => b.blocker))
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [{ player: 1 }]);
    g.passAll();
    cast(g, 1, SHIELD5, [{ player: 1 }]);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(attackers);
    g.advanceTo('declareBlockers');
    if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers(blocks);
    g.advanceTo('combatDamage');
    return g;
  }

  test('the question comes before any damage, carries the plan, and goes to the defending player', () => {
    const g = toDamage([V33, V22]);
    const d = chooseOptionDecision(g);
    expect(d.purpose).toBe('replacement');
    expect(d.seat).toBe(1);
    expect(d.replacement?.event).toMatchObject({ sourceName: V33, amount: 3, combat: true });
    expect(d.replacement?.resume).toMatchObject({ step: 'regular', answers: [] });
    expect(d.replacement?.resume?.assignments).toHaveLength(2);
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3, 5]); // no shield has been used yet
    expect(g.state.turn.step).toBe('combatDamage');
  });

  test('the 3 shield first: the first attacker is stopped by it, the 5 shield alone stops the second; no second question', () => {
    const g = toDamage([V33, V22]);
    const mark = g.mark();
    g.act(1).chooseOption(chooseOptionDecision(g).options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3]);
    expect(chosen(g.eventsSince(mark))).toHaveLength(1);
    // The active player gets priority in the combat damage step (CR 510.3).
    expect(g.deciding).toBe(0);
    expect(g.state.turn.step).toBe('combatDamage');
  });

  test('the 5 shield first: the second attacker asks again with what is applicable now (CR 616.1f), and the answers add up', () => {
    const g = toDamage([V33, V22]);
    g.act(1).chooseOption(chooseOptionDecision(g).options[1] ?? '');
    const second = chooseOptionDecision(g);
    expect(second.replacement?.event).toMatchObject({ sourceName: V22, amount: 2 });
    expect(second.replacement?.resume?.answers).toHaveLength(1);
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3, 5]); // still nothing used: the batch is simulated until the last answer
    g.act(1).chooseOption(second.options[1] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([3]); // the 5 shield prevented 3 and then 2
  });

  test('damage to a creature that is blocked, with no shield on it, asks nothing and is dealt', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: V33 }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});

describe('fight, "excess damage" and divided damage ask before anything is dealt', () => {
  test('a fight: the creature with two shields is asked; neither creature is damaged until the answer', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Forest', V33)
      .hand(DUEL)
      .seat(1)
      .battlefield('Plains', 'Plains', V55)
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [V55]);
    g.passAll();
    cast(g, 1, SHIELD5, [V55]);
    g.passAll();
    cast(g, 0, DUEL, [V33, V55]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.event).toMatchObject({ sourceName: V33, amount: 3 });
    g.expect.damage(V55, 0);
    g.expect.damage(V33, 0);
    g.act(1).chooseOption(d.options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.damage(V55, 0); // the 3 damage was prevented
    g.expect.zone(V33, 'graveyard', { seat: 0 }); // the 5/5 dealt its 5 damage back (no shield on the 3/3)
  });

  test('"excess damage is dealt to its controller instead": the creature and the player are two events; the question is about the first', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Forest', TRAMPLER)
      .hand(BITE)
      .seat(1)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [BEARS]);
    g.passAll();
    cast(g, 1, SHIELD5, [BEARS]);
    g.passAll();
    cast(g, 0, BITE, [TRAMPLER, BEARS]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.event).toMatchObject({ sourceName: TRAMPLER });
    g.act(1).chooseOption(d.options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40 - 3); // deathtouch: lethal is 1 to the Bears, excess 3 to the controller; the first event was prevented
    g.expect.damage(BEARS, 0);
  });

  test('divided damage: each target is asked about in turn, with nothing dealt before the last answer', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', V33)
      .hand(VOLLEY)
      .seat(1)
      .battlefield('Plains', 'Plains', V55, V22)
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [V55]);
    g.passAll();
    cast(g, 1, SHIELD5, [V55]);
    g.passAll();
    const targets: readonly ChosenTarget[] = [
      { kind: 'object', id: g.id(V55), specId: 't1', share: 2 },
      { kind: 'object', id: g.id(V22), specId: 't1', share: 1 },
    ];
    g.act(0).cast(`${VOLLEY}[0]`, { pay: true, targets: [V55, V22], divide: [2, 1] });
    void targets;
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.replacement?.event).toMatchObject({ amount: 2 });
    g.expect.damage(V22, 0);
    g.act(1).chooseOption(d.options[0] ?? '');
    g.expect.damage(V22, 1);
  });
});

describe('the rider of a mana ability cannot wait for an answer: it takes the default order', () => {
  test('a pain land with a 3 shield and a 5 shield on its controller prevents its damage with the older shield and asks nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PAIN_LAND)
      .hand(BOLT)
      .seat(1)
      .battlefield('Plains', 'Plains')
      .hand(SHIELD3, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [{ player: 0 }]);
    g.passAll();
    cast(g, 1, SHIELD5, [{ player: 0 }]);
    g.passAll();
    g.act(0).tapForMana(PAIN_LAND, { color: 'U', ability: 1 });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(0, 40);
    expect(amounts(g)).toEqual([2, 5]);
  });
});

describe('the game with a question is deterministic and replays', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(BLAST)
      .seat(1)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .hand(SHIELD3, SHIELD2, SHIELD5)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();

  /** Three shields, 6 damage, the 5 shield first and then the second option of the second question: two questions. */
  const play = (game: G): G => {
    for (const card of [SHIELD3, SHIELD2, SHIELD5]) {
      cast(game, 1, card, [{ player: 1 }]);
      game.passAll();
    }
    cast(game, 0, BLAST, [{ player: 1 }]);
    game.passAll();
    game.act(1).chooseOption(chooseOptionDecision(game).options[2] ?? '');
    game.act(1).chooseOption(chooseOptionDecision(game).options[1] ?? '');
    return game;
  };

  test('the same moves on two copies of the scenario give the same log and the same state', () => {
    const a = play(build());
    const b = play(build());
    expect(a.log).toEqual(b.log);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.log.filter((e) => e.action.kind === 'chooseOption')).toHaveLength(2);
  });

  test('the action log replays on a fresh copy to the same state, every answer checked against the options the replay recomputes', () => {
    const played = play(build());
    let state = build().state;
    for (const { seat, action } of played.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(`replay rejected ${action.kind}: ${r.error}`);
      state = r.state;
    }
    expect(stateHash(state)).toBe(stateHash(played.state));
    expect(state).toEqual(played.state);
  });

  test('an answer that was legal in one game is refused where it is not an option', () => {
    const played = play(build());
    const answers = played.log.filter((e) => e.action.kind === 'chooseOption');
    // Replay without the shield of the 5: the first answer names a shield that does not exist there.
    const g = build();
    for (const card of [SHIELD3, SHIELD2]) {
      cast(g, 1, card, [{ player: 1 }]);
      g.passAll();
    }
    cast(g, 0, BLAST, [{ player: 1 }]);
    g.passAll();
    const first = answers[0];
    if (first === undefined) throw new Error('no answer recorded');
    expect(g.state.pending?.kind).toBe('priority'); // 3 and 2 against 6: nothing is asked
    expect(applyAction(g.state, first.seat, first.action).ok).toBe(false);
  });
});

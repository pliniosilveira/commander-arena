// "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (issue 258, D-581 to D-585): the
// SYNTHETIC Lotus Engine, Lotus Reader, Lotus Mint, Lotus Hush and Lotus Golem of `src/cards/fixtures/synthetic-sacrifice-mana.ts`. Pins: CR 602.2b and 701.21a (the permanents
// sacrificed are chosen among those the player controls as the cost is paid, one or more: never none), CR 118.3 (a cost that can't be paid is not paid, so with no artifact to
// sacrifice the ability is not offered), CR 602.5e (an ability that reads "Activate only as an instant" follows the timing of an instant: any time its controller has priority),
// CR 605.1a and 605.5a (an ability with a target is not a mana ability: it uses the stack and can be responded to), CR 106.4 (the mana goes to the pool of the player who adds it),
// CR 608.2d (the color is chosen as the ability resolves, so not when it is put on the stack), CR 603.10a (a sacrificed permanent is gone when the effect resolves).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const LOTUS = 'SYNTHETIC Lotus Engine';
const READER = 'SYNTHETIC Lotus Reader';
const MINT = 'SYNTHETIC Lotus Mint';
const HUSH = 'SYNTHETIC Lotus Hush';
const GOLEM = 'SYNTHETIC Lotus Golem';
const TRINKET = 'SYNTHETIC Trinket';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const COLORS = ['white', 'blue', 'black', 'red', 'green'];

describe('the cards are valid', () => {
  test.each([LOTUS, READER, MINT, HUSH, GOLEM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** The Lotus, three artifacts of the controller, a creature that is no artifact, and an artifact of the opponent. */
const game = () =>
  scenario()
    .seat(0)
    .battlefield(LOTUS)
    .battlefield(TRINKET, { label: 'a1' })
    .battlefield('Sol Ring', { label: 'a2' })
    .battlefield(GOLEM, { label: 'a3' })
    .battlefield('Grizzly Bears')
    .library(...LIBRARY)
    .seat(1)
    .battlefield(TRINKET, { label: 'theirs' })
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

const sacrificeDecision = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d;
};

describe('the cost: one or more artifacts, chosen as it is paid', () => {
  test('the player chooses one to all of the artifacts they control (the Lotus included), never an opponent’s or a non-artifact', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    const d = sacrificeDecision(g);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(1);
    expect(d.max).toBe(4);
    expect(d.legal).toHaveLength(4);
    // The Lotus is tapped as the first part of the cost, and may be one of the artifacts sacrificed.
    g.expect.tapped(LOTUS, true);
    const actions = getLegalActions(g.state, 0).filter((a) => a.kind === 'choosePermanents');
    // Every one of them has between one and four artifacts: none is not a payment.
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      if (a.kind === 'choosePermanents') {
        expect(a.objects.length).toBeGreaterThanOrEqual(1);
        expect(a.objects.length).toBeLessThanOrEqual(4);
      }
    }
  });

  test('zero artifacts is not allowed, and neither is a permanent that is no artifact or an opponent’s', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    const legal = sacrificeDecision(g).legal;
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [] }).ok).toBe(false);
    // Not offered: the Bears (not an artifact) and the artifact of the opponent.
    const outside = Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && !legal.includes(o.id),
    );
    expect(outside).toHaveLength(2);
    for (const o of outside) {
      expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [o.id] }).ok).toBe(false);
    }
    // The decision is still open, and one artifact is a payment.
    sacrificeDecision(g);
    g.act(0).choosePermanents('a1');
    g.expect.invariants();
  });

  test('with only one artifact to sacrifice (the Lotus itself) nothing is asked and it is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(LOTUS, 'graveyard', { seat: 0 });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    // The ability resolves though its source is gone: the color is asked, and one artifact is three mana.
    g.act(0).chooseOption('blue');
    g.expect.pool(0, { U: 3 });
    g.expect.invariants();
  });

  test('cancelling the question rewinds the activation: the Lotus is untapped and nothing is sacrificed (CR 733)', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    sacrificeDecision(g);
    g.act(0).cancel();
    expect(g.state.stack).toHaveLength(0);
    g.expect.tapped(LOTUS, false);
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
  });

  test('the ability is not offered with no artifact to sacrifice, nor with the Lotus tapped', () => {
    const none = scenario()
      .seat(0)
      .battlefield(LOTUS, { tapped: true })
      .battlefield(TRINKET)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(none.act(0).try.activate(LOTUS).ok).toBe(false);
    expect(getLegalActions(none.state, 0).some((a) => a.kind === 'activate')).toBe(false);
    // An artifact of the opponent is no help.
    const theirs = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(TRINKET)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // The Lotus is an artifact of its controller, so it can pay for itself.
    expect(getLegalActions(theirs.state, 0).some((a) => a.kind === 'activate')).toBe(true);
    const bears = scenario()
      .seat(0)
      .battlefield(LOTUS, { tapped: true })
      .battlefield('Grizzly Bears')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(getLegalActions(bears.state, 0).some((a) => a.kind === 'activate')).toBe(false);
  });
});

describe('"Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way."', () => {
  test('one artifact: three mana of the color the controller chooses as the ability resolves, to the target player', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1');
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    // On the stack, not resolved: nothing is in the pool, and no color has been chosen (CR 608.2d).
    expect(g.state.stack).toHaveLength(1);
    g.expect.pool(0, {});
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('effect');
    expect(d.options).toEqual(COLORS);
    g.act(0).chooseOption('white');
    g.expect.pool(0, { W: 3 });
    g.expect.invariants();
  });

  test.each([
    ['white', { W: 6 }],
    ['blue', { U: 6 }],
    ['black', { B: 6 }],
    ['red', { R: 6 }],
    ['green', { G: 6 }],
  ] as const)(
    'two artifacts and the color %s: six mana of it, and no other color',
    (color, pool) => {
      const g = game();
      g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
      g.act(0).choosePermanents('a1', 'a2');
      g.passAll();
      g.act(0).chooseOption(color);
      g.expect.pool(0, pool);
    },
  );

  test('every artifact counts three: all four artifacts, the Lotus and the artifact creature among them, are twelve mana', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents(LOTUS, 'a1', 'a2', 'a3');
    // The artifacts that were sacrificed are gone before the ability resolves (CR 603.10a), and the count survives them.
    for (const name of [LOTUS, TRINKET, 'Sol Ring', GOLEM]) {
      g.expect.zone(name, 'graveyard', { seat: 0 });
    }
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.passAll();
    g.act(0).chooseOption('red');
    g.expect.pool(0, { R: 12 });
    g.expect.invariants();
  });

  test('tokens are artifacts to sacrifice too: three Treasure tokens are nine mana', () => {
    const g = scenario()
      .seat(0)
      .hand(MINT)
      .battlefield(LOTUS)
      .battlefield('Swamp')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(MINT, { pay: true });
    g.passAll();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    expect(sacrificeDecision(g).legal).toHaveLength(4);
    g.act(0).choosePermanents('Treasure[0]', 'Treasure[1]', 'Treasure[2]');
    g.passAll();
    g.act(0).chooseOption('green');
    g.expect.pool(0, { G: 9 });
    g.expect.invariants();
  });

  test('the mana goes to the target player, who may be an opponent: the controller chooses the color and gets none', () => {
    const g = game();
    g.act(0).activate(LOTUS, { targets: [{ player: 1 }] });
    g.act(0).choosePermanents('a1', 'a3');
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
    // The player who activated the ability chooses, not the target.
    expect(d.seat).toBe(0);
    g.act(0).chooseOption('black');
    g.expect.pool(1, { B: 6 });
    g.expect.pool(0, {});
    g.expect.invariants();
  });

  test('the count is the artifacts of this activation: a second activation counts its own', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .battlefield(TRINKET, { label: 'a2' })
      .battlefield(TRINKET, { label: 'a3' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1', 'a2', 'a3');
    g.passAll();
    g.act(0).chooseOption('white');
    g.expect.pool(0, { W: 9 });
    // The Lotus is tapped and not untapped by anything: it can't be activated again this turn.
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('the count is read for any ability that sacrifices one or more: the Reader draws one card for each artifact', () => {
    const g = scenario()
      .seat(0)
      .battlefield(READER)
      .battlefield(TRINKET, { label: 'a1' })
      .battlefield('Sol Ring', { label: 'a2' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(READER, { targets: [{ player: 1 }] });
    g.act(0).choosePermanents('a1', 'a2');
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});

describe('"(Activate only as an instant.)": any time the player has priority (CR 602.5e)', () => {
  test('in the end step of the opponent’s turn, after their pass', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1, turn: 4 })
      .build();
    g.pass(1);
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1');
    g.passAll();
    g.act(0).chooseOption('blue');
    g.expect.pool(0, { U: 3 });
  });

  test('in response to a spell, with the stack not empty', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .library(...LIBRARY)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [{ player: 0 }] });
    g.pass(1);
    expect(g.state.stack).toHaveLength(1);
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1');
    // The ability is above the spell: it resolves first.
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.invariants();
  });

  test('in combat, in the declare blockers step', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('declareBlockers', { active: 1, turn: 4 })
      .build();
    g.pass(1);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(true);
  });
});

describe('a targeted ability is not a mana ability (CR 605.1a, 605.5a)', () => {
  test('it uses the stack: the opponent can respond, and the mana is added only when it resolves', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .battlefield('Sol Ring', { label: 'a2' })
      .library(...LIBRARY)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1', 'a2');
    expect(g.state.stack).toHaveLength(1);
    g.expect.pool(0, {});
    g.pass(0);
    // The opponent has priority with the ability on the stack, and responds.
    g.act(1).cast('Lightning Bolt', { pay: true, targets: [{ player: 0 }] });
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.life(0, 37);
    g.act(0).chooseOption('red');
    g.expect.pool(0, { R: 6 });
  });

  test('it can be countered: the sacrifice stays paid, the target gets nothing and no color is asked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LOTUS)
      .battlefield(TRINKET, { label: 'a1' })
      .library(...LIBRARY)
      .seat(1)
      .hand(HUSH)
      .battlefield('Island')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LOTUS, { targets: [{ player: 0 }] });
    g.act(0).choosePermanents('a1');
    g.pass(0);
    g.act(1).cast(HUSH, { pay: true, targets: [`${LOTUS} (ability)`] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    g.expect.tapped(LOTUS, true);
    g.expect.pool(0, {});
    g.expect.pool(1, {});
    g.expect.invariants();
  });

  test('the target is chosen as the ability is activated, before the artifacts are sacrificed', () => {
    const g = game();
    g.act(0).activate(LOTUS);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    expect(d.specs[0]?.legal).toHaveLength(2);
    g.act(0).chooseTargets({ player: 1 });
    sacrificeDecision(g);
  });
});

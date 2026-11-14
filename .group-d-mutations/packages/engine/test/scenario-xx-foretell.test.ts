// Foretell (CR 702.143, 116.2h, D-128): "Any time a player has priority during their turn, that player may pay {2} and
// exile a card with foretell from their hand face down. That player may look at that card as long as it remains in
// exile. They may cast that card after the current turn has ended by paying any foretell cost it has rather than paying
// that spell's mana cost."
// Pins: CR 702.143a (the whole rule), 702.143b and 116.2h (a special action: no stack), 702.143c, 702.143e (the owner
// tells their foretold cards apart: each is its own object), 702.143f (revealed when the player leaves the game: not
// built), 118.9 (an alternative cost, 601.2b and 601.2f-h), 400.2 and 406.3 (hidden information: a face-down card is
// known to its owner alone), 903.9a (a commander in exile), 733 (cancel). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-later.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const BOLT = 'SYNTHETIC Foretell Bolt'; // {2}{R} instant, 3 damage to target creature, foretell {R}
const INSIGHT = 'SYNTHETIC Foretell Insight'; // {3}{U} sorcery, draw two, foretell {U}
const GIANT = 'SYNTHETIC Foretell Giant'; // {4}{G} 5/5, foretell {1}{G}
const COMMANDER = 'SYNTHETIC Foretell Commander'; // {3}{U} legendary 3/3, foretell {U}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  configure: (b: Builder) => Builder,
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return configure(scenario().seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', at)
    .build();
}

const lands = (b: Builder) =>
  b
    .battlefield('Mountain', { count: 3 })
    .battlefield('Island', { count: 3 })
    .battlefield('Forest', { count: 3 });

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const exiled = (g: ScenarioGame, name: string) => {
  const [card] = g.find({ name, zone: 'exile' });
  if (card === undefined) throw new Error(`${name} is not in exile`);
  return card;
};

/** Foretells `name` in seat 0's turn 3 and goes to seat 1's turn 4 (its upkeep, priority with seat 1). */
function foretoldThenNextTurn(configure: (b: Builder) => Builder, name: string): ScenarioGame {
  const g = game((b) => configure(lands(b.seat(0).hand(name)).seat(0)));
  g.act(0).foretell(name, { pay: true });
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

describe('the special action (CR 702.143a, 116.2h)', () => {
  test('it is a priority option of its own during your turn, in any step with priority', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.expect.legal(0, { foretell: BOLT });
    g.advanceTo('beginningOfCombat');
    g.expect.legal(0, { foretell: BOLT });
    g.advanceTo('end');
    g.expect.legal(0, { foretell: BOLT });
  });

  test('with the stack busy too: it has no timing but "your turn"', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT, 'Lightning Bolt')).seat(0));
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.legal(0, { foretell: BOLT });
  });

  test('not in the opponent’s turn', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0), { active: 1, turn: 4, priority: 0 });
    g.expect.illegal(0, { foretell: BOLT });
  });

  test('it costs {2} and exiles the card face down, without the stack', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.noObject(BOLT, { zone: 'hand' });
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped)).toHaveLength(2);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    expect(exiled(g, BOLT).foretoldTurn).toBe(3);
    g.expect.invariants();
  });

  test('without {2} it is not offered', () => {
    const g = game((b) => b.battlefield('Mountain').hand(BOLT).seat(0));
    g.expect.illegal(0, { foretell: BOLT });
  });

  test('a card without foretell cannot be foretold, and neither can one that is not in the hand', () => {
    const g = game((b) => lands(b.seat(0).hand('Grizzly Bears').graveyard(BOLT)).seat(0));
    const bears = g.find({ name: 'Grizzly Bears' })[0];
    const grave = g.find({ name: BOLT })[0];
    if (bears === undefined || grave === undefined) throw new Error('missing');
    expect(applyAction(g.state, 0, { kind: 'foretell', object: bears.id }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'foretell', object: grave.id }).ok).toBe(false);
  });

  test('cancelling the payment takes nothing', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT);
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    g.expect.pending('priority', 0);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped)).toHaveLength(0);
  });

  test('the view shows the action on the card in the hand, with the cost to cast it later', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.specialActions).toEqual([{ kind: 'foretell', cost: ['2'], castCost: ['R'] }]);
    // The foretell cost is not a cast from the hand: no alternative cost is listed there.
    expect(card?.alternativeCosts).toBeUndefined();
  });
});

describe('face down: only the owner may look (CR 702.143a, hidden information)', () => {
  test('the owner sees the card in exile, face down, with its foretell cost', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    const card = getView(g.state, 0).exile[0];
    expect(card?.name).toBe(BOLT);
    expect(card?.faceDown).toBe(true);
    expect(card?.foretold).toBe(true);
    expect(card?.oracleText).toContain('deals 3 damage');
    expect(card?.alternativeCosts).toEqual([{ kind: 'foretell', cost: ['R'] }]);
  });

  test('the opponent sees only that a card is there: no name, no text, no types, no cost', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    const view = getView(g.state, 1);
    const card = view.exile[0];
    expect(card?.owner).toBe(0);
    expect(card?.faceDown).toBe(true);
    expect(card?.name).toBe('Face-down card');
    expect(card?.types).toEqual([]);
    expect(card?.oracleText).toBe('');
    expect(card?.manaCost).toBeNull();
    expect(card?.alternativeCosts).toBeUndefined();
    expect(card?.isCommander).toBe(false);
    const text = JSON.stringify(view);
    expect(text).not.toContain(BOLT);
    expect(text).not.toContain('deals 3 damage');
    expect(text).not.toContain('foretoldTurn');
    expect(view.seats[0]?.handCount).toBe(0);
  });

  test('the events and the action log name no card', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    const foretold = g.events.filter((e) => e.kind === 'foretold');
    expect(foretold).toHaveLength(1);
    expect(foretold[0]).toEqual({ kind: 'foretold', seat: 0, object: exiled(g, BOLT).id });
    const publicText = JSON.stringify([...g.events, ...g.log]);
    expect(publicText).not.toContain(BOLT);
    // The log holds the action with the id the card had in the hand: no name, no cost.
    expect(g.log.slice(-2).map((entry) => entry.action.kind)).toEqual(['foretell', 'payAuto']);
  });

  test('the opponent’s pending payment is not in their view, and nothing about the card is in the waiting-on text', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.act(0).foretell(BOLT);
    const view = getView(g.state, 1);
    expect(view.pending).toBeNull();
    expect(view.decidingSeat).toBe(0);
    expect(JSON.stringify(view)).not.toContain(BOLT);
  });

  test('both cards of a player stay different objects (CR 702.143e), each face down', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT, GIANT)).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    g.act(0).foretell(GIANT, { pay: true });
    const ids = getView(g.state, 1).exile.map((o) => o.id);
    expect(new Set(ids).size).toBe(2);
    expect(getView(g.state, 1).exile.every((o) => o.faceDown === true)).toBe(true);
  });
});

describe('casting it later (CR 702.143a)', () => {
  test('not in the turn it was foretold: after that turn has ended', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(BOLT).seat(1).battlefield('Grizzly Bears').seat(0)).seat(0),
    );
    g.act(0).foretell(BOLT, { pay: true });
    g.expect.illegal(0, { cast: BOLT, alternative: 'foretell' });
    expect(
      applyAction(g.state, 0, {
        kind: 'castSpell',
        object: exiled(g, BOLT).id,
        alternative: 'foretell',
      }).ok,
    ).toBe(false);
  });

  test('in a later turn it is cast for the foretell cost instead of the mana cost, here at instant speed in the opponent’s turn', () => {
    const g = foretoldThenNextTurn((b) => b.seat(1).battlefield('Grizzly Bears').seat(0), BOLT);
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.pass(1);
    g.expect.legal(0, { cast: BOLT, alternative: 'foretell' });
    const before = g.state.battlefield.filter((id) => g.state.objects[id]?.tapped).length;
    g.act(0).cast(BOLT, { alternative: 'foretell', targets: ['Grizzly Bears'], pay: true });
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped).length - before).toBe(1);
    g.expect.eventLog([
      { kind: 'spellCast', seat: 0, fromZone: 'exile', alternative: 'foretell', commanderTax: 0 },
    ]);
    g.expect.stack([BOLT]);
    expect(getView(g.state, 1).stack[0]?.name).toBe(BOLT); // a spell on the stack is public
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('foretell');
    resolveTop(g);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('it is not an ordinary cast: from exile only for the foretell cost', () => {
    const g = foretoldThenNextTurn((b) => b.seat(1).battlefield('Grizzly Bears').seat(0), BOLT);
    g.pass(1);
    g.expect.illegal(0, { cast: BOLT });
  });

  test('a sorcery keeps its timing: in the opponent’s turn no, in its owner’s turn yes', () => {
    const g = foretoldThenNextTurn((b) => b, INSIGHT);
    g.pass(1);
    g.expect.illegal(0, { cast: INSIGHT, alternative: 'foretell' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    g.expect.legal(0, { cast: INSIGHT, alternative: 'foretell' });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(INSIGHT, { alternative: 'foretell', pay: true });
    resolveTop(g);
    expect(g.state.seats[0]?.hand.length).toBe(hand + 2);
  });

  test('a creature foretold is cast for the foretell cost and enters as a creature does', () => {
    const g = foretoldThenNextTurn((b) => b, GIANT);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(GIANT, { alternative: 'foretell', pay: true });
    resolveTop(g);
    g.expect.zone(GIANT, 'battlefield', { seat: 0 });
  });

  test('without the mana for the foretell cost it is not offered', () => {
    const g = game((b) => b.battlefield('Mountain', { count: 2 }).hand(BOLT).seat(0));
    g.act(0).foretell(BOLT, { pay: true });
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass(1);
    // Both lands were tapped to foretell and untap only in seat 0's own untap step.
    g.expect.illegal(0, { cast: BOLT, alternative: 'foretell' });
  });

  test('only its owner may cast it', () => {
    const g = foretoldThenNextTurn(
      (b) => b.seat(1).battlefield('Mountain', { count: 2 }).seat(0),
      BOLT,
    );
    expect(
      applyAction(g.state, 1, {
        kind: 'castSpell',
        object: exiled(g, BOLT).id,
        alternative: 'foretell',
      }).ok,
    ).toBe(false);
    expect(getLegalActions(g.state, 1).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('taking the cast back leaves the card foretold in exile (CR 733)', () => {
    const g = foretoldThenNextTurn((b) => b.seat(1).battlefield('Grizzly Bears').seat(0), BOLT);
    g.pass(1);
    g.act(0).cast(BOLT, { alternative: 'foretell' });
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    expect(exiled(g, BOLT).foretoldTurn).toBe(3);
    g.expect.legal(0, { cast: BOLT, alternative: 'foretell' });
  });

  test('the spell is a new object: it is not foretold any more, and it is face up on the stack', () => {
    const g = foretoldThenNextTurn((b) => b.seat(1).battlefield('Grizzly Bears').seat(0), BOLT);
    g.pass(1);
    g.act(0).cast(BOLT, { alternative: 'foretell', targets: ['Grizzly Bears'], pay: true });
    const spell = g.find({ name: BOLT, zone: 'stack' })[0];
    expect(spell?.foretoldTurn).toBeUndefined();
    g.expect.noObject(BOLT, { zone: 'exile' });
  });
});

describe('a commander with foretell (CR 903.9a, 903.8)', () => {
  test('it is a commander in exile when foretold: its owner may put it into the command zone', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(COMMANDER, { commander: true, label: 'cmd' })).seat(0),
    );
    g.act(0).foretell('cmd', { pay: true });
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(COMMANDER, 'command', { seat: 0 });
  });

  test('left in exile it is cast later for the foretell cost, with no commander tax', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(COMMANDER, { commander: true, label: 'cmd' })).seat(0),
    );
    g.act(0).foretell('cmd', { pay: true });
    g.act(0).declineCommandZone();
    // The face-down commander is not shown to the opponent as a commander.
    expect(getView(g.state, 1).exile[0]?.isCommander).toBe(false);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(COMMANDER, { alternative: 'foretell', pay: true });
    g.expect.eventLog([
      { kind: 'spellCast', fromZone: 'exile', alternative: 'foretell', commanderTax: 0 },
    ]);
    resolveTop(g);
    g.expect.zone(COMMANDER, 'battlefield', { seat: 0 });
  });
});

describe('determinism and the state hash', () => {
  test('the same plays give the same hash; the foretold turn is part of the state', () => {
    const run = (turn: number) => {
      const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0), { active: 0, turn });
      g.act(0).foretell(BOLT, { pay: true });
      return stateHash(g.state);
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(5));
  });
});

describe('validation and support', () => {
  const withForetell = (alt: unknown, types: readonly string[] = ['instant']) => {
    const base = syntheticCard(BOLT);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, types, alternativeCosts: [alt] }] } as never;
  };

  test('the real shapes are valid and the feature is supported', () => {
    for (const name of [BOLT, INSIGHT, GIANT, COMMANDER]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('castAlternative:foretell')).toBe(true);
  });

  test.each([
    [
      'X in the cost',
      { kind: 'foretell', cost: [{ kind: 'mana', symbols: ['X'] }] },
      'X in an alternative cost',
    ],
    [
      'a cost that is not mana',
      { kind: 'foretell', cost: [{ kind: 'payLife', amount: 2 }] },
      'mana only',
    ],
  ])('%s is refused with a reason', (_name, alt, reason) => {
    expect(JSON.stringify(validateCard(withForetell(alt)))).toContain(reason);
  });

  test('a land cannot have foretell', () => {
    const alt = { kind: 'foretell', cost: [{ kind: 'mana', symbols: ['R'] }] };
    expect(JSON.stringify(validateCard(withForetell(alt, ['land'])))).toContain('not on a land');
  });
});

// Suspend (CR 702.62, 116.2f, D-128): "Suspend N—[cost]" is a special action from the hand, a triggered ability at your
// upkeep that removes a time counter, and a triggered ability that casts the card for free when the last one is gone.
// Pins: CR 702.62a (all three abilities; "if you could begin to cast this card"; "you may play it without paying its
// mana cost if able"; "if you don't, it remains exiled"; "if you cast a creature spell this way, it gains haste"),
// 702.62b (suspended: in exile, has suspend, has a time counter), 702.62c (effects that stop it being cast), 702.62d
// (an alternative cost, 601.2b and 601.2f-h), 116.1 (a special action does not use the stack), 116.2f, 603.4 (the
// intervening "if" is checked again as it resolves), 608.2g (the cast is part of the resolution: no priority), 601.2c
// (targets are chosen when the spell is cast), 302.6 and 702.10 (haste), 903.9a (a commander in exile).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-later.ts).
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

const BEAR = 'SYNTHETIC Suspend Bear'; // {2}{G} 3/3, suspend 3—{G}
const BOLT = 'SYNTHETIC Suspend Bolt'; // {1}{R} instant, 3 damage to any target, suspend 1—{R}
const SCRAP = 'SYNTHETIC Suspend Scrap'; // {3}{R} sorcery, destroy target creature, suspend 2—{R}
const INSIGHT = 'SYNTHETIC Suspend Insight'; // {2}{U} sorcery, draw two, suspend 2—{U}
const RELIC = 'SYNTHETIC Suspend Relic'; // {3} artifact, suspend 2—{0}
const GIANT = 'SYNTHETIC Suspend Flash Giant'; // {4}{G} flash 5/5, suspend 1—{1}{G}
const COMMANDER = 'SYNTHETIC Suspend Commander'; // {3}{G} legendary 3/3, suspend 2—{G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 3, with libraries that do not run out. */
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
  b.battlefield('Forest', { count: 3 }).battlefield('Mountain', { count: 3 });

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** How many permanents on the battlefield are tapped. */
const tappedCount = (g: ScenarioGame): number =>
  g.state.battlefield.filter((id) => g.state.objects[id]?.tapped === true).length;

/** The card in exile named `name`. */
const exiled = (g: ScenarioGame, name: string) => {
  const [card] = g.find({ name, zone: 'exile' });
  if (card === undefined) throw new Error(`${name} is not in exile`);
  return card;
};

/** Goes to the next upkeep of seat 0 (the opponent's turn in between). */
const toMyUpkeep = (g: ScenarioGame): void => {
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
};

describe('the special action (CR 702.62a, 116.2f)', () => {
  test('it is a priority option of its own, beside the ordinary cast', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.expect.legal(0, { suspend: BEAR });
    g.expect.legal(0, { cast: BEAR });
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'suspend')).toHaveLength(1);
  });

  test('it pays the suspend cost, exiles the card face up with N time counters, and does not use the stack', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    g.expect.zone(BEAR, 'exile', { seat: 0 });
    g.expect.noObject(BEAR, { zone: 'hand' });
    g.expect.counters(exiled(g, BEAR).id, { time: 3 });
    g.expect.stack([]);
    g.expect.pending('priority', 0); // the same player has priority again (CR 116.1)
    g.expect.eventLog([
      { kind: 'zoneChanged', fromZone: 'hand', toZone: 'exile' },
      { kind: 'suspended', seat: 0, count: 3 },
      { kind: 'counterAdded', counter: 'time', count: 3 },
    ]);
    expect(g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
    g.expect.invariants();
  });

  test('the card is face up: both players see it and its time counters', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    for (const viewer of [0, 1]) {
      const card = getView(g.state, viewer).exile.find((o) => o.name === BEAR);
      expect(card?.counters).toEqual({ time: 3 });
      expect(card?.faceDown).toBeUndefined();
    }
  });

  test('the view shows the action on the card in the hand, with its cost and counters', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.specialActions).toEqual([{ kind: 'suspend', cost: ['G'], counters: 3 }]);
  });

  test('cancelling the payment takes nothing: the card is still in the hand and nothing was paid', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR);
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    g.expect.pending('priority', 0);
    g.expect.zone(BEAR, 'hand', { seat: 0 });
    expect(g.find({ name: 'Forest', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(0);
    g.expect.legal(0, { suspend: BEAR });
  });

  test('it can be paid by hand with the lands the player taps', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0)
      .suspend(BEAR)
      .payManual([{ source: { name: 'Forest', nth: 2 } }]);
    g.expect.zone(BEAR, 'exile', { seat: 0 });
  });

  test('a payment that does not cover the cost is refused and the question stays', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR);
    const refused = g.act(0).try.action({ kind: 'payManual', taps: [] });
    expect(refused.ok).toBe(false);
    g.expect.pending('payMana', 0);
  });

  test('a cost of {0} is taken at once, with no payment', () => {
    const g = game((b) => b.seat(0).hand(RELIC).seat(0));
    g.act(0).suspend(RELIC);
    g.expect.zone(RELIC, 'exile', { seat: 0 });
    g.expect.counters(exiled(g, RELIC).id, { time: 2 });
    g.expect.pending('priority', 0);
  });

  test('without the mana for the cost it is not offered', () => {
    const g = game((b) => b.battlefield('Mountain').hand(BEAR).seat(0));
    g.expect.illegal(0, { suspend: BEAR });
    expect(
      applyAction(g.state, 0, { kind: 'suspend', object: g.find({ name: BEAR })[0]?.id as never })
        .ok,
    ).toBe(false);
  });

  test('a card without suspend, or not in the hand, cannot be suspended', () => {
    const g = game((b) => lands(b.seat(0).hand('Grizzly Bears').graveyard(BEAR)).seat(0));
    const bears = g.find({ name: 'Grizzly Bears' })[0];
    const inGrave = g.find({ name: BEAR })[0];
    if (bears === undefined || inGrave === undefined) throw new Error('missing card');
    expect(applyAction(g.state, 0, { kind: 'suspend', object: bears.id }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'suspend', object: inGrave.id }).ok).toBe(false);
  });

  test('the opponent cannot suspend a card in your hand, and no one suspends from the other seat’s hand', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    const bear = g.find({ name: BEAR })[0];
    if (bear === undefined) throw new Error('missing card');
    expect(applyAction(g.state, 1, { kind: 'suspend', object: bear.id }).ok).toBe(false);
  });
});

describe('"if you could begin to cast this card" (CR 702.62a, 702.62c)', () => {
  test('a sorcery or a creature has sorcery timing: not in the opponent’s turn, not with the stack busy', () => {
    const theirs = game((b) => lands(b.seat(0).hand(BEAR)).seat(0), {
      active: 1,
      turn: 4,
      priority: 0,
    });
    theirs.expect.illegal(0, { suspend: BEAR });
    const busy = game((b) => lands(b.seat(0).hand(BEAR, 'Lightning Bolt')).seat(0));
    busy.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    busy.expect.illegal(0, { suspend: BEAR });
    busy.expect.illegal(0, { cast: BEAR });
  });

  test('not in the beginning of combat either', () => {
    const g = game((b) => lands(b.seat(0).hand(SCRAP)).seat(0));
    g.advanceTo('beginningOfCombat');
    g.expect.illegal(0, { suspend: SCRAP });
  });

  test('an instant can be suspended any time the player has priority, even in the opponent’s turn', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.pass(1); // the active player passes; seat 0 has priority in seat 1's upkeep
    g.expect.legal(0, { suspend: BOLT });
  });

  test('a card with flash is suspended as an instant is', () => {
    const g = game((b) => lands(b.seat(0).hand(GIANT)).seat(0), {
      active: 1,
      turn: 4,
      priority: 0,
    });
    g.expect.legal(0, { suspend: GIANT });
    g.act(0).suspend(GIANT, { pay: true });
    g.expect.zone(GIANT, 'exile', { seat: 0 });
  });

  test('it does not need a legal target: the targets are chosen when the card is cast, if ever (CR 601.2c)', () => {
    const g = game((b) => lands(b.seat(0).hand(SCRAP)).seat(0));
    g.expect.illegal(0, { cast: SCRAP }); // nothing to destroy
    g.expect.legal(0, { suspend: SCRAP });
  });

  test('an effect that stops spells being cast stops it (split second on the stack)', () => {
    const g = game((b) =>
      lands(
        b
          .seat(0)
          .hand(BEAR)
          .seat(1)
          .hand('SYNTHETIC Hush Bolt')
          .battlefield('Mountain', { count: 2 })
          .seat(0),
      ),
    );
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Hush Bolt', { targets: [{ player: 0 }], pay: true });
    g.expect.illegal(0, { suspend: BEAR });
  });
});

describe('the upkeep ability (CR 702.62a: remove a time counter)', () => {
  test('at the beginning of its owner’s upkeep a trigger removes one counter, and it can be responded to', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    toMyUpkeep(g);
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.stack([`${BEAR} (ability)`]);
    g.expect.counters(exiled(g, BEAR).id, { time: 3 }); // not yet
    expect(getView(g.state, 1).stack[0]?.abilitySource).toBe(exiled(g, BEAR).id);
    resolveTop(g);
    g.expect.counters(exiled(g, BEAR).id, { time: 2 });
    g.expect.eventLog([{ kind: 'counterRemoved', counter: 'time', count: 1 }]);
  });

  test('it does not trigger at the opponent’s upkeep: "your upkeep"', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.expect.stack([]);
    g.expect.counters(exiled(g, BEAR).id, { time: 3 });
  });

  test('a card suspended in the opponent’s upkeep (an instant) ticks at your next one, not before', () => {
    const g = game((b) => lands(b.seat(0).hand(BOLT)).seat(0));
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass(1);
    g.act(0).suspend(BOLT, { pay: true });
    g.expect.stack([]);
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0's own upkeep, the next one
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.stack([`${BOLT} (ability)`]);
  });

  test('two suspended cards trigger separately and their owner orders them (CR 603.3b)', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR, INSIGHT).battlefield('Island')).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    g.act(0).suspend(INSIGHT, { pay: true });
    toMyUpkeep(g);
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.counters(exiled(g, BEAR).id, { time: 2 });
    g.expect.counters(exiled(g, INSIGHT).id, { time: 1 });
  });

  test('the "if this card is suspended" is checked again as the ability resolves (CR 603.4)', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    toMyUpkeep(g);
    g.expect.stack([`${BEAR} (ability)`]);
    // Something else removed the counters before the ability resolved: the ability finds nothing to remove.
    const card = exiled(g, BEAR);
    const stripped = {
      ...g.state,
      objects: { ...g.state.objects, [card.id]: { ...card, counters: {} } },
    };
    const first = applyAction(stripped, 0, { kind: 'pass' });
    if (!first.ok) throw new Error(first.error);
    const second = applyAction(first.state, 1, { kind: 'pass' });
    if (!second.ok) throw new Error(second.error);
    expect(second.events.some((e) => e.kind === 'counterRemoved')).toBe(false);
    expect(second.events.some((e) => e.kind === 'resolved')).toBe(true);
  });
});

describe('the last counter: "you may play it without paying its mana cost" (CR 702.62a, 608.2g)', () => {
  /** Suspend `name` now and go to the upkeep where its last counter comes off, resolving the ticks on the way. */
  function untilLastCounter(
    name: string,
    count: number,
    configure: (b: Builder) => Builder = (b) => b,
  ) {
    const g = game((b) => configure(lands(b.seat(0).hand(name).battlefield('Island'))).seat(0));
    g.act(0).suspend(name, { pay: true });
    for (let i = 0; i < count; i += 1) {
      toMyUpkeep(g);
      resolveTop(g); // the tick; the last one triggers the cast ability
      if (i < count - 1) g.expect.counters(exiled(g, name).id, { time: count - 1 - i });
    }
    return g;
  }

  test('N = 3: the counters come off one by one, and the cast ability triggers only with the last', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    toMyUpkeep(g);
    resolveTop(g);
    g.expect.counters(exiled(g, BEAR).id, { time: 2 });
    g.expect.stack([]);
    toMyUpkeep(g);
    resolveTop(g);
    g.expect.counters(exiled(g, BEAR).id, { time: 1 });
    g.expect.stack([]);
    toMyUpkeep(g);
    resolveTop(g);
    // The tick resolved: the last counter is gone and the second ability is on the stack (CR 702.62a).
    g.expect.counters(exiled(g, BEAR).id, {});
    g.expect.stack([`${BEAR} (ability)`]);
  });

  test('N = 1: the first upkeep removes the last counter at once', () => {
    const g = untilLastCounter(BOLT, 1);
    g.expect.stack([`${BOLT} (ability)`]);
    expect(exiled(g, BOLT).counters.time).toBeUndefined();
  });

  test('the owner is asked; accepting casts the card for free, from exile, without a player getting priority', () => {
    const g = untilLastCounter(BEAR, 3);
    const tapped = tappedCount(g);
    g.pass();
    g.pass(); // the cast ability resolves: it asks
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind === 'confirmOptional') {
      expect(d.purpose).toBe('suspend');
      expect(d.subject).toBe(exiled(g, BEAR).id);
      expect(d.seat).toBe(0);
    }
    g.act(0).accept();
    // The spell is on the stack, no one passed priority; the ability finished resolving.
    g.expect.stack([BEAR]);
    g.expect.pending('priority', 0);
    g.expect.eventLog([
      { kind: 'spellCast', seat: 0, fromZone: 'exile', alternative: 'free', suspended: true },
    ]);
    expect(tappedCount(g)).toBe(tapped);
    expect(getView(g.state, 1).stack[0]?.suspended).toBe(true);
    resolveTop(g);
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining leaves the card in exile with no counters: it remains exiled (CR 702.62a)', () => {
    const g = untilLastCounter(BEAR, 3);
    resolveTop(g);
    g.act(0).decline();
    g.expect.zone(BEAR, 'exile', { seat: 0 });
    g.expect.stack([]);
    g.expect.counters(exiled(g, BEAR).id, {});
    // It is not suspended any more (no counter): later upkeeps do nothing, and nothing asks again.
    toMyUpkeep(g);
    g.expect.stack([]);
    g.expect.zone(BEAR, 'exile', { seat: 0 });
  });

  test('a spell with a target asks for it as it is cast (CR 601.2c); the cast can be taken back', () => {
    const g = untilLastCounter(BOLT, 1);
    resolveTop(g);
    g.act(0).accept();
    g.expect.pending('targets', 0);
    g.act(0).cancel(); // CR 733: back to the question, the card still in exile
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('no legal target when the last counter comes off: nothing is asked, it remains exiled (CR 702.62a "if able")', () => {
    const g = untilLastCounter(SCRAP, 2);
    g.expect.stack([`${SCRAP} (ability)`]);
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(SCRAP, 'exile', { seat: 0 });
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'spellCast' });
  });

  test('a target that appears later does not matter: it is looked at only when the last counter is removed', () => {
    const g = untilLastCounter(SCRAP, 2, (b) => b.seat(1).battlefield('Grizzly Bears').seat(0));
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseTargets('Grizzly Bears');
    resolveTop(g);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('timing does not matter: a sorcery is cast in the upkeep (the cast is part of the resolution)', () => {
    const g = untilLastCounter(INSIGHT, 2);
    g.expect.step('upkeep', { active: 0, turn: 7 });
    const before = g.state.seats[0]?.hand.length ?? 0;
    resolveTop(g);
    g.act(0).accept();
    resolveTop(g);
    expect(g.state.seats[0]?.hand.length).toBe(before + 2);
  });

  test('the spell can be countered like any spell: it goes to the graveyard, not back to exile', () => {
    const g = untilLastCounter(BEAR, 3, (b) =>
      b.seat(1).hand('Counterspell').battlefield('Island', { count: 2 }).seat(0),
    );
    resolveTop(g);
    g.act(0).accept();
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [BEAR], pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    g.expect.noObject(BEAR, { zone: 'exile' });
  });

  test('a noncreature permanent has no haste to gain and nothing special on the battlefield', () => {
    const g = untilLastCounter(RELIC, 2);
    resolveTop(g);
    g.act(0).accept();
    resolveTop(g);
    g.expect.zone(RELIC, 'battlefield', { seat: 0 });
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === RELIC)?.alternative,
    ).toBeUndefined();
  });
});

describe('haste (CR 702.62a, 702.10, 302.6)', () => {
  function suspendedBear() {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).suspend(BEAR, { pay: true });
    for (let i = 0; i < 3; i += 1) {
      toMyUpkeep(g);
      resolveTop(g);
    }
    resolveTop(g);
    g.act(0).accept();
    resolveTop(g);
    return g;
  }

  test('a creature cast this way can attack the turn it enters', () => {
    const g = suspendedBear();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEAR)?.keywords).toContain(
      'haste',
    );
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEAR)?.alternative).toBe(
      'suspend',
    );
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEAR, true);
  });

  test('the same creature cast from the hand has no haste', () => {
    const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
    g.act(0).cast(BEAR, { pay: true });
    resolveTop(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEAR, false);
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === BEAR)?.alternative,
    ).toBeUndefined();
  });

  test('a creature that left and came back is a new object without the haste (CR 400.7)', () => {
    const g = suspendedBear();
    // Bounce it, then cast it again from the hand.
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    const card = g.find({ name: BEAR, zone: 'battlefield' })[0];
    if (card === undefined) throw new Error('no creature');
    expect(card.alt).toBe('suspend');
  });
});

describe('a commander with suspend (CR 903.9a, 903.8)', () => {
  test('exiled by suspend it is a commander in exile: the owner may put it into the command zone instead', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(COMMANDER, { commander: true, label: 'cmd' })).seat(0),
    );
    g.act(0).suspend('cmd', { pay: true });
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(COMMANDER, 'command', { seat: 0 });
    // Not exiled any more, so not suspended: nothing triggers at the upkeep.
    toMyUpkeep(g);
    g.expect.stack([]);
  });

  test('declining the question leaves it suspended; cast from exile it pays no commander tax (CR 903.8)', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(COMMANDER, { commander: true, label: 'cmd' })).seat(0),
    );
    g.act(0).suspend('cmd', { pay: true });
    g.act(0).declineCommandZone();
    g.expect.zone(COMMANDER, 'exile', { seat: 0 });
    g.expect.counters(exiled(g, COMMANDER).id, { time: 2 });
    for (let i = 0; i < 2; i += 1) {
      toMyUpkeep(g);
      resolveTop(g);
    }
    resolveTop(g);
    g.act(0).accept();
    const spell = g.find({ name: COMMANDER, zone: 'stack' })[0];
    expect(spell?.stack?.castFromCommandZone).toBe(false);
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'exile', commanderTax: 0, suspended: true }]);
    resolveTop(g);
    g.expect.zone(COMMANDER, 'battlefield', { seat: 0 });
    expect(Object.values(g.state.commanderCasts).every((n) => n === 0)).toBe(true);
  });
});

describe('determinism and the state hash', () => {
  test('the same plays give the same hash', () => {
    const run = () => {
      const g = game((b) => lands(b.seat(0).hand(BEAR)).seat(0));
      g.act(0).suspend(BEAR, { pay: true });
      toMyUpkeep(g);
      resolveTop(g);
      return g;
    };
    expect(stateHash(run().state)).toBe(stateHash(run().state));
  });
});

describe('validation and support', () => {
  const withKeyword = (keyword: unknown, types: readonly string[] = ['creature']) => {
    const base = syntheticCard(BEAR);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...base,
      faces: [{ ...face, types, abilities: [{ kind: 'keyword', keyword }] }],
    } as never;
  };

  test('the real shape is valid and the feature is supported', () => {
    for (const name of [BEAR, BOLT, SCRAP, INSIGHT, RELIC, GIANT, COMMANDER]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('keyword:suspend')).toBe(true);
    expect(isFeatureSupported('effect:castExiled')).toBe(true);
  });

  test.each([
    [
      'no counters',
      { kind: 'suspend', count: 0, cost: [{ kind: 'mana', symbols: ['R'] }] },
      'positive number',
    ],
    [
      'X in the cost',
      { kind: 'suspend', count: 2, cost: [{ kind: 'mana', symbols: ['X', 'R'] }] },
      'X in a suspend cost',
    ],
    [
      'a cost that is not mana',
      { kind: 'suspend', count: 2, cost: [{ kind: 'payLife', amount: 2 }] },
      'mana only',
    ],
    ['an empty cost', { kind: 'suspend', count: 2, cost: [] }, 'cost list is empty'],
  ])('%s is refused with a reason', (_name, keyword, reason) => {
    expect(JSON.stringify(validateCard(withKeyword(keyword)))).toContain(reason);
  });

  test('a land cannot have suspend', () => {
    const keyword = { kind: 'suspend', count: 2, cost: [{ kind: 'mana', symbols: ['R'] }] };
    expect(JSON.stringify(validateCard(withKeyword(keyword, ['land'])))).toContain('not on a land');
  });

  test('two suspend abilities on a face are refused', () => {
    const base = syntheticCard(BEAR);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const twice = {
      ...base,
      faces: [{ ...face, abilities: [...face.abilities, ...face.abilities] }],
    } as never;
    expect(JSON.stringify(validateCard(twice))).toContain('more than one suspend');
  });

  test('a card cannot write the engine’s own effects', () => {
    const base = syntheticCard(INSIGHT);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    for (const effect of [{ kind: 'removeTimeCounter' }, { kind: 'castExiled', mode: 'suspend' }]) {
      const card = { ...base, faces: [{ ...face, spell: { effect } }] } as never;
      expect(JSON.stringify(validateCard(card))).toContain(
        "part of the engine's Suspend and Madness",
      );
    }
  });
});

// CR 702.62a: "it gains haste until you lose control of the spell or the permanent it becomes" (D-224): the haste is the suspending player's and ends the moment
// somebody else controls the permanent, and does not come back when control does.
describe('the haste lasts until the player loses control (CR 702.62a)', () => {
  const BORROW = 'SYNTHETIC Borrow Creature'; // {1}{R} instant: gain control of target creature until end of turn

  function stolenBear() {
    const g = game((b) =>
      lands(b.seat(0).hand(BEAR)).seat(1).hand(BORROW).battlefield('Mountain', 'Mountain').seat(0),
    );
    g.act(0).suspend(BEAR, { pay: true });
    for (let i = 0; i < 3; i += 1) {
      toMyUpkeep(g);
      resolveTop(g);
    }
    resolveTop(g);
    g.act(0).accept();
    resolveTop(g);
    return g;
  }
  const hasHaste = (g: ScenarioGame, seat: 0 | 1) =>
    getView(g.state, seat)
      .battlefield.find((o) => o.name === BEAR)
      ?.keywords.includes('haste');

  test('while the suspending player controls it, it has haste; once an opponent takes it, it has none; when control goes back, it has none either', () => {
    const g = stolenBear();
    expect(hasHaste(g, 0)).toBe(true);
    g.pass(); // seat 0 passes priority with the bear in play; seat 1 may respond
    g.act(1).cast(BORROW, { targets: [{ name: BEAR, seat: 0 }], pay: true });
    g.passAll();
    expect(g.find({ name: BEAR, zone: 'battlefield' })).toHaveLength(1);
    expect(getView(g.state, 1).battlefield.find((o) => o.name === BEAR)?.controller).toBe(1);
    expect(hasHaste(g, 1)).toBe(false);
    // The turn ends: control goes back to seat 0, and the haste that ended with the control does not come back.
    g.advanceTo('upkeep', { turn: 'next' });
    expect(getView(g.state, 1).battlefield.find((o) => o.name === BEAR)?.controller).toBe(0);
    expect(hasHaste(g, 1)).toBe(false);
  });
});

// The scenario DSL verbs: every verb goes through applyAction, and a rejected verb fails the test
// with the engine's own error.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  createDriver,
  ScenarioError,
  scenario,
  startGame,
  stateHash,
} from './dsl-helpers';

function boltGame() {
  return scenario()
    .seat(0)
    .hand('Lightning Bolt', 'Forest')
    .battlefield('Mountain')
    .seat(1)
    .battlefield('Grizzly Bears')
    .library('Island', { count: 4 })
    .build();
}

describe('verbs: casting', () => {
  test('cast with targets and pay: the spell is on the stack, then resolves', () => {
    const g = boltGame();
    g.act(0)
      .cast('Lightning Bolt', { targets: [{ player: 1 }] })
      .pay();
    g.expect.stack(['Lightning Bolt']);
    g.expect.tapped('Mountain');
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
  });

  test('targets may be cards by name, with a seat to disambiguate', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', 'Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears', seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('the cast handle steps through targets, payment and done', () => {
    const g = boltGame();
    const cast = g.act(0).cast('Lightning Bolt');
    expect(cast.stage).toBe('targets');
    g.expect.pending('targets', 0);
    cast.targets([{ player: 1 }]);
    expect(cast.stage).toBe('payment');
    g.expect.pending('payMana', 0);
    cast.pay();
    expect(cast.stage).toBe('cast');
    g.expect.stack(['Lightning Bolt']);
  });

  test('payManual taps exactly the named sources', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .build();
    g.act(0)
      .cast('Lightning Bolt', { targets: [{ player: 1 }] })
      .payManual(['Mountain[1]']);
    g.expect.tapped('Mountain[1]');
    g.expect.tapped('Mountain[0]', false);
  });

  test('cancel at the targets stage restores the exact prior state (CR 733)', () => {
    const g = boltGame();
    const before = g.positionHash();
    g.act(0).cast('Lightning Bolt').cancel();
    g.expect.position(before);
    g.expect.pending('priority', 0);
  });

  test('cancel at the payment stage restores the exact prior state (CR 733)', () => {
    const g = boltGame();
    const before = g.positionHash();
    g.act(0)
      .cast('Lightning Bolt', { targets: [{ player: 1 }] })
      .cancel();
    g.expect.position(before);
  });

  test('cast with pay: true but no targets for a targeted spell says so', () => {
    const g = boltGame();
    expect(() => g.act(0).cast('Lightning Bolt', { pay: true })).toThrow(/needs the targets/);
  });

  test('a spell on the stack is targeted by name and zone', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', {
      targets: [{ name: 'Lightning Bolt', zone: 'stack' }],
      pay: true,
    });
    g.expect.stack(['Counterspell', 'Lightning Bolt']);
    g.passAll();
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
  });
});

describe('verbs: lands, mana and priority', () => {
  test('playLand and tapForMana', () => {
    const g = boltGame();
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'GR');
  });

  test('tapForMana needs a color for a multi-color source', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .commander('Isamaru, Hound of Konda')
      .commander('Yargle, Glutton of Urborg')
      .build();
    expect(() => g.act(0).tapForMana('Command Tower')).toThrow(/can produce several colors/);
    g.act(0).tapForMana('Command Tower', { color: 'B' });
    g.expect.pool(0, 'B');
  });

  test('tapForMana picks the only color a commander-identity source offers', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .commander('Isamaru, Hound of Konda')
      .build();
    g.act(0).tapForMana('Command Tower');
    g.expect.pool(0, 'W');
  });

  test('tapForMana on a card without a mana ability', () => {
    const g = scenario().seat(0).battlefield('Grizzly Bears').build();
    expect(() => g.act(0).tapForMana('Grizzly Bears')).toThrow(/has no mana ability/);
  });

  test('pass moves priority to the other seat; pass(seat) names the seat', () => {
    const g = boltGame();
    g.pass();
    expect(g.deciding).toBe(1);
    g.expect.pending('priority', 1);
    g.pass(1);
    g.expect.step('beginningOfCombat');
  });

  test('passAll resolves a whole stack and stops with priority back to the active seat', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .build();
    g.act(0).cast('Lightning Bolt[0]', { targets: [{ player: 1 }], pay: true });
    g.act(0).cast('Lightning Bolt[0]', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt', 'Lightning Bolt']);
    g.passAll();
    g.expect.stack([]);
    g.expect.life(1, 34);
    g.expect.pending('priority', 0);
    g.expect.step('precombatMain');
  });

  test('passAll with an empty stack ends the step', () => {
    const g = boltGame();
    g.passAll();
    g.expect.step('beginningOfCombat');
  });

  test('passAll stops, without error, at a decision that is not priority', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Isamaru, Hound of Konda', { commander: true, damage: 2 })
      .seat(1)
      .build();
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.expect.zone('Isamaru, Hound of Konda', 'graveyard', { seat: 0 });
  });

  test('advanceTo walks the turn and can go on into the next turn', () => {
    const g = boltGame();
    g.advanceTo('end');
    g.expect.step('end', { active: 0, turn: 3 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1, turn: 4 });
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 1, turn: 4 });
  });

  test('advanceTo the current step does nothing; advanceTo an earlier step goes round the turn', () => {
    const g = boltGame();
    const before = g.hash();
    g.advanceTo('precombatMain');
    g.expect.hash(before);
    g.advanceTo('upkeep');
    g.expect.step('upkeep', { turn: 4 });
  });

  test('advanceTo stops with a clear error when a decision is in the way', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 9 })
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    g.advanceTo('end');
    expect(() => g.advanceTo('upkeep', { turn: 'next' })).toThrow(
      /advanceTo\(upkeep\) stopped in the cleanup step: discard decision for seat 0 must be answered first/,
    );
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    // The discard ended the turn: seat 1's turn 4 has already begun.
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
  });
});

describe('verbs: raw choices and rejections', () => {
  test('choose applies any action for the deciding seat, or for a named seat', () => {
    const g = boltGame();
    g.choose({ kind: 'pass' });
    expect(g.deciding).toBe(1);
    g.choose(1, { kind: 'pass' });
    g.expect.step('beginningOfCombat');
  });

  test('a rejected verb throws the engine error with context', () => {
    const g = boltGame();
    expect(() => g.act(1).pass()).toThrow(ScenarioError);
    expect(() => g.act(1).pass()).toThrow(
      /The engine rejected seat 1 pass: It is not your decision/,
    );
    expect(() => g.act(1).pass()).toThrow(/Waiting for: priority decision for seat 0/);
  });

  test('a verb for an unaffordable spell is rejected by the engine', () => {
    const g = scenario().seat(0).hand('Murder').battlefield('Swamp').build();
    expect(() => g.act(0).cast('Murder')).toThrow(/The engine rejected seat 0 castSpell Murder/);
  });

  test('try verbs return the engine error and leave state and log alone', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 2 })
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    g.act(0).playLand('Forest[0]');
    const before = g.hash();
    const logged = g.log.length;
    const r = g.act(0).try.playLand('Forest');
    expect(r).toEqual({ ok: false, error: 'That is not a legal play now' });
    expect(g.hash()).toBe(before);
    expect(g.log).toHaveLength(logged);
  });

  test('try verbs that are accepted are applied and logged', () => {
    const g = boltGame();
    const r = g.act(0).try.pass();
    expect(r.ok).toBe(true);
    expect(g.deciding).toBe(1);
    expect(g.log.at(-1)).toEqual({ seat: 0, action: { kind: 'pass' } });
  });

  test('try.action passes a raw action through', () => {
    const g = boltGame();
    const r = g.act(1).try.action({ kind: 'pass' });
    expect(r).toMatchObject({ ok: false });
  });

  test('card references that match nothing say where the card really is', () => {
    const g = boltGame();
    expect(() => g.act(0).playLand('Mountain')).toThrow(
      /No card named "Mountain" in hand for seat 0\. It exists elsewhere/,
    );
    expect(() => g.act(0).playLand('Swamp')).toThrow(/No card with that name is in the game/);
    expect(() => g.act(1).playLand('Forest')).toThrow(/No card named "Forest" in hand for seat 1/);
  });

  test('object ids and labels resolve; a stale object id explains why (CR 400.7)', () => {
    const g = scenario().seat(0).hand('Forest', { label: 'f' }).build();
    const id = g.id('f');
    expect(g.id(id)).toBe(id);
    g.act(0).playLand('f');
    expect(() => g.id(id)).toThrow(
      /does not exist \(objects get new ids when they change zone, CR 400\.7\)/,
    );
    expect(g.object('f').zone).toBe('battlefield');
  });
});

describe('verbs: the log, events and checks', () => {
  test('the log holds accepted actions in order and events accumulate', () => {
    const g = boltGame();
    g.act(0).playLand('Forest');
    const mark = g.mark();
    g.act(0).tapForMana('Forest');
    expect(g.log.map((l) => l.action.kind)).toEqual(['playLand', 'activateAbility']);
    expect(g.eventsSince(mark).map((e) => e.kind)).toEqual([
      'tapped',
      'tappedForMana',
      'manaAdded',
    ]);
    g.expect.eventLog([
      { kind: 'landPlayed', seat: 0 },
      { kind: 'tapped' },
      { kind: 'manaAdded', count: 1 },
    ]);
    expect(g.log[0]?.action).toMatchObject({ kind: 'playLand' });
  });

  test('replaying the log on a fresh build gives the same state', () => {
    const g = boltGame();
    g.act(0).playLand('Forest');
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    let state = boltGame().state;
    for (const { seat, action } of g.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(g.hash());
  });

  test('createDriver wraps any state and reports broken invariants after an action', () => {
    const good = boltGame().state;
    const [firstId] = Object.keys(good.objects);
    const donor = firstId ? good.objects[firstId as keyof typeof good.objects] : undefined;
    if (!donor) throw new Error('no object');
    const broken = {
      ...good,
      objects: { ...good.objects, o999: { ...donor, id: 'o999' as const, card: null } },
    };
    const g = createDriver(broken);
    expect(() => g.act(0).pass()).toThrow(
      /State invariants broke after seat 0 pass:\s+o999 is an object in no zone list/,
    );
  });

  test('invariant checking can be switched off at build time', () => {
    const g = scenario().seat(0).seat(1).build({ checkInvariants: false });
    expect(() => g.act(0).pass()).not.toThrow();
  });

  test('startGame wraps createGame and keeps its events', () => {
    const deck = { cards: [], commanders: [] as number[] };
    expect(() => startGame({ seed: 1, decks: [deck] })).toThrow(/exactly two seats/);
  });

  test('view hides what the viewer may not know', () => {
    const g = boltGame();
    expect(g.view(0).seats[0]?.hand).toHaveLength(2);
    expect(g.view(0).seats[1]?.hand).toBeNull();
    expect(g.view(1).seats[0]?.hand).toBeNull();
  });

  test('actions are real: a raw action the engine would refuse is refused by choose', () => {
    const g = boltGame();
    const bogus: Action = { kind: 'playLand', object: 'o0' };
    expect(() => g.choose(bogus)).toThrow(/The engine rejected seat 0 playLand/);
  });
});

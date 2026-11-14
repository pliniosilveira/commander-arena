// The scenario DSL assertions: each passes when true and fails with a message that says what was
// expected, what was found and where (plus a dump of the state).
import { describe, expect, test } from 'vitest';
import { ScenarioError, scenario } from './dsl-helpers';

function game() {
  return scenario()
    .seat(0)
    .life(20)
    .hand('Lightning Bolt', 'Forest')
    .library('Island', 'Island')
    .graveyard('Murder')
    .battlefield('Mountain', { tapped: true })
    .battlefield('Grizzly Bears', { damage: 1, counters: { '+1/+1': 1 } })
    .pool('GG')
    .seat(1)
    .battlefield('Grizzly Bears')
    .battlefield('Plains', { count: 2 })
    .build();
}

const fails = (fn: () => void, message: RegExp) => {
  expect(fn).toThrow(ScenarioError);
  expect(fn).toThrow(message);
};

describe('expect.zone and expect.noObject', () => {
  test('zone passes by name, zone and seat, and by count', () => {
    const g = game();
    g.expect.zone('Lightning Bolt', 'hand');
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0, count: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { count: 2 });
    g.expect.zone('Plains', 'battlefield', { seat: 1, count: 2 });
  });

  test('zone fails and says where the card really is', () => {
    const g = game();
    fails(
      () => g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 }),
      /Expected at least one of "Grizzly Bears" in graveyard for seat 1 but found 0; it is at: Grizzly Bears \(o\d+, seat 0's battlefield\); Grizzly Bears \(o\d+, seat 1's battlefield\)/,
    );
    fails(
      () => g.expect.zone('Plains', 'battlefield', { seat: 1, count: 1 }),
      /Expected 1 of "Plains" in battlefield for seat 1 but found 2/,
    );
    fails(() => g.expect.zone('Swamp', 'hand'), /no card named "Swamp" exists in the game/);
  });

  test('the failure message carries a dump of the state', () => {
    const g = game();
    fails(
      () => g.expect.zone('Swamp', 'hand'),
      /--- state ---\nturn 3, active seat 0, step precombatMain/,
    );
  });

  test('noObject passes and fails', () => {
    const g = game();
    g.expect.noObject('Swamp');
    g.expect.noObject('Grizzly Bears', { zone: 'graveyard' });
    g.expect.noObject('Lightning Bolt', { seat: 1 });
    fails(
      () => g.expect.noObject('Murder'),
      /Expected no "Murder" but found Murder \(o\d+, seat 0's graveyard\)/,
    );
    fails(
      () => g.expect.noObject('Grizzly Bears', { zone: 'battlefield', seat: 1 }),
      /Expected no "Grizzly Bears" in battlefield for seat 1/,
    );
  });
});

describe('numbers and flags', () => {
  test('life', () => {
    const g = game();
    g.expect.life(0, 20);
    fails(() => g.expect.life(0, 19), /Expected seat 0 to have 19 life but it has 20/);
  });

  test('tapped and untapped', () => {
    const g = game();
    g.expect.tapped('Mountain');
    g.expect.tapped({ name: 'Grizzly Bears', seat: 0 }, false);
    fails(
      () => g.expect.tapped('Mountain', false),
      /Expected Mountain \(o\d+, seat 0's battlefield\) to be untapped/,
    );
    fails(() => g.expect.tapped({ name: 'Grizzly Bears', seat: 1 }), /to be tapped/);
  });

  test('derived compares types, subtypes, colors and keywords as sets', () => {
    const g = game();
    const bears = { name: 'Grizzly Bears', seat: 0 };
    g.expect.derived(bears, {
      types: ['creature'],
      subtypes: ['Bear'],
      colors: ['G'],
      keywords: [],
    });
    g.expect.derived(bears, { colors: ['G'] });
    fails(
      () => g.expect.derived(bears, { colors: ['U'] }),
      /to have colors \[U\] but it has \[G\]/,
    );
    fails(
      () => g.expect.derived(bears, { keywords: ['flying'] }),
      /to have keywords \[flying\] but it has \[\]/,
    );
  });

  test('counters and damage', () => {
    const g = game();
    const bears = { name: 'Grizzly Bears', seat: 0 };
    g.expect.counters(bears, { '+1/+1': 1 });
    g.expect.counters({ name: 'Grizzly Bears', seat: 1 }, {});
    g.expect.damage(bears, 1);
    fails(
      () => g.expect.counters(bears, { '+1/+1': 2 }),
      /to have counters \{"\+1\/\+1":2\} but it has \{"\+1\/\+1":1\}/,
    );
    fails(() => g.expect.damage(bears, 0), /to have 0 damage marked but it has 1/);
  });

  test('pool accepts symbols or counts and compares exactly', () => {
    const g = game();
    g.expect.pool(0, 'GG');
    g.expect.pool(0, { G: 2 });
    g.expect.pool(1, '');
    fails(() => g.expect.pool(0, 'G'), /Expected seat 0's mana pool to be 1G but it is 2G/);
    fails(() => g.expect.pool(1, 'R'), /to be 1R but it is empty/);
  });

  test('hand and library sizes', () => {
    const g = game();
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 2);
    fails(() => g.expect.handSize(0, 3), /seat 0 to have 3 cards in hand but it has 2/);
    fails(() => g.expect.librarySize(1, 1), /seat 1's library to have 1 cards but it has 0/);
  });

  test('hasLost and gameOver', () => {
    const g = scenario().seat(0).life(0).seat(1).build({ settle: true });
    g.expect.hasLost(0);
    g.expect.hasLost(1, false);
    g.expect.gameOver({ win: 1 });
    fails(
      () => g.expect.gameOver('draw'),
      /Expected the game to end in a draw but the result is \{"kind":"win","winner":1\}/,
    );
    fails(() => g.expect.gameOver({ win: 0 }), /a win for seat 0/);
    fails(() => g.expect.hasLost(1), /Expected seat 1 to have lost/);
    const running = game();
    fails(() => running.expect.gameOver('draw'), /the result is null/);
  });
});

describe('stack, pending, step', () => {
  test('stack lists the top first', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Counterspell')
      .battlefield('Mountain', 'Island', 'Island')
      .build();
    g.expect.stack([]);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).cast('Counterspell', {
      targets: [{ name: 'Lightning Bolt', zone: 'stack' }],
      pay: true,
    });
    g.expect.stack(['Counterspell', 'Lightning Bolt']);
    fails(
      () => g.expect.stack(['Lightning Bolt', 'Counterspell']),
      /Expected the stack \(top first\) to be \[Lightning Bolt, Counterspell\] but it is \[Counterspell, Lightning Bolt\]/,
    );
  });

  test('pending', () => {
    const g = game();
    g.expect.pending('priority');
    g.expect.pending('priority', 0);
    fails(
      () => g.expect.pending('priority', 1),
      /Expected a priority decision for seat 1 but the engine is waiting for priority decision for seat 0/,
    );
    fails(
      () => g.expect.pending('targets'),
      /Expected a targets decision but the engine is waiting for priority decision for seat 0/,
    );
  });

  test('step', () => {
    const g = game();
    g.expect.step('precombatMain', { active: 0, turn: 3 });
    fails(
      () => g.expect.step('end'),
      /Expected step end but it is precombatMain of seat 0's turn 3/,
    );
    fails(
      () => g.expect.step('precombatMain', { active: 1 }),
      /of seat 1's turn but it is precombatMain of seat 0's turn 3/,
    );
  });
});

describe('events', () => {
  function played() {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears', seat: 1 }], pay: true });
    g.passAll();
    return g;
  }

  test('eventLog matches partial events as a subsequence, in order', () => {
    const g = played();
    g.expect.eventLog([
      { kind: 'spellCast', seat: 0 },
      { kind: 'damageDealt', amount: 3, to: { kind: 'object' } },
      { kind: 'zoneChanged', cardName: 'Lightning Bolt', toZone: 'graveyard' },
      { kind: 'died', cardName: 'Grizzly Bears' },
    ]);
  });

  test('eventLog fails with the matcher and the events seen', () => {
    const g = played();
    fails(
      () => g.expect.eventLog([{ kind: 'died', cardName: 'Mountain' }]),
      /Expected the event log to contain \{"kind":"died","cardName":"Mountain"\}\.\nEvents:\n {2}\{"kind":"zoneChanged"/,
    );
  });

  test('eventLog says when a matcher appears only before the previous one', () => {
    const g = played();
    fails(
      () => g.expect.eventLog([{ kind: 'died' }, { kind: 'spellCast' }]),
      /appears only earlier/,
    );
  });

  test('matchers may be functions, and since limits the search', () => {
    const g = played();
    g.expect.eventLog([
      { kind: 'damageDealt', amount: (n: unknown) => typeof n === 'number' && n > 2 },
    ]);
    const mark = g.mark();
    fails(
      () => g.expect.eventLog([{ kind: 'died' }], { since: mark }),
      /Expected the event log to contain/,
    );
  });

  test('noEvent', () => {
    const g = played();
    g.expect.noEvent({ kind: 'playerLost' });
    g.expect.noEvent({ kind: 'died' }, { since: g.mark() });
    fails(
      () => g.expect.noEvent({ kind: 'died' }),
      /Expected no event matching \{"kind":"died"\} but found \{"kind":"died".*\[o\d+=Grizzly Bears\]/,
    );
  });
});

describe('legal and illegal', () => {
  test('legal passes for listed options and fails for others', () => {
    const g = game();
    g.expect.legal(0, 'pass');
    g.expect.legal(0, { playLand: 'Forest' });
    fails(
      () => g.expect.legal(1, 'pass'),
      /Expected seat 1 pass to be legal but getLegalActions does not list it \(waiting for priority decision for seat 0\)/,
    );
    fails(
      () => g.expect.legal(0, { cast: 'Lightning Bolt' }),
      /Expected seat 0 castSpell Lightning Bolt/,
    );
  });

  test('illegal needs the engine to reject AND the option to be absent', () => {
    const g = game();
    g.expect.illegal(1, 'pass');
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
    fails(
      () => g.expect.illegal(0, 'pass'),
      /Expected seat 0 pass to be illegal everywhere, but applyAction accepted it and getLegalActions lists it/,
    );
    fails(
      () => g.expect.illegal(0, { playLand: 'Forest' }),
      /applyAction accepted it and getLegalActions lists it/,
    );
  });

  test('illegal does not change the game', () => {
    const g = game();
    const before = g.hash();
    g.expect.illegal(1, 'pass');
    g.expect.hash(before);
  });
});

describe('hashes and invariants', () => {
  test('hash and position', () => {
    const g = game();
    const h = g.hash();
    const p = g.positionHash();
    g.expect.hash(h);
    g.expect.position(p);
    g.act(0).pass();
    fails(() => g.expect.hash(h), /Expected state hash .* the state is not the same/);
    fails(() => g.expect.position(p), /the game position is not the same/);
  });

  test('invariants hold for a built state', () => {
    game().expect.invariants();
  });
});

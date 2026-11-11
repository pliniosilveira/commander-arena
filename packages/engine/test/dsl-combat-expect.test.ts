// Combat assertions of the scenario DSL: they pass for what is true, and fail with a message that
// says what was expected and what the game holds (CR 506-511, 903.10a).
import { describe, expect, test } from 'vitest';
import { ScenarioError, scenario } from './dsl-helpers';

function blockedGame() {
  const g = scenario()
    .seat(0)
    .battlefield('SYNTHETIC Vanilla 3/3', 'Grizzly Bears')
    .seat(1)
    .battlefield('SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla Planeswalker')
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([
    { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
    { attacker: 'Grizzly Bears', target: { player: 1 } },
  ]);
  g.advanceTo('declareBlockers');
  return g;
}

describe('expect.combat', () => {
  test('null means no combat in progress, and fails while there is one', () => {
    const idle = scenario().seat(0).battlefield('Grizzly Bears').build();
    idle.expect.combat(null);
    const g = blockedGame();
    expect(() => g.expect.combat(null)).toThrow(/Expected no combat in progress/);
    const none = scenario().seat(0).build();
    expect(() => none.expect.combat({ attackers: [] })).toThrow(
      /Expected a combat in progress, but there is none/,
    );
  });

  test('attackers, targets, blocked and unblocked, and blocks compare exactly', () => {
    const g = blockedGame();
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'Grizzly Bears' }]);
    g.expect.combat({
      attackers: ['Grizzly Bears', 'SYNTHETIC Vanilla 3/3'],
      targets: [
        { attacker: 'Grizzly Bears', target: { player: 1 } },
        { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
      ],
      blocked: ['Grizzly Bears'],
      unblocked: ['SYNTHETIC Vanilla 3/3'],
      blocks: [{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'Grizzly Bears' }],
    });
  });

  test('a missing or extra attacker fails and lists both sides', () => {
    const g = blockedGame();
    expect(() => g.expect.combat({ attackers: ['Grizzly Bears'] })).toThrow(
      /Expected the attackers to be \[Grizzly Bears \(o1, seat 0's battlefield\)\] but it is \[SYNTHETIC Vanilla 3\/3 \(o0.*Grizzly Bears \(o1/s,
    );
  });

  test('a wrong target fails with both targets named', () => {
    const g = blockedGame();
    expect(() =>
      g.expect.combat({ targets: [{ attacker: 'Grizzly Bears', target: { player: 0 } }] }),
    ).toThrow(/to attack player 0 but it attacks player 1/);
    expect(() =>
      g.expect.combat({
        targets: [{ attacker: 'SYNTHETIC Vanilla 3/3', target: { player: 1 } }],
      }),
    ).toThrow(/to attack player 1 but it attacks SYNTHETIC Vanilla Planeswalker/);
  });

  test('blocked, unblocked and blocks fail when they differ', () => {
    const g = blockedGame();
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'Grizzly Bears' }]);
    expect(() => g.expect.combat({ blocked: ['SYNTHETIC Vanilla 3/3'] })).toThrow(
      /the blocked attackers/,
    );
    expect(() => g.expect.combat({ unblocked: [] })).toThrow(/the unblocked attackers/);
    expect(() =>
      g.expect.combat({
        blocks: [{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Vanilla 3/3' }],
      }),
    ).toThrow(/Expected the blocks \[.*\] but they are \[/);
  });

  test('a creature that is not attacking is reported by the target check', () => {
    const g = blockedGame();
    g.act(1).noBlocks();
    g.expect.combat({ blocked: [], unblocked: ['Grizzly Bears', 'SYNTHETIC Vanilla 3/3'] });
    const h = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', 'SYNTHETIC Vanilla 3/3')
      .at('precombatMain', { active: 0 })
      .build();
    h.advanceTo('declareAttackers');
    h.act(0).attack('Grizzly Bears');
    expect(() =>
      h.expect.combat({ targets: [{ attacker: 'SYNTHETIC Vanilla 3/3', target: { player: 1 } }] }),
    ).toThrow(/to be attacking, but it is not/);
  });
});

describe('expect.canAttack and expect.canBlock', () => {
  test('canAttack checks the candidate list and the engine acceptance together', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .battlefield('Wall of Stone')
      .battlefield('Serra Angel', { tapped: true })
      .battlefield('Raging Goblin', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack('Grizzly Bears');
    g.expect.canAttack('Raging Goblin', true);
    g.expect.canAttack('Wall of Stone', false);
    g.expect.canAttack('Serra Angel', false);
    expect(() => g.expect.canAttack('Wall of Stone')).toThrow(
      /not to be able|to be able to attack/,
    );
    expect(() => g.expect.canAttack('Grizzly Bears', false)).toThrow(
      /not to be able to attack, but it is a candidate and the engine accepts/,
    );
  });

  test('canAttack when nobody can attack: the engine asked nothing, so no creature is a candidate', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.pending('priority', 0);
    g.expect.canAttack('Grizzly Bears', false);
    expect(() => g.expect.canAttack('Grizzly Bears')).toThrow(/nobody can attack/);
  });

  test('canAttack needs the declareAttackers decision', () => {
    const g = scenario().seat(0).battlefield('Grizzly Bears').build();
    expect(() => g.expect.canAttack('Grizzly Bears')).toThrow(
      /canAttack needs the declareAttackers decision, but the engine is waiting for priority decision/,
    );
  });

  test('canBlock checks the listed options and a lone block', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears', 'Giant Spider', 'Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Serra Angel', { name: 'Grizzly Bears', seat: 0 }]);
    g.advanceTo('declareBlockers');
    g.expect.canBlock('Giant Spider', 'Serra Angel');
    g.expect.canBlock({ name: 'Grizzly Bears', seat: 1 }, 'Serra Angel', false);
    g.expect.canBlock('Wall of Stone', 'Serra Angel', false);
    g.expect.canBlock('Wall of Stone', { name: 'Grizzly Bears', seat: 0 }, true);
    expect(() => g.expect.canBlock('Giant Spider', 'Serra Angel', false)).toThrow(
      /not to be able to block Serra Angel, but it is listed as able to and the engine accepts the block/,
    );
  });

  test('canBlock needs the declareBlockers decision', () => {
    const g = scenario().seat(0).battlefield('Grizzly Bears').build();
    expect(() => g.expect.canBlock('Grizzly Bears', 'Grizzly Bears')).toThrow(
      /canBlock needs the declareBlockers decision/,
    );
  });

  test('a creature that needs two blockers (menace) is listed for each blocker; the lone block is not tested', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Menace 2/2')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Menace 2/2');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('Grizzly Bears', 'SYNTHETIC Menace 2/2');
    // ...but the engine refuses the block by that creature alone (CR 702.111b).
    g.expect.illegal(1, {
      declareBlockers: [{ blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Menace 2/2' }],
    });
  });
});

describe('legal and illegal for the combat specs', () => {
  function sickGame() {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .battlefield('Serra Angel', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    return g;
  }

  test('legal means the engine accepts it, without playing it', () => {
    const g = sickGame();
    const before = g.hash();
    g.expect.legal(0, { declareAttackers: [{ attacker: 'Grizzly Bears' }] });
    g.expect.legal(0, { declareAttackers: [] });
    g.expect.hash(before);
    expect(() => g.expect.legal(0, { declareAttackers: [{ attacker: 'Serra Angel' }] })).toThrow(
      /to be legal but getLegalActions does not list it/,
    );
  });

  test('illegal checks the rejection, the legal list and that nothing changed', () => {
    const g = sickGame();
    g.expect.illegal(0, { declareAttackers: [{ attacker: 'Serra Angel' }] });
    expect(() =>
      g.expect.illegal(0, { declareAttackers: [{ attacker: 'Grizzly Bears' }] }),
    ).toThrow(/to be illegal everywhere, but applyAction accepted it/);
  });

  test('illegal blocks and illegal damage assignments', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.expect.illegal(1, {
      declareBlockers: [
        { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
        { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
      ],
    });
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
      { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    g.passAll();
    g.expect.illegal(0, {
      assignDamage: [{ from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[0]', amount: 2 }],
    });
    g.expect.legal(0, {
      assignDamage: [{ from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[0]', amount: 3 }],
    });
  });
});

describe('expect.commanderDamage', () => {
  test('passes for the damage taken, zero by default, and fails with both numbers', () => {
    const g = scenario()
      .seat(0)
      .commander('Yargle, Glutton of Urborg')
      .seat(1)
      .commanderDamageTaken('Yargle, Glutton of Urborg', 9)
      .build();
    g.expect.commanderDamage(1, 'Yargle, Glutton of Urborg', 9);
    g.expect.commanderDamage(0, 'Yargle, Glutton of Urborg', 0);
    expect(() => g.expect.commanderDamage(1, 'Yargle, Glutton of Urborg', 8)).toThrow(
      /Expected seat 1 to have taken 8 commander damage from Yargle, Glutton of Urborg but it has taken 9/,
    );
  });

  test('needs exactly one commander card of that name', () => {
    const g = scenario().seat(0).battlefield('Grizzly Bears').build();
    expect(() => g.expect.commanderDamage(1, 'Grizzly Bears', 0)).toThrow(ScenarioError);
    expect(() => g.expect.commanderDamage(1, 'Grizzly Bears', 0)).toThrow(
      /exactly one commander card named "Grizzly Bears" but found 0/,
    );
  });

  test('counts combat damage dealt through the engine', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Yargle, Glutton of Urborg', { commander: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Yargle, Glutton of Urborg');
    g.advanceTo('postcombatMain');
    g.expect.commanderDamage(1, 'Yargle, Glutton of Urborg', 9);
    g.expect.life(1, 31);
  });
});

describe('expect.counters for loyalty and defense', () => {
  test('combat damage removes loyalty and defense counters and the assertion sees them', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', 'Grizzly Bears')
      // A battle is controlled by whoever played it and protected by an opponent (CR 310.9).
      .battlefield('SYNTHETIC Vanilla Battle')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
      { attacker: 'Grizzly Bears', target: 'SYNTHETIC Vanilla Battle' },
    ]);
    g.advanceTo('endOfCombat');
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 1 });
    g.expect.counters('SYNTHETIC Vanilla Battle', { defense: 3 });
    expect(() => g.expect.counters('SYNTHETIC Vanilla Battle', { defense: 5 })).toThrow(
      /to have counters .*defense.*5.* but it has .*3/,
    );
  });
});

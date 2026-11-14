// The combat verbs of the scenario DSL: every verb is an applyAction call, references resolve against
// the acting seat's side, and a rejected verb fails with the engine's own error (CR 508.1, 509.1, 510.1).
import { describe, expect, test } from 'vitest';
import { ScenarioError, scenario } from './dsl-helpers';

describe('declareAttackers and attack (CR 508.1)', () => {
  function game() {
    return scenario()
      .seat(0)
      .battlefield('Grizzly Bears', 'SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker', 'Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
  }

  test('two passes from the beginning of combat bring the declareAttackers decision (CR 508.1)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .at('beginningOfCombat', { active: 0 })
      .build();
    g.pass().pass();
    g.expect.step('declareAttackers', { active: 0 });
    g.expect.pending('declareAttackers', 0);
  });

  test('attack(ref) attacks the opponent player by default, tapping the attacker', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.expect.combat({
      attackers: ['Grizzly Bears'],
      targets: [{ attacker: 'Grizzly Bears', target: { player: 1 } }],
    });
    g.expect.tapped('Grizzly Bears[0]');
    g.expect.pending('priority', 0);
    g.expect.step('declareAttackers');
  });

  test('attack takes several creatures, and one target for all of them', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears', 'SYNTHETIC Vanilla 3/3'], 'SYNTHETIC Vanilla Planeswalker');
    g.expect.combat({
      attackers: ['Grizzly Bears', 'SYNTHETIC Vanilla 3/3'],
      targets: [
        { attacker: 'Grizzly Bears', target: 'SYNTHETIC Vanilla Planeswalker' },
        { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
      ],
    });
  });

  test('declareAttackers splits attackers between the player and a planeswalker (CR 508.1b)', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: 'Grizzly Bears', target: { player: 1 } },
      { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
    ]);
    g.expect.combat({
      targets: [
        { attacker: 'Grizzly Bears', target: { player: 1 } },
        { attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' },
      ],
    });
  });

  test('noAttackers declares nothing: no combat, the step still gives priority (CR 508.8)', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).noAttackers();
    g.expect.combat(null);
    g.expect.pending('priority', 0);
  });

  test('a rejected attack throws the engine error with names, and the try form returns it', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers');
    // Nobody can attack, so the engine gave priority instead of asking: the verb says so.
    expect(() => g.act(0).attack('Grizzly Bears')).toThrow(/rejected seat 0 declareAttackers/);
    const r = g.act(0).try.declareAttackers([{ attacker: 'Grizzly Bears' }]);
    expect(r.ok).toBe(false);
  });

  test('a rejected declaration names the creature and the engine message, and changes nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', 'Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    const before = g.hash();
    expect(() => g.act(0).attack('Wall of Stone')).toThrow(
      /rejected seat 0 declareAttackers \[Wall of Stone o\d+ -> player 1\]: That creature cannot attack/,
    );
    const r = g.act(0).try.declareAttackers([{ attacker: 'Wall of Stone' }]);
    expect(r).toEqual({ ok: false, error: 'That creature cannot attack' });
    g.expect.hash(before);
  });

  test('a card that is not on the battlefield or not yours is not a valid attacker reference', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    // Seat 1's Grizzly Bears is not resolvable as seat 0's attacker, only seat 0's is.
    g.act(0).attack('Grizzly Bears');
    g.expect.combat({ attackers: [{ name: 'Grizzly Bears', seat: 0 }] });
    const h = game();
    h.advanceTo('declareAttackers');
    expect(() => h.act(0).attack('Lightning Bolt')).toThrow(ScenarioError);
  });
});

describe('declareBlockers and noBlocks (CR 509.1)', () => {
  function game() {
    return scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears', 'SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();
  }

  test('blocker and attacker resolve on their own sides, so equal names are fine', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: 'Grizzly Bears' }]);
    g.expect.combat({
      blocks: [{ blocker: 'Grizzly Bears', attacker: 'Grizzly Bears' }],
      blocked: ['Grizzly Bears'],
      unblocked: [],
    });
    g.expect.pending('priority', 0);
  });

  test('noBlocks leaves the attacker unblocked', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.expect.combat({ unblocked: ['Grizzly Bears'], blocked: [], blocks: [] });
  });

  test('a block by the wrong seat is rejected by the engine, not by the DSL', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    const r = g.act(0).try.declareBlockers([]);
    expect(r).toEqual({ ok: false, error: 'It is not your decision' });
  });

  test('the same creature blocking twice is rejected (CR 509.1a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', 'SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['Grizzly Bears', 'SYNTHETIC Vanilla 3/3']);
    g.advanceTo('declareBlockers');
    const r = g.act(1).try.declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'Grizzly Bears' },
      { blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    expect(r).toEqual({ ok: false, error: 'A creature can block only one attacker' });
  });
});

describe('assignDamage and defaultDamage (CR 510.1)', () => {
  function doubleBlock() {
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
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
      { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    g.passAll();
    return g;
  }

  test('the damage decision is the active seat', () => {
    const g = doubleBlock();
    g.expect.pending('assignDamage', 0);
  });

  test('assignDamage divides damage between the blockers, then priority in the damage step', () => {
    const g = doubleBlock();
    g.act(0).assignDamage([
      { from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[0]', amount: 2 },
      { from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[1]', amount: 1 },
    ]);
    g.expect.step('combatDamage');
    g.expect.pending('priority', 0);
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { count: 1 });
    g.expect.damage({ name: 'SYNTHETIC Vanilla 2/2', zone: 'battlefield' }, 1);
  });

  test('defaultDamage uses the engine default: lethal to each blocker in order', () => {
    const g = doubleBlock();
    g.act(0).defaultDamage();
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'battlefield', { count: 1 });
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { count: 1 });
    g.expect.damage({ name: 'SYNTHETIC Vanilla 2/2', zone: 'battlefield' }, 1);
  });

  test('a player recipient is written { player: seat }; an illegal division is rejected', () => {
    const g = doubleBlock();
    const before = g.hash();
    const r = g
      .act(0)
      .try.assignDamage([{ from: 'SYNTHETIC Vanilla 3/3', to: { player: 1 }, amount: 3 }]);
    expect(r).toEqual({
      ok: false,
      error: 'Damage can only go to the blockers, or with trample to what the creature attacks',
    });
    g.expect.hash(before);
  });

  test('defaultDamage with no assignDamage decision pending says what the engine waits for', () => {
    const g = doubleBlock();
    g.act(0).defaultDamage();
    expect(() => g.act(0).defaultDamage()).toThrow(
      /Expected an assignDamage decision but the engine is waiting for priority decision/,
    );
  });

  test('a negative or fractional amount is refused before reaching the engine', () => {
    const g = doubleBlock();
    expect(() =>
      g
        .act(0)
        .assignDamage([
          { from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[0]', amount: -1 },
        ]),
    ).toThrow(/not a whole number/);
  });
});

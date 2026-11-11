// g.playCombat plays a whole combat from the verbs (attack, block, divide damage, pass through the
// combat steps; CR 506-511) and refuses plans the engine never asks about.
import { describe, expect, test } from 'vitest';
import { scenario } from './dsl-helpers';

function pair(
  attacker: string,
  blockers: string[] = [],
  extra: (s: ReturnType<typeof scenario>) => void = () => {},
) {
  const b = scenario().seat(0).battlefield(attacker).library('Island', { count: 4 }).seat(1);
  for (const name of blockers) b.battlefield(name);
  extra(b);
  return b.library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
}

describe('playCombat', () => {
  test('an unblocked attack from the main phase: damage is dealt and we stop at the end of combat', () => {
    const g = pair('SYNTHETIC Vanilla 3/3');
    g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] });
    g.expect.step('endOfCombat', { active: 0 });
    g.expect.pending('priority');
    g.expect.life(1, 37);
    g.expect.combat({ attackers: ['SYNTHETIC Vanilla 3/3'], unblocked: ['SYNTHETIC Vanilla 3/3'] });
  });

  test('a block, with the default division', () => {
    const g = pair('SYNTHETIC Vanilla 3/3', ['SYNTHETIC Vanilla 2/2']);
    g.playCombat({
      attack: ['SYNTHETIC Vanilla 3/3'],
      block: [{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Vanilla 3/3' }],
    });
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { seat: 1 });
    g.expect.damage('SYNTHETIC Vanilla 3/3', 2);
    g.expect.life(1, 40);
  });

  test('damage given as an array answers the regular step', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: ['SYNTHETIC Vanilla 3/3'],
      block: [
        { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
        { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC Vanilla 3/3' },
      ],
      damage: [{ from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2[1]', amount: 3 }],
    });
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { count: 1 });
    g.expect.damage({ name: 'SYNTHETIC Vanilla 2/2', zone: 'battlefield' }, 0);
  });

  test('a regular-step division is given with the regular key, with trample over a blocker', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Trampler 4/4')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: ['SYNTHETIC Trampler 4/4'],
      block: [{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Trampler 4/4' }],
      damage: {
        regular: [
          { from: 'SYNTHETIC Trampler 4/4', to: 'SYNTHETIC Vanilla 2/2', amount: 2 },
          { from: 'SYNTHETIC Trampler 4/4', to: { player: 1 }, amount: 2 },
        ],
      },
    });
    g.expect.life(1, 38);
  });

  test('the first-strike step is answered with the firstStrike key; the regular step uses the default', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC First Striker 2/2')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: ['SYNTHETIC First Striker 2/2'],
      block: [
        { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC First Striker 2/2' },
        { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC First Striker 2/2' },
      ],
      damage: {
        firstStrike: [
          { from: 'SYNTHETIC First Striker 2/2', to: 'SYNTHETIC Vanilla 2/2[0]', amount: 2 },
        ],
      },
    });
    // The first striker killed one blocker first; the other killed it in the regular step.
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { count: 1 });
    g.expect.zone('SYNTHETIC First Striker 2/2', 'graveyard', { count: 1 });
  });

  test('two damage steps are walked through for a double striker, each with the default division', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Fencing Ace')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: ['Fencing Ace'],
      block: [{ blocker: 'SYNTHETIC Vanilla 5/5', attacker: 'Fencing Ace' }],
      until: 'combatDamage',
    });
    g.expect.step('combatDamage');
    // One damage in the first-strike step and one in the regular step, where the Ace also died.
    g.expect.damage('SYNTHETIC Vanilla 5/5', 2);
    g.expect.zone('Fencing Ace', 'graveyard', { seat: 0 });
  });

  test('an attack on a planeswalker names its target in the plan', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: 'SYNTHETIC Vanilla 3/3', target: 'SYNTHETIC Vanilla Planeswalker' }],
    });
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 1 });
    g.expect.life(1, 40);
  });

  test('until: postcombatMain goes on and clears the combat (CR 511.3)', () => {
    const g = pair('SYNTHETIC Vanilla 3/3');
    g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'], until: 'postcombatMain' });
    g.expect.step('postcombatMain');
    g.expect.combat(null);
  });

  test('it can be started from the beginning of combat or from the decision itself', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .at('beginningOfCombat', { active: 0 })
      .build();
    g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] });
    g.expect.life(1, 37);
    const h = pair('SYNTHETIC Vanilla 3/3');
    h.advanceTo('declareAttackers');
    h.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] });
    h.expect.life(1, 37);
  });

  test('the game ending in combat ends the plan', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .life(3)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] });
    g.expect.gameOver({ win: 0 });
  });
});

describe('playCombat refuses plans that do not match the game', () => {
  test('blocks when the engine never asks for them (no creature can block)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('Grizzly Bears', { tapped: true })
      .at('precombatMain', { active: 0 })
      .build();
    expect(() =>
      g.playCombat({
        attack: ['SYNTHETIC Vanilla 3/3'],
        block: [{ blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Vanilla 3/3' }],
      }),
    ).toThrow(/blocks were given but no declareBlockers decision came up/);
  });

  test('damage for a step the engine never asks about', () => {
    const g = pair('SYNTHETIC Vanilla 3/3', ['SYNTHETIC Vanilla 2/2']);
    expect(() =>
      g.playCombat({
        attack: ['SYNTHETIC Vanilla 3/3'],
        block: [{ blocker: 'SYNTHETIC Vanilla 2/2', attacker: 'SYNTHETIC Vanilla 3/3' }],
        damage: [{ from: 'SYNTHETIC Vanilla 3/3', to: 'SYNTHETIC Vanilla 2/2', amount: 3 }],
      }),
    ).toThrow(/damage for the regular step was given but the engine never asked for it/);
  });

  test('nobody can attack', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', { fresh: true })
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] })).toThrow(
      /no declareAttackers decision came up .*nobody can attack/,
    );
  });

  test('starting from a step after the declare attackers step', () => {
    const g = scenario().seat(0).battlefield('SYNTHETIC Vanilla 3/3').build();
    g.advanceTo('postcombatMain');
    expect(() => g.playCombat({ attack: ['SYNTHETIC Vanilla 3/3'] })).toThrow(
      /playCombat starts at the declareAttackers decision/,
    );
  });

  test('an illegal attack surfaces as the engine rejection', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', 'Wall of Stone')
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.playCombat({ attack: ['Wall of Stone'] })).toThrow(
      /That creature cannot attack/,
    );
  });

  test('stopping at a step the combat skipped says so', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .at('precombatMain', { active: 0 })
      .build();
    expect(() => g.playCombat({ attack: [], until: 'combatDamage' })).toThrow(
      /went past combatDamage/,
    );
  });
});

// "For each 1 damage prevented this way, create a token" (CR 615.5, 615.6, 111.2): a prevention shield with an
// additional effect that happens as the damage is prevented. Cards are SYNTHETIC (src/cards/fixtures/synthetic-prevention.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const INK_FOG = 'SYNTHETIC Ink Fog';
const INK_SHIELD = 'SYNTHETIC Ink Shield Three';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const BEARS = 'Grizzly Bears';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

const inklings = (g: G, seat: 0 | 1) =>
  g
    .view(0)
    .battlefield.filter((o) => o.name === 'SYNTHETIC Inkling' && o.isToken && o.owner === seat);

/** Seat 0 attacks with `attackers`; seat 1 (the defender) holds priority in the declare blockers step. */
function attackWindow(g: G, attackers: readonly string[]): void {
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers([]);
  g.act(0).pass();
}

describe('Ink Fog: a shield that makes a token for each 1 damage prevented (CR 615.5)', () => {
  test('one token for each point of combat damage prevented, under the shield controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .life(10)
      .battlefield('Plains', 'Plains')
      .hand(INK_FOG)
      .at('precombatMain', { active: 0 })
      .build();
    attackWindow(g, [V33, V22]);
    g.act(1).cast(`${INK_FOG}[0]`, { pay: true });
    g.passAll();
    expect(inklings(g, 1)).toHaveLength(0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 10);
    expect(inklings(g, 1)).toHaveLength(5);
    expect(inklings(g, 0)).toHaveLength(0);
    const first = inklings(g, 1)[0];
    expect(first?.tokenDefinition).toMatchObject({ power: 2, toughness: 1, colors: ['W', 'B'] });
  });

  test('damage to a creature is not damage to you: no tokens for it (CR 615.1)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(INK_FOG)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: V33 }]);
    g.act(0).pass();
    g.act(1).cast(`${INK_FOG}[0]`, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    expect(inklings(g, 1)).toHaveLength(0);
    g.expect.life(1, 40);
  });

  test('a shield for the next 3 makes 3 tokens and the rest of the damage is dealt (CR 615.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .life(10)
      .battlefield('Plains', 'Plains')
      .hand(INK_SHIELD)
      .at('precombatMain', { active: 0 })
      .build();
    attackWindow(g, [V33, V22]);
    g.act(1).cast(`${INK_SHIELD}[0]`, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    expect(inklings(g, 1)).toHaveLength(3);
    g.expect.life(1, 8);
  });

  test('nothing is prevented, nothing is made: no combat, no tokens', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .battlefield('Plains', 'Plains')
      .hand(INK_FOG)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(`${INK_FOG}[0]`, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    expect(inklings(g, 1)).toHaveLength(0);
  });
});

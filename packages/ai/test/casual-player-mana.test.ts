// CasualAgent and the mana ability a player was given by an effect (Channel; SYNTHETIC cards): the agent never activates it by hand, and it pays life only through
// the payment planner, which uses the ability only for mana the permanents cannot make. Pins: CR 605.1a, 118.3.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answerFor } from './casual-helpers';

const CHANNEL = 'SYNTHETIC Life Channel'; // {G}{G}: pay 1 life, add {C}, until end of turn
const THREE = 'SYNTHETIC Three Sorcery'; // {3}: gain 3 life
const LIB = Array.from({ length: 12 }, () => 'Plains');

function board(forests: number, hand: string[] = []): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIB)
    .hand(CHANNEL, ...hand)
    .battlefield(...Array.from({ length: forests }, () => 'Forest'))
    .seat(1)
    .library(...LIB)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.act(0).cast(CHANNEL, { pay: true });
  g.passAll();
  return g;
}

describe('the ability of a player is never used by hand', () => {
  test('it is a legal action, and the agent passes instead of paying life for mana it does not need', async () => {
    const g = board(2);
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'activateAbility' && a.abilityIndex < 0),
    ).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      const answer = await answerFor(g);
      expect(answer.kind).not.toBe('activateAbility');
    }
    g.expect.life(0, 40);
  });

  test('a spell the permanents pay for costs no life', async () => {
    const g = board(5, [THREE]);
    const answer = await answerFor(g);
    expect(answer).toMatchObject({ kind: 'castSpell' });
    g.act(0).cast(THREE, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });
});

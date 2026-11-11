// CasualAgent and the expensive singles of the Korvold deck (D-187): the question of "you may sacrifice one or more Treasures" (declined, as any costly "you may"),
// the Treasures it gives up when the sacrifice is its own to make, the targets of "up to that many" (a creature of its own), the target of an Adventure that
// exiles the top of an opponent's library face down (the opponent, the only one), and the cards of the pile it may cast (an ordinary option for it). Every
// answer is one the engine lists. Cards are SYNTHETIC (the fixtures of the engine).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, answerFor, expectLegal } from './casual-helpers';

const RAIDER = 'SYNTHETIC Treasure Raider';
const ADVENTURE = 'SYNTHETIC Feast Dragon // Taste of Riches';
const MAKER = 'SYNTHETIC Make Treasures';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('"Whenever you attack, you may sacrifice one or more Treasures. When you do, up to that many target creatures gain double strike."', () => {
  const asked = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .battlefield(RAIDER, BEARS, 'Mountain', 'Mountain')
      .hand(MAKER)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(MAKER, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    return g;
  };

  test('the question is declined: a sacrifice costs, and nothing the agent can weigh is worth it', async () => {
    const g = asked();
    g.expect.pending('confirmOptional', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'declineOptional' });
    expectLegal(g, a);
  });

  test('when the sacrifice is its to make, the agent gives up the least valuable permanents: Treasures, as many as it must', async () => {
    const g = asked();
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    const a = await answer(g);
    expect(a).toMatchObject({ kind: 'choosePermanents' });
    expect(a.kind === 'choosePermanents' ? a.objects : []).toHaveLength(1);
    const chosen = a.kind === 'choosePermanents' ? a.objects[0] : undefined;
    expect(
      chosen === undefined ? undefined : g.state.objects[chosen]?.token?.characteristics.name,
    ).toBe('Treasure');
    expectLegal(g, a);
  });

  test('the targets of the reflexive ability (at most as many as Treasures were sacrificed) are answered with a legal choice', async () => {
    const g = asked();
    g.act(0).accept();
    g.act(0).choosePermanents('Treasure[0]', 'Treasure[1]');
    g.expect.pending('targets', 0);
    const a = await answer(g);
    expect(a.kind).toBe('chooseTargets');
    expectLegal(g, a);
  });
});

describe('"Exile the top two cards of target opponent\'s library face down. You may look at and play those cards for as long as they remain exiled."', () => {
  const cast = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .hand(ADVENTURE)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain', 'Mountain', 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(BEARS, 'Mountain', ...LIBRARY)
      .at('precombatMain')
      .build();
    return g;
  };

  test('the agent casts the Adventure, whose target is the opponent, and what it is offered afterwards is legal', async () => {
    const g = cast();
    const a = await answerFor(g);
    expectLegal(g, a);
    g.act(0).cast(ADVENTURE, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    // the cards of the other player's pile are options like the cards of a hand
    const options = g
      .legalActions(0)
      .filter((o) => o.kind === 'castSpell' || o.kind === 'playLand');
    expect(options.length).toBeGreaterThan(0);
    const b = await answerFor(g);
    expectLegal(g, b);
  });

  test('the opponent, who may not look, is offered nothing of the pile', () => {
    const g = cast();
    g.act(0).cast(ADVENTURE, { face: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.pass();
    const theirs = g
      .legalActions(1)
      .filter(
        (o) =>
          (o.kind === 'castSpell' || o.kind === 'playLand') &&
          g.state.objects[o.object]?.zone === 'exile',
      );
    expect(theirs).toEqual([]);
  });
});

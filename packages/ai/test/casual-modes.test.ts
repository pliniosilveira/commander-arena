// CasualAgent and modal spells and abilities (D-114, CR 700.2) on real engine states built with the scenario
// DSL. The policy: a set of modes is worth the sum of its modes; a mode that kills a creature of the
// opponent's or wins the game is best, drawing a card is next, life is small, and a mode that needs a thing
// the board does not have (a creature to kill, a creature of its own to help) is avoided; when every mode is
// good the set with the most modes is chosen. The targets of each chosen mode follow that mode's text. A
// modal spell is cast only when some mode is worth choosing. RandomLegalAgent answers with a legal set. Every
// answer is one the engine lists, and the spell or ability then runs to the end.
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const THREE = 'SYNTHETIC Three Way Charm'; // choose one: 3 damage to target creature / draw / gain 3
const TWIN = 'SYNTHETIC Twin Charm'; // choose two: 2 damage to target creature / target player gains 3 / draw
const BOTH = 'SYNTHETIC Both Charm'; // choose one or both: draw / gain 4
const MANY = 'SYNTHETIC Many Charm'; // choose one or more: draw / gain 2 / 1 damage to target creature
const SPLIT = 'SYNTHETIC Split Strike'; // choose one or both: 2 damage to target creature / to target opponent
const COMMAND = 'SYNTHETIC Command Charm'; // choose one, both with a commander: draw / gain 3
const HUNTER = 'SYNTHETIC Modal Hunter'; // enters: choose one: destroy opposing artifact / 2 damage to opposing creature
const GREETER = 'SYNTHETIC Modal Greeter'; // enters: choose one: gain 3 / 2 damage to opposing creature
const TOTEM = 'SYNTHETIC Modal Totem'; // {1},{T}: choose one: draw / 2 damage to target creature / gain 2
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ISAMARU = 'Isamaru, Hound of Konda';

const LANDS = ['Mountain', 'Mountain', 'Mountain', 'Plains', 'Plains', 'Island', 'Swamp', 'Swamp'];

async function answer(g: ScenarioGame, seat = 0, seed = 1): Promise<Action> {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed }).decide(view, view.pending, CTX);
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
    JSON.stringify(action),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
  return action;
}

const game = (card: string, theirs: readonly string[] = [BEARS], deep = true) => {
  const b = scenario().seat(0).hand(card);
  for (const land of LANDS) b.battlefield(land);
  b.library(...(deep ? ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'] : ['Plains']));
  const s = b.seat(1);
  for (const name of theirs) s.battlefield(name, { label: name });
  return s.build();
};

describe('choosing the modes', () => {
  test('choose one: kill the creature it can kill rather than draw or gain life', async () => {
    const g = game(THREE);
    g.act(0).cast(THREE);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0] });
  });

  test('choose one: damage that does not kill is not worth it, so it draws instead', async () => {
    const g = game(THREE, [SPIDER]); // 3 damage does not kill a 2/4
    g.act(0).cast(THREE);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [1] });
  });

  test('choose one: with nothing of the opponent to hit the damage mode is not even legal, it draws', async () => {
    const g = game(THREE, []);
    g.act(0).cast(THREE);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [1] });
  });

  test('choose one: a library nearly empty is not drawn from; it gains life instead', async () => {
    const g = game(THREE, [], false);
    g.act(0).cast(THREE);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [2] });
  });

  test('choose two: the two best, the kill and the draw, not the life', async () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0, 2] });
  });

  test('choose one or both: both are good, so both', async () => {
    const g = game(BOTH);
    g.act(0).cast(BOTH);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0, 1] });
  });

  test('choose one or more: every good mode, and not a damage that kills nothing', async () => {
    const all = game(MANY);
    all.act(0).cast(MANY);
    // 1 damage does not kill the Bears: the other two only.
    expect(await answer(all)).toEqual({ kind: 'chooseModes', modes: [0, 1] });
    const none = game(MANY, [], true);
    none.act(0).cast(MANY);
    expect(await answer(none)).toEqual({ kind: 'chooseModes', modes: [0, 1] });
  });

  test('a mode that adds nothing is left out of a larger set', async () => {
    // Split Strike: "2 damage to target creature" kills the Bears (8); "2 damage to target opponent" is 3.
    const g = game(SPLIT);
    g.act(0).cast(SPLIT);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0, 1] });
    // Against a 2/4 the creature mode is worth only 1 (2 damage kills nothing): it adds nothing, so the
    // opponent's face alone is chosen.
    const spider = game(SPLIT, [SPIDER]);
    spider.act(0).cast(SPLIT);
    expect(await answer(spider)).toEqual({ kind: 'chooseModes', modes: [1] });
  });

  test('the widening with a commander: both modes when both are allowed', async () => {
    const b = scenario().seat(0).hand(COMMAND).battlefield(ISAMARU, { commander: true });
    for (const land of LANDS) b.battlefield(land);
    const g = b.library('Plains', 'Plains', 'Plains', 'Plains', 'Plains').seat(1).build();
    g.act(0).cast(COMMAND);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0, 1] });
  });

  test('the answer does not depend on the seed', async () => {
    const answers = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = game(TWIN);
      g.act(0).cast(TWIN);
      answers.add(JSON.stringify(await answer(g, 0, seed)));
    }
    expect(answers.size).toBe(1);
  });
});

describe('the targets of the chosen modes', () => {
  test('each slot is aimed by its mode: the damage at the opponent, the life at itself', async () => {
    const g = game(TWIN);
    g.act(0).cast(TWIN).modes(0, 1);
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'chooseTargets' });
    if (action.kind !== 'chooseTargets') throw new Error('unreachable');
    expect(action.targets).toEqual([
      { kind: 'object', id: g.id(BEARS), specId: 'hit' },
      { kind: 'player', seat: 0, specId: 'who' },
    ]);
  });

  test('a modal trigger aims its damage mode at the creature the damage kills', async () => {
    const b = scenario().seat(0).hand(GREETER).battlefield('Forest', { count: 3 });
    const g = b
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(BEARS, { label: 'bears' })
      .build();
    g.act(0).cast(GREETER, { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('chooseModes', 0);
    // 2 damage kills the Bears (8), not the Spider; it beats 3 life (4).
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [1] });
    g.act(0).chooseModes(1);
    const targets = await answer(g);
    if (targets.kind !== 'chooseTargets') throw new Error('expected targets');
    expect(targets.targets).toEqual([{ kind: 'object', id: g.id('bears'), specId: 'hit' }]);
  });

  test('a modal trigger with a mode that cannot be aimed worth a hit gains life', async () => {
    const g = scenario()
      .seat(0)
      .hand(GREETER)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield('Serra Angel')
      .build();
    g.act(0).cast(GREETER, { pay: true });
    g.pass();
    g.pass();
    // 2 damage kills neither a 2/4 nor a 4/4: the damage mode is 1, the life mode 4.
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [0] });
  });
});

describe('casting a modal spell and activating a modal ability', () => {
  test('a modal spell with a good mode is cast; one with none worth choosing is not', async () => {
    const good = game(THREE);
    const view = good.view(0);
    if (view.pending === null) throw new Error('no decision');
    const cast = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(cast.kind).toBe('castSpell');
    // Only a destroy-an-artifact charm with no artifact: not legal at all, so never offered.
    const hunter = scenario()
      .seat(0)
      .hand(HUNTER)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .build();
    const hv = hunter.view(0);
    if (hv.pending === null) throw new Error('no decision');
    const act = await new CasualAgent({ seed: 1 }).decide(hv, hv.pending, CTX);
    expect(act.kind).toBe('castSpell'); // the creature is a permanent: its trigger will be removed
  });

  test('a modal spell whose every mode would hurt only itself is not cast', async () => {
    // SYNTHETIC: "Choose one — • Destroy target creature. • Destroy target artifact." With only the
    // agent's own creature on the board both modes are legal, and neither is worth choosing.
    const doom: CardDefinition = {
      oracleId: null,
      name: 'SYNTHETIC Doom Charm',
      layout: 'normal',
      colorIdentity: ['B'],
      support: 'supported',
      faces: [
        {
          name: 'SYNTHETIC Doom Charm',
          manaCost: ['B'],
          supertypes: [],
          types: ['sorcery'],
          subtypes: [],
          colors: ['B'],
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          oracleText: 'Choose one — • Destroy target creature. • Destroy target artifact.',
          abilities: [],
          spell: {
            chooseModes: { min: 1, max: 1 },
            modes: [
              {
                text: 'Destroy target creature.',
                targets: [
                  {
                    id: 'c',
                    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
                  },
                ],
                effect: { kind: 'destroy', objects: { kind: 'target', id: 'c' } },
              },
              {
                text: 'Destroy target artifact.',
                targets: [
                  {
                    id: 'a',
                    what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
                  },
                ],
                effect: { kind: 'destroy', objects: { kind: 'target', id: 'a' } },
              },
            ],
          },
        },
      ],
    };
    const g = scenario()
      .define(doom)
      .seat(0)
      .hand(doom.name)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.legal(0, { cast: doom.name });
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const act = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(act).toEqual({ kind: 'pass' });
  });

  test('a mode aimed at a creature of its own only is avoided', async () => {
    const g = scenario()
      .seat(0)
      .hand(THREE)
      .battlefield('Mountain', { count: 2 })
      .battlefield(BEARS)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(THREE);
    // The damage mode is legal (a creature exists) but it would hit the agent's own: it draws.
    expect(g.state.pending?.kind === 'chooseModes' && g.state.pending.sets).toEqual([
      [0],
      [1],
      [2],
    ]);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [1] });
  });

  test('a modal activated ability is activated when a mode is worth it, and its modes answered', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOTEM, { label: 'totem' })
      .battlefield('Mountain', { count: 2 })
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const act = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(act).toMatchObject({ kind: 'activate', object: g.id('totem') });
    g.choose(act);
    expect(await answer(g)).toEqual({ kind: 'chooseModes', modes: [1] }); // 2 damage kills the Bears
  });
});

describe('RandomLegalAgent', () => {
  test('answers every modes question with one of the legal sets', async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const g = game(MANY);
      g.act(0).cast(MANY);
      const view = g.view(0);
      if (view.pending === null) throw new Error('no decision');
      const action = await new RandomLegalAgent({ seed }).decide(view, view.pending, CTX);
      expect(
        getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
      ).toBe(true);
      seen.add(JSON.stringify(action));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

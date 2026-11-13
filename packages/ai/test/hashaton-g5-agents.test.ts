// The agents and group 5 of the Hashaton deck (D-382 to D-385, provisional; SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g5.ts`): Eternalize is an `activate`
// option from the graveyard, "you may pay {2}{U}" after a creature card is discarded is the "may pay" question that already exists (a `confirmOptional` of purpose `mayPay`,
// asked only when the cost can be paid), and the enchantment that copies the tokens of the chosen type asks the creature type question that already exists. Each agent is
// checked on real engine states: every answer is one the engine lists and accepts; the casual agent eternalizes a creature card of its own in its main phase, pays for the copy
// when the mana is spare and declines when the payment would leave a card of its hand uncastable.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, answerFor, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 10 }, () => 'Plains');
const CHAMPION = 'SYNTHETIC Wit Champion'; // {2}{U} 2/1, Eternalize {1}{U}
const SCARAB = 'SYNTHETIC Scarab Fist';
const TIDY = 'SYNTHETIC Tidy Discard'; // {B}: discard a card
const ECHO = 'SYNTHETIC Solidarity Echo'; // {2}{W}: choose a creature type
const BEARS = 'Grizzly Bears';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The creature card is in the graveyard with two Islands to pay for Eternalize, in my first main phase. */
function atMain(graveyard: string): ScenarioGame {
  return scenario()
    .seat(0)
    .graveyard(graveyard)
    .battlefield('Island', 'Island')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
}

describe('Eternalize: an option from the graveyard', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atMain(CHAMPION);
    const a = await answerFor(g, make() as CasualAgent);
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atMain(CHAMPION);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the option is listed from the graveyard with the mana', () => {
    const g = atMain(CHAMPION);
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).toContain('activate');
  });

  test('the casual agent eternalizes a creature card of its own in its main phase', async () => {
    const g = atMain(CHAMPION);
    const a = await answerFor(g, new CasualAgent({ seed: 3 }));
    expect(a).toMatchObject({
      kind: 'activate',
      object: g.id({ name: CHAMPION, zone: 'graveyard' }),
    });
  });

  test('it does so before combat or after it, never in the opponent turn', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island', 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('postcombatMain')
      .build();
    const a = await answerFor(g, new CasualAgent({ seed: 3 }));
    expect(a).toMatchObject({ kind: 'activate' });
  });
});

/** Scarab Fist is out and I discard a creature card with the Tidy spell: the question "pay {2}{U}?" is asked. */
function atQuestion(hand: readonly string[], lands: readonly string[]): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand(TIDY, ...hand)
    .battlefield(SCARAB)
    .battlefield(...lands)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(TIDY, { pay: true });
  g.passAll();
  if (g.state.pending?.kind === 'discard' || g.state.pending?.kind === 'chooseCards') {
    g.act(0).chooseCards(BEARS);
    g.passAll();
  }
  g.expect.pending('confirmOptional', 0);
  return g;
}

describe('"you may pay {2}{U}" after a creature card is discarded', () => {
  const lands = ['Swamp', 'Island', 'Island', 'Island'];

  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atQuestion([BEARS, 'Island'], lands);
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atQuestion([BEARS, 'Island'], lands);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the question is the "may pay" of the engine, with the cost the card says', () => {
    const g = atQuestion([BEARS, 'Island'], lands);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('not asked');
    expect(d.purpose).toBe('mayPay');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2', 'U'] }]);
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).toContain('acceptOptional');
    expect(kinds).toContain('declineOptional');
  });

  test('the casual agent pays when the mana is spare', async () => {
    const g = atQuestion([BEARS, 'Island'], lands);
    // The hand holds a land and nothing that costs more than the lands left over would allow.
    expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({ kind: 'acceptOptional' });
  });

  test('the casual agent declines when the payment leaves a card of the hand uncastable', async () => {
    // Three untapped lands after Tidy; the {2}{U} payment would take all of them, and Grizzly Bears costs two of them.
    const g = atQuestion([BEARS, 'SYNTHETIC Vanilla 2/2'], ['Swamp', 'Island', 'Island', 'Island']);
    expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({ kind: 'declineOptional' });
  });

  test('nobody is asked when the cost cannot be paid (CR 118.3)', () => {
    const g = scenario()
      .seat(0)
      .hand(TIDY, BEARS)
      .battlefield(SCARAB)
      .battlefield('Swamp', 'Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(TIDY, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });
});

describe('the enchantment that copies tokens asks the creature type question of old', () => {
  const atType = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .hand(ECHO)
      .battlefield('Plains', 'Plains', 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(ECHO, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    return g;
  };

  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atType();
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atType();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });
});

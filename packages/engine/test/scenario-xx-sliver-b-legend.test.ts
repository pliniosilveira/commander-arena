// "The "legend rule" doesn't apply to Slivers you control." (Sliver Swarm deck, group B): `legendRuleDoesntApply`.
// Pins: CR 704.5j (the legend rule: a player who controls two or more legendary permanents with the same name chooses one and the rest go to the graveyard), CR 604.1 (a static ability
// of a permanent), CR 613.1f (a permanent that lost its abilities has none). Cards are SYNTHETIC (src/cards/fixtures/synthetic-sliver-b.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const WARDEN = 'SYNTHETIC Hive Warden';
const LEGEND = 'SYNTHETIC Legend Sliver';
const DRONE = 'SYNTHETIC Legend Drone';
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .library(...FILLER),
  )
    .seat(1)
    .library(...FILLER)
    .build();
}

/** A step of the game that checks state-based actions: casting nothing, the active player passes priority with an empty stack. */
const settle = (g: ScenarioGame): void => {
  g.act(0).pass();
};

describe('the card is valid', () => {
  test(WARDEN, () => {
    expect(validateCard(syntheticCard(WARDEN))).toEqual([]);
  });

  test('the filter is the permanents it names, as they are: no zone and no owner', () => {
    const card = syntheticCard(WARDEN);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (ability === undefined || ability.kind !== 'static') throw new Error('no static');
    const edit = (what: unknown) =>
      validateCard({
        ...card,
        faces: [{ ...face, abilities: [{ ...ability, static: { ...ability.static, what } }] }],
      } as never);
    expect(edit({ subtypes: ['Sliver'], controller: 'you' })).toEqual([]);
    expect(edit({ subtypes: ['Sliver'], zone: 'graveyard' }).length).toBeGreaterThan(0);
    expect(edit({ subtypes: ['Sliver'], controller: 'opponent' }).length).toBeGreaterThan(0);
    expect(edit(undefined).length).toBeGreaterThan(0);
  });
});

describe('"The legend rule doesn\'t apply to Slivers you control" (CR 704.5j)', () => {
  test('without it two legendary Slivers of one name ask the legend rule', () => {
    const g = game((b) => b.battlefield(LEGEND, { count: 2 }));
    settle(g);
    expect(choosePermanentDecision(g).purpose).toBe('legendRule');
  });

  test('with it both stay and nobody is asked', () => {
    const g = game((b) => b.battlefield(WARDEN).battlefield(LEGEND, { count: 2 }));
    settle(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.find({ name: LEGEND, zone: 'battlefield' })).toHaveLength(2);
    g.expect.invariants();
  });

  test('two copies of the permanent itself stay too: it is a Sliver you control', () => {
    const g = game((b) => b.battlefield(WARDEN, { count: 2 }));
    settle(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.find({ name: WARDEN, zone: 'battlefield' })).toHaveLength(2);
  });

  test('a legendary permanent that is not a Sliver is still covered by the rule', () => {
    const g = game((b) => b.battlefield(WARDEN).battlefield(DRONE, { count: 2 }));
    settle(g);
    expect(choosePermanentDecision(g).purpose).toBe('legendRule');
  });

  test('the Slivers of another player are still covered: "you control"', () => {
    const g = scenario()
      .seat(0)
      .library(...FILLER)
      .battlefield(WARDEN)
      .seat(1)
      .library(...FILLER)
      .battlefield(LEGEND, { count: 2 })
      .build();
    settle(g);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('legendRule');
    expect(d.seat).toBe(1);
  });
});

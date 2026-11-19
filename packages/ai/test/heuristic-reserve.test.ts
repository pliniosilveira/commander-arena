// HeuristicAgent holds mana for a protection spell: with a commander (or another permanent worth saving)
// on the battlefield and a protection instant in hand, the main phase leaves the mana the instant needs
// open when that costs no play, and the payment taps the other lands, by hand, so the right land stays
// untapped (the automatic payment taps any). Real engine states from the scenario DSL.
import type { CardDefinition, PayManaDecision } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { payHolding } from '../src/heuristic-protect';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, creature } from './heuristic-helpers';
import { SAFE } from './protect-card';

const BOSS = creature('SYNTHETIC Boss', 3, 3, [], { cost: ['3'] });
const TWO = creature('SYNTHETIC Two Drop', 2, 2, [], { cost: ['1', 'W'] });
const THREE = creature('SYNTHETIC Three Drop', 3, 3, [], { cost: ['2', 'W'] });
const BEARS = 'Grizzly Bears';

function board(
  hand: string[],
  withCommander: boolean,
  lands: string[] = ['Forest', 'Plains', 'Plains'],
) {
  let b = scenario()
    .define(SAFE)
    .define(BOSS)
    .define(TWO)
    .define(THREE)
    .seat(0)
    .hand(...hand)
    .battlefield(...lands)
    .landsPlayed(1)
    .library('Plains', { count: 4 });
  b = withCommander ? b.battlefield(BOSS.name, { commander: true }) : b.battlefield(BEARS);
  return b.seat(1).library('Plains', { count: 4 }).at('precombatMain', { active: 0 }).build();
}

/** The agent casts the first play and answers the payment; the actions and the game after. */
async function castAndPay(g: ReturnType<typeof board>, agent: HeuristicAgent) {
  const cast = await askHeuristic(g, agent);
  g.choose(cast);
  const pay = await askHeuristic(g, agent);
  return { cast, pay };
}

describe('mana held for a protection spell', () => {
  test('a two-drop is paid with the two Plains: the Forest stays open for the instant', async () => {
    const g = board([SAFE.name, TWO.name], true);
    const two = g.id(TWO.name);
    const forest = g.id({ name: 'Forest', zone: 'battlefield' });
    const agent = new HeuristicAgent({ seed: 1 });
    const { cast, pay } = await castAndPay(g, agent);
    expect(cast).toMatchObject({ kind: 'castSpell', object: two });
    if (pay.kind !== 'payManual') throw new Error(`payManual expected, got ${pay.kind}`);
    expect(pay.taps.map((t) => t.object)).not.toContain(forest);
    g.choose(pay);
    const view = g.view(0);
    expect(view.battlefield.find((o) => o.id === forest)?.tapped).toBe(false);
  });

  test('a pair of spells that uses all five lands is cast: the reserve never costs mana', async () => {
    // {1}{W} and {2}{W} together use every land; holding {G} would leave one of them uncast.
    const g = board([SAFE.name, TWO.name, THREE.name], true, [
      'Forest',
      'Plains',
      'Plains',
      'Plains',
      'Plains',
    ]);
    const agent = new HeuristicAgent({ seed: 1 });
    const { cast, pay } = await castAndPay(g, agent);
    expect(cast.kind).toBe('castSpell');
    expect(pay.kind).toBe('payAuto');
  });

  test('with nothing worth saving on the battlefield the payment is automatic', async () => {
    const g = board([SAFE.name, TWO.name], false);
    const agent = new HeuristicAgent({ seed: 1 });
    const { pay } = await castAndPay(g, agent);
    expect(pay.kind).toBe('payAuto');
  });

  test('without a protection spell in hand the payment is automatic', async () => {
    const g = board([TWO.name], true);
    const agent = new HeuristicAgent({ seed: 1 });
    const { pay } = await castAndPay(g, agent);
    expect(pay.kind).toBe('payAuto');
  });

  test('a source whose mana has a restriction is never tapped by hand', () => {
    const rock: CardDefinition = {
      oracleId: null,
      name: 'SYNTHETIC Restricted Rock',
      layout: 'normal',
      faces: [
        {
          name: 'SYNTHETIC Restricted Rock',
          manaCost: ['1'],
          supertypes: [],
          types: ['artifact'],
          subtypes: [],
          colors: [],
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          oracleText:
            '{T}: Add {G}{G}. Spend this mana only to cast spells with mana value 5 or greater.',
          abilities: [],
          spell: null,
        },
      ],
      colorIdentity: [],
      support: 'supported',
    };
    const g = scenario()
      .define(rock)
      .seat(0)
      .battlefield('Forest', 'Plains', 'Plains', rock.name)
      .library('Plains', { count: 4 })
      .seat(1)
      .library('Plains', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const view = g.view(0);
    const ids = ['Forest', 'Plains', 'Plains', rock.name].map((name, i) => {
      const found = view.battlefield.filter((o) => o.name === name);
      return found[name === 'Plains' ? i - 1 : 0]?.id as string;
    });
    const decision = {
      kind: 'payMana',
      id: 'd1',
      seat: 0,
      source: 'x',
      totalCost: ['1', 'W'],
      manaSources: ids.map((object) => ({ object, abilityIndex: 0 })),
    } as unknown as PayManaDecision;
    const action = payHolding(view, decision, ['G']);
    if (action?.kind !== 'payManual') throw new Error('payManual expected');
    const names = action.taps.map((t) => view.battlefield.find((o) => o.id === t.object)?.name);
    expect(names).toEqual(['Plains', 'Plains']);
  });
});

// Issue 89 (Silverquill Influence), group 5 (D-642): an Aura that remakes its creature and gives it one keyword ("Enchanted creature is an Insect artifact creature with base power and
// toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.", Darksteel Mutation).
// Pins: CR 613.1d (layer 4: the card types and the creature types are replaced), CR 613.1f (layer 6: it loses what it had and keeps what this effect gives, in timestamp order, and a
// static ability's grants keep the order they are written in), CR 613.4b (layer 7b: base power and toughness), CR 205.1a and 205.3d (card types and creature types replaced),
// CR 611.3a (it ends with the Aura).
// Cards: the SYNTHETIC "Mutation Aura" of this file, the real Serra Angel (flying, vigilance) and the basic lands.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const AURA = 'SYNTHETIC Mutation Aura';
const ANGEL = 'Serra Angel';

const ATTACHED = { kind: 'attached' } as const;
const mutationAura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    'Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    { kind: 'static', static: { kind: 'loseAllAbilities', subject: ATTACHED } },
    {
      kind: 'static',
      static: {
        kind: 'setTypes',
        subject: ATTACHED,
        types: ['artifact', 'creature'],
        subtypes: ['Insect'],
      },
    },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'indestructible' },
      },
    },
    { kind: 'static', static: { kind: 'setPt', subject: ATTACHED, power: 0, toughness: 1 } },
  ],
});

function enchanted(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .define(mutationAura)
    .hand(AURA)
    .battlefield('Plains', 'Plains')
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(ANGEL)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
  g.act(0).cast(AURA, { targets: [ANGEL], pay: true });
  g.passAll();
  return g;
}

describe('CR 613: an Aura that remakes a creature and gives it one keyword', () => {
  test('it is an Insect artifact creature with base power and toughness 0/1, and nothing else of what it was', () => {
    const g = enchanted();
    const angel = g.object(g.id(ANGEL));
    const d = derive(g.state, angel);
    expect([...d.types].sort()).toEqual(['artifact', 'creature']);
    expect(d.subtypes).toEqual(['Insect']);
    g.expect.pt(ANGEL, 0, 1);
  });

  test('it has indestructible and no other ability: it lost flying and vigilance but kept what the Aura gives', () => {
    const g = enchanted();
    const d = derive(g.state, g.object(g.id(ANGEL)));
    const keywords = d.abilities.flatMap((a) => (a.kind === 'keyword' ? [a.keyword.kind] : []));
    expect(keywords).toEqual(['indestructible']);
  });

  test('the Aura goes: it is the Angel again', () => {
    const g = enchanted();
    const aura = g.id(AURA);
    const state = {
      ...g.state,
      continuousEffects: [
        ...g.state.continuousEffects,
        {
          id: 'ce-test',
          timestamp: 999,
          objects: [aura],
          until: 'permanent' as const,
          change: { kind: 'loseAllAbilities' as const },
        },
      ],
    };
    const angel = state.objects[g.id(ANGEL)];
    if (angel === undefined) throw new Error('no Angel');
    const d = derive(state, angel);
    expect(d.types).toEqual(['creature']);
    expect(d.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'flying')).toBe(true);
  });
});

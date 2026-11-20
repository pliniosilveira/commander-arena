// Agatha deck (issue 345), group 2: Blackblade Reforged, "Equip legendary creature {3}" and "Equip {7}".
// Pins: CR 702.6c (an equip ability may restrict its target to a creature with a quality: the restricted one can attach only to such a creature), CR 205.4 (legendary
// supertype), CR 702.6a (equip is sorcery speed and attaches to a creature you control), CR 613 (+1/+1 for each land: counted as the layer applies).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BLADE = real('Blackblade Reforged');
const HERO = parsed('SYNTHETIC Legend', 'Legendary Creature — Human', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const PLAIN = parsed('SYNTHETIC Plain', 'Creature — Human', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

const game = (lands: number) => {
  const b = scenario().define(BLADE).define(HERO).define(PLAIN).seat(0).battlefield(BLADE.name);
  for (let i = 0; i < lands; i++) b.battlefield('Forest');
  return b.battlefield(HERO.name).battlefield(PLAIN.name).seat(1).library('Forest').build();
};

/** The ability indices of the Equipment the engine offers right now. */
function offered(g: ReturnType<typeof game>): number[] {
  return g
    .legalActions(0)
    .flatMap((a) =>
      a.kind === 'activate' && a.object === g.id(BLADE.name) ? [a.abilityIndex] : [],
    );
}

function targetsOf(g: ReturnType<typeof game>, index: number): string[] {
  g.act(0).activate(BLADE.name, { ability: index });
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error('expected a target decision');
  return (d.specs[0]?.legal ?? [])
    .flatMap((t) =>
      t.kind === 'object' ? [g.object(t.id).card === null ? 'token' : g.object(t.id).id] : [],
    )
    .map((id) => String(id));
}

describe('Blackblade Reforged', () => {
  test('equip legendary creature {3} offers only the legendary creature', () => {
    const g = game(3);
    const indices = offered(g);
    expect(indices.length).toBe(1);
    const [first] = indices;
    expect(targetsOf(g, first ?? -1)).toEqual([String(g.id(HERO.name))]);
  });

  test('equip {7} offers every creature you control', () => {
    const g = game(7);
    const indices = offered(g);
    expect(indices.length).toBe(2);
    const second = indices[1];
    expect(targetsOf(g, second ?? -1).sort()).toEqual(
      [String(g.id(HERO.name)), String(g.id(PLAIN.name))].sort(),
    );
  });

  test('the legendary equip attaches and the creature gets +1/+1 for each land', () => {
    const g = game(3);
    const [first] = offered(g);
    g.act(0)
      .activate(BLADE.name, { ability: first ?? -1 })
      .targets([HERO.name])
      .pay();
    g.passAll();
    g.expect.attached(BLADE.name, HERO.name);
    g.expect.pt(HERO.name, 4, 4);
    g.expect.invariants();
  });
});

// Lothlórien Blade (Elven Council deck, issue 98), run through the engine as written: a SYNTHETIC card with the wording of the real one (name replaced by ~).
// "Whenever equipped creature attacks, it deals damage equal to its power to target creature defending player controls. / Equip Elf {2} / Equip {5}"
// Pins: CR 603.2 (the trigger), CR 508.5 (the defending player of each attacker), CR 120.3 (the equipped creature is the source of the damage), CR 702.6c (an equip ability
// that names a quality attaches only to a creature with it).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIBRARY = Array.from({ length: 20 }, () => 'Forest');

const blade = parsed(
  'SYNTHETIC Parsed Blade',
  'Artifact — Equipment',
  'Whenever equipped creature attacks, it deals damage equal to its power to target creature defending player controls.\nEquip Elf {2}\nEquip {5}',
  { manaCost: '{3}' },
);
const elf = parsed('SYNTHETIC Parsed Elf 3/3', 'Creature — Elf Warrior', '', {
  manaCost: '{1}{G}',
  power: '3',
  toughness: '3',
  colors: ['G'],
});
const human = parsed('SYNTHETIC Parsed Human 2/2', 'Creature — Human Soldier', '', {
  manaCost: '{1}{W}',
  power: '2',
  toughness: '2',
  colors: ['W'],
});
const victim1 = parsed('SYNTHETIC Parsed Guard 1', 'Creature — Soldier', '', {
  manaCost: '{1}{W}',
  power: '1',
  toughness: '3',
  colors: ['W'],
});
const victim2 = parsed('SYNTHETIC Parsed Guard 2', 'Creature — Soldier', '', {
  manaCost: '{1}{U}',
  power: '1',
  toughness: '3',
  colors: ['U'],
});

describe('the lowering', () => {
  test('the damage is dealt by the creature whose attack it was, to a creature of the defending player', () => {
    expect(blade.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      targets: [{ what: { kind: 'object', filter: { controller: 'defendingPlayer' } } }],
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
        from: { kind: 'triggerSubject' },
      },
    });
  });

  test('"Equip Elf {2}" is an equip ability restricted to Elves, and "Equip {5}" is not', () => {
    const keywords = (blade.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'keyword' && a.keyword.kind === 'equip' ? [a.keyword] : [],
    );
    expect(keywords).toHaveLength(2);
    expect(keywords[0]).toMatchObject({ restriction: { subtypes: ['Elf'] } });
    expect(keywords[1]?.restriction).toBeUndefined();
  });
});

function table(attackerAt: 1 | 2) {
  const g = scenario({ seats: 3 })
    .define(blade)
    .define(elf)
    .define(human)
    .define(victim1)
    .define(victim2)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(elf.name, { label: 'elf' })
    .battlefield(blade.name, { attachedTo: 'elf' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(victim1.name)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(victim2.name)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker: 'elf', target: { player: attackerAt } }]);
  return g;
}

describe('playing it with 3 seats', () => {
  test('attacking the first opponent: only that player’s creature can be hit, and it takes damage equal to the Elf’s power', () => {
    const g = table(1);
    // The only legal target is chosen by the engine: the creature of the player the Elf attacks.
    g.passAll();
    g.expect.zone(victim1.name, 'graveyard', { seat: 1 });
    g.expect.zone(victim2.name, 'battlefield', { seat: 2 });
  });

  test('attacking the second opponent: the damage goes to that player’s creature, not the first one’s', () => {
    const g = table(2);
    g.passAll();
    g.expect.zone(victim2.name, 'graveyard', { seat: 2 });
    g.expect.zone(victim1.name, 'battlefield', { seat: 1 });
  });
});

describe('Equip Elf {2}', () => {
  const equipGame = (lands: number) => {
    const b = scenario()
      .define(blade)
      .define(elf)
      .define(human)
      .seat(0)
      .battlefield(blade.name)
      .battlefield(elf.name)
      .battlefield(human.name);
    for (let i = 0; i < lands; i++) b.battlefield('Forest');
    return b.seat(1).library('Forest').build();
  };
  const offered = (g: ReturnType<typeof equipGame>): number[] =>
    g
      .legalActions(0)
      .flatMap((a) =>
        a.kind === 'activate' && a.object === g.id(blade.name) ? [a.abilityIndex] : [],
      );
  const legalTargets = (g: ReturnType<typeof equipGame>, index: number): unknown[] => {
    g.act(0).activate(blade.name, { ability: index });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected a target decision');
    return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
  };

  test('with two mana only "Equip Elf" is offered, and only the Elf is a target', () => {
    const g = equipGame(2);
    const indices = offered(g);
    expect(indices).toHaveLength(1);
    expect(legalTargets(g, indices[0] ?? -1)).toEqual([g.id(elf.name)]);
  });

  test('with five mana "Equip {5}" is offered besides, for any creature', () => {
    const g = equipGame(5);
    const indices = offered(g);
    expect(indices).toHaveLength(2);
    expect(legalTargets(g, indices[1] ?? -1).sort()).toEqual(
      [g.id(elf.name), g.id(human.name)].sort(),
    );
  });
});

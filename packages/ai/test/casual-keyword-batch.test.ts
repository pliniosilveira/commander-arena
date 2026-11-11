// CasualAgent and the keywords of D-104 and D-110, on real engine states built with the scenario DSL:
//  - poison (Infect, Toxic): an attack is lethal when the poison reaches ten, not only when the life does,
//    and infect damage is not counted as life loss; a block is forced by lethal poison;
//  - Multikicker: pays as many times as it can, a cost of life only while life stays above PAY_LIFE_ABOVE,
//    and does not cast a spell that is only its kicks for nothing;
//  - split second: nothing is cast into it (the engine lists no cast), the agent passes;
//  - typecycling: used when the hand has no land and nothing is worth casting;
//  - Annihilator: the defending agent sacrifices what it values least.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { answer } from './casual-helpers';

const INFECT = 'SYNTHETIC Infect Bear';
const RAT = 'SYNTHETIC Toxic Rat';
const BRUTE = 'SYNTHETIC Toxic Brute';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4

describe('attacking with poison', () => {
  const attackers = async (g: ScenarioGame) => {
    g.advanceTo('declareAttackers', { attack: false });
    const a = await answer(g);
    if (a.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${a.kind}`);
    return a.attacks.map((x) => x.attacker);
  };

  test('infect creatures attack all out when the poison would be lethal, into a blocker that kills one', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT, INFECT)
      .seat(1)
      .poison(6)
      .battlefield(SPIDER)
      .build();
    // 4 poison from two 2/2 infect creatures, 6 already: ten. A Giant Spider could block and kill either.
    expect(await attackers(g)).toHaveLength(2);
  });

  test('the same attack is not made all out when the poison would not be lethal', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT, INFECT)
      .seat(1)
      .poison(5)
      .battlefield(SPIDER)
      .build();
    expect(await attackers(g)).toHaveLength(0);
  });

  test('infect power is not counted as life damage: a 4-life opponent is not in reach', async () => {
    // Two infect bears at a 4-life opponent would be lethal if they were counted as life damage.
    const g = scenario()
      .seat(0)
      .battlefield(INFECT, INFECT)
      .seat(1)
      .life(4)
      .battlefield(SPIDER)
      .build();
    expect(await attackers(g)).toHaveLength(0);
  });

  test('toxic adds to the poison of combat damage (1 + 2)', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(RAT, BRUTE)
      .seat(1)
      .poison(7)
      .battlefield('Serra Angel')
      .build();
    // Rat 1 + Brute 2 = 3 poison: ten with seven. The Angel would kill either alone.
    expect(await attackers(g)).toHaveLength(2);
    const calm = scenario()
      .seat(0)
      .battlefield(RAT, BRUTE)
      .seat(1)
      .poison(6)
      .battlefield('Serra Angel')
      .build();
    expect(await attackers(calm)).toHaveLength(0);
  });
});

describe('blocking poison', () => {
  const blocks = async (poison: number) => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .seat(1)
      .poison(poison)
      .battlefield('Llanowar Elves')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(INFECT);
    g.act(0).pass();
    g.act(1).pass();
    const a = await answer(g);
    if (a.kind !== 'declareBlockers') throw new Error(`expected declareBlockers, got ${a.kind}`);
    return a.blocks;
  };

  test('a chump block is made when the unblocked infect damage would be the tenth counter', async () => {
    expect(await blocks(8)).toHaveLength(1);
  });

  test('not while the poison is far from ten (infect damage takes no life)', async () => {
    expect(await blocks(0)).toHaveLength(0);
  });
});

describe('Multikicker', () => {
  test('the agent pays as many kicks as it can', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Strider Cub')
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Strider Cub');
    expect(await answer(g)).toEqual({ kind: 'chooseX', value: 3 });
  });

  test('a life cost is paid only while life stays above PAY_LIFE_ABOVE', async () => {
    const at = async (life: number) => {
      const g = scenario()
        .seat(0)
        .life(life)
        .hand('SYNTHETIC Blood Tithe')
        .battlefield('Swamp')
        .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
        .seat(1)
        .build();
      g.act(0).cast('SYNTHETIC Blood Tithe');
      return answer(g);
    };
    // PAY_LIFE_ABOVE + 1 life: paying 2 would leave it at or below the line: not once.
    expect(await at(PAY_LIFE_ABOVE + 1)).toEqual({ kind: 'chooseX', value: 0 });
    expect(await at(PAY_LIFE_ABOVE + 3)).toEqual({ kind: 'chooseX', value: 1 });
    expect(await at(PAY_LIFE_ABOVE + 7)).toEqual({ kind: 'chooseX', value: 3 });
  });

  test('a spell that is only its kicks is not cast when no kick can be paid', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Volley Barrage')
      .battlefield('Mountain')
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'pass' });
    const rich = scenario()
      .seat(0)
      .hand('SYNTHETIC Volley Barrage')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .build();
    expect((await answer(rich)).kind).toBe('castSpell');
  });
});

describe('split second', () => {
  test('the agent holding a counterspell passes while a spell with split second is on the stack', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Hush Bolt')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .hand('Counterspell', 'Lightning Bolt')
      .battlefield('Island', 'Island', 'Mountain')
      .build();
    g.act(0).cast('SYNTHETIC Hush Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    // Seat 1 has Counterspell and the mana for it, and a Bolt: the engine offers neither.
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });
});

describe('typecycling', () => {
  test('a hand with no land and nothing worth casting cycles for a land', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Landcycler Beast')
      .battlefield('Forest')
      .library('Forest', 'Island')
      .seat(1)
      .build();
    const id = g.id('SYNTHETIC Landcycler Beast');
    const a = await answer(g);
    expect(a).toMatchObject({ kind: 'activate', object: id });
  });

  test('not when the hand already holds a land', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Landcycler Beast', 'Forest')
      .battlefield('Forest', { count: 1 })
      .library('Forest', 'Island')
      .seat(1)
      .build();
    expect((await answer(g)).kind).toBe('playLand');
  });
});

describe('Annihilator', () => {
  test('the defending agent answers the question, and keeps its best permanent', async () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Annihilator Titan')
      .seat(1)
      .battlefield('Serra Angel', BEARS, 'Forest', 'Forest')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('SYNTHETIC Annihilator Titan');
    g.passAll();
    const a = await answer(g);
    expect(a.kind).toBe('choosePermanents');
    if (a.kind !== 'choosePermanents') return;
    expect(a.objects).toHaveLength(2);
    const angel = g.id('Serra Angel');
    expect(a.objects).not.toContain(angel);
  });
});

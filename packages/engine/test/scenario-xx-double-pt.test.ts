// "Double the power and toughness of each creature you control until end of turn." (D-145): an `affected` power or toughness in a
// `modifyPt` effect.
// Pins: CR 701.10a and 701.10b (doubling gives +X/+0 where X is the power as the spell or ability resolves, +0/+X for toughness, +X/+Y for
// both), CR 701.10c (a negative power doubled: the creature gets that much more of it), CR 611.2c (what an effect affects is fixed when it
// resolves: a creature that enters later is not doubled), CR 613.4c (layer 7c: counters and +N/+N together), CR 514.2 (until end of turn),
// CR 503.1 and 507.1 (a trigger at the beginning of combat). Cards are SYNTHETIC (src/cards/fixtures/synthetic-doubling.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FIELD = 'SYNTHETIC Surge Field';
const POWER = 'SYNTHETIC Might Doubler';
const HIDE = 'SYNTHETIC Hide Doubler';
const BEARS = 'Grizzly Bears'; // 2/2
const ELF = 'SYNTHETIC Elf 5/2';
const CURSE = 'SYNTHETIC Curse Aura'; // -2/-2
const WALL = 'Wall of Stone'; // 0/8

describe('the cards are valid', () => {
  test.each([FIELD, POWER, HIDE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('at the beginning of each combat, double each creature you control (CR 701.10b)', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(scenario().seat(0).battlefield(FIELD).battlefield(BEARS, ELF))
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('power and toughness, each creature its own', () => {
    const g = game();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(ELF, 10, 4);
  });

  test("the opponent's creatures are not affected", () => {
    const g = game();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt('Typhoid Rats', 1, 1);
  });

  test('counters count: the power and toughness as the effect resolves, in all (CR 613.4c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIELD)
      .battlefield(BEARS, { counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt(BEARS, 6, 6);
  });

  test('it wears off at the end of the turn (CR 514.2)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIELD)
      .battlefield(BEARS)
      .library('Island', 'Island', 'Island')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
  });

  test('also at the beginning of an opponent combat: "each combat", the creatures of its controller are doubled', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIELD)
      .battlefield(BEARS)
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
  });

  test('two of them: the second doubles what the first made (4/4 becomes 8/8)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIELD, FIELD)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.pt(BEARS, 8, 8);
  });

  test('a creature that arrives after the trigger resolved is not doubled (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(FIELD, 'Forest')
      .battlefield(BEARS)
      .hand('SYNTHETIC Flash Dinosaur')
      .battlefield('Mountain')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).cast('SYNTHETIC Flash Dinosaur', { pay: true });
    g.passAll();
    g.expect.pt('SYNTHETIC Flash Dinosaur', 2, 1);
    g.expect.pt(BEARS, 4, 4);
  });
});

describe('only one stat, or a negative one', () => {
  test('doubling the power alone leaves the toughness', () => {
    const g = scenario().seat(0).hand(POWER).battlefield('Forest', BEARS).build();
    g.act(0).cast(POWER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
  });

  test('doubling the toughness alone leaves the power', () => {
    const g = scenario().seat(0).hand(HIDE).battlefield('Forest', ELF).build();
    g.act(0).cast(HIDE, { targets: [ELF], pay: true });
    g.passAll();
    g.expect.pt(ELF, 5, 4);
  });

  test('a negative power: the creature gets that much more of it, -2 becomes -4 (CR 701.10c)', () => {
    const g = scenario()
      .seat(0)
      .hand(POWER)
      .battlefield('Forest')
      .battlefield(WALL, { label: 'wall' })
      .battlefield(CURSE, { attachedTo: 'wall' })
      .build();
    g.expect.pt('wall', -2, 6);
    g.act(0).cast(POWER, { targets: ['wall'], pay: true });
    g.passAll();
    g.expect.pt('wall', -4, 6);
  });
});

describe('validation', () => {
  const effect = (e: Effect) =>
    ({
      ...syntheticCard(POWER),
      faces: [
        {
          ...syntheticCard(POWER).faces[0],
          spell: { ...syntheticCard(POWER).faces[0]?.spell, effect: e },
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];
  const target = { kind: 'target', id: 't1' } as const;
  const own = { kind: 'affected', stat: 'power' } as const;

  test('a modifyPt may read the power it affects', () => {
    expect(
      validateCard(
        effect({
          kind: 'modifyPt',
          objects: target,
          power: own,
          toughness: 0,
          duration: 'untilEndOfTurn',
        }),
      ),
    ).toEqual([]);
  });

  test('base power and toughness may not: setPt is refused', () => {
    const found = validateCard(
      effect({
        kind: 'setPt',
        objects: target,
        power: own,
        toughness: 1,
        duration: 'untilEndOfTurn',
      }),
    );
    expect(found.map((i) => i.message).join(' ')).toContain('only a modifyPt effect can');
    const tough = validateCard(
      effect({
        kind: 'setPt',
        objects: target,
        power: 1,
        toughness: { kind: 'affected', stat: 'toughness' },
        duration: 'untilEndOfTurn',
      }),
    );
    expect(tough.map((i) => i.message).join(' ')).toContain('only a modifyPt effect can');
  });

  test('the stat is power or toughness', () => {
    const bad = { kind: 'affected', stat: 'loyalty' } as unknown as typeof own;
    expect(
      validateCard(
        effect({
          kind: 'modifyPt',
          objects: target,
          power: bad,
          toughness: 0,
          duration: 'untilEndOfTurn',
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

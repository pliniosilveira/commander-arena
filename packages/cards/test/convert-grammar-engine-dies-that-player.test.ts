// "that player" in a death trigger is the controller of the permanent that died (CR 603.10a, 400.7: last known information), the shape
// of "Whenever a creature an opponent controls dies, that player loses 2 life." The cards are SYNTHETIC; the wording is that of a real
// blocker (reason unboundReference, closest rule noun.that-player). The scenario DSL has exactly two seats, so "the right opponent
// loses life" is tested with the one opponent and with a wording that has no controller filter.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const WURM_TEXT = 'Whenever a creature an opponent controls dies, that player loses 2 life.';
const ANY_TEXT = 'Whenever a creature dies, that player loses 2 life.';
const extra = { manaCost: '{3}{B}', colors: ['B'] as const, power: '2', toughness: '2' };
const WURM = parsed('SYNTHETIC Parsed Death Drain', 'Creature — Wurm', WURM_TEXT, extra);
const ANY = parsed('SYNTHETIC Parsed Any Death Drain', 'Creature — Wurm', ANY_TEXT, extra);
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';
const settle = (g: ScenarioGame): void => {
  for (let i = 0; i < 40 && g.state.stack.length > 0; i += 1) g.pass();
};
const game = (def: typeof WURM) =>
  scenario()
    .seat(0)
    .life(20)
    .library(...FILLER)
    .define(def)
    .battlefield(def.name)
    .battlefield(BEARS)
    .battlefield('Swamp', { count: 8 })
    .hand('Murder')
    .hand('Murder')
    .seat(1)
    .life(20)
    .library(...FILLER)
    .battlefield(BEARS)
    .at('precombatMain', { active: 0 })
    .build();

describe('"that player" of a death trigger: the controller of what died (CR 603.10a)', () => {
  test('lowers: the effect names the controller of the creature that died', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Lowered Drain',
        typeLine: 'Creature — Wurm',
        manaCost: '{3}{B}',
        oracleText: WURM_TEXT,
        power: '2',
        toughness: '2',
      }),
    );
    expect(imported.support.status).toBe('supported');
    const json = JSON.stringify(imported.definition);
    expect(json).toContain('"controllerOf"');
    expect(json).toContain('"triggerSubject"');
  });

  test('the whole two-ability text (a -2/-2 sweep on entering, then the drain) is supported', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Sweeping Drain',
        typeLine: 'Creature — Phyrexian Wurm',
        manaCost: '{3}{B}{B}{B}',
        oracleText:
          `When ~ enters, creatures your opponents control get -2/-2 until end of turn.\n${WURM_TEXT}`.replaceAll(
            '~',
            'SYNTHETIC Sweeping Drain',
          ),
        power: '6',
        toughness: '5',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('an opponent creature dies: its controller loses 2 life', () => {
    const g = game(WURM);
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    settle(g);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
  });

  test('my own creature dies: "an opponent controls" does not trigger', () => {
    const g = game(WURM);
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    settle(g);
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });

  test('without a controller filter, "that player" is whoever controlled the creature that died', () => {
    const g = game(ANY);
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    settle(g);
    g.expect.life(0, 18);
    g.expect.life(1, 20);
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    settle(g);
    g.expect.life(1, 18);
    g.expect.life(0, 18);
  });
});

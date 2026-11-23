// Umaro, Raging Yeti (Revival Trance deck): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is
// played through applyAction. "At the beginning of combat on your turn, choose one at random —" and its three modes.
// Pins: CR 700.2 and 603.3c (the mode of a triggered ability is chosen as it goes on the stack: here by the seeded generator of the state; a mode with no legal target cannot be chosen),
// CR 608.2c (the instructions of the mode chosen run in order), CR 120.3 (damage).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const UMARO = real('Umaro, Raging Yeti');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid and its trigger chooses one mode at random', () => {
  expect(validateCard(UMARO)).toEqual([]);
  const trigger = UMARO.faces[0]?.abilities.find((a) => a.kind === 'triggered');
  expect(trigger?.kind === 'triggered' && trigger.chooseModes).toEqual({
    min: 1,
    max: 1,
    random: true,
  });
  expect(trigger?.kind === 'triggered' && trigger.modes).toHaveLength(3);
});

function atCombat(seed: number): ScenarioGame {
  const g = scenario()
    .define(UMARO)
    .seed(seed)
    .seat(0)
    .library(...LIBRARY)
    .hand('Plains', 'Plains', 'Plains')
    .battlefield(UMARO.name, { label: 'umaro' })
    .battlefield(BEARS, { label: 'mine' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'theirs' })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.advanceTo('beginningOfCombat');
  return g;
}

const chosen = (g: ScenarioGame): readonly number[] | undefined => {
  const top = g.state.stack[g.state.stack.length - 1];
  return top === undefined ? undefined : g.state.objects[top]?.stack?.chosenModes;
};

describe('the modes run as the seeded generator picks them', () => {
  test('every mode is picked by some seed, each does what its text says, and a pick is repeatable', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 80 && seen.size < 3; seed += 1) {
      const g = atCombat(seed);
      const modes = chosen(g);
      expect(modes).toHaveLength(1);
      expect(chosen(atCombat(seed))).toEqual(modes);
      const mode = modes?.[0] ?? -1;
      if (seen.has(mode)) continue;
      seen.add(mode);
      if (mode === 0) {
        // Other creatures you control get +3/+0 until end of turn: the Bears, not Umaro (CR 613.4c).
        g.passAll();
        g.expect.pt({ name: BEARS, seat: 0 }, 5, 2);
        g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
        g.expect.pt(UMARO.name, 6, 6);
      } else if (mode === 1) {
        // Discard your hand, then draw four cards (CR 608.2c).
        g.passAll();
        g.expect.handSize(0, 4);
      } else {
        // 5 damage to any target: the controller aims it (CR 115.1, 120.3).
        expect(g.state.pending?.kind).toBe('targets');
        const theirs = g.object({ name: BEARS, seat: 1 }).id;
        g.act(0).choose({
          kind: 'chooseTargets',
          targets: [{ kind: 'object', id: theirs, specId: 't1' }],
        });
        g.passAll();
        g.expect.zone(BEARS, 'graveyard', { seat: 1 });
      }
      g.expect.invariants();
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});

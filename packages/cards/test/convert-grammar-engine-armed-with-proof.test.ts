// Armed with Proof (Deep Clue Sea deck, issue 128): "When this enchantment enters, investigate twice." and "Clues you control are Equipment in addition to their other types and have
// "Equipped creature gets +2/+0" and equip {2}." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction. Pins: CR 613.1d (the Equipment type in layer 4), 613.1f (the abilities in layer 6), 613.4c (the +2/+0 in layer 7c), 702.6a (equip), 301.5 and 704.5p (when it
// stops being an Equipment it is unattached), 701.16a (investigate), and the rulings: each Armed with Proof adds +2/+0.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ARMED = 'Armed with Proof';

describe('Armed with Proof', () => {
  const armed = real(ARMED);

  const game = () =>
    scenario({ seats: 3 })
      .define(armed)
      .seat(0)
      .library(...LIBRARY)
      .hand(ARMED)
      .battlefield(BEARS, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  /** The equip ability of a Clue: the last of the abilities the Clue can activate (the Clue's own sacrifice ability is first). */
  const equipIndex = (g: ReturnType<typeof game>, clue: string) => {
    const id = g.object(clue).id;
    const indexes = getLegalActions(g.state, 0)
      .flatMap((a) => (a.kind === 'activate' && a.object === id ? [a.abilityIndex] : []))
      .sort((x, y) => x - y);
    return indexes[indexes.length - 1] ?? -1;
  };

  test('the card is valid', () => {
    expect(validateCard(armed)).toEqual([]);
  });

  test('entering investigates twice; the Clues are Equipment, and equip {2} gives the equipped creature +2/+0', () => {
    const g = game();
    g.act(0).cast(ARMED, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.expect.derived('Clue[0]', { subtypes: ['Clue', 'Equipment'] });
    g.act(0).activate('Clue[0]', {
      ability: equipIndex(g, 'Clue[0]'),
      targets: [`${BEARS}[0]`],
      pay: true,
    });
    g.passAll();
    g.expect.attached('Clue[0]', `${BEARS}[0]`);
    g.expect.pt(`${BEARS}[0]`, 4, 2);
    g.expect.invariants();
  });

  test('two Armed with Proof: the equipped creature gets +2/+0 from each', () => {
    const g = scenario({ seats: 3 })
      .define(armed)
      .seat(0)
      .library(...LIBRARY)
      .hand(ARMED)
      .battlefield(ARMED, BEARS, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${ARMED}[0]`, { pay: true });
    g.passAll();
    g.act(0).activate('Clue[0]', {
      ability: equipIndex(g as never, 'Clue[0]'),
      targets: [BEARS],
      pay: true,
    });
    g.passAll();
    // Two Clues-as-Equipment sources (CR 613.4c: the +2/+0 of the quoted ability is given to each Clue by each Armed with Proof, one equipped creature gets +2 from each ability it reads).
    g.expect.pt(BEARS, 2 + 2 * 2, 2);
  });
});

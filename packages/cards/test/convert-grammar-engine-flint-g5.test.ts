// Flint deck (issue 685), group 5: Anje Falkenrath, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction.
// "Whenever you discard a card, if it has madness, untap Anje Falkenrath." (CR 603.4, 701.9a, 702.35a). Its own ability, "{T}, Discard a card: Draw a card.", is the way to discard:
// tapping it is the cost, so the untap shows. The madness card is the engine's SYNTHETIC Madness Fiend (Madness {1}{B}).
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

const ANJE = real('Anje Falkenrath');
const MAD = 'SYNTHETIC Madness Fiend'; // the engine's fixture: {3}{B} 4/3, madness {1}{B}
const PLAIN = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

describe('Anje Falkenrath (CR 603.4, 701.9a, 702.35a)', () => {
  test('is valid and the madness test is a part of the discard trigger', () => {
    expect(validateCard(ANJE)).toEqual([]);
    expect(ANJE.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'discarded', who: 'you', filter: { keywords: ['madness'] } },
    });
  });

  const table = (discard: string) =>
    scenario()
      .define(ANJE)
      .seat(0)
      .library(...FILLER)
      .hand(discard)
      .battlefield(ANJE.name, { turnsOnBattlefield: 1 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  /** The two triggers of a discarded madness card (madness and Anje's) may be ordered; the madness cast is declined. */
  const settle = (g: ScenarioGame) => {
    for (let i = 0; i < 8; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
      else if (d?.kind === 'confirmOptional') g.act(0).decline();
      g.passAll();
    }
  };

  test('discarding a card with madness untaps Anje', () => {
    const g = table(MAD);
    g.act(0).activate(ANJE.name, { ability: 1 });
    settle(g);
    g.expect.tapped(ANJE.name, false);
  });

  test('discarding a card with no madness leaves Anje tapped', () => {
    const g = table(PLAIN);
    g.act(0).activate(ANJE.name, { ability: 1 });
    settle(g);
    g.expect.tapped(ANJE.name, true);
  });
});

import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const HIPPOCAMP = real('Wavebreak Hippocamp');
const FIRST_SPELL = parsed('SYNTHETIC First Instant', 'Instant', 'You gain 1 life.');
const SECOND_SPELL = parsed('SYNTHETIC Second Instant', 'Instant', 'You gain 1 life.');
const SPELLS = [FIRST_SPELL, SECOND_SPELL] as const;
const LIBRARY = Array.from({ length: 20 }, () => 'Island');

describe('Wavebreak Hippocamp', () => {
  const game = (active: 0 | 1) =>
    scenario()
      .define(HIPPOCAMP)
      .define(FIRST_SPELL)
      .define(SECOND_SPELL)
      .seat(0)
      .battlefield(HIPPOCAMP.name)
      .hand(...SPELLS.map((spell) => spell.name))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active, turn: active === 0 ? 1 : 2 })
      .build();

  test('parses the first spell during an opponent turn', () => {
    const ability = HIPPOCAMP.faces[0]?.abilities.find(
      (candidate) => candidate.kind === 'triggered',
    );
    expect(ability?.trigger).toMatchObject({
      kind: 'castSpell',
      by: 'you',
      nth: 1,
      duringTurn: 'opponent',
    });
  });

  test('draws for your first spell during an opponent turn, but not the second one', () => {
    const g = game(1);
    g.act(1).pass();
    g.act(0).cast(SPELLS[0]?.name ?? '', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);

    g.act(1).pass();
    g.act(0).cast(SPELLS[1]?.name ?? '', { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test("doesn't trigger during your own turn", () => {
    const g = game(0);
    g.act(0).cast(SPELLS[0]?.name ?? '', { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

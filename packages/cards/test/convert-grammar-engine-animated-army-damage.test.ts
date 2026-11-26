// Animated Army deck, the damage group: Gratuitous Violence ("If a creature you control would deal damage to a permanent or player, it deals double that
// damage instead."), read by the grammar and run by the engine. The first block parses the REAL Oracle text from the golden corpus, whole; the rest is a
// SYNTHETIC card whose ability is the real line, played through `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Every
// synthetic name starts with "SYNTHETIC". Pins: CR 614.1a, 614.5 and 616.1 (replacement effects, one opportunity each), CR 109.2 (a creature is a permanent),
// CR 120.3 (the creature deals the doubled damage). The engine's own cases (planeswalkers, battles, trample, prevention, last known information) are in
// `packages/engine/test/scenario-xx-damage-double-creatures.test.ts`.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const VIOLENCE =
  'If a creature you control would deal damage to a permanent or player, it deals double that damage instead.';

describe('Gratuitous Violence', () => {
  test('the real card is supported, whole', () => {
    const imported = real('Gratuitous Violence');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
    expect(imported.definition.faces[0]?.abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageDouble',
          sources: { types: ['creature'], controller: 'you', zone: 'battlefield' },
        },
      },
    ]);
  });

  test('the line lowers to the doubling of the creatures on the battlefield', () => {
    expect(readAll(VIOLENCE, 'enchantment').abilities).toEqual([
      {
        kind: 'replacement',
        replacement: {
          kind: 'damageDouble',
          sources: { types: ['creature'], controller: 'you', zone: 'battlefield' },
        },
      },
    ]);
  });

  test.each([
    ['a creature of any player', VIOLENCE.replace(' you control', '')],
    ['a creature of an opponent', VIOLENCE.replace('you control', 'an opponent controls')],
    ['only combat damage', VIOLENCE.replace('deal damage', 'deal combat damage')],
    ['only a player as the recipient', VIOLENCE.replace('a permanent or player', 'a player')],
    ['triple the damage', VIOLENCE.replace('double', 'triple')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'enchantment')).toBeDefined();
  });

  const violence: CardDefinition = parsed('SYNTHETIC Parsed Violence', 'Enchantment', VIOLENCE, {
    manaCost: '{2}{R}{R}{R}',
    colors: ['R'],
  });

  const table = (count: number) =>
    scenario()
      .seat(0)
      .define(violence)
      .battlefield(...Array.from({ length: count }, () => violence.name), BEARS, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('the engine runs it: a 2/2 of the controller deals 4 combat damage', () => {
    const g = table(1);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('two of them quadruple (CR 614.5): 8', () => {
    const g = table(2);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 32);
  });

  test('a spell of the controller is not a creature (CR 109.2): 3', () => {
    const g = table(1);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test("another player's creature is not doubled", () => {
    const g = scenario()
      .seat(0)
      .define(violence)
      .battlefield(violence.name)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 38);
  });
});

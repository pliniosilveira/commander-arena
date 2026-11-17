// Issue 254: "Can't lose the game, not able to cast anything from hand". Darksteel Angel ("You can't lose the game and your opponents can't win the game") is
// read from the real golden card. With it on the battlefield and a life total of zero or less the player stays in the game (CR 104.3b, 704.5a: the state-based
// action does not make them lose), and they still have priority and can cast spells (CR 117.1a, 601.2): the engine must list the casts and run them.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Darksteel Angel');
if (card === undefined) throw new Error('Darksteel Angel is not in the golden corpus');
const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
const ANGEL: CardDefinition = imported.definition;

const setup = (life: number) =>
  scenario()
    .define(ANGEL)
    .seat(0)
    .life(life)
    .hand('Grizzly Bears', 'Lightning Bolt')
    .battlefield(ANGEL.name, 'Forest', 'Forest', 'Mountain')
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .life(20)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();

describe('a player who cannot lose the game (issue 254)', () => {
  test.each([0, -5])(
    'at %i life the player stays in the game and can cast spells from the hand',
    (life) => {
      const g = setup(life);
      g.expect.invariants();
      const options = getLegalActions(g.state, 0);
      expect(options.some((a) => a.kind === 'castSpell')).toBe(true);
      g.act(0).cast('Grizzly Bears', { pay: true });
      g.passAll();
      g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
      expect(g.state.seats[0]?.hasLost).toBe(false);
    },
  );
});

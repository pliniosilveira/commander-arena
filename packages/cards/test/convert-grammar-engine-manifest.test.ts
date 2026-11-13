// Reality Shift (the REAL card of the golden corpus, issue 25), read through the grammar only and played through applyAction (D-314, D-309, CR 701.40a, 708): "Exile target
// creature. Its controller manifests the top card of their library." The creature is exiled, and the player who controlled it puts the top card of their library onto the
// battlefield face down as a 2/2 creature; a creature card there can be turned face up for its mana cost. The other cards here are the engine's own test cards.
import { readFileSync } from 'node:fs';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const corpus: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = corpus.find((c) => c.name === 'Reality Shift');
if (card === undefined) throw new Error('Reality Shift is not in the golden corpus');
const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);

const SHIFT = 'Reality Shift';
const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Reality Shift as the game reads it', () => {
  test('it is supported, with no ability left unread', () => {
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('its spell is an exile of the target and a manifest by the controller of that target', () => {
    expect(imported.definition.faces[0]?.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'target', id: 't1' } },
          { kind: 'manifest', player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } } },
        ],
      },
    });
  });
});

describe('Reality Shift played', () => {
  const play = (targetOwner: 0 | 1) => {
    const mine = scenario()
      .define(imported.definition)
      .seat(0)
      .life(20)
      .hand(SHIFT)
      .battlefield('Island', { count: 2 })
      .library(BRUTE, ...FILLER);
    const g = (
      targetOwner === 1
        ? mine
            .battlefield('Grizzly Bears', { controller: 1 })
            .seat(1)
            .life(20)
            .library('Llanowar Elves', ...FILLER)
        : mine
            .battlefield('Grizzly Bears')
            .seat(1)
            .life(20)
            .library('Llanowar Elves', ...FILLER)
    )
      .at('precombatMain')
      .build();
    g.act(0).cast(SHIFT, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    return g;
  };

  test("an opponent's creature is exiled and the opponent manifests the top card of their library", () => {
    const g = play(1);
    g.expect.zone('Grizzly Bears', 'exile');
    const manifested = g.object({ name: 'Llanowar Elves', zone: 'battlefield' });
    expect(manifested.faceDown).toBeDefined();
    expect(manifested.controller).toBe(1);
    g.expect.pt('Llanowar Elves', 2, 2);
    g.expect.derived('Llanowar Elves', { types: ['creature'], subtypes: [], keywords: [] });
    g.expect.librarySize(1, FILLER.length);
    g.expect.librarySize(0, FILLER.length + 1);
    // The player who cast it sees a face-down creature with no name, not the Elf.
    const seen = getView(g.state, 0).battlefield.find((o) => o.id === manifested.id);
    expect(seen?.name).toMatch(/^Face-down creature/);
    expect(JSON.stringify(getView(g.state, 0))).not.toContain('Llanowar Elves');
  });

  test('your own creature: you manifest the top card of your own library, and may turn a creature card face up for its mana cost', () => {
    const g = play(0);
    g.expect.zone('Grizzly Bears', 'exile');
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.faceDown).toBeDefined();
    expect(brute.controller).toBe(0);
    // {3}{G}: the seat has two Islands only, so it cannot pay yet.
    g.expect.illegal(0, { turnFaceUp: BRUTE });
  });
});

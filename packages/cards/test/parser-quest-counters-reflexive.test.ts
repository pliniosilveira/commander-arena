// Earthbender Ascension: "Landfall — Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target
// creature you control. It gains trample until end of turn." through the whole pipeline: what it lowers to, the near misses the grammar must drop, and that the engine runs the result.
// Pins: CR 603.12 (reflexive ability), CR 603.4 (intervening "if"), CR 122.1 (counters of one kind).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const LANDFALL =
  'Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control. It gains trample until end of turn.';

describe('"... put a quest counter on ~. When you do, if it has N or more quest counters on it, ..."', () => {
  test('lowers to a reflexive ability with the intervening if on the source', () => {
    const [a] = readAll(LANDFALL, 'enchantment').abilities;
    expect(a).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: { kind: 'this' }, counter: 'quest', count: 1 },
          {
            kind: 'reflexive',
            ifThisWay: 'countersPut',
            interveningIf: { kind: 'sourceHasCounter', counter: 'quest', atLeast: 4 },
            targets: [{ what: { kind: 'object' } }],
          },
        ],
      },
    });
  });

  test.each([
    // the counter put is not on the source
    'Whenever a land you control enters, put a quest counter on target creature. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control.',
    // a different kind of counter than the one put
    'Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or more charge counters on it, put a +1/+1 counter on target creature you control.',
    // fewer-than is not read
    'Whenever a land you control enters, put a quest counter on ~. When you do, if it has four or fewer quest counters on it, put a +1/+1 counter on target creature you control.',
    // no instruction that put a counter before it
    'Whenever a land you control enters, draw a card. When you do, if it has four or more quest counters on it, put a +1/+1 counter on target creature you control.',
  ])('another wording is dropped: %s', (text) => {
    expect(read(text, 'enchantment').unparsed.length).toBeGreaterThan(0);
  });

  test('without condition:sourceHasCounter in the engine the ability is not read', () => {
    expect(withoutFeature('condition:sourceHasCounter', LANDFALL).reason).toBeDefined();
  });
});

describe('the real card in a game', () => {
  const GOLDEN = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  const card = GOLDEN.find((c) => c.name === 'Earthbender Ascension');
  if (card === undefined) throw new Error('Earthbender Ascension is not in the golden corpus');
  // The landfall ability only: the enters trigger needs the rest of the engine's earthbend, tested elsewhere.
  const imported = importCard(
    fromGoldenCard({
      ...card,
      faces: card.faces.map((f) => ({ ...f, oracleText: `Landfall — ${LANDFALL}` })),
    }),
    undefined,
    NO_OVERRIDES,
  );
  const def: CardDefinition = imported.definition;

  test('the card is valid and supported', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(validateCard(def)).toEqual([]);
  });

  test('the fourth counter puts a +1/+1 counter and trample on the creature (three seats)', () => {
    const g = scenario({ seats: 3 })
      .define(def)
      .seat(0)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .hand('Forest')
      .battlefield(def.name, { counters: { quest: 3 } })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(2)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.passAll();
    g.expect.counters(def.name, { quest: 4 });
    g.expect.counters('Grizzly Bears', { '+1/+1': 1 });
    g.expect.derived('Grizzly Bears', { keywords: ['trample'] });
  });
});

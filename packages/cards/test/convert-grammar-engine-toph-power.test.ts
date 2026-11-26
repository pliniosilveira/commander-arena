// Toph, the Blind Bandit: "Toph's power is equal to the number of +1/+1 counters on lands you control." The REAL Oracle line of the golden corpus goes through the grammar as a card
// with no override. The card's other ability ("When Toph enters, earthbend 2.") is not read yet, so the card as a whole is not supported; this test reads the card with only the
// power line as its text, to pin the characteristic-defining ability alone, and plays it in engine scenarios.
// Pins: CR 604.3 (a characteristic-defining ability), CR 208.2a (it defines the `*` power), CR 122.1 (counters), CR 613.4a (layer 7a),
// CR 109.4 ("you control": only the controller's lands count, with any number of opponents).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const CDA_LINE = "Toph's power is equal to the number of +1/+1 counters on lands you control.";

/** The real card with only the power line as its text, imported through the grammar alone. */
function tophPowerOnly(): CardDefinition {
  const card = GOLDEN.find((c) => c.name === 'Toph, the Blind Bandit');
  if (card === undefined) throw new Error('Toph is not in the golden corpus');
  expect(card.faces[0]?.oracleText).toContain(CDA_LINE);
  const stored = fromGoldenCard({
    ...card,
    faces: card.faces.map((f) => ({ ...f, oracleText: CDA_LINE })),
  });
  const imported = importCard(stored, undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const TOPH = tophPowerOnly();
const NAME = TOPH.name;

test('the card is valid and lowers to a characteristic-defining power of the counters on the lands you control', () => {
  expect(validateCard(TOPH)).toEqual([]);
  const statics = TOPH.faces[0]?.abilities.filter((a) => a.kind === 'static') ?? [];
  expect(statics).toHaveLength(1);
  expect(statics[0]).toMatchObject({
    kind: 'static',
    static: {
      kind: 'characteristicPt',
      power: {
        kind: 'countersAmong',
        counter: '+1/+1',
        filter: { types: ['land'], controller: 'you' },
      },
    },
  });
});

describe('the power follows the +1/+1 counters on your lands', () => {
  test('no counters: power 0 (toughness 3 is printed)', () => {
    const g = scenario().define(TOPH).seat(0).battlefield(NAME, 'Forest', 'Forest').seat(1).build();
    g.expect.pt(NAME, 0, 3);
  });

  test('counters on two lands are added together', () => {
    const g = scenario()
      .define(TOPH)
      .seat(0)
      .battlefield(NAME)
      .battlefield('Forest', { counters: { '+1/+1': 2 } })
      .battlefield('Forest', { counters: { '+1/+1': 1 } })
      .seat(1)
      .build();
    g.expect.pt(NAME, 3, 3);
  });

  test('other counters and counters on a permanent that is not a land do not count', () => {
    const g = scenario()
      .define(TOPH)
      .seat(0)
      .battlefield(NAME)
      .battlefield('Forest', { counters: { charge: 3, '+1/+1': 1 } })
      .battlefield('Grizzly Bears', { counters: { '+1/+1': 2 } })
      .seat(1)
      .build();
    g.expect.pt(NAME, 1, 3);
  });

  test('with three seats, the lands of opponents are not counted (CR 109.4)', () => {
    const g = scenario({ seats: 3 })
      .define(TOPH)
      .seat(0)
      .battlefield(NAME)
      .battlefield('Forest', { counters: { '+1/+1': 1 } })
      .seat(1)
      .battlefield('Forest', { counters: { '+1/+1': 5 } })
      .seat(2)
      .battlefield('Forest', { counters: { '+1/+1': 7 } })
      .build();
    g.expect.pt(NAME, 1, 3);
  });
});

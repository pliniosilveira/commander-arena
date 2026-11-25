// Planeswalker Party deck (issue 132), group 12: Spark Double, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 614.12 and 707.2 (it enters as a copy of a permanent you control, with the copiable values, no counters), CR 707.9b (the exceptions are part of the copiable values),
// CR 205.4a (it isn't legendary: the legend rule leaves both), CR 306.5b (a copy of a planeswalker enters with its loyalty), CR 122.6 (an additional +1/+1 or loyalty counter).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const SPARK = real('Spark Double');
const KAZUUL = real('Kazuul, Tyrant of the Cliffs');
const NAHIRI = real('Nahiri, the Harbinger');
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Spark Double', () => {
  const build = (copy: string) =>
    scenario({ seats: 3 })
      .define(SPARK)
      .define(KAZUUL)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .hand(SPARK.name)
      .battlefield(copy)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a copy of a legendary creature: with an additional +1/+1 counter, not legendary: both stay', () => {
    const g = build(KAZUUL.name);
    g.act(0).cast(SPARK.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(`${KAZUUL.name}[0]`);
    g.passAll();
    g.expect.derived(`${KAZUUL.name}[1]`, { supertypes: [], types: ['creature'] });
    g.expect.counters(`${KAZUUL.name}[1]`, { '+1/+1': 1 });
    g.expect.zone(KAZUUL.name, 'battlefield', { seat: 0 });
  });

  test('a copy of a planeswalker: its loyalty and one more, not legendary', () => {
    const g = build(NAHIRI.name);
    g.act(0).cast(SPARK.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(`${NAHIRI.name}[0]`);
    g.passAll();
    g.expect.derived(`${NAHIRI.name}[1]`, { supertypes: [], types: ['planeswalker'] });
    g.expect.counters(`${NAHIRI.name}[1]`, { loyalty: 5 });
  });
});

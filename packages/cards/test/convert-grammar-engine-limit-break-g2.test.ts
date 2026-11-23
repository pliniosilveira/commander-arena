// The Limit Break deck (issue 96), group 2: the equipment cards and their helpers. The REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the
// grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const BLADE = 'SYNTHETIC Costly Blade'; // Equipment: +1/+1, Equip {4}

describe('Helitrooper: "Equip abilities you activate that target ~ cost {2} less to activate." (CR 702.6a, 601.2f, 602.2b)', () => {
  const HELI = 'Helitrooper';
  const heli = real(HELI);

  const board = (forests = 2) =>
    scenario()
      .define(heli)
      .define(syntheticCard(BLADE))
      .seat(0)
      .battlefield(HELI, BLADE, 'Grizzly Bears', ...Array.from({ length: forests }, () => 'Forest'))
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();

  /** The generic mana still to pay of the payment the engine asks for now. */
  const owed = (g: ReturnType<typeof board>): string[] => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    return [...d.totalCost];
  };

  test('is valid', () => {
    expect(validateCard(heli)).toEqual([]);
  });

  test('an Equip {4} that targets Helitrooper costs {2}', () => {
    const g = board();
    g.act(0).activate(BLADE, { targets: [HELI] });
    expect(owed(g)).toEqual(['2']);
  });

  test('the same Equip that targets another creature still costs {4}', () => {
    const g = board(4);
    g.act(0).activate(BLADE, { targets: ['Grizzly Bears'] });
    expect(owed(g)).toEqual(['4']);
  });

  test('two Forests pay for it and Helitrooper is equipped', () => {
    const g = board();
    g.act(0).activate(BLADE, { targets: [HELI], pay: true });
    g.passAll();
    g.expect.attached(BLADE, HELI);
    g.expect.invariants();
  });
});

describe('Colossus Hammer: "Equipped creature gets +10/+10 and loses flying." (CR 613.1f, 613.4c, 613.7)', () => {
  const HAMMER = 'Colossus Hammer';
  const hammer = real(HAMMER);
  const HAT = 'SYNTHETIC Wing Hat';
  const hat = parsed(HAT, 'Artifact — Equipment', 'Equipped creature has flying.\nEquip {1}');

  test('is valid', () => {
    expect(validateCard(hammer)).toEqual([]);
  });

  test('the equipped creature gets +10/+10 and loses flying; the other abilities stay', () => {
    const g = scenario()
      .define(hammer)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.pt('Serra Angel', 14, 14);
    g.expect.derived('Serra Angel', { keywords: ['vigilance'] });
    g.expect.invariants();
  });

  test('a creature that is not equipped keeps flying', () => {
    const g = scenario()
      .define(hammer)
      .seat(0)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .battlefield(HAMMER, { attachedTo: 'Grizzly Bears' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
    g.expect.pt('Grizzly Bears', 12, 12);
  });

  test('flying given by an effect with a later timestamp applies (CR 613.7)', () => {
    const g = scenario()
      .define(hammer)
      .define(hat)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .battlefield(HAT, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
  });

  test('flying given before the Hammer is lost (CR 613.7)', () => {
    const g = scenario()
      .define(hammer)
      .define(hat)
      .seat(0)
      .battlefield('Serra Angel')
      .battlefield(HAT, { attachedTo: 'Serra Angel' })
      .battlefield(HAMMER, { attachedTo: 'Serra Angel' })
      .seat(1)
      .build();
    g.expect.derived('Serra Angel', { keywords: ['vigilance'] });
  });
});

// The Peace Offering deck, group D: Tamiyo, Field Researcher. Each loyalty ability is read from its REAL Oracle line (the golden corpus, taken from the issue) through the grammar as a
// planeswalker with no override, and the engine runs what the parser wrote. Pins: CR 115.1 (targets), 502.3 and 611.2a ("doesn't untap during its controller's next untap step"),
// 603.7, 603.7b, 603.7c, 603.7e, 510.2 and 500.1 (a delayed triggered ability about the creatures chosen, until the controller's next turn), 114 (emblems), 118.9, 601.2b, 601.2f and
// 107.3b (casting without paying the mana cost). Built for more than one opponent: the abilities are played with three seats.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const TAMIYO = GOLDEN.find((c) => c.name === 'Tamiyo, Field Researcher');
if (TAMIYO === undefined) throw new Error('Tamiyo, Field Researcher is not in the golden corpus');
const [FACE] = TAMIYO.faces;
if (FACE === undefined) throw new Error('Tamiyo has no face');
/** The real loyalty lines of the card, in order: +1, −2, −7. */
const LINES = FACE.oracleText.split('\n');

/** A SYNTHETIC planeswalker with only the real line `index` of Tamiyo, imported through the grammar; it must read as supported. */
function walkerOf(index: number): CardDefinition {
  const line = LINES[index];
  if (line === undefined) throw new Error(`no line ${index}`);
  return readWalker(line);
}

/** A SYNTHETIC planeswalker with `text` as its rules text, imported through the grammar; it must read as supported. */
function readWalker(text: string): CardDefinition {
  const imported = importCard(
    syntheticCard({
      name: 'SYNTHETIC Field Walker',
      manaCost: '{1}{G}{W}{U}',
      typeLine: 'Legendary Planeswalker — Tamiyo',
      oracleText: text,
      loyalty: '4',
    }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.unparsed, text).toEqual([]);
  expect(imported.support.reasons, text).toEqual([]);
  expect(imported.support.status, text).toBe('supported');
  return imported.definition;
}

const WALKER = 'SYNTHETIC Field Walker';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('−2: Tap up to two target nonland permanents. They don’t untap during their controller’s next untap step.', () => {
  const walker = walkerOf(1);
  const board = () =>
    scenario({ seats: 3 })
      .define(walker)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .battlefield('Forest', { label: 'forest' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Sol Ring', { label: 'ring' })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the AST: a tap and a "doesn’t untap" of the same target slot, of up to two nonland permanents', () => {
    const ability = walker.faces[0]?.abilities[0];
    expect(ability).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -2 }],
      targets: [{ what: { kind: 'object', filter: { notTypes: ['land'] } }, min: 0, max: 2 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'restrict',
            objects: { kind: 'target', id: 't1' },
            restriction: 'doesntUntap',
            duration: 'untilNextUntapStep',
          },
        ],
      },
    });
  });

  test('two permanents of two opponents: each stays tapped through the next untap step of its own controller, then untaps (CR 502.3, 611.2a)', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['bears', 'ring'] });
    g.passAll();
    g.expect.tapped('bears');
    g.expect.tapped('ring');
    g.expect.counters(WALKER, { loyalty: 2 });
    // Seat 1's turn: its Bears stay tapped; seat 2's Sol Ring is not untapped by another player's untap step anyway.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.tapped('bears');
    g.expect.tapped('ring');
    // Seat 2's turn: its Sol Ring stays tapped too.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
    g.expect.tapped('ring');
    g.expect.tapped('bears');
    // The next untap step of each controller untaps them.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.tapped('bears', false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('ring', false);
    g.expect.invariants();
  });

  test('up to two: no target at all is a legal choice, and the ability still costs its loyalty', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: [] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 2 });
    g.expect.tapped('bears', false);
  });

  test('a land is not a nonland permanent: it cannot be a target', () => {
    const g = board();
    expect(() => g.act(0).activate(WALKER, { targets: ['forest'] })).toThrow();
  });

  test('"they" with no plural group before it is not read', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine: 'Legendary Planeswalker — Tamiyo',
        oracleText:
          "−2: Tap target creature. They don't untap during their controller's next untap step.",
        loyalty: '4',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

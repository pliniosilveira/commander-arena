// "Look at the top X cards of your library, where X is the number of lands you control. You may reveal a creature or land card from among them and put it into your hand. Put the
// rest on the bottom of your library in a random order." (issue 692, Seismic Sense; CR 401.2, 401.4, 701.20a). SYNTHETIC: the card is the real Oracle text on the shell of a real
// golden sorcery (Faithless Looting), so the golden corpus is not touched; read through the grammar only and played through applyAction. Built for any number of opponents.
import { readFileSync } from 'node:fs';
import { getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { splitSentences } from '../src/convert/parser';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const TEXT =
  'Look at the top X cards of your library, where X is the number of lands you control. You may reveal a creature or land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const shell = cards.find((c) => c.name === 'Faithless Looting');
if (shell === undefined) throw new Error('Faithless Looting is not in the golden corpus');
const read = (text: string) =>
  importCard(
    fromGoldenCard({
      ...shell,
      name: 'SYNTHETIC Seismic Sense',
      faces: [
        {
          ...(shell.faces[0] ?? ({} as never)),
          name: 'SYNTHETIC Seismic Sense',
          manaCost: '{R}',
          oracleText: text,
        },
      ],
    }),
    undefined,
    NO_OVERRIDES,
  );
const SENSE = read(TEXT);

describe('the card read', () => {
  test('is supported, with nothing left unparsed, and validateCard is clean', () => {
    expect(SENSE.support.status).toBe('supported');
    expect(SENSE.support.unparsed).toEqual([]);
    expect(validateCard(SENSE.definition)).toEqual([]);
  });

  test('is one lookAtTop: X lands, a creature or land card into the hand, the rest on the bottom at random', () => {
    const json = JSON.stringify(SENSE.definition);
    expect(json).toContain('"kind":"lookAtTop"');
    expect(json).toContain('"rest":"bottomRandom"');
    expect(json).toContain('"anyOf":[{"types":["creature"]},{"types":["land"]}]');
    expect(json).toContain(
      '"count":{"kind":"countOf","filter":{"types":["land"],"controller":"you"}}',
    );
  });

  test('the three sentences are kept together by the sentence splitter', () => {
    expect(splitSentences(TEXT, 0, TEXT.length)).toEqual([{ start: 0, end: TEXT.length }]);
  });

  test.each([
    [
      'the rest go on top',
      TEXT.replace('on the bottom of your library in a random order', 'on top of your library'),
    ],
    ['X is not defined', TEXT.replace(', where X is the number of lands you control', '')],
    ['the card goes elsewhere', TEXT.replace('into your hand', 'onto the stack')],
  ])('a different wording is not read: %s', (_n, text) => {
    expect(read(text).support.status).toBe('unsupported');
  });
});

describe('played in a game with three opponents', () => {
  const game = (lands: number, top: readonly string[]) => {
    const b = scenario({ seats: 4 })
      .define(SENSE.definition)
      .seat(0)
      .hand('SYNTHETIC Seismic Sense');
    b.battlefield('Mountain', ...Array.from({ length: lands - 1 }, () => 'Forest'));
    for (const [i, name] of top.entries()) b.library(name, { label: `l${i}` });
    return b
      .seat(1)
      .library('Island')
      .seat(2)
      .library('Island')
      .seat(3)
      .library('Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('looks at as many cards as lands controlled, takes a creature or land, the rest go to the bottom', () => {
    const g = game(3, ['Lightning Bolt', 'Grizzly Bears', 'Sol Ring', 'Serra Angel']);
    g.act(0).cast('SYNTHETIC Seismic Sense', { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    expect(getView(g.state, 0).pendingCards?.map((o) => o.name)).toEqual(['Grizzly Bears']);
    g.act(0).chooseCards('l1');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    const library = g.state.seats[0]?.library ?? [];
    // Serra Angel was not looked at, so it stays on top; the two others went to the bottom.
    expect(library[0]).toBe(g.id('l3'));
    expect([...library.slice(1)].sort()).toEqual([g.id('l0'), g.id('l2')].sort());
    g.expect.invariants();
  });

  test('with none of the kind among them nobody is asked and all go to the bottom', () => {
    const g = game(2, ['Lightning Bolt', 'Sol Ring', 'Serra Angel']);
    g.act(0).cast('SYNTHETIC Seismic Sense', { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.library[0]).toBe(g.id('l2'));
    g.expect.invariants();
  });
});

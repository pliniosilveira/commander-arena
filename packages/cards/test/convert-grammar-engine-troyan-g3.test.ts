// Planar Genesis ("Look at the top four cards ... You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. ...")
// and Mind into Matter ("Draw X cards. Then you may put a permanent card with mana value X or less from your hand onto the battlefield tapped."), read from their real Oracle text
// in the golden corpus and played in a game (CR 608.2c, 608.2d, 107.3a, 202.3e).
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const imported = (name: string) => {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card as GoldenCard), undefined, NO_OVERRIDES);
};

const genesis = imported('Planar Genesis');
const matter = imported('Mind into Matter');

describe('both cards are read completely', () => {
  test.each([genesis, matter])('$definition.name', (card) => {
    expect(card.support.status).toBe('supported');
    expect(card.support.unparsed).toEqual([]);
    expect(card.support.reasons).toEqual([]);
  });

  test('Planar Genesis lowers to a look at the top four with an unrevealed land taken tapped, else a card into the hand', () => {
    expect(genesis.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 4,
      take: {
        filter: { types: ['land'] },
        max: 1,
        to: 'battlefield',
        tapped: true,
        hidden: true,
        elseAnyToHand: true,
      },
      rest: 'bottomRandom',
    });
  });

  test('Mind into Matter lowers to a draw of X and an optional choice of a permanent card of mana value X or less', () => {
    const face = matter.definition.faces[0];
    expect(face?.spell?.x).toBe(true);
    expect(face?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: {
              zone: 'hand',
              controller: 'you',
              anyOf: [
                { types: ['artifact'] },
                { types: ['creature'] },
                { types: ['enchantment'] },
                { types: ['land'] },
                { types: ['planeswalker'] },
                { types: ['battle'] },
              ],
              manaValueAtMost: { kind: 'x' },
            },
            optional: true,
          },
          to: 'battlefield',
          tapped: true,
        },
      ],
    });
  });
});

describe('Planar Genesis in a game', () => {
  function game() {
    return scenario()
      .define(genesis.definition)
      .seat(0)
      .hand('Planar Genesis')
      .pool('GU')
      .library('Grizzly Bears', { label: 'a' })
      .library('Island', { label: 'b' })
      .library('Lightning Bolt', { label: 'c' })
      .library('Forest', { label: 'd' })
      .library('Swamp', { label: 'e' })
      .seat(1)
      .library('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  }

  test('taking a land puts it onto the battlefield tapped and nothing goes to the hand', () => {
    const g = game();
    g.act(0).cast('Planar Genesis', { pay: true });
    g.passAll();
    g.act(0).chooseCards('b');
    g.expect.zone('Island', 'battlefield');
    g.expect.tapped('Island', true);
    g.expect.handSize(0, 0);
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });

  test('declining the land puts a card of any kind into the hand instead', () => {
    const g = game();
    g.act(0).cast('Planar Genesis', { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).chooseCards('c');
    g.expect.zone('Lightning Bolt', 'hand');
    g.expect.handSize(0, 1);
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });
});

describe('Mind into Matter in a game', () => {
  test('X = 2: draws two cards, then only Grizzly Bears (mana value 2) is offered: the Bolt (mana value 1) is not a permanent card, the Angel (5) and the Spiders (4) cost too much', () => {
    const g = scenario()
      .define(matter.definition)
      .seat(0)
      .hand('Mind into Matter')
      .hand('Grizzly Bears', { label: 'bears' })
      .hand('Serra Angel', { label: 'angel' })
      .hand('Lightning Bolt', { label: 'bolt' })
      .pool('GUUU')
      .library('Giant Spider')
      .library('Giant Spider')
      .library('Giant Spider')
      .seat(1)
      .library('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Mind into Matter', { x: 2, pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toEqual([g.id('bears')]);
    g.act(0).chooseCards('bears');
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.tapped('Grizzly Bears', true);
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });
});

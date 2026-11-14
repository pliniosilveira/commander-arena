import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const spell = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Counted Choice',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC counted instruction fixture.',
    spell: { effect },
  });

const options = [
  { label: 'Card', effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  { label: 'Mana', effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['G'] } } },
] as const;

describe('counted independent instruction choices', () => {
  test('a dynamic count is fixed once, and each choice can differ', () => {
    const card = spell({
      kind: 'chooseOne',
      times: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
      options,
    });
    expect(validateCard(card)).toEqual([]);
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name, 'Plains', 'Plains')
      .library('Plains', 'Plains')
      .battlefield('Forest')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Card');
    g.act(0).chooseOption('Mana');
    g.expect.handSize(0, 3);
    expect(g.state.seats[0]?.manaPool.map((mana) => mana.color)).toEqual(['G']);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('zero repetitions never asks', () => {
    const card = spell({ kind: 'chooseOne', times: 0, options });
    expect(validateCard(card)).toEqual([]);
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Forest')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(0, 40);
  });

  test('a count of your sacrifices needs a sacrifice in the same sequence', () => {
    expect(
      validateCard(
        spell({
          kind: 'chooseOne',
          times: { kind: 'thisWay', what: 'sacrificedOwn' },
          options,
        }),
      ),
    ).not.toEqual([]);
  });

  test('excluding sacrificed cards needs a prior sacrifice and a graveyard choice', () => {
    expect(
      validateCard(
        spell({
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'graveyard', types: ['creature'] },
            exceptSacrificed: true,
          },
          to: 'hand',
        }),
      ),
    ).not.toEqual([]);
  });

  test('a sacrifice does not silently ignore the graveyard-choice exclusion', () => {
    expect(
      validateCard(
        spell({
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { types: ['creature'] },
            exceptSacrificed: true,
          },
        }),
      ),
    ).not.toEqual([]);
  });
});

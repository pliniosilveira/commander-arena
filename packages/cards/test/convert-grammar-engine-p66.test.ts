// The Vraska EDHREC deck, group 4 (stage P66, D-219): the REAL cards Draconic Visitor and Stridehangar Automaton of the owner's golden corpus read through the
// grammar only and played through applyAction. Stand-ins are SYNTHETIC (named so).
import { readFileSync } from 'node:fs';
import { applyAction, type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const VISITOR = real('Draconic Visitor');
const AUTOMATON = real('Stridehangar Automaton');

const TREASURES = parsed('SYNTHETIC Treasure Maker', 'Sorcery', 'Create two Treasure tokens.', {
  manaCost: '{R}',
});
const SOLDIERS = parsed(
  'SYNTHETIC Soldier Maker',
  'Sorcery',
  'Create two 1/1 white Soldier creature tokens.',
  {
    manaCost: '{W}',
  },
);

const on = (...cardsOnBattlefield: readonly CardDefinition[]) => {
  let b = scenario().define(VISITOR).define(AUTOMATON).define(TREASURES).define(SOLDIERS);
  b = b
    .seat(0)
    .hand(TREASURES.name, SOLDIERS.name)
    .battlefield('Mountain', { count: 2 })
    .battlefield('Plains');
  // Placed in this order, so the first has the oldest timestamp.
  for (const card of cardsOnBattlefield) b = b.battlefield(card.name);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
};

const names = (g: { state: import('@commander-arena/engine').GameState }) =>
  getView(g.state, 0)
    .battlefield.filter((o) => o.isToken)
    .map((o) => o.name)
    .sort();

describe('Draconic Visitor and Stridehangar Automaton (replacements of the creation of artifact tokens, CR 614.1a)', () => {
  test('read as replacement effects that name artifact tokens (CR 111.2)', () => {
    expect(VISITOR.faces[0]?.abilities.find((a) => a.kind === 'replacement')).toMatchObject({
      replacement: {
        kind: 'tokensInstead',
        mode: 'thatMany',
        what: { types: ['artifact'], token: true },
        token: { kind: 'custom', definition: { power: 5, toughness: 5, subtypes: ['Dragon'] } },
      },
    });
    expect(AUTOMATON.faces[0]?.abilities.find((a) => a.kind === 'replacement')).toMatchObject({
      replacement: {
        kind: 'tokensInstead',
        mode: 'plus',
        token: { kind: 'custom', definition: { power: 1, toughness: 1, subtypes: ['Thopter'] } },
      },
    });
  });

  test('with no such permanent the tokens are made as usual', () => {
    const g = on();
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    expect(names(g)).toEqual(['Treasure', 'Treasure']);
    g.expect.invariants();
  });

  test('Draconic Visitor: two Treasure tokens become two 5/5 Dragons with flying', () => {
    const g = on(VISITOR);
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    expect(names(g)).toEqual(['Dragon', 'Dragon']);
    const dragon = getView(g.state, 0).battlefield.find((o) => o.name === 'Dragon');
    expect([dragon?.power, dragon?.toughness]).toEqual([5, 5]);
    expect(dragon?.keywords).toContain('flying');
    g.expect.invariants();
  });

  test('a token that is not an artifact is made as usual', () => {
    const g = on(VISITOR, AUTOMATON);
    g.act(0).cast(SOLDIERS.name, { pay: true });
    g.passAll();
    expect(names(g)).toEqual(['Soldier', 'Soldier']);
  });

  test('Stridehangar Automaton: the Treasures are made and one Thopter with them', () => {
    const g = on(AUTOMATON);
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    expect(names(g)).toEqual(['Thopter', 'Treasure', 'Treasure']);
    g.expect.invariants();
  });

  // D-221 (CR 616.1): with both in play the player who would create the tokens chooses which replacement effect applies first, whatever their ages.
  const asked = (g: ReturnType<typeof on>) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption' || d.purpose !== 'replacement') throw new Error('no question');
    return d;
  };
  const keyOf = (g: ReturnType<typeof on>, card: CardDefinition): string => {
    const choice = asked(g).replacement?.choices.find((c) => c.objectName === card.name);
    if (choice === undefined) throw new Error(`no choice for ${card.name}`);
    return choice.option;
  };

  for (const [label, board] of [
    ['the Automaton older', [AUTOMATON, VISITOR]],
    ['the Visitor older', [VISITOR, AUTOMATON]],
  ] as const) {
    describe(`both in play, ${label}`, () => {
      test('the controller of the tokens is asked, with the better order first, and nothing is made before the answer', () => {
        const g = on(...board);
        g.act(0).cast(TREASURES.name, { pay: true });
        g.passAll();
        const d = asked(g);
        expect(d.seat).toBe(0);
        expect(d.options).toHaveLength(2);
        expect(d.options[0]).toBe(keyOf(g, AUTOMATON)); // three Dragons beat two
        expect(names(g)).toEqual([]);
        expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['tokens', 'tokens']);
        g.expect.invariants();
      });

      test('the Automaton first: the Thopter joins the Treasures and the Visitor replaces all three (CR 616.1f)', () => {
        const g = on(...board);
        g.act(0).cast(TREASURES.name, { pay: true });
        g.passAll();
        g.act(0).chooseOption(keyOf(g, AUTOMATON));
        expect(names(g)).toEqual(['Dragon', 'Dragon', 'Dragon']);
        expect(g.state.pending?.kind).toBe('priority');
        g.expect.invariants();
      });

      test('the Visitor first: two Dragons, and the Automaton no longer applies (the Dragons are not artifact tokens)', () => {
        const g = on(...board);
        g.act(0).cast(TREASURES.name, { pay: true });
        g.passAll();
        g.act(0).chooseOption(keyOf(g, VISITOR));
        expect(names(g)).toEqual(['Dragon', 'Dragon']);
        g.expect.invariants();
      });

      test('the opponent cannot answer, and an answer that is not an option is refused', () => {
        const g = on(...board);
        g.act(0).cast(TREASURES.name, { pay: true });
        g.passAll();
        const key = keyOf(g, VISITOR);
        expect(applyAction(g.state, 1, { kind: 'chooseOption', option: key }).ok).toBe(false);
        expect(applyAction(g.state, 0, { kind: 'chooseOption', option: 'nope' }).ok).toBe(false);
        expect(applyAction(g.state, 0, { kind: 'chooseOption', option: key }).ok).toBe(true);
      });
    });
  }

  test('a token that is not an artifact asks nothing', () => {
    const g = on(AUTOMATON, VISITOR);
    g.act(0).cast(SOLDIERS.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g)).toEqual(['Soldier', 'Soldier']);
  });

  test('two Draconic Visitors end the same in every order: nothing is asked', () => {
    const g = on(VISITOR, VISITOR);
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g)).toEqual(['Dragon', 'Dragon']);
  });

  test('two Stridehangar Automatons end the same in every order: two Thopters, nothing asked', () => {
    const g = on(AUTOMATON, AUTOMATON);
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g)).toEqual(['Thopter', 'Thopter', 'Treasure', 'Treasure']);
  });

  test('three effects: the question comes again after the first answer while the order still matters (CR 616.1f)', () => {
    const g = on(AUTOMATON, AUTOMATON, VISITOR);
    g.act(0).cast(TREASURES.name, { pay: true });
    g.passAll();
    // Visitor first leaves two Dragons (nothing else applies); an Automaton first leaves the Visitor and the other Automaton to order.
    expect(asked(g).options).toHaveLength(3);
    g.act(0).chooseOption(keyOf(g, VISITOR));
    expect(names(g)).toEqual(['Dragon', 'Dragon']);
  });

  test('the tokens a replacement makes are not tapped; a "plus" keeps the tapped state of the originals', () => {
    const TAPPED = parsed(
      'SYNTHETIC Tapped Treasure Maker',
      'Sorcery',
      'Create two tapped Treasure tokens.',
      { manaCost: '{R}' },
    );
    const g = scenario()
      .define(AUTOMATON)
      .define(TAPPED)
      .seat(0)
      .hand(TAPPED.name)
      .battlefield('Mountain')
      .battlefield(AUTOMATON.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TAPPED.name, { pay: true });
    g.passAll();
    const tokens = getView(g.state, 0).battlefield.filter((o) => o.isToken);
    expect(tokens.map((o) => [o.name, o.tapped]).sort()).toEqual([
      ['Thopter', false],
      ['Treasure', true],
      ['Treasure', true],
    ]);
    const h = scenario()
      .define(VISITOR)
      .define(TAPPED)
      .seat(0)
      .hand(TAPPED.name)
      .battlefield('Mountain')
      .battlefield(VISITOR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    h.act(0).cast(TAPPED.name, { pay: true });
    h.passAll();
    expect(
      getView(h.state, 0)
        .battlefield.filter((o) => o.isToken)
        .map((o) => [o.name, o.tapped]),
    ).toEqual([
      ['Dragon', false],
      ['Dragon', false],
    ]);
  });

  test("the opponent's tokens are not replaced", () => {
    const g = scenario()
      .define(VISITOR)
      .define(TREASURES)
      .seat(0)
      .battlefield(VISITOR.name)
      .library(...FILLER)
      .seat(1)
      .hand(TREASURES.name)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(TREASURES.name, { pay: true });
    g.passAll();
    const theirs = getView(g.state, 1)
      .battlefield.filter((o) => o.isToken && o.controller === 1)
      .map((o) => o.name);
    expect(theirs).toEqual(['Treasure', 'Treasure']);
  });
});

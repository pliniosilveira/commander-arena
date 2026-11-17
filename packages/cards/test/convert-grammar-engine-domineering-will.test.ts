import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const card = cards.find(({ name }) => name === 'Domineering Will');
if (card === undefined) throw new Error('Domineering Will is not in the golden corpus');

const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
expect(imported.support.unparsed).toEqual([]);
const WILL: CardDefinition = imported.definition;

describe('Domineering Will', () => {
  test('the targeted player takes control, the creatures untap, and they must block if able', () => {
    const g = scenario()
      .define(WILL)
      .seat(0)
      .hand(WILL.name)
      .battlefield('Island', { count: 4 })
      .battlefield('SYNTHETIC Vanilla 3/3')
      .battlefield('Grizzly Bears', { tapped: true })
      .battlefield('Llanowar Elves', { tapped: true })
      .seat(1)
      .build();

    g.act(0).cast(WILL.name, {
      targets: [{ player: 1 }, 'Grizzly Bears', 'Llanowar Elves'],
      pay: true,
    });
    g.passAll();

    const bears = getView(g.state, 0).battlefield.find((object) => object.name === 'Grizzly Bears');
    const elves = getView(g.state, 0).battlefield.find(
      (object) => object.name === 'Llanowar Elves',
    );
    expect(bears?.controller).toBe(1);
    expect(elves?.controller).toBe(1);
    g.expect.tapped('Grizzly Bears', false);
    g.expect.tapped('Llanowar Elves', false);

    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.passAll();
    g.expect.pending('declareBlockers', 1);
    expect(g.act(1).try.declareBlockers([])).toMatchObject({ ok: false });
    g.act(1).declareBlockers([
      { blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Vanilla 3/3' },
      { blocker: 'Llanowar Elves', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    g.expect.invariants();
  });
});

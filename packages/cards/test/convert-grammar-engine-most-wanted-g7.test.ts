// Most Wanted deck (issue 120), group 7: Discreet Retreat, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) as a card with no override and played through applyAction.
// "Enchanted land has \"{T}: Add two mana of any one color. Spend this mana only to cast outlaw spells or activate abilities of outlaw sources.\"" (CR 106.6, 700.12, 613.1f) and
// "Whenever you cast your first outlaw spell each turn, you draw a card and you lose 1 life." (CR 601.2i, 603.2, 700.12). The outlaw creatures are SYNTHETIC Power Shy (a Rogue)
// and the real Grizzly Bears (not an outlaw).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const RETREAT = real('Discreet Retreat');
const OUTLAW = 'SYNTHETIC Power Shy'; // {1}{R} Human Rogue
const BEARS = 'Grizzly Bears'; // {1}{G}, a Bear

const game = (hand: readonly string[], pool?: Record<string, number>) => {
  const b = scenario()
    .define(RETREAT)
    .seat(0)
    .life(20)
    .hand(...hand)
    .battlefield('Island')
    .battlefield(RETREAT.name, { attachedTo: 'Island' })
    .library('Forest', 'Forest', 'Forest');
  return (pool === undefined ? b : b.pool(pool)).seat(1).life(20).build();
};

describe('Discreet Retreat', () => {
  test('it is valid', () => {
    expect(validateCard(RETREAT)).toEqual([]);
  });

  test('the granted mana pays an outlaw spell, and the first outlaw spell of the turn draws and costs 1 life', () => {
    const g = game([OUTLAW]);
    g.act(0).tapForMana('Island', { color: 'R', ability: 1 });
    g.act(0).cast(OUTLAW, { pay: true });
    g.passAll();
    g.expect.zone(OUTLAW, 'battlefield', { seat: 0 });
    g.expect.life(0, 19);
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('the granted mana cannot pay a spell that is no outlaw', () => {
    const g = game([BEARS]);
    g.act(0).tapForMana('Island', { color: 'G', ability: 1 });
    g.expect.illegal(0, { cast: BEARS });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('a non-outlaw spell does not trigger it, and neither does a second outlaw spell the same turn', () => {
    const g = game([BEARS, OUTLAW, OUTLAW], { G: 2, R: 4 });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.act(0).cast(`${OUTLAW}[0]`, { pay: true });
    g.passAll();
    g.expect.life(0, 19);
    g.act(0).cast(`${OUTLAW}[0]`, { pay: true });
    g.passAll();
    g.expect.life(0, 19);
  });
});

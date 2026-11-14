// The Danitha deck (issue 26), group 7 (D-433): the REAL Oracle text of Restoration Magic (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a
// card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins:
// CR 702.183a (Tiered), CR 700.2h (the cost of the chosen mode is an additional cost), CR 601.2b-f (modes first, then the total cost), CR 702.11 (hexproof), CR 702.12 (indestructible),
// CR 119 (life gain), CR 700.2a (the modes are chosen as the spell is cast).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

describe('Restoration Magic', () => {
  const magic = real('Restoration Magic');
  const MAGIC = magic.name;

  const start = (lands: number) =>
    scenario()
      .define(magic)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(MAGIC)
      .battlefield(...Array.from({ length: lands }, () => 'Plains'))
      .battlefield(BEARS, { label: 'mine' })
      .battlefield('Llanowar Elves', { label: 'elves' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  const tapped = (g: ReturnType<typeof start>): number =>
    g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped).length;

  test('the card is valid; its three modes have the costs of the text, in order', () => {
    expect(validateCard(magic)).toEqual([]);
    const spell = magic.faces[0]?.spell;
    expect(spell?.chooseModes).toEqual({ min: 1, max: 1 });
    expect(spell?.modes?.map((m) => m.cost)).toEqual([
      [{ kind: 'mana', symbols: ['0'] }],
      [{ kind: 'mana', symbols: ['1'] }],
      [{ kind: 'mana', symbols: ['3', 'W'] }],
    ]);
  });

  test('Cure ({0}): the cost is {W} alone; the target has hexproof and indestructible', () => {
    const g = start(5);
    g.act(0).cast(MAGIC).modes(0).targets(['mine']).pay();
    expect(tapped(g)).toBe(1);
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof', 'indestructible'] });
    g.expect.derived('elves', { keywords: [] });
    g.expect.life(0, 20);
  });

  test('Cura ({1}): the cost is {W}{1}; the target is protected and you gain 3 life', () => {
    const g = start(5);
    g.act(0).cast(MAGIC).modes(1).targets(['elves']).pay();
    expect(tapped(g)).toBe(2);
    g.passAll();
    g.expect.derived('elves', { keywords: ['hexproof', 'indestructible'] });
    g.expect.life(0, 23);
  });

  test('Cura on an opponent’s permanent protects it, whoever it belongs to', () => {
    const g = start(5);
    g.act(0).cast(MAGIC).modes(1).targets(['theirs']).pay();
    g.passAll();
    g.expect.derived('theirs', { keywords: ['hexproof', 'indestructible'] });
  });

  test('Curaga ({3}{W}): the cost is {W}{3}{W}; every permanent you control is protected and you gain 6 life', () => {
    const g = start(5);
    g.act(0).cast(MAGIC).modes(2).pay();
    expect(tapped(g)).toBe(5);
    g.passAll();
    for (const mine of ['mine', 'elves']) {
      g.expect.derived(mine, { keywords: ['hexproof', 'indestructible'] });
    }
    g.expect.derived('theirs', { keywords: [] });
    g.expect.life(0, 26);
  });

  test('with only two Plains Curaga is not offered, and the cast does not stop the other two', () => {
    const g = start(2);
    g.act(0).cast(MAGIC);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
    if (d?.kind !== 'chooseModes') return;
    expect(d.sets).toEqual([[0], [1]]);
  });

  test('cast in response to a burn spell, Cure saves the creature: indestructible damage does not kill it', () => {
    const g = start(1);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.act(1).pass();
    // One Plains pays {W}, and the Elves can pay one more: the {0} and {1} tiers are offered, not {3}{W}.
    g.act(0).cast(MAGIC).modes(0).targets(['mine']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the spell is a legal play with a single land (the {0} tier), and not with none', () => {
    const one = start(1);
    one.expect.legal(0, { cast: MAGIC });
    const none = start(0);
    none.expect.illegal(0, { cast: MAGIC });
  });
});

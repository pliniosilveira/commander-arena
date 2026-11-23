// Issue #97 (Revival // Trance deck): Sabin, Master Monk, the REAL card of the golden corpus read through the grammar only (no override), defined in an engine scenario and played
// through applyAction. Blitz is CR 702.152a (the rules text was not available: UNVERIFIED); no Scryfall ruling was read beyond the owner's research file, and nothing below rests on one.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const SABIN = real('Sabin, Master Monk');
const FILLER = Array.from({ length: 30 }, () => 'Island');

const game = (zones: { hand?: string[]; graveyard?: string[] }) => {
  const b = scenario()
    .seat(0)
    .define(SABIN)
    .library(...FILLER);
  b.battlefield('Mountain', { count: 4 });
  for (const c of zones.hand ?? []) b.hand(c);
  for (const c of zones.graveyard ?? []) b.graveyard(c);
  return b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
};

describe('Sabin, Master Monk (Double strike; Blitz—{2}{R}{R}, Discard a card; may be cast from the graveyard using its blitz ability)', () => {
  test('the face has double strike, the blitz cost with its discard and the graveyard permission', () => {
    const face = SABIN.faces[0];
    expect(face?.alternativeCosts).toEqual([
      { kind: 'blitz', cost: [{ kind: 'mana', symbols: ['2', 'R', 'R'] }], discard: 1 },
    ]);
    expect(
      face?.abilities.some((a) => a.kind === 'static' && a.static.kind === 'castFromGraveyard'),
    ).toBe(true);
  });

  test('from the hand: blitzed for {2}{R}{R} and a discarded card, with haste, and sacrificed at the end step drawing a card', () => {
    const g = game({ hand: [SABIN.name, 'Island'] });
    g.act(0).cast(SABIN.name, { alternative: 'blitz', pay: true });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(SABIN.name, 'battlefield', { seat: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(SABIN.name, true);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(SABIN.name, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
  });

  test('from the graveyard: only the blitz cast is offered, and only with a card to discard', () => {
    const g = game({ graveyard: [SABIN.name], hand: ['Island'] });
    const card = g.find({ name: SABIN.name, zone: 'graveyard', seat: 0 })[0];
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && a.object === card?.id,
    );
    expect(options).toEqual([{ kind: 'castSpell', object: card?.id, alternative: 'blitz' }]);
    const empty = game({ graveyard: [SABIN.name] });
    const none = empty.find({ name: SABIN.name, zone: 'graveyard', seat: 0 })[0];
    expect(
      getLegalActions(empty.state, 0).filter(
        (a) => a.kind === 'castSpell' && a.object === none?.id,
      ),
    ).toEqual([]);
  });
});

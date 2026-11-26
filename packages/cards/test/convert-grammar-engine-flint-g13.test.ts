// Flint deck (issue 685), group 13: The Infamous Cruelclaw, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Whenever The Infamous Cruelclaw deals combat damage to a player, exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card
// rather than paying its mana cost." (CR 510.2, 701.13, 608.2g, 118.9, 701.9a): the lands before the nonland card stay exiled, the card is cast with a card of the hand discarded and no
// mana paid, and a player with nothing to discard cannot cast it.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const CLAW = real('The Infamous Cruelclaw');
const BEARS = 'Grizzly Bears'; // {1}{G}
const FILLER = ['Plains', 'Plains', 'Plains'] as const;

describe('The Infamous Cruelclaw (CR 701.13, 608.2g, 118.9, 701.9a)', () => {
  test('is valid and the cast discards one card instead of paying', () => {
    expect(validateCard(CLAW)).toEqual([]);
    expect(JSON.stringify(CLAW.faces[0]?.abilities)).toContain(
      '"payInstead":[{"kind":"discard","count":1}]',
    );
  });

  const table = (hand: readonly string[]) =>
    scenario({ seats: 3 })
      .define(CLAW)
      .seat(0)
      .library('Forest', 'Island', BEARS, ...FILLER)
      .hand(...hand)
      .battlefield(CLAW.name)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const hit = (g: ReturnType<typeof table>) => {
    g.playCombat({
      attack: [{ attacker: CLAW.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
  };

  test('the lands are exiled and stay, and the nonland card is cast by discarding a card, with no mana', () => {
    const g = table(['Plains']);
    hit(g);
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: BEARS, seat: 0, zone: 'exile' });
    // The discard is the cost: the one card of the hand is chosen.
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Island', 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
  });

  test('with no card in hand there is nothing to discard, so the card is not offered', () => {
    const g = table([]);
    hit(g);
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });
});

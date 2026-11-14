/**
 * Deck validation tests (SPEC test 26). All cards are SYNTHETIC; see validate-helpers.ts.
 */
import { describe, expect, test } from 'vitest';
import type { DeckValidation } from '../src/types';
import { validateDeck } from '../src/validate/index';
import { basicLand, card, faceOf, fillers, fullMain, legend, ONE } from './validate-helpers';

function codes(result: DeckValidation, severity = 'error'): string[] {
  return result.issues.filter((i) => i.severity === severity).map((i) => i.code);
}

describe('validateDeck: test 26', () => {
  const commander = legend('Synthetic Red Commander', ['R']);

  test('accepts a legal 100-card singleton deck', () => {
    const result = validateDeck({ commanders: [commander], main: fullMain(1) });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('rejects a 99-card deck and says how many cards it has', () => {
    const result = validateDeck({ commanders: [commander], main: fillers(98) });
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.code === 'deck-size');
    expect(issue?.message).toContain('99');
  });

  test('rejects a 101-card deck', () => {
    const result = validateDeck({ commanders: [commander], main: fillers(100) });
    expect(codes(result)).toEqual(['deck-size']);
    expect(result.issues[0]?.message).toContain('101');
  });

  test('rejects an off-identity card and lists it', () => {
    const blue = card('Synthetic Blue Spell', { identity: ['U'], typeLine: 'Instant' });
    const result = validateDeck({ commanders: [commander], main: fullMain(1, [ONE(blue)]) });
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.code === 'color-identity');
    expect(issue?.cards).toEqual(['Synthetic Blue Spell']);
  });

  test('rejects two copies of a non-basic card', () => {
    const bolt = card('Synthetic Bolt', { identity: ['R'], typeLine: 'Instant' });
    const result = validateDeck({
      commanders: [commander],
      main: fullMain(1, [{ card: bolt, count: 2 }]),
    });
    expect(codes(result)).toEqual(['singleton']);
    expect(result.issues[0]?.cards).toEqual(['Synthetic Bolt']);
  });

  test('rejects a banned card and a not-legal card; restricted is a warning', () => {
    const banned = card('Synthetic Banned', { legality: 'banned' });
    const notLegal = card('Synthetic Silver Border', { legality: 'not_legal' });
    const restricted = card('Synthetic Restricted', { legality: 'restricted' });
    const result = validateDeck({
      commanders: [commander],
      main: fullMain(1, [ONE(banned), ONE(notLegal), ONE(restricted)]),
    });
    expect(codes(result).sort()).toEqual(['banned', 'not-legal']);
    expect(codes(result, 'warning')).toEqual(['restricted']);
    expect(result.ok).toBe(false);
  });

  test('accepts cards that allow any number of copies, and a limited number', () => {
    const rats = card('Synthetic Rat Swarm', {
      typeLine: 'Creature — Rat',
      text: 'A deck can have any number of cards named Synthetic Rat Swarm.',
    });
    const dwarves = card('Synthetic Seven Dwarves', {
      typeLine: 'Creature — Dwarf',
      text: 'A deck can have up to seven cards named Synthetic Seven Dwarves.',
    });
    const ok = validateDeck({
      commanders: [commander],
      main: fullMain(1, [
        { card: rats, count: 30 },
        { card: dwarves, count: 7 },
      ]),
    });
    expect(ok.ok).toBe(true);
    const tooMany = validateDeck({
      commanders: [commander],
      main: fullMain(1, [{ card: dwarves, count: 8 }]),
    });
    expect(codes(tooMany)).toEqual(['singleton']);
  });

  test('accepts a legendary Vehicle as commander', () => {
    const vehicle = card('Synthetic Legendary Vehicle', {
      typeLine: 'Legendary Artifact — Vehicle',
      power: '*',
      toughness: '5',
    });
    expect(validateDeck({ commanders: [vehicle], main: fullMain(1) }).ok).toBe(true);
  });

  test('accepts a legal partner pair', () => {
    const a = legend('Synthetic Partner A', ['W'], {
      text: 'Partner (You can have two commanders.)',
    });
    const b = legend('Synthetic Partner B', ['B'], { text: 'Partner' });
    const result = validateDeck({ commanders: [a, b], main: fullMain(2) });
    expect(result.ok).toBe(true);
  });
});

describe('validateDeck: edge cases', () => {
  const commander = legend('Synthetic Green Commander', ['G']);

  test('many copies of a basic land are fine; the type line decides, not the name', () => {
    const forest = basicLand('Synthetic Forest', 'G');
    const wastes = basicLand('Synthetic Wastes', null);
    const result = validateDeck({
      commanders: [commander],
      main: fullMain(1, [
        { card: forest, count: 30 },
        { card: wastes, count: 5 },
      ]),
    });
    expect(result.ok).toBe(true);
  });

  test('a basic land of an off color breaks the identity', () => {
    const island = basicLand('Synthetic Island', 'U');
    const result = validateDeck({
      commanders: [commander],
      main: fullMain(1, [{ card: island, count: 10 }]),
    });
    expect(codes(result)).toEqual(['color-identity']);
  });

  test('CR 903.5d: a land with a basic land type must not produce off-identity mana', () => {
    // SYNTHETIC dual: identity data deliberately incomplete to isolate the 903.5d check.
    const dual = card('Synthetic Dual Land', {
      typeLine: 'Land — Forest Island',
      identity: ['G'],
      producedMana: ['G', 'U'],
    });
    const result = validateDeck({ commanders: [commander], main: fullMain(1, [ONE(dual)]) });
    expect(codes(result)).toEqual(['color-identity']);
  });

  test('a commander also in the main deck is a second copy', () => {
    const result = validateDeck({
      commanders: [commander],
      main: fullMain(1, [ONE(commander)]),
    });
    expect(codes(result)).toEqual(['singleton']);
  });

  test('no commander, and more than two commanders', () => {
    expect(codes(validateDeck({ commanders: [], main: fullMain(0) }))).toEqual(['commander']);
    const three = [legend('A'), legend('B'), legend('C')];
    const result = validateDeck({ commanders: three, main: fullMain(3) });
    expect(codes(result)).toEqual(['commander']);
  });

  test('a non-legendary creature is not an eligible commander', () => {
    const bear = card('Synthetic Bear', {
      typeLine: 'Creature — Bear',
      power: '2',
      toughness: '2',
    });
    const result = validateDeck({ commanders: [bear], main: fullMain(1) });
    expect(codes(result)).toEqual(['commander']);
  });

  test('a legendary non-creature without the commander text is not eligible', () => {
    const relic = card('Synthetic Relic', { typeLine: 'Legendary Artifact' });
    expect(codes(validateDeck({ commanders: [relic], main: fullMain(1) }))).toEqual(['commander']);
  });

  test('a card that says it can be your commander is eligible (CR 903.3a)', () => {
    const walker = card('Synthetic Walker', {
      typeLine: 'Legendary Planeswalker — Test',
      text: 'Synthetic Walker can be your commander.',
      identity: ['G'],
    });
    expect(validateDeck({ commanders: [walker], main: fullMain(1) }).ok).toBe(true);
  });

  test('a legendary Spacecraft needs power and toughness (CR 903.3)', () => {
    const without = card('Synthetic Ship', { typeLine: 'Legendary Artifact — Spacecraft' });
    const withPt = card('Synthetic Armed Ship', {
      typeLine: 'Legendary Artifact — Spacecraft',
      power: '3',
      toughness: '4',
    });
    expect(codes(validateDeck({ commanders: [without], main: fullMain(1) }))).toEqual([
      'commander',
    ]);
    expect(validateDeck({ commanders: [withPt], main: fullMain(1) }).ok).toBe(true);
  });

  test('an MDFC is judged by its front face; identity covers both faces', () => {
    const mdfc = card('Synthetic Front // Synthetic Back', {
      layout: 'modal_dfc',
      identity: ['G', 'U'],
      faces: [
        faceOf(legend('Synthetic Front', ['G'])),
        faceOf(card('Synthetic Back', { typeLine: 'Land' })),
      ],
    });
    const result = validateDeck({ commanders: [mdfc], main: fullMain(1) });
    expect(result.ok).toBe(true);
    const blue = card('Synthetic Blue Card', { identity: ['U'] });
    const red = card('Synthetic Red Card', { identity: ['R'] });
    const withCards = validateDeck({
      commanders: [mdfc],
      main: fullMain(1, [ONE(blue), ONE(red)]),
    });
    expect(withCards.issues.find((i) => i.code === 'color-identity')?.cards).toEqual([
      'Synthetic Red Card',
    ]);
  });

  test('an MDFC whose BACK face is the legendary creature is not an eligible commander', () => {
    const mdfc = card('Synthetic Land // Synthetic Creature', {
      layout: 'modal_dfc',
      faces: [
        faceOf(card('Synthetic Land', { typeLine: 'Land' })),
        faceOf(legend('Synthetic Creature')),
      ],
    });
    expect(codes(validateDeck({ commanders: [mdfc], main: fullMain(1) }))).toEqual(['commander']);
  });

  test('colorless cards, cards with no mana cost and a colorless commander', () => {
    const colorless = legend('Synthetic Colorless Commander', []);
    const result = validateDeck({
      commanders: [colorless],
      main: fullMain(1, [ONE(card('Synthetic Rock', { manaCost: '', typeLine: 'Artifact' }))]),
    });
    expect(result.ok).toBe(true);
    const off = validateDeck({
      commanders: [colorless],
      main: fullMain(1, [ONE(card('Synthetic Green Card', { identity: ['G'] }))]),
    });
    expect(codes(off)).toEqual(['color-identity']);
  });

  test('two commanders combine their identities for the main deck', () => {
    const a = legend('Synthetic Partner A', ['W'], { text: 'Partner' });
    const b = legend('Synthetic Partner B', ['B'], { text: 'Partner' });
    const wb = card('Synthetic Orzhov Card', { identity: ['W', 'B'] });
    const red = card('Synthetic Red Card', { identity: ['R'] });
    const result = validateDeck({
      commanders: [a, b],
      main: fullMain(2, [ONE(wb), ONE(red)]),
    });
    expect(result.issues.find((i) => i.code === 'color-identity')?.cards).toEqual([
      'Synthetic Red Card',
    ]);
  });

  test('reports Game Changers as info without failing the deck', () => {
    const gc = card('Synthetic Game Changer', { gameChanger: true });
    const result = validateDeck({
      commanders: [legend('Synthetic Cmdr')],
      main: fullMain(1, [ONE(gc)]),
    });
    expect(result.ok).toBe(true);
    const info = result.issues.find((i) => i.code === 'game-changers');
    expect(info?.severity).toBe('info');
    expect(info?.cards).toEqual(['Synthetic Game Changer']);
  });

  test('a banned commander is reported', () => {
    const banned = legend('Synthetic Banned Commander', [], { legality: 'banned' });
    const result = validateDeck({ commanders: [banned], main: fullMain(1) });
    expect(codes(result)).toEqual(['banned']);
  });
});

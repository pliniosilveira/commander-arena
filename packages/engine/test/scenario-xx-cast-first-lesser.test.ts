// "Whenever you cast your first instant or sorcery spell each turn, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana
// cost. If you don't, create a 2/1 red Monkey Pirate creature token. It gains haste until end of turn." (Baral and Kari Zev shape): the `castSpell` trigger with `firstOfKind`, a free cast
// whose filter reads the spell that triggered it (`manaValueBelow`, `sharesCardTypeWith`), and "if you don't" (`not` `didPrevious`, which a `castFree` answers).
// Pins: CR 601.2i and 603.2 (the first spell of the kind this turn), CR 202.3 (lesser mana value: strictly less), CR 205.2a (shares a card type), CR 603.3d (the spell that triggered is read
// while the ability is on the stack), CR 608.2g and 118.9 (the free cast), CR 608.2c ("if you don't"). The card is SYNTHETIC (src/cards/fixtures/synthetic-free-cast.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const PAIR = 'SYNTHETIC Lesser Pair';
const BOLT = 'Lightning Bolt'; // instant, mana value 1
const MURDER = 'Murder'; // instant, mana value 3
const DIVINATION = 'Divination'; // sorcery, mana value 3
const BEARS = 'Grizzly Bears'; // creature, mana value 2

const game = (hand: readonly string[]) =>
  scenario()
    .seat(0)
    .life(20)
    .hand(...hand)
    .battlefield(PAIR, 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain', 'Forest', 'Forest')
    .library('Island', 'Island', 'Island')
    .seat(1)
    .life(20)
    .battlefield('Typhoid Rats')
    .build();

const MONKEY = { name: 'Monkey Pirate', zone: 'battlefield' } as const;

describe('the card is valid', () => {
  test(PAIR, () => {
    expect(validateCard(syntheticCard(PAIR))).toEqual([]);
  });
});

describe('the free cast: a spell with strictly lesser mana value that shares a card type', () => {
  test('casting a Murder (3): only the Bolt (1, an instant) is offered, not the Divination (3, a sorcery), not the Bears (a creature)', () => {
    const g = game([MURDER, BOLT, DIVINATION, BEARS]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.legal).toEqual([g.id(BOLT)]);
  });

  test('the Bolt is cast for free: no token is created', () => {
    const g = game([MURDER, BOLT]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 17);
    expect(g.find({ name: 'Monkey Pirate', zone: 'battlefield' })).toHaveLength(0);
  });

  test('an equal mana value is not lesser: a Murder with another Murder in hand offers nothing', () => {
    const g = game([MURDER, MURDER]);
    g.act(0).cast('Murder[1]', { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    // Nothing is asked: the token is made, with haste for the turn (If you don't).
    expect(g.find(MONKEY)).toHaveLength(1);
  });
});

describe('"If you don\'t": the token, with haste until end of turn', () => {
  test('declining the free cast creates the token', () => {
    const g = game([MURDER, BOLT]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    g.act(0).chooseCards();
    expect(g.find(MONKEY)).toHaveLength(1);
    const token = g.view(0).battlefield.find((o) => o.name === 'Monkey Pirate');
    expect(token?.keywords).toContain('haste');
    g.expect.zone(BOLT, 'hand', { seat: 0 });
  });

  test('nothing could be cast: the token is created without a question', () => {
    const g = game([MURDER]);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    expect(g.find(MONKEY)).toHaveLength(1);
  });
});

describe('only the first instant or sorcery spell each turn triggers it', () => {
  test('the second spell of the turn does not trigger', () => {
    const g = game([MURDER, BOLT, DIVINATION]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // The Bolt (first) triggers: nothing in hand of lesser value (mana value 1 is the least): the token.
    expect(g.find(MONKEY)).toHaveLength(1);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    // No second trigger: still one token, nothing asked.
    expect(g.find(MONKEY)).toHaveLength(1);
    g.expect.pending('priority', 0);
  });

  test('a creature spell does not count and does not trigger', () => {
    const g = game([BEARS, MURDER]);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(g.find(MONKEY)).toHaveLength(0);
    g.act(0).cast(MURDER, { targets: [{ name: 'Typhoid Rats' }], pay: true });
    g.passAll();
    // The Murder is the first instant or sorcery this turn, though not the first spell.
    expect(g.find(MONKEY)).toHaveLength(1);
  });
});

// The Blight Curse deck, group "one-offs A": the REAL Oracle text of Fire Covenant, Cathartic Pyre, Hoarder's Greed and Tree of Perdition from the golden corpus goes through the grammar as
// a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 601.2b
// and 601.2d (X announced and damage divided as the spell is cast, each target getting at least 1), CR 119.4 (paying life), CR 701.9 (discard), CR 701.12a and 701.12g (an exchange of a life total with a toughness), CR 119.7 (a player who can't gain life).
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
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe('Fire Covenant', () => {
  const covenant = real('Fire Covenant');
  const COVENANT = covenant.name;

  const start = () =>
    scenario()
      .define(covenant)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(COVENANT)
      .battlefield('Swamp', 'Mountain', 'Swamp')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('pay X life as an additional cost, divide X as you choose: both creatures die (CR 601.2d, 119.4)', () => {
    const g = start();
    g.act(0).cast(COVENANT, { x: 6, targets: ['bears', 'spider'], divide: [2, 4], pay: true });
    g.expect.life(0, 14);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the shares are what each target is dealt, not an even split', () => {
    const g = start();
    g.act(0).cast(COVENANT, { x: 3, targets: ['bears', 'spider'], divide: [2, 1], pay: true });
    g.expect.life(0, 17);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.damage('spider', 1);
  });

  test('a division that does not add up to X is refused, as is a share of 0 (CR 601.2d)', () => {
    const g = start();
    expect(() =>
      g.act(0).cast(COVENANT, { x: 4, targets: ['bears', 'spider'], divide: [2, 1], pay: true }),
    ).toThrow();
    const h = start();
    expect(() =>
      h.act(0).cast(COVENANT, { x: 3, targets: ['bears', 'spider'], divide: [3, 0], pay: true }),
    ).toThrow();
  });

  test('X cannot be more than the life the caster can pay', () => {
    const g = start();
    expect(() =>
      g.act(0).cast(COVENANT, { x: 21, targets: ['bears'], divide: [21], pay: true }),
    ).toThrow();
  });
});

describe('Cathartic Pyre', () => {
  const pyre = real('Cathartic Pyre');
  const PYRE = pyre.name;

  const start = (hand: readonly string[] = [PYRE]) =>
    scenario()
      .define(pyre)
      .seat(0)
      .life(20)
      .library('Island', 'Swamp', 'Forest', 'Mountain', 'Plains')
      .hand(...hand)
      .battlefield('Mountain', 'Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the AST is two modes, the second a discard of up to two and a draw of as many as were discarded', () => {
    const face = JSON.stringify(pyre.faces[0]);
    expect(face).toContain('"modes"');
    expect(face).toContain('"upTo":true');
    expect(face).toContain('"thisWay"');
  });

  test('mode one: 3 damage to target creature (CR 700.2)', () => {
    const g = start();
    g.act(0).cast(PYRE, { modes: [0], targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.damage('theirs', 3);
  });

  test('mode two: discard two cards, then draw that many (CR 701.9, 608.2c)', () => {
    const g = start([PYRE, 'Forest', 'Swamp']);
    g.act(0).cast(PYRE, { modes: [1], pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest', 'Swamp');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'hand', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('mode two: discarding one card draws one, and discarding none draws none (up to two)', () => {
    const one = start([PYRE, 'Forest', 'Swamp']);
    one.act(0).cast(PYRE, { modes: [1], pay: true });
    one.passAll();
    one.act(0).chooseCards('Forest');
    one.expect.zone('Island', 'hand', { seat: 0 });
    one.expect.zone('Swamp', 'library', { seat: 0 });
    const none = start([PYRE, 'Forest', 'Swamp']);
    none.act(0).cast(PYRE, { modes: [1], pay: true });
    none.passAll();
    none.act(0).chooseCards();
    none.expect.zone('Island', 'library', { seat: 0 });
    none.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('mode two: with one card in hand only one may be discarded, and no more than two are offered', () => {
    const g = start([PYRE, 'Forest']);
    g.act(0).cast(PYRE, { modes: [1], pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards('Forest', 'Forest')).toThrow();
    g.act(0).chooseCards('Forest');
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('mode two with an empty hand discards nothing and draws nothing', () => {
    const g = start();
    g.act(0).cast(PYRE, { modes: [1], pay: true });
    g.passAll();
    g.expect.zone('Island', 'library', { seat: 0 });
  });
});

describe('Tree of Perdition', () => {
  const tree = real('Tree of Perdition');
  const TREE = tree.name;

  const start = (opponentLife: number, extra: readonly string[] = []) => {
    const b = scenario().define(tree);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(TREE, { label: 'tree' });
    for (const card of extra) b.seat(0).battlefield(card);
    return b
      .seat(1)
      .life(opponentLife)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
  };

  test('the opponent gains up to the toughness and the toughness becomes the life total they had (CR 701.12g)', () => {
    const g = start(5);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 13);
    g.expect.pt('tree', 0, 5);
    g.expect.invariants();
  });

  test('an opponent with more life than the toughness loses the difference and the creature grows', () => {
    const g = start(30);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 13);
    g.expect.pt('tree', 0, 30);
  });

  test('an opponent whose life total is the toughness changes nothing', () => {
    const g = start(13);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 13);
    g.expect.pt('tree', 0, 13);
  });

  test('an opponent with 1 life is given 13 and the creature becomes a 0/1', () => {
    const g = start(0 + 1);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 13);
    g.expect.pt('tree', 0, 1);
  });

  test('a player who can not gain life is not given a higher life total, and the exchange does not happen at all (CR 119.7, 701.12a)', () => {
    const g = start(5, ['SYNTHETIC Sour Idol']);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 5);
    g.expect.pt('tree', 0, 13);
  });

  test('a player who can not gain life can still be given a lower life total (CR 119.7)', () => {
    const g = start(30, ['SYNTHETIC Sour Idol']);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 13);
    g.expect.pt('tree', 0, 30);
  });

  test('what is exchanged is the toughness the creature has: counters count, and the set toughness is a base one with the counters on top (CR 701.12g, 613.4b, 613.4c)', () => {
    const b = scenario().define(tree);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(TREE, { label: 'tree', counters: { '+1/+1': 2 } });
    const g = b
      .seat(1)
      .life(5)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.expect.pt('tree', 2, 15);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 15);
    g.expect.pt('tree', 2, 7);
  });

  test('the ability taps it, so it can not be activated again until it untaps (CR 602.2)', () => {
    const g = start(5);
    g.act(0).activate(TREE, { targets: [{ player: 1 }] });
    g.expect.tapped('tree');
    expect(() => g.act(0).activate(TREE, { targets: [{ player: 1 }] })).toThrow();
  });
});

describe("Hoarder's Greed", () => {
  const greed = real("Hoarder's Greed");
  const GREED = greed.name;
  const SPIDER_MV4 = SPIDER; // {3}{G}: mana value 4
  const BEARS_MV2 = BEARS; // {1}{G}: mana value 2

  const start = (mine: readonly string[], theirs: readonly string[]) =>
    scenario()
      .define(greed)
      .seat(0)
      .life(20)
      .library(...mine)
      .hand(GREED)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .life(20)
      .library(...theirs)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('lose 2 life, draw two cards, then clash; a loss ends it (CR 701.30)', () => {
    const g = start(['Plains', 'Plains', BEARS_MV2, 'Plains'], [SPIDER_MV4, 'Plains']);
    g.act(0).cast(GREED, { pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.handSize(0, 2);
    // Both players are asked, in turn order (CR 101.4), whether to put the revealed card on the bottom.
    g.act(0).decline();
    g.act(1).decline();
    g.expect.librarySize(0, 2);
    g.expect.life(0, 18);
    g.expect.invariants();
  });

  test('a win repeats the whole process: lose 2, draw two, clash again (CR 701.30d)', () => {
    const g = start(
      ['Plains', 'Plains', SPIDER_MV4, 'Plains', 'Plains', 'Plains'],
      [BEARS_MV2, 'Plains', 'Plains'],
    );
    g.act(0).cast(GREED, { pay: true });
    g.passAll();
    g.act(0).decline(); // keep the Giant Spider (mana value 4) on top
    g.act(1).decline(); // keep the Grizzly Bears (mana value 2) on top
    // 4 beats 2: the process is done again, the Spider and a Plains are drawn, and the next card (a Plains, 0) loses to the Bears still on top.
    g.expect.life(0, 16);
    g.expect.handSize(0, 4);
    g.act(0).decline();
    g.act(1).decline();
    g.expect.life(0, 16);
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });

  test('equal mana values are not a win (CR 701.30d: higher than all other cards revealed)', () => {
    const g = start(['Plains', 'Plains', BEARS_MV2, 'Plains'], [BEARS_MV2, 'Plains']);
    g.act(0).cast(GREED, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.act(1).decline();
    g.expect.life(0, 18);
    g.expect.handSize(0, 2);
  });

  test('a card put on the bottom is out of the way: the next clash reveals the card under it', () => {
    const g = start(
      ['Plains', 'Plains', SPIDER_MV4, BEARS_MV2, 'Plains', 'Plains', 'Plains'],
      [BEARS_MV2, SPIDER_MV4, 'Plains', 'Plains'],
    );
    g.act(0).cast(GREED, { pay: true });
    g.passAll();
    g.act(0).decline(); // the Spider stays: it wins, 4 against 2
    g.act(1).accept(); // the Bears go to the bottom of the opponent's library
    // The process runs again: two cards drawn (Spider, Bears), then the clash reveals a Plains against the Spider that is now on top of their library: a loss.
    g.expect.life(0, 16);
    g.expect.handSize(0, 4);
    g.act(0).decline();
    g.act(1).decline();
    g.expect.life(0, 16);
  });

  test('a player with no card to reveal reveals nothing and is not asked', () => {
    const g = start(['Plains', 'Plains', 'Plains', 'Plains'], []);
    g.act(0).cast(GREED, { pay: true });
    g.passAll();
    // Only the controller revealed a card (a Plains, mana value 0), and it is higher than no other card: a win, so the process goes again until the library is out.
    g.act(0).decline();
    g.expect.handSize(0, 4);
  });
});

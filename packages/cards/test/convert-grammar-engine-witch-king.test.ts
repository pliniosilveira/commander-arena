// The Witch-king of Angmar deck: the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 701.21a (Sacrifice), CR 608.2d (the player who sacrifices chooses),
// CR 208.1 (power), CR 202.3 (mana value), CR 508.1 (attack triggers).
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

const ANGEL = 'Serra Angel'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const YARGLE = 'Yargle, Glutton of Urborg'; // legendary 9/3
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

describe('Witch-king, Bringer of Ruin', () => {
  const king = real('Witch-king, Bringer of Ruin');

  const attackBoard = (theirs: readonly string[]) => {
    const g = scenario()
      .define(king)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(king.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([king.name]);
    g.passAll();
    return g;
  };

  test('whenever it attacks the defending player sacrifices the creature with the least power (CR 701.21a)', () => {
    const g = attackBoard([ANGEL, BEARS, ELVES]);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('with two tied for the least power the defending player chooses between them only (CR 608.2d)', () => {
    const g = attackBoard([ANGEL, BEARS, BEARS]);
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[0]`);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Ringwraiths', () => {
  const wraiths = real('Ringwraiths');

  const cast = (target: string) => {
    const g = scenario()
      .define(wraiths)
      .seat(0)
      .library(...LIBRARY)
      .hand(wraiths.name)
      .pool('CCCCBB')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(target)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(wraiths.name, { pay: true });
    g.passAll();
    g.passAll();
    return g;
  };

  test('a legendary creature that gets -3/-3 makes its controller lose 3 life (CR 608.2c)', () => {
    const g = cast(YARGLE);
    g.expect.zone(YARGLE, 'graveyard', { seat: 1 });
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a creature that is not legendary only gets -3/-3 until end of turn: no life is lost', () => {
    const g = cast(ANGEL);
    g.expect.pt(ANGEL, 1, 1);
    g.expect.life(1, 40);
    g.expect.invariants();
  });
});

describe('Crypt of Agadeem', () => {
  const crypt = real('Crypt of Agadeem');
  const RATS = 'Typhoid Rats'; // black 1/1

  const board = (graveyard: readonly string[]) =>
    scenario()
      .define(crypt)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(crypt.name)
      .graveyard(...graveyard)
      .pool('CC')
      .at('precombatMain', { active: 0 })
      .build();

  test('{2}, {T}: adds {B} for each black creature card in your graveyard, and no other card counts (CR 106.1, 205.2a)', () => {
    const g = board([RATS, RATS, BEARS, ANGEL]);
    g.act(0).tapForMana(crypt.name, { ability: 2 });
    g.expect.pool(0, 'BB');
  });

  test('with no black creature card in the graveyard it adds nothing and is not offered', () => {
    const g = board([BEARS]);
    expect(g.act(0).try.tapForMana(crypt.name, { ability: 2 }).ok).toBe(false);
    g.expect.pool(0, 'CC');
  });
});

describe('The One Ring', () => {
  const ring = real('The One Ring');
  const BOLT = 'Lightning Bolt';

  const board = (cast: boolean) => {
    const g = scenario()
      .define(ring)
      .seat(0)
      .library(...LIBRARY)
      .hand(ring.name)
      .pool('CCCC')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    if (cast) {
      g.act(0).cast(ring.name, { pay: true });
      g.passAll();
    }
    return g;
  };

  test('when it enters and you cast it, you have protection from everything: an opponent cannot target you (CR 702.16)', () => {
    const g = board(true);
    g.act(0).pass();
    expect(() => g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true })).toThrow();
    g.expect.life(0, 40);
  });

  test('before it enters nothing protects you: the same spell can target you', () => {
    const g = board(false);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
  });
});

describe('Nazgûl', () => {
  const nazgul = real('Nazgûl');

  test('"A deck can have up to nine cards named Nazgûl" is a deck-construction line: a keyword with the limit and no effect in a game (CR 100.2a)', () => {
    const lines = nazgul.faces[0]?.abilities ?? [];
    expect(lines).toContainEqual({ kind: 'keyword', keyword: { kind: 'deckLimit', limit: 9 } });
  });

  test('it enters and the line does nothing: the Ring tempts its controller, nothing else happens', () => {
    const g = scenario()
      .define(nazgul)
      .seat(0)
      .library(...LIBRARY)
      .hand(nazgul.name)
      .pool('CCB')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(nazgul.name, { pay: true });
    g.passAll();
    g.expect.zone(nazgul.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

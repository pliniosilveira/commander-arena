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

describe('Stitch Together', () => {
  const stitch = real('Stitch Together');

  const play = (filler: number) => {
    const g = scenario()
      .define(stitch)
      .seat(0)
      .library(...LIBRARY)
      .hand(stitch.name)
      .graveyard(BEARS, ...Array.from({ length: filler }, () => 'Swamp'))
      .pool('BB')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(stitch.name, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  };

  test('with fewer than seven cards in the graveyard the creature card returns to its owner’s hand (CR 608.2c)', () => {
    const g = play(5); // six cards with the creature
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('threshold: with seven or more cards in the graveyard it returns to the battlefield instead (CR 614.1a)', () => {
    const g = play(6); // seven cards with the creature
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Witch-king of Angmar', () => {
  const king = real('Witch-king of Angmar');

  const attacked = (attackers: readonly string[], theirs: readonly string[]) => {
    const g = scenario()
      .define(king)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(king.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(attackers);
    g.advanceTo('combatDamage');
    return g;
  };

  test('whenever creatures deal combat damage to you, each opponent sacrifices one of the creatures that dealt it, of their choice (CR 603.2c, 701.21a, 608.2d)', () => {
    const g = attacked([ANGEL, BEARS], [ANGEL, BEARS, ELVES]);
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    // The Elves did not attack and dealt no damage: they are not offered.
    g.act(1).choosePermanents(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a single creature that dealt the damage is sacrificed without asking', () => {
    const g = attacked([ANGEL], [ANGEL, ELVES]);
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Orcish Bowmasters', () => {
  const bowmasters = real('Orcish Bowmasters');
  const DIVINATION = 'Divination'; // {2}{U}: draw two cards

  test('when it enters it deals 1 damage to any target, then amasses Orcs 1: a 0/0 Orc Army token with a +1/+1 counter (CR 701.47a)', () => {
    const g = scenario()
      .define(bowmasters)
      .seat(0)
      .library(...LIBRARY)
      .hand(bowmasters.name)
      .pool('CB')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(bowmasters.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 } as never);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  const opponentDraws = (draws: 'drawStep' | 'divination') => {
    const g = scenario()
      .define(bowmasters)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(bowmasters.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(DIVINATION)
      .battlefield('Island', 'Island', 'Island')
      .at(draws === 'drawStep' ? 'upkeep' : 'precombatMain', { active: 1 })
      .build();
    if (draws === 'drawStep') {
      g.advanceTo('draw');
    } else {
      g.act(1).cast(DIVINATION, { pay: true });
      g.passAll();
    }
    return g;
  };

  test('the first card an opponent draws in their draw step does not trigger it (CR 504.1)', () => {
    const g = opponentDraws('drawStep');
    g.expect.stack([]);
    g.expect.handSize(1, 2); // Divination and the card of the draw step
  });

  test('every other card an opponent draws does: two cards drawn by a spell trigger it twice', () => {
    const g = opponentDraws('divination');
    // Each trigger asks for its target as it is put on the stack (CR 603.3d): the player chooses the first, then the second.
    g.act(0).chooseTargets({ player: 1 } as never);
    g.act(0).chooseTargets({ player: 1 } as never);
    g.expect.stack([`${bowmasters.name} (ability)`, `${bowmasters.name} (ability)`]);
  });
});

describe('Echoing Return', () => {
  const echo = real('Echoing Return');

  const play = (graveyard: readonly string[], target: string) => {
    const g = scenario()
      .define(echo)
      .seat(0)
      .library(...LIBRARY)
      .hand(echo.name)
      .graveyard(...graveyard)
      .pool('B')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(echo.name, { targets: [target], pay: true });
    g.passAll();
    return g;
  };

  test('returns the target creature card and every other card with the same name from your graveyard to your hand (CR 201.2)', () => {
    const g = play([BEARS, BEARS, ELVES, ANGEL], `${BEARS}[0]`);
    g.expect.handSize(0, 2);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature card with a different name stays: only the target comes back when it is alone', () => {
    const g = play([BEARS, ELVES], BEARS);
    g.expect.handSize(0, 1);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });
});

describe('Minas Morgul, Dark Fortress', () => {
  const morgul = real('Minas Morgul, Dark Fortress');

  const activated = () => {
    const g = scenario()
      .define(morgul)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(morgul.name)
      .battlefield(BEARS)
      .pool('CCCB')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(morgul.name, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  };

  test('puts a shadow counter on the creature, which has shadow and is a Wraith in addition to its other types (CR 122.1b, 205.1b)', () => {
    const g = activated();
    g.expect.counters(BEARS, { shadow: 1 });
    g.expect.derived(BEARS, { subtypes: ['Bear', 'Wraith'], keywords: ['shadow'] });
    g.expect.invariants();
  });
});

describe('Nazgûl Battle-Mace', () => {
  const mace = real('Nazgûl Battle-Mace');

  const attacked = () => {
    const g = scenario()
      .define(mace)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(mace.name, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ELVES)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.passAll();
    return g;
  };

  test('the equipped creature has menace, deathtouch and annihilator 1 (CR 702.86a)', () => {
    const g = attacked();
    g.expect.derived(BEARS, { keywords: ['menace', 'deathtouch', 'annihilator'] });
  });

  test('an opponent who sacrifices a nontoken permanent to annihilator is asked to pay 3 life; if they do not, its controller puts the card onto the battlefield (CR 118.12a)', () => {
    const g = attacked();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.act(1).decline();
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('if they pay 3 life the card stays in their graveyard', () => {
    const g = attacked();
    g.act(1).accept();
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.life(1, 37);
    g.expect.invariants();
  });
});

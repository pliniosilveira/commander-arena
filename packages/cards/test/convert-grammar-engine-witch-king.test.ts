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

describe('The Darkness Crystal', () => {
  const crystal = real('The Darkness Crystal');
  const BOLT = 'Lightning Bolt';

  const exiledBears = () => {
    const g = scenario()
      .define(crystal)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(crystal.name, 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    return g;
  };

  test('a nontoken creature an opponent controls that would die is exiled instead and you gain 2 life (CR 614.1a)', () => {
    const g = exiledBears();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.life(0, 42);
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });

  test('{4}{B}{B}, {T}: the card it exiled enters tapped under your control with two additional +1/+1 counters (CR 607.2a, 122.6)', () => {
    const g = exiledBears();
    g.act(1).pass();
    g.act(0).activate(crystal.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.pt(BEARS, 4, 4);
    g.expect.invariants();
  });
});

describe('Flare of Malice', () => {
  const flare = real('Flare of Malice');
  const RATS = 'Typhoid Rats'; // a black creature

  const board = (mine: readonly string[]) =>
    scenario()
      .define(flare)
      .seat(0)
      .library(...LIBRARY)
      .hand(flare.name)
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL, BEARS)
      .at('precombatMain', { active: 0 })
      .build();

  test('you may sacrifice a nontoken black creature rather than pay its mana cost (CR 118.9, 701.21a)', () => {
    const g = board([RATS]);
    g.act(0).cast(flare.name, { alternative: 'sacrificePermanents', pay: true });
    g.passAll();
    g.expect.zone(RATS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('each opponent sacrifices the creature or planeswalker with the greatest mana value among theirs (CR 608.2d)', () => {
    const g = board([RATS]);
    g.act(0).cast(flare.name, { alternative: 'sacrificePermanents', pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('a creature that is not black cannot pay the alternative cost', () => {
    const g = board([BEARS]);
    expect(g.act(0).try.cast(flare.name, { alternative: 'sacrificePermanents' }).ok).toBe(false);
  });
});

describe('The Black Gate', () => {
  const gate = real('The Black Gate');

  const board = (opponentLife: number) =>
    scenario()
      .define(gate)
      .seat(0)
      .life(30)
      .library(...LIBRARY)
      .battlefield(gate.name, BEARS)
      .pool('CB')
      .seat(1)
      .life(opponentLife)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .at('precombatMain', { active: 0 })
      .build();

  test('the player with the most life is chosen, and the target creature cannot be blocked by their creatures this turn (CR 509.1b)', () => {
    const g = board(40);
    g.act(0).activate(gate.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('with a tie the controller chooses between the two players (CR 608.2d)', () => {
    const g = board(30);
    g.act(0).activate(gate.name, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseOption', purpose: 'playerChoice' });
    g.act(0).chooseOption('seat:1');
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 28);
  });
});

describe('Saw in Half', () => {
  const saw = real('Saw in Half');

  const board = (theirs: string) =>
    scenario()
      .define(saw)
      .seat(0)
      .library(...LIBRARY)
      .hand(saw.name)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(theirs)
      .at('precombatMain', { active: 0 })
      .build();
  const tokens = (g: ReturnType<typeof board>, name: string) =>
    g
      .view(1)
      .battlefield.filter((o) => o.name === name && o.controller === 1)
      .map((o) => [o.power, o.toughness]);

  test('destroy target creature; if it dies, its controller creates two tokens that are copies with half its power and toughness, rounded up (CR 707.9b, 107.1a)', () => {
    const g = board(ANGEL);
    g.act(0).cast(saw.name, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    expect(tokens(g, ANGEL)).toEqual([
      [2, 2],
      [2, 2],
    ]);
    g.expect.invariants();
  });

  test('half of an odd number is rounded up: a 1/1 gives 1/1 tokens', () => {
    const g = board(ELVES);
    g.act(0).cast(saw.name, { targets: [ELVES], pay: true });
    g.passAll();
    expect(tokens(g, ELVES)).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });
});

describe('Sauron, the Necromancer', () => {
  const sauron = real('Sauron, the Necromancer');

  const attacked = (ringBearer = false) => {
    const g = scenario()
      .define(sauron)
      .seat(0)
      .library(...LIBRARY)
      .ring(ringBearer ? 1 : 0)
      .battlefield(sauron.name, ringBearer ? { ringBearer: true } : {})
      .graveyard(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([sauron.name]);
    g.passAll();
    return g;
  };
  const tokens = (g: ReturnType<typeof attacked>) =>
    g
      .view(0)
      .battlefield.filter((o) => o.name === BEARS && o.controller === 0)
      .map((o) => ({ pt: [o.power, o.toughness], tapped: o.tapped }));

  test('whenever it attacks it exiles a creature card from your graveyard and makes a tapped and attacking token that is a 3/3 black Wraith copy of it with menace (CR 707.9b, 508.4)', () => {
    const g = attacked();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(tokens(g)).toEqual([{ pt: [3, 3], tapped: true }]);
    g.expect.invariants();
  });

  test('at the beginning of the next end step the token is exiled unless Sauron is your Ring-bearer (CR 603.7c)', () => {
    const g = attacked();
    g.advanceTo('end');
    // The delayed ability triggered as the end step began: it waits on the stack and resolves when both pass.
    g.passAll();
    expect(tokens(g)).toEqual([]);
  });

  test('when Sauron is your Ring-bearer the token stays (CR 701.54e)', () => {
    const g = attacked(true);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
  });
});

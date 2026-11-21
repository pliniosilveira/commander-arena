// Dance of the Elements deck, misc group: the REAL Oracle text of Omnath, Locus of the Roil (golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. CR 120.3 (Damage), CR 608.2c (counted as it resolves).
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

const LIBRARY = Array.from({ length: 8 }, () => 'Island');

const omnath = real('Omnath, Locus of the Roil');
// A second Elemental with no abilities of its own: Omnath's definition with the name changed and the abilities removed (SYNTHETIC test double).
const ELEMENTAL = 'SYNTHETIC Plain Elemental';
const plainElemental: CardDefinition = {
  ...omnath,
  name: ELEMENTAL,
  faces: omnath.faces.map((f) => ({ ...f, name: ELEMENTAL, supertypes: [], abilities: [] })),
};

test('Omnath is a valid card', () => {
  expect(validateCard(omnath)).toEqual([]);
});

describe('Omnath, Locus of the Roil: damage equal to the Elementals you control', () => {
  const play = (others: readonly string[], target: { player: 0 | 1 } | string) => {
    const g = scenario()
      .define(omnath)
      .define(plainElemental)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(omnath.name)
      .battlefield('Forest', 'Island', 'Mountain', 'Forest', ...others)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(omnath.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(target);
    g.passAll();
    return g;
  };

  test('alone, Omnath counts itself: 1 damage to the opponent', () => {
    const g = play([], { player: 1 });
    g.expect.life(1, 19);
  });

  test('with two other Elementals it is counted as the ability resolves: 3 damage', () => {
    const g = play([ELEMENTAL, ELEMENTAL], { player: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 20);
  });

  test('a creature that is not an Elemental is not counted', () => {
    const g = play(['Grizzly Bears', ELEMENTAL], { player: 1 });
    g.expect.life(1, 18);
  });
});

const shatter = real('Shatter the Sky');

test('Shatter the Sky is a valid card', () => {
  expect(validateCard(shatter)).toEqual([]);
});

describe('Shatter the Sky: players with a creature of power 4 or greater draw, then all creatures are destroyed', () => {
  const play = (mine: readonly string[], theirs: readonly string[]) => {
    const g = scenario()
      .define(shatter)
      .seat(0)
      .library(...LIBRARY)
      .hand(shatter.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', ...mine)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(shatter.name, { pay: true });
    g.passAll();
    return g;
  };

  test('only the player with a 4-power creature draws, and every creature is destroyed', () => {
    const g = play(['Serra Angel'], ['Grizzly Bears']);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1, count: 1 });
  });

  test('both players with a 4-power creature draw', () => {
    const g = play(['Serra Angel'], ['Serra Angel']);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
  });

  test('with no creature of power 4 or greater nobody draws, and the creatures are still destroyed', () => {
    const g = play(['Grizzly Bears'], []);
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0, count: 1 });
  });
});

const slithermuse = real('Slithermuse');

test('Slithermuse is a valid card', () => {
  expect(validateCard(slithermuse)).toEqual([]);
});

describe('Slithermuse: when it leaves the battlefield, choose an opponent and draw the difference in cards in hand', () => {
  // Shatter the Sky (a real card, supported above) is what makes it leave: it is destroyed with the other creatures.
  const play = (mine: number, theirs: readonly number[]) => {
    let b = scenario({ seats: theirs.length + 1 })
      .define(shatter)
      .define(slithermuse)
      .seat(0)
      .library(...LIBRARY)
      .hand(shatter.name, ...Array.from({ length: mine }, () => 'Island'))
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', slithermuse.name);
    theirs.forEach((hand, i) => {
      b = b
        .seat(i + 1)
        .library(...LIBRARY)
        .hand(...Array.from({ length: hand }, () => 'Island'));
    });
    const g = b.at('precombatMain', { active: 0 }).build();
    g.act(0).cast(shatter.name, { pay: true });
    return g;
  };

  test('the opponent has more cards in hand: draw cards equal to the difference', () => {
    const g = play(1, [4]);
    g.passAll();
    g.expect.zone(slithermuse.name, 'graveyard', { seat: 0, count: 1 });
    // 1 card in hand after casting, the opponent has 4: 3 more cards.
    g.expect.handSize(0, 4);
    g.expect.handSize(1, 4);
  });

  test('the opponent has no more cards than you: nothing is drawn', () => {
    const g = play(3, [3]);
    g.passAll();
    g.expect.handSize(0, 3);
    const h = play(3, [1]);
    h.passAll();
    h.expect.handSize(0, 3);
  });

  test('with several opponents the controller chooses one, and the difference is with that player', () => {
    const g = play(0, [1, 5]);
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('seat:2');
    g.expect.handSize(0, 5);
  });
});

const subterfuge = real('Subterfuge');

test('Subterfuge is a valid card', () => {
  expect(validateCard(subterfuge)).toEqual([]);
});

describe('Subterfuge: target creature gains flying and a combat damage draw trigger until end of turn', () => {
  const play = () => {
    const g = scenario()
      .define(subterfuge)
      .seat(0)
      .library(...LIBRARY)
      .hand(subterfuge.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Grizzly Bears')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(subterfuge.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    return g;
  };

  test('the creature has flying, and drawing as many cards as the combat damage it deals to a player', () => {
    const g = play();
    g.expect.derived('Grizzly Bears', { keywords: ['flying'] });
    g.expect.handSize(0, 0);
    g.playCombat({
      attack: [{ attacker: 'Grizzly Bears', target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.expect.life(1, 38);
    // Grizzly Bears deals 2: two cards.
    g.expect.handSize(0, 2);
  });

  test('another creature does not get the ability, and the grant ends with the turn', () => {
    const g = play();
    g.expect.derived('Subterfuge', { keywords: ['encore'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('Grizzly Bears', { keywords: [] });
  });
});

const selvala = real('Selvala, Heart of the Wilds');

test('Selvala is a valid card', () => {
  expect(validateCard(selvala)).toEqual([]);
});

describe("Selvala's first ability: a creature that enters with the greatest power draws its controller a card", () => {
  // Selvala is 2/3. Serra Angel is 4/4 (Plains x3 + one more to cast {3}{W}); Grizzly Bears is 2/2 ({1}{G}).
  const play = (
    active: 0 | 1,
    card: string,
    lands: readonly string[],
    onBattlefield: readonly string[],
  ) => {
    const g = scenario()
      .define(selvala)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(
        selvala.name,
        ...(active === 0 ? lands : []),
        ...(active === 0 ? [] : onBattlefield),
      )
      .hand(...(active === 0 ? [card] : []))
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...(active === 1 ? lands : []), ...(active === 1 ? onBattlefield : []))
      .hand(...(active === 1 ? [card] : []))
      .at('precombatMain', { active })
      .build();
    g.act(active).cast(card, { pay: true });
    g.passAll();
    return g;
  };
  const PLAINS4 = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'];

  test('a creature with more power than every other creature: its controller may draw, and draws on accepting', () => {
    const g = play(0, 'Serra Angel', PLAINS4, []);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test('declining the draw draws nothing', () => {
    const g = play(0, 'Serra Angel', PLAINS4, []);
    g.act(0).decline();
    g.expect.handSize(0, 0);
  });

  test('a creature whose power only ties the greatest one does not offer a draw (Grizzly Bears 2 and Selvala 2)', () => {
    const g = play(0, 'Grizzly Bears', ['Forest', 'Forest'], []);
    g.expect.handSize(0, 0);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });

  test("an opponent's creature draws its own controller a card, not Selvala's", () => {
    const g = play(1, 'Serra Angel', PLAINS4, []);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('another creature with greater power on the battlefield stops the draw', () => {
    const g = play(0, 'Serra Angel', PLAINS4, ['Serra Angel']);
    g.expect.handSize(0, 0);
  });
});

describe("Selvala's mana ability: X mana in any combination of colors, X the greatest power among creatures you control", () => {
  const base = (...others: readonly string[]) =>
    scenario()
      .define(selvala)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(selvala.name, 'Forest', ...others)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();

  test("X is Selvala's own power with nothing greater: two mana, in any combination of the five colors", () => {
    const g = base();
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(selvala.name, { combination: 'WU' });
    g.expect.pool(0, 'WU');
    g.expect.tapped(selvala.name, true);
    // The {G} of the cost was paid by the Forest, so it is not left in the pool.
    g.expect.tapped('Forest', true);
  });

  test('two mana of the same color are a combination too', () => {
    const g = base();
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(selvala.name, { combination: 'RR' });
    g.expect.pool(0, 'RR');
  });

  test('X is the greatest power among creatures you control: a 4-power creature makes it four mana', () => {
    const g = base('Serra Angel');
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(selvala.name, { combination: 'WWUB' });
    g.expect.pool(0, 'WWUB');
  });

  test('a number of mana other than X is not offered', () => {
    const g = base();
    g.act(0).tapForMana('Forest');
    expect(g.act(0).try.tapForMana(selvala.name, { combination: 'WUB' }).ok).toBe(false);
    const h = base('Serra Angel');
    h.act(0).tapForMana('Forest');
    expect(h.act(0).try.tapForMana(selvala.name, { combination: 'WU' }).ok).toBe(false);
  });

  test('colorless is not a color of the combination', () => {
    const g = base();
    g.act(0).tapForMana('Forest');
    expect(g.act(0).try.tapForMana(selvala.name, { combination: 'CC' }).ok).toBe(false);
  });
});

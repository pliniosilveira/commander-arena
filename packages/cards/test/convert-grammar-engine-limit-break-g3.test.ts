// The Limit Break deck (Final Fantasy Commander), group 3: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Cards: the three foretold spells that read "If this spell was cast
// from exile" (Lifestream's Blessing: "as you cast this spell", CR 601.2i, 107.3c; Ultimate Magic: Holy: CR 615 prevention; Ultimate Magic: Meteor: "for each opponent, choose",
// CR 608.2d, 701.8), Furious Rise (CR 607.2a, 611.2a: "until you exile another card with this enchantment"), Cait Sith, Fortune Teller (CR 603.12: "when you exile a card this way"),
// Inspiring Statuary (CR 702.126a: Improvise given to spells) and Summoning Materia (CR 601.3, 401.5: cast creature spells from the top of the library while equipped).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const blessing = real("Lifestream's Blessing");
const holy = real('Ultimate Magic: Holy');
const meteor = real('Ultimate Magic: Meteor');
const rise = real('Furious Rise');
const caitSith = real('Cait Sith, Fortune Teller');
const statuary = real('Inspiring Statuary');
const materia = real('Summoning Materia');

// SYNTHETIC creatures with the stats a test needs (the real cards of the deck are not in the scenarios).
const BIG = 'SYNTHETIC Big Wall';
const SMALL = 'SYNTHETIC Small Wall';
const big = parsed(BIG, 'Creature — Wall', '', { manaCost: '{1}', power: '5', toughness: '3' });
const small = parsed(SMALL, 'Creature — Wall', '', { manaCost: '{1}', power: '2', toughness: '2' });

const BEARS = 'Grizzly Bears'; // {1}{G} 2/2
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 14 }, () => 'Island');

describe('the seven cards are valid and supported', () => {
  for (const def of [blessing, holy, meteor, rise, caitSith, statuary, materia]) {
    test(def.name, () => {
      expect(validateCard(def)).toEqual([]);
    });
  }

  test('the real text reads as the nodes the engine runs', () => {
    expect(blessing.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'draw', count: { kind: 'asCast', of: { kind: 'aggregate', how: 'greatest' } } },
        { kind: 'conditional', condition: { kind: 'castFromZone', zone: 'exile' } },
      ],
    });
    expect(meteor.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage' },
        {
          kind: 'conditional',
          condition: { kind: 'castFromZone', zone: 'exile' },
          effect: { kind: 'chooseOnePerOpponentDestroy' },
        },
      ],
    });
    expect(statuary.faces[0]?.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: { notTypes: ['artifact'], controller: 'you' },
        keyword: { kind: 'improvise' },
      },
    });
  });
});

type Builder = ReturnType<typeof scenario>;

/** Foretells `name` in seat 0's turn 3 and goes to seat 1's turn 4 (its upkeep, priority with seat 1), as the foretell tests do (CR 702.143a: castable after the turn it was foretold). */
function foretold(b: Builder, name: string): ScenarioGame {
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  g.act(0).foretell(name, { pay: true });
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

/** The same, then on to the next turn of seat 0 in a game of `seats` players (a sorcery is cast in its owner's turn). */
function foretoldInOwnTurn(b: Builder, name: string, seats: number): ScenarioGame {
  const g = foretold(b, name);
  for (let i = 1; i < seats; i++) g.advanceTo('precombatMain', { turn: 'next' });
  g.expect.step('precombatMain', { active: 0 });
  return g;
}

describe("Lifestream's Blessing (CR 601.2i, 107.3c, 702.143a)", () => {
  const base = (): Builder =>
    scenario()
      .define(blessing)
      .define(big)
      .define(small)
      .seat(0)
      .life(10)
      .library(...LIBRARY)
      .battlefield(BIG, { label: 'big' })
      .battlefield(SMALL)
      .battlefield('Forest', { count: 9 })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain');

  test('cast from the hand: draws cards equal to the greatest power, no life', () => {
    const g = base().seat(0).hand(blessing.name).at('precombatMain', { active: 0 }).build();
    g.act(0).cast(blessing.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(5);
    g.expect.life(0, 10);
    g.expect.invariants();
  });

  test('the number is worked out as the spell is cast: killing the creature in response changes nothing', () => {
    const g = base().seat(0).hand(blessing.name).at('precombatMain', { active: 0 }).build();
    g.act(0).cast(blessing.name, { pay: true });
    g.pass(0);
    g.act(1).cast(BOLT, { pay: true, targets: ['big'] });
    g.passAll();
    g.expect.zone(BIG, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(5);
  });

  test('the spell on the stack holds the number', () => {
    const g = base().seat(0).hand(blessing.name).at('precombatMain', { active: 0 }).build();
    g.act(0).cast(blessing.name, { pay: true });
    expect(g.object({ name: blessing.name, zone: 'stack', seat: 0 }).stack?.castAmount).toBe(5);
  });

  test('cast from exile (foretold): also gains twice that much life', () => {
    const g = foretold(base().seat(0).hand(blessing.name), blessing.name);
    g.pass(1);
    g.act(0).cast(blessing.name, { alternative: 'foretell', pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(5);
    g.expect.life(0, 20);
    g.expect.invariants();
  });
});

describe('Ultimate Magic: Holy (CR 615.1, 702.143a)', () => {
  const base = (): Builder =>
    scenario()
      .define(holy)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(holy.name)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 });

  test('permanents you control gain indestructible until end of turn', () => {
    const g = base().at('precombatMain', { active: 0 }).build();
    g.act(0).cast(holy.name, { pay: true });
    g.passAll();
    g.expect.derived('bear', { keywords: ['indestructible'] });
  });

  test('from the hand it prevents no damage to you', () => {
    const g = base().at('precombatMain', { active: 0, priority: 0 }).build();
    g.act(0).cast(holy.name, { pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[1]', { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 17);
  });

  test('cast from exile it prevents all damage that would be dealt to you this turn', () => {
    const g = foretold(base(), holy.name);
    g.pass(1);
    g.act(0).cast(holy.name, { alternative: 'foretell', pay: true });
    g.passAll();
    g.expect.derived('bear', { keywords: ['indestructible'] });
    g.act(1).cast('Lightning Bolt[1]', { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.invariants();
  });
});

describe('Ultimate Magic: Meteor (CR 608.2d, 701.8, 102.2), four seats', () => {
  const base = (): Builder =>
    scenario({ seats: 4 })
      .define(meteor)
      .seat(0)
      .library(...LIBRARY)
      .hand(meteor.name)
      .battlefield(BEARS)
      .battlefield('Mountain', { count: 8 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Sol Ring')
      .battlefield('Forest', { count: 2 })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Island')
      .battlefield('Plains')
      .seat(3)
      .library(...LIBRARY)
      .battlefield(BEARS);

  test('from the hand it deals 7 damage to each creature and chooses nothing', () => {
    const g = base().at('precombatMain', { active: 0 }).build();
    g.act(0).cast(meteor.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 3 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
  });

  test('cast from exile the controller chooses one artifact or land for each opponent that has one, and all are destroyed together', () => {
    const g = foretoldInOwnTurn(base(), meteor.name, 4);
    g.act(0).cast(meteor.name, { alternative: 'foretell', pay: true });
    g.passAll();
    // Seat 1: the controller (not the opponent) chooses among that opponent's artifacts and lands.
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0, min: 1, max: 1 });
    g.act(0).choosePermanents({ name: 'Sol Ring', seat: 1 });
    // Seat 2, then seat 3, which has no artifact or land and is passed over.
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents({ name: 'Island', seat: 2 });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 2 });
    g.expect.zone('Plains', 'battlefield', { seat: 2 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    expect(g.state.seats[3]?.graveyard.length).toBe(1);
    g.expect.invariants();
  });

  test('the candidates of each question are one opponent’s artifacts and lands only', () => {
    const g = foretoldInOwnTurn(base(), meteor.name, 4);
    g.act(0).cast(meteor.name, { alternative: 'foretell', pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.legal).toHaveLength(3);
    expect(new Set(d.legal.map((id) => g.state.objects[id]?.owner))).toEqual(new Set([1]));
  });
});

describe('Inspiring Statuary (CR 702.126a, 613.1f)', () => {
  const board = () =>
    scenario()
      .define(statuary)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, 'Sol Ring')
      .battlefield(statuary.name)
      .battlefield('Sol Ring', { count: 2 })
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('a nonartifact spell you cast may tap artifacts for generic mana', () => {
    const g = board();
    g.act(0).cast(BEARS);
    const d = g.state.pending;
    if (d?.kind !== 'choosePayOptions')
      throw new Error(`expected choosePayOptions, got ${d?.kind}`);
    expect(d.mechanism).toBe('improvise');
  });

  test('an artifact spell has no improvise', () => {
    const g = board();
    g.act(0).cast('Sol Ring');
    expect(g.state.pending?.kind).not.toBe('choosePayOptions');
  });
});

describe('Furious Rise (CR 607.2a, 611.2a, 701.13)', () => {
  const base = (power: string): Builder => {
    const wall = parsed('SYNTHETIC Rise Wall', 'Creature — Wall', '', {
      manaCost: '{1}',
      power,
      toughness: '3',
    });
    return scenario()
      .define(rise)
      .define(wall)
      .seat(0)
      .library('Forest', 'Mountain', 'Plains', 'Swamp', ...LIBRARY)
      .battlefield(rise.name)
      .battlefield(wall.name)
      .seat(1)
      .library(...LIBRARY);
  };

  test('with a creature of power 4 or greater, the end step exiles the top card and you may play it', () => {
    const g = base('4').at('precombatMain', { active: 0, turn: 1 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    // The permission outlives the turn: in the next turn of seat 0 the land can be played.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 3 });
    g.expect.legal(0, { playLand: 'Forest' });
  });

  test('with no creature of power 4 or greater nothing happens', () => {
    const g = base('3').at('precombatMain', { active: 0, turn: 1 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Forest', { zone: 'exile' });
  });

  test('exiling another card with it ends the permission to play the first (CR 611.2a)', () => {
    const g = base('4').at('precombatMain', { active: 0, turn: 1 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    // Turn 3: the Forest is still playable until the next end step...
    g.expect.legal(0, { playLand: 'Forest' });
    g.advanceTo('end');
    g.passAll();
    // ...which exiled the next card (the Mountain went to the hand with the draw of turn 3): the permission for the Forest is gone, the Plains has one.
    g.expect.zone('Plains', 'exile', { seat: 0 });
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { playLand: 'Forest' });
    g.expect.legal(0, { playLand: 'Plains' });
  });

  test('it is the ability of the permanent that counts: another Furious Rise keeps its own card', () => {
    const g = base('4')
      .seat(0)
      .battlefield(rise.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('end');
    g.act(0).orderTriggers(0, 1);
    while (g.state.stack.length > 0) g.passAll();
    // Two copies each exiled one card (a Forest and a Mountain), each playable by its own permission.
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { playLand: 'Forest' });
    g.expect.legal(0, { playLand: 'Mountain' });
  });
});

describe('Cait Sith, Fortune Teller (CR 603.12, 701.13, 701.22a, 202.3)', () => {
  const base = (top: readonly string[]): Builder =>
    scenario()
      .define(caitSith)
      .define(big)
      .seat(0)
      .library(...top, ...LIBRARY)
      .battlefield(caitSith.name, { label: 'cait' })
      .battlefield(BIG, { label: 'big' })
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library(...LIBRARY);

  test('scry 1, exile the top card, play it this turn; the creature you target gets +X/+0, X its mana value', () => {
    const g = base([BEARS]).at('precombatMain', { active: 0 }).build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    // Scry 1: keep the Bears on top.
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [g.state.seats[0]?.library[0] as never], other: [] });
    // The Bears were exiled and may be cast this turn; the reflexive ability asks for its target.
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    // The reflexive ability asks for its target as it goes on the stack.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('big');
    g.passAll();
    // The Bears have mana value 2.
    g.expect.pt('big', 7, 3);
    // They can be cast this turn, at the timing of a creature spell: in the second main phase.
    g.advanceTo('postcombatMain');
    g.expect.legal(0, { cast: BEARS });
    g.expect.invariants();
  });

  test('a land has mana value 0: the target gets +0/+0 and the land can be played', () => {
    const g = base(['Forest']).at('precombatMain', { active: 0 }).build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).arrange({ top: [g.state.seats[0]?.library[0] as never], other: [] });
    g.act(0).chooseTargets('big');
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.pt('big', 5, 3);
    g.advanceTo('postcombatMain');
    g.expect.legal(0, { playLand: 'Forest' });
  });

  test('it happens at the beginning of combat on your turn only', () => {
    const g = base([BEARS]).at('precombatMain', { active: 1 }).build();
    g.advanceTo('beginningOfCombat');
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Summoning Materia (CR 601.3, 401.5, 301.5, 702.20)', () => {
  const base = (attached: boolean, top: string): ScenarioGame => {
    const b = scenario()
      .define(materia)
      .seat(0)
      .library(top, ...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .battlefield(materia.name, attached ? { attachedTo: 'bear' } : {})
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('equipped: the creature gets +2/+2 and vigilance', () => {
    const g = base(true, BEARS);
    g.expect.pt('bear', 4, 4);
    g.expect.derived('bear', { keywords: ['vigilance'] });
  });

  test('attached to a creature, you may cast creature spells from the top of your library', () => {
    const g = base(true, BEARS);
    g.expect.legal(0, { cast: BEARS });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only creature spells: a noncreature card on top is not offered', () => {
    const g = base(true, BOLT);
    g.expect.illegal(0, { cast: BOLT });
  });

  test('not attached: nothing can be cast from the top of the library', () => {
    const g = base(false, BEARS);
    g.expect.illegal(0, { cast: BEARS });
  });

  test('the equipped creature has "{T}: Add {G}"', () => {
    const g = base(true, BEARS);
    // The Bears are untapped and not summoning sick (they have been there): "{T}: Add {G}" puts a G in the pool.
    expect(g.act(0).try.tapForMana('bear').ok).toBe(true);
  });
});

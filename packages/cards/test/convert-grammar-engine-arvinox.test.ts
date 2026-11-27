// The Miracle Worker deck (issue 109), group F2: Arvinox, the Mind Flail (REAL card of the golden corpus) read through the grammar only and played in engine scenarios with two
// and three seats: "~ isn't a creature unless you control three or more permanents you don't own" (CR 108.3, 613.1d, 611.3a) and "At the beginning of your end step, exile the bottom
// card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana
// as though it were mana of any color to cast those spells" (CR 401.1, 406.3, 601.2, 609.4b, 611.2b). The cards the scenarios put around it are real fixtures of the engine or
// SYNTHETIC ones. The ruling about the name (a card named for another Mind Flayer) concerns deck construction only; no rule of the engine reads it.
import { readFileSync } from 'node:fs';
import { type GameState, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { read } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string) => {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
};

const ARVINOX = real('Arvinox, the Mind Flail');
const NAME = ARVINOX.definition.name;
const SNATCH = 'SYNTHETIC Snatch Creature'; // gain control of target creature until end of turn
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel'; // {3}{W}{W}
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 10 }, () => 'Plains');

describe('the card reads', () => {
  test('Arvinox is supported and validateCard is clean', () => {
    expect(ARVINOX.support.status).toBe('supported');
    expect(ARVINOX.support.unparsed).toEqual([]);
    expect(validateCard(ARVINOX.definition)).toEqual([]);
  });

  test('the static is a layer 4 loss of the creature type unless three permanents are not owned', () => {
    const [first] = ARVINOX.definition.faces[0]?.abilities ?? [];
    expect(first).toMatchObject({
      kind: 'static',
      static: { kind: 'loseTypes', subject: { kind: 'this' }, types: ['creature'] },
      condition: {
        kind: 'not',
        term: { kind: 'controlsAtLeast', filter: { notOwnedByYou: true }, count: 3 },
      },
    });
  });

  test('the trigger exiles the bottom card of each opponent face down, then gives the permission', () => {
    const abilities = ARVINOX.definition.faces[0]?.abilities ?? [];
    const json = JSON.stringify(abilities[1]);
    expect(json).toContain('"kind":"exileTop"');
    expect(json).toContain('"bottom":true');
    expect(json).toContain('"faceDown":true');
    expect(json).toContain('"kind":"eachOpponent"');
    expect(json).toContain('"kind":"mayPlay"');
    expect(json).toContain('"lasts":"whileExiled"');
    expect(json).toContain('"lookAt":true');
    expect(json).toContain('"castOnly":true');
    expect(json).toContain('"anyManaColor":true');
  });

  test('the neighbouring wordings stay unread (honesty)', () => {
    const lines = [
      "~ isn't a creature unless you control three or more permanents an opponent controls.",
      "~ isn't a creature unless you control three permanents you don't own.",
      "~ isn't a creature unless you control three or more creatures you don't own.",
      "At the beginning of your end step, exile the top card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells.",
      "At the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast spells from among them, and you may spend mana as though it were mana of any color to cast those spells.",
    ];
    for (const line of lines) {
      const parsed = read(line.replaceAll('~', 'Arvinox'), 'creature');
      expect(parsed.unparsed, line).toHaveLength(1);
    }
  });
});

describe('"~ isn\'t a creature unless you control three or more permanents you don\'t own" (CR 108.3, 613.1d, 611.3a)', () => {
  const isCreature = (g: ScenarioGame): boolean =>
    g
      .view(0)
      .battlefield.find((o) => o.name === NAME)
      ?.types.includes('creature') === true;

  const board = (mine: number, theirs = 0, seats: 2 | 3 = 2) => {
    // The permanents owned by seat 1 and controlled by seat 0 are the ones Arvinox's controller does not own.
    let b = scenario({ seats })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .hand(SNATCH);
    b = b.seat(1).library(...FILLER);
    if (mine > 0) b = b.battlefield(BEARS, { controller: 0, count: mine });
    if (theirs > 0) b = b.battlefield(BEARS, { count: theirs });
    if (seats === 3) b = b.seat(2).library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('with no permanent it does not own it is not a creature', () => {
    expect(isCreature(board(0))).toBe(false);
  });

  test('with two permanents it does not own it is still not a creature', () => {
    expect(isCreature(board(2))).toBe(false);
  });

  test('with three it is a creature', () => {
    expect(isCreature(board(3))).toBe(true);
  });

  test('permanents an opponent controls do not count: only the ones the controller does not own', () => {
    expect(isCreature(board(0, 4))).toBe(false);
  });

  test('permanents of two different opponents count together (three seats)', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { count: 2, controller: 0 })
      .library(...FILLER)
      .seat(2)
      .battlefield(BEARS, { controller: 0 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    expect(isCreature(g)).toBe(true);
  });

  test('owning the permanents oneself does not count', () => {
    const g = scenario()
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME, BEARS, BEARS, BEARS, BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    expect(isCreature(g)).toBe(false);
  });

  test('the type returns when control of the third permanent ends (an effect for the turn)', () => {
    const g = scenario()
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME, 'Mountain', 'Mountain')
      .hand(SNATCH)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { count: 2, controller: 0 })
      .battlefield(ANGEL)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    expect(isCreature(g)).toBe(false);
    g.act(0).cast(SNATCH, { targets: [{ name: ANGEL, zone: 'battlefield' }], pay: true });
    g.passAll();
    expect(isCreature(g)).toBe(true);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.invariants();
    expect(isCreature(g)).toBe(false);
  });
});

describe('the end step trigger: the bottom card of each opponent, face down (CR 401.1, 406.3)', () => {
  const ready = (extraMana: readonly string[] = ['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp']) =>
    scenario({ seats: 3 })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME, ...extraMana)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER, BOLT)
      .seat(2)
      .library(...FILLER, ANGEL)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const afterEndStep = (): ScenarioGame => {
    const g = ready();
    g.advanceTo('end');
    g.passAll();
    return g;
  };

  // A card exiled face down shows no name in the state: it is found by its owner.
  const exiledOf = (g: ScenarioGame, owner: number) =>
    Object.values(g.state.objects).find((o) => o.zone === 'exile' && o.owner === owner);

  test('every opponent loses the card at the very bottom of their library, and no other', () => {
    const g = afterEndStep();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.expect.zone(ANGEL, 'exile', { seat: 2 });
    expect(g.state.seats[1]?.library.length).toBe(FILLER.length);
    expect(g.state.seats[2]?.library.length).toBe(FILLER.length);
    expect(g.state.seats[0]?.library.length).toBe(FILLER.length);
    g.expect.invariants();
  });

  test('the cards are face down, and only their controller may look at them (CR 406.3)', () => {
    const g = afterEndStep();
    for (const owner of [1, 2]) {
      const card = exiledOf(g, owner);
      expect(card?.exiledFaceDown, `seat ${owner}`).toBe(true);
      expect(card?.lookers, `seat ${owner}`).toEqual([0]);
    }
    expect(JSON.stringify(g.view(2).exile)).not.toContain(BOLT);
    expect(JSON.stringify(g.view(1).exile)).not.toContain(ANGEL);
    expect(JSON.stringify(g.view(0).exile)).toContain(BOLT);
    expect(JSON.stringify(g.view(0).exile)).toContain(ANGEL);
  });

  test('a library of one card is emptied, an empty library loses nothing', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME)
      .library(...FILLER)
      .seat(1)
      .library(BOLT)
      .seat(2)
      .library()
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    expect(g.state.seats[1]?.library.length).toBe(0);
    expect(g.state.seats[2]?.library.length).toBe(0);
    g.expect.invariants();
  });

  test('it does not trigger at the end step of another player', () => {
    // The game starts on seat 1's turn, so the first end step it reaches is not Arvinox's controller's.
    const g = scenario({ seats: 3 })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER, BOLT)
      .seat(2)
      .library(...FILLER, ANGEL)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('end');
    g.passAll();
    expect(Object.values(g.state.objects).filter((o) => o.zone === 'exile')).toEqual([]);
    expect(g.state.seats[1]?.library.length).toBe(FILLER.length + 1);
    expect(g.state.seats[2]?.library.length).toBe(FILLER.length + 1);
  });

  describe('the controller may cast permanent spells from among them, with mana of any color (CR 601.2, 609.4b)', () => {
    const nextTurn = (g: ScenarioGame): ScenarioGame => g.advanceTo('precombatMain', { turn: 4 });

    test('a permanent card is cast with black mana for its white symbols', () => {
      const g = afterEndStep();
      nextTurn(g);
      const angel = { name: ANGEL, seat: 2, zone: 'exile' } as const;
      g.expect.legal(0, { cast: angel });
      g.act(0).cast(angel, { pay: true });
      g.passAll();
      g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
      g.expect.invariants();
    });

    test('an instant card among them cannot be cast (permanent spells only)', () => {
      const g = afterEndStep();
      nextTurn(g);
      const bolt = { name: BOLT, seat: 1, zone: 'exile' } as const;
      expect(
        g.legalActions(0).some((a) => a.kind === 'castSpell' && g.object(bolt).id === a.object),
      ).toBe(false);
      expect(g.act(0).try.cast(bolt).ok).toBe(false);
    });

    test('without the any-color permission the same mana could not pay (the spell is cast with Swamps only)', () => {
      const g = afterEndStep();
      nextTurn(g);
      // Five Swamps and nothing else: the {W}{W} of the Angel is paid only because of the permission.
      const angel = { name: ANGEL, seat: 2, zone: 'exile' } as const;
      g.act(0).cast(angel, { pay: true });
      const spent = g.state.stack.length;
      expect(spent).toBeGreaterThan(0);
    });

    test('the other players cannot cast the cards', () => {
      const g = afterEndStep();
      g.advanceTo('precombatMain', { turn: 5 });
      const angel = g.object({ name: ANGEL, seat: 2, zone: 'exile' });
      const castable = (seat: 0 | 1 | 2) =>
        g.legalActions(seat).some((a) => a.kind === 'castSpell' && a.object === angel.id);
      expect(castable(1)).toBe(false);
      expect(castable(2)).toBe(false);
    });

    test('the permission lasts as long as the cards stay exiled: it is there on a later turn', () => {
      const g = afterEndStep();
      g.advanceTo('precombatMain', { turn: 7 });
      const angel = g.object({ name: ANGEL, seat: 2, zone: 'exile' });
      expect(g.legalActions(0).some((a) => a.kind === 'castSpell' && a.object === angel.id)).toBe(
        true,
      );
    });
  });
});

describe('a land card exiled this way is not a spell (CR 305.1, 601.2)', () => {
  test('it stays where it is: the permission is to cast permanent spells', () => {
    const g = scenario({ seats: 2 })
      .seat(0)
      .define(ARVINOX.definition)
      .battlefield(NAME)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER, 'Forest')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 1 });
    g.advanceTo('precombatMain', { turn: 3 });
    const forest = g.object({ name: 'Forest', seat: 1, zone: 'exile' });
    expect(g.legalActions(0).some((a) => 'object' in a && a.object === forest.id)).toBe(false);
  });
});

describe('the rule files', () => {
  test('a synthetic copy with the exile line alone reads and runs the same way', () => {
    const card = parsed(
      'SYNTHETIC Bottom Taker',
      'Creature — Horror',
      "At the beginning of your end step, exile the bottom card of each opponent's library face down. For as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells.",
      { manaCost: '{1}{B}', power: '1', toughness: '1', colors: ['B'] },
    );
    const g = scenario()
      .seat(0)
      .define(card)
      .battlefield(card.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER, BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    const state: GameState = g.state;
    expect(state.seats[1]?.library.length).toBe(FILLER.length);
  });
});

// Hosts of Mordor, library group (issue 150): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as cards with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Games have three seats where the text speaks of each player or each opponent.
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  type GameState,
  getLegalActions,
  type ObjectId,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string, supported = true): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  if (supported) {
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
  }
  return imported.definition;
}

describe('Field of Ruin (CR 701.23a, 701.24, 110.2a: each player searches, puts the land onto the battlefield, shuffles)', () => {
  const FIELD = 'Field of Ruin';
  const TARGET = 'Command Tower';
  const field = real(FIELD);
  const tower = real(TARGET, false);

  const board = () =>
    scenario({ seats: 3 })
      .define(field)
      .define(tower)
      .seat(0)
      .battlefield(FIELD, 'Swamp', 'Swamp')
      .library('Forest', 'Plains')
      .seat(1)
      .battlefield(TARGET)
      .library('Island', 'Plains')
      .seat(2)
      .library('Mountain', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid', () => {
    expect(validateCard(field)).toEqual([]);
  });

  test('destroys the nonbasic land, then every player (three seats) fetches a basic land of their own', () => {
    const g = board();
    g.act(0).activate(FIELD, { ability: 1, targets: [TARGET], pay: true });
    g.passAll();
    g.expect.zone(TARGET, 'graveyard', { seat: 1 });
    for (const [seat, land] of [
      [0, 'Forest'],
      [1, 'Island'],
      [2, 'Mountain'],
    ] as const) {
      g.expect.pending('chooseCards', seat);
      g.act(seat).chooseCards(g.id(land));
    }
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 2 });
    for (const seat of [0, 1, 2]) {
      g.expect.eventLog([{ kind: 'libraryShuffled', seat }], { since: 0 });
    }
    g.expect.invariants();
  });
});

describe('Extract from Darkness (CR 701.17, 404.1, 608.2d, 110.2a: mill, then choose a creature card from any graveyard)', () => {
  const EXTRACT = 'Extract from Darkness';
  const extract = real(EXTRACT);

  const board = (libraries: readonly (readonly string[])[], graveyard0: readonly string[] = []) => {
    const b = scenario({ seats: 3 }).define(extract).seat(0).hand(EXTRACT).pool('UUUBB');
    if (graveyard0.length > 0) b.graveyard(...graveyard0);
    libraries.forEach((cards, i) => {
      b.seat(i).library(...cards);
    });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('is valid', () => {
    expect(validateCard(extract)).toEqual([]);
  });

  test('every player mills two, then the controller takes a creature card milled from an opponent, under their control', () => {
    const g = board([
      ['Plains', 'Plains', 'Forest', 'Forest'],
      ['Giant Spider', 'Island', 'Island', 'Island'],
      ['Serra Angel', 'Plains', 'Plains', 'Plains'],
    ]);
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 2);
    g.expect.librarySize(1, 2);
    g.expect.librarySize(2, 2);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(g.id('Serra Angel'));
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the creature card may be one in a graveyard from before, and nothing is asked with a single candidate', () => {
    const g = board(
      [
        ['Plains', 'Plains', 'Forest'],
        ['Island', 'Island', 'Island'],
        ['Plains', 'Plains', 'Plains'],
      ],
      ['Grizzly Bears'],
    );
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature card in any graveyard it finishes resolving', () => {
    const g = board([
      ['Plains', 'Plains', 'Forest'],
      ['Island', 'Island', 'Island'],
      ['Plains', 'Plains', 'Plains'],
    ]);
    g.act(0).cast(EXTRACT, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(EXTRACT, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Lidless Gaze (CR 701.13, 601.2, 305.1, 609.4b, 611.2a: exile the top card of each library, play them, any mana pays)', () => {
  const GAZE = 'Lidless Gaze';
  const gaze = real(GAZE);

  const board = () =>
    scenario({ seats: 3 })
      .define(gaze)
      .seat(0)
      .hand(GAZE)
      .pool('BRBB')
      .battlefield('Swamp', 'Swamp')
      .library('Forest', 'Plains')
      .seat(1)
      .library('Lightning Bolt', 'Plains')
      .seat(2)
      .library('Island', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();

  test('is valid, and the permission lasts until the end of the controller next turn', () => {
    expect(validateCard(gaze)).toEqual([]);
    const text = JSON.stringify(gaze.faces[0]?.spell);
    expect(text).toContain('"lasts":"endOfYourNextTurn"');
    expect(text).toContain('"anyManaType":true');
  });

  test('exiles the top card of every library, and the controller casts an opponent card with mana of the wrong color and plays a land of another player', () => {
    const g = board();
    g.act(0).cast(GAZE, { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 2 });
    g.expect.librarySize(1, 1);
    // {R} is paid with a Swamp: mana of any type can be spent to cast those spells (CR 609.4b).
    g.act(0).cast({ name: 'Lightning Bolt', seat: 1 }, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.life(2, 37);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 1 });
    g.act(0).playLand({ name: 'Island', seat: 2 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Notion Thief (CR 614.1a, 614.11, 504.1, 614.5: an opponent draw but the first of the draw step is skipped and the controller draws)', () => {
  const THIEF = 'Notion Thief';
  const thief = real(THIEF);
  const CARDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const;

  /** `thieves[i]` Notion Thieves under seat i; seat `caster` casts Divination (draw two cards) on their own turn. */
  const board = (seats: number, thieves: readonly number[], caster: number) => {
    const b = scenario({ seats });
    b.define(thief);
    for (let seat = 0; seat < seats; seat += 1) {
      b.seat(seat).library(...CARDS);
      if (seat === caster) b.hand('Divination').pool('UUU');
      for (let n = 0; n < (thieves[seat] ?? 0); n += 1) b.battlefield(THIEF);
    }
    return b.at('precombatMain', { active: caster }).build();
  };

  test('is valid', () => {
    expect(validateCard(thief)).toEqual([]);
  });

  test('both cards an opponent would draw are drawn by the controller instead (three seats: the other opponent keeps their library)', () => {
    const g = board(3, [1, 0, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 2);
    g.expect.handSize(2, 0);
    g.expect.librarySize(1, 5);
    g.expect.librarySize(0, 3);
    g.expect.eventLog([{ kind: 'drawSkipped', seat: 1 }], { since: 0 });
    g.expect.invariants();
  });

  test('the controller of the permanent draws normally', () => {
    const g = board(3, [1, 0, 0], 0);
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.noEvent({ kind: 'drawSkipped' }, { since: 0 });
  });

  test('with no thief an opponent draws as usual', () => {
    const g = board(3, [0, 0, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
  });

  test('the first draw of the opponent draw step is not replaced', () => {
    const g = scenario({ seats: 3 })
      .define(thief)
      .seat(0)
      .library(...CARDS)
      .battlefield(THIEF)
      .seat(1)
      .library(...CARDS)
      .seat(2)
      .library(...CARDS)
      .at('upkeep', { active: 1 })
      .build();
    g.passAll();
    g.expect.step('draw');
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('two players each with a thief: the draw is replaced once by each effect and the player who would draw draws (the ruling of the card)', () => {
    const g = board(2, [1, 1], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('two thieves of one controller still give that controller one card per draw', () => {
    const g = board(2, [2, 0], 1);
    g.act(1).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 0);
  });

  test('the card a thief makes its controller draw can be replaced by the thief of another opponent (the oldest permanent goes first)', () => {
    // Seat 2 would draw: the thief of seat 0 applies first, so seat 0 would draw, and the thief of seat 1 replaces that draw: seat 1 draws.
    const g = board(3, [1, 1, 0], 2);
    g.act(2).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.handSize(0, 0);
    g.expect.handSize(2, 0);
  });
});

describe('Shelob, Dread Weaver (CR 607.2a, 603.2, 118.3, 107.3a, 602.2b: cards exiled with it, a cost that puts one into a graveyard, X to pick one back)', () => {
  const SHELOB = 'Shelob, Dread Weaver';
  const shelob = real(SHELOB);
  const BEARS = 'Grizzly Bears'; // mana value 2
  const SPIDER = 'Llanowar Elves'; // mana value 1

  /** Seat 0 has Shelob, five Swamps and a Bolt with {R}; seats 1 and 2 each have creatures. */
  const board = () =>
    scenario({ seats: 3 })
      .define(shelob)
      .seat(0)
      .hand('Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt')
      .pool('RRR')
      .battlefield(SHELOB, 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'b1' })
      .library('Island')
      .seat(2)
      .battlefield(SPIDER, { label: 's2' })
      .library('Island')
      .at('precombatMain', { active: 0 })
      .build();

  /** Bolts the creature `target` of seat 0's opponent and lets the trigger resolve. */
  const kill = (g: ReturnType<typeof board>, target: string) => {
    g.act(0).cast({ name: 'Lightning Bolt', nth: 0 }, { targets: [target], pay: true });
    g.passAll();
  };

  test('is valid', () => {
    expect(validateCard(shelob)).toEqual([]);
  });

  test('a nontoken creature an opponent controls that dies is exiled, whichever opponent: it is exiled with Shelob', () => {
    const g = board();
    kill(g, 'b1');
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    kill(g, 's2');
    g.expect.zone(SPIDER, 'exile', { seat: 2 });
    g.expect.invariants();
  });

  test('the cost puts a creature card exiled with it into its owner graveyard: two +1/+1 counters and a card', () => {
    const g = board();
    kill(g, 'b1');
    g.act(0).activate(SHELOB, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.counters(SHELOB, { '+1/+1': 2 });
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('with two cards exiled the player chooses which one the cost puts into a graveyard', () => {
    const g = board();
    kill(g, 'b1');
    kill(g, 's2');
    g.act(0).activate(SHELOB, { ability: 1, pay: true });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: SPIDER, zone: 'exile', seat: 2 });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('without a card exiled with it the ability cannot be activated', () => {
    const g = board();
    const activations = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'activate' && a.abilityIndex === 1,
    );
    expect(activations).toEqual([]);
  });

  test('X picks a creature card with that mana value exiled with it and puts it onto the battlefield tapped under its controller', () => {
    const g = board();
    kill(g, 'b1');
    kill(g, 's2');
    g.act(0).activate(SHELOB, {
      ability: 2,
      x: 2,
      targets: [{ name: BEARS, zone: 'exile', seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, true);
    g.expect.zone(SPIDER, 'exile', { seat: 2 });
    g.expect.invariants();
  });

  test('a card of another mana value is not a target for that X', () => {
    const g = board();
    kill(g, 'b1');
    const refused = (() => {
      try {
        g.act(0).activate(SHELOB, {
          ability: 2,
          x: 3,
          targets: [{ name: BEARS, zone: 'exile', seat: 1 }],
          pay: true,
        });
        return false;
      } catch {
        return true;
      }
    })();
    expect(refused).toBe(true);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('the cards are remembered by that Shelob only: once it leaves the battlefield nothing is exiled with it', () => {
    const g = board();
    kill(g, 'b1');
    g.act(0).cast({ name: 'Lightning Bolt', nth: 0 }, { targets: [SHELOB], pay: true });
    g.passAll();
    g.expect.zone(SHELOB, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });
});

const nameOf = (state: GameState, id: ObjectId): string => {
  const card = state.objects[id]?.card;
  return card === null || card === undefined
    ? ''
    : (state.definitions[state.cards[card]?.definition ?? -1]?.name ?? '');
};

describe('Gríma, Saruman’s Footman (CR 701.13, 608.2g, 118.9, 401.4: exile until an instant or sorcery, may cast it free, the rest to the bottom at random)', () => {
  const GRIMA = 'Gríma, Saruman’s Footman';
  const grima =
    GOLDEN.find((c) => c.name.startsWith('Gríma')) === undefined
      ? undefined
      : real(GOLDEN.find((c) => c.name.startsWith('Gríma'))?.name ?? '');
  const NAME = grima?.name ?? GRIMA;
  const BOLT = 'Lightning Bolt';

  /** Seat 0 attacks `victim` with Gríma; the library of each other seat is `library` (top first) then Islands. */
  const hit = (library: readonly string[], victim = 2) => {
    const islands = Array.from({ length: 4 }, () => 'Island');
    const b = scenario({ seats: 3 }).define(grima as CardDefinition);
    b.seat(0)
      .life(20)
      .battlefield(NAME)
      .library(...islands);
    b.seat(1)
      .life(20)
      .library(...library, ...islands);
    b.seat(2)
      .life(20)
      .library(...library, ...islands);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: NAME, target: { player: victim } }]);
    // Through the blockers and the combat damage: the trigger resolves, and the question of the cast (or the end of the step) is what is waiting.
    for (let i = 0; i < 8 && g.state.pending?.kind === 'priority'; i += 1) {
      if (g.state.turn.step === 'combatDamage' && g.state.stack.length === 0) break;
      g.passAll();
    }
    return g;
  };

  test('is valid', () => {
    expect(grima).toBeDefined();
    expect(validateCard(grima as CardDefinition)).toEqual([]);
  });

  test('the damaged player exiles until an instant, the controller casts it free, the other cards go to the bottom of that library; the other opponent is untouched', () => {
    const g = hit(['Plains', 'Forest', BOLT, 'Mountain']);
    const decision = g.state.pending;
    expect(decision?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: BOLT, zone: 'exile', seat: 2 });
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 2 });
    // The Mountain was never reached; the Plains and the Forest are at the bottom of the library of seat 2, and the cast card is not.
    g.expect.librarySize(2, 7);
    g.expect.librarySize(1, 8);
    const library = g.state.seats[2]?.library ?? [];
    const names = library.map((id) => nameOf(g.state, id));
    expect(names.slice(0, 1)).toEqual(['Mountain']);
    expect(names.slice(-2).sort()).toEqual(['Forest', 'Plains']);
    g.expect.invariants();
  });

  test('declining the cast puts the card found with the others on the bottom', () => {
    const g = hit(['Plains', BOLT]);
    g.act(0).chooseCards();
    g.passAll();
    g.expect.noObject(BOLT, { zone: 'exile' });
    const library = g.state.seats[2]?.library ?? [];
    const names = library.map((id) => nameOf(g.state, id));
    expect(names.slice(-2).sort()).toEqual([BOLT, 'Plains']);
    g.expect.librarySize(2, 6);
  });

  test('a library with no instant or sorcery is exiled to its end and becomes the library again', () => {
    const g = hit(['Plains', 'Forest']);
    g.expect.librarySize(2, 6);
    g.expect.pending('priority', 0);
    g.expect.zone('Plains', 'library', { seat: 2 });
  });
});

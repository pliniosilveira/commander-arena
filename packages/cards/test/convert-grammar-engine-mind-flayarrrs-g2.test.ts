// Mind Flayarrrs deck, group 2 (Hunted Horror, Guiltfeeder, Grazilaxx, Illithid Scholar): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is
// defined in an engine scenario and is played through applyAction, with 3 and 4 seats so that "target opponent" and "defending player" are never read as "the other seat".
// Pins: CR 111.2 (a token is created under the control of the player the effect says creates it), CR 702.16a (protection from a color), CR 509.1h (an attacking creature that no
// creature blocks is unblocked; one that a creature blocks is blocked), CR 509.3c (becomes blocked), CR 508.5 (defending player), CR 119.3 (loss of life), CR 400.3 (return to the
// owner's hand). The CR text is not in the repository, so these numbers are the ones the code already cites and are unverified here.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const HORROR = real('Hunted Horror');
const GUILTFEEDER = real('Guiltfeeder');
const GRAZILAXX = real('Grazilaxx, Illithid Scholar');
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const CENTAUR = 'Centaur';

test('the three cards are valid definitions', () => {
  for (const card of [HORROR, GUILTFEEDER, GRAZILAXX]) expect(validateCard(card)).toEqual([]);
});

describe('Hunted Horror: "target opponent creates two 3/3 green Centaur creature tokens with protection from black"', () => {
  test('the tokens are 3/3 green Centaurs with protection from black, made for the target', () => {
    const trigger = HORROR.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [{ what: { kind: 'player', filter: 'opponent' } }],
      effect: {
        kind: 'createToken',
        count: 2,
        controller: { kind: 'target' },
        token: {
          kind: 'custom',
          definition: {
            power: 3,
            toughness: 3,
            colors: ['G'],
            subtypes: ['Centaur'],
            abilities: [
              { kind: 'keyword', keyword: { kind: 'protection', from: 'color', colors: ['B'] } },
            ],
          },
        },
      },
    });
  });

  for (const seats of [2, 3, 4] as const) {
    for (let victim = 1; victim < seats; victim += 1) {
      test(`with ${seats} seats the opponent in seat ${victim} gets both tokens, under their control, and no one else`, () => {
        let b = scenario({ seats }).define(HORROR);
        for (let s = 0; s < seats; s += 1) b = b.seat(s as 0).library(...LIBRARY);
        const g = b
          .seat(0)
          .hand(HORROR.name)
          .battlefield('Swamp')
          .battlefield('Swamp')
          .at('precombatMain', { active: 0, turn: 3 })
          .build();
        g.act(0).cast(HORROR.name, { pay: true });
        g.passAll();
        // CR 603.3d: the controller of the enters trigger chooses its target as it goes on the stack.
        // With one opponent the only target is chosen by the engine.
        if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: victim as 1 });
        g.passAll();
        const tokens = g.find({ name: CENTAUR });
        expect(tokens).toHaveLength(2);
        for (const t of tokens) {
          expect(t.controller).toBe(victim);
          expect(t.owner).toBe(victim);
        }
        for (const nth of [0, 1]) {
          const ref = { name: CENTAUR, seat: victim as 1, nth };
          g.expect.pt(ref, 3, 3);
          g.expect.derived(ref, {
            colors: ['G'],
            keywords: ['protection'],
            subtypes: ['Centaur'],
          });
        }
        g.expect.invariants();
      });
    }
  }
});

const BLACK_WALL = parsed('SYNTHETIC Parsed Black Wall', 'Creature — Wall', 'Vigilance', {
  manaCost: '{1}{B}',
  colors: ['B'],
  power: '0',
  toughness: '5',
});
const BEARS = 'Grizzly Bears';

/** A builder with every seat's library and a graveyard of `yards[seat]` cards. */
function table(seats: 3 | 4, yards: readonly number[]) {
  let b = scenario({ seats }).define(GUILTFEEDER).define(GRAZILAXX).define(BLACK_WALL);
  for (let s = 0; s < seats; s += 1) {
    b = b.seat(s as 0).library(...LIBRARY);
    const yard = yards[s] ?? 0;
    if (yard > 0) b = b.graveyard(...Array.from({ length: yard }, () => 'Forest'));
  }
  return b;
}

describe("Guiltfeeder: 'attacks and isn't blocked' (CR 509.1h)", () => {
  test('the trigger is about this creature being unblocked and counts the cards the defending player owns', () => {
    expect(GUILTFEEDER.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'becomesUnblocked', what: { kind: 'this' } },
      effect: {
        kind: 'loseLife',
        player: { kind: 'defendingPlayer' },
        amount: {
          kind: 'countOf',
          filter: { zone: 'graveyard', owner: { kind: 'defendingPlayer' } },
        },
      },
    });
  });

  for (const seats of [3, 4] as const) {
    for (let defender = 1; defender < seats; defender += 1) {
      test(`with ${seats} seats only the seat attacked (${defender}) loses life, one for each card in its own graveyard`, () => {
        const yards = [2, 3, 5, 7];
        const g = table(seats, yards)
          .seat(0)
          .battlefield(GUILTFEEDER.name)
          .at('precombatMain', { active: 0, turn: 3 })
          .build();
        g.advanceTo('declareAttackers');
        g.act(0).attack(GUILTFEEDER.name, { player: defender as 1 });
        g.advanceTo('declareBlockers');
        g.passAll();
        for (let s = 0; s < seats; s += 1) {
          g.expect.life(s as 0, s === defender ? 40 - (yards[s] ?? 0) : 40);
        }
        g.expect.invariants();
      });
    }
  }

  test('a defender with an empty graveyard loses nothing', () => {
    const g = table(3, [4, 0, 4])
      .seat(0)
      .battlefield(GUILTFEEDER.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(GUILTFEEDER.name, { player: 1 });
    g.advanceTo('declareBlockers');
    g.passAll();
    for (let s = 0; s < 3; s += 1) g.expect.life(s as 0, 40);
  });

  test('a blocked Guiltfeeder does not trigger', () => {
    const g = table(3, [0, 4, 4])
      .seat(0)
      .battlefield(GUILTFEEDER.name)
      .seat(1)
      .battlefield(BLACK_WALL.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(GUILTFEEDER.name, { player: 1 });
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BLACK_WALL.name, attacker: GUILTFEEDER.name }]);
    g.passAll();
    for (let s = 0; s < 3; s += 1) g.expect.life(s as 0, 40);
    g.expect.invariants();
  });

  test('another attacker does not trigger it, and attackers at two defenders are told apart', () => {
    const g = table(3, [0, 3, 6])
      .seat(0)
      .battlefield(GUILTFEEDER.name)
      .battlefield(BEARS)
      .seat(2)
      .battlefield(BLACK_WALL.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: GUILTFEEDER.name, target: { player: 1 } },
      { attacker: BEARS, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    g.act(2).declareBlockers([{ blocker: BLACK_WALL.name, attacker: BEARS }]);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(2, 40);
    g.expect.life(0, 40);
  });
});

describe("Grazilaxx, Illithid Scholar: 'Whenever a creature you control becomes blocked, you may return it'", () => {
  test('the first ability returns the blocked creature itself, optionally', () => {
    expect(GRAZILAXX.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'becomesBlocked', what: { types: ['creature'], controller: 'you' } },
      effect: { kind: 'moveToZone', objects: { kind: 'triggerSubject' }, to: 'hand' },
      optional: true,
    });
  });

  function blocked(seats: 3 | 4, answer: 'accept' | 'decline') {
    const g = table(seats, [])
      .seat(0)
      .battlefield(GRAZILAXX.name)
      .battlefield(BEARS)
      .seat(2)
      .battlefield(BLACK_WALL.name)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.advanceTo('declareBlockers');
    g.act(2).declareBlockers([{ blocker: BLACK_WALL.name, attacker: BEARS }]);
    g.passAll();
    if (answer === 'accept') g.act(0).accept();
    else g.act(0).decline();
    g.passAll();
    return g;
  }

  for (const seats of [3, 4] as const) {
    test(`with ${seats} seats accepting returns the blocked Bears to their owner's hand, not Grazilaxx and not the blocker`, () => {
      const g = blocked(seats, 'accept');
      g.expect.zone(BEARS, 'hand', { seat: 0 });
      g.expect.zone(GRAZILAXX.name, 'battlefield', { seat: 0 });
      g.expect.zone(BLACK_WALL.name, 'battlefield', { seat: 2 });
      g.expect.invariants();
    });

    test(`with ${seats} seats declining leaves the Bears in play`, () => {
      const g = blocked(seats, 'decline');
      g.expect.zone(BEARS, 'battlefield', { seat: 0 });
      g.expect.invariants();
    });
  }

  test('a creature an opponent controls becoming blocked does not trigger it', () => {
    const g = table(3, [])
      .seat(0)
      .battlefield(GRAZILAXX.name)
      .battlefield(BLACK_WALL.name)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 0 } }]);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: BLACK_WALL.name, attacker: BEARS }]);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

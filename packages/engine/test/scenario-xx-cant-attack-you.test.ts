// "Creatures with flying can't attack you or planeswalkers you control." (the `cantAttackYou` static ability).
// Pins: CR 508.1a (a restriction on which creatures may be declared as attackers), CR 506.3 (a player or a planeswalker can be
// attacked), CR 101.2 (a "can't" wins), CR 508.1 (read as the attackers are declared). All cards are SYNTHETIC
// (src/cards/fixtures/synthetic-play-rules.ts) or real fixtures; the flyer is Serra Angel and the ground creature Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import type { Builder } from './restriction-helpers';

const WARD = 'SYNTHETIC Skyward Ward'; // flyers can't attack you or your planeswalkers
const WARD_PLAYER = 'SYNTHETIC Skyward Ward Player'; // flyers can't attack you
const FLYER = 'Serra Angel';
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

function atAttackers(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

type Game = ReturnType<typeof atAttackers>;

function declaration(g: Game) {
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return d;
}

describe('CR 508.1a: creatures with flying cannot attack the controller of the ability', () => {
  test('without the ability the flyer attacks the player (the baseline)', () => {
    const g = atAttackers((b) => b.battlefield(FLYER));
    g.act(0).attack(FLYER);
    g.expect.combat({ attackers: [FLYER] });
  });

  test('the flyer is refused as an attacker of the player, a ground creature is not', () => {
    const g = atAttackers(
      (b) => b.battlefield(FLYER, BEARS),
      (b) => b.battlefield(WARD),
    );
    expect(declaration(g).candidates.map((c) => c.attacker)).toEqual([g.id(BEARS)]);
    expect(g.act(0).try.declareAttackers([{ attacker: FLYER }]).ok).toBe(false);
    g.act(0).attack(BEARS);
    g.expect.combat({ attackers: [BEARS] });
  });

  test('a flyer with nothing left to attack leaves no attack to declare', () => {
    const g = atAttackers(
      (b) => b.battlefield(FLYER),
      (b) => b.battlefield(WARD),
    );
    g.expect.pending('priority', 0);
    expect(g.state.combat).toBeNull();
  });

  test("the controller's own flyers attack an opponent who has no such ability", () => {
    const g = atAttackers((b) => b.battlefield(FLYER, WARD));
    g.act(0).attack(FLYER);
    g.expect.combat({ attackers: [FLYER] });
  });
});

describe('CR 506.3: planeswalkers', () => {
  test('the planeswalker form also protects the planeswalkers its controller controls', () => {
    const g = atAttackers(
      (b) => b.battlefield(FLYER, BEARS),
      (b) => b.battlefield(WARD, WALKER),
    );
    const candidates = declaration(g).candidates;
    expect(candidates.find((c) => c.attacker === g.id(FLYER))).toBeUndefined();
    expect(candidates.find((c) => c.attacker === g.id(BEARS))?.targets).toEqual([
      { kind: 'player', seat: 1 },
      { kind: 'permanent', object: g.id(WALKER) },
    ]);
  });

  test('the player-only form leaves the planeswalkers open to the flyer', () => {
    const g = atAttackers(
      (b) => b.battlefield(FLYER),
      (b) => b.battlefield(WARD_PLAYER, WALKER),
    );
    const flyer = declaration(g).candidates.find((c) => c.attacker === g.id(FLYER));
    expect(flyer?.targets).toEqual([{ kind: 'permanent', object: g.id(WALKER) }]);
    expect(g.act(0).try.declareAttackers([{ attacker: FLYER }]).ok).toBe(false);
    g.act(0).attack(FLYER, WALKER);
    g.expect.combat({ attackers: [FLYER], targets: [{ attacker: FLYER, target: WALKER }] });
  });
});

describe('the feature', () => {
  test('is supported', () => {
    expect(isFeatureSupported('static:cantAttackYou')).toBe(true);
  });

  test.each([WARD, WARD_PLAYER])('the fixture %s is a valid card', (name) => {
    const def = scenario()
      .seat(0)
      .battlefield(name)
      .build()
      .state.definitions.find((d) => d.name === name);
    expect(def && validateCard(def)).toEqual([]);
  });
});

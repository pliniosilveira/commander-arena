// "Can't attack" and "can't attack or block unless [condition]" (D-145).
// Pins: CR 508.1a (the attackers are chosen among the creatures that can attack), CR 509.1a (blockers among those that can block),
// CR 508.1c (restrictions on attacking are read when attackers are declared), CR 113.6 (a static ability works while the permanent is on
// the battlefield), CR 613.1f (a permanent that lost all abilities has none left), CR 613.11 (a rules-changing effect of a resolved
// spell is not an ability), CR 611.2a (until end of turn). Cards are SYNTHETIC (src/cards/fixtures/synthetic-attack-limits.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { attackedGame, type Builder, canBlock } from './restriction-helpers';

const SHY = 'SYNTHETIC Shy Colossus'; // can't attack or block unless you control another creature with power 4 or greater
const GUARD = 'SYNTHETIC Landbound Guard'; // can't block unless you control two or more lands
const CHARGER = 'SYNTHETIC Healthy Charger'; // can't attack unless you have 30 or more life
const AURA = 'SYNTHETIC Grounding Aura';
const CALM = 'SYNTHETIC Calm Down';
const BIG = 'SYNTHETIC Elf 5/2';
const SMALL = 'SYNTHETIC Goblin 1/1';
const BEARS = 'Grizzly Bears';

describe('the cards are valid', () => {
  test.each([SHY, GUARD, CHARGER, AURA, CALM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

function atAttackers(seat0: (b: Builder) => void) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  seat0(b);
  b.seat(1).library('Island', { count: 4 });
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('"can\'t attack unless ..." (CR 508.1a)', () => {
  test('without another creature with power 4 or greater it can not be declared', () => {
    const g = atAttackers((b) => b.battlefield(SHY, SMALL));
    g.expect.canAttack(SHY, false);
    g.expect.canAttack(SMALL, true);
  });

  test('with one it attacks like any creature', () => {
    const g = atAttackers((b) => b.battlefield(SHY, BIG));
    g.expect.canAttack(SHY, true);
  });

  test('"another": its own power does not count', () => {
    const g = atAttackers((b) => b.battlefield(SHY));
    g.expect.canAttack(SHY, false);
  });

  test('"another": a power of its own that is 4 or greater still does not count', () => {
    const g = atAttackers((b) => {
      b.battlefield(SHY);
      b.battlefield('SYNTHETIC Might Aura', { attachedTo: SHY });
    });
    g.expect.pt(SHY, 5, 5);
    g.expect.canAttack(SHY, false);
  });

  test("only your own creatures count, not an opponent's", () => {
    const b = scenario().seat(0).library('Island', { count: 4 }).battlefield(SHY);
    const g = b
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(BIG)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(SHY, false);
  });

  test('the engine refuses the declaration too, and the legal actions never list it', () => {
    const g = atAttackers((b) => b.battlefield(SHY, SMALL));
    expect(g.act(0).try.declareAttackers([{ attacker: SHY }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: SMALL }]).ok).toBe(true);
  });

  test('a condition about life: 30 or more makes it able, below it is not', () => {
    const high = scenario().seat(0).life(35).library('Island', { count: 4 }).battlefield(CHARGER);
    const g = high.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(CHARGER, true);
    const low = scenario().seat(0).life(29).library('Island', { count: 4 }).battlefield(CHARGER);
    const h = low.seat(1).library('Island').at('precombatMain', { active: 0 }).build();
    h.advanceTo('declareAttackers', { attack: false });
    h.expect.canAttack(CHARGER, false);
  });

  test('a power boost to another creature lifts it: the condition is read with the game as it is', () => {
    const g = atAttackers((b) => {
      b.battlefield(SHY, BEARS);
      b.battlefield('SYNTHETIC Might Aura', { attachedTo: BEARS });
    });
    // Grizzly Bears is 2/2 and the Aura makes it 4/4.
    g.expect.pt(BEARS, 4, 4);
    g.expect.canAttack(SHY, true);
  });

  test('losing the other creature takes it away again: it follows the board', () => {
    const b = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield(SHY, BIG)
      .library('Island', { count: 4 });
    const g = b.seat(1).library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
    g.act(0).cast('Lightning Bolt', { targets: [BIG], pay: true });
    g.passAll();
    g.expect.zone(BIG, 'graveyard', { seat: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(SHY, false);
  });
});

describe('"can\'t block unless ..." (CR 509.1a)', () => {
  test('the shy creature blocks only with a big friend', () => {
    const lone = attackedGame([BEARS], (b) => {
      b.battlefield(SHY);
    });
    expect(canBlock(lone, SHY, BEARS)).toBe(false);
    const withFriend = attackedGame([BEARS], (b) => {
      b.battlefield(SHY, BIG);
    });
    expect(canBlock(withFriend, SHY, BEARS)).toBe(true);
  });

  test('only blocking is limited by a "can\'t block" list: with one land the guard can not block, with two it can', () => {
    const one = attackedGame([BEARS], (b) => {
      b.battlefield(GUARD, 'Forest');
    });
    expect(canBlock(one, GUARD, BEARS)).toBe(false);
    const two = attackedGame([BEARS], (b) => {
      b.battlefield(GUARD, 'Forest', 'Forest');
    });
    expect(canBlock(two, GUARD, BEARS)).toBe(true);
  });

  test('a creature that "can\'t block" may still attack, and one that "can\'t attack" may still block', () => {
    const g = atAttackers((b) => b.battlefield(GUARD));
    g.expect.canAttack(GUARD, true);
    const blocker = attackedGame([BEARS], (b) => {
      b.battlefield(CHARGER);
    });
    expect(canBlock(blocker, CHARGER, BEARS)).toBe(true);
  });

  test('both restrictions are one ability: "can\'t attack or block" lifts for both at once', () => {
    const g = atAttackers((b) => b.battlefield(SHY, BIG));
    g.expect.canAttack(SHY, true);
    const blocks = attackedGame([BEARS], (b) => {
      b.battlefield(SHY, BIG);
    });
    expect(canBlock(blocks, SHY, BEARS)).toBe(true);
  });
});

describe('"can\'t attack" as a plain restriction (CR 508.1a, D-145)', () => {
  test('an Aura: enchanted creature can not attack, the others can', () => {
    const g = atAttackers((b) => {
      b.battlefield(BEARS, { label: 'held' }).battlefield('Typhoid Rats');
      b.battlefield(AURA, { attachedTo: 'held' });
    });
    g.expect.canAttack('held', false);
    g.expect.canAttack('Typhoid Rats', true);
  });

  test('a spell: until end of turn, and only the target', () => {
    const b = scenario()
      .seat(0)
      .hand(CALM)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'held' })
      .battlefield('Typhoid Rats')
      .library('Island', { count: 4 });
    const g = b.seat(1).library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
    g.act(0).cast(CALM, { targets: ['held'], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('held', false);
    g.expect.canAttack('Typhoid Rats', true);
  });

  test('a creature that lost all abilities is no longer restricted by its own ability (CR 613.1f)', () => {
    const b = scenario()
      .seat(0)
      .hand('SYNTHETIC Mind Wipe')
      .battlefield('Island')
      .battlefield(SHY, SMALL)
      .library('Island', { count: 4 });
    const g = b.seat(1).library('Island', { count: 4 }).at('precombatMain', { active: 0 }).build();
    g.expect.derived(SHY, { keywords: [] });
    g.act(0).cast('SYNTHETIC Mind Wipe', { targets: [SHY], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(SHY, true);
  });
});

describe('validation', () => {
  const withStatic = (s: object) =>
    ({
      ...syntheticCard(SHY),
      faces: [{ ...syntheticCard(SHY).faces[0], abilities: [{ kind: 'static', static: s }] }],
    }) as unknown as Parameters<typeof validateCard>[0];
  const ok = {
    kind: 'restrictionUnless',
    subject: { kind: 'this' },
    restrictions: ['cantAttack'],
    unless: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 5 } },
  };

  test('the good shape validates', () => {
    expect(validateCard(withStatic(ok))).toEqual([]);
  });

  test.each([
    ['not the permanent itself', { ...ok, subject: { kind: 'attached' } }],
    ['no restrictions', { ...ok, restrictions: [] }],
    ['a restriction it does not cover', { ...ok, restrictions: ['cantBeBlocked'] }],
    ['the same restriction twice', { ...ok, restrictions: ['cantAttack', 'cantAttack'] }],
    ['no condition', { ...ok, unless: undefined }],
  ])('%s is refused', (_name, s) => {
    expect(validateCard(withStatic(s)).length).toBeGreaterThan(0);
  });
});

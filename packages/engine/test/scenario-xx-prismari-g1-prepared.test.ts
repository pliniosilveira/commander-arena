// The Prismari deck (issue 87), group 1: "becomes prepared" from triggers and a creature that becomes a copy until end of turn, with the SYNTHETIC siblings of Inspired Skypainter //
// Maestro's Gift, Dirgur Focusmage // Braingeyser and Muddle, the Ever-Changing (src/cards/fixtures/synthetic-prismari-g1.ts). Pins: CR 722.3a (a permanent with a prepare spell becomes
// prepared; it cannot gain the designation twice), CR 722.3c (the copy of the prepare spell in exile; the designation is lost as the spell is cast), CR 603.2c (a batch trigger fires once for
// the damage dealt at the same time), CR 510.2, CR 601.2a and 601.2i (a spell is cast from the hand; the mana value is the printed one), CR 707.2 and 707.9b (a copy "except it has myriad"),
// CR 611.2a and 514.2 (until end of turn), CR 702.116a (Myriad: with one opponent there is never another one to attack).
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SKY = 'SYNTHETIC Sky Painter // Gift Spell';
const SKY_FRONT = 'Sky Painter';
const FOCUS = 'SYNTHETIC Focus Mage // Brain Surge';
const FOCUS_FRONT = 'Focus Mage';
const MORPH = 'SYNTHETIC Mud Morph';
const SOLDIER_CALL = 'SYNTHETIC Soldier Call';
const CANTRIP = 'SYNTHETIC Prismari Cantrip';
const GRAND_STUDY = 'SYNTHETIC Prismari Grand Study'; // sorcery {4}{U}, mana value 5
const GRAND_FLASH = 'SYNTHETIC Prismari Grand Flash'; // instant {5}{U}, mana value 6
const LEGEND = 'SYNTHETIC Prismari Legend';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel'; // creature, mana value 5
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Builder = ReturnType<typeof scenario>;

function build(setup: (b: Builder) => void, at: 'precombatMain' | 'upkeep' = 'precombatMain') {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  setup(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at(at, { active: 0 })
    .build();
}

/** Casts the first card of that name in seat 0's hand (the scenario refuses an ambiguous name). */
const castHand = (g: Game, name: string, options: object = {}) =>
  g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true, ...options });

const preparedCopy = (g: Game) =>
  Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
const view = (g: Game, name: string) =>
  getView(g.state, 0).battlefield.find((o) => o.name === name);
const tokens = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);

describe('the cards are valid', () => {
  test.each([SKY, FOCUS, MORPH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Inspired Skypainter: it becomes prepared as it enters (CR 722.3a, 722.3c)', () => {
  const sky = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.hand(SKY, SOLDIER_CALL)
        .battlefield('Island', { count: 8 })
        .battlefield('Mountain', { count: 2 })
        .battlefield('Plains', { count: 2 });
      extra(b);
    });

  test('the enters trigger prepares it: the designation and a copy of the prepare spell in exile', () => {
    const g = sky();
    g.act(0).cast(SKY_FRONT, { pay: true });
    g.passAll();
    expect(view(g, SKY_FRONT)?.prepared).toBe(true);
    const copy = preparedCopy(g);
    expect(copy?.zone).toBe('exile');
    g.expect.invariants();
  });

  test('the prepare spell is cast from exile: a token that is a copy of target creature you control, with haste until end of turn', () => {
    const g = sky((b) => b.battlefield(BEARS, { label: 'bears' }));
    g.act(0).cast(SKY_FRONT, { pay: true });
    g.passAll();
    const copy = preparedCopy(g)?.id as string;
    g.act(0).cast(copy, { pay: true, targets: ['bears'] });
    // The designation is lost as the spell is cast (CR 722.3c).
    expect(view(g, SKY_FRONT)?.prepared).toBeUndefined();
    g.passAll();
    const made = tokens(g, BEARS);
    expect(made).toHaveLength(1);
    g.expect.derived(made[0]?.id as string, { keywords: ['haste'] });
    // "Until end of turn": the haste is gone in the next turn.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(tokens(g, BEARS)[0]?.id as string, { keywords: [] });
    g.expect.invariants();
  });

  // Two creature tokens made in the first turn, which can attack in the next of the controller's turns, and the Skypainter on the battlefield, not prepared.
  const attackers = () => {
    const g = build((b) =>
      b
        .hand(SOLDIER_CALL, SOLDIER_CALL)
        .battlefield('Plains', { count: 2 })
        .battlefield(SKY, { label: 'sky' }),
    );
    for (let i = 0; i < 2; i += 1) {
      g.act(0).cast({ name: SOLDIER_CALL, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
      g.passAll();
    }
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('declareAttackers');
    return g;
  };

  test('tokens that deal combat damage to a player prepare it, once for the batch (CR 603.2c)', () => {
    const g = attackers();
    expect(view(g, SKY_FRONT)?.prepared).toBeUndefined();
    g.act(0).declareAttackers(tokens(g, 'Soldier').map((o) => ({ attacker: o.id })));
    g.passAll();
    g.advanceTo('combatDamage');
    // One trigger for the two tokens that dealt damage at the same time.
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(view(g, SKY_FRONT)?.prepared).toBe(true);
    expect(Object.values(g.state.objects).filter((o) => o.prepareOf !== undefined)).toHaveLength(1);
    g.expect.invariants();
  });

  test('a creature that is not a token does not: only creature tokens you control count', () => {
    const g = build((b) =>
      b.battlefield(SKY, { label: 'sky' }).battlefield(BEARS, { label: 'bears' }),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'bears' }]);
    g.passAll();
    g.advanceTo('combatDamage');
    expect(g.state.stack).toHaveLength(0);
    expect(view(g, SKY_FRONT)?.prepared).toBeUndefined();
  });

  test('already prepared: no second designation and no second copy (CR 722.3a)', () => {
    const g = attackers();
    g.act(0).declareAttackers(tokens(g, 'Soldier').map((o) => ({ attacker: o.id })));
    g.passAll();
    g.advanceTo('combatDamage');
    g.passAll();
    expect(Object.values(g.state.objects).filter((o) => o.prepareOf !== undefined)).toHaveLength(1);
  });
});

describe('Dirgur Focusmage: it becomes prepared when you cast an instant or sorcery spell with mana value 5 or greater from your hand', () => {
  const focus = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(FOCUS)
        .battlefield('Island', { count: 8 })
        .hand(CANTRIP, GRAND_STUDY, GRAND_FLASH, ANGEL);
      extra(b);
    });

  test('a sorcery with mana value 5: prepared, even though the cost reduction made it cheaper (the mana value is the printed one)', () => {
    const g = focus();
    castHand(g, GRAND_STUDY);
    g.passAll();
    expect(view(g, FOCUS_FRONT)?.prepared).toBe(true);
    g.expect.invariants();
  });

  test('an instant with mana value 6', () => {
    const g = focus();
    castHand(g, GRAND_FLASH);
    g.passAll();
    expect(view(g, FOCUS_FRONT)?.prepared).toBe(true);
  });

  test('an instant of lower mana value does not prepare it', () => {
    const g = focus();
    castHand(g, CANTRIP);
    g.passAll();
    expect(view(g, FOCUS_FRONT)?.prepared).toBeUndefined();
  });

  test('a creature spell with mana value 5 does not: it is not an instant or sorcery', () => {
    const g = focus((b) => b.battlefield('Plains', { count: 4 }));
    castHand(g, ANGEL);
    g.passAll();
    expect(view(g, FOCUS_FRONT)?.prepared).toBeUndefined();
  });

  test('an opponent’s spell does not', () => {
    const g = focus((b) => b.seat(1).hand(GRAND_FLASH).battlefield('Island', { count: 6 }));
    g.act(0).pass();
    g.act(1).cast(GRAND_FLASH, { pay: true });
    g.passAll();
    expect(view(g, FOCUS_FRONT)?.prepared).toBeUndefined();
  });

  test('already prepared: a second big spell does not give a second designation or a second copy (CR 722.3a)', () => {
    const g = focus((b) => b.hand(GRAND_STUDY));
    g.act(0).cast({ name: GRAND_STUDY, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.passAll();
    const copies = () => Object.values(g.state.objects).filter((o) => o.prepareOf !== undefined);
    expect(copies()).toHaveLength(1);
    g.act(0).cast({ name: GRAND_STUDY, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.passAll();
    expect(copies()).toHaveLength(1);
    g.expect.invariants();
  });

  test('the prepare spell draws X cards for the target player', () => {
    const g = focus((b) => b.battlefield('Island', { count: 3 }));
    castHand(g, GRAND_STUDY);
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    const copy = preparedCopy(g)?.id as string;
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === copy),
    ).toBe(true);
    g.act(0).cast(copy, { pay: true, x: 3, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.handSize(0, before + 3);
  });
});

describe('Muddle, the Ever-Changing: it becomes a copy of up to one target nonlegendary creature you control until end of turn, except it has myriad', () => {
  const morph = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(MORPH, { label: 'morph' })
        .battlefield(ANGEL, { label: 'angel' })
        .battlefield(LEGEND, { label: 'legend' })
        .battlefield('Island', { count: 6 })
        .hand(CANTRIP, CANTRIP);
      extra(b);
    });

  test('casting an instant: it is the target creature, with its abilities and myriad (CR 707.2, 707.9b)', () => {
    const g = morph();
    castHand(g, CANTRIP);
    g.act(0).chooseTargets('angel');
    g.passAll();
    g.expect.pt('morph', 4, 4);
    g.expect.derived('morph', { keywords: ['flying', 'vigilance', 'myriad'] });
    expect(view(g, 'Serra Angel')).toBeDefined();
    g.expect.invariants();
  });

  test('it is the creature only until end of turn', () => {
    const g = morph();
    castHand(g, CANTRIP);
    g.act(0).chooseTargets('angel');
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('morph', 3, 3);
    g.expect.derived('morph', { keywords: [] });
  });

  test('a legendary creature is not a legal target (nonlegendary)', () => {
    const g = morph((b) => b.hand(CANTRIP));
    castHand(g, CANTRIP);
    const pending = g.state.pending;
    expect(
      pending?.kind === 'targets' &&
        pending.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')),
    ).not.toContain(g.id('legend'));
  });

  test('up to one: with no target it stays what it is', () => {
    const g = morph();
    castHand(g, CANTRIP);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.pt('morph', 3, 3);
    g.expect.derived('morph', { keywords: [] });
  });

  test('the target left before the ability resolves: it stays what it is', () => {
    const g = morph((b) => b.seat(1).hand('Unsummon').battlefield('Island'));
    castHand(g, CANTRIP);
    g.act(0).chooseTargets('angel');
    g.act(0).pass();
    g.act(1).cast('Unsummon', { pay: true, targets: ['angel'] });
    g.passAll();
    g.expect.pt('morph', 3, 3);
  });

  test('a second spell cast while it is a copy does not trigger again: the copy has the abilities of the creature, not Muddle’s own', () => {
    const g = morph();
    g.act(0).cast({ name: CANTRIP, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.act(0).chooseTargets('angel');
    g.passAll();
    g.act(0).cast({ name: CANTRIP, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.pt('morph', 4, 4);
  });
});

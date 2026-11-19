// Exert (CR 701.43): "You may exert ~ as it attacks. When you do, ..." and "An exerted creature won't untap during your next untap step."
// Pins: CR 701.43a (to exert a permanent is to choose to have it not untap during its controller's next untap step), CR 701.43b (it can be exerted
// even if it is not tapped), CR 701.43d ("You may exert [this creature] as it attacks" is an optional cost to attack, CR 508.1g, and the "When you do" ability
// printed with it is linked to it, CR 607.2h), CR 603.12 (the reflexive trigger), CR 508.1h (the cost of attacking is paid after the exert choice), CR 502.3
// (the untap step), CR 702.20b (vigilance), CR 733 (a declaration taken back).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-exert.ts) except the real filler cards.
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  isFeatureSupported,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';
import type { Builder } from './restriction-helpers';

const WYRM = 'SYNTHETIC Exert Wyrm'; // 4/4 flying haste Dragon: exert, 4 damage to target non-Dragon creature an opponent controls
const GUARD = 'SYNTHETIC Exert Guard'; // 2/3 vigilance: exert, gain 3 life
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4
const DRAGON = 'SYNTHETIC Charge Wyrm'; // a 4/4 Dragon of the fixtures, to check the filter
const FILLER = Array.from({ length: 6 }, () => 'Island');

/** Seat 0 is at its declare attackers decision. */
function atAttackers(seat0: (b: Builder) => void, seat1: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .library(...FILLER);
  seat0(b);
  b.seat(1).library(...FILLER);
  seat1(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('the cards are valid, and the face is checked (CR 607.2h)', () => {
  test.each([WYRM, GUARD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the features are supported', () => {
    expect(isFeatureSupported('static:exertOnAttack')).toBe(true);
    expect(isFeatureSupported('trigger:exerted')).toBe(true);
  });

  test('"when you do" with no exert ability on the face, and exert on a noncreature, are refused', () => {
    const wyrm = syntheticCard(WYRM);
    const front = wyrm.faces[0];
    if (front === undefined) throw new Error('no face');
    const withoutStatic = {
      ...wyrm,
      faces: [
        {
          ...front,
          abilities: front.abilities.filter(
            (a) => !(a.kind === 'static' && a.static.kind === 'exertOnAttack'),
          ),
        },
      ],
    };
    const noStatic = validateCard(withoutStatic)
      .map((i) => i.message)
      .join('\n');
    expect(noStatic).toContain('exert');
    const artifact = { ...wyrm, faces: [{ ...front, types: ['artifact' as const] }] };
    const wrongType = validateCard(artifact)
      .map((i) => i.message)
      .join('\n');
    expect(wrongType).toContain('exert');
  });
});

describe('the question: asked as the creature attacks (CR 701.43d, 508.1g)', () => {
  test('attacking with a creature that has the ability asks whether to exert it; the attack is not declared yet', () => {
    const g = atAttackers((b) => b.battlefield(WYRM));
    g.act(0).attack(WYRM);
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    expect(d?.kind === 'confirmOptional' ? d.purpose : null).toBe('exert');
    expect(d?.kind === 'confirmOptional' ? d.source : null).toBe(g.id(WYRM));
    expect(g.state.combat).toBeNull();
    g.expect.tapped(WYRM, false);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual(
      expect.arrayContaining(['acceptOptional', 'declineOptional', 'cancel']),
    );
  });

  test('a creature without the ability is not asked', () => {
    const g = atAttackers((b) => b.battlefield(BEARS));
    g.act(0).attack(BEARS);
    g.expect.pending('priority', 0);
    g.expect.combat({ attackers: [BEARS] });
  });

  test('declining attacks as usual: no exert, no trigger, no effect on the untap step', () => {
    const g = atAttackers((b) => b.battlefield(GUARD));
    g.act(0).attack(GUARD);
    g.act(0).decline();
    g.expect.pending('priority', 0);
    g.expect.combat({ attackers: [GUARD] });
    g.expect.noEvent({ kind: 'exerted' });
    g.expect.life(0, 40);
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toEqual([]);
  });

  test('cancel takes the declaration back and asks who attacks again (CR 733)', () => {
    const g = atAttackers((b) => b.battlefield(WYRM));
    const before = g.state.pending;
    g.act(0).attack(WYRM);
    g.act(0).cancel();
    g.expect.pending('declareAttackers', 0);
    expect(
      g.state.pending?.kind === 'declareAttackers' ? g.state.pending.candidates : null,
    ).toEqual(before?.kind === 'declareAttackers' ? before.candidates : undefined);
    g.expect.tapped(WYRM, false);
    expect(g.state.combat).toBeNull();
  });

  test('two creatures with the ability are asked one after the other, and each answer is kept for its creature', () => {
    const g = atAttackers((b) => {
      b.battlefield(GUARD, { label: 'first' }).battlefield(GUARD, { label: 'second' });
    });
    g.act(0).attack(['first', 'second']);
    const asked = (): unknown =>
      g.state.pending?.kind === 'confirmOptional' ? g.state.pending.source : null;
    expect(asked()).toBe(g.id('first'));
    g.act(0).accept();
    expect(asked()).toBe(g.id('second'));
    g.act(0).decline();
    g.expect.pending('priority', 0);
    expect(g.find({ name: 'Exert Guard' })).toBeDefined();
    const exerted = g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep');
    expect(exerted).toHaveLength(1);
    expect(exerted[0]?.objects).toEqual([g.id('first')]);
    g.expect.eventLog([{ kind: 'attackersDeclared' }, { kind: 'exerted' }]);
  });
});

describe('exerting: the creature does not untap during its next untap step (CR 701.43a)', () => {
  test('an exerted attacker stays tapped through its controller next untap step and untaps at the one after', () => {
    const g = atAttackers(
      (b) => b.battlefield(WYRM),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).attack(WYRM);
    g.act(0).accept();
    g.expect.tapped(WYRM);
    g.expect.eventLog([{ kind: 'attackersDeclared' }, { kind: 'exerted', seat: 0 }]);
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' }); // the opponent's turn
    g.expect.tapped(WYRM);
    g.advanceTo('precombatMain', { turn: 'next' }); // my next turn: the untap step has run
    g.expect.tapped(WYRM); // exerted: it did not untap
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' }); // the turn after: it untaps
    g.expect.tapped(WYRM, false);
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toEqual([]);
  });

  test('a creature that was not exerted untaps as usual', () => {
    const g = atAttackers((b) => b.battlefield(WYRM));
    g.act(0).attack(WYRM);
    g.act(0).decline();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(WYRM, false);
  });

  test('an exerted creature with vigilance is not tapped by attacking; the effect still lasts until the next untap step (CR 701.43b)', () => {
    const g = atAttackers((b) => b.battlefield(GUARD));
    g.act(0).attack(GUARD);
    g.act(0).accept();
    g.expect.tapped(GUARD, false);
    g.passAll(); // the trigger: gain 3 life
    g.expect.life(0, 43);
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toEqual([]);
    g.expect.tapped(GUARD, false);
  });
});

describe('"When you do, it deals 4 damage to target non-Dragon creature an opponent controls" (CR 603.12, 607.2h)', () => {
  const game = () =>
    atAttackers(
      (b) => b.battlefield(WYRM),
      (b) => b.battlefield(BEARS, SPIDER, DRAGON),
    );

  test('the trigger targets a non-Dragon creature an opponent controls; the Dragon is not a legal target', () => {
    const g = game();
    g.act(0).attack(WYRM);
    g.act(0).accept();
    const d = g.state.pending;
    expect(d?.kind).toBe('targets');
    const legal = d?.kind === 'targets' ? (d.specs[0]?.legal ?? []) : [];
    expect(legal).toHaveLength(2);
    expect(legal).not.toContain(g.id(DRAGON));
    const refused = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(DRAGON), specId: 't1' }],
    });
    expect(refused.ok).toBe(false);
  });

  test('4 damage kills the Spider; the Dragon is untouched', () => {
    const g = game();
    g.act(0).attack(WYRM);
    g.act(0).accept();
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(DRAGON, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('declining the exert triggers nothing: the opponent creatures are untouched', () => {
    const g = game();
    g.act(0).attack(WYRM);
    g.act(0).decline();
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('with no legal target the exert is still allowed: the creature is exerted and the trigger is not put on the stack (CR 603.3d)', () => {
    const g = atAttackers(
      (b) => b.battlefield(WYRM),
      (b) => b.battlefield(DRAGON),
    );
    g.act(0).attack(WYRM);
    g.act(0).accept();
    g.expect.tapped(WYRM);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.expect.zone(DRAGON, 'battlefield', { seat: 1 });
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toHaveLength(1);
  });

  test('only the creature that was exerted triggers its own ability (CR 607.2h)', () => {
    const g = atAttackers((b) => {
      b.battlefield(GUARD, { label: 'a' }).battlefield(GUARD, { label: 'b' });
    });
    g.act(0).attack(['a', 'b']);
    g.act(0).accept(); // a
    g.act(0).decline(); // b
    g.expect.stack(['SYNTHETIC Exert Guard (ability)']);
  });

  test('applyAction accepts exactly what is listed at the exert question', () => {
    const g = game();
    g.act(0).attack(WYRM);
    for (const kind of ['acceptOptional', 'declineOptional', 'cancel'] as const) {
      expect(applyAction(g.state, 0, { kind }).ok, kind).toBe(true);
    }
    expect(applyAction(g.state, 0, { kind: 'pass' }).ok).toBe(false);
    expect(applyAction(g.state, 1, { kind: 'acceptOptional' }).ok).toBe(false);
  });
});

describe('the cost of attacking comes after the exert choice (CR 508.1g, 508.1h)', () => {
  test('with an attack tax in play the question is asked first, and the exert survives the payment', () => {
    const g = atAttackers(
      (b) => b.battlefield(WYRM).battlefield('Mountain', { count: 2 }),
      (b) => b.battlefield('SYNTHETIC Tax Toll'),
    );
    g.act(0).attack(WYRM);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.eventLog([{ kind: 'attackersDeclared' }, { kind: 'exerted', seat: 0 }]);
    expect(g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep')).toHaveLength(1);
  });
});

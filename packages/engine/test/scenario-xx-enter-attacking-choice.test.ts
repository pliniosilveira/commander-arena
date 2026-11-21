// A creature put onto the battlefield attacking is attacking a player, planeswalker or battle its controller chooses (CR 508.4), not always the defending player.
// Pins: CR 508.4 (the controller chooses as it enters; with one choice there is none to make), 506.3 (a player or a planeswalker can be attacked), 508.4a-style loyalty damage
// (CR 120.3c). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-combat.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const CHARGE = 'SYNTHETIC Charge Wyrm'; // 4/4 flying Dragon with no attack ability
const KOBOLD = 'SYNTHETIC Pack Kobold'; // pack tactics: put a Dragon from hand tapped and attacking
const PW = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const BEARS = 'Grizzly Bears';
const YARGLE = 'Yargle, Glutton of Urborg'; // 9/3
const TOTAL = [KOBOLD, BEARS, YARGLE];

const enter = (withPlaneswalker: boolean) => {
  const g = twoSeatGame(
    (b) => b.battlefield(KOBOLD, BEARS, YARGLE).hand(CHARGE),
    (b) => (withPlaneswalker ? b.battlefield(PW) : b),
  );
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers(TOTAL.map((attacker) => ({ attacker })));
  g.passAll();
  g.act(0).chooseCards(CHARGE);
  return g;
};

describe('the controller chooses what a creature put onto the battlefield attacking attacks (CR 508.4)', () => {
  test('with a planeswalker to attack, the controller is asked and may choose it', () => {
    const g = enter(true);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of what to attack');
    expect(d).toMatchObject({ seat: 0, purpose: 'attackTarget', attacker: g.object(CHARGE).id });
    expect(d.options).toHaveLength(2);
    g.act(0).chooseOption(`permanent:${g.object(PW).id}`);
    g.expect.invariants();
    g.advanceTo('combatDamage');
    g.expect.counters(PW, {});
    g.expect.life(1, 20 - 11); // the three declared attackers hit the player; the Wyrm hit the planeswalker
  });

  test('choosing the player attacks the player', () => {
    const g = enter(true);
    g.act(0).chooseOption('player:1');
    g.advanceTo('combatDamage');
    g.expect.life(1, 20 - 15);
    g.expect.counters(PW, { loyalty: 4 });
  });

  test('with only the player to attack nothing is asked', () => {
    const g = enter(false);
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    g.expect.zone(CHARGE, 'battlefield', { seat: 0 });
    g.expect.combat({ attackers: [...TOTAL, CHARGE] });
  });

  test('the creature was never declared, so it still did not attack (no attack trigger)', () => {
    const g = enter(true);
    g.act(0).chooseOption('player:1');
    g.expect.combat({ attackers: [...TOTAL, CHARGE] });
  });
});

describe('"attacking that player or a planeswalker they control" (CR 508.4) leaves out the other things that can be attacked', () => {
  const BATTLE = 'SYNTHETIC Vanilla Battle';
  const limited = () => {
    const card = syntheticCard(KOBOLD);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const restrict = (a: unknown): unknown => {
      const ability = a as { kind: string; effect?: { kind: string; effects?: unknown[] } };
      if (ability.kind !== 'triggered' || ability.effect?.kind !== 'sequence') return a;
      return {
        ...ability,
        effect: {
          ...ability.effect,
          effects: (ability.effect.effects ?? []).map((e) =>
            (e as { kind: string }).kind === 'enterAttacking'
              ? { ...(e as object), thatPlayerOrTheirPlaneswalkers: true }
              : e,
          ),
        },
      };
    };
    return { ...card, faces: [{ ...face, abilities: face.abilities.map(restrict) }] } as never;
  };
  const run = (restricted: boolean) => {
    const g = twoSeatGame(
      (b) =>
        (restricted ? b.define(limited()) : b)
          .battlefield(KOBOLD, BEARS, YARGLE)
          .battlefield(BATTLE)
          .hand(CHARGE),
      (b) => b.battlefield(PW),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers(TOTAL.map((attacker) => ({ attacker })));
    g.passAll();
    g.act(0).chooseCards(CHARGE);
    return g;
  };
  const options = (g: ReturnType<typeof run>) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of what to attack');
    return d.options;
  };

  test('without the words the battle is a choice too', () => {
    expect(options(run(false))).toHaveLength(3);
  });

  test('with them only the player and the planeswalker are offered', () => {
    const g = run(true);
    const offered = options(g);
    expect(offered).toHaveLength(2);
    expect(offered).toContain(`permanent:${g.object(PW).id}`);
    expect(offered).not.toContain(`permanent:${g.object(BATTLE).id}`);
  });
});

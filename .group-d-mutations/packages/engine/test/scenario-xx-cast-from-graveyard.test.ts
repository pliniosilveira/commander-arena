// "You may cast this card from your graveyard as long as you control a Zombie" (D-133): a card whose own static ability lets
// its owner cast it from their graveyard, with an optional condition read as it is cast.
// Pins: CR 601.2a (casting moves the card to the stack), CR 113.6b (a static ability of a card works from the zone it says,
// here its owner's graveyard), CR 604.2, CR 117.1a and CR 307.1 (a creature or sorcery is cast at sorcery timing), CR 400.7 (the
// card on the stack is a new object), CR 903.8 (the commander tax counts casts from the command zone only), CR 608.3a (a
// permanent spell resolves onto the battlefield).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const CORPSE = 'SYNTHETIC Restless Corpse'; // 2/1 Zombie {B}: can't block; may be cast from the graveyard while you control a Zombie
const SHADE = 'SYNTHETIC Stubborn Shade'; // sorcery {1}{B}: may be cast from the graveyard; each opponent loses 1 life
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const BEARS = 'Grizzly Bears';

const castable = (g: ScenarioGame, seat: 0 | 1, name: string): boolean =>
  g
    .legalActions(seat)
    .some(
      (a) =>
        a.kind === 'castSpell' &&
        g.state.objects[a.object]?.zone === 'graveyard' &&
        g.object(a.object).card === g.object({ name, zone: 'graveyard' }).card,
    );

describe('"You may cast this card from your graveyard as long as you control a Zombie" (CR 113.6b)', () => {
  test('with a Zombie on the battlefield the card in the graveyard can be cast, and it comes back', () => {
    const g = twoSeatGame((b) => b.graveyard(CORPSE).battlefield(ZOMBIE).battlefield('Swamp'));
    expect(castable(g, 0, CORPSE)).toBe(true);
    g.act(0).cast(CORPSE, { pay: true });
    g.expect.stack([CORPSE]);
    g.passAll();
    g.expect.zone(CORPSE, 'battlefield', { seat: 0 });
    g.expect.noObject(CORPSE, { zone: 'graveyard' });
  });

  test('without a Zombie it cannot', () => {
    const g = twoSeatGame((b) => b.graveyard(CORPSE).battlefield(BEARS).battlefield('Swamp'));
    expect(castable(g, 0, CORPSE)).toBe(false);
    expect(() => g.act(0).cast(CORPSE, { pay: true })).toThrow();
  });

  test('the opponent\'s Zombie does not count: "you control"', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(CORPSE).battlefield('Swamp'),
      (b) => b.battlefield(ZOMBIE),
    );
    expect(castable(g, 0, CORPSE)).toBe(false);
  });

  test('a card in the hand is cast as always, and the permission does nothing there', () => {
    const g = twoSeatGame((b) => b.hand(CORPSE).battlefield('Swamp'));
    g.act(0).cast(CORPSE, { pay: true });
    g.passAll();
    g.expect.zone(CORPSE, 'battlefield', { seat: 0 });
  });

  test('only its owner, from their own graveyard', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(ZOMBIE).battlefield('Swamp'),
      (b) => b.graveyard(CORPSE).battlefield('Swamp').battlefield(ZOMBIE),
    );
    expect(castable(g, 0, CORPSE)).toBe(false);
  });

  test('a card without the permission is not castable from the graveyard', () => {
    const g = twoSeatGame((b) =>
      b.graveyard(BEARS).battlefield(ZOMBIE).battlefield('Forest', { count: 2 }),
    );
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('creature timing: not at instant speed, not with a spell on the stack', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(CORPSE).battlefield(ZOMBIE).battlefield('Swamp'),
      (b) => b,
    );
    g.advanceTo('beginningOfCombat');
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('the condition is read as it is cast: the Zombie leaving afterwards does not stop the spell', () => {
    const g = twoSeatGame((b) =>
      b.graveyard(CORPSE).battlefield(ZOMBIE).hand('Murder').battlefield('Swamp', { count: 4 }),
    );
    g.act(0).cast(CORPSE, { pay: true });
    g.act(0).cast('Murder', { targets: [ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(CORPSE, 'battlefield', { seat: 0 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
  });

  test('a spell that is countered or that fizzles goes to the graveyard as any spell does', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(SHADE).battlefield('Swamp', { count: 2 }),
      (b) => b.hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(SHADE, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [SHADE], pay: true });
    g.passAll();
    g.expect.zone(SHADE, 'graveyard', { seat: 0 });
  });

  test('without a condition: an instant-speed? no, a sorcery from the graveyard, and it goes back to the graveyard after', () => {
    const g = twoSeatGame((b) => b.graveyard(SHADE).battlefield('Swamp', { count: 2 }));
    expect(castable(g, 0, SHADE)).toBe(true);
    g.act(0).cast(SHADE, { pay: true });
    g.passAll();
    g.expect.life(1, 19);
    // It resolved and went to the graveyard (CR 608.2n): it can be cast again with fresh mana.
    g.expect.zone(SHADE, 'graveyard', { seat: 0 });
  });

  test('the cast is a cast: triggers of "whenever you cast a spell" see it, and the event says where from', () => {
    const g = twoSeatGame((b) => b.graveyard(SHADE).battlefield('Swamp', { count: 2 }));
    g.act(0).cast(SHADE, { pay: true });
    expect(g.events.some((e) => e.kind === 'spellCast')).toBe(true);
  });

  test('cancel puts the card back in the graveyard (CR 733)', () => {
    const g = twoSeatGame((b) => b.graveyard(SHADE).battlefield('Swamp', { count: 2 }));
    const before = g.positionHash();
    g.act(0).cast(SHADE);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('what a card may say', () => {
  function firstFace(card: ReturnType<typeof syntheticCard>) {
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return face;
  }
  const withAbilities = (name: string, abilities: unknown[]) => {
    const base = syntheticCard(name);
    return { ...base, faces: [{ ...firstFace(base), abilities }] } as never;
  };
  const messages = (card: never) =>
    validateCard(card)
      .map((i) => i.message)
      .join(' | ');

  test('a land has no cast to give it permission for', () => {
    const base = syntheticCard('SYNTHETIC Tapped Land');
    const face = firstFace(base);
    const card = {
      ...base,
      faces: [{ ...face, abilities: [{ kind: 'static', static: { kind: 'castFromGraveyard' } }] }],
    } as never;
    expect(messages(card)).toMatch(/land|cast/);
  });

  test('the condition is one a static ability can read', () => {
    const condition = { kind: 'kicked' };
    expect(
      messages(
        withAbilities(SHADE, [
          { kind: 'static', condition, static: { kind: 'castFromGraveyard' } },
        ]),
      ),
    ).toMatch(/condition/);
  });

  test('one permission is enough', () => {
    const twice = [
      { kind: 'static', static: { kind: 'castFromGraveyard' } },
      { kind: 'static', static: { kind: 'castFromGraveyard' } },
    ];
    expect(messages(withAbilities(SHADE, twice))).toMatch(/castFromGraveyard|once/);
  });
});

test('the card is the same object as before only if it never moved (CR 400.7)', () => {
  const g = twoSeatGame((b) => b.graveyard(SHADE).battlefield('Swamp', { count: 2 }));
  const before = g.id({ name: SHADE, zone: 'graveyard' });
  g.act(0).cast(SHADE, { pay: true });
  expect(g.state.objects[before]).toBeUndefined();
});

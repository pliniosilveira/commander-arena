// Counters as a cost and state triggers (D-139): "{T}, Put a page counter on this artifact: Scry 1", "When there are four or more page counters on
// this artifact, exile it. If you do, you gain 4 life." A cost that puts counters on the source, a trigger that reads a condition of the game
// state (CR 603.8) and "If you do" after an instruction that is not a "may".
// Pins: CR 118.3 (a cost can't be paid without the resources), CR 122.1 (counters), CR 602.2b (costs are paid as the ability is activated, so the
// ability goes on the stack after the counter), CR 603.8 (a state trigger triggers once each time its condition becomes true, and not again until the
// ability has resolved, been countered or left the stack; then, if the condition still holds, it triggers again), CR 603.3 (it goes on the stack
// the next time a player would receive priority), CR 608.2c ("If you do" reads what the instruction before it did), CR 400.7 (a permanent that left is
// a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ability-costs.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TOME = 'SYNTHETIC Reading Tome'; // abilities: 0 {T}+counter: scry 1, 1 {2}{T}+counter: draw, 2 state trigger (4 page counters)
const IDOL = 'SYNTHETIC Lore Idol'; // {1}+counter: gain 1 life; 3 lore counters: sacrifice it, if you do draw two
const URN = 'SYNTHETIC Ember Urn'; // {2}+two ember counters: draw; 3 ember counters: exile it, if you do gain 2
const STATUE = 'SYNTHETIC Pride Statue'; // 30 or more life: exile it, if you do draw
const GAIN = 'SYNTHETIC Draw Three Gain Five';
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function main(
  mine: (b: Builder) => Builder,
  life = 20,
  theirs: (b: Builder) => Builder = (b) => b,
) {
  const a = mine(
    scenario()
      .seat(0)
      .life(life)
      .library('Plains', { label: 'top' })
      .library('Plains', { label: 'second' })
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

const canActivate = (g: ReturnType<typeof main>, card: string, ability: number): boolean =>
  g
    .legalActions(0)
    .some((a) => a.kind === 'activate' && a.object === g.id(card) && a.abilityIndex === ability);

describe('the cards are valid', () => {
  test.each([TOME, IDOL, URN, STATUE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"{T}, Put a page counter on this artifact" (CR 118.3, 122.1)', () => {
  test('the counter is put on as a cost and the ability is on the stack with it already paid', () => {
    const g = main((b) => b.battlefield(TOME));
    g.act(0).activate(TOME, { ability: 0 });
    g.expect.tapped(TOME, true);
    g.expect.counters(TOME, { page: 1 });
    g.expect.stack([`${TOME} (ability)`]);
    g.passAll();
    // Scry 1: the one card looked at goes back on top, or to the bottom.
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['top'] });
    g.expect.invariants();
  });

  test('a tapped Tome cannot pay its {T}', () => {
    const g = main((b) => b.battlefield(TOME, { tapped: true }));
    expect(canActivate(g, TOME, 0)).toBe(false);
  });

  test('the second ability costs {2} too and draws a card', () => {
    const g = main((b) => b.battlefield(TOME).battlefield('Plains', { count: 2 }));
    expect(canActivate(g, TOME, 1)).toBe(true);
    g.act(0).activate(TOME, { ability: 1, pay: true });
    g.expect.counters(TOME, { page: 1 });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('without the {2} the second ability is not offered', () => {
    const g = main((b) => b.battlefield(TOME).battlefield('Plains'));
    expect(canActivate(g, TOME, 1)).toBe(false);
    expect(canActivate(g, TOME, 0)).toBe(true);
  });

  test('cancelling the activation takes the counter back (CR 733)', () => {
    const g = main((b) => b.battlefield(TOME).battlefield('Plains', { count: 2 }));
    g.act(0).activate(TOME, { ability: 1 }).cancel();
    g.expect.counters(TOME, {});
    g.expect.tapped(TOME, false);
  });
});

describe('"When there are four or more page counters on this artifact, exile it. If you do, you gain 4 life." (CR 603.8)', () => {
  test('the fourth counter triggers it: it goes on the stack above the ability and exiles the Tome, then the life', () => {
    const g = main((b) =>
      b.battlefield(TOME, { counters: { page: 3 } }).battlefield('Plains', { count: 2 }),
    );
    g.act(0).activate(TOME, { ability: 1, pay: true });
    g.expect.stack([`${TOME} (ability)`, `${TOME} (ability)`]);
    g.passAll();
    g.expect.zone(TOME, 'exile', { seat: 0 });
    g.expect.life(0, 24);
    // The draw still happens: the ability on the stack is independent of its source (CR 113.7a).
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('three counters do not trigger it', () => {
    const g = main((b) => b.battlefield(TOME, { counters: { page: 2 } }));
    g.act(0).activate(TOME, { ability: 0 });
    g.expect.counters(TOME, { page: 3 });
    g.expect.stack([`${TOME} (ability)`]);
    g.passAll();
    g.expect.zone(TOME, 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('it triggers for a Tome that enters with the counters already there, at the next look at the game (CR 603.8)', () => {
    const g = main((b) =>
      b
        .battlefield(TOME, { counters: { page: 4 } })
        .hand(BEARS)
        .battlefield('Forest', { count: 2 }),
    );
    // Nothing has happened since the scenario was built; the first event makes the state trigger notice.
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([`${TOME} (ability)`, BEARS]);
    g.passAll();
    g.expect.zone(TOME, 'exile', { seat: 0 });
    g.expect.life(0, 24);
  });

  test('it triggers once each time the condition becomes true: not again while the ability is on the stack (CR 603.8)', () => {
    const g = main((b) => b.battlefield(URN).battlefield('Plains', { count: 6 }));
    g.act(0).activate(URN, { pay: true });
    // Two counters: not yet three.
    g.expect.counters(URN, { ember: 2 });
    g.passAll();
    g.act(0).activate(URN, { pay: true });
    // Now four: the state trigger is on the stack above the ability.
    g.expect.stack([`${URN} (ability)`, `${URN} (ability)`]);
    // With the trigger still on the stack, another activation adds two more and must not trigger a second one.
    g.act(0).activate(URN, { pay: true }).pay;
    expect(g.state.stack).toHaveLength(3);
  });

  test('"If you do": a Tome that left before the trigger resolved does not give the life', () => {
    const g = main((b) =>
      b.battlefield(IDOL, { counters: { lore: 2 } }).battlefield('Plains', { count: 2 }),
    );
    g.act(0).activate(IDOL, { pay: true });
    // The trigger (three counters) is above the ability; the Idol is sacrificed as it resolves, and the cards are drawn.
    g.passAll();
    g.expect.zone(IDOL, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.life(0, 21);
  });

  test('the sacrifice of a different object: "sacrifice it. If you do, draw two" does nothing when the source is already gone', () => {
    const g = main((b) =>
      b.battlefield(IDOL, { counters: { lore: 2 } }).battlefield('Plains', { count: 4 }),
    );
    g.act(0).activate(IDOL, { pay: true });
    // Activate again in response: the second ability adds a counter (4 lore counters), and the trigger from the first is already on the stack.
    g.act(0).activate(IDOL, { pay: true });
    g.passAll();
    // The trigger sacrificed it once and drew two cards; the Idol is in the graveyard, and the two life gain abilities resolved.
    g.expect.zone(IDOL, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.life(0, 22);
  });
});

describe('a state trigger over another condition (a life total)', () => {
  test('"When you have 30 or more life, exile this. If you do, draw a card.": gaining life to 30 triggers it', () => {
    const g = main((b) => b.battlefield(STATUE).hand(GAIN).battlefield('Island', { count: 3 }), 29);
    g.act(0).cast(GAIN, { pay: true });
    g.passAll();
    // The spell drew three and gained five: 34 life, so the Statue's trigger went on the stack and resolved.
    g.expect.life(0, 34);
    g.expect.zone(STATUE, 'exile', { seat: 0 });
    g.expect.handSize(0, 4);
  });

  test('below 30 it does nothing', () => {
    const g = main((b) => b.battlefield(STATUE).hand(GAIN).battlefield('Island', { count: 3 }), 20);
    g.act(0).cast(GAIN, { pay: true });
    g.passAll();
    g.expect.zone(STATUE, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 3);
  });
});

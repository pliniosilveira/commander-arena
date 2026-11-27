// "Whenever you expend N" (CR 700.14): the `expend` trigger and the mana a player has spent to cast spells this turn.
// Pins: CR 700.14 (the amount was less than N before the payment and is at least N after it), CR 601.2h (the mana spent to pay the total cost, whatever the cost was: kicker,
// CR 702.33a, and flashback, CR 702.34a, change it), CR 603.2 (a triggered ability triggers once for each event), CR 602.2 (mana spent on an ability is not spent to cast a spell),
// CR 500.1 (the count is of one turn). The rulings of 2024-07-26: once a turn; only the mana actually spent; a permanent sees the mana spent before it entered.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-expend.ts): each ability gains a different amount of life, so the life total says which triggered.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const TWO = 'SYNTHETIC Expend Two'; // artifact {1}: expend 2, gain 1
const FOUR = 'SYNTHETIC Expend Four'; // creature {3}{G}: expend 4, gain 10
const SIX = 'SYNTHETIC Expend Six'; // artifact {2}: expend 6, gain 100; {4}: draw a card
const BEARS = 'Grizzly Bears'; // {1}{G}
const SPIDER = 'Giant Spider'; // {3}{G}
const BOLT = 'Lightning Bolt'; // {R}
const KICKER = 'SYNTHETIC Kicker Gain'; // {W} instant, kicker {1}: gain 2 life (and draw when kicked)
const FLASH = 'SYNTHETIC Flash Study'; // {1}{U} sorcery, flashback {4}{U}: draw a card
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const FORESTS = (n: number) => Array.from({ length: n }, () => 'Forest');
const START = 40;
/** The first card of that name in seat 0's hand (a hand may hold two). */
const h = (name: string) => ({ name, zone: 'hand', seat: 0, nth: 0 }) as const;

const spent = (g: ScenarioGame, seat: number): number =>
  g.state.turnLog.manaSpentOnSpells?.[seat] ?? 0;

describe('the cards are valid', () => {
  test.each([TWO, FOUR, SIX])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('expend 0 and a fraction are refused', () => {
    for (const amount of [0, -1, 1.5]) {
      const card = syntheticCard(FOUR);
      const bad = {
        ...card,
        faces: card.faces.map((f) => ({
          ...f,
          abilities: [
            {
              kind: 'triggered' as const,
              trigger: { kind: 'expend' as const, amount },
              effect: { kind: 'gainLife' as const, player: { kind: 'you' as const }, amount: 1 },
            },
          ],
        })),
      };
      expect(validateCard(bad).length).toBeGreaterThan(0);
    }
  });
});

describe('"Whenever you expend 4"', () => {
  const game = (hand: readonly string[], lands = 10) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(FOUR, ...FORESTS(lands))
      .library(...LIBRARY)
      .seat(1)
      .hand(BEARS)
      .battlefield(...FORESTS(4))
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('two mana, then two more: it triggers as the fourth mana is spent, and not again that turn', () => {
    const g = game([BEARS, BEARS, SPIDER]);
    g.act(0).cast(h(BEARS), { pay: true });
    expect(spent(g, 0)).toBe(2);
    g.passAll();
    g.expect.life(0, START);
    g.act(0).cast(h(BEARS), { pay: true });
    expect(spent(g, 0)).toBe(4);
    // The trigger goes on the stack above the spell that was paid for.
    g.expect.stack([`${FOUR} (ability)`, BEARS]);
    g.passAll();
    g.expect.life(0, START + 10);
    // Four more mana this turn: the total was already 4 or more before this payment.
    g.act(0).cast(SPIDER, { pay: true });
    expect(spent(g, 0)).toBe(8);
    g.expect.stack([SPIDER]);
    g.passAll();
    g.expect.life(0, START + 10);
    g.expect.invariants();
  });

  test('three mana is not four; the next mana spent reaches it', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, BOLT, BOLT)
      .battlefield(FOUR, 'Mountain', 'Mountain', ...FORESTS(2))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.act(0).cast(h(BOLT), { targets: [{ player: 1 }], pay: true });
    expect(spent(g, 0)).toBe(3);
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(0, START);
    g.act(0).cast(h(BOLT), { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${FOUR} (ability)`, BOLT]);
    g.passAll();
    g.expect.life(0, START + 10);
  });

  test('one payment that goes from 0 past 4 triggers it once', () => {
    const g = game([SPIDER]);
    g.act(0).cast(SPIDER, { pay: true });
    g.expect.stack([`${FOUR} (ability)`, SPIDER]);
    g.passAll();
    g.expect.life(0, START + 10);
  });

  test("an opponent's mana is not yours", () => {
    const g = game([BEARS]);
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    // A new turn: nobody has spent anything.
    expect(g.state.turnLog.manaSpentOnSpells).toBeUndefined();
    g.act(1).cast(BEARS, { pay: true });
    expect(spent(g, 1)).toBe(2);
    expect(spent(g, 0)).toBe(0);
    g.passAll();
    g.expect.life(0, START);
    g.expect.life(1, START);
  });

  test('the count is of one turn: two mana this turn and two the next do not add up', () => {
    const g = game([BEARS, BEARS, SPIDER]);
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.expect.life(0, START);
    // And it can trigger again in a later turn.
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.life(0, START + 10);
  });
});

describe('only the mana actually spent to cast spells counts', () => {
  test('kicker: a {W} spell kicked for {1} is two mana spent; flashback {4}{U} of a {1}{U} card is five', () => {
    const g = scenario()
      .seat(0)
      .hand(KICKER, KICKER)
      .graveyard(FLASH)
      .battlefield(TWO, FOUR, SIX, ...Array.from({ length: 4 }, () => 'Plains'))
      .battlefield(...Array.from({ length: 5 }, () => 'Island'))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(h(KICKER), { kicked: false, pay: true });
    expect(spent(g, 0)).toBe(1);
    g.passAll();
    g.expect.life(0, START + 2); // the spell's own 2 life; no expend
    g.act(0).cast(h(KICKER), { kicked: true, pay: true });
    expect(spent(g, 0)).toBe(3); // 1 + ({W} + {1}), not its mana value of 1
    g.passAll();
    g.expect.life(0, START + 2 + 2 + 1); // expend 2
    g.act(0).cast(FLASH, { alternative: 'flashback', pay: true });
    expect(spent(g, 0)).toBe(8); // 3 + five mana of the flashback cost, not the mana value 2
    // Two abilities of one player triggered at once: that player orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(0, START + 5 + 10 + 100); // 3 -> 8 passes 4 and 6
  });

  test('mana spent to activate an ability is not counted', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield(TWO, FOUR, SIX, ...FORESTS(6))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).activate(SIX, { pay: true });
    expect(spent(g, 0)).toBe(0);
    g.passAll();
    g.expect.life(0, START);
    g.act(0).cast(h(BEARS), { pay: true });
    expect(spent(g, 0)).toBe(2);
    g.passAll();
    g.expect.life(0, START + 1); // expend 2 only: the four mana of the ability are not part of it
  });
});

describe('several thresholds and a permanent that enters during the turn', () => {
  test('a payment from 2 to 6 passes 4 and 6 but not 2 again', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, SPIDER)
      .battlefield(TWO, FOUR, SIX, ...FORESTS(6))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.expect.life(0, START + 1);
    g.act(0).cast(SPIDER, { pay: true });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(0, START + 1 + 10 + 100);
    g.expect.invariants();
  });

  test('cast for four mana, it has already seen four spent as it enters: nothing that turn, and it works the next turn', () => {
    const g = scenario()
      .seat(0)
      .hand(FOUR, BEARS, SPIDER)
      .battlefield(...FORESTS(10))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(FOUR, { pay: true });
    g.expect.stack([FOUR]); // on the stack it has no ability that could trigger
    g.passAll();
    g.expect.zone(FOUR, 'battlefield', { seat: 0 });
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.expect.life(0, START);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.life(0, START + 10);
  });

  test('entering after four mana were spent, it counts them: two more reach six', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, SIX, BEARS)
      .battlefield(...FORESTS(6))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    g.act(0).cast(SIX, { pay: true });
    g.passAll();
    g.expect.zone(SIX, 'battlefield', { seat: 0 });
    expect(spent(g, 0)).toBe(4);
    // Only two mana are spent while it is on the battlefield; the total of the turn goes from 4 to 6.
    g.act(0).cast(h(BEARS), { pay: true });
    g.expect.stack([`${SIX} (ability)`, BEARS]);
    g.passAll();
    g.expect.life(0, START + 100);
  });
});

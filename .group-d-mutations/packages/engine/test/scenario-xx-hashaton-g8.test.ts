// Group 8 of the Hashaton deck (issue 31, D-358 to D-361): "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the
// chosen cards to the battlefield tapped." (a `conditional` on the `thisWay` count `sacrificed`, after a sacrifice that is not optional) and the two abilities of Vohar,
// Vodalian Desecrator: the loot with "If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life" (`thisWay`
// `discardedInstantOrSorcery`) and "You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it
// instead. Activate only as a sorcery." (`mayCast` with `exileInstead`).
// Pins: CR 115.1 and 601.2c (two targets of one slot, in your graveyard), CR 608.2b (a target that is gone is skipped, and a spell with no legal target left does not resolve),
// CR 608.2c (what an instruction did decides the next: "if you do"), CR 701.21a (a creature is sacrificed by its controller, who chooses it), CR 701.9a and 608.2c (what was
// discarded this way, read before the card leaves the hand), CR 121.1 (draw first, so the drawn card may be the one discarded), CR 601.2 and 611.2a (a cast permission for this turn),
// CR 602.5d (activate only as a sorcery), CR 614.1a (the exile replaces the move to a graveyard, resolved or countered), CR 400.7 (a card that moved is a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g8.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const EXCHANGE = 'SYNTHETIC Grim Exchange'; // {2}{B} sorcery: Victimize
const LOOTER = 'SYNTHETIC Spell Looter'; // {T}: loot, drain if an instant or sorcery card was discarded
const REAVER = 'SYNTHETIC Spell Reaver'; // {2}, sacrifice: may cast an instant or sorcery card from your graveyard this turn, exile instead
const BORROWER = 'SYNTHETIC Spell Borrower'; // the same without the exile
const DESECRATOR = 'SYNTHETIC Spell Desecrator'; // both abilities (the shape of the real card)
const BEARS = 'Grizzly Bears';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const CUB = 'SYNTHETIC Quiet Cub';
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const COUNTERSPELL = 'Counterspell'; // {U}{U} instant
const WIPE = 'SYNTHETIC Graveyard Wipe'; // {1}{B} instant: exiles a player's graveyard (the opponent's answer in response)
const SCOUR = 'SYNTHETIC Grave Scour'; // {B} instant: exiles a target card from a graveyard
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

describe('the cards are valid, and the new shapes are what the validator accepts', () => {
  test.each([EXCHANGE, LOOTER, REAVER, BORROWER, DESECRATOR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('thisWayAtLeast accepts a count of a mandatory sacrifice, and it needs the sacrifice before it', () => {
    const card = syntheticCard(EXCHANGE);
    const face = card.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell === null || spell === undefined) throw new Error('no spell');
    const only = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, spell: { ...spell, effect } }] }) as never;
    const cond = (what: string) => ({
      kind: 'conditional',
      condition: { kind: 'thisWayAtLeast', what, count: 1 },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    });
    // With no sacrifice before it the count has nothing behind it.
    expect(validateCard(only(cond('sacrificed'))).length).toBeGreaterThan(0);
    expect(
      validateCard(
        only({
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { zone: 'battlefield', types: ['creature'] } },
            },
            cond('sacrificed'),
          ],
        }),
      ),
    ).toEqual([]);
    // The count of another effect is not made by a sacrifice.
    expect(
      validateCard(
        only({
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { zone: 'battlefield', types: ['creature'] } },
            },
            cond('discardedInstantOrSorcery'),
          ],
        }),
      ).length,
    ).toBeGreaterThan(0);
    // An unknown count.
    expect(
      validateCard(
        only({
          kind: 'sequence',
          effects: [
            {
              kind: 'sacrifice',
              objects: { kind: 'choose', filter: { zone: 'battlefield', types: ['creature'] } },
            },
            cond('nonsense'),
          ],
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('mayCast takes exileInstead only as true', () => {
    const card = syntheticCard(REAVER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'activated') throw new Error('no ability');
    const withEffect = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [{ ...ability, effect }] }] }) as never;
    const base = {
      kind: 'mayCast',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
    };
    expect(validateCard(withEffect(base))).toEqual([]);
    expect(validateCard(withEffect({ ...base, exileInstead: true }))).toEqual([]);
    expect(validateCard(withEffect({ ...base, exileInstead: false })).length).toBeGreaterThan(0);
  });

  test('the effects and the condition are supported features', () => {
    expect(isFeatureSupported('effect:mayCast')).toBe(true);
    expect(isFeatureSupported('condition:thisWayAtLeast')).toBe(true);
  });
});

describe('Victimize: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped."', () => {
  const swamps = (b: Builder): Builder => b.battlefield('Swamp', { count: 3 });

  test('the sacrifice happens, then both cards return tapped, under your control', () => {
    const g = twoSeatGame((b) =>
      swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS).graveyard(ZOMBIE)),
    );
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, true);
    g.expect.tapped(ZOMBIE, true);
    g.expect.zone(EXCHANGE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the creature sacrificed may be any creature you control, and you choose it when there are several', () => {
    const g = twoSeatGame((b) =>
      swamps(
        b
          .hand(EXCHANGE)
          .battlefield(CUB)
          .battlefield('Llanowar Elves')
          .graveyard(BEARS)
          .graveyard(ZOMBIE),
      ),
    );
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature to sacrifice nothing returns: "if you do" is false', () => {
    const g = twoSeatGame((b) => swamps(b.hand(EXCHANGE).graveyard(BEARS).graveyard(ZOMBIE)));
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
    g.expect.zone(EXCHANGE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test("an opponent's creature is not sacrificed, and does not make the condition true", () => {
    const g = twoSeatGame(
      (b) => swamps(b.hand(EXCHANGE).graveyard(BEARS).graveyard(ZOMBIE)),
      (b) => b.battlefield(CUB),
    );
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(CUB, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
  });

  test('one chosen card leaving the graveyard in response: the other still returns, and a creature is still sacrificed (CR 608.2b)', () => {
    const g = twoSeatGame(
      (b) => swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS).graveyard(ZOMBIE)),
      (b) => b.hand(SCOUR).battlefield('Swamp'),
    );
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.act(0).pass();
    g.act(1).cast(SCOUR, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.tapped(ZOMBIE, true);
    g.expect.zone(BEARS, 'exile');
    g.expect.invariants();
  });

  test('both chosen cards gone in response: the spell has no legal target and does not resolve, so nothing is sacrificed (CR 608.2b)', () => {
    const g = twoSeatGame(
      (b) => swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS).graveyard(ZOMBIE)),
      (b) => b.hand(WIPE).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true });
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'exile');
    g.expect.zone(ZOMBIE, 'exile');
    g.expect.invariants();
  });

  test('a graveyard of two creature cards is needed: one is not enough to cast it (CR 601.2c)', () => {
    const g = twoSeatGame((b) => swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS)));
    expect(
      g
        .legalActions(0)
        .some(
          (a) =>
            a.kind === 'castSpell' && g.object(a.object).card === g.object({ name: EXCHANGE }).card,
        ),
    ).toBe(false);
  });

  test('only cards of your own graveyard can be chosen', () => {
    const g = twoSeatGame(
      (b) => swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS)),
      (b) => b.graveyard(ZOMBIE),
    );
    expect(() => g.act(0).cast(EXCHANGE, { targets: [BEARS, ZOMBIE], pay: true })).toThrow();
  });

  test('a noncreature card cannot be chosen', () => {
    const g = twoSeatGame((b) =>
      swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS).graveyard(BOLT)),
    );
    expect(() => g.act(0).cast(EXCHANGE, { targets: [BEARS, BOLT], pay: true })).toThrow();
  });

  test('the same card cannot be chosen twice', () => {
    const g = twoSeatGame((b) =>
      swamps(b.hand(EXCHANGE).battlefield(CUB).graveyard(BEARS).graveyard(ZOMBIE)),
    );
    expect(() => g.act(0).cast(EXCHANGE, { targets: [BEARS, BEARS], pay: true })).toThrow();
  });
});

describe('Vohar: "{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life."', () => {
  const start = (hand: readonly string[], library: readonly string[] = FILLER): ScenarioGame =>
    scenario()
      .seat(0)
      .life(20)
      .battlefield(LOOTER)
      .hand(...hand)
      .library(...library)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('discarding an instant: each opponent loses 1 life and you gain 1', () => {
    const g = start([BOLT]);
    g.act(0).activate(LOOTER);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.life(0, 21);
    g.expect.life(1, 19);
    g.expect.tapped(LOOTER, true);
    g.expect.invariants();
  });

  test('discarding a sorcery does the same', () => {
    const g = start([DIVINATION]);
    g.act(0).activate(LOOTER);
    g.passAll();
    g.act(0).chooseCards(DIVINATION);
    g.expect.life(0, 21);
    g.expect.life(1, 19);
  });

  test('discarding a creature or a land does not', () => {
    for (const card of [BEARS, 'Island']) {
      const g = start([card]);
      g.act(0).activate(LOOTER);
      g.passAll();
      g.act(0).chooseCards(card);
      g.expect.zone(card, 'graveyard', { seat: 0 });
      g.expect.life(0, 20);
      g.expect.life(1, 20);
    }
  });

  test('the choice decides it: an instant and a land in hand, the land discarded', () => {
    const g = start([BOLT, 'Island']);
    g.act(0).activate(LOOTER);
    g.passAll();
    g.act(0).chooseCards('Island');
    g.expect.life(0, 20);
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
  });

  test('the card drawn first may be the one discarded: an instant on top of the library, an empty hand', () => {
    const g = start([], [BOLT, ...FILLER]);
    g.act(0).activate(LOOTER);
    g.passAll();
    // The hand holds one card (the Lightning Bolt just drawn), so the engine asks or discards it; either way it is the card discarded.
    if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.life(0, 21);
    g.expect.life(1, 19);
  });

  test('each opponent loses it: three opponents in a pod would each lose 1 (one opponent here)', () => {
    const g = start([COUNTERSPELL]);
    g.act(0).activate(LOOTER);
    g.passAll();
    g.act(0).chooseCards(COUNTERSPELL);
    g.expect.life(1, 19);
  });

  test('the ability needs the creature untapped (it taps as a cost)', () => {
    const g = start([BOLT]);
    g.act(0).activate(LOOTER);
    g.passAll();
    g.act(0).chooseCards(BOLT);
    expect(g.act(0).try.activate(LOOTER).ok).toBe(false);
  });
});

describe('Vohar: "{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery."', () => {
  const lands = (b: Builder): Builder =>
    b.battlefield('Mountain', { count: 3 }).battlefield('Island', { count: 4 });

  const permissions = (g: ScenarioGame) =>
    g.state.continuousEffects.filter((e) => e.change.kind === 'castPermission');

  const castable = (g: ScenarioGame, name: string): boolean =>
    g
      .legalActions(0)
      .some(
        (a) =>
          a.kind === 'castSpell' &&
          g.state.objects[a.object]?.zone === 'graveyard' &&
          g.object(a.object).card === g.object({ name, zone: 'graveyard' }).card,
      );

  test('the creature is sacrificed as a cost, and the card can then be cast from the graveyard', () => {
    const g = twoSeatGame((b) => lands(b.battlefield(REAVER).graveyard(BOLT)));
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.expect.zone(REAVER, 'graveyard', { seat: 0 });
    expect(castable(g, BOLT)).toBe(false); // still on the stack
    g.passAll();
    expect(castable(g, BOLT)).toBe(true);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.objects[g.id({ name: BOLT, zone: 'stack' })]?.stack?.exileInstead).toBe(true);
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'exile');
    g.expect.noObject(BOLT, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('a sorcery card is cast at its own timing and goes to exile after it resolves', () => {
    const g = twoSeatGame((b) => lands(b.battlefield(REAVER).graveyard(DIVINATION)));
    g.act(0).activate(REAVER, { targets: [DIVINATION], pay: true });
    g.passAll();
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile');
    g.expect.handSize(0, 2);
  });

  test('a spell that is countered is exiled too (CR 614.1a)', () => {
    const g = twoSeatGame(
      (b) => lands(b.battlefield(REAVER).graveyard(BOLT)),
      (b) => b.hand(COUNTERSPELL).battlefield('Island', { count: 2 }),
    );
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'exile');
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
  });

  test('without the rider the spell goes to the graveyard as any spell does', () => {
    const g = twoSeatGame((b) => lands(b.battlefield(BORROWER).graveyard(BOLT)));
    g.act(0).activate(BORROWER, { targets: [BOLT], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.objects[g.id({ name: BOLT, zone: 'stack' })]?.stack?.exileInstead).toBe(
      undefined,
    );
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('a card that was not targeted cannot be cast, even if it is an instant in the same graveyard', () => {
    const g = twoSeatGame((b) =>
      lands(b.battlefield(REAVER).graveyard(BOLT).graveyard(COUNTERSPELL)),
    );
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.passAll();
    expect(castable(g, BOLT)).toBe(true);
    expect(castable(g, COUNTERSPELL)).toBe(false);
  });

  test('only a card of your own graveyard, and only an instant or a sorcery, can be the target', () => {
    const g = twoSeatGame(
      (b) => lands(b.battlefield(REAVER).graveyard(BEARS)),
      (b) => b.graveyard(BOLT),
    );
    expect(() => g.act(0).activate(REAVER, { targets: [BOLT], pay: true })).toThrow();
    expect(() => g.act(0).activate(REAVER, { targets: [BEARS], pay: true })).toThrow();
  });

  test('"Activate only as a sorcery": not in combat', () => {
    const g = twoSeatGame((b) => lands(b.battlefield(REAVER).graveyard(BOLT)));
    g.advanceTo('beginningOfCombat');
    expect(() => g.act(0).activate(REAVER, { targets: [BOLT], pay: true })).toThrow();
  });

  test('the permission lasts the turn: if the card is not cast it stays in the graveyard, and nothing is exiled at the end of the turn', () => {
    const g = twoSeatGame((b) => lands(b.battlefield(REAVER).graveyard(BOLT)));
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.passAll();
    expect(permissions(g).length).toBe(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(permissions(g)).toEqual([]);
    expect(castable(g, BOLT)).toBe(false);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('the card is cast for its ordinary cost: with no mana left it cannot be cast', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(REAVER).graveyard(BOLT).battlefield('Island', { count: 2 }),
    );
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.passAll();
    expect(castable(g, BOLT)).toBe(false);
  });

  test('the card leaving the graveyard in response: no permission, nothing to cast (CR 608.2b, 400.7)', () => {
    const g = twoSeatGame(
      (b) => lands(b.battlefield(REAVER).graveyard(BOLT)),
      (b) => b.hand(WIPE).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.act(0).pass();
    g.act(1).cast(WIPE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(permissions(g)).toEqual([]);
  });

  test('two permissions for the card, one without the rider: the player may use that one, so the card is not exiled', () => {
    const g = twoSeatGame((b) =>
      lands(b.battlefield(REAVER).battlefield(BORROWER).graveyard(BOLT)).battlefield('Mountain'),
    );
    g.act(0).activate(REAVER, { targets: [BOLT], pay: true });
    g.passAll();
    g.act(0).activate(BORROWER, { targets: [BOLT], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.objects[g.id({ name: BOLT, zone: 'stack' })]?.stack?.exileInstead).toBe(
      undefined,
    );
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('the second ability of the two-ability card, after the first drained', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DESECRATOR)
      .hand(BOLT)
      .graveyard(DIVINATION)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Island', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(DESECRATOR, { ability: 0 });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.expect.life(1, 19);
    g.expect.life(0, 21);
    g.act(0).activate(DESECRATOR, { ability: 1, targets: [DIVINATION], pay: true });
    g.passAll();
    g.act(0).cast(DIVINATION, { pay: true });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile');
    g.expect.zone(DESECRATOR, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

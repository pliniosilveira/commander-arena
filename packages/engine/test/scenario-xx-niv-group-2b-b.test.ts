// "Mill a card. You may play that card this turn.", "Spend this mana only to cast instant and sorcery spells." and "When that mana is spent to cast a
// red instant or sorcery spell, copy that spell and you may choose new targets for the copy." (D-327 to D-330, group 2b-b of the Niv-Mizzet deck).
// Pins: CR 701.17 (Mill: the cards go to the graveyard, and they are what "that card" names afterwards), CR 601.2 and 305.1 (an effect lets a player cast
// or play a card from a graveyard as though it were in the hand: the timing of its type, its ordinary cost, a land as a land play that uses the land
// drop), CR 611.2a (the permission lasts as long as the effect says), CR 400.7 (a card that left the graveyard is a new object with no permission),
// CR 106.6 (mana that can be spent only on some spells, never on an ability; what mana does when it is spent), CR 603.2 and 603.3 (the rider is a
// triggered ability put on the stack above the spell), CR 707.10 and 707.10c (a copy of a spell is not cast; new targets are optional).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-group-2b-b.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Mill Rite';
const DOUBLE = 'SYNTHETIC Double Mill Rite';
const TABLET = 'SYNTHETIC Spell Tablet';
const GOGGLES = 'SYNTHETIC Mirror Goggles';
const EXACT = 'SYNTHETIC Exact Goggles';
const SPITE = 'SYNTHETIC Spite Mill Rite';
const ARTIFACT_COPIER = 'SYNTHETIC Artifact Copier';
const BLUE_BOLT = 'SYNTHETIC Blue Bolt';
const SINGE = 'SYNTHETIC Twin Singe';
const SINK = 'SYNTHETIC Mana Sink';
const BOLT = 'Lightning Bolt';
const GOBLIN = 'Raging Goblin'; // {R} creature
const FILLER = Array.from({ length: 10 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([RITE, DOUBLE, TABLET, GOGGLES, EXACT, BLUE_BOLT, SINGE, SPITE, ARTIFACT_COPIER])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );

  test('a copy rider needs a mode, and a color of a spell is a color', () => {
    const card = syntheticCard(GOGGLES);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withRider = (spentRider: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                kind: 'mana',
                cost: [{ kind: 'tap' }],
                production: { kind: 'fixed', mana: ['R'] },
                spentRider,
              },
            ],
          },
        ],
      }) as never;
    expect(
      validateCard(
        withRider({ spells: { types: ['instant'], colors: ['R'] }, grants: { copySpell: 'may' } }),
      ),
    ).toEqual([]);
    expect(
      validateCard(withRider({ spells: { types: ['instant'] }, grants: { copySpell: 'maybe' } }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withRider({ spells: { types: ['instant'], colors: ['red'] }, grants: { copySpell: 'no' } }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withRider({ spells: { types: ['instant'], colors: [] }, grants: { copySpell: 'no' } }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('"Mill a card. You may play that card this turn."', () => {
  const game = (
    top: readonly string[],
    more: (b: ReturnType<typeof scenario>) => void = () => {},
  ) => {
    const b = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER);
    more(b);
    return b.build();
  };

  test('the top card goes to the graveyard, and a spell there can be cast for its cost', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('a land there can be played, and it uses the land drop', () => {
    const g = game(['Forest']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    const h = scenario()
      .seat(0)
      .hand(RITE, 'Swamp')
      .battlefield('Mountain', 'Mountain')
      .library('Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    h.act(0).cast(RITE, { pay: true });
    h.passAll();
    h.act(0).playLand('Forest');
    h.expect.illegal(0, { playLand: 'Swamp' });
  });

  test('a land play already used this turn leaves the milled land where it is', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, 'Swamp')
      .battlefield('Mountain', 'Mountain')
      .library('Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).playLand('Swamp');
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test('a spell needs its mana: with nothing to pay for it the card cannot be cast', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain')
      .library(GOBLIN, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test('the timing of the type holds: a creature is cast in a main phase with an empty stack, and the permission ends with the turn', () => {
    const g = game([GOBLIN]);
    g.act(0).cast(RITE, { pay: true });
    g.expect.illegal(0, { cast: GOBLIN }); // the Rite is still on the stack
    g.passAll();
    g.expect.legal(0, { cast: GOBLIN });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test('only the cards that were milled: a card that was already in the graveyard is no more playable than before', () => {
    const g = game([BOLT], (b) => b.seat(0).graveyard(GOBLIN));
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.legal(0, { cast: BOLT });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test("the permission is the controller's own: the opponent cannot cast it", () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.illegal(1, { cast: { name: BOLT, seat: 0 } });
  });

  test('a card cast from the graveyard this way does not come back: once it is cast, no other card is playable', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    // It resolved into the graveyard as a new object (CR 400.7): the permission did not follow it.
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: BOLT });
  });

  test("a card of the opponent's graveyard is not the controller's to play: the permission is for cards they own", () => {
    const g = scenario()
      .seat(0)
      .hand(SPITE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(BOLT, ...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(SPITE, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.illegal(0, { cast: { name: BOLT, seat: 1 } });
  });

  test('an empty library mills nothing and nothing happens', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });

  test('several cards: each milled card is playable', () => {
    const g = scenario()
      .seat(0)
      .hand(DOUBLE)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(BOLT, 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(DOUBLE, { pay: true });
    g.passAll();
    g.expect.legal(0, { cast: BOLT });
    g.expect.legal(0, { playLand: 'Forest' });
  });
});

describe('"When this artifact enters, mill a card. You may play that card this turn. {T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells."', () => {
  const tablet = (top: readonly string[], hand: readonly string[] = []) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(TABLET)
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the enters trigger mills a card that can be played this turn', () => {
    const g = scenario()
      .seat(0)
      .hand(TABLET)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(BOLT, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(TABLET, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
  });

  test('the two mana wait in the pool as restricted mana: a spell of either type, never a creature', () => {
    const g = tablet([], [BOLT, GOBLIN]);
    g.act(0).tapForMana(TABLET, { ability: 2 });
    g.expect.pool(0, 'RR');
    expect(g.state.seats[0]?.manaPool[0]?.restriction).toEqual({
      kind: 'spellMatch',
      types: ['instant', 'sorcery'],
    });
    g.expect.legal(0, { cast: BOLT });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test('it pays for an instant and for a sorcery', () => {
    const g = tablet([], [SINGE]);
    g.act(0).tapForMana(TABLET, { ability: 2 });
    g.act(0).cast(SINGE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.pool(0, '');
  });

  test('it does not pay for an ability: a {2} ability cannot be activated with it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TABLET, SINK)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).tapForMana(TABLET, { ability: 2 });
    g.expect.illegal(0, { activate: SINK });
  });

  test('the other mana ability is unrestricted: {R} pays for a creature spell', () => {
    const g = tablet([], [GOBLIN]);
    g.act(0).tapForMana(TABLET, { ability: 1 });
    g.expect.legal(0, { cast: GOBLIN });
  });
});

describe('"{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy."', () => {
  const goggles = (hand: readonly string[], extra: readonly string[] = [GOGGLES]) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(...extra)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('a red instant paid with it: a trigger goes on the stack above the spell, and its copy resolves first', () => {
    const g = goggles([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // The rider is a triggered ability of the permanent, put on the stack when a player would receive priority (CR 603.3).
    g.expect.stack([`${GOGGLES} (ability)`, BOLT]);
    const mark = g.mark();
    g.pass();
    g.pass();
    // The trigger resolved: the copy is on the stack above the original, and the copier may choose new targets (CR 707.10c).
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT, BOLT]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    // A copy is not cast (CR 707.10).
    expect(events.filter((e) => e.kind === 'spellCast')).toHaveLength(0);
    g.passAll();
    g.expect.life(1, 34); // 40 - 3 - 3
    g.expect.stack([]);
  });

  test('the new targets are optional: the copy can go to another target', () => {
    const g = goggles([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.life(1, 37);
  });

  test('a red sorcery is copied too', () => {
    const g = goggles([SINGE], [GOGGLES, 'Mountain']);
    g.act(0).cast(SINGE, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${GOGGLES} (ability)`, SINGE]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('a spell that is not red is not copied: a blue instant paid with the mana', () => {
    const g = goggles([BLUE_BOLT], [GOGGLES, 'Island']);
    g.act(0).cast(BLUE_BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BLUE_BOLT]);
    g.passAll();
    g.expect.life(1, 38);
  });

  test('a spell that is not an instant or a sorcery is not copied: a red creature spell', () => {
    const g = goggles([GOBLIN]);
    g.act(0).cast(GOBLIN, { pay: true });
    g.expect.stack([GOBLIN]);
  });

  test('mana from another source is not the rider: a red instant paid with a Mountain is not copied', () => {
    const g = goggles([BOLT], [GOGGLES, 'Mountain']);
    g.act(0).tapForMana('Mountain');
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });

  test('each mana spent on the spell is its own trigger: two of them, two copies', () => {
    const g = goggles([SINGE], [GOGGLES, GOGGLES]);
    g.act(0).cast(SINGE, { targets: [{ player: 1 }], pay: true });
    // Two triggers of one controller: they are put on the stack in the order the controller chooses (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${GOGGLES} (ability)`, `${GOGGLES} (ability)`, SINGE]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([SINGE, `${GOGGLES} (ability)`, SINGE]);
    g.pass();
    g.pass(); // the first copy resolves
    g.expect.life(1, 39);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([SINGE, SINGE]);
    g.passAll();
    g.expect.life(1, 37); // the original and its two copies, 1 damage each
  });

  test('mana spent on an ability, not a spell, carries no copy: nothing goes on the stack but the ability', () => {
    const g = goggles([], [GOGGLES, GOGGLES, SINK]);
    g.act(0).activate(SINK, { pay: true });
    g.expect.stack([`${SINK} (ability)`]);
  });

  test('mana spent on an ability is not spent on a spell even when the rider names the type the ability source has', () => {
    const g = goggles([], [ARTIFACT_COPIER, ARTIFACT_COPIER, SINK]);
    g.act(0).activate(SINK, { pay: true });
    g.expect.stack([`${SINK} (ability)`]);
  });

  test('the rider is not a cost: the unspent mana does nothing', () => {
    const g = goggles([BOLT]);
    g.act(0).tapForMana(GOGGLES);
    g.expect.pool(0, 'R');
    g.expect.stack([]);
  });

  test('a copy with the targets of the original and no choice: "copy that spell"', () => {
    const g = goggles([BLUE_BOLT], [EXACT, 'Island']);
    g.act(0).cast(BLUE_BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${EXACT} (ability)`, BLUE_BOLT]);
    g.pass();
    g.pass();
    // Nobody is asked: the copy has the target of the original (CR 707.10).
    g.expect.pending('priority', 0);
    g.expect.stack([BLUE_BOLT, BLUE_BOLT]);
    g.passAll();
    g.expect.life(1, 36);
  });
});

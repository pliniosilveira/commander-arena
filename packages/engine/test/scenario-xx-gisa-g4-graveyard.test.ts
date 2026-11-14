// The Gisa deck (issue 41), group 4: the abilities of cards outside the battlefield and the exile "with" a permanent.
//  - Embalmer's Tools (D-461): "Activated abilities of creature cards in your graveyard cost {1} less to activate." CR 601.2f, 118.7 (a reduction takes generic mana off the total
//    cost), 113.6b (an ability of a card in a graveyard works only if it says so: Unearth), 602.2b (an ability is activated as a spell is cast).
//  - Tetzimoc, Primal Death (D-462): "{B}, Reveal this card from your hand: Put a prey counter on target creature. Activate only during your turn." CR 701.20a (reveal), 113.6b,
//    602.2, 602.5b (a restriction on activating, here the turn); "When this creature enters, destroy each creature your opponents control with a prey counter on it."
//  - Ghost Vacuum (D-460): "{T}: Exile target card from a graveyard." and "{6}, {T}, Sacrifice this artifact: Put each creature card exiled with this artifact onto the battlefield under
//    your control with a flying counter on it. Each of them is a 1/1 Spirit in addition to its other types. Activate only as a sorcery." CR 607.2a (linked abilities), 113.7a (the
//    permanent that was sacrificed as a cost is read from its last-known information), 122.1b (flying counter), 613.1d and 613.4b (the Spirit and the 1/1), 205.1b.
// The cards are the SYNTHETIC siblings of the real ones (src/cards/fixtures/synthetic-gisa-g4.ts), which have the same abilities as the real cards; the real cards are read by the
// grammar in packages/cards/test/convert-grammar-engine-gisa-g4.test.ts.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TOOLS = 'SYNTHETIC Grave Tools';
const HUNTER = 'SYNTHETIC Prey Hunter';
const VACUUM = 'SYNTHETIC Soul Vacuum';
const SHADE = 'SYNTHETIC Unearth Shade'; // unearth {1}{B}
const GNOLL = 'SYNTHETIC Unearth Gnoll'; // unearth {R}
const SINK = 'SYNTHETIC Mana Sink'; // {2}: you gain 1 life
const SMASHER = 'SYNTHETIC Cache Smasher'; // instant {R}: destroy target artifact
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe("Embalmer's Tools: the activated abilities of creature cards in your graveyard cost {1} less (CR 601.2f, 113.6b)", () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(TOOLS))).toEqual([]);
  });

  test('unearth {1}{B} costs {B}: one Swamp is enough with the Tools and not without', () => {
    const without = scenario().seat(0).graveyard(SHADE).battlefield('Swamp').seat(1).build();
    without.expect.illegal(0, { activate: SHADE });
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS)
      .graveyard(SHADE)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.expect.legal(0, { activate: SHADE });
    g.act(0).activate(SHADE, { pay: true });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
    g.passAll();
    g.expect.zone(SHADE, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only the generic part: unearth {R} costs {R} with or without the Tools', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS)
      .graveyard(GNOLL)
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'battlefield', { seat: 0 });
    const none = scenario().seat(0).battlefield(TOOLS).graveyard(GNOLL).seat(1).build();
    none.expect.illegal(0, { activate: GNOLL });
  });

  test('two of them take {2} off, never below zero', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS, { count: 2 })
      .graveyard(SHADE)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.act(0).activate(SHADE, { pay: true });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
  });

  test('the cards of your graveyard only: the opponent’s unearth costs what it did', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS)
      .seat(1)
      .graveyard(SHADE)
      .battlefield('Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(1, { activate: SHADE });
  });

  test('not a card in the hand or a permanent: "activated abilities of creature cards in your graveyard"', () => {
    const g = scenario().seat(0).battlefield(TOOLS, SINK).battlefield('Swamp').seat(1).build();
    g.expect.illegal(0, { activate: SINK });
  });

  test('a cost that is not reduced to what the player cannot pay stays refused, and a cancel restores the state', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS)
      .graveyard(SHADE)
      .battlefield('Swamp')
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).activate(SHADE);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('without the Tools on the battlefield anymore the cost is the printed one', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOOLS)
      .graveyard(SHADE)
      .battlefield('Swamp')
      .seat(1)
      .hand(SMASHER)
      .battlefield('Mountain')
      .build();
    g.expect.legal(0, { activate: SHADE });
    g.act(0).pass();
    g.act(1).cast(SMASHER, { pay: true, targets: [TOOLS] });
    g.passAll();
    g.expect.zone(TOOLS, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { activate: SHADE });
  });
});

describe('Tetzimoc: {B}, Reveal this card from your hand: put a prey counter on target creature, only during your turn (CR 701.20a, 602.5b)', () => {
  test('the card is valid and works from the hand', () => {
    expect(validateCard(syntheticCard(HUNTER))).toEqual([]);
  });

  const huntGame = (extra?: (b: ReturnType<typeof scenario>) => void) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(HUNTER)
      .battlefield('Swamp', 'Swamp')
      .battlefield(BEARS, { label: 'mine' });
    extra?.(b);
    return b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('it is offered from the hand in your turn with the mana, and not in the opponent’s turn', () => {
    const g = huntGame();
    g.expect.legal(0, { activate: HUNTER });
    const theirs = scenario()
      .seat(0)
      .hand(HUNTER)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .at('precombatMain', { active: 1 })
      .build();
    theirs.expect.illegal(0, { activate: HUNTER });
  });

  test('it is offered with a spell on the stack: it is not a sorcery', () => {
    const g = huntGame();
    g.act(0).pass();
    g.act(1).cast(BOLT, { pay: true, targets: ['mine'] });
    g.act(1).pass();
    g.expect.stack(['Lightning Bolt']);
    g.expect.legal(0, { activate: HUNTER });
  });

  test('without {B} there is no option', () => {
    const g = scenario()
      .seat(0)
      .hand(HUNTER)
      .battlefield('Forest')
      .battlefield(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: HUNTER });
  });

  test('the cost reveals the card to every player and it stays in the hand', () => {
    const g = huntGame();
    g.act(0).activate(HUNTER, { targets: ['theirs'], pay: true });
    g.expect.eventLog([{ kind: 'cardsRevealed', names: [HUNTER], from: 'hand', seat: 0 }]);
    g.expect.zone(HUNTER, 'hand', { seat: 0 });
    g.expect.stack([`${HUNTER} (ability)`]);
    g.expect.noEvent({ kind: 'spellCast' });
    g.passAll();
    g.expect.counters('theirs', { prey: 1 });
    g.expect.zone(HUNTER, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the card is in the hand and unknown to the opponent until the reveal; the reveal is a public event', () => {
    const g = huntGame();
    const view = getView(g.state, 1);
    expect(JSON.stringify(view.seats[0]?.hand ?? [])).not.toContain(HUNTER);
    g.act(0).activate(HUNTER, { targets: ['theirs'], pay: true });
    const revealed = g.events.filter((e) => e.kind === 'cardsRevealed');
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toMatchObject({ names: [HUNTER] });
  });

  test('it can be activated again: the card is still in the hand', () => {
    const g = huntGame((b) => b.battlefield('Swamp'));
    g.act(0).activate(HUNTER, { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).activate(HUNTER, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.counters('theirs', { prey: 1 });
    g.expect.counters('mine', { prey: 1 });
  });

  test('a cancel after the targets and before the payment restores the exact state (nothing was revealed)', () => {
    const g = huntGame();
    const before = g.positionHash();
    g.act(0).activate(HUNTER, { targets: ['theirs'] });
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('when it enters, each creature the opponents control with a prey counter is destroyed', () => {
    const g = huntGame((b) => b.battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'));
    g.act(0).activate(HUNTER, { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).cast(HUNTER, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(HUNTER, 'battlefield', { seat: 0 });
  });

  test('only the creatures that have the counter, and only the opponents’', () => {
    const g = huntGame((b) => b.battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'));
    g.act(0).activate(HUNTER, { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast(HUNTER, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('Ghost Vacuum: the creature cards exiled with it come back as 1/1 Spirits with flying counters (CR 607.2a, 113.7a)', () => {
  test('the card is valid', () => {
    expect(validateCard(syntheticCard(VACUUM))).toEqual([]);
  });

  /** A Vacuum that exiled `cards` over its turns, ready to be sacrificed in the later turn. */
  const exiled = (cards: readonly string[], extra?: (b: ReturnType<typeof scenario>) => void) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VACUUM)
      .battlefield('Swamp', { count: 7 });
    extra?.(b);
    const g = b
      .seat(1)
      .library(...LIBRARY)
      .graveyard(...cards)
      .at('precombatMain', { active: 0 })
      .build();
    return g;
  };

  test('{T}: exile target card from a graveyard, any graveyard and any card', () => {
    const g = exiled([SPIDER, BOLT]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
    expect(g.object(VACUUM).linkedExile).toHaveLength(1);
  });

  test('the second ability needs the Vacuum untapped and the cards it exiled: sorcery speed, {6}', () => {
    const g = exiled([SPIDER]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.expect.illegal(0, { activate: VACUUM, ability: 1 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { activate: VACUUM, ability: 1 });
    const combat = exiled([SPIDER]);
    combat.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    combat.passAll();
    combat.advanceTo('precombatMain', { turn: 'next' });
    combat.advanceTo('declareAttackers', { turn: 'next', attack: false });
    combat.expect.illegal(0, { activate: VACUUM, ability: 1 });
  });

  test('the creature card enters under your control as a 1/1 Spirit with a flying counter, keeping its types and abilities', () => {
    const g = exiled([SPIDER]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 1, pay: true });
    g.expect.zone(VACUUM, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.counters(SPIDER, { flying: 1 });
    g.expect.pt(SPIDER, 1, 1);
    g.expect.derived(SPIDER, { keywords: ['flying', 'reach'], subtypes: ['Spider', 'Spirit'] });
    g.expect.invariants();
  });

  test('it is a permanent effect: the Spirit stays a 1/1 in later turns', () => {
    const g = exiled([SPIDER]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 1, pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(SPIDER, 1, 1);
    g.expect.derived(SPIDER, { subtypes: ['Spider', 'Spirit'] });
  });

  test('only the creature cards: a spell card exiled with it stays in exile', () => {
    const g = exiled([SPIDER, BOLT]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [BOLT] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(BOLT, 'exile');
  });

  test('every creature card it exiled comes back together', () => {
    const g = exiled([SPIDER, BEARS]);
    g.act(0).activate(VACUUM, { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 0, targets: [BEARS] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VACUUM, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.pt(SPIDER, 1, 1);
    g.expect.pt(BEARS, 1, 1);
    g.expect.counters(BEARS, { flying: 1 });
  });

  test('another Vacuum does not put what this one exiled', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VACUUM, { label: 'first' })
      .battlefield(VACUUM, { label: 'second' })
      .battlefield('Swamp', { count: 7 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(SPIDER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('first', { ability: 0, targets: [SPIDER] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate('second', { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
  });

  test('the same ability with nothing exiled does nothing but the cost is paid', () => {
    const g = exiled([]);
    g.act(0).activate(VACUUM, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(VACUUM, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('what the validation refuses (D-460 to D-462)', () => {
  const faceOf = (name: string) => {
    const face = syntheticCard(name).faces[0];
    if (face === undefined) throw new Error('no face');
    return face;
  };
  const withAbility = (name: string, ability: unknown) => ({
    ...syntheticCard(name),
    faces: [{ ...faceOf(name), abilities: [ability] }],
  });

  test('revealThis is paid from the hand', () => {
    const bad = withAbility(HUNTER, {
      kind: 'activated',
      cost: [{ kind: 'revealThis' }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(validateCard(bad as never).map((i) => i.message)).toContain(
      "revealThis needs functionsIn: 'hand'",
    );
  });

  test('a reduction of the abilities of some objects names a graveyard', () => {
    const make = (objects: unknown) =>
      withAbility(TOOLS, {
        kind: 'static',
        static: { kind: 'abilityCostReduction', abilities: 'ofObjects', objects, amount: 1 },
      });
    expect(
      validateCard(make({ zone: 'graveyard', types: ['creature'], controller: 'you' }) as never),
    ).toEqual([]);
    expect(
      validateCard(make({ types: ['creature'], controller: 'you' }) as never).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(make({ zone: 'battlefield', types: ['creature'] }) as never).length,
    ).toBeGreaterThan(0);
  });

  test('the filter of a linked exile describes the cards: no zone, controller or owner', () => {
    const make = (filter: unknown) =>
      withAbility(VACUUM, {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' }, linked: true },
            { kind: 'moveToZone', objects: { kind: 'linkedExile', filter }, to: 'battlefield' },
          ],
        },
      });
    expect(validateCard(make({ types: ['creature'] }) as never)).toEqual([]);
    expect(
      validateCard(make({ types: ['creature'], zone: 'exile' }) as never).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(make({ types: ['creature'], controller: 'you' }) as never).length,
    ).toBeGreaterThan(0);
  });
});

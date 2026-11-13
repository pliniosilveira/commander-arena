// Group 1 of the Hashaton deck (D-1100 to D-1102): combat damage "to a player or planeswalker" (`dealsCombatDamage` with `to: 'playerOrPlaneswalker'`), "whenever
// you cycle or discard another card" (`discarded` with `another`), and the spells of a sequence of one subject's verbs.
// Pins: CR 120.2a and 510.2 (combat damage is dealt by creatures to players, planeswalkers, battles and creatures), CR 603.2 and 603.2c (one trigger for each
// event), CR 113.7a (a planeswalker that left is read as it last was), CR 701.9a (discarding a card), CR 702.29a and 702.29d (cycling discards, and an
// ability that triggers on "cycles or discards" triggers once for a cycled card), CR 608.2c (instructions are followed in the order written), CR 701.21a
// (sacrifice: the player chooses), CR 702.34a (flashback). Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g1.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FROG = 'SYNTHETIC Bog Frog'; // 1/2: combat damage to a player or planeswalker: draw a card; discard a card: +1/+1 counter
const WATCHER = 'SYNTHETIC Walker Hit Watcher'; // a creature you control hits a player or planeswalker: gain 1 life
const FIEND = 'SYNTHETIC Cycle Fiend'; // 5/4 flier: cycle or discard another card: -1/-1 counter on each creature your opponents control; Cycling {2}
const TITHE = 'SYNTHETIC Discard Tithe'; // you discard a card: gain 1 life
const GRAVE = 'SYNTHETIC Grave Tither'; // from the graveyard: you discard a card: gain 1 life
const GRAVE_OTHER = 'SYNTHETIC Grave Other Tither'; // from the graveyard: you discard another card: gain 1 life
const ARCHON = 'SYNTHETIC Cruel Archon'; // enters or attacks: target opponent sacrifices, discards, loses 3; you draw, gain 3
const MENDING = 'SYNTHETIC Mending Rite'; // gain 2, draw two, then discard two; flashback
const WALKER = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const BATTLE = 'SYNTHETIC Vanilla Battle';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const CYCLER = 'SYNTHETIC Cycling Bear'; // 2/2, Cycling {2}
const BOLT = 'Lightning Bolt';

const LIBRARY = Array.from({ length: 12 }, () => 'Forest');

describe('the cards are valid', () => {
  test.each([FROG, WATCHER, FIEND, TITHE, GRAVE, GRAVE_OTHER, ARCHON, MENDING])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test("a recipient 'playerOrPlaneswalker' has no 'that player' (a planeswalker may have been damaged)", () => {
    const card = syntheticCard(FROG);
    const trigger = card.faces[0]?.abilities[0];
    if (trigger?.kind !== 'triggered') throw new Error('expected a triggered ability');
    const bad = {
      ...card,
      faces: [
        {
          ...card.faces[0],
          abilities: [
            {
              ...trigger,
              effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
            },
          ],
        },
      ],
    };
    // @ts-expect-error: the edited card is built by hand for the test
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});

// ---- Combat damage to a player or planeswalker (CR 120.2a, 510.2, 603.2)

/** Seat 0 attacks `target` with `attacker`; seat 1 has `defenders` (and may block as told). */
function attack(
  mine: readonly string[],
  attacker: string,
  target?: string,
  theirs: readonly string[] = [],
  blocker?: string,
) {
  const g = scenario()
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .battlefield(...mine)
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  if (target === undefined) g.act(0).attack(attacker);
  else g.act(0).attack(attacker, target);
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') {
    g.act(1).declareBlockers(
      blocker === undefined
        ? []
        : [
            {
              blocker: { name: blocker, seat: 1 as const },
              attacker: { name: attacker, seat: 0 as const },
            },
          ],
    );
  }
  g.advanceTo('combatDamage');
  return g;
}

describe('"Whenever ~ deals combat damage to a player or planeswalker, draw a card."', () => {
  test('to a player: the controller draws a card', () => {
    const g = attack([FROG], FROG);
    g.expect.life(1, 19);
    g.expect.stack([`${FROG} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('to a planeswalker: the same, and the planeswalker loses loyalty', () => {
    const g = attack([FROG], FROG, WALKER, [WALKER]);
    g.expect.life(1, 20);
    g.expect.counters(WALKER, { loyalty: 3 });
    g.expect.stack([`${FROG} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('to a creature that blocked it: nothing is drawn (a creature is neither)', () => {
    const g = attack([FROG], FROG, undefined, [V33], V33);
    g.expect.stack([]);
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.zone(FROG, 'graveyard', { seat: 0 });
  });

  test('to a battle: nothing is drawn (a battle is neither a player nor a planeswalker)', () => {
    const g = attack([FROG, BATTLE], FROG, BATTLE);
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });

  test('a planeswalker that the damage killed is still a planeswalker: the trigger is found (CR 113.7a)', () => {
    const g = attack([WATCHER, V55], V55, WALKER, [WALKER]);
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    g.expect.stack([`${WATCHER} (ability)`]);
    g.passAll();
    g.expect.life(0, 21);
  });

  test('a creature you control, not the one that hit: the watcher gains life for a player and for a planeswalker, once for each hit', () => {
    const player = attack([WATCHER, V22], V22);
    player.expect.stack([`${WATCHER} (ability)`]);
    player.passAll();
    player.expect.life(0, 21);
    const walker = attack([WATCHER, V22], V22, WALKER, [WALKER]);
    walker.expect.stack([`${WATCHER} (ability)`]);
    walker.passAll();
    walker.expect.life(0, 21);
    const blocked = attack([WATCHER, V22], V22, undefined, [V33], V33);
    blocked.expect.stack([]);
  });

  test('"discard a card: put a +1/+1 counter on this creature" works as a cost and an effect', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(FROG)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(FROG);
    g.passAll();
    g.expect.counters(FROG, { '+1/+1': 1 });
    g.expect.pt(FROG, 2, 3);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });
});

// ---- Cycle or discard another card (CR 701.9a, 702.29a, 702.29d)

function fiendGame(...hand: string[]) {
  return scenario()
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(...hand)
    .battlefield(FIEND, 'Plains', 'Island')
    .battlefield('Mountain', { count: 5 })
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .battlefield(V22, V33)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('"Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control."', () => {
  test('cycling a card: each creature the opponents control gets one counter, mine do not', () => {
    const g = fiendGame(CYCLER);
    g.act(0).activate(CYCLER, { pay: true });
    g.expect.zone(CYCLER, 'graveyard', { seat: 0 });
    g.expect.stack([`${FIEND} (ability)`, `${CYCLER} (ability)`]);
    g.passAll();
    g.expect.counters(V22, { '-1/-1': 1 });
    g.expect.counters(V33, { '-1/-1': 1 });
    g.expect.counters(FIEND, {});
    g.expect.handSize(0, 1);
  });

  test('a card cycled triggers it once, though it is both cycled and discarded (CR 702.29d)', () => {
    const g = fiendGame(CYCLER);
    const mark = g.mark();
    g.act(0).activate(CYCLER, { pay: true });
    g.passAll();
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'cycled')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'discarded')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'abilityTriggered')).toHaveLength(1);
    g.expect.counters(V22, { '-1/-1': 1 });
  });

  test('a card discarded by a spell triggers it for each card', () => {
    const g = fiendGame(MENDING, V22, V33, BOLT);
    g.act(0).cast(MENDING, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: V22, zone: 'hand' }, { name: V33, zone: 'hand' });
    g.expect.stack([`${FIEND} (ability)`, `${FIEND} (ability)`]);
    g.passAll();
    // 2 and 3 toughness with two counters each: the 2/2 dies, the 3/3 becomes a 1/1.
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.counters({ name: V33, zone: 'battlefield' }, { '-1/-1': 2 });
  });

  test('the discards of an opponent do not trigger it ("you")', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(FIEND, ARCHON)
      .battlefield('Mountain', { count: 5 })
      .hand(MENDING)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(V22, V33)
      .at('precombatMain', { active: 0 })
      .build();
    // The Archon is already on the battlefield; the opponent discards by the Archon's attack.
    g.advanceTo('declareAttackers');
    g.act(0).attack(ARCHON);
    g.expect.stack([`${ARCHON} (ability)`]);
    const mark = g.mark();
    g.passAll();
    g.act(1).choosePermanents(V22);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
    // The Fiend's trigger is "you": the opponent's discard puts no counter on the creature that is left, and triggers nothing of the Fiend.
    g.expect.counters(V33, {});
    expect(
      g
        .eventsSince(mark)
        .some(
          (e) =>
            e.kind === 'abilityTriggered' &&
            e.source === g.id({ name: FIEND, zone: 'battlefield' }),
        ),
    ).toBe(false);
  });

  test('a second Fiend sees the first one cycled: another card, once', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(FIEND)
      .battlefield(FIEND)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(V33)
      .at('precombatMain', { active: 0 })
      .build();
    // The Fiend in hand is cycled (its own ability does not work from the graveyard); the Fiend on the battlefield sees another card.
    g.act(0).activate({ name: FIEND, zone: 'hand' }, { pay: true });
    g.passAll();
    g.expect.counters(V33, { '-1/-1': 1 });
  });

  test('without "another" the same event gains life once per discard, for a cycled card too (CR 702.29d)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(CYCLER)
      .battlefield(TITHE)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(CYCLER, { pay: true });
    g.passAll();
    g.expect.life(0, 21);
  });
});

describe('"another" leaves out the card with the ability itself', () => {
  const game = (grave: string) =>
    scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(MENDING, grave, V22)
      .battlefield('Plains', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('a card that works from the graveyard sees its own discard without "another"', () => {
    const g = game(GRAVE);
    g.act(0).cast(MENDING, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GRAVE, V22);
    g.passAll();
    // It is in the graveyard when it is discarded, with another card discarded after it or at once: two discards, two events; the first card sees both.
    g.expect.life(0, 22 + 2);
  });

  test('with "another" it sees only the other one', () => {
    const g = game(GRAVE_OTHER);
    g.act(0).cast(MENDING, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GRAVE_OTHER, V22);
    g.passAll();
    g.expect.life(0, 22 + 1);
  });
});

// ---- A player's verbs in one sentence (CR 608.2c, 701.21a, 701.9a)

describe('"Target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life."', () => {
  const game = (theirs: readonly string[], hand: readonly string[] = [BOLT]) =>
    scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(ARCHON)
      .battlefield('Swamp', { count: 8 })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('enters: the opponent sacrifices the creature they choose, discards, loses 3 life; I draw and gain 3', () => {
    const g = game([V22, V33]);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(V33);
    g.expect.zone(V33, 'graveyard', { seat: 1 });
    g.expect.zone(V22, 'battlefield', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 23);
    g.expect.handSize(0, 1);
  });

  test('a planeswalker can be the one sacrificed', () => {
    const g = game([WALKER]);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
  });

  test('nothing to sacrifice or discard: the rest is still done in order (the opponent loses life, I draw and gain)', () => {
    const g = game([], []);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 17);
    g.expect.life(0, 23);
    g.expect.handSize(0, 1);
  });

  test('attacks: the same again', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(ARCHON)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(V22)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ARCHON);
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 23);
  });
});

describe('"You gain 2 life, draw two cards, then discard two cards." (and flashback)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .life(20)
      .library('Island', 'Swamp', ...LIBRARY)
      .hand(MENDING, BOLT)
      .battlefield('Plains', 'Island', 'Plains', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('it gains, draws two, then discards two of the cards in hand, in that order', () => {
    const g = game();
    g.act(0).cast(MENDING, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.handSize(0, 3);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Island', BOLT);
    g.expect.handSize(0, 1);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(MENDING, 'graveyard', { seat: 0 });
  });

  test('flashback casts it again from the graveyard and exiles it', () => {
    const g = game();
    g.act(0).cast(MENDING, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Island', BOLT);
    g.expect.legal(0, { cast: MENDING, alternative: 'flashback' });
    g.act(0).cast(MENDING, { alternative: 'flashback', pay: true });
    g.passAll();
    g.act(0).chooseCards('Swamp', { name: 'Forest', nth: 0 });
    g.expect.zone(MENDING, 'exile', { seat: 0 });
    g.expect.life(0, 24);
  });
});

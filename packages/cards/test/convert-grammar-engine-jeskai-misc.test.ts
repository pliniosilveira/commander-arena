// Three cards of issue 100 (the Jeskai deck), run as written: "Target player draws three cards. Then that player discards two cards unless they discard a land card.", "Whenever
// enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same." and a "Choose one or more" instant that counters an activated or
// triggered ability. Each text is imported through the grammar (never through a fixture), defined in an engine scenario and played through applyAction. Every card name starts with
// "SYNTHETIC"; the wording of each text is that of the real card the issue names. No real card's text is claimed beyond that.

import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';

type Builder = ReturnType<typeof scenario>;

// ---- "Discard two cards unless they discard a land card", said of the player who drew (CR 701.9, 608.2d).

const RESEARCH = parsed(
  'SYNTHETIC Parsed Research',
  'Instant',
  'Target player draws three cards. Then that player discards two cards unless they discard a land card.',
  { manaCost: '{3}{U}', colors: ['U'] },
);

describe('"discards two cards unless they discard a land card" (CR 701.9)', () => {
  const game = (library: readonly string[], theirHand: readonly string[] = []) => {
    let b: Builder = scenario()
      .seat(0)
      .life(20)
      .define(RESEARCH)
      .hand(RESEARCH.name)
      .battlefield('Island', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...library, ...FILLER);
    for (const card of theirHand) b = b.hand(card);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('the targeted opponent draws three, then chooses: a land alone, or two cards', () => {
    const g = game([BEARS, BEARS, BEARS], ['Forest']);
    g.act(0).cast(RESEARCH.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected the discard, got ${d?.kind}`);
    expect(d.purpose).toBe('discard');
    // The player who drew is the one who chooses (CR 701.9b), not the caster.
    expect(d.seat).toBe(1);
    expect(d.min).toBe(1);
    expect(d.max).toBe(2);
    expect(d.orSingle).toHaveLength(1);
    g.act(1).chooseCards('Forest');
    g.expect.handSize(1, 3);
    g.expect.zone('Forest', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('or two cards of any kind', () => {
    const g = game([BEARS, BEARS, BEARS], ['Forest']);
    g.act(0).cast(RESEARCH.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(1).chooseCards({ name: BEARS, nth: 0 }, { name: BEARS, nth: 1 });
    g.expect.handSize(1, 2);
    g.expect.zone('Forest', 'hand', { seat: 1 });
  });

  test('a card that is not a land is no answer alone', () => {
    const g = game([BEARS, BEARS, BEARS], ['Forest']);
    g.act(0).cast(RESEARCH.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(() => g.act(1).chooseCards(BEARS)).toThrow();
  });

  test('no land in the hand: a plain discard of two, with no question about the alternative', () => {
    const g = game([BEARS, BEARS, BEARS]);
    g.act(0).cast(RESEARCH.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected the discard, got ${d?.kind}`);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.orSingle).toBeUndefined();
  });

  test('cast on yourself: you draw three and you choose', () => {
    const g = game([BEARS]);
    g.act(0).cast(RESEARCH.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected the discard, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    // The three cards drawn are lands: one alone may go.
    expect(d.orSingle).toHaveLength(3);
  });
});

// ---- An Aura Curse that gives a Gold token (CR 111.10c, 508.1, 508.6).

const OPULENCE = parsed(
  'SYNTHETIC Parsed Opulence',
  'Enchantment — Aura Curse',
  'Enchant player\nWhenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same.',
  { manaCost: '{3}{R}', colors: ['R'] },
);

describe('"Whenever enchanted player is attacked, create a Gold token. Each opponent attacking that player does the same." (CR 111.10c)', () => {
  const golds = (g: ReturnType<typeof curseGame>, seat: 0 | 1) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === 'Gold' && o.controller === seat);

  const curseGame = () =>
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(OPULENCE)
      .hand(OPULENCE.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  const attackedBy = (curseOn: 0 | 1, attacker: 0 | 1) => {
    const g = curseGame();
    g.act(0).cast(OPULENCE.name, { targets: [{ player: curseOn }], pay: true });
    g.passAll();
    expect(g.state.objects[g.id(OPULENCE.name)]?.attachedToPlayer).toBe(curseOn);
    if (attacker === 0) {
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).attack(['mine']);
    } else {
      g.advanceTo('declareAttackers', { turn: 'next' });
      g.act(1).attack(['theirs']);
    }
    g.passAll();
    return g;
  };

  test('the Gold token is a colorless artifact with a sacrifice-for-mana ability', () => {
    const g = attackedBy(1, 0);
    const [gold] = golds(g, 0);
    expect(gold?.token?.characteristics.types).toEqual(['artifact']);
    expect(gold?.token?.characteristics.subtypes).toEqual(['Gold']);
    expect(gold?.token?.characteristics.colors).toEqual([]);
  });

  test('the controller attacks the cursed opponent: the controller gets one Gold, the opponent none', () => {
    const g = attackedBy(1, 0);
    expect(golds(g, 0)).toHaveLength(1);
    expect(golds(g, 1)).toHaveLength(0);
    g.expect.invariants();
  });

  test('an opponent attacks the controller who cursed themselves: both get one Gold', () => {
    const g = attackedBy(0, 1);
    expect(golds(g, 0)).toHaveLength(1);
    expect(golds(g, 1)).toHaveLength(1);
    g.expect.invariants();
  });

  test('without the Curse on the attacked player nothing is created', () => {
    const g = attackedBy(0, 0);
    expect(golds(g, 0)).toHaveLength(0);
    expect(golds(g, 1)).toHaveLength(0);
  });

  test('a Gold token is sacrificed for one mana of any color', () => {
    const g = attackedBy(1, 0);
    expect(golds(g, 0)).toHaveLength(1);
    g.act(0).tapForMana('Gold', { color: 'G' });
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['G']);
    expect(golds(g, 0)).toHaveLength(0);
  });
});

// ---- "Choose one or more" with "Counter target activated or triggered ability" (CR 700.2, 701.6a).

const EPIPHANY = parsed(
  'SYNTHETIC Parsed Epiphany',
  'Instant',
  "Choose one or more —\n• Counter target spell.\n• Counter target activated or triggered ability.\n• Return target nonland permanent to its owner's hand.\n• Create a token that's a copy of target creature you control.\n• Target player draws a card.",
  { manaCost: '{4}{U}{U}', colors: ['U'] },
);
const ENGINE = parsed('SYNTHETIC Parsed Engine', 'Artifact', '{T}: You gain 3 life.', {
  manaCost: '{1}',
});
const SENTRY = parsed(
  'SYNTHETIC Parsed Sentry',
  'Creature — Human',
  'When ~ enters, you gain 4 life.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

describe('"Choose one or more" with a counter of an activated or triggered ability (CR 700.2, 701.6a)', () => {
  const game = (mine: (b: Builder) => Builder = (b) => b) =>
    mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER)
        .define(ENGINE)
        .define(SENTRY)
        .define(EPIPHANY)
        .battlefield(ENGINE.name)
        .hand(SENTRY.name, EPIPHANY.name)
        .battlefield('Plains')
        .battlefield('Island', { count: 6 })
        .battlefield(BEARS, { label: 'mine' }),
    )
      .seat(1)
      .life(20)
      .library(...FILLER)
      .define(EPIPHANY)
      .hand(EPIPHANY.name)
      .battlefield('Island', { count: 6 })
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('an activated ability is countered: no life is gained, and the draw mode chosen with it happens', () => {
    const g = game();
    g.act(0).activate(ENGINE.name);
    g.pass(0);
    g.act(1).cast(EPIPHANY.name, {
      modes: [1, 4],
      targets: [`${ENGINE.name} (ability)`, { player: 1 }],
      pay: true,
    });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
    g.expect.handSize(1, 1);
    g.expect.invariants();
  });

  test('without the counter the same ability gains the life', () => {
    const g = game();
    g.act(0).activate(ENGINE.name);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(23);
  });

  test('a triggered ability is countered too', () => {
    const g = game();
    g.act(0).cast(SENTRY.name, { pay: true });
    // The spell resolves; its trigger is on the stack and the opponent answers it.
    g.pass(0);
    g.pass(1);
    g.pass(0);
    g.act(1).cast(EPIPHANY.name, {
      modes: [1],
      targets: [`${SENTRY.name} (ability)`],
      pay: true,
    });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
    g.expect.zone(SENTRY.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the creature spell is not a legal target of the ability mode', () => {
    const g = game();
    g.act(0).cast(SENTRY.name, { pay: true });
    expect(() =>
      g.act(1).cast(EPIPHANY.name, {
        modes: [1],
        targets: [SENTRY.name],
        pay: true,
      }),
    ).toThrow();
  });

  test('"counter target spell" in the first mode still counters a spell', () => {
    const g = game();
    g.act(0).cast(SENTRY.name, { pay: true });
    g.act(0).pass();
    g.act(1).cast(EPIPHANY.name, { modes: [0], targets: [SENTRY.name], pay: true });
    g.passAll();
    g.expect.zone(SENTRY.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('several modes at once: a permanent returns to its owner and a token copies a creature', () => {
    const g = game();
    g.act(0).cast(EPIPHANY.name, {
      modes: [2, 3],
      targets: [{ name: BEARS, zone: 'battlefield', seat: 1 }, 'mine'],
      pay: true,
    });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    // The Bears of the caster stay, and a token copy joins them (CR 707.2).
    expect(
      g.state.battlefield.filter((id) => {
        const o = g.state.objects[id];
        return o?.controller === 0 && o.token?.characteristics.name === BEARS;
      }),
    ).toHaveLength(1);
    g.expect.invariants();
  });

  test('at least one mode is chosen: none is not an answer', () => {
    const g = game();
    g.act(0).cast(EPIPHANY.name, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected the modes, got ${d?.kind}`);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
    expect(() => g.act(0).chooseModes()).toThrow();
  });
});

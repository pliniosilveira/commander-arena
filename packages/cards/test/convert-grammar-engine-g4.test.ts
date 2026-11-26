// Desert Bloom deck, group G4 (Map the Frontier, Krosan Verge, Elvish Rejuvenator, Genesis Hydra, Winding Way, Nantuko Cultivator, Magmatic Insight): library searches, looks and reveals, and
// discarding lands. Each card is imported as a SYNTHETIC card whose Oracle text is the real wording (never a fixture), defined in an engine scenario and played through applyAction, so the
// nodes the grammar writes are what the engine runs. Pins: CR 701.23 (search), 701.24 (shuffle), 701.20 (reveal), 701.9 (discard), 118.8 (additional costs), 608.2d (choices).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

const DESERT = parsed('SYNTHETIC Parsed Desert', 'Land — Desert', '');

const statusOf = (typeLine: string, text: string, extra: Record<string, unknown> = {}) =>
  parseOnly(
    syntheticCard({
      name: 'SYNTHETIC Parsed Probe',
      typeLine,
      oracleText: text.replaceAll('~', 'SYNTHETIC Parsed Probe'),
      ...extra,
    }),
  ).support.status;

// ---- Map the Frontier: "Search your library for up to two basic land cards and/or Desert cards, put them onto the battlefield tapped, then shuffle." (CR 701.23, 701.24).

const MAP = parsed(
  'SYNTHETIC Parsed Map',
  'Sorcery',
  'Search your library for up to two basic land cards and/or Desert cards, put them onto the battlefield tapped, then shuffle.',
  { manaCost: '{3}{G}', colors: ['G'] },
);

describe('a search for basic land cards and/or Desert cards (CR 701.23)', () => {
  const run = (library: readonly string[]) =>
    scenario()
      .define(MAP)
      .define(DESERT)
      .seat(0)
      .life(20)
      .hand(MAP.name)
      .battlefield('Forest', { count: 4 })
      .library(...library)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the player may take a basic land and a Desert, both tapped, and the library is shuffled', () => {
    const g = run([DESERT.name, 'Plains', 'Grizzly Bears', 'Island']);
    g.act(0).cast(MAP.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: DESERT.name, seat: 0, zone: 'library' }, 'Plains');
    g.expect.zone(DESERT.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped({ name: DESERT.name, seat: 0, zone: 'battlefield' }, true);
    g.expect.tapped({ name: 'Plains', seat: 0, zone: 'battlefield' }, true);
    g.expect.zone('Grizzly Bears', 'library', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a card that is neither basic nor a Desert cannot be chosen', () => {
    const g = run(['Sol Ring', 'Grizzly Bears', 'Island']);
    g.act(0).cast(MAP.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Sol Ring', 'library', { seat: 0, count: 1 });
  });

  test('"and/or" is read only between two card phrases', () => {
    expect(
      statusOf(
        'Sorcery',
        'Search your library for up to two basic land cards and/or, put them onto the battlefield tapped, then shuffle.',
      ),
    ).not.toBe('supported');
  });
});

// ---- Krosan Verge: already read; the pair search is the same machinery (CR 701.23).

describe('Krosan Verge', () => {
  test('is supported', () => {
    expect(
      statusOf(
        'Land',
        'This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle.',
      ),
    ).toBe('supported');
  });
});

// ---- Elvish Rejuvenator: look at the top five, may put a land onto the battlefield tapped, the rest on the bottom in a random order (CR 701.20, 401.4).

const REJUVENATOR = parsed(
  'SYNTHETIC Parsed Rejuvenator',
  'Creature — Elf Druid',
  'When this creature enters, look at the top five cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order.',
  { manaCost: '{2}{G}', colors: ['G'], power: '1', toughness: '1' },
);

describe('Elvish Rejuvenator: a land from the top five enters tapped', () => {
  const run = () =>
    scenario()
      .define(REJUVENATOR)
      .seat(0)
      .life(20)
      .hand(REJUVENATOR.name)
      .battlefield('Forest', { count: 3 })
      .library('Grizzly Bears', { label: 'a' })
      .library('Giant Spider', { label: 'b' })
      .library('Plains', { label: 'c' })
      .library('Island', { label: 'd' })
      .library('Serra Angel', { label: 'e' })
      .library('Swamp', { label: 'f' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the land chosen is tapped on the battlefield, the other four go to the bottom, the sixth is untouched', () => {
    const g = run();
    g.act(0).cast(REJUVENATOR.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped({ name: 'Plains', seat: 0, zone: 'battlefield' }, true);
    const library = g.state.seats[0]?.library ?? [];
    expect(library.length).toBe(5);
    // the card below the five looked at is now on top; the other four are below it
    expect(library[0]).toBe(g.id('f'));
    expect(new Set(library.slice(1))).toEqual(new Set(['a', 'b', 'd', 'e'].map((l) => g.id(l))));
    g.expect.invariants();
  });

  test('the player may take no land', () => {
    const g = run();
    g.act(0).cast(REJUVENATOR.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 0 });
    expect((g.state.seats[0]?.library ?? []).length).toBe(6);
  });

  test('the same words with "untapped" are not read', () => {
    expect(
      statusOf(
        'Creature — Elf Druid',
        'When this creature enters, look at the top five cards of your library. You may put a land card from among them onto the battlefield untapped. Put the rest on the bottom of your library in a random order.',
        { manaCost: '{2}{G}', power: '1', toughness: '1' },
      ),
    ).not.toBe('supported');
  });
});

// ---- Genesis Hydra: "When you cast this spell, reveal the top X cards ... Then shuffle the rest into your library." (CR 701.20, 701.24, 202.3, 107.3).

const HYDRA = parsed(
  'SYNTHETIC Parsed Hydra',
  'Creature — Plant Hydra',
  'When you cast this spell, reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library.\nThis creature enters with X +1/+1 counters on it.',
  { manaCost: '{X}{G}{G}', colors: ['G'], power: '0', toughness: '0' },
);

describe('Genesis Hydra: reveal the top X, put a permanent of mana value X or less, shuffle the rest', () => {
  const run = () =>
    scenario()
      .define(HYDRA)
      .seat(0)
      .life(20)
      .hand(HYDRA.name)
      .battlefield('Forest', { count: 5 })
      .library('Grizzly Bears', { label: 'a' })
      .library('Plains', { label: 'b' })
      .library('Giant Spider', { label: 'c' })
      .library('Island', { label: 'd' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('X = 3 reveals three cards: the Grizzly Bears (mana value 2) may enter, the land and the Spider (4) may not', () => {
    const g = run();
    g.act(0).cast(HYDRA.name, { x: 3, pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    // only the nonland permanent card of mana value 3 or less can be chosen
    g.act(0).chooseCards('a');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0, count: 1 });
    // the three revealed cards but the one put are shuffled back; the fourth card stays in the library
    expect((g.state.seats[0]?.library ?? []).length).toBe(3);
    g.passAll();
    g.expect.zone(HYDRA.name, 'battlefield', { seat: 0 });
    g.expect.counters(HYDRA.name, { '+1/+1': 3 });
    g.expect.invariants();
  });

  test('declining leaves every revealed card in the library', () => {
    const g = run();
    g.act(0).cast(HYDRA.name, { x: 3, pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0, count: 0 });
    expect((g.state.seats[0]?.library ?? []).length).toBe(4);
    g.passAll();
    g.expect.counters(HYDRA.name, { '+1/+1': 3 });
  });

  test('X = 1 reveals one card: a land cannot be put, so nothing is asked and the card stays', () => {
    const g = scenario()
      .define(HYDRA)
      .seat(0)
      .life(20)
      .hand(HYDRA.name)
      .battlefield('Forest', { count: 5 })
      .library('Plains', 'Grizzly Bears')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(HYDRA.name, { x: 1, pay: true });
    g.passAll();
    g.expect.zone('Plains', 'library', { seat: 0, count: 1 });
    g.expect.counters(HYDRA.name, { '+1/+1': 1 });
  });
});

// ---- Winding Way: "Choose creature or land. Reveal the top four ... Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard." (CR 608.2d, 701.20a).

const WAY = parsed(
  'SYNTHETIC Parsed Way',
  'Sorcery',
  'Choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard.',
  { manaCost: '{1}{G}', colors: ['G'] },
);

describe('Winding Way: the type is chosen as the spell resolves', () => {
  const run = () =>
    scenario()
      .define(WAY)
      .seat(0)
      .life(20)
      .hand(WAY.name)
      .battlefield('Forest', { count: 2 })
      .library('Grizzly Bears', { label: 'a' })
      .library('Plains', { label: 'b' })
      .library('Giant Spider', { label: 'c' })
      .library('Sol Ring', { label: 'd' })
      .library('Island', { label: 'e' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('creature: both creatures go to the hand, the land and the artifact to the graveyard, the fifth card is untouched', () => {
    const g = run();
    g.act(0).cast(WAY.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('creature');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('land: the land goes to the hand, the others to the graveyard', () => {
    const g = run();
    g.act(0).cast(WAY.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('land');
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
  });
});

// ---- Nantuko Cultivator: "you may discard any number of land cards. Put that many +1/+1 counters on this creature and draw that many cards." (CR 701.9).

const CULTIVATOR = parsed(
  'SYNTHETIC Parsed Cultivator',
  'Creature — Insect Druid',
  'When this creature enters, you may discard any number of land cards. Put that many +1/+1 counters on this creature and draw that many cards.',
  { manaCost: '{3}{G}', colors: ['G'], power: '2', toughness: '2' },
);

describe('Nantuko Cultivator: discard any number of land cards', () => {
  const run = () =>
    scenario()
      .define(CULTIVATOR)
      .seat(0)
      .life(20)
      .hand(CULTIVATOR.name)
      .hand('Plains', { count: 2 })
      .hand('Grizzly Bears', { label: 'bears' })
      .battlefield('Forest', { count: 4 })
      .library('Giant Spider', 'Serra Angel', 'Sol Ring', 'Island')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two lands discarded: two counters and two cards drawn; the nonland card could not be chosen', () => {
    const g = run();
    g.act(0).cast(CULTIVATOR.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    // CR 701.9: only land cards of the hand can be chosen; the Grizzly Bears cannot
    const asked = g.state.pending;
    expect(asked?.kind === 'chooseCards' ? asked.legal : []).toHaveLength(2);
    expect(asked?.kind === 'chooseCards' ? asked.legal : []).not.toContain(g.id('bears'));
    g.act(0).chooseCards('Plains[0]', 'Plains[1]');
    g.expect.zone('Plains', 'graveyard', { seat: 0, count: 2 });
    g.expect.counters(CULTIVATOR.name, { '+1/+1': 2 });
    // one Grizzly Bears kept, two cards drawn
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('none discarded: no counters and nothing drawn', () => {
    const g = run();
    g.act(0).cast(CULTIVATOR.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Plains', 'graveyard', { seat: 0, count: 0 });
    g.expect.handSize(0, 3);
  });

  test('a hand with no land is not asked anything', () => {
    const g = scenario()
      .define(CULTIVATOR)
      .seat(0)
      .life(20)
      .hand(CULTIVATOR.name)
      .hand('Grizzly Bears')
      .battlefield('Forest', { count: 4 })
      .library('Giant Spider', 'Serra Angel')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(CULTIVATOR.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone(CULTIVATOR.name, 'battlefield', { seat: 0 });
  });
});

// ---- Magmatic Insight: "As an additional cost to cast this spell, discard a land card. Draw two cards." (CR 118.8, 701.9).

const INSIGHT = parsed(
  'SYNTHETIC Parsed Insight',
  'Sorcery',
  'As an additional cost to cast ~, discard a land card.\nDraw two cards.',
  { manaCost: '{R}', colors: ['R'] },
);

describe('Magmatic Insight: the card discarded as a cost is a land card', () => {
  const run = (hand: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    hand(
      scenario()
        .define(INSIGHT)
        .seat(0)
        .life(20)
        .hand(INSIGHT.name)
        .battlefield('Mountain')
        .library('Giant Spider', 'Serra Angel', 'Sol Ring'),
    )
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the land is discarded as a cost and two cards are drawn', () => {
    const g = run((b) => b.hand('Plains', 'Grizzly Bears'));
    expect(INSIGHT.faces[0]?.additionalCosts).toEqual([
      { kind: 'discard', count: 1, filter: { types: ['land'] } },
    ]);
    g.act(0).cast(INSIGHT.name, { pay: true });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('a hand with only a nonland card cannot pay it (CR 118.3)', () => {
    const g = run((b) => b.hand('Grizzly Bears'));
    g.expect.illegal(0, { cast: INSIGHT.name });
  });

  test('a discard of a card named like the spell, or of a subtype, is not an additional cost the engine pays', () => {
    expect(
      statusOf(
        'Sorcery',
        'As an additional cost to cast ~, discard another card named ~.\nDraw two cards.',
      ),
    ).not.toBe('supported');
    expect(
      statusOf(
        'Sorcery',
        'As an additional cost to cast ~, discard a Goblin card.\nDraw two cards.',
      ),
    ).not.toBe('supported');
  });

  test('with two lands the player chooses which', () => {
    const g = run((b) => b.hand('Plains', 'Island'));
    g.act(0).cast(INSIGHT.name, { pay: true });
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
  });
});

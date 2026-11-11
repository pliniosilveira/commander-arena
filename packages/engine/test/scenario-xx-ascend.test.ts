// Ascend on a permanent and the city's blessing (CR 702.131, D-ASCEND): the blessing is a designation a player has for the rest of the game, any
// number of players at once; Ascend on a permanent is a static ability that gives it to the controller as soon as they control ten or more
// permanents. "Activate only if you have the city's blessing" reads it.
// Pins: CR 702.131b (Ascend on a permanent: any time you control ten or more permanents and you don't have the blessing, you get it for the
// rest of the game), 702.131c (a designation with no meaning of its own; any number of players may have it), 702.131d (continuous effects are
// reapplied before triggers are checked), 704.3 (it is checked with the state-based actions: after every action), 602.5b (a restriction on an
// ability's use), 110.2 (permanents you control).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ascend.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const BANNER = 'SYNTHETIC Ascend Banner'; // artifact with Ascend
const SPRING = 'SYNTHETIC Blessed Spring'; // land: Ascend, {T}: {C}, {5},{T}: draw, only with the blessing
const GATE = 'SYNTHETIC Blessing Gate'; // artifact: {T}: gain 1 life, only with the blessing (no Ascend)
const ENVY = 'SYNTHETIC Envious Gate'; // artifact: {T}: gain 1 life, only if an opponent has the blessing
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

const base = (build: (b: Builder) => Builder = (b) => b): Builder =>
  build(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER);

describe('Ascend on a permanent (CR 702.131b)', () => {
  test('nine permanents are not enough; the tenth, a land played, gives the blessing', () => {
    const g = base((b) => b.hand('Forest').battlefield(BANNER).battlefield('Forest', { count: 8 }))
      .at('precombatMain')
      .build();
    g.expect.citysBlessing(0, false);
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
    g.expect.citysBlessing(1, false);
    g.expect.eventLog([{ kind: 'citysBlessingGained', seat: 0 }]);
  });

  test('nine permanents give nothing, even after the state-based actions were checked', () => {
    const g = base((b) => b.battlefield(BANNER).battlefield('Forest', { count: 8 }))
      .at('precombatMain')
      .build();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.citysBlessing(0, false);
    g.expect.noEvent({ kind: 'citysBlessingGained' });
  });

  test('the permanent that has Ascend counts itself: a land with Ascend and nine others', () => {
    const g = base((b) => b.hand(SPRING).battlefield('Forest', { count: 9 }))
      .at('precombatMain')
      .build();
    g.expect.citysBlessing(0, false);
    g.act(0).playLand(SPRING);
    g.expect.citysBlessing(0, true);
  });

  test('without a permanent with Ascend, ten or more permanents give nothing', () => {
    const g = base((b) => b.hand('Forest').battlefield('Forest', { count: 12 }))
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, false);
    g.expect.citysBlessing(1, false);
    g.expect.noEvent({ kind: 'citysBlessingGained' });
  });

  test('"you control": the opponent permanents are not counted and the opponent does not get it', () => {
    const g = base((b) => b.hand('Forest').battlefield(BANNER).battlefield('Forest', { count: 7 }))
      .seat(1)
      .battlefield('Island', { count: 8 })
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, false); // 9 of their own
    g.expect.citysBlessing(1, false); // ten permanents, but none with Ascend
  });

  test('tokens and every type of permanent count', () => {
    const g = base((b) =>
      b.hand('Forest').battlefield(BANNER, 'Grizzly Bears').battlefield('Forest', { count: 7 }),
    )
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
  });

  test('both players can have it at the same time (CR 702.131c)', () => {
    const g = base((b) => b.hand('Forest').battlefield(BANNER).battlefield('Forest', { count: 8 }))
      .seat(1)
      .battlefield(BANNER)
      .battlefield('Island', { count: 9 })
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
    g.expect.citysBlessing(1, true);
  });

  test('the blessing is kept for the rest of the game: it stays when permanents leave (CR 702.131b)', () => {
    const g = base((b) =>
      b.hand('Forest').battlefield(BANNER, 'Grizzly Bears').battlefield('Forest', { count: 7 }),
    )
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
    g.act(0).pass();
    g.act(1).cast('Murder', { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard');
    expect(g.state.objects[g.id(BANNER)]?.zone).toBe('battlefield');
    g.expect.citysBlessing(0, true);
  });

  test('it is gained once: the event is not repeated while the player controls ten or more', () => {
    const g = base((b) => b.hand('Forest').battlefield(BANNER).battlefield('Forest', { count: 8 }))
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
    const gained = g.events.filter((e) => e.kind === 'citysBlessingGained').length;
    g.act(0).pass();
    expect(g.events.filter((e) => e.kind === 'citysBlessingGained')).toHaveLength(gained);
    expect(gained).toBe(1);
  });

  test('the view says who has the blessing, to both players', () => {
    const g = base((b) => b.hand('Forest').battlefield(BANNER).battlefield('Forest', { count: 8 }))
      .at('precombatMain')
      .build();
    expect(getView(g.state, 0).seats[0]?.citysBlessing).toBeUndefined();
    g.act(0).playLand('Forest');
    expect(getView(g.state, 0).seats[0]?.citysBlessing).toBe(true);
    expect(getView(g.state, 1).seats[0]?.citysBlessing).toBe(true);
    expect(getView(g.state, 1).seats[1]?.citysBlessing).toBeUndefined();
  });
});

describe('"Activate only if you have the city’s blessing" (CR 702.131c, 602.5b)', () => {
  test('without the blessing the ability is illegal, with it it draws a card', () => {
    const no = base((b) => b.battlefield(GATE))
      .at('precombatMain')
      .build();
    no.expect.illegal(0, { activate: GATE });
    const r = no.act(0).try.activate(GATE);
    expect(r.ok).toBe(false);

    const yes = base((b) => b.citysBlessing().battlefield(GATE))
      .at('precombatMain')
      .build();
    yes.expect.legal(0, { activate: GATE });
    yes.act(0).activate(GATE);
    yes.passAll();
    yes.expect.life(0, 21);
  });

  test('the land: {5},{T}: draw a card works once the blessing is there', () => {
    const g = base((b) => b.battlefield(SPRING).battlefield('Forest', { count: 5 }))
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { activate: SPRING });
    const g2 = base((b) =>
      b.citysBlessing().battlefield(SPRING).battlefield('Forest', { count: 5 }),
    )
      .at('precombatMain')
      .build();
    g2.act(0).activate(SPRING).pay();
    g2.passAll();
    g2.expect.handSize(0, 1);
  });

  test('the land makes {C} with or without the blessing', () => {
    const g = base((b) => b.battlefield(SPRING))
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(SPRING);
    g.expect.pool(0, 'C');
  });

  test('an opponent having it is read for the other player', () => {
    const none = base((b) => b.battlefield(ENVY))
      .at('precombatMain')
      .build();
    none.expect.illegal(0, { activate: ENVY });
    const theirs = base((b) => b.battlefield(ENVY))
      .seat(1)
      .citysBlessing()
      .at('precombatMain')
      .build();
    theirs.expect.legal(0, { activate: ENVY });
    const mine = base((b) => b.citysBlessing().battlefield(ENVY))
      .at('precombatMain')
      .build();
    mine.expect.illegal(0, { activate: ENVY });
  });
});

describe('the engine knows the keyword and the condition', () => {
  test('the features are supported and the cards validate', () => {
    expect(isFeatureSupported('keyword:ascend')).toBe(true);
    expect(isFeatureSupported('condition:playerHasDesignation')).toBe(true);
    for (const name of [BANNER, SPRING, GATE, ENVY]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

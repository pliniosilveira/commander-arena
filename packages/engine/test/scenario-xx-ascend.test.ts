// Ascend on a permanent and the city's blessing (CR 702.131, D-264): the blessing is a designation a player has for the rest of the game, any
// number of players at once; Ascend on a permanent is a static ability that gives it to the controller as soon as they control ten or more
// permanents. "Activate only if you have the city's blessing" reads it.
// Pins: CR 702.131b (Ascend on a permanent: any time you control ten or more permanents and you don't have the blessing, you get it for the
// rest of the game), 702.131c (a designation with no meaning of its own; any number of players may have it), 702.131d (continuous effects are
// reapplied before triggers are checked), 704.3 (it is checked with the state-based actions: after every action), 602.5 (activating an
// ability that has a restriction on its use), 613.1f (layer 6: an object that lost its abilities has no Ascend), 702.26b (a phased-out permanent is
// treated as though it does not exist), 111.1 (a token is a permanent), 110.2 (permanents you control).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-ascend.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { gainCitysBlessings } from '../src/rules/city-blessing';
import { phaseOut } from '../src/rules/phasing';
import { scenario } from '../src/testing/index';

const BANNER = 'SYNTHETIC Ascend Banner'; // artifact with Ascend
const SPRING = 'SYNTHETIC Blessed Spring'; // land: Ascend, {T}: {C}, {5},{T}: draw, only with the blessing
const GATE = 'SYNTHETIC Blessing Gate'; // artifact: {T}: gain 1 life, only with the blessing (no Ascend)
const ENVY = 'SYNTHETIC Envious Gate'; // artifact: {T}: gain 1 life, only if an opponent has the blessing
const BEAR = 'SYNTHETIC Ascend Bear'; // creature with Ascend
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

  test('every type of permanent counts: a creature, an artifact and lands', () => {
    const g = base((b) =>
      b.hand('Forest').battlefield(BANNER, 'Grizzly Bears').battlefield('Forest', { count: 7 }),
    )
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
  });

  test('tokens count (CR 111.1): thirteen Zombie tokens bring seven permanents to the blessing', () => {
    const g = base((b) =>
      b.hand('SYNTHETIC Army Muster').battlefield(BANNER).battlefield('Swamp', { count: 7 }),
    )
      .at('precombatMain')
      .build();
    g.expect.citysBlessing(0, false);
    g.act(0).cast('SYNTHETIC Army Muster', { pay: true });
    g.passAll();
    g.expect.citysBlessing(0, true);
  });

  test('an Ascend permanent the opponent controls gives nothing to the player who controls only other permanents', () => {
    const g = base((b) => b.battlefield('Forest', { count: 12 }))
      .seat(1)
      .battlefield(BANNER)
      .at('precombatMain')
      .build();
    expect(gainCitysBlessings(g.state)).toBeNull();
    g.expect.citysBlessing(0, false);
  });

  test('"you control" is read through controllerOf: Ascend under the opponent counts for the opponent', () => {
    const g = base((b) =>
      b.battlefield(BANNER, { controller: 1 }).battlefield('Forest', { count: 10 }),
    )
      .seat(1)
      .battlefield('Island', { count: 9 })
      .at('precombatMain')
      .build();
    const r = gainCitysBlessings(g.state);
    expect(r?.events).toEqual([{ kind: 'citysBlessingGained', seat: 1 }]);
    expect(r?.state.seats[0]?.citysBlessing).toBeUndefined();
    expect(r?.state.seats[1]?.citysBlessing).toBe(true);
  });

  test('a permanent that lost its abilities (layer 6) is not an Ascend source (CR 613.1f)', () => {
    const g = base((b) =>
      b
        .hand('Forest', 'SYNTHETIC Dress Down')
        .battlefield(BEAR, 'Island', 'Island')
        .battlefield('Forest', { count: 6 }),
    )
      .at('precombatMain')
      .build();
    g.expect.citysBlessing(0, false);
    g.act(0).cast('SYNTHETIC Dress Down', { pay: true, targets: [BEAR] });
    g.passAll();
    g.act(0).playLand('Forest'); // ten permanents, the only Ascend is gone
    g.expect.citysBlessing(0, false);
    g.expect.noEvent({ kind: 'citysBlessingGained' });
  });

  test('the same board with the ability intact gets the blessing (control of the layer 6 test)', () => {
    const g = base((b) =>
      b.hand('Forest').battlefield(BEAR, 'Island', 'Island').battlefield('Forest', { count: 6 }),
    )
      .at('precombatMain')
      .build();
    g.act(0).playLand('Forest');
    g.expect.citysBlessing(0, true);
  });

  test('a phased-out Ascend permanent does not count and is not a source (CR 702.26b)', () => {
    const g = base((b) => b.battlefield(BEAR).battlefield('Forest', { count: 10 }))
      .at('precombatMain')
      .build();
    expect(gainCitysBlessings(g.state)?.events).toEqual([{ kind: 'citysBlessingGained', seat: 0 }]);
    const phased = phaseOut(g.state, [g.id(BEAR)]);
    expect(phased.objects[g.id(BEAR)]?.zone).toBe('phased');
    expect(gainCitysBlessings(phased)).toBeNull();
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

describe('"Activate only if you have the city’s blessing" (CR 702.131c, 602.5)', () => {
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
    for (const name of [BANNER, BEAR, SPRING, GATE, ENVY]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});

describe('Ascend on an instant or a sorcery (CR 702.131a) is refused', () => {
  test('the validator refuses the keyword on a spell face, even marked supported', () => {
    const banner = syntheticCard(BANNER);
    const face = banner.faces[0];
    if (face === undefined) throw new Error('no face');
    for (const type of ['instant', 'sorcery'] as const) {
      const spell = {
        ...banner,
        faces: [{ ...face, types: [type] }],
      };
      const issues = validateCard(spell);
      expect(issues.map((i) => i.message).join(' '), type).toContain('Ascend');
    }
  });
});

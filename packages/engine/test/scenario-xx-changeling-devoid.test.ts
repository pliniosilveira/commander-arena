// Changeling (CR 702.73a) and Devoid (CR 702.114a), characteristic-defining abilities that work in every zone
// (D-104, D-110), and Partner (CR 702.124a), which has no effect in the game.
// Pins: CR 702.73a (every creature type, "works everywhere"), CR 604.3 (a characteristic-defining ability
// works in all zones), CR 613.3 (such effects apply first within their layer, so a later "becomes a Frog" wins),
// CR 205.3d (creature types only for a creature or a kindred object), CR 205.3m (the creature types), CR
// 702.114a (colorless everywhere), CR 202.2 (devoid: the colored mana symbols of the mana cost remain), CR
// 105.3 and 613.1e (a later effect can give a devoid object a color), CR 607.2d (the chosen type), CR 707.2
// (a copy has the ability), CR 613.6 (a layer 4 or 5 effect that began to apply stays when layer 6 removes
// the ability). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { CREATURE_TYPES, getView, SYNTHETIC_CARDS, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const CHAMELEON = 'SYNTHETIC Chameleon Drifter'; // Shapeshifter 2/2 {1}{G}, Changeling
const WISP = 'SYNTHETIC Void Wisp'; // Eldrazi Drone 2/1 {1}{U}, Devoid
const DUO = 'SYNTHETIC Duo Scout'; // Human Scout 1/2 {1}{W}, Partner
const BANNER = 'SYNTHETIC Rally Banner'; // enchantment: creatures you control of the chosen type get +1/+1
const FROG_HEX = 'SYNTHETIC Frog Hex'; // loses all abilities, becomes a blue Frog 1/1 until end of turn
const TWIN = 'SYNTHETIC Twin Image'; // token copy of target creature you control
const BEARS = 'Grizzly Bears';

type Zone = 'battlefield' | 'hand' | 'graveyard' | 'library' | 'exile' | 'stack';

/** What `derive` says about the one card of that name in that zone. */
const derived = (g: ScenarioGame, name: string, zone: Zone) => {
  const obj = g.state.objects[g.id({ name, zone })];
  if (obj === undefined) throw new Error(`no ${name} in ${zone}`);
  return derive(g.state, obj);
};

function inZone(zone: Zone): ScenarioGame {
  const b = scenario().seat(0);
  const placed =
    zone === 'battlefield'
      ? b.battlefield(CHAMELEON)
      : zone === 'hand'
        ? b.hand(CHAMELEON)
        : zone === 'library'
          ? b.library(CHAMELEON)
          : zone === 'graveyard'
            ? b.graveyard(CHAMELEON)
            : b.exile(CHAMELEON);
  return placed.seat(1).build();
}

describe('CR 702.73a (Changeling): every creature type', () => {
  test('it has every creature type of CR 205.3m once, and its own type among them', () => {
    const subtypes = derived(inZone('battlefield'), CHAMELEON, 'battlefield').subtypes;
    expect(subtypes.length).toBe(CREATURE_TYPES.length);
    for (const type of CREATURE_TYPES) expect(subtypes, type).toContain(type);
    expect(subtypes).toContain('Shapeshifter');
    expect(new Set(subtypes).size).toBe(subtypes.length);
    inZone('battlefield').expect.derived(CHAMELEON, {
      types: ['creature'],
      keywords: ['changeling'],
    });
  });

  test('it works everywhere: hand, library, graveyard and exile (CR 604.3)', () => {
    for (const zone of ['hand', 'library', 'graveyard', 'exile'] as const) {
      const subtypes = derived(inZone(zone), CHAMELEON, zone).subtypes;
      expect(subtypes, zone).toContain('Elf');
      expect(subtypes, zone).toContain('Time Lord');
      expect(subtypes.length, zone).toBe(CREATURE_TYPES.length);
    }
  });

  test('on the stack too, and the view shows the types', () => {
    const g = scenario().seat(0).hand(CHAMELEON).battlefield('Forest', 'Forest').seat(1).build();
    g.act(0).cast(CHAMELEON, { pay: true });
    expect(derived(g, CHAMELEON, 'stack').subtypes).toContain('Goblin');
    expect(getView(g.state, 0).stack[0]?.subtypes).toContain('Goblin');
  });

  test('a chosen-type lord pumps a changeling whatever type was chosen (D-100, CR 607.2d)', () => {
    for (const type of ['Elf', 'Goblin', 'Time Lord']) {
      const g = scenario()
        .seat(0)
        .battlefield(BANNER, { chosen: { creatureType: type } })
        .battlefield(CHAMELEON)
        .battlefield(BEARS)
        .seat(1)
        .build();
      g.expect.pt(CHAMELEON, 3, 3);
      g.expect.pt(BEARS, 2, 2);
    }
  });

  test('"becomes a Frog" replaces the types changeling gave (CR 613.3: the CDA applies first)', () => {
    const g = scenario()
      .seat(0)
      .hand(FROG_HEX)
      .battlefield('Island', 'Island')
      .battlefield(CHAMELEON)
      .seat(1)
      .build();
    g.act(0).cast(FROG_HEX, { targets: [CHAMELEON], pay: true });
    g.passAll();
    g.expect.derived(CHAMELEON, { subtypes: ['Frog'], types: ['creature'] });
  });

  test('a copy has it (CR 707.2: the ability is copiable), as a token too', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield(CHAMELEON)
      .battlefield('Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(TWIN, { targets: [CHAMELEON], pay: true });
    g.passAll();
    const copies = g.find({ name: CHAMELEON, zone: 'battlefield' });
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      const obj = g.state.objects[c.id];
      expect(obj && derive(g.state, obj).subtypes).toContain('Wizard');
    }
  });

  test('losing all abilities in layer 6 does not undo what layer 4 gave (CR 613.6)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Mute',
          manaCost: ['U'],
          types: ['instant'],
          colors: ['U'],
          colorIdentity: ['U'],
          oracleText: 'Target creature loses all abilities until end of turn.',
          spell: {
            targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
            effect: {
              kind: 'loseAllAbilities',
              objects: { kind: 'target', id: 't1' },
              duration: 'untilEndOfTurn',
            },
          },
        }),
      )
      .hand('SYNTHETIC Test Mute')
      .battlefield('Island')
      .battlefield(BANNER, { chosen: { creatureType: 'Elf' } })
      .battlefield(CHAMELEON)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Test Mute', { targets: [CHAMELEON], pay: true });
    g.passAll();
    g.expect.derived(CHAMELEON, { keywords: [] });
    expect(derived(g, CHAMELEON, 'battlefield').subtypes).toContain('Elf');
    g.expect.pt(CHAMELEON, 3, 3);
  });

  test('a card that is not a creature or kindred has no creature types (CR 205.3d)', () => {
    const g = scenario()
      .seat(0)
      .define(
        singleFace({
          name: 'SYNTHETIC Test Odd Relic',
          manaCost: ['1'],
          types: ['artifact'],
          colors: [],
          colorIdentity: [],
          oracleText: 'Changeling',
          abilities: [{ kind: 'keyword', keyword: { kind: 'changeling' } }],
        }),
      )
      .battlefield('SYNTHETIC Test Odd Relic')
      .seat(1)
      .build();
    expect(derived(g, 'SYNTHETIC Test Odd Relic', 'battlefield').subtypes).toEqual([]);
  });
});

describe('CR 702.114a (Devoid): colorless everywhere', () => {
  test('on the battlefield, in hand, library, graveyard and exile it has no color', () => {
    for (const zone of ['battlefield', 'hand', 'library', 'graveyard', 'exile'] as const) {
      const b = scenario().seat(0);
      const g = (
        zone === 'battlefield'
          ? b.battlefield(WISP)
          : zone === 'hand'
            ? b.hand(WISP)
            : zone === 'library'
              ? b.library(WISP)
              : zone === 'graveyard'
                ? b.graveyard(WISP)
                : b.exile(WISP)
      )
        .seat(1)
        .build();
      expect(derived(g, WISP, zone).colors, zone).toEqual([]);
    }
  });

  test('its mana cost keeps the blue symbol (CR 202.2) and it is colorless on the stack', () => {
    const g = scenario().seat(0).hand(WISP).battlefield('Island', 'Island').seat(1).build();
    expect(derived(g, WISP, 'hand').manaCost).toEqual(['1', 'U']);
    g.act(0).cast(WISP, { pay: true });
    g.expect.stack([WISP]);
    expect(derived(g, WISP, 'stack').colors).toEqual([]);
    expect(derived(g, WISP, 'stack').manaCost).toEqual(['1', 'U']);
    g.passAll();
    g.expect.derived(WISP, { colors: [], types: ['creature'] });
    // The mana was paid with blue and colorless mana as the cost says: the Islands are tapped.
    g.expect.tapped('Island[0]');
    g.expect.tapped('Island[1]');
  });

  test('the engine makes it colorless itself, whatever the colors written on the card (CR 604.3, 613.3)', () => {
    // Real data lists no color for a devoid card; the ability does not rely on that.
    const written = singleFace({
      name: 'SYNTHETIC Test Written Blue',
      manaCost: ['1', 'U'],
      types: ['creature'],
      colors: ['U'],
      colorIdentity: ['U'],
      power: 1,
      toughness: 1,
      oracleText: 'Devoid',
      abilities: [{ kind: 'keyword', keyword: { kind: 'devoid' } }],
    });
    const g = scenario()
      .seat(0)
      .define(written)
      .battlefield(written.name)
      .hand(written.name)
      .seat(1)
      .build();
    expect(derived(g, written.name, 'battlefield').colors).toEqual([]);
    expect(derived(g, written.name, 'hand').colors).toEqual([]);
  });

  test('a later effect gives it a color (CR 613.3, 105.3), even when it also took its abilities', () => {
    const g = scenario()
      .seat(0)
      .hand(FROG_HEX)
      .battlefield('Island', 'Island')
      .battlefield(WISP)
      .seat(1)
      .build();
    g.act(0).cast(FROG_HEX, { targets: [WISP], pay: true });
    g.passAll();
    g.expect.derived(WISP, { colors: ['U'], subtypes: ['Frog'] });
  });

  test('a colorless devoid creature is not matched by a color filter', () => {
    // "Creatures you control of the chosen color get +1/+1": a devoid creature is none of the colors.
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Hue Banner', { chosen: { color: 'U' } })
      .battlefield(WISP)
      .battlefield('Wall of Stone')
      .seat(1)
      .build();
    g.expect.pt(WISP, 2, 1);
  });
});

describe('CR 702.124a (Partner): accepted, no effect in the game', () => {
  test('the card validates and plays as a vanilla creature', () => {
    expect(validateCard(SYNTHETIC_CARDS[DUO] as never)).toEqual([]);
    const g = scenario().seat(0).battlefield(DUO).seat(1).build();
    g.expect.pt(DUO, 1, 2);
    g.expect.derived(DUO, { keywords: ['partner'] });
    g.expect.invariants();
  });
});

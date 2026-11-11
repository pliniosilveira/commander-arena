// "As this enters, choose a creature type / a color" and what reads the choice (D-100).
// Pins: CR 614.1c and CR 614.12 (an "As this enters" ability is a replacement effect applied as the
// permanent enters), CR 614.12a (a choice a replacement effect needs is made before the permanent
// enters, by its controller; so the permanent is not on the battlefield while it is asked, whatever put
// it there: a resolving spell, an effect, a land play), CR 614.12 (Voice of All's example: a token that
// is a copy asks for its own choice), CR 400.7 (the new object after a zone change has made no choice),
// CR 607.2d (the ability that refers to "the chosen type" is linked to the one that chose), CR 205.3m
// (the creature types), CR 105.1 (the five colors), CR 611.3a (a static ability "applies to whatever its
// text describes at any moment"), CR 613.1d/613.1f/613.6 (layer 4 comes before layer 6: "loses all
// abilities" does not undo a type already added), CR 113.7a (last-known information).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-chosen.ts) or defined in this file, or the real
// fixtures named.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  applyAction,
  type ChooseOptionDecision,
  CREATURE_TYPES,
  checkInvariants,
  getLegalActions,
  getView,
  stateHash,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BANNER = 'SYNTHETIC Rally Banner'; // enchantment {2}{W}: creatures you control of the chosen type get +1/+1
const HUE_BANNER = 'SYNTHETIC Hue Banner'; // artifact {2}: creatures you control of the chosen color get +1/+1
const CAPTAIN = 'SYNTHETIC Banner Captain'; // Elf Warrior 2/2 {1}{G}{G}: other creatures of the chosen type get +1/+1
const SHIFTING = 'SYNTHETIC Shifting Captain'; // Shapeshifter 2/2 {2}{U}: also the chosen type, and a lord of it
const HUE_CAPTAIN = 'SYNTHETIC Hue Captain'; // Human Soldier 2/2 {1}{W}{W}: other creatures of the chosen color
const LAND = 'SYNTHETIC Tribal Land'; // land: as it enters choose a creature type
const DISCOUNT = 'SYNTHETIC Tribal Discount'; // artifact {2}: creature spells of the chosen type cost {1} less
const SCOUT = 'SYNTHETIC Tribal Scout'; // Elf Scout 1/1 {1}{G}: gain 1 life when another of the chosen type enters
const RAISE = 'SYNTHETIC Raise Dead'; // sorcery {1}{B}: return target creature card from your graveyard
const FLICKER = 'SYNTHETIC Flicker Spell'; // {1}{U}: exile target creature, return it
const TWIN = 'SYNTHETIC Twin Image'; // {1}{U}: token copy of target creature you control
const ELVES = 'Llanowar Elves'; // Elf Druid 1/1, green
const BEARS = 'Grizzly Bears'; // Bear 2/2, green
const ANGEL = 'Serra Angel'; // Angel 4/4, white

const HUSH = 'SYNTHETIC Hush'; // {U}: target permanent loses all abilities until end of turn
const hush = singleFace({
  name: HUSH,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target permanent loses all abilities until end of turn.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield' } } }],
    effect: {
      kind: 'loseAllAbilities',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
    },
  },
});

const CHOOSE_TYPE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'creatureType' },
};
const OF_CHOSEN_TYPE = { types: ['creature'], controller: 'you', chosenType: true } as const;

const MOURNER = 'SYNTHETIC Mourner'; // when it dies, creatures you control of the chosen type get +2/+2
const mourner = singleFace({
  name: MOURNER,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 1,
  oracleText:
    'As this creature enters, choose a creature type. When this creature dies, creatures you control of the chosen type get +2/+2 until end of turn.',
  abilities: [
    CHOOSE_TYPE,
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'each', filter: OF_CHOSEN_TYPE },
        power: 2,
        toughness: 2,
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

const COACH = 'SYNTHETIC Tribal Coach'; // {T}: target creature of the chosen type gets +2/+2 until end of turn
const coach = singleFace({
  name: COACH,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Human', 'Shaman'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 1,
  toughness: 1,
  oracleText:
    'As this creature enters, choose a creature type. {T}: Target creature of the chosen type gets +2/+2 until end of turn.',
  abilities: [
    CHOOSE_TYPE,
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', ...OF_CHOSEN_TYPE } },
        },
      ],
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'target', id: 't1' },
        power: 2,
        toughness: 2,
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

const FETCH = 'SYNTHETIC Tribal Fetch'; // {G}: search for a land card, put it onto the battlefield
const fetch = singleFace({
  name: FETCH,
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Search your library for a land card, put it onto the battlefield, then shuffle.',
  spell: {
    effect: {
      kind: 'search',
      player: { kind: 'you' },
      filter: { types: ['land'] },
      max: 1,
      destinations: [{ zone: 'battlefield', count: 1 }],
      reveal: false,
      shuffle: true,
    },
  },
});

function question(g: ScenarioGame): ChooseOptionDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
  return d;
}

/** Seat 0 casts `card` with lands to pay for it and lets it resolve: the question is open. */
function castAndResolve(card: string, others: readonly string[] = []): ScenarioGame {
  const g = scenario()
    .define(hush)
    .seat(0)
    .hand(card, ...others)
    .battlefield('Plains', 'Forest', 'Forest', 'Island')
    .seat(1)
    .build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

describe('a permanent spell asks as it resolves (CR 614.12a)', () => {
  test('the spell is still on the stack while the question is open; the decision names it', () => {
    const g = castAndResolve(BANNER);
    const d = question(g);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('creatureType');
    expect(d.sourceName).toBe(BANNER);
    expect(d.sourceOracleText).toContain('choose a creature type');
    expect(d.source).toBe(g.id(BANNER));
    expect(d.options).toContain('Elf');
    expect(d.options).toContain('Time Lord');
    g.expect.zone(BANNER, 'stack');
    g.expect.noObject(BANNER, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('every creature type of CR 205.3m is an option, once, as the generated table has it', () => {
    const d = question(castAndResolve(BANNER));
    expect(d.options).toEqual(CREATURE_TYPES);
    expect(new Set(d.options).size).toBe(d.options.length);
    // The one two-word type, and the names with a typographic apostrophe, are spelled as the CR spells them.
    expect(d.options).toContain('Time Lord');
    expect(d.options).toContain('C’tan');
    expect(d.options).not.toContain('Time');
  });

  test('the answer is stored on the permanent, which then enters; the spell is done', () => {
    const g = castAndResolve(BANNER);
    const before = g.mark();
    g.act(0).chooseOption('Elf');
    g.expect.zone(BANNER, 'battlefield', { seat: 0 });
    g.expect.chosen(BANNER, { creatureType: 'Elf' });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [
        { kind: 'optionChosen', seat: 0, purpose: 'creatureType', option: 'Elf' },
        { kind: 'zoneChanged', fromZone: 'stack', toZone: 'battlefield' },
        { kind: 'resolved' },
      ],
      { since: before },
    );
    g.expect.invariants();
  });

  test('a color is asked with the five colors', () => {
    const g = castAndResolve(HUE_BANNER);
    const d = question(g);
    expect(d.purpose).toBe('color');
    expect(d.options).toEqual(['W', 'U', 'B', 'R', 'G']);
    g.act(0).chooseOption('G');
    g.expect.chosen(HUE_BANNER, { color: 'G' });
  });

  test('a countered spell never asks: it never entered', () => {
    const g = scenario()
      .seat(0)
      .hand(BANNER)
      .battlefield('Plains', 'Forest', 'Forest')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(BANNER, { pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [BANNER], pay: true });
    g.passAll();
    g.expect.zone(BANNER, 'graveyard', { seat: 0 });
    g.expect.pending('priority');
  });
});

describe('the answer', () => {
  test('only the permanent controller answers, with an option; anything else is refused', () => {
    const g = castAndResolve(BANNER);
    expect(g.act(1).try.action({ kind: 'chooseOption', option: 'Elf' }).ok).toBe(false);
    for (const bad of ['elf', 'Elff', 'W', '', 'Time', 'Time lord']) {
      expect(g.act(0).try.action({ kind: 'chooseOption', option: bad }).ok, bad).toBe(false);
    }
    expect(g.act(0).try.pass().ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'cancel' }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'acceptOptional' }).ok).toBe(false);
    g.expect.pending('chooseOption', 0);
    // Nothing was done by the refused answers.
    g.expect.zone(BANNER, 'stack');
    g.act(0).chooseOption('Time Lord');
    g.expect.chosen(BANNER, { creatureType: 'Time Lord' });
  });

  test('a color question refuses a creature type and a creature type question refuses a color', () => {
    const g = castAndResolve(HUE_BANNER);
    expect(g.act(0).try.action({ kind: 'chooseOption', option: 'Elf' }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'chooseOption', option: 'g' }).ok).toBe(false);
    const g2 = castAndResolve(BANNER);
    expect(g2.act(0).try.action({ kind: 'chooseOption', option: 'G' }).ok).toBe(false);
  });

  test('the legal actions list every option and concede, and applyAction accepts each of them', () => {
    const g = castAndResolve(BANNER);
    const d = question(g);
    const legal = g.legalActions(0);
    expect(legal).toEqual([
      ...d.options.map((option) => ({ kind: 'chooseOption', option })),
      { kind: 'concede' },
    ]);
    expect(g.legalActions(1)).toEqual([]);
    for (const action of legal) {
      if (action.kind === 'concede') continue;
      const r = applyAction(g.state, 0, action);
      expect(r.ok, JSON.stringify(action)).toBe(true);
      if (r.ok) expect(checkInvariants(r.state)).toEqual([]);
    }
    // Everything the engine accepts for the color question is listed too.
    const colors = castAndResolve(HUE_BANNER);
    expect(getLegalActions(colors.state, 0).filter((a) => a.kind === 'chooseOption')).toHaveLength(
      5,
    );
  });

  test('conceding while the question is open ends the game', () => {
    const g = castAndResolve(BANNER);
    g.act(0).concede();
    g.expect.gameOver({ win: 1 });
  });

  test('the opponent sees the choice on the permanent, and only the chooser got the question', () => {
    const g = castAndResolve(BANNER);
    expect(getView(g.state, 0).pending?.kind).toBe('chooseOption');
    expect(getView(g.state, 1).pending).toBeNull();
    expect(getView(g.state, 1).decidingSeat).toBe(0);
    g.act(0).chooseOption('Goblin');
    for (const seat of [0, 1] as const) {
      const banner = getView(g.state, seat).battlefield.find((o) => o.name === BANNER);
      expect(banner?.chosen, `seat ${seat}`).toEqual({ creatureType: 'Goblin' });
    }
    // Objects that chose nothing carry no `chosen` field at all.
    const lands = getView(g.state, 1).battlefield.filter((o) => o.name === 'Forest');
    expect(lands.every((o) => !('chosen' in o))).toBe(true);
  });
});

describe('"Creatures you control of the chosen type get +1/+1" (CR 607.2d, 611.3a)', () => {
  /** Banner of Elves on seat 0's side with elves, a bear and the opponent's elves. */
  function elvesBoard(): ScenarioGame {
    return scenario()
      .define(hush)
      .seat(0)
      .hand(BANNER, ELVES, 'Murder', HUSH)
      .battlefield(ELVES, BEARS, ANGEL, 'Plains', 'Forest', 'Island', 'Island', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield(ELVES)
      .build();
  }

  test('only creatures of the chosen type the controller controls are pumped', () => {
    const g = elvesBoard();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 2, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(ANGEL, 4, 4);
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 1 }, 1, 1);
  });

  test('a creature that enters later is pumped too, and the choice does not depend on the type name case', () => {
    const g = elvesBoard();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0, nth: 1 }, 2, 2);
  });

  test('another type chosen pumps those creatures instead', () => {
    const g = elvesBoard();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Angel');
    g.expect.pt(ANGEL, 5, 5);
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 1, 1);
    g.expect.pt(BEARS, 2, 2);
  });

  test('when the lord leaves, the pump stops and the choice is gone with it (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(CAPTAIN, 'Murder')
      .battlefield(ELVES, 'Forest', 'Forest', 'Plains', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(CAPTAIN, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.pt(ELVES, 2, 2);
    g.act(0).cast('Murder', { targets: [CAPTAIN], pay: true });
    g.passAll();
    g.expect.zone(CAPTAIN, 'graveyard', { seat: 0 });
    g.expect.pt(ELVES, 1, 1);
    g.expect.chosen({ name: CAPTAIN, zone: 'graveyard' }, null);
    // Cast again: a new object with a new question, not the old answer.
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the Banner stays when other things leave; its pump does not care', () => {
    const g = elvesBoard();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast('Murder', { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 2, 2);
  });

  test('a creature that is a lord: it pumps the others of the type but not itself', () => {
    const g = scenario()
      .seat(0)
      .hand(CAPTAIN)
      .battlefield(ELVES, BEARS, 'Forest', 'Forest', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(CAPTAIN, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.pt(CAPTAIN, 2, 2);
    g.expect.pt(ELVES, 2, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.chosen(CAPTAIN, { creatureType: 'Elf' });
  });

  test('"loses all abilities" on the permanent that pumps ends the pump (layer 6 before 7c)', () => {
    const g = elvesBoard();
    g.act(0).cast(BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 2, 2);
    g.act(0).cast(HUSH, { targets: [BANNER], pay: true });
    g.passAll();
    g.expect.pt({ name: ELVES, zone: 'battlefield', seat: 0 }, 1, 1);
    // The choice is still on the permanent; only the ability that read it is gone.
    g.expect.chosen(BANNER, { creatureType: 'Elf' });
  });

  test('a lord that came from the battlefield setup keeps working with a given choice', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CAPTAIN, { chosen: { creatureType: 'Bear' } })
      .battlefield(BEARS, ELVES)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ELVES, 1, 1);
  });

  test('two permanents that chose differently each read their own choice', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER, { chosen: { creatureType: 'Elf' }, label: 'a' })
      .battlefield(BANNER, { chosen: { creatureType: 'Bear' }, label: 'b' })
      .battlefield(ELVES, BEARS, ANGEL)
      .seat(1)
      .build();
    g.expect.pt(ELVES, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ANGEL, 4, 4);
  });

  test('a permanent that has made no choice pumps nothing (the filter fails closed)', () => {
    const g = scenario().seat(0).battlefield(BANNER, ELVES, BEARS).seat(1).build();
    g.expect.pt(ELVES, 1, 1);
    g.expect.pt(BEARS, 2, 2);
  });

  test('the apostrophe of the two creature types the CR spells with a typographic one is not a trap', () => {
    const ctan = singleFace({
      name: 'SYNTHETIC Star Shard',
      manaCost: ['1'],
      types: ['creature'],
      subtypes: ["C'tan"],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'SYNTHETIC',
    });
    const g = scenario()
      .define(ctan)
      .seat(0)
      .battlefield(BANNER, { chosen: { creatureType: 'C’tan' } })
      .battlefield(ctan.name)
      .seat(1)
      .build();
    g.expect.pt(ctan.name, 2, 2);
  });
});

describe('"Creatures you control of the chosen color get +1/+1"', () => {
  test('white creatures are pumped when white is chosen, the others are not', () => {
    const g = scenario()
      .seat(0)
      .hand(HUE_BANNER)
      .battlefield(ANGEL, BEARS, ELVES, 'Forest', 'Plains')
      .seat(1)
      .battlefield('Serra Angel')
      .build();
    g.act(0).cast(HUE_BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('W');
    g.expect.pt({ name: ANGEL, zone: 'battlefield', seat: 0 }, 5, 5);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt({ name: ANGEL, zone: 'battlefield', seat: 1 }, 4, 4);
  });

  test('green: the creatures of that color, as the engine derives them', () => {
    const g = scenario()
      .seat(0)
      .hand(HUE_BANNER)
      .battlefield(ANGEL, BEARS, ELVES, 'Forest', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(HUE_BANNER, { pay: true });
    g.passAll();
    g.act(0).chooseOption('G');
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ELVES, 2, 2);
    g.expect.pt(ANGEL, 4, 4);
  });
});

describe('"This is the chosen type in addition to its other types" (CR 613.1d, 613.6)', () => {
  function shifting(chosen: string): ScenarioGame {
    return scenario()
      .define(hush)
      .seat(0)
      .hand('SYNTHETIC Frog Hex', HUSH)
      .battlefield(SHIFTING, { chosen: { creatureType: chosen } })
      .battlefield(BANNER, { chosen: { creatureType: 'Elf' } })
      .battlefield(ELVES, 'Island', 'Island')
      .seat(1)
      .build();
  }

  test('the creature has the chosen type as well as its own', () => {
    const g = castAndResolve(SHIFTING);
    g.act(0).chooseOption('Elf');
    g.expect.derived(SHIFTING, { types: ['creature'], subtypes: ['Shapeshifter', 'Elf'] });
  });

  test('before it enters (on the stack) and with no choice made it has only its own type', () => {
    const g = scenario().seat(0).battlefield(SHIFTING).seat(1).build();
    g.expect.derived(SHIFTING, { subtypes: ['Shapeshifter'] });
  });

  test('being the chosen type, it is itself pumped by a lord of that type (layer 4 before layer 7)', () => {
    const g = shifting('Elf');
    // The Banner pumps Elves: the Captain is one by its own static ability.
    g.expect.pt(SHIFTING, 3, 3);
    g.expect.pt(ELVES, 3, 3); // the Banner and the Captain
  });

  test('it pumps the others of the type and not itself', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SHIFTING, { chosen: { creatureType: 'Bear' } })
      .battlefield(BEARS, ELVES)
      .seat(1)
      .build();
    g.expect.derived(SHIFTING, { subtypes: ['Shapeshifter', 'Bear'] });
    g.expect.pt(SHIFTING, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ELVES, 1, 1);
  });

  test('"loses all abilities" ends its pump but keeps the type it already added (CR 613.6)', () => {
    const g = shifting('Elf');
    g.act(0).cast(HUSH, { targets: [SHIFTING], pay: true });
    g.passAll();
    // Layer 6 removes the lord's ability, so the Elves lose its pump (the Banner still pumps them) ...
    g.expect.pt(ELVES, 2, 2);
    // ... but layer 4 came first: it is still an Elf, and still pumped by the Banner.
    g.expect.derived(SHIFTING, { subtypes: ['Shapeshifter', 'Elf'] });
    g.expect.pt(SHIFTING, 3, 3);
  });

  test('a later "becomes a Frog" replaces its creature types, the added one included', () => {
    const g = shifting('Elf');
    g.act(0).cast('SYNTHETIC Frog Hex', { targets: [SHIFTING], pay: true });
    g.passAll();
    g.expect.derived(SHIFTING, { subtypes: ['Frog'] });
    // Not an Elf any more: the Banner does not pump it (it also lost its abilities and is 1/1).
    g.expect.pt(SHIFTING, 1, 1);
  });
});

describe('a land asks as it is played (CR 305.1, 614.12a)', () => {
  test('the question comes before the land enters: it is in the hand, no land drop is used', () => {
    const g = scenario().seat(0).hand(LAND).seat(1).build();
    const inHand = g.id(LAND);
    g.act(0).playLand(LAND);
    const d = question(g);
    expect(d.source).toBe(inHand);
    expect(d.seat).toBe(0);
    g.expect.zone(LAND, 'hand', { seat: 0 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(0);
    expect(g.act(0).try.playLand(LAND).ok).toBe(false);
    g.expect.invariants();
  });

  test('the answer plays the land, stores the choice and uses the land drop', () => {
    const g = scenario().seat(0).hand(LAND).seat(1).build();
    g.act(0).playLand(LAND);
    const before = g.mark();
    g.act(0).chooseOption('Dragon');
    g.expect.zone(LAND, 'battlefield', { seat: 0 });
    g.expect.chosen(LAND, { creatureType: 'Dragon' });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [
        { kind: 'optionChosen', seat: 0, option: 'Dragon' },
        { kind: 'zoneChanged', fromZone: 'hand', toZone: 'battlefield' },
        { kind: 'landPlayed', seat: 0 },
      ],
      { since: before },
    );
    g.act(0).tapForMana(LAND);
    g.expect.pool(0, 'C');
  });

  test('the opponent asks on its own turn: the question goes to the land controller', () => {
    const g = scenario().seat(1).hand(LAND).at('precombatMain', { active: 1, turn: 4 }).build();
    g.act(1).playLand(LAND);
    expect(question(g).seat).toBe(1);
    g.act(1).chooseOption('Zombie');
    g.expect.chosen(LAND, { creatureType: 'Zombie' });
  });
});

describe('a permanent put onto the battlefield by an effect asks too (CR 614.12)', () => {
  function raise(): ScenarioGame {
    return scenario()
      .seat(0)
      .hand(RAISE)
      .graveyard(CAPTAIN)
      .battlefield(ELVES, 'Swamp', 'Swamp')
      .seat(1)
      .build();
  }

  test('the card is asked about before it enters; the spell waits and finishes after the answer', () => {
    const g = raise();
    g.act(0).cast(RAISE, { targets: [CAPTAIN], pay: true });
    g.passAll();
    const d = question(g);
    expect(d.sourceName).toBe(CAPTAIN);
    expect(d.seat).toBe(0);
    g.expect.zone(CAPTAIN, 'graveyard', { seat: 0 });
    g.expect.zone(RAISE, 'stack');
    g.act(0).chooseOption('Elf');
    g.expect.zone(CAPTAIN, 'battlefield', { seat: 0 });
    g.expect.chosen(CAPTAIN, { creatureType: 'Elf' });
    g.expect.zone(RAISE, 'graveyard', { seat: 0 });
    g.expect.pt(ELVES, 2, 2);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('a choice is asked for each permanent that enters, and each keeps its own', () => {
    const g = scenario()
      .seat(0)
      .hand(RAISE, { label: 'first' })
      .hand(RAISE, { label: 'second' })
      .graveyard(CAPTAIN, SHIFTING)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast('first', { targets: [CAPTAIN], pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast('second', { targets: [SHIFTING], pay: true });
    g.passAll();
    g.act(0).chooseOption('Goblin');
    g.expect.chosen(CAPTAIN, { creatureType: 'Elf' });
    g.expect.chosen(SHIFTING, { creatureType: 'Goblin' });
  });

  test('flicker: the new object asks again, the old choice is gone (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(FLICKER)
      .battlefield(CAPTAIN, { chosen: { creatureType: 'Elf' } })
      .battlefield(ELVES, 'Island', 'Island')
      .seat(1)
      .build();
    const old = g.id(CAPTAIN);
    g.expect.pt(ELVES, 2, 2);
    g.act(0).cast(FLICKER, { targets: [CAPTAIN], pay: true });
    g.passAll();
    const d = question(g);
    expect(d.sourceName).toBe(CAPTAIN);
    expect(d.source).not.toBe(old);
    // While it waits, the creature is in exile and nothing pumps the Elves.
    g.expect.zone(CAPTAIN, 'exile');
    g.expect.pt(ELVES, 1, 1);
    g.act(0).chooseOption('Bear');
    g.expect.zone(CAPTAIN, 'battlefield', { seat: 0 });
    g.expect.chosen(CAPTAIN, { creatureType: 'Bear' });
    expect(g.id(CAPTAIN)).not.toBe(old);
    // The new object has the new choice: Elves are not pumped, Bears are.
    g.expect.pt(ELVES, 1, 1);
    g.expect.zone(FLICKER, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('a card found by a search and put onto the battlefield asks too (CR 614.12)', () => {
  test('the land found is asked about before it enters, and the search finishes after the answer', () => {
    const g = scenario()
      .define(fetch)
      .seat(0)
      .hand(FETCH)
      .battlefield('Forest')
      .library(LAND, 'Forest', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(FETCH, { pay: true });
    g.passAll();
    g.act(0).chooseCards({ name: LAND, zone: 'library', seat: 0 });
    const d = question(g);
    expect(d.sourceName).toBe(LAND);
    expect(d.seat).toBe(0);
    g.expect.zone(LAND, 'library', { seat: 0 });
    g.act(0).chooseOption('Merfolk');
    g.expect.zone(LAND, 'battlefield', { seat: 0 });
    g.expect.chosen(LAND, { creatureType: 'Merfolk' });
    g.expect.zone(FETCH, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});

describe('a token that is a copy asks for its own choice (CR 614.12, Voice of All)', () => {
  test('the token copy of a creature that chose a type asks; its choice is its own', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield(CAPTAIN, { chosen: { creatureType: 'Elf' } })
      .battlefield(ELVES, BEARS, 'Island', 'Island')
      .seat(1)
      .build();
    const original = g.id(CAPTAIN);
    g.act(0).cast(TWIN, { targets: [CAPTAIN], pay: true });
    g.passAll();
    const d = question(g);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('creatureType');
    expect(d.sourceName).toBe(CAPTAIN);
    // Nothing exists yet: no token on the battlefield.
    expect(g.find({ name: CAPTAIN, zone: 'battlefield' })).toHaveLength(1);
    g.act(0).chooseOption('Bear');
    const captains = g.find({ name: CAPTAIN, zone: 'battlefield' });
    expect(captains).toHaveLength(2);
    const token = captains.find((o) => o.token !== null);
    expect(token?.chosen).toEqual({ creatureType: 'Bear' });
    expect(g.object(original).chosen).toEqual({ creatureType: 'Elf' });
    // The Elf Captain pumps Elves, the Bear token pumps Bears.
    g.expect.pt(ELVES, 2, 2);
    g.expect.pt(BEARS, 3, 3);
    g.expect.zone(TWIN, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a token copy of a creature that chose a color asks for a color', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield(HUE_CAPTAIN, { chosen: { color: 'W' } })
      .battlefield(ANGEL, BEARS, 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(TWIN, { targets: [HUE_CAPTAIN], pay: true });
    g.passAll();
    expect(question(g).purpose).toBe('color');
    g.act(0).chooseOption('G');
    const token = g.find({ name: HUE_CAPTAIN, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token?.chosen).toEqual({ color: 'G' });
    g.expect.pt(ANGEL, 5, 5); // the original's white
    g.expect.pt(BEARS, 3, 3); // the token's green
  });

  test('a token copy of a creature that asks nothing is made at once', () => {
    const g = scenario().seat(0).hand(TWIN).battlefield(BEARS, 'Island', 'Island').seat(1).build();
    g.act(0).cast(TWIN, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(2);
  });
});

describe('what else reads the choice', () => {
  test('"Creature spells of the chosen type cost {1} less" (a spell on the stack matches by type)', () => {
    const g = scenario()
      .seat(0)
      .hand(ELVES, BEARS, SCOUT)
      .battlefield(DISCOUNT, { chosen: { creatureType: 'Elf' } })
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    const cost = (name: string) =>
      getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === name)?.castCost;
    // The reduction takes away generic mana only (CR 118.7a): {1}{G} Elf Scout costs {G}, {1}{G} Bears
    // (not an Elf) keep their cost, and {G} Llanowar Elves have no generic mana to lose.
    expect(cost(SCOUT)).toEqual(['G']);
    expect(cost(BEARS)).toEqual(['1', 'G']);
    expect(cost(ELVES)).toEqual(['G']);
  });

  test('"Whenever another creature of the chosen type enters under your control": only those', () => {
    const g = scenario()
      .seat(0)
      .hand(ELVES, BEARS)
      .battlefield(SCOUT, { chosen: { creatureType: 'Elf' } })
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });
});

describe('a source that is gone and a target slot read the choice too (CR 113.7a, 608.2h, 115.1)', () => {
  test('a "dies" trigger reads what the dead creature chose, from its last-known information', () => {
    const g = scenario()
      .define(mourner)
      .seat(0)
      .hand('Murder')
      .battlefield(MOURNER, { chosen: { creatureType: 'Elf' } })
      .battlefield(ELVES, BEARS, 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast('Murder', { targets: [MOURNER], pay: true });
    g.passAll();
    g.expect.zone(MOURNER, 'graveyard', { seat: 0 });
    // The Mourner is gone, with its choice (CR 400.7); its trigger still knew it.
    g.expect.chosen({ name: MOURNER, zone: 'graveyard' }, null);
    g.expect.pt(ELVES, 3, 3);
    g.expect.pt(BEARS, 2, 2);
  });

  test('an activated ability targets only creatures of the type its permanent chose', () => {
    const g = scenario()
      .define(coach)
      .seat(0)
      .battlefield(COACH, { chosen: { creatureType: 'Elf' } })
      .battlefield(ELVES, BEARS)
      .seat(1)
      .battlefield('Llanowar Elves')
      .build();
    g.act(0).activate(COACH);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected a targets decision');
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : ''));
    // Only my Elves ("creature you control of the chosen type"): not the Bears, not the Coach (a Human
    // Shaman), not the opponent's Elves.
    expect(legal).toEqual([g.id({ name: ELVES, zone: 'battlefield', seat: 0 })]);
    expect(legal).not.toContain(g.id(BEARS));
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [{ kind: 'object', id: g.id(BEARS), specId: 't1' }],
      }).ok,
    ).toBe(false);
  });
});

describe('determinism and replay', () => {
  function play(option: string): ScenarioGame {
    const g = castAndResolve(BANNER, [ELVES]);
    g.act(0).chooseOption(option);
    return g;
  }

  test('the same answers give the same state; a different answer gives a different one', () => {
    expect(play('Elf').hash()).toBe(play('Elf').hash());
    expect(play('Elf').hash()).not.toBe(play('Goblin').hash());
  });

  test('replaying the action log reproduces the state', () => {
    const g = play('Elf');
    const again = castAndResolve(BANNER, [ELVES]);
    for (const { seat, action } of g.log.slice(-1)) {
      const r = applyAction(again.state, seat, action);
      expect(r.ok).toBe(true);
      if (r.ok) expect(stateHash(r.state)).toBe(stateHash(g.state));
    }
  });
});

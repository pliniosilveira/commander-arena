// Parsed text is only worth something if the engine runs it as written (stage P15). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: tokens with keywords, counted tokens and Clues, the
// subtype nouns ("Plant creature", "Equipment", "Forest", "Elves"), "another target ...", a choice of
// card types in a graveyard, "Untap it", "each of up to two target creatures", a creature "put into a
// graveyard from the battlefield", "a player sacrifices" and "All creatures have haste". Every card name
// starts with "SYNTHETIC"; the Oracle text is the real line of the shape in reports/template-replay.md
// or marked SYNTHETIC where the replay has no real line. No real card's text is claimed; the real cards
// used as attackers, targets and spells to cast (Grizzly Bears, Llanowar Elves, Lightning Bolt, Sol
// Ring, the basic lands) are the engine's own fixtures. What is checked is what the lowering produces
// against what the rules say, through the same path as a real game.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const instant = (name: string, text: string, manaCost = '{R}') =>
  parsed(name, 'Instant', text, { manaCost, colors: ['R'] });
const creature = (
  name: string,
  text: string,
  manaCost = '{1}{G}',
  subtype = 'Bear',
  power = '2',
  toughness = '2',
) => parsed(name, `Creature — ${subtype}`, text, { manaCost, power, toughness, colors: ['G'] });
const enchantment = (name: string, text: string, manaCost = '{1}{U}') =>
  parsed(name, 'Enchantment', text, { manaCost, colors: ['U'] });
const artifact = (name: string, text: string, manaCost = '{2}') =>
  parsed(name, 'Artifact', text, { manaCost });

const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1 Elf Druid
const BOLT = 'Lightning Bolt';
const RING = 'Sol Ring'; // artifact, {1}
const MURDER = 'Murder'; // instant, {1}{B}{B}

/** The permanents named `name` on the battlefield, `seat`'s. */
const count = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.find({ name, zone: 'battlefield', seat }).length;

describe('tokens with keywords: "create a 1/1 ... Thopter artifact creature token with flying" (CR 111.4, 702.9)', () => {
  const MAKER = enchantment(
    'SYNTHETIC Parsed Thopter Maker',
    'Whenever you cast an artifact spell, create a 1/1 colorless Thopter artifact creature token with flying.',
  );

  test('the parsed token carries a flying keyword ability of its own', () => {
    expect(MAKER.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { types: ['artifact'], stackKind: 'spell' },
          by: 'you',
        },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: expect.objectContaining({
              name: 'Thopter',
              types: ['artifact', 'creature'],
              subtypes: ['Thopter'],
              colors: [],
              power: 1,
              toughness: 1,
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            }),
          },
          count: 1,
        },
      },
    ]);
  });

  const board = () =>
    scenario()
      .define(MAKER)
      .seat(0)
      .hand(RING, BOLT)
      .battlefield(MAKER.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();

  test('casting an artifact spell makes a 1/1 colorless artifact creature with flying', () => {
    const g = board();
    g.act(0).cast(RING, { pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Thopter')).toBe(1);
    g.expect.pt('Thopter', 1, 1);
    g.expect.derived('Thopter', {
      types: ['artifact', 'creature'],
      subtypes: ['Thopter'],
      colors: [],
      keywords: ['flying'],
    });
    g.expect.invariants();
  });

  test('a spell that is not an artifact makes none', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    expect(count(g, 'Thopter')).toBe(0);
  });

  test('a token with flying cannot be blocked by a creature without flying or reach (CR 702.9b)', () => {
    const g = board();
    g.act(0).cast(RING, { pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('declareAttackers');
    // The token came this turn, so it is summoning sick: attack on the next turn instead.
    g.expect.canAttack('Thopter', false);
  });
});

describe('"create a 0/1 green Plant creature token for each land you control" (CR 608.2c)', () => {
  const GARDEN = creature(
    'SYNTHETIC Parsed Garden',
    'When ~ enters, create a 0/1 green Plant creature token for each land you control.',
    '{2}{G}',
  );

  test('the count is the lands you control when the instruction runs', () => {
    expect(GARDEN.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: expect.objectContaining({ name: 'Plant' }) },
          count: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
        },
      },
    ]);
  });

  test('three Forests of mine make three Plants, and the opponent lands do not count', () => {
    const g = scenario()
      .define(GARDEN)
      .seat(0)
      .hand(GARDEN.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .build();
    g.act(0).cast(GARDEN.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(count(g, 'Plant')).toBe(3);
    g.expect.pt('Plant[0]', 0, 1);
    g.expect.invariants();
  });
});

describe('"Investigate." is "Create a Clue token" (CR 701.16a, 111.10f)', () => {
  const SLEUTH = enchantment(
    'SYNTHETIC Parsed Sleuth',
    'Whenever a land you control enters, investigate.',
  );

  test('the parsed ability makes the engine Clue', () => {
    expect(SLEUTH.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
      },
    ]);
  });

  test('playing a land makes a Clue', () => {
    const g = scenario()
      .define(SLEUTH)
      .seat(0)
      .hand('Forest', 'Mountain')
      .battlefield(SLEUTH.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    expect(count(g, 'Clue')).toBe(1);
    g.expect.invariants();
  });
});

describe('a token a counterspell gives: "Its controller creates a 2/2 blue Bird creature token with flying" (CR 111.2, 608.2h)', () => {
  const NEGATOR = instant(
    'SYNTHETIC Parsed Bird Negate',
    'Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.',
    '{1}{U}',
  );

  test("the countered spell's controller gets the Bird, not the caster of the counterspell", () => {
    const g = scenario()
      .define(NEGATOR)
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .hand(NEGATOR.name)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(NEGATOR.name, { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    expect(count(g, 'Bird', 0)).toBe(1);
    expect(count(g, 'Bird', 1)).toBe(0);
    g.expect.derived('Bird', { colors: ['U'], keywords: ['flying'], subtypes: ['Bird'] });
    g.expect.invariants();
  });
});

describe('a keyword token made with other instructions: "you lose 1 life and create ..." (CR 608.2c)', () => {
  const FAERIE = creature(
    'SYNTHETIC Parsed Faerie Pact',
    'When ~ enters, you lose 1 life and create a 1/1 black Faerie Rogue creature token with flying.',
    '{1}{B}',
  );

  test('both instructions run, in order', () => {
    const g = scenario()
      .define(FAERIE)
      .seat(0)
      .hand(FAERIE.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(FAERIE.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(0, 39);
    expect(count(g, 'Faerie Rogue')).toBe(1);
    g.expect.derived('Faerie Rogue', {
      subtypes: ['Faerie', 'Rogue'],
      colors: ['B'],
      keywords: ['flying'],
    });
  });
});

describe('"if you control no Snakes": a creature type in an intervening "if" (CR 603.4, 205.3m)', () => {
  const NEST = enchantment(
    'SYNTHETIC Parsed Snake Nest',
    'At the beginning of each upkeep, if you control no Snakes, create a 1/1 black Snake creature token with deathtouch.',
    '{1}{B}',
  );

  test('the parsed condition counts permanents with the subtype', () => {
    expect(NEST.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: {
          kind: 'not',
          term: { kind: 'controlsAtLeast', filter: { subtypes: ['Snake'] }, count: 1 },
        },
        effect: expect.objectContaining({ kind: 'createToken' }),
      },
    ]);
  });

  test('one Snake in the first upkeep, and no second one in the next while it lives', () => {
    const g = scenario().define(NEST).seat(0).battlefield(NEST.name).seat(1).build();
    g.advanceTo('upkeep');
    g.passAll();
    expect(count(g, 'Snake')).toBe(1);
    g.expect.derived('Snake', { keywords: ['deathtouch'], subtypes: ['Snake'] });
    g.advanceTo('upkeep');
    g.passAll();
    expect(count(g, 'Snake')).toBe(1);
  });

  test('a Snake of mine already on the battlefield stops it from triggering at all', () => {
    const snake = creature('SYNTHETIC Parsed Plain Snake', '', '{B}', 'Snake', '1', '1');
    const g = scenario()
      .define(NEST)
      .define(snake)
      .seat(0)
      .battlefield(NEST.name)
      .battlefield(snake.name)
      .seat(1)
      .build();
    g.advanceTo('upkeep');
    g.expect.stack([]);
    expect(count(g, 'Snake')).toBe(0);
  });
});

describe('subtypes in a noun: "each Plant creature you control", "an Equipment you control" (CR 205.3)', () => {
  const GARDENER = enchantment(
    'SYNTHETIC Parsed Gardener',
    'Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.',
  );
  const SAPLING = creature('SYNTHETIC Parsed Sapling', '', '{G}', 'Plant', '0', '1');

  const board = () =>
    scenario()
      .define(GARDENER)
      .define(SAPLING)
      .seat(0)
      .hand('Forest')
      .battlefield(GARDENER.name)
      .battlefield(SAPLING.name, { label: 'sapling' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(SAPLING.name, { label: 'theirs' })
      .build();

  test('the filter is a creature with the subtype Plant that I control', () => {
    expect(GARDENER.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'landfall' },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              types: ['creature'],
              subtypes: ['Plant'],
              controller: 'you',
            },
          },
          counter: '+1/+1',
          count: 1,
        },
        optional: true,
      },
    ]);
  });

  test('accepted: my Plant gets the counter; the Bears and the opponent Plant do not', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).accept();
    g.expect.counters('sapling', { '+1/+1': 1 });
    g.expect.counters('bears', {});
    g.expect.counters('theirs', {});
    g.expect.invariants();
  });

  test('declined: nothing happens', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).decline();
    g.expect.counters('sapling', {});
  });
});

describe('"Whenever an Equipment you control enters, you may draw a card." (CR 205.3g)', () => {
  const FORGE = enchantment(
    'SYNTHETIC Parsed Forge Muse',
    'Whenever an Equipment you control enters, you may draw a card.',
  );
  const BLADE = parsed('SYNTHETIC Parsed Blade', 'Artifact — Equipment', 'Equip {1}', {
    manaCost: '{1}',
  });

  test('an Equipment entering draws a card; a plain artifact does not', () => {
    const g = scenario()
      .define(FORGE)
      .define(BLADE)
      .seat(0)
      .hand(BLADE.name, RING)
      .battlefield(FORGE.name)
      .battlefield('Mountain', 'Mountain')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    expect(FORGE.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: { subtypes: ['Equipment'], controller: 'you' } },
      optional: true,
    });
    g.act(0).cast(RING, { pay: true });
    g.passAll();
    g.expect.handSize(0 + 1, 0);
    g.act(0).cast(BLADE.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

describe('"Untap target Forest": a land type is a subtype of the permanent (CR 205.3i, 305.6)', () => {
  const HUMMING = artifact('SYNTHETIC Parsed Hummingstone', '{T}: Untap target Forest.');

  test('a tapped Forest untaps and a tapped Mountain is not a target', () => {
    const g = scenario()
      .define(HUMMING)
      .seat(0)
      .battlefield(HUMMING.name, { label: 'stone' })
      .battlefield('Forest', { tapped: true, label: 'forest' })
      .battlefield('Mountain', { tapped: true, label: 'mountain' })
      .seat(1)
      .build();
    expect(HUMMING.faces[0]?.abilities[0]).toMatchObject({
      targets: [{ what: { kind: 'object', filter: { subtypes: ['Forest'] } } }],
    });
    g.act(0).activate('stone', { targets: ['forest'], pay: true });
    g.passAll();
    g.expect.tapped('forest', false);
    g.expect.tapped('mountain', true);
    g.expect.invariants();
  });

  test('a tapped Mountain is not a legal target', () => {
    const g = scenario()
      .define(HUMMING)
      .seat(0)
      .battlefield(HUMMING.name, { label: 'stone' })
      .battlefield('Mountain', { tapped: true, label: 'mountain' })
      .seat(1)
      .build();
    expect(() => g.act(0).activate('stone', { targets: ['mountain'], pay: true })).toThrow();
  });
});

describe('"Untap another target permanent": another leaves out the source (CR 115.1, 109.1)', () => {
  const OPENER = creature('SYNTHETIC Parsed Opener', '{T}: Untap another target permanent.');

  test('it untaps another permanent but cannot name itself', () => {
    const g = scenario()
      .define(OPENER)
      .seat(0)
      .battlefield(OPENER.name, { label: 'opener' })
      .battlefield(BEARS, { tapped: true, label: 'bears' })
      .seat(1)
      .build();
    expect(OPENER.faces[0]?.abilities[0]).toMatchObject({
      targets: [{ what: { kind: 'object', filter: { other: true } } }],
    });
    g.act(0).activate('opener', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears', false);
    g.expect.tapped('opener', true);
  });

  test('its own permanent is not a legal target', () => {
    const g = scenario()
      .define(OPENER)
      .seat(0)
      .battlefield(OPENER.name, { label: 'opener' })
      .seat(1)
      .build();
    expect(() => g.act(0).activate('opener', { targets: ['opener'], pay: true })).toThrow();
  });
});

describe('"Untap it": the target the sentence before chose (CR 701.26b)', () => {
  const TRICK = instant(
    'SYNTHETIC Parsed Vigor Trick',
    'Target creature you control gets +1/+1 and gains hexproof until end of turn. Untap it.',
    '{G}',
  );

  test('the pump, the keyword and the untap all land on the one target', () => {
    const g = scenario()
      .define(TRICK)
      .seat(0)
      .hand(TRICK.name)
      .battlefield('Forest')
      .battlefield(BEARS, { tapped: true, label: 'bears' })
      .seat(1)
      .build();
    g.act(0).cast(TRICK.name, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 3, 3);
    g.expect.derived('bears', { keywords: ['hexproof'] });
    g.expect.tapped('bears', false);
    g.expect.invariants();
  });
});

describe('"each of up to two target creatures": one counter on each chosen (CR 115.1, 122.6)', () => {
  const COACH = creature(
    'SYNTHETIC Parsed Coach',
    'When ~ enters, put a +1/+1 counter on each of up to two target creatures.',
    '{2}{G}',
  );

  test('the parsed ability has a slot of zero to two and counters on the slot', () => {
    expect(COACH.faces[0]?.abilities[0]).toMatchObject({
      targets: [{ id: 't1', min: 0, max: 2 }],
      effect: { kind: 'addCounters', objects: { kind: 'target', id: 't1' }, counter: '+1/+1' },
    });
  });

  test('two chosen creatures each get a counter', () => {
    const g = scenario()
      .define(COACH)
      .seat(0)
      .hand(COACH.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(ELVES, { label: 'b' })
      .seat(1)
      .build();
    g.act(0).cast(COACH.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('a', 'b');
    g.passAll();
    g.expect.counters('a', { '+1/+1': 1 });
    g.expect.counters('b', { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('one chosen creature gets one, and none is a legal choice too', () => {
    const g = scenario()
      .define(COACH)
      .seat(0)
      .hand(COACH.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'a' })
      .seat(1)
      .build();
    g.act(0).cast(COACH.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('a');
    g.passAll();
    g.expect.counters('a', { '+1/+1': 1 });
  });
});

describe('a card of a choice of types: "return target instant or sorcery card from your graveyard" (CR 404.1, 205.2a)', () => {
  const MENTOR = creature(
    'SYNTHETIC Parsed Spell Mentor',
    'When ~ enters, return target instant or sorcery card from your graveyard to your hand.',
    '{2}{U}',
  );

  const board = () =>
    scenario()
      .define(MENTOR)
      .seat(0)
      .hand(MENTOR.name)
      .battlefield('Island', 'Island', 'Island')
      .graveyard(BOLT, BEARS, 'Divination')
      .seat(1)
      .build();

  test('the parsed target is a graveyard card of either type', () => {
    expect(MENTOR.faces[0]?.abilities[0]).toMatchObject({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'graveyard',
              controller: 'you',
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            },
          },
        },
      ],
    });
  });

  test('an instant or a sorcery can be chosen, a creature card cannot', () => {
    const g = board();
    g.act(0).cast(MENTOR.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets(BEARS)).toThrow();
  });

  test('the chosen sorcery card goes to my hand', () => {
    const g = board();
    g.act(0).cast(MENTOR.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('Divination');
    g.passAll();
    g.expect.zone('Divination', 'hand', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('"When ~ dies, return another target artifact card from your graveyard to your hand." (CR 115.1, 700.4)', () => {
  const SALVAGER = creature(
    'SYNTHETIC Parsed Salvager',
    'When ~ dies, return another target artifact card from your graveyard to your hand.',
    '{1}{B}',
    'Human',
    '1',
    '1',
  );

  test('the parsed target excludes the dying creature itself and is an artifact card', () => {
    expect(SALVAGER.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'dies', what: { kind: 'this' } },
      targets: [
        {
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', types: ['artifact'], controller: 'you', other: true },
          },
        },
      ],
    });
  });

  test('when it dies the Sol Ring comes back to the hand', () => {
    const g = scenario()
      .define(SALVAGER)
      .seat(0)
      .battlefield(SALVAGER.name, { label: 'salvager' })
      .graveyard(RING)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['salvager'], pay: true });
    g.passAll();
    // The one artifact card is the only legal target, so the engine chooses it.
    g.passAll();
    g.expect.zone(RING, 'hand', { seat: 0, count: 1 });
    g.expect.zone(SALVAGER.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('"~ is put into a graveyard from the battlefield" is "dies" (CR 700.4)', () => {
  const EXPLORER = creature(
    'SYNTHETIC Parsed Last Draft',
    'When ~ is put into a graveyard from the battlefield, draw a card.',
    '{1}{B}',
    'Human',
    '1',
    '1',
  );
  const MOURNER = enchantment(
    'SYNTHETIC Parsed Mourner',
    'Whenever another creature or artifact you control is put into a graveyard from the battlefield, each opponent loses 1 life.',
    '{1}{B}',
  );

  test('both wordings are the engine dies trigger', () => {
    expect(EXPLORER.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'dies', what: { kind: 'this' } },
    });
    expect(MOURNER.faces[0]?.abilities[0]).toMatchObject({
      trigger: {
        kind: 'dies',
        what: {
          other: true,
          controller: 'you',
          anyOf: [{ types: ['creature'] }, { types: ['artifact'] }],
        },
      },
    });
  });

  test('dying draws a card', () => {
    const g = scenario()
      .define(EXPLORER)
      .seat(0)
      .battlefield(EXPLORER.name, { label: 'explorer' })
      .library('Forest', 'Forest')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['explorer'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('a creature of mine and an artifact of mine dying each cost the opponent 1 life; the opponent creature does not', () => {
    const g = scenario()
      .define(MOURNER)
      .seat(0)
      .battlefield(MOURNER.name)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(RING, { label: 'ring' })
      .seat(1)
      .hand(BOLT, MURDER)
      .battlefield('Mountain', 'Swamp', 'Swamp', 'Swamp')
      .battlefield(ELVES, { label: 'elf' })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 39);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['elf'], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1, count: 1 });
    g.expect.invariants();
  });
});

describe('"Whenever a player sacrifices a permanent, ~ deals 1 damage to any target." (CR 701.21)', () => {
  const POKER = creature(
    'SYNTHETIC Parsed Sacrifice Poker',
    'Whenever a player sacrifices a permanent, ~ deals 1 damage to any target.',
    '{1}{R}',
    'Imp',
    '1',
    '1',
  );
  const ALTAR = artifact('SYNTHETIC Parsed Altar', 'Sacrifice a creature: You gain 1 life.', '{2}');

  test('the parsed trigger is by any player', () => {
    expect(POKER.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'permanentSacrificed', by: 'any' },
    });
  });

  const board = () =>
    scenario()
      .define(POKER)
      .define(ALTAR)
      .seat(0)
      .battlefield(POKER.name)
      .battlefield(ALTAR.name, { label: 'mine' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(ALTAR.name, { label: 'theirs' })
      .battlefield(ELVES, { label: 'elf' })
      .build();

  test('my own sacrifice triggers it: one damage to the target I choose', () => {
    const g = board();
    g.act(0).activate('mine', { pay: true });
    g.act(0).choosePermanents('bears');
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    g.expect.invariants();
  });

  test("the opponent's sacrifice triggers it for me too: by any player", () => {
    const g = board();
    g.act(0).pass();
    // The sacrifice is part of the cost, so the trigger asks for its target before the ability resolves.
    g.act(1).activate('theirs');
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(0, 40);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1, count: 1 });
  });
});

describe('static abilities for a group: "All creatures have haste." and "Elves you control get +1/+1." (CR 611.3a, 613)', () => {
  const RUSH = enchantment('SYNTHETIC Parsed Rush', 'All creatures have haste.', '{2}{R}');
  const ANTHEM = enchantment(
    'SYNTHETIC Parsed Elf Anthem',
    'Elves you control get +1/+1.',
    '{1}{G}',
  );
  const HIVE = enchantment('SYNTHETIC Parsed Hive', 'All Insects have flying.', '{1}{G}');
  const WASP = creature('SYNTHETIC Parsed Wasp', '', '{G}', 'Insect', '1', '1');

  test('the parsed subjects are filters with no controller, or with the subtype', () => {
    expect(RUSH.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'] } },
          keyword: { kind: 'haste' },
        },
      },
    ]);
    expect(ANTHEM.faces[0]?.abilities[0]).toMatchObject({
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { subtypes: ['Elf'], controller: 'you' } },
      },
    });
  });

  test('every creature has haste, whoever controls it, a fresh one included', () => {
    const g = scenario()
      .define(RUSH)
      .seat(0)
      .battlefield(RUSH.name)
      .battlefield(BEARS, { label: 'mine', fresh: true })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.expect.derived('mine', { keywords: ['haste'] });
    g.expect.derived('theirs', { keywords: ['haste'] });
    g.advanceTo('declareAttackers');
    g.expect.canAttack('mine', true);
  });

  test('Elves I control get +1/+1; my Bears and the opponent Elf do not', () => {
    const g = scenario()
      .define(ANTHEM)
      .seat(0)
      .battlefield(ANTHEM.name)
      .battlefield(ELVES, { label: 'elf' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(ELVES, { label: 'theirs' })
      .build();
    g.expect.pt('elf', 2, 2);
    g.expect.pt('bears', 2, 2);
    g.expect.pt('theirs', 1, 1);
  });

  test('"All Insects" gives flying to Insects of both players and not to a Bear', () => {
    const g = scenario()
      .define(HIVE)
      .define(WASP)
      .seat(0)
      .battlefield(HIVE.name)
      .battlefield(WASP.name, { label: 'wasp' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(WASP.name, { label: 'theirs' })
      .build();
    g.expect.derived('wasp', { keywords: ['flying'] });
    g.expect.derived('theirs', { keywords: ['flying'] });
    g.expect.derived('bears', { keywords: [] });
  });
});

describe('"Creatures your opponents control attack this turn if able." (CR 508.1d, 611.2c)', () => {
  const GOAD = creature(
    'SYNTHETIC Parsed Lure',
    '{U}, {T}: Creatures your opponents control attack this turn if able.',
    '{1}{U}',
  );

  test('the parsed effect is a restriction on the creatures they control now', () => {
    expect(GOAD.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'restrict',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } },
        restriction: 'attacksEachCombat',
        duration: 'untilEndOfTurn',
      },
    });
  });

  test('on their turn their creatures must attack: no attack is not legal, attacking is', () => {
    const g = scenario()
      .define(GOAD)
      .seat(0)
      .battlefield(GOAD.name, { label: 'lure' })
      .battlefield('Island')
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.act(0).activate('lure', { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers', { active: 1 });
    g.expect.illegal(1, { declareAttackers: [] });
    g.expect.legal(1, { declareAttackers: [{ attacker: 'theirs' }] });
  });

  test('my own creatures are not affected', () => {
    const g = scenario()
      .define(GOAD)
      .seat(0)
      .battlefield(GOAD.name, { label: 'lure' })
      .battlefield('Island')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .build();
    g.act(0).activate('lure', { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.legal(0, { declareAttackers: [] });
  });
});

describe('a choice of types with modifiers of their own: "noncreature artifact or noncreature enchantment" (CR 205.2a)', () => {
  const NOTCH = creature(
    'SYNTHETIC Parsed Notch',
    '{G}, Sacrifice ~: Exile target noncreature artifact or noncreature enchantment.',
    '{G}',
  );
  const IDOL = parsed('SYNTHETIC Parsed Idol', 'Artifact Creature — Golem', '', {
    manaCost: '{3}',
    power: '2',
    toughness: '2',
  });

  test('a Sol Ring and an enchantment are legal targets; an artifact creature and a Bears are not', () => {
    const g = () =>
      scenario()
        .define(NOTCH)
        .define(IDOL)
        .seat(0)
        .battlefield(NOTCH.name, { label: 'notch' })
        .battlefield('Forest')
        .battlefield(NOTCH.name, { label: 'second' })
        .seat(1)
        .battlefield(RING, { label: 'ring' })
        .battlefield(IDOL.name, { label: 'idol' })
        .battlefield(BEARS, { label: 'bears' })
        .build();
    const ok = g();
    ok.act(0).activate('notch', { targets: ['ring'], pay: true });
    ok.passAll();
    ok.expect.zone(RING, 'exile', { seat: 1, count: 1 });
    expect(() =>
      g()
        .act(0)
        .activate('notch', { targets: ['idol'], pay: true }),
    ).toThrow();
    expect(() =>
      g()
        .act(0)
        .activate('notch', { targets: ['bears'], pay: true }),
    ).toThrow();
  });
});

describe('"Whenever ~ becomes the target of a spell or ability an opponent controls, you gain 2 life." (CR 603.2)', () => {
  const GUARD = creature(
    'SYNTHETIC Parsed Guard Dog',
    'Whenever ~ becomes the target of a spell or ability an opponent controls, you gain 2 life.',
    '{1}{W}',
    'Dog',
    '2',
    '2',
  );

  test('the parsed trigger is the engine becomesTarget by an opponent', () => {
    expect(GUARD.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'opponent' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
      },
    ]);
  });

  test("an opponent's Bolt at it triggers; my own spell at it does not", () => {
    const g = scenario()
      .define(GUARD)
      .seat(0)
      .hand(BOLT)
      .battlefield(GUARD.name, { label: 'dog' })
      .battlefield('Mountain')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(BOLT, { targets: ['dog'], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(0, 40);

    const h = scenario()
      .define(GUARD)
      .seat(0)
      .battlefield(GUARD.name, { label: 'dog' })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    h.act(0).pass();
    h.act(1).cast(BOLT, { targets: ['dog'], pay: true });
    h.expect.stack([`${GUARD.name} (ability)`, BOLT]);
    h.passAll();
    h.expect.life(0, 42);
    h.expect.invariants();
  });
});

describe('"all other" and "each other": every permanent that matches but the source (CR 109.1)', () => {
  const PULSE = creature(
    'SYNTHETIC Parsed Pulse',
    '{T}: Put a +1/+1 counter on each other creature you control.',
    '{1}{G}',
  );

  test('the others get a counter, not the source and not the opponent creature', () => {
    const g = scenario()
      .define(PULSE)
      .seat(0)
      .battlefield(PULSE.name, { label: 'pulse' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    expect(PULSE.faces[0]?.abilities[0]).toMatchObject({
      effect: {
        kind: 'addCounters',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you', other: true } },
      },
    });
    g.act(0).activate('pulse', { pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1 });
    g.expect.counters('pulse', {});
    g.expect.counters('theirs', {});
  });
});

describe('a creature type in a condition, a count and a cost (CR 205.3m, 614.12, 608.2c, 118.1)', () => {
  const DRAGON = creature('SYNTHETIC Parsed Wyrmling', '', '{R}', 'Dragon', '1', '1');
  const LAIR = parsed(
    'SYNTHETIC Parsed Drake Lair',
    'Land',
    '~ enters tapped unless you control a Dragon.\n{T}: Add {R}.',
    {},
  );
  const CHEER = instant(
    'SYNTHETIC Parsed Elf Cheer',
    'You gain 1 life for each Elf you control.',
    '{G}',
  );
  const ELF_ALTAR = artifact(
    'SYNTHETIC Parsed Elf Altar',
    'Sacrifice an Elf: You gain 3 life.',
    '{1}',
  );

  test('"unless you control a Dragon": tapped with none, untapped with one', () => {
    const without = scenario().define(LAIR).seat(0).hand(LAIR.name).seat(1).build();
    without.act(0).playLand(LAIR.name);
    without.expect.tapped(LAIR.name, true);
    const withDragon = scenario()
      .define(LAIR)
      .define(DRAGON)
      .seat(0)
      .hand(LAIR.name)
      .battlefield(DRAGON.name)
      .seat(1)
      .build();
    withDragon.act(0).playLand(LAIR.name);
    withDragon.expect.tapped(LAIR.name, false);
  });

  test('"for each Elf you control" counts my Elves only', () => {
    const g = scenario()
      .define(CHEER)
      .seat(0)
      .hand(CHEER.name)
      .battlefield('Forest')
      .battlefield(ELVES, { count: 1 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(ELVES)
      .build();
    g.act(0).cast(CHEER.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('"Sacrifice an Elf" is a cost that only an Elf pays', () => {
    const g = scenario()
      .define(ELF_ALTAR)
      .seat(0)
      .battlefield(ELF_ALTAR.name, { label: 'altar' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(ELVES, { label: 'elf' })
      .seat(1)
      .build();
    g.act(0).activate('altar', { pay: true });
    // Only the Llanowar Elves matches, so it is sacrificed with no choice to make.
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(ELVES, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
  });
});

describe('"all graveyards": every card of every graveyard (CR 404.1)', () => {
  const RISE = parsed(
    'SYNTHETIC Parsed Grave Rise',
    'Sorcery',
    'Put all creature cards from all graveyards onto the battlefield under your control.',
    { manaCost: '{5}{B}{B}', colors: ['B'] },
  );
  const WIPE = artifact(
    'SYNTHETIC Parsed Grave Wipe',
    '{1}, {T}, Sacrifice ~: Exile all graveyards.',
    '{1}',
  );

  test('creatures of both graveyards come back under my control; a Bolt stays', () => {
    const g = scenario()
      .define(RISE)
      .seat(0)
      .hand(RISE.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(BEARS, BOLT)
      .seat(1)
      .graveyard(ELVES)
      .build();
    g.act(0).cast(RISE.name, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('"Exile all graveyards" empties both graveyards', () => {
    const g = scenario()
      .define(WIPE)
      .seat(0)
      .battlefield(WIPE.name, { label: 'wipe' })
      .battlefield('Forest')
      .graveyard(BEARS)
      .seat(1)
      .graveyard(BOLT, ELVES)
      .build();
    g.act(0).activate('wipe', { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 1 });
    g.expect.zone(BOLT, 'exile', { seat: 1, count: 1 });
    g.expect.zone(ELVES, 'exile', { seat: 1, count: 1 });
    g.expect.invariants();
  });
});

describe('a hybrid symbol in the cost of an ordinary activation: "{R/W}: ~ gains first strike until end of turn." (CR 107.4e)', () => {
  const FIGHTER = creature(
    'SYNTHETIC Parsed Dual Fighter',
    '{R/W}: ~ gains first strike until end of turn.',
    '{R/W}{R/W}',
    'Soldier',
  );
  const SMITH = creature(
    'SYNTHETIC Parsed Hybrid Smith',
    '{2/G}: ~ gains trample until end of turn.',
    '{G}',
    'Smith',
  );

  const board = (lands: readonly string[], card = FIGHTER) =>
    scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, { label: 'card' })
      .battlefield(...lands)
      .seat(1)
      .build();

  test('the parsed cost is the hybrid symbol as the engine writes it', () => {
    expect(FIGHTER.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['R/W'] }],
    });
  });

  test('either half pays it: a Mountain, or a Plains', () => {
    for (const land of ['Mountain', 'Plains']) {
      const g = board([land]);
      g.act(0).activate('card', { pay: true });
      g.passAll();
      g.expect.derived('card', { keywords: ['firstStrike'] });
      g.expect.invariants();
    }
  });

  test('another color does not: with only an Island the ability is not offered', () => {
    const g = board(['Island']);
    g.expect.illegal(0, { activate: 'card' });
  });

  test('"{2/G}" is paid with a Forest or with any two mana', () => {
    const forest = board(['Forest'], SMITH);
    forest.act(0).activate('card', { pay: true });
    forest.passAll();
    forest.expect.derived('card', { keywords: ['trample'] });
    const twoIslands = board(['Island', 'Island'], SMITH);
    twoIslands.act(0).activate('card', { pay: true });
    twoIslands.passAll();
    twoIslands.expect.derived('card', { keywords: ['trample'] });
    board(['Island'], SMITH).expect.illegal(0, { activate: 'card' });
  });
});

describe('"As ~ enters, choose a creature type." and what reads the choice (D-100, CR 614.12, 607.2d)', () => {
  const BANNER = parsed(
    'SYNTHETIC Parsed Banner',
    'Artifact',
    'As ~ enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.',
    { manaCost: '{3}' },
  );
  const HUE = parsed(
    'SYNTHETIC Parsed Hue Banner',
    'Artifact',
    'As ~ enters, choose a color.\nCreatures you control of the chosen color get +1/+0.',
    { manaCost: '{3}' },
  );
  const CHAMELEON = parsed(
    'SYNTHETIC Parsed Chameleon',
    'Creature — Shapeshifter',
    'As ~ enters, choose a creature type.\n~ is the chosen type in addition to its other types.',
    { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
  );
  const HERALD = parsed(
    'SYNTHETIC Parsed Herald',
    'Artifact',
    'As ~ enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.',
    { manaCost: '{3}' },
  );
  const SCOUT = parsed(
    'SYNTHETIC Parsed Tribal Scout',
    'Artifact',
    'As ~ enters, choose a creature type.\nWhenever you cast a creature spell of the chosen type, draw a card.',
    { manaCost: '{3}' },
  );
  const CALLER = parsed(
    'SYNTHETIC Parsed Tribal Caller',
    'Artifact',
    'As ~ enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card.',
    { manaCost: '{3}' },
  );

  test('the parsed question and its readers are the engine nodes of D-100', () => {
    expect(BANNER.faces[0]?.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', chosenType: true },
          },
          power: 1,
          toughness: 1,
        },
      },
    ]);
    expect(HUE.faces[0]?.abilities[0]).toEqual({
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'color' },
    });
    expect(CHAMELEON.faces[0]?.abilities[1]).toEqual({
      kind: 'static',
      static: { kind: 'setTypes', subject: { kind: 'this' }, chosenType: true, additive: true },
    });
    expect(HERALD.faces[0]?.abilities[1]).toEqual({
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { types: ['creature'], controller: 'you', chosenType: true },
        amount: 1,
      },
    });
  });

  test('the controller is asked as it enters; the answer pumps creatures of the type, mine only', () => {
    const g = scenario()
      .define(BANNER)
      .seat(0)
      .hand(BANNER.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(ELVES, { label: 'elf' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .battlefield(ELVES, { label: 'theirs' })
      .build();
    g.act(0).cast(BANNER.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Elf');
    g.expect.chosen(BANNER.name, { creatureType: 'Elf' });
    g.expect.pt('elf', 2, 2);
    g.expect.pt('bears', 2, 2);
    g.expect.pt('theirs', 1, 1);
    g.expect.invariants();
  });

  test('"~ enters tapped. As it enters, choose a color." taps it and asks the question', () => {
    const SHRINE = parsed(
      'SYNTHETIC Parsed Hue Shrine',
      'Artifact',
      '~ enters tapped. As it enters, choose a color.',
      { manaCost: '{1}' },
    );
    const g = scenario()
      .define(SHRINE)
      .seat(0)
      .hand(SHRINE.name)
      .battlefield('Mountain')
      .seat(1)
      .build();
    g.act(0).cast(SHRINE.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('U');
    g.expect.chosen(SHRINE.name, { color: 'U' });
    g.expect.tapped(SHRINE.name, true);
    g.expect.invariants();
  });

  test('a color: "of the chosen color" pumps the creatures of that color', () => {
    const g = scenario()
      .define(HUE)
      .seat(0)
      .hand(HUE.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(ELVES, { label: 'elf' })
      .seat(1)
      .build();
    g.act(0).cast(HUE.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('G');
    g.expect.pt('bears', 3, 2);
    g.expect.pt('elf', 2, 1);
    g.expect.invariants();
  });

  test('"~ is the chosen type in addition to its other types": it has the type it chose', () => {
    const g = scenario()
      .define(CHAMELEON)
      .seat(0)
      .hand(CHAMELEON.name)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(CHAMELEON.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.derived(CHAMELEON.name, { subtypes: ['Shapeshifter', 'Elf'] });
  });

  test('creature spells of the chosen type cost {1} less, others do not', () => {
    const cost = (g: ScenarioGame, name: string) =>
      getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === name)?.castCost;
    const bigElf = creature('SYNTHETIC Parsed Big Elf', '', '{3}{G}', 'Elf', '3', '3');
    const g = scenario()
      .define(HERALD)
      .define(bigElf)
      .seat(0)
      .hand(HERALD.name, bigElf.name, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(HERALD.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    expect(cost(g, bigElf.name)).toEqual(['2', 'G']);
    expect(cost(g, BEARS)).toEqual(['1', 'G']);
  });

  test('casting a creature spell of the chosen type draws a card; another type does not', () => {
    const g = scenario()
      .define(SCOUT)
      .seat(0)
      .hand(SCOUT.name, ELVES, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest', 'Forest')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(SCOUT.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.passAll();
    g.act(0).cast(ELVES, { pay: true });
    g.expect.stack([`${SCOUT.name} (ability)`, ELVES]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('a creature of the chosen type entering draws a card; the chooser need not be the creature', () => {
    const g = scenario()
      .define(CALLER)
      .seat(0)
      .hand(CALLER.name, ELVES, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest', 'Forest')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(CALLER.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

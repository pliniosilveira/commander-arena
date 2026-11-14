// Parsed text is only worth something if the engine runs it as written (stage P20). These tests import
// SYNTHETIC cards through the grammar (never through a fixture), define them in an engine scenario and play
// them through applyAction: power and toughness from counts and X (D-109, D-115). "gets +1/+1 for each ..."
// on a creature, an Equipment, an Aura and a lord (a static ability that follows the board, CR 611.3a),
// "~'s power and toughness are each equal to the number of ..." and its power-only and toughness-only forms
// (a characteristic-defining ability, CR 604.3), and "-X/-X", "+X/+0" and "+X/+X" in spells and in an
// activated ability (CR 107.3a, 611.2c). Every card name starts with "SYNTHETIC"; the Oracle text is the real
// line of a shape in reports/template-replay.md where the replay has one and SYNTHETIC otherwise. No real
// card's text is claimed; the real cards used as the rest of the board (Grizzly Bears, Giant Spider,
// Llanowar Elves, Sol Ring, the basic lands) are the engine's own fixtures.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type ParsedExtra, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const creature = (name: string, text: string, power = '1', toughness = '1', cost = '{G}') =>
  parsed(name, 'Creature — Bear', text, { manaCost: cost, power, toughness, colors: ['G'] });
const instant = (name: string, text: string, manaCost: string) =>
  parsed(name, 'Instant', text, { manaCost, colors: ['R'] });
const sorcery = (name: string, text: string, manaCost: string) =>
  parsed(name, 'Sorcery', text, { manaCost, colors: ['B'] });
const aura = (name: string, text: string): CardDefinition =>
  parsed(name, 'Enchantment — Aura', `Enchant creature\n${text}`, { manaCost: '{G}' });
const equipment = (name: string, text: string): CardDefinition =>
  parsed(name, 'Artifact — Equipment', text, { manaCost: '{1}' });
const enchantment = (name: string, text: string): CardDefinition =>
  parsed(name, 'Enchantment', text, { manaCost: '{1}{G}' });

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1 Elf
const SOL = 'Sol Ring'; // an artifact

describe('"~ gets +1/+0 for each artifact you control." (replay: 10 cards; CR 611.3a, 613.4c)', () => {
  const ARTISAN = creature(
    'SYNTHETIC Parsed Artisan',
    '~ gets +1/+0 for each artifact you control.',
  );

  test('the lowering is a static modifyPt of the count, and 0 where the text says +0', () => {
    expect(ARTISAN.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'this' },
          power: { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } },
          toughness: 0,
        },
      },
    ]);
  });

  test('it follows the board, and the opponent artifacts do not count', () => {
    const g = scenario()
      .define(ARTISAN)
      .seat(0)
      .battlefield(ARTISAN.name)
      .seat(1)
      .battlefield(SOL)
      .build();
    g.expect.pt(ARTISAN.name, 1, 1);
    const more = scenario()
      .define(ARTISAN)
      .seat(0)
      .battlefield(ARTISAN.name, SOL, 'Sol Ring')
      .seat(1)
      .battlefield(SOL)
      .build();
    more.expect.pt(ARTISAN.name, 3, 1);
    more.expect.invariants();
  });
});

describe('"Equipped creature gets +1/+1 for each land you control." (replay: 1 card)', () => {
  const BLADE = equipment(
    'SYNTHETIC Parsed Land Blade',
    'Equipped creature gets +1/+1 for each land you control.\nEquip {1}',
  );

  test('the bonus is the lands its controller has, once attached, and follows them', () => {
    const g = scenario()
      .define(BLADE)
      .seat(0)
      .battlefield(BLADE.name, 'Forest', 'Forest', 'Forest')
      .battlefield(BEARS)
      .seat(1)
      .battlefield('Forest', 'Forest')
      .build();
    g.expect.pt(BEARS, 2, 2);
    g.act(0).activate(BLADE.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(BLADE.name, BEARS);
    // Three lands of seat 0 (one tapped to pay, still a land); the opponent's two do not count.
    g.expect.pt(BEARS, 5, 5);
    g.expect.invariants();
  });
});

describe('"Enchanted creature gets -1/-1 for each creature card in your graveyard." (SYNTHETIC; CR 613.4c)', () => {
  const CHILL = aura(
    'SYNTHETIC Parsed Grave Chill',
    'Enchanted creature gets -1/-1 for each creature card in your graveyard.',
  );

  test('a negative step is a multiple of the count, and the creature dies when toughness reaches 0', () => {
    const g = scenario()
      .define(CHILL)
      .seat(0)
      .battlefield(SPIDER)
      .battlefield(CHILL.name, { attachedTo: SPIDER })
      .graveyard(ELVES)
      .seat(1)
      .graveyard(BEARS)
      .build();
    // One creature card in seat 0's graveyard; the opponent's does not count.
    g.expect.pt(SPIDER, 1, 3);
    const dead = scenario()
      .define(CHILL)
      .seat(0)
      .hand('Forest')
      .battlefield(ELVES)
      .battlefield(CHILL.name, { attachedTo: ELVES })
      .graveyard(BEARS)
      .build();
    dead.act(0).playLand('Forest');
    dead.expect.zone(ELVES, 'graveyard', { seat: 0 });
    dead.expect.invariants();
  });
});

describe('"Equipped creature gets +2/+0 for each Elf you control." (SYNTHETIC; a step of two)', () => {
  const BOW = equipment(
    'SYNTHETIC Parsed Elf Bow',
    'Equipped creature gets +2/+0 for each Elf you control.\nEquip {1}',
  );

  test('two for each Elf, the equipped creature included when it is one', () => {
    const g = scenario()
      .define(BOW)
      .seat(0)
      .battlefield(BOW.name, ELVES, ELVES)
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).activate(BOW.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 6, 2);
    g.expect.invariants();
  });
});

describe('"~ gets +1/+1 for each other creature you control." and the lord (SYNTHETIC)', () => {
  const WOLF = creature(
    'SYNTHETIC Parsed Pack Wolf',
    '~ gets +1/+1 for each other creature you control.',
  );
  const CHANTER = enchantment(
    'SYNTHETIC Parsed Chanter',
    'Other creatures you control get +1/+1 for each Elf you control.',
  );

  test('"other" leaves the creature out and the opponent creatures do not count', () => {
    const g = scenario()
      .define(WOLF)
      .seat(0)
      .battlefield(WOLF.name, BEARS, SPIDER)
      .seat(1)
      .battlefield(ELVES)
      .build();
    g.expect.pt(WOLF.name, 3, 3);
  });

  test('a lord counts the Elves, itself apart: Bears get +1/+1 for each Elf', () => {
    const g = scenario()
      .define(CHANTER)
      .seat(0)
      .battlefield(CHANTER.name, BEARS, ELVES, ELVES)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(`${ELVES}[0]`, 3, 3);
  });
});

describe('"~\'s power and toughness are each equal to the number of ..." (replay: 16, 12 and 12 cards; CR 604.3, 613.4a)', () => {
  const LANDS = creature(
    'SYNTHETIC Parsed Land Lurker',
    "~'s power and toughness are each equal to the number of lands you control.",
    '*',
    '*',
  );
  const HAND = creature(
    'SYNTHETIC Parsed Hand Hydra',
    "~'s power and toughness are each equal to the number of cards in your hand.",
    '*',
    '*',
  );
  const HORDE = creature(
    'SYNTHETIC Parsed Horde Hound',
    "~'s power and toughness are each equal to the number of creatures you control.",
    '*',
    '*',
  );

  test('the face keeps the printed stars and the ability defines both', () => {
    const [face] = LANDS.faces;
    expect(face?.power).toBe('*');
    expect(face?.toughness).toBe('*');
    expect(face?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'characteristicPt',
          power: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
          toughness: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
        },
      },
    ]);
  });

  test('lands you control: a land of the opponent does not count', () => {
    const g = scenario()
      .define(LANDS)
      .seat(0)
      .battlefield(LANDS.name, 'Forest', 'Forest', 'Mountain')
      .seat(1)
      .battlefield('Forest', 'Forest')
      .build();
    g.expect.pt(LANDS.name, 3, 3);
    g.expect.invariants();
  });

  test('cards in your hand: it is 0/0 with an empty hand and dies', () => {
    const g = scenario()
      .define(HAND)
      .seat(0)
      .hand(BEARS, BEARS)
      .battlefield(HAND.name)
      .seat(1)
      .build();
    g.expect.pt(HAND.name, 2, 2);
    const empty = scenario()
      .define(HAND)
      .seat(0)
      .hand('Forest')
      .battlefield(HAND.name)
      .seat(1)
      .build();
    empty.expect.pt(HAND.name, 1, 1);
    empty.act(0).playLand('Forest');
    empty.expect.zone(HAND.name, 'graveyard', { seat: 0 });
  });

  test('creatures you control: it counts itself on the battlefield', () => {
    const g = scenario()
      .define(HORDE)
      .seat(0)
      .battlefield(HORDE.name, BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.pt(HORDE.name, 2, 2);
  });
});

describe('"~\'s power is equal to ..." and "~\'s toughness is equal to ..." (replay: 11 and 6 cards)', () => {
  const HOUND = creature(
    'SYNTHETIC Parsed Power Hound',
    "~'s power is equal to the number of creatures you control.",
    '*',
    '3',
  );
  const WALL = creature(
    'SYNTHETIC Parsed Hand Wall',
    "~'s toughness is equal to the number of cards in your hand.",
    '2',
    '*',
  );

  test('power only: the toughness the card prints stays', () => {
    expect(HOUND.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'characteristicPt',
          power: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
        },
      },
    ]);
    const g = scenario()
      .define(HOUND)
      .seat(0)
      .battlefield(HOUND.name, BEARS, ELVES)
      .seat(1)
      .build();
    g.expect.pt(HOUND.name, 3, 3);
  });

  test('toughness only: the power the card prints stays', () => {
    const g = scenario()
      .define(WALL)
      .seat(0)
      .hand(BEARS, BEARS, BEARS)
      .battlefield(WALL.name)
      .seat(1)
      .build();
    g.expect.pt(WALL.name, 2, 3);
    g.expect.invariants();
  });
});

describe('"All creatures get -X/-X until end of turn." (replay: 1 card; CR 107.3a, 611.2c, 704.5f)', () => {
  const BLIGHT = sorcery(
    'SYNTHETIC Parsed Blight',
    'All creatures get -X/-X until end of turn.',
    '{X}{B}',
  );

  test('the spell has an {X} and the effect is -1 times X for both', () => {
    const [face] = BLIGHT.faces;
    expect(face?.spell?.x).toBe(true);
    expect(face?.spell?.effect).toEqual({
      kind: 'modifyPt',
      objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      power: { kind: 'times', factor: -1, of: { kind: 'x' } },
      toughness: { kind: 'times', factor: -1, of: { kind: 'x' } },
      duration: 'untilEndOfTurn',
    });
  });

  test('X = 2 kills the creatures with toughness 2 or less on both sides and shrinks the rest', () => {
    const g = scenario()
      .define(BLIGHT)
      .seat(0)
      .hand(BLIGHT.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', BEARS, SPIDER)
      .seat(1)
      .battlefield(ELVES)
      .build();
    g.act(0).cast(BLIGHT.name, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.pt(SPIDER, 0, 2);
    g.expect.invariants();
  });
});

describe('"Each creature gets -X/-X until end of turn." (SYNTHETIC)', () => {
  const EACH = sorcery(
    'SYNTHETIC Parsed Each Blight',
    'Each creature gets -X/-X until end of turn.',
    '{X}{B}',
  );

  test('the same effect as "all creatures"', () => {
    const g = scenario()
      .define(EACH)
      .seat(0)
      .hand(EACH.name)
      .battlefield('Swamp', 'Swamp', BEARS, SPIDER)
      .seat(1)
      .build();
    g.act(0).cast(EACH.name, { x: 1, pay: true });
    g.passAll();
    g.expect.pt(BEARS, 1, 1);
    g.expect.pt(SPIDER, 1, 3);
  });
});

describe('"Target creature gets +X/+0 until end of turn." and the shapes with a keyword (replay: 1 card each)', () => {
  const SURGE = instant(
    'SYNTHETIC Parsed Surge',
    'Target creature gets +X/+0 until end of turn.',
    '{X}{R}',
  );
  const SAP = instant(
    'SYNTHETIC Parsed Sap',
    'Target creature gets -X/-0 until end of turn.',
    '{X}{R}',
  );
  const MIGHT = instant(
    'SYNTHETIC Parsed Might',
    'Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn.',
    '{X}{G}',
  );
  const RIDER = creature(
    'SYNTHETIC Parsed Rider',
    '{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.',
    '1',
    '1',
    '{G}',
  );

  test('+X/+0: X is power and toughness stays', () => {
    const g = scenario()
      .define(SURGE)
      .seat(0)
      .hand(SURGE.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(SURGE.name, { x: 3, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 5, 2);
  });

  test('-X/-0 leaves the toughness alone', () => {
    const g = scenario()
      .define(SAP)
      .seat(0)
      .hand(SAP.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', SPIDER)
      .seat(1)
      .build();
    g.act(0).cast(SAP.name, { x: 2, targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.pt(SPIDER, 0, 4);
  });

  test('+X/+X and two keywords on a creature you control', () => {
    const g = scenario()
      .define(MIGHT)
      .seat(0)
      .hand(MIGHT.name)
      .battlefield('Forest', 'Forest', 'Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(MIGHT.name, { x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toEqual(
      expect.arrayContaining(['hexproof', 'indestructible']),
    );
  });

  test('an activated ability with {X} in its cost: X is announced as it is activated', () => {
    const g = scenario()
      .define(RIDER)
      .seat(0)
      .battlefield(RIDER.name, 'Mountain', 'Mountain', 'Forest', 'Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).activate(RIDER.name, { x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain('trample');
  });
});

describe('what the engine cannot count stays unsupported, with nothing half-run (CR 613.8, 107.3j)', () => {
  const read = (typeLine: string, text: string, extra: ParsedExtra = {}) =>
    parseOnly(
      syntheticCard({ name: 'SYNTHETIC Parsed Refused', typeLine, oracleText: text, ...extra }),
    );

  test('a power in the counted filter of a static ability', () => {
    const card = read(
      'Creature — Bear',
      '~ gets +1/+1 for each creature you control with power 3 or greater.',
      {
        manaCost: '{G}',
        power: '1',
        toughness: '1',
      },
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.definition.faces[0]?.abilities).toEqual([]);
  });

  test('a power in the counted filter of a defining ability', () => {
    const card = read(
      'Creature — Bear',
      "~'s power and toughness are each equal to the number of creatures you control with power 3 or greater.",
      { manaCost: '{G}', power: '*', toughness: '*' },
    );
    expect(card.support.status).toBe('unsupported');
  });

  test('a printed star with nothing that defines it', () => {
    const card = read('Creature — Bear', 'Flying', {
      manaCost: '{G}',
      power: '*',
      toughness: '*',
    });
    expect(card.support.status).toBe('unsupported');
  });

  test('an offset in the printed values: 1+*', () => {
    const card = read(
      'Creature — Bear',
      "~'s power and toughness are each equal to the number of lands you control.",
      { manaCost: '{G}', power: '1+*', toughness: '1+*' },
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.support.reasons).toContain('unsupported power value "1+*"');
  });

  test('X in a triggered ability stays unsupported; a count that follows the duration is read since stage P28', () => {
    const trigger = read(
      'Enchantment',
      'When ~ enters, each creature gets -X/-X until end of turn.',
      {
        manaCost: '{1}{B}',
      },
    );
    expect(trigger.support.status).toBe('unsupported');
    const late = read(
      'Sorcery',
      'Target creature gets +1/+1 until end of turn for each creature you control.',
      {
        manaCost: '{1}{G}',
      },
    );
    expect(late.support.status).toBe('supported');
  });
});

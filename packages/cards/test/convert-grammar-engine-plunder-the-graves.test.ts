// The Plunder the Graves deck, group A: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. Primal Growth: "Kicker—Sacrifice a creature." (CR 702.33a, 118.8, 601.2b, 601.2f-h, 701.21a).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('Primal Growth', () => {
  const growth = real('Primal Growth');
  const board = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(growth)
      .seat(0)
      .hand(growth.name)
      .battlefield('Forest', { count: 3 })
      .battlefield('Grizzly Bears')
      .library('Forest', 'Island', 'Plains', 'Forest', 'Swamp')
      .seat(1)
      .battlefield('Llanowar Elves');
    return (seats === 3 ? b.seat(2).battlefield('Llanowar Elves') : b).at('precombatMain').build();
  };

  test('is valid, with a kicker that sacrifices a creature', () => {
    expect(validateCard(growth)).toEqual([]);
    expect(growth.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: {
        kind: 'kicker',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
      },
    });
  });

  test('unkicked it puts one basic land onto the battlefield and sacrifices nothing', () => {
    const g = board();
    g.act(0).cast(growth.name, { kicked: false, pay: true });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('kicked it sacrifices a creature as a cost and puts up to two basic lands onto the battlefield instead', () => {
    const g = board();
    g.act(0).cast(growth.name, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('Island', 'Swamp');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with three seats only its own creature can be sacrificed', () => {
    const g = board(3);
    g.act(0).cast(growth.name, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Llanowar Elves', zone: 'battlefield' })).toHaveLength(2);
  });
});

describe('Champion of Stray Souls', () => {
  const champion = real('Champion of Stray Souls');
  const SWAMPS = ['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp'];
  const board = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(champion)
      .seat(0)
      .battlefield(champion.name, ...SWAMPS, 'Grizzly Bears', 'Llanowar Elves')
      .graveyard('Serra Angel', 'Giant Spider')
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(1)
      .graveyard('Typhoid Rats')
      .battlefield('Raging Goblin');
    return (seats === 3 ? b.seat(2).graveyard('Typhoid Rats').battlefield('Raging Goblin') : b)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('is valid: an activated ability with a tap, a sacrifice of X other creatures and X targets, and one that works from the graveyard', () => {
    expect(validateCard(champion)).toEqual([]);
    const abilities = champion.faces[0]?.abilities ?? [];
    expect(abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['3', 'B', 'B'] },
        { kind: 'tap' },
        { kind: 'sacrifice', what: { types: ['creature'], other: true }, countX: true },
      ],
      targets: [{ what: { kind: 'object' }, countX: true }],
    });
    expect(abilities[1]).toMatchObject({
      kind: 'activated',
      functionsIn: 'graveyard',
      effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library', position: 'top' },
    });
  });

  test('X is announced first, at most the other creatures that can be sacrificed (CR 107.3a, 602.2b, 109.1)', () => {
    const g = board();
    g.act(0).activate(champion.name, { ability: 0 });
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`expected chooseX, got ${d?.kind}`);
    // Two other creatures can be sacrificed (the Champion is not one of them) and two creature cards are in the graveyard.
    expect(d.min).toBe(0);
    expect(d.max).toBe(2);
  });

  test('X = 2 sacrifices two other creatures as a cost and returns two creature cards of its controller’s graveyard to the battlefield', () => {
    const g = board();
    g.act(0).activate(champion.name, { ability: 0, x: 2 });
    const targets = g.state.pending;
    if (targets?.kind !== 'targets') throw new Error(`expected targets, got ${targets?.kind}`);
    // Only the creature cards of its controller’s own graveyard are legal (Typhoid Rats is an opponent's).
    expect(targets.specs[0]?.legal).toHaveLength(2);
    g.act(0).chooseTargets('Serra Angel', 'Giant Spider');
    g.act(0).payAuto();
    // Exactly two other creatures can be sacrificed for X = 2, so the engine takes them (CR 701.21a).
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone(champion.name, 'battlefield', { seat: 0 });
    g.expect.tapped(champion.name);
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('X = 1 returns one card of the two and sacrifices one creature', () => {
    const g = board();
    g.act(0).activate(champion.name, { ability: 0, x: 1 });
    g.act(0).chooseTargets('Serra Angel');
    g.act(0).payAuto();
    g.act(0).choosePermanents('Llanowar Elves');
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  test('X = 0 has no target and sacrifices nothing', () => {
    const g = board();
    g.act(0).activate(champion.name, { ability: 0, x: 0, pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with three seats the opponents’ graveyards and creatures are not touched', () => {
    const g = board(3);
    g.act(0).activate(champion.name, { ability: 0, x: 2 });
    const targets = g.state.pending;
    if (targets?.kind !== 'targets') throw new Error(`expected targets, got ${targets?.kind}`);
    expect(targets.specs[0]?.legal).toHaveLength(2);
    g.act(0).chooseTargets('Serra Angel', 'Giant Spider');
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 1 });
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 2 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 2 });
  });

  test('"{5}{B}{B}: Put this card from your graveyard on top of your library." works only from the graveyard', () => {
    const onBattlefield = board();
    expect(
      getLegalActions(onBattlefield.state, 0).some(
        (a) => a.kind === 'activateAbility' && a.abilityIndex === 1,
      ),
    ).toBe(false);
    const g = scenario()
      .define(champion)
      .seat(0)
      .graveyard(champion.name)
      .battlefield(...SWAMPS)
      .library('Plains', 'Plains')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(champion.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(champion.name, 'library', { seat: 0 });
    // On top (CR 401.3), as a new object (CR 400.7).
    expect(g.state.seats[0]?.library[0]).toBe(g.id({ name: champion.name, zone: 'library' }));
    g.expect.invariants();
  });
});

describe('"Put this card from your graveyard on top of your library." (CR 113.6b, 401.3), the grammar', () => {
  test('is read only as the ability of a card that works from its graveyard', () => {
    const abilityOf = (text: string) =>
      parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Grave Piler',
          typeLine: 'Creature — Zombie',
          manaCost: '{1}{B}',
          power: '1',
          toughness: '1',
          oracleText: text,
        }),
      );
    const supported = abilityOf(
      '{2}{B}: Put this card from your graveyard on the bottom of your library.',
    );
    expect(supported.support.status).toBe('supported');
    expect(supported.definition.faces[0]?.abilities[0]).toMatchObject({
      functionsIn: 'graveyard',
      effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library', position: 'bottom' },
    });
    // A triggered ability does not work from the graveyard, and a spell has no graveyard source.
    expect(
      abilityOf('When ~ dies, put this card from your graveyard on top of your library.').support
        .status,
    ).toBe('unsupported');
    expect(
      abilityOf('Put this card from your graveyard on top of your library.').support.status,
    ).toBe('unsupported');
  });
});

describe('Diabolic Servitude', () => {
  const servitude = real('Diabolic Servitude');
  const disenchant = parsed(
    'SYNTHETIC Parsed Disenchant',
    'Instant',
    'Destroy target enchantment.',
    {
      manaCost: '{U}',
      colors: ['U'],
    },
  );
  const DISENCHANT = disenchant.name;
  const board = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(servitude)
      .define(disenchant)
      .seat(0)
      .library(...Array.from({ length: 6 }, () => 'Swamp'))
      .hand(servitude.name)
      .battlefield('Swamp', { count: 4 })
      .graveyard('Grizzly Bears')
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Swamp'))
      .hand('Lightning Bolt', DISENCHANT)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Island')
      .graveyard('Llanowar Elves');
    return (
      seats === 3
        ? b
            .seat(2)
            .library(...Array.from({ length: 6 }, () => 'Swamp'))
            .graveyard('Llanowar Elves')
        : b
    )
      .at('precombatMain', { active: 0 })
      .build();
  };
  const entered = (seats: 2 | 3 = 2) => {
    const g = board(seats);
    g.act(0).cast(servitude.name, { pay: true });
    g.passAll();
    return g;
  };

  test('is valid: three linked triggered abilities, the first remembers the creature it puts onto the battlefield', () => {
    expect(validateCard(servitude)).toEqual([]);
    const [enters, dies, leaves] = servitude.faces[0]?.abilities ?? [];
    expect(enters).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'moveToZone', to: 'battlefield', putWithSource: true },
    });
    expect(dies).toMatchObject({
      trigger: { kind: 'dies', what: { types: ['creature'], putWithSource: true } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'triggerSubject' } },
          { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        ],
      },
    });
    expect(leaves).toMatchObject({
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
      effect: { kind: 'exile', objects: { kind: 'putWithThis' } },
    });
  });

  test('its enters ability returns a creature card of its controller’s graveyard, under their control', () => {
    const g = entered();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('when the creature it returned dies, the card is exiled and the enchantment goes back to its owner’s hand', () => {
    const g = entered();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone(servitude.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('when the enchantment leaves the battlefield, the creature it returned is exiled', () => {
    const g = entered();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [servitude.name], pay: true });
    g.passAll();
    g.expect.zone(servitude.name, 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with three seats only its controller’s graveyard is a source, and the link is the same', () => {
    const g = entered(3);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 2 });
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [servitude.name], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
  });
});

describe('linked abilities that read what another ability put onto the battlefield (CR 607.2), the grammar', () => {
  const faceOf = (text: string, subtypes = 'Enchantment') =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Linker',
        typeLine: subtypes,
        manaCost: '{3}{B}',
        oracleText: text,
      }),
    );
  const MAKER =
    'When this enchantment enters, return target creature card from your graveyard to the battlefield.';
  const LEAVES =
    'When this enchantment leaves the battlefield, exile the creature put onto the battlefield with this enchantment.';

  test('one ability that puts a permanent onto the battlefield is the one the others are linked to', () => {
    const card = faceOf(`${MAKER}\n${LEAVES}`);
    expect(card.support.status).toBe('supported');
  });

  test('a reader with no ability that puts a permanent onto the battlefield is refused, never guessed', () => {
    const card = faceOf(LEAVES);
    expect(card.support.status).toBe('unsupported');
  });

  test('two abilities that put permanents onto the battlefield leave the link ambiguous: the readers are refused', () => {
    const card = faceOf(
      `${MAKER}\nWhen this enchantment dies, return target creature card from your graveyard to the battlefield.\n${LEAVES}`,
    );
    expect(card.support.status).toBe('unsupported');
    expect(card.support.unparsed.length).toBeGreaterThan(0);
  });

  test('"the creature put onto the battlefield with ~" is no other creature: "a creature" is not read', () => {
    const card = faceOf(
      `${MAKER}\nWhen this enchantment leaves the battlefield, exile a creature put onto the battlefield with this enchantment.`,
    );
    expect(card.support.status).toBe('unsupported');
  });
});

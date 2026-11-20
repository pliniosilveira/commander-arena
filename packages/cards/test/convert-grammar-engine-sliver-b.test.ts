// The Sliver Swarm deck (issue 133), group B: Oracle text of the Sliver lords that change the rules goes through the grammar (cards named SYNTHETIC, the wordings are those of
// the real cards) and is played through applyAction, so the nodes the parser writes are what the engine runs.
import { type Action, getLegalActions, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const QUICK = parsed(
  'SYNTHETIC Hive Flasher',
  'Creature — Sliver',
  'Flash\nAny player may cast Sliver spells as though they had flash.',
  { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
);
const SLIVER = parsed('SYNTHETIC Drone Sliver', 'Creature — Sliver', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

describe('"Any player may cast Sliver spells as though they had flash."', () => {
  test('reads as a permission of every player (no controller in the filter)', () => {
    expect(
      readAll('Any player may cast Sliver spells as though they had flash.', 'creature', ['Sliver'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { subtypes: ['Sliver'] }, anyPlayer: true },
      },
    ]);
    expect(
      readAll('You may cast Sliver spells as though they had flash.', 'creature', ['Sliver'])
        .abilities,
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'castAsThoughFlash',
          spells: { subtypes: ['Sliver'], controller: 'you' },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    expect(
      dropped('Each player may cast Sliver spells as though they had flash.', 'creature').text,
    ).toBe('Each player may cast Sliver spells as though they had flash.');
  });

  test('the whole card is supported and an opponent casts a Sliver at instant speed', () => {
    const g = scenario()
      .define(QUICK)
      .define(SLIVER)
      .seat(0)
      .battlefield(QUICK.name)
      .seat(1)
      .hand(SLIVER.name)
      .battlefield('Forest', { count: 2 })
      .at('upkeep', { active: 0, priority: 1 })
      .build();
    const id = g.id({ name: SLIVER.name, zone: 'hand', seat: 1 });
    expect(
      getLegalActions(g.state, 1).some((a: Action) => a.kind === 'castSpell' && a.object === id),
    ).toBe(true);
  });
});

const HATCHERY_TEXT =
  'Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost.';
const HATCHERY = parsed(
  'SYNTHETIC Hive Hatcher',
  'Creature — Sliver',
  `Replicate {1}{G} (When you cast this spell, copy it for each time you paid its replicate cost.)\n${HATCHERY_TEXT} (A copy of a permanent spell becomes a token.)`,
  { manaCost: '{1}{G}', power: '2', toughness: '2', colors: ['G'] },
);
const COSTLY = parsed('SYNTHETIC Costly Drone', 'Creature — Sliver', '', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});

describe('"Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost."', () => {
  test('reads as the grant of a replicate cost equal to the mana cost', () => {
    expect(readAll(HATCHERY_TEXT, 'creature', ['Sliver']).abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: { subtypes: ['Sliver'], controller: 'you' },
          keyword: { kind: 'replicateAtManaCost' },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    for (const text of [
      'Each Sliver spell you cast has replicate.',
      'Each Sliver spell you cast has replicate. The replicate cost is equal to {1}.',
      'Each Sliver spell has replicate. The replicate cost is equal to its mana cost.',
    ]) {
      expect(dropped(text, 'creature', ['Sliver']).text, text).toBe(text);
    }
  });

  test('a spell cast with it asks for the replicate count and makes token copies', () => {
    const g = scenario()
      .define(HATCHERY)
      .define(COSTLY)
      .seat(0)
      .hand(COSTLY.name)
      .battlefield('Forest', { count: 7 })
      .battlefield(HATCHERY.name)
      .seat(1)
      .build();
    g.act(0).cast(COSTLY.name, { replicas: 2, pay: true });
    g.passAll();
    const slivers = g.find({ name: COSTLY.name, zone: 'battlefield' });
    expect(slivers).toHaveLength(3);
    expect(slivers.filter((o) => o.token !== null)).toHaveLength(2);
  });
});

const LEGEND_TEXT = 'The "legend rule" doesn\'t apply to Slivers you control.';
const CHOSEN_TEXT =
  "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.";
const ENCORE_TEXT =
  'Each Sliver creature card in your graveyard has encore {X}, where X is its mana value.';

describe('the Sliver lords that change the rules', () => {
  test('the legend rule that does not apply', () => {
    expect(readAll(LEGEND_TEXT, 'creature', ['Sliver']).abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'legendRuleDoesntApply',
          what: { subtypes: ['Sliver'], controller: 'you' },
        },
      },
    ]);
  });

  test('the chosen type for the groups, the creature spells and the cards', () => {
    expect(readAll(CHOSEN_TEXT, 'creature').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'giveChosenCreatureType',
          what: {
            anyOf: [
              { subtypes: ['Sliver'], controller: 'you' },
              { types: ['creature'], token: false, controller: 'you' },
            ],
          },
          alsoCardsAndSpells: true,
        },
      },
    ]);
  });

  test('Encore for the Sliver creature cards of the graveyard', () => {
    expect(readAll(ENCORE_TEXT, 'creature', ['Sliver']).abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantEncoreToGraveyardCards',
          what: { types: ['creature'], subtypes: ['Sliver'] },
        },
      },
    ]);
  });

  test('near misses stay unread', () => {
    for (const text of [
      'The "legend rule" doesn\'t apply to Slivers.',
      CHOSEN_TEXT.split('. ')[0] ?? '',
      'Each Sliver creature card in your graveyard has encore {X}.',
    ]) {
      expect(dropped(text, 'creature', ['Sliver']).text, text).toBe(text);
    }
  });
});

describe('the whole cards are supported and play through applyAction', () => {
  const GRAVEMOTHER = parsed(
    'SYNTHETIC Grave Hive',
    'Legendary Creature — Sliver',
    `${LEGEND_TEXT}\n${ENCORE_TEXT}\nEncore {5} ({5}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)`,
    { manaCost: '{W}{U}{B}{R}{G}', power: '6', toughness: '6', colors: ['W', 'U', 'B', 'R', 'G'] },
  );
  const BIOLOGIST = parsed(
    'SYNTHETIC Chosen Hive',
    'Legendary Creature — Human Wizard',
    `As ~ enters, choose a creature type.\n${CHOSEN_TEXT}\n{3}, {T}: Create a 1/1 colorless Sliver creature token.`,
    { manaCost: '{W}{U}{B}{R}{G}', power: '3', toughness: '3', colors: ['W', 'U', 'B', 'R', 'G'] },
  );
  const DRONE = parsed('SYNTHETIC Husk Sliver', 'Creature — Sliver', '', {
    manaCost: '{1}{G}',
    power: '1',
    toughness: '1',
    colors: ['G'],
  });

  test('a Sliver card in the graveyard is activated for its mana value', () => {
    const g = scenario()
      .define(GRAVEMOTHER)
      .define(DRONE)
      .seat(0)
      .battlefield('Forest', { count: 2 })
      .battlefield(GRAVEMOTHER.name)
      .graveyard(DRONE.name)
      .seat(1)
      .build();
    g.expect.legal(0, { activate: DRONE.name });
    g.act(0).activate(DRONE.name, { pay: true });
    g.passAll();
    expect(
      g.find({ name: DRONE.name, zone: 'battlefield', seat: 0 }).filter((o) => o.token !== null),
    ).toHaveLength(1);
  });

  test('two legendary Slivers of one name stay with it', () => {
    const g = scenario()
      .define(GRAVEMOTHER)
      .seat(0)
      .battlefield(GRAVEMOTHER.name, { count: 2 })
      .seat(1)
      .build();
    g.act(0).pass();
    expect(g.find({ name: GRAVEMOTHER.name, zone: 'battlefield' })).toHaveLength(2);
  });

  test('the chosen type goes to the Sliver and the other creatures', () => {
    const g = scenario()
      .define(BIOLOGIST)
      .define(DRONE)
      .seat(0)
      .battlefield(BIOLOGIST.name, { chosen: { creatureType: 'Elf' } })
      .battlefield(DRONE.name, 'Grizzly Bears')
      .seat(1)
      .build();
    const subtypes = (name: string) =>
      getView(g.state, 0).battlefield.find((o) => o.name === name)?.subtypes;
    expect(subtypes(DRONE.name)).toEqual(['Sliver', 'Elf']);
    expect(subtypes('Grizzly Bears')).toEqual(['Bear', 'Elf']);
  });
});

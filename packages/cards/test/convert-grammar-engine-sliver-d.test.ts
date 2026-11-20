// Sliver Swarm deck, group D (issue 133): Harsh Mercy, Titan of Littjara and Descendants' Fury. The REAL Oracle text of the corpus's golden.jsonl goes through the grammar with
// no override and is played through applyAction. Support cards (creatures) are SYNTHETIC. Pins: CR 101.4 (players who choose at the same time choose in APNAP order),
// CR 205.3m (creature types), CR 702.73a (a changeling has every creature type), CR 701.19c (a creature that can't be regenerated), CR 608.2d.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const creature = (name: string, types: string, power = '2', toughness = '2', text = '') =>
  parsed(name, `Creature — ${types}`, text, {
    manaCost: '{1}{G}',
    power,
    toughness,
    colors: ['G'],
  });

const BEAR = creature('SYNTHETIC D Bear', 'Bear');
const ELF = creature('SYNTHETIC D Elf', 'Elf', '1', '1');
const GOBLIN = creature('SYNTHETIC D Goblin', 'Goblin', '1', '1');
const SHAPESHIFTER = creature('SYNTHETIC D Shifter', 'Shapeshifter', '1', '1', 'Changeling');
const FILLER = Array.from({ length: 20 }, () => 'Island');

describe('Harsh Mercy', () => {
  const HARSH_MERCY = real('Harsh Mercy');
  const build = () =>
    scenario()
      .define(HARSH_MERCY)
      .define(BEAR)
      .define(ELF)
      .define(GOBLIN)
      .define(SHAPESHIFTER)
      .seat(0)
      .hand(HARSH_MERCY.name)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEAR.name)
      .battlefield(GOBLIN.name)
      .battlefield(SHAPESHIFTER.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .battlefield(ELF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('each player chooses in turn order, and creatures of none of the chosen types are destroyed', () => {
    const g = build();
    g.act(0).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Goblin');
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('Elf');
    g.passAll();
    // Goblin (chosen by you) and Elf (chosen by the opponent) stay, and so does the changeling, which is every creature type (CR 702.73a).
    g.expect.zone(GOBLIN.name, 'battlefield', { seat: 0 });
    g.expect.zone(ELF.name, 'battlefield', { seat: 1 });
    g.expect.zone(SHAPESHIFTER.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('both players choosing the same type leaves only that type (and the changeling)', () => {
    const g = build();
    g.act(0).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Bear');
    g.act(1).chooseOption('Bear');
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'battlefield', { seat: 1 });
    g.expect.zone(GOBLIN.name, 'graveyard', { seat: 0 });
    g.expect.zone(ELF.name, 'graveyard', { seat: 1 });
    g.expect.zone(SHAPESHIFTER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the non-active player chooses second when the opponent is the one casting', () => {
    const g = scenario()
      .define(HARSH_MERCY)
      .define(BEAR)
      .define(ELF)
      .seat(0)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .seat(1)
      .hand(HARSH_MERCY.name)
      .battlefield('Plains', { count: 3 })
      .battlefield(ELF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(HARSH_MERCY.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('Elf');
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Bear');
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(ELF.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('another count of choices or another player set is not read', () => {
    for (const text of [
      "Each opponent chooses a creature type. Destroy all creatures that aren't of a type chosen this way.",
      "Each player chooses two creature types. Destroy all creatures that aren't of a type chosen this way.",
      "Each player chooses a creature. Destroy all creatures that aren't of a type chosen this way.",
    ]) {
      const imported = parseOnly(
        storedCard({
          name: 'SYNTHETIC D Probe Mercy',
          typeLine: 'Sorcery',
          manaCost: '{2}{W}',
          oracleText: text,
        }),
      );
      expect(imported.support.status, text).toBe('unsupported');
    }
  });
});

describe('Titan of Littjara', () => {
  const TITAN = real('Titan of Littjara');
  const ILLUSION = creature('SYNTHETIC D Mirage', 'Illusion', '1', '1');
  const build = (hand: readonly string[] = []) =>
    scenario()
      .define(TITAN)
      .define(BEAR)
      .define(GOBLIN)
      .define(ILLUSION)
      .define(SHAPESHIFTER)
      .seat(0)
      .hand(TITAN.name, ...hand)
      .battlefield('Island', { count: 6 })
      .battlefield(BEAR.name, { count: 2 })
      .battlefield(GOBLIN.name)
      .library('Plains', 'Swamp', 'Forest', 'Mountain', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 });

  const enter = (g: ReturnType<ReturnType<typeof build>['build']>, type: string) => {
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption(type);
    g.passAll();
  };

  test('entering: you draw for each other creature that shares a creature type with it, then discard a card', () => {
    const g = build(['Swamp']).build();
    enter(g, 'Bear');
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // Two Bears share the chosen type with the Titan; the Goblin does not.
    g.expect.handSize(0, 3);
    g.expect.pending('chooseCards', 0);
  });

  test("the Titan itself is not counted, and a creature with the Titan's printed type counts", () => {
    const g = build().build();
    enter(g, 'Goblin');
    g.act(0).accept();
    // One card drawn for the one Goblin, and it is the card discarded (the only one in hand).
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('a changeling shares a creature type with it (CR 702.73a)', () => {
    const g = scenario()
      .define(TITAN)
      .define(SHAPESHIFTER)
      .seat(0)
      .hand(TITAN.name)
      .battlefield('Island', { count: 6 })
      .battlefield(SHAPESHIFTER.name)
      .library('Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    enter(g, 'Bear');
    g.act(0).accept();
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('declining the draw draws and discards nothing', () => {
    const g = build(['Swamp']).build();
    enter(g, 'Bear');
    g.act(0).decline();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('attacking triggers it too', () => {
    const g = scenario()
      .define(TITAN)
      .define(BEAR)
      .seat(0)
      .battlefield(TITAN.name, { chosen: { creatureType: 'Bear' } })
      .battlefield(BEAR.name)
      .library('Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([TITAN.name]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('"it" is only read as the permanent of an enters or attacks trigger of the card itself', () => {
    const probe = (text: string) =>
      parseOnly(
        storedCard({
          name: 'SYNTHETIC D Probe Titan',
          typeLine: 'Creature — Illusion',
          manaCost: '{4}{U}{U}',
          power: '6',
          toughness: '6',
          oracleText: text,
        }),
      ).support.status;
    expect(
      probe(
        'Whenever another creature you control dies, draw a card for each other creature you control that shares a creature type with it.',
      ),
    ).toBe('unsupported');
    expect(
      probe(
        '~ gets +1/+1 for each other creature you control that shares a creature type with it.',
      ),
    ).toBe('unsupported');
    expect(
      probe(
        'Whenever ~ enters, draw a card for each other creature you control that shares a card type with it.',
      ),
    ).toBe('unsupported');
    expect(
      probe(
        'Whenever ~ enters, draw a card for each other creature you control that shares a creature type with it.',
      ),
    ).toBe('supported');
  });
});

describe("Descendants' Fury", () => {
  const FURY = real("Descendants' Fury");
  const GOBLIN_WARRIOR = creature('SYNTHETIC D Goblin Warrior', 'Goblin Warrior', '3', '3');
  const ELF_DRUID = creature('SYNTHETIC D Elf Druid', 'Elf Druid', '2', '2');
  const ORC_WARRIOR = creature('SYNTHETIC D Orc Warrior', 'Orc Warrior', '2', '2');
  const HUMAN_CLERIC = creature('SYNTHETIC D Human Cleric', 'Human Cleric', '1', '1');
  const SPECTATOR = creature('SYNTHETIC D Spectator', 'Goblin', '1', '1');
  const NAMELESS = creature('SYNTHETIC D Nameless', '', '1', '1');
  const library = (...cards: string[]) => [...cards, ...FILLER];

  const build = (top: readonly string[], attackers: readonly string[]) =>
    scenario()
      .define(FURY)
      .define(GOBLIN_WARRIOR)
      .define(ELF_DRUID)
      .define(ORC_WARRIOR)
      .define(HUMAN_CLERIC)
      .define(SPECTATOR)
      .define(SHAPESHIFTER)
      .define(BEAR)
      .seat(0)
      .battlefield(FURY.name)
      .battlefield(...attackers)
      .battlefield(SPECTATOR.name)
      .library(...library(...top))
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  /** The attackers connect; the trigger of the Fury is on the stack and the controller is asked whether to sacrifice. */
  const connect = (g: ReturnType<typeof build>, attackers: readonly string[]) => {
    g.advanceTo('declareAttackers');
    g.act(0).attack([...attackers]);
    g.advanceTo('declareBlockers');
    g.passAll();
    g.passAll();
  };

  test('you sacrifice one of the creatures that dealt damage and put the first creature card sharing a type onto the battlefield', () => {
    const attackers = [GOBLIN_WARRIOR.name, ELF_DRUID.name];
    const g = build([BEAR.name, HUMAN_CLERIC.name, ORC_WARRIOR.name, 'Plains'], attackers);
    connect(g, attackers);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('choosePermanent', 0);
    // Only the creatures that dealt the damage are offered, not the Goblin that stayed home.
    const offered = g.state.pending?.kind === 'choosePermanent' ? g.state.pending.legal.length : 0;
    expect(offered).toBe(2);
    g.act(0).choosePermanents({ name: GOBLIN_WARRIOR.name, zone: 'battlefield', seat: 0 });
    g.expect.zone(GOBLIN_WARRIOR.name, 'graveyard', { seat: 0 });
    // The Orc Warrior shares Warrior with the sacrificed Goblin Warrior; the Bear and the Human Cleric share nothing and go to the bottom.
    g.expect.zone(ORC_WARRIOR.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'library', { seat: 0 });
    g.expect.zone(HUMAN_CLERIC.name, 'library', { seat: 0 });
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([
      BEAR.name,
      HUMAN_CLERIC.name,
      ORC_WARRIOR.name,
    ]);
    g.expect.invariants();
  });

  test('declining the sacrifice reveals nothing', () => {
    const attackers = [GOBLIN_WARRIOR.name];
    const g = build([ORC_WARRIOR.name], attackers);
    connect(g, attackers);
    g.act(0).decline();
    g.expect.zone(GOBLIN_WARRIOR.name, 'battlefield', { seat: 0 });
    g.expect.zone(ORC_WARRIOR.name, 'library', { seat: 0 });
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(false);
  });

  test('with no creature card that shares a type the whole library is revealed and put on the bottom', () => {
    const attackers = [ELF_DRUID.name];
    const g = build([BEAR.name, ORC_WARRIOR.name], attackers);
    connect(g, attackers);
    g.act(0).accept();
    // The one creature that dealt the damage is the only candidate, so it is sacrificed without a question.
    g.expect.zone(ELF_DRUID.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEAR.name, 'library', { seat: 0 });
    g.expect.zone(ORC_WARRIOR.name, 'library', { seat: 0 });
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names.length : 0).toBe(FILLER.length + 2);
    g.expect.invariants();
  });

  test('a sacrificed changeling shares a creature type with every creature card (CR 702.73a)', () => {
    const attackers = [SHAPESHIFTER.name];
    const g = build([HUMAN_CLERIC.name, 'Plains'], attackers);
    connect(g, attackers);
    g.act(0).accept();
    g.expect.zone(SHAPESHIFTER.name, 'graveyard', { seat: 0 });
    g.expect.zone(HUMAN_CLERIC.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a sacrificed creature with no creature type shares one with no card', () => {
    const attackers = [NAMELESS.name];
    const g = scenario()
      .define(FURY)
      .define(NAMELESS)
      .define(HUMAN_CLERIC)
      .seat(0)
      .battlefield(FURY.name)
      .battlefield(...attackers)
      .library(...library(HUMAN_CLERIC.name))
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    connect(g, attackers);
    g.act(0).accept();
    g.expect.zone(NAMELESS.name, 'graveyard', { seat: 0 });
    g.expect.zone(HUMAN_CLERIC.name, 'library', { seat: 0 });
  });

  test('"one of them" and "the sacrificed creature" are read only where they have an antecedent', () => {
    const probe = (text: string) =>
      parseOnly(
        storedCard({
          name: 'SYNTHETIC D Probe Fury',
          typeLine: 'Enchantment',
          manaCost: '{3}{R}',
          oracleText: text,
        }),
      ).support.status;
    const reveal =
      'reveal cards from the top of your library until you reveal a creature card that shares a creature type with the sacrificed creature. Put that card onto the battlefield and the rest on the bottom of your library in a random order.';
    expect(
      probe(
        `Whenever a creature you control attacks, you may sacrifice one of them. If you do, ${reveal}`,
      ),
    ).toBe('unsupported');
    expect(
      probe(
        `Whenever one or more creatures you control deal combat damage to a player, you may sacrifice two of them. If you do, ${reveal}`,
      ),
    ).toBe('unsupported');
    expect(
      probe(
        `Whenever one or more creatures you control deal combat damage to a player, you may draw a card. If you do, ${reveal}`,
      ),
    ).toBe('unsupported');
    expect(
      probe(
        `Whenever one or more creatures you control deal combat damage to a player, you may sacrifice one of them. If you do, ${reveal}`,
      ),
    ).toBe('supported');
  });
});

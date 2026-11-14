// Parsed text is only worth something if the engine runs it as written (stage P17). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: the keywords of the engine's keyword batch 1 (D-104,
// D-110) written as Oracle text says them ("Changeling", "Devoid", "Partner", "Exalted",
// "Annihilator 2", "Persist", "Undying", "Infect", "Wither", "Toxic 1", "Split second", "Basic
// landcycling {1}", "Islandcycling {2}", "Multikicker {1}"), alone and in a list, gains of infect
// and wither (CR 613.1f), and the count of kicks ("for each time it was kicked"). Every card name
// starts with "SYNTHETIC"; the Oracle text is the real keyword line of the shape in
// reports/template-replay.md where the replay has one ("Changeling", "Devoid", "Partner",
// "Exalted", "Annihilator 4", "Infect", "Wither", "Persist", "Undying", "Toxic 1", "Split second",
// "Basic landcycling {1}", "Islandcycling {1}", "Plainscycling {2}", "Multikicker {2}") and
// SYNTHETIC otherwise. No real card's text is claimed; the real cards used as targets and blockers
// (Grizzly Bears, Giant Spider, Lightning Bolt, the basic lands) are the engine's own fixtures.
import {
  type CardDefinition,
  type ChooseCardsDecision,
  type ChoosePermanentDecision,
  getView,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const creature = (name: string, text: string, p: string, t: string, cost = '{1}{G}') =>
  parsed(name, 'Creature — Bear', text, {
    manaCost: cost,
    power: p,
    toughness: t,
    colors: ['G'],
  });

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';

const poison = (g: ScenarioGame, seat: 0 | 1) => g.state.seats[seat]?.poison;
const view = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  getView(g.state, seat).battlefield.find((o) => o.name === name);

describe('Changeling, Devoid and Partner (CR 702.73a, 702.114a, 702.124h)', () => {
  const CHAMELEON = parsed(
    'SYNTHETIC Parsed Chameleon',
    'Creature — Shapeshifter',
    'Changeling (This card is every creature type.)',
    { manaCost: '{1}{G}', power: '2', toughness: '2', colors: ['G'] },
  );
  const WISP = parsed('SYNTHETIC Parsed Void Wisp', 'Creature — Eldrazi Drone', 'Devoid', {
    manaCost: '{1}{U}',
    power: '2',
    toughness: '1',
    colors: ['U'],
  });
  const DUO = parsed('SYNTHETIC Parsed Duo Scout', 'Legendary Creature — Human Scout', 'Partner', {
    manaCost: '{1}{W}',
    power: '1',
    toughness: '2',
    colors: ['W'],
  });

  test('"Changeling" is every creature type, in the hand as on the battlefield', () => {
    const g = scenario()
      .define(CHAMELEON)
      .seat(0)
      .battlefield(CHAMELEON.name)
      .hand(CHAMELEON.name)
      .seat(1)
      .build();
    const subtypes = view(g, CHAMELEON.name)?.subtypes ?? [];
    expect(subtypes).toContain('Elf');
    expect(subtypes).toContain('Shapeshifter');
    expect(subtypes.length).toBeGreaterThan(200);
    const inHand = getView(g.state, 0).seats[0]?.hand?.find((o) => o.name === CHAMELEON.name);
    expect(inHand?.subtypes).toContain('Elf');
    g.expect.derived({ name: CHAMELEON.name, zone: 'battlefield' }, { keywords: ['changeling'] });
  });

  test('"Devoid" is colorless although the card is blue and its cost has {U}', () => {
    expect(WISP.faces[0]?.colors).toEqual(['U']);
    const g = scenario()
      .define(WISP)
      .seat(0)
      .hand(WISP.name)
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(WISP.name, { pay: true });
    g.passAll();
    expect(view(g, WISP.name)?.colors).toEqual([]);
    expect(view(g, WISP.name)?.manaCost).toEqual(['1', 'U']);
  });

  test('"Partner" validates and plays as a vanilla creature (it is a deck-building ability)', () => {
    const g = scenario().define(DUO).seat(0).hand(DUO.name).battlefield('Plains', 'Plains').build();
    g.act(0).cast(DUO.name, { pay: true });
    g.passAll();
    g.expect.zone(DUO.name, 'battlefield', { seat: 0 });
    g.expect.derived(DUO.name, { keywords: ['partner'] });
  });
});

describe('Exalted and Annihilator N (CR 702.83a, 702.86a)', () => {
  const SQUIRE = creature(
    'SYNTHETIC Parsed Exalted Squire',
    'Flying, exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)',
    '1',
    '1',
    '{W}',
  );
  const TITAN = creature('SYNTHETIC Parsed Annihilator Titan', 'Annihilator 2', '5', '5', '{6}');

  test('"Flying, exalted": a lone attacker gets +1/+1', () => {
    const g = scenario().define(SQUIRE).seat(0).battlefield(SQUIRE.name).seat(1).build();
    g.expect.derived(SQUIRE.name, { keywords: ['flying', 'exalted'] });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([SQUIRE.name]);
    g.expect.stack([`${SQUIRE.name} (ability)`]);
    g.passAll();
    g.expect.pt(SQUIRE.name, 2, 2);
  });

  test('"Flying, exalted": two attackers, nothing triggers', () => {
    const g = scenario().define(SQUIRE).seat(0).battlefield(SQUIRE.name, BEARS).seat(1).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([SQUIRE.name, BEARS]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.pt(SQUIRE.name, 1, 1);
  });

  test('"Annihilator 2": the defending player sacrifices two permanents of their choice', () => {
    const g = scenario()
      .define(TITAN)
      .seat(0)
      .battlefield(TITAN.name)
      .seat(1)
      .battlefield(BEARS, 'Llanowar Elves', 'Island', 'Mountain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([TITAN.name]);
    g.passAll();
    const d = g.state.pending as ChoosePermanentDecision;
    expect(d.kind).toBe('choosePermanent');
    expect(d.seat).toBe(1);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    g.act(1).choosePermanents(BEARS, 'Island');
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });
  });
});

describe('Persist and Undying (CR 702.79a, 702.93a)', () => {
  const PERSIST = creature('SYNTHETIC Parsed Persist Bear', 'Persist', '2', '2', '{2}{G}');
  const UNDYING = creature('SYNTHETIC Parsed Undying Imp', 'Undying', '2', '2', '{2}{R}');

  const bolted = (card: CardDefinition): ScenarioGame => {
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name)
      .seat(1)
      .hand(BOLT, { count: 2 })
      .battlefield('Mountain', { count: 2 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [card.name], pay: true });
    g.passAll();
    return g;
  };

  test('"Persist" returns it once with a -1/-1 counter', () => {
    const g = bolted(PERSIST);
    g.expect.zone(PERSIST.name, 'battlefield', { seat: 0 });
    g.expect.counters(PERSIST.name, { '-1/-1': 1 });
    g.expect.pt(PERSIST.name, 1, 1);
    g.act(1).cast({ name: BOLT, zone: 'hand', nth: 0 }, { targets: [PERSIST.name], pay: true });
    g.passAll();
    g.expect.zone(PERSIST.name, 'graveyard', { seat: 0 });
  });

  test('"Undying" returns it once with a +1/+1 counter', () => {
    const g = bolted(UNDYING);
    g.expect.zone(UNDYING.name, 'battlefield', { seat: 0 });
    g.expect.counters(UNDYING.name, { '+1/+1': 1 });
    g.expect.pt(UNDYING.name, 3, 3);
  });
});

describe('Infect, Wither and Toxic N (CR 702.90, 702.80, 702.164)', () => {
  const INFECT = creature('SYNTHETIC Parsed Infect Bear', 'Infect', '2', '2');
  const WITHER = creature('SYNTHETIC Parsed Wither Imp', 'Wither', '2', '2');
  const LISTED = creature('SYNTHETIC Parsed Flying Infector', 'Flying, infect', '2', '2');
  const TOXIC = creature('SYNTHETIC Parsed Toxic Rat', 'Trample, toxic 2', '1', '1');

  function attack(card: CardDefinition, block?: string): ScenarioGame {
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name)
      .library('Island', 'Island')
      .seat(1)
      .battlefield(SPIDER)
      .library('Island', 'Island')
      .build();
    g.playCombat({
      attack: [card.name],
      block: block === undefined ? [] : [{ blocker: block, attacker: card.name }],
      until: 'postcombatMain',
    });
    return g;
  }

  test('"Infect": poison counters to a player and no life loss', () => {
    const g = attack(INFECT);
    expect(poison(g, 1)).toBe(2);
    g.expect.life(1, 40);
  });

  test('"Infect": -1/-1 counters to a creature instead of damage', () => {
    const g = attack(INFECT, SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.damage(SPIDER, 0);
  });

  test('"Flying, infect" is both keywords in a list', () => {
    g_expectKeywords(LISTED, ['flying', 'infect']);
    const g = attack(LISTED);
    expect(poison(g, 1)).toBe(2);
  });

  test('"Wither": -1/-1 counters to a creature, life loss to a player', () => {
    const blocked = attack(WITHER, SPIDER);
    blocked.expect.counters(SPIDER, { '-1/-1': 2 });
    const open = attack(WITHER);
    open.expect.life(1, 38);
    expect(poison(open, 1)).toBe(0);
  });

  test('"Trample, toxic 2": combat damage to a player is life loss and 2 poison counters', () => {
    const g = attack(TOXIC);
    g.expect.life(1, 39);
    expect(poison(g, 1)).toBe(2);
  });

  function g_expectKeywords(card: CardDefinition, keywords: string[]) {
    scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name)
      .seat(1)
      .build()
      .expect.derived(card.name, {
        keywords,
      });
  }
});

describe('gains and grants of infect and wither (CR 613.1f)', () => {
  const PUMP = parsed(
    'SYNTHETIC Parsed Venom Spell',
    'Instant',
    'Target creature gains infect until end of turn.',
    { manaCost: '{G}', colors: ['G'] },
  );
  const HEX = parsed(
    'SYNTHETIC Parsed Wither Banner',
    'Enchantment',
    'Creatures you control have wither.',
    { manaCost: '{2}{B}', colors: ['B'] },
  );

  test('"Target creature gains infect until end of turn." gives poison counters', () => {
    const g = scenario()
      .define(PUMP)
      .seat(0)
      .battlefield(BEARS, 'Forest')
      .hand(PUMP.name)
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .build();
    g.act(0).cast(PUMP.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['infect'] });
    g.playCombat({ attack: [BEARS], block: [], until: 'postcombatMain' });
    expect(poison(g, 1)).toBe(2);
    g.expect.life(1, 40);
  });

  test('"Creatures you control have wither." is a static grant', () => {
    const g = scenario()
      .define(HEX)
      .seat(0)
      .battlefield(BEARS, HEX.name)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.derived(BEARS, { keywords: ['wither'] });
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: SPIDER, attacker: BEARS }],
      until: 'postcombatMain',
    });
    g.expect.counters(SPIDER, { '-1/-1': 2 });
  });
});

describe('a token with infect (CR 702, CR 111.3)', () => {
  const MITES = parsed(
    'SYNTHETIC Parsed Mite Forge',
    'Sorcery',
    'Create a 1/1 black Phyrexian Mite creature token with infect.',
    { manaCost: '{B}', colors: ['B'] },
  );

  test('the token has the keyword among its own abilities', () => {
    const g = scenario()
      .define(MITES)
      .seat(0)
      .hand(MITES.name)
      .battlefield('Swamp')
      .seat(1)
      .build();
    g.act(0).cast(MITES.name, { pay: true });
    g.passAll();
    g.expect.derived({ name: 'Phyrexian Mite', zone: 'battlefield' }, { keywords: ['infect'] });
  });
});

describe('Split second (CR 702.61a)', () => {
  const HUSH = parsed(
    'SYNTHETIC Parsed Hush Bolt',
    'Instant',
    'Split second\n~ deals 3 damage to any target.',
    { manaCost: '{1}{R}', colors: ['R'] },
  );

  test('nothing is cast in response, not even by the opponent holding a Lightning Bolt', () => {
    const g = scenario()
      .define(HUSH)
      .seat(0)
      .hand(HUSH.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(HUSH.name, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    expect(g.deciding).toBe(1);
    g.expect.illegal(1, { cast: BOLT });
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('typecycling (CR 702.29e)', () => {
  const BASIC = creature(
    'SYNTHETIC Parsed Landcycler Beast',
    'Basic landcycling {1}',
    '3',
    '3',
    '{3}{G}',
  );
  const ISLANDER = creature(
    'SYNTHETIC Parsed Islandcycler Drake',
    'Islandcycling {2}',
    '2',
    '2',
    '{2}{U}',
  );

  const library = () =>
    scenario()
      .define(BASIC)
      .define(ISLANDER)
      .seat(0)
      .hand(BASIC.name, ISLANDER.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(BEARS, 'Island', 'Forest', 'Swamp')
      .seat(1);

  test('"Basic landcycling {1}" finds a basic land of any type and shuffles', () => {
    const g = library().build();
    g.act(0).activate(BASIC.name, { pay: true });
    g.passAll();
    const d = g.state.pending as ChooseCardsDecision;
    expect(d.kind).toBe('chooseCards');
    expect(d.min).toBe(0);
    expect(d.legal).toHaveLength(3);
    g.act(0).chooseCards('Swamp');
    g.expect.zone('Swamp', 'hand', { seat: 0 });
    g.expect.zone(BASIC.name, 'graveyard', { seat: 0 });
  });

  test('"Islandcycling {2}" finds only a card with the Island type', () => {
    const g = library().build();
    g.act(0).activate(ISLANDER.name, { pay: true });
    g.passAll();
    const d = g.state.pending as ChooseCardsDecision;
    expect(d.kind).toBe('chooseCards');
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test.each([
    ['Plainscycling {2}', 'Plains'],
    ['Swampcycling {2}', 'Swamp'],
    ['Mountaincycling {2}', 'Mountain'],
    ['Forestcycling {2}', 'Forest'],
  ] as const)('"%s" searches for a %s', (text, land) => {
    const card = creature(`SYNTHETIC Parsed ${land}cycler`, text, '1', '1', '{2}{G}');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Forest', 'Forest')
      .library('Plains', 'Island', 'Swamp', 'Mountain', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(card.name, { pay: true });
    g.passAll();
    const d = g.state.pending as ChooseCardsDecision;
    expect(d.kind).toBe('chooseCards');
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards(land);
    g.expect.zone(land, 'hand', { seat: 0 });
  });
});

describe('Multikicker {1} and "for each time it was kicked" (CR 702.33c)', () => {
  const CUB = parsed(
    'SYNTHETIC Parsed Strider Cub',
    'Creature — Beast',
    'Multikicker {1}\nWhen ~ enters, put a +1/+1 counter on it for each time it was kicked.',
    { manaCost: '{G}', power: '1', toughness: '1', colors: ['G'] },
  );
  const PACK = parsed(
    'SYNTHETIC Parsed Wolf Pack',
    'Creature — Wolf',
    'Multikicker {1}\nWhen ~ enters, create a 2/2 green Wolf creature token for each time it was kicked.',
    { manaCost: '{G}', power: '1', toughness: '1', colors: ['G'] },
  );
  const BARRAGE = parsed(
    'SYNTHETIC Parsed Volley Barrage',
    'Sorcery',
    'Multikicker {1}\n~ deals 1 damage to any target for each time ~ was kicked.',
    { manaCost: '{R}', colors: ['R'] },
  );
  const STUDY = parsed(
    'SYNTHETIC Parsed Kicked Study',
    'Sorcery',
    'Multikicker {1}\nDraw a card for each time ~ was kicked.\nYou gain 1 life for each time ~ was kicked.',
    { manaCost: '{U}', colors: ['U'] },
  );

  test.each([0, 1, 3])('the enters trigger of the Cub reads %i kicks', (kicks) => {
    const g = scenario()
      .define(CUB)
      .seat(0)
      .hand(CUB.name)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(CUB.name, { kicks, pay: true });
    g.passAll();
    g.expect.counters(CUB.name, kicks === 0 ? {} : { '+1/+1': kicks });
    g.expect.pt(CUB.name, 1 + kicks, 1 + kicks);
  });

  test('a token for each time it was kicked', () => {
    const g = scenario()
      .define(PACK)
      .seat(0)
      .hand(PACK.name)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(PACK.name, { kicks: 2, pay: true });
    g.passAll();
    expect(g.find({ name: 'Wolf', zone: 'battlefield', seat: 0 }).length).toBe(2);
  });

  test('"~ deals 1 damage to any target for each time ~ was kicked"', () => {
    const g = scenario()
      .define(BARRAGE)
      .seat(0)
      .hand(BARRAGE.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(BARRAGE.name, { kicks: 3, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('draw and gain life for each time ~ was kicked', () => {
    const g = scenario()
      .define(STUDY)
      .seat(0)
      .hand(STUDY.name)
      .battlefield('Island', { count: 3 })
      .library('Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(STUDY.name, { kicks: 2, pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.handSize(0, 2);
  });

  test('unkicked, the count is 0 and nothing happens', () => {
    const g = scenario()
      .define(BARRAGE)
      .seat(0)
      .hand(BARRAGE.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(BARRAGE.name, { kicks: 0, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });
});

// Parsed text is only worth something if the engine runs it as written (stage P4). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: a kicked and an unkicked cast, a flashback cast and
// its exile, an intervening "if" that does not trigger, a host-typed Aura, Food and Clue. Every
// card name starts with "SYNTHETIC"; the Oracle text is template text (the shapes of the corpus
// backlog, reports/backlog.md) or marked SYNTHETIC where no real line has the shape.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const creature = (name: string, text: string, manaCost: string, power = '2', toughness = '2') =>
  parsed(name, 'Creature — Bear', text, { manaCost, power, toughness });

const resolveTop = (g: ScenarioGame): ScenarioGame => g.pass().pass();

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const SPIDER = 'Giant Spider'; // 2/4: survives 2 damage, dies to 4
const BEARS = 'Grizzly Bears'; // 2/2
const ISAMARU = 'Isamaru, Hound of Konda'; // legendary 2/2

const countersOf = (g: ScenarioGame, name: string): number =>
  g.object({ name, zone: 'battlefield' }).counters['+1/+1'] ?? 0;

describe('Kicker and "If ~ was kicked" on spells (CR 702.33)', () => {
  const bolt = () =>
    parsed(
      'SYNTHETIC Parsed Bolt',
      'Sorcery',
      'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, it deals 4 damage instead.',
      { manaCost: '{1}{R}' },
    );
  const build = (card: CardDefinition) =>
    scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .build();

  test('the kicker question is asked and the kicker cost is added to the cost', () => {
    const card = bolt();
    const g = build(card);
    g.act(0).cast(card.name);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.purpose).toBe('kicker');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
  });

  test('kicked: the "instead" branch runs, 4 damage kills the 2/4', () => {
    const card = bolt();
    const g = build(card);
    g.act(0).cast(card.name, { kicked: true, targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(card.name, 'graveyard', { seat: 0 });
  });

  test('unkicked: only the base sentence runs, 2 damage and the spell costs {1}{R}', () => {
    const card = bolt();
    const g = build(card);
    g.act(0).cast(card.name, { kicked: false, targets: [SPIDER], pay: true });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      2,
    );
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.damage(SPIDER, 2);
  });

  test('an instant with an extra sentence only when kicked: SYNTHETIC shape of "gain, then draw"', () => {
    const card = parsed(
      'SYNTHETIC Parsed Gain',
      'Instant',
      'Kicker {1}\nYou gain 2 life. If ~ was kicked, draw a card.',
      { manaCost: '{W}' },
    );
    const build2 = () =>
      scenario()
        .define(card)
        .seat(0)
        .hand(card.name)
        .battlefield('Plains', 'Plains')
        .library(...FILLER)
        .seat(1)
        .build();
    const kicked = build2();
    kicked.act(0).cast(card.name, { kicked: true, pay: true });
    kicked.passAll();
    kicked.expect.life(0, 42);
    kicked.expect.handSize(0, 1);
    const plain = build2();
    plain.act(0).cast(card.name, { kicked: false, pay: true });
    plain.passAll();
    plain.expect.life(0, 42);
    plain.expect.handSize(0, 0);
  });

  test('a life kicker: "Kicker—Pay 3 life" pays the life when kicked and draws the extra cards', () => {
    const card = parsed(
      'SYNTHETIC Parsed Life Kicker',
      'Sorcery',
      'Kicker—Pay 3 life\nDraw a card. If ~ was kicked, draw two cards.',
      { manaCost: '{B}' },
    );
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(card.name, { kicked: true, pay: true });
    g.expect.life(0, 37);
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('a full sentence with "instead": the base does not happen when kicked', () => {
    const card = parsed(
      'SYNTHETIC Parsed Swap',
      'Sorcery',
      'Kicker {1}\nYou gain 1 life. If ~ was kicked, you gain 6 life instead.',
      { manaCost: '{W}' },
    );
    const build2 = () =>
      scenario()
        .define(card)
        .seat(0)
        .hand(card.name)
        .battlefield('Plains', 'Plains')
        .seat(1)
        .build();
    const kicked = build2();
    kicked.act(0).cast(card.name, { kicked: true, pay: true });
    kicked.passAll();
    kicked.expect.life(0, 46);
    const plain = build2();
    plain.act(0).cast(card.name, { kicked: false, pay: true });
    plain.passAll();
    plain.expect.life(0, 41);
  });
});

describe('the intervening "if" of a triggered ability (CR 603.4)', () => {
  const warden = () =>
    creature(
      'SYNTHETIC Parsed Warden',
      'Kicker {2}\nWhen ~ enters, if it was kicked, put two +1/+1 counters on ~.',
      '{1}{G}',
    );
  const cast = (card: CardDefinition, kicked: boolean) => {
    const g = scenario().define(card).seat(0).hand(card.name).pool('GGGG').seat(1).build();
    g.act(0).cast(card.name, { kicked, pay: true });
    return g;
  };

  test('an unkicked creature does not trigger at all: no stack object, no event', () => {
    const card = warden();
    const g = cast(card, false);
    const mark = g.mark();
    resolveTop(g);
    g.expect.zone(card.name, 'battlefield', { seat: 0 });
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
    expect(g.state.pendingTriggers).toEqual([]);
    expect(countersOf(g, card.name)).toBe(0);
    g.expect.invariants();
  });

  test('a kicked creature triggers and the counters arrive when the ability resolves', () => {
    const card = warden();
    const g = cast(card, true);
    resolveTop(g);
    g.expect.stack([`${card.name} (ability)`]);
    expect(countersOf(g, card.name)).toBe(0);
    resolveTop(g);
    g.expect.pt(card.name, 4, 4);
    g.expect.invariants();
  });

  test('"if you control no other creatures": alone it triggers, beside another it does not', () => {
    const wolf = creature(
      'SYNTHETIC Parsed Wolf',
      'When ~ enters, if you control no other creatures, put a +1/+1 counter on ~.',
      '{1}{G}',
      '2',
      '1',
    );
    const alone = scenario().define(wolf).seat(0).hand(wolf.name).pool('GG').seat(1).build();
    alone.act(0).cast(wolf.name, { pay: true });
    resolveTop(alone);
    alone.expect.stack([`${wolf.name} (ability)`]);
    resolveTop(alone);
    alone.expect.counters(wolf.name, { '+1/+1': 1 });

    const crowded = scenario()
      .define(wolf)
      .seat(0)
      .hand(wolf.name)
      .battlefield(BEARS)
      .pool('GG')
      .seat(1)
      .build();
    const mark = crowded.mark();
    crowded.act(0).cast(wolf.name, { pay: true });
    resolveTop(crowded);
    crowded.expect.stack([]);
    crowded.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
    expect(countersOf(crowded, wolf.name)).toBe(0);
  });

  test('"if you have two or more opponents" never triggers in a two-player game', () => {
    const talker = creature(
      'SYNTHETIC Parsed Talker',
      'When ~ enters, if you have two or more opponents, draw a card.',
      '{1}{U}',
    );
    const g = scenario().define(talker).seat(0).hand(talker.name).pool('UU').seat(1).build();
    const mark = g.mark();
    g.act(0).cast(talker.name, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
  });

  test('"Whenever ~ attacks, if you control two or more other creatures": counted at the attack', () => {
    const leader = creature(
      'SYNTHETIC Parsed Leader',
      'Whenever ~ attacks, if you control two or more other creatures, you gain 2 life.',
      '{2}',
    );
    const withOthers = (others: string[]) =>
      scenario()
        .define(leader)
        .seat(0)
        .battlefield(leader.name, ...others)
        .seat(1)
        .build();
    const enough = withOthers([BEARS, ISAMARU]);
    enough.advanceTo('declareAttackers', { attack: false });
    enough.act(0).attack(leader.name);
    enough.passAll();
    enough.expect.life(0, 42);
    const few = withOthers([BEARS]);
    few.advanceTo('declareAttackers', { attack: false });
    const mark = few.mark();
    few.act(0).attack(leader.name);
    few.passAll();
    few.expect.life(0, 40);
    few.expect.noEvent({ kind: 'abilityTriggered' }, { since: mark });
  });

  test('"When ~ enters, ... If ~ was kicked, ... instead" is a conditional inside the trigger', () => {
    const card = creature(
      'SYNTHETIC Parsed Boaster',
      'Kicker {1}\nWhen ~ enters, you gain 1 life. If ~ was kicked, you gain 5 life instead.',
      '{1}{W}',
    );
    const run = (kicked: boolean) => {
      const g = scenario().define(card).seat(0).hand(card.name).pool('WWW').seat(1).build();
      g.act(0).cast(card.name, { kicked, pay: true });
      resolveTop(g);
      resolveTop(g);
      return g;
    };
    run(true).expect.life(0, 45);
    run(false).expect.life(0, 41);
  });
});

describe('Flashback (CR 702.34a)', () => {
  const card = () =>
    parsed('SYNTHETIC Parsed Remedy', 'Instant', 'You gain 3 life.\nFlashback {1}{W}', {
      manaCost: '{W}',
    });

  test('cast from the hand it goes to the graveyard; then it can be flashed back and is exiled', () => {
    const remedy = card();
    const g = scenario()
      .define(remedy)
      .seat(0)
      .hand(remedy.name)
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(remedy.name, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(remedy.name, 'graveyard', { seat: 0 });
    g.expect.legal(0, { cast: remedy.name, alternative: 'flashback' });
    g.act(0).cast(remedy.name, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.life(0, 46);
    g.expect.zone(remedy.name, 'exile');
    g.expect.noObject(remedy.name, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('the flashback cost is the one paid: {1}{W}, not the mana cost {W}', () => {
    const remedy = card();
    const g = scenario()
      .define(remedy)
      .seat(0)
      .graveyard(remedy.name)
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(remedy.name, { alternative: 'flashback', pay: true });
    expect(g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
  });

  test('countered, it is exiled all the same', () => {
    const remedy = card();
    const g = scenario()
      .define(remedy)
      .seat(0)
      .graveyard(remedy.name)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(remedy.name, { alternative: 'flashback', pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: remedy.name, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(remedy.name, 'exile');
    g.expect.noObject(remedy.name, { zone: 'graveyard' });
  });
});

describe('the host type of an attached subject', () => {
  const growth = () =>
    parsed(
      'SYNTHETIC Parsed Growth',
      'Enchantment — Aura',
      'Enchant permanent\nEnchanted creature gets +1/+1.',
      { manaCost: '{1}{G}' },
    );

  test('a creature host gets the bonus', () => {
    const aura = growth();
    const g = scenario()
      .define(aura)
      .seat(0)
      .battlefield(BEARS)
      .battlefield(aura.name, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
  });

  test('a land host gets nothing, and the Aura stays attached to it', () => {
    const aura = growth();
    const g = scenario()
      .define(aura)
      .seat(0)
      .battlefield('Forest', BEARS)
      .battlefield(aura.name, { attachedTo: 'Forest' })
      .seat(1)
      .build();
    g.expect.attached(aura.name, 'Forest');
    g.expect.pt(BEARS, 2, 2);
    const forest = g.view(0).battlefield.find((o) => o.name === 'Forest');
    expect(forest?.power ?? null).toBeNull();
  });

  test('"Enchanted legendary creature": the legendary creature gets it, the other one does not', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Legend',
      'Enchantment — Aura',
      'Enchant permanent\nEnchanted legendary creature gets +2/+2.',
      { manaCost: '{2}{B}' },
    );
    const on = (host: string) =>
      scenario()
        .define(aura)
        .seat(0)
        .battlefield(host)
        .battlefield(aura.name, { attachedTo: host })
        .seat(1)
        .build();
    on(ISAMARU).expect.pt(ISAMARU, 4, 4);
    on(BEARS).expect.pt(BEARS, 2, 2);
  });

  test('"Enchanted land has hexproof" reaches the land and not a creature host', () => {
    const aura = parsed(
      'SYNTHETIC Parsed Land Ward',
      'Enchantment — Aura',
      'Enchant permanent\nEnchanted land has hexproof.\nEnchanted creature gets +0/+1.',
      { manaCost: '{W}' },
    );
    const g = scenario()
      .define(aura)
      .seat(0)
      .battlefield('Forest', BEARS)
      .battlefield(aura.name, { attachedTo: 'Forest' })
      .seat(1)
      .build();
    const forest = g.view(0).battlefield.find((o) => o.name === 'Forest');
    expect(forest?.keywords).toEqual(['hexproof']);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('Food and Clue (CR 111.10b, 111.10f)', () => {
  test('"Create a Clue token." makes a Clue that can be cracked for a card', () => {
    const maker = parsed('SYNTHETIC Parsed Clue Maker', 'Sorcery', 'Create a Clue token.', {
      manaCost: '{1}{U}',
    });
    const g = scenario()
      .define(maker)
      .seat(0)
      .hand(maker.name)
      .battlefield('Island', 'Island')
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(maker.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 1 });
    g.act(0).activate('Clue', { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.noObject('Clue');
  });

  test('"When ~ enters, create a Food token." makes a Food that gains 3 life', () => {
    const scout = creature(
      'SYNTHETIC Parsed Feaster',
      'When ~ enters, create a Food token.',
      '{1}{G}',
    );
    const g = scenario()
      .define(scout)
      .seat(0)
      .hand(scout.name)
      .battlefield('Forest', 'Forest')
      .pool('CG')
      .seat(1)
      .build();
    g.act(0).cast(scout.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.act(0).activate('Food', { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });
});

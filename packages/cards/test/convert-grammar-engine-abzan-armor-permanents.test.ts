// The Abzan Armor precon (issue 99), group D (miscellaneous permanents), read by the grammar and run by the engine. Every card here is SYNTHETIC: its only
// text is a real line of the deck (the name replaced by ~), run through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('"Put a -0/-1 counter on ~: Add {G}. Activate only once each turn." (CR 605.1a, 118.3, 122.1a, 602.5b)', () => {
  const wall = parsed(
    'SYNTHETIC Parsed Roots',
    'Creature — Plant Wall',
    'Defender\nPut a -0/-1 counter on ~: Add {G}. Activate only once each turn.',
    { manaCost: '{1}{G}', power: '0', toughness: '5', colors: ['G'] },
  );
  const frail = parsed(
    'SYNTHETIC Parsed Frail Roots',
    'Creature — Plant Wall',
    'Defender\nPut a -0/-1 counter on ~: Add {G}. Activate only once each turn.',
    { manaCost: '{1}{G}', power: '0', toughness: '1', colors: ['G'] },
  );
  test('lowers to a mana ability that puts the counter on its permanent', () => {
    expect(wall.faces[0]?.abilities.find((a) => a.kind === 'mana')).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'putCounters', counter: '-0/-1', count: 1 }],
      oncePerTurn: true,
    });
  });
  test('adds {G} with no {T}, shrinks its toughness by one, and works once each turn', () => {
    const g = base().define(wall).battlefield(wall.name).at('precombatMain').build();
    g.expect.pt(wall.name, 0, 5);
    g.act(0).tapForMana(wall.name);
    g.expect.pool(0, 'G');
    g.expect.counters(wall.name, { '-0/-1': 1 });
    g.expect.pt(wall.name, 0, 4);
    g.expect.tapped(wall.name, false);
    g.expect.illegal(0, { tap: wall.name });
    g.expect.pool(0, 'G');
  });
  test('the counter can be put on it at toughness 1: it then dies (CR 704.5f)', () => {
    const g = base().define(frail).battlefield(frail.name).at('precombatMain').build();
    g.act(0).tapForMana(frail.name);
    g.expect.pool(0, 'G');
    g.expect.zone(frail.name, 'graveyard');
  });
});

describe('"Untap all permanents you control during each other player\'s untap step." (CR 502.3, 604.1)', () => {
  const muse = parsed(
    'SYNTHETIC Parsed Muse',
    'Creature — Spirit',
    "Untap all permanents you control during each other player's untap step.",
    { manaCost: '{2}{G}', power: '2', toughness: '4', colors: ['G'] },
  );
  const atEndOf = (active: 0 | 1 | 2) =>
    scenario({ seats: 3 })
      .define(muse)
      .seat(0)
      .library(...LIB)
      .battlefield(muse.name)
      .battlefield('Forest', { tapped: true })
      .battlefield('Sol Ring', { tapped: true })
      .seat(1)
      .library(...LIB)
      .battlefield('Mountain', { tapped: true })
      .seat(2)
      .library(...LIB)
      .at('end', { active, turn: 1 })
      .build();

  test('lowers to an untap of every permanent its controller controls', () => {
    expect(muse.faces[0]?.abilities[0]).toMatchObject({
      kind: 'static',
      static: { kind: 'untapInOthersUntapStep', what: { controller: 'you' } },
    });
  });
  test.each([1, 2] as const)(
    'lands and artifacts of its controller untap in the untap step of seat %i',
    (next) => {
      const g = atEndOf(next === 1 ? 0 : 1);
      g.advanceTo('upkeep', { turn: 'next' });
      expect(g.state.turn.activeSeat).toBe(next);
      g.expect.tapped('Forest', false);
      g.expect.tapped('Sol Ring', false);
      g.expect.invariants();
    },
  );
  test('the control: without it the permanents stay tapped in another player untap step', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...LIB)
      .battlefield('Forest', { tapped: true })
      .seat(1)
      .library(...LIB)
      .seat(2)
      .library(...LIB)
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('Forest', true);
  });
});

describe('Staff of Compleation: four {T}, pay life abilities and "{5}: Untap this artifact." (CR 119.4, 108.3, 701.8, 701.34, 605.1a)', () => {
  const staff = parsed(
    'SYNTHETIC Parsed Staff',
    'Artifact',
    [
      '{T}, Pay 1 life: Destroy target permanent you own.',
      '{T}, Pay 2 life: Add one mana of any color.',
      '{T}, Pay 3 life: Proliferate.',
      '{T}, Pay 4 life: Draw a card.',
      '{5}: Untap ~.',
    ].join('\n'),
    { manaCost: '{3}' },
  );
  const build = () =>
    scenario({ seats: 3 })
      .define(staff)
      .seat(0)
      .library(...LIB)
      .battlefield(staff.name)
      .battlefield('Sol Ring')
      .battlefield('Forest', { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIB)
      .battlefield('Command Tower')
      .seat(2)
      .library(...LIB)
      .battlefield('Mountain', { controller: 0 })
      .at('precombatMain', { active: 0 })
      .build();

  test('"destroy target permanent you own": an own permanent dies, costing 1 life and tapping it', () => {
    const g = build();
    g.act(0).activate(staff.name, { ability: 0, targets: ['Sol Ring'] });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard');
    g.expect.life(0, 39);
    g.expect.tapped(staff.name, true);
  });
  test('it cannot target a permanent an opponent owns, even one you control (owned by seat 2)', () => {
    const g = build();
    expect(() =>
      g.act(0).activate(staff.name, { ability: 0, targets: ['Command Tower'] }),
    ).toThrow();
    expect(() => g.act(0).activate(staff.name, { ability: 0, targets: ['Mountain'] })).toThrow();
  });
  test('"add one mana of any color": a mana ability that costs 2 life', () => {
    const g = build();
    g.act(0).tapForMana(staff.name, { color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.life(0, 38);
  });
  test('"draw a card": costs 4 life', () => {
    const g = build();
    g.act(0).activate(staff.name, { ability: 3 });
    g.passAll();
    g.expect.life(0, 36);
    g.expect.handSize(0, 1);
  });
  test('"proliferate": costs 3 life and asks which permanents get another counter', () => {
    const g = build();
    g.act(0).activate(staff.name, { ability: 2 });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.pending('choosePermanent', 0);
  });
  test('"{5}: Untap this artifact" untaps it after its other abilities tapped it', () => {
    const g = build();
    g.act(0).tapForMana(staff.name, { color: 'U' });
    g.expect.tapped(staff.name, true);
    g.expect.life(0, 38);
    g.act(0).activate(staff.name, { ability: 4 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.tapped(staff.name, false);
  });
});

describe('"When ~ enters or becomes monstrous, exile up to two target artifacts and/or enchantments controlled by different players." (CR 115.1, 701.37a, 603.2, 701.13)', () => {
  const dragon = parsed(
    'SYNTHETIC Parsed Protector',
    'Creature — Dragon',
    [
      'Flying',
      'When ~ enters or becomes monstrous, exile up to two target artifacts and/or enchantments controlled by different players.',
      '{4}{W}: Monstrosity 3.',
    ].join('\n'),
    { manaCost: '{W}', power: '5', toughness: '5', colors: ['W'] },
  );
  const aura = (name: string) =>
    parsed(`SYNTHETIC Parsed ${name}`, 'Enchantment', '', { manaCost: '{1}' });
  const ench1 = aura('Charm One');
  const ench2 = aura('Charm Two');
  const build = () =>
    scenario({ seats: 3 })
      .define(dragon)
      .define(ench1)
      .define(ench2)
      .seat(0)
      .library(...LIB)
      .hand(dragon.name)
      .battlefield('Plains')
      .battlefield('Sol Ring')
      .seat(1)
      .library(...LIB)
      .battlefield(ench1.name)
      .battlefield('Command Tower')
      .seat(2)
      .library(...LIB)
      .battlefield(ench2.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('lowers to a trigger for each event with the one slot of targets', () => {
    const triggers = dragon.faces[0]?.abilities.filter((a) => a.kind === 'triggered') ?? [];
    expect(triggers.map((t) => (t.kind === 'triggered' ? t.trigger.kind : null)).sort()).toEqual([
      'becomesMonstrous',
      'entersBattlefield',
    ]);
    expect(JSON.stringify(triggers)).toContain('"differentControllers":true');
  });
  test('entering: two permanents of two different opponents are exiled', () => {
    const g = build();
    g.act(0).cast(dragon.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ench1.name, ench2.name);
    g.passAll();
    g.expect.zone(ench1.name, 'exile');
    g.expect.zone(ench2.name, 'exile');
    g.expect.zone('Sol Ring', 'battlefield');
  });
  test('two targets controlled by the same player are not allowed; one controlled by me and one by an opponent are', () => {
    const g = build();
    g.act(0).cast(dragon.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseTargets('Sol Ring', 'Sol Ring')).toThrow();
    g.act(0).chooseTargets('Sol Ring', ench1.name);
    g.passAll();
    g.expect.zone('Sol Ring', 'exile');
    g.expect.zone(ench1.name, 'exile');
    g.expect.zone(ench2.name, 'battlefield');
  });
  test('becoming monstrous triggers it again, once', () => {
    const g = scenario({ seats: 3 })
      .define(dragon)
      .define(ench1)
      .seat(0)
      .library(...LIB)
      .battlefield(dragon.name)
      .battlefield('Plains', { count: 5 })
      .seat(1)
      .library(...LIB)
      .battlefield(ench1.name)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(dragon.name).pay();
    g.passAll();
    g.expect.counters(dragon.name, { '+1/+1': 3 });
    g.act(0).chooseTargets(ench1.name);
    g.passAll();
    g.expect.zone(ench1.name, 'exile');
  });
});

describe('Sidar Kondo of Jamuraa: Flanking and "Creatures your opponents control without flying or reach can\'t block creatures with power 2 or less." (CR 702.25, 509.1b, 509.3d)', () => {
  const sidar = parsed(
    'SYNTHETIC Parsed Sidar',
    'Legendary Creature — Human Knight',
    [
      'Flanking',
      "Creatures your opponents control without flying or reach can't block creatures with power 2 or less.",
    ].join('\n'),
    { manaCost: '{1}{G}{W}', power: '2', toughness: '5', colors: ['G', 'W'] },
  );
  const flanker = parsed('SYNTHETIC Parsed Flanker', 'Creature — Knight', 'Flanking\nReach', {
    manaCost: '{2}',
    power: '2',
    toughness: '2',
  });
  const big = parsed('SYNTHETIC Parsed Big', 'Creature — Ogre', '', {
    manaCost: '{3}',
    power: '3',
    toughness: '3',
  });
  const plain = parsed('SYNTHETIC Parsed Plain Knight', 'Creature — Knight', '', {
    manaCost: '{2}',
    power: '2',
    toughness: '2',
  });

  test('lowers flanking to a keyword and the restriction to a limit on who may block', () => {
    expect(sidar.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'flanking' },
    });
    expect(sidar.faces[0]?.abilities[1]).toMatchObject({
      kind: 'static',
      static: {
        kind: 'cantBeBlockedBy',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], power: { cmp: 'atMost', value: 2 } },
        },
        blockers: { types: ['creature'], controller: 'opponent', notKeywords: ['flying', 'reach'] },
      },
    });
  });

  test('flanking: each blocker without flanking gets -1/-1, one without it is not touched; each is its own trigger', () => {
    const g = scenario({ seats: 3 })
      .define(sidar)
      .define(flanker)
      .seat(0)
      .library(...LIB)
      .battlefield(sidar.name)
      .seat(1)
      .library(...LIB)
      .battlefield('Giant Spider', 'Serra Angel', flanker.name)
      .seat(2)
      .library(...LIB)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(sidar.name, { player: 1 });
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'Giant Spider', attacker: sidar.name },
      { blocker: 'Serra Angel', attacker: sidar.name },
      { blocker: flanker.name, attacker: sidar.name },
    ]);
    // Two triggers (the blocker with flanking gives none): the controller puts them in order (CR 603.3b).
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack.length).toBe(2);
    g.passAll();
    g.expect.pt('Giant Spider', 1, 3);
    g.expect.pt('Serra Angel', 3, 3);
    g.expect.pt(flanker.name, 2, 2);
  });

  test('a creature of the opponents without flying or reach cannot block a creature with power 2 or less, whoever is attacked and whoever attacks', () => {
    const g = scenario({ seats: 3 })
      .define(sidar)
      .define(big)
      .define(plain)
      .seat(0)
      .library(...LIB)
      .battlefield(sidar.name, 'Grizzly Bears')
      .seat(1)
      .library(...LIB)
      .battlefield(plain.name, big.name)
      .seat(2)
      .library(...LIB)
      .battlefield('Grizzly Bears', 'Serra Angel')
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).declareAttackers([
      { attacker: plain.name, target: { player: 2 } },
      { attacker: big.name, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers');
    const bears = { name: 'Grizzly Bears', seat: 2 } as const;
    g.expect.illegal(2, { declareBlockers: [{ blocker: bears, attacker: plain.name }] });
    g.expect.legal(2, { declareBlockers: [{ blocker: bears, attacker: big.name }] });
    g.expect.legal(2, { declareBlockers: [{ blocker: 'Serra Angel', attacker: plain.name }] });
  });

  test.each([
    [0, 'Grizzly Bears'],
    [2, 'Giant Spider'],
  ] as const)(
    'seat %i: %s (its controller, or a creature with reach) is not held back',
    (defender, blocker) => {
      const g = scenario({ seats: 3 })
        .define(sidar)
        .define(plain)
        .seat(0)
        .library(...LIB)
        .battlefield(sidar.name, 'Grizzly Bears')
        .seat(1)
        .library(...LIB)
        .battlefield(plain.name)
        .seat(2)
        .library(...LIB)
        .battlefield('Giant Spider')
        .at('precombatMain', { active: 1 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(1).declareAttackers([{ attacker: plain.name, target: { player: defender } }]);
      g.advanceTo('declareBlockers');
      g.expect.legal(defender, {
        declareBlockers: [{ blocker: { name: blocker, seat: defender }, attacker: plain.name }],
      });
    },
  );
});

describe('Colfenor\'s Urn: linked exile of creatures with toughness 4 or greater, then "if three or more cards have been exiled with ~, sacrifice it. If you do, return those cards" (CR 607.2a, 700.4, 603.4, 701.21, 400.3, 110.2a)', () => {
  const urn = parsed(
    'SYNTHETIC Parsed Urn',
    'Artifact',
    [
      'Whenever a creature with toughness 4 or greater is put into your graveyard from the battlefield, you may exile it.',
      "At the beginning of the end step, if three or more cards have been exiled with ~, sacrifice it. If you do, return those cards to the battlefield under their owner's control.",
    ].join('\n'),
    { manaCost: '{2}' },
  );
  const wrath = parsed('SYNTHETIC Parsed Wrath', 'Sorcery', 'Destroy all creatures.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const bulk = (name: string) =>
    parsed(`SYNTHETIC Parsed ${name}`, 'Creature — Ogre', '', {
      manaCost: '{4}',
      power: '4',
      toughness: '4',
    });
  const a = bulk('Bulk A');
  const b = bulk('Bulk B');
  const c = bulk('Bulk C');
  const bulks = [a, b, c] as const;

  const build = (mine: readonly string[], opts: { stolen?: string; theirs?: string } = {}) => {
    let s = scenario({ seats: 3 })
      .define(urn)
      .define(wrath)
      .seat(0)
      .library(...LIB)
      .battlefield(urn.name)
      .battlefield('Mountain')
      .hand(wrath.name);
    for (const def of bulks) s = s.define(def);
    for (const name of mine) s = s.battlefield(`SYNTHETIC Parsed ${name}`);
    s = s.battlefield('Grizzly Bears');
    s = s.seat(1).library(...LIB);
    if (opts.theirs !== undefined) s = s.battlefield(`SYNTHETIC Parsed ${opts.theirs}`);
    s = s.seat(2).library(...LIB);
    if (opts.stolen !== undefined) {
      // owned by seat 0, controlled by seat 2
      s = s.seat(0).battlefield(`SYNTHETIC Parsed ${opts.stolen}`, { controller: 2 });
    }
    return s.at('precombatMain', { active: 0 }).build();
  };

  /** Casts the wrath and answers every "you may exile it" with yes, in the order the engine puts them. */
  const wrathAndExile = (g: ReturnType<typeof build>, triggers: number) => {
    g.act(0).cast(wrath.name, { pay: true });
    g.passAll();
    if (triggers > 1) g.act(0).orderTriggers(...Array.from({ length: triggers }, (_, i) => i));
    for (let i = 0; i < triggers; i += 1) {
      g.passAll();
      g.act(0).accept();
    }
    g.passAll();
  };

  test('lowers to a linked exile and an end step ability that counts it', () => {
    expect(urn.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'dies',
        graveyardOwner: 'you',
        what: { toughness: { cmp: 'atLeast', value: 4 } },
      },
      effect: { kind: 'exile', objects: { kind: 'triggerSubject' }, linked: true },
    });
    expect(urn.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'amountIs', compare: { cmp: 'atLeast', value: 3 } },
    });
  });

  test('only a creature with toughness 4 or greater that goes to your own graveyard is exiled', () => {
    const g = build(['Bulk A'], { theirs: 'Bulk B' });
    g.act(0).cast(wrath.name, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone(`${a.name}`, 'exile');
    g.expect.zone('Grizzly Bears', 'graveyard');
    g.expect.zone(b.name, 'graveyard'); // seat 1's creature goes to seat 1's graveyard, not yours
    g.expect.zone(urn.name, 'battlefield');
  });

  test('two cards exiled are not enough: the Urn stays and nothing returns at the end step', () => {
    const g = build(['Bulk A', 'Bulk B']);
    wrathAndExile(g, 2);
    g.expect.zone(a.name, 'exile');
    g.expect.zone(b.name, 'exile');
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(urn.name, 'battlefield');
    g.expect.zone(a.name, 'exile');
  });

  test('three cards exiled with it: at the end step it is sacrificed and they return under their owners control, including one an opponent controlled when it died', () => {
    const g = build(['Bulk A', 'Bulk B'], { stolen: 'Bulk C' });
    wrathAndExile(g, 3);
    g.expect.zone(a.name, 'exile');
    g.expect.zone(b.name, 'exile');
    g.expect.zone(c.name, 'exile');
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(urn.name, 'graveyard');
    for (const card of [a, b, c]) g.expect.zone(card.name, 'battlefield');
    expect(g.state.objects[g.id(c.name)]?.controller).toBe(0); // the owner's control
  });
});

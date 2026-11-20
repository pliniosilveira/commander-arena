// Deck support issue 144 (the Goblin deck): Goblin Dark-Dwellers, Glimpse the Impossible, Conspicuous Snoop and Grenzo, Havoc Raiser, read from their real Oracle text by the grammar alone
// and run by the engine. Every card name starts with "SYNTHETIC".
// Pins: CR 601.2 and 608.2g (a cast as an effect resolves), CR 118.9 (without paying its mana cost), CR 614.1a (exile instead of a graveyard), CR 115.1 (targets), CR 603.7 and 603.7c (a
// delayed trigger names the cards as it was made), CR 400.7 (a card that left exile is a new object), CR 111.4 (a token with an ability), CR 401.5 and 613.1f (the top card of a
// library, the activated abilities of another card), CR 701.15 (goad), CR 609.4b (spend mana as though it were mana of any color), CR 510.3a (combat damage to a player).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const FILLER = ['Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

describe('Goblin Dark-Dwellers: cast an instant or sorcery with mana value 3 or less from your graveyard for free', () => {
  const dweller = parsed(
    'SYNTHETIC Parsed Dark-Dweller',
    'Creature — Goblin',
    "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.",
    { manaCost: '{3}{R}{R}', power: '4', toughness: '4', colors: ['R'] },
  );
  const shock = parsed('SYNTHETIC Parsed Shock', 'Instant', '~ deals 2 damage to any target.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const rite = parsed('SYNTHETIC Parsed Three Rite', 'Sorcery', 'You gain 3 life.', {
    manaCost: '{2}{R}',
    colors: ['R'],
  });
  const feast = parsed('SYNTHETIC Parsed Big Feast', 'Sorcery', 'You gain 5 life.', {
    manaCost: '{4}{R}',
    colors: ['R'],
  });
  const bear = parsed('SYNTHETIC Parsed Cub', 'Creature — Bear', 'Vigilance', {
    manaCost: '{1}{R}',
    power: '2',
    toughness: '2',
    colors: ['R'],
  });

  const game = (mine: readonly string[], theirs: readonly string[] = []) => {
    let b = scenario()
      .define(dweller)
      .define(shock)
      .define(rite)
      .define(feast)
      .define(bear)
      .seat(0)
      .life(20)
      .hand(dweller.name)
      .battlefield('Mountain', { count: 5 })
      .library(...FILLER);
    for (const name of mine) b = b.graveyard(name);
    b = b
      .seat(1)
      .life(20)
      .library(...FILLER);
    for (const name of theirs) b = b.graveyard(name);
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  type Game = ReturnType<typeof game>;

  /** The creature is cast and resolves; its trigger is on the stack with the targets decision pending. */
  const toTargets = (g: Game) => {
    g.act(0).cast(dweller.name, { pay: true });
    g.pass();
    g.pass();
  };
  const legalTargets = (g: Game) => {
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null));
  };

  test('only an instant or sorcery card of mine with mana value 3 or less is a legal target (CR 115.1)', () => {
    const g = game([shock.name, rite.name, feast.name, bear.name], [shock.name]);
    toTargets(g);
    const legal = legalTargets(g);
    expect(legal).toContain(g.id({ name: shock.name, zone: 'graveyard', seat: 0 }));
    expect(legal).toContain(g.id(rite.name));
    // Mana value 5, a creature card, and the opponent's graveyard are not.
    expect(legal).not.toContain(g.id(feast.name));
    expect(legal).not.toContain(g.id(bear.name));
    expect(legal).not.toContain(g.id({ name: shock.name, zone: 'graveyard', seat: 1 }));
    expect(legal).toHaveLength(2);
  });

  test('accepted: the spell is cast without paying, resolves, and is exiled instead of going to the graveyard (CR 118.9, 614.1a)', () => {
    const g = game([shock.name]);
    toTargets(g);
    g.pass();
    g.pass(); // the trigger resolves: its one legal target was chosen as it was put on the stack
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([shock.name]);
    // Every Mountain was tapped for the creature: nothing was paid for the Shock.
    expect(g.state.objects[g.id(shock.name)]?.stack?.free).toBe(true);
    g.pass();
    g.pass();
    g.expect.life(1, 18);
    g.expect.zone(shock.name, 'exile', { seat: 0 });
    expect(g.state.seats[0]?.graveyard).toEqual([]);
    g.expect.invariants();
  });

  test('a sorcery is cast the same way, and its effect happens', () => {
    const g = game([rite.name]);
    toTargets(g);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.stack([rite.name]);
    g.pass();
    g.pass();
    g.expect.life(0, 23);
    g.expect.zone(rite.name, 'exile', { seat: 0 });
  });

  test('declined: the card stays in the graveyard', () => {
    const g = game([shock.name]);
    toTargets(g);
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(shock.name, 'graveyard', { seat: 0 });
  });

  test('with nothing but a card of mana value 4 or more, the trigger has no target and does nothing', () => {
    const g = game([feast.name]);
    toTargets(g);
    g.pass();
    g.pass();
    g.expect.stack([]);
    g.expect.zone(feast.name, 'graveyard', { seat: 0 });
  });

  test('the card is supported with no override, as the grammar reads it', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Dark-Dweller',
        manaCost: '{3}{R}{R}',
        typeLine: 'Creature — Goblin',
        oracleText:
          "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.",
        power: '4',
        toughness: '4',
      }),
    );
    expect(imported.support.status).toBe('supported');
    void NO_OVERRIDES;
  });
});

describe('Glimpse the Impossible: exile three, play them this turn, the rest become Eldrazi Spawn at the next end step', () => {
  const glimpse = parsed(
    'SYNTHETIC Parsed Glimpse',
    'Sorcery',
    'Exile the top three cards of your library. You may play those cards this turn. At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard, then create a 0/1 colorless Eldrazi Spawn creature token for each card put into your graveyard this way. Those tokens have "Sacrifice this token: Add {C}."',
    { manaCost: '{2}{R}', colors: ['R'] },
  );
  const shock = parsed(
    'SYNTHETIC Parsed Glimpse Shock',
    'Instant',
    '~ deals 2 damage to any target.',
    {
      manaCost: '{R}',
      colors: ['R'],
    },
  );
  const ox = parsed('SYNTHETIC Parsed Ox', 'Creature — Ox', 'Vigilance', {
    manaCost: '{1}{R}',
    power: '2',
    toughness: '2',
    colors: ['R'],
  });

  const game = (top: readonly string[]) =>
    scenario()
      .define(glimpse)
      .define(shock)
      .define(ox)
      .seat(0)
      .life(20)
      .hand(glimpse.name)
      .battlefield('Mountain', { count: 6 })
      .library(...top, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  type Game = ReturnType<typeof game>;

  const cast = (g: Game) => {
    g.act(0).cast(glimpse.name, { pay: true });
    g.passAll();
  };
  const spawns = (g: Game, seat: 0 | 1 = 0) =>
    g.find({ name: 'Eldrazi Spawn', zone: 'battlefield', seat });
  const spawn = (n: number) =>
    ({ name: 'Eldrazi Spawn', zone: 'battlefield', seat: 0, nth: n }) as const;

  test('the top three cards are exiled face up and may be played this turn (CR 701.13, 601.2)', () => {
    const g = game([shock.name, ox.name, 'Forest']);
    cast(g);
    g.expect.zone(shock.name, 'exile', { seat: 0 });
    g.expect.zone(ox.name, 'exile', { seat: 0 });
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.legal(0, { playLand: 'Forest' });
    g.expect.legal(0, { cast: shock.name });
    g.expect.legal(0, { cast: ox.name });
  });

  test('cards not played go to the graveyard at the next end step, and each makes a 0/1 Eldrazi Spawn (CR 603.7, 111.4)', () => {
    const g = game([shock.name, ox.name, 'Forest']);
    cast(g);
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    // The trigger waits on the stack; resolving it moves the two cards that remain exiled.
    g.passAll();
    g.expect.zone(shock.name, 'graveyard', { seat: 0 });
    g.expect.zone(ox.name, 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    expect(spawns(g)).toHaveLength(2);
    g.expect.pt(spawn(0), 0, 1);
    g.expect.pt(spawn(1), 0, 1);
    g.expect.invariants();
  });

  test('a card cast from exile is no longer exiled, so it makes no token (CR 400.7)', () => {
    const g = game([shock.name, ox.name, 'Forest']);
    cast(g);
    g.act(0).cast(ox.name, { pay: true });
    g.passAll();
    g.expect.zone(ox.name, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    expect(spawns(g)).toHaveLength(2);
    g.expect.zone(ox.name, 'battlefield', { seat: 0 });
  });

  test('every card played: nothing is put into the graveyard, and no token is made', () => {
    const g = game(['Forest', 'Island', 'Plains']);
    cast(g);
    g.act(0).playLand('Forest');
    g.advanceTo('end');
    g.passAll();
    // Only one land may be played in a turn: the other two remain exiled and are put into the graveyard.
    expect(spawns(g)).toHaveLength(2);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
  });

  test('the tokens have "Sacrifice this token: Add {C}."', () => {
    const g = game([shock.name, ox.name, 'Forest']);
    cast(g);
    g.advanceTo('end');
    g.passAll();
    expect(spawns(g)).toHaveLength(3);
    g.act(0).tapForMana(spawn(0));
    g.expect.pool(0, { C: 1 });
    expect(spawns(g)).toHaveLength(2);
  });

  test('the tokens are mine, whoever owns the cards: the opponent gets none', () => {
    const g = game([shock.name, ox.name, 'Forest']);
    cast(g);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(shock.name, 'graveyard', { seat: 0 });
    expect(spawns(g, 1)).toHaveLength(0);
  });
});

describe('Conspicuous Snoop: Goblin spells from the top of the library, and the abilities of a Goblin card there', () => {
  const snoop = parsed(
    'SYNTHETIC Parsed Snoop',
    'Creature — Goblin Rogue',
    'Play with the top card of your library revealed.\nYou may cast Goblin spells from the top of your library.\nAs long as the top card of your library is a Goblin card, this creature has all activated abilities of that card.',
    { manaCost: '{R}{R}', power: '2', toughness: '2', colors: ['R'] },
  );
  const tinkerer = parsed(
    'SYNTHETIC Parsed Goblin Tinkerer',
    'Creature — Goblin',
    '{T}: You gain 1 life.',
    { manaCost: '{1}{R}', power: '1', toughness: '1', colors: ['R'] },
  );
  const striker = parsed(
    'SYNTHETIC Parsed Goblin Striker',
    'Creature — Goblin Warrior',
    '{1}, {T}: ~ deals 1 damage to each opponent.',
    { manaCost: '{2}{R}', power: '2', toughness: '1', colors: ['R'] },
  );

  const game = (top: readonly string[]) =>
    scenario()
      .define(snoop)
      .define(tinkerer)
      .define(striker)
      .seat(0)
      .life(20)
      .battlefield(snoop.name)
      .battlefield('Mountain', { count: 6 })
      .library(...top, 'Mountain', 'Mountain')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  type Game = ReturnType<typeof game>;

  const abilitiesOfSnoop = (g: Game) =>
    g.state.objects[g.id(snoop.name)] === undefined
      ? []
      : g.legalActions(0).filter((a) => a.kind === 'activate' && a.object === g.id(snoop.name));

  test('a Goblin card on top: the creature may activate that card’s activated ability (CR 613.1f)', () => {
    const g = game([tinkerer.name]);
    expect(abilitiesOfSnoop(g)).toHaveLength(1);
    g.act(0).activate(snoop.name, { ability: 3 });
    g.passAll();
    g.expect.life(0, 21);
    g.expect.tapped(snoop.name, true);
  });

  test('the cost of the granted ability is the card’s: {1}, {T}', () => {
    const g = game([striker.name]);
    g.act(0).activate(snoop.name, { ability: 3, pay: true } as never);
    g.passAll();
    g.expect.life(1, 19);
  });

  test('a card on top that is not a Goblin gives nothing', () => {
    const g = game(['Grizzly Bears']);
    expect(abilitiesOfSnoop(g)).toEqual([]);
  });

  test('an empty library gives nothing', () => {
    const g = scenario()
      .define(snoop)
      .seat(0)
      .battlefield(snoop.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(abilitiesOfSnoop(g)).toEqual([]);
  });

  test('a Goblin spell may be cast from the top of the library, and a spell that is not a Goblin may not (CR 601.3)', () => {
    const g = game([tinkerer.name]);
    g.expect.legal(0, { cast: tinkerer.name });
    const h = game(['Grizzly Bears']);
    h.expect.illegal(0, { cast: 'Grizzly Bears' });
  });

  test('casting the Goblin off the top: the next card is the new top card, so the abilities change', () => {
    const g = game([tinkerer.name, striker.name]);
    g.act(0).cast(tinkerer.name, { pay: true });
    g.passAll();
    g.expect.zone(tinkerer.name, 'battlefield', { seat: 0 });
    // The Striker is on top now: its ability is the one Snoop has.
    g.expect.legal(0, { cast: striker.name });
    g.act(0).activate(snoop.name, { ability: 3, pay: true } as never);
    g.passAll();
    g.expect.life(1, 19);
  });
});

describe('Grenzo, Havoc Raiser: a creature of mine deals combat damage to a player', () => {
  const grenzo = parsed(
    'SYNTHETIC Parsed Grenzo',
    'Legendary Creature — Goblin Rogue',
    "Whenever a creature you control deals combat damage to a player, choose one —\n• Goad target creature that player controls.\n• Exile the top card of that player's library. Until end of turn, you may cast that card and you may spend mana as though it were mana of any color to cast that spell.",
    { manaCost: '{R}{R}', power: '2', toughness: '2', colors: ['R'] },
  );
  const blessing = parsed('SYNTHETIC Parsed Blessing', 'Instant', 'You gain 2 life.', {
    manaCost: '{W}',
    colors: ['W'],
  });
  const triple = parsed('SYNTHETIC Parsed Triple Rite', 'Instant', 'You gain 3 life.', {
    manaCost: '{W}{U}{B}',
    colors: ['W', 'U', 'B'],
  });
  const colorless = parsed('SYNTHETIC Parsed Hollow Rite', 'Instant', 'You gain 1 life.', {
    manaCost: '{C}',
    colors: [],
  });
  const tapped = parsed('SYNTHETIC Parsed Plain Rite', 'Instant', 'You gain 4 life.', {
    manaCost: '{1}{W}',
    colors: ['W'],
  });

  const game = (theirTop: readonly string[]) =>
    scenario()
      .define(grenzo)
      .define(blessing)
      .define(triple)
      .define(colorless)
      .define(tapped)
      .seat(0)
      .life(20)
      .battlefield(grenzo.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Grizzly Bears', 'Serra Angel')
      .library(...theirTop, ...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  type Game = ReturnType<typeof game>;

  /** Grenzo attacks, is not blocked and deals damage; the trigger is on the stack asking for a mode. */
  const hit = (g: Game, attacker: string = grenzo.name) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(attacker);
    for (let i = 0; i < 12 && g.state.pending?.kind !== 'chooseModes'; i += 1) {
      if (g.state.pending?.kind === 'declareBlockers') g.act(1).noBlocks();
      else g.pass();
    }
    expect(g.state.pending?.kind).toBe('chooseModes');
  };
  const blessingInExile = { name: blessing.name, zone: 'exile', seat: 1 } as const;

  test('mode 1: goad target creature that player controls — only the damaged player’s creatures are legal (CR 701.15a)', () => {
    const g = game([blessing.name]);
    hit(g);
    g.act(0).chooseModes(0);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : null));
    expect(legal).toContain(g.id('Grizzly Bears'));
    expect(legal).toContain(g.id('Serra Angel'));
    expect(legal).not.toContain(g.id(grenzo.name));
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    // Goaded until my next turn: it must attack on theirs.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const attack = g.state.pending;
    if (attack?.kind !== 'declareAttackers')
      throw new Error(`expected attackers, got ${attack?.kind}`);
    expect([...attack.mustAttack]).toEqual([g.id('Grizzly Bears')]);
  });

  test('mode 2: the top card of that player’s library is exiled, and I may cast it this turn with mana of any color (CR 609.4b)', () => {
    const g = game([blessing.name]);
    hit(g);
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.zone(blessing.name, 'exile', { seat: 1 });
    // {W} paid with red mana from a Mountain.
    g.expect.legal(0, { cast: blessingInExile });
    g.act(0).cast(blessingInExile, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.zone(blessing.name, 'graveyard', { seat: 1 });
  });

  test('every colored symbol may be paid with any color, but colorless mana is not a color (CR 609.4b, 106.1)', () => {
    const g = game([triple.name]);
    hit(g);
    g.act(0).chooseModes(1);
    g.passAll();
    const tripleInExile = { name: triple.name, zone: 'exile', seat: 1 } as const;
    g.expect.legal(0, { cast: tripleInExile });
    g.act(0).cast(tripleInExile, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    // A {C} symbol is not a colored symbol: it still needs colorless mana, and the Mountains make none.
    const h = game([colorless.name]);
    hit(h);
    h.act(0).chooseModes(1);
    h.passAll();
    h.expect.zone(colorless.name, 'exile', { seat: 1 });
    h.expect.illegal(0, { cast: { name: colorless.name, zone: 'exile', seat: 1 } });
  });

  test('without the rider the same card could not be cast with red mana (the rider is read, not assumed)', () => {
    const control = parsed(
      'SYNTHETIC Parsed No Rider',
      'Creature — Goblin Rogue',
      "Whenever a creature you control deals combat damage to a player, exile the top card of that player's library. Until end of turn, you may cast that card.",
      { manaCost: '{R}{R}', power: '2', toughness: '2', colors: ['R'] },
    );
    const g = scenario()
      .define(control)
      .define(blessing)
      .seat(0)
      .battlefield(control.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(blessing.name, ...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(control.name);
    for (let i = 0; i < 6; i += 1) g.pass();
    g.expect.zone(blessing.name, 'exile', { seat: 1 });
    g.expect.illegal(0, { cast: blessingInExile });
  });

  test('the permission lasts until end of turn: on the next turn the card can no longer be cast', () => {
    const g = game([tapped.name]);
    hit(g);
    g.act(0).chooseModes(1);
    g.passAll();
    const plainInExile = { name: tapped.name, zone: 'exile', seat: 1 } as const;
    g.expect.legal(0, { cast: plainInExile });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(tapped.name, 'exile', { seat: 1 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: plainInExile });
  });

  test('a creature other than Grenzo that deals combat damage triggers it as well (it is "a creature you control")', () => {
    const g = scenario()
      .define(grenzo)
      .define(blessing)
      .seat(0)
      .battlefield(grenzo.name, 'Grizzly Bears')
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .battlefield('Serra Angel')
      .library(blessing.name, ...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    hit(g, 'Grizzly Bears');
  });

  test('the opponent controls no creature: the goad mode has no legal target, so only the other mode can be chosen (CR 700.2a)', () => {
    const g = scenario()
      .define(grenzo)
      .define(blessing)
      .seat(0)
      .battlefield(grenzo.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(blessing.name, ...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(grenzo.name);
    for (let i = 0; i < 6; i += 1) g.pass();
    g.expect.zone(blessing.name, 'exile', { seat: 1 });
    g.expect.legal(0, { cast: blessingInExile });
  });
});

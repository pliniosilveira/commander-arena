// Parsed text is only worth something if the engine runs it as written (stage P1). These tests
// import SYNTHETIC permanents through the grammar (never through a fixture), define them in an
// engine scenario and play them through applyAction: mana abilities, lands that enter tapped on a
// condition, a shock land, "no maximum hand size", triggers, tokens, sacrifice and counters.
// Every card name starts with "SYNTHETIC"; the Oracle text is real template text, named where it
// comes from the corpus.
import type { CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const creature = (name: string, oracleText: string, manaCost = '{1}') =>
  parsed(name, 'Creature — Bear', oracleText, { manaCost, power: '2', toughness: '2' });

function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('mana abilities the grammar reads', () => {
  test('"{T}: Add {U} or {B}." offers its two colors and nothing else (CR 605.3b)', () => {
    const dual = parsed('SYNTHETIC Parsed Dual', 'Land', '{T}: Add {U} or {B}.');
    const g = scenario().define(dual).seat(0).battlefield(dual.name).build();
    g.expect.legal(0, { tap: dual.name, color: 'U' });
    g.expect.legal(0, { tap: dual.name, color: 'B' });
    g.expect.illegal(0, { tap: dual.name, color: 'R' });
    g.act(0).tapForMana(dual.name, { color: 'B' });
    g.expect.pool(0, 'B');
    g.expect.stack([]);
  });

  test('"{T}: Add one mana of any color." offers all five colors', () => {
    const any = parsed('SYNTHETIC Parsed Any Land', 'Land', '{T}: Add one mana of any color.');
    const g = scenario().define(any).seat(0).battlefield(any.name).build();
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      g.expect.legal(0, { tap: any.name, color });
    }
    g.expect.illegal(0, { tap: any.name, color: 'C' });
  });

  test('"{T}: Add {R}, {G}, or {W}." is a choice of three', () => {
    const tri = parsed('SYNTHETIC Parsed Tri', 'Land', '{T}: Add {R}, {G}, or {W}.');
    const g = scenario().define(tri).seat(0).battlefield(tri.name).build();
    for (const color of ['R', 'G', 'W'] as const) g.expect.legal(0, { tap: tri.name, color });
    g.expect.illegal(0, { tap: tri.name, color: 'U' });
  });

  test('"{T}: Add {C}." and "{T}: Add {G}{G}." add exactly that', () => {
    const wastes = parsed('SYNTHETIC Parsed Wastes', 'Land', '{T}: Add {C}.');
    const twin = parsed('SYNTHETIC Parsed Twin Forest', 'Land', '{T}: Add {G}{G}.');
    const g = scenario()
      .define(wastes)
      .define(twin)
      .seat(0)
      .battlefield(wastes.name, twin.name)
      .build();
    g.act(0).tapForMana(wastes.name);
    g.expect.pool(0, 'C');
    g.act(0).tapForMana(twin.name);
    g.expect.pool(0, 'CGG');
  });

  test('a pain land: the damage to you comes with the mana, in the same activation (CR 605.1a)', () => {
    const pain = parsed(
      'SYNTHETIC Parsed Pain Land',
      'Land',
      '{T}: Add {U} or {B}. ~ deals 1 damage to you.',
    );
    const g = scenario().define(pain).seat(0).battlefield(pain.name).build();
    g.act(0).tapForMana(pain.name, { color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.life(0, 39);
    g.expect.stack([]);
  });

  test('a rider that gains you life', () => {
    const gain = parsed('SYNTHETIC Parsed Gain Land', 'Land', '{T}: Add {W}. You gain 1 life.');
    const g = scenario().define(gain).seat(0).battlefield(gain.name).build();
    g.act(0).tapForMana(gain.name);
    g.expect.pool(0, 'W');
    g.expect.life(0, 41);
  });

  test('a Signet: "{1}, {T}: Add {U}{B}." pays {1} from the pool (CR 605.3a)', () => {
    const signet = parsed('SYNTHETIC Parsed Signet', 'Artifact', '{1}, {T}: Add {U}{B}.', {
      manaCost: '{2}',
    });
    const g = scenario().define(signet).seat(0).battlefield(signet.name, 'Forest').build();
    g.act(0).tapForMana('Forest');
    g.act(0).tapForMana(signet.name);
    g.expect.pool(0, 'UB');
    g.expect.tapped(signet.name, true);
  });

  test('a Signet pays for a spell through automatic payment (Divination, {2}{U})', () => {
    const signet = parsed('SYNTHETIC Parsed Signet', 'Artifact', '{1}, {T}: Add {U}{B}.', {
      manaCost: '{2}',
    });
    const g = scenario()
      .define(signet)
      .seat(0)
      .hand('Divination')
      .battlefield(signet.name, 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.expect.stack(['Divination']);
    g.expect.tapped(signet.name, true);
  });
});

describe('lands that enter tapped on a condition', () => {
  const play = (land: CardDefinition, ...battlefield: string[]) => {
    const b = scenario().define(land).seat(0).hand(land.name);
    if (battlefield.length > 0) b.battlefield(...battlefield);
    const g = b.seat(1).build();
    g.act(0).playLand(land.name);
    return g;
  };

  test('"unless you control two or more basic lands" (a check land)', () => {
    const land = parsed(
      'SYNTHETIC Parsed Check Land',
      'Land',
      '~ enters tapped unless you control two or more basic lands.\n{T}: Add {U} or {R}.'.replace(
        '~',
        'SYNTHETIC Parsed Check Land',
      ),
    );
    play(land).expect.tapped(land.name, true);
    play(land, 'Forest').expect.tapped(land.name, true);
    play(land, 'Forest', 'Island').expect.tapped(land.name, false);
    // A nonbasic land is not a basic land (CR 205.4a).
    play(land, 'Forest', 'Command Tower').expect.tapped(land.name, true);
  });

  test('"unless you control two or more other lands" never counts itself (CR 614.12)', () => {
    const land = parsed(
      'SYNTHETIC Parsed Other Land',
      'Land',
      'SYNTHETIC Parsed Other Land enters tapped unless you control two or more other lands.',
    );
    play(land).expect.tapped(land.name, true);
    play(land, 'Forest').expect.tapped(land.name, true);
    play(land, 'Forest', 'Command Tower').expect.tapped(land.name, false);
  });

  test('"unless you control two or fewer other lands" is untapped only early (a fast land)', () => {
    const land = parsed(
      'SYNTHETIC Parsed Fast Land',
      'Land',
      'SYNTHETIC Parsed Fast Land enters tapped unless you control two or fewer other lands.',
    );
    play(land).expect.tapped(land.name, false);
    play(land, 'Forest', 'Island').expect.tapped(land.name, false);
    play(land, 'Forest', 'Island', 'Swamp').expect.tapped(land.name, true);
  });

  test('"unless you have two or more opponents" is always tapped in a two-player game', () => {
    const land = parsed(
      'SYNTHETIC Parsed Crowd Land',
      'Land',
      'SYNTHETIC Parsed Crowd Land enters tapped unless you have two or more opponents.',
    );
    play(land).expect.tapped(land.name, true);
    play(land, 'Forest', 'Island', 'Swamp').expect.tapped(land.name, true);
  });

  test('"unless you control an Island or a Mountain" counts either basic land type', () => {
    const land = parsed(
      'SYNTHETIC Parsed Falls',
      'Land',
      'SYNTHETIC Parsed Falls enters tapped unless you control an Island or a Mountain.',
    );
    play(land).expect.tapped(land.name, true);
    play(land, 'Forest').expect.tapped(land.name, true);
    play(land, 'Island').expect.tapped(land.name, false);
    play(land, 'Mountain').expect.tapped(land.name, false);
  });
});

describe('the shock land: pay life or enter tapped (CR 614.1c)', () => {
  const shock = parsed(
    'SYNTHETIC Parsed Shock Land',
    'Land',
    "As SYNTHETIC Parsed Shock Land enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {R} or {G}.",
  );

  test('paying 2 life makes it enter untapped', () => {
    const g = scenario().define(shock).seat(0).hand(shock.name).seat(1).build();
    g.act(0).playLand(shock.name);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 38);
    g.expect.tapped(shock.name, false);
  });

  test('declining keeps the life and it enters tapped', () => {
    const g = scenario().define(shock).seat(0).hand(shock.name).seat(1).build();
    g.act(0).playLand(shock.name);
    g.act(0).decline();
    g.expect.life(0, 40);
    g.expect.tapped(shock.name, true);
  });
});

describe('"You have no maximum hand size."', () => {
  test('the cleanup step discards nothing while it is on the battlefield (CR 514.1)', () => {
    const hat = parsed('SYNTHETIC Parsed Tower', 'Artifact', 'You have no maximum hand size.', {
      manaCost: '{2}',
    });
    const g = scenario()
      .define(hat)
      .seat(0)
      .hand('Forest', { count: 9 })
      .battlefield(hat.name)
      .seat(1)
      .library('Island', { count: 4 })
      .at('end', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.noEvent({ kind: 'discarded' });
    g.expect.handSize(0, 9);
  });
});

describe('triggered abilities the grammar reads', () => {
  test('Korvold, as the grammar reads it: enters, sacrifice, then the counter and the card', () => {
    const korvold = parsed(
      'SYNTHETIC Parsed Korvold',
      'Creature — Bear',
      'Flying\nWhenever SYNTHETIC Parsed Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on SYNTHETIC Parsed Korvold and draw a card.',
      { manaCost: '{3}{B}', power: '4', toughness: '4' },
    );
    const g = scenario()
      .define(korvold)
      .seat(0)
      .hand(korvold.name)
      .pool('CCCB')
      .battlefield('Forest')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(korvold.name, { pay: true });
    resolveTop(g);
    g.expect.stack([`${korvold.name} (ability)`]);
    resolveTop(g);
    // The only other permanent was sacrificed without asking (CR 608.2d), and that triggered the
    // second ability.
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.stack([`${korvold.name} (ability)`]);
    resolveTop(g);
    g.expect.counters(korvold.name, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
  });

  test('"Whenever ~ attacks, ..." triggers on attack and not before', () => {
    const drainer = creature(
      'SYNTHETIC Parsed Drainer',
      'Whenever SYNTHETIC Parsed Drainer attacks, each opponent loses 1 life.',
    );
    const g = scenario().define(drainer).seat(0).battlefield(drainer.name).seat(1).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.life(1, 40);
    g.act(0).attack(drainer.name);
    g.passAll();
    g.expect.life(1, 39);
  });

  test('"Whenever ~ becomes tapped, ..." triggers when an attack taps it (CR 603.2e)', () => {
    const watcher = creature(
      'SYNTHETIC Parsed Tap Watcher',
      'Whenever SYNTHETIC Parsed Tap Watcher becomes tapped, you gain 1 life.',
    );
    const g = scenario().define(watcher).seat(0).battlefield(watcher.name).seat(1).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.life(0, 40);
    g.act(0).attack(watcher.name);
    g.passAll();
    g.expect.life(0, 41);
  });

  test('"Whenever another creature you control enters, ..." counts a creature cast later, not itself', () => {
    const banner = creature(
      'SYNTHETIC Parsed Welcome',
      'Whenever another creature you control enters, you gain 1 life.',
    );
    const g = scenario()
      .define(banner)
      .seat(0)
      .hand(banner.name, 'Grizzly Bears')
      .pool('CCCG')
      .seat(1)
      .build();
    g.act(0).cast(banner.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('"When ~ dies, create a Treasure token." makes the Treasure the controller owns', () => {
    const construct = creature(
      'SYNTHETIC Parsed Construct',
      'When SYNTHETIC Parsed Construct dies, create a Treasure token.',
    );
    const g = scenario()
      .define(construct)
      .seat(0)
      .battlefield(construct.name)
      .hand('Murder')
      .pool('CBB')
      .seat(1)
      .build();
    g.act(0).cast('Murder', { targets: [{ name: construct.name }], pay: true });
    g.passAll();
    g.expect.zone(construct.name, 'graveyard', { seat: 0 });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('"When ~ enters, you gain 1 life." and "draw a card" run on entering', () => {
    const gain = creature(
      'SYNTHETIC Parsed Healer',
      'When SYNTHETIC Parsed Healer enters, you gain 1 life.',
    );
    const draw = creature(
      'SYNTHETIC Parsed Seer',
      'When SYNTHETIC Parsed Seer enters, draw a card.',
    );
    const g = scenario()
      .define(gain)
      .define(draw)
      .seat(0)
      .hand(gain.name, draw.name)
      .pool('CC')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(gain.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.act(0).cast(draw.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('"you may": declining leaves the effect undone, accepting runs it (CR 603.5)', () => {
    const maybe = creature(
      'SYNTHETIC Parsed Maybe',
      'When SYNTHETIC Parsed Maybe dies, you may draw a card.',
    );
    const play = (answer: 'accept' | 'decline') => {
      const g = scenario()
        .define(maybe)
        .seat(0)
        .battlefield(maybe.name)
        .hand('Murder')
        .pool('CBB')
        .library(...FILLER)
        .seat(1)
        .build();
      g.act(0).cast('Murder', { targets: [{ name: maybe.name }], pay: true });
      g.passAll();
      g.expect.pending('confirmOptional', 0);
      g.act(0)[answer]();
      return g;
    };
    play('accept').expect.handSize(0, 1);
    play('decline').expect.handSize(0, 0);
  });

  test('landfall: "Whenever a land you control enters, create a 1/1 white Soldier creature token."', () => {
    const fountain = parsed(
      'SYNTHETIC Parsed Landfall',
      'Enchantment',
      'Landfall — Whenever a land you control enters, create a 1/1 white Soldier creature token.',
      { manaCost: '{1}{G}' },
    );
    const g = scenario()
      .define(fountain)
      .seat(0)
      .battlefield(fountain.name)
      .hand('Forest')
      .seat(1)
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 1 });
  });

  test('"At the beginning of your upkeep, draw a card." only in your own upkeep', () => {
    const reader = parsed(
      'SYNTHETIC Parsed Reader',
      'Enchantment',
      'At the beginning of your upkeep, draw a card.',
      { manaCost: '{1}{U}' },
    );
    const g = scenario()
      .define(reader)
      .seat(0)
      .battlefield(reader.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.stack([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.expect.stack([`${reader.name} (ability)`]);
  });

  test('"At the beginning of your end step, sacrifice ~." sacrifices itself', () => {
    const spirit = creature(
      'SYNTHETIC Parsed Spirit',
      'At the beginning of your end step, sacrifice SYNTHETIC Parsed Spirit.',
    );
    const g = scenario().define(spirit).seat(0).battlefield(spirit.name).seat(1).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(spirit.name, 'graveyard', { seat: 0 });
  });

  test('"Whenever another creature you control dies, ..." ignores its own death and the opponent\'s', () => {
    const mourner = creature(
      'SYNTHETIC Parsed Mourner',
      'Whenever another creature you control dies, you gain 1 life.',
    );
    const g = scenario()
      .define(mourner)
      .seat(0)
      .battlefield(mourner.name, 'Grizzly Bears')
      .hand('Murder', { count: 3 })
      .pool('CBBCBBCBB')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(
      { name: 'Murder', nth: 0 },
      { targets: [{ name: 'Grizzly Bears', seat: 1 }], pay: true },
    );
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).cast({ name: 'Murder', nth: 0 }, { targets: [{ name: mourner.name }], pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('"Whenever another creature you control dies, ..." gains for a creature of yours', () => {
    const mourner = creature(
      'SYNTHETIC Parsed Mourner',
      'Whenever another creature you control dies, you gain 1 life.',
    );
    const g = scenario()
      .define(mourner)
      .seat(0)
      .battlefield(mourner.name, 'Grizzly Bears')
      .hand('Murder')
      .pool('CBB')
      .seat(1)
      .build();
    g.act(0).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('a creature you sacrifice: "Whenever you sacrifice a creature, ..." (filter)', () => {
    const watcher = parsed(
      'SYNTHETIC Parsed Watcher',
      'Enchantment',
      'Whenever you sacrifice a creature, create a Treasure token.',
      { manaCost: '{B}' },
    );
    const edict = parsed('SYNTHETIC Parsed Edict', 'Sorcery', 'Sacrifice a creature.', {
      manaCost: '{B}',
    });
    const g = scenario()
      .define(watcher)
      .define(edict)
      .seat(0)
      .battlefield(watcher.name, 'Grizzly Bears')
      .hand(edict.name)
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast(edict.name, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });
});

describe('effects the grammar reads in spells', () => {
  test('"Create two Treasure tokens." and "Create a 1/1 white Soldier creature token."', () => {
    const treasures = parsed('SYNTHETIC Parsed Hoard', 'Sorcery', 'Create two Treasure tokens.', {
      manaCost: '{R}',
    });
    const soldiers = parsed(
      'SYNTHETIC Parsed Muster',
      'Sorcery',
      'Create three 1/1 white Soldier creature tokens.',
      { manaCost: '{W}' },
    );
    const g = scenario()
      .define(treasures)
      .define(soldiers)
      .seat(0)
      .hand(treasures.name, soldiers.name)
      .pool('RW')
      .seat(1)
      .build();
    g.act(0).cast(treasures.name, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.act(0).cast(soldiers.name, { pay: true });
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 3 });
  });

  test('"Sacrifice two lands." asks which two when there are more (CR 608.2d)', () => {
    const edict = parsed('SYNTHETIC Parsed Land Edict', 'Sorcery', 'Sacrifice two lands.', {
      manaCost: '{B}',
    });
    const g = scenario()
      .define(edict)
      .seat(0)
      .hand(edict.name)
      .pool('B')
      .battlefield('Forest', 'Island', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(edict.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Forest', 'Swamp');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('"Put two +1/+1 counters on each creature you control." leaves the opponent\'s alone', () => {
    const anthem = parsed(
      'SYNTHETIC Parsed Growth',
      'Sorcery',
      'Put two +1/+1 counters on each creature you control.',
      { manaCost: '{G}' },
    );
    const g = scenario()
      .define(anthem)
      .seat(0)
      .hand(anthem.name)
      .pool('G')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(anthem.name, { pay: true });
    g.passAll();
    g.expect.counters({ name: 'Grizzly Bears', seat: 0 }, { '+1/+1': 2 });
    g.expect.counters({ name: 'Grizzly Bears', seat: 1 }, {});
  });
});

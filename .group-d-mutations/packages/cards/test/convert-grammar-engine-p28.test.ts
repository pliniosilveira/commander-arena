// Parsed text is only worth something if the engine runs it as written (stage P28). These tests import SYNTHETIC cards
// through the grammar (never through a fixture), define them in an engine scenario and play them through applyAction:
// the counted-amounts slice of D-131 (ENGINE_VERSION 28). A counted amount (an all-creatures pump for each Swamp, a
// sum, half of a count, devotion, a toughness, the cards in the graveyards of the opponents), "where X is ..." with a
// draw and a loss (CR 107.3c), each player sacrifices creatures of their choice and tokens that enter tapped (CR 701.21,
// 110.5b, 101.4), a creature that deals damage equal to its power (CR 120.3: a bite, one-sided, not combat damage), and
// the monarch as a condition (CR 725). Every card name starts with "SYNTHETIC"; the wording of each text is that of a real
// blocker of reports/decks.md (the report keeps its numbers as N: the numbers and the costs are SYNTHETIC). No real card's
// text is claimed; the creatures that are not defined here are the engine's own test cards.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 Zombie, {1}{B}
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const HOUND = 'SYNTHETIC Lifelink Hound'; // 3/2 lifelink
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1

type Builder = ReturnType<typeof scenario>;

/** Seat 0 at precombat main with `place` and `opponent` set up. */
function main(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

/** Seat 0 at the upkeep of its turn 3 with the triggers on the stack (and the monarch, when given). */
function toUpkeep(
  place: (b: Builder) => Builder,
  opponent: (b: Builder) => Builder = (b) => b,
  monarch?: 0 | 1,
) {
  const mine = place(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = opponent(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('postcombatMain', { active: 1, turn: 2, ...(monarch === undefined ? {} : { monarch }) })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const tokens = (g: ScenarioGame, name: string, seat = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

// ---- The cards: the text is the wording of the report, the numbers and costs are SYNTHETIC.

const BLIGHT = parsed(
  'SYNTHETIC Parsed Swamp Blight',
  'Sorcery',
  'All creatures get -2/-2 until end of turn for each Swamp you control.',
  { manaCost: '{B}', colors: ['B'] },
);

const MOURNER = parsed(
  'SYNTHETIC Parsed Zombie Mourner',
  'Creature — Zombie',
  'At the beginning of your upkeep, you draw X cards and lose X life, where X is the number of Zombies you control.',
  { manaCost: '{1}{B}', colors: ['B'], power: '2', toughness: '2' },
);

const SIPHON = parsed(
  'SYNTHETIC Parsed Swamp Siphon',
  'Sorcery',
  '~ deals X damage to target creature and you gain X life, where X is the number of Swamps you control.',
  { manaCost: '{B}', colors: ['B'] },
);

const RAISER = parsed(
  'SYNTHETIC Parsed Rank Raiser',
  'Enchantment',
  'At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down.',
  { manaCost: '{2}{B}', colors: ['B'] },
);

const MERCHANT = parsed(
  'SYNTHETIC Parsed Dark Merchant',
  'Creature — Zombie',
  'When ~ enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.',
  { manaCost: '{3}{B}{B}', colors: ['B'], power: '2', toughness: '4' },
);

const HOST = parsed(
  'SYNTHETIC Parsed Hearty Host',
  'Creature — Human',
  "Whenever ~ or another creature you control enters, you gain life equal to that creature's toughness.",
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

const WIGHT = parsed(
  'SYNTHETIC Parsed Grave Scavenger',
  'Creature — Zombie',
  "~ gets +1/+1 for each creature card in your opponents' graveyards.",
  { manaCost: '{B}', colors: ['B'], power: '1', toughness: '1' },
);

const HEX = parsed(
  'SYNTHETIC Parsed Necrotic Hex',
  'Sorcery',
  'Each player sacrifices 2 creatures of their choice. You create 2 tapped 2/2 black Zombie creature tokens.',
  { manaCost: '{B}', colors: ['B'] },
);

const SYPHON = parsed(
  'SYNTHETIC Parsed Syphon Flesh',
  'Sorcery',
  'Each other player sacrifices a creature of their choice. You create a 2/2 black Zombie creature token for each creature sacrificed this way.',
  { manaCost: '{B}', colors: ['B'] },
);

const DEAL = parsed(
  'SYNTHETIC Parsed Cut a Deal',
  'Sorcery',
  'Each opponent draws a card, then you draw a card for each opponent who drew a card this way.',
  { manaCost: '{W}', colors: ['W'] },
);

const RENDEZVOUS = parsed(
  'SYNTHETIC Parsed Rendezvous',
  'Sorcery',
  'You and target opponent each draw 2 cards.',
  { manaCost: '{U}', colors: ['U'] },
);

const TRITON = parsed(
  'SYNTHETIC Parsed Mire Triton',
  'Creature — Merfolk',
  'When ~ enters, mill 2 cards and you gain 2 life.',
  { manaCost: '{B}', colors: ['B'], power: '1', toughness: '1' },
);

const GNASH = parsed(
  'SYNTHETIC Parsed Gnash Down',
  'Sorcery',
  "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control.",
  { manaCost: '{G}', colors: ['G'] },
);

const WATCHER = parsed(
  'SYNTHETIC Parsed Surge Watcher',
  'Enchantment',
  'Whenever a creature you control enters, it deals damage equal to its power to any target.',
  { manaCost: '{R}', colors: ['R'] },
);

const SCOURGE = parsed(
  'SYNTHETIC Parsed Dragon Scourge',
  'Creature — Dragon',
  'Whenever ~ or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.',
  { manaCost: '{R}', colors: ['R'], power: '1', toughness: '1' },
);

const TYRANT = parsed(
  'SYNTHETIC Parsed Skyline Tyrant',
  'Creature — Human',
  "At the beginning of your upkeep, if you're the monarch, create a 4/4 red Dragon creature token with flying.",
  { manaCost: '{3}{R}', colors: ['R'], power: '2', toughness: '2' },
);

const COURT = parsed(
  'SYNTHETIC Parsed Court of Grace',
  'Enchantment',
  "At the beginning of your upkeep, create a 2/2 white Spirit creature token with flying. If you're the monarch, create a 2/2 white Angel creature token with flying instead.",
  { manaCost: '{3}{W}', colors: ['W'] },
);

const PRIEST = parsed(
  'SYNTHETIC Parsed Outnumbered Priest',
  'Creature — Human',
  'When ~ enters, if an opponent controls more creatures than you, create a 4/4 white Angel creature token with flying.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

const CLERIC = parsed(
  'SYNTHETIC Parsed Envious Cleric',
  'Creature — Cleric',
  'When ~ enters, if an opponent has more life than you, you gain 4 life.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);

const CEMETERY = parsed(
  'SYNTHETIC Parsed Oversold Cemetery',
  'Enchantment',
  'At the beginning of your upkeep, if you have 3 or more creature cards in your graveyard, you may return target creature card from your graveyard to your hand.',
  { manaCost: '{2}{B}', colors: ['B'] },
);

const COLOSSUS = parsed(
  'SYNTHETIC Parsed Mighty Colossus',
  'Creature — Dinosaur',
  '~ costs {X} less to cast, where X is the total power of creatures you control.',
  { manaCost: '{7}{G}{G}', colors: ['G'], power: '12', toughness: '12' },
);

const STUDY = parsed(
  'SYNTHETIC Parsed Stalwart Study',
  'Sorcery',
  'Draw cards equal to the greatest power among creatures you control.',
  { manaCost: '{U}', colors: ['U'] },
);

const MARAUDER = parsed(
  'SYNTHETIC Parsed Bag Marauder',
  'Creature — Zombie',
  'When ~ enters, each player sacrifices a creature of their choice.',
  { manaCost: '{B}', colors: ['B'], power: '1', toughness: '1' },
);

const COLOSSUS_TAPPED = parsed(
  'SYNTHETIC Parsed Tapped Colossus',
  'Enchantment',
  'Whenever you cast a Zombie spell, create a tapped 2/2 black Zombie creature token.',
  { manaCost: '{2}{B}', colors: ['B'] },
);

describe('a counted amount: "for each Swamp you control" (CR 608.2c, 611.2c)', () => {
  test('the pump is -2/-2 for each Swamp, counted once as the spell resolves', () => {
    const lower = (swamps: number) =>
      main(
        (b) =>
          b
            .define(BLIGHT)
            .hand(BLIGHT.name)
            .battlefield('Swamp', { count: swamps })
            .battlefield(BEARS)
            .battlefield(SPIDER),
        (b) => b.battlefield(GIANT),
      );
    const one = lower(1);
    one.act(0).cast(BLIGHT.name, { pay: true });
    one.passAll();
    one.expect.zone(BEARS, 'graveyard', { seat: 0 });
    one.expect.pt(SPIDER, 0, 2);
    one.expect.pt(GIANT, 2, 2);
    const two = lower(2);
    two.act(0).cast(BLIGHT.name, { pay: true });
    two.passAll();
    two.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    two.expect.zone(GIANT, 'graveyard', { seat: 1 });
    two.expect.invariants();
  });
});

describe('"where X is ..." (CR 107.3c): a draw and a loss, damage and life, devotion', () => {
  test('you draw X cards and lose X life, X the Zombies you control', () => {
    const g = toUpkeep((b) =>
      b.define(MOURNER).battlefield(MOURNER.name).battlefield(ZOMBIE, { count: 2 }),
    );
    g.expect.stack([`${MOURNER.name} (ability)`]);
    resolveTop(g);
    g.expect.handSize(0, 3);
    g.expect.life(0, 17);
    g.expect.invariants();
  });

  test('damage to a creature and the same amount of life: the Swamps you control', () => {
    const g = main(
      (b) => b.define(SIPHON).hand(SIPHON.name).battlefield('Swamp', { count: 4 }),
      (b) => b.battlefield(GIANT),
    );
    g.act(0).cast(SIPHON.name, { targets: [GIANT], pay: true });
    g.passAll();
    g.expect.zone(GIANT, 'graveyard', { seat: 1 });
    g.expect.life(0, 24);
  });

  test('your devotion to black counts the black mana symbols of your permanents; the life lost is gained', () => {
    const g = main((b) =>
      b.define(MERCHANT).hand(MERCHANT.name).battlefield('Swamp', { count: 5 }).battlefield(ZOMBIE),
    );
    g.act(0).cast(MERCHANT.name, { pay: true });
    g.passAll();
    // {3}{B}{B} is two symbols and the Zombie's {1}{B} one: three.
    g.expect.life(1, 17);
    g.expect.life(0, 23);
  });

  test('half the Zombies, rounded down: two tokens for five Zombies', () => {
    const g = toUpkeep((b) =>
      b.define(RAISER).battlefield(RAISER.name).battlefield(ZOMBIE, { count: 5 }),
    );
    resolveTop(g);
    expect(tokens(g, 'Zombie')).toHaveLength(2);
    const odd = toUpkeep((b) => b.define(RAISER).battlefield(RAISER.name).battlefield(ZOMBIE));
    resolveTop(odd);
    expect(tokens(odd, 'Zombie')).toHaveLength(0);
  });

  test('draw cards equal to the greatest power among your creatures', () => {
    const g = main((b) =>
      b.define(STUDY).hand(STUDY.name).battlefield('Island').battlefield(BEARS).battlefield(GIANT),
    );
    g.act(0).cast(STUDY.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
  });

  test('a cost reduced by the total power of your creatures, as it is cast', () => {
    const g = main((b) =>
      b
        .define(COLOSSUS)
        .hand(COLOSSUS.name)
        .battlefield('Forest', { count: 5 })
        .battlefield(GIANT)
        .battlefield(BEARS)
        .battlefield(SPIDER),
    );
    // Total power 8 of {7}{G}{G}: {1}{G}{G} is left to pay.
    g.act(0).cast(COLOSSUS.name, { pay: true });
    g.passAll();
    g.expect.zone(COLOSSUS.name, 'battlefield', { seat: 0 });
  });
});

describe('amounts of a creature and of the zones (CR 208.1, 400.3)', () => {
  test('another creature enters: its toughness is the life; ~ entering counts too', () => {
    const g = main((b) =>
      b.define(HOST).hand(GIANT, BEARS).battlefield(HOST.name).battlefield('Forest', { count: 6 }),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.passAll();
    g.expect.life(0, 24);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.life(0, 26);
  });

  test('the cards in the graveyards of your opponents: a static count', () => {
    const g = main(
      (b) => b.define(WIGHT).battlefield(WIGHT.name).graveyard(BEARS),
      (b) => b.graveyard(SPIDER, GIANT, 'Lightning Bolt'),
    );
    // Two creature cards in the opponent's graveyard: the instant is not one, and the Bears are in the graveyard of its
    // own controller (CR 400.3: a card in a graveyard is the object of its owner).
    g.expect.pt(WIGHT.name, 3, 3);
  });

  test('N or more creature cards in your graveyard: an optional return as the upkeep begins', () => {
    const g = toUpkeep((b) =>
      b.define(CEMETERY).battlefield(CEMETERY.name).graveyard(BEARS, SPIDER, GIANT),
    );
    g.expect.stack([`${CEMETERY.name} (ability)`]);
    const few = toUpkeep((b) =>
      b.define(CEMETERY).battlefield(CEMETERY.name).graveyard(BEARS, SPIDER),
    );
    few.expect.stack([]);
  });
});

describe('each player sacrifices, and tokens that enter tapped (CR 701.21, 110.5b, 101.4)', () => {
  test('each player sacrifices two creatures of their choice; the caster gets two tapped Zombies', () => {
    const g = main(
      (b) =>
        b
          .define(HEX)
          .hand(HEX.name)
          .battlefield('Swamp')
          .battlefield(BEARS)
          .battlefield(SPIDER)
          .battlefield(GIANT),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(HEX.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS, SPIDER);
    // The opponent has one creature, which goes without a choice.
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(GIANT, 'battlefield', { seat: 0 });
    const zombies = tokens(g, 'Zombie');
    expect(zombies).toHaveLength(2);
    expect(zombies.every((z) => z?.tapped === true)).toBe(true);
    g.expect.invariants();
  });

  test('the enters trigger of a creature: each player, the controller included', () => {
    const g = main(
      (b) => b.define(MARAUDER).hand(MARAUDER.name).battlefield('Swamp').battlefield(BEARS),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(MARAUDER.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('each other player sacrifices; a token for each creature sacrificed this way', () => {
    const g = main(
      (b) => b.define(SYPHON).hand(SYPHON.name).battlefield('Swamp'),
      (b) => b.battlefield(ELVES),
    );
    g.act(0).cast(SYPHON.name, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    expect(tokens(g, 'Zombie')).toHaveLength(1);
  });

  test('nothing sacrificed, no token', () => {
    const g = main((b) => b.define(SYPHON).hand(SYPHON.name).battlefield('Swamp'));
    g.act(0).cast(SYPHON.name, { pay: true });
    g.passAll();
    expect(tokens(g, 'Zombie')).toHaveLength(0);
  });

  test('a tapped token for each Zombie spell cast', () => {
    const g = main((b) =>
      b
        .define(COLOSSUS_TAPPED)
        .battlefield(COLOSSUS_TAPPED.name)
        .hand(ZOMBIE)
        .battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast(ZOMBIE, { pay: true });
    g.pass();
    g.pass();
    const made = tokens(g, 'Zombie');
    expect(made).toHaveLength(1);
    expect(made[0]?.tapped).toBe(true);
  });
});

describe('several players and what an earlier instruction did (CR 101.4, 608.2c, 701.17)', () => {
  test('you and target opponent each draw two cards', () => {
    const g = main((b) => b.define(RENDEZVOUS).hand(RENDEZVOUS.name).battlefield('Island'));
    g.act(0).cast(RENDEZVOUS.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 2);
  });

  test('each opponent draws, then you draw for each opponent who drew', () => {
    const g = main((b) => b.define(DEAL).hand(DEAL.name).battlefield('Plains'));
    g.act(0).cast(DEAL.name, { pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 1);
  });

  test('mill two cards and gain two life: milling is not drawing', () => {
    const g = main((b) => b.define(TRITON).hand(TRITON.name).battlefield('Swamp'));
    g.act(0).cast(TRITON.name, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 5);
    g.expect.life(0, 22);
  });
});

describe('a creature that deals damage equal to its power: a bite (CR 120.3)', () => {
  test('your creature deals its power to a creature you do not control, and takes none back', () => {
    const g = main(
      (b) => b.define(GNASH).hand(GNASH.name).battlefield('Forest').battlefield(GIANT),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH.name, { targets: [GIANT, SPIDER], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.damage(GIANT, 0);
    const damage = g.events.filter((e) => e.kind === 'damageDealt');
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ combat: false, amount: 4, source: g.id(GIANT) });
  });

  test("the damage is the creature's: its lifelink gains its controller life", () => {
    const g = main(
      (b) => b.define(GNASH).hand(GNASH.name).battlefield('Forest').battlefield(HOUND),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GNASH.name, { targets: [HOUND, SPIDER], pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });

  test('"it deals damage equal to its power to any target": the creature that entered is the source', () => {
    const g = main(
      (b) =>
        b.define(WATCHER).hand(GIANT).battlefield(WATCHER.name).battlefield('Forest', { count: 4 }),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(GIANT, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('the Dragons: X is the number of Dragons, read as the damage is dealt', () => {
    const g = main(
      (b) => b.define(SCOURGE).hand(SCOURGE.name).battlefield('Mountain'),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(SCOURGE.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    // One Dragon: one damage to the opponent.
    g.expect.life(1, 19);
  });
});

describe('the monarch and the other conditions about players (CR 725, 603.4)', () => {
  test('the monarch gets the Dragon; nobody else does', () => {
    const monarch = toUpkeep(
      (b) => b.define(TYRANT).battlefield(TYRANT.name),
      (b) => b,
      0,
    );
    monarch.expect.stack([`${TYRANT.name} (ability)`]);
    resolveTop(monarch);
    expect(tokens(monarch, 'Dragon')).toHaveLength(1);
    const nobody = toUpkeep((b) => b.define(TYRANT).battlefield(TYRANT.name));
    nobody.expect.stack([]);
    const theirs = toUpkeep(
      (b) => b.define(TYRANT).battlefield(TYRANT.name),
      (b) => b,
      1,
    );
    theirs.expect.stack([]);
  });

  test('an Angel instead of the Spirit for the monarch', () => {
    const monarch = toUpkeep(
      (b) => b.define(COURT).battlefield(COURT.name),
      (b) => b,
      0,
    );
    resolveTop(monarch);
    expect(tokens(monarch, 'Angel')).toHaveLength(1);
    expect(tokens(monarch, 'Spirit')).toHaveLength(0);
    const plain = toUpkeep((b) => b.define(COURT).battlefield(COURT.name));
    resolveTop(plain);
    expect(tokens(plain, 'Spirit')).toHaveLength(1);
    expect(tokens(plain, 'Angel')).toHaveLength(0);
  });

  test('an opponent controls more creatures than you: an Angel; not more: nothing', () => {
    const behind = main(
      (b) => b.define(PRIEST).hand(PRIEST.name).battlefield('Plains'),
      (b) => b.battlefield(BEARS),
    );
    behind.act(0).cast(PRIEST.name, { pay: true });
    behind.passAll();
    behind.passAll();
    expect(tokens(behind, 'Angel')).toHaveLength(0);
    // The priest is one creature and the opponent has one: not more. With two it triggers.
    const way = main(
      (b) => b.define(PRIEST).hand(PRIEST.name).battlefield('Plains'),
      (b) => b.battlefield(BEARS).battlefield(SPIDER),
    );
    way.act(0).cast(PRIEST.name, { pay: true });
    way.passAll();
    way.passAll();
    expect(tokens(way, 'Angel')).toHaveLength(1);
  });

  test('an opponent has more life than you: four life', () => {
    const g = scenario()
      .seat(0)
      .life(10)
      .define(CLERIC)
      .hand(CLERIC.name)
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(CLERIC.name, { pay: true });
    g.passAll();
    g.expect.life(0, 14);
    const level = main((b) => b.define(CLERIC).hand(CLERIC.name).battlefield('Plains'));
    level.act(0).cast(CLERIC.name, { pay: true });
    level.passAll();
    level.expect.life(0, 20);
  });
});

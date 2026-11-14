// Parsed text is only worth something if the engine runs it as written (stage P29). These tests import SYNTHETIC cards through the
// grammar (never through a fixture), define them in an engine scenario and play them through applyAction: the filtered-subjects
// slice of D-133 (ENGINE_VERSION 29). A lord over creature types other than Zombie (an irregular plural, a type of two words, a type
// that is its own plural), the subject of a dies trigger with nontoken, a combat damage trigger with "that player", a cost that
// taps creatures, the sacrificed creature's power, a conditional static ability, a death replacement, "is dealt damage" with "that
// much" and a card cast from the graveyard. Every card name starts with "SYNTHETIC"; the wording of each text is that of a real
// blocker of reports/decks.md (the report keeps its numbers as N: the numbers and the costs are SYNTHETIC) or a SYNTHETIC variant
// that changes the creature type only. No real card's text is claimed; the creatures that are not defined here are the engine's
// own test cards.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

/** A creature of a type with no text: the body a lord lords over. */
const body = (name: string, subtype: string, power = '1', toughness = '1') =>
  parsed(name, `Creature — ${subtype}`, '', { manaCost: '{G}', colors: ['G'], power, toughness });

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const ZOMBIE = 'SYNTHETIC Plain Zombie'; // 2/2 Zombie, {1}{B}
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1 Elf Druid
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';

type Builder = ReturnType<typeof scenario>;

function main(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  options: { life?: number; active?: 0 | 1 } = {},
) {
  const a = mine(
    scenario()
      .seat(0)
      .life(options.life ?? 20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: options.active ?? 0 })
    .build();
}

const lands = (b: Builder, n = 6) =>
  b
    .battlefield('Swamp', { count: n })
    .battlefield('Mountain', { count: 2 })
    .battlefield('Plains', { count: 1 })
    .battlefield('Forest', { count: 2 });

const settle = (g: ScenarioGame): void => {
  for (let i = 0; i < 40 && g.state.stack.length > 0; i += 1) g.pass();
};

const tokens = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === seat);

// ---- Lords over types other than Zombie: one grammar for the types of CR 205.3m.

const ELF_LORD = parsed(
  'SYNTHETIC Parsed Elf Lord',
  'Creature — Elf',
  'Other Elves you control get +1/+1.',
  { manaCost: '{G}', colors: ['G'], power: '2', toughness: '2' },
);
const MOUSE_LORD = parsed(
  'SYNTHETIC Parsed Mouse Lord',
  'Creature — Mouse',
  'Other Mice you control get +1/+1.',
  { manaCost: '{G}', colors: ['G'], power: '2', toughness: '2' },
);
const TIME_LORD = parsed(
  'SYNTHETIC Parsed Time Lord',
  'Creature — Time Lord',
  'Other Time Lords get +1/+1 and have deathtouch.',
  { manaCost: '{U}', colors: ['U'], power: '2', toughness: '2' },
);
const MERFOLK_LORD = parsed(
  'SYNTHETIC Parsed Merfolk Lord',
  'Creature — Merfolk',
  'Other Merfolk you control get +1/+1 and have hexproof.',
  { manaCost: '{U}', colors: ['U'], power: '2', toughness: '2' },
);
const MOUSE = body('SYNTHETIC Parsed Mouse', 'Mouse');
const TIME_BODY = body('SYNTHETIC Parsed Time Lord Body', 'Time Lord');
const MERFOLK = body('SYNTHETIC Parsed Merfolk Body', 'Merfolk');
const WOLF = body('SYNTHETIC Parsed Wolf', 'Wolf');
const WOLF_PACK = parsed(
  'SYNTHETIC Parsed Wolf Pack',
  'Creature — Wolf',
  'Wolves you control have trample.',
  { manaCost: '{G}', colors: ['G'], power: '2', toughness: '2' },
);

describe('lords over creature types of the table: the same rule for every type (CR 205.3m, 611.3a)', () => {
  test('"Other Elves you control": the plural "Elves" of "Elf", mine only, not itself, not a Bear', () => {
    const g = main(
      (b) => b.define(ELF_LORD).battlefield(ELF_LORD.name).battlefield(ELVES).battlefield(BEARS),
      (b) => b.battlefield(ELVES),
    );
    g.expect.pt(ELF_LORD.name, 2, 2);
    g.expect.pt({ name: ELVES, seat: 0 }, 2, 2);
    g.expect.pt({ name: ELVES, seat: 1 }, 1, 1);
    g.expect.pt(BEARS, 2, 2);
  });

  test('"Other Mice you control": an irregular plural', () => {
    const g = main((b) =>
      b.define(MOUSE_LORD).define(MOUSE).battlefield(MOUSE_LORD.name).battlefield(MOUSE.name),
    );
    g.expect.pt(MOUSE.name, 2, 2);
    g.expect.pt(MOUSE_LORD.name, 2, 2);
  });

  test('"Other Time Lords": a type of two words, of every controller, with a keyword', () => {
    const g = main(
      (b) => b.define(TIME_LORD).define(TIME_BODY).battlefield(TIME_LORD.name),
      (b) => b.define(TIME_BODY).battlefield(TIME_BODY.name),
    );
    g.expect.pt({ name: TIME_BODY.name, seat: 1 }, 2, 2);
    g.expect.derived({ name: TIME_BODY.name, seat: 1 }, { keywords: ['deathtouch'] });
    g.expect.pt(TIME_LORD.name, 2, 2);
    g.expect.derived(TIME_LORD.name, { keywords: [] });
  });

  test('"Other Merfolk you control": a type that is its own plural', () => {
    const g = main((b) =>
      b
        .define(MERFOLK_LORD)
        .define(MERFOLK)
        .battlefield(MERFOLK_LORD.name)
        .battlefield(MERFOLK.name),
    );
    g.expect.pt(MERFOLK.name, 2, 2);
    g.expect.derived(MERFOLK.name, { keywords: ['hexproof'] });
    g.expect.derived(MERFOLK_LORD.name, { keywords: [] });
  });

  test('"Wolves you control have trample": no "other", so it has it too', () => {
    const g = main((b) =>
      b.define(WOLF_PACK).define(WOLF).battlefield(WOLF_PACK.name).battlefield(WOLF.name),
    );
    g.expect.derived(WOLF.name, { keywords: ['trample'] });
    g.expect.derived(WOLF_PACK.name, { keywords: ['trample'] });
  });
});

// ---- Statics: filter parts and conditions.

const NONTOKEN_BANNER = parsed(
  'SYNTHETIC Parsed Banner of Hands',
  'Enchantment',
  'Other nontoken creatures you control get +1/+1 and have vigilance.',
  { manaCost: '{2}{W}', colors: ['W'] },
);
const COLORLESS_BANNER = parsed(
  'SYNTHETIC Parsed Banner of Ash',
  'Artifact',
  'Colorless creatures you control get +1/+1.',
  { manaCost: '{3}' },
);
const COLORLESS_BODY = parsed(
  'SYNTHETIC Parsed Colorless Body',
  'Artifact Creature — Construct',
  '',
  {
    manaCost: '{2}',
    power: '2',
    toughness: '2',
  },
);
const RAISE = parsed(
  'SYNTHETIC Parsed Raise Zombie',
  'Sorcery',
  'Create a 2/2 black Zombie creature token.',
  { manaCost: '{B}', colors: ['B'] },
);
const GIANT = parsed(
  'SYNTHETIC Parsed Life Giant',
  'Creature — Giant',
  '~ gets +3/+3 as long as you have 30 or more life.',
  { manaCost: '{3}{W}', colors: ['W'], power: '2', toughness: '2' },
);
const SENTINEL = parsed(
  'SYNTHETIC Parsed Hexproof Sentinel',
  'Creature — Druid',
  "~ has hexproof as long as it's untapped.",
  { manaCost: '{G}', colors: ['G'], power: '1', toughness: '1' },
);
const TROLL = parsed(
  'SYNTHETIC Parsed Challenger',
  'Creature — Troll',
  "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
  { manaCost: '{3}{G}', colors: ['G'], power: '4', toughness: '4' },
);

describe('filter parts and conditions in a static ability (CR 111.1, 105.2c, 611.3a, 613.8)', () => {
  test('"Other nontoken creatures you control": a token of mine and the opponent\'s creature are left out', () => {
    const g = main(
      (b) =>
        lands(b)
          .define(NONTOKEN_BANNER)
          .define(RAISE)
          .hand(RAISE.name)
          .battlefield(NONTOKEN_BANNER.name)
          .battlefield(BEARS),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(RAISE.name, { pay: true });
    settle(g);
    g.expect.pt({ name: BEARS, seat: 0 }, 3, 3);
    g.expect.derived({ name: BEARS, seat: 0 }, { keywords: ['vigilance'] });
    g.expect.pt({ name: BEARS, seat: 1 }, 2, 2);
    const [token] = tokens(g, 'Zombie');
    expect(token).toBeDefined();
    g.expect.pt(token?.id ?? '', 2, 2);
  });

  test('"Colorless creatures you control": an artifact creature, not a green one', () => {
    const g = main((b) =>
      b
        .define(COLORLESS_BANNER)
        .define(COLORLESS_BODY)
        .battlefield(COLORLESS_BANNER.name)
        .battlefield(COLORLESS_BODY.name)
        .battlefield(BEARS),
    );
    g.expect.pt(COLORLESS_BODY.name, 3, 3);
    g.expect.pt(BEARS, 2, 2);
  });

  test('"as long as you have 30 or more life": the life total turns it on and off', () => {
    const low = main(
      (b) => b.define(GIANT).battlefield(GIANT.name),
      (b) => b,
      { life: 29 },
    );
    low.expect.pt(GIANT.name, 2, 2);
    const high = main(
      (b) => b.define(GIANT).battlefield(GIANT.name),
      (b) => b,
      { life: 30 },
    );
    high.expect.pt(GIANT.name, 5, 5);
    high.expect.invariants();
  });

  test('"has hexproof as long as it\'s untapped": tapped, it has none', () => {
    const g = main((b) => b.define(SENTINEL).battlefield(SENTINEL.name));
    g.expect.derived(SENTINEL.name, { keywords: ['hexproof'] });
    const tapped = main((b) => b.define(SENTINEL).battlefield(SENTINEL.name, { tapped: true }));
    tapped.expect.derived(SENTINEL.name, { keywords: [] });
  });

  test('"can\'t be blocked by more than one creature": one blocker is legal, two are not', () => {
    const g = main(
      (b) => b.define(TROLL).battlefield(TROLL.name),
      (b) => b.battlefield(V22).battlefield(V33),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: TROLL.name, seat: 0 }]);
    g.advanceTo('declareBlockers');
    expect(() =>
      g.act(1).declareBlockers([
        { blocker: { name: V22, seat: 1 }, attacker: { name: TROLL.name, seat: 0 } },
        { blocker: { name: V33, seat: 1 }, attacker: { name: TROLL.name, seat: 0 } },
      ]),
    ).toThrow();
    g.act(1).declareBlockers([
      { blocker: { name: V22, seat: 1 }, attacker: { name: TROLL.name, seat: 0 } },
    ]);
  });
});

// ---- Triggers: a filtered subject and the player the event is about.

const GRAVES = parsed(
  'SYNTHETIC Parsed Open Graves',
  'Enchantment',
  'Whenever a nontoken creature you control dies, create a 2/2 black Zombie creature token.',
  { manaCost: '{3}{B}', colors: ['B'] },
);
const RIDER = parsed(
  'SYNTHETIC Parsed Grave Rider',
  'Creature — Zombie Knight',
  'Whenever ~ or another nontoken Zombie you control dies, create a 2/2 black Zombie creature token.',
  { manaCost: '{3}{B}', colors: ['B'], power: '3', toughness: '3' },
);
const REAVER = parsed(
  'SYNTHETIC Parsed Reaver',
  'Creature — Zombie',
  'Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token.',
  { manaCost: '{2}{B}', colors: ['B'], power: '3', toughness: '3' },
);
const CRAWLER = parsed(
  'SYNTHETIC Parsed Crawler',
  'Enchantment',
  'Whenever an opponent draws a card, that player loses 1 life.',
  { manaCost: '{2}{B}', colors: ['B'] },
);
const SERAPH = parsed(
  'SYNTHETIC Parsed Seraph',
  'Creature — Angel',
  'Whenever ~ is dealt damage, you gain that much life.',
  { manaCost: '{3}{W}', colors: ['W'], power: '3', toughness: '6' },
);
const STONE = parsed(
  'SYNTHETIC Parsed Decree Stone',
  'Artifact',
  "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life.",
  { manaCost: '{3}' },
);
const REGENT = parsed(
  'SYNTHETIC Parsed Regent',
  'Creature — Dragon',
  'Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.',
  { manaCost: '{3}{R}', colors: ['R'], power: '3', toughness: '3' },
);
const WHELP = parsed(
  'SYNTHETIC Parsed Whelp',
  'Creature — Dragon',
  'Whenever you cast a noncreature or Zombie spell, ~ deals 1 damage to each opponent.',
  { manaCost: '{1}{R}', colors: ['R'], power: '1', toughness: '1' },
);
const ENTERER = parsed(
  'SYNTHETIC Parsed Goreclaw',
  'Creature — Beast',
  'Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.',
  { manaCost: '{3}{G}', colors: ['G'], power: '3', toughness: '3' },
);

describe('a trigger on a filtered subject (CR 603.2, 111.7, 700.4)', () => {
  test('"a nontoken creature you control dies": a Bear does, a token and the opponent\'s creature do not', () => {
    const g = main(
      (b) =>
        lands(b)
          .define(GRAVES)
          .define(RAISE)
          .hand(MURDER)
          .hand(MURDER)
          .hand(RAISE.name)
          .battlefield(GRAVES.name)
          .battlefield(BEARS),
      (b) => b.battlefield(V22),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    settle(g);
    expect(tokens(g, 'Zombie')).toHaveLength(1);
    // The token that dies triggers nothing.
    const [token] = tokens(g, 'Zombie');
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [token?.id ?? ''], pay: true });
    settle(g);
    expect(tokens(g, 'Zombie')).toHaveLength(0);
  });

  test('"~ or another nontoken Zombie you control dies": two abilities, once for itself and once for another', () => {
    const g = main((b) =>
      lands(b).define(RIDER).hand(MURDER).hand(MURDER).battlefield(RIDER.name).battlefield(ZOMBIE),
    );
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [{ name: ZOMBIE, seat: 0 }], pay: true });
    settle(g);
    expect(tokens(g, 'Zombie')).toHaveLength(1);
    g.act(0).cast({ name: MURDER, nth: 0 }, { targets: [RIDER.name], pay: true });
    settle(g);
    expect(tokens(g, 'Zombie')).toHaveLength(2);
    g.expect.invariants();
  });

  test('"another nontoken creature you control enters": "it" gets the counter and haste', () => {
    const g = main((b) => lands(b).define(ENTERER).hand(BEARS).battlefield(ENTERER.name));
    g.act(0).cast(BEARS, { pay: true });
    settle(g);
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.expect.pt(BEARS, 3, 3);
  });

  test('"you cast a noncreature or Zombie spell": a noncreature spell does, a Bear does not', () => {
    const g = main(
      (b) => lands(b).define(WHELP).hand(MURDER).hand(BEARS).battlefield(WHELP.name),
      (b) => b.battlefield(V33),
    );
    g.act(0).cast(BEARS, { pay: true });
    settle(g);
    g.expect.life(1, 20);
    g.act(0).cast(MURDER, { targets: [V33], pay: true });
    settle(g);
    g.expect.life(1, 19);
  });

  test('"attacks you or a planeswalker you control": its controller loses 1 life', () => {
    const g = main(
      (b) => b.define(STONE).battlefield(STONE.name),
      (b) => b.battlefield(V22),
      { active: 1 },
    );
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: V22, seat: 1 }]);
    settle(g);
    g.expect.life(1, 19);
    g.expect.life(0, 20);
    g.advanceTo('combatDamage');
    settle(g);
    g.expect.life(0, 18);
  });
});

describe('"that player": the player the event is about (CR 603.2, 121.1, 120.2a, 702.21a)', () => {
  test('combat damage to a player: that player discards, and I get the tapped Zombie', () => {
    const g = main(
      (b) => b.define(REAVER).battlefield(REAVER.name),
      (b) => b.hand(BEARS).hand(ELVES),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: REAVER.name, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 17);
    // The opponent discards a card of their own choosing.
    g.act(1).chooseCards(BEARS);
    settle(g);
    g.expect.handSize(1, 1);
    const [token] = tokens(g, 'Zombie');
    expect(token).toBeDefined();
    g.expect.tapped(token?.id ?? '', true);
  });

  test('an opponent draws a card: that player loses 1 life, I do not when I draw', () => {
    const g = main((b) => b.define(CRAWLER).battlefield(CRAWLER.name));
    g.advanceTo('draw', { turn: 'next' });
    settle(g);
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });

  test('"becomes the target of a spell or ability an opponent controls": 3 damage to the player whose spell it was', () => {
    const g = main(
      (b) => b.define(REGENT).battlefield(REGENT.name),
      (b) => lands(b).hand(BOLT),
      { active: 1 },
    );
    g.act(1).cast(BOLT, { targets: [REGENT.name], pay: true });
    settle(g);
    g.expect.life(1, 17);
    g.expect.invariants();
  });

  test('"is dealt damage": "you gain that much life", for each source', () => {
    const g = main(
      (b) => b.define(SERAPH).battlefield(SERAPH.name),
      (b) => lands(b).hand(BOLT),
      { active: 1 },
    );
    g.act(1).cast(BOLT, { targets: [SERAPH.name], pay: true });
    settle(g);
    g.expect.life(0, 23);
    g.expect.invariants();
  });
});

// ---- Costs.

const WHISPERER = parsed(
  'SYNTHETIC Parsed Whisperer',
  'Creature — Zombie',
  'Tap three untapped Zombies you control: You draw a card and lose 1 life.',
  { manaCost: '{1}{B}', colors: ['B'], power: '2', toughness: '2' },
);
const ELF_TAPPER = parsed(
  'SYNTHETIC Parsed Elf Tapper',
  'Creature — Elf',
  'Tap two untapped Elves you control: Draw a card.',
  { manaCost: '{G}', colors: ['G'], power: '1', toughness: '1' },
);
const FORGE = parsed(
  'SYNTHETIC Parsed Forge Master',
  'Creature — Human',
  '{1}, Sacrifice two creatures: Draw a card.',
  { manaCost: '{W}', colors: ['W'], power: '1', toughness: '1' },
);
const GISA = parsed(
  'SYNTHETIC Parsed Grave Caller',
  'Creature — Human',
  "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
  { manaCost: '{1}{B}', colors: ['B'], power: '2', toughness: '2' },
);

describe('costs that tap or sacrifice other permanents (CR 118.3, 302.6, 701.21)', () => {
  test('"Tap three untapped Zombies you control": the source is one of them, and nothing is paid in mana', () => {
    const g = main((b) =>
      b.define(WHISPERER).battlefield(WHISPERER.name).battlefield(ZOMBIE, { count: 2 }),
    );
    g.act(0).activate(WHISPERER.name);
    g.expect.tapped(WHISPERER.name, true);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 19);
    g.expect.invariants();
  });

  test('"Tap two untapped Elves you control": the same rule for another type', () => {
    const g = main((b) => b.define(ELF_TAPPER).battlefield(ELF_TAPPER.name).battlefield(ELVES));
    g.act(0).activate(ELF_TAPPER.name);
    g.expect.tapped(ELVES, true);
    g.passAll();
    g.expect.handSize(0, 1);
    // One Elf alone cannot pay it.
    const alone = main((b) => b.define(ELF_TAPPER).battlefield(ELF_TAPPER.name));
    expect(alone.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('"Sacrifice two creatures": two are sacrificed, one is not enough', () => {
    const g = main((b) =>
      lands(b, 2).define(FORGE).battlefield(FORGE.name).battlefield(V22).battlefield(BEARS),
    );
    g.act(0).activate(FORGE.name, { pay: true });
    g.act(0).choosePermanents(V22, BEARS);
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 1);
  });

  test('"X is the sacrificed creature\'s power": a 3/3 makes three Zombies', () => {
    const g = main((b) => lands(b, 2).define(GISA).battlefield(GISA.name).battlefield(V33));
    g.act(0).activate(GISA.name, { pay: true });
    // The only creature that qualifies is sacrificed without a question.
    g.passAll();
    g.expect.zone(V33, 'graveyard', { seat: 0 });
    expect(tokens(g, 'Zombie')).toHaveLength(3);
    g.expect.invariants();
  });
});

// ---- The death replacement, the permission to cast from the graveyard, grants to a group.

const COLLECTOR = parsed(
  'SYNTHETIC Parsed Soul Collector',
  'Creature — Vampire',
  'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
  { manaCost: '{3}{B}', colors: ['B'], power: '3', toughness: '3' },
);
const CORPSE = parsed(
  'SYNTHETIC Parsed Restless Corpse',
  'Creature — Zombie',
  'You may cast this card from your graveyard as long as you control a Zombie.',
  { manaCost: '{B}', colors: ['B'], power: '2', toughness: '1' },
);
const ACCURSED = parsed(
  'SYNTHETIC Parsed Accursed Lord',
  'Creature — Zombie',
  '{B}, {T}: All Zombies gain menace until end of turn.',
  { manaCost: '{1}{B}', colors: ['B'], power: '2', toughness: '2' },
);
const RALLIER = parsed(
  'SYNTHETIC Parsed Big Rallier',
  'Creature — Zombie',
  'Whenever ~ attacks, each creature you control with power 3 or greater gets +1/+1 and gains trample until end of turn.',
  { manaCost: '{3}{G}', colors: ['G'], power: '3', toughness: '3' },
);
const SCOURGE = parsed(
  'SYNTHETIC Parsed Dragon Pump',
  'Creature — Dragon',
  '{R}: Dragons you control get +1/+1 until end of turn.',
  { manaCost: '{R}', colors: ['R'], power: '1', toughness: '1' },
);
const WHITTLER = parsed(
  'SYNTHETIC Parsed Mass Decay',
  'Sorcery',
  '~ deals 2 damage to each non-Dragon creature.',
  { manaCost: '{R}', colors: ['R'] },
);

describe('a death replacement, casting from the graveyard and grants to a group', () => {
  test('"instead exile that card and create a Zombie": the opponent\'s Bear is exiled, I get the token', () => {
    const g = main(
      (b) => lands(b).define(COLLECTOR).hand(MURDER).battlefield(COLLECTOR.name),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(MURDER, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    settle(g);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(tokens(g, 'Zombie')).toHaveLength(1);
    g.expect.invariants();
  });

  test('"You may cast this card from your graveyard as long as you control a Zombie"', () => {
    const g = main((b) =>
      b.define(CORPSE).graveyard(CORPSE.name).battlefield(ZOMBIE).battlefield('Swamp'),
    );
    g.act(0).cast(CORPSE.name, { pay: true });
    g.passAll();
    g.expect.zone(CORPSE.name, 'battlefield', { seat: 0 });
    const without = main((b) =>
      b.define(CORPSE).graveyard(CORPSE.name).battlefield(BEARS).battlefield('Swamp'),
    );
    expect(() => without.act(0).cast(CORPSE.name, { pay: true })).toThrow();
  });

  test('"All Zombies gain menace until end of turn": the Zombies of both players, none that comes later', () => {
    const g = main(
      (b) => b.define(ACCURSED).battlefield(ACCURSED.name).battlefield('Swamp', { count: 2 }),
      (b) => b.battlefield(ZOMBIE).battlefield(BEARS),
    );
    g.act(0).activate(ACCURSED.name, { pay: true });
    g.passAll();
    g.expect.derived({ name: ZOMBIE, seat: 1 }, { keywords: ['menace'] });
    g.expect.derived(ACCURSED.name, { keywords: ['menace'] });
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('"each creature you control with power 3 or greater gets +1/+1 and gains trample": the set is read as it resolves', () => {
    const g = main((b) =>
      b.define(RALLIER).battlefield(RALLIER.name).battlefield(V33).battlefield(V22),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: RALLIER.name, seat: 0 }]);
    settle(g);
    g.expect.pt(RALLIER.name, 4, 4);
    g.expect.pt(V33, 4, 4);
    g.expect.derived(V33, { keywords: ['trample'] });
    g.expect.pt(V22, 2, 2);
  });

  test('"Dragons you control get +1/+1 until end of turn": the Dragons I control', () => {
    const g = main(
      (b) => b.define(SCOURGE).battlefield(SCOURGE.name).battlefield('Mountain'),
      (b) => b.define(SCOURGE).battlefield(SCOURGE.name),
    );
    g.act(0).activate(SCOURGE.name, { pay: true });
    g.passAll();
    g.expect.pt({ name: SCOURGE.name, seat: 0 }, 2, 2);
    g.expect.pt({ name: SCOURGE.name, seat: 1 }, 1, 1);
  });

  test('"2 damage to each non-Dragon creature": a Dragon is left out', () => {
    const g = main(
      (b) =>
        b
          .define(WHITTLER)
          .define(SCOURGE)
          .hand(WHITTLER.name)
          .battlefield('Mountain')
          .battlefield(SCOURGE.name)
          .battlefield(V22),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(WHITTLER.name, { pay: true });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SCOURGE.name, 'battlefield', { seat: 0 });
    g.expect.damage(SCOURGE.name, 0);
  });
});

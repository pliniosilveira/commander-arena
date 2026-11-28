// The Family Matters deck, group C: the REAL Oracle text of Helm of the Host, Echoing Assault, Murmuration and Arthur, Marigold Knight (the golden corpus, taken from the issue) goes
// through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the
// engine runs. Pins: CR 707.9b (a copy's exceptions), 205.4a (legendary is a supertype), 111.4 (a token's name), 508.4 and 508.6 (a creature put onto the battlefield attacking, the
// player an attack trigger is about), 603.7c (a delayed triggered ability about one object), 511.1 (the end of combat step), 601.2i (a spell is cast), 701.20a (look at the top cards).
// Built for more than one opponent: Echoing Assault and Arthur are played with three and four seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const helm = real('Helm of the Host');
const echoing = real('Echoing Assault');
const murmuration = real('Murmuration');
const arthur = real('Arthur, Marigold Knight');

const ISLANDS = Array.from({ length: 10 }, () => 'Island');
const LEGEND = 'Isamaru, Hound of Konda';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';

describe('every card is valid', () => {
  test.each([
    ['Helm of the Host', helm],
    ['Echoing Assault', echoing],
    ['Murmuration', murmuration],
    ['Arthur, Marigold Knight', arthur],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('the words are read only where the engine can run them', () => {
  const read = (typeLine: string, text: string) =>
    importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine,
        oracleText: text.replaceAll('~', 'SYNTHETIC Not Read'),
        power: '1',
        toughness: '1',
      }),
      undefined,
      NO_OVERRIDES,
    ).support.status;

  test.each([
    // "That player" names nobody in a trigger that is not about one attacked player (CR 508.6).
    "Whenever ~ attacks, choose target nontoken creature that's attacking that player. Create a token that's a copy of that creature, except it's 1/1.",
    "Whenever you attack, choose target nontoken creature that's attacking that player. Create a token that's a copy of that creature, except it's 1/1.",
    // The token enters attacking only where it is told whom it attacks.
    "Whenever ~ attacks, create a token that's a copy of target creature, except it's 1/1. The token enters tapped and attacking that player.",
  ])('Enchantment: %s', (text) => {
    expect(read('Enchantment', text)).toBe('unsupported');
  });

  test('a copy of the equipped creature needs an Equipment', () => {
    const text =
      "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste.";
    expect(read('Artifact — Equipment', text)).toBe('supported');
    expect(read('Enchantment', text)).toBe('unsupported');
  });

  test.each([
    // A creature enters attacking only in the effect of an attack trigger.
    "When ~ enters, look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the rest on the bottom of your library in a random order. Return that creature to its owner's hand at end of combat.",
    // The rest of the cards go where the words say, not anywhere.
    "Whenever ~ attacks, look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the rest on the bottom of your library in any order. Return that creature to its owner's hand at end of combat.",
  ])('Creature: %s', (text) => {
    expect(read('Creature — Knight', text)).toBe('unsupported');
  });

  test('a token with a name after its keywords is read, with the name it was given', () => {
    const text =
      'At the beginning of your end step, create a 1/2 blue Bird creature token with flying named Storm Crow.';
    expect(read('Enchantment', text)).toBe('supported');
  });
});

describe('Helm of the Host (real text)', () => {
  const build = (attached: boolean, active: 0 | 1 = 0) =>
    scenario()
      .define(helm)
      .seat(0)
      .library(...ISLANDS)
      .battlefield(LEGEND, { label: 'host' })
      .battlefield(helm.name, attached ? { attachedTo: 'host' } : {})
      .seat(1)
      .library(...ISLANDS)
      .at('precombatMain', { active, turn: 3 + active })
      .build();

  test('at the beginning of combat, a token copy of the equipped creature that is not legendary and has haste', () => {
    const g = build(true);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const copies = g.find({ name: LEGEND, zone: 'battlefield' });
    expect(copies).toHaveLength(2);
    const token = copies.find((o) => o.token !== null);
    const card = copies.find((o) => o.token === null);
    if (token === undefined || card === undefined) throw new Error('no copy');
    // CR 707.9b, 205.4a: not legendary, so the legend rule leaves both; the original stays legendary.
    g.expect.derived(token.id, { supertypes: [], keywords: ['haste'] });
    g.expect.derived(card.id, { supertypes: ['legendary'] });
    g.expect.pt(token.id, 2, 2);
    g.expect.invariants();
  });

  test('an Equipment attached to nothing makes nothing', () => {
    const g = build(false);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.find({ name: LEGEND, zone: 'battlefield' })).toHaveLength(1);
  });

  test('only on the turn of its controller', () => {
    const g = build(true, 1);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(g.find({ name: LEGEND, zone: 'battlefield' })).toHaveLength(1);
  });
});

describe('Murmuration (real text)', () => {
  const build = () =>
    scenario()
      .define(murmuration)
      .seat(0)
      .library(...ISLANDS)
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield(murmuration.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .library(...ISLANDS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('at the end step, a Bird named Storm Crow for each spell cast this turn; Birds get +1/+1 and vigilance', () => {
    const g = build();
    g.act(0).cast('Lightning Bolt[1]', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    const birds = g.find({ name: 'Storm Crow', zone: 'battlefield' });
    expect(birds).toHaveLength(2);
    for (const bird of birds) {
      // A 1/2 flying blue Bird, +1/+1 and vigilance from Murmuration.
      g.expect.derived(bird.id, {
        subtypes: ['Bird'],
        colors: ['U'],
        keywords: ['flying', 'vigilance'],
      });
      g.expect.pt(bird.id, 2, 3);
    }
    // The Bears are no Bird.
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('no spell cast, no Bird', () => {
    const g = build();
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: 'Storm Crow', zone: 'battlefield' })).toHaveLength(0);
  });
});

describe('Arthur, Marigold Knight (real text)', () => {
  const build = (seats: 2 | 3 | 4, others: readonly string[]) => {
    const b = scenario({ seats })
      .define(arthur)
      .seat(0)
      .library(
        'Island',
        BEARS,
        'Island',
        'Island',
        'Island',
        'Island',
        'Plains',
        'Plains',
        'Plains',
        ...ISLANDS,
      )
      .battlefield(arthur.name)
      .battlefield(...others);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...ISLANDS);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  type Game = ReturnType<typeof build>;
  const librarySize = (g: Game) => g.state.seats[0]?.library.length ?? 0;

  test('with another attacker: the creature found enters tapped and attacking, was never declared, and returns to its owner’s hand at end of combat', () => {
    const g = build(2, [GOBLIN]);
    const before = librarySize(g);
    g.act(0).declareAttackers([
      { attacker: arthur.name, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 1 } },
    ]);
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.passAll();
    // CR 508.4: tapped and attacking the player, never declared as an attacker.
    g.expect.tapped(BEARS, true);
    const bears = g.object(BEARS);
    expect(g.state.combat?.attackers.find((a) => a.object === bears.id)?.target).toEqual({
      kind: 'player',
      seat: 1,
    });
    expect(g.state.turnLog.attackedWith.some((a) => a.object === bears.id)).toBe(false);
    // One card left the library; the rest went to the bottom of it.
    expect(librarySize(g)).toBe(before - 1);
    // CR 511.1, 603.7c: back in its owner's hand at end of combat.
    g.advanceTo('endOfCombat', { attack: false });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('the player may put no creature onto the battlefield', () => {
    const g = build(2, [GOBLIN]);
    g.act(0).declareAttackers([
      { attacker: arthur.name, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 1 } },
    ]);
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('Arthur attacking alone does not trigger it', () => {
    const g = build(2, [GOBLIN]);
    g.act(0).declareAttackers([{ attacker: arthur.name, target: { player: 1 } }]);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('another creature attacking without Arthur does not trigger it', () => {
    const g = build(2, [GOBLIN]);
    g.act(0).declareAttackers([{ attacker: GOBLIN, target: { player: 1 } }]);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });

  test.each([3, 4] as const)(
    '%i seats: the controller of the creature chooses which player it attacks',
    (seats) => {
      const g = build(seats, [GOBLIN]);
      g.act(0).declareAttackers([
        { attacker: arthur.name, target: { player: 1 } },
        { attacker: GOBLIN, target: { player: 2 } },
      ]);
      g.passAll();
      g.act(0).chooseCards(BEARS);
      // CR 508.4: Arthur attacks player 1, the Goblin player 2, and the creature put onto the battlefield attacks whom its controller chooses.
      expect(g.state.pending).toMatchObject({
        kind: 'chooseOption',
        purpose: 'attackTarget',
        options: Array.from({ length: seats - 1 }, (_, i) => `player:${i + 1}`),
      });
      g.act(0).chooseOption('player:2');
      g.passAll();
      const bears = g.object(BEARS);
      expect(g.state.combat?.attackers.find((a) => a.object === bears.id)?.target).toEqual({
        kind: 'player',
        seat: 2,
      });
    },
  );
});

describe('Echoing Assault (real text)', () => {
  const SPIDER = 'Giant Spider';
  const build = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats }).define(echoing);
    b.seat(0)
      .library(...ISLANDS)
      .battlefield(echoing.name, BEARS, GOBLIN, SPIDER);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...ISLANDS);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  type Game = ReturnType<typeof build>;
  /** The triggers of one declaration go on the stack in an order their controller chooses (CR 603.3b); each chooses its target as it goes on the stack. */
  const settle = (g: Game, picks: readonly string[] = []) => {
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, index) => index));
    }
    let i = 0;
    while (g.state.pending?.kind === 'targets') {
      const pick = picks[i];
      i += 1;
      if (pick === undefined) throw new Error('a target is asked for that the test did not expect');
      g.act(0).chooseTargets({ name: pick, seat: 0 });
    }
    g.passAll();
  };
  /** The tokens on the battlefield, by the name of the creature each copies. */
  const tokens = (g: Game) =>
    [BEARS, GOBLIN, SPIDER].flatMap((name) =>
      g
        .find({ name, zone: 'battlefield' })
        .filter((o) => o.token !== null)
        .map((o) => ({ name, id: o.id })),
    );
  const attackedSeat = (g: Game, id: string) => {
    const target = g.state.combat?.attackers.find((a) => a.object === id)?.target;
    return target?.kind === 'player' ? target.seat : null;
  };

  test('the choice is a nontoken creature attacking that player: only those are offered', () => {
    const g = build(3);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: SPIDER, target: { player: 2 } },
    ]);
    g.act(0).orderTriggers(0, 1);
    // One trigger for each player attacked (CR 508.6): the first one offers the two creatures attacking player 1 and not the Spider, which attacks player 2.
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('no target decision');
    const offered = d.specs[0]?.legal.map((l) => (l.kind === 'object' ? l.id : null));
    const names = [BEARS, GOBLIN, SPIDER].flatMap((name) =>
      g
        .find({ name, zone: 'battlefield' })
        .filter((o) => offered?.includes(o.id))
        .map(() => name),
    );
    expect(names.sort()).toEqual([BEARS, GOBLIN].sort());
    expect(() => g.act(0).chooseTargets({ name: SPIDER, seat: 0 })).toThrow();
  });

  test('three seats: a 1/1 copy for each player attacked, tapped and attacking that player, with menace, sacrificed at the next end step', () => {
    const g = build(3);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 1 } },
      { attacker: SPIDER, target: { player: 2 } },
    ]);
    settle(g, [GOBLIN, SPIDER]);
    const made = tokens(g);
    expect(made.map((t) => t.name).sort()).toEqual([GOBLIN, SPIDER].sort());
    for (const t of made) {
      // CR 707.9b: a copy of the creature with the power and toughness 1/1; tapped (CR 110.5b); creature tokens you control have menace.
      g.expect.pt(t.id, 1, 1);
      g.expect.tapped(t.id, true);
      // The copy has the abilities of what it copies (the Spider's reach, the Goblin's haste) and menace from the enchantment.
      g.expect.derived(t.id, {
        keywords: t.name === SPIDER ? ['reach', 'menace'] : ['haste', 'menace'],
      });
      // CR 508.4: never declared as an attacker.
      expect(g.state.turnLog.attackedWith.some((a) => a.object === t.id)).toBe(false);
    }
    const goblin = made.find((t) => t.name === GOBLIN);
    const spider = made.find((t) => t.name === SPIDER);
    if (goblin === undefined || spider === undefined) throw new Error('no token');
    // The copy of the creature that attacks player 1 attacks player 1; the one of the creature that attacks player 2 attacks player 2.
    expect(attackedSeat(g, goblin.id)).toBe(1);
    expect(attackedSeat(g, spider.id)).toBe(2);
    // The creatures are not tokens, so they keep their own numbers and have no menace.
    g.expect.pt(BEARS, 2, 2);
    g.expect.derived(BEARS, { keywords: [] });
    // CR 603.7c: the delayed ability sacrifices the tokens at the beginning of the next end step.
    g.advanceTo('end', { attack: false, block: false });
    // Two delayed triggers at once: the controller orders them (CR 603.3b).
    expect(g.state.pending?.kind).toBe('orderTriggers');
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('four seats: the player attacked is the one the trigger is about, whoever else is in the game', () => {
    const g = build(4);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 3 } },
      { attacker: GOBLIN, target: { player: 1 } },
    ]);
    settle(g, [BEARS, GOBLIN]);
    const made = tokens(g);
    expect(made).toHaveLength(2);
    const seatOf = (name: string) => {
      const t = made.find((o) => o.name === name);
      if (t === undefined) throw new Error(`no ${name} token`);
      return attackedSeat(g, t.id);
    };
    expect(seatOf(BEARS)).toBe(3);
    expect(seatOf(GOBLIN)).toBe(1);
    g.expect.invariants();
  });

  test('the creatures attack the same player: one trigger, one copy', () => {
    const g = build(2);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 1 } },
    ]);
    settle(g, [BEARS]);
    expect(tokens(g).map((t) => t.name)).toEqual([BEARS]);
  });

  test('the target is checked again as the ability resolves: a creature that died in response is not copied', () => {
    const b = scenario().define(echoing);
    b.seat(0)
      .library(...ISLANDS)
      .battlefield(echoing.name, BEARS);
    b.seat(1)
      .library(...ISLANDS)
      .hand('Lightning Bolt')
      .battlefield('Mountain');
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
    expect(g.state.stack).toHaveLength(1);
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.passAll();
    // CR 608.2b: the only target is gone, so the ability does nothing: no token, and nothing is sacrificed later.
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    expect(tokens(g)).toHaveLength(0);
    g.expect.invariants();
  });
});

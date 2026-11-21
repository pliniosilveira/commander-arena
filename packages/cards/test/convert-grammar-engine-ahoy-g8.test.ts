// Ahoy Mateys deck, group 8 (graveyard and library effects): Port of Karfell, Admiral Brass, Unsinkable, Ghost of Ramirez DePietro, The Grim Captain's Locker and The Indomitable. The REAL
// Oracle text of each card (the golden corpus) goes through the grammar with no override and is played through applyAction. The CR text of this checkout (docs/rules/comprehensive-rules.txt)
// was not available, so only rule numbers the repository's own comments already use are cited: CR 701.17 (mill), 701.9 (discard), 404.1 (a graveyard), 400.7 (a card that changes zones is a new
// object), 608.2d (the choice of a card as an effect resolves), 110.2a and 110.5b (what an effect puts onto the battlefield is controlled by its controller; tapped), 122.6 and 122.1h
// (a permanent that enters with a counter; the finality counter), 613.4b (base power and toughness), 611.2a and 611.2c (a continuous effect that lasts a turn and the objects it names),
// 702.138a (escape), 118.9 (an alternative cost), 113.6b (an ability that works from the graveyard), 115.1 (targets), 603.2 (triggered abilities), 108.3 (the owner's hand).
import { readFileSync } from 'node:fs';
import {
  applyAction,
  type CardDefinition,
  getLegalActions,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

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

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const PIRATE = parsed('SYNTHETIC Parsed Pirate', 'Creature — Human Pirate', '', {
  manaCost: '{1}{U}',
  power: '2',
  toughness: '1',
  colors: ['U'],
});
const PIRATE_TWO = parsed('SYNTHETIC Parsed Second Pirate', 'Creature — Human Pirate', '', {
  manaCost: '{1}{B}',
  power: '1',
  toughness: '1',
  colors: ['B'],
});
const SHEEP = parsed('SYNTHETIC Parsed Sheep', 'Creature — Sheep', '', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});

describe('Port of Karfell: mill four, then return a creature card from your graveyard to the battlefield tapped', () => {
  const port = real('Port of Karfell');

  const build = (graveyard: readonly string[], library: readonly string[] = LIBRARY) => {
    let b = scenario()
      .define(port)
      .define(PIRATE)
      .define(SHEEP)
      .seat(0)
      .library(...library);
    for (const name of graveyard) b = b.graveyard(name);
    return b
      .battlefield(port.name)
      .battlefield('Island', { count: 4 })
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('the card is valid', () => {
    expect(validateCard(port)).toEqual([]);
  });

  test('the milled creature card is a candidate: the mill comes first (CR 701.17, 608.2d)', () => {
    const g = build([], [PIRATE.name, 'Island', 'Island', 'Island', 'Island', 'Island']);
    g.act(0).activate(port.name, { pay: true });
    g.passAll();
    // The one creature card there is is the one that returns: nothing is asked (CR 608.2d).
    g.expect.zone(PIRATE.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(PIRATE.name);
    g.expect.zone(port.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.librarySize(0, 2);
    g.expect.invariants();
  });

  test('a creature card that was already in the graveyard may be chosen, and only creature cards are offered (CR 608.2d)', () => {
    const g = build([BEARS, SHEEP.name, 'Lightning Bolt']);
    g.act(0).activate(port.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const shown = (g.view(0).pendingCards ?? []).map((o) => o.name).sort();
    expect(shown).toEqual([BEARS, SHEEP.name].sort());
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(BEARS);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the cost is paid first: the land is tapped and sacrificed, so it cannot be returned and the mill still happens', () => {
    const g = build([], [SHEEP.name, 'Island', 'Island', 'Island', 'Island']);
    g.act(0).activate(port.name, { pay: true });
    g.expect.zone(port.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.stack(['Port of Karfell (ability)']);
    g.passAll();
    g.expect.zone(SHEEP.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(port.name, 'battlefield', { count: 0 });
  });

  test('with no creature card after the mill, nothing is asked and nothing returns', () => {
    const g = build([], ['Island', 'Island', 'Island', 'Island', 'Island']);
    g.act(0).activate(port.name, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 1);
    g.expect.pending('priority', 0);
    g.expect.zone('Island', 'graveyard', { seat: 0, count: 4 });
  });

  test.each([
    [
      'untapped',
      '{3}{U}{B}{B}, {T}, Sacrifice ~: Mill four cards, then return a creature card from your graveyard to the battlefield.',
    ],
    [
      'to your hand',
      '{3}{U}{B}{B}, {T}, Sacrifice ~: Mill four cards, then return a creature card from your graveyard to your hand tapped.',
    ],
    [
      'another graveyard',
      '{3}{U}{B}{B}, {T}, Sacrifice ~: Mill four cards, then return a creature card from a graveyard to the battlefield tapped.',
    ],
  ])('%s: not the same text, so the near miss is not read as tapped', (what, text) => {
    // "to the battlefield" with no "tapped" is the card that existed before (supported); the others are not read.
    const read = (() => {
      try {
        return dropped(text, 'land');
      } catch {
        return undefined;
      }
    })();
    if (what === 'untapped') expect(read).toBeUndefined();
    else expect(read).toBeDefined();
  });
});

describe('Admiral Brass, Unsinkable: return a Pirate with a finality counter, base 4/4, haste', () => {
  const brass = real('Admiral Brass, Unsinkable');

  const build = (graveyard: readonly string[]) => {
    let b = scenario().define(brass).define(PIRATE).define(PIRATE_TWO).define(SHEEP).seat(0);
    b = b.library(...LIBRARY).battlefield(brass.name);
    for (const name of graveyard) b = b.graveyard(name);
    return b
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  const toCombat = (graveyard: readonly string[]) => {
    const g = build(graveyard);
    g.advanceTo('beginningOfCombat');
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(brass)).toEqual([]);
  });

  test('the trigger targets a Pirate creature card of your graveyard only (CR 115.1, 603.2)', () => {
    const g = toCombat([PIRATE.name, PIRATE_TWO.name, SHEEP.name, BEARS]);
    g.expect.pending('targets', 0);
    expect(() => g.act(0).chooseTargets(SHEEP.name)).toThrow();
    expect(() => g.act(0).chooseTargets(BEARS)).toThrow();
    g.act(0).chooseTargets(PIRATE_TWO.name);
    g.passAll();
    g.act(0).accept();
    g.expect.zone(PIRATE_TWO.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(PIRATE.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.pt(PIRATE_TWO.name, 4, 4);
  });

  test('it returns under your control with a finality counter, as a 4/4 with haste (CR 110.2a, 122.6, 613.4b)', () => {
    const g = toCombat([PIRATE.name]);
    // The one Pirate card there is is the target of the trigger as it is put on the stack (CR 115.1).
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(PIRATE.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.counters(PIRATE.name, { finality: 1 });
    g.expect.pt(PIRATE.name, 4, 4);
    g.expect.derived(PIRATE.name, { keywords: ['haste'] });
    g.expect.invariants();
  });

  test('the base power and toughness stay while it is on the battlefield and the haste ends with the turn (CR 611.2a)', () => {
    const g = toCombat([PIRATE.name]);
    // The one Pirate card there is is the target of the trigger as it is put on the stack (CR 115.1).
    g.passAll();
    g.act(0).accept();
    g.advanceTo('end');
    g.expect.derived(PIRATE.name, { keywords: ['haste'] });
    g.advanceTo('upkeep');
    g.expect.step('upkeep', { turn: 4 });
    g.expect.pt(PIRATE.name, 4, 4);
    g.expect.derived(PIRATE.name, { keywords: [] });
  });

  test('"you may": declining leaves the card in the graveyard and gives nothing', () => {
    const g = toCombat([PIRATE.name]);
    // The one Pirate card there is is the target of the trigger as it is put on the stack (CR 115.1).
    g.passAll();
    g.act(0).decline();
    g.expect.zone(PIRATE.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(PIRATE.name, 'battlefield', { count: 0 });
  });

  test('a creature that has the finality counter is exiled instead of dying (CR 122.1h)', () => {
    const g = scenario()
      .define(brass)
      .define(PIRATE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(brass.name)
      .graveyard(PIRATE.name)
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).accept();
    g.expect.pt(PIRATE.name, 4, 4);
    g.act(0).cast('Lightning Bolt[1]', { targets: [PIRATE.name], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [PIRATE.name], pay: true });
    g.passAll();
    g.expect.zone(PIRATE.name, 'battlefield', { count: 0 });
    g.expect.zone(PIRATE.name, 'exile', { seat: 0, count: 1 });
    g.expect.zone(PIRATE.name, 'graveyard', { count: 0 });
  });

  test('on another player’s turn nothing triggers: "on your turn"', () => {
    const g = scenario()
      .define(brass)
      .define(PIRATE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(brass.name)
      .graveyard(PIRATE.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.stack([]);
    g.expect.zone(PIRATE.name, 'graveyard', { seat: 0, count: 1 });
  });

  test.each([
    [
      'a permanent base power that is not 4/4 but with no "it"',
      'At the beginning of combat on your turn, you may return target Pirate creature card from your graveyard to the battlefield with a finality counter on it. Target creature has base power and toughness 4/4.',
    ],
    [
      'two optional sentences',
      'At the beginning of combat on your turn, you may return target Pirate creature card from your graveyard to the battlefield. You may draw a card. It has base power and toughness 4/4.',
    ],
    [
      'a duration that is not the turn on the haste of a target',
      'At the beginning of combat on your turn, you may return target Pirate creature card from your graveyard to the battlefield. Target creature has base power and toughness 4/4.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe('Ghost of Ramirez DePietro: a card discarded or put into a graveyard from a library this turn goes to its owner’s hand', () => {
  const ghost = real('Ghost of Ramirez DePietro');
  const RUMMAGE = parsed(
    'SYNTHETIC Parsed Rummage',
    'Sorcery',
    'Target opponent discards a card.',
    { manaCost: '{U}', colors: ['U'] },
  );
  const CHURN = parsed('SYNTHETIC Parsed Churn', 'Sorcery', 'Target opponent mills two cards.', {
    manaCost: '{U}',
    colors: ['U'],
  });
  const SPIDER = 'Giant Spider';

  const build = (options: {
    readonly hand?: readonly string[];
    readonly library?: readonly string[];
    readonly graveyard?: readonly string[];
    readonly spells?: readonly string[];
  }) => {
    let b = scenario()
      .define(ghost)
      .define(RUMMAGE)
      .define(CHURN)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ghost.name)
      .battlefield('Island', { count: 3 })
      .hand(...(options.spells ?? []))
      .seat(1)
      .library(...(options.library ?? LIBRARY));
    if (options.hand !== undefined && options.hand.length > 0) b = b.hand(...options.hand);
    for (const name of options.graveyard ?? []) b = b.graveyard(name);
    return b.at('precombatMain', { active: 0 }).build();
  };

  type Game = ReturnType<typeof build>;

  /** Ghost attacks and is not blocked. */
  const attack = (g: Game) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: ghost.name }]);
    g.passAll();
    g.passAll();
  };

  const cast = (g: Game, spell: string) => {
    g.act(0).cast(spell, { targets: [{ player: 1 }], pay: true });
    g.passAll();
  };

  test('the card is valid', () => {
    expect(validateCard(ghost)).toEqual([]);
  });

  test('a card the opponent discarded this turn is chosen and goes to its owner’s hand (CR 701.9, 108.3)', () => {
    const g = build({ hand: [BEARS, 'Lightning Bolt'], spells: [RUMMAGE.name] });
    cast(g, RUMMAGE.name);
    g.act(1).chooseCards(BEARS);
    attack(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1, count: 1 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { count: 0 });
    g.expect.invariants();
  });

  test('a card milled from a library this turn is chosen too (CR 701.17, 404.1)', () => {
    const g = build({
      library: [BEARS, SPIDER, 'Island', 'Island', 'Island'],
      spells: [CHURN.name],
    });
    cast(g, CHURN.name);
    attack(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1, count: 1 });
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'hand', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('a card that was in the graveyard before the turn is not a legal target', () => {
    const g = build({
      library: [BEARS, SPIDER, 'Island', 'Island', 'Island'],
      graveyard: ['Typhoid Rats'],
      spells: [CHURN.name],
    });
    cast(g, CHURN.name);
    attack(g);
    g.expect.pending('targets', 0);
    expect(() => g.act(0).chooseTargets('Typhoid Rats')).toThrow();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
  });

  test('a spell that went to a graveyard from the stack is not a legal target', () => {
    const g = build({
      library: [BEARS, SPIDER, 'Island', 'Island', 'Island'],
      spells: [CHURN.name],
    });
    cast(g, CHURN.name);
    attack(g);
    expect(() => g.act(0).chooseTargets(CHURN.name)).toThrow();
  });

  test('"up to one": with no card discarded or milled the ability does nothing', () => {
    const g = build({ graveyard: ['Typhoid Rats'] });
    attack(g);
    g.passAll();
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1, count: 1 });
    g.expect.life(1, 38);
  });

  test.each([
    [
      'a card discarded only',
      "Whenever ~ deals combat damage to a player, choose up to one target card in a graveyard that was discarded this turn. Put that card into its owner's hand.",
    ],
    [
      'your graveyard only',
      "Whenever ~ deals combat damage to a player, choose up to one target card in your graveyard that was discarded or put there from a library this turn. Put that card into its owner's hand.",
    ],
    [
      'two cards',
      "Whenever ~ deals combat damage to a player, choose up to two target cards in a graveyard that was discarded or put there from a library this turn. Put that card into its owner's hand.",
    ],
    [
      'your hand',
      'Whenever ~ deals combat damage to a player, choose up to one target card in a graveyard that was discarded or put there from a library this turn. Put that card into your hand.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe("The Grim Captain's Locker: until end of turn each creature card in your graveyard gains escape", () => {
  const locker = real("The Grim Captain's Locker");
  const FILLER = ['Island', 'Island', 'Island', 'Island'];

  const build = (graveyard: readonly string[], swamps = 4) => {
    let b = scenario()
      .define(locker)
      .define(SHEEP)
      .seat(0)
      .library(...LIBRARY);
    for (const name of graveyard) b = b.graveyard(name);
    return b
      .battlefield(locker.name)
      .battlefield('Swamp', { count: swamps })
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  type Game = ReturnType<typeof build>;

  /** The second activated ability: the one that gives escape (the first is the surveil). */
  const grant = (g: Game) => {
    g.act(0).activate(locker.name, { ability: 1 });
    g.passAll();
  };

  const escapeOptions = (g: Game) =>
    getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.alternative === 'escape');

  test('the card is valid', () => {
    expect(validateCard(locker)).toEqual([]);
  });

  test('before the ability, a creature card of the graveyard has no escape cast (CR 702.138a)', () => {
    const g = build([BEARS, ...FILLER]);
    expect(escapeOptions(g)).toEqual([]);
  });

  test('after it, each creature card is offered with escape, and a card that is not a creature is not (CR 702.138a, 611.2c)', () => {
    const g = build([BEARS, SHEEP.name, 'Lightning Bolt', ...FILLER]);
    grant(g);
    g.expect.tapped(locker.name);
    g.expect.legal(0, { cast: BEARS, alternative: 'escape' });
    g.expect.legal(0, { cast: SHEEP.name, alternative: 'escape' });
    g.expect.illegal(0, { cast: 'Lightning Bolt', alternative: 'escape' });
    expect(escapeOptions(g)).toHaveLength(2);
  });

  test('the escape cost is {3}{B} and four other cards: four others are needed, the card itself does not count (CR 702.138a, 118.9)', () => {
    const three = build([BEARS, 'Island', 'Island', 'Island']);
    grant(three);
    expect(escapeOptions(three)).toEqual([]);
    const four = build([BEARS, ...FILLER]);
    grant(four);
    expect(escapeOptions(four)).toHaveLength(1);
  });

  test('{3}{B} is needed: three lands (the Mountain is the third) are not enough', () => {
    const g = build([BEARS, ...FILLER], 2);
    grant(g);
    expect(escapeOptions(g)).toEqual([]);
  });

  test('cast for it, the card pays {3}{B}, exiles four other cards and comes back as a permanent (CR 702.138a, 601.2h)', () => {
    const g = build([BEARS, ...FILLER, 'Giant Spider']);
    grant(g);
    g.act(0).cast(BEARS, { alternative: 'escape' }).pay();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(
      { name: 'Island', seat: 0, nth: 0 },
      { name: 'Island', seat: 0, nth: 1 },
      { name: 'Island', seat: 0, nth: 2 },
      'Giant Spider',
    );
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { count: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0, count: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a creature card that enters the graveyard after the ability resolved does not get escape (CR 611.2c, 400.7)', () => {
    const g = build([SHEEP.name, ...FILLER]);
    g.act(0).activate(locker.name, { ability: 1 });
    g.passAll();
    g.expect.legal(0, { cast: SHEEP.name, alternative: 'escape' });
    // A second creature card goes to the graveyard now: it is a new object that the effect did not name.
    const b = scenario()
      .define(locker)
      .define(SHEEP)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(SHEEP.name, ...FILLER)
      .battlefield(locker.name)
      .battlefield(BEARS)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    b.act(0).activate(locker.name, { ability: 1 });
    b.passAll();
    b.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    b.passAll();
    b.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    b.expect.legal(0, { cast: SHEEP.name, alternative: 'escape' });
    b.expect.illegal(0, { cast: BEARS, alternative: 'escape' });
  });

  test('it lasts until end of turn only (CR 611.2a)', () => {
    const g = build([BEARS, ...FILLER]);
    grant(g);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'escapeGrant')).toBe(true);
    g.advanceTo('upkeep');
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'escapeGrant')).toBe(false);
  });

  test('with no creature card in the graveyard the ability does nothing', () => {
    const g = build(['Lightning Bolt', ...FILLER]);
    grant(g);
    expect(escapeOptions(g)).toEqual([]);
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'escapeGrant')).toBe(false);
  });

  test('an escape cast offered by the engine is refused for a card that has none', () => {
    const g = build([BEARS, ...FILLER]);
    const refused = applyAction(g.state, 0, {
      kind: 'castSpell',
      object: g.id(BEARS),
      alternative: 'escape',
    });
    expect(refused.ok).toBe(false);
  });

  test.each([
    [
      'the graveyard of any player',
      '{T}: Until end of turn, each creature card in a graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    ],
    [
      'no duration',
      '{T}: Each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    ],
    [
      'a cost that is not mana',
      '{T}: Until end of turn, each creature card in your graveyard gains "Escape—Sacrifice a creature, Exile four other cards from your graveyard."',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'artifact')).toBeDefined();
  });
});

describe('The Indomitable: cast from the graveyard while you control three or more tapped Pirates and/or Vehicles', () => {
  const indomitable = real('The Indomitable');
  const WAGON = parsed('SYNTHETIC Parsed Wagon', 'Artifact — Vehicle', 'Crew 1', {
    manaCost: '{2}',
    power: '2',
    toughness: '2',
  });

  const build = (
    board: readonly { readonly name: string; readonly count: number; readonly tapped: boolean }[],
    options: { readonly step?: 'precombatMain' | 'beginningOfCombat' } = {},
  ) => {
    let b = scenario()
      .define(indomitable)
      .define(PIRATE)
      .define(WAGON)
      .define(SHEEP)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(indomitable.name);
    for (const p of board) b = b.battlefield(p.name, { count: p.count, tapped: p.tapped });
    return b
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .at(options.step ?? 'precombatMain', { active: 0 })
      .build();
  };

  test('the card is valid', () => {
    expect(validateCard(indomitable)).toEqual([]);
  });

  test('three tapped Pirates: it may be cast from the graveyard, paying its mana cost, and resolves onto the battlefield (CR 113.6b, 601.2a)', () => {
    const g = build([{ name: PIRATE.name, count: 3, tapped: true }]);
    g.expect.legal(0, { cast: indomitable.name });
    g.act(0).cast(indomitable.name, { pay: true });
    g.passAll();
    g.expect.zone(indomitable.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(indomitable.name, 'graveyard', { count: 0 });
    g.expect.invariants();
  });

  test('Pirates and Vehicles together count: two tapped Pirates and one tapped Vehicle (CR 205.3)', () => {
    const g = build([
      { name: PIRATE.name, count: 2, tapped: true },
      { name: WAGON.name, count: 1, tapped: true },
    ]);
    g.expect.legal(0, { cast: indomitable.name });
  });

  test('two are too few', () => {
    const g = build([{ name: PIRATE.name, count: 2, tapped: true }]);
    g.expect.illegal(0, { cast: indomitable.name });
  });

  test('untapped ones do not count (CR 110.5)', () => {
    const g = build([
      { name: PIRATE.name, count: 2, tapped: true },
      { name: PIRATE.name, count: 1, tapped: false },
    ]);
    g.expect.illegal(0, { cast: indomitable.name });
  });

  test('a tapped creature that is neither a Pirate nor a Vehicle does not count', () => {
    const g = build([
      { name: PIRATE.name, count: 2, tapped: true },
      { name: SHEEP.name, count: 1, tapped: true },
    ]);
    g.expect.illegal(0, { cast: indomitable.name });
  });

  test('the Pirates of another player do not count: "you control"', () => {
    const g = scenario()
      .define(indomitable)
      .define(PIRATE)
      .seat(0)
      .library(...LIBRARY)
      .graveyard(indomitable.name)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(PIRATE.name, { count: 3, tapped: true })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { cast: indomitable.name });
  });

  test('the condition is read as it is cast: when the Pirates untap, it cannot be cast any more', () => {
    const g = build([{ name: PIRATE.name, count: 3, tapped: true }], { step: 'precombatMain' });
    g.expect.legal(0, { cast: indomitable.name });
    g.advanceTo('upkeep');
    g.advanceTo('precombatMain');
    // Turn 4 is the opponent's, whose untap step does not untap the Pirates of seat 0; on seat 0's own turn they untap.
    g.advanceTo('upkeep');
    g.advanceTo('precombatMain');
    g.expect.step('precombatMain', { active: 0 });
    g.expect.illegal(0, { cast: indomitable.name });
  });

  test.each([
    [
      'untapped or tapped alike',
      'You may cast this card from your graveyard as long as you control three or more Pirates and Vehicles.',
    ],
    [
      'three kinds',
      'You may cast this card from your graveyard as long as you control three or more tapped Pirates and/or Vehicles and/or Dragons.',
    ],
    [
      'another player’s graveyard',
      'You may cast this card from a graveyard as long as you control three or more tapped Pirates and/or Vehicles.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'artifact')).toBeDefined();
  });
});

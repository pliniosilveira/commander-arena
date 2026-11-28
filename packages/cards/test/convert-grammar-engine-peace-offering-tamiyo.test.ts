// The Peace Offering deck, group D: Tamiyo, Field Researcher. Each loyalty ability is read from its REAL Oracle line (the golden corpus, taken from the issue) through the grammar as a
// planeswalker with no override, and the engine runs what the parser wrote. Pins: CR 115.1 (targets), 502.3 and 611.2a ("doesn't untap during its controller's next untap step"),
// 603.7, 603.7b, 603.7c, 603.7e, 510.2 and 500.1 (a delayed triggered ability about the creatures chosen, until the controller's next turn), 114 (emblems), 118.9, 601.2b, 601.2f and
// 107.3b (casting without paying the mana cost). Built for more than one opponent: the abilities are played with three seats.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const TAMIYO = GOLDEN.find((c) => c.name === 'Tamiyo, Field Researcher');
if (TAMIYO === undefined) throw new Error('Tamiyo, Field Researcher is not in the golden corpus');
const [FACE] = TAMIYO.faces;
if (FACE === undefined) throw new Error('Tamiyo has no face');
/** The real loyalty lines of the card, in order: +1, −2, −7. */
const LINES = FACE.oracleText.split('\n');

/** The real card, imported through the grammar only; it must read as supported. */
function GOLDEN_CARD(): CardDefinition {
  if (TAMIYO === undefined) throw new Error('no Tamiyo');
  const imported = importCard(fromGoldenCard(TAMIYO), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.reasons).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

/** A SYNTHETIC planeswalker with only the real line `index` of Tamiyo, imported through the grammar; it must read as supported. */
function walkerOf(index: number): CardDefinition {
  const line = LINES[index];
  if (line === undefined) throw new Error(`no line ${index}`);
  return readWalker(line);
}

/** A SYNTHETIC planeswalker with `text` as its rules text, imported through the grammar; it must read as supported. */
function readWalker(text: string): CardDefinition {
  const imported = importCard(
    syntheticCard({
      name: 'SYNTHETIC Field Walker',
      manaCost: '{1}{G}{W}{U}',
      typeLine: 'Legendary Planeswalker — Tamiyo',
      oracleText: text,
      loyalty: '4',
    }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.unparsed, text).toEqual([]);
  expect(imported.support.reasons, text).toEqual([]);
  expect(imported.support.status, text).toBe('supported');
  return imported.definition;
}

const WALKER = 'SYNTHETIC Field Walker';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('−2: Tap up to two target nonland permanents. They don’t untap during their controller’s next untap step.', () => {
  const walker = walkerOf(1);
  const board = () =>
    scenario({ seats: 3 })
      .define(walker)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .battlefield('Forest', { label: 'forest' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Sol Ring', { label: 'ring' })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the AST: a tap and a "doesn’t untap" of the same target slot, of up to two nonland permanents', () => {
    const ability = walker.faces[0]?.abilities[0];
    expect(ability).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -2 }],
      targets: [{ what: { kind: 'object', filter: { notTypes: ['land'] } }, min: 0, max: 2 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          {
            kind: 'restrict',
            objects: { kind: 'target', id: 't1' },
            restriction: 'doesntUntap',
            duration: 'untilNextUntapStep',
          },
        ],
      },
    });
  });

  test('two permanents of two opponents: each stays tapped through the next untap step of its own controller, then untaps (CR 502.3, 611.2a)', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['bears', 'ring'] });
    g.passAll();
    g.expect.tapped('bears');
    g.expect.tapped('ring');
    g.expect.counters(WALKER, { loyalty: 2 });
    // Seat 1's turn: its Bears stay tapped; seat 2's Sol Ring is not untapped by another player's untap step anyway.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.tapped('bears');
    g.expect.tapped('ring');
    // Seat 2's turn: its Sol Ring stays tapped too.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
    g.expect.tapped('ring');
    g.expect.tapped('bears');
    // The next untap step of each controller untaps them.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.expect.tapped('bears', false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('ring', false);
    g.expect.invariants();
  });

  test('up to two: no target at all is a legal choice, and the ability still costs its loyalty', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: [] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 2 });
    g.expect.tapped('bears', false);
  });

  test('a land is not a nonland permanent: it cannot be a target', () => {
    const g = board();
    expect(() => g.act(0).activate(WALKER, { targets: ['forest'] })).toThrow();
  });

  test('"they" with no plural group before it is not read', () => {
    const imported = importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine: 'Legendary Planeswalker — Tamiyo',
        oracleText:
          "−2: Tap target creature. They don't untap during their controller's next untap step.",
        loyalty: '4',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('+1: Choose up to two target creatures. Until your next turn, whenever either of those creatures deals combat damage, you draw a card.', () => {
  const walker = walkerOf(0);
  const board = (mine = 'Grizzly Bears', loyalty = 4) =>
    scenario({ seats: 3 })
      .define(walker)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, { counters: { loyalty } })
      .battlefield(mine, { label: 'mine' })
      .battlefield('Raging Goblin', { label: 'second' })
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Wall of Stone', { label: 'wall' })
      .battlefield('Grizzly Bears', { label: 'blocker' })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the AST: a target slot of up to two creatures and a delayed combat damage ability of any recipient until your next turn', () => {
    expect(walker.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: 1 }],
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'] } }, min: 0, max: 2 },
      ],
      effect: {
        kind: 'delayedCombatDamage',
        objects: { kind: 'target', id: 't1' },
        to: 'any',
        until: 'yourNextTurn',
        effect: { kind: 'draw' },
      },
    });
  });

  test('a chosen creature of yours deals combat damage to a player: you draw a card; one not chosen draws nothing', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 5 });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [
        { attacker: 'mine', target: { player: 1 } },
        { attacker: 'second', target: { player: 1 } },
      ],
      until: 'postcombatMain',
    });
    g.expect.life(1, 40 - 2 - 1);
    g.expect.handSize(0, hand + 1);
    g.expect.invariants();
  });

  test('both chosen creatures deal combat damage at the same time: it triggers twice (ruling 2025-01-24)', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['mine', 'second'] });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [
        { attacker: 'mine', target: { player: 1 } },
        { attacker: 'second', target: { player: 2 } },
      ],
      until: 'postcombatMain',
    });
    g.expect.handSize(0, hand + 2);
  });

  test('damage to a creature is combat damage too, and a trampler that damages a blocker and a player at once draws one card (CR 510.2)', () => {
    const g = board('SYNTHETIC Trampler 4/4');
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'mine', target: { player: 2 } }],
      block: [{ blocker: 'blocker', attacker: 'mine' }],
      until: 'postcombatMain',
    });
    // 2 to the Bears (lethal) and the other 2 to the player (CR 702.19b), dealt at once.
    g.expect.life(2, 38);
    g.expect.handSize(0, hand + 1);
  });

  test('a blocked creature that damages only the blocker draws a card', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'mine', target: { player: 2 } }],
      block: [{ blocker: 'wall', attacker: 'mine' }],
      until: 'postcombatMain',
    });
    g.expect.life(2, 40);
    g.expect.handSize(0, hand + 1);
  });

  test('a double striker deals combat damage in two steps: two cards (CR 510.4)', () => {
    const g = board('Fencing Ace');
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'mine', target: { player: 1 } }],
      until: 'postcombatMain',
    });
    g.expect.handSize(0, hand + 2);
  });

  test("an opponent's creature: when it deals combat damage in its controller's turn, you draw, not its controller (ruling 2025-01-24)", () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['theirs'] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    const mine = g.state.seats[0]?.hand.length ?? 0;
    const theirs = g.state.seats[1]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'theirs', target: { player: 2 } }],
      until: 'postcombatMain',
    });
    g.expect.life(2, 38);
    g.expect.handSize(0, mine + 1);
    g.expect.handSize(1, theirs);
  });

  test('it triggers even after Tamiyo has left the battlefield (ruling 2025-01-24, CR 603.7e)', () => {
    const g = board('Grizzly Bears', 1);
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard');
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'mine', target: { player: 1 } }],
      until: 'postcombatMain',
    });
    g.expect.handSize(0, hand + 1);
  });

  test('it ends as your next turn begins (CR 500.1): the creature deals combat damage then and nothing is drawn', () => {
    const g = board();
    g.act(0).activate(WALKER, { targets: ['mine'] });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    expect(g.state.delayedTriggers).toHaveLength(0);
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.playCombat({
      attack: [{ attacker: 'mine', target: { player: 1 } }],
      until: 'postcombatMain',
    });
    g.expect.life(1, 38);
    g.expect.handSize(0, hand);
  });

  test('the wordings that name no creature chosen before are not read; "that creature" of one target is', () => {
    const read = (text: string) =>
      importCard(
        syntheticCard({
          name: 'SYNTHETIC Not Read',
          typeLine: 'Legendary Planeswalker — Tamiyo',
          oracleText: text,
          loyalty: '4',
        }),
        undefined,
        NO_OVERRIDES,
      ).support.status;
    const tail =
      'Until your next turn, whenever either of those creatures deals combat damage, you draw a card.';
    expect(read(`+1: ${tail}`)).toBe('unsupported');
    expect(read(`+1: Choose target opponent. ${tail}`)).toBe('unsupported');
    expect(read(`+1: Choose target creature. ${tail}`)).toBe('unsupported');
    expect(
      read(
        '+1: Choose up to two target creatures. Until your next turn, whenever that creature deals combat damage, you draw a card.',
      ),
    ).toBe('unsupported');
    expect(
      read(
        '+1: Choose target creature. Until your next turn, whenever that creature deals combat damage, you draw a card.',
      ),
    ).toBe('supported');
  });
});

describe('−7: Draw three cards. You get an emblem with "You may cast spells from your hand without paying their mana costs."', () => {
  const walker = walkerOf(2);
  const X_SPELL = 'SYNTHETIC Jump X Drain'; // {X}{U} sorcery, gain X life
  const TOLL = 'SYNTHETIC Toll Shrine'; // {1}{W} enchantment, additional cost: discard a card
  const board = (hand: readonly string[] = ['Lightning Bolt', X_SPELL, TOLL, 'Forest']) =>
    scenario({ seats: 3 })
      .define(walker)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WALKER, { counters: { loyalty: 7 } })
      .hand('Grizzly Bears', { label: 'bear1' })
      .hand(...hand)
      .seat(1)
      .library(...LIBRARY)
      .hand('Grizzly Bears')
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const listed = (g: ReturnType<typeof board>, seat: number, name: string): boolean => {
    const ids = g.find({ name, zone: 'hand', seat }).map((o) => o.id);
    return getLegalActions(g.state, seat).some(
      (a) => a.kind === 'castSpell' && ids.includes(a.object) && a.alternative === 'free',
    );
  };
  const ultimate = (hand?: readonly string[]) => {
    const g = board(hand);
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    return g;
  };

  test('the AST: a draw of three and an emblem with a permission with no limit, from the hand, for free', () => {
    expect(walker.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'loyalty', change: -7 }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', count: 3 },
          {
            kind: 'createEmblem',
            abilities: [
              {
                kind: 'static',
                static: {
                  kind: 'castOnceEachTurn',
                  spells: {},
                  from: ['hand'],
                  alternative: 'free',
                  unlimited: true,
                },
              },
            ],
          },
        ],
      },
    });
  });

  test('you draw three cards and get the emblem in your command zone; Tamiyo, with no loyalty left, goes to the graveyard (CR 114.1, 704.5i)', () => {
    const g = ultimate();
    g.expect.handSize(0, 5 + 3);
    expect(g.state.seats[0]?.command).toHaveLength(1);
    expect(g.state.seats[1]?.command).toHaveLength(0);
    g.expect.zone(WALKER, 'graveyard');
    g.expect.invariants();
  });

  test('before the emblem, nothing is free', () => {
    const g = board();
    expect(listed(g, 0, 'Grizzly Bears')).toBe(false);
  });

  test('with no land, any number of spells from the hand are cast without paying their mana costs, at the timing of their types (CR 118.9, 601.3)', () => {
    const g = ultimate();
    expect(listed(g, 0, 'Grizzly Bears')).toBe(true);
    g.act(0).cast('bear1', { alternative: 'free' });
    g.passAll();
    // The three cards drawn are Islands: a second creature spell to cast.
    const second = g.find({ name: 'Grizzly Bears', zone: 'hand', seat: 0 });
    expect(second).toHaveLength(0);
    g.act(0).cast(X_SPELL, { alternative: 'free' });
    g.passAll();
    expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.zone(X_SPELL, 'graveyard', { seat: 0 });
    // A land is played, not cast: the emblem gives it nothing.
    expect(listed(g, 0, 'Forest')).toBe(false);
    g.expect.invariants();
  });

  test("in an opponent's turn: an instant, cast for free; a creature spell is not, it has no flash (CR 601.3)", () => {
    const g = ultimate(['Lightning Bolt']);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    // Seat 0 gets priority in seat 1's upkeep after seats 1 and 2 pass (CR 117.3d).
    g.act(1).pass();
    g.act(2).pass();
    expect(listed(g, 0, 'Grizzly Bears')).toBe(false);
    expect(listed(g, 0, 'Lightning Bolt')).toBe(true);
    g.act(0).cast('Lightning Bolt', { alternative: 'free', targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('an {X} is 0, and an additional cost is still paid (rulings 2025-01-24, CR 107.3b, 118.9d)', () => {
    const g = ultimate();
    g.act(0).cast(X_SPELL, { alternative: 'free' });
    expect(g.state.pending?.kind).not.toBe('chooseX');
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).cast(TOLL, { alternative: 'free' });
    if (g.state.pending?.kind !== 'priority') g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(TOLL, 'battlefield', { seat: 0 });
  });

  test('the emblem is yours: an opponent casts nothing for free', () => {
    const g = ultimate([]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    expect(listed(g, 1, 'Grizzly Bears')).toBe(false);
  });

  test('the same words on a permanent (Omniscience) are read, and other wordings are not', () => {
    const read = (text: string) =>
      importCard(
        syntheticCard({ name: 'SYNTHETIC Not Read', typeLine: 'Enchantment', oracleText: text }),
        undefined,
        NO_OVERRIDES,
      ).support.status;
    expect(read('You may cast spells from your hand without paying their mana costs.')).toBe(
      'supported',
    );
    expect(read('You may cast spells from your graveyard without paying their mana costs.')).toBe(
      'unsupported',
    );
    expect(
      read('You may cast creature spells from your hand without paying their mana costs.'),
    ).toBe('unsupported');
  });
});

describe('Tamiyo, Field Researcher (real text)', () => {
  test('the whole card reads as supported and is valid', () => {
    const card = GOLDEN_CARD();
    expect(validateCard(card)).toEqual([]);
    expect(card.faces[0]?.abilities).toHaveLength(3);
  });
});

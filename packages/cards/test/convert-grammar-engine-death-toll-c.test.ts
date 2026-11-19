// Death Toll deck, group C (Mulch, Wrenn and Seven, Professor Onyx, Ob Nixilis Reignited, Grist, the Hunger Tide): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from
// the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are
// what the engine runs. Pins: CR 701.20a (reveal), 608.2c, 608.2d (instructions and choices), 101.4 (several players asked in turn order), 114 (emblems), 604.3, 613.1d, 613.4a (a
// characteristic-defining ability that works in every zone but the battlefield), 606 (loyalty abilities). The rulings of Scryfall for these cards are in the PR description (unverified here).
// The near misses of each new phrase are the `rejects` of the rule (`parser-registry.test.ts`); the lines the parser must still refuse are below.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const mulch = real('Mulch');
const wrenn = real('Wrenn and Seven');
const onyx = real('Professor Onyx');
const ob = real('Ob Nixilis Reignited');
const grist = real('Grist, the Hunger Tide');

/** A SYNTHETIC creature card with the creature type Insect, the one thing no fixture card in the engine is. */
const beetle = importCard(
  syntheticCard({
    name: 'SYNTHETIC Beetle',
    typeLine: 'Creature — Insect',
    manaCost: '{G}',
    power: '1',
    toughness: '1',
    colors: ['G'],
  }),
  undefined,
  NO_OVERRIDES,
).definition;

const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('every card is valid', () => {
  test.each([mulch, wrenn, onyx, ob, grist])('$name passes validateCard', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Mulch', () => {
  const board = () =>
    scenario()
      .define(mulch)
      .seat(0)
      .hand(mulch.name)
      .library('Plains', { label: 'a' })
      .library('Grizzly Bears', { label: 'b' })
      .library('Forest', { label: 'c' })
      .library('Giant Spider', { label: 'd' })
      .library('Island', { label: 'e' })
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the top four are revealed, the lands go to the hand and the rest to the graveyard', () => {
    expect(mulch.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 4,
      revealAll: true,
      take: { filter: { types: ['land'] }, max: 1, to: 'hand', all: true },
      rest: 'graveyard',
    });
    const g = board();
    g.act(0).cast(mulch.name, { pay: true });
    g.passAll();
    // CR 701.20a: no question, every land goes; the fifth card is untouched.
    g.expect.zone('Plains', 'hand', { seat: 0, count: 1 });
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('a library of fewer than four cards reveals what it has', () => {
    const g = scenario()
      .define(mulch)
      .seat(0)
      .hand(mulch.name)
      .library('Plains', 'Grizzly Bears')
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(mulch.name, { pay: true });
    g.passAll();
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe('Wrenn and Seven', () => {
  const WRENN = wrenn.name;
  const board = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .define(wrenn)
        .seat(0)
        .library('Plains', { label: 'a' })
        .library('Grizzly Bears', { label: 'b' })
        .library('Forest', { label: 'c' })
        .library('Giant Spider', { label: 'd' })
        .library(...LIBRARY)
        .battlefield(WRENN)
        .battlefield('Forest', 'Forest')
        .seat(1)
        .library(...LIBRARY),
    )
      .seat(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('+1: the Mulch instruction', () => {
    const g = board();
    g.act(0).activate(WRENN, { ability: 0 });
    g.passAll();
    g.expect.counters(WRENN, { loyalty: 6 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
  });

  test('0: any number of land cards from the hand onto the battlefield tapped, and not the others', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand('Island', { label: 'i' })
        .hand('Swamp', { label: 's' })
        .hand('Grizzly Bears', { label: 'bears' })
        .hand('Mountain', { label: 'm' }),
    );
    g.act(0).activate(WRENN, { ability: 1 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('i', 's');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('i', true);
    g.expect.tapped('s', true);
    g.expect.zone('Mountain', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.counters(WRENN, { loyalty: 5 });
    g.expect.invariants();
  });

  test('0: a hand with no land asks nothing, and the player may choose none', () => {
    const none = board((b) => b.seat(0).hand('Grizzly Bears'));
    none.act(0).activate(WRENN, { ability: 1 });
    none.passAll();
    expect(none.state.pending?.kind).toBe('priority');
    none.expect.zone('Grizzly Bears', 'hand', { seat: 0 });

    const some = board((b) => b.seat(0).hand('Island'));
    some.act(0).activate(WRENN, { ability: 1 });
    some.passAll();
    some.act(0).chooseCards();
    some.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('-3: a green Treefolk with reach whose power and toughness are the lands you control, now and as that changes', () => {
    const g = board((b) => b.seat(0).hand('Plains', { label: 'land' }));
    g.act(0).activate(WRENN, { ability: 2 });
    g.passAll();
    g.expect.counters(WRENN, { loyalty: 2 });
    g.expect.derived('Treefolk', {
      types: ['creature'],
      subtypes: ['Treefolk'],
      colors: ['G'],
      keywords: ['reach'],
    });
    // Two Forests are the lands the controller has: it is 2/2, and a third land makes it 3/3 (CR 604.3, 613.4a: layer 7a, read as the board is).
    g.expect.pt('Treefolk', 2, 2);
    g.act(0).playLand('land');
    g.expect.pt('Treefolk', 3, 3);
  });
});

describe('Professor Onyx', () => {
  const ONYX = onyx.name;
  const board = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
    loyalty = 5,
  ) =>
    extra(
      scenario()
        .define(onyx)
        .seat(0)
        .library('Grizzly Bears', { label: 'a' })
        .library('Giant Spider', { label: 'b' })
        .library('Serra Angel', { label: 'c' })
        .library(...LIBRARY)
        .battlefield(ONYX, { counters: { loyalty } })
        .seat(1)
        .library(...LIBRARY),
    )
      .seat(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('+1: lose 1 life, look at the top three, one into the hand and the rest into the graveyard', () => {
    const g = board();
    g.act(0).activate(ONYX, { ability: 1 });
    g.passAll();
    g.expect.life(0, 39);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('c');
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.counters(ONYX, { loyalty: 6 });
  });

  test('-3: each opponent sacrifices a creature with the greatest power among those they control', () => {
    const g = board((b) =>
      b
        .seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield('Serra Angel', { label: 'angel' })
        .battlefield('Giant Spider', { label: 'spider' }),
    );
    g.act(0).activate(ONYX, { ability: 2 });
    g.passAll();
    // The only one with the greatest power (4) is the Angel: nothing to choose.
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.counters(ONYX, { loyalty: 2 });
  });

  test('-3: several tied for the greatest power are the choice of the opponent, and a smaller one cannot be chosen', () => {
    const g = board((b) =>
      b
        .seat(1)
        .battlefield('Serra Angel', { label: 'angel1' })
        .battlefield('Serra Angel', { label: 'angel2' })
        .battlefield('Grizzly Bears', { label: 'bears' }),
    );
    g.act(0).activate(ONYX, { ability: 2 });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    const pending = g.state.pending;
    const legal = pending?.kind === 'choosePermanent' ? pending.legal : [];
    expect([...legal].sort()).toEqual([g.id('angel1'), g.id('angel2')].sort());
    g.act(1).choosePermanents('angel2');
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1, count: 1 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1, count: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
  });

  test('-8: an opponent with no card in hand loses 3 life seven times (the ruling: none to discard is a "no")', () => {
    const g = board((b) => b.seat(1).life(40), 8);
    g.act(0).activate(ONYX, { ability: 3 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40 - 7 * 3);
    g.expect.zone(ONYX, 'graveyard', { seat: 0 });
  });

  test('-8: each time the opponent may discard a card instead of losing 3 life, and may decline', () => {
    const g = board((b) => b.seat(1).life(40).hand('Island', 'Swamp'), 8);
    g.act(0).activate(ONYX, { ability: 3 });
    g.passAll();
    // 1st: discard Island (two cards: the player chooses). 2nd: decline (lose 3). 3rd: discard Swamp (the only card: nothing to choose). Then the hand is empty: four more times
    // 3 life with no question.
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).chooseCards('Island');
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 37);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 37 - 4 * 3);
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone('Swamp', 'graveyard', { seat: 1 });
  });
});

describe('Ob Nixilis Reignited', () => {
  const OB = ob.name;
  test('-8: the target opponent gets an emblem, and loses 2 life whenever a player draws a card, themselves included', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OB, { counters: { loyalty: 8 } })
      .seat(1)
      .library(...LIBRARY)
      .life(40)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(OB, { ability: 2, targets: [{ player: 1 }] });
    g.passAll();
    expect(g.state.seats[1]?.command.length).toBe(1);
    expect(g.state.seats[0]?.command.length).toBe(0);
    g.expect.life(1, 40);
    // The first ability of a second planeswalker is not at hand: another draw does it. Ob's own +1 cannot be used again (it is in the graveyard), so a draw comes from the turn.
    g.advanceTo('draw', { turn: 'next' });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('the emblem belongs to the opponent: "you" in it is that player, so the player who made it does not lose life', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OB, { counters: { loyalty: 8 } })
      .seat(1)
      .library(...LIBRARY)
      .life(40)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const life = g.state.seats[0]?.life;
    g.act(0).activate(OB, { ability: 2, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(0, life ?? 0);
    const emblem = g.state.seats[1]?.command[0];
    expect(emblem === undefined ? undefined : g.state.objects[emblem]?.controller).toBe(1);
  });
});

describe('Grist, the Hunger Tide', () => {
  const GRIST = grist.name;
  const board = (library: readonly string[]) => {
    const b = scenario().define(grist).define(beetle).seat(0);
    for (const card of library) b.library(card);
    return b
      .battlefield(GRIST)
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .seat(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };
  const insects = (g: ReturnType<typeof board>) =>
    Object.values(g.state.objects).filter(
      (o) =>
        o.token !== null && o.zone === 'battlefield' && o.token.characteristics.name === 'Insect',
    ).length;

  test('static: off the battlefield it is a 1/1 Insect creature in addition to its other types, on the battlefield it is only a planeswalker', () => {
    const g = scenario()
      .define(grist)
      .seat(0)
      .hand(grist.name, { label: 'inHand' })
      .graveyard(grist.name, { label: 'inYard' })
      .library(grist.name, { label: 'inLibrary' })
      .battlefield(grist.name, { label: 'onField' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    for (const where of ['inHand', 'inYard', 'inLibrary']) {
      g.expect.derived(where, {
        types: ['planeswalker', 'creature'],
        supertypes: ['legendary'],
        subtypes: ['Grist', 'Insect'],
      });
      g.expect.pt(where, 1, 1);
    }
    g.expect.derived('onField', {
      types: ['planeswalker'],
      supertypes: ['legendary'],
      subtypes: ['Grist'],
    });
  });

  test('+1: a token and a mill; no Insect milled stops it', () => {
    const g = board(['Plains', 'Plains']);
    g.act(0).activate(GRIST, { ability: 1 });
    g.passAll();
    expect(insects(g)).toBe(1);
    g.expect.counters(GRIST, { loyalty: 4 });
    g.expect.zone('Plains', 'graveyard', { seat: 0, count: 1 });
  });

  test('+1: an Insect card milled puts a loyalty counter on it and repeats, once more for each, until a card that is not one', () => {
    const g = board([beetle.name, beetle.name, 'Plains', 'Giant Spider']);
    g.act(0).activate(GRIST, { ability: 1 });
    g.passAll();
    // 3 passes: Beetle (counter), Beetle (counter), Plains (stop). Loyalty 3 + 1 (cost) + 2.
    expect(insects(g)).toBe(3);
    g.expect.counters(GRIST, { loyalty: 6 });
    g.expect.zone(beetle.name, 'graveyard', { seat: 0, count: 2 });
    g.expect.zone('Plains', 'graveyard', { seat: 0, count: 1 });
    g.expect.zone('Giant Spider', 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('+1: an empty library mills nothing, so it ends there', () => {
    const g = board([]);
    g.act(0).activate(GRIST, { ability: 1 });
    g.passAll();
    expect(insects(g)).toBe(1);
    g.expect.counters(GRIST, { loyalty: 4 });
  });

  test('-5: each opponent loses life equal to the creature cards in the graveyard, any Grist in it included (the ruling)', () => {
    const g = scenario()
      .define(grist)
      .define(beetle)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(grist.name, { label: 'bf', counters: { loyalty: 5 } })
      .graveyard(grist.name)
      .graveyard(beetle.name)
      .graveyard('Grizzly Bears')
      .graveyard('Island')
      .seat(1)
      .library(...LIBRARY)
      .life(40)
      .seat(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate('bf', { ability: 3 });
    g.passAll();
    // Four creature cards: the Grist that was there, the Grist that paid its last loyalty (it is a graveyard card when the ability resolves), the Beetle and the Bears.
    g.expect.life(1, 36);
  });
});

describe('lines that are not read', () => {
  const walker = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Walker',
        typeLine: 'Legendary Planeswalker — Test',
        manaCost: '{3}',
        loyalty: '4',
        oracleText: text,
      }),
    ).support.status;
  const spell = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Spell',
        typeLine: 'Sorcery',
        manaCost: '{1}',
        oracleText: text,
      }),
    ).support.status;

  test('the same shapes with the real words are supported (the near misses below change one thing each)', () => {
    expect(
      spell(
        'Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard.',
      ),
    ).toBe('supported');
    expect(
      walker(
        "+1: Each opponent may discard a card. If they don't, they lose 3 life. Repeat this process six more times.",
      ),
    ).toBe('supported');
    expect(
      walker(
        '+1: Mill a card. If an Insect card was milled this way, put a loyalty counter on ~ and repeat this process.',
      ),
    ).toBe('supported');
    expect(
      walker(
        '-1: Target opponent gets an emblem with "Whenever a player draws a card, you lose 2 life."',
      ),
    ).toBe('supported');
  });

  test.each([
    // "all" put into the hand without the rest in the graveyard, or the rest elsewhere
    'Reveal the top four cards of your library. Put all land cards revealed this way into your hand.',
    'Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest on the bottom of your library.',
    // a number that is not a count
    'Reveal the top X cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard.',
    // a repeat that never ends: nothing says when to stop, so it is not read
    'Mill a card. Repeat this process.',
  ])('a spell is not supported: %s', (text) => {
    expect(spell(text)).not.toBe('supported');
  });

  test.each([
    // the repeat with no test would never end
    '+1: Create a 1/1 green Insect creature token, then mill a card. Repeat this process.',
    // the test is about the cards milled, so the process must end in a mill
    '+1: Create a 1/1 green Insect creature token. If you control three or more creatures, put a loyalty counter on ~ and repeat this process.',
    // "you" in the sentence of "if they don't" is the controller, which the engine would read as the player asked
    "+1: Each opponent may discard a card. If they don't, you lose 3 life.",
    // an emblem for a player the effect does not name
    '-1: Each opponent gets an emblem with "Creatures you control get +1/+1."',
  ])('a loyalty ability is not supported: %s', (text) => {
    expect(walker(text)).not.toBe('supported');
  });
});

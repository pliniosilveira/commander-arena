// Two instructions that reveal cards and decide from them (the Elven Council deck, group "reveal"), read by the grammar and run by the engine: Genesis Wave ("Reveal the top X cards of
// your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the
// battlefield into your graveyard.") and Gandalf, Westward Voyager ("Whenever you cast a spell with mana value 5 or greater, each opponent reveals the top card of their library. If any
// of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card.").
// Pins: CR 701.20a (Reveal: shown to every player, the cards stay in the library until they move), CR 107.3a and 202.3 (the X announced is both the number of cards and the mana value
// limit), CR 110.2a (permanents enter under the controller's control), CR 404.1 (the rest go to the graveyard), CR 205.2a (card types), CR 707.10 (a copy of a spell), CR 101.4 (each
// opponent, in turn order, with three and four seats). The first block parses the REAL Oracle text from the golden corpus, whole; the rest are SYNTHETIC cards whose abilities are the
// real lines (names replaced by ~), run through `applyAction` with the scenario DSL. Every synthetic name starts with "SYNTHETIC".
import { readFileSync } from 'node:fs';
import { type GameEvent, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

/** The names of the cards a seat has in a zone, top or first first. */
function names(g: ScenarioGame, zone: 'hand' | 'graveyard' | 'library', seat = 0): string[] {
  return (g.state.seats[seat]?.[zone] ?? []).map((id) => {
    const obj = g.state.objects[id];
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
  });
}
const cardNames = names;

const revealed = (events: readonly GameEvent[]) =>
  events.filter(
    (e): e is Extract<GameEvent, { kind: 'cardsRevealed' }> => e.kind === 'cardsRevealed',
  );

describe('the real cards, whole', () => {
  test.each(['Genesis Wave', 'Gandalf, Westward Voyager'])('%s is supported', (name) => {
    const imported = real(name);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
  });

  test('Genesis Wave: a reveal of the top X, any number of permanents with mana value X or less, the rest into the graveyard', () => {
    expect(real('Genesis Wave').definition.faces[0]?.spell).toMatchObject({
      x: true,
      effect: {
        kind: 'lookAtTop',
        count: { kind: 'x' },
        revealAll: true,
        take: { max: 1, to: 'battlefield', any: true, manaValueAtMost: { kind: 'x' } },
        rest: 'graveyard',
      },
    });
  });

  test('Gandalf: the cast trigger reveals the top of each opponent, then copies or draws', () => {
    expect(real('Gandalf, Westward Voyager').definition.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        by: 'you',
        filter: { manaValue: { cmp: 'atLeast', value: 5 } },
      },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'revealTopCard', player: { kind: 'eachOpponent' } },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { sharesCardTypeWith: 'triggerSubject' },
              any: true,
            },
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
                { kind: 'draw', player: { kind: 'eachOpponent' }, count: 1 },
              ],
            },
            else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      },
    });
  });
});

describe('lines that are not read', () => {
  const WAVE =
    "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.";
  const spell = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Sorcery',
        manaCost: '{X}{G}{G}{G}',
        oracleText: text,
      }),
    ).support.status;
  const creature = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Creature — Avatar Wizard',
        manaCost: '{3}{G}{U}',
        power: '5',
        toughness: '5',
        oracleText: text.replaceAll('~', 'SYNTHETIC Parsed Refused'),
      }),
    ).support.status;
  const GANDALF =
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card.';

  test('the same shapes with the real words are supported (the near misses below change one thing each)', () => {
    expect(spell(WAVE)).toBe('supported');
    expect(creature(`Whenever you cast a spell with mana value 5 or greater, ${GANDALF}`)).toBe(
      'supported',
    );
  });

  test.each([
    // a limit that is not the X of the cards revealed
    WAVE.replace('mana value X or less', 'mana value 3 or less'),
    // another kind of card, a bounded number, another place
    WAVE.replace('permanent cards', 'creature cards'),
    WAVE.replace('any number of', 'up to two'),
    WAVE.replace('onto the battlefield.', 'into your hand.'),
    // the rest does not go to the graveyard
    WAVE.replace('into your graveyard', 'on the bottom of your library'),
    // the last sentence is missing
    WAVE.replace(/ Then put all cards[^.]*\./u, ''),
  ])('Genesis Wave shape is not supported: %s', (text) => {
    expect(spell(text)).not.toBe('supported');
  });

  test.each([
    GANDALF.replace('each opponent reveals', 'each player reveals'),
    GANDALF.replace('each opponent reveals', 'target opponent reveals'),
    GANDALF.replace('the top card', 'the top two cards'),
    GANDALF.replace('any of those cards shares', 'all of those cards share'),
    GANDALF.replace('card type', 'creature type'),
    GANDALF.replace(', you may choose new targets for the copy', ''),
    GANDALF.replace('Otherwise, you draw a card.', 'Otherwise, you draw two cards.'),
    GANDALF.replace('Otherwise, you draw a card.', 'Otherwise, each opponent draws a card.'),
    GANDALF.replace(' Otherwise, you draw a card.', ''),
  ])('Gandalf shape is not supported: %s', (text) => {
    expect(creature(`Whenever you cast a spell with mana value 5 or greater, ${text}`)).not.toBe(
      'supported',
    );
  });

  test('"that spell" and the copy need a trigger about a cast spell: the same words after an enters trigger are not supported', () => {
    expect(creature(`When ~ enters, ${GANDALF}`)).not.toBe('supported');
  });
});

describe('the engine runs what the grammar lowered: Genesis Wave', () => {
  const WAVE = parsed(
    'SYNTHETIC Parsed Wave',
    'Sorcery',
    "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard.",
    { manaCost: '{X}{G}{G}{G}', colors: ['G'] },
  );

  /** Seat 0 holds the wave and has plenty of mana; the top of its library is `top` (first is the top), the cards below are `Swamp` and `Mountain`. */
  const game = (top: readonly string[], below: readonly string[] = ['Swamp', 'Mountain']) => {
    let b = scenario().define(WAVE).seat(0).hand(WAVE.name).pool('GGGCCCCCC');
    for (const [i, name] of top.entries()) b = b.library(name, { label: `t${i}` });
    for (const name of below) b = b.library(name);
    return b
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  const chooseCardsDecision = (g: ScenarioGame) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    return d;
  };

  const TOP = ['Plains', 'Grizzly Bears', 'Sol Ring', 'Serra Angel'];

  test('X = 4 reveals four cards at once; the permanent cards with mana value 4 or less may all be taken, an Angel (5) may not', () => {
    const g = game(TOP);
    const mark = g.mark();
    g.act(0).cast(WAVE.name, { x: 4, pay: true });
    g.passAll();
    const events = g.eventsSince(mark);
    expect(revealed(events)).toHaveLength(1);
    expect(revealed(events)[0]).toMatchObject({ seat: 0, names: TOP, from: 'library' });
    // CR 701.20a: nothing has moved while the player chooses.
    expect(cardNames(g, 'library').slice(0, 4)).toEqual(TOP);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.looked).toEqual(['t0', 't1', 't2', 't3'].map((l) => g.id(l)));
    expect(d.legal).toEqual(['t0', 't1', 't2'].map((l) => g.id(l)));
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    expect(d.prompt).toContain('Reveal the top 4 cards of your library');
  });

  test('any number: all three legal cards go onto the battlefield under my control, the Angel and nothing else goes to the graveyard', () => {
    const g = game(TOP);
    g.act(0).cast(WAVE.name, { x: 4, pay: true });
    g.passAll();
    g.act(0).chooseCards('t0', 't1', 't2');
    for (const name of ['Plains', 'Grizzly Bears', 'Sol Ring']) {
      g.expect.zone(name, 'battlefield', { seat: 0 });
    }
    expect(cardNames(g, 'graveyard').sort()).toEqual(['Serra Angel', WAVE.name].sort());
    // The cards below the revealed ones are untouched.
    expect(cardNames(g, 'library')).toEqual(['Swamp', 'Mountain']);
    g.expect.invariants();
  });

  test('the cards that were not put onto the battlefield go to the graveyard, however few are taken', () => {
    const g = game(TOP);
    g.act(0).cast(WAVE.name, { x: 4, pay: true });
    g.passAll();
    g.act(0).chooseCards('t1');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    expect(cardNames(g, 'graveyard').sort()).toEqual(
      ['Plains', 'Sol Ring', 'Serra Angel', WAVE.name].sort(),
    );
    g.expect.invariants();
  });

  test('"you may": taking none puts every card revealed into the graveyard', () => {
    const g = game(TOP);
    g.act(0).cast(WAVE.name, { x: 4, pay: true });
    g.passAll();
    g.act(0).chooseCards();
    expect(cardNames(g, 'graveyard')).toHaveLength(5);
    expect(cardNames(g, 'library')).toEqual(['Swamp', 'Mountain']);
  });

  test('a card with mana value above X is refused, and so is a card that is not a permanent card', () => {
    const g = game(['Lightning Bolt', 'Serra Angel', 'Grizzly Bears']);
    g.act(0).cast(WAVE.name, { x: 3, pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    // Lightning Bolt is an instant; Serra Angel has mana value 5 > 3; only the Bears can be taken.
    expect(d.legal).toEqual([g.id('t2')]);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [g.id('t1')] }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [g.id('t0')] }).ok).toBe(false);
    g.act(0).chooseCards('t2');
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    expect(cardNames(g, 'graveyard').sort()).toEqual(
      ['Lightning Bolt', 'Serra Angel', WAVE.name].sort(),
    );
  });

  test('no card can be taken: nobody is asked, all go to the graveyard', () => {
    const g = game(['Serra Angel', 'Lightning Bolt']);
    g.act(0).cast(WAVE.name, { x: 2, pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(cardNames(g, 'graveyard').sort()).toEqual(
      ['Lightning Bolt', 'Serra Angel', WAVE.name].sort(),
    );
  });

  test('X = 0 reveals nothing and the library stays as it is', () => {
    const g = game(TOP);
    const mark = g.mark();
    g.act(0).cast(WAVE.name, { x: 0, pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(mark))).toHaveLength(0);
    expect(cardNames(g, 'library').slice(0, 4)).toEqual(TOP);
    expect(cardNames(g, 'graveyard')).toEqual([WAVE.name]);
  });

  test('a library shorter than X: every card in it is revealed', () => {
    const g = game(['Plains', 'Grizzly Bears'], []);
    g.act(0).cast(WAVE.name, { x: 6, pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).looked).toHaveLength(2);
    g.act(0).chooseCards('t0', 't1');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  test('the legal answers include any number of the cards that match', () => {
    const g = game(TOP);
    g.act(0).cast(WAVE.name, { x: 4, pay: true });
    g.passAll();
    const answers = g
      .legalActions(0)
      .filter((a) => a.kind === 'chooseCards')
      .map((a) => (a.kind === 'chooseCards' ? a.objects.length : -1));
    expect(Math.max(...answers)).toBe(3);
    expect(Math.min(...answers)).toBe(0);
  });
});

describe('the engine runs what the grammar lowered: Gandalf', () => {
  const GANDALF = parsed(
    'SYNTHETIC Parsed Gandalf',
    'Legendary Creature — Avatar Wizard',
    'Whenever you cast a spell with mana value 5 or greater, each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card.',
    { manaCost: '{3}{G}{U}', power: '5', toughness: '5', colors: ['G', 'U'] },
  );

  /**
   * A table of `seats` seats; seat 0 controls Gandalf and has Serra Angel (mana value 5, a creature) and Lightning Bolt (mana value 1) in hand. `tops` is the top card of each opponent's
   * library (seat 1 first), `null` for an empty library; below it every library holds two Islands (an opponent with `null` has no library at all), and seat 0's holds two as well.
   */
  const table = (tops: readonly (string | null)[], spellName = 'Serra Angel') => {
    const seats = tops.length + 1;
    let b = scenario({ seats }).define(GANDALF);
    b = b
      .seat(0)
      .battlefield(GANDALF.name)
      .hand(spellName)
      .pool('WWCCCCCR')
      .library('Island', 'Island');
    for (const [i, top] of tops.entries()) {
      b = b.seat(i + 1);
      if (top !== null) b = b.library(top, { label: `top${i + 1}` }).library('Island', 'Island');
    }
    return b.at('precombatMain', { active: 0, turn: seats + 1 }).build();
  };

  const count = (g: ScenarioGame, name: string) =>
    g.view(0).battlefield.filter((o) => o.name === name).length;

  test('is valid and has the cast trigger', () => {
    expect(validateCard(GANDALF)).toEqual([]);
  });

  test('4 seats: one opponent reveals a creature card: the Angel is copied, and every opponent draws, I do not', () => {
    const g = table(['Lightning Bolt', 'Grizzly Bears', 'Forest']);
    const mark = g.mark();
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    // each opponent revealed their own top card, and mine was not revealed
    const shown = revealed(g.eventsSince(mark));
    expect(shown.map((e) => [e.seat, e.names])).toEqual([
      [1, ['Lightning Bolt']],
      [2, ['Grizzly Bears']],
      [3, ['Forest']],
    ]);
    // the copy of a permanent spell becomes a token (CR 707.10f): two Angels
    expect(count(g, 'Serra Angel')).toBe(2);
    // each of the three opponents drew the card that was revealed on top (a card is drawn from the library), I drew nothing
    expect(names(g, 'hand', 1)).toEqual(['Lightning Bolt']);
    expect(names(g, 'hand', 2)).toEqual(['Grizzly Bears']);
    expect(names(g, 'hand', 3)).toEqual(['Forest']);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('3 seats: no revealed card shares a card type with the Angel: I draw a card, no copy, no opponent draws', () => {
    const g = table(['Lightning Bolt', 'Forest']);
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    expect(count(g, 'Serra Angel')).toBe(1);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.handSize(2, 0);
    // the cards revealed stay on top of the libraries
    expect(names(g, 'library', 1)[0]).toBe('Lightning Bolt');
    expect(names(g, 'library', 2)[0]).toBe('Forest');
    g.expect.invariants();
  });

  test('2 seats: the one opponent reveals a creature: copy, and that opponent draws', () => {
    const g = table(['Grizzly Bears']);
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    expect(count(g, 'Serra Angel')).toBe(2);
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('an opponent with no card to reveal reveals nothing: if the others do not match either, I draw', () => {
    const g = table(['Forest', null, 'Lightning Bolt']);
    const mark = g.mark();
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    expect(revealed(g.eventsSince(mark)).map((e) => e.seat)).toEqual([1, 3]);
    expect(count(g, 'Serra Angel')).toBe(1);
    g.expect.handSize(0, 1);
  });

  test('a spell with mana value under 5 does not trigger Gandalf: nobody reveals and nobody draws', () => {
    const bolt = table(['Grizzly Bears', 'Mountain'], 'Lightning Bolt');
    // Lightning Bolt has mana value 1.
    bolt.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    bolt.passAll();
    bolt.expect.handSize(0, 0);
    bolt.expect.handSize(1, 0);
    bolt.expect.handSize(2, 0);
  });

  test('every opponent draws, in turn order, and the one that did not share a type draws too', () => {
    const g = table(['Forest', 'Forest', 'Grizzly Bears']);
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 1);
    g.expect.handSize(3, 1);
    g.expect.handSize(0, 0);
    expect(count(g, 'Serra Angel')).toBe(2);
  });
});

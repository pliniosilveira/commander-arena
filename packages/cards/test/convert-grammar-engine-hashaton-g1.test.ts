// The Hashaton deck (issue 31), group 1 (D-1100 to D-1102): the REAL Oracle text of Faithful Mending, Archon of Cruelty, Archfiend of Ifnir and Psychic Frog (the
// corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 608.2c (a sequence of one player's verbs is followed in
// the order written), CR 701.21a and 701.9 (sacrifice and discard are chosen by the player who does them), CR 702.29a and 702.29d (cycling is discarding;
// "cycles or discards" triggers once for a cycled card), CR 120.2a and 510.2 (combat damage to a player or planeswalker), CR 702.34a (flashback).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Forest');
const BEAR2 = 'SYNTHETIC Vanilla 2/2';
const BEAR3 = 'SYNTHETIC Vanilla 3/3';
const WALKER = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const CYCLER = 'SYNTHETIC Cycling Bear'; // Cycling {2}
const BOLT = 'Lightning Bolt';

describe('Faithful Mending: "You gain 2 life, draw two cards, then discard two cards." (CR 608.2c, 701.9)', () => {
  const mending = real('Faithful Mending');

  test('the card is valid, and an ability list with bare commas is one sequence in order', () => {
    expect(validateCard(mending)).toEqual([]);
    expect(mending.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
        { kind: 'draw', player: { kind: 'you' }, count: 2 },
        { kind: 'discard', player: { kind: 'you' }, count: 2 },
      ],
    });
  });

  const game = () =>
    scenario()
      .define(mending)
      .seat(0)
      .life(20)
      .library('Island', 'Swamp', ...FILLER)
      .hand(mending.name, BOLT)
      .battlefield('Plains', 'Island', 'Plains', 'Island', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('gains 2, draws two, then asks for two discards from the three cards now in hand', () => {
    const g = game();
    g.act(0).cast(mending.name, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.handSize(0, 3);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Island', BOLT);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('flashback {1}{W}{U}: cast again from the graveyard, then exiled', () => {
    const g = game();
    g.act(0).cast(mending.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Island', BOLT);
    g.expect.legal(0, { cast: mending.name, alternative: 'flashback' });
    g.act(0).cast(mending.name, { alternative: 'flashback', pay: true });
    g.passAll();
    g.act(0).chooseCards('Swamp', { name: 'Forest', nth: 0 });
    g.expect.zone(mending.name, 'exile', { seat: 0 });
    g.expect.life(0, 24);
  });
});

describe('Archon of Cruelty: "Whenever ~ enters or attacks, target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life."', () => {
  const archon = real('Archon of Cruelty');
  const ARCHON = archon.name;

  test('the card is valid and has the trigger twice, once for each event', () => {
    expect(validateCard(archon)).toEqual([]);
    const triggers = (archon.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'triggered' ? [a.trigger.kind] : [],
    );
    expect(triggers).toEqual(['entersBattlefield', 'attacks']);
  });

  const game = (theirs: readonly string[], hand: readonly string[] = [BOLT]) =>
    scenario()
      .define(archon)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(ARCHON)
      .battlefield('Swamp', { count: 8 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand(...hand)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('enters: the opponent chooses what to sacrifice, then discards and loses 3 life; I draw and gain 3', () => {
    const g = game([BEAR2, BEAR3]);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(BEAR3);
    g.expect.zone(BEAR3, 'graveyard', { seat: 1 });
    g.expect.zone(BEAR2, 'battlefield', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 23);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('a planeswalker is a permanent the opponent may sacrifice', () => {
    const g = game([WALKER]);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
  });

  test('a land is not a creature or planeswalker: with none of either, only the rest happens', () => {
    const g = game(['Mountain'], []);
    g.act(0).cast(ARCHON, { pay: true });
    g.passAll();
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 23);
    g.expect.handSize(0, 1);
  });

  test('attacks: the same again', () => {
    const g = scenario()
      .define(archon)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(ARCHON)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand(BOLT)
      .battlefield(BEAR2)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(ARCHON);
    g.passAll();
    g.expect.zone(BEAR2, 'graveyard', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 23);
  });
});

describe('Archfiend of Ifnir: "Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control." (CR 702.29a, 702.29d)', () => {
  const fiend = real('Archfiend of Ifnir');
  const FIEND = fiend.name;

  test('the card is valid and reads the trigger as "you discard another card"', () => {
    expect(validateCard(fiend)).toEqual([]);
    const trigger = (fiend.faces[0]?.abilities ?? []).find((a) => a.kind === 'triggered');
    expect(trigger?.kind === 'triggered' ? trigger.trigger : null).toEqual({
      kind: 'discarded',
      who: 'you',
      another: true,
    });
  });

  const game = (hand: readonly string[]) =>
    scenario()
      .define(fiend)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(...hand)
      .battlefield(FIEND)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEAR2, BEAR3)
      .at('precombatMain', { active: 0 })
      .build();

  test('cycling another card: one counter on each creature of the opponent, once, and none on my own', () => {
    const g = game([CYCLER]);
    const mark = g.mark();
    g.act(0).activate(CYCLER, { pay: true });
    g.passAll();
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'cycled')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'abilityTriggered')).toHaveLength(1); // cycled and discarded is one occurrence (CR 702.29d)
    g.expect.counters(BEAR2, { '-1/-1': 1 });
    g.expect.counters(BEAR3, { '-1/-1': 1 });
    g.expect.counters(FIEND, {});
    g.expect.pt(BEAR3, 2, 2);
  });

  test('a discard by an effect counts too: each card discarded is its own trigger', () => {
    const g = scenario()
      .define(fiend)
      .define(real('Faithful Mending'))
      .seat(0)
      .life(20)
      .library('Island', 'Swamp', ...FILLER)
      .hand('Faithful Mending')
      .battlefield(FIEND, 'Plains', 'Island')
      .seat(1)
      .library(...FILLER)
      .battlefield(BEAR3)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Faithful Mending', { pay: true });
    g.passAll();
    // The two cards drawn are the whole hand: both are discarded with no choice, one trigger for each.
    g.passAll();
    g.expect.counters(BEAR3, { '-1/-1': 2 });
  });

  test('the card with the ability is not "another card": Archfiend cycled from the hand triggers nothing', () => {
    const g = scenario()
      .define(fiend)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(FIEND)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEAR3)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(FIEND, { pay: true });
    g.passAll();
    g.expect.counters(BEAR3, {});
    g.expect.zone(FIEND, 'graveyard', { seat: 0 });
  });
});

describe('Psychic Frog: "Whenever this creature deals combat damage to a player or planeswalker, draw a card." and its other abilities (CR 120.2a, 510.2)', () => {
  const frog = real('Psychic Frog');
  const FROG = frog.name;

  test('the card is valid and the trigger is the player-or-planeswalker one', () => {
    expect(validateCard(frog)).toEqual([]);
    const trigger = (frog.faces[0]?.abilities ?? []).find((a) => a.kind === 'triggered');
    expect(trigger?.kind === 'triggered' ? trigger.trigger : null).toEqual({
      kind: 'dealsCombatDamage',
      what: { kind: 'this' },
      to: 'playerOrPlaneswalker',
    });
  });

  function hit(target: string | undefined, theirs: readonly string[], blocker?: string) {
    const g = scenario()
      .define(frog)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(FROG)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    if (target === undefined) g.act(0).attack(FROG);
    else g.act(0).attack(FROG, target);
    g.advanceTo('declareBlockers');
    if (g.state.pending?.kind === 'declareBlockers') {
      g.act(1).declareBlockers(
        blocker === undefined
          ? []
          : [
              {
                blocker: { name: blocker, seat: 1 as const },
                attacker: { name: FROG, seat: 0 as const },
              },
            ],
      );
    }
    g.advanceTo('combatDamage');
    return g;
  }

  test('to a player: draw a card', () => {
    const g = hit(undefined, []);
    g.passAll();
    g.expect.life(1, 19);
    g.expect.handSize(0, 1);
  });

  test('to a planeswalker: draw a card', () => {
    const g = hit(WALKER, [WALKER]);
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 3 });
    g.expect.handSize(0, 1);
  });

  test('to a creature that blocked it: nothing', () => {
    const g = hit(undefined, [BEAR3], BEAR3);
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });

  test('"Discard a card: Put a +1/+1 counter on this creature."', () => {
    const g = scenario()
      .define(frog)
      .seat(0)
      .hand(BOLT)
      .battlefield(FROG)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(FROG);
    g.passAll();
    g.expect.pt(FROG, 2, 3);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('"Exile three cards from your graveyard: This creature gains flying until end of turn."', () => {
    const g = scenario()
      .define(frog)
      .seat(0)
      .graveyard(BOLT, BEAR2, BEAR3)
      .battlefield(FROG)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(FROG, { ability: 2 });
    g.passAll();
    g.expect.derived(FROG, { keywords: ['flying'] });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
  });
});

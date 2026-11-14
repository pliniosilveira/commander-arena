// The Danitha deck (issue 26), group 6 (D-430, D-431): the REAL Oracle text of Kutzil, Malamet Exemplar and Gift of the Viper (the corpus's golden.jsonl, taken from
// the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text
// are what the engine runs. The helper cards are real fixtures. Pins: CR 208.4b (base power ignores counters and effects that only modify power), CR 603.2c (one or more: one trigger),
// CR 101.2 (a cast forbidden by an effect), CR 122.1b (a keyword counter gives the keyword), CR 702.2b (deathtouch), CR 702.17b (reach).
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

const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

describe('Kutzil, Malamet Exemplar', () => {
  const kutzil = real('Kutzil, Malamet Exemplar');
  const KUTZIL = kutzil.name;

  const start = (configure: (b: ReturnType<typeof scenario>) => void = () => undefined) => {
    const b = scenario().define(kutzil);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .battlefield(KUTZIL, { label: 'kutzil' })
      .battlefield(BEARS, { label: 'bears' });
    configure(b);
    b.seat(1)
      .life(20)
      .library(...LIBRARY);
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  test('the card is valid and its two abilities are the engine shapes', () => {
    expect(validateCard(kutzil)).toEqual([]);
    const [cast, damage] = kutzil.faces[0]?.abilities ?? [];
    expect(cast).toMatchObject({ kind: 'static', static: { kind: 'opponentsCantCastOnYourTurn' } });
    expect(damage).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'combatDamageBatch',
        what: { types: ['creature'], controller: 'you', powerAboveBase: true },
        to: 'player',
      },
    });
  });

  test('an unpumped team deals combat damage: no card is drawn', () => {
    const g = start();
    g.playCombat({ attack: ['bears'], until: 'combatDamage' });
    g.expect.stack([]);
    g.expect.life(1, 18);
  });

  test('a creature with a +1/+1 counter is above its base power: one card for the batch', () => {
    const g = start((b) =>
      b.seat(0).battlefield(BEARS, { label: 'pumped', counters: { '+1/+1': 2 } }),
    );
    g.playCombat({ attack: ['bears', 'pumped'], until: 'combatDamage' });
    g.expect.stack([`${KUTZIL} (ability)`]);
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.passAll();
    g.expect.handSize(0, before + 1);
    g.expect.invariants();
  });

  test('Kutzil itself, with no counter, is no creature above its base power: no trigger', () => {
    const g = start();
    g.advanceTo('declareAttackers');
    g.act(0).attack('kutzil');
    g.advanceTo('combatDamage');
    g.expect.stack([]);
  });

  test('your opponents cannot cast spells during your turn, and can during theirs', () => {
    const mine = start((b) => b.seat(1).hand(BOLT).battlefield('Mountain'));
    mine.act(0).pass();
    mine.expect.illegal(1, { cast: BOLT });
    const theirs = scenario()
      .define(kutzil)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(KUTZIL)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    theirs.expect.legal(1, { cast: BOLT });
  });
});

describe('Gift of the Viper', () => {
  const gift = real('Gift of the Viper');
  const GIFT = gift.name;

  const start = () =>
    scenario()
      .define(gift)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(GIFT)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'bears', tapped: true })
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Dust Juggernaut', { label: 'big' })
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  test('the card is valid and its spell is one counter of each kind and an untap', () => {
    expect(validateCard(gift)).toEqual([]);
    expect(gift.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', counter: '+1/+1', count: 1 },
        { kind: 'addCounters', counter: 'reach', count: 1 },
        { kind: 'addCounters', counter: 'deathtouch', count: 1 },
        { kind: 'untap' },
      ],
    });
  });

  test('the creature gets the three counters, is untapped, is a 3/3 with reach and deathtouch', () => {
    const g = start();
    g.act(0).cast(GIFT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.counters('bears', { '+1/+1': 1, reach: 1, deathtouch: 1 });
    g.expect.tapped('bears', false);
    g.expect.pt('bears', 3, 3);
    g.expect.derived('bears', { keywords: ['reach', 'deathtouch'] });
    g.expect.invariants();
  });

  test('the deathtouch counter is the creature’s deathtouch in combat: it kills a larger blocker', () => {
    const g = start();
    g.act(0).cast(GIFT, { targets: ['bears'], pay: true });
    g.passAll();
    g.playCombat({
      attack: ['bears'],
      block: [{ blocker: 'big', attacker: 'bears' }],
      until: 'endOfCombat',
    });
    g.expect.zone('SYNTHETIC Dust Juggernaut', 'graveyard');
  });
});

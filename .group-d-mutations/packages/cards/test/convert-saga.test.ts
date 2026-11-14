// Saga cards through the whole import (stage P8, CR 714): layout `saga`, one enchantment face with the
// subtype Saga, `finalChapter`, and one chapter ability per chapter line. Every card is SYNTHETIC:
// the names say so and the text is written for the test, not copied from a printed card. The
// reminder text is the CR's own description of a Saga (CR 714.3a, 714.4), in the shape Scryfall
// prints it.
import { type CardDefinition, checkInvariants, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard, type StoredCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const REMINDER =
  '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)';

function saga(name: string, oracleText: string, extra: Partial<StoredCard> = {}): StoredCard {
  return syntheticCard(
    { name, manaCost: '{2}{W}', typeLine: 'Enchantment — Saga', oracleText, colors: ['W'] },
    { layout: 'saga', colorIdentity: ['W'], cmc: 3, ...extra },
  );
}

const importIt = (card: StoredCard) => importCard(card, undefined, NO_OVERRIDES);

const THREE = saga(
  'SYNTHETIC Rite of Three',
  `${REMINDER}\nI — You gain 2 life.\nII — Draw a card.\nIII — Create a 1/1 white Soldier creature token.`,
);
const TWO = saga(
  'SYNTHETIC Echo Verse',
  '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI, II — You gain 1 life.',
);

describe('a three-chapter Saga', () => {
  const imported = importIt(THREE);

  test('is supported, with nothing dropped and no reason', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test('is a saga layout with one enchantment Saga face and its final chapter', () => {
    const def = imported.definition;
    expect(def.layout).toBe('saga');
    expect(def.faces).toHaveLength(1);
    const face = def.faces[0];
    expect(face?.types).toEqual(['enchantment']);
    expect(face?.subtypes).toEqual(['Saga']);
    expect(face?.finalChapter).toBe(3);
  });

  test('has one chapter ability per chapter line, in order, and nothing else', () => {
    const abilities = imported.definition.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind === 'triggered' && a.trigger)).toEqual([
      { kind: 'chapter', from: 1, to: 1 },
      { kind: 'chapter', from: 2, to: 2 },
      { kind: 'chapter', from: 3, to: 3 },
    ]);
    expect(abilities.map((a) => a.kind === 'triggered' && a.effect.kind)).toEqual([
      'gainLife',
      'draw',
      'createToken',
    ]);
  });

  test('passes the engine validation', () => {
    expect(validateCard(imported.definition)).toEqual([]);
  });
});

describe('an "I, II" Saga', () => {
  const imported = importIt(TWO);

  test('is one chapter ability over the range 1 to 2, with final chapter 2', () => {
    expect(imported.support.status).toBe('supported');
    const face = imported.definition.faces[0];
    expect(face?.finalChapter).toBe(2);
    expect(face?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'chapter', from: 1, to: 2 },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
    expect(validateCard(imported.definition)).toEqual([]);
  });
});

describe('"this Saga" is the card itself', () => {
  test('a chapter that puts a counter on this Saga puts it on `this`', () => {
    const imported = importIt(
      saga(
        'SYNTHETIC Growing Tale',
        'I — Put a +1/+1 counter on this Saga.\nII — You gain 1 life.',
      ),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(JSON.stringify(imported.definition.faces[0]?.abilities[0])).toContain('"kind":"this"');
  });
});

describe('a Saga that is not supported says why', () => {
  test('a gap between chapters (I and III, no II) names the missing chapter', () => {
    const imported = importIt(
      saga('SYNTHETIC Gap Tale', 'I — You gain 1 life.\nIII — Draw a card.'),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons.join('\n')).toContain('chapter 2 has no chapter ability');
    expect(imported.definition.faces[0]?.finalChapter).toBe(3);
  });

  test('a chapter written twice names the repeated chapter', () => {
    const imported = importIt(
      saga(
        'SYNTHETIC Twice Tale',
        'I, II — You gain 1 life.\nII — Draw a card.\nIII — You gain 3 life.',
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain(
      'chapter 2 has more than one chapter ability',
    );
  });

  test('a list that skips a number ("I, III") is recognised and not run', () => {
    const imported = importIt(
      saga('SYNTHETIC Skip Tale', 'I, III — You gain 1 life.\nII — Draw a card.'),
    );
    expect(imported.support.status).toBe('unsupported');
    const [dropped] = imported.support.unparsed;
    expect(dropped).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'trigger.chapter',
      text: 'I, III — You gain 1 life.',
    });
    // The dropped line is the only cause: the engine does not also blame the missing chapters.
    expect(imported.support.reasons).toEqual([]);
    expect(imported.definition.faces[0]?.finalChapter).toBe(3);
  });

  test('a chapter whose effect does not parse is dropped and the card is unsupported', () => {
    const imported = importIt(
      saga(
        'SYNTHETIC Odd Tale',
        'I — You gain 1 life.\nII — Frobnicate the widgets.\nIII — Draw a card.',
      ),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed).toHaveLength(1);
    expect(imported.support.unparsed[0]).toMatchObject({
      text: 'II — Frobnicate the widgets.',
      reason: 'unrecognised',
      slot: 'effect',
      stoppedAt: 'Frobnicate the widgets.',
    });
    // The dropped chapter is not half-executed, and is not blamed twice.
    expect(imported.definition.faces[0]?.abilities).toHaveLength(2);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.definition.support).toBe('unsupported');
  });

  test('a chapter that targets is run (a triggered ability with a target, D-089)', () => {
    const imported = importIt(
      saga('SYNTHETIC Aim Tale', 'I — Destroy target creature.\nII — You gain 1 life.'),
    );
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      targets: [{ id: 't1' }],
    });
  });

  test('Read ahead is a keyword of the engine since D-151 and is read (stage P34)', () => {
    const imported = importIt(
      saga(
        'SYNTHETIC Early Tale',
        'Read ahead (Choose a chapter and start with that many lore counters. Skipped chapters do not trigger.)\nI — You gain 1 life.\nII — Draw a card.',
      ),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.definition.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'readAhead' },
    });
  });

  test('a Saga with no chapter line has no final chapter and is unsupported', () => {
    const imported = importIt(saga('SYNTHETIC Blank Tale', 'Flying'));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.definition.faces[0]?.finalChapter).toBeUndefined();
  });

  test('chapter lines on a card that is not a Saga stay unsupported', () => {
    const imported = importIt(
      syntheticCard({
        name: 'SYNTHETIC Not A Saga',
        manaCost: '{2}{W}',
        typeLine: 'Enchantment',
        oracleText: 'I — You gain 1 life.',
        colors: ['W'],
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('only a Saga');
  });
});

describe('a Saga creature keeps its other abilities', () => {
  test('a line without a numeral is an ordinary ability next to the chapters', () => {
    const imported = importIt(
      syntheticCard(
        {
          name: 'SYNTHETIC Storm Herald',
          manaCost: '{2}{W}',
          typeLine: 'Enchantment Creature — Saga Bird',
          oracleText: 'I — You gain 1 life.\nII — Draw a card.\nFlying',
          power: '2',
          toughness: '2',
          colors: ['W'],
        },
        { layout: 'saga', colorIdentity: ['W'] },
      ),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    const face = imported.definition.faces[0];
    expect(face?.types).toEqual(['enchantment', 'creature']);
    expect(face?.finalChapter).toBe(2);
    expect(face?.abilities.map((a) => a.kind)).toEqual(['triggered', 'triggered', 'keyword']);
  });
});

/** The parsed Saga played in the engine: the chapters happen on the turns the CR says (CR 714.3). */
describe('a parsed Saga runs in the engine', () => {
  const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

  function parsed(card: StoredCard): CardDefinition {
    const imported = importIt(card);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    return imported.definition;
  }

  const resolveTop = (g: { pass(): unknown }) => {
    g.pass();
    g.pass();
  };

  test('all three chapters in order over three of its controller turns, then it is sacrificed', () => {
    const def = parsed(
      saga(
        'SYNTHETIC Parsed Run Tale',
        `${REMINDER}\nI — You gain 1 life.\nII — You gain 2 life.\nIII — You gain 4 life.`,
      ),
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .pool('CCW')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(def.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 41);
    g.expect.counters(def.name, { lore: 1 });
    g.advanceTo('precombatMain', { turn: 5 });
    resolveTop(g);
    g.expect.life(0, 43);
    g.advanceTo('precombatMain', { turn: 7 });
    g.expect.zone(def.name, 'battlefield', { seat: 0 });
    resolveTop(g);
    g.expect.life(0, 47);
    g.expect.zone(def.name, 'graveyard', { seat: 0 });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('"I, II" gives its one effect twice, on chapter I and on chapter II', () => {
    const def = parsed(
      saga('SYNTHETIC Parsed Echo Verse', 'I, II — You gain 1 life.\nIII — You gain 5 life.'),
    );
    const g = scenario()
      .define(def)
      .seat(0)
      .hand(def.name)
      .pool('CCW')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(def.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 41);
    g.advanceTo('precombatMain', { turn: 5 });
    resolveTop(g);
    g.expect.life(0, 42);
    g.advanceTo('precombatMain', { turn: 7 });
    resolveTop(g);
    g.expect.life(0, 47);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

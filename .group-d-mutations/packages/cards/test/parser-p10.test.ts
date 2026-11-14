// Stage P10 (M6): the library effects the engine runs since D-091 and D-093: scry, surveil, "look at
// the top N cards of your library, then put them back in any order" and "put N cards from your hand
// on top of your library in any order". Each line is read through the whole pipeline and compared
// with the engine AST written out here, and each near miss says where it stops. The lines are the
// real example lines of reports/template-replay.md and reports/backlog.md (the owner's run) or say
// SYNTHETIC; no real card is marked supported here. That the engine runs what is lowered is in
// convert-grammar-engine-p10.test.ts.
import type { Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine, DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, readAll, SET, spellEffect } from './parser-p5-helpers';

const draw = (count: number): Effect => ({ kind: 'draw', player: { kind: 'you' }, count });

describe('scry (CR 701.22a)', () => {
  test.each([
    ['Scry 1.', { kind: 'scry', count: 1 }],
    ['Scry 2.', { kind: 'scry', count: 2 }],
    ['Scry two.', { kind: 'scry', count: 2 }],
    ['Scry 0.', { kind: 'scry', count: 0 }],
    ['You scry 3.', { kind: 'scry', count: 3 }],
  ] as const)('%s', (text, effect) => {
    expect(spellEffect(text)).toEqual(effect);
  });

  test('it joins the other effects of a sentence like any player effect', () => {
    expect(spellEffect('Draw a card, then scry 1.')).toEqual({
      kind: 'sequence',
      effects: [draw(1), { kind: 'scry', count: 1 }],
    });
    // The replay's "Scry 2, then draw a card." and "Scry 2, then draw two cards. You lose 2 life."
    expect(spellEffect('Scry 2, then draw a card.')).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'scry', count: 2 }, draw(1)],
    });
    expect(spellEffect('Scry 2, then draw two cards. You lose 2 life.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'scry', count: 2 },
        draw(2),
        { kind: 'loseLife', player: { kind: 'you' }, amount: 2 },
      ],
    });
    expect(spellEffect('Scry 1 and draw a card.')).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'scry', count: 1 }, draw(1)],
    });
    expect(spellEffect('You draw a card, then scry 1.')).toEqual({
      kind: 'sequence',
      effects: [draw(1), { kind: 'scry', count: 1 }],
    });
  });

  test('in a trigger, "you may" makes the whole ability optional (CR 603.5)', () => {
    const [enters] = readAll('When ~ enters, scry 1.', 'creature').abilities;
    expect(enters).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'scry', count: 1 },
    });
    const [may] = readAll('When ~ enters, you may scry 1.', 'creature').abilities;
    expect(may).toMatchObject({ kind: 'triggered', optional: true, effect: { kind: 'scry' } });
  });

  test.each([
    ['At the beginning of your upkeep, scry 1.', { kind: 'upkeep', whose: 'you' }],
    ['When ~ dies, scry 2.', { kind: 'dies', what: { kind: 'this' } }],
  ] as const)('%s', (text, trigger) => {
    const [ability] = readAll(text, 'creature').abilities;
    expect(ability).toMatchObject({ kind: 'triggered', trigger });
  });

  test('in an activated ability, after any cost', () => {
    const [blue] = readAll('{2}{U}{U}, {T}: Scry 2.', 'creature').abilities;
    expect(blue).toEqual({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['2', 'U', 'U'] }, { kind: 'tap' }],
      effect: { kind: 'scry', count: 2 },
    });
    const [sac] = readAll('Sacrifice a creature: Scry 1.', 'creature').abilities;
    expect(sac).toMatchObject({ kind: 'activated', effect: { kind: 'scry', count: 1 } });
  });

  test.each([
    ['Scry Y.', 'Y.', 'effect.scry'],
    ['Scry a card.', 'a card.', 'effect.scry'],
    ['Scry.', 'Scry.', 'none'],
    ['Target player scries 2.', 'scries 2.', 'effect.player'],
    ['Each player scries 1.', 'scries 1.', 'effect.player'],
    ['Target opponent scries 2.', 'scries 2.', 'effect.player'],
    ['You may scry 1.', 'may scry 1.', 'effect.player'],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
  });

  test('an optional scry of a spell is not read: the engine has no "may" on spell effects', () => {
    expect(dropped('You may scry 1.', 'sorcery')).toMatchObject({ reason: 'unrecognised' });
    expect(dropped('Draw a card, then you may scry 1.', 'sorcery')).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('surveil (CR 701.25a)', () => {
  test.each([
    ['Surveil 1.', { kind: 'surveil', count: 1 }],
    ['Surveil 2.', { kind: 'surveil', count: 2 }],
    ['You surveil 1.', { kind: 'surveil', count: 1 }],
  ] as const)('%s', (text, effect) => {
    expect(spellEffect(text)).toEqual(effect);
  });

  test('it joins other effects, and the scry and surveil of one line keep their order', () => {
    expect(spellEffect('Surveil 1, then draw a card.')).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'surveil', count: 1 }, draw(1)],
    });
    expect(spellEffect('Scry 1, then surveil 1.')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'scry', count: 1 },
        { kind: 'surveil', count: 1 },
      ],
    });
  });

  test('the replay shapes: enters, an activated ability and a bare spell', () => {
    expect(readAll('When ~ enters, surveil 1.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'surveil', count: 1 },
      },
    ]);
    expect(readAll('{3}{G}, {T}: Surveil 2.', 'creature').abilities).toMatchObject([
      { kind: 'activated', effect: { kind: 'surveil', count: 2 } },
    ]);
  });

  test.each([
    ['Surveil Y.', 'Y.', 'effect.surveil'],
    ['Each opponent surveils 1.', 'surveils 1.', 'effect.player'],
    ['Target player surveils 2.', 'surveils 2.', 'effect.player'],
  ])('%s stops at "%s"', (text, stoppedAt, closestRule) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt, closestRule });
  });
});

describe('look at the top N cards, then put them back in any order (CR 401.2)', () => {
  test('the replay sentence is the engine reorder with the count', () => {
    expect(
      spellEffect('Look at the top three cards of your library, then put them back in any order.'),
    ).toEqual({ kind: 'lookAndReorder', count: 3 });
    expect(
      spellEffect('Look at the top two cards of your library, then put them back in any order.'),
    ).toEqual({ kind: 'lookAndReorder', count: 2 });
  });

  test('as an activated ability, after a mana cost', () => {
    expect(
      readAll(
        '{1}: Look at the top three cards of your library, then put them back in any order.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        effect: { kind: 'lookAndReorder', count: 3 },
      },
    ]);
  });

  test('another sentence of the line is read as its own effect', () => {
    expect(
      spellEffect(
        'Look at the top three cards of your library, then put them back in any order. Draw a card.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'lookAndReorder', count: 3 }, draw(1)],
    });
  });

  test('"You may shuffle." is the engine\'s may of a shuffle, asked as it comes up (stage P63, D-216)', () => {
    const text =
      'Look at the top three cards of your library, then put them back in any order. You may shuffle.';
    expect(spellEffect(text, 'sorcery')).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'lookAndReorder', count: 3 },
        { kind: 'may', effect: { kind: 'shuffle', player: { kind: 'you' } } },
      ],
    });
  });

  test.each([
    [
      'Look at the top card of your library, then put it back.',
      'card of your library, then put it back.',
    ],
    ['Look at the top three cards of your library.', 'cards of your library.'],
    [
      'Look at the top three cards of your library, then put them back.',
      'cards of your library, then put them back.',
    ],
    [
      'Look at the top three cards of your library, then put one of them into your hand.',
      'cards of your library, then put one of them into your hand.',
    ],
    [
      'Look at the top X cards of your library, then put them back in any order.',
      'X cards of your library, then put them back in any order.',
    ],
    [
      'Look at the top three cards of target player’s library, then put them back in any order.',
      'cards of target player’s library, then put them back in any order.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('put N cards from your hand on top of your library (CR 401.4)', () => {
  test("Brainstorm's sentence is a draw, then the engine's put from the hand", () => {
    expect(
      spellEffect(
        'Draw three cards, then put two cards from your hand on top of your library in any order.',
        'instant',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [draw(3), { kind: 'putFromHandOnTop', count: 2 }],
    });
  });

  test('one card says "a card" and no order', () => {
    expect(spellEffect('Put a card from your hand on top of your library.')).toEqual({
      kind: 'putFromHandOnTop',
      count: 1,
    });
    expect(
      spellEffect('Draw two cards, then put a card from your hand on top of your library.'),
    ).toEqual({
      kind: 'sequence',
      effects: [draw(2), { kind: 'putFromHandOnTop', count: 1 }],
    });
  });

  test('as an activated ability and after a scry', () => {
    expect(
      readAll(
        '{2}, {T}: Draw a card, then put a card from your hand on top of your library.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'sequence',
          effects: [draw(1), { kind: 'putFromHandOnTop', count: 1 }],
        },
      },
    ]);
  });

  test.each([
    [
      'Put two cards from your hand on top of your library.',
      'from your hand on top of your library.',
    ],
    ['Put a card from your hand on top of your library in any order.', 'in any order.'],
    [
      'Put two cards from your hand on the bottom of your library in any order.',
      'from your hand on the bottom of your library in any order.',
    ],
    [
      'Put any number of cards from your hand on top of your library.',
      'any number of cards from your hand on top of your library.',
    ],
    [
      'Put two cards from your graveyard on top of your library in any order.',
      'from your graveyard on top of your library in any order.',
    ],
    [
      'Put a land card from your hand on top of your library.',
      'card from your hand on top of your library.',
    ],
  ])('%s stops at "%s"', (text, stoppedAt) => {
    expect(dropped(text)).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });
});

describe('what the lowering needs from the engine', () => {
  test('the features are declared, so the dimension test and the diagnostics know them', () => {
    for (const ref of [
      'effect:scry',
      'effect:surveil',
      'effect:lookAndReorder',
      'effect:putFromHandOnTop',
    ]) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });

  test('a recognised line lists the rules that read it', () => {
    const scry = compileLine('When ~ enters, scry 1.', {
      rules: SET,
      face: 'permanent',
      faceTypes: ['creature'],
    });
    expect(scry.ok ? scry.recognised : []).toEqual(
      expect.arrayContaining(['trigger.enters', 'effect.scry']),
    );
    const brainstorm = compileLine(
      'Draw three cards, then put two cards from your hand on top of your library in any order.',
      { rules: SET, face: 'spell' },
    );
    expect(brainstorm.ok ? brainstorm.recognised : []).toEqual(
      expect.arrayContaining(['effect.draw', 'effect.put-hand-top']),
    );
  });
});

// Flashback with the cost equal to the mana cost (CR 702.34a, 118.9): the Oracle text of a creature that gives the instants and sorceries of its controller's graveyard flashback and makes
// spells uncounterable, and of a modal sorcery that gives them flashback until end of turn, goes through the grammar (cards named SYNTHETIC, the wordings are those of the real cards of
// the Jeskai flashback group) and is played through applyAction, so the nodes the parser writes are what the engine runs. The real cards used for the rest are the engine's own fixtures.
import { type Action, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, read, readAll } from './parser-p5-helpers';

const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';

const LECTURER = parsed(
  'SYNTHETIC Disciple',
  'Legendary Creature — Merfolk Wizard',
  "Spells can't be countered.\nEach instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
  { manaCost: '{2}{U}{R}', power: '2', toughness: '4', colors: ['U', 'R'] },
);
const WILL = parsed(
  'SYNTHETIC Will',
  'Sorcery',
  'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Each player may discard their hand and draw five cards.\n• Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.',
  { manaCost: '{2}{U}{R}', colors: ['U', 'R'] },
);

const flashbackOptions = (
  state: Parameters<typeof getLegalActions>[0],
  seat: 0 | 1 = 0,
): Action[] =>
  getLegalActions(state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
  );

describe('the lines read as the engine nodes', () => {
  const instantAndSorcery = { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] };

  test('"Spells can\'t be countered." is a static of every spell, whoever controls it', () => {
    expect(readAll("Spells can't be countered.", 'creature').abilities).toEqual([
      { kind: 'static', static: { kind: 'spellsCantBeCountered', spells: {} } },
    ]);
    // With "you control" the filter keeps its controller (the older reading).
    expect(readAll("Spells you control can't be countered.", 'creature').abilities).toEqual([
      { kind: 'static', static: { kind: 'spellsCantBeCountered', spells: { controller: 'you' } } },
    ]);
  });

  test('the static grant of flashback', () => {
    expect(
      readAll(
        "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'static',
        static: { kind: 'grantFlashbackToGraveyardCards', what: instantAndSorcery },
      },
    ]);
  });

  test('the spell that gives it until end of turn is one instruction of two sentences', () => {
    expect(
      readAll(
        'Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.',
        'sorcery',
      ).spell?.effect,
    ).toEqual({
      kind: 'gainFlashbackFromManaCost',
      what: instantAndSorcery,
      duration: 'untilEndOfTurn',
    });
  });

  test('"Each player may discard their hand and draw five cards." asks each player', () => {
    expect(
      readAll('Each player may discard their hand and draw five cards.', 'sorcery').spell,
    ).toEqual({
      effect: {
        kind: 'playersMay',
        players: { kind: 'eachPlayer' },
        runsAs: 'chooser',
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'discard',
              player: { kind: 'you' },
              count: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
            },
            { kind: 'draw', player: { kind: 'you' }, count: 5 },
          ],
        },
      },
    });
  });

  test('the modal spell: both modes, widened by a commander', () => {
    const spell = WILL.faces[0]?.spell;
    expect(spell?.modes).toHaveLength(2);
    expect(spell?.chooseModes).toEqual({
      min: 1,
      max: 1,
      maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
    });
  });

  test('near misses are not read: the cost alone is missing, another graveyard, another kind of card, another player', () => {
    const lines = [
      [
        'Each instant and sorcery card in your graveyard gains flashback until end of turn.',
        'sorcery',
      ],
      [
        "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost and {1}.",
        'creature',
      ],
      [
        "Each creature card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
        'creature',
      ],
      [
        "Each instant and sorcery card in a graveyard has flashback. The flashback cost is equal to that card's mana cost.",
        'creature',
      ],
      ['Each opponent may discard their hand and draw five cards.', 'sorcery'],
    ] as const;
    for (const [text, type] of lines) {
      expect(read(text, type).unparsed.length, text).toBeGreaterThan(0);
    }
    expect(
      dropped(
        'Each instant and sorcery card in your graveyard gains flashback until end of turn.',
        'sorcery',
      ).reason,
    ).toBe('unrecognised');
  });
});

describe('a creature with "Spells can\'t be countered." and the flashback grant, played', () => {
  const build = () =>
    scenario()
      .define(LECTURER)
      .seat(0)
      .graveyard(DIVINATION, BOLT)
      .hand(BOLT)
      .battlefield(LECTURER.name)
      .battlefield('Island', 'Island', 'Island', 'Mountain', 'Mountain')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();

  test('the instant and the sorcery in the graveyard are cast with flashback for their mana cost and exiled', () => {
    const g = build();
    expect(flashbackOptions(g.state)).toHaveLength(2);
    g.act(0).cast(DIVINATION, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a counterspell does not counter the flashback spell', () => {
    const g = build();
    g.act(0).cast(BOLT, { alternative: 'flashback', targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the modal sorcery, played', () => {
  test('with a commander both modes: the discarded instant is cast again with flashback', () => {
    const g = scenario()
      .define(WILL)
      .seat(0)
      .hand(WILL.name, BOLT)
      .battlefield('Island', 'Island', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('Grizzly Bears', { commander: true })
      .library('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Plains')
      .seat(1)
      .hand(DIVINATION)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Swamp')
      .build();
    g.act(0).cast(WILL.name, { modes: [0, 1], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    expect(flashbackOptions(g.state)).toContainEqual({
      kind: 'castSpell',
      object: g.id({ name: BOLT, zone: 'graveyard', seat: 0 }),
      alternative: 'flashback',
    });
    g.act(0).cast(BOLT, { alternative: 'flashback', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.invariants();
  });
});

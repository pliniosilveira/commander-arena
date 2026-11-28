// Alandra, Sky Dreamer (Deep Clue Sea deck, issue 128): "Whenever you draw your second card each turn, create a 2/2 blue Drake creature token with flying." and "Whenever you draw your fifth card
// each turn, Alandra and Drakes you control each get +X/+X until end of turn, where X is the number of cards in your hand." Imported through the grammar (never a fixture), defined in an engine
// scenario and played through applyAction. Names start with "SYNTHETIC"; the wording is that of the real card, taken from the golden corpus.
// Rules pinned: CR 121.1 (drawing a card; the nth card drawn this turn), 611.2a and 611.2c (the group is fixed as the effect resolves), 608.2h (X is worked out as the effect resolves).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ALANDRA = parsed(
  'SYNTHETIC Parsed Alandra',
  'Legendary Creature — Merfolk Wizard',
  'Whenever you draw your second card each turn, create a 2/2 blue Drake creature token with flying.\nWhenever you draw your fifth card each turn, ~ and Drakes you control each get +X/+X until end of turn, where X is the number of cards in your hand.',
  { manaCost: '{2}{U}{U}', colors: ['U'], power: '2', toughness: '4' },
);
const GUSH = parsed('SYNTHETIC Parsed Gush', 'Sorcery', 'Draw five cards.', {
  manaCost: '{1}{U}',
  colors: ['U'],
});
const SIP = parsed('SYNTHETIC Parsed Sip', 'Sorcery', 'Draw a card.', {
  manaCost: '{U}',
  colors: ['U'],
});
const FILLER = Array.from({ length: 12 }, () => 'Island');

describe('Alandra, Sky Dreamer: the grammar reads both draw triggers', () => {
  test('the second card makes a Drake; the fifth pumps Alandra and the Drakes by the cards in hand', () => {
    expect(ALANDRA.faces[0]?.abilities).toHaveLength(2);
    expect(ALANDRA.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'modifyPt',
        objects: { kind: 'each', plus: { kind: 'this' }, filter: { subtypes: ['Drake'] } },
      },
    });
  });
});

describe('Alandra, Sky Dreamer: played in a three-seat game', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(ALANDRA)
      .define(GUSH)
      .define(SIP)
      .seat(0)
      .library(...FILLER)
      .hand(GUSH.name, SIP.name)
      .battlefield('Island', 'Island', 'Island', ALANDRA.name)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('five cards in one turn: one Drake at the second, +X/+X at the fifth with X the cards in hand', () => {
    const g = board();
    g.act(0).cast(GUSH.name, { pay: true });
    g.passAll();
    // Two triggers (the second and the fifth card); the order is the controller's choice.
    if (g.state.pending?.kind === 'orderTriggers') {
      g.act(0).orderTriggers(0, 1);
    }
    g.passAll();
    g.expect.zone('Drake', 'battlefield', { seat: 0 });
    // Hand: Sip + five drawn cards = 6 when the fifth-card ability resolves (the Drake ability is above it or below it, it draws nothing).
    g.expect.pt(ALANDRA.name, 2 + 6, 4 + 6);
    g.expect.invariants();
  });

  test('a sixth card the same turn does nothing more, and the bonus ends with the turn', () => {
    const g = board();
    g.act(0).cast(GUSH.name, { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.act(0).cast(SIP.name, { pay: true });
    g.passAll();
    g.expect.pt(ALANDRA.name, 8, 10);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(ALANDRA.name, 2, 4);
  });
});

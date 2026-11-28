// Junk Winder (Deep Clue Sea deck, issue 128): "Affinity for tokens" and "Whenever a token you control enters, tap target nonland permanent an opponent controls. It doesn't untap during
// its controller's next untap step." Imported through the grammar (never a fixture), defined in an engine scenario and played through applyAction. Names start with "SYNTHETIC"; the
// wording is that of the real card, taken from the golden corpus.
// Rules pinned: CR 702.41a (Affinity: {1} less for each such permanent you control), 111.1 (a token), 603.2 (the trigger for each token), 502.3 and 611.2a (the permanent doesn't untap in its
// controller's next untap step), 115.1 (the target is an opponent's nonland permanent), 101.4 (three seats).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const WINDER = parsed(
  'SYNTHETIC Parsed Junk Winder',
  'Creature — Serpent',
  "Affinity for tokens (This spell costs {1} less to cast for each token you control.)\nWhenever a token you control enters, tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step.",
  { manaCost: '{5}{U}{U}', colors: ['U'], power: '5', toughness: '5' },
);
const MAKER = parsed('SYNTHETIC Parsed Token Maker', 'Sorcery', 'Investigate twice.', {
  manaCost: '{1}',
  colors: [],
});
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 10 }, () => 'Island');

describe('Junk Winder: the grammar reads the whole card', () => {
  test('affinity for tokens and the token trigger', () => {
    expect(WINDER.faces[0]?.abilities).toHaveLength(2);
    expect(WINDER.faces[0]?.abilities[0]).toMatchObject({
      kind: 'keyword',
      keyword: { kind: 'affinity', filter: { token: true } },
    });
  });
});

describe('Junk Winder: played in a three-seat game', () => {
  const hand = () =>
    scenario({ seats: 3 })
      .define(WINDER)
      .define(MAKER)
      .seat(0)
      .library(...FILLER)
      .hand(WINDER.name, MAKER.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'third' })
      .at('precombatMain', { active: 0 })
      .build();

  test('each token I control makes it cost {1} less: with no token it needs seven mana, with two five', () => {
    const g = hand();
    g.expect.illegal(0, { cast: WINDER.name });
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    // Five Islands are left untapped (one paid for the sorcery): {5}{U}{U} less two is {3}{U}{U}.
    g.expect.legal(0, { cast: WINDER.name });
  });

  const inPlay = () =>
    scenario({ seats: 3 })
      .define(WINDER)
      .define(MAKER)
      .seat(0)
      .library(...FILLER)
      .hand(MAKER.name)
      .battlefield('Island', 'Island', WINDER.name)
      .seat(1)
      .library(...FILLER)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'third' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a token entering taps a nonland permanent an opponent controls, and it stays tapped through its controller’s next untap step', () => {
    const g = inPlay();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    // Two tokens, two triggers: each asks for its target (an opponent's nonland permanent: their Bears or the third seat's, not a Forest).
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('theirs');
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('theirs');
    g.passAll();
    g.expect.tapped('theirs');
    g.expect.tapped('third', false);
    g.expect.tapped('Forest', false);
    // CR 502.3: it doesn't untap in its controller's next untap step (seat 1's turn is two turns away with three seats).
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('theirs');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped('theirs');
    // The restriction is gone after that step: seat 1 untaps in its following turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped('theirs', false);
    g.expect.invariants();
  });
});

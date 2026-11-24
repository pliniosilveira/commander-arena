// Planeswalker Party deck (issue 132), group 5: Kazuul, Tyrant of the Cliffs, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 506.3d and 508.1b (the defending player: the player a creature attacks, or the controller of the planeswalker it attacks), CR 603.4, CR 118.12a ("unless a player pays":
// a player who cannot pay is not asked), CR 111.1 (tokens). Three seats, so "if you're the defending player" is tested against an attack on another opponent.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const KAZUUL = real('Kazuul, Tyrant of the Cliffs');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Kazuul, Tyrant of the Cliffs', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(KAZUUL)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(KAZUUL.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('a creature that attacks you, whose controller cannot pay {3}, gives you a 3/3 Ogre', () => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 0 } }]);
    g.passAll();
    g.expect.zone('Ogre', 'battlefield', { seat: 0 });
  });

  test('a creature that attacks another opponent gives nothing: you are not the defending player', () => {
    const g = build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.passAll();
    g.expect.noEvent({ kind: 'tokenCreated' });
  });
});

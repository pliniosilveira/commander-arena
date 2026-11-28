// Tezzeret, Betrayer of Flesh (Deep Clue Sea deck, issue 128): "The first activated ability of an artifact you activate each turn costs {2} less to activate.", "+1: Draw two cards. Then
// discard two cards unless you discard an artifact card.", "−2: Target artifact becomes an artifact creature. If it isn't a Vehicle, it has base power and toughness 4/4." and "−6: You get an
// emblem with ..." The REAL Oracle text (the golden corpus) goes through the grammar with no override, is defined in an engine scenario and is played through applyAction.
// Rules pinned: CR 601.2f and 602.2b (the reduction is worked out as the ability is activated: generic mana only), 605.1a (a mana ability is an activated ability, so it counts as the first),
// 205.1b and 611.2a (becomes an artifact creature, with no end), 613.4b (the base power and toughness 4/4 of a creature that is not a Vehicle), 101.4 (three seats: only my artifacts).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const TEZZERET = real('Tezzeret, Betrayer of Flesh');
const LOOK = parsed('SYNTHETIC Parsed Look Twice', 'Sorcery', 'Investigate twice.', {
  manaCost: '{U}',
  colors: ['U'],
});
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('Tezzeret, Betrayer of Flesh: the first activated ability of an artifact each turn', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(TEZZERET)
      .define(LOOK)
      .seat(0)
      .library(...LIBRARY)
      .hand(LOOK.name)
      .battlefield('Island', TEZZERET.name, 'Sol Ring')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(TEZZERET)).toEqual([]);
  });

  test('a Clue’s {2}, sacrifice: draw costs nothing the first time; the second costs {2} (with only a Sol Ring to pay it, a mana ability would count)', () => {
    const g = game();
    g.act(0).cast(LOOK.name, { pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    // No mana at all: the first activation is free ({2} less).
    g.act(0).activate('Clue[0]', { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a mana ability of an artifact is an activated ability: after tapping the Sol Ring the Clue costs its full {2}', () => {
    const g = game();
    g.act(0).cast(LOOK.name, { pay: true });
    g.passAll();
    g.act(0).tapForMana('Sol Ring');
    // The Sol Ring was the first activated ability of an artifact this turn: nothing is cheaper now, and {C}{C} from it pays the {2}.
    g.act(0).activate('Clue[0]', { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.pool(0, {});
  });
});

describe('Tezzeret, Betrayer of Flesh: −2', () => {
  const game = () =>
    scenario({ seats: 3 })
      .define(TEZZERET)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TEZZERET.name, 'Sol Ring', 'Grizzly Bears')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('target artifact becomes an artifact creature with base power and toughness 4/4 (it is not a Vehicle)', () => {
    const g = game();
    g.act(0).activate(TEZZERET.name, { ability: 2, targets: ['Sol Ring'] });
    g.passAll();
    g.expect.derived('Sol Ring', { types: ['artifact', 'creature'] });
    g.expect.pt('Sol Ring', 4, 4);
    g.expect.invariants();
  });
});

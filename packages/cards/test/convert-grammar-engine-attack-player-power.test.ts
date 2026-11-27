// "Whenever you attack a player with one or more creatures with power 4 or greater, draw a card." (issue 692, Bitter Work; CR 508.1b, 508.6, 603.2c: one trigger for each player attacked
// with such a creature, however many creatures) and "Exhaust — {4}: <effect>. Activate only during your turn." (CR 702.177a: an exhaust ability is activated once per object; 602.5b).
// SYNTHETIC cards: the real Oracle wording of the part that is read, on shells that say SYNTHETIC; the earthbend effect of the real card is not read here. Built for three opponents.
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const TRIGGER_TEXT =
  'Whenever you attack a player with one or more creatures with power 4 or greater, draw a card.';
const WORK = parsed('SYNTHETIC Bitter Trigger', 'Enchantment', TRIGGER_TEXT, { manaCost: '{0}' });
const BIG = 'Serra Angel';
const SMALL = 'Grizzly Bears';

describe('"you attack a player with one or more creatures with power 4 or greater"', () => {
  test('is an attackBatch for each player attacked, with the creature filter', () => {
    expect(WORK.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'attackBatch',
          who: 'you',
          atLeast: 1,
          eachAttackedPlayer: true,
          what: { types: ['creature'] },
        },
        effect: { kind: 'draw' },
      },
    ]);
    expect(validateCard(WORK)).toEqual([]);
  });

  const game = () =>
    scenario({ seats: 4 })
      .define(WORK)
      .define(
        // A 5/5 body, so two big creatures can attack together.
        parsed('SYNTHETIC Big Body', 'Creature — Giant', '', { power: '5', toughness: '5' }),
      )
      .seat(0)
      .battlefield(WORK.name, BIG, SMALL, 'SYNTHETIC Big Body')
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .seat(1)
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .seat(2)
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .seat(3)
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const hand = (g: ReturnType<typeof game>) => g.state.seats[0]?.hand.length ?? 0;

  test('two players attacked with big creatures: one card for each player, not for each creature', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BIG, target: { player: 1 } },
      { attacker: 'SYNTHETIC Big Body', target: { player: 1 } },
      { attacker: SMALL, target: { player: 2 } },
    ]);
    g.passAll();
    expect(hand(g)).toBe(1);
    g.expect.invariants();
  });

  test('big creatures at two different players draw two cards', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BIG, target: { player: 1 } },
      { attacker: 'SYNTHETIC Big Body', target: { player: 3 } },
    ]);
    g.passAll();
    expect(hand(g)).toBe(2);
    g.expect.invariants();
  });

  test('only creatures with power below 4: nothing is drawn', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: SMALL, target: { player: 2 } }]);
    g.passAll();
    expect(hand(g)).toBe(0);
  });
});

describe('"Exhaust — {4}: <effect>. Activate only during your turn."', () => {
  const TEXT = 'Exhaust — {4}: Draw a card. Activate only during your turn.';
  const CARD = parsed('SYNTHETIC Exhaust Engine', 'Enchantment', TEXT, { manaCost: '{0}' });

  test('is read as one activated ability marked exhaust, limited to its controller turn', () => {
    expect(CARD.faces[0]?.abilities).toMatchObject([{ kind: 'activated', exhaust: true }]);
    expect(JSON.stringify(CARD.faces[0]?.abilities)).toContain('yourTurn');
    expect(validateCard(CARD)).toEqual([]);
  });

  test('a line that is not an activated ability after the word is not read', () => {
    const card = importCard(
      syntheticCard({
        name: 'SYNTHETIC Exhaust Static',
        typeLine: 'Enchantment',
        oracleText: 'Exhaust — Creatures you control get +1/+1.',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(card.support.status).toBe('unsupported');
  });

  const game = (turn: number, active: number) =>
    scenario({ seats: 3 })
      .define(CARD)
      .seat(0)
      .battlefield(CARD.name, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .seat(1)
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .seat(2)
      .library(...Array.from({ length: 10 }, () => 'Island'))
      .at('precombatMain', { active, turn })
      .build();

  test('can be activated once, then never again, even in a later turn of its controller', () => {
    const g = game(3, 0);
    g.act(0).activate(CARD.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(1);
    expect(g.act(0).try.activate(CARD.name)).toMatchObject({
      ok: false,
      error: expect.stringContaining('exhaust'),
    });
    g.advanceTo('precombatMain', { turn: 6 });
    expect(g.act(0).try.activate(CARD.name)).toMatchObject({
      ok: false,
      error: expect.stringContaining('exhaust'),
    });
  });

  test('cannot be activated during another player turn', () => {
    const g = game(4, 1);
    expect(g.act(0).try.activate(CARD.name)).toMatchObject({ ok: false });
  });
});

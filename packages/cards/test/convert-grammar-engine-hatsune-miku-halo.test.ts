// The Hatsune Miku - Secret Lair Commander deck (issue 145), Halo Fountain: the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card
// with no override and is played through applyAction. Pins: CR 118.3 (a cost can't be paid unless the player can do everything it asks), CR 602.2b and 601.2g-h (the costs are paid in
// any order the player likes: a creature tapped for the mana of the cost may be untapped for it), CR 701.26b (only a tapped permanent can be untapped), CR 302.6 (summoning sickness
// holds back only a creature's own {T} ability), CR 104.2b (an effect may state that a player wins the game), CR 104.1 (the game ends when a player wins), CR 104.2a (the "can't win" effect
// does not stop the last player in the game, but an effect that makes a player win is stopped by it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

/** A SYNTHETIC white mana creature: "{T}: Add {W}." imported through the grammar from the text of the real Halo Fountain's data. */
function whiteDork(): CardDefinition {
  const card = GOLDEN.find((c) => c.name === 'Halo Fountain');
  const [face] = card?.faces ?? [];
  if (card === undefined || face === undefined) throw new Error('Halo Fountain is missing');
  const name = 'SYNTHETIC White Dork';
  const imported = importCard(
    fromGoldenCard({
      ...card,
      name,
      faces: [
        {
          ...face,
          name,
          manaCost: '{W}',
          typeLine: 'Creature — Elf',
          oracleText: '{T}: Add {W}.',
          power: '1',
          toughness: '1',
        },
      ],
    }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const HALO = 'Halo Fountain';
const ANGEL = 'Darksteel Angel';
const BEARS = 'Grizzly Bears';
const DORK = 'SYNTHETIC White Dork';
const halo = real(HALO);
const angel = real(ANGEL);
const dork = whiteDork();

const [TOKEN_ABILITY, DRAW_ABILITY, WIN_ABILITY] = [0, 1, 2];

const board = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .define(halo)
      .define(angel)
      .define(dork)
      .seat(0)
      .life(20)
      .library('Island', 'Island', 'Island', 'Island')
      .battlefield(HALO),
  )
    .seat(1)
    .life(20)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

/** Whether the ability of the Fountain is among the legal actions of seat 0. */
const offered = (g: ScenarioGame, ability: number): boolean =>
  getLegalActions(g.state, 0).some(
    (a) => a.kind === 'activate' && a.object === g.id(HALO) && a.abilityIndex === ability,
  );

describe('Halo Fountain: the card is valid and reads as three abilities', () => {
  test('validateCard finds nothing', () => {
    expect(validateCard(halo)).toEqual([]);
    expect(halo.faces[0]?.abilities.map((a) => a.kind)).toEqual([
      'activated',
      'activated',
      'activated',
    ]);
  });
});

describe('{W}, {T}, Untap a tapped creature you control: Create a 1/1 green and white Citizen creature token', () => {
  test('one tapped creature is untapped as a cost, and the Fountain and the land are tapped', () => {
    const g = board((b) => b.battlefield('Plains').battlefield(BEARS, { tapped: true }));
    expect(offered(g, TOKEN_ABILITY)).toBe(true);
    g.act(0).activate(HALO, { ability: TOKEN_ABILITY, pay: true });
    g.expect.tapped(HALO, true);
    g.expect.tapped(BEARS, false);
    g.expect.tapped('Plains', true);
    g.passAll();
    g.expect.zone('Citizen', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('an untapped creature is no candidate: with none tapped the ability is not offered', () => {
    const g = board((b) => b.battlefield('Plains').battlefield(BEARS));
    expect(offered(g, TOKEN_ABILITY)).toBe(false);
  });

  test('an opponent’s tapped creature is no candidate', () => {
    const g = scenario()
      .define(halo)
      .seat(0)
      .life(20)
      .battlefield(HALO, 'Plains')
      .seat(1)
      .life(20)
      .battlefield(BEARS, { tapped: true })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(offered(g, TOKEN_ABILITY)).toBe(false);
  });

  test('a tapped creature that came under control this turn can be untapped (CR 302.6)', () => {
    const g = board((b) =>
      b.battlefield('Plains').battlefield(BEARS, { tapped: true, fresh: true }),
    );
    expect(offered(g, TOKEN_ABILITY)).toBe(true);
  });

  test('a tapped non-creature is no candidate', () => {
    const g = board((b) =>
      b.battlefield('Plains', { tapped: false }).battlefield('Island', { tapped: true }),
    );
    expect(offered(g, TOKEN_ABILITY)).toBe(false);
  });

  test('with several candidates the player chooses which one to untap, and cancel rewinds (CR 733)', () => {
    const g = board((b) =>
      b
        .battlefield('Plains')
        .battlefield(BEARS, { tapped: true, label: 'first' })
        .battlefield(BEARS, { tapped: true, label: 'second' }),
    );
    const before = g.positionHash();
    g.act(0).activate(HALO, { ability: TOKEN_ABILITY, pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('untapCost');
    expect(d.forCost).toBe(true);
    expect(d.legal).toHaveLength(2);
    expect([d.min, d.max]).toEqual([1, 1]);
    g.act(0).cancel();
    g.expect.position(before);

    g.act(0).activate(HALO, { ability: TOKEN_ABILITY, pay: true });
    g.act(0).choosePermanents('second');
    g.expect.tapped('first', true);
    g.expect.tapped('second', false);
    g.passAll();
    g.expect.zone('Citizen', 'battlefield', { seat: 0 });
  });

  test('the creature tapped for the mana of the cost can be the one untapped (CR 601.2g-h)', () => {
    const g = board((b) => b.battlefield(DORK));
    expect(offered(g, TOKEN_ABILITY)).toBe(true);
    g.act(0).activate(HALO, { ability: TOKEN_ABILITY, pay: true });
    g.expect.tapped(DORK, false);
    g.expect.tapped(HALO, true);
    g.passAll();
    g.expect.zone('Citizen', 'battlefield', { seat: 0 });
  });

  test('without the mana the ability is not offered even with a tapped creature', () => {
    const g = board((b) => b.battlefield(BEARS, { tapped: true }));
    expect(offered(g, TOKEN_ABILITY)).toBe(false);
  });
});

describe('{W}{W}, {T}, Untap two tapped creatures you control: Draw a card', () => {
  test('two tapped creatures are untapped and a card is drawn', () => {
    const g = board((b) =>
      b
        .battlefield('Plains', 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'left' })
        .battlefield(BEARS, { tapped: true, label: 'right' }),
    );
    g.act(0).activate(HALO, { ability: DRAW_ABILITY, pay: true });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.tapped('left', false);
    g.expect.tapped('right', false);
    g.expect.invariants();
  });

  test('one tapped creature is not enough: the ability is not offered (CR 118.3)', () => {
    const g = board((b) =>
      b.battlefield('Plains', 'Plains').battlefield(BEARS, { tapped: true }).battlefield(BEARS),
    );
    expect(offered(g, DRAW_ABILITY)).toBe(false);
    expect(offered(g, TOKEN_ABILITY)).toBe(true);
  });

  test('with three candidates the player picks two', () => {
    const g = board((b) =>
      b
        .battlefield('Plains', 'Plains')
        .battlefield(BEARS, { tapped: true, label: 'a' })
        .battlefield(BEARS, { tapped: true, label: 'b' })
        .battlefield(BEARS, { tapped: true, label: 'c' }),
    );
    g.act(0).activate(HALO, { ability: DRAW_ABILITY, pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect([d.min, d.max, d.legal.length]).toEqual([2, 2, 3]);
    g.act(0).choosePermanents('a', 'c');
    g.expect.tapped('a', false);
    g.expect.tapped('b', true);
    g.expect.tapped('c', false);
  });

  test('two creatures tapped for the mana of the cost can both be untapped', () => {
    const g = board((b) => b.battlefield(DORK).battlefield(DORK));
    expect(offered(g, DRAW_ABILITY)).toBe(true);
    g.act(0).activate(HALO, { ability: DRAW_ABILITY, pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('{W}{W}{W}{W}{W}, {T}, Untap fifteen tapped creatures you control: You win the game', () => {
  const fifteen = (tapped: number) =>
    board((b) => {
      let next = b.battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains');
      for (let i = 0; i < 15; i += 1) next = next.battlefield(BEARS, { tapped: i < tapped });
      return next;
    });

  test('with fifteen tapped creatures the controller wins at once', () => {
    const g = fifteen(15);
    expect(offered(g, WIN_ABILITY)).toBe(true);
    g.act(0).activate(HALO, { ability: WIN_ABILITY, pay: true });
    g.passAll();
    g.expect.gameOver({ win: 0 });
    g.expect.hasLost(1, false);
  });

  test('fourteen tapped creatures are not enough', () => {
    expect(offered(fifteen(14), WIN_ABILITY)).toBe(false);
  });

  test('the game goes on while the ability is on the stack, and the opponent can respond', () => {
    const g = fifteen(15);
    g.act(0).activate(HALO, { ability: WIN_ABILITY, pay: true });
    g.expect.stack([`${HALO} (ability)`]);
    g.expect.noEvent({ kind: 'gameEnded' });
  });

  test('your opponent with "You can\'t lose the game and your opponents can\'t win the game" stops the win', () => {
    const g = board((b) => {
      let next = b.battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains');
      for (let i = 0; i < 15; i += 1) next = next.battlefield(BEARS, { tapped: true });
      return next.seat(1).battlefield(ANGEL).seat(0);
    });
    g.act(0).activate(HALO, { ability: WIN_ABILITY, pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'gameEnded' });
    g.expect.hasLost(1, false);
    g.expect.hasLost(0, false);
  });

  test('your own "your opponents can\'t win" does not stop you: it names your opponents only', () => {
    const g = board((b) => {
      let next = b.battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', ANGEL);
      for (let i = 0; i < 15; i += 1) next = next.battlefield(BEARS, { tapped: true });
      return next;
    });
    g.act(0).activate(HALO, { ability: WIN_ABILITY, pay: true });
    g.passAll();
    g.expect.gameOver({ win: 0 });
  });
});

describe('texts that are not Halo Fountain are dropped, never half run (SYNTHETIC)', () => {
  const lines = [
    '{W}, {T}, Untap a creature you control: Create a 1/1 green and white Citizen creature token.',
    '{W}, {T}, Untap a tapped creature an opponent controls: Draw a card.',
    '{W}, {T}, Untap a tapped creature: Draw a card.',
    '{W}, {T}, Untap three tapped creature you control: Draw a card.',
    '{W}, {T}, Untap a tapped creatures you control: Draw a card.',
    '{W}, {T}, Untap X tapped creatures you control: Draw a card.',
    '{W}, {T}, Untap a tapped creature you control and: Draw a card.',
    '{W}, {T}, Untap one tapped creature you control: You win the game and draw a card.',
    '{W}, {T}, Untap a tapped creature you control: Target player wins the game.',
    '{W}, {T}, Untap a tapped creature you control: Each opponent wins the game.',
    '{W}, {T}, Untap a tapped creature you control: You wins the game.',
    '{W}, {T}, Untap two tapped creatures you control with total power 4 or greater: Draw a card.',
  ];
  for (const text of lines) {
    test(text, () => {
      expect(withText(HALO, text).support.status).toBe('unsupported');
    });
  }
});

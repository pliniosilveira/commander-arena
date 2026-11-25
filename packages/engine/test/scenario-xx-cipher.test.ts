// Cipher (Grand Larceny deck, issue 119, Arcane Heist): "Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its
// controller may cast a copy of the encoded card without paying its mana cost." The keyword `cipher` is a static ability of an instant or sorcery that works on the stack (`rules/cipher.ts`).
// Pins (CR 702.99 as the task of this group gave the number; the CR text file was not in the worktree, so it was not looked up, and the other numbers are those the repository's own
// comments use): CR 608.2 and 608.2g (the copy is cast as the ability resolves), CR 707.10 and 707.12 (a copy of a card), CR 400.7 (a creature that leaves is a new object, so the card is
// no longer encoded on it), CR 603.2c (once for each player damaged), CR 603.3b (the abilities of several encoded cards trigger together). Rulings of the card: you choose the creature as
// the spell resolves; the card goes from the stack to exile, never to the graveyard; if the creature leaves the battlefield the card stays exiled and is no longer encoded; if you choose not to
// cast the copy there is no later chance; a copy of the spell is not a card and is not encoded. The card is SYNTHETIC. Played on three seats.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPELL = 'SYNTHETIC Cipher Tonic';
const SECOND = 'SYNTHETIC Cipher Elixir';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

const tonic = (name: string, life: number) =>
  singleFace({
    name,
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: `You gain ${life} life. Cipher`,
    abilities: [{ kind: 'keyword', keyword: { kind: 'cipher' } }],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: life } },
  });

const LANDS = ['Island', 'Island', 'Island', 'Island'] as const;

function game(...hand: string[]) {
  return scenario({ seats: 3 })
    .define(tonic(SPELL, 2))
    .define(tonic(SECOND, 5))
    .seat(0)
    .life(20)
    .hand(...hand)
    .battlefield(...LANDS, BEARS, GOBLIN)
    .library(...LIBRARY)
    .seat(1)
    .life(20)
    .battlefield('Llanowar Elves')
    .hand(MURDER)
    .library(...LIBRARY)
    .seat(2)
    .life(20)
    .library(...LIBRARY)
    .seat(0)
    .at('precombatMain')
    .build();
}

const asked = (g: ReturnType<typeof game>) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected a question, got ${d?.kind}`);
  return d;
};

describe('the card is valid', () => {
  test('valid on a sorcery, refused on a creature', () => {
    expect(validateCard(tonic(SPELL, 2))).toEqual([]);
    const creature = {
      ...tonic(SPELL, 2),
      faces: [{ ...tonic(SPELL, 2).faces[0], types: ['creature'] }],
    } as never;
    expect(validateCard(creature).length).toBeGreaterThan(0);
  });
});

describe('encoding', () => {
  test('the spell does its other effects, then asks for a creature of the controller; the card is exiled, never in the graveyard', () => {
    const g = game(SPELL);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
    const d = asked(g);
    expect(d.purpose).toBe('cipher');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    // Only the creatures of the controller are a choice.
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(SPELL, 'exile', { seat: 0 });
    g.expect.noObject(SPELL, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('"you may": choosing no creature puts the card into the graveyard as any spell', () => {
    const g = game(SPELL);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
  });

  test('with no creature to choose nothing is asked and the card goes to the graveyard', () => {
    const g = scenario({ seats: 3 })
      .define(tonic(SPELL, 2))
      .seat(0)
      .life(20)
      .hand(SPELL)
      .battlefield(...LANDS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind === 'choosePermanent').toBe(false);
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.life(0, 22);
  });
});

/** Answers the question of the encoded ability: cast the copy (the one card the question offers) or none. */
function castCopy(g: ReturnType<typeof game>, cast: boolean) {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected the cast question, got ${d?.kind}`);
  expect(d.legal).toHaveLength(1);
  g.act(0).choose({ kind: 'chooseCards', objects: cast ? [...d.legal] : [] });
}

describe('the encoded card', () => {
  test('the creature that deals combat damage to a player: its controller may cast a copy, which resolves; the card stays encoded', () => {
    const g = game(SPELL);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.playCombat({
      attack: [{ attacker: BEARS, target: { player: 2 } }],
      until: 'combatDamage',
    });
    g.passAll();
    castCopy(g, true);
    g.passAll();
    g.expect.life(2, 18);
    g.expect.life(0, 24);
    g.expect.zone(SPELL, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('declining the copy: nothing is cast and the card stays exiled', () => {
    const g = game(SPELL);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.playCombat({
      attack: [{ attacker: BEARS, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    castCopy(g, false);
    g.passAll();
    g.expect.life(0, 22);
    g.expect.zone(SPELL, 'exile', { seat: 0 });
  });

  test('a creature without the card encoded on it casts nothing', () => {
    const g = game(SPELL);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.playCombat({
      attack: [{ attacker: GOBLIN, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    expect(g.state.pending?.kind === 'chooseCards').toBe(false);
    g.expect.life(0, 22);
  });

  test('when the creature leaves the battlefield the card is no longer encoded: it stays in exile and nothing is copied', () => {
    const g = scenario({ seats: 3 })
      .define(tonic(SPELL, 2))
      .seat(0)
      .life(20)
      .hand(SPELL, MURDER)
      .battlefield(...LANDS, 'Swamp', 'Swamp', 'Swamp', BEARS, GOBLIN)
      .library(...LIBRARY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .seat(2)
      .life(20)
      .library(...LIBRARY)
      .seat(0)
      .at('precombatMain')
      .build();
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPELL, 'exile', { seat: 0 });
    g.playCombat({
      attack: [{ attacker: GOBLIN, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    expect(g.state.pending?.kind === 'chooseCards').toBe(false);
    g.expect.life(0, 22);
  });

  test('two cards encoded on one creature: each gives its own copy', () => {
    const g = game(SPELL, SECOND);
    g.act(0).cast(SPELL, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.act(0).cast(SECOND, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.expect.life(0, 27);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.advanceTo('combatDamage');
    // Both abilities are the controller's and trigger together: they go on the stack in the order chosen (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected the cast question, got ${d?.kind}`);
    g.act(0).choose({ kind: 'chooseCards', objects: [...d.legal] });
    g.passAll();
    const e = g.state.pending;
    if (e?.kind !== 'chooseCards')
      throw new Error(`expected the second cast question, got ${e?.kind}`);
    g.act(0).choose({ kind: 'chooseCards', objects: [...e.legal] });
    g.passAll();
    // 27 + 2 + 5.
    g.expect.life(0, 34);
  });
});

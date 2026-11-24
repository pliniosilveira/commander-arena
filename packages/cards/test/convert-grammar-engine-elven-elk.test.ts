// Mirkwood Elk (Elven Council deck, issue 98), run through the engine as written: a SYNTHETIC card with the wording of the real one (name replaced by ~).
// "Whenever this creature enters or attacks, return target Elf card from your graveyard to your hand. You gain life equal to that card's power."
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const ELVES = 'Llanowar Elves'; // 1/1 Elf Druid
const BEARS = 'Grizzly Bears'; // 2/2, not an Elf
const BIG_ELF = 'SYNTHETIC Big Elf 4/5';
const SIX_LANDS = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'] as const;
const FILLER = Array.from({ length: 8 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

function main(mine: (b: Builder) => Builder) {
  return mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

const handNames = (g: ScenarioGame): string[] =>
  g.state.seats[0]?.hand.map((id) => {
    const card = g.state.objects[id as keyof typeof g.state.objects]?.card;
    const def = card === undefined || card === null ? undefined : g.state.cards[card]?.definition;
    return def === undefined ? '?' : (g.state.definitions[def]?.name ?? '?');
  }) ?? [];

describe('"Whenever this creature enters or attacks, return target Elf card from your graveyard to your hand. You gain life equal to that card\'s power." (CR 603.2, 608.2h, 208.1)', () => {
  const elk = () =>
    parsed(
      'SYNTHETIC Parsed Elk',
      'Creature — Elk',
      "Trample\nWhenever this creature enters or attacks, return target Elf card from your graveyard to your hand. You gain life equal to that card's power.",
      { manaCost: '{5}{G}', power: '5', toughness: '5', colors: ['G'] },
    );
  const bigElf = () =>
    parsed(BIG_ELF, 'Creature — Elf Warrior', '', {
      manaCost: '{3}{G}',
      power: '4',
      toughness: '5',
      colors: ['G'],
    });

  test('entering: the Elf card goes to the hand and its power is gained as life', () => {
    const card = elk();
    const elf = bigElf();
    const g = main((b) =>
      b
        .define(card)
        .define(elf)
        .hand(card.name)
        .graveyard(elf.name)
        .battlefield(...SIX_LANDS),
    );
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    expect(handNames(g)).toContain(elf.name);
    g.expect.life(0, 24);
    g.expect.invariants();
  });

  test('attacking: it triggers again, for the Elf card now in the graveyard', () => {
    const card = elk();
    const g = main((b) => b.define(card).battlefield(card.name).graveyard(ELVES));
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([card.name]);
    g.passAll();
    expect(handNames(g)).toContain(ELVES);
    g.expect.life(0, 21);
  });

  test('a creature card that is not an Elf cannot be the target: nothing returns, no life is gained', () => {
    const card = elk();
    const g = main((b) => b.define(card).battlefield(card.name).graveyard(BEARS));
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([card.name]);
    g.passAll();
    expect(handNames(g)).not.toContain(BEARS);
    g.expect.life(0, 20);
  });
});

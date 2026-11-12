// The Niv-Mizzet deck (issue 25), group 2b-b (D-327 to D-330): the REAL Oracle text of Tablet of Discovery and Pyromancer's Goggles (the corpus's golden.jsonl,
// taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes
// the parser writes for the real text are what the engine runs. The helper cards are SYNTHETIC (src/cards/fixtures) or old fixtures. Pins: CR 701.17 (mill),
// CR 601.2 and 305.1 (playing a card from a graveyard as an effect allows), CR 106.6 (mana that can be spent only on some spells; what mana does when it is
// spent), CR 603.3 (a triggered ability goes on the stack above the spell), CR 707.10 and 707.10c (the copy is not cast; new targets are optional).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
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

const FILLER = Array.from({ length: 12 }, () => 'Mountain');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const GOBLIN = 'Raging Goblin'; // {R} creature
const BLUE_BOLT = 'SYNTHETIC Blue Bolt'; // {1}{U} instant: 2 damage
const SINGE = 'SYNTHETIC Twin Singe'; // {1}{R} sorcery: 1 damage

describe('Tablet of Discovery: "When this artifact enters, mill a card. You may play that card this turn." and mana for instant and sorcery spells (CR 701.17, 601.2, 106.6)', () => {
  const tablet = real('Tablet of Discovery');
  const TABLET = tablet.name;

  test('the card is valid', () => {
    expect(validateCard(tablet)).toEqual([]);
  });

  const cast = (top: readonly string[]) =>
    scenario()
      .define(tablet)
      .seat(0)
      .hand(TABLET)
      .battlefield('Mountain', { count: 3 })
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('it enters and mills: a spell milled can be cast from the graveyard this turn', () => {
    const g = cast([BOLT]);
    g.act(0).cast(TABLET, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // {R} from the Tablet itself pays for the Bolt.
    g.expect.legal(0, { cast: BOLT });
    g.act(0).tapForMana(TABLET, { ability: 2 });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.tapped(TABLET, true);
    g.expect.invariants();
  });

  test('a land milled can be played, and uses the land drop', () => {
    const g = cast(['Forest']);
    g.act(0).cast(TABLET, { pay: true });
    g.passAll();
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the card is lost with the turn: the next turn it is no more castable than any card in the graveyard', () => {
    const g = cast([BOLT]);
    g.act(0).cast(TABLET, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: BOLT });
  });

  test('the two mana of the third ability pay for an instant and a sorcery, never for a creature', () => {
    const g = scenario()
      .define(tablet)
      .seat(0)
      .hand(BOLT, GOBLIN, SINGE)
      .battlefield(TABLET)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(TABLET, { ability: 2 });
    g.expect.pool(0, 'RR');
    g.expect.illegal(0, { cast: GOBLIN });
    g.act(0).cast(SINGE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.pool(0, '');
  });
});

describe('Pyromancer\'s Goggles: "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy." (CR 106.6, 603.3, 707.10, 707.10c)', () => {
  const goggles = real("Pyromancer's Goggles");
  const GOGGLES = goggles.name;

  test('the card is valid', () => {
    expect(validateCard(goggles)).toEqual([]);
  });

  const base = (...hand: string[]) =>
    scenario()
      .define(goggles)
      .seat(0)
      .hand(...hand)
      .battlefield(GOGGLES, 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('a red instant paid with the mana: the copy goes on the stack above it, with new targets chosen, and resolves first', () => {
    const g = base(BOLT);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${GOGGLES} (ability)`, BOLT]);
    const mark = g.mark();
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BOLT, BOLT]);
    expect(g.eventsSince(mark).filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    expect(g.eventsSince(mark).filter((e) => e.kind === 'spellCast')).toHaveLength(0);
    g.pass();
    g.pass(); // the copy, aimed at its controller
    g.expect.life(0, 37);
    g.expect.life(1, 40);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a blue instant paid with the mana is not copied', () => {
    const g = base(BLUE_BOLT);
    g.act(0).cast(BLUE_BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BLUE_BOLT]);
  });

  test('a red creature spell paid with the mana is not copied', () => {
    const g = base(GOBLIN);
    g.act(0).cast(GOBLIN, { pay: true });
    g.expect.stack([GOBLIN]);
  });

  test('a red sorcery is copied', () => {
    const g = base(SINGE);
    g.act(0).cast(SINGE, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${GOGGLES} (ability)`, SINGE]);
    g.pass();
    g.pass();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 38);
  });
});

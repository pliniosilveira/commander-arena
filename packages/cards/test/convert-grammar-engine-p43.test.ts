// Parsed text is only worth something if the engine runs it as written (stage P43). These tests import a SYNTHETIC card through the grammar (never through a
// fixture), define it in an engine scenario and play it through applyAction: the Korvold deck's Ancient Adamantoise of D-192 and D-193 (ENGINE_VERSION 45).
// The card name starts with "SYNTHETIC"; its type line, mana cost and Oracle text are those of the real card (the owner's request file of 2026-10-29), its
// power and toughness, which the file does not give, are INVENTED (6/8). No ruling of the card could be read (Scryfall is not reachable from the sandbox).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const SHIELD3 = 'SYNTHETIC Shield Three';

const toise: CardDefinition = parsed(
  'SYNTHETIC Parsed Adamantoise',
  'Creature — Turtle',
  "Vigilance, ward {3}\nDamage isn't removed from ~ during cleanup steps.\nAll damage that would be dealt to you and other permanents you control is dealt to ~ instead.\nWhen ~ dies, exile it and create ten tapped Treasure tokens.",
  { manaCost: '{5}{G}{G}{G}', colors: ['G'], power: '6', toughness: '8' },
);

const chooseOption = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`pending is ${d?.kind}`);
  return d;
};

describe('Ancient Adamantoise, the real wording through the grammar', () => {
  const play = () =>
    scenario()
      .seat(0)
      .define(toise)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .library(...FILLER)
      .seat(1)
      .define(toise)
      .battlefield(toise.name, BEARS, 'Plains', 'Plains')
      .hand(SHIELD3)
      .library(...FILLER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();

  test('is valid', () => {
    expect(validateCard(toise)).toEqual([]);
  });

  test('damage to its controller and to another permanent of theirs is dealt to it instead, by the same source', () => {
    const g = play();
    g.pass();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.damage(toise.name, 3);
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
    g.expect.damage(toise.name, 6);
  });

  test('with a prevention shield on the player, the player is asked which applies first (CR 616.1)', () => {
    const g = play();
    g.act(1).cast(`${SHIELD3}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const d = chooseOption(g);
    expect(d.purpose).toBe('replacement');
    expect(d.seat).toBe(1);
    expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['prevent', 'redirect']);
    g.act(1).chooseOption(d.options[1] ?? '');
    g.expect.life(1, 40);
    g.expect.damage(toise.name, 3);
  });

  test('the damage stays through the cleanup step', () => {
    const g = play();
    g.pass();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.damage(toise.name, 3);
    g.advanceTo('upkeep', { turn: 2 });
    g.expect.damage(toise.name, 3);
    g.expect.invariants();
  });
});

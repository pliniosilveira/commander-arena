// Revenant Recon deck, group B: the spell of Charnel Serenade, read from its real Oracle text and played through `applyAction`: "Surveil 3, then return a creature card from your graveyard to
// the battlefield with a finality counter on it. Exile ~ with three time counters on it." (CR 701.25a surveil, 608.2c the order of the instructions, 608.2d the choice of a card, 110.2a the
// controller, 122.6 the counter it enters with, 122.1h the finality counter, 608.2n the spell's last instruction). The cards are named SYNTHETIC: the text is the real one.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SERENADE_TEXT =
  'Surveil 3, then return a creature card from your graveyard to the battlefield with a finality counter on it. Exile ~ with three time counters on it.\nSuspend 3—{2}{B} (Rather than cast this card from your hand, you may pay {2}{B} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)';

const serenade = parsed('SYNTHETIC Parsed Serenade', 'Sorcery', SERENADE_TEXT, {
  manaCost: '{4}{B}{B}',
  colors: ['B'],
});
const bear = parsed('SYNTHETIC Parsed Cub', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const relic = parsed('SYNTHETIC Parsed Relic', 'Artifact', 'Flash', { manaCost: '{2}' });

function game(
  yard: readonly string[],
  top: readonly string[] = ['Island', 'Forest', 'Plains', 'Swamp'],
) {
  let b = scenario()
    .define(serenade)
    .define(bear)
    .define(relic)
    .seat(0)
    .hand(serenade.name)
    .pool('BBCCCC')
    .library(...top);
  for (const name of yard) b = b.graveyard(name);
  return b.seat(1).library('Swamp').at('precombatMain', { active: 0, turn: 1 }).build();
}

function resolveSurveil(g: ReturnType<typeof game>) {
  g.act(0).cast(serenade.name, { pay: true });
  g.passAll();
  g.expect.pending('arrangeCards', 0);
}

describe('Charnel Serenade, from the real text (CR 701.25a, 608.2c, 122.6)', () => {
  test('the whole text is supported', () => {
    expect(serenade.faces[0]?.spell).toBeDefined();
  });

  test('surveil first, then a creature card returns with a finality counter, then the spell is exiled with three time counters', () => {
    const g = game([bear.name, relic.name]);
    resolveSurveil(g);
    g.act(0).arrange({ top: ['Island', 'Forest', 'Plains'], other: [] });
    g.expect.zone(bear.name, 'battlefield', { seat: 0 });
    g.expect.counters(bear.name, { finality: 1 });
    g.expect.zone(relic.name, 'graveyard', { seat: 0 });
    const [exiled] = g.find({ name: serenade.name, zone: 'exile', seat: 0 });
    expect(exiled?.counters.time).toBe(3);
    g.expect.invariants();
  });

  test('a creature card that surveil put into the graveyard can be the one returned (CR 608.2c)', () => {
    const g = game([], [bear.name, 'Island', 'Forest', 'Plains']);
    resolveSurveil(g);
    g.act(0).arrange({ top: ['Island', 'Forest'], other: [bear.name] });
    g.expect.zone(bear.name, 'battlefield', { seat: 0 });
    g.expect.counters(bear.name, { finality: 1 });
    g.expect.invariants();
  });

  test('no creature card in the graveyard: nothing returns and the spell is still exiled with time counters', () => {
    const g = game([relic.name]);
    resolveSurveil(g);
    g.act(0).arrange({ top: ['Island', 'Forest', 'Plains'], other: [] });
    g.expect.zone(relic.name, 'graveyard', { seat: 0 });
    const [exiled] = g.find({ name: serenade.name, zone: 'exile', seat: 0 });
    expect(exiled?.counters.time).toBe(3);
  });
});

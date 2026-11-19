// Meren deck, Junji group: "When ~ dies, choose one — • Each opponent discards two cards and loses 2 life. • Put target non-Dragon creature card from a graveyard onto the
// battlefield under your control. You lose 2 life." (CR 700.2, 603.3c, 205.3d, 400.7, 110.2a). The paragraph is that of the real card (golden corpus); the card is a
// SYNTHETIC copy under another name, imported through the grammar only.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const JUNJI = parsed(
  'SYNTHETIC Parsed Midnight Dragon',
  'Legendary Creature — Dragon Spirit',
  'Flying, menace\nWhen ~ dies, choose one —\n• Each opponent discards two cards and loses 2 life.\n• Put target non-Dragon creature card from a graveyard onto the battlefield under your control. You lose 2 life.',
  { manaCost: '{3}{B}{B}', colors: ['B'], power: '5', toughness: '5' },
);
const KILL = parsed('SYNTHETIC Parsed Kill', 'Instant', 'Destroy target creature.', {
  manaCost: '{B}',
  colors: ['B'],
});
const DRAGON = parsed('SYNTHETIC Parsed Wyrm', 'Creature — Dragon', 'Flying', {
  manaCost: '{4}{R}',
  colors: ['R'],
  power: '4',
  toughness: '4',
});
const BEAR = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  colors: ['G'],
  power: '2',
  toughness: '2',
});
const OX = parsed('SYNTHETIC Parsed Ox', 'Creature — Ox', 'Vigilance', {
  manaCost: '{2}{G}',
  colors: ['G'],
  power: '3',
  toughness: '3',
});
const FILLER = ['Island', 'Plains', 'Swamp'] as const;

/** Seat 0 destroys its own Junji with the instant; seat 1 has the given creature cards in its graveyard and four cards in hand. */
const dies = (graveyard1: readonly string[]) => {
  const g = scenario()
    .define(JUNJI)
    .define(KILL)
    .define(DRAGON)
    .define(BEAR)
    .define(OX)
    .seat(0)
    .life(20)
    .library(...FILLER)
    .hand(KILL.name)
    .battlefield(JUNJI.name)
    .battlefield('Swamp')
    .seat(1)
    .life(20)
    .library(...FILLER)
    .hand('Island', 'Plains', 'Swamp', 'Forest')
    .graveyard(...graveyard1)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(KILL.name).targets([JUNJI.name]).pay();
  g.passAll();
  return g;
};

describe('Junji, the Midnight Sky: the dies trigger with two modes', () => {
  test('the lowering: a modal trigger of two modes; the second targets a non-Dragon creature card in any graveyard', () => {
    const trigger = JUNJI.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({ chooseModes: { min: 1, max: 1 } });
    const modes = trigger?.kind === 'triggered' ? (trigger.modes ?? []) : [];
    expect(modes).toHaveLength(2);
    expect(modes[1]?.targets?.[0]?.what).toMatchObject({
      kind: 'object',
      filter: { zone: 'graveyard', types: ['creature'], notSubtypes: ['Dragon'] },
    });
  });

  test('mode 1: each opponent discards two cards and loses 2 life', () => {
    const g = dies([BEAR.name]);
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(0);
    g.passAll();
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Island', 'Plains');
    g.passAll();
    g.expect.handSize(1, 2);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
  });

  test('mode 2: the Dragon cards are no legal target; the chosen card enters under the trigger controller, who loses 2 life', () => {
    const g = dies([BEAR.name, DRAGON.name, OX.name]);
    g.act(0).chooseModes(1);
    const d = g.state.pending;
    // The Dragon cards (the opponent's, and Junji itself in its owner's graveyard) are no legal targets: the Bear and the Ox are.
    expect(d?.kind === 'targets' ? d.specs[0]?.legal : []).toHaveLength(2);
    g.act(0).chooseTargets(BEAR.name);
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(OX.name, 'graveyard', { seat: 1 });
    g.expect.zone(DRAGON.name, 'graveyard', { seat: 1 });
    g.expect.zone(JUNJI.name, 'graveyard', { seat: 0 });
    g.expect.life(0, 18);
    g.expect.life(1, 20);
  });

  test('mode 2 with one legal target: it is chosen by itself and enters under the controller of the trigger', () => {
    const g = dies([BEAR.name, DRAGON.name]);
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(DRAGON.name, 'graveyard', { seat: 1 });
    g.expect.life(0, 18);
  });

  test('mode 2 with no legal target (only Dragon cards in graveyards) is not offered: mode 1 is the only one', () => {
    const g = dies([DRAGON.name]);
    expect(g.state.pending?.kind).not.toBe('chooseModes');
    g.passAll();
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Island', 'Plains');
    g.passAll();
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.zone(DRAGON.name, 'graveyard', { seat: 1 });
  });
});

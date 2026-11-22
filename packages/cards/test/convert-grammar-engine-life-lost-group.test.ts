// Scions & Spellcraft deck, group A: the players who lost life, or were dealt combat damage, this turn, read from the wordings of Y'shtola, Night's Blessed, Reaper's Scythe, Papalymo Totolymo
// and Estinien Varlineau (CR 119.3, 603.4, 102.2, 101.4, 120.2a, 510.2). Every card name starts with "SYNTHETIC"; the Oracle text is the real wording of the ability.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const LIBRARY = Array.from({ length: 20 }, () => 'Island');

const warden = parsed(
  'SYNTHETIC Parsed Warden',
  'Creature — Elf',
  'At the beginning of each end step, if a player lost 4 or more life this turn, you draw a card.',
  { manaCost: '{2}{U}', power: '2', toughness: '2', colors: ['U'] },
);
const scythe = parsed(
  'SYNTHETIC Parsed Scythe',
  'Artifact — Equipment',
  'At the beginning of your end step, put a soul counter on ~ for each player who lost life this turn.',
  { manaCost: '{2}' },
);
const idol = parsed(
  'SYNTHETIC Parsed Idol',
  'Artifact',
  '{4}, {T}, Sacrifice ~: Each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control.',
  { manaCost: '{2}' },
);
const scholar = parsed(
  'SYNTHETIC Parsed Scholar',
  'Creature — Elf',
  'At the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by ~ or a Dragon this turn.',
  { manaCost: '{2}{R}', power: '2', toughness: '2', colors: ['R'] },
);
const drain = parsed('SYNTHETIC Parsed Drain', 'Sorcery', 'Target player loses 4 life.', {
  manaCost: '{B}',
  colors: ['B'],
});
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const ox = parsed('SYNTHETIC Parsed Ox', 'Creature — Ox', 'Vigilance', {
  manaCost: '{2}{G}',
  power: '3',
  toughness: '3',
  colors: ['G'],
});

describe('the lowering', () => {
  test('"if a player lost 4 or more life this turn" is an intervening if on the end step trigger of each player', () => {
    expect(warden.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 4 },
    });
  });

  test('"for each player who lost life this turn" counts the players of every seat who lost life', () => {
    expect(scythe.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'addCounters',
        count: {
          kind: 'playerCount',
          of: { kind: 'lostLifeThisTurn', of: { kind: 'eachPlayer' } },
        },
      },
    });
  });

  test('"each opponent who lost life this turn sacrifices" names the opponents who lost life', () => {
    expect(JSON.stringify(idol.faces[0]?.abilities[0])).toContain(
      '"player":{"kind":"lostLifeThisTurn","of":{"kind":"eachOpponent"}}',
    );
  });

  test('"opponents who were dealt combat damage by ~ or a Dragon this turn": this creature or the subtype Dragon', () => {
    expect(JSON.stringify(scholar.faces[0]?.abilities[0])).toContain(
      '"of":{"kind":"combatDamagedThisTurn","of":{"kind":"eachOpponent"},"byThis":true,"by":{"subtypes":["Dragon"]}}',
    );
  });
});

describe('the engine runs what the lowering made, with three seats', () => {
  test('Y’shtola’s trigger: an opponent losing 4 life makes the end step draw a card', () => {
    const g = scenario({ seats: 3 })
      .define(warden)
      .define(drain)
      .seat(0)
      .library(...LIBRARY)
      .hand(drain.name)
      .battlefield(warden.name, 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(drain.name, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('Reaper’s Scythe: one soul counter for each player who lost life', () => {
    const g = scenario({ seats: 3 })
      .define(scythe)
      .define(drain)
      .seat(0)
      .library(...LIBRARY)
      .hand(drain.name, drain.name)
      .battlefield(scythe.name, 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(`${drain.name}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${drain.name}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(scythe.name, { soul: 2 });
  });

  test('Papalymo Totolymo: only the opponent who lost life sacrifices the creature with the greatest power', () => {
    const g = scenario({ seats: 3 })
      .define(idol)
      .define(drain)
      .define(bear)
      .define(ox)
      .seat(0)
      .library(...LIBRARY)
      .hand(drain.name)
      .battlefield(idol.name, 'Swamp', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(bear.name, ox.name)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(bear.name, ox.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(drain.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).activate(idol.name, { pay: true });
    g.passAll();
    g.expect.zone(ox.name, 'graveyard', { seat: 1 });
    g.expect.zone(bear.name, 'battlefield', { seat: 1 });
    g.expect.zone(ox.name, 'battlefield', { seat: 2 });
  });

  test('Estinien Varlineau: X is the opponents this creature dealt combat damage to', () => {
    const g = scenario({ seats: 3 })
      .define(scholar)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(scholar.name)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: scholar.name, target: { player: 1 } }]);
    g.advanceTo('end');
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
  });
});

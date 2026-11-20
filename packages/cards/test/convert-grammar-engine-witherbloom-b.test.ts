// Witherbloom Witchcraft deck, group B (issue 190): Willowdusk, Essence Seer ("Put a number of +1/+1 counters on it equal to the amount of life you gained this turn or the amount of
// life you lost this turn, whichever is greater. Activate only as a sorcery.", CR 119.3, 122.1, 602.5d), Sun Droplet, Deadly Tempest and Sproutback Trudge. The wordings are those of the
// real cards read through the grammar only; every card name starts with "SYNTHETIC". CR text could not be checked in this session (no CR copy); the rule numbers are those the code already cites.
import { type CardDefinition, type Effect, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const seer = parsed(
  'SYNTHETIC Parsed Seer',
  'Legendary Creature — Dryad Druid',
  '{1}, {T}: Choose another target creature. Put a number of +1/+1 counters on it equal to the amount of life you gained this turn or the amount of life you lost this turn, whichever is greater. Activate only as a sorcery.',
  { manaCost: '{1}{B}{G}', power: '3', toughness: '3', colors: ['B', 'G'] },
);
const bear = parsed('SYNTHETIC Parsed Seer Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const feast = parsed('SYNTHETIC Parsed Seer Feast', 'Sorcery', 'You gain 5 life.', {
  manaCost: '{G}',
  colors: ['G'],
});
const drain = parsed('SYNTHETIC Parsed Seer Drain', 'Sorcery', 'You lose 7 life.', {
  manaCost: '{B}',
  colors: ['B'],
});

const defs = () => scenario().define(seer).define(bear).define(feast).define(drain);

describe('Willowdusk, Essence Seer: the greater of life gained and life lost this turn (CR 119.3)', () => {
  const board = (spell: string) =>
    defs()
      .seat(0)
      .library('Island', 'Island')
      .hand(spell)
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Swamp')
      .battlefield(seer.name)
      .battlefield(bear.name)
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('with no life change this turn it puts no counters', () => {
    const g = board(feast.name);
    g.act(0).activate(seer.name, { targets: [bear.name], pay: true });
    g.passAll();
    g.expect.counters(bear.name, {});
  });

  test('life gained greater than life lost: counters equal the gain', () => {
    const g = board(feast.name);
    g.act(0).cast(feast.name, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
    g.act(0).activate(seer.name, { targets: [bear.name], pay: true });
    g.passAll();
    g.expect.counters(bear.name, { '+1/+1': 5 });
    g.expect.pt(bear.name, 7, 7);
  });

  test('life lost greater than life gained: counters equal the loss', () => {
    const g = board(drain.name);
    g.act(0).cast(drain.name, { pay: true });
    g.passAll();
    g.act(0).activate(seer.name, { targets: [bear.name], pay: true });
    g.passAll();
    g.expect.counters(bear.name, { '+1/+1': 7 });
  });

  test('only as a sorcery (CR 602.5d): not with a spell on the stack', () => {
    const g = board(feast.name);
    g.act(0).cast(feast.name, { pay: true });
    expect(g.state.stack).toHaveLength(1);
    g.expect.illegal(0, { activate: seer.name });
    g.passAll();
    g.expect.legal(0, { activate: seer.name });
  });
});

const tempest = parsed(
  'SYNTHETIC Parsed Tempest',
  'Sorcery',
  'Destroy all creatures. Each player loses life equal to the number of creatures they controlled that were destroyed this way.',
  { manaCost: '{4}{B}{B}', colors: ['B'] },
);
const ward = parsed('SYNTHETIC Parsed Tempest Ward', 'Creature — Golem', 'Indestructible', {
  manaCost: '{3}',
  power: '2',
  toughness: '2',
});

describe('Deadly Tempest: each player loses life equal to the creatures they controlled that were destroyed (CR 608.2c, 701.8)', () => {
  const board = () =>
    defs()
      .define(tempest)
      .define(ward)
      .seat(0)
      .library('Island', 'Island')
      .hand(tempest.name)
      .battlefield('Swamp')
      .battlefield('Swamp')
      .battlefield('Swamp')
      .battlefield('Swamp')
      .battlefield('Swamp')
      .battlefield('Swamp')
      .battlefield(bear.name)
      .battlefield(bear.name)
      .battlefield(seer.name)
      .seat(1)
      .library('Island', 'Island')
      .battlefield(bear.name)
      .battlefield(ward.name)
      .at('precombatMain', { active: 0 })
      .build();

  test('each player loses their own number; an indestructible creature is not destroyed, so not counted', () => {
    const g = board();
    g.act(0).cast(tempest.name, { pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.life(1, 39);
    g.expect.zone(ward.name, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('the engine refuses what would read nothing (Deadly Tempest)', () => {
  const edit = (change: (effects: readonly Effect[]) => readonly Effect[]): CardDefinition => {
    const face = tempest.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell == null || spell.effect?.kind !== 'sequence') {
      throw new Error('expected a sequence');
    }
    const effects = change(spell.effect.effects);
    return {
      ...tempest,
      faces: [{ ...face, spell: { ...spell, effect: { ...spell.effect, effects } } }],
    };
  };

  test('as lowered it is valid', () => {
    expect(validateCard(tempest)).toEqual([]);
  });

  test('it needs a destroy before it', () => {
    const broken = edit((effects) => effects.slice(1));
    expect(
      validateCard(broken)
        .map((i) => i.message)
        .join('\n'),
    ).toContain('needs a destroy effect');
  });

  test('it is the amount of a loseLife, not of a gainLife', () => {
    const broken = edit((effects) =>
      effects.map((e) => (e.kind === 'loseLife' ? { ...e, kind: 'gainLife' as const } : e)),
    );
    expect(validateCard(broken).map((i) => i.message)).toContain(
      'destroyedCreaturesOfAffected is the amount of a loseLife effect',
    );
  });
});

const droplet = parsed(
  'SYNTHETIC Parsed Droplet',
  'Artifact',
  "Whenever you're dealt damage, put that many charge counters on ~.\nAt the beginning of each upkeep, you may remove a charge counter from ~. If you do, you gain 1 life.",
  { manaCost: '{2}' },
);
const zap = parsed(
  'SYNTHETIC Parsed Droplet Zap',
  'Instant',
  '~ deals 3 damage to target player.',
  { manaCost: '{R}', colors: ['R'] },
);

describe('Sun Droplet: "Whenever you\'re dealt damage, put that many charge counters on ~." (CR 120.2, 603.2)', () => {
  const board = (active: 0 | 1) =>
    defs()
      .define(droplet)
      .define(zap)
      .seat(0)
      .library('Island', 'Island')
      .battlefield(droplet.name)
      .hand(zap.name)
      .battlefield('Mountain')
      .seat(1)
      .library('Island', 'Island')
      .hand(zap.name)
      .battlefield('Mountain')
      .at('precombatMain', { active })
      .build();

  test('damage dealt to you puts that many counters on it', () => {
    const g = board(1);
    g.act(1).cast(zap.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.passAll();
    g.expect.counters(droplet.name, { charge: 3 });
    g.expect.invariants();
  });

  test('damage dealt to an opponent of its controller does not', () => {
    const g = board(0);
    g.act(0).cast(zap.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.counters(droplet.name, {});
  });

  test('at the beginning of each upkeep it may remove a counter to gain 1 life', () => {
    const g = board(1);
    g.act(1).cast(zap.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters(droplet.name, { charge: 3 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).accept();
    g.expect.counters(droplet.name, { charge: 2 });
    g.expect.life(0, 38);
  });
});

const trudge = parsed(
  'SYNTHETIC Parsed Trudge',
  'Creature — Fungus Beast',
  'This spell costs {X} less to cast, where X is the amount of life you gained this turn.\nTrample\nAt the beginning of your end step, if you gained life this turn, you may cast ~ from your graveyard.',
  { manaCost: '{7}{G}{G}', power: '9', toughness: '7', colors: ['G'] },
);

describe('Sproutback Trudge: "At the beginning of your end step, if you gained life this turn, you may cast ~ from your graveyard." (CR 113.6b, 603.4, 608.2g)', () => {
  const start = () =>
    defs()
      .define(trudge)
      .seat(0)
      .library('Island', 'Island')
      .graveyard(trudge.name)
      .hand(feast.name)
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('life gained this turn: at the end step it may be cast from the graveyard, paying its reduced cost', () => {
    const g = start();
    g.act(0).cast(feast.name, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([trudge.name]);
    g.passAll();
    g.expect.zone(trudge.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining leaves it in the graveyard', () => {
    const g = start();
    g.act(0).cast(feast.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.expect.zone(trudge.name, 'graveyard', { seat: 0 });
  });

  test('no life gained this turn: nothing triggers', () => {
    const g = start();
    g.advanceTo('end');
    expect(g.state.stack).toHaveLength(0);
    g.expect.zone(trudge.name, 'graveyard', { seat: 0 });
  });
});

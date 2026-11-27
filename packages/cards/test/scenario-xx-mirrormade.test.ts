// Miracle Worker deck build (issue 109), Mirrormade read from its real Oracle text and run by the engine at three seats.
// "You may have this enchantment enter as a copy of any artifact or enchantment on the battlefield."
// Pins: CR 614.1c and 614.12 (enters as a copy), CR 707.2 (copiable values: not tapped state, counters or Auras attached), CR 107.3m ({X} of a
// permanent on the battlefield is 0), CR 707.9 (a copy of a copy is a copy of what it copied), CR 603.6a (enters abilities of the copied permanent trigger).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const MIRROR = real('Mirrormade');
const BALLISTA = real('Walking Ballista');
const SIMULACRUM = real('Solemn Simulacrum');
const BANNER = real('Patchwork Banner');
const EXPLORATION = real('Exploration');
const DISK = real("Nevinyrral's Disk");
const TOME = real('Tome of Legends');
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** Seat 0 holds Mirrormade with three Islands; `extra` puts permanents on the battlefield. */
function board(
  extra: (b: ReturnType<typeof scenario>) => void,
  opts: { seats?: number } = {},
): ScenarioGame {
  const seats = opts.seats ?? 2;
  const b = scenario({ seats })
    .define(MIRROR)
    .define(BALLISTA)
    .define(SIMULACRUM)
    .define(BANNER)
    .define(EXPLORATION)
    .define(DISK)
    .define(TOME);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).hand(MIRROR.name).battlefield('Island', { count: 3 });
  extra(b);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

function cast(g: ScenarioGame): void {
  g.act(0).cast(MIRROR.name, { pay: true });
  g.passAll();
}

describe('Mirrormade', () => {
  test('the lowering is a plain entersAsCopy of any artifact or enchantment', () => {
    const replacement = MIRROR.faces[0]?.abilities.find((a) => a.kind === 'replacement');
    expect(replacement).toMatchObject({
      kind: 'replacement',
      replacement: { kind: 'entersAsCopy', optional: true, duration: 'permanent' },
    });
    const rule = replacement?.kind === 'replacement' ? replacement.replacement : null;
    if (rule?.kind !== 'entersAsCopy') throw new Error('not a copy rule');
    expect(rule.what.controller).toBeUndefined();
    expect(JSON.stringify(rule.what)).toContain('artifact');
    expect(JSON.stringify(rule.what)).toContain('enchantment');
    expect(rule.addTypes).toBeUndefined();
  });

  test('any artifact or enchantment of any player may be chosen, and nothing else', () => {
    const g = board(
      (b) => {
        b.seat(1)
          .battlefield(SIMULACRUM.name)
          .battlefield(EXPLORATION.name)
          .battlefield('Grizzly Bears');
        b.seat(2).battlefield('Mountain').battlefield(BANNER.name);
        b.seat(0).battlefield(EXPLORATION.name);
      },
      { seats: 3 },
    );
    cast(g);
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    expect(d.min).toBe(0);
    expect(d.legal).toHaveLength(4);
    for (const seat of [0, 1, 2]) {
      expect(d.legal.some((id) => g.state.objects[id]?.controller === seat)).toBe(true);
    }
  });

  test('with nothing on the battlefield to copy nothing is asked and it enters as itself', () => {
    const g = board(() => {});
    cast(g);
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.zone('Mirrormade', 'battlefield');
  });

  test('it becomes a copy of an enchantment an opponent controls', () => {
    const g = board(
      (b) => {
        b.seat(2).battlefield(EXPLORATION.name, { label: 'tithe' });
      },
      { seats: 3 },
    );
    cast(g);
    g.act(0).choosePermanents('tithe');
    g.expect.derived(
      { name: EXPLORATION.name, seat: 0 },
      { types: ['enchantment'], colors: ['G'] },
    );
    g.expect.eventLog([{ kind: 'enteredAsCopy' }]);
  });

  test('it becomes a copy of an artifact creature', () => {
    const g = board((b) => {
      b.seat(1).battlefield(SIMULACRUM.name, { label: 'sim' });
    });
    cast(g);
    g.act(0).choosePermanents('sim');
    g.expect.derived(
      { name: SIMULACRUM.name, seat: 0 },
      { types: ['artifact', 'creature'], subtypes: ['Golem'] },
    );
    g.expect.pt({ name: SIMULACRUM.name, seat: 0 }, 2, 2);
  });

  test('"you may": declining leaves the enchantment as Mirrormade', () => {
    const g = board((b) => {
      b.seat(1).battlefield(EXPLORATION.name);
    });
    cast(g);
    g.act(0).choosePermanents();
    g.expect.zone('Mirrormade', 'battlefield', { seat: 0 });
    g.expect.derived({ name: 'Mirrormade' }, { types: ['enchantment'], colors: ['U'] });
  });

  test('it copies what was printed: not tapped state or counters', () => {
    const g = board((b) => {
      b.seat(1).battlefield(SIMULACRUM.name, {
        label: 'sim',
        tapped: true,
        counters: { '+1/+1': 3 },
      });
    });
    cast(g);
    g.act(0).choosePermanents('sim');
    g.expect.tapped({ name: SIMULACRUM.name, seat: 0 }, false);
    g.expect.counters({ name: SIMULACRUM.name, seat: 0 }, {});
    g.expect.pt({ name: SIMULACRUM.name, seat: 0 }, 2, 2);
  });

  test('{X} in the cost is 0: a copy of Walking Ballista enters with no counters and dies (CR 107.3m)', () => {
    const g = board((b) => {
      b.seat(1).battlefield(BALLISTA.name, { label: 'ballista', counters: { '+1/+1': 4 } });
    });
    cast(g);
    g.act(0).choosePermanents('ballista');
    g.expect.zone('Mirrormade', 'graveyard', { seat: 0 });
    g.expect.zone(BALLISTA.name, 'battlefield', { seat: 1 });
  });

  test('"as enters" abilities of the copied permanent work: Patchwork Banner asks for a creature type', () => {
    const g = board((b) => {
      b.seat(1).battlefield(BANNER.name, { label: 'banner', chosen: { creatureType: 'Elf' } });
    });
    cast(g);
    g.act(0).choosePermanents('banner');
    expect(g.state.pending?.kind).toBe('chooseOption');
  });

  test('enters abilities of the copied permanent trigger (CR 603.6a): Solemn Simulacrum searches', () => {
    const g = board((b) => {
      b.seat(1).battlefield(SIMULACRUM.name, { label: 'sim' });
      b.seat(0).library('Forest', ...FILLER);
    });
    cast(g);
    g.act(0).choosePermanents('sim');
    g.passAll();
    // The copied "when this creature enters, you may search" ability triggered and is asked of seat 0.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    expect(g.state.pending?.seat).toBe(0);
  });

  test('a copy of a copy is a copy of what it copied (CR 707.2)', () => {
    const g = board((b) => {
      b.seat(1).battlefield(EXPLORATION.name, { label: 'plain' });
      b.seat(1).battlefield('Island', { count: 3 });
      b.seat(1).hand(MIRROR.name);
    });
    cast(g);
    g.act(0).choosePermanents('plain');
    // Seat 0 now controls an Exploration that is a copy; seat 1 casts its own Mirrormade onto the battlefield and copies that one.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(MIRROR.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    const copied = d.legal.find((id) => g.state.objects[id]?.controller === 0);
    expect(copied).toBeDefined();
    if (copied === undefined) return;
    g.act(1).choosePermanents({ name: EXPLORATION.name, seat: 0 });
    // Seat 1 has its own Exploration and the Mirrormade that became a copy of the copy: both are Exploration, and the Mirrormade is not blue.
    const copies = g.find({ name: EXPLORATION.name, seat: 1 });
    expect(copies).toHaveLength(2);
    for (const [i] of copies.entries()) {
      g.expect.derived(
        { name: EXPLORATION.name, seat: 1, nth: i },
        { types: ['enchantment'], colors: ['G'] },
      );
    }
  });

  test('"enters tapped" of the copied permanent applies (CR 614.12): a copy of Nevinyrral\'s Disk enters tapped', () => {
    const g = board((b) => {
      b.seat(1).battlefield(DISK.name, { label: 'disk' });
    });
    cast(g);
    g.act(0).choosePermanents('disk');
    g.expect.tapped({ name: DISK.name, seat: 0 }, true);
  });

  test('"enters with a counter" of the copied permanent applies (CR 122.6): a copy of Tome of Legends enters with a page counter', () => {
    const g = board((b) => {
      b.seat(1).battlefield(TOME.name, { label: 'tome', counters: { page: 5 } });
    });
    cast(g);
    g.act(0).choosePermanents('tome');
    g.expect.counters({ name: TOME.name, seat: 0 }, { page: 1 });
  });
});

describe('Mirrormade copying a token (CR 707.2, 111.4)', () => {
  const LIGHTBRINGER = real('Soaring Lightbringer');

  test('it copies the original characteristics of the token and does not become a token', () => {
    const b = scenario({ seats: 2 }).define(MIRROR).define(LIGHTBRINGER);
    for (let seat = 0; seat < 2; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(0)
      .hand(MIRROR.name)
      .battlefield('Island', { count: 3 })
      .battlefield(LIGHTBRINGER.name)
      .battlefield('Grizzly Bears', { label: 'bears' });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.playCombat({ attack: ['bears'], until: 'endOfCombat' });
    g.advanceTo('postcombatMain');
    const glimmers = g.find({ name: 'Glimmer', seat: 0 });
    expect(glimmers).toHaveLength(1);
    cast(g);
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    const token = glimmers[0];
    if (token === undefined) return;
    expect(d.legal).toContain(token.id);
    g.act(0).choosePermanents({ name: 'Glimmer', seat: 0 });
    g.expect.derived(
      { name: 'Glimmer', seat: 0, nth: 1 },
      { types: ['enchantment', 'creature'], subtypes: ['Glimmer'], colors: ['W'] },
    );
    g.expect.pt({ name: 'Glimmer', seat: 0, nth: 1 }, 1, 1);
    const copy = g.find({ name: 'Glimmer', seat: 0 }).find((o) => o.token === null);
    expect(copy).toBeDefined();
    expect(copy?.card).not.toBeNull();
    expect(g.find({ name: 'Glimmer', seat: 0 }).filter((o) => o.token !== null)).toHaveLength(1);
  });
});

describe('Mirrormade copying an Aura (CR 303.4f, 303.4g)', () => {
  const CURIOSITY = real('Curiosity');
  const RESCUE = real("Shardmage's Rescue");
  const CURSE = real('Curse of Bounty');
  const withAuras = (build: (b: ReturnType<typeof scenario>) => void, seats = 2) =>
    board(
      (b) => {
        b.define(CURIOSITY).define(RESCUE).define(CURSE);
        build(b);
      },
      { seats },
    );

  test('it chooses what it enchants before it enters, among the permanents the copied enchant ability allows, of any player', () => {
    const g = withAuras((b) => {
      b.seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield(CURIOSITY.name, { label: 'aura', attachedTo: 'bears' });
      b.seat(2).battlefield('Serra Angel', { label: 'angel' }).battlefield('Mountain');
    }, 3);
    cast(g);
    g.act(0).choosePermanents('aura');
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('auraHost');
    // Both creatures (seat 1's Bears, seat 2's Angel), not the lands: "Enchant creature".
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('angel');
    g.expect.attached({ name: CURIOSITY.name, seat: 0 }, 'angel');
    g.expect.zone('Mirrormade', 'battlefield', { seat: 0 });
  });

  test('with one permanent to enchant nothing is asked', () => {
    const g = withAuras((b) => {
      b.seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield(CURIOSITY.name, { label: 'aura', attachedTo: 'bears' });
    });
    cast(g);
    g.act(0).choosePermanents('aura');
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.attached({ name: CURIOSITY.name, seat: 0 }, 'bears');
  });

  test('with nothing to enchant the spell is put into its owner\'s graveyard (CR 303.4g): "Enchant creature you control" and no creature', () => {
    const g = withAuras((b) => {
      b.seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield(RESCUE.name, { label: 'aura', attachedTo: 'bears' });
    });
    cast(g);
    g.act(0).choosePermanents('aura');
    g.expect.zone('Mirrormade', 'graveyard', { seat: 0 });
    g.expect.zone('Mirrormade', 'battlefield', { count: 0 });
  });

  test('"you control" is read for the player the copy enters under', () => {
    const g = withAuras((b) => {
      b.seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield(RESCUE.name, { label: 'aura', attachedTo: 'bears' });
      b.seat(0).battlefield('Serra Angel', { label: 'mine' });
    });
    cast(g);
    g.act(0).choosePermanents('aura');
    g.expect.attached({ name: RESCUE.name, seat: 0 }, 'mine');
  });

  test('an Aura that enchants a player is not entered by a copy: the spell is put into the graveyard (docs/ROADMAP.md)', () => {
    const g = withAuras((b) => {
      b.seat(0).battlefield('Forest', { count: 2 });
      b.seat(0).hand(CURSE.name);
    });
    g.act(0).cast(CURSE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    cast(g);
    g.act(0).choosePermanents({ name: CURSE.name, seat: 0 });
    g.expect.zone('Mirrormade', 'graveyard', { seat: 0 });
  });

  test('declining the copy: Mirrormade enters as itself, unattached', () => {
    const g = withAuras((b) => {
      b.seat(1)
        .battlefield('Grizzly Bears', { label: 'bears' })
        .battlefield(CURIOSITY.name, { label: 'aura', attachedTo: 'bears' });
    });
    cast(g);
    g.act(0).choosePermanents();
    g.expect.zone('Mirrormade', 'battlefield', { seat: 0 });
  });
});

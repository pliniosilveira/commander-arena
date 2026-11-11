/**
 * The more-mana-production decisions (D-099, D-102) through the game host with the hidden SYNTHETIC
 * deck `synthetic-mana-plus`: a filter land asks which combination, a manual payment names it, a
 * "could produce" land offers the opponent's colors only, life paid for mana is logged, and a land
 * that was given a mana ability lists it in its chooser.
 */
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { menuItems } from '../src/ui/decisions/abilities';
import { objectIndex } from '../src/ui/decisions/lookup';
import { clickSource, setTapCombination, tapBadges } from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { pressButton } from './mana-decks';
import { mine, priorityOf, reachPlus } from './mana-plus-decks';

vi.setConfig({ testTimeout: 60_000 });

const free = (objects: readonly ObjectView[]) => objects.find((o) => !o.tapped);
const colorsOf = (snap: {
  view: { seats: readonly { manaPool: readonly { color: string }[] }[] };
}) => (snap.view.seats[0]?.manaPool ?? []).map((m) => m.color).sort();

describe('a filter land at priority', () => {
  test('asks which combination; the chosen one lands in the pool and the half is spent', async () => {
    const reached = await reachPlus((s) => {
      const filter = free(mine(s, 'SYNTHETIC Filter Land'));
      const basic = free([...mine(s, 'Mountain'), ...mine(s, 'Plains')]);
      return priorityOf(s) !== null && filter !== undefined && basic !== undefined;
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const filter = free(mine(snap, 'SYNTHETIC Filter Land'));
    const basic = free([...mine(snap, 'Mountain'), ...mine(snap, 'Plains')]);
    if (filter === undefined || basic === undefined) throw new Error('missing land');

    // Without a half in the pool the filter offers nothing but its colorless tap.
    const before = priorityOf(snap);
    const offered = before?.options.filter(
      (o) => o.kind === 'activateAbility' && o.source === filter.id,
    );
    expect(offered?.every((o) => o.kind === 'activateAbility' && o.combination === undefined)).toBe(
      true,
    );

    // Tap the basic: its color is the half the filter takes.
    const tapped = await host.act({
      kind: 'activateAbility',
      source: basic.id,
      abilityIndex: 0,
      color: null,
    });
    expect(tapped.error).toBeNull();
    const pending = priorityOf(tapped);
    if (pending === null) throw new Error('no priority');
    const outcome = clickOutcome(pending, filter.id, objectIndex(tapped.view));
    if (outcome.kind !== 'choose') throw new Error(`expected a choice, got ${outcome.kind}`);
    const combos = outcome.choices.flatMap((c) =>
      c.combination === undefined ? [] : [c.combination],
    );
    expect(combos.length).toBeGreaterThanOrEqual(2);
    for (const c of outcome.choices) {
      if (c.combination === undefined) continue;
      expect(c.color).toBeNull();
      expect(c.label).toBe(`Add ${c.combination.map((m) => `{${m}}`).join('')}`);
      expect(c.action.combination).toEqual(c.combination);
    }
    const pick = outcome.choices.find(
      (c) => c.combination?.join('') === 'WR' || c.combination?.join('') === 'RW',
    );
    if (pick === undefined) throw new Error('no {R}{W}');
    const done = await host.act(pick.action);
    expect(done.error).toBeNull();
    // The basic's mana paid the hybrid symbol; the pool now holds exactly the combination.
    expect(colorsOf(done)).toEqual(['R', 'W']);
    expect(done.view.battlefield.find((o) => o.id === filter.id)?.tapped).toBe(true);
  });

  test('a tap of the filter without a combination is refused with the choice named', async () => {
    const reached = await reachPlus((s) => {
      const filter = free(mine(s, 'SYNTHETIC Filter Land'));
      const basic = free([...mine(s, 'Mountain'), ...mine(s, 'Plains')]);
      return priorityOf(s) !== null && filter !== undefined && basic !== undefined;
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const filter = free(mine(snap, 'SYNTHETIC Filter Land'));
    const basic = free([...mine(snap, 'Mountain'), ...mine(snap, 'Plains')]);
    if (filter === undefined || basic === undefined) throw new Error('missing land');
    await host.act({ kind: 'activateAbility', source: basic.id, abilityIndex: 0, color: null });
    const bad = await host.act({
      kind: 'activateAbility',
      source: filter.id,
      abilityIndex: 1,
      color: null,
    });
    expect(bad.error).not.toBeNull();
  });
});

describe('manual payment with a filter land', () => {
  test('the source lists combinations; the tap carries the chosen one and the payment goes through', async () => {
    const reached = await reachPlus((s) => {
      const p = s.view.pending;
      if (p?.kind !== 'payMana') return false;
      const names = new Map(s.view.battlefield.map((o) => [o.id, o.name]));
      const hasFilter = p.manaSources.some(
        (m) => names.get(m.object) === 'SYNTHETIC Filter Land' && m.combinations !== undefined,
      );
      const hasPlain = p.manaSources.some((m) => {
        const n = names.get(m.object);
        return n === 'Plains' || n === 'Mountain';
      });
      return hasFilter && hasPlain && [...p.totalCost].sort().join('') === '1W';
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'payMana') throw new Error('wrong decision');
    const names = new Map(snap.view.battlefield.map((o) => [o.id, o.name]));
    const filter = pending.manaSources.find(
      (m) => names.get(m.object) === 'SYNTHETIC Filter Land' && m.combinations !== undefined,
    );
    const basic = pending.manaSources.find((m) => {
      const n = names.get(m.object);
      return n === 'Plains' || n === 'Mountain';
    });
    if (filter === undefined || basic === undefined) throw new Error('missing source');
    expect(filter.colors).toBeUndefined();
    expect((filter.combinations ?? []).length).toBeGreaterThan(1);
    // A filter land has two abilities. The first click taps the colorless one; the next asks which
    // combination the filter makes (it has several); a third takes the land out of the payment.
    const firstClick = clickSource([], pending.manaSources, filter.object);
    expect(firstClick.kind).toBe('taps');
    if (firstClick.kind !== 'taps') return;
    expect(clickSource(firstClick.taps, pending.manaSources, filter.object)).toEqual({
      kind: 'choose',
      abilityIndex: filter.abilityIndex,
    });
    const basicClick = clickSource([], pending.manaSources, basic.object);
    expect(basicClick.kind).toBe('taps');
    if (basicClick.kind !== 'taps') return;
    // A combination that is not on offer changes nothing.
    expect(
      setTapCombination(basicClick.taps, pending.manaSources, filter.object, filter.abilityIndex, [
        'U',
        'U',
      ]),
    ).toEqual(basicClick.taps);
    // Youthful Knight costs {1}{W}: the basic's mana pays the filter's hybrid symbol, and the
    // combination with a white mana pays the whole cost.
    const first = (filter.combinations ?? []).find((c) => c.includes('W'));
    if (first === undefined) throw new Error('no combination');
    const taps = setTapCombination(
      basicClick.taps,
      pending.manaSources,
      filter.object,
      filter.abilityIndex,
      first,
    );
    expect(taps).toHaveLength(2);
    expect(tapBadges(taps).get(filter.object)).toBe(`2 (${first.join('')})`);
    const sent = pressButton(snap.view, 'Pay (2 taps)', (ui) => ({ ...ui, taps }));
    expect(sent.kind).toBe('payManual');
    if (sent.kind !== 'payManual') return;
    const tap = sent.taps.find((t) => t.object === filter.object);
    expect(tap?.combination).toEqual(first);
    const next = await host.act(sent);
    expect(next.error).toBeNull();
    expect(next.view.pending?.kind).not.toBe('payMana');
    expect(next.log.map((l) => l.text).join('\n')).toContain('You cast Youthful Knight');
  });
});

describe('"could produce" lands', () => {
  test("an Orchard offers only the colors of the opponent's lands, and each is accepted", async () => {
    const reached = await reachPlus(
      (s) => {
        const orchard = free(mine(s, 'SYNTHETIC Orchard'));
        const theirs = s.view.battlefield.filter(
          (o) => o.controller !== s.view.viewer && o.types.includes('land'),
        );
        return priorityOf(s) !== null && orchard !== undefined && theirs.length > 0;
      },
      { aiDeck: 'swamp-forest' },
    );
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const orchard = free(mine(snap, 'SYNTHETIC Orchard'));
    if (orchard === undefined) throw new Error('no Orchard');
    const pending = priorityOf(snap);
    if (pending === null) throw new Error('no priority');
    const colors = pending.options.flatMap((o) =>
      o.kind === 'activateAbility' && o.source === orchard.id && o.color !== null ? [o.color] : [],
    );
    // swamp-forest has Swamps, Forests and a Command Tower for a black commander: black and green.
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(['B', 'G']).toContain(c);
    const outcome = clickOutcome(pending, orchard.id, objectIndex(snap.view));
    if (colors.length > 1) {
      expect(outcome.kind).toBe('choose');
      if (outcome.kind !== 'choose') return;
      expect(outcome.choices.map((c) => c.color)).toEqual(colors);
      expect(outcome.choices.every((c) => c.life === 0)).toBe(true);
    }
    const color = colors[0];
    const done = await host.act({
      kind: 'activateAbility',
      source: orchard.id,
      abilityIndex: 0,
      color: color ?? null,
    });
    expect(done.error).toBeNull();
    expect(colorsOf(done)).toEqual([color]);
  });
});

describe('mana that costs life', () => {
  test('the chooser says so and the log reads "You pay 1 life."', async () => {
    const reached = await reachPlus((s) => {
      return priorityOf(s) !== null && free(mine(s, 'SYNTHETIC Confluence')) !== undefined;
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const land = free(mine(snap, 'SYNTHETIC Confluence'));
    const pending = priorityOf(snap);
    if (land === undefined || pending === null) throw new Error('missing');
    const outcome = clickOutcome(pending, land.id, objectIndex(snap.view));
    if (outcome.kind !== 'choose') throw new Error(`expected a choice, got ${outcome.kind}`);
    expect(outcome.choices.map((c) => c.life)).toEqual(outcome.choices.map(() => 1));
    const life = snap.view.seats[0]?.life ?? 0;
    const choice = outcome.choices[0];
    if (choice === undefined) throw new Error('no choice');
    const done = await host.act(choice.action);
    expect(done.error).toBeNull();
    expect(done.view.seats[0]?.life).toBe(life - 1);
    const text = done.log.map((l) => l.text);
    expect(text).toContain('You pay 1 life.');
    expect(text.join('\n')).not.toContain('Your life:');
  });
});

describe('a land that was given a mana ability', () => {
  test("the Lantern's ability is in the land's menu", async () => {
    const reached = await reachPlus((s) => {
      const lantern = mine(s, 'SYNTHETIC Prism Lantern');
      const basic = free([...mine(s, 'Mountain'), ...mine(s, 'Plains')]);
      return priorityOf(s) !== null && lantern.length > 0 && basic !== undefined;
    });
    if (reached === null) throw new Error('no seed');
    const { snap } = reached;
    const basic = free([...mine(snap, 'Mountain'), ...mine(snap, 'Plains')]);
    const pending = priorityOf(snap);
    if (basic === undefined || pending === null) throw new Error('missing');
    const mana = pending.options.filter(
      (o) => o.kind === 'activateAbility' && o.source === basic.id,
    );
    // The printed tap and the five colors of the granted ability.
    expect(mana.length).toBeGreaterThan(1);
    const outcome = clickOutcome(pending, basic.id, objectIndex(snap.view));
    expect(outcome.kind).toBe('choose');
    if (outcome.kind !== 'choose') return;
    expect(outcome.choices).toHaveLength(mana.length);
    // As menu items (a land with an ability that is not a mana ability would show them): unique keys.
    const keys = menuItems(pending, basic.id, objectIndex(snap.view)).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

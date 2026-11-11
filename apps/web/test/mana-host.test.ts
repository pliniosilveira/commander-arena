/**
 * The mana-and-lands decisions (D-072) through the game host with the hidden SYNTHETIC deck
 * `synthetic-mana`: the shock land's question and its log lines, a manual tap of a two-colour land,
 * and the order of taps when a Signet is among the sources.
 */
import type { PendingDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { clickSource, setTapColor, type Tap } from '../src/ui/decisions/payment';
import { pressButton, reachMana, sourceNames } from './mana-decks';

const asks = (name: string) => (snap: { view: { pending: PendingDecision | null } }) => {
  const p = snap.view.pending;
  return p?.kind === 'confirmOptional' && p.cost !== undefined && p.sourceName === name;
};

describe('a shock land asks before it enters', () => {
  test('the question names the cost, Pay takes the life and the land enters untapped', async () => {
    const reached = await reachMana(asks('SYNTHETIC Shock Land'));
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'confirmOptional') throw new Error('wrong decision');
    expect(pending.cost).toEqual([{ kind: 'payLife', amount: 2 }]);
    const life = snap.view.seats[0]?.life ?? 0;
    const next = await host.act(pressButton(snap.view, 'Pay'));
    expect(next.error).toBeNull();
    const text = next.log.map((l) => l.text);
    expect(text).toContain('You pay 2 life.');
    expect(next.log.map((l) => l.text).join('\n')).not.toContain("'s ability");
    expect(next.view.seats[0]?.life).toBe(life - 2);
    const land = next.view.battlefield.find((o) => o.name === 'SYNTHETIC Shock Land');
    expect(land?.tapped).toBe(false);
  });

  test("Don't pay keeps the life, the land enters tapped, and the log says so", async () => {
    const reached = await reachMana(asks('SYNTHETIC Shock Land'));
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const life = snap.view.seats[0]?.life ?? 0;
    const next = await host.act(pressButton(snap.view, "Don't pay"));
    expect(next.error).toBeNull();
    expect(next.log.map((l) => l.text)).toContain(
      "You don't pay; SYNTHETIC Shock Land enters tapped.",
    );
    expect(next.view.seats[0]?.life).toBe(life);
    const land = next.view.battlefield.find((o) => o.name === 'SYNTHETIC Shock Land');
    expect(land?.tapped).toBe(true);
  });

  test('a permanent spell asks as it resolves: the source is the spell on the stack', async () => {
    const reached = await reachMana(asks('SYNTHETIC Shock Rock'));
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'confirmOptional') throw new Error('wrong decision');
    // The spell is on the stack, not an ability: it has a card's name and no `abilitySource`.
    const onStack = snap.view.stack.find((o) => o.id === pending.source);
    expect(onStack?.name).toBe('SYNTHETIC Shock Rock');
    expect(onStack?.abilitySource).toBeUndefined();
    const next = await host.act(pressButton(snap.view, "Don't pay"));
    expect(next.error).toBeNull();
    expect(next.log.map((l) => l.text)).toContain(
      "You don't pay; SYNTHETIC Shock Rock enters tapped.",
    );
  });
});

describe('manual payment', () => {
  test('a two-colour land offers exactly its colors and the chosen one is the one that is added', async () => {
    const reached = await reachMana(
      (s) =>
        s.view.pending?.kind === 'payMana' &&
        s.view.pending.manaSources.some((m) => (m.colors?.length ?? 0) > 1),
    );
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'payMana') throw new Error('wrong decision');
    const dual = pending.manaSources.find((m) => (m.colors?.length ?? 0) > 1);
    if (dual === undefined) throw new Error('no two-colour source');
    expect(dual.colors).toEqual(['U', 'B']);
    const click = clickSource([], pending.manaSources, dual.object);
    expect(click).toEqual({ kind: 'choose', abilityIndex: dual.abilityIndex });
    // R is not on offer: nothing is tapped. B is.
    expect(setTapColor([], pending.manaSources, dual.object, dual.abilityIndex, 'R')).toEqual([]);
    const taps = setTapColor([], pending.manaSources, dual.object, dual.abilityIndex, 'B');
    const next = await host.act(pressButton(snap.view, 'Pay (1 tap)', (ui) => ({ ...ui, taps })));
    expect(next.error).toBeNull();
    expect(next.view.pending?.kind).not.toBe('payMana');
    expect(next.log.map((l) => l.text).join('\n')).toContain('You cast');
  });

  test('a Signet taps after the sources that pay for it; the other order is refused with the cost named', async () => {
    const reached = await reachMana((s) => {
      const names = sourceNames(s);
      return (
        s.view.pending?.kind === 'payMana' &&
        names.includes('SYNTHETIC Signet') &&
        names.some((n) => n === 'SYNTHETIC Dual Land')
      );
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'payMana') throw new Error('wrong decision');
    const idOf = (name: string) =>
      pending.manaSources.find(
        (m) => snap.view.battlefield.find((o) => o.id === m.object)?.name === name,
      );
    const signet = idOf('SYNTHETIC Signet');
    const dual = idOf('SYNTHETIC Dual Land');
    if (signet === undefined || dual === undefined) throw new Error('missing source');
    const signetTap: Tap = { object: signet.object, abilityIndex: signet.abilityIndex };
    const dualTap: Tap = {
      object: dual.object,
      abilityIndex: dual.abilityIndex,
      color: 'U',
    };
    // The page sends the taps in the order the player clicked: the Signet first is refused by the
    // engine, whose message the payment panel shows inline.
    const wrong = await host.act(
      pressButton(snap.view, 'Pay (2 taps)', (ui) => ({ ...ui, taps: [signetTap, dualTap] })),
    );
    expect(wrong.error).toContain('costs {1}');
    expect(wrong.error).toContain('tap other sources first');
    expect(wrong.view.pending?.kind).toBe('payMana');
    // The land first, then the Signet paying with the land's mana.
    const right = await host.act(
      pressButton(snap.view, 'Pay (2 taps)', (ui) => ({ ...ui, taps: [dualTap, signetTap] })),
    );
    expect(right.error).toBeNull();
    expect(right.view.pending?.kind).not.toBe('payMana');
  });
});

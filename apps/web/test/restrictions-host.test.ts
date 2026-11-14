/**
 * Restrictions and evasion (D-094, D-098) in real games of the hidden SYNTHETIC deck
 * `synthetic-restrictions`: the engine's refusal of an attack that leaves out a creature that must
 * attack, the model's starting attack, and the explanation of a block the engine does not offer.
 * Each integration case pins a verified seed and fails instead of searching if its checkpoint moves.
 */

import { describe, expect, test, vi } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  evasionAsk,
  mustAttackAsk,
  type Session,
  searchRestrictions,
  startHost,
} from './restrictions-decks';

vi.setConfig({ testTimeout: 60_000 });

async function reach(
  accept: Parameters<typeof searchRestrictions>[1],
  seed: number,
): Promise<Session> {
  const reached = await searchRestrictions(startHost, accept, { seed });
  if (reached === null) throw new Error(`seed ${seed} missed the situation`);
  return reached.session;
}

function modelOf(snap: Snapshot, edit = (u: ReturnType<typeof initialUi>) => u) {
  const pending = snap.view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: unknown[] = [];
  const said: string[] = [];
  const ctl: Controller = {
    act: (a) => acts.push(a),
    update: () => {},
    openChooser: () => {},
    explain: (m) => said.push(m),
  };
  return { model: buildModel(snap.view, pending, edit(initialUi(pending)), ctl), acts, said };
}

describe('a creature that attacks each combat if able', () => {
  test('the engine refuses a declaration without it; the page starts with it chosen', async () => {
    const session = await reach(mustAttackAsk, 3);
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'declareAttackers') throw new Error('wrong decision');
    expect(await session.act({ kind: 'declareAttackers', attacks: [] })).toBeNull();

    const { model } = modelOf(snap);
    const names = asked.mustAttack.map(
      (id) => snap.view.battlefield.find((o) => o.id === id)?.name ?? '',
    );
    expect(names.every((n) => n === 'SYNTHETIC Berserker')).toBe(true);
    expect(model.bar.buttons[1]?.label).toBe(`Declare attackers (${asked.mustAttack.length})`);
    expect(model.interaction.selected.size).toBe(asked.mustAttack.length);
    for (const id of asked.mustAttack) expect(model.interaction.badge(id)).toBe('Must attack');
    expect(model.bar.detail).toContain('must attack each combat if able.');
  });

  test('the starting attack is accepted as it stands', async () => {
    const session = await reach(mustAttackAsk, 3);
    const snap = session.snapshot();
    const { model, acts } = modelOf(snap);
    model.bar.buttons[1]?.run();
    const sent = acts[0];
    if (sent === undefined) throw new Error('nothing sent');
    const next = await session.act(sent as never);
    expect(next).not.toBeNull();
    expect(next?.view.pending?.kind).not.toBe('declareAttackers');
  });
});

describe('a block the engine does not offer', () => {
  test("the bar explains it with the engine's own evasion rule while the blocker is picked up", async () => {
    const session = await reach(evasionAsk, 1);
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'declareBlockers') throw new Error('wrong decision');
    // A blocker that cannot block at least one attacker, and an attacker it cannot block.
    const blocker = asked.candidates.find((c) =>
      asked.attackers.some((a) => !c.canBlock.includes(a.attacker)),
    );
    if (blocker === undefined) throw new Error('no refused block');
    const { model } = modelOf(snap, (u) => ({
      ...u,
      block: { blocks: [], blocker: blocker.blocker },
    }));
    const detail = model.bar.detail ?? '';
    const name = snap.view.battlefield.find((o) => o.id === blocker.blocker)?.name ?? '';
    expect(detail).toContain(`${name} selected: click an attacker to block it.`);
    expect(detail).toMatch(/can't block .+ \((can't be blocked|islandwalk|fear|intimidate|shadow)/);
    // Everything the sentence names is an attacker that is not clickable for this blocker.
    for (const a of asked.attackers) {
      const aName = snap.view.battlefield.find((o) => o.id === a.attacker)?.name ?? '';
      if (detail.includes(`block ${aName} (`) || detail.includes(`or ${aName} (`)) {
        expect(blocker.canBlock).not.toContain(a.attacker);
      }
    }
  });
});

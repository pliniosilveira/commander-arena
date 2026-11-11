/**
 * "[Do something] unless [that player] pays" (CR 118.12a, D-111) through the game host with the hidden
 * SYNTHETIC deck `synthetic-triggers-more`: the question from the payer's seat and the "you may"
 * from the controller's seat with their exact wording, the log lines for every answer, and that none
 * of the answers can be taken back. Seeds are searched, not fixed.
 */
import { describe, expect, test, vi } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { mayEffectAsk, searchMore, unlessAsk } from './triggers-more-decks';
import type { Session } from './ward-decks';

vi.setConfig({ testTimeout: 60_000 });

const texts = (session: Session) => session.log().map((l) => l.text);

function modelOf(snap: Snapshot) {
  const pending = snap.view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: unknown[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(snap.view, pending, initialUi(pending), ctl), acts };
}

async function reach(accept: Parameters<typeof searchMore>[0]) {
  const reached = await searchMore(accept, { seeds: 80 });
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

describe("the human pays (or not) for the opponent's Tax Collector", () => {
  test("the question is worded from the payer's seat: Pay {1} or Opponent may draw a card", async () => {
    const { session } = await reach(unlessAsk);
    const snap = session.snapshot();
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe('Pay {1} or Opponent may draw a card?');
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Pay', "Don't pay"]);
    expect(model.bar.cancel).toBeNull();
  });

  test('Pay asks for the mana and then draws nothing for the opponent', async () => {
    const { session } = await reach(unlessAsk);
    const before = texts(session).length;
    let snap = await session.act({ kind: 'acceptOptional' });
    expect(snap?.view.pending?.kind).toBe('payMana');
    expect(modelOf(snap as Snapshot).model.bar.prompt).toBe(
      'Pay {1} or Opponent may draw a card: tap your mana sources.',
    );
    expect(modelOf(snap as Snapshot).model.bar.cancel?.label).toBe("Don't pay");
    snap = await session.act({ kind: 'payAuto' });
    expect(snap).not.toBeNull();
    const lines = texts(session).slice(before);
    expect(lines).toContain('You pay {1}.');
    expect(lines.join('\n')).not.toMatch(/Opponent (chooses|draws)/);
    // None of this can be taken back.
    expect((await session.host.undo()).error).toBe('Nothing to undo.');
  });

  test("Don't pay lets the effect happen: the log says so, the opponent is asked, and Undo is empty", async () => {
    const { session } = await reach(unlessAsk);
    const before = texts(session).length;
    await session.act({ kind: 'declineOptional' });
    const lines = texts(session).slice(before);
    expect(lines).toContain("You don't pay; Opponent may draw a card.");
    expect(lines.join('\n')).toMatch(
      /Opponent chooses to draw a card\.|Opponent chooses not to draw a card\./,
    );
    expect((await session.host.undo()).error).toBe('Nothing to undo.');
  });

  test('backing out of the payment is "do not pay" and says so', async () => {
    const { session } = await reach(unlessAsk);
    await session.act({ kind: 'acceptOptional' });
    const before = texts(session).length;
    await session.act({ kind: 'cancel' });
    expect(texts(session).slice(before)).toContain("You don't pay; Opponent may draw a card.");
    expect((await session.host.undo()).error).toBe('Nothing to undo.');
  });
});

describe('the human controls the Tax Collector', () => {
  test('after the opponent did not pay, the "you may" says who did not pay and what you do', async () => {
    const { session } = await reach(mayEffectAsk);
    const snap = session.snapshot();
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe("Opponent didn't pay {1}. Draw a card?");
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Yes', 'No']);
  });

  test('Yes and No are logged as drawing, not as using an ability', async () => {
    const yes = await reach(mayEffectAsk);
    const before = texts(yes.session).length;
    await yes.session.act({ kind: 'acceptOptional' });
    const lines = texts(yes.session).slice(before);
    expect(lines).toContain('You choose to draw a card.');
    expect(lines.some((l) => l.startsWith('You draw '))).toBe(true);

    const no = await reach(mayEffectAsk);
    const noBefore = texts(no.session).length;
    await no.session.act({ kind: 'declineOptional' });
    const noLines = texts(no.session).slice(noBefore);
    expect(noLines).toContain('You choose not to draw a card.');
    expect(noLines.some((l) => l.startsWith('You draw '))).toBe(false);
  });
});

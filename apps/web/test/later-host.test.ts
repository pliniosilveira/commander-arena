/**
 * Suspend, Madness, Foretell and the delayed draw (D-128) through the game host with the hidden SYNTHETIC
 * decks `synthetic-suspend`, `synthetic-madness`, `synthetic-foretell` and `synthetic-delayed`
 * (game/precons.ts: invented engine fixtures, not real cards): the buttons and their labels, the payment
 * of a special action and its Cancel, the questions, the words on the stack, the badges and the log, and
 * what the other player's view of a foretold card holds.
 */
import type { Action, GameView, ObjectView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { alternativeBadge } from '../src/game/alt-cost';
import { GameHost } from '../src/game/host';
import { delayedWording, dropYou, laterAbilityWords } from '../src/game/later-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { castBadge } from '../src/ui/decisions/flashback';
import { objectIndex } from '../src/ui/decisions/lookup';
import { optionalAsk } from '../src/ui/decisions/optional';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { clickOutcome } from '../src/ui/decisions/priority';
import { landBot, OPPONENT, priority, reach } from './alt-costs-decks';
import { must } from './costs-decks';
import { handOf, hostSession, type Session } from './ward-decks';

vi.setConfig({ testTimeout: 120_000 });

const texts = (session: Session) => session.log().map((l) => l.text);
const mineExile = (view: GameView, name: string): ObjectView | undefined =>
  view.exile.find((o) => o.owner === view.viewer && o.name === name);

/** Plays on with `bot` until `accept` holds for a decision of the viewer; returns the view. */
async function playOn(
  session: Session,
  bot: (view: GameView) => Action,
  accept: (view: GameView) => boolean,
  max = 1500,
): Promise<GameView> {
  for (let clicks = 0; clicks < max; clicks += 1) {
    const view = session.snapshot().view;
    if (view.result !== null || view.pending === null) break;
    if (view.pending.seat === view.viewer && accept(view)) return view;
    if ((await session.act(bot(view))) === null) break;
  }
  throw new Error('the game never reached the situation');
}

const canSuspend = (view: GameView) =>
  priority(view)?.options.some((o) => o.kind === 'suspend') === true;
const canForetell = (view: GameView) =>
  priority(view)?.options.some((o) => o.kind === 'foretell') === true;

describe('Suspend', () => {
  const NAME = 'SYNTHETIC Suspend Bear';

  test('button, payment, Cancel, the counters ticking down, the free cast with haste', async () => {
    const { session } = await reach('synthetic-suspend', canSuspend, 40);
    let view = session.snapshot().view;
    const decision = priority(view);
    const card = handOf(view).find((c) => c.name === NAME);
    if (decision === null || card === undefined) throw new Error('no bear');
    expect(card.specialActions).toEqual([{ kind: 'suspend', cost: ['G'], counters: 3 }]);

    // The click asks: the card can be cast for {2}{G} or suspended; with only {G} it can only be suspended.
    const outcome = clickOutcome(decision, card.id, objectIndex(view));
    if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
    const suspend = outcome.items.find((i) => i.key === 'suspend');
    expect(suspend?.label).toBe('Suspend 3 — {G}');
    expect(suspend?.action).toEqual({ kind: 'suspend', object: card.id });

    // The payment: worded, and Cancel gives priority back with the card still in the hand.
    let snap = await must(session, suspend?.action ?? { kind: 'pass' });
    view = snap.view;
    if (view.pending?.kind !== 'payMana') throw new Error('no payment');
    expect(view.pending.purpose).toBe('suspend');
    const index = objectIndex(view);
    expect(payBarPrompt(view.pending, index)).toBe(
      `Pay {G} to suspend ${NAME} with 3 time counters: tap your mana sources.`,
    );
    expect(payCancelLabel(view.pending)).toBe('Cancel');
    snap = await must(session, { kind: 'cancel' });
    expect(snap.view.pending?.kind).toBe('priority');
    expect(handOf(snap.view).some((c) => c.name === NAME)).toBe(true);
    expect(mineExile(snap.view, NAME)).toBeUndefined();

    // Pay: the card is in exile with three time counters, and the log says so.
    snap = await must(session, suspend?.action ?? { kind: 'pass' });
    snap = await must(session, { kind: 'payAuto' });
    const suspended = mineExile(snap.view, NAME);
    expect(suspended?.counters.time).toBe(3);
    expect(texts(session)).toContain(`You suspended ${NAME} with 3 time counters.`);
    expect(snap.view.pending?.kind).toBe('priority');

    // Up to the question: each of our upkeeps takes one counter, the ability says so on the stack.
    const words: string[] = [];
    const ticking = await playOn(
      session,
      (v) => {
        for (const item of v.stack) {
          if (item.ability !== undefined) {
            const w = laterAbilityWords(item.ability, item.name, item.controller === v.viewer);
            if (w !== null && !words.includes(w.does)) words.push(w.does);
          }
        }
        return landBot(v);
      },
      (v) => v.pending?.kind === 'confirmOptional',
    );
    expect(words).toContain(`Remove a time counter from ${NAME}.`);
    const asked = ticking.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('no question');
    expect(asked.purpose).toBe('suspend');
    expect(mineExile(ticking, NAME)?.counters.time ?? 0).toBe(0);
    const ask = optionalAsk(asked, objectIndex(ticking));
    expect(ask.prompt).toBe(
      `Cast ${NAME} now without paying its mana cost? (its last time counter was removed)`,
    );
    expect(ask.yes).toBe('Cast it');
    expect(ask.no).toBe("Don't cast it (it stays in exile)");
    // The cast-from-suspend ability on the stack says what it does.
    const castAbility = ticking.stack.find((o) => o.ability?.effect.kind === 'castExiled');
    expect(
      castAbility?.ability === undefined
        ? null
        : laterAbilityWords(castAbility.ability, castAbility.name, true)?.does,
    ).toBe(`Cast ${NAME} without paying its mana cost.`);

    snap = await must(session, { kind: 'acceptOptional' });
    const spell = snap.view.stack.find((o) => o.name === NAME && o.abilitySource === undefined);
    expect(spell?.suspended).toBe(true);
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('suspended');
    expect(texts(session).join('\n')).toContain(`casts ${NAME}`.replace('casts', 'cast'));
    // Resolve it: the permanent has haste and the badge.
    for (let i = 0; i < 4 && !snap.view.battlefield.some((o) => o.name === NAME); i += 1) {
      snap = await must(session, { kind: 'pass' });
    }
    const bear = snap.view.battlefield.find((o) => o.name === NAME);
    expect(bear?.alternative).toBe('suspend');
    expect(bear?.keywords).toContain('haste');
    expect(alternativeBadge(bear ?? ({} as never))?.text).toBe('suspended');
  });
});

describe('Madness', () => {
  const NAME = 'SYNTHETIC Madness Cycler';

  test('cycling discards it to exile; the question names the cost; the cast is badged', async () => {
    const hasCycle = (v: GameView) =>
      priority(v)?.options.some((o) => o.kind === 'activate') === true && myLandsCount(v) >= 2;
    const { session } = await reach('synthetic-madness', hasCycle, 40);
    let view = session.snapshot().view;
    const decision = priority(view);
    const activate = decision?.options.find((o) => o.kind === 'activate');
    if (activate === undefined) throw new Error('no cycling');
    let snap = await must(session, activate);
    view = snap.view;
    if (view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    // The cycling ability resolves; the madness ability is a trigger of the exiled card.
    for (let i = 0; i < 6 && snap.view.pending?.kind !== 'confirmOptional'; i += 1) {
      snap = await must(session, { kind: 'pass' });
    }
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('no madness question');
    expect(asked.purpose).toBe('madness');
    const ask = optionalAsk(asked, objectIndex(snap.view));
    expect(ask.prompt).toBe(`Cast ${NAME} for its madness cost {B}?`);
    expect(ask.yes).toBe('Cast it for {B}');
    expect(ask.no).toBe("Don't cast it (it goes to the graveyard)");
    expect(texts(session).join('\n')).toContain(`${NAME} was exiled with madness.`);
    const ability = snap.view.stack.find((o) => o.ability?.effect.kind === 'castExiled');
    expect(
      ability?.ability === undefined
        ? null
        : laterAbilityWords(ability.ability, ability.name, true)?.does,
    ).toBe(`Cast ${NAME} for its madness cost.`);

    snap = await must(session, { kind: 'acceptOptional' });
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    const spell = snap.view.stack.find((o) => o.name === NAME && o.abilitySource === undefined);
    expect(spell?.alternative).toBe('madness');
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('madness');
    expect(texts(session).join('\n')).toContain(`You cast ${NAME} for its madness cost.`);
  });
});

function myLandsCount(view: GameView): number {
  return view.battlefield.filter((o) => o.controller === view.viewer && o.types.includes('land'))
    .length;
}

describe('Foretell', () => {
  const NAME = 'SYNTHETIC Foretell Giant';

  test('the button, the payment, the foretold card as ours, the cast from the next turn', async () => {
    const { session } = await reach('synthetic-foretell', canForetell, 40);
    let view = session.snapshot().view;
    const decision = priority(view);
    const card = handOf(view).find((c) => c.name === NAME);
    if (decision === null || card === undefined) throw new Error('no giant');
    expect(card.specialActions).toEqual([{ kind: 'foretell', cost: ['2'], castCost: ['1', 'G'] }]);
    const outcome = clickOutcome(decision, card.id, objectIndex(view));
    if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
    const foretell = outcome.items.find((i) => i.key === 'foretell');
    expect(foretell?.label).toBe('Foretell {2}');

    let snap = await must(session, foretell?.action ?? { kind: 'pass' });
    view = snap.view;
    if (view.pending?.kind !== 'payMana') throw new Error('no payment');
    expect(view.pending.purpose).toBe('foretell');
    expect(payBarPrompt(view.pending, objectIndex(view))).toBe(
      `Pay {2} to foretell ${NAME}: tap your mana sources.`,
    );
    snap = await must(session, { kind: 'cancel' });
    expect(snap.view.pending?.kind).toBe('priority');
    snap = await must(session, foretell?.action ?? { kind: 'pass' });
    snap = await must(session, { kind: 'payAuto' });

    // Ours: the full card, face down, with its foretell cost and the log naming it.
    const mine = mineExile(snap.view, NAME);
    expect(mine?.faceDown).toBe(true);
    expect(mine?.foretold).toBe(true);
    expect(mine?.alternativeCosts).toEqual([{ kind: 'foretell', cost: ['1', 'G'] }]);
    expect(texts(session)).toContain(`You foretold ${NAME}.`);
    expect(texts(session).filter((t) => t.includes(NAME) && t.includes('goes to'))).toEqual([]);

    // Not castable this turn; castable from the next one, labelled "Cast for {1}{G}".
    const castable = (v: GameView) => {
      const o = mineExile(v, NAME);
      const d = priority(v);
      return (
        o !== undefined &&
        d?.options.some((x) => x.kind === 'castSpell' && x.object === o.id) === true
      );
    };
    expect(castable(snap.view)).toBe(false);
    const later = await playOn(session, landBot, castable);
    const exiled = mineExile(later, NAME);
    const pending = priority(later);
    if (exiled === undefined || pending === null) throw new Error('not castable');
    expect(later.turn).toBeGreaterThan(mine?.foretoldTurn ?? 99);
    const click = clickOutcome(pending, exiled.id, objectIndex(later));
    if (click.kind !== 'act') throw new Error(`expected an action, got ${click.kind}`);
    expect(click.action).toEqual({
      kind: 'castSpell',
      object: exiled.id,
      alternative: 'foretell',
    });
    expect(castBadge(pending, new Set([exiled.id]), objectIndex(later), exiled.id)).toBe(
      'Cast for {1}{G}',
    );
    snap = await must(session, click.action);
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    const spell = snap.view.stack.find((o) => o.name === NAME);
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('foretold');
  });

  test('the other player sees a face-down card and the log names nothing', async () => {
    // The AI plays the foretell deck; the scripted human plays lands.
    for (let seed = 1; seed <= 40; seed += 1) {
      const host = new GameHost({ clock: () => 0 });
      const first = (
        await host.newGame({ seed, humanDeck: OPPONENT, aiDeck: 'synthetic-foretell' })
      ).snapshot;
      const session = hostSession(host, first);
      let found = false;
      for (let clicks = 0; clicks < 800 && !found; clicks += 1) {
        const view = session.snapshot().view;
        if (view.result !== null || view.pending === null) break;
        found = view.exile.some((o) => o.faceDown === true);
        if (found) break;
        if ((await session.act(landBot(view))) === null) break;
      }
      if (!found) continue;
      const view = session.snapshot().view;
      const down = view.exile.filter((o) => o.faceDown === true);
      expect(down.every((o) => o.owner !== view.viewer)).toBe(true);
      for (const o of down) {
        expect(o.name).toBe('Face-down card');
        expect(o.foretold).toBeUndefined();
        expect(o.alternativeCosts).toBeUndefined();
      }
      expect(JSON.stringify(view)).not.toContain(NAME);
      expect(texts(session).join('\n')).not.toContain(NAME);
      expect(texts(session)).toContain('Opponent foretold a card.');
      return;
    }
    throw new Error('the opponent never foretold a card');
  });
});

describe('The delayed draw', () => {
  const NAME = 'SYNTHETIC Delayed Insight';

  test('the ability on the stack at the next upkeep says "the next turn\'s upkeep"', async () => {
    const hasSpell = (v: GameView) =>
      priority(v)?.options.some(
        (o) =>
          o.kind === 'castSpell' && handOf(v).some((c) => c.id === o.object && c.name === NAME),
      ) === true;
    const { session } = await reach('synthetic-delayed', hasSpell, 40);
    const view = session.snapshot().view;
    const card = handOf(view).find((c) => c.name === NAME);
    const cast = priority(view)?.options.find(
      (o) => o.kind === 'castSpell' && o.object === card?.id,
    );
    if (cast === undefined) throw new Error('no spell');
    let snap = await must(session, cast);
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    snap = await must(session, { kind: 'pass' });
    // Pass until the delayed trigger is on the stack.
    const found = await playOn(session, landBot, (v) =>
      v.stack.some((o) => o.ability?.kind === 'triggered' && o.name === NAME),
    );
    const item = found.stack.find((o) => o.name === NAME && o.ability !== undefined);
    if (item?.ability === undefined) throw new Error('no ability on the stack');
    expect(delayedWording(item.ability, item.oracleText)).toBe(
      "At the beginning of the next turn's upkeep",
    );
    expect(dropYou(triggerGist(item.ability, undefined))).toBe('draw a card');
    expect(item?.controller).toBe(found.viewer);
  });
});

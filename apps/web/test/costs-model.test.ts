/**
 * Additional costs, cost reductions and free casts (D-095, D-101) as pure models: the cast labels,
 * the cost a card has now, the words of the sacrifice and discard questions of a cast and of Ward's
 * discard, the Cancel of a cost question and the log lines. Fake views and states, no DOM.
 */
import type {
  Action,
  ChooseCardsDecision,
  ChoosePermanentDecision,
  ConfirmOptionalDecision,
  Cost,
  GameEvent,
  GameState,
  GameView,
  ObjectView,
  PendingDecision,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  additionalCostsText,
  sacrificeWhat,
  unlessCostAsk,
  unlessCostPhrase,
  unlessCostText,
} from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { cardsPrompt, discardTitle } from '../src/ui/decisions/cards-picker';
import {
  castCostChanged,
  castCostSuffix,
  costNowTitle,
  shownCost,
  symbolsText,
} from '../src/ui/decisions/cast-cost';
import { castLabel } from '../src/ui/decisions/flashback';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { optionalAsk, wardPrompt } from '../src/ui/decisions/optional';
import { choosePermanentPrompt, isSpellCost } from '../src/ui/decisions/permanents';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const card = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: ['instant'],
    manaCost: null,
    oracleText: '',
    keywords: [],
    targets: [],
    ...patch,
  }) as ObjectView;

const sacrifice = (what: Extract<Cost, { kind: 'sacrifice' }>['what']): Cost => ({
  kind: 'sacrifice',
  what,
});
const discard = (count = 1): Cost => ({ kind: 'discard', count });

describe('the cost a card has now', () => {
  const bolt = card(1, 'Wrath', { manaCost: ['8', 'R'], castCost: ['5', 'R'] });
  const plain = card(2, 'Bolt', { manaCost: ['R'], castCost: ['R'] });
  const free = card(3, 'Freebie', { manaCost: ['2'], castCost: [] });

  test('it differs from the printed cost only when a tax or a reduction applies', () => {
    expect(castCostChanged(bolt)).toBe(true);
    expect(castCostChanged(plain)).toBe(false);
    expect(castCostChanged(card(4, 'Land'))).toBe(false);
    expect(castCostChanged(undefined)).toBe(false);
  });

  test('a split card is never compared, and a face card is compared with its front face', () => {
    const split = card(5, 'A // B', {
      layout: 'split',
      manaCost: ['R', 'U'],
      castCost: ['R'],
    });
    expect(castCostChanged(split)).toBe(false);
    const adventure = card(6, 'Bear', {
      layout: 'adventure',
      manaCost: ['1', 'G'],
      castCost: ['1', 'G'],
      faces: [{ manaCost: ['1', 'G'] }, { manaCost: ['R'] }] as unknown as NonNullable<
        ObjectView['faces']
      >,
    });
    expect(castCostChanged(adventure)).toBe(false);
  });

  test('the text, the shown cost and the hover title', () => {
    expect(symbolsText(['5', 'R'])).toBe('{5}{R}');
    expect(symbolsText([])).toBe('{0}');
    expect(shownCost(bolt)).toEqual(['5', 'R']);
    expect(shownCost(plain)).toEqual(['R']);
    expect(shownCost(free)).toEqual([]);
    expect(costNowTitle(bolt)).toContain('Costs {5}{R} now (printed {8}{R})');
    expect(costNowTitle(plain)).toBeNull();
    expect(costNowTitle(free)).toContain('Costs {0} now (printed {2})');
    expect(castCostSuffix(bolt)).toBe(' for {5}{R}');
    expect(castCostSuffix(plain)).toBe('');
  });
});

describe('the cast labels', () => {
  const wrath = card(1, 'Wrath', { manaCost: ['8', 'R'], castCost: ['5', 'R'] });
  const cast = (patch: Partial<Extract<PriorityOption, { kind: 'castSpell' }>> = {}) =>
    ({ kind: 'castSpell', object: 'o1', ...patch }) as Extract<
      PriorityOption,
      { kind: 'castSpell' }
    >;

  test('a plain cast says its cost only when it differs from the printed one', () => {
    expect(castLabel(cast(), wrath, 'Wrath')).toBe('Cast Wrath for {5}{R}');
    expect(castLabel(cast(), card(2, 'Bolt', { manaCost: ['R'], castCost: ['R'] }), 'Bolt')).toBe(
      'Cast Bolt',
    );
    expect(castLabel(cast(), undefined, 'it')).toBe('Cast it');
  });

  test('a free cast says so, and never names a cost', () => {
    expect(castLabel(cast({ alternative: 'free' }), wrath, 'Wrath')).toBe(
      'Cast Wrath without paying its mana cost',
    );
  });

  test('a free cast of a face names the face', () => {
    const owl = card(3, 'Bear // Chop', {
      layout: 'adventure',
      faces: [
        { name: 'Bear', manaCost: ['1', 'G'], types: ['creature'], supertypes: [], subtypes: [] },
        { name: 'Chop', manaCost: ['R'], types: ['instant'], supertypes: [], subtypes: [] },
      ] as unknown as NonNullable<ObjectView['faces']>,
    });
    expect(
      castLabel(cast({ object: 'o3', alternative: 'free', face: 1 }), owl, 'Bear // Chop'),
    ).toBe('Cast Chop (Adventure) without paying its mana cost');
  });

  test('a card with the ordinary cast and the free option gets a menu with both', () => {
    const d: PriorityDecision = {
      id: 'd1',
      seat: 0,
      kind: 'priority',
      options: [{ kind: 'pass' }, cast(), cast({ alternative: 'free' })],
    };
    const outcome = clickOutcome(d, 'o1', lookupIndexFor([wrath]));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => [i.key, i.label])).toEqual([
      ['cast', 'Cast Wrath for {5}{R}'],
      ['cast-free', 'Cast Wrath without paying its mana cost'],
    ]);
    expect(outcome.items.map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: 'o1' },
      { kind: 'castSpell', object: 'o1', alternative: 'free' },
    ]);
  });

  test('a card whose only option is the free one is cast by a click', () => {
    const d: PriorityDecision = {
      id: 'd1',
      seat: 0,
      kind: 'priority',
      options: [{ kind: 'pass' }, cast({ alternative: 'free' })],
    };
    expect(clickOutcome(d, 'o1', lookupIndexFor([wrath]))).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: 'o1', alternative: 'free' },
    });
  });
});

describe('words for costs', () => {
  test('what a sacrifice names', () => {
    expect(sacrificeWhat({ types: ['creature'] })).toBe('a creature');
    expect(sacrificeWhat({ types: ['artifact'], other: true })).toBe('another artifact');
    expect(sacrificeWhat({ anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] })).toBe(
      'an artifact or creature',
    );
    expect(sacrificeWhat({ types: ['creature'], colors: ['B'] })).toBe('a black creature');
    expect(sacrificeWhat({ notTypes: ['land'] })).toBe('a nonland permanent');
    expect(sacrificeWhat({ types: ['land'] })).toBe('a land');
    expect(sacrificeWhat({ kind: 'this' })).toBe('this');
  });

  test('the additional costs of the preview', () => {
    expect(additionalCostsText(undefined)).toBe('');
    expect(additionalCostsText([])).toBe('');
    expect(additionalCostsText([sacrifice({ types: ['creature'] })])).toBe('Sacrifice a creature');
    expect(additionalCostsText([sacrifice({ types: ['creature'] }), discard()])).toBe(
      'Sacrifice a creature, discard a card',
    );
    expect(additionalCostsText([{ kind: 'payLife', amount: 3 }])).toBe('Pay 3 life');
    expect(additionalCostsText([{ kind: 'mana', symbols: ['1'] }])).toBe('{1}');
    expect(additionalCostsText([discard(2)])).toBe('Discard 2 cards');
  });

  test('the cost of a "pay or it is countered" question reads with its own verb', () => {
    expect(unlessCostPhrase([{ kind: 'mana', symbols: ['2'] }])).toBe('pay {2}');
    expect(unlessCostPhrase([discard()])).toBe('discard a card');
    expect(unlessCostPhrase([discard(2)], true)).toBe('discards 2 cards');
    expect(unlessCostPhrase([{ kind: 'mana', symbols: ['1'] }, discard()])).toBe(
      'pay {1} and discard a card',
    );
    expect(unlessCostPhrase([{ kind: 'payLife', amount: 2 }], true)).toBe('pays 2 life');
    expect(unlessCostAsk([discard()])).toBe('Discard a card');
    expect(unlessCostAsk([{ kind: 'payLife', amount: 3 }])).toBe('Pay 3 life');
    expect(unlessCostText([discard()])).toBe('a card');
    expect(wardPrompt([discard()], 'Lightning Bolt')).toBe(
      'Discard a card or Lightning Bolt is countered?',
    );
  });

  test("a ward that discards says Discard and Don't discard on its buttons", () => {
    const ask = (cost: Cost[]): ConfirmOptionalDecision => ({
      id: 'd1',
      seat: 0,
      kind: 'confirmOptional',
      source: 'o9',
      sourceName: 'Guard',
      sourceOracleText: '',
      cost,
      purpose: 'ward',
      subject: 'o1',
    });
    const index = lookupIndexFor([card(1, 'Lightning Bolt', { zone: 'stack' })]);
    expect(optionalAsk(ask([discard()]), index)).toEqual({
      prompt: 'Discard a card or Lightning Bolt is countered?',
      yes: 'Discard',
      no: "Don't discard",
      cancellable: false,
    });
    expect(optionalAsk(ask([{ kind: 'mana', symbols: ['2'] }]), index).yes).toBe('Pay');
    expect(optionalAsk(ask([{ kind: 'mana', symbols: ['1'] }, discard()]), index).yes).toBe('Pay');
  });
});

describe('the sacrifice question of a cast', () => {
  const spell = card(1, 'Sacrifice Draw', {
    zone: 'stack',
    additionalCosts: [sacrifice({ types: ['creature'] })],
  });
  const bolt = card(2, 'Offering Bolt', {
    zone: 'stack',
    additionalCosts: [sacrifice({ anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] })],
  });
  const ability = card(3, 'Altar', { zone: 'stack', abilitySource: 'o9' });
  const index = lookupIndexFor([spell, bolt, ability]);
  const ask = (source: string, patch: Partial<ChoosePermanentDecision> = {}) =>
    ({
      id: 'd1',
      seat: 0,
      kind: 'choosePermanent',
      source,
      purpose: 'sacrifice',
      min: 1,
      max: 1,
      legal: ['o10', 'o11'],
      forCost: true,
      ...patch,
    }) as ChoosePermanentDecision;

  test('a spell: an additional cost, named from the card', () => {
    expect(choosePermanentPrompt(ask('o1'), index)).toBe(
      'Sacrifice a creature as an additional cost to cast Sacrifice Draw.',
    );
    expect(choosePermanentPrompt(ask('o2'), index)).toBe(
      'Sacrifice an artifact or creature as an additional cost to cast Offering Bolt.',
    );
    expect(isSpellCost(ask('o1'), index)).toBe(true);
  });

  test('an ability keeps its wording, and an effect is not a cost', () => {
    expect(choosePermanentPrompt(ask('o3'), index)).toBe('Sacrifice a permanent to pay for Altar.');
    expect(isSpellCost(ask('o3'), index)).toBe(false);
    expect(choosePermanentPrompt(ask('o1', { forCost: false }), index)).toBe(
      'Sacrifice a permanent for Sacrifice Draw.',
    );
    expect(isSpellCost(ask('o1', { forCost: false }), index)).toBe(false);
  });

  test('a spell whose card names no sacrifice is not guessed at', () => {
    const odd = card(4, 'Odd', { zone: 'stack' });
    expect(choosePermanentPrompt(ask('o4'), lookupIndexFor([odd]))).toBe(
      'Sacrifice a permanent as an additional cost to cast Odd.',
    );
  });

  test('the bar has a Cancel that sends cancel', () => {
    const decision = ask('o1');
    const { model, acts } = harness(decision, [spell]);
    expect(model.bar.prompt).toBe(
      'Sacrifice a creature as an additional cost to cast Sacrifice Draw.',
    );
    expect(model.bar.cancel?.label).toBe('Cancel');
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
  });
});

describe('the discard questions', () => {
  const spell = card(1, 'Discard Burn', { zone: 'stack' });
  const ability = card(3, 'Scavenger Bear', { zone: 'stack', abilitySource: 'o9' });
  const warded = card(5, 'Tithe Warded Guard', { zone: 'battlefield', types: ['creature'] });
  const bolt = card(6, 'Lightning Bolt', {
    zone: 'stack',
    targets: [{ kind: 'object', id: 'o5', specId: 't1' }],
  });
  const wardTrigger = card(7, 'Tithe Warded Guard', {
    zone: 'stack',
    abilitySource: 'o5',
    ability: {
      kind: 'triggered',
      trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'opponent' },
      effect: {
        kind: 'counterUnlessPays',
        objects: { kind: 'triggerSubject' },
        cost: [discard()],
      },
    } as unknown as NonNullable<ObjectView['ability']>,
  });
  const index = lookupIndexFor([spell, ability, warded, bolt, wardTrigger]);
  const ask = (source: string, patch: Partial<ChooseCardsDecision> = {}) =>
    ({
      id: 'd1',
      seat: 0,
      kind: 'chooseCards',
      source,
      purpose: 'discard',
      zone: 'hand',
      legal: ['o20', 'o21'],
      min: 1,
      max: 1,
      reveal: true,
      prompt: 'Discard a card.',
      ...patch,
    }) as ChooseCardsDecision;

  test('a spell: an additional cost, with a title that names the spell', () => {
    const d = ask('o1', { forCost: true });
    expect(cardsPrompt(d, index)).toBe(
      'Discard a card as an additional cost to cast Discard Burn.',
    );
    expect(discardTitle(d, index)).toBe('Discard to cast Discard Burn');
  });

  test('an activation: paid for the ability', () => {
    const d = ask('o3', { forCost: true });
    expect(cardsPrompt(d, index)).toBe("Discard a card to pay for Scavenger Bear's ability.");
    expect(discardTitle(d, index)).toBe("Discard to pay for Scavenger Bear's ability");
  });

  test("Ward's discard is worded like the ward payment, naming the spell that targeted the creature", () => {
    const d = ask('o7');
    expect(cardsPrompt(d, index)).toBe('Discard a card or Lightning Bolt is countered?');
    expect(discardTitle(d, index)).toBe('Discard from your hand');
  });

  test('Ward names "that spell" when the view does not pin it down', () => {
    const twin = card(8, 'Murder', {
      zone: 'stack',
      targets: [{ kind: 'object', id: 'o5', specId: 't1' }],
    });
    const d = ask('o7');
    expect(cardsPrompt(d, lookupIndexFor([warded, bolt, twin, wardTrigger]))).toBe(
      'Discard a card or that spell is countered?',
    );
  });

  test('an effect keeps the engine prompt, and a question the view cannot place too', () => {
    expect(cardsPrompt(ask('o1'), index)).toBe('Discard a card.');
    expect(cardsPrompt(ask('o99', { forCost: true }), index)).toBe('Discard a card.');
    expect(cardsPrompt(ask('o1', { purpose: 'search', prompt: 'Search.' }), index)).toBe('Search.');
  });

  test('only a discard cost has a Cancel: it rewinds the whole cast', () => {
    const cost = harness(ask('o1', { forCost: true }), [spell]);
    expect(cost.model.bar.prompt).toBe(
      'Discard a card as an additional cost to cast Discard Burn.',
    );
    expect(cost.model.bar.cancel?.label).toBe('Cancel');
    cost.model.bar.cancel?.run();
    expect(cost.acts).toEqual([{ kind: 'cancel' }]);

    const ward = harness(ask('o7'), [warded, bolt, wardTrigger]);
    expect(ward.model.bar.prompt).toBe('Discard a card or Lightning Bolt is countered?');
    expect(ward.model.bar.cancel).toBeNull();
    expect(harness(ask('o1'), [spell]).model.bar.cancel).toBeNull();
  });
});

describe('the log', () => {
  const state = (patch: Record<string, unknown> = {}) =>
    ({
      objects: {
        o1: {
          card: 'c1',
          token: null,
          stack: { kind: 'spell' },
          controller: 0,
          zone: 'stack',
          face: 0,
        },
        o2: { card: 'c2', token: null, stack: null, controller: 0, zone: 'hand', face: 0 },
        o3: {
          card: null,
          token: null,
          stack: { kind: 'ability', source: 'o4' },
          controller: 0,
          zone: 'stack',
          face: 0,
        },
        o4: { card: 'c3', token: null, stack: null, controller: 0, zone: 'battlefield', face: 0 },
        o5: { card: 'c4', token: null, stack: null, controller: 0, zone: 'graveyard', face: 0 },
      },
      cards: {
        c1: { definition: 'd1' },
        c2: { definition: 'd2' },
        c3: { definition: 'd3' },
        c4: { definition: 'd4' },
      },
      definitions: {
        d1: { name: 'Sacrifice Draw', faces: [{}] },
        d2: { name: 'Island', faces: [{}] },
        d3: { name: 'Scavenger Bear', faces: [{}] },
        d4: { name: 'Grizzly Bears', faces: [{}] },
      },
      lki: {},
      pending: null,
      casting: null,
      ...patch,
    }) as unknown as GameState;
  const casting = (object: string, activation: unknown) =>
    ({ seat: 0, object, activation }) as unknown as GameState['casting'];
  const text = (event: GameEvent, before: GameState, after: GameState = before, viewer = 0) =>
    describeEvent(event, before, after, viewer)?.text;

  test('a free cast says so, with its tax and kicker in order', () => {
    const cast = (patch: Record<string, unknown>) =>
      ({
        kind: 'spellCast',
        seat: 0,
        object: 'o1',
        commanderTax: 0,
        ...patch,
      }) as unknown as GameEvent;
    expect(text(cast({ alternative: 'free' }), state())).toBe(
      'You cast Sacrifice Draw without paying its mana cost.',
    );
    expect(text(cast({ alternative: 'free', commanderTax: 2 }), state())).toBe(
      'You cast Sacrifice Draw (commander tax 2) without paying its mana cost.',
    );
    expect(text(cast({ alternative: 'flashback' }), state())).toBe(
      'You cast Sacrifice Draw with flashback.',
    );
    expect(text(cast({}), state())).toBe('You cast Sacrifice Draw.');
    expect(text(cast({ alternative: 'free' }), state(), state(), 1)).toBe(
      'Opponent casts Sacrifice Draw without paying its mana cost.',
    );
  });

  const chosen = (automatic: boolean, source = 'o1') =>
    ({
      kind: 'permanentsChosen',
      seat: 0,
      source,
      objects: ['o5'],
      purpose: 'sacrifice',
      automatic,
    }) as unknown as GameEvent;

  test('a sacrifice paid as the additional cost of a spell says so', () => {
    const before = state({ casting: casting('o1', null) });
    expect(text(chosen(false), before)).toBe(
      'You choose Grizzly Bears to sacrifice as an additional cost to cast Sacrifice Draw.',
    );
    expect(text(chosen(true), before)).toBe(
      'You must sacrifice Grizzly Bears as an additional cost to cast Sacrifice Draw: no other choice.',
    );
    expect(describeEvent(chosen(false), before, before, 0)?.rule).toBe('CR 601.2h');
  });

  test("an effect's or an ability's sacrifice keeps its wording", () => {
    expect(text(chosen(false), state())).toBe(
      'You choose Grizzly Bears to sacrifice for Sacrifice Draw.',
    );
    const ability = state({ casting: casting('o3', { source: 'o4' }) });
    expect(text(chosen(false, 'o3'), ability)).toBe(
      "You choose Grizzly Bears to sacrifice for Scavenger Bear's ability.",
    );
  });

  const discarded = { kind: 'discarded', seat: 0, object: 'o5' } as unknown as GameEvent;

  test('a discard says whose cost it paid', () => {
    expect(text(discarded, state({ casting: casting('o1', null) }))).toBe(
      'You discard Grizzly Bears as an additional cost to cast Sacrifice Draw.',
    );
    expect(text(discarded, state({ casting: casting('o3', { source: 'o4' }) }))).toBe(
      "You discard Grizzly Bears to pay for Scavenger Bear's ability.",
    );
    expect(text(discarded, state())).toBe('You discard Grizzly Bears.');
    // The opponent's cast is not the viewer's: the casting transaction belongs to seat 1.
    const theirs = state({
      casting: { seat: 1, object: 'o1', activation: null } as unknown as GameState['casting'],
    });
    expect(text(discarded, theirs)).toBe('You discard Grizzly Bears.');
  });

  test('a payer\'s Ward discard: "You discard a card for ward."', () => {
    const asked = {
      kind: 'confirmOptional',
      seat: 0,
      source: 'o3',
      sourceName: 'Guard',
      sourceOracleText: '',
      cost: [discard()],
      purpose: 'ward',
      subject: 'o1',
    } as unknown as PendingDecision;
    const answered = (accepted: boolean) =>
      ({ kind: 'optionalAnswered', seat: 0, source: 'o3', accepted }) as unknown as GameEvent;
    expect(text(answered(true), state({ pending: asked }))).toBe('You discard a card for ward.');
    expect(text(answered(false), state({ pending: asked }))).toBe(
      "You don't pay; Sacrifice Draw is countered.",
    );
    const theirs = {
      kind: 'optionalAnswered',
      seat: 1,
      source: 'o3',
      accepted: true,
    } as unknown as GameEvent;
    expect(text(theirs, state({ pending: { ...asked, seat: 1 } }))).toBe(
      'Opponent discards a card for ward.',
    );
  });
});

/** A fake game view holding `objects` on the stack and a model for `pending`, with its actions. */
function harness(pending: PendingDecision, objects: readonly ObjectView[]) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'precombatMain',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: [],
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(view, pending, initialUi(pending), ctl), acts };
}

/**
 * The web side of D-149 (the Angels slice) as pure models: the words of the new replacements, statics, conditions, effects, triggers and
 * mana restrictions read from the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here), the cost of blocking,
 * the questions (proliferate, the host of an Aura, the creatures tapped to cast a spell), one target for each opponent and a copy of a
 * divided spell. No DOM.
 */
import {
  type Ability,
  type Action,
  type ChoosePermanentDecision,
  type ChosenTarget,
  type DeclareBlockersDecision,
  type GameView,
  type ObjectId,
  type ObjectView,
  type PayManaDecision,
  type PendingDecision,
  syntheticCard,
  type TargetChoiceSpec,
  type TargetsDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { alternativeLogWords } from '../src/game/alt-cost';
import { angelsConditionWords, turnNumberWords } from '../src/game/angels-conditions';
import { exileUntilText, manaRestrictionWording, restrictionWords } from '../src/game/angels-text';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { thingsPhrase } from '../src/game/filter-text';
import { lordWordings } from '../src/game/static-text';
import { filterPhrase, triggerWording } from '../src/game/trigger-text';
import { activationLabel, triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { alternativeLabel, tapAlternativeLabel } from '../src/ui/decisions/alt-cost';
import {
  blockCostDetail,
  blockCostHint,
  blockCostRow,
  blockCostText,
  blockCostWarning,
  blockTaxDetail,
  blockTaxPrompt,
} from '../src/ui/decisions/block-tax';
import { keptDivisionText, keptTargets } from '../src/ui/decisions/copy-division';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { choosePermanentPrompt, chosenBadge } from '../src/ui/decisions/permanents';
import {
  angelsBadge,
  angelsPermanentPrompt,
  auraHostTitle,
  counterSummary,
  isAuraHost,
  isProliferate,
  isSpellTap,
  poisonChipLabel,
  proliferateAnswer,
  proliferateChipLabel,
  proliferateConfirmLabel,
  proliferateDetail,
  togglePlayer,
} from '../src/ui/decisions/permanents-angels';
import { targetsPrompt, targetsWord } from '../src/ui/decisions/target-prompt';
import {
  answerTargets,
  clickableTargets,
  currentSlot,
  targetsReady,
  toggleTarget,
} from '../src/ui/decisions/targeting';
import { initialUi } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => face(name).abilities;
const noun = (name: string) =>
  face(name).types.includes('creature') ? 'creature' : (face(name).types[0] ?? 'permanent');
const notes = (name: string) => lordWordings(abilitiesOf(name), { noun: noun(name) });
const triggered = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'triggered')[at];
  if (found?.kind !== 'triggered') throw new Error(`no triggered ability ${at} on ${name}`);
  return found;
};
const mana = (name: string) => {
  const found = abilitiesOf(name).find((a) => a.kind === 'mana');
  if (found?.kind !== 'mana') throw new Error(`no mana ability on ${name}`);
  return found;
};

describe('replacements', () => {
  test("life gain: the amount is the card's", () => {
    expect(notes('SYNTHETIC Vital Angel')).toContain(
      'If you would gain life, you gain that much life plus 1 instead.',
    );
  });

  test('creatures that enter with counters: a number, a count of what is already there, the chosen type', () => {
    expect(notes('SYNTHETIC Chief Angel')).toEqual([
      'Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.',
    ]);
    expect(notes('SYNTHETIC Type Mimic')).toEqual([
      'Each other creature you control of the chosen type enters with an additional +1/+1 counter on it.',
    ]);
    expect(notes('SYNTHETIC Growth Banner')).toEqual([
      'Each nontoken creature you control enters with 2 additional +1/+1 counters on it.',
    ]);
  });
});

describe('statics', () => {
  test('protection of the player and the end of the game say one sentence for the pair', () => {
    expect(notes('SYNTHETIC Warded Angel')).toEqual(['You have hexproof.']);
    expect(notes('SYNTHETIC Undying Herald')).toEqual([
      "You can't lose the game and your opponents can't win the game.",
    ]);
  });

  test('prevention to the permanent says its scope', () => {
    expect(notes('SYNTHETIC Shielded Seraph')).toEqual([
      'Prevent all combat damage that would be dealt to this creature.',
    ]);
    expect(notes('SYNTHETIC Stone Seraph')).toEqual([
      'Prevent all damage that would be dealt to this creature.',
    ]);
  });

  test('a card that cannot be cast in the first turns says which', () => {
    expect(notes('SYNTHETIC Late Avenger')).toEqual([
      "You can't cast this card during your first three turns of the game.",
    ]);
  });

  test('the tax on blocking, always or while the creature attacks', () => {
    expect(notes('SYNTHETIC Toll Bridge')).toEqual([
      "Creatures can't block unless their controller pays {1} for each of those creatures.",
    ]);
    expect(notes('SYNTHETIC Tithe Angel')).toEqual([
      "As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
    ]);
  });

  test("the Angels' grant that reads a keyword is the existing wording", () => {
    expect(notes('SYNTHETIC Sky Blade Angel')).toEqual([
      'Other creatures you control with flying have indestructible.',
    ]);
  });
});

describe('conditions', () => {
  test('the turn number', () => {
    expect(turnNumberWords({ cmp: 'atMost', value: 3 }, false)).toBe(
      "it's one of your first three turns",
    );
    expect(turnNumberWords({ cmp: 'atLeast', value: 4 }, false)).toBe(
      "it's your fourth turn or later",
    );
    expect(turnNumberWords({ cmp: 'atLeast', value: 4 }, true)).toBe(
      "it's one of your first three turns",
    );
    expect(turnNumberWords({ cmp: 'equal', value: 2 }, false)).toBe("it's your second turn");
    expect(turnNumberWords({ cmp: 'atMost', value: 1 }, false)).toBe("it's your first turn");
  });

  test('permanents with the same name and whom the attackers attacked', () => {
    expect(
      gameConditionWords({ kind: 'sameNameAtLeast', filter: { types: ['land'] }, count: 3 }),
    ).toBe('you control 3 or more lands with the same name');
    expect(gameConditionWords({ kind: 'attackersAttackedYou' })).toBe(
      'at least one of those creatures attacked you',
    );
    expect(gameConditionWords({ kind: 'not', term: { kind: 'attackersAttackedYou' } })).toBe(
      'none of those creatures attacked you',
    );
    expect(angelsConditionWords({ kind: 'didPrevious' }, false)).toBeNull();
  });

  test('the permanent that triggered the ability', () => {
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'triggerSubject' },
        filter: { subtypes: ['Plains'] },
      }),
    ).toBe('that permanent is a Plains');
    // The card an earlier instruction moved is still "it".
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'moved' },
        filter: { subtypes: ['Zombie'], types: ['creature'] },
      }),
    ).toMatch(/^it's /);
  });

  test('an activation says when it may be activated', () => {
    const atlas = abilitiesOf('SYNTHETIC Land Atlas').find((a) => a.kind === 'activated');
    if (atlas?.kind !== 'activated') throw new Error('no ability');
    expect(activationLabel(undefined, { abilityIndex: 0, ability: atlas })).toBe(
      '{2}, {T}: You draw a card. Activate only if you control 3 or more lands with the same name.',
    );
  });
});

describe('triggers', () => {
  const ctx = { self: 'this creature' };

  test('life gained and counters put', () => {
    expect(triggerWording({ kind: 'lifeGained', who: 'you' }, ctx)).toBe('Whenever you gain life');
    expect(triggerWording({ kind: 'lifeGained', who: 'you', firstEachTurn: true }, ctx)).toBe(
      'Whenever you gain life for the first time each turn',
    );
    expect(
      triggerWording(
        { kind: 'countersAdded', what: { kind: 'this' }, counter: '+1/+1', by: 'you' },
        ctx,
      ),
    ).toBe('Whenever you put one or more +1/+1 counters on this creature');
    expect(
      triggerWording(
        { kind: 'countersAdded', what: { types: ['creature'] }, counter: '+1/+1', by: 'any' },
        ctx,
      ),
    ).toBe('Whenever one or more +1/+1 counters are put on a creature');
  });

  test('attack batches', () => {
    expect(triggerWording({ kind: 'attackBatch', who: 'you', atLeast: 2 }, ctx)).toBe(
      'Whenever you attack with two or more creatures',
    );
    expect(
      triggerWording(
        { kind: 'attackBatch', who: 'opponent', atLeast: 3, what: { subtypes: ['Angel'] } },
        ctx,
      ),
    ).toBe('Whenever another player attacks with three or more Angels');
  });

  test('the limit of once each turn goes with the event', () => {
    const base = triggered('SYNTHETIC Raid Marshal');
    expect(triggerCondition({ ...base } as never, 'Marshal', undefined, true)).toBe(
      'whenever you attack with two or more creatures',
    );
    expect(
      triggerCondition({ ...base, oncePerTurn: true } as never, 'Marshal', undefined, true),
    ).toBe('whenever you attack with two or more creatures (only once each turn)');
  });

  test('"none of those creatures attacked you" is in the gist of the ability', () => {
    expect(triggerGist(triggered('SYNTHETIC Raid Marshal', 1) as never, undefined)).toBe(
      'If none of those creatures attacked you, that player draws a card',
    );
  });

  test('your commander is not "a commander you control"', () => {
    expect(filterPhrase({ commander: 'yours' })).toBe('your commander');
    expect(filterPhrase({ commander: true, controller: 'you' })).toBe('a commander you control');
    expect(thingsPhrase({ commander: 'yours' }, true)).toBeNull();
    expect(triggerWording({ kind: 'entersBattlefield', what: { commander: 'yours' } }, ctx)).toBe(
      'Whenever your commander enters',
    );
  });
});

describe('effects', () => {
  test('proliferate and exile until', () => {
    const grasp = triggered('SYNTHETIC Grasp of Law');
    expect(triggerGist(grasp as never, face('SYNTHETIC Grasp of Law') as never)).toBe(
      'For each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield',
    );
    const warden = abilitiesOf('SYNTHETIC Banishing Warden').find((a) => a.kind === 'activated');
    if (warden?.kind !== 'activated') throw new Error('no ability');
    expect(
      activationLabel(face('SYNTHETIC Banishing Warden') as never, {
        abilityIndex: 1,
        ability: warden,
      }),
    ).toBe(
      '{2}{W}: Exile target creature an opponent controls until this creature leaves the battlefield',
    );
    const choir = triggered('SYNTHETIC Choirmaster');
    expect(triggerGist(choir as never, undefined)).toBe('Proliferate');
    expect(
      exileUntilText({ kind: 'exile', objects: { kind: 'this' } }, undefined, 'it', 'creature'),
    ).toBeNull();
  });

  test('mana that can be spent only on some spells, and mana of the chosen color', () => {
    expect(manaRestrictionWording(mana('SYNTHETIC Font Angel'))).toBe(
      '{T}: Add {W}. Spend this mana only to cast an Angel spell',
    );
    expect(manaRestrictionWording(mana('SYNTHETIC Elf Shrine'))).toBe(
      '{T}: Add {G}. Spend this mana only to cast an Elf creature spell',
    );
    expect(manaRestrictionWording(mana('SYNTHETIC Builder Rock'))).toBe(
      '{T}: Add {C}{C}. Spend this mana only to cast an artifact or creature spell',
    );
    expect(manaRestrictionWording(mana('SYNTHETIC Colored Banner'))).toBe(
      '{T}: Add one mana of the chosen color',
    );
    // An ordinary mana ability has nothing to add.
    expect(
      manaRestrictionWording({
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['W'] },
      }),
    ).toBeNull();
    expect(restrictionWords({ kind: 'spellMatch', subtypes: ['Angel'] })).toBe(
      'Spend only to cast an Angel spell',
    );
    expect(restrictionWords({ kind: 'abilitiesOnly' })).toBe('Spend only to activate abilities');
  });
});

describe('the log', () => {
  test('proliferate has a line, life gained and its trigger none of its own', () => {
    const state = { objects: {}, cards: {}, seats: [] } as never;
    expect(
      describeEvent({ kind: 'proliferated', seat: 0, objects: [] } as never, state, state, 0),
    ).toMatchObject({ text: 'You proliferate.' });
    expect(alternativeLogWords('tapPermanents')).toBe('by tapping creatures');
    expect(alternativeLogWords('overload')).toBe('for its overload cost');
  });
});

describe('the cast by tapping creatures', () => {
  const entry = {
    kind: 'tapPermanents',
    cost: ['W'],
    tap: { filter: { types: ['creature'], keywords: ['flying'] }, count: 4 },
  } as const;
  const card = { alternativeCosts: [entry] } as unknown as ObjectView;

  test('the cast button says the mana and the creatures', () => {
    expect(tapAlternativeLabel(entry)).toBe('Cast for {W}, tapping four creatures with flying');
    expect(alternativeLabel('tapPermanents', card)).toBe(
      'Cast for {W}, tapping four creatures with flying',
    );
    expect(tapAlternativeLabel({ ...entry, cost: [] })).toBe(
      'Cast by tapping four creatures with flying',
    );
    expect(alternativeLabel('tapPermanents', undefined)).toBe('Tap creatures');
  });
});

const obj = (id: string, extra: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name: `Card ${id}`,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    counters: {},
    zone: 'battlefield',
    ...extra,
  }) as unknown as ObjectView;

const permanentDecision = (over: Partial<ChoosePermanentDecision>): ChoosePermanentDecision =>
  ({
    kind: 'choosePermanent',
    id: 'd1',
    seat: 0,
    source: 'o9',
    purpose: 'proliferate',
    min: 0,
    max: 2,
    legal: ['o1', 'o2'],
    ...over,
  }) as unknown as ChoosePermanentDecision;

function harness(
  pending: PendingDecision,
  objects: readonly ObjectView[] = [],
  ui: Partial<ReturnType<typeof initialUi>> = {},
  stack: readonly ObjectView[] = [],
) {
  const view = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'main1',
    battlefield: objects,
    stack,
    exile: [],
    combat: null,
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0, poison: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 2 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(view, pending, { ...initialUi(pending), ...ui }, ctl), acts, view };
}

describe('proliferate', () => {
  const spell = obj('o9', { name: 'Spreading Growth', zone: 'stack', types: ['sorcery'] });
  const bears = obj('o1', { name: 'Grizzly Bears', counters: { '+1/+1': 2, page: 1 } });
  const rat = obj('o2', { name: 'Rat', controller: 1, counters: { '-1/-1': 1 } });
  const d = permanentDecision({ players: [1] });
  const index = lookupIndexFor([spell, bears, rat]);

  test('what the question is', () => {
    expect(isProliferate(d)).toBe(true);
    expect(angelsPermanentPrompt(d, index)).toBe(
      'Proliferate for Spreading Growth: choose any number of permanents and players with counters.',
    );
    expect(angelsBadge(d, index)).toBe('Proliferate');
    expect(counterSummary({ '+1/+1': 2, page: 1, stun: 0 })).toBe(
      '2 +1/+1 counters, 1 page counter',
    );
    expect(proliferateChipLabel('Grizzly Bears', bears.counters, 'yours')).toBe(
      'Grizzly Bears (2 +1/+1 counters, 1 page counter), yours',
    );
    expect(poisonChipLabel(1, 0, 2)).toBe('Opponent (2 poison counters)');
    expect(poisonChipLabel(0, 0, 1)).toBe('You (1 poison counter)');
  });

  test('nothing chosen is an answer, and says so', () => {
    expect(proliferateDetail(0, 0)).toBe(
      'Click permanents or players to proliferate them, or Confirm to proliferate nothing.',
    );
    expect(proliferateConfirmLabel(0, 0)).toBe('Proliferate nothing');
    const { model, acts } = harness(d, [bears, rat], {}, [spell]);
    const confirm = model.bar.buttons[0];
    expect(confirm?.label).toBe('Proliferate nothing');
    expect(confirm?.disabled).toBeFalsy();
    confirm?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [] }]);
  });

  test('the answer carries the permanents and the players chosen', () => {
    expect(proliferateDetail(1, 1)).toBe(
      '1 permanent and 1 player chosen: each gets another counter of each kind it has. Click again to take one back.',
    );
    const { model, acts } = harness(d, [bears, rat], { permanents: ['o1'], players: [1] }, [spell]);
    expect(model.bar.buttons[0]?.label).toBe('Proliferate (2)');
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: ['o1'], players: [1] }]);
    expect(model.interaction.clickableSeats.has(1)).toBe(true);
    expect(model.interaction.clickableSeats.has(0)).toBe(false);
    expect(model.interaction.selectedSeats.has(1)).toBe(true);
    expect(model.interaction.badge('o1')).toBe('Proliferate');
  });

  test('players are toggled, and a player the decision does not list is ignored', () => {
    expect(togglePlayer([], d, 1)).toEqual([1]);
    expect(togglePlayer([1], d, 1)).toEqual([]);
    expect(togglePlayer([], d, 0)).toEqual([]);
    expect(proliferateAnswer(['o1'], [])).toEqual({ kind: 'choosePermanents', objects: ['o1'] });
  });
});

describe('the host of an Aura and the tap of a spell', () => {
  const aura = obj('o5', { name: 'Angelic Mantle', zone: 'graveyard', types: ['enchantment'] });
  const spell = obj('o9', { name: 'Sky Blade Angel', zone: 'stack', types: ['creature'] });
  const birds = ['o1', 'o2', 'o3', 'o4', 'o6'].map((id) => obj(id, { name: 'Mana Bird' }));

  test('what an Aura that enters by an effect will enchant', () => {
    const d = permanentDecision({ purpose: 'auraHost', min: 1, max: 1, subject: 'o5' });
    const index = lookupIndexFor([aura, spell, ...birds]);
    expect(isAuraHost(d)).toBe(true);
    expect(angelsPermanentPrompt(d, index)).toBe('Choose what Angelic Mantle enters attached to.');
    expect(auraHostTitle(d, index)).toBe('Attach Angelic Mantle');
    expect(angelsBadge(d, index)).toBe('Enchant');
    // The sacrifice words are never used for it.
    expect(choosePermanentPrompt(d, index)).toContain('Sacrifice');
    const { model } = harness(d, birds, {}, [spell, aura]);
    expect(model.bar.prompt).toBe('Choose what Angelic Mantle enters attached to.');
  });

  test('the creatures tapped for a spell', () => {
    const d = permanentDecision({
      purpose: 'tap',
      forCost: true,
      min: 4,
      max: 4,
      legal: birds.map((b) => b.id),
    });
    const index = lookupIndexFor([spell, ...birds]);
    expect(isSpellTap(d, index)).toBe(true);
    expect(angelsPermanentPrompt(d, index)).toBe(
      'Choose 4 untapped creatures to tap as the alternative cost of Sky Blade Angel.',
    );
    expect(chosenBadge(d, index)).not.toBeNull();
    expect(angelsBadge(d, index)).toBe('Tap');
    // The tap cost of an ability on the stack keeps its own words.
    const ability = obj('o8', {
      name: "Vehicle's ability",
      zone: 'stack',
      abilitySource: 'o7',
    } as never);
    expect(isSpellTap({ ...d, source: 'o8' }, lookupIndexFor([ability]))).toBe(false);
    const { model, acts } = harness(d, birds, { permanents: ['o1', 'o2', 'o3', 'o4'] }, [spell]);
    expect(model.bar.buttons[0]?.disabled).toBeFalsy();
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: ['o1', 'o2', 'o3', 'o4'] }]);
    // Cancel takes the whole cast back.
    expect(model.bar.cancel?.label).toBe('Cancel');
  });
});

describe('the cost of blocking', () => {
  const angel = obj('o3', { name: 'Archangel of Tithes', controller: 1 });
  const index = lookupIndexFor([angel, obj('o1'), obj('o2')]);
  const blockers = (affordable: number): DeclareBlockersDecision =>
    ({
      kind: 'declareBlockers',
      id: 'd1',
      seat: 0,
      candidates: [
        { blocker: 'o1', canBlock: ['o3'] },
        { blocker: 'o2', canBlock: ['o3'] },
      ],
      attackers: [{ attacker: 'o3', minBlockers: 1 }],
      blockCost: { cost: ['1'], affordable, source: 'o3' },
    }) as unknown as DeclareBlockersDecision;
  const pick = (...ids: ObjectId[]) =>
    ids.map((blocker) => ({ blocker, attacker: 'o3' as ObjectId }));

  test('what one blocker costs and what the mana covers', () => {
    const row = blockCostRow(blockers(1), pick('o1'), index);
    expect(row && blockCostText(row)).toBe(
      'Blocking costs {1} per creature (Archangel of Tithes). Your mana covers 1 creature now.',
    );
    expect(
      blockCostRow(blockers(0), [], index) &&
        blockCostText(blockCostRow(blockers(0), [], index) as never),
    ).toContain('Your mana covers none now.');
    // Several taxes are one cost.
    const two = blockCostRow(
      { blockCost: { cost: ['1', '1'], affordable: 2, source: 'o3' } },
      [],
      index,
    );
    expect(two && blockCostText(two)).toContain('Blocking costs {2} per creature');
  });

  test('the total for the chosen blockers, and a warning for too many', () => {
    expect(blockCostDetail(blockCostRow(blockers(2), [], index))).toBeNull();
    expect(blockCostDetail(blockCostRow(blockers(2), pick('o1', 'o2'), index))).toBe(
      'These blocks cost {2}.',
    );
    const over = blockCostRow(blockers(1), pick('o1', 'o2'), index);
    expect(over?.over).toBe(true);
    expect(over && blockCostWarning(over)).toContain(
      'You can pay for 1 blocking creature; 2 are chosen.',
    );
    expect(blockCostHint(over)).toBe('You can pay for at most 1 blocker');
    expect(blockCostHint(blockCostRow(blockers(0), pick('o1'), index))).toBe(
      'You cannot pay for any blocker',
    );
    expect(blockCostRow({}, pick('o1'), index)).toBeNull();
  });

  test('Confirm waits for blocks that can be paid', () => {
    const fits = harness(blockers(1), [angel, obj('o1'), obj('o2')], {
      block: { blocks: pick('o1'), blocker: null },
    });
    expect(fits.model.bar.buttons[0]?.disabled).toBe(false);
    expect(fits.model.bar.detail).toContain('These blocks cost {1}.');
    const over = harness(blockers(1), [angel, obj('o1'), obj('o2')], {
      block: { blocks: pick('o1', 'o2'), blocker: null },
    });
    expect(over.model.bar.buttons[0]?.disabled).toBe(true);
    expect(over.model.bar.buttons[0]?.hint).toBe('You can pay for at most 1 blocker');
    // No blockers cost nothing, whatever the mana is.
    const none = harness(blockers(0), [angel], {});
    expect(none.model.bar.buttons[0]?.disabled).toBe(false);
  });

  test('the payment after the declaration', () => {
    const pay = {
      kind: 'payMana',
      id: 'd2',
      seat: 0,
      source: 'o3',
      totalCost: ['1', '1'],
      manaSources: [],
      purpose: 'blockTax',
      blocks: pick('o1', 'o2'),
    } as unknown as PayManaDecision;
    expect(blockTaxPrompt(pay)).toBe(
      'Pay {1} per blocking creature (2 total) so these creatures can block: tap your mana sources.',
    );
    expect(blockTaxPrompt({ ...pay, totalCost: ['1'], blocks: pick('o1') })).toBe(
      'Pay {1} so this creature can block: tap your mana sources.',
    );
    expect(blockTaxDetail(pay, index)).toBe(
      'Card o1, Card o2 will block once this is paid. The cost is from Archangel of Tithes.',
    );
    expect(payBarPrompt(pay, index)).toBe(blockTaxPrompt(pay));
    expect(payCancelLabel(pay)).toBe('Choose other blockers');
  });
});

describe('one target for each opponent', () => {
  const group = (id: string, seat: number): ChosenTarget =>
    ({ kind: 'object', id, specId: 't1', group: seat }) as unknown as ChosenTarget;
  const spec: TargetChoiceSpec = {
    specId: 't1',
    min: 0,
    max: 2,
    onePerGroup: true,
    legal: [group('o1', 1), group('o2', 1), group('o3', 2)],
  };
  const plain = (id: ObjectId): ChosenTarget => ({ kind: 'object', id, specId: '' });

  test('a second target of the same player replaces the first', () => {
    let picks = toggleTarget([spec], [], plain('o1'));
    expect(picks).toEqual([{ kind: 'object', id: 'o1', specId: 't1' }]);
    picks = toggleTarget([spec], picks, plain('o2'));
    expect(picks).toEqual([{ kind: 'object', id: 'o2', specId: 't1' }]);
    picks = toggleTarget([spec], picks, plain('o3'));
    expect(picks.map((p) => (p.kind === 'object' ? p.id : ''))).toEqual(['o2', 'o3']);
    // A click on a chosen target takes it back.
    expect(toggleTarget([spec], picks, plain('o2'))).toEqual([
      { kind: 'object', id: 'o3', specId: 't1' },
    ]);
    expect(targetsReady([spec], [])).toBe(true);
  });

  test('a full slot stays open to a swap', () => {
    const picks = toggleTarget([spec], toggleTarget([spec], [], plain('o1')), plain('o3'));
    expect(clickableTargets([spec], picks).objects.has('o2')).toBe(true);
  });

  test('the prompt says one for each opponent', () => {
    expect(targetsWord(spec)).toBe('up to one target for each opponent');
    expect(targetsWord({ ...spec, min: 1 })).toBe('one target for each opponent');
    const { onePerGroup: _one, ...single } = spec;
    expect(targetsWord({ ...single, max: 1 })).toBe('a target');
    const d = {
      kind: 'targets',
      id: 'd',
      seat: 0,
      source: 'o9',
      specs: [spec],
    } as unknown as TargetsDecision;
    expect(
      targetsPrompt(
        d,
        lookupIndexFor([obj('o9', { name: 'Grasp of Law' })]),
        currentSlot([spec], []),
      ),
    ).toBe('Choose up to one target for each opponent for Grasp of Law.');
  });
});

describe('a copy of a divided spell', () => {
  const t = (id: string, share?: number): ChosenTarget =>
    ({
      kind: 'object',
      id,
      specId: 't1',
      ...(share === undefined ? {} : { share }),
    }) as ChosenTarget;
  const spec: TargetChoiceSpec = {
    specId: 't1',
    min: 2,
    max: 2,
    keepsDivision: true,
    legal: [t('o1'), t('o2'), t('o3')],
  };
  const d = {
    kind: 'targets',
    id: 'd',
    seat: 0,
    source: 'o9',
    specs: [spec],
    forCopy: true,
    current: [t('o1', 2), t('o2', 1)],
  } as unknown as TargetsDecision;
  const index = lookupIndexFor([
    obj('o9', { name: 'Arc Volley', zone: 'stack' }),
    obj('o1', { name: 'Bear' }),
    obj('o2', { name: 'Goblin' }),
    obj('o3', { name: 'Wolf' }),
  ]);

  test('the shares of the original are read only', () => {
    expect(keptTargets(d).map((x) => x.share)).toEqual([2, 1]);
    expect(keptDivisionText(d, index, 0)).toBe(
      'The original division stays: Bear 2, Goblin 1. A new target takes the share of the one it replaces.',
    );
    const { keepsDivision: _kept, ...divides } = spec;
    expect(keptDivisionText({ ...d, specs: [divides] }, index, 0)).toBeNull();
    expect(targetsPrompt(d, index, currentSlot(d.specs, d.current ?? []))).toBe(
      'Choose new targets for the copy of Arc Volley. The division stays the same.',
    );
  });

  test('the answer names no share', () => {
    expect(answerTargets(d.specs, d.current ?? [])).toEqual([t('o1'), t('o2')]);
    const { model, acts } = harness(d, [obj('o1'), obj('o2')], {
      targets: [t('o1', 2), t('o3')],
    });
    expect(model.bar.detail).toContain('The original division stays');
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'chooseTargets', targets: [t('o1'), t('o3')] }]);
    // A target that is not a copy's, or a slot that divides, is not touched.
    const plainSpec: TargetChoiceSpec = {
      specId: 't1',
      min: 0,
      max: 3,
      divide: 3,
      legal: [t('o1')],
    };
    expect(answerTargets([plainSpec], [t('o1', 3)])).toEqual([t('o1', 3)]);
  });
});

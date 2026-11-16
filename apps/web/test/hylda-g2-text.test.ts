/**
 * The words of group 2 of the Hylda deck (D-517 to D-525) as pure models: the gists of the triggered abilities of the SYNTHETIC cards (read from the engine's fixtures, so a wording that
 * drifts from the AST fails here), the effect words of "doesn't untap during its controller's next untap step" and "creatures your opponents control enter tapped", the amount of
 * card types among cards in a graveyard, and the log line of a "choose up to one" that chose no mode. No DOM.
 */
import { type StackAbility, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { describeEvents } from '../src/game/describe';
import {
  entersTappedText,
  groupOfTargetPlayerText,
  isSeveral,
  keepTappedText,
} from '../src/game/hylda-text';
import { conditionText, triggerGist } from '../src/ui/decisions/ability-label';
import {
  isPickOne,
  modesCountWords,
  modesSelectionLegal,
  toggleMode,
} from '../src/ui/decisions/modes-picker';

const triggered = (name: string): readonly StackAbility[] =>
  (syntheticCard(name).faces[0]?.abilities ?? []).flatMap((a) =>
    a.kind === 'triggered' ? [a as unknown as StackAbility] : [],
  );

describe('the gists of the triggered abilities', () => {
  test('tap everything a chosen opponent controls: the group of the target player', () => {
    const [enters] = triggered('SYNTHETIC Gale Binder');
    if (enters === undefined) throw new Error('no ability');
    expect(triggerGist(enters, undefined)).toBe('Tap all creatures target opponent controls');
  });

  test('tap a creature and keep it tapped', () => {
    const [cast] = triggered('SYNTHETIC Chill Spirit');
    if (cast === undefined) throw new Error('no ability');
    expect(triggerGist(cast, undefined)).toBe(
      "Tap target creature an opponent controls. Target creature an opponent controls doesn't untap during its controller's next untap step",
    );
  });

  test('the permanent an Aura enchants, with the test of the intervening "if"', () => {
    const [upkeep] = triggered('SYNTHETIC Drowsy Aura');
    if (upkeep === undefined) throw new Error('no ability');
    expect(triggerGist(upkeep, undefined)).toBe(
      "Tap the permanent it's attached to if this permanent is attached to an untapped creature",
    );
  });

  test('a target creature of the player of the turn, and four card types in the graveyard', () => {
    // The first ability is the enters trigger, which has no condition; the last is the delirium one.
    const both = triggered('SYNTHETIC Ghost Sentinel');
    const last = both[both.length - 1];
    if (last === undefined) throw new Error('no ability');
    expect(triggerGist(last, undefined)).toBe(
      'Tap target creature that opponent controls if the number of card types among cards in your graveyard is 4 or greater',
    );
    expect(
      conditionText({
        kind: 'amountIs',
        amount: { kind: 'cardTypesAmong', filter: { zone: 'graveyard', controller: 'you' } },
        compare: { cmp: 'atLeast', value: 4 },
      }),
    ).toBe('the number of card types among cards in your graveyard is 4 or greater');
  });

  test('the Dragons ability of the siege', () => {
    const siege = triggered('SYNTHETIC Dawn Siege');
    const dragons = siege[siege.length - 1];
    if (dragons === undefined) throw new Error('no ability');
    expect(triggerGist(dragons, undefined)).toBe('Tap target creature that opponent controls');
  });
});

describe('the effect words', () => {
  test('one creature says "doesn\'t", several say "don\'t", and the verb follows what the words say', () => {
    expect(keepTappedText('target creature', false)).toBe(
      "Target creature doesn't untap during its controller's next untap step",
    );
    expect(keepTappedText('all creatures target player controls', true)).toBe(
      "All creatures target player controls don't untap during their controllers' next untap steps",
    );
    expect(isSeveral('target creature')).toBe(false);
    expect(isSeveral('all creatures target player controls')).toBe(true);
    expect(isSeveral('up to two target creatures')).toBe(true);
  });

  test('creatures that enter tapped, for a turn or until the next one', () => {
    expect(
      entersTappedText({
        kind: 'permanentsEnterTapped',
        permanents: { types: ['creature'], controller: 'opponent' },
        duration: 'untilYourNextTurn',
      }),
    ).toBe('Until your next turn, creatures your opponents control enter tapped');
    expect(
      entersTappedText({
        kind: 'permanentsEnterTapped',
        permanents: { types: ['creature'], controller: 'opponent' },
        duration: 'untilEndOfTurn',
      }),
    ).toBe('Creatures your opponents control enter tapped this turn');
  });

  test('the group of a target player, from a filter that says only the kind', () => {
    expect(
      groupOfTargetPlayerText(
        { types: ['creature'], controlledBy: { kind: 'target', id: 't1' } },
        'target player',
      ),
    ).toBe('all creatures target player controls');
  });

  test('the number of card types among cards, in an amount', () => {
    expect(
      amountPhrase(
        { kind: 'cardTypesAmong', filter: { zone: 'graveyard', controller: 'you' } },
        {},
      ),
    ).toBe('the number of card types among cards in your graveyard');
  });
});

describe('"choose up to one" in the modes dialog (D-524)', () => {
  const modes = [
    { index: 0, text: 'a', legal: true },
    { index: 1, text: 'b', legal: true },
  ];

  test('a minimum of 0 toggles, so that the pick can be taken back and no mode chosen', () => {
    const d = { min: 0, max: 1, modes };
    expect(isPickOne(d)).toBe(false);
    expect(toggleMode(d, [], 0)).toEqual([0]);
    expect(toggleMode(d, [0], 0)).toEqual([]);
    expect(toggleMode(d, [0], 1)).toEqual([0]);
    expect(modesCountWords({ min: 0, max: 1 })).toBe('up to one');
  });

  test('"choose one" is still a radio button', () => {
    const d = { min: 1, max: 1, modes };
    expect(isPickOne(d)).toBe(true);
    expect(toggleMode(d, [0], 0)).toEqual([0]);
    expect(toggleMode(d, [0], 1)).toEqual([1]);
  });

  test('with no mode picked, Confirm is allowed when the empty set is legal', () => {
    expect(modesSelectionLegal({ sets: [[], [0], [1]] }, [])).toBe(true);
    expect(modesSelectionLegal({ sets: [[0], [1]] }, [])).toBe(false);
  });
});

describe('the log', () => {
  test('a "choose up to one" ability that chose no mode is removed and says so, with the rule', () => {
    const g = scenario()
      .seat(0)
      .library('Island', 'Island', 'Island')
      .battlefield('SYNTHETIC Slumber Geist')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .battlefield('Grizzly Bears')
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    const before = g.state;
    const mark = g.mark();
    g.act(0).chooseModes();
    const described = describeEvents(g.eventsSince(mark), before, g.state, 0);
    const removed = described.find((d) => d.text.includes('had no mode chosen'));
    expect(removed?.text).toBe(
      "SYNTHETIC Slumber Geist's ability had no mode chosen and is removed.",
    );
    expect(removed?.rule).toBe('CR 603.3c');
  });
});

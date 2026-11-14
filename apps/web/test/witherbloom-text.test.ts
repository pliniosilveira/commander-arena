import type { ObjectView, StackAbility } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { othersEnterWithCountersWording } from '../src/game/angels-text';
import { gameConditionWords } from '../src/game/condition-text';
import { copyAbilityWords } from '../src/game/copy-text';
import { chipsOf } from '../src/ui/board/keywords';
import { triggerGist } from '../src/ui/decisions/ability-label';

const triggered = (effect: StackAbility['effect']): StackAbility => ({
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'you' },
  effect,
});

describe('Witherbloom amounts and conditions', () => {
  test('life and event-time permanent history have readable descriptions', () => {
    expect(amountPhrase({ kind: 'lifeGainedThisTurn' })).toBe(
      'the amount of life you gained this turn',
    );
    expect(
      amountPhrase({
        kind: 'enteredThisTurn',
        types: ['creature'],
        token: false,
        controller: 'you',
      }),
    ).toBe('the number of nontoken creatures that entered under your control this turn');
    expect(amountPhrase({ kind: 'diedThisTurn', types: ['creature'], controller: 'you' })).toBe(
      'the number of creatures that died under your control this turn',
    );
    expect(amountPhrase({ kind: 'diedThisTurn', controller: 'any' })).toBe(
      'the number of permanents put into graveyards from the battlefield this turn',
    );
    expect(amountPhrase({ kind: 'thisWay', what: 'sacrificedOwn' })).toBe(
      'the number of permanents you sacrificed this way',
    );
    expect(
      othersEnterWithCountersWording({
        kind: 'othersEnterWithCounters',
        what: { types: ['creature'], token: false, controller: 'you' },
        counter: '+1/+1',
        count: { kind: 'diedThisTurn', types: ['creature'], controller: 'you' },
      }),
    ).toContain('for each of the creatures that died under your control this turn');
  });

  test('an opponent life total is not described as your life total', () => {
    expect(
      gameConditionWords({
        kind: 'lifeTotal',
        player: 'opponent',
        compare: { cmp: 'atMost', value: 10 },
      }),
    ).toBe('an opponent has 10 or less life');
    expect(gameConditionWords({ kind: 'thisWayAtLeast', what: 'sacrificedOwn', count: 1 })).toBe(
      'you sacrificed a permanent this way',
    );
    expect(
      gameConditionWords({
        kind: 'objectMatches',
        of: { kind: 'moved' },
        filter: { types: ['creature'] },
        inZone: 'exile',
      }),
    ).toBe('a creature card is exiled this way');
  });
});

describe('Witherbloom ability labels', () => {
  test('preparation and the delayed combat trigger name the correct objects', () => {
    const prepare = { kind: 'prepare', objects: { kind: 'this' } } as const;
    expect(triggerGist(triggered(prepare), undefined)).toContain('becomes prepared');
    expect(
      triggerGist(
        triggered({
          kind: 'delayedCombatDamage',
          objects: { kind: 'triggerSubject' },
          effect: prepare,
        }),
        undefined,
      ),
    ).toContain('deals combat damage to a player this combat');
  });

  test('all player counters and independently repeated choices are described', () => {
    expect(
      triggerGist(
        triggered({ kind: 'removeAllPlayerCounters', player: { kind: 'eachOpponent' } }),
        undefined,
      ),
    ).toContain('Each opponent loses all counters');
    expect(
      triggerGist(
        triggered({
          kind: 'chooseOne',
          times: { kind: 'thisWay', what: 'destroyed' },
          options: [
            { label: 'Add {B}', effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['B'] } } },
            { label: 'Add {G}', effect: { kind: 'addMana', mana: { kind: 'fixed', mana: ['G'] } } },
          ],
        }),
        undefined,
      ),
    ).toContain('choose independently');
  });

  test('gravestorm is not described as counting spells', () => {
    expect(copyAbilityWords(triggered({ kind: 'storm', gravestorm: true }), undefined)?.does).toBe(
      'Copy this spell for each permanent put into a graveyard from the battlefield this turn.',
    );
    const object = { keywords: ['gravestorm'], text: '' } as unknown as ObjectView;
    expect(chipsOf(object)).toContainEqual(
      expect.objectContaining({ full: expect.stringContaining('Gravestorm') }),
    );
  });
});

// The words of the counter question (CR 122.1, 122.5, 608.2d): "Remove any number of counters from among permanents on the battlefield" and "Move a counter ..." ask which counter to take
// next, a button for each counter that may be taken and, when the effect may stop, "Done"; and the amount "the number of counters among creatures target player controls".
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { optionText, purposeNoun } from '../src/game/chosen';
import { namedOptionPrompt, namedOptionRows } from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const asked = {
  purpose: 'counterPick' as const,
  sourceName: "Eventide's Shadow",
  options: ['+1/+1 counter on Giant Spider (yours)', 'Done'],
  sourceOracleText: '',
};

describe('the counter question', () => {
  test('its prompt names the source and its rows are the options as they are', () => {
    expect(namedOptionPrompt(asked)).toBe("Choose a counter for Eventide's Shadow.");
    expect(optionPrompt(asked)).toBe("Choose a counter for Eventide's Shadow.");
    expect(namedOptionRows(asked).map((r) => r.label)).toEqual(asked.options);
    expect(optionText('counterPick', 'Done')).toBe('Done');
    expect(purposeNoun('counterPick')).toBe('counter');
  });

  test('"the number of counters among creatures you control" reads as the words say', () => {
    expect(
      amountPhrase({
        kind: 'aggregate',
        how: 'total',
        stat: 'counters',
        filter: { types: ['creature'], controller: 'you' },
      }),
    ).toMatch(/^the number of counters among /);
  });
});

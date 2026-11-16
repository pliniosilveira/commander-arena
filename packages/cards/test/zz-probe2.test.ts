import { test } from 'vitest';
import { ALL_RULES, buildRuleSet, runDetailed } from '../src/convert/parser/index';

const SET = buildRuleSet(ALL_RULES);

test('probe2', () => {
  const rule = ALL_RULES.find((r) => r.id === 'effect.look-top-put');
  if (rule === undefined) throw new Error('no rule');
  for (const text of [
    "look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on ~, you may put that card onto the battlefield",
  ]) {
    const r = runDetailed(rule.parse, text, 0, text.length, SET);
    console.log('RESULT', JSON.stringify(r).slice(0, 1500));
  }
  const amount = ALL_RULES.filter((r) => r.family === 'amount');
  const t = 'the number of loyalty counters on ~, you may put';
  for (const a of amount) {
    const r = runDetailed(a.parse, t, 0, t.length, SET);
    if (r.ok) console.log('AMOUNT', a.id, JSON.stringify(r.value).slice(0, 200));
  }
});

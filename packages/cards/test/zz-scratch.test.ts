import { test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const t = (text: string, mc = '{X}{W}{W}') => {
  const imported = parseOnly(
    syntheticCard({ name: 'SYNTHETIC Z', typeLine: 'Sorcery', oracleText: text, manaCost: mc }),
  );
  require('node:fs').appendFileSync(
    '/tmp/claude-0/-home-user-commander-arena/5981934a-beaf-5d00-b2ef-6058726af6e2/scratchpad/scratch.out',
    [
      JSON.stringify(text),
      imported.support.status,
      JSON.stringify(imported.support.unparsed.map((u) => u.stoppedAt ?? u.reason)),
    ].join(' => ') + '\n',
  );
};
test('x', () => {
  t('Create X 1/1 white Soldier creature tokens.');
  t('Destroy all other creatures.', '{W}');
  t('Create X 1/1 white Soldier creature tokens. Destroy all other creatures.');
  t('Create X 1/1 white Soldier creature tokens. If X is 5 or more, draw a card.');
  t('If X is 5 or more, destroy all creatures.');
});

/** The vote dialog of D-194 (CR 701.38a) drawn from a decision over no game: the dialog of the named options, titled with the source, with no way out. */
import type { ChooseOptionDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { NamedOptionDialog } from '../src/ui/decisions/NamedOptionDialog';

const decision = (
  cast: readonly { seat: number; option: string }[],
  seat = 1,
): ChooseOptionDecision =>
  ({
    id: 'd1',
    kind: 'chooseOption',
    seat,
    purpose: 'vote',
    options: ['profit', 'security'],
    source: 'o7',
    sourceName: 'Emissary Green',
    sourceOracleText: 'Whenever Emissary Green attacks, starting with you, each player votes.',
    vote: { controller: 0, cast },
  }) as unknown as ChooseOptionDecision;

test('the dialog is "Vote", quotes the source, shows the votes already cast and offers each option', () => {
  const html = renderToStaticMarkup(
    <NamedOptionDialog d={decision([{ seat: 0, option: 'profit' }])} act={() => {}} />,
  );
  expect(html).toContain('aria-label="Vote"');
  expect(html).toContain('>Emissary Green</h2>');
  expect(html).toContain('starting with you, each player votes.');
  expect(html).toContain('Vote for profit or security. Opponent voted for profit.');
  expect(html).toContain('data-option="profit"');
  expect(html).toContain('data-option="security"');
  expect(html).toContain('>Profit</span>');
  expect(html).not.toContain('>Cancel<');
});

test('the first voter has no votes to show', () => {
  const html = renderToStaticMarkup(<NamedOptionDialog d={decision([], 0)} act={() => {}} />);
  expect(html).toContain('>Vote for profit or security.</p>');
});

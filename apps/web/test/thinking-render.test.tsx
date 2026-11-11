/**
 * The markup of the "Opponent is thinking" line (D-174): a polite live region that is always in the
 * bar, so showing it changes no box, and plain words under every state of the bar.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ActionBar } from '../src/ui/decisions/ActionBar';

const noop = () => undefined;
const props = {
  bar: null,
  passing: false,
  passTurn: false,
  onCancelPassTurn: noop,
  fullControl: false,
  manualPay: false,
  onSeize: noop,
  onFullControl: noop,
  onManualPay: noop,
  undoDepth: 0,
  onUndo: noop,
};

const line = (html: string) => /<p class="dec-thinking"[^>]*>.*?<\/p>/s.exec(html)?.[0] ?? '';

test('the line is a polite status that is there, empty, before the opponent thinks', () => {
  const quiet = line(renderToStaticMarkup(<ActionBar {...props} />));
  expect(quiet).toContain('role="status"');
  expect(quiet).toContain('aria-live="polite"');
  expect(quiet).toContain('data-thinking="false"');
  expect(quiet).not.toContain('thinking<');
  expect(quiet.replace(/<[^>]*>/g, '')).toBe('');
});

test('it reads "Opponent is thinking" with three dots that screen readers skip', () => {
  const html = renderToStaticMarkup(<ActionBar {...props} thinking />);
  const status = line(html);
  expect(status).toContain('data-thinking="true"');
  expect(status.replace(/<[^>]*>/g, '')).toBe('Opponent is thinking...');
  expect(status).toContain('<span class="dec-dots" aria-hidden="true">');
  expect((status.match(/<i>\.<\/i>/g) ?? []).length).toBe(3);
});

test('it comes with the same markup around it in every state of the bar', () => {
  const strip = (html: string) => html.replace(line(html), '');
  for (const extra of [
    { passing: true },
    { passTurn: true },
    { waiting: 'Opponent is searching' },
  ]) {
    const withLine = renderToStaticMarkup(<ActionBar {...props} {...extra} thinking />);
    const without = renderToStaticMarkup(<ActionBar {...props} {...extra} />);
    expect(strip(withLine)).toBe(strip(without));
    expect(withLine).toContain('Opponent is thinking');
  }
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DeckChoice } from '../src/precons';
import { type EditingPrecon, InputPanel } from '../src/ui/import/InputPanel';
import { PreconDecksView } from '../src/ui/import/PreconDecksView';

const precon = (over: Partial<DeckChoice> = {}): DeckChoice => ({
  id: 'zombies',
  name: 'SYNTHETIC Zombies',
  blurb: 'Brains.',
  commander: 'SYNTHETIC Commander',
  kind: 'precon',
  edited: false,
  ...over,
});

describe('the precons on the decks page (issue 93)', () => {
  test('each precon is listed as built in with an Edit button and no reset', () => {
    const out = renderToStaticMarkup(
      <PreconDecksView precons={[precon()]} onEdit={() => {}} onReset={() => {}} />,
    );
    expect(out).toContain('SYNTHETIC Zombies');
    expect(out).toContain('Built in');
    expect(out).toContain('Commander: SYNTHETIC Commander');
    expect(out).toContain('>Edit<');
    expect(out).not.toContain('Reset to default');
  });

  test('an edited precon says so and offers Reset to default', () => {
    const out = renderToStaticMarkup(
      <PreconDecksView precons={[precon({ edited: true })]} onEdit={() => {}} onReset={() => {}} />,
    );
    expect(out).toContain('Edited by you');
    expect(out).toContain('Reset to default');
  });

  test('without a precon the page says none is installed', () => {
    expect(
      renderToStaticMarkup(<PreconDecksView precons={[]} onEdit={() => {}} onReset={() => {}} />),
    ).toContain('No precon is installed yet');
  });
});

describe('the editor on a precon', () => {
  const panel = (precon: EditingPrecon | null) =>
    renderToStaticMarkup(
      <InputPanel
        text="1 x"
        name="SYNTHETIC Zombies"
        running={false}
        progress={null}
        saveMessage={null}
        onText={() => {}}
        onName={() => {}}
        onImport={() => {}}
        onExample={null}
        onSave={() => {}}
        precon={precon}
      />,
    );

  test('the name is fixed, the banner explains and Save keeps your version', () => {
    const out = panel({
      name: 'SYNTHETIC Zombies',
      edited: false,
      onReset: () => {},
      onStop: () => {},
    });
    expect(out).toContain('Editing the built-in deck');
    expect(out).toContain('readOnly=""');
    expect(out).toContain('Save my version');
    expect(out).toContain('Reset to default');
    expect(out).toContain('Stop editing this precon');
    expect(out).toContain('still the list that came with the app');
  });

  test('a precon you already changed says which list the menu uses', () => {
    const out = panel({ name: 'X', edited: true, onReset: () => {}, onStop: () => {} });
    expect(out).toContain('the one the menu uses');
  });

  test('a plain import has no banner and saves a deck', () => {
    const out = panel(null);
    expect(out).not.toContain('Editing the built-in deck');
    expect(out).toContain('Save deck');
  });
});

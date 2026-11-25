import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DeckChoice } from '../src/precons';
import { InputPanel } from '../src/ui/import/InputPanel';
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
  test('each precon is listed as built in with an availability switch, no Edit button and no reset', () => {
    const out = renderToStaticMarkup(
      <PreconDecksView
        precons={[precon()]}
        onToggle={() => {}}
        onView={() => {}}
        onReset={() => {}}
      />,
    );
    expect(out).toContain('SYNTHETIC Zombies');
    expect(out).not.toContain('Built in');
    expect(out).toContain('Commander: SYNTHETIC Commander');
    expect(out).toContain('precon-toggle');
    expect(out).toContain('checked=""');
    expect(out).not.toContain('>Edit<');
    expect(out).not.toContain('Reset to default');
  });

  test('an edited precon says so and offers Reset to default', () => {
    const out = renderToStaticMarkup(
      <PreconDecksView
        precons={[precon({ edited: true })]}
        onToggle={() => {}}
        onView={() => {}}
        onReset={() => {}}
      />,
    );
    expect(out).toContain('Edited by you');
    expect(out).toContain('Reset to default');
  });

  test('a switched-off precon shows the switch unchecked', () => {
    const out = renderToStaticMarkup(
      <PreconDecksView
        precons={[precon({ enabled: false })]}
        onToggle={() => {}}
        onView={() => {}}
        onReset={() => {}}
      />,
    );
    expect(out).not.toContain('checked=""');
  });

  test('without a precon the page says none is installed', () => {
    expect(
      renderToStaticMarkup(
        <PreconDecksView precons={[]} onToggle={() => {}} onView={() => {}} onReset={() => {}} />,
      ),
    ).toContain('No precon is installed yet');
  });
});

describe('the import panel', () => {
  test('has one button, Import, which also saves, and no precon banner', () => {
    const out = renderToStaticMarkup(
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
      />,
    );
    expect(out).not.toContain('Editing the built-in deck');
    expect(out).not.toContain('Save deck');
    expect(out).toContain('>Import<');
  });
});

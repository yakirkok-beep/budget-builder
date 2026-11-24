import { describe, expect, it } from 'vitest';
import { applySuggestion, fragmentAt, suggest, type Suggestion } from '../src/ui/autocomplete';

const names: Suggestion[] = [
  { name: 'חניכים', kind: 'param' },
  { name: 'חניכים_למנחה', kind: 'param' },
  { name: 'מנחים', kind: 'param' },
  { name: 'אוטובוס', kind: 'price' },
  { name: 'אוטובוס_מסע', kind: 'price' },
  { name: 'למעלה', kind: 'fn' },
  { name: 'שכר', kind: 'fn' },
  { name: 'מעביד', kind: 'global' },
];

describe('fragmentAt', () => {
  it('finds the name before the caret', () => {
    expect(fragmentAt('=חני', 4)).toEqual({ start: 1, frag: 'חני' });
    expect(fragmentAt('=למעלה(חניכים/נוס', 17)).toEqual({ start: 14, frag: 'נוס' });
    expect(fragmentAt('=a+b2', 5)).toEqual({ start: 3, frag: 'b2' });
  });
  it('nothing outside formulas, inside quotes, or after an operator', () => {
    expect(fragmentAt('חני', 3)).toBeNull();
    expect(fragmentAt('=שכר("סמי', 9)).toBeNull();
    expect(fragmentAt('=חניכים+', 8)).toBeNull();
    expect(fragmentAt('=12', 3)).toBeNull();
  });
});

describe('suggest', () => {
  it('prefix matches first, then contains; the exact name is left out', () => {
    expect(suggest(names, 'חני').map((s) => s.name)).toEqual(['חניכים', 'חניכים_למנחה']);
    expect(suggest(names, 'חניכים').map((s) => s.name)).toEqual(['חניכים_למנחה']);
    expect(suggest(names, 'נחים').map((s) => s.name)).toEqual(['מנחים']);
    expect(suggest(names, 'מ').map((s) => s.name).slice(0, 2)).toEqual(['מנחים', 'מעביד']);
    expect(suggest(names, 'zzz')).toEqual([]);
  });
  it('at most 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: 'א' + i, kind: 'param' as const }));
    expect(suggest(many, 'א')).toHaveLength(8);
  });
});

describe('applySuggestion', () => {
  it('replaces the whole word around the caret', () => {
    expect(applySuggestion('=חני+2', 1, 4, names[0]!)).toEqual({ text: '=חניכים+2', caret: 7 });
    expect(applySuggestion('=חנכים', 1, 3, names[0]!)).toEqual({ text: '=חניכים', caret: 7 });
  });
  it('functions get an opening bracket', () => {
    expect(applySuggestion('=למע', 1, 4, names[5]!)).toEqual({ text: '=למעלה(', caret: 7 });
    expect(applySuggestion('=שכ', 1, 3, names[6]!)).toEqual({ text: '=שכר("', caret: 6 });
  });
});

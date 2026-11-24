import { describe, expect, it } from 'vitest';
import { EMPTY_CONTEXT, normalizeInput, referencedNames, valueOf, type FormulaContext } from '../src/domain/formula';
import { compute } from '../src/domain/compute';
import { ev, evExp, loadSeed } from './helpers';

const names: Record<string, number> = { חניכים: 350, מנחים: 23, חניכים_למנחה: 15, x2: 2 };
const ctx: FormulaContext = {
  lookup: (n) => {
    if (n in names) return names[n]!;
    return EMPTY_CONTEXT.lookup(n);
  },
  sal: (n) => {
    if (n === 'סמינריון') return 1200;
    throw new Error('unexpected');
  },
};
const v = (raw: unknown): number | null => valueOf(raw, ctx);
const err = (raw: unknown): string => {
  try {
    valueOf(raw, ctx);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected an error for ' + String(raw));
};

describe('plain values', () => {
  it('numbers and empty', () => {
    expect(v(350)).toBe(350);
    expect(v('')).toBeNull();
    expect(v('   ')).toBeNull();
    expect(v(null)).toBeNull();
    expect(v('42')).toBe(42);
    expect(v('-3.5')).toBe(-3.5);
  });
  it('"1,200" and currency', () => {
    expect(v('1,200')).toBe(1200);
    expect(v('₪ 1,200.50')).toBe(1200.5);
  });
  it('7% = 0.07', () => {
    expect(v('7%')).toBeCloseTo(0.07, 12);
    expect(v('3%')).toBeCloseTo(0.03, 12);
  });
  it('text that is not a number is an error', () => {
    expect(err('abc')).toBe('לא מספר ולא נוסחה');
    expect(err('12abc')).toBe('לא מספר ולא נוסחה');
  });
});

describe('operators', () => {
  it('precedence', () => {
    expect(v('=2+3*4')).toBe(14);
    expect(v('=2*3+4')).toBe(10);
    expect(v('=10-4/2')).toBe(8);
  });
  it('left associativity', () => {
    expect(v('=10-4-3')).toBe(3);
    expect(v('=8/4/2')).toBe(1);
  });
  it('parentheses', () => {
    expect(v('=(2+3)*4')).toBe(20);
    expect(v('=((1+2)*(3+4))/7')).toBe(3);
    expect(v('= ( 2 + 3 ) * 4 ')).toBe(20);
  });
  it('unary minus and plus', () => {
    expect(v('=-3+5')).toBe(2);
    expect(v('=-(2+3)*2')).toBe(-10);
    expect(v('=2*-3')).toBe(-6);
    expect(v('=--4')).toBe(4);
    expect(v('=+5')).toBe(5);
    expect(v('=-חניכים')).toBe(-350);
  });
  it('decimals', () => {
    expect(v('=0.5*4')).toBe(2);
  });
});

describe('names', () => {
  it('Hebrew names, underscores and digits', () => {
    expect(v('=חניכים+מנחים')).toBe(373);
    expect(v('=חניכים_למנחה*2')).toBe(30);
    expect(v('=x2*3')).toBe(6);
  });
  it('unknown name', () => {
    expect(err('=חניכימ+1')).toBe('שם לא מוכר: חניכימ');
  });
  it('object prototype names are not names', () => {
    const b = loadSeed();
    ev(b, 'semb').params[0]!.value = '=constructor';
    expect(compute(b).ev['semb']!.params[ev(b, 'semb').params[0]!.id]).toEqual({ err: 'שם לא מוכר: constructor' });
  });
  it('string literals coerce to numbers inside arithmetic', () => {
    expect(v('="1,200"*2')).toBe(2400);
  });
  it('a bare string is not a number', () => {
    expect(err('="abc"')).toBe('התוצאה אינה מספר');
  });
});

describe('functions', () => {
  it('למעלה / ROUNDUP with tolerance', () => {
    expect(v('=למעלה(2.1)')).toBe(3);
    expect(v('=למעלה(2)')).toBe(2);
    expect(v('=למעלה(350/47)')).toBe(8);
    expect(v('=ROUNDUP(7/3)')).toBe(3);
    expect(v('=למעלה(0.1*3*10)')).toBe(3); // 3.0000000000000004 stays 3
    expect(v('=למעלה(-2.5)')).toBe(-2);
  });
  it('למטה with tolerance', () => {
    expect(v('=למטה(2.9)')).toBe(2);
    expect(v('=למטה(2.9999999999)')).toBe(3);
  });
  it('עגל / ROUND', () => {
    expect(v('=עגל(2.5)')).toBe(3);
    expect(v('=עגל(2.4)')).toBe(2);
    expect(v('=עגל(2.346,2)')).toBe(2.35);
    expect(v('=עגל(1234,-2)')).toBe(1200);
    expect(v('=ROUND(2.5)')).toBe(3);
    expect(v('=ROUND(2.4)')).toBe(2);
  });
  it('מקס / MAX / מינ / MIN', () => {
    expect(v('=מקס(1,5,3)')).toBe(5);
    expect(v('=MAX(1,2)')).toBe(2);
    expect(v('=מינ(4,2,8)')).toBe(2);
    expect(v('=MIN(3,1)')).toBe(1);
    expect(v('=מקס(חניכים/מנחים,10)')).toBeCloseTo(15.217, 3);
  });
  it('nested functions', () => {
    expect(v('=למעלה(מקס(חניכים,400)/47)*2')).toBe(18);
  });
  it('שכר("...")', () => {
    expect(v('=שכר("סמינריון")*2')).toBe(2400);
  });
  it('wrong number of arguments', () => {
    expect(err('=למעלה()')).toBe('מספר ערכים שגוי ב-למעלה()');
    expect(err('=למעלה(1,2)')).toBe('מספר ערכים שגוי ב-למעלה()');
    expect(err('=מקס()')).toBe('מספר ערכים שגוי ב-מקס()');
  });
  it('unknown function', () => {
    expect(err('=פונקציה(1)')).toBe('פונקציה לא מוכרת: פונקציה');
  });
});

describe('errors', () => {
  it('division by zero', () => {
    expect(err('=1/0')).toBe('חלוקה באפס');
    expect(err('=חניכים/(מנחים-23)')).toBe('חלוקה באפס');
  });
  it('syntax', () => {
    expect(err('=2+')).toBe('הנוסחה לא שלמה');
    expect(err('=(2+3')).toBe('חסר סוגר )');
    expect(err('=2 3')).toBe('לא צפוי: 3');
    expect(err('=2)')).toBe('לא צפוי: )');
    expect(err('=2$')).toBe('תו לא מוכר: $');
    expect(err('=')).toBe('הנוסחה ריקה');
    expect(err('=מקס(1,')).toBe('הנוסחה לא שלמה');
    expect(err('="abc')).toBe('חסרות מירכאות סוגרות');
  });
});

describe('params inside an event', () => {
  it('params can reference each other in any order', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    // אוטובוסים is defined before חניכים is used and refers to it
    e.params.unshift({ id: 'pz', key: 'כפול', value: '=אוטובוסים*2', note: '' });
    const R = compute(b).ev['semb']!;
    expect(R.params['pz']).toEqual({ v: 16 });
  });

  it('circular references are errors, not crashes', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    e.params.push({ id: 'pa', key: 'א', value: '=ב+1', note: '' });
    e.params.push({ id: 'pb', key: 'ב', value: '=א+1', note: '' });
    e.params.push({ id: 'pc', key: 'עצמי', value: '=עצמי*2', note: '' });
    e.lines.push({ id: 'lx', cat: 'ציוד', item: 'בדיקה', qty: '=א', days: '', price: 10, note: '' });
    const R = compute(b).ev['semb']!;
    expect(R.params['pa']!.err).toMatch(/^הפניה מעגלית/);
    expect(R.params['pb']!.err).toMatch(/^הפניה מעגלית/);
    expect(R.params['pc']).toEqual({ err: 'הפניה מעגלית: עצמי' });
    expect(R.lines['lx']!.t).toBe(0);
    expect(R.lines['lx']!.err).toMatch(/^הפניה מעגלית/);
    expect(R.exp).toBeCloseTo(evExp('semb'), 2);
    expect(R.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(['param-error', 'line-error']));
  });

  it('lookup order: event param, then global, then price', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    b.prices.push({ id: 'rz', key: 'בלתם', label: '', value: 999, unit: '' });
    b.prices.push({ id: 'ry', key: 'רק_מחירון', label: '', value: 5, unit: '' });
    e.params.push({ id: 'p1', key: 'מעביד', value: 2, note: '' });
    e.params.push({ id: 'p2', key: 'ת1', value: '=מעביד', note: '' }); // param shadows global
    e.params.push({ id: 'p3', key: 'ת2', value: '=בלתם', note: '' }); // global shadows price
    e.params.push({ id: 'p4', key: 'ת3', value: '=רק_מחירון', note: '' });
    e.params.push({ id: 'p5', key: 'ת4', value: '=רמת_שכר', note: '' }); // salary level is not a name
    const R = compute(b).ev['semb']!;
    expect(R.params['p2']).toEqual({ v: 2 });
    expect(R.params['p3']).toEqual({ v: 0.07 });
    expect(R.params['p4']).toEqual({ v: 5 });
    expect(R.params['p5']).toEqual({ err: 'שם לא מוכר: רמת_שכר' });
  });

  it('a param with an error makes a line total 0 and is reported once per kind', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    e.lines[0]!.qty = '=לא_קיים';
    e.lines[1]!.price = '=1/0';
    const R = compute(b).ev['semb']!;
    expect(R.lines[e.lines[0]!.id]!.t).toBe(0);
    expect(R.lines[e.lines[1]!.id]!.err).toBe('חלוקה באפס');
    const lineIssues = R.issues.filter((i) => i.kind === 'line-error');
    expect(lineIssues).toHaveLength(1);
    expect(lineIssues[0]!.msg).toMatch(/^שגיאה ב-2 שורות/);
  });

  it('unknown salary row and missing level', () => {
    const b = loadSeed();
    const e = ev(b, 'semb');
    e.params.push({ id: 'ps', key: 'ש', value: '=שכר("אין כזה")', note: '' });
    b.globals['רמת_שכר'] = 'לא_רמה';
    const R = compute(b).ev['semb']!;
    expect(R.params['ps']).toEqual({ err: 'אין בטבלת השכר: אין כזה' });
    expect(R.params[e.params.find((p) => p.key === 'שכר_מנחה')!.id]!.err).toMatch(/^אין שכר לרמה/);
  });
});

describe('helpers', () => {
  it('normalizeInput stores numbers as numbers', () => {
    expect(normalizeInput('1,200')).toBe(1200);
    expect(normalizeInput(' 350 ')).toBe(350);
    expect(normalizeInput('=חניכים')).toBe('=חניכים');
    expect(normalizeInput('')).toBe('');
    expect(normalizeInput('7%')).toBe('7%');
  });
  it('referencedNames', () => {
    expect(referencedNames('=למעלה(חניכים/נוסעים)*אוטובוס').sort()).toEqual(['אוטובוס', 'חניכים', 'נוסעים'].sort());
    expect(referencedNames(350)).toEqual([]);
    expect(referencedNames('=(')).toEqual([]);
  });
});

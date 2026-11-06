import { describe, expect, it } from 'vitest';
import { checkGrammar, readability, spellWords } from '../src/features/proof/grammar';

const fix = (t: string) => checkGrammar(t).map((f) => t.slice(0, f.from) + (f.fix ?? '') + t.slice(f.to));

describe('grammar', () => {
  it.each([
    ['This is is fine.', 'This is fine.'],
    ['We could of won.', 'We could have won.'],
    ['He have a car.', 'He has a car.'],
    ['They has a car.', 'They have a car.'],
    ['I has a car.', 'I have a car.'],
    ['I are here.', 'I am here.'],
    ['This is better then that.', 'This is better than that.'],
    ['She saw a apple.', 'She saw an apple.'],
    ['She saw an car.', 'She saw a car.'],
    ['It took a hour.', 'It took an hour.'],
    ['We need alot of it.', 'We need a lot of it.'],
    ['Your welcome here.', "You're welcome here."],
    ['Their is a way.', 'There is a way.'],
    ['Stop. then go.', 'Stop. Then go.'],
    ['Hello , world', 'Hello, world'],
    ['Hello,world', 'Hello, world'],
  ])('%s', (input, want) => {
    expect(fix(input)).toContain(want);
  });

  it.each(['She saw a university.', 'It was an honest answer.', 'We use a European plug.', 'He has a car.', 'Their house is big.', 'I have less money.', 'Dr. Smith went home.', 'Use e.g. apples here.'])('leaves "%s" alone', (t) => {
    expect(checkGrammar(t)).toEqual([]);
  });

  it('checks Arabic punctuation spacing', () => {
    expect(checkGrammar('مرحبا ، كيف الحال').length).toBe(1);
  });
});

describe('spell word extraction', () => {
  const words = (t: string) => spellWords(t).map((w) => w.word);
  it('skips what should not be checked', () => {
    expect(words('NASA iPhone x2 https://teh.example/abc me@teh.org')).toEqual([]);
    expect(words('مرحبا')).toEqual(['مرحبا']);
  });
  it('handles possessives and curly apostrophes', () => {
    expect(words('John’s dog don’t')).toEqual(['John', 'dog', "don't"]);
  });
  it('keeps offsets', () => {
    const [w] = spellWords('  hello');
    expect(w).toMatchObject({ from: 2, to: 7 });
  });
});

describe('readability', () => {
  it('scores text', () => {
    const r = readability('The cat sat on the mat. It was a good day.');
    expect(r.sentences).toBe(2);
    expect(r.ease).toBeGreaterThan(80);
  });
});

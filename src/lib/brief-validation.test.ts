import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone, validateContact, buildAnswers } from './brief-validation';

describe('normalizePhone', () => {
  it('strips spaces and dashes', () => {
    expect(normalizePhone('050-123 4567')).toBe('0501234567');
  });
});

describe('isValidPhone', () => {
  it('accepts Israeli mobile/landline', () => {
    expect(isValidPhone('0501234567')).toBe(true);
    expect(isValidPhone('02-6236631')).toBe(true);
  });
  it('rejects junk', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('validateContact', () => {
  it('passes with valid fields', () => {
    expect(validateContact({ business_name: 'האוזן', contact_name: 'דני', phone: '0501234567' }))
      .toEqual({ ok: true });
  });
  it('fails on short business name', () => {
    expect(validateContact({ business_name: 'א', contact_name: 'דני', phone: '0501234567' }).ok).toBe(false);
  });
  it('fails on bad phone', () => {
    expect(validateContact({ business_name: 'האוזן', contact_name: 'דני', phone: '123' }).ok).toBe(false);
  });
});

describe('buildAnswers', () => {
  it('collects non-contact fields into a flat object, skipping empties and honeypot', () => {
    const form = new FormData();
    form.set('business_name', 'האוזן');
    form.set('_honey', '');
    form.set('domain_structure', 'separate');
    form.set('inear_brand', 'מותג נפרד');
    form.set('empty_field', '');
    expect(buildAnswers(form)).toEqual({
      domain_structure: 'separate',
      inear_brand: 'מותג נפרד',
    });
  });
  it('groups repeated checkbox values into arrays', () => {
    const form = new FormData();
    form.append('inear_brands', 'UE');
    form.append('inear_brands', '64 Audio');
    expect(buildAnswers(form).inear_brands).toEqual(['UE', '64 Audio']);
  });
});

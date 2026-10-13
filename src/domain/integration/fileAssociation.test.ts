import { describe, it, expect } from 'vitest';
import { describeAssociation, isAssociationToggleLocked, type AssociationStatus } from './fileAssociation';

const base: AssociationStatus = { status: 'registered', registered: true, command: '"C:\\Cero\\Cero.exe" "%1"', machine_wide: false };

describe('describeAssociation', () => {
  it('says .flow files open with Cero when registered', () => {
    expect(describeAssociation(base)).toMatch(/open with Cero/i);
  });

  it('names the other program when another path is registered', () => {
    const text = describeAssociation({ ...base, status: 'registered-elsewhere', registered: false, command: '"D:\\old\\Cero.exe" "%1"' });
    expect(text).toContain('D:\\old\\Cero.exe');
    expect(text).toMatch(/another/i);
  });

  it('offers to register when missing', () => {
    expect(describeAssociation({ status: 'missing', registered: false, command: null, machine_wide: false })).toMatch(/not registered/i);
  });

  it('explains an all-users registration', () => {
    expect(describeAssociation({ ...base, machine_wide: true })).toMatch(/all users|installer/i);
  });

  it('has a neutral text before the status is known', () => {
    expect(describeAssociation(null)).toMatch(/\.flow/);
  });
});

describe('isAssociationToggleLocked', () => {
  it('locks the switch only for an all-users registration that is on', () => {
    expect(isAssociationToggleLocked({ ...base, machine_wide: true })).toBe(true);
    expect(isAssociationToggleLocked(base)).toBe(false);
    expect(isAssociationToggleLocked({ status: 'missing', registered: false, command: null, machine_wide: false })).toBe(false);
    expect(isAssociationToggleLocked(null)).toBe(false);
  });
});

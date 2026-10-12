import { describe, it, expect } from 'vitest';
import { parsePowerState } from './PowerState';

describe('parsePowerState', () => {
  it('reads the AC and battery lines of the Win32_Battery script', () => {
    expect(parsePowerState('AC=0\nBAT=43\n')).toEqual({ onAcPower: false, batteryLevelPercent: 43 });
    expect(parsePowerState('AC=1\nBAT=97\n')).toEqual({ onAcPower: true, batteryLevelPercent: 97 });
    expect(parsePowerState('AC=0\nAC=1\nBAT=60\nBAT=20\n')).toEqual({ onAcPower: true, batteryLevelPercent: 20 });
  });

  it('treats a machine without a battery as on AC power', () => {
    expect(parsePowerState('AC=1\n')).toEqual({ onAcPower: true, batteryLevelPercent: 100 });
    expect(parsePowerState('')).toEqual({ onAcPower: true, batteryLevelPercent: 100 });
  });
});

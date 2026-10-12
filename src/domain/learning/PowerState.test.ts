import { describe, it, expect } from 'vitest';
import { parsePowerState } from './PowerState';

describe('parsePowerState', () => {
  it('reads Linux sysfs power supplies', () => {
    expect(parsePowerState('AC=0\nBAT=43\n')).toEqual({ onAcPower: false, batteryLevelPercent: 43 });
    expect(parsePowerState('AC=1\nBAT=97\n')).toEqual({ onAcPower: true, batteryLevelPercent: 97 });
    expect(parsePowerState('AC=0\nAC=1\nBAT=60\nBAT=20\n')).toEqual({ onAcPower: true, batteryLevelPercent: 20 });
  });

  it('treats a machine without a battery as on AC power', () => {
    expect(parsePowerState('AC=1\n')).toEqual({ onAcPower: true, batteryLevelPercent: 100 });
    expect(parsePowerState('')).toEqual({ onAcPower: true, batteryLevelPercent: 100 });
  });

  it('falls back to macOS pmset output', () => {
    expect(parsePowerState("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t55%; discharging")).toEqual({ onAcPower: false, batteryLevelPercent: 55 });
  });
});

/**
 * PowerState.ts — is the machine on AC power, and how full is the battery?
 *
 * Background learning work must not drain a laptop battery.
 */

export interface PowerState {
  onAcPower: boolean;
  batteryLevelPercent: number;
}

/** One PowerShell call: AC=<0|1> and BAT=<percent> per battery (BatteryStatus 2 means on AC power). No battery prints nothing. */
export const POWER_STATE_SCRIPT = `Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object { 'AC=' + $(if ($_.BatteryStatus -eq 2) { 1 } else { 0 }); 'BAT=' + $_.EstimatedChargeRemaining }`;

export function parsePowerState(output: string): PowerState {
  const acValues = [...output.matchAll(/^AC=(\d)/gm)].map(m => m[1]);
  const batteries = [...output.matchAll(/^BAT=(\d+)/gm)].map(m => parseInt(m[1], 10));

  if (batteries.length > 0 || acValues.length > 0) {
    // No battery at all means a desktop: treat as AC
    const onAcPower = acValues.includes('1') || batteries.length === 0;
    return { onAcPower, batteryLevelPercent: batteries.length ? Math.min(...batteries) : 100 };
  }
  return { onAcPower: true, batteryLevelPercent: 100 };
}

export async function readPowerState(
  exec: (cmd: string) => Promise<{ stdout: string }>
): Promise<PowerState> {
  try {
    const res = await exec(POWER_STATE_SCRIPT);
    return parsePowerState(res.stdout || '');
  } catch {
    return { onAcPower: true, batteryLevelPercent: 100 };
  }
}

/**
 * PowerState.ts — is the machine on AC power, and how full is the battery?
 *
 * Background learning work must not drain a laptop battery. The previous check used macOS
 * `pmset`, which does not exist on Linux, so Linux laptops always looked like they were on AC.
 */

export interface PowerState {
  onAcPower: boolean;
  batteryLevelPercent: number;
}

/** Reads /sys/class/power_supply on Linux; falls back to pmset on macOS. One shell call. */
export const POWER_STATE_SCRIPT = `for s in /sys/class/power_supply/*; do [ -r "$s/type" ] || continue; case "$(cat "$s/type")" in Mains|USB) echo "AC=$(cat "$s/online" 2>/dev/null)";; Battery) echo "BAT=$(cat "$s/capacity" 2>/dev/null)";; esac; done; command -v pmset >/dev/null 2>&1 && pmset -g batt`;

export function parsePowerState(output: string): PowerState {
  const acValues = [...output.matchAll(/^AC=(\d)/gm)].map(m => m[1]);
  const batteries = [...output.matchAll(/^BAT=(\d+)/gm)].map(m => parseInt(m[1], 10));
  const pmsetPercent = output.match(/(\d+)%/);

  if (batteries.length > 0 || acValues.length > 0) {
    // No battery at all means a desktop: treat as AC
    const onAcPower = acValues.includes('1') || batteries.length === 0;
    return { onAcPower, batteryLevelPercent: batteries.length ? Math.min(...batteries) : 100 };
  }
  if (/Battery Power|AC Power/.test(output)) {
    return {
      onAcPower: output.includes('AC Power'),
      batteryLevelPercent: pmsetPercent ? parseInt(pmsetPercent[1], 10) : 100
    };
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

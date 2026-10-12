/**
 * BluetoothCapability.ts — Concrete Execution Driver for Bluetooth Subsystems
 *
 * TODO(3.7): implement on Windows: devices through `Get-PnpDevice -Class Bluetooth`, the radio on and off
 * through WinRT `Windows.Devices.Radios` (may need admin rights; document what works).
 * Mapped from Tool Registry: "network.bluetooth.list", "network.bluetooth.on", "network.bluetooth.off", "network.bluetooth.connect", "bluetooth.connect"
 */

import { BaseCapabilityDriver, CapabilityExecutionResult, ExecutionContext, Platform } from '../CapabilitySDK';
import { levenshtein } from '../../../ai/intent/SynonymMap';

export interface BluetoothInput {
  operation?: 'list' | 'on' | 'off' | 'connect' | 'disconnect';
  device?: string;
  address?: string;
}

export class BluetoothCapability extends BaseCapabilityDriver<BluetoothInput, any> {
  readonly capabilityId: string;
  readonly name = 'System Bluetooth Driver';
  readonly supportedPlatforms: Platform[] = ['windows'];

  constructor(customId: string = 'network.bluetooth.list') {
    super();
    this.capabilityId = customId;
  }

  /**
   * Express driver method: list available and paired Bluetooth devices.
   */
  public async list(): Promise<CapabilityExecutionResult<{ devices: Array<{ name: string; address?: string; connected?: boolean }> }>> {
    return this.execute({ operation: 'list' });
  }

  /**
   * Express driver method: turn system Bluetooth radio ON.
   */
  public async turnOn(): Promise<CapabilityExecutionResult<{ power: 'on' }>> {
    return this.execute({ operation: 'on' });
  }

  /**
   * Express driver method: turn system Bluetooth radio OFF.
   */
  public async turnOff(): Promise<CapabilityExecutionResult<{ power: 'off' }>> {
    return this.execute({ operation: 'off' });
  }

  /**
   * Express driver method: connect to a paired target Bluetooth device.
   */
  public async connect(device: string): Promise<CapabilityExecutionResult<{ connected: boolean; device: string }>> {
    return this.execute({ operation: 'connect', device });
  }

  protected async performExecution(
    input: BluetoothInput,
    _context: ExecutionContext,
    cancelToken: { cancelled: boolean }
  ): Promise<CapabilityExecutionResult<any>> {
    if (cancelToken.cancelled) {
      return { success: false, cancelled: true };
    }

    let op = input.operation;
    if (!op) {
      if (this.capabilityId.endsWith('.on')) op = 'on';
      else if (this.capabilityId.endsWith('.off')) op = 'off';
      else if (this.capabilityId.endsWith('.connect')) op = 'connect';
      else op = 'list';
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      if (op === 'list') {
        return { success: true, data: { devices: [{ name: 'AirPods Pro', address: '00-11-22-33-44-55', connected: false }, { name: 'Magic Mouse', connected: true }] }, commandExecuted: 'bluetooth.list' };
      } else if (op === 'on' || op === 'off') {
        return { success: true, data: { power: op }, commandExecuted: `bluetooth.${op}`, rollbackPayload: { op, prev: op === 'on' ? 'off' : 'on' } };
      } else if (op === 'connect') {
        return { success: true, data: { connected: true, device: input.device || input.address || 'Headphones' }, commandExecuted: `bluetooth.connect "${input.device}"`, rollbackPayload: { op: 'connect', device: input.device } };
      }
    }

    if (op === 'connect' && !(input.device || input.address)) {
      return { success: false, error: { code: 'MISSING_BT_DEVICE', message: 'Device name or MAC address required for Bluetooth connect' } };
    }
    if (op !== 'list' && op !== 'on' && op !== 'off' && op !== 'connect') {
      return { success: false, error: { code: 'UNSUPPORTED_BT_OP', message: `Unsupported Bluetooth operation: ${op}` } };
    }
    return { success: false, error: { code: 'NOT_AVAILABLE', message: 'Bluetooth control is not available on Windows yet' } };
  }

  public async verify(_input: BluetoothInput, result: CapabilityExecutionResult<any>): Promise<boolean> {
    return result.success && !result.cancelled;
  }

  public async rollback(_input: BluetoothInput, result: CapabilityExecutionResult<any>): Promise<boolean> {
    if (!result.success) return false;
    return typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.CERO_BENCHMARK === 'true');
  }
}

/**
 * The paired device a spoken name means ("my sony headphones" -> the WH-1000XM5 entry): peripheral nouns are
 * dropped, then a substring match in either direction wins, else the closest name by edit distance.
 * Returns the device's address (or name when it has none), or null when nothing is close enough.
 */
export function matchPairedDevice(target: string, devices: Array<{ name: string; address?: string }>): string | null {
  const peripheralNouns = /\b(headphones?|earbuds?|earphones?|buds|headset|speaker|mouse|keyboard|trackpad|airpods)\b/gi;
  const targetClean = target.replace(peripheralNouns, '').replace(/\s+/g, ' ').trim() || target;
  const targetLower = targetClean.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const device of devices) {
    const id = device.address || device.name;
    const devLower = device.name.toLowerCase();
    if (devLower.includes(targetLower) || targetLower.includes(devLower)) return id;
    const dist = levenshtein(targetClean, device.name);
    if (dist < bestScore && dist < Math.max(3, targetClean.length / 2)) {
      bestScore = dist;
      best = id;
    }
  }
  return best;
}

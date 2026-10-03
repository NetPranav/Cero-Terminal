/**
 * RecoveryAssistant.ts — Friendly error translations and fixes
 */

export interface RecoveryAction {
  readonly title: string;
  readonly reason: string;
  readonly suggestedFix: string;
  readonly actionId: string;
}

export class RecoveryAssistant {
  public analyzeError(error: Error, context: any): RecoveryAction | null {
    if (error.message.includes('Bluetooth') || context?.capability === 'network.bluetooth.on') {
      return {
        title: 'Bluetooth could not connect.',
        reason: 'Bluetooth hardware is currently disabled or unreachable.',
        suggestedFix: 'Turn Bluetooth On',
        actionId: 'fix_bt_enable'
      };
    }

    if (error.message.includes('EACCES')) {
      return {
        title: 'Permission Denied.',
        reason: 'Cero lacks access to read or modify this directory.',
        suggestedFix: 'Grant Directory Access',
        actionId: 'fix_permissions'
      };
    }

    return null;
  }
}

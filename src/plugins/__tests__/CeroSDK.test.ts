import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CeroSDK } from '../sdk/CeroSDK';
import { SDKBridge } from '../bridge/SDKBridge';
import { PermissionManager } from '../permissions/PermissionManager';
import { ExtensionPoints } from '../hooks/ExtensionPoints';

describe('CeroSDK & Bridge Integration', () => {
  let sdk: CeroSDK;
  let pm: PermissionManager;
  let ep: ExtensionPoints;

  beforeEach(() => {
    pm = new PermissionManager();
    ep = new ExtensionPoints();
    // Simulate plugin initialization
    pm.grantPermissions('p1', ['filesystem.read']);
    const bridge = new SDKBridge('p1', pm, ep);
    sdk = new CeroSDK(bridge);
  });

  it('should allow filesystem read due to granted permission', async () => {
    await expect(sdk.fs.read('/tmp/file')).resolves.toMatchObject({ success: true, op: 'read' });
  });

  it('should block filesystem write due to lack of permission', async () => {
    await expect(sdk.fs.write('/tmp/file', 'data')).rejects.toThrow(/was denied access to permission: filesystem.write/);
  });

  it('should wrap subscribe hooks safely', async () => {
    // Missing permission
    expect(() => sdk.subscribe('SessionStarted', async () => {})).toThrow(/denied access to permission: core.hook.subscribe/);
    
    // Grant permission and retry
    pm.grantPermissions('p1', ['core.hook.subscribe']);
    const cb = vi.fn();
    sdk.subscribe('SessionStarted', cb);
    
    await ep.emit('SessionStarted', {});
    expect(cb).toHaveBeenCalled();
  });
});

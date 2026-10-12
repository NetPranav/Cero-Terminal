import { describe, it, expect } from 'vitest';
import { CapabilityRegistrySDK } from './CapabilityRegistrySDK';

describe('Universal Capability Resolution & Dynamic Drivers', () => {
  const sdk = CapabilityRegistrySDK.getInstance();

  it('resolves concrete drivers for every standard namespace without error', () => {
    // Wi-Fi
    expect(sdk.getDriver('network.wifi.on')).toBeDefined();
    expect(sdk.getDriver('network.wifi.off')).toBeDefined();
    expect(sdk.getDriver('network.wifi.scan')).toBeDefined();
    expect(sdk.getDriver('network.wifi.connect')).toBeDefined();

    // Bluetooth
    expect(sdk.getDriver('network.bluetooth.on')).toBeDefined();
    expect(sdk.getDriver('network.bluetooth.off')).toBeDefined();
    expect(sdk.getDriver('network.bluetooth.list')).toBeDefined();
    expect(sdk.getDriver('network.bluetooth.connect')).toBeDefined();

    // Filesystem
    expect(sdk.getDriver('filesystem.search')).toBeDefined();
    expect(sdk.getDriver('filesystem.read')).toBeDefined();
    expect(sdk.getDriver('filesystem.list')).toBeDefined();
    expect(sdk.getDriver('filesystem.locate_folders')).toBeDefined();

    // Networking
    expect(sdk.getDriver('network.ports')).toBeDefined();
    expect(sdk.getDriver('network.ping')).toBeDefined();
    expect(sdk.getDriver('network.interfaces')).toBeDefined();

    // Browser
    expect(sdk.getDriver('browser.search')).toBeDefined();
    expect(sdk.getDriver('browser.navigate')).toBeDefined();

    // System
    expect(sdk.getDriver('system.processes')).toBeDefined();
    expect(sdk.getDriver('system.storage')).toBeDefined();
    expect(sdk.getDriver('system.battery')).toBeDefined();
  });

  it('dynamically instantiates and caches any unknown tool ID using fallback driver', () => {
    const unknownDriver = sdk.getDriver('custom.arbitrary.tool');
    expect(unknownDriver).toBeDefined();
    expect(sdk.getDriver('custom.arbitrary.tool')).toBe(unknownDriver);
  });
});

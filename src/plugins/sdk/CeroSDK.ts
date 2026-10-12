/**
 * CeroSDK.ts — Public SDK Surface API
 * 
 * This is the ONLY object injected into the Plugin Sandbox.
 * It delegates all operations to the secure SDKBridge.
 */

import { SDKBridge } from '../bridge/SDKBridge';
import { HookEventName, HookCallback } from '../hooks/ExtensionPoints';

export interface CeroSDKAPI {
  registerAction(actionDef: any): void;
  registerCapability(capabilityDef: any): void;
  registerCollector(collectorDef: any): void;
  registerWorkflowTemplate(templateDef: any): void;
  subscribe(event: HookEventName, callback: HookCallback): void;
  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
}

export class CeroSDK implements CeroSDKAPI {
  constructor(private bridge: SDKBridge) {}

  public registerAction(actionDef: any): void {
    this.bridge.registerAction(actionDef);
  }

  public registerCapability(capabilityDef: any): void {
    this.bridge.registerCapability(capabilityDef);
  }

  public registerCollector(collectorDef: any): void {
    this.bridge.registerCollector(collectorDef);
  }

  public registerWorkflowTemplate(templateDef: any): void {
    this.bridge.registerWorkflowTemplate(templateDef);
  }

  public subscribe(event: HookEventName, callback: HookCallback): void {
    this.bridge.subscribeHook(event, callback);
  }

  public get fs() {
    return {
      read: async (path: string) => this.bridge.executeFilesystem('read', { path }),
      write: async (path: string, content: string) => this.bridge.executeFilesystem('write', { path, content }),
    };
  }
}

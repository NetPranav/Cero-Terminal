export type PermissionCategory = 
  | 'ReadFiles' 
  | 'WriteFiles' 
  | 'DeleteFiles' 
  | 'RenameFiles' 
  | 'ShellExecution' 
  | 'Network' 
  | 'Clipboard' 
  | 'Git' 
  | 'Docker' 
  | 'SSH' 
  | 'EnvironmentVariables' 
  | 'SystemSettings' 
  | 'Administrator'
  | 'ProcessManagement';

export type PermissionState = 'AlwaysAllow' | 'AskEveryTime' | 'AlwaysDeny';

export type PermissionProfile = 'Developer' | 'Administrator' | 'ReadOnly' | 'Guest' | 'SafeMode' | 'Custom';

export interface IPermissionManager {
  checkPermission(category: PermissionCategory): PermissionState;
  setPermission(category: PermissionCategory, state: PermissionState): void;
  setProfile(profile: PermissionProfile): void;
  getCurrentProfile(): PermissionProfile;
}

export class PermissionManager implements IPermissionManager {
  private static instance?: PermissionManager;
  private permissions: Map<PermissionCategory, PermissionState> = new Map();
  private currentProfile: PermissionProfile = 'SafeMode';
  private skipSave = false;

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
      PermissionManager.instance.loadState();
    }
    return PermissionManager.instance;
  }

  constructor() {
    this.skipSave = true;
    this.setProfile('SafeMode'); // Default
    this.skipSave = false;
  }

  private loadState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('cero_permission_state');
        if (saved) {
          const data = JSON.parse(saved);
          if (data.profile) {
            this.currentProfile = data.profile;
          }
          if (data.permissions) {
            Object.entries(data.permissions).forEach(([key, val]) => {
              this.permissions.set(key as PermissionCategory, val as PermissionState);
            });
          }
        }
      } catch (e) {
        console.warn('[PermissionManager] Failed to load persisted state:', e);
      }
    }
  }

  private saveState(): void {
    if (this.skipSave) return;
    if (typeof localStorage !== 'undefined') {
      try {
        const permsObj: Record<string, string> = {};
        this.permissions.forEach((val, key) => { permsObj[key] = val; });
        localStorage.setItem('cero_permission_state', JSON.stringify({
          profile: this.currentProfile,
          permissions: permsObj
        }));
      } catch (e) {
        console.warn('[PermissionManager] Failed to save state:', e);
      }
    }
  }

  checkPermission(category: PermissionCategory): PermissionState {
    return this.permissions.get(category) || 'AskEveryTime';
  }

  setPermission(category: PermissionCategory, state: PermissionState): void {
    this.permissions.set(category, state);
    this.currentProfile = 'Custom';
    this.saveState();
  }

  getCurrentProfile(): PermissionProfile {
    return this.currentProfile;
  }

  setProfile(profile: PermissionProfile): void {
    this.currentProfile = profile;
    this.permissions.clear();

    switch (profile) {
      case 'Developer':
        this.permissions.set('ReadFiles', 'AlwaysAllow');
        this.permissions.set('WriteFiles', 'AlwaysAllow');
        this.permissions.set('DeleteFiles', 'AskEveryTime'); // Even devs should be asked before delete
        this.permissions.set('RenameFiles', 'AlwaysAllow');
        this.permissions.set('ShellExecution', 'AlwaysAllow');
        this.permissions.set('Network', 'AlwaysAllow');
        this.permissions.set('Clipboard', 'AlwaysAllow');
        this.permissions.set('ProcessManagement', 'AlwaysAllow');
        this.permissions.set('Git', 'AlwaysAllow');
        this.permissions.set('Docker', 'AlwaysAllow');
        this.permissions.set('SSH', 'AlwaysAllow');
        this.permissions.set('EnvironmentVariables', 'AlwaysAllow');
        this.permissions.set('SystemSettings', 'AlwaysAllow');
        break;
      case 'Administrator':
        // Extremely permissive
        const allCategories: PermissionCategory[] = [
          'ReadFiles', 'WriteFiles', 'DeleteFiles', 'RenameFiles', 'ShellExecution',
          'Network', 'Clipboard', 'ProcessManagement', 'Git', 'Docker', 'SSH',
          'EnvironmentVariables', 'SystemSettings', 'Administrator'
        ];
        allCategories.forEach(cat => this.permissions.set(cat, 'AlwaysAllow'));
        break;
      case 'ReadOnly':
        this.permissions.set('ReadFiles', 'AlwaysAllow');
        this.permissions.set('Network', 'AlwaysAllow');
        this.permissions.set('Clipboard', 'AlwaysAllow');
        this.permissions.set('WriteFiles', 'AlwaysDeny');
        this.permissions.set('DeleteFiles', 'AlwaysDeny');
        this.permissions.set('RenameFiles', 'AlwaysDeny');
        this.permissions.set('ShellExecution', 'AlwaysDeny');
        this.permissions.set('ProcessManagement', 'AlwaysDeny');
        this.permissions.set('Git', 'AlwaysDeny');
        this.permissions.set('Docker', 'AlwaysDeny');
        this.permissions.set('SSH', 'AlwaysDeny');
        this.permissions.set('EnvironmentVariables', 'AlwaysDeny');
        this.permissions.set('SystemSettings', 'AlwaysDeny');
        this.permissions.set('Administrator', 'AlwaysDeny');
        break;
      case 'SafeMode':
        this.permissions.set('ReadFiles', 'AlwaysAllow');
        this.permissions.set('Network', 'AskEveryTime');
        this.permissions.set('WriteFiles', 'AskEveryTime');
        this.permissions.set('DeleteFiles', 'AlwaysDeny'); // Default deny deletes in safe mode
        this.permissions.set('RenameFiles', 'AskEveryTime');
        this.permissions.set('ShellExecution', 'AskEveryTime');
        this.permissions.set('ProcessManagement', 'AskEveryTime');
        this.permissions.set('Git', 'AskEveryTime');
        this.permissions.set('Docker', 'AskEveryTime');
        this.permissions.set('SSH', 'AskEveryTime');
        this.permissions.set('EnvironmentVariables', 'AskEveryTime');
        this.permissions.set('SystemSettings', 'AskEveryTime');
        this.permissions.set('Clipboard', 'AlwaysAllow');
        this.permissions.set('Administrator', 'AlwaysDeny');
        break;
      case 'Guest':
        this.permissions.set('ReadFiles', 'AskEveryTime');
        this.permissions.set('Network', 'AskEveryTime');
        this.permissions.set('Clipboard', 'AskEveryTime');
        this.permissions.set('WriteFiles', 'AlwaysDeny');
        this.permissions.set('DeleteFiles', 'AlwaysDeny');
        this.permissions.set('RenameFiles', 'AlwaysDeny');
        this.permissions.set('ShellExecution', 'AlwaysDeny');
        this.permissions.set('ProcessManagement', 'AlwaysDeny');
        this.permissions.set('Git', 'AlwaysDeny');
        this.permissions.set('Docker', 'AlwaysDeny');
        this.permissions.set('SSH', 'AlwaysDeny');
        this.permissions.set('EnvironmentVariables', 'AlwaysDeny');
        this.permissions.set('SystemSettings', 'AlwaysDeny');
        this.permissions.set('Administrator', 'AlwaysDeny');
        break;
    }
    this.saveState();
  }
}

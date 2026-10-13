/** What the backend reports about the `.flow` file association (src-tauri/src/file_association.rs). */
export interface AssociationStatus {
  /** `registered` (this program), `registered-elsewhere` (another path) or `missing` */
  status: 'registered' | 'registered-elsewhere' | 'missing';
  registered: boolean;
  command: string | null;
  /** Registered for all users by the installer; Settings cannot remove that */
  machine_wide: boolean;
}

function programOf(command: string | null): string {
  if (!command) return 'another program';
  const quoted = command.match(/^\s*"([^"]+)"/);
  return quoted ? quoted[1] : command.trim().split(/\s+/)[0];
}

export function describeAssociation(status: AssociationStatus | null): string {
  if (!status) return 'Makes Cero the program that opens .flow files.';
  if (status.status === 'registered') {
    return status.machine_wide
      ? '.flow files open with Cero. The installer set this for all users.'
      : '.flow files open with Cero.';
  }
  if (status.status === 'registered-elsewhere') {
    return `.flow files open with another program or install (${programOf(status.command)}). Turn this on to use this copy of Cero.`;
  }
  return '.flow files are not registered. Turn this on to open them with Cero.';
}

/** An all-users registration cannot be removed without administrator rights, so the switch stays on. */
export function isAssociationToggleLocked(status: AssociationStatus | null): boolean {
  return Boolean(status && status.machine_wide && status.registered);
}

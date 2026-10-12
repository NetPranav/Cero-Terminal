/**
 * Vitest setup: give every test file its own throwaway HOME.
 *
 * Many stores resolve `~/.cero/...` from process.env.HOME. Without this, `npm test` wrote
 * fixtures (fake adapter manifests, "prod-cluster" sessions, steering vectors) into the
 * developer's real ~/.cero and changed what the installed app loads.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isolatedHome = mkdtempSync(join(tmpdir(), 'cero-test-home-'));
process.env.HOME = isolatedHome;
process.env.USERPROFILE = isolatedHome;
// zsh reads $ZDOTDIR/.zshenv (default: the real home) even when HOME changes
process.env.ZDOTDIR = isolatedHome;
process.env.XDG_CONFIG_HOME = join(isolatedHome, '.config');
process.env.XDG_DATA_HOME = join(isolatedHome, '.local', 'share');

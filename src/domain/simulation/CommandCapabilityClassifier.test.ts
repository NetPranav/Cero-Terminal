import { describe, it, expect } from 'vitest';
import { CommandCapabilityClassifier } from './CommandCapabilityClassifier';

describe('CommandCapabilityClassifier — Shadow PTY Command Classification (0.5.5)', () => {
  describe('Full Shadow Execution (Provably Read-Only Diagnostics)', () => {
    it('should classify safe directory listing and file inspection as full_shadow', () => {
      const lsRes = CommandCapabilityClassifier.classify('ls -la /var/log');
      expect(lsRes.strategy).toBe('full_shadow');
      expect(lsRes.isReadOnly).toBe(true);

      const catRes = CommandCapabilityClassifier.classify('cat /etc/os-release');
      expect(catRes.strategy).toBe('full_shadow');
      expect(catRes.isReadOnly).toBe(true);
    });

    it('should classify process monitoring and system stats as full_shadow', () => {
      const psRes = CommandCapabilityClassifier.classify('ps aux | grep node');
      expect(psRes.strategy).toBe('full_shadow');

      const dfRes = CommandCapabilityClassifier.classify('df -h');
      expect(dfRes.strategy).toBe('full_shadow');

      const uptimeRes = CommandCapabilityClassifier.classify('uptime');
      expect(uptimeRes.strategy).toBe('full_shadow');
    });

    it('should classify read-only git commands as full_shadow', () => {
      const statusRes = CommandCapabilityClassifier.classify('git status --porcelain');
      expect(statusRes.strategy).toBe('full_shadow');

      const logRes = CommandCapabilityClassifier.classify('git log -n 5 --oneline');
      expect(logRes.strategy).toBe('full_shadow');

      const diffRes = CommandCapabilityClassifier.classify('git diff HEAD~1');
      expect(diffRes.strategy).toBe('full_shadow');
    });

    it('should classify stream filters without -i as full_shadow', () => {
      const sedRes = CommandCapabilityClassifier.classify("sed 's/foo/bar/g' test.txt");
      expect(sedRes.strategy).toBe('full_shadow');

      const jqRes = CommandCapabilityClassifier.classify('cat data.json | jq .items');
      expect(jqRes.strategy).toBe('full_shadow');
    });
  });

  describe('Real Dry-Run Execution (Tools with Safe Verification Flags)', () => {
    it('should transform rsync into rsync --dry-run', () => {
      const res = CommandCapabilityClassifier.classify('rsync -avz /src /dest');
      expect(res.strategy).toBe('real_dry_run');
      expect(res.dryRunCommand).toBe('rsync --dry-run -avz /src /dest');
    });

    it('should transform cargo build to cargo check and cargo test to cargo test --no-run', () => {
      const buildRes = CommandCapabilityClassifier.classify('cargo build --release');
      expect(buildRes.strategy).toBe('real_dry_run');
      expect(buildRes.dryRunCommand).toBe('cargo check --release');

      const testRes = CommandCapabilityClassifier.classify('cargo test --all');
      expect(testRes.strategy).toBe('real_dry_run');
      expect(testRes.dryRunCommand).toBe('cargo test --no-run --all');
    });

    it('should transform pip install into pip install --dry-run', () => {
      const pipRes = CommandCapabilityClassifier.classify('pip install requests');
      expect(pipRes.strategy).toBe('real_dry_run');
      expect(pipRes.dryRunCommand).toBe('pip install --dry-run requests');
    });

    it('should transform npm/pnpm publish into --dry-run', () => {
      const npmRes = CommandCapabilityClassifier.classify('npm publish');
      expect(npmRes.strategy).toBe('real_dry_run');
      expect(npmRes.dryRunCommand).toBe('npm publish --dry-run');

      const pnpmRes = CommandCapabilityClassifier.classify('pnpm publish');
      expect(pnpmRes.strategy).toBe('real_dry_run');
      expect(pnpmRes.dryRunCommand).toBe('pnpm publish --dry-run');
    });

    it('should transform make into make -n', () => {
      const makeRes = CommandCapabilityClassifier.classify('make target');
      expect(makeRes.strategy).toBe('real_dry_run');
      expect(makeRes.dryRunCommand).toBe('make -n target');
    });

    it('should transform terraform apply to terraform plan', () => {
      const tfRes = CommandCapabilityClassifier.classify('terraform apply');
      expect(tfRes.strategy).toBe('real_dry_run');
      expect(tfRes.dryRunCommand).toBe('terraform plan');
    });

    it('should transform kubectl apply into --dry-run=client', () => {
      const k8sRes = CommandCapabilityClassifier.classify('kubectl apply -f deployment.yaml');
      expect(k8sRes.strategy).toBe('real_dry_run');
      expect(k8sRes.dryRunCommand).toBe('kubectl apply --dry-run=client -f deployment.yaml');
    });

    it('should transform git clean into git clean -n', () => {
      const cleanRes = CommandCapabilityClassifier.classify('git clean -fd');
      expect(cleanRes.strategy).toBe('real_dry_run');
      expect(cleanRes.dryRunCommand).toBe('git clean -n -fd');
    });


    it('should transform kill <pid> into non-destructive kill -0 <pid>', () => {
      const killRes = CommandCapabilityClassifier.classify('kill -9 4190');
      expect(killRes.strategy).toBe('real_dry_run');
      expect(killRes.dryRunCommand).toBe('kill -0 4190');
    });
  });

  describe('AST-Only Risk Assessment (Mutating or Destructive Without Safe Dry-Run)', () => {
    it('should route rm and rmdir to ast_only to skip shadow execution', () => {
      const rmRes = CommandCapabilityClassifier.classify('rm -rf /tmp/junk');
      expect(rmRes.strategy).toBe('ast_only');
      expect(rmRes.isReadOnly).toBe(false);

      const rmdirRes = CommandCapabilityClassifier.classify('rmdir old_dir');
      expect(rmdirRes.strategy).toBe('ast_only');
    });

    it('should route docker container lifecycle mutations to ast_only', () => {
      const dockerRes = CommandCapabilityClassifier.classify('docker run -d --name redis-server redis:latest');
      expect(dockerRes.strategy).toBe('ast_only');
      expect(dockerRes.isReadOnly).toBe(false);

      const rmContainerRes = CommandCapabilityClassifier.classify('docker rm -f c123');
      expect(rmContainerRes.strategy).toBe('ast_only');
    });

    it('should route file write redirections to ast_only', () => {
      const redirectRes = CommandCapabilityClassifier.classify('echo "export FOO=bar" >> ~/.bashrc');
      expect(redirectRes.strategy).toBe('ast_only');
      expect(redirectRes.reason).toContain('redirection');
    });

    it('should route mutating git commands without dry run to ast_only', () => {
      const commitRes = CommandCapabilityClassifier.classify('git commit -m "fix bug"');
      expect(commitRes.strategy).toBe('ast_only');

      const pushRes = CommandCapabilityClassifier.classify('git push origin main');
      expect(pushRes.strategy).toBe('ast_only');

      const rebaseRes = CommandCapabilityClassifier.classify('git rebase main');
      expect(rebaseRes.strategy).toBe('ast_only');
    });


    it('should detect catastrophic destructive operations and route to ast_only with warning', () => {
      const rootRm = CommandCapabilityClassifier.classify('rm -rf /');
      expect(rootRm.strategy).toBe('ast_only');
      expect(rootRm.reason).toContain('Catastrophic destructive operation detected');

      const ddWipe = CommandCapabilityClassifier.classify('dd if=/dev/zero of=/dev/sda bs=1M');
      expect(ddWipe.strategy).toBe('ast_only');
      expect(ddWipe.reason).toContain('Catastrophic destructive operation detected');
    });
  });
});

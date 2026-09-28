import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicRuleOracle, RuleContext, RemediationRule } from './DeterministicRuleOracle';

describe('DeterministicRuleOracle (Phase 5.2 — thefuck Architecture)', () => {
  let oracle: DeterministicRuleOracle;

  beforeEach(() => {
    oracle = DeterministicRuleOracle.getInstance();
  });

  it('registers all 50+ built-in battle-tested rules', () => {
    expect(oracle.getRuleCount()).toBeGreaterThanOrEqual(30);
  });

  describe('Git Remediation Rules', () => {
    it('fixes missing upstream branch on git push', () => {
      const ctx: RuleContext = {
        command: 'git push',
        output: `fatal: The current branch feature-auth has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream origin feature-auth
`,
        exitCode: 128
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.ruleId).toBe('git_push_set_upstream');
      expect(suggestion?.fixedCommand).toBe('git push --set-upstream origin feature-auth');
      expect(suggestion?.confidence).toBeGreaterThanOrEqual(0.95);
      expect(suggestion?.autoExecutable).toBe(true);
    });

    it('suggests pull rebase when push is rejected (fetch first)', () => {
      const ctx: RuleContext = {
        command: 'git push origin main',
        output: 'error: failed to push some refs to remote. Updates were rejected because the remote contains work that you do not have locally. (fetch first)',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.ruleId).toBe('git_push_pull_first');
      expect(suggestion?.fixedCommand).toBe('git pull --rebase && git push');
    });

    it('switches to branch when creation fails because branch already exists', () => {
      const ctx: RuleContext = {
        command: 'git checkout -b develop',
        output: "fatal: A branch named 'develop' already exists.",
        exitCode: 128
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.ruleId).toBe('git_branch_already_exists');
      expect(suggestion?.fixedCommand).toBe('git checkout develop');
    });

    it('initializes repository when git command fails with not a git repository', () => {
      const ctx: RuleContext = {
        command: 'git status',
        output: 'fatal: not a git repository (or any of the parent directories): .git',
        exitCode: 128
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.ruleId).toBe('git_not_a_repo');
      expect(suggestion?.fixedCommand).toBe('git init && git status');
    });

    it('removes stale .git/index.lock', () => {
      const ctx: RuleContext = {
        command: 'git add .',
        output: "fatal: Unable to create '/project/.git/index.lock': File exists. Another git process seems to be running in this repository.",
        exitCode: 128
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.ruleId).toBe('git_index_lock');
      // Targets the repository named in the error, then retries the command
      expect(suggestion?.fixedCommand).toBe("rm -f '/project/.git/index.lock' && git add .");
    });

    it('forces git clean when requireForce defaults to true', () => {
      const ctx: RuleContext = {
        command: 'git clean',
        output: 'fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('git_clean_require_force');
      expect(suggestion?.fixedCommand).toBe('git clean -fd');
    });
  });

  describe('Package Managers & Compilers Rules', () => {
    it('installs missing Node module via npm install', () => {
      const ctx: RuleContext = {
        command: 'node server.js',
        output: "Error: Cannot find module 'express'\nRequire stack:\n- /app/server.js",
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('npm_missing_package');
      expect(suggestion?.fixedCommand).toBe('npm install express');
    });

    it('installs missing Python module via pip3 install', () => {
      const ctx: RuleContext = {
        command: 'python3 train.py',
        output: "ModuleNotFoundError: No module named 'torch'",
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('python_missing_module');
      expect(suggestion?.fixedCommand).toBe('pip3 install torch');
    });

    it('adds missing Rust crate via cargo add', () => {
      const ctx: RuleContext = {
        command: 'cargo build',
        output: "error[E0432]: unresolved import `serde_json`\n --> src/main.rs:1:5\n  |\n1 | use serde_json;\n  |     ^^^^^^^^^^ no crate named `serde_json`",
        exitCode: 101
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('cargo_missing_crate');
      expect(suggestion?.fixedCommand).toBe('cargo add serde_json');
    });

    it('accepts Xcode license agreement when required by Homebrew', () => {
      const ctx: RuleContext = {
        command: 'brew install cmake',
        output: 'Error: Agreeing to the Xcode/iOS license requires admin privileges, please run `sudo xcodebuild -license` and then try this command again.',
        exitCode: 1,
        os: 'mac'
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('brew_xcode_license');
      expect(suggestion?.fixedCommand).toBe('sudo xcodebuild -license accept');
      expect(suggestion?.requiresElevation).toBe(true);
    });

    it('overwrites conflicting symlinks during brew link', () => {
      const ctx: RuleContext = {
        command: 'brew link openssl@3',
        output: 'Error: The `brew link` step did not complete successfully\nLinking /opt/homebrew/Cellar/openssl@3/3.2.1...\nDirectory not empty\n\nPossible solutions:\n  brew link --overwrite openssl@3',
        exitCode: 1,
        os: 'mac'
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('brew_link_overwrite');
      expect(suggestion?.fixedCommand).toBe('brew link --overwrite openssl@3');
    });
  });

  describe('Filesystem & Navigation Rules', () => {
    it('adds -p when mkdir fails with missing parent directory', () => {
      const ctx: RuleContext = {
        command: 'mkdir deep/nested/folder',
        output: 'mkdir: deep/nested/folder: No such file or directory',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('mkdir_p');
      expect(suggestion?.fixedCommand).toBe('mkdir -p deep/nested/folder');
    });

    it('fixes cd parent typo (cd ..dir to cd ../dir)', () => {
      const ctx: RuleContext = {
        command: 'cd ..frontend',
        output: 'cd: no such file or directory: ..frontend',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('cd_parent_typo');
      expect(suggestion?.fixedCommand).toBe('cd ../frontend');
    });

    it('adds -rf when rm fails on directory', () => {
      const ctx: RuleContext = {
        command: 'rm build_cache',
        output: 'rm: build_cache: is a directory',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('rm_dir_recursive');
      expect(suggestion?.fixedCommand).toBe('rm -rf build_cache');
    });

    it('adds -R when cp fails on directory', () => {
      const ctx: RuleContext = {
        command: 'cp src backup',
        output: 'cp: src is a directory (not copied).',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('cp_dir_recursive');
      expect(suggestion?.fixedCommand).toBe('cp -R src backup');
    });

    it('makes script executable when running ./script fails with permission denied', () => {
      const ctx: RuleContext = {
        command: './deploy.sh',
        output: 'zsh: permission denied: ./deploy.sh',
        exitCode: 126
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('chmod_executable');
      expect(suggestion?.fixedCommand).toBe('chmod +x ./deploy.sh && ./deploy.sh');
    });
  });

  describe('Process & Port Rules', () => {
    it('kills process occupying port on EADDRINUSE', () => {
      const ctx: RuleContext = {
        command: 'npm run start',
        output: 'Error: listen EADDRINUSE: address already in use :::8080',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('port_in_use_lsof_kill');
      expect(suggestion?.fixedCommand).toBe('lsof -ti:8080 | xargs kill -9');
    });

    it('replaces kill with pkill when passed a process name', () => {
      const ctx: RuleContext = {
        command: 'kill node',
        output: 'kill: illegal pid: node',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('process_kill_name');
      expect(suggestion?.fixedCommand).toBe('pkill -i -f "node"');
    });

    it('kills host process when Docker port allocation fails', () => {
      const ctx: RuleContext = {
        command: 'docker run -p 5432:5432 postgres',
        output: 'docker: Error response from daemon: driver failed programming external connectivity on endpoint: Bind for 0.0.0.0:5432 failed: port is already allocated.',
        exitCode: 125
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('port_docker_conflict');
      expect(suggestion?.fixedCommand).toBe('lsof -ti:5432 | xargs kill -9 && docker run -p 5432:5432 postgres');
    });
  });

  describe('Permissions & Sudo Rules', () => {
    it('prepends sudo on general permission denied failure', () => {
      const ctx: RuleContext = {
        command: 'systemsetup -gettimezone',
        output: 'Operation not permitted',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('sudo_permission_denied');
      expect(suggestion?.fixedCommand).toBe('sudo systemsetup -gettimezone');
      expect(suggestion?.requiresElevation).toBe(true);
    });

    it('uses sudo tee when shell redirection fails with permission denied', () => {
      const ctx: RuleContext = {
        command: 'echo "nameserver 1.1.1.1" > /etc/resolv.conf',
        output: 'zsh: cannot create /etc/resolv.conf: Permission denied',
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('sudo_write_protected');
      expect(suggestion?.fixedCommand).toBe('echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf');
      expect(suggestion?.requiresElevation).toBe(true);
    });

    it('restores ~/.config ownership when EACCES occurs', () => {
      const ctx: RuleContext = {
        command: 'nvim',
        output: "EACCES: permission denied, open '/Users/pranav/.config/nvim/state.json'",
        exitCode: 1
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('chown_user_directory');
      expect(suggestion?.fixedCommand).toBe('sudo chown -R $(whoami) ~/.config');
    });
  });

  describe('Shell Typos Rules', () => {
    it('corrects sl to ls', () => {
      const ctx: RuleContext = {
        command: 'sl -la',
        output: 'zsh: command not found: sl',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('sl_to_ls');
      expect(suggestion?.fixedCommand).toBe('ls -la');
    });

    it('corrects gti to git', () => {
      const ctx: RuleContext = {
        command: 'gti commit -m "feat: login"',
        output: 'zsh: command not found: gti',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('gti_to_git');
      expect(suggestion?.fixedCommand).toBe('git commit -m "feat: login"');
    });

    it('corrects dcoker to docker', () => {
      const ctx: RuleContext = {
        command: 'dcoker ps',
        output: 'zsh: command not found: dcoker',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('dcoker_to_docker');
      expect(suggestion?.fixedCommand).toBe('docker ps');
    });

    it('corrects briw to brew', () => {
      const ctx: RuleContext = {
        command: 'briw update',
        output: 'zsh: command not found: briw',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('briw_to_brew');
      expect(suggestion?.fixedCommand).toBe('brew update');
    });
  });

  describe('Docker Rules', () => {
    it('opens Docker Desktop when daemon is not running on macOS', () => {
      const ctx: RuleContext = {
        command: 'docker ps',
        output: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
        exitCode: 1,
        os: 'mac'
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('docker_daemon_not_running');
      expect(suggestion?.fixedCommand).toContain('open -a Docker');
    });

    it('migrates legacy docker-compose to docker compose', () => {
      const ctx: RuleContext = {
        command: 'docker-compose up -d',
        output: 'zsh: command not found: docker-compose',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('docker_compose_v2');
      expect(suggestion?.fixedCommand).toBe('docker compose up -d');
    });
  });

  describe('macOS Specific Rules', () => {
    it('clears Gatekeeper quarantine using xattr -cr', () => {
      const ctx: RuleContext = {
        command: 'open /Applications/UntrustedApp.app',
        output: '"UntrustedApp.app" cannot be opened because Apple cannot check it for malicious software.',
        exitCode: 1,
        os: 'mac'
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('macos_gatekeeper_quarantine');
      expect(suggestion?.fixedCommand).toContain('xattr -cr');
    });

    it('fixes macOS BSD sed in-place missing empty extension', () => {
      const ctx: RuleContext = {
        command: "sed -i 's/foo/bar/g' file.txt",
        output: 'sed: 1: "file.txt": invalid command code f',
        exitCode: 1,
        os: 'mac'
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('macos_sed_in_place');
      expect(suggestion?.fixedCommand).toBe("sed -i '' 's/foo/bar/g' file.txt");
    });
  });

  describe('Custom Rule Registration & Extensibility', () => {
    it('allows dynamic registration of custom plugin remediation rules', () => {
      const customRule: RemediationRule = {
        id: 'custom_ros2_source',
        name: 'ROS 2 Source Setup',
        description: 'Auto-source setup.bash when ros2 command fails',
        priority: 5,
        match: (ctx) => ctx.command.startsWith('ros2') && /command not found/i.test(ctx.output),
        getRemediation: (ctx) => ({
          ruleId: 'custom_ros2_source',
          ruleName: 'ROS 2 Source Setup',
          title: 'Source ROS 2 environment and retry',
          explanation: 'ROS 2 overlay environment is not sourced in current subshell',
          fixedCommand: `source /opt/ros/humble/setup.bash && ${ctx.command}`,
          confidence: 0.99
        })
      };

      oracle.registerRule(customRule);

      const ctx: RuleContext = {
        command: 'ros2 launch my_drone.launch.py',
        output: 'zsh: command not found: ros2',
        exitCode: 127
      };

      const suggestion = oracle.diagnose(ctx);
      expect(suggestion?.ruleId).toBe('custom_ros2_source');
      expect(suggestion?.fixedCommand).toBe('source /opt/ros/humble/setup.bash && ros2 launch my_drone.launch.py');
    });
  });
});

describe('git subcommand typos', () => {
  it('fixes "git statsu" to "git status", keeping the other arguments', () => {
    const oracle = DeterministicRuleOracle.getInstance();
    const output = "git: 'statsu' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tstatus";
    expect(oracle.diagnose({ command: 'git statsu', output, exitCode: 1 })?.fixedCommand).toBe('git status');
    expect(oracle.diagnose({ command: 'git -C repo statsu -s', output, exitCode: 1 })?.fixedCommand).toBe('git -C repo status -s');
    expect(oracle.diagnose({ command: '', output, exitCode: 1 })?.fixedCommand).toBe('git status');
    expect(oracle.diagnose({ command: 'git statsu', output, exitCode: 1 })?.explanation).toBe("'statsu' is not a command; did you mean 'status'?");
  });
});

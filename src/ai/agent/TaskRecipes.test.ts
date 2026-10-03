import { describe, it, expect } from 'vitest';
import { planRecipe } from './TaskRecipes';

describe('planRecipe', () => {
  it('matches the tricky requests and quotes user text', () => {
    expect(planRecipe('what is the total of the score column in data.csv?', 'macos')?.command).toMatch(/^python3 -c ".*" 'data.csv' 'score'$/s);
    expect(planRecipe('average of the price column in my file.csv', 'windows')).toBeNull();
    expect(planRecipe("sum of the price column in sales.csv", 'windows')?.command).toMatch(/^python -c ".*" 'sales.csv' 'price'$/s);
    expect(planRecipe('which of my python files in src has a syntax error?', 'linux')?.command).toMatch(/ 'src'$/);
    expect(planRecipe('how much space does each subfolder use?', 'macos')?.command).toMatch(/^find \. -mindepth 1/);
    expect(planRecipe('show the 3 largest files under this folder', 'linux')?.command).toMatch(/head -3/);
    expect(planRecipe('replace every foo with bar in all .txt files under text, keeping a .bak backup of each file', 'macos')).toMatchObject({ mutates: true });
    expect(planRecipe('rename all the IMG_*.JPG files in photos to lowercase', 'macos')?.command).toMatch(/^cd 'photos' && find \. -maxdepth 1 -type f -name 'IMG_\*\.JPG'/);
    expect(planRecipe('which process is listening on port 8765?', 'windows')?.command).toMatch(/Get-NetTCPConnection -LocalPort 8765/);
  });

  it('converts CSV to JSON and reads git status of a named folder', () => {
    expect(planRecipe('convert data.csv to a JSON array of objects using python and save it as data.json', 'macos')).toMatchObject({ mutates: true });
    expect(planRecipe('convert data.csv to a JSON array of objects using python and save it as data.json', 'macos')!.command).toMatch(/'data\.csv' 'data\.json'$/);
    const git = planRecipe('what branch is demo-repo on and does it have uncommitted changes?', 'macos')!;
    expect(git.command).toBe("git -C 'demo-repo' status --short --branch");
    expect(git.summarize('## main...origin/main [ahead 1]\n M README.md\n?? notes.txt\n')).toBe('demo-repo is on branch main (ahead 1). Uncommitted changes: README.md (modified), notes.txt (untracked).');
    expect(planRecipe('is node-app/package.json valid JSON? print its scripts section', 'macos')).toBeNull();
    expect(planRecipe('what branch am I on and commit everything', 'macos')).toBeNull();
  });

  it('reads specific lines, errors, matches, line counts and tool versions', () => {
    expect(planRecipe('print the 2nd and 4th lines of logs/app.log', 'macos')?.command).toBe("sed -n '2p;4p' 'logs/app.log'");
    expect(planRecipe('show the first 5 lines of notes.txt', 'windows')?.command).toBe("Get-Content -LiteralPath 'notes.txt' -TotalCount 5");
    expect(planRecipe('show the last 2 errors in logs/app.log', 'linux')?.command).toBe("grep -iE -- 'error|fatal|exception' 'logs/app.log' | tail -n 2");
    expect(planRecipe('which files in text contain the word foo?', 'macos')?.command).toBe("grep -rlF --exclude-dir=.git --exclude-dir=node_modules -- 'foo' 'text'");
    expect(planRecipe('count the lines of code in all .py files under src', 'macos')?.explanation).toBe('Count the lines in every .py file under src');
    expect(planRecipe('are python3 and node installed? show their versions', 'macos')?.command).toMatch(/command -v python3.*command -v node/s);
    expect(planRecipe('is node installed', 'windows')?.command).toMatch(/Get-Command \$c/);
    expect(planRecipe('what is the weather', 'macos')).toBeNull();
  });

  it('answers from the output, including "nothing"', () => {
    expect(planRecipe('what is the total of the score column in data.csv', 'macos')!.summarize('42.5 3\n')).toBe('The total of the score column in data.csv is 42.5 (3 rows).');
    expect(planRecipe('is anything listening on port 8799?', 'macos')!.summarize('')).toBe('Nothing is listening on port 8799.');
  });

  it('leaves ordinary requests to the rest of the agent', () => {
    for (const goal of ['list the files', 'rename foo.txt to bar.txt', 'show disk usage', 'what is in data.csv', 'check for updates']) {
      expect(planRecipe(goal, 'macos'), goal).toBeNull();
    }
  });
});

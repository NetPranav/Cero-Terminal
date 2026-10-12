import { describe, it, expect } from 'vitest';
import { planRecipe } from './TaskRecipes';

describe('planRecipe', () => {
  it('matches the tricky requests and quotes user text', () => {
    expect(planRecipe('what is the total of the score column in data.csv?', 'windows')?.command).toMatch(/^python -c ".*" 'data.csv' 'score'$/s);
    expect(planRecipe('average of the price column in my file.csv', 'windows')).toBeNull();
    expect(planRecipe("sum of the price column in sales.csv", 'windows')?.command).toMatch(/^python -c ".*" 'sales.csv' 'price'$/s);
    expect(planRecipe('which of my python files in src has a syntax error?', 'windows')?.command).toMatch(/ 'src'$/);
    expect(planRecipe('how much space does each subfolder use?', 'windows')?.command).toMatch(/^Get-ChildItem -Directory -Force/);
    expect(planRecipe('show the 3 largest files under this folder', 'windows')?.command).toMatch(/Select-Object -First 3 /);
    expect(planRecipe('replace every foo with bar in all .txt files under text, keeping a .bak backup of each file', 'windows')).toMatchObject({ mutates: true });
    expect(planRecipe('rename all the IMG_*.JPG files in photos to lowercase', 'windows')?.command).toMatch(/^Get-ChildItem -LiteralPath 'photos' -File -Filter 'IMG_\*\.JPG'/);
    expect(planRecipe('which process is listening on port 8765?', 'windows')?.command).toMatch(/Get-NetTCPConnection -LocalPort 8765/);
  });

  it('converts CSV to JSON and reads git status of a named folder', () => {
    expect(planRecipe('convert data.csv to a JSON array of objects using python and save it as data.json', 'windows')).toMatchObject({ mutates: true });
    expect(planRecipe('convert data.csv to a JSON array of objects using python and save it as data.json', 'windows')!.command).toMatch(/'data\.csv' 'data\.json'$/);
    const git = planRecipe('what branch is demo-repo on and does it have uncommitted changes?', 'windows')!;
    expect(git.command).toBe("git -C 'demo-repo' status --short --branch");
    expect(git.summarize('## main...origin/main [ahead 1]\n M README.md\n?? notes.txt\n')).toBe('demo-repo is on branch main (ahead 1). Uncommitted changes: README.md (modified), notes.txt (untracked).');
    expect(planRecipe('is node-app/package.json valid JSON? print its scripts section', 'windows')).toBeNull();
    expect(planRecipe('what branch am I on and commit everything', 'windows')).toBeNull();
  });

  it('reads specific lines, errors, matches, line counts and tool versions', () => {
    expect(planRecipe('print the 2nd and 4th lines of logs/app.log', 'windows')?.command).toBe("Get-Content -LiteralPath 'logs/app.log' | Select-Object -Index 1,3");
    expect(planRecipe('show the first 5 lines of notes.txt', 'windows')?.command).toBe("Get-Content -LiteralPath 'notes.txt' -TotalCount 5");
    expect(planRecipe('show the last 2 errors in logs/app.log', 'windows')?.command).toBe("Select-String -LiteralPath 'logs/app.log' -Pattern 'error|fatal|exception' | Select-Object -Last 2 | ForEach-Object { $_.Line }");
    expect(planRecipe('which files in text contain the word foo?', 'windows')?.command).toBe("Get-ChildItem -Path 'text' -Recurse -File | Select-String -SimpleMatch -Pattern 'foo' -List | ForEach-Object { Resolve-Path -Relative $_.Path }");
    expect(planRecipe('count the lines of code in all .py files under src', 'windows')?.explanation).toBe('Count the lines in every .py file under src');
    expect(planRecipe('are python and node installed? show their versions', 'windows')?.command).toMatch(/@\('python','node'\)/);
    expect(planRecipe('is node installed', 'windows')?.command).toMatch(/Get-Command \$c/);
    expect(planRecipe('what is the weather', 'windows')).toBeNull();
  });

  it('answers from the output, including "nothing"', () => {
    expect(planRecipe('what is the total of the score column in data.csv', 'windows')!.summarize('42.5 3\n')).toBe('The total of the score column in data.csv is 42.5 (3 rows).');
    expect(planRecipe('is anything listening on port 8799?', 'windows')!.summarize('')).toBe('Nothing is listening on port 8799.');
  });

  it('leaves ordinary requests to the rest of the agent', () => {
    for (const goal of ['list the files', 'rename foo.txt to bar.txt', 'show disk usage', 'what is in data.csv', 'check for updates']) {
      expect(planRecipe(goal, 'windows'), goal).toBeNull();
    }
  });
});

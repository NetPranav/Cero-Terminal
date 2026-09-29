#!/bin/bash
# Rebuild the stress-test fixtures from scratch
T="$(cd "$(dirname "$0")" && pwd)/.runs"; mkdir -p "$T"
rm -rf "$T/work" "$T/home"; mkdir -p "$T/home" "$T/work"; : > "$T/home/.zshenv"
printf '[user]\n\tname = Sentinel Test\n\temail = test@example.invalid\n[init]\n\tdefaultBranch = main\n' > "$T/home/.gitconfig"
cd "$T/work" || exit 1
mkdir -p node-app logs text photos src "my notes" scripts wf backup
printf '{ "name": "node-app", "version": "1.0.0", "scripts": { "test": "node test.js", "start": "node server.js" } }\n' > node-app/package.json
printf 'exports.add = (a, b) => a - b;\n' > node-app/math.js
printf "const assert = require('assert');\nconst { add } = require('./math');\nassert.strictEqual(add(2, 2), 4, 'add(2, 2) should be 4');\nconsole.log('all tests passed');\n" > node-app/test.js
printf '2026-09-29 10:00:01 INFO server starting\n2026-09-29 10:00:02 INFO connected to db\n2026-09-29 10:00:05 ERROR payment failed: card declined\n2026-09-29 10:00:09 WARN slow query 1200ms\n2026-09-29 10:00:11 ERROR payment failed: timeout\n2026-09-29 10:00:15 INFO request done\n' > logs/app.log
for i in $(seq 1 40); do echo "10.0.0.$((i%4+1)) - - [29/Sep/2026:10:00:$i] \"GET /page$((i%3)) HTTP/1.1\" 200 512"; done > logs/access.log
printf 'ERROR one\nINFO two\nERROR three\nERROR four\n' > logs/old.log
printf 'foo is here\nand foo again\n' > text/a.txt; printf 'no match\nfoo once\n' > text/b.txt
for n in 001 002 003; do touch photos/IMG_$n.JPG; done
printf 'name,team,score\nana,red,10\nbo,blue,20\ncy,red,12.5\n' > data.csv
printf 'import util\n# TODO: handle errors\nprint(util.greet("x"))\n' > src/main.py
printf 'def greet(n):\n    return "hi " + n  # TODO: i18n\n' > src/util.py
printf 'def broken(:\n    pass\n' > src/broken.py
printf 'hello\n' > "my notes/file one.txt"; printf 'hello world\n' > "my notes/file two.txt"
printf '#!/bin/sh\nset -e\nnpm run build\ntar czf dist.tgz dist\nscp dist.tgz deploy@web1:/srv/app/\nssh deploy@web1 "cd /srv/app && tar xzf dist.tgz && systemctl restart app"\n' > scripts/deploy.sh
printf 'items = ["3", 4, 5]\ntotal = 0\nfor i in items:\n    total += i\nprint("total", total)\n' > buggy.py
dd if=/dev/zero of=big1.bin bs=1024 count=3072 2>/dev/null; dd if=/dev/zero of=src/big2.bin bs=1024 count=1024 2>/dev/null; dd if=/dev/zero of=logs/big3.bin bs=1024 count=512 2>/dev/null
printf '{ "name": "build-check", "steps": [ { "command": "echo step-one-ok" }, { "command": "ls data.csv" }, { "command": "echo step-three-ok" } ] }\n' > wf/build.workflow.json
mkdir demo-repo && cd demo-repo && export HOME="$T/home" && git init -q && echo "# demo" > README.md && git add . && git commit -qm "initial commit" && echo a > a.txt && git add . && git commit -qm "add a" && echo b > b.txt && git add . && git commit -qm "add b" && echo change >> README.md
echo "fixtures ready"

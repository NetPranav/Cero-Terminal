
---

### Safety-Guarded Commands Catalog (For Manual Execution)

To guarantee that your host machine was never disconnected from the internet, locked out, or suffered unrecoverable data loss during automated benchmarking, the following commands were safely **emulated / guarded** by the test harness. 

You can run them manually in your terminal if you wish to observe their live behavior on your system:

#### 1. Network & Connectivity Mutations (Domain 3)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **3.14** | `>turn off wifi` | `nmcli radio wifi off`<br>*(or `rfkill block wifi`)* | **High**: Powers off physical Wi-Fi card and severs internet connection on `wlo1`. |
| **3.15** | `>turn on wifi` | `nmcli radio wifi on`<br>*(or `rfkill unblock wifi`)* | Re-enables Wi-Fi radio. |
| **3.17** | `>turn off bluetooth` | `bluetoothctl power off`<br>*(or `rfkill block bluetooth`)* | **High**: Disconnects Bluetooth keyboards, mice, and headphones. |
| **3.18** | `>turn on bluetooth` | `bluetoothctl power on`<br>*(or `rfkill unblock bluetooth`)* | Re-enables Bluetooth adapter. |
| **3.30** | `>clear arp cache entry for gateway` | `sudo ip neigh flush all` | **High**: Flushes ARP cache, causing temporary gateway reachability drops; requires `sudo`. |
| **3.36** | `>renew dhcp lease on default interface` | `sudo dhclient -r && sudo dhclient` | **High**: Releases your host IP lease and temporarily drops internet. |
| **3.39** | `>disconnect from current wifi network` | `nmcli dev disconnect wlo1` | **High**: Drops your active Wi-Fi connection. |
| **3.42** | `>connect to bluetooth headphones` | `bluetoothctl connect <MAC_ADDRESS>` | Device-dependent; will hang or error without a specific paired device. |
| **3.43** | `>disconnect bluetooth device` | `bluetoothctl disconnect <MAC_ADDRESS>` | Device-dependent; drops connected peripheral. |
| **3.49** | `>disable ipv6 temporarily` | `sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1` | Modifies kernel networking parameters and requires root. |
| **3.50** | `>enable ipv6` | `sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0` | Re-enables kernel IPv6; requires root. |

#### 2. Git Destructive Workflows (Domain 5)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **5.33** | `>discard working changes in specific file` | `git restore <file>`<br>*(or `git checkout -- <file>`)* | **Destructive**: Discards uncommitted workspace edits with no undo. |
| **5.43** | `>clean npm cache` | `npm cache clean --force` | Purges global npm cache, causing subsequent builds to re-download packages. |

#### 3. Systemd Daemons & System Service Operations (Domain 6)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **6.6** | `>restart NetworkManager service` | `sudo systemctl restart NetworkManager` | **High**: Restarts daemon, immediately terminating all active network sockets and sessions. |
| **6.10** | `>reload systemd daemon` | `sudo systemctl daemon-reload` | Modifies system daemon state; requires root. |
| **6.38** | `>mask a service` | `sudo systemctl mask test.service` | Links unit to `/dev/null`; requires root. |
| **6.39** | `>unmask a service` | `sudo systemctl unmask test.service` | Unmasks unit; requires root. |
| **6.44** | `>vacuum systemd journal logs by time retention` | `sudo journalctl --vacuum-time=7d` | **Destructive**: Permanently purges older system logs; requires root. |
| **6.45** | `>vacuum systemd journal logs by size limit` | `sudo journalctl --vacuum-size=100M` | **Destructive**: Permanently truncates system journal files to 100MB; requires root. |
| **6.49** | `>kill a frozen systemd unit` | `sudo systemctl kill -s SIGKILL test.service` | Sends uncatchable `SIGKILL` to target service; requires root. |

#### 4. Desktop & UI Automation (Domain 7)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **7.11** | `>lock screen` | `loginctl lock-session` | **Disruptive**: Locks your physical screen session while you are working. |
| **7.12** | `>close active window` | `hyprctl dispatch killactive` | **Destructive**: Sends kill signal to whichever window currently has focus (e.g., your IDE or terminal). |
| **7.42** | `>type text hello world synthetically` | `wtype "hello world"` | Injects keystrokes directly into whichever application window currently has focus. |
| **7.43** | `>send synthetic key combo ctrl shift t` | `wtype -M ctrl -M shift -k t` | Reopens closed browser tabs or triggers editor shortcuts in focused window. |
| **7.44** | `>send synthetic key combo alt tab` | `wtype -M alt -k Tab` | Shifts active desktop focus. |
| **7.45** | `>click mouse at coordinates 500 300` | `ydotool mousemove -a 500 300 && ydotool click 0xC0` | Blindly clicks at screen coordinate (500, 300). |
| **7.48** | `>turn off display monitors` | `hyprctl dispatch dpms off` | Turns off physical monitor backlights. |
| **7.49** | `>turn on display monitors` | `hyprctl dispatch dpms on` | Wakes up physical display. |

#### 5. Dotfiles & Rice Management (Domain 8)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **8.6** | `>backup my dotfiles` | `tar -czf ~/.config_backup.tar.gz -C ~ .config` | Compressing full `~/.config` on an active daily driver can consume tens of GBs and freeze system I/O. |
| **8.12** | `>set hyprland active border color to purple` | `sed -i 's/col.active_border = .*/col.active_border = rgba(bb9af7ff) rgba(7aa2f7ff) 45deg/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Overwrites your personal Hyprland border color setting. |
| **8.14** | `>set hyprland inner gaps to 8` | `sed -i 's/gaps_in = .*/gaps_in = 8/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Modifies personal Hyprland window padding. |
| **8.15** | `>set hyprland outer gaps to 14` | `sed -i 's/gaps_out = .*/gaps_out = 14/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Modifies personal Hyprland outer margins. |
| **8.18** | `>toggle hyprland window blur` | `sed -i '/blur {/,/}/ s/enabled = .*/enabled = false/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Modifies compositor visual effects. |
| **8.22** | `>set kitty background opacity to 0.85` | `sed -i 's/background_opacity .*/background_opacity 0.85/' ~/.config/kitty/kitty.conf` | Modifies your personal Kitty configuration file. |
| **8.28** | `>add shell alias gs for git status` | `echo "alias gs='git status'" >> ~/.bashrc` | Permanently writes to your personal `~/.bashrc`. |
| **8.32** | `>restart waybar panel` | `killall waybar && waybar &` | Restarts your active desktop top bar. |
| **8.48** | `>toggle hyprland animations on or off` | `sed -i '/animations {/,/}/ s/enabled = .*/enabled = false/' ~/.config/hypr/hyprland.conf && hyprctl reload` | Modifies compositor animation parameters. |
| **8.49** | `>restore dotfiles from latest backup` | `tar -xzf ~/.config_backup.tar.gz -C ~` | Overwrites current configuration files from tar archive. |

#### 6. Multi-Stage Composite Workflows (Domain 9)
| Prompt ID | Benchmark Prompt | Real Linux Command | Safety Risk / Rationale |
|:---:|---|---|---|
| **9.1** | `>clean project: remove node_modules, reinstall dependencies, and verify tests pass` | `rm -rf node_modules package-lock.json && npm install && npm test` | Removes project dependencies and triggers long re-download over network. |
| **9.3** | `>docker clean: stop all containers, prune unused volumes, and show remaining images` | `docker stop $(docker ps -aq) 2>/dev/null && docker volume prune -f && docker images` | **Destructive**: Stops all running containers on your host and deletes unused Docker volumes. |
| **9.16** | `>clean disk space: clear pacman cache, clean npm cache, vacuum journal logs to 100MB` | `sudo pacman -Sc --noconfirm && npm cache clean --force && sudo journalctl --vacuum-size=100M` | Empties package cache and journal logs; requires root. |
| **9.25** | `>full desktop environment reset: restart hyprland, restart waybar, restart pipewire audio` | `hyprctl reload && killall waybar && waybar & && systemctl --user restart pipewire` | Bounces audio daemon and restarts desktop panel while you are listening to media/calls. |
| **9.29** | `>docker development stack teardown: stop containers, dump database, remove networks` | `docker compose down && pg_dump db > backup.sql && docker network prune -f` | Tears down running containers and prunes Docker networks. |
| **9.39** | `>clean git merged local branches: list merged branches, filter main/linux, delete stale refs` | `git branch --merged main \| grep -v '^\*\|main\|linux' \| xargs -r git branch -d` | Deletes local git branches from your repository. |


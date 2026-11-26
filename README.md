# best-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/brisk-lynx-39/best-flight-game/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/brisk-lynx-39/best-flight-game/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Ridgeline Courier** — an original bush-plane courier flight game. Fly the Kestrel K-2 out
of Millbrook's Runway 36, chase six gold rings over a procedural valley of patchwork fields,
a winding river, a lakeside town and drifting clouds, then bring her home and land on the
strip. Throttle, pitch and bank discipline decide the run: rings pay 500 points each, a
smooth landing pays a bonus, and the clock pays for speed — but fuel is finite, a stall
drops the nose, and a hard or sideways touchdown ends the run in the grass.

Everything is hand-drawn canvas art and synthesised WebAudio sound — no assets, no libraries,
no network. Playable with keyboard or mouse (↑ ↓ pitch, ← → bank, Shift / Ctrl throttle,
mouse steers like a stick, wheel sets throttle, Space start, P pause, M mute, R restart).

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or serve the `game/` folder with any static file server and open `game/index.html`.
`main.ts` is the make.fun handover program: it copies `game/` and `screenshots/` to the output
directory and writes the entry dossier.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>

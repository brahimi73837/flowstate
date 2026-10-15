# Flowstate

A quiet focus timer for deep work. Set any block length, from 25 minutes to 4 hours. Pick the one task that matters, and get a chime that rings on time, even when the tab is in the background.

**Use it:** https://brahimi73837.github.io/flowstate/

No account, no server, no tracking. Everything stays in your browser's local storage. The page makes no network requests besides loading itself, and it works offline once loaded.

## What it does

- **Any block length.** Presets for 25/5, 50/10, 90/20 and 4h/30, or set your own focus and break minutes.
- **Tasks.** Add tasks with an optional planned time ("45m", "1h30"). Make one the active task, or press play to run the timer on its remaining time. Finish it mid-block and pick the next one; the clock keeps running and the time is split correctly between tasks.
- **Don't break my flow.** When a block ends, the chime plays and the clock counts up as overtime. You surface when you reach a natural stopping point. Long overtime earns a longer break (a fifth of the time you focused).
- **Park a thought.** Press `N`, write down the distraction, and get back to work. Parked thoughts can be turned into tasks later.
- **Insights.** Focus time today, this week and this month, your streak, the last 14 days against your daily goal, a month calendar, your strongest hours, top tasks, and how deep each block felt.
- **Focus sounds.** Brown noise, rain or ocean, all generated in the browser. They play during focus only, so breaks stay quiet.
- **Backup and restore.** Your data lives in one browser. To move it to another computer, download a backup and restore it there.

## Why the chime is on time

Browsers throttle, and sometimes freeze, JavaScript in background tabs (Edge's "sleeping tabs", Chrome's intensive throttling). That's why some timers only ring when you switch back to the tab. Flowstate guards against this in four ways:

1. **The chime is scheduled ahead of time on the Web Audio clock.** When a block starts, the end chime and its repeats are queued on the audio thread, which page throttling doesn't affect.
2. **The tab is kept awake.** While a block runs, Flowstate plays a sub-bass tone below what you can hear. Browsers treat tabs that play audio as in use and don't throttle them or put them to sleep. You can turn this off in Settings, but it's best left on.
3. **A Web Worker heartbeat** checks the clock, because worker timers aren't throttled the way background-tab timers are.
4. **Time comes from the wall clock.** The timer never counts ticks. If the computer sleeps, the block still ends at the right moment, and it's logged with its real end time.

On top of that, you can turn on desktop notifications, and the tab title and icon show the countdown.

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | Start, pause, resume |
| `N` | Park a thought |
| `T` / `I` / `,` | Tasks / Insights / Settings |
| `F` | Full screen |
| `Esc` | Close panel |

## Tunes bridge

Flowstate shares its state on a same-origin `BroadcastChannel('flowstate')`, so companion apps on `brahimi73837.github.io` (such as [Tunes](https://brahimi73837.github.io/tunes/)) can follow your blocks. Messages never leave the browser.

```ts
{ source: 'flowstate', v: 1, type: 'state', phase: 'idle' | 'focus' | 'break', running: boolean, endsAt: number | null, task: string | null }
{ source: 'flowstate', v: 1, type: 'alarm', kind: 'focus-end' | 'break-end' }
```

To follow along, Tunes listens with `new BroadcastChannel('flowstate').onmessage = (e) => { ... }`. For example, it can play on `focus` and pause on `break`. You can turn the bridge off in Settings → Music.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (timer math, stats, store flows)
npm run test:e2e   # Playwright, desktop + mobile, against a production build
npm run build
```

Built with Vite, React, TypeScript and zustand. Fonts (Bricolage Grotesque, Geist) are self-hosted. Every push to `main` runs the tests and deploys to GitHub Pages.

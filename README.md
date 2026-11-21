# Focus Lock Pomodoro

A Chrome extension (Manifest V3) that combines a Pomodoro timer with optional
website blocking, built to help students keep studying instead of drifting into
short-form video. Its break screen offers music, mini-games and news headlines,
so students can rest without opening social media.

Built by a high school student at Nguyen Du High School (Ho Chi Minh City) for a
school science research project (Second Place, 2026).

**Install from the Chrome Web Store:** [ADD YOUR STORE LINK HERE]

## Features

- **Pomodoro timer**: 25-minute focus / 5-minute break phases, with an optional
  4-session sequence ending in a 15-minute long break.
- **Focus-session website blocking (opt-in)**: sites on a user-editable blocklist
  (default: TikTok, Instagram, Facebook, X/Twitter) are redirected to a
  "blocked" page until the session ends or is reset.
- **Break screen**: embedded music videos, three mini-games (Snake, 2048, Memory)
  and a news reader that pulls RSS headlines from Vietnamese and international
  outlets (e.g. Tuoi Tre, Thanh Nien, VnExpress, BBC, The New York Times).
- **Break enforcement**: the break tab reopens if closed early.
- **Goal planner**: set tasks with estimated Pomodoros, and the actual count
  updates as sessions complete.
- **Extras**: end-of-phase chime, dark/light theme, and a 10-second Test mode for
  trying the whole flow quickly.

## How it works

| File | Role |
|---|---|
| `manifest.json` | Permissions, icons and pages |
| `background.js` | Service worker: timer, phase changes, blocklist, tab control |
| `popup.*` | Toolbar popup |
| `focus.*` / `break.*` | Full-tab screens for focus and break phases |
| `setup.*` | Goal planner |
| `blocked.*` | Page shown for blocked sites |

All settings and goals are stored locally with `chrome.storage`.

## Run locally

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

**Music files:** audio files are not included in this repository. `focus.js` lists
the tracks for focus sessions. To use your own music, put audio files you have the
right to use in `media/` and update the track list at the top of `focus.js`.

## Survey results (preliminary)

After a trial, 111 students at Nguyen Du High School answered a Google Form.
On the question about their ability to stay concentrated while studying:

| Response | Share |
|---|---|
| Improved or markedly improved | 66.7% (74 of 111) |
| No change | 18.0% |
| Decreased or markedly decreased | 15.3% |

These are self-reported answers from a single school with no control group, so
they show student feedback rather than proof that the extension caused the change.

## Limitations

Chrome does not let extensions hard-lock a browser, so Focus Lock works through
friction (blocking, warnings, reopening the break tab), not enforcement.

## Notes

The break-screen video player uses a small page (`yt-player.html`) hosted on
GitHub Pages in a separate repository, because YouTube blocks embeds from
`chrome-extension://` pages. See `docs/dev-notes.vi.md` for the original
Vietnamese development notes.

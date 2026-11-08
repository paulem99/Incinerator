# The Incinerator

A morgue-themed pixel-art music player for Windows (Electron). It plays local MP3s and the owner's Apple Music
library, through Apple's web player in a hidden window. The owner designs it and Claude writes the code. Build
the design in steps with the owner, and ask about design details instead of guessing.

## Publishing rule (from the owner)

**Never send anything to GitHub without the owner's explicit yes in the chat.** That covers pushing commits,
pushing tags, and creating releases. Installed copies read `updates/latest.json` on `main`, so a push that
includes `updates/` offers that version to every player.

**The app never updates itself without asking.** When a newer version is out, the player asks UPDATE NOW or
NOT NOW. Nothing downloads until the answer is yes, and NOT NOW keeps the current version running. Keep it that
way.

Before you push anything, tell the owner what changed and which version it is, and ask. Local commits and local
builds are fine without asking.

## Layout

- `boot.js` is the startup loader (`main` in package.json). It runs the newest good app update from
  `%APPDATA%\The Incinerator\updates\app-<ver>`. If an update fails to start 3 times, it falls back to the
  previous update or to the copy the installer shipped.
- `src/main.js` is the main process. It runs the player window, the hidden Apple Music window
  (music.apple.com with a Chrome user agent), the local library scan, the `incin://` file protocol, settings,
  and the log (`%APPDATA%\The Incinerator\log.txt`, opened with Ctrl+Shift+L).
- `src/updater.js` checks every time the app opens, then every 6 h. It reads `updates/latest.json` from the repo
  (raw.githubusercontent.com) and `releases/latest/download/latest.json`, and uses whichever is newer. It
  only downloads after the user says yes: the `.pak` (app update), or the full installer when the Electron
  shell changes. Every download is checked against its sha256, then the app restarts into the new version.
  This session can't create GitHub Releases (403), so normal updates go through `updates/`.
- `src/signing.js` and `src/setup/` handle the one-time castLabs VMP signing on the user's PC, using the
  bundled portable Python (`resources/pyevs`). castLabs passwords are never stored: they go to the child
  process through environment variables only.
- `src/am-hook.js` is injected into music.apple.com and drives MusicKit (library, `setQueue`, playback events).
- `src/player/player.js` is the whole pixel renderer: a 300x268 canvas with the intro, HUD, morgue drawer,
  incinerator volume, settings gear, search, and skull.
- `installer.nsi` is the per-user NSIS installer. It keeps the existing `.sig` unless the castLabs `version`
  file changed, and in silent mode (`/S`, used by the updater) it relaunches the app.

## Build and release (Linux workspace)

```
npm ci
bash scripts/build-installer.sh            # -> out/The Incinerator Setup.exe (downloads vendor/ on first run)
node scripts/make-release.js --notes "..."  # -> updates/ (.pak + latest.json), nothing published
git commit ...                              # code changes, locally
bash scripts/publish.sh --owner-said-yes    # ONLY after the owner says yes: commits updates/ and pushes main
```

For each release:

- Bump `version` in package.json.
- If you change the castLabs Electron version, bump `incinerator.shell` in package.json. Players then need
  the full installer instead of the `.pak`, and they have to sign the new exe once. Run
  `make-release.js --full`, and have the owner upload `out/release-<ver>/` to a GitHub Release by hand.
- Test locally:

  ```
  INCIN_UPDATE_BASE=http://127.0.0.1:<port> xvfb-run -a <castLabs linux electron> --no-sandbox <app dir>
  ```

  Serve `latest.json` and the `.pak` from that port. Set `XDG_CONFIG_HOME` to keep userData separate.

## Never

- Commit secrets. The repo is public.
- Store or log castLabs credentials.

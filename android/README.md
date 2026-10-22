# Mr. Bridge for Android

A thin [Capacitor](https://capacitorjs.com) shell that opens the live web app,
`https://mr-bridge.jl-infra-lab.com`, full screen with no browser UI (#782). The web app is
**not** bundled into the APK, so a web deploy reaches the app without a rebuild or reinstall.
Rebuild only when something native changes: this directory, the Capacitor version, the icon,
or the config.

It is sideloaded over **Wireless debugging**, with no Play Store, developer account or review.

```
android/
  capacitor.config.json   appId, live URL, allowed hosts, offline page
  www/                    offline.html (shown when the tailnet is unreachable); index.html is unused
  native/                 the Gradle project (Capacitor's android.path)
  scripts/                setup-toolchain.sh, build.sh, install.sh, env.sh
```

## What it does and doesn't change

- **Same app, same engine.** It renders the live site in Android's WebView, which is Chromium,
  the same engine as Chrome. Pages, features and speed are what the PWA gets today.
- **Tailnet only**, like the PWA. With Tailscale off, the app shows the offline page with a retry
  button.
- **Google sign-in can't run inside the app.** Google blocks OAuth in embedded WebViews
  (`disallowed_useragent`). Connect or reconnect Google and Google Health from Settings in
  **Chrome**; the tokens are server-side, so the app uses them as soon as they exist. Oura's
  OAuth hasn't been tried in the WebView; doing it in Chrome too is the safe default. App login
  (email + password) works in the app.
- **The service worker still runs** (stale-while-revalidate, #646). After a deploy, the first
  launch can show the previous build; the next launch or reload picks up the new one.

## New build machine, start to finish

For a machine that has never built the app, such as the Windows desktop's WSL. The vault key
must already be stored (step 2 of *The signing key*, below). Run from the repo root:

```bash
git pull                                          # this repo, on main
android/scripts/setup-toolchain.sh                # JDK 21 + Android SDK, ~1.5 GB, once
~/jl-homelab/scripts/mrb-android-key-from-vault.sh  # the signing key -> ~/.mrb-android/ (asks for the vault password)
android/scripts/build.sh                          # must print SHA-256 digest c07b02cf91db962a...
```

Then pair and install (phone on the same Wi-Fi; details under *Install on the phone*):

```bash
# Phone: Developer options -> Wireless debugging -> Pair device with pairing code.
# Use the phone's Wi-Fi IP, NOT a 100.x Tailscale address (see Troubleshooting).
bash -c 'source android/scripts/env.sh && adb pair <wifi-ip>:<pairing-port> <6-digit-code>'
android/scripts/install.sh <wifi-ip>:<connect-port>
```

If the app was already installed from another machine, it should update in place and stay
logged in. That's the proof both machines sign with the same key.

## One-time setup per build machine

Works the same on macOS and on Linux/WSL. No Android Studio is needed.

```bash
android/scripts/setup-toolchain.sh
```

It installs JDK 21 and the Android command-line tools: Homebrew on macOS; apt plus a
checksum-verified Google zip on Linux/WSL, into `~/Android/Sdk`. Gradle fetches the SDK
platform and build-tools on the first build. Nothing goes into your shell rc file:
`scripts/env.sh` finds the toolchain itself.

### The signing key

Every release **must** be signed with the same key. Android refuses an update signed with a
different key, and the only way past that is uninstalling, which **wipes the app's data and
login**. So both machines use one keystore, kept in the vault:

```
~/.mrb-android/                 chmod 700
  mr-bridge-release.jks         chmod 600   (vault: attachment on "mr-bridge-android-keystore")
  keystore.properties           chmod 600   (vault: same item's notes)
```

`keystore.properties`:

```properties
storeFile=mr-bridge-release.jks
storePassword=...
keyAlias=mr-bridge
keyPassword=...
```

Neither file is ever committed (`android/.gitignore`); this repo is public. Without
`keystore.properties`, `build.sh` refuses to run rather than produce an APK signed with some
other key.

Moving it in and out of the vault (both scripts live in the private `jl-homelab` repo; `bw` runs
on Surface and asks for the vault password there):

1. **Once, from the machine that made the key:** `~/jl-homelab/scripts/mrb-android-key-to-vault.sh`
   stores it, then reads both files back and compares hashes.
2. **On every other build machine:** `~/jl-homelab/scripts/mrb-android-key-from-vault.sh`
   installs it into `~/.mrb-android/`, and only if the certificate SHA-256 is the one below.
   It does nothing on a machine that already has the right key.

Both take `SURFACE=<ssh-host>` if `homelab` isn't this machine's alias for Surface (on WSL it may
be `theioz@jasonhomelab`).

Confirm a machine has the right key: the build prints the signer's SHA-256, which must start
`c07b02cf91db962a`.

## Build

```bash
android/scripts/build.sh
```

This runs `cap sync`, then `./gradlew assembleRelease`, then verifies the signature. Output:
`android/native/app/build/outputs/apk/release/app-release.apk`.

Bump `versionCode` (and `versionName`) in `native/app/build.gradle` whenever you ship a
native change, so the installed version shows which build it is.

## Install on the phone (Wireless debugging)

On the phone (Android 11+), once: **Settings → About phone → tap Build number 7×**, which
turns on Developer options.

1. **Settings → System → Developer options → Wireless debugging → on.** The phone and
   the build machine must be on the same Wi-Fi.
2. **Pair, once per build machine:** tap *Pair device with pairing code*. That screen
   shows an `IP:port` and a 6-digit code. The pairing port differs from the connect port.
   With Tailscale on, the phone shows its **Tailscale** IP (`100.x`). Use its **Wi-Fi** IP
   instead. **Settings → About phone → IP address** lists every address: take the
   `192.168.x.x` / `10.x.x.x` one, not `100.x` or IPv6:

   ```bash
   bash -c 'source android/scripts/env.sh && adb pair <wifi-ip>:<pairing-port> <6-digit-code>'
   ```

   Passing the code as the last argument works from non-interactive shells too.

3. **Install or update.** The main Wireless debugging screen shows the connect port; again
   use the Wi-Fi IP:

   ```bash
   android/scripts/install.sh <phone-ip>:<connect-port>
   ```

   `adb install -r` replaces the app in place and keeps its data and login. After pairing,
   adb's discovery also lists the phone a second time (`adb-<serial>._adb-tls-connect`), so
   `install.sh` installs to exactly the address you give it.

Wireless debugging is only needed to install. Turn it off afterwards; the app keeps working.
Play Protect may warn about an app from an unknown developer the first time. That's
expected for a sideloaded app.

### From WSL

Build in WSL exactly as above. Installing usually works from WSL too, since `adb pair` and
`adb connect` just need TCP to the phone's LAN IP. If WSL's NAT networking blocks that, use
Windows' own adb on the APK WSL built (from the Windows `platform-tools`):

```powershell
adb pair <phone-ip>:<pairing-port>
adb connect <phone-ip>:<connect-port>
adb install -r \\wsl$\<distro>\home\<you>\src\mr-bridge-assistant\android\native\app\build\outputs\apk\release\app-release.apk
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signed with a different key. Check the SHA-256 above; restore the vault keystore. Do **not** uninstall unless you accept losing the app's data |
| Offline page on launch | Tailscale is off on the phone, or the app is down. Retry once connected |
| A deploy isn't showing | Service-worker cache: relaunch once (see above). Same as the PWA |
| Google connect fails in-app | Expected (`disallowed_useragent`). Do it in Chrome |
| `adb: no devices` from WSL | WSL NAT; use Windows adb (above) |
| `adb pair` → `protocol fault (couldn't read status message)` | You used the phone's Tailscale IP (`100.x`). Pairing only answers on Wi-Fi: use the Wi-Fi IP, with a fresh code (each failed attempt closes the dialog) |
| `adb: more than one device/emulator` | The phone is listed twice after pairing. Pass the address to `install.sh`, or `adb -s <ip:port> ...` |
| Login lost after the app was killed | Fixed: `MainActivity` flushes cookies in `onPause`. A kill *before the app was ever backgrounded* (e.g. `am force-stop` right after signing in) can still lose it |

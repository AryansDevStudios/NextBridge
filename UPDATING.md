# NextBridge — App & Web Update Architecture & Developer Guide

> **Important Reference:** Read this guide before releasing any update. Skipping steps in the release sequence can result in students getting locked out or entering update loops.

---

## 1. System Architecture Overview

NextBridge consists of three core components:
1. **The Native Android App Shell (Capacitor)**: Built via Android Studio / Gradle. Contains Android permissions, Java plugins (`DownloadForegroundService`, `DownloadServicePlugin`, `ImmersiveModePlugin`), `AndroidManifest.xml`, and the `FileProvider`.
2. **The App Web Frontend (React + Vite)**: Lives inside the Android WebView via Capacitor and also runs directly in web browsers. It houses `APP_VERSION`, UI components, Firestore sync logic, and OTA updater listeners.
3. **The Admin Panel (React + Vite)**: Independent web dashboard used by admins to monitor student device sessions, telemetry (`appVersion`), configure cloud-synced version rules, and trigger broadcast or per-student forced APK updates (`forcedUpdate`).

```
┌─────────────────────────────────────────────────────────────┐
│                  Native Android APK Shell                   │
│  - Android Manifest, Permissions, Java Background Services  │
│  - FileProvider, Custom Native Plugins                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Web Client (React / Vite WebView)           │  │
│  │  - APP_VERSION ('2.7.4'), APP_VERSION_CODE (20704)    │  │
│  │  - Capgo OTA Live Updater Listener                   │  │
│  │  - UpdateLockoutScreen (Background APK downloader)    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               ▲
       ┌───────────────────────┴───────────────────────┐
       │                                               │
 [Path A: OTA Updates]                       [Path B: Full APK Updates]
 - Netlify `version.json`                    - Direct APK download (.apk)
 - Replaces JS/CSS assets dynamically        - Native install intent
 - No native changes possible                - Required for native permissions/plugins
```

---

## 2. Web App vs. Android App Separation

* **Web Browser Users**: Always receive the newest frontend release on standard page reload directly from Netlify. There is **no APK download, no installation, and no lockout** required for web users.
* **Android App Users**: Distinct native environment. Even if web features are updated via OTA, the native Android package (`.apk`) may have a different release cycle. Android versions are managed independently via the **Cloud-Synced Android Version Control Center**.

---

## 3. Cloud-Synced Android Version Control Center

Instead of hardcoding version numbers inside the admin panel source code, the Admin Panel reads live rules from Firestore:
`system_config/app_versions`

Admins can click the **"Version Rules"** button on the Dashboard anytime (from any computer or mobile browser) to view and update the 4 Core Criteria:

### The 4 Version Criteria
| Criteria | Field Name | Description | Example |
|---|---|---|---|
| **1. Minimum SemVer** | `minAppVersion` | The lowest version permitted to run without mandatory lockout. | `2.7.0` |
| **2. Minimum Build Code** | `minVersionCode` | The lowest native build integer permitted. | `20700` |
| **3. Latest Target SemVer** | `latestAppVersion` | The newest official Android release available. | `2.7.4` |
| **4. Latest Build Code** | `latestVersionCode` | The build integer of the newest official release. | `20704` |

### 3-Tier Status Color System for Android Students
Every student card and table row displays an automatically evaluated color badge:

* 🔴 **RED (Critical / Obsolete / < Min)**:
  - Triggered if `appVersion` is missing/legacy OR `appVersion < minAppVersion` OR `versionCode < minVersionCode`.
  - These students are in the danger zone and should be locked out with instructions to install the required APK.
* 🟡 **YELLOW (Update Available)**:
  - Triggered if student meets or exceeds Minimum, but is strictly below `latestAppVersion` OR `latestVersionCode`.
  - The student can still use the app, but an update is available.
* 🟢 **GREEN (Latest / Up-to-Date)**:
  - Triggered if student meets or exceeds `latestAppVersion` and `latestVersionCode`.
  - If a student installs a release higher than what admin configured, they are still marked Green.
* ⚪ **WEB BROWSER (Isolated)**:
  - Students accessing via a web browser show a neutral `WEB` badge and are **never** flagged as Red/Yellow or accidentally targeted by APK updates.

---

## 4. Version Numbering Conventions

We use Semantic Versioning: `MAJOR.MINOR.PATCH`

* **MAJOR**: Architectural shifts or backwards-incompatible database schema changes (e.g., `3.0.0`). Always requires full APK update.
* **MINOR**: Significant features or native changes (e.g., `2.8.0`). Requires APK update if native changes were introduced; otherwise can be delivered via OTA.
* **PATCH**: Bug fixes, cosmetic tweaks, performance enhancements (e.g., `2.7.5`). Typically delivered via OTA.

### Version Code Formula (`APP_VERSION_CODE`)
On Android, `versionCode` must strictly be a monotonically increasing integer.
Use the formula:
`versionCode = (MAJOR * 10000) + (MINOR * 100) + PATCH`

* Example: Version `2.7.4` -> `(2 * 10000) + (7 * 100) + 4 = 20704`
* Example: Version `2.8.0` -> `(2 * 10000) + (8 * 100) + 0 = 20800`

---

## 5. Release Checklist: Step-by-Step

### Scenario 1: Deploying an OTA (Web Only) Update
1. Update `package.json` and `src/utils/version.js` -> set new `APP_VERSION` and `APP_VERSION_CODE`.
2. Build the web app:
   ```bash
   npm run build
   ```
3. Create the OTA zip package:
   Compress the contents of `dist/` into `deploy_dist/buildcode/update.zip`.
4. Update `deploy_dist/buildcode/version.json`:
   ```json
   {
     "version": "2.7.5-<TIMESTAMP>",
     "appVersion": "2.7.5",
     "url": "/buildcode/update.zip",
     "releaseDate": "2026-09-25T00:00:00.000Z"
   }
   ```
5. Deploy `deploy_dist/` to Netlify.

### Scenario 2: Deploying a Full Native APK Update
1. Update native Android files (e.g., `AndroidManifest.xml`, Java plugins, etc.).
2. Update version numbers:
   - `src/utils/version.js` -> set new `APP_VERSION` and `APP_VERSION_CODE`
   - `android/app/build.gradle` -> update `versionCode` and `versionName` under `defaultConfig`
3. Build web assets and sync Capacitor:
   ```bash
   npm run build
   npx cap sync android
   ```
4. Build signed Release APK:
   - Open Android Studio and choose **Build > Generate Signed Bundle / APK > APK**, or run:
     ```bash
     cd android && ./gradlew assembleRelease
     ```
5. Upload APK to Netlify or public storage with direct download access:
   - Example: `https://nextbridgeweb.netlify.app/releases/NextBridge-v2.8.0.apk`
6. Also deploy the OTA bundle (`update.zip` & `version.json`) so both distribution channels remain in sync.
7. Open **NextBridge Admin Panel**:
   - Click **Version Rules** on the Dashboard -> update `latestAppVersion` (e.g. `2.8.0`), `latestVersionCode` (e.g. `20800`), and paste the APK Download URL. Click **Save Settings**.
   - Click **Broadcast Update** -> select **Outdated (Yellow/Red)** or **Critical (< Min) Only**.
   - Click **Apply Lockout**.
   - Targeted Android students will now encounter the update lockout screen, download the APK in the background with a progress bar, approve the Android installer, and automatically unlock on opening the new APK!

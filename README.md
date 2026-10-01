# 🌉 NextBridge

> Cross-platform educational portal and learning management hub featuring multi-stream video playback, offline sync, an admin dashboard, and edge proxy infrastructure.

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.5-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-12.19-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)]()

---

## Description

NextBridge is an enterprise-grade, cross-platform educational web and mobile portal built with React 19, Vite 8, and Capacitor 8, engineered to aggregate, stream, and organize digital curriculum content from platforms like NextToppers and PhysicsWallah. It combines a student-facing Learning Hub featuring multi-engine video playback (HLS, DASH DRM, Plyr) and offline download management with an administrative suite for token rotation, student authorization, and batch enrollment. Backed by Cloudflare Workers edge proxies and Firebase services, NextBridge delivers low-latency educational streaming and seamless over-the-air (OTA) application updates without app store friction.

---

## Key Features

- **Multi-Engine Adaptive Video Streaming**: High-performance player powered by Shaka Player, Hls.js, and Plyr supporting ClearKey DRM DASH streams, HLS adaptive bitrate feeds, audio-only background listening, double-tap seek, and custom playback speeds.
- **Comprehensive Student Learning Hub**: Organized subject navigation across Classes 7–12, Droppers, and Competitive streams (JEE, NEET, NDA, CUET), featuring integrated NCERT textbook readers, CBSE PYQs with marking schemes, and R.S. Aggarwal math solutions.
- **Offline Resource & Download Manager**: Persistent local downloading of video lectures and study PDFs using `@capacitor/filesystem`, complete with background download progress, resume capability, and local storage metrics.
- **Dynamic In-App Note Taking**: Timestamped lecture notes module (`NotesTaker`) linked directly to video playback timestamps for contextual study review.
- **Full-Featured Admin Management Dashboard**: Dedicated administrative panel (`/admin`) supporting student device binding, session revocation, batch access control, notice broadcasts, and live analytics.
- **Edge Proxy & Token Management**: Cloudflare Worker reverse proxies (`nexttoppers-gateway` and `pw-cors-proxy`) enabling on-demand Bearer token injection, dynamic stream derivation, and zero-cold-start CORS handling.
- **Over-The-Air (OTA) Live Updates**: Capgo (`@capgo/capacitor-updater`) integration with an update lockout screen (`UpdateLockoutScreen`) enforcing version parity and instant bundle deployment.
- **Hardware Security & Privacy Controls**: Native Android ID hardware binding, token expiration verification, and configurable privacy screen protection (`@capacitor-community/privacy-screen`).

---

## Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19.2, Vite 8.3, React Router DOM 7.18 |
| **Styling & Icons** | Tailwind CSS 4.3, `@tailwindcss/vite`, Lucide React, clsx, tailwind-merge |
| **Media & Streaming** | Shaka Player 5.2 (DASH / ClearKey DRM), Hls.js 1.7, Plyr 3.8 |
| **Mobile Runtime** | Capacitor 8.5 (`@capacitor/core`, `@capacitor/android`, `@capacitor/filesystem`, `@capacitor/device`, `@capgo/capacitor-updater`) |
| **Cloud & Backend** | Firebase Firestore & Realtime Database 12.19, Netlify Hosting & Serverless Redirects |
| **Edge Infrastructure** | Cloudflare Workers (V8 Edge Runtime, Wrangler) |
| **Tooling & Build** | Oxlint 1.81, Adm-Zip, Archiver, fs-extra |

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Android Studio**: Ladybug or newer (for native mobile compilation)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AryansDevStudios/NextBridge.git
   cd NextBridge
   ```

2. Install root dependencies:
   ```bash
   npm install
   ```

3. Install Admin Panel dependencies:
   ```bash
   cd admin-panel
   npm install
   cd ..
   ```

### Environment Configuration

Create a `.env` file in the project root and in `admin-panel/`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_db_default_rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Admin Authentication
VITE_ADMIN_USERNAME=admin
VITE_ADMIN_PASSWORD_HASH=your_sha256_password_hash
```

### Development & Build Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Launches the student portal development server. |
| `npm run build` | Builds the student application into the `dist/` directory. |
| `npm run build:shell` | Compiles the Capacitor native shell application into `shell_dist/`. |
| `npm run build:all` | Compiles both the student web app and the shell distribution. |
| `npm run build:deploy` | Executes unified build orchestrator (`build-deploy.cjs`): builds student app, builds admin panel, generates OTA update zip, and writes Netlify redirects into `deploy_dist/`. |
| `npm run lint` | Runs Oxlint across source files for fast static analysis. |
| `npm run preview` | Starts a local static web server to preview production builds. |

---

## Usage

### Student Portal Workflow
1. Launch the web application or mobile app.
2. Authenticate using your student credentials / Personal Access Token (PAT).
3. The application binds your device's unique hardware ID to prevent unauthorized multi-device sharing.
4. Select your enrolled Class, Stream, and Batch to access lectures, notes, NCERT textbooks, and past year question papers.

### Administrative Workflow
1. Navigate to `/admin` in your browser.
2. Log in using configured admin credentials.
3. Manage student profiles, grant or revoke batch access, update PhysicsWallah / NextToppers API tokens, and monitor live streaming analytics.
4. Push broadcast messages and trigger forced OTA version updates across active student devices.

---

## Project Structure

```text
NextBridge/
├── admin-panel/              # Administrative portal (React 19 and Vite 8)
│   ├── src/components/       # Dashboard, StudentModal, BatchManager, Analytics
│   ├── package.json          # Admin panel dependencies and scripts
│   └── vite.config.js        # Admin Vite configuration (base: '/admin/')
├── proxy/                    # Edge serverless proxy architectures
│   ├── cloudflare/
│   │   ├── nexttoppers-gateway/  # Dynamic NextToppers token & stream resolver
│   │   └── pw-cors-proxy/        # Edge streaming & CORS bypass for static.pw.live
│   └── README.md             # Proxy architecture documentation
├── shell/                    # Native updater shell app for Capacitor mobile
│   ├── index.html            # Shell bootstrap UI with progress indicator
│   ├── main.js               # Capgo OTA update check and launch engine
│   └── mobile_extractor.js   # Client-side multi-threaded batch extraction engine
├── src/                      # Core student application
│   ├── components/           # LearningHub, VideoPlayer, BatchesHub, NcertHub, CbsePyqHub
│   ├── services/             # DownloadManager, PwApiService, NtApiService, NotificationService
│   ├── utils/                # Batch configuration, player helpers, version checks
│   ├── App.jsx               # Auth state, device binding, forced update lockout, routing
│   └── main.jsx              # App entry point, Capgo notifyAppReady, PWA Service Worker
├── public/                   # Static assets and PWA service worker
├── build-deploy.cjs          # Unified build and consolidation orchestrator
├── capacitor.config.json     # Capacitor mobile bridge configuration
├── netlify.toml              # Netlify build configuration, redirects, and edge headers
├── package.json              # Main workspace dependencies and npm scripts
├── vite.config.js            # Main Vite configuration and local proxy rules
└── vite.shell.config.js      # Vite build config for shell distribution
```

---

## Contributing

Contributions, issues, and feature requests are welcome. Please ensure changes follow clean code practices, adhere to the established Oxlint rules (`npm run lint`), and preserve existing mobile and edge proxy integrations.

---

## License

Proprietary — All rights reserved by [AryansDevStudios](https://github.com/AryansDevStudios).

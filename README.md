# Brinetv — India Live TV Streaming Directory

**Brinetv** is a single-page India-only live TV streaming directory built with **React + Vite** and **hls.js**. Inspired by Famelack's clean dark card layout (with zero 3D globe or country pickers), Brinetv puts its **prominent multi-variant HLS Quality Selector** front and center.

## Core Features

1. **India-Only Channel Directory**:
   - Curated Indian channels across **News, Entertainment, Sports, Movies, Music, Kids, Devotional, and Regional** (Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Punjabi, Gujarati, Odia, Bhojpuri, English).
   - Runtime parser (`src/utils/m3uParser.js`) fetches and merges `https://iptv-org.github.io/iptv/countries/in.m3u` with a preloaded fallback JSON (`src/data/fallbackChannels.json`).
2. **Flagship HLS Video Player & Prominent Quality Selector (`Player.jsx` + `QualitySelector.jsx`)**:
   - Uses `hls.js` for `.m3u8` adaptive streams with native `<video>` fallback for `.mp4`.
   - Reads the HLS master playlist via `hls.levels` and renders prominent quality pills: **Auto / 1080p / 720p / 480p / 360p / 240p / 144p**.
   - Shows **only** the resolutions that actually exist in the stream; if a stream has a single quality, displays it and disables the selector gracefully.
   - **Auto Mode** uses `hls.autoLevelEnabled` (`hls.currentLevel = -1`) and displays the live active resolution & bitrate in real time.
   - Handles edge cases: streams without resolution height metadata (infers from bitrate), failed level switches (gracefully reverts to Auto), buffering indicator on switch, and a clear `"Channel unavailable, try another"` error state with one-click retry or multi-bitrate backup feed.
3. **Personalization (`localStorage`)**:
   - 🔍 Instant search bar (by channel name, category, or Indian language)
   - 📌 Pin/favorite channels (`brinetv_pinned_channels`)
   - 🗂️ Create and assign custom category tags/labels (`brinetv_custom_tags` & `brinetv_channel_tags`)
4. **SPA Deployment Configs Included**:
   - `vercel.json` in project root (`rewrites` all routes to `/index.html`)
   - `public/_redirects` (`/* /index.html 200` for Netlify)

## Quick Start

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

# Universal Downloader

🌍 **Languages**: [**🇺🇸 English**](README.md) | [🇷🇺 Русский](README.ru.md)

A fast CLI tool for downloading audio and video from YouTube and 1000+ other sites, made for listening offline: podcasts and music land in `~/Downloads` as tagged files with cover art and chapters.

> **Command name**: `udav` (**U**niversal **D**ownload **A**udio **V**ideo)

## Quick Start

```bash
# Requirements (macOS)
brew install ffmpeg

# Install the command globally
npm install -g .

# Download audio (default mode)
udav "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Download video
udav "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -v
```

The first run downloads yt-dlp (about 50 MB, once) and takes about a minute; after that a short track takes a few seconds.

## Features

- 🎵 **Audio first**: M4A by default, taken from YouTube's AAC stream as is (no re-encoding, no quality loss)
- 🏷 **Ready for players**: title, artist, date and cover art are embedded; podcast chapters too (M4A, MP3)
- 🎬 **Video that plays everywhere**: MP4 with H.264 + AAC (QuickTime, iPhone, TVs), up to 1080p; `-q max` for 4K
- 📚 **Playlists**: a playlist link saves every item into its own numbered subfolder
- 📁 **Smart file organization**: `~/Downloads/Audio/{site}/` and `~/Downloads/Video/{site}/`
- 🔄 **Keeps working**: udav installs yt-dlp itself and updates it daily; if YouTube changes something, it updates and retries
- 🍪 **Cookies only when needed**: browser cookies are used only when YouTube asks to sign in
- ⏯ **Resumable**: interrupted downloads (Ctrl+C, lost connection) continue from where they stopped

## Installation

```bash
git clone <repository-url>
cd yt-downloader
npm install
npm install -g .   # optional: the global `udav` command
```

### Requirements

- **Node.js 22+**. udav also hands it to yt-dlp as the JavaScript runtime that YouTube requires.
- **FFmpeg** (extracting audio, merging video with sound, embedding covers)
- **yt-dlp** is managed automatically on macOS: it lives in `~/Library/Application Support/udav` (about 125 MB) and is checked for updates once a day. No Python needed.

#### Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg  # Ubuntu/Debian
sudo yum install ffmpeg  # CentOS/RHEL
```

**Windows:** download from https://ffmpeg.org/download.html

#### Linux and Windows

Automatic yt-dlp management is macOS only. Elsewhere install [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) so it is in `PATH`. Any platform: `UDAV_YTDLP=/path/to/yt-dlp` makes udav use that binary.

## Usage

### Basic Usage

```bash
# Audio download (default mode)
udav "URL"

# Video download
udav "URL" -v

# Whole playlist (each item, numbered, into a subfolder)
udav "https://www.youtube.com/playlist?list=..."
```

A link to a track inside a playlist or a YouTube Mix (`watch?v=...&list=...`) downloads only that track.

### Local Development Alternative

```bash
npm run audio "URL"
npm run video "URL"
node src/cli.js "URL"        # audio
node src/cli.js "URL" -v     # video
```

### Advanced Options

```bash
# Verbose output for troubleshooting (IP addresses are masked)
udav "URL" --verbose

# Custom output directory (overrides smart organization)
udav "URL" -o ./downloads

# Title, author and duration before downloading
udav "URL" -i

# Always use browser cookies (for private or members-only videos)
udav "URL" -b safari

# Audio in MP3
udav "URL" -f mp3

# Smaller files: 720p video, or low-bitrate audio (fine for speech)
udav "URL" -v -q 720p
udav "URL" -q worst

# Update yt-dlp right now
udav --update
```

## File Organization

```
~/Downloads/
├── Audio/
│   └── youtube/
│       ├── Song Title [video_id].m4a
│       └── Podcast Playlist/
│           ├── 1 - First Episode [id].m4a
│           └── 2 - Second Episode [id].m4a
└── Video/
    ├── youtube/
    │   └── Video Title [video_id].mp4
    └── vimeo/
        └── Video [id].mp4
```

- **Audio downloads** (default mode or `-a`) → `~/Downloads/Audio/{site}/`
- **Video downloads** (`-v`) → `~/Downloads/Video/{site}/`
- **Duplicates**: an existing file is not downloaded again
- Long titles are shortened to fit the macOS file name limit (also for Cyrillic and other non-Latin titles)

## Quality

### Video (`-v`)

| `-q` | Result |
|------|--------|
| `best` (default) | Best MP4 with H.264 + AAC, usually 1080p. Plays in QuickTime, on iPhone and TVs |
| `1080p`, `720p`, `480p`, `360p` | The same, limited to that height |
| `worst` | Smallest MP4 |
| `max` | Highest resolution in any codec (4K AV1/VP9 in WebM/MKV): needs VLC or IINA |

### Audio

| `-f` | Result |
|------|--------|
| `m4a` (default) | YouTube's AAC as is, no re-encoding |
| `mp3` | Converted at the highest MP3 quality (VBR V0) |
| `flac`, `wav` | Converted (larger files, no quality gain over the source) |

`-q worst` picks the smallest audio stream (about 50 instead of 130 kbit/s on YouTube): 2.5 times smaller, good enough for speech.

## Troubleshooting

### YouTube "Sign in to confirm you're not a bot"

udav first downloads without cookies. When YouTube asks to sign in, it retries with cookies from your browsers: Safari, Firefox, Chrome, Edge (installed ones only).

1. **Sign in to YouTube** in one of these browsers and run udav again.
2. **Chrome or Edge**: macOS asks for the keychain password so that yt-dlp can read the cookies. Choose "Always Allow".
3. **Safari**: its cookies need Full Disk Access for your terminal app: System Settings → Privacy & Security → Full Disk Access → add Terminal, iTerm or Warp, then restart it.
4. **On a VPN?** YouTube asks datacenter IP addresses to sign in more often: try another server.

### "YouTube changed something"

Errors like "Requested format is not available" or "HTTP Error 403" usually mean YouTube changed something. udav then checks for a newer yt-dlp, installs it and retries. If you already have the latest one, a fix usually appears within days; `udav --update` installs it right away.

### Network problems

"Network problem" means the site could not be reached: check the connection or VPN. An interrupted download continues when you run the same command again.

### macOS asks about the Downloads folder

On the first download macOS may ask to let your terminal app access the Downloads folder: allow it. If you declined before: System Settings → Privacy & Security → Files and Folders.

### URL with Special Characters

Always put the URL in quotes:

```bash
udav "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"   # works
udav https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123     # fails in zsh
```

## Command Reference

- `-a, --audio` - Extract audio only (default mode)
- `-v, --video` - Download video
- `-o, --output <dir>` - Custom output directory (default: `~/Downloads/Audio|Video/{site}/`)
- `-f, --format <format>` - Audio format: `mp3|m4a|wav|flac` (default: `m4a`)
- `-q, --quality <quality>` - Video: `best|max|worst|1080p|720p|480p|360p`; audio: `best|worst` (default: `best`)
- `-i, --info` - Show title, author and duration before downloading
- `-b, --browser <browser>` - Always use cookies from this browser: `chrome|firefox|safari|edge`
- `-c, --cookies <file>` - Path to a cookies.txt file
- `-U, --update` - Update yt-dlp now (it is also checked automatically once a day)
- `--verbose` - Show detailed yt-dlp output
- `-h, --help` - Show help

## Dependencies

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - the downloader itself (installed and updated by udav on macOS)
- [FFmpeg](https://ffmpeg.org) - audio extraction, merging, tags and covers
- [commander](https://www.npmjs.com/package/commander) - command-line argument parsing
- [chalk](https://www.npmjs.com/package/chalk) - terminal colors

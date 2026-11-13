export const DEFAULT_CONFIG = {
  VIDEO_QUALITY: 'best',
  AUDIO_FORMAT: 'm4a',
  AUDIO_QUALITY: 'best',
  SUPPORTED_FORMATS: ['mp3', 'm4a', 'wav', 'flac'],
  // best = best MP4 (H.264 + AAC) that plays everywhere; max = highest resolution in any codec
  VIDEO_QUALITY_OPTIONS: ['best', 'max', 'worst', '1080p', '720p', '480p', '360p'],
  AUDIO_QUALITY_OPTIONS: ['best', 'worst'],
  SUPPORTED_BROWSERS: ['chrome', 'firefox', 'safari', 'edge'],
  // Cookies are only used when YouTube asks to sign in. Safari and Firefox go first:
  // reading their cookies never triggers a macOS keychain password prompt.
  BROWSER_FALLBACK_ORDER: ['safari', 'firefox', 'chrome', 'edge'],
};

export const YOUTUBE_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com',
];

// yt-dlp binary management (macOS): the official "unpackaged" build is used because the
// single-file build re-extracts itself on every launch and macOS re-scans it each time
// (measured: ~15 s per launch vs ~0.16 s for the unpackaged build).
export const YTDLP = {
  RELEASES_URL: 'https://github.com/yt-dlp/yt-dlp/releases',
  MACOS_ASSET: 'yt-dlp_macos.zip',
  MACOS_EXECUTABLE: 'yt-dlp_macos',
  CHECKSUMS_ASSET: 'SHA2-256SUMS',
  VERSION_PATTERN: /^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/,
  UPDATE_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000,
  CHECK_TIMEOUT_MS: 5000,
  DOWNLOAD_TIMEOUT_MS: 10 * 60 * 1000,
  FIRST_LAUNCH_TIMEOUT_MS: 3 * 60 * 1000,
  // Kill yt-dlp after this long without any output. Paused while ffmpeg post-processes
  // (a long podcast converted to mp3 can run silently for minutes).
  INACTIVITY_TIMEOUT_MS: 90 * 1000,
  // yt-dlp needs a JavaScript runtime for YouTube; Node.js is supported from v22.
  MIN_NODE_MAJOR: 22,
};

// TODO: For i18n support, move these to separate language files (e.g., locales/en.js, locales/ru.js)
// and create a translation function t(key, params) that loads appropriate language
export const ERROR_MESSAGES = {
  INVALID_URL: 'Invalid URL format.',
  MISSING_URL: 'URL not specified. Please provide a video link.',
  DOWNLOAD_FAILED: 'Download failed:',
  INVALID_FORMAT: 'Unsupported audio format.',
  INVALID_AUDIO_QUALITY: 'Unsupported audio quality.',
  INVALID_VIDEO_QUALITY: 'Unsupported video quality.',
  DIRECTORY_ERROR: 'Error creating directory.',
  INVALID_BROWSER: 'Unsupported browser.',
  COOKIES_FILE_NOT_FOUND: 'Cookies file not found.',
  YOUTUBE_SIGN_IN: 'YouTube asks to sign in ("confirm you are not a bot" or a restricted video).',
  FFMPEG_NOT_FOUND: 'FFmpeg not found. It is required to extract audio and to merge video with sound.',
  YTDLP_NOT_FOUND: 'yt-dlp not found. Install it (https://github.com/yt-dlp/yt-dlp#installation) or set UDAV_YTDLP=/path/to/yt-dlp',
  NETWORK: 'Network problem: the site could not be reached.',
  RATE_LIMITED: 'The site is rate-limiting this connection (HTTP 429).',
  TIMEOUT: 'No activity for 90 seconds: the site stopped responding.',
  DISK_FULL: 'No space left on the disk.',
};

// TODO: For i18n support, move these to locales/ directory
export const SUCCESS_MESSAGES = {
  DOWNLOAD_COMPLETE: 'Download completed successfully!',
  DIRECTORY_CREATED: 'Directory created:',
};

export const UI_CONSTANTS = {
  SECONDS_IN_MINUTE: 60,
  TIME_PAD_LENGTH: 2,
  EXIT_CODE_SUCCESS: 0,
  EXIT_CODE_ERROR: 1,
  EXIT_CODE_INTERRUPTED: 130,
};

// Output template. Byte-based truncation (.NB) keeps long Cyrillic titles under the
// 255-byte filename limit of macOS. Playlist downloads go into a subfolder and get
// an index prefix; for single videos both parts are empty ("dir//file" is the same
// as "dir/file"). The slash must stay literal: yt-dlp sanitizes "/" inside fields.
export const OUTPUT_TEMPLATE =
  '%(playlist_title|).100B/%(playlist_index&{} - |)s%(title).150B [%(id)s].%(ext)s';

// Headers for non-YouTube hosts (kept from the speed optimization for other sites).
// YouTube gets no custom headers: yt-dlp sets client-specific ones itself.
export const OTHER_SITE_HEADERS = [
  'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language:en-US,en;q=0.5',
  'Accept-Encoding:gzip, deflate',
  'DNT:1',
  'Connection:keep-alive',
  'Upgrade-Insecure-Requests:1',
];

export const POSTPROCESSOR_LABELS = {
  Merger: 'Merging video and audio',
  ExtractAudio: 'Extracting audio',
  VideoRemuxer: 'Remuxing to MP4',
  Metadata: 'Writing tags',
  EmbedThumbnail: 'Embedding cover',
  FixupM4a: 'Finalizing',
  FixupM3u8: 'Finalizing',
  FixupDuplicateMoov: 'Finalizing',
  FixupTimestamp: 'Finalizing',
  FixupDuration: 'Finalizing',
  FixupStretched: 'Finalizing',
};

export const UI_SYMBOLS = {
  SPINNER: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  CHECK: '✓',
  CROSS: '☓',
  ARROW: '▶',
  DOT: '•',
  ELLIPSIS: '...',
};

export const SPINNER_CONSTANTS = {
  INTERVAL: 100, // Spinner update interval in ms
};

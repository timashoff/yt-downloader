export const DEFAULT_CONFIG = {
  VIDEO_QUALITY: 'best',
  AUDIO_FORMAT: 'm4a',
  AUDIO_QUALITY: 'best',
  SUPPORTED_FORMATS: ['mp3', 'm4a', 'wav', 'flac'],
  VIDEO_QUALITY_OPTIONS: ['best', 'worst', '720p', '1080p', '480p', '360p'],
  AUDIO_QUALITY_OPTIONS: ['best', 'worst'],
  SUPPORTED_BROWSERS: ['chrome', 'firefox', 'safari', 'edge'],
  BROWSER_FALLBACK_ORDER: ['safari', 'chrome', 'firefox', 'edge']
};

export const YOUTUBE_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com'
];

// TODO: For i18n support, move these to separate language files (e.g., locales/en.js, locales/ru.js)
// and create a translation function t(key, params) that loads appropriate language
export const ERROR_MESSAGES = {
  INVALID_URL: 'Invalid URL format.',
  MISSING_URL: 'URL not specified. Please provide a video link.',
  DOWNLOAD_FAILED: 'Download error. Check URL and internet connection.',
  INVALID_FORMAT: 'Unsupported audio format.',
  INVALID_AUDIO_QUALITY: 'Unsupported audio quality.',
  INVALID_VIDEO_QUALITY: 'Unsupported video quality.',
  DIRECTORY_ERROR: 'Error creating directory.',
  INVALID_BROWSER: 'Unsupported browser.',
  COOKIES_FILE_NOT_FOUND: 'Cookies file not found.',
  YOUTUBE_BOT_DETECTION: 'YouTube blocked access. Browser cookies needed.',
  FFMPEG_NOT_FOUND: 'FFmpeg not found. Install FFmpeg for audio processing.'
};

// TODO: For i18n support, move these to locales/ directory
export const SUCCESS_MESSAGES = {
  DOWNLOAD_COMPLETE: 'Download completed successfully!',
  DIRECTORY_CREATED: 'Directory created:'
};

export const UI_CONSTANTS = {
  TITLE_MAX_LENGTH: 200,
  PROGRESS_MAX: 100,
  PROGRESS_MIN: 0,
  SECONDS_IN_MINUTE: 60,
  TIME_PAD_LENGTH: 2,
  EXIT_CODE_SUCCESS: 0,
  EXIT_CODE_ERROR: 1,
  PROGRESS_CHUNK_SIZE: 10485760
};

export const HTTP_HEADERS = {
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  REFERER: 'referer:youtube.com'
};

export const YTDLP_OPTIONS = {
  // Default: video download
  quality: DEFAULT_CONFIG.VIDEO_QUALITY,
  output: `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`,
  windowsFilenames: false,
  noWarnings: true,
  noCheckCertificates: true,
  compatOptions: ['no-certifi']
};

export const YTDLP_AUDIO_OPTIONS = {
  // Audio extraction options
  extractAudio: true,
  audioFormat: DEFAULT_CONFIG.AUDIO_FORMAT,
  audioQuality: DEFAULT_CONFIG.AUDIO_QUALITY,
  output: `%(title).${UI_CONSTANTS.TITLE_MAX_LENGTH}s [%(id)s].%(ext)s`,
  windowsFilenames: false,
  noWarnings: true,
  noCheckCertificates: true,
  compatOptions: ['no-certifi']
};

export const YTDLP_YOUTUBE_HEADERS = {
  extractorArgs: 'youtube:player_client=web,android',
  addHeader: [
    HTTP_HEADERS.REFERER,
    `user-agent:${HTTP_HEADERS.USER_AGENT}`,
    'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language:en-US,en;q=0.9',
    'accept-encoding:gzip, deflate, br',
    'sec-fetch-dest:document',
    'sec-fetch-mode:navigate',
    'sec-fetch-site:none',
    'sec-fetch-user:?1',
    'upgrade-insecure-requests:1'
  ]
};
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import {
  DEFAULT_CONFIG,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  UI_CONSTANTS,
  YTDLP,
  OUTPUT_TEMPLATE,
  OTHER_SITE_HEADERS,
  POSTPROCESSOR_LABELS,
} from './constants.js';
import { isYouTubeUrl } from './validator.js';
import { logError, logInfo, logSuccess, logWarning, redact } from './logger.js';
import { spinner, truncateToWidth } from './spinner.js';
import { findFfmpegDir, getYtDlp, runYtDlp } from './ytdlp.js';

const HOME = os.homedir();

// Machine-readable lines from yt-dlp (see runYtDlp). Raw numbers instead of yt-dlp's
// human-readable strings: those change between versions, and yt-dlp updates itself.
const PROGRESS_TEMPLATE = 'download:[udav:dl] %(progress.status)s|%(progress.downloaded_bytes)s'
  + '|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s'
  + '|%(progress.fragment_index)s|%(progress.fragment_count)s|%(info.vcodec)s';
const POSTPROCESS_TEMPLATE = 'postprocess:[udav:pp] %(progress.postprocessor)s|%(progress.status)s';
const INFO_PRINT = 'video:[udav:info] '
  + '%(.{id,title,uploader,channel,duration,format_id,playlist_title,playlist_index,n_entries})j';
const FILE_PRINT = 'after_move:[udav:file] %(__real_download)s|%(filepath)s';

// Same as yt-dlp's "-t mp4" preset: H.264 + AAC plays in QuickTime, on iPhone and TVs
const MP4_SORT = 'vcodec:h264,lang,quality,res,fps,hdr:12,acodec:aac';

// macOS: a browser counts only if the app is installed and its profile exists
// (an uninstalled browser often leaves its old profile behind)
const BROWSERS = {
  safari: {
    name: 'Safari',
    app: null, // part of macOS
    profile: path.join(HOME, 'Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies'),
  },
  firefox: { name: 'Firefox', app: 'Firefox.app', profile: path.join(HOME, 'Library/Application Support/Firefox/Profiles') },
  chrome: { name: 'Chrome', app: 'Google Chrome.app', profile: path.join(HOME, 'Library/Application Support/Google/Chrome') },
  edge: { name: 'Edge', app: 'Microsoft Edge.app', profile: path.join(HOME, 'Library/Application Support/Microsoft Edge') },
};
const browserName = (browser) => BROWSERS[browser]?.name || browser;

// Checked in this order; the first match wins
const ERROR_KINDS = [
  ['disk', /No space left on device|Errno 28/i],
  ['safariAccess', /Operation not permitted.*Safari/i],
  ['auth', /not a bot|Sign in to confirm|age.restricted|inappropriate for some users|members.only|Join this channel|Private video|This video is private|--cookies-from-browser|login required|requires authentication/i],
  ['rateLimit', /HTTP Error 429|Too Many Requests/i],
  ['unavailable', /\bunavailable\b|has been removed|no longer available|not available in your country|geo.?restrict|Premieres in|This live event will begin|Unsupported URL|is not a valid URL|does not exist/i],
  ['network', /Unable to download (webpage|API page|JSON metadata)|Failed to establish a new connection|Connection (refused|reset|aborted)|timed out|Network is unreachable|nodename nor servname|Name or service not known|Temporary failure in name resolution|TransportError|CERTIFICATE_VERIFY_FAILED|SSL:/i],
  // Typical symptoms of YouTube changing something: a newer yt-dlp usually fixes them
  ['outdated', /Unable to extract|Failed to extract|nsig|n challenge|signature|Requested format is not available|HTTP Error 403|Precondition check failed|player response|No video formats found/i],
];

function getSystemDownloadsPath() {
  return path.join(HOME, 'Downloads');
}

function tildify(filePath) {
  return filePath.startsWith(HOME + path.sep) ? `~${filePath.slice(HOME.length)}` : filePath;
}

function terminalName() {
  const names = {
    WarpTerminal: 'Warp',
    Apple_Terminal: 'Terminal',
    'iTerm.app': 'iTerm',
    vscode: 'Visual Studio Code',
    zed: 'Zed',
    ghostty: 'Ghostty',
    WezTerm: 'WezTerm',
  };
  return names[process.env.TERM_PROGRAM] || 'your terminal app';
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove prefixes like www., m., mobile.
    const cleanHostname = hostname.replace(/^(www\.|m\.|mobile\.)/, '');

    // Special handling for YouTube domains
    if (cleanHostname === 'youtu.be' || cleanHostname === 'youtube.com' || cleanHostname.endsWith('.youtube.com')) {
      return 'youtube';
    }

    const parts = cleanHostname.split('.');

    // Extract main domain name (second-to-last part for subdomains)
    if (parts.length >= 2) {
      return parts[parts.length - 2]; // e.g., "instagram" from "www.instagram.com"
    }
    return parts[0]; // fallback for single-part domains
  } catch (error) {
    return 'unknown';
  }
}

async function buildOutputPath(url, audioOnly, customOutputDir = null) {
  // If custom output directory is specified, use it
  if (customOutputDir) {
    return path.resolve(customOutputDir);
  }

  // Default: smart organization in system Downloads folder
  const downloadsPath = getSystemDownloadsPath();
  const contentType = audioOnly ? 'Audio' : 'Video';
  const domain = extractDomain(url);
  return path.join(downloadsPath, contentType, domain);
}

export async function createOutputDirectory(outputDir) {
  try {
    await fs.access(outputDir);
    return true;
  } catch {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      logInfo(`${SUCCESS_MESSAGES.DIRECTORY_CREATED} ${tildify(outputDir)}`);
      return true;
    } catch (error) {
      logError(`${ERROR_MESSAGES.DIRECTORY_ERROR} ${error.message}`);
      if (process.platform === 'darwin' && (error.code === 'EPERM' || error.code === 'EACCES')) {
        logInfo(`💡 macOS blocked access. Allow it in System Settings → Privacy & Security → Files and Folders → ${terminalName()}`);
      }
      return false;
    }
  }
}

function audioArgs(format, quality) {
  const worst = quality === 'worst';
  // For m4a take YouTube's AAC stream as is: no re-encoding, no quality loss.
  // Other formats have to be converted anyway, so start from the best source.
  const selector = format === 'm4a'
    ? (worst ? 'wa[acodec^=mp4a]/wa/w' : 'ba[acodec^=mp4a]/ba/b')
    : (worst ? 'wa/w' : 'ba/b');
  const args = [
    '--format', selector,
    '--extract-audio', '--audio-format', format,
    // 0 = best, 10 = smallest; only matters when the audio has to be re-encoded
    '--audio-quality', worst ? '10' : '0',
    // Title, artist, date and cover art show up in Music, Files and other players
    '--embed-metadata',
  ];
  if (format !== 'wav') args.push('--embed-thumbnail');
  if (format === 'm4a' || format === 'mp3') args.push('--embed-chapters'); // podcast chapters
  return args;
}

function youtubeVideoArgs(quality) {
  if (quality === 'max') {
    // Highest resolution in any codec (often AV1/VP9 in WebM/MKV: VLC/IINA, not QuickTime)
    return ['--format', 'bv*+ba/b', '--embed-metadata', '--embed-chapters'];
  }
  const mp4 = ['--merge-output-format', 'mp4', '--remux-video', 'mp4', '--embed-metadata', '--embed-chapters'];
  if (quality === 'best') return ['--format', 'bv*+ba/b', '--format-sort', MP4_SORT, ...mp4];
  if (quality === 'worst') return ['--format', 'bv*+ba/b', '--format-sort', 'vcodec:h264,+res,acodec:aac', ...mp4];
  const height = parseInt(quality, 10);
  return [
    '--format', `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b`,
    '--format-sort', MP4_SORT,
    ...mp4,
  ];
}

function otherSiteVideoArgs(quality) {
  // Other video hosts: prefer direct HTTPS formats (ids like "720p") over slow HLS
  if (quality === 'best') return ['--format', '1080p/720p/480p/240p/bv*+ba/b'];
  if (quality === 'max') return ['--format', 'bv*+ba/b'];
  if (quality === 'worst') return ['--format', '240p/wv*+wa/w'];
  const height = parseInt(quality, 10);
  return ['--format', `${quality}/bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b`];
}

function otherSiteArgs() {
  const args = OTHER_SITE_HEADERS.flatMap((header) => ['--add-header', header]);
  // HLS optimization (in case we fall back to HLS)
  args.push('--concurrent-fragments', '4', '--fragment-retries', '10', '--downloader', 'm3u8:native');
  return args;
}

function cookieArgs(source) {
  if (source.type === 'file') return ['--cookies', source.value];
  if (source.type === 'browser') return ['--cookies-from-browser', source.value];
  return [];
}

function buildArgs(url, { audioOnly, format, quality, outputPath, ffmpegDir, cookieSource, verbose }) {
  const youtube = isYouTubeUrl(url);
  return [
    // A link to a track inside a Mix/playlist downloads only that track.
    // Playlist links (youtube.com/playlist?list=...) still download the whole playlist.
    '--no-playlist',
    '--newline', '--progress', '--no-quiet', '--no-simulate', '--color', 'no_color',
    '--progress-delta', '0.5',
    '--progress-template', PROGRESS_TEMPLATE,
    '--progress-template', POSTPROCESS_TEMPLATE,
    '--print', INFO_PRINT,
    '--print', FILE_PRINT,
    // YouTube requires a JavaScript runtime; the Node.js running udav is always there
    '--js-runtimes', `node:${process.execPath}`,
    '--ffmpeg-location', ffmpegDir,
    '--output', path.join(outputPath, OUTPUT_TEMPLATE),
    ...(audioOnly ? audioArgs(format, quality) : (youtube ? youtubeVideoArgs(quality) : otherSiteVideoArgs(quality))),
    ...(youtube ? [] : otherSiteArgs()),
    ...cookieArgs(cookieSource),
    ...(verbose ? ['--verbose'] : []),
    '--', url,
  ];
}

function classifyError(run) {
  if (run.timedOut) return 'timeout';
  const text = run.errors.join('\n');
  const match = ERROR_KINDS.find(([, pattern]) => pattern.test(text));
  return match ? match[0] : 'other';
}

/** The last yt-dlp error without the links and the "please report" boilerplate */
function errorReason(run) {
  const last = run.errors[run.errors.length - 1] || `yt-dlp exited with code ${run.code}`;
  const cut = [' Use --cookies', '. See ', '; please report', ' Confirm you are on the latest', ' (caused by ']
    .map((marker) => last.indexOf(marker))
    .filter((index) => index > 0);
  const reason = cut.length ? last.slice(0, Math.min(...cut)) : last;
  return truncateToWidth(redact(reason.trim()), 300);
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findCookieBrowsers() {
  const usable = [];
  let safariBlocked = false;
  for (const browser of DEFAULT_CONFIG.BROWSER_FALLBACK_ORDER) {
    if (process.platform !== 'darwin') {
      if (browser !== 'safari') usable.push(browser);
      continue;
    }
    const { app, profile } = BROWSERS[browser];
    if (browser === 'safari') {
      try {
        // Safari cookies are readable only with Full Disk Access; opening never prompts
        const handle = await fs.open(profile, 'r');
        await handle.close();
        usable.push(browser);
      } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EACCES') safariBlocked = true;
      }
      continue;
    }
    const installed = (await exists(path.join('/Applications', app)))
      || (await exists(path.join(HOME, 'Applications', app)));
    if (installed && (await exists(profile))) usable.push(browser);
  }
  return { usable, safariBlocked };
}

const num = (value) => (value === undefined || value === 'NA' || value === '' ? NaN : Number(value));

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / UI_CONSTANTS.SECONDS_IN_MINUTE);
  const pad = (value) => String(value).padStart(UI_CONSTANTS.TIME_PAD_LENGTH, '0');
  const rest = pad(total % UI_CONSTANTS.SECONDS_IN_MINUTE);
  return hours ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

function formatInfo(info) {
  const lines = [chalk.cyan(`📹 ${info.title || info.id}`)];
  const author = info.uploader || info.channel;
  if (author) lines.push(chalk.white(`   Author: ${author}`));
  const duration = formatDuration(info.duration);
  if (duration) lines.push(chalk.white(`   Duration: ${duration}`));
  if (info.playlist_title && info.playlist_index) {
    lines.push(chalk.white(`   Playlist: ${info.playlist_title} (${info.playlist_index}/${info.n_entries ?? '?'})`));
  }
  return `${lines.join('\n')}\n`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Turns yt-dlp's tagged lines into spinner updates and collects the finished files */
function createReporter({ initialMessage, audioOnly, showInfo, verbose }) {
  const files = [];
  let current = null;

  // "[3/12] " while downloading a playlist
  const counter = () => (current?.count > 1 ? `[${current.index}/${current.count}] ` : '');

  const handlers = {
    info(payload) {
      const info = parseJson(payload) || {};
      current = {
        title: info.title || info.id || 'video',
        index: info.playlist_index,
        count: info.n_entries,
        separateStreams: String(info.format_id || '').includes('+'),
      };
      if (!spinner.isRunning()) spinner.start('');
      if (showInfo) spinner.log(formatInfo(info));
      spinner.updateMessage(`${counter()}Downloading`);
      spinner.updateSubject(current.title);
      spinner.updateProgress(null);
    },
    dl(payload) {
      const [status, downloaded, total, estimate, speed, fragmentIndex, fragmentCount, vcodec] = payload.split('|');
      if (status !== 'downloading') return;
      const totalBytes = num(total) || num(estimate);
      let percent = (num(downloaded) / totalBytes) * 100;
      if (!Number.isFinite(percent) && num(fragmentCount)) {
        percent = (num(fragmentIndex) / num(fragmentCount)) * 100;
      }
      const details = [];
      // Video and sound come as two separate downloads, each going 0 → 100%
      if (current?.separateStreams && !audioOnly) details.push(vcodec === 'none' ? 'audio' : 'video');
      const size = formatBytes(totalBytes);
      if (size) details.push(`of ${size}`);
      const rate = formatBytes(num(speed));
      if (rate) details.push(`${rate}/s`);
      spinner.updateMessage(`${counter()}Downloading`);
      spinner.updateProgress(percent, details.join(', '));
    },
    pp(payload) {
      const [name, status] = payload.split('|');
      const text = POSTPROCESSOR_LABELS[name];
      if (status === 'started' && text) {
        spinner.updateMessage(`${counter()}${text}`);
        spinner.updateProgress(null);
      }
    },
    file(payload) {
      const separator = payload.indexOf('|');
      const existed = payload.slice(0, separator) !== 'True';
      const filePath = path.normalize(payload.slice(separator + 1));
      files.push({ path: filePath, existed });
      const name = path.basename(filePath);
      spinner.stop(true, existed ? `"${name}" (already exists)` : `"${name}"`);
      if (current?.count > 1 && current.index < current.count) spinner.start('Preparing the next item...');
    },
  };

  spinner.start(initialMessage);
  return {
    files,
    onTag: (tag, payload) => handlers[tag]?.(payload),
    onLine: (line) => {
      if (verbose) spinner.log(chalk.gray(redact(line)));
    },
  };
}

async function runAttempt(ytdlp, url, settings, initialMessage) {
  const args = buildArgs(url, settings);
  if (settings.verbose) {
    logInfo(`yt-dlp ${ytdlp.version || ''} (${tildify(ytdlp.path)})`);
    logInfo(redact(`args: ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`));
  }
  const reporter = createReporter({ ...settings, initialMessage });
  const run = await runYtDlp(ytdlp.path, args, reporter);
  return { ...run, files: reporter.files, ok: run.code === UI_CONSTANTS.EXIT_CODE_SUCCESS && !run.timedOut };
}

function reportSuccess(run, outputPath) {
  if (spinner.isRunning()) spinner.cleanup();
  if (run.files.length === 0) {
    logWarning('yt-dlp finished, but no file was saved.');
    return;
  }
  const folders = [...new Set(run.files.map((file) => path.dirname(file.path)))];
  if (run.files.length === 1) {
    console.log(chalk.gray(`  ${tildify(folders[0])}`));
    return;
  }
  const existed = run.files.filter((file) => file.existed).length;
  const note = existed ? ` (${existed} already existed)` : '';
  logSuccess(`${run.files.length} files${note} → ${tildify(folders.length === 1 ? folders[0] : outputPath)}`);
}

function reportFailure(kind, run, { safariBlocked, triedBrowsers, ytdlp }) {
  if (spinner.isRunning()) spinner.stop(false, 'Download failed');
  const reason = errorReason(run);

  if (kind === 'auth') {
    logError(ERROR_MESSAGES.YOUTUBE_SIGN_IN);
    logInfo(`   yt-dlp: ${reason}`);
    for (const { browser, reason: browserReason } of triedBrowsers) {
      logInfo(`   ${browserName(browser)} cookies did not help: ${browserReason}`);
    }
    logInfo('💡 Solutions:');
    logInfo('   1. Open YouTube in Safari, Chrome or Edge, sign in, then run udav again:');
    logInfo('      it picks up the browser cookies automatically.');
    if (safariBlocked) {
      logInfo(`   2. For Safari cookies give ${terminalName()} Full Disk Access:`);
      logInfo(`      System Settings → Privacy & Security → Full Disk Access → ${terminalName()}, then restart it.`);
    }
    logInfo('   3. On a VPN? YouTube asks datacenter IPs to sign in more often: try another server.');
    return;
  }

  if (kind === 'safariAccess') {
    logError(`macOS does not let ${terminalName()} read Safari cookies.`);
    logInfo(`💡 System Settings → Privacy & Security → Full Disk Access → turn on ${terminalName()}, then restart it.`);
    logInfo('   Or use another browser: -b chrome (macOS will ask for the keychain password once).');
    return;
  }

  const hints = {
    network: [ERROR_MESSAGES.NETWORK, 'Check the internet connection or VPN and try again.'],
    rateLimit: [ERROR_MESSAGES.RATE_LIMITED, 'Wait a few minutes or switch to another VPN server.'],
    timeout: [`No activity for ${YTDLP.INACTIVITY_TIMEOUT_MS / 1000} seconds: the site stopped responding.`,
      'Run the same command again: the download resumes where it stopped.'],
    disk: [ERROR_MESSAGES.DISK_FULL, 'Free some space and run the same command again.'],
    unavailable: [`${ERROR_MESSAGES.DOWNLOAD_FAILED} ${reason}`, null],
    outdated: [`${ERROR_MESSAGES.DOWNLOAD_FAILED} ${reason}`, ytdlp.managed
      ? `yt-dlp ${ytdlp.version} is the latest version. YouTube probably changed something; yt-dlp usually ships a fix within days, and udav installs it automatically.`
      : 'Update yt-dlp and try again.'],
  };
  const [message, hint] = hints[kind] || [`${ERROR_MESSAGES.DOWNLOAD_FAILED} ${reason}`, 'Run with --verbose for details.'];
  logError(message);
  if (kind === 'network' || kind === 'rateLimit') logInfo(`   ${reason}`);
  if (hint) logInfo(`💡 ${hint}`);
}

async function prepareYtDlp(forceUpdate) {
  try {
    return await getYtDlp({ forceUpdate });
  } catch (error) {
    logError(error.message);
    logInfo('💡 udav downloads yt-dlp from GitHub: check the internet connection and run again.');
    return null;
  }
}

/** udav --update without a URL */
export async function updateYtDlp() {
  const ytdlp = await prepareYtDlp(true);
  if (!ytdlp) return false;
  if (!ytdlp.managed) logInfo(`Using ${ytdlp.path}: it is managed outside udav, update it there.`);
  else if (!ytdlp.changed) logSuccess(`yt-dlp ${ytdlp.version} is the latest version`);
  return true;
}

export async function downloadVideo(url, options = {}) {
  const {
    outputDir = null,
    format = DEFAULT_CONFIG.AUDIO_FORMAT,
    browser = null,
    cookiesFile = null,
    verbose = false,
    audioOnly = false,
    showInfo = false,
    forceUpdate = false,
    quality: userQuality = null,
  } = options;
  const quality = userQuality || (audioOnly ? DEFAULT_CONFIG.AUDIO_QUALITY : DEFAULT_CONFIG.VIDEO_QUALITY);

  // Use smart path organization or custom path
  const outputPath = await buildOutputPath(url, audioOnly, outputDir);
  if (verbose) logInfo(`📁 Output directory: ${tildify(outputPath)}`);
  if (!(await createOutputDirectory(outputPath))) return { success: false };

  // Without ffmpeg yt-dlp downloads everything and only then fails: check first
  const ffmpegDir = await findFfmpegDir();
  if (!ffmpegDir) {
    logError(ERROR_MESSAGES.FFMPEG_NOT_FOUND);
    logInfo('💡 FFmpeg Installation:');
    logInfo('   macOS: brew install ffmpeg');
    logInfo('   Linux: sudo apt install ffmpeg');
    logInfo('   Windows: download from https://ffmpeg.org/download.html');
    return { success: false };
  }

  let ytdlp = await prepareYtDlp(forceUpdate);
  if (!ytdlp) return { success: false };

  const youtube = isYouTubeUrl(url);
  const site = youtube ? 'YouTube' : extractDomain(url);
  const settings = { audioOnly, format, quality, outputPath, ffmpegDir, verbose, showInfo };

  // Cookies: only what the user asked for. Otherwise none, and browser cookies are tried
  // only when YouTube asks to sign in (no keychain prompts, no account risk for normal videos).
  const sources = cookiesFile ? [{ type: 'file', value: cookiesFile }]
    : browser ? [{ type: 'browser', value: browser.toLowerCase() }]
      : [{ type: 'none' }];
  const autoCookies = youtube && !cookiesFile && !browser;
  const triedBrowsers = [];
  let safariBlocked = false;
  let signInRun = null; // the first "please sign in" answer, reported if no browser helps
  let updateTried = ytdlp.changed;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const initialMessage = source.type === 'browser'
      ? `Using ${browserName(source.value)} cookies...`
      : `Connecting to ${site}...`;
    const run = await runAttempt(ytdlp, url, { ...settings, cookieSource: source }, initialMessage);

    if (run.ok) {
      reportSuccess(run, outputPath);
      return { success: true, outputPath, files: run.files };
    }
    if (run.files.length > 0) {
      // Playlist: some items saved, some failed (private, deleted...)
      if (spinner.isRunning()) spinner.cleanup();
      logWarning(`${run.files.length} file(s) saved, but some items failed: ${errorReason(run)}`);
      return { success: false, outputPath, files: run.files };
    }

    const kind = classifyError(run);

    if (kind === 'auth' && autoCookies && !signInRun) {
      signInRun = run;
      const browsers = await findCookieBrowsers();
      safariBlocked = browsers.safariBlocked;
      sources.push(...browsers.usable.map((value) => ({ type: 'browser', value, auto: true })));
      if (spinner.isRunning()) spinner.stop(false, 'YouTube asks to sign in');
      if (browsers.usable.length === 0) {
        reportFailure('auth', run, { safariBlocked, triedBrowsers, ytdlp });
        return { success: false, error: errorReason(run) };
      }
      if (browsers.usable.some((value) => value === 'chrome' || value === 'edge')) {
        logInfo('Retrying with browser cookies. macOS may ask for the keychain password');
        logInfo('to let yt-dlp read Chrome/Edge cookies: choose "Always Allow".');
      }
      continue;
    }
    if (source.auto) {
      triedBrowsers.push({ browser: source.value, reason: errorReason(run) });
      if (spinner.isRunning()) spinner.stop(false, `${browserName(source.value)} cookies did not help`);
      if (i < sources.length - 1) continue;
      reportFailure('auth', signInRun, { safariBlocked, triedBrowsers, ytdlp });
      return { success: false, error: errorReason(signInRun) };
    }
    if (kind === 'outdated' && ytdlp.managed && !updateTried) {
      updateTried = true;
      if (spinner.isRunning()) spinner.stop(false, 'Download failed, checking for a newer yt-dlp');
      const fresh = await getYtDlp({ forceUpdate: true }).catch(() => null);
      if (fresh && fresh.version !== ytdlp.version) {
        ytdlp = fresh;
        i--; // same attempt again with the new yt-dlp
        continue;
      }
    }

    reportFailure(kind, run, { safariBlocked, triedBrowsers, ytdlp });
    return { success: false, error: errorReason(run) };
  }
  return { success: false };
}

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { ERROR_MESSAGES, YTDLP } from './constants.js';
import { logWarning } from './logger.js';
import { spinner } from './spinner.js';

const execFileAsync = promisify(execFile);

// udav keeps its own yt-dlp here (macOS only), independent of the project folder,
// so re-cloning or reinstalling udav does not trigger a new 50 MB download.
const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'udav');
const VERSIONS_DIR = path.join(DATA_DIR, 'yt-dlp');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const EXE_SUFFIX = process.platform === 'win32' ? '.exe' : '';
// Added explicitly: udav may be started from a place where Homebrew is not in PATH.
const HOMEBREW_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

async function isExecutable(file) {
  try {
    await fs.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findInPath(name, extraDirs = []) {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...extraDirs];
  for (const dir of dirs.filter(Boolean)) {
    const candidate = path.join(dir, name + EXE_SUFFIX);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Directory with both ffmpeg and ffprobe, or null. */
export async function findFfmpegDir() {
  const ffmpeg = await findInPath('ffmpeg', HOMEBREW_BIN_DIRS);
  if (!ffmpeg) return null;
  const dir = path.dirname(ffmpeg);
  return (await isExecutable(path.join(dir, `ffprobe${EXE_SUFFIX}`))) ? dir : null;
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await fs.rename(temp, STATE_FILE);
}

function executableFor(version) {
  return path.join(VERSIONS_DIR, version, YTDLP.MACOS_EXECUTABLE);
}

/** Latest stable tag, read from the redirect of /releases/latest (no GitHub API rate limits). */
async function fetchLatestVersion() {
  const response = await fetch(`${YTDLP.RELEASES_URL}/latest`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(YTDLP.CHECK_TIMEOUT_MS),
  });
  await response.body?.cancel();
  const location = response.headers.get('location') || '';
  const version = decodeURIComponent(location.split('/releases/tag/')[1] || '');
  // The tag becomes a directory name, so accept nothing but a plain version number
  if (!YTDLP.VERSION_PATTERN.test(version)) {
    throw new Error(`unexpected answer from GitHub (HTTP ${response.status})`);
  }
  return version;
}

async function fetchChecksum(version) {
  const url = `${YTDLP.RELEASES_URL}/download/${version}/${YTDLP.CHECKSUMS_ASSET}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(YTDLP.CHECK_TIMEOUT_MS * 3) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  for (const line of (await response.text()).split('\n')) {
    const [checksum, name] = line.trim().split(/\s+/);
    if (name === YTDLP.MACOS_ASSET && /^[0-9a-f]{64}$/.test(checksum)) return checksum;
  }
  throw new Error(`no checksum for ${YTDLP.MACOS_ASSET} in ${YTDLP.CHECKSUMS_ASSET}`);
}

/** Streams url to destination and returns its SHA-256. */
async function downloadFile(url, destination, onProgress) {
  const response = await fetch(url, { signal: AbortSignal.timeout(YTDLP.DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      onProgress(received, total);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(destination));
  return hash.digest('hex');
}

async function removeOtherVersions(keep) {
  const entries = await fs.readdir(VERSIONS_DIR).catch(() => []);
  await Promise.all(entries
    .filter((name) => name !== keep)
    .map((name) => fs.rm(path.join(VERSIONS_DIR, name), { recursive: true, force: true })));
}

async function install(version, previousVersion) {
  const action = previousVersion
    ? `Updating yt-dlp ${previousVersion} → ${version}`
    : `Installing yt-dlp ${version} (one time, ~50 MB)`;
  const tempZip = path.join(VERSIONS_DIR, `.download-${process.pid}.zip`);
  const tempDir = path.join(VERSIONS_DIR, `.unpack-${version}-${process.pid}`);
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
  spinner.start(`${action}...`);
  try {
    const expected = await fetchChecksum(version);
    const assetUrl = `${YTDLP.RELEASES_URL}/download/${version}/${YTDLP.MACOS_ASSET}`;
    const actual = await downloadFile(assetUrl, tempZip, (received, total) => {
      if (total) spinner.updateProgress((received / total) * 100);
    });
    if (actual !== expected) throw new Error('checksum mismatch, the download is corrupted');

    spinner.updateProgress(null);
    await execFileAsync('ditto', ['-x', '-k', tempZip, tempDir]);
    // macOS scans every new executable file once, so the very first launch takes ~20 s.
    // Doing it here also proves the new build works before it replaces the old one.
    spinner.updateMessage(`Checking yt-dlp ${version} (first launch: macOS scans new files, ~20s)...`);
    const { stdout } = await execFileAsync(path.join(tempDir, YTDLP.MACOS_EXECUTABLE), ['--version'], {
      timeout: YTDLP.FIRST_LAUNCH_TIMEOUT_MS,
    });
    if (stdout.trim() !== version) throw new Error(`unexpected version "${stdout.trim()}"`);

    await fs.rm(path.join(VERSIONS_DIR, version), { recursive: true, force: true });
    await fs.rename(tempDir, path.join(VERSIONS_DIR, version));
    await writeState({ version, checkedAt: new Date().toISOString() });
    await removeOtherVersions(version);
    spinner.stop(true, `yt-dlp ${version} is ready`);
  } catch (error) {
    spinner.stop(false, `${action} failed`);
    throw error;
  } finally {
    await fs.rm(tempZip, { force: true });
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * The yt-dlp to run: { path, version, managed, changed }.
 * macOS: udav installs its own copy and checks for a new release once a day
 * (or right now with forceUpdate). Elsewhere: yt-dlp from PATH.
 * UDAV_YTDLP=/path/to/yt-dlp overrides both.
 */
export async function getYtDlp({ forceUpdate = false } = {}) {
  if (process.env.UDAV_YTDLP) {
    return { path: process.env.UDAV_YTDLP, version: null, managed: false, changed: false };
  }
  if (process.platform !== 'darwin') {
    const found = await findInPath('yt-dlp');
    if (!found) throw new Error(ERROR_MESSAGES.YTDLP_NOT_FOUND);
    return { path: found, version: null, managed: false, changed: false };
  }

  const state = await readState();
  const installed = YTDLP.VERSION_PATTERN.test(state.version || '')
    && (await isExecutable(executableFor(state.version)))
    ? state.version
    : null;

  if (!installed) {
    let latest;
    try {
      latest = await fetchLatestVersion();
    } catch (error) {
      throw new Error(`Cannot reach GitHub to download yt-dlp: ${error.message}`);
    }
    await install(latest, null);
    return { path: executableFor(latest), version: latest, managed: true, changed: true };
  }

  const checkedAt = Date.parse(state.checkedAt || '') || 0;
  if (forceUpdate || Date.now() - checkedAt > YTDLP.UPDATE_CHECK_INTERVAL_MS) {
    let latest = null;
    try {
      latest = await fetchLatestVersion();
    } catch (error) {
      // Offline or GitHub is down: keep working with the installed version
      if (forceUpdate) throw new Error(`Cannot check for yt-dlp updates: ${error.message}`);
    }
    if (latest && latest !== installed) {
      try {
        await install(latest, installed);
        return { path: executableFor(latest), version: latest, managed: true, changed: true };
      } catch (error) {
        if (forceUpdate) throw new Error(`yt-dlp update failed: ${error.message}`);
        logWarning(`yt-dlp update failed (${error.message}), staying on ${installed}`);
      }
    }
    // Next automatic check in a day, whatever the outcome
    await writeState({ ...state, checkedAt: new Date().toISOString() }).catch(() => {});
  }
  return { path: executableFor(installed), version: installed, managed: true, changed: false };
}

/**
 * Runs yt-dlp and dispatches its output line by line. Lines tagged "[udav:<tag>] <payload>"
 * (produced by our --print / --progress-template options) go to onTag, all others to onLine.
 * Never rejects: resolves with { code, errors, warnings, timedOut }.
 */
export function runYtDlp(binary, args, { onTag = () => {}, onLine = () => {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    const errors = [];
    const warnings = [];
    let timedOut = false;
    let postprocessing = false;
    let timer = null;

    const armWatchdog = () => {
      clearTimeout(timer);
      if (postprocessing) return; // ffmpeg prints nothing while it works
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, YTDLP.INACTIVITY_TIMEOUT_MS);
    };

    const handleLine = (rawLine) => {
      const line = rawLine.split('\r').pop();
      armWatchdog();
      const tagged = line.match(/^\[udav:(\w+)\] ?(.*)$/);
      if (tagged) {
        const [, tag, payload] = tagged;
        if (tag === 'pp') {
          postprocessing = payload.endsWith('|started');
          armWatchdog();
        }
        onTag(tag, payload);
        return;
      }
      if (line.startsWith('ERROR: ')) errors.push(line.slice('ERROR: '.length).trim());
      else if (line.startsWith('WARNING: ')) warnings.push(line.slice('WARNING: '.length).trim());
      onLine(line);
    };

    readline.createInterface({ input: child.stdout }).on('line', handleLine);
    readline.createInterface({ input: child.stderr }).on('line', handleLine);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, errors: [...errors, error.message], warnings, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, errors, warnings, timedOut });
    });
    armWatchdog();
  });
}

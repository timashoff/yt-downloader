import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { logError, logInfo, redact } from './logger.js';
import { isInteractive, spinner } from './spinner.js';
import { DATA_DIR } from './ytdlp.js';

const execFileAsync = promisify(execFile);

// "udav Safari Cookies" (macos/safari-cookies): a tiny app that copies only the YouTube
// cookies from Safari into DATA_DIR. macOS opens Safari cookies only to apps with Full Disk
// Access; the helper gets it instead of the terminal, where every program would get it.
// It is built once and then left alone: a rebuilt helper is a new app for macOS, and Full
// Disk Access would have to be turned on again.
export const SAFARI_HELPER_NAME = 'udav Safari Cookies';
const BUNDLE_ID = 'local.udav.safari-cookies';
const EXECUTABLE = 'udav-safari-cookies';
const SOURCE_DIR = fileURLToPath(new URL('../macos/safari-cookies/', import.meta.url));
const APP_PATH = path.join(DATA_DIR, `${SAFARI_HELPER_NAME}.app`);
const APP_EXECUTABLE = path.join(APP_PATH, 'Contents', 'MacOS', EXECUTABLE);
// Fixed names the helper writes to (see main.swift)
export const SAFARI_COOKIES_FILE = path.join(DATA_DIR, 'safari-youtube-cookies.txt');
const STATUS_FILE = path.join(DATA_DIR, 'safari-cookies.status');

// The helper gets Full Disk Access, so it is built only with Apple's compiler and SDK from
// the Command Line Tools (owned by root, signed by Apple): absolute paths and a clean
// environment, so that no DEVELOPER_DIR, SDKROOT or PATH can swap in another toolchain.
const SWIFTC = '/Library/Developer/CommandLineTools/usr/bin/swiftc';
const SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk';
const CODESIGN = '/usr/bin/codesign';
const OPEN = '/usr/bin/open';
const CLEAN_ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: os.homedir(), TMPDIR: os.tmpdir() };
const FULL_DISK_ACCESS_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
const HELPER_TIMEOUT_MS = 30 * 1000;
const STATUS_WAIT_MS = 5 * 1000;
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
// While the user turns on Full Disk Access in System Settings
const ACCESS_WAIT_MS = 10 * 60 * 1000;
const ACCESS_POLL_MS = 1500;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function isExecutable(file) {
  try {
    await fs.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function buildHelper() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const work = await fs.mkdtemp(path.join(DATA_DIR, '.build-'));
  try {
    const app = path.join(work, `${SAFARI_HELPER_NAME}.app`);
    await fs.mkdir(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    await fs.copyFile(path.join(SOURCE_DIR, 'Info.plist'), path.join(app, 'Contents', 'Info.plist'));
    const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    await execFileAsync(SWIFTC, [
      '-O', '-sdk', SDK, '-target', `${arch}-apple-macos13.0`,
      '-o', path.join(app, 'Contents', 'MacOS', EXECUTABLE),
      path.join(SOURCE_DIR, 'SafariCookies.swift'), path.join(SOURCE_DIR, 'main.swift'),
    ], { env: CLEAN_ENV, cwd: work, timeout: BUILD_TIMEOUT_MS });

    // Ad-hoc signature with the hardened runtime. open --env can hand the helper any
    // environment variable; the hardened runtime makes it ignore DYLD_* (no code injection).
    // A changed file no longer matches the signature, and macOS stops granting access.
    await execFileAsync(CODESIGN, ['--force', '--sign', '-', '--options', 'runtime', '--identifier', BUNDLE_ID, app],
      { env: CLEAN_ENV });
    await execFileAsync(CODESIGN, ['--verify', '--strict', app], { env: CLEAN_ENV });
    const { stderr } = await execFileAsync(CODESIGN, ['--display', '--verbose=2', app], { env: CLEAN_ENV });
    if (!/flags=0x[0-9a-f]+\([^)]*\bruntime\b/.test(stderr)) throw new Error('the signature has no hardened runtime');

    await fs.rm(APP_PATH, { recursive: true, force: true });
    await fs.rename(app, APP_PATH);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function buildWithSpinner() {
  spinner.start(`Building ${SAFARI_HELPER_NAME} (once)...`);
  try {
    await buildHelper();
    spinner.stop(true, `${SAFARI_HELPER_NAME} is built and signed`);
    return true;
  } catch (error) {
    spinner.stop(false, `Building ${SAFARI_HELPER_NAME} failed`);
    logError(redact(String(error.stderr || error.message).trim().split('\n').slice(0, 8).join('\n')));
    return false;
  }
}

/**
 * Runs the helper once: { status, count, file }. status is 'ok', 'not-installed',
 * 'no-access' (no Full Disk Access), 'no-youtube-login', 'no-cookies-file', 'bad-format'...
 */
async function getSafariCookies() {
  if (!(await isExecutable(APP_EXECUTABLE))) return { status: 'not-installed' };
  await fs.rm(STATUS_FILE, { force: true });
  let launchError = null;
  try {
    // Started by open, the helper runs as its own app: macOS checks its Full Disk Access,
    // not the terminal's. -W waits until it quits, -n new instance, -g -j in the background.
    await execFileAsync(OPEN, ['-W', '-n', '-g', '-j', APP_PATH], { timeout: HELPER_TIMEOUT_MS });
  } catch (error) {
    // open -W sometimes misses an app that quits within milliseconds ("Unable to block on
    // application"), although the helper did run: the status file decides
    launchError = error;
  }
  const line = await readStatus();
  if (!line) return { status: 'failed', detail: redact(launchError?.message || 'the helper wrote no status') };
  const [status, detail = ''] = line.split(' ');
  if (status === 'ok') return { status, count: Number(detail), file: SAFARI_COOKIES_FILE };
  return { status, detail };
}

/** The helper writes its status last, with an atomic rename: once the file is there, it is done */
async function readStatus() {
  const deadline = Date.now() + STATUS_WAIT_MS;
  for (;;) {
    const line = (await fs.readFile(STATUS_FILE, 'utf8').catch(() => '')).trim();
    if (line || Date.now() > deadline) return line;
    await sleep(50);
  }
}

/** Runs the helper again and again until macOS lets it read Safari (or the time is up) */
async function waitForSafariAccess() {
  const deadline = Date.now() + ACCESS_WAIT_MS;
  let safari = await getSafariCookies();
  while (safari.status === 'no-access' && Date.now() < deadline) {
    await sleep(ACCESS_POLL_MS);
    safari = await getSafariCookies();
  }
  return safari;
}

/** The one thing only the user can do: macOS lets no program turn on Full Disk Access itself */
async function askForFullDiskAccess() {
  logInfo(`Safari cookies need one permission, once: Full Disk Access for "${SAFARI_HELPER_NAME}".`);
  logInfo('Only this small app gets it, not your terminal. Finder and System Settings open now:');
  logInfo(`   drag "${SAFARI_HELPER_NAME}" into Privacy & Security → Full Disk Access and turn it on`);
  logInfo(`   (or click +, press ⇧⌘G and paste ${redact(DATA_DIR)}).`);
  logInfo('   Already in the list and on? Remove it (−) and add it again.');
  await execFileAsync(OPEN, ['-R', APP_PATH]).catch(() => {});
  await execFileAsync(OPEN, [FULL_DISK_ACCESS_SETTINGS]).catch(() => {});
}

/**
 * YouTube cookies from Safari for this download. The first time, builds the helper; when macOS
 * has not allowed it yet and someone is at the terminal, opens the settings and waits until the
 * switch is on, so the same udav command just continues.
 */
export async function prepareSafariCookies() {
  if (process.platform !== 'darwin') return { status: 'not-installed' };
  if (!(await isExecutable(APP_EXECUTABLE))) {
    if (!(await isExecutable(SWIFTC))) return { status: 'no-compiler' };
    if (!(await buildWithSpinner())) return { status: 'build-failed' };
  }

  spinner.start('Reading YouTube cookies from Safari...');
  let safari = await getSafariCookies();
  spinner.cleanup();
  if (safari.status === 'no-access' && isInteractive()) {
    await askForFullDiskAccess();
    spinner.start('Waiting for Full Disk Access (Ctrl+C to cancel)...');
    safari = await waitForSafariAccess();
    if (safari.status === 'ok') spinner.stop(true, `Full Disk Access is on: ${safari.count} YouTube cookies from Safari`);
    else if (safari.status === 'no-access') spinner.stop(false, 'Still no Full Disk Access');
    else spinner.stop(true, 'Full Disk Access is on');
  }
  return safari;
}

/** The copy of the YouTube cookies lives only as long as one udav run */
export async function removeSafariCookies() {
  await fs.rm(SAFARI_COOKIES_FILE, { force: true });
}

export function removeSafariCookiesSync() {
  try {
    rmSync(SAFARI_COOKIES_FILE, { force: true });
  } catch {
    // nothing to clean up
  }
}

/** The helper could not be used at all: let yt-dlp try Safari directly (works with Full Disk Access) */
export const safariHelperUnavailable = (safari) => ['not-installed', 'no-compiler', 'build-failed'].includes(safari?.status);

/** What to do when Safari cookies are not available: lines of one hint, or null */
export function safariHint(safari) {
  switch (safari?.status) {
    case undefined:
    case 'ok':
    case 'not-installed': // not macOS
      return null;
    case 'no-compiler':
      return ['Install Apple Command Line Tools (xcode-select --install), then run udav again:',
        'it builds a small helper app that reads YouTube cookies from Safari.'];
    case 'build-failed':
      return ['udav could not build its Safari helper: the reason is above.'];
    case 'no-access':
      return [`Run udav again in a terminal window and turn on Full Disk Access for "${SAFARI_HELPER_NAME}"`,
        'when System Settings opens.'];
    case 'no-youtube-login':
    case 'no-cookies-file':
      return ['Sign in to YouTube in Safari, then run udav again.'];
    default:
      return [`${SAFARI_HELPER_NAME} could not read Safari cookies (${safari.status}).`];
  }
}

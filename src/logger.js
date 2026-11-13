import os from 'node:os';
import chalk from 'chalk';

const HOME = os.homedir();

/**
 * Masks what should not end up in a pasted log: the public IP address (yt-dlp prints
 * googlevideo URLs with "ip=..."), CDN node names, proxy passwords and the home folder path.
 * Apply to every line that comes from yt-dlp before printing it.
 */
export function redact(text) {
  return String(text)
    .split(HOME).join('~')
    .replace(/([?&]ip=)[^&\s"']+/gi, '$1***')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '***.***.***.***')
    .replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '****:****')
    .replace(/\brr\d+---sn-[a-z0-9-]+\.googlevideo\.com/gi, '***.googlevideo.com')
    .replace(/(\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1***:***@');
}

export function logError(message, error = null) {
  console.error(chalk.red('✗ Error:'), message);
  if (error && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }
}

export function logSuccess(message) {
  console.log(chalk.green('✓'), message);
}

export function logInfo(message) {
  console.log(chalk.blue('ℹ'), message);
}

export function logWarning(message) {
  console.log(chalk.yellow('⚠'), message);
}

export function logProgress(message) {
  console.log(chalk.cyan('→'), message);
}

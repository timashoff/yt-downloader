import chalk from 'chalk';
import { UI_SYMBOLS, SPINNER_CONSTANTS } from './constants.js';

// No animation and no cursor codes when the output goes to a file or a pipe
export const isInteractive = () => Boolean(process.stdout.isTTY);

/**
 * Clear the current terminal line
 */
export function clearTerminalLine() {
  if (isInteractive()) process.stdout.write('\r\x1b[K');
}

/**
 * Get elapsed time string
 */
function getElapsedTime(startTime) {
  return ((Date.now() - startTime) / 1000).toFixed(1);
}

/**
 * Terminal columns taken by a character: 2 for CJK and emoji, 0 for combining marks
 */
function charWidth(codePoint) {
  if ((codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) return 0;
  if ((codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe4f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)) return 2;
  return 1;
}

function displayWidth(text) {
  return Array.from(text).reduce((sum, char) => sum + charWidth(char.codePointAt(0)), 0);
}

/**
 * Cut text to fit into maxWidth terminal columns (adds an ellipsis when cut)
 */
export function truncateToWidth(text, maxWidth) {
  const chars = Array.from(text);
  const widths = chars.map((char) => charWidth(char.codePointAt(0)));
  if (widths.reduce((sum, width) => sum + width, 0) <= maxWidth) return text;
  let used = 0;
  let result = '';
  for (let i = 0; i < chars.length && used + widths[i] <= maxWidth - 1; i++) {
    used += widths[i];
    result += chars[i];
  }
  return `${result}…`;
}

/**
 * Show status message with icon and time
 */
export function showStatus(type, time, message = '') {
  const icon = type === 'success' ? UI_SYMBOLS.CHECK : UI_SYMBOLS.CROSS;
  const color = type === 'success' ? chalk.green : chalk.red;
  const status = color(`${icon} ${time}s`);
  console.log(message ? `${status} ${message}` : status);
}

/**
 * SpinnerManager class for elegant loading indicators
 */
export class SpinnerManager {
  constructor() {
    this.isActive = false;
    this.interval = null;
    this.startTime = null;
    this.spinnerIndex = 0;
    this.message = '';
    this.subject = '';
    this.progress = null;
    this.detail = '';
  }

  /**
   * Start spinner with message
   */
  start(message = 'Loading...') {
    if (this.isActive) {
      // Just cleanup without showing "Interrupted" message
      this.cleanup();
    }

    this.isActive = true;
    this.startTime = Date.now();
    this.spinnerIndex = 0;
    this.message = message;
    this.subject = '';
    this.progress = null;
    this.detail = '';

    if (!isInteractive()) return;

    // Hide cursor
    process.stdout.write('\x1B[?25l');
    this.interval = setInterval(() => this.render(), SPINNER_CONSTANTS.INTERVAL);
  }

  render() {
    if (!this.isActive) return;
    const frame = UI_SYMBOLS.SPINNER[this.spinnerIndex++ % UI_SYMBOLS.SPINNER.length];
    const columns = (process.stdout.columns || 80) - 1;

    const head = `${frame} ${this.message}`;
    const tail = [this.progress !== null ? `${this.progress}%` : '', this.detail].filter(Boolean).join(' ');
    let statusText = tail ? `${head} ${tail}` : head;
    if (this.subject) {
      // The subject (a title) shrinks first, so the percentage always stays visible
      const room = Math.max(10, columns - displayWidth(statusText) - 3);
      const subject = `"${truncateToWidth(this.subject, room)}"`;
      statusText = tail ? `${head} ${subject} ${tail}` : `${head} ${subject}`;
    }

    // A line longer than the terminal wraps, and "clear line" then leaves garbage behind
    clearTerminalLine();
    process.stdout.write(truncateToWidth(statusText, columns));
  }

  /**
   * Update spinner message
   */
  updateMessage(message) {
    if (this.isActive) {
      this.message = message;
    }
  }

  /**
   * What the message is about (shown in quotes, shortened first when space is short)
   */
  updateSubject(subject) {
    if (this.isActive) {
      this.subject = subject;
    }
  }

  /**
   * Update progress percentage (null hides it) and an optional detail like "of 25 MB, 3 MB/s"
   */
  updateProgress(percent, detail = '') {
    if (!this.isActive) return;
    this.progress = Number.isFinite(percent) ? Math.min(100, Math.round(percent)) : null;
    this.detail = detail;
  }

  /**
   * Print a line above the spinner without breaking it
   */
  log(text) {
    clearTerminalLine();
    console.log(text);
  }

  /**
   * Stop spinner with final status
   */
  stop(success = true, message = null) {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    clearTerminalLine();

    // Show cursor
    if (isInteractive()) process.stdout.write('\x1B[?25h');

    if (this.startTime) {
      const finalTime = getElapsedTime(this.startTime);
      const finalMessage = message || (success ? 'Completed!' : 'Failed!');
      showStatus(success ? 'success' : 'error', finalTime, finalMessage);
    }
  }

  /**
   * Check if spinner is currently active
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Force cleanup (for emergency stops)
   */
  cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isActive = false;
    this.startTime = null;
    clearTerminalLine();
    if (isInteractive()) process.stdout.write('\x1B[?25h'); // Show cursor
  }
}

// Export singleton instance for convenience
export const spinner = new SpinnerManager();

import { UI_SYMBOLS, SPINNER_CONSTANTS } from './constants.js';

/**
 * Clear the current terminal line
 */
export function clearTerminalLine() {
  process.stdout.write('\r\x1b[K');
}

/**
 * Get elapsed time string
 */
function getElapsedTime(startTime) {
  return ((Date.now() - startTime) / 1000).toFixed(1);
}

/**
 * Show status message with icon and time
 */
export function showStatus(type, time, message = '') {
  const icon = type === 'success' ? UI_SYMBOLS.CHECK : UI_SYMBOLS.CROSS;
  const statusColor = type === 'success' ? '\x1b[32m' : '\x1b[31m'; // green or red
  const resetColor = '\x1b[0m';
  
  const statusText = message 
    ? `${statusColor}${icon} ${time}s${resetColor} ${message}`
    : `${statusColor}${icon} ${time}s${resetColor}`;
  
  console.log(statusText);
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
    this.progress = null;
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
    this.progress = null;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    this.interval = setInterval(() => {
      if (!this.isActive) return;

      clearTerminalLine();
      const spinner = UI_SYMBOLS.SPINNER[this.spinnerIndex++ % UI_SYMBOLS.SPINNER.length];
      
      let statusText = `${spinner} ${this.message}`;
      
      // Add progress if available
      if (this.progress !== null) {
        statusText += ` ${this.progress}%`;
      }

      process.stdout.write(statusText);
    }, SPINNER_CONSTANTS.INTERVAL);
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
   * Update progress percentage
   */
  updateProgress(percent) {
    if (this.isActive) {
      this.progress = Math.round(percent);
    }
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
    process.stdout.write('\x1B[?25h');

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
    process.stdout.write('\x1B[?25h'); // Show cursor
  }
}

// Export singleton instance for convenience
export const spinner = new SpinnerManager();
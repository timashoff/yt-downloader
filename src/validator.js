import { YOUTUBE_DOMAINS, ERROR_MESSAGES } from './constants.js';

export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: ERROR_MESSAGES.MISSING_URL
    };
  }

  try {
    new URL(url); // Just check if URL is valid format
    // Let yt-dlp decide if the URL is supported
    return {
      isValid: true,
      url: url
    };
  } catch (error) {
    return {
      isValid: false,
      error: ERROR_MESSAGES.INVALID_URL
    };
  }
}

export function isYouTubeUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return YOUTUBE_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Keep for backward compatibility
export const validateYouTubeUrl = validateUrl;

export async function validateFormat(format) {
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.SUPPORTED_FORMATS.includes(format.toLowerCase());
}

export async function validateAudioQuality(quality) {
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.AUDIO_QUALITY_OPTIONS.includes(quality.toLowerCase());
}

export async function validateVideoQuality(quality) {
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.VIDEO_QUALITY_OPTIONS.includes(quality.toLowerCase());
}

// Keep for backward compatibility
export const validateQuality = validateAudioQuality;

export async function validateBrowser(browser) {
  if (!browser) return true;
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.SUPPORTED_BROWSERS.includes(browser.toLowerCase());
}


import { YOUTUBE_DOMAINS, ERROR_MESSAGES } from './constants.js';

export function validateYouTubeUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: ERROR_MESSAGES.MISSING_URL
    };
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const isYouTubeDomain = YOUTUBE_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    if (!isYouTubeDomain) {
      return {
        isValid: false,
        error: ERROR_MESSAGES.INVALID_URL
      };
    }

    // Пусть yt-dlp сам решает, валидная ли ссылка YouTube
    // Убираем жесткие проверки на конкретные форматы
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

export async function validateFormat(format) {
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.SUPPORTED_FORMATS.includes(format.toLowerCase());
}

export async function validateQuality(quality) {
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.QUALITY_OPTIONS.includes(quality.toLowerCase());
}

export async function validateBrowser(browser) {
  if (!browser) return true;
  const { DEFAULT_CONFIG } = await import('./constants.js');
  return DEFAULT_CONFIG.SUPPORTED_BROWSERS.includes(browser.toLowerCase());
}
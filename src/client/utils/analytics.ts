/**
 * Type declarations for Google Analytics, Zaraz and Google AdSense
 */
declare global {
  interface Window {
    zaraz?: {
      track: (eventName: string, properties?: Record<string, any>) => void;
    };
    adsbygoogle: any[];
  }
}

/**
 * Tracks a custom event using Cloudflare Zaraz
 * @param eventName The name of the event
 * @param eventParams Additional parameters for the event
 */
export function trackEvent(eventName: string, eventParams?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.zaraz) {
    try {
      window.zaraz.track(eventName, eventParams);
    } catch (e) {
      console.warn('Zaraz tracking failed', e);
    }
  } else {
    console.warn('Zaraz not found, would track:', eventName, eventParams);
  }
}

/**
 * Tracks a page view (useful for SPAs on route change) via Zaraz
 * @param pagePath The virtual page path, e.g. '/editor'
 */
export function trackPageView(pagePath: string) {
  if (typeof window !== 'undefined' && window.zaraz) {
    try {
      window.zaraz.track('Page View', {
        page_path: pagePath,
        page_title: document.title,
        page_location: window.location.href,
      });
    } catch (e) {
      console.warn('Zaraz pageview tracking failed', e);
    }
  }
}

/**
 * Refreshes or requests a new ad from AdSense (useful for SPAs on route change)
 * Note: Must be called after the ad container `<ins class="adsbygoogle" ...>` is mounted.
 */
export function refreshAds() {
  if (typeof window !== 'undefined') {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense push failed', e);
    }
  }
}

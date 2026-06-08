/**
 * Type declarations for Google Analytics and Google AdSense
 */
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    adsbygoogle: any[];
  }
}

/**
 * Tracks a custom event in GA4
 * @param eventName The name of the event
 * @param eventParams Additional parameters for the event
 */
export function trackEvent(eventName: string, eventParams?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      window.gtag('event', eventName, eventParams);
    } catch (e) {
      console.warn('GA tracking failed', e);
    }
  }
}

/**
 * Tracks a page view (useful for SPAs on route change)
 * @param pagePath The virtual page path, e.g. '/editor'
 */
export function trackPageView(pagePath: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_title: document.title,
        page_location: window.location.href,
      });
    } catch (e) {
      console.warn('GA pageview tracking failed', e);
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

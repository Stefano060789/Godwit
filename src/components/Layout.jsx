import { useEffect, useState } from "react";
import CookieConsent from "./CookieConsent";
import { COOKIE_CONSENT_EVENT, getCookieConsent } from "../lib/cookieConsent";
import { applyTheme, readTheme } from "../lib/theme";

// App and workspace pages share the Venus-inspired theme tokens; workspace pages also
// normalize the legacy utility colors used by business-management controls.
export default function Layout({ children, theme = "app", className = "" }) {
  // The cookie banner is fixed to the bottom of the viewport (see CookieConsent), which would
  // otherwise overlap the last bit of page content on a normal phone screen, where content
  // height is often close to the viewport height. Reserve space for it until a choice is made.
  const [bannerVisible, setBannerVisible] = useState(() => !getCookieConsent());

  useEffect(() => {
    applyTheme(readTheme());
    function handleConsentChange() {
      setBannerVisible(!getCookieConsent());
    }
    window.addEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleConsentChange);
  }, []);

  return (
    <main className={`${theme === "workspace" ? "workspace-page" : "app-page"} max-w-3xl mx-auto px-4 py-6 ${bannerVisible ? "pb-32 sm:pb-24" : ""} ${className}`}>
      {children}
      <CookieConsent />
    </main>
  );
}

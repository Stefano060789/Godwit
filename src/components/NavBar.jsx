import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import godwitMark from "../assets/godwit-mark.svg";
import LanguageSwitcher from "./LanguageSwitcher";
import { isCreatorEmail } from "../lib/creatorAccess";

export default function NavBar() {
  const location = useLocation();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  // The QR wizard's "preview what a scanner sees" iframe shares the parent admin page's
  // logged-in session, so this nav would otherwise show "Quick start"/"Dashboard" (the
  // operator's own links) instead of what an actual anonymous visitor sees. Force the
  // logged-out nav in that case without touching the real session.
  const isPreview = new URLSearchParams(location.search).get("preview") === "1";
  const displayUser = isPreview ? null : user;
  const isCreator = isCreatorEmail(displayUser?.email);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    }

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function saveInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function clearInstallPrompt() {
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", saveInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", saveInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    closeMenu();
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    closeMenu();
  }

  return (
    <nav className="site-nav">
      <div className="site-nav-bar">
        <Link to="/" onClick={closeMenu} className="site-nav-brand">
          <img src={godwitMark} alt="" className="site-nav-brand-mark" width="28" height="28" />
          <span>Godwit</span>
        </Link>
        <div className="site-nav-actions">
          {displayUser && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className={`site-nav-dashboard ${location.pathname === "/admin" ? "is-active" : ""}`}
              aria-current={location.pathname === "/admin" ? "page" : undefined}
            >
              {t("nav.dashboard")}
            </Link>
          )}
          {!displayUser && <Link to="/essentials" onClick={closeMenu} className="site-nav-primary site-nav-start">{t("nav.getStarted")}</Link>}
          <LanguageSwitcher className="site-nav-lang" />
          {displayUser && <Link to="/admin/billing" onClick={closeMenu} className="site-nav-billing">{t("nav.billing")}</Link>}
          <button
            type="button"
            className="site-nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            aria-label={t("nav.menu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true">
              <rect width="20" height="2" rx="1" fill="currentColor" />
              <rect y="7" width="20" height="2" rx="1" fill="currentColor" />
              <rect y="14" width="20" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      <div id="site-navigation" className={`site-nav-links ${menuOpen ? "is-open" : ""}`}>
        {!displayUser && <>
          <Link to="/essentials" onClick={closeMenu} className="site-nav-links-start">{t("nav.getStarted")}</Link>
          <Link to="/login" onClick={closeMenu}>{t("nav.signIn")}</Link>
        </>}
        {displayUser && <>
          {installPrompt && <button type="button" onClick={installApp}>{t("nav.install")}</button>}
          <Link to="/feedback" onClick={closeMenu}>{t("nav.shareFeedback")}</Link>
          <Link to="/account" onClick={closeMenu}>{t("nav.account")}</Link>
          {isCreator && <Link to="/creator" onClick={closeMenu}>Creator overview</Link>}
          <button type="button" onClick={signOut}>{t("nav.signOut")}</button>
        </>}
      </div>
    </nav>
  );
}

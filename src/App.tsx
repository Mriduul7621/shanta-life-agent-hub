import { useEffect, useRef, useState } from 'react';
import { AuthProviderComponent, useAuth } from './auth/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import { Layout } from './components/Layout';
import type { View } from './components/Layout';
import { SplashScreen } from './components/SplashScreen';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { ModulePage } from './pages/ModulePage';
import { ProfilePage } from './pages/ProfilePage';

/**
 * Splash timing: the splash shows while the session restores, for at
 * least SPLASH_MIN_MS (so it never flashes), then fades for
 * SPLASH_FADE_MS. Total ≤ ~1s, never blocking login — the overlay is
 * pointer-events-none, so the form beneath is usable the moment it
 * renders. Reduced motion: the fade is instant (index.css).
 */
const SPLASH_MIN_MS = 700;
const SPLASH_FADE_MS = 300;

function Shell() {
  const { user, restoring } = useAuth();
  const [view, setView] = useState<View>('home');
  const [splash, setSplash] = useState<'show' | 'fade' | 'done'>('show');
  const mountTime = useRef(Date.now());

  useEffect(() => {
    if (restoring) return;
    const elapsed = Date.now() - mountTime.current;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    const t1 = window.setTimeout(() => setSplash('fade'), wait);
    const t2 = window.setTimeout(() => setSplash('done'), wait + SPLASH_FADE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [restoring]);

  return (
    <>
      {splash !== 'done' && <SplashScreen fading={splash === 'fade'} />}
      {restoring ? null : !user ? (
        <LoginPage />
      ) : (
        <Layout view={view} onNavigate={setView}>
          {view === 'home' && <HomePage />}
          {view === 'dashboard' && <DashboardPage />}
          {(view === 'leads' ||
            view === 'learning' ||
            view === 'calculators' ||
            view === 'proposals') && <ModulePage view={view} />}
          {view === 'profile' && <ProfilePage />}
        </Layout>
      )}
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProviderComponent>
        <Shell />
      </AuthProviderComponent>
    </I18nProvider>
  );
}

import { useState } from 'react';
import { AuthProviderComponent, useAuth } from './auth/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import { Layout } from './components/Layout';
import type { View } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ForceChangePage } from './pages/ForceChangePage';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { ModulePage } from './pages/ModulePage';
import { ProfilePage } from './pages/ProfilePage';

function Shell() {
  const { user, restoring } = useAuth();
  const [view, setView] = useState<View>('home');

  if (restoring) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <p className="text-sm font-medium text-charcoal/60">Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (user.mustChangeCredential) return <ForceChangePage />;

  return (
    <Layout view={view} onNavigate={setView}>
      {view === 'home' && <HomePage />}
      {view === 'dashboard' && <DashboardPage />}
      {(view === 'leads' ||
        view === 'learning' ||
        view === 'calculators' ||
        view === 'proposals') && <ModulePage view={view} />}
      {view === 'profile' && <ProfilePage />}
    </Layout>
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

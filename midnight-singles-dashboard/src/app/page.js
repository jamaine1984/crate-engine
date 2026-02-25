'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ZaChat from '@/components/ZaChat';
import Topbar from '@/components/Topbar';
import OverviewPage from '@/components/pages/OverviewPage';
import MarketingPage from '@/components/pages/MarketingPage';
import SchedulerPage from '@/components/pages/SchedulerPage';
import ContentPage from '@/components/pages/ContentPage';
import ABTestingPage from '@/components/pages/ABTestingPage';
import AnalyticsPage from '@/components/pages/AnalyticsPage';
import AdminPage from '@/components/pages/AdminPage';
import LinkBioPage from '@/components/pages/LinkBioPage';
import AccountsPage from '@/components/pages/AccountsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import CrateShipOverview from '@/components/pages/CrateShipOverview';
import CrateShipMarketing from '@/components/pages/CrateShipMarketing';
import CrateShipContent from '@/components/pages/CrateShipContent';
import CrateShipAnalytics from '@/components/pages/CrateShipAnalytics';
import CrateShipWebsite from '@/components/pages/CrateShipWebsite';
import ElevenLabsPage from '@/components/pages/ElevenLabsPage';
import OtherPage from '@/components/pages/OtherPage';

const pages = {
  overview: { component: OverviewPage, title: 'Overview', subtitle: 'Midnight Singles International command center' },
  marketing: { component: MarketingPage, title: 'Marketing Agent', subtitle: 'AI scripts + images — approve before posting' },
  scheduler: { component: SchedulerPage, title: 'Schedule & Calendar', subtitle: 'Plan your week — drag approved content to time slots' },
  content: { component: ContentPage, title: 'Content Library', subtitle: 'All images, scripts & posts — reusable across campaigns' },
  'ab-testing': { component: ABTestingPage, title: 'A/B Hook Testing', subtitle: 'Generate 3 hook variations, pick the winner' },
  elevenlabs: { component: ElevenLabsPage, title: 'ElevenLabs Studio', subtitle: 'Voice, audio, music & AI influencer pipeline' },
  analytics: { component: AnalyticsPage, title: 'Analytics', subtitle: 'YouTube, TikTok & app performance' },
  admin: { component: AdminPage, title: 'Admin Panel', subtitle: 'Users, verifications, reports & moderation' },
  'link-bio': { component: LinkBioPage, title: 'Link in Bio', subtitle: 'Your landing page for YouTube & TikTok' },
  accounts: { component: AccountsPage, title: 'Accounts', subtitle: 'Connected platforms & credentials' },
  other: { component: OtherPage, title: 'Other', subtitle: 'To-do list, future ideas, downloads & Credit Genius' },
  settings: { component: SettingsPage, title: 'Settings', subtitle: 'API keys, models & configuration' },
  'cs-overview': { component: CrateShipOverview, title: 'CrateShip Overview', subtitle: 'White-label app business command center' },
  'cs-marketing': { component: CrateShipMarketing, title: 'CrateShip Marketing', subtitle: 'AI content for crateshipstudios.com' },
  'cs-content': { component: CrateShipContent, title: 'CrateShip Content', subtitle: 'All CrateShip images, scripts & posts' },
  'cs-analytics': { component: CrateShipAnalytics, title: 'CrateShip Analytics', subtitle: 'Website & social performance' },
  'cs-website': { component: CrateShipWebsite, title: 'Website Optimization', subtitle: 'Improvement checklist for crateshipstudios.com' },
};

export default function Home() {
  const [activePage, setActivePage] = useState('overview');
  const [activeApp, setActiveApp] = useState('midnight-singles');
  const currentPage = pages[activePage] || pages.overview;
  const PageComponent = currentPage.component;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} activeApp={activeApp} setActiveApp={setActiveApp} />
      <main className="main-content">
        <Topbar title={currentPage.title} subtitle={currentPage.subtitle} />
        <div className="page"><PageComponent /></div>
      </main>
      <ZaChat />
    </div>
  );
}

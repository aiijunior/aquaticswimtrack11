import React, { useState, useEffect, useCallback } from 'react';
import { View } from './types';
import type { Swimmer, SwimEvent, CompetitionInfo, User } from './types';
import { LoginView } from './components/LoginView';
import { AdminDashboard } from './components/Dashboard';
import { EventSettingsView } from './components/EventSettingsView';
import { EventsView } from './components/EventsView';
import { ParticipantsView } from './components/ParticipantsView';
import { SwimmersView } from './components/SwimmersView';
import { EventDetailView } from './components/EventDetailView';
import { LiveTimingView } from './components/LiveTimingView';
import { ResultsView } from './components/ResultsView';
import { PrintView } from './components/PrintView';
import { PublicResultsView } from './components/PublicResultsView';
import { UserManagementView } from './components/UserManagementView';
import { OnlineRegistrationView } from './components/OnlineRegistrationView';
import { logout, getCurrentUser } from './services/authService';
import { getPublicData } from './services/databaseService';
import { Button } from './components/ui/Button';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { supabase } from './services/supabaseClient';
import { Spinner } from './components/ui/Spinner';
import { ConnectionStatusIndicator } from './components/ui/ConnectionStatusIndicator';

const NavLink: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ label, isActive, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-3 w-full text-left px-3 py-2 rounded-md transition-colors ${
      isActive ? 'bg-primary text-white' : 'hover:bg-surface text-text-secondary'
    }`}
    aria-current={isActive ? 'page' : undefined}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// Icons
const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const ClipboardListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
const CogIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const MedalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
const PrintIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const AccountManagementIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>;
const HamburgerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;


const App: React.FC = () => {
  const [appStatus, setAppStatus] = useState<'loading' | 'ready'>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Centralized state
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [events, setEvents] = useState<SwimEvent[]>([]);
  const [competitionInfo, setCompetitionInfo] = useState<CompetitionInfo | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  // State for connection status
  const [internetStatus, setInternetStatus] = useState<'online' | 'offline'>('online');
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error' | 'offline' | 'reconnecting'>('checking');

  // Centralized data fetching function
  const refreshData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      // Use the new serverless function to fetch all public data securely
      const { competitionInfo: infoData, swimmers: swimmersData, events: eventsData } = await getPublicData();
      setSwimmers(swimmersData);
      setEvents(eventsData);
      setCompetitionInfo(infoData);
    } catch (error: any) {
      console.error("Failed to refresh data from server:", error.message || JSON.stringify(error));
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  // Initial data load and user check
  useEffect(() => {
    const checkUserAndLoadData = async () => {
        const user = getCurrentUser();
        setCurrentUser(user);
        
        const urlParams = new URLSearchParams(window.location.search);
        const publicView = urlParams.get('view');
        
        if (publicView === 'results') {
            setCurrentView(View.PUBLIC_RESULTS);
        } else if(publicView === 'registration') {
            setCurrentView(View.ONLINE_REGISTRATION);
        } else if (user) {
            setCurrentView(View.ADMIN_DASHBOARD);
        } else {
            setCurrentView(View.LOGIN);
        }

        // Data fetching is now handled by the real-time subscription effect on initial connection
        // await refreshData(); 
        setAppStatus('ready');
    };

    checkUserAndLoadData();
  }, []);

  // Real-time data subscription and connection management
  useEffect(() => {
      const channel = supabase.channel('schema-db-changes');

      channel.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          console.log('Realtime change received! Refreshing data.', payload);
          refreshData();
      });

      channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
              console.log('Realtime channel connected.');
              setDbStatus('connected');
              // Initial sync on successful connection to catch up on any missed changes
              refreshData();
          }
          if (status === 'CHANNEL_ERROR') {
              console.error('Realtime channel error:', err);
              setDbStatus('error');
          }
          if (status === 'TIMED_OUT') {
              console.warn('Realtime channel timed out. Attempting to reconnect.');
              setDbStatus('reconnecting');
          }
          // The Supabase client will attempt to reconnect automatically.
          // On successful reconnect, 'SUBSCRIBED' will be emitted again.
      });

      return () => {
          supabase.removeChannel(channel);
      };
  }, [refreshData]); // refreshData is stable, so this runs once
  
  // Manages browser online/offline status
  useEffect(() => {
      const handleOnline = () => {
          setInternetStatus('online');
          // When browser comes back online, Supabase client will try to reconnect automatically.
          // The realtime channel's SUBSCRIBED event will handle the final dbStatus update.
          // We set it to 'reconnecting' as an intermediate state.
          setDbStatus('reconnecting'); 
          console.log("Browser is online, attempting to reconnect to services.");
      };

      const handleOffline = () => {
          setInternetStatus('offline');
          setDbStatus('offline');
          console.log("Browser is offline.");
      };
      
      // Set initial state based on current browser status
      if (navigator.onLine) {
          setInternetStatus('online');
      } else {
          setInternetStatus('offline');
          setDbStatus('offline');
      }

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, []);

  const handleLogin = () => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if(user){
      setCurrentView(View.ADMIN_DASHBOARD);
      refreshData();
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setCurrentView(View.LOGIN);
  };

  const navigateTo = (view: View) => {
    setCurrentView(view);
    setSelectedEventId(null);
    setIsMenuOpen(false);
  }

  const handleSelectEvent = (id: string) => {
    setSelectedEventId(id);
    setCurrentView(View.RACES); // Ensure view is correct for detail
  };
  
  const handleStartTiming = (id: string) => {
    setSelectedEventId(id);
    setCurrentView(View.LIVE_TIMING);
  };

  const handleBackToEvents = () => {
      setSelectedEventId(null);
      setCurrentView(View.RACES);
  }
  
  const handleShowPublicResults = () => {
      setCurrentView(View.PUBLIC_RESULTS);
  }
  
  const handleBackToLogin = () => {
      setCurrentView(View.LOGIN);
  }

  const handleShowRegistration = () => {
    setCurrentView(View.ONLINE_REGISTRATION);
  };
  
  if (appStatus === 'loading') {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <Spinner />
        <p className="ml-4 text-text-secondary">Initializing Application...</p>
      </div>
    );
  }


  const renderContent = () => {
    const isLoading = isDataLoading;

    if (currentView === View.PUBLIC_RESULTS) {
        return <PublicResultsView 
            onAdminLogin={handleBackToLogin}
        />;
    }

    if (currentView === View.ONLINE_REGISTRATION) {
        return <OnlineRegistrationView
            competitionInfo={competitionInfo}
            onBackToLogin={handleBackToLogin}
            onRegistrationSuccess={refreshData}
        />;
    }

    if (!currentUser) {
        return <LoginView 
            onLoginSuccess={handleLogin} 
            onShowPublicResults={handleShowPublicResults} 
            onShowRegistration={handleShowRegistration}
            competitionInfo={competitionInfo}
        />;
    }

    // Logged-in admin views
    if (currentView === View.LIVE_TIMING && selectedEventId) {
       return <LiveTimingView eventId={selectedEventId} onBack={handleBackToEvents} onDataUpdate={refreshData} swimmers={swimmers} competitionInfo={competitionInfo} />;
    }
    if (currentView === View.RACES && selectedEventId) {
      return <EventDetailView eventId={selectedEventId} onBack={handleBackToEvents} onDataUpdate={refreshData} />;
    }
    switch (currentView) {
      case View.ADMIN_DASHBOARD:
        return <AdminDashboard swimmers={swimmers} events={events} competitionInfo={competitionInfo} isLoading={isLoading} />;
      case View.EVENT_SETTINGS:
        return <EventSettingsView 
            competitionInfo={competitionInfo} 
            events={events} 
            onDataUpdate={refreshData} 
        />;
      case View.RACES:
        return <EventsView events={events} isLoading={isLoading} onSelectEvent={handleSelectEvent} onStartTiming={handleStartTiming} onDataUpdate={refreshData} />;
      case View.PARTICIPANTS:
          return <ParticipantsView swimmers={swimmers} events={events} onUploadSuccess={refreshData} />;
      case View.SWIMMERS_LIST:
          return <SwimmersView swimmers={swimmers} events={events} isLoading={isLoading} onDataUpdate={refreshData} />;
      case View.RESULTS:
          return <ResultsView events={events} swimmers={swimmers} isLoading={isLoading} />;
      case View.PRINT_MENU:
          return <PrintView events={events} swimmers={swimmers} competitionInfo={competitionInfo} isLoading={isLoading} />;
      case View.USER_MANAGEMENT:
          return <UserManagementView onDataUpdate={refreshData} />;
      default:
        return <AdminDashboard swimmers={swimmers} events={events} competitionInfo={competitionInfo} isLoading={isLoading}/>;
    }
  };
  
  if (currentView === View.LOGIN || currentView === View.PUBLIC_RESULTS || currentView === View.ONLINE_REGISTRATION) {
      return renderContent();
  }


  return (
    <div className="flex h-screen bg-background text-text-primary">
      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <aside className={`w-64 bg-surface p-4 flex flex-col justify-between fixed inset-y-0 left-0 z-40 transform ${
        isMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } transition-transform duration-300 ease-in-out md:relative md:translate-x-0 no-print`}>
        <div>
            <div className="border-b-2 border-red-500 pb-4 mb-4">
                <div className="flex flex-col items-center text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-800 dark:text-blue-500" viewBox="0 0 80 60" fill="none">
                      <path d="M40.1,10.6c-4.6-1.1-8.5-3.6-10.9-7.1c-0.6-0.8-1.7-1-2.5-0.4c-0.8,0.6-1,1.7-0.4,2.5c2.8,4.1,7.3,7,12.5,8.2c1,0.2,2-0.5,2.2-1.5C41.2,11.3,40.9,10.7,40.1,10.6z" fill="currentColor"/>
                      <path d="M42.4,21.7c-2.3,0-4.5,0.7-6.4,1.9c-1.4,0.9-3.2,0.5-4.1-0.9c-0.9-1.4-0.5-3.2,0.9-4.1c2.8-1.8,6.1-2.8,9.5-2.8c1.6,0,3,1.3,3,3S44,21.7,42.4,21.7z" fill="currentColor"/>
                      <path d="M66,35.7C59.5,32,50.7,30,41,30c-2.8,0-5.6,0.3-8.3,0.9c-1.5,0.3-2.9-0.7-3.2-2.2c-0.3-1.5,0.7-2.9,2.2-3.2c3.1-0.6,6.3-1,9.3-1c10.3,0,19.7,2.1,26.7,6.2c1.3,0.8,1.8,2.4,1,3.7C69.1,38.7,67.3,38.8,66,35.7z" fill="#0ea5e9"/>
                      <path d="M78.9,47.7c-8.1-4.7-19.1-7.5-30.8-7.5c-4.9,0-9.7,0.8-14.2,2.3c-1.5,0.5-3.1-0.2-3.6-1.7c-0.5-1.5,0.2-3.1,1.7-3.6c5-1.7,10.3-2.5,15.6-2.5c12.3,0,24,2.9,32.7,8.1c1.3,0.8,1.7,2.4,0.9,3.7C80.4,48.2,79.7,48.5,78.9,47.7z" fill="#0ea5e9"/>
                      <path d="M78.9,56.7C64.9,47,46.9,42.5,28.5,42.5c-4.9,0-9.8,0.5-14.5,1.5c-1.6,0.3-3.1-0.7-3.4-2.2c-0.3-1.6,0.7-3.1,2.2-3.4c5.2-1,10.4-1.5,15.7-1.5c19,0,37.6,4.7,52.2,14.8c1.2,0.8,1.6,2.5,0.7,3.6C81.1,56.5,80.1,57.1,78.9,56.7z" fill="#0ea5e9"/>
                    </svg>
                    <div className="mt-2">
                         <div className="text-xl font-bold uppercase tracking-wide text-primary">Aquatic</div>
                         <div className="text-lg font-semibold uppercase text-primary opacity-80">Swimtrack 11</div>
                    </div>
                </div>
            </div>
            <nav className="space-y-2">
                <NavLink label="Dashboard" icon={<DashboardIcon />} isActive={currentView === View.ADMIN_DASHBOARD} onClick={() => navigateTo(View.ADMIN_DASHBOARD)}/>
                <NavLink label="Pengaturan Acara" icon={<CogIcon />} isActive={currentView === View.EVENT_SETTINGS} onClick={() => navigateTo(View.EVENT_SETTINGS)}/>
                <NavLink label="Nomor Lomba" icon={<ClipboardListIcon />} isActive={currentView === View.RACES || currentView === View.LIVE_TIMING} onClick={() => navigateTo(View.RACES)}/>
                <NavLink label="Unggah Peserta" icon={<UploadIcon />} isActive={currentView === View.PARTICIPANTS} onClick={() => navigateTo(View.PARTICIPANTS)}/>
                <NavLink label="Daftar Perenang" icon={<UsersIcon />} isActive={currentView === View.SWIMMERS_LIST} onClick={() => navigateTo(View.SWIMMERS_LIST)}/>
                <NavLink label="Hasil Lomba" icon={<MedalIcon />} isActive={currentView === View.RESULTS} onClick={() => navigateTo(View.RESULTS)}/>
                <NavLink label="Unduh Laporan" icon={<PrintIcon />} isActive={currentView === View.PRINT_MENU} onClick={() => navigateTo(View.PRINT_MENU)}/>
                {currentUser?.role === 'SUPER_ADMIN' && (
                  <NavLink label="Manajemen Akun" icon={<AccountManagementIcon />} isActive={currentView === View.USER_MANAGEMENT} onClick={() => navigateTo(View.USER_MANAGEMENT)}/>
                )}
            </nav>
        </div>
        <div className="space-y-2">
            <ConnectionStatusIndicator internetStatus={internetStatus} dbStatus={dbStatus} />
            <ThemeToggle />
            <Button onClick={handleLogout} variant="secondary" className="w-full flex items-center justify-center space-x-2">
                <LogoutIcon />
                <span>Logout</span>
            </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center p-4 border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-20 no-print">
            <button
                onClick={() => setIsMenuOpen(true)}
                className="p-2 rounded-md text-text-secondary hover:bg-background focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                aria-label="Open menu"
            >
                <HamburgerIcon />
            </button>
            <h1 className="text-lg font-bold text-primary ml-4 truncate">
                {competitionInfo?.eventName.split('\n')[0] || "Aquatic Swimtrack 11"}
            </h1>
        </header>

        <div className="p-8 flex-grow">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
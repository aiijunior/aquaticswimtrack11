import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { SwimEvent, Swimmer, CompetitionInfo, SwimRecord, BrokenRecord } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { formatEventName } from '../constants';
import { useTheme } from '../contexts/ThemeContext';
import { getRecords, getOnlineEvents, getPublicSwimmers, getPublicCompetitionInfo } from '../services/databaseService';
import { supabase } from '../services/supabaseClient';


interface PublicResultsViewProps {
  onAdminLogin: () => void;
}

// --- Custom Hook to get previous value ---
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// --- Helper Components & Functions ---
const formatTime = (ms: number) => {
    if (ms < 0) return 'DQ';
    if (ms === 0) return 'NT';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    const formattedMs = milliseconds.toString().padStart(3, '0').slice(0, 2);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${formattedMs}`;
};

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas" className="text-xl">🥇</span>;
    if (rank === 2) return <span title="Perak" className="text-xl">🥈</span>;
    if (rank === 3) return <span title="Perunggu" className="text-xl">🥉</span>;
    return null;
};

type MedalCounts = { gold: number, silver: number, bronze: number };
type Tab = 'results' | 'medals';

const TabButton: React.FC<{ label: string, isActive: boolean, onClick: () => void }> = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`px-6 py-3 font-bold text-lg rounded-t-lg transition-colors ${isActive ? 'bg-surface text-primary' : 'bg-transparent text-text-secondary hover:bg-surface/50'}`}
    >
        {label}
    </button>
);

const SummaryCard: React.FC<{ title: string, icon: React.ReactNode, children: React.ReactNode }> = ({ title, icon, children }) => (
    <Card className="flex-1">
        <div className="flex items-center space-x-3 mb-2">
            {icon}
            <h3 className="text-lg font-bold text-text-secondary">{title}</h3>
        </div>
        {children}
    </Card>
);

const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v3a3 3 0 01-3 3z" /></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;


export const PublicResultsView: React.FC<PublicResultsViewProps> = ({ onAdminLogin }) => {
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>([]);
    const [localSwimmers, setLocalSwimmers] = useState<Swimmer[]>([]);
    const [localCompetitionInfo, setLocalCompetitionInfo] = useState<CompetitionInfo | null>(null);
    const [isDataLoading, setIsDataLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<Tab>('results');
    const [medalView, setMedalView] = useState<'club' | 'individual'>('club');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [records, setRecords] = useState<SwimRecord[]>([]);

    const [sessionFilter, setSessionFilter] = useState<number | 'all'>('all');
    const [genderFilter, setGenderFilter] = useState<Gender | 'all' | 'individual'>('all');
    
    const { theme } = useTheme();
    const prevEvents = usePrevious(localEvents);

    // Real-time data subscription effect
    useEffect(() => {
        const fetchDataAndSubscribe = async () => {
            setIsDataLoading(true);
            const [eventsData, swimmersData, infoData, recordsData] = await Promise.all([
                getOnlineEvents(), getPublicSwimmers(), getPublicCompetitionInfo(), getRecords()
            ]);
            setLocalEvents(eventsData);
            setLocalSwimmers(swimmersData);
            setLocalCompetitionInfo(infoData);
            setRecords(recordsData);
            setIsDataLoading(false);
            setLastUpdated(new Date());

            const channel = supabase
                .channel('public-results')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'event_results' },
                    (payload) => {
                        console.log('Real-time update received!', payload);
                        getOnlineEvents().then(updatedEvents => {
                            setLocalEvents(updatedEvents);
                            setLastUpdated(new Date());
                        });
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        };

        let cleanup: (() => void) | undefined;
        fetchDataAndSubscribe().then(cleanupFn => {
            if (cleanupFn) cleanup = cleanupFn;
        });

        return () => {
            cleanup?.();
        };
    }, []);
    
    // Highlight effect
    useEffect(() => {
        if (prevEvents && prevEvents.length > 0 && localEvents.length > 0) {
            const prevResultsCount = new Map(prevEvents.map(e => [e.id, e.results.length]));
            for (const event of localEvents) {
                if ((prevResultsCount.get(event.id) ?? 0) < event.results.length) {
                    setHighlightedEventId(event.id);
                    document.getElementById(`event-card-${event.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => setHighlightedEventId(null), 2500);
                    break;
                }
            }
        }
    }, [localEvents, prevEvents]);


    const { clubMedals, individualMedals, brokenRecords, eventsWithResults, availableSessions } = useMemo(() => {
        const clubMedals: Record<string, MedalCounts> = {};
        const individualMedals: Record<string, MedalCounts & { swimmer: Swimmer }> = {};
        const brokenRecordsList: BrokenRecord[] = [];
        const swimmersMap = new Map(localSwimmers.map(s => [s.id, s]));
        const sessions = new Set<number>();

        localEvents.forEach(event => {
            if (event.sessionNumber && event.sessionNumber > 0) {
                sessions.add(event.sessionNumber);
            }
            if (!event.results || event.results.length === 0) return;

            const sortedValidResults = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            
            // Tally medals
            sortedValidResults.slice(0, 3).forEach((result, index) => {
                const swimmer = swimmersMap.get(result.swimmerId);
                if (swimmer) {
                    if (!clubMedals[swimmer.club]) clubMedals[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                    const rank = index + 1;
                    if (rank === 1) clubMedals[swimmer.club].gold++;
                    else if (rank === 2) clubMedals[swimmer.club].silver++;
                    else if (rank === 3) clubMedals[swimmer.club].bronze++;

                    if (event.gender !== Gender.MIXED) {
                        if (!individualMedals[swimmer.id]) individualMedals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                        if (rank === 1) individualMedals[swimmer.id].gold++;
                        else if (rank === 2) individualMedals[swimmer.id].silver++;
                        else if (rank === 3) individualMedals[swimmer.id].bronze++;
                    }
                }
            });

            // Check for broken records (only winner)
            const winner = sortedValidResults[0];
            const winnerSwimmer = winner ? swimmersMap.get(winner.swimmerId) : undefined;
            if (winner && winnerSwimmer) {
                [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                    const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                    if (record && winner.time < record.time) {
                        brokenRecordsList.push({ record, newEventName: formatEventName(event), newHolder: winnerSwimmer, newTime: winner.time });
                    }
                });
            }
        });

        const sortedClubMedals = Object.entries(clubMedals).sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
        const sortedIndividualMedals = Object.values(individualMedals).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
        const uniqueBrokenRecords = [...new Map(brokenRecordsList.map(item => [item.record.id, item])).values()];

        const filteredEvents = localEvents
            .filter(event => {
                 if (!event.results || event.results.length === 0) return false;
                 if (sessionFilter !== 'all' && event.sessionNumber !== sessionFilter) return false;
                 if (genderFilter !== 'all' && genderFilter !== 'individual') {
                     if (event.gender !== genderFilter) return false;
                 }
                 if (genderFilter === 'individual' && event.gender === Gender.MIXED) return false;
                 return !searchQuery || formatEventName(event).toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(event => ({
                ...event,
                sortedResults: [...event.results]
                    .sort((a, b) => {
                        const scoreA = a.time < 0 ? 3 : (a.time === 0 ? 2 : 1);
                        const scoreB = b.time < 0 ? 3 : (b.time === 0 ? 2 : 1);
                        if (scoreA !== scoreB) return scoreA - scoreB;
                        if (scoreA === 1) return a.time - b.time;
                        return 0;
                    })
                    .map(result => {
                        const swimmer = swimmersMap.get(result.swimmerId);
                        const rank = result.time > 0 ? [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time).findIndex(r => r.swimmerId === result.swimmerId) + 1 : 0;
                        const brokenRecordDetails = uniqueBrokenRecords.filter(br => br.newHolder.id === swimmer?.id && br.newTime === result.time && br.record.style === event.style && br.record.distance === event.distance);
                        return { ...result, rank, swimmer, brokenRecordDetails };
                    })
            }))
            .sort((a,b) => (b.sessionNumber ?? 0) - (a.sessionNumber ?? 0) || (b.heatOrder ?? 0) - (a.heatOrder ?? 0));
            
        return { clubMedals: sortedClubMedals, individualMedals: sortedIndividualMedals, brokenRecords: uniqueBrokenRecords, eventsWithResults: filteredEvents, availableSessions: Array.from(sessions).sort((a, b) => a - b) };
    }, [localEvents, localSwimmers, searchQuery, records, sessionFilter, genderFilter]);

    const topMaleAthletes = individualMedals.filter(a => a.swimmer.gender === 'Male');
    const topFemaleAthletes = individualMedals.filter(a => a.swimmer.gender === 'Female');

    const renderHeader = () => (
        <header className="relative text-center p-4 md:p-6">
            {localCompetitionInfo?.eventLogo && <img src={localCompetitionInfo.eventLogo} alt="Logo Acara" className={`mx-auto h-20 md:h-24 object-contain mb-4 ${theme === 'dark' ? 'bg-white p-2 rounded' : ''}`} />}
            <h1 className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{localCompetitionInfo?.eventName || 'Hasil Lomba'}</h1>
            <p className="text-md md:text-xl text-text-secondary mt-2">{localCompetitionInfo?.eventDate ? new Date(localCompetitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p>
        </header>
    );

    return (
        <div className="min-h-screen bg-background text-text-primary">
            <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm shadow-sm">
                {renderHeader()}
                <div className="absolute top-4 right-4"><Button variant="secondary" onClick={onAdminLogin}>Login Admin</Button></div>
            </div>
            
            <main className="container mx-auto p-2 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <SummaryCard title="Klub Teratas" icon={<TrophyIcon />}>
                        {clubMedals.length > 0 ? (
                             <p className="text-xl font-bold text-text-primary">{clubMedals[0][0]}</p>
                        ) : <p className="text-sm text-text-secondary">Menunggu hasil...</p>}
                    </SummaryCard>
                     <SummaryCard title="Atlet Putra Teratas" icon={<UserIcon />}>
                        {topMaleAthletes.length > 0 ? (
                            <p className="text-xl font-bold text-text-primary">{topMaleAthletes[0].swimmer.name}</p>
                        ) : <p className="text-sm text-text-secondary">Menunggu hasil...</p>}
                    </SummaryCard>
                     <SummaryCard title="Atlet Putri Teratas" icon={<UserIcon />}>
                         {topFemaleAthletes.length > 0 ? (
                            <p className="text-xl font-bold text-text-primary">{topFemaleAthletes[0].swimmer.name}</p>
                        ) : <p className="text-sm text-text-secondary">Menunggu hasil...</p>}
                    </SummaryCard>
                </div>

                {brokenRecords.length > 0 && (
                     <Card className="mb-6">
                        <div className="flex items-center space-x-3 mb-2"><StarIcon /><h3 className="text-lg font-bold text-text-secondary">Rekor Terpecahkan</h3></div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {brokenRecords.map(br => (
                                <div key={br.record.id} className="bg-background p-3 rounded-lg border border-red-500/30">
                                    <p className="font-semibold text-primary">{br.newEventName}</p>
                                    <p className="font-bold">{br.newHolder.name} <span className="font-mono text-lg">{formatTime(br.newTime)}</span> <span className={`record-badge ${br.record.type.toLowerCase()}`}>{br.record.type}</span></p>
                                    <p className="text-xs text-text-secondary">Pecah rekor {br.record.holderName} ({formatTime(br.record.time)})</p>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                <div className="flex justify-between items-end mb-4 flex-wrap">
                    <nav className="border-b border-border"><TabButton label="Hasil Lengkap" isActive={activeTab === 'results'} onClick={() => setActiveTab('results')} /><TabButton label="Klasemen Medali" isActive={activeTab === 'medals'} onClick={() => setActiveTab('medals')} /></nav>
                    {lastUpdated && <div className="text-right"><p className="text-sm text-text-secondary">Pembaruan Terakhir</p><p className="font-bold">{lastUpdated.toLocaleTimeString('id-ID')}</p></div>}
                </div>

                {isDataLoading && localEvents.length === 0 ? <div className="flex justify-center items-center py-20"><Spinner /></div>
                : activeTab === 'results' ? (
                     <div className="space-y-4">
                        <Card>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Input label="Cari Nomor Lomba" id="results-search" type="text" placeholder="Cth: 50m Gaya Bebas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                                <Select label="Filter Sesi" id="session-filter" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                                    <option value="all">Semua Sesi</option>
                                    {availableSessions.map(s => <option key={s} value={s}>Sesi {s}</option>)}
                                </Select>
                                <Select label="Filter Gender" id="gender-filter" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as any)}>
                                    <option value="all">Semua</option>
                                    <option value={Gender.MALE}>Putra</option>
                                    <option value={Gender.FEMALE}>Putri</option>
                                    <option value={Gender.MIXED}>Campuran</option>
                                    <option value="individual">Hanya Perorangan</option>
                                </Select>
                            </div>
                        </Card>
                        {eventsWithResults.length > 0 ? eventsWithResults.map(event => (
                            <div key={event.id} id={`event-card-${event.id}`} className={highlightedEventId === event.id ? 'flash-animation' : ''}>
                                <Card>
                                    <h3 className="text-xl md:text-2xl font-bold text-primary">{formatEventName(event)}</h3>
                                    <div className="mt-2 overflow-x-auto"><table className="w-full text-left">
                                        <thead><tr className="border-b-2 border-border"><th className="p-2 text-center w-12 text-sm md:text-base">#</th><th className="p-2 text-sm md:text-base">Nama</th><th className="p-2 hidden md:table-cell text-sm md:text-base">Klub</th><th className="p-2 text-right text-sm md:text-base">Waktu</th></tr></thead>
                                        <tbody>{event.sortedResults.map(result => (<tr key={result.swimmerId} className={`border-b border-border last:border-b-0 text-base md:text-lg ${result.time < 0 ? 'bg-red-500/10' : ''}`}>
                                            <td className="p-2 text-center font-bold">{result.rank > 0 ? result.rank : '-'}{result.rank > 0 && <Medal rank={result.rank} />}</td>
                                            <td className="p-2 font-semibold">{result.swimmer?.name || 'N/A'}<p className="text-sm text-text-secondary md:hidden">{result.swimmer?.club || 'N/A'}</p></td>
                                            <td className="p-2 text-text-secondary hidden md:table-cell">{result.swimmer?.club || 'N/A'}</td>
                                            <td className="p-2 text-right font-mono tracking-tighter">{formatTime(result.time)}{result.brokenRecordDetails?.map(br => (<span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>{br.record.type}</span>))}</td>
                                        </tr>))}</tbody>
                                    </table></div>
                                </Card>
                            </div>
                        )) : ( <Card><p className="text-text-secondary text-center py-10 text-lg">{searchQuery ? `Tidak ada hasil yang cocok dengan "${searchQuery}".` : 'Menunggu hasil lomba pertama...'}</p></Card> )}
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-center mb-4"><div className="inline-flex rounded-md shadow-sm bg-surface p-1">
                            <button onClick={() => setMedalView('club')} className={`px-4 py-2 text-sm font-medium rounded-l-md ${medalView === 'club' ? 'bg-primary text-white' : 'hover:bg-background'}`}>Klub</button>
                            <button onClick={() => setMedalView('individual')} className={`px-4 py-2 text-sm font-medium rounded-r-md ${medalView === 'individual' ? 'bg-primary text-white' : 'hover:bg-background'}`}>Perorangan</button>
                        </div></div>
                        {medalView === 'club' && <Card><h2 className="text-2xl font-bold mb-4 text-primary">Rekapitulasi Medali Klub</h2>{clubMedals.length > 0 ? (<div className="overflow-x-auto"><table className="w-full text-left">
                            <thead><tr className="border-b-2 border-border"><th className="p-3 text-center w-12 text-base md:text-lg">#</th><th className="p-3 text-base md:text-lg">Klub</th><th className="p-3 text-center text-2xl">🥇</th><th className="p-3 text-center text-2xl">🥈</th><th className="p-3 text-center text-2xl">🥉</th><th className="p-3 text-center font-bold text-base md:text-lg">Total</th></tr></thead>
                            <tbody>{clubMedals.map(([club, medals], index) => (<tr key={club} className="border-b border-border last:border-b-0 text-base md:text-lg"><td className="p-3 text-center font-bold">{index + 1}</td><td className="p-3 font-semibold">{club}</td><td className="p-3 text-center font-bold">{medals.gold}</td><td className="p-3 text-center font-bold">{medals.silver}</td><td className="p-3 text-center font-bold">{medals.bronze}</td><td className="p-3 text-center font-bold">{medals.gold + medals.silver + medals.bronze}</td></tr>))}</tbody>
                        </table></div>) : <p className="text-text-secondary text-center py-10 text-lg">Belum ada medali yang diraih.</p>}</Card>}
                        {medalView === 'individual' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card><h2 className="text-2xl font-bold mb-4 text-primary">Klasemen Putra</h2>{topMaleAthletes.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left">
                                <thead><tr className="border-b-2 border-border"><th className="p-2 text-center w-12">#</th><th className="p-2">Nama</th><th className="p-2 text-center">🥇</th><th className="p-2 text-center">🥈</th><th className="p-2 text-center">🥉</th></tr></thead>
                                <tbody>{topMaleAthletes.map((a, i) => (<tr key={a.swimmer.id} className="border-b border-border last:border-b-0"><td className="p-2 text-center font-bold">{i+1}</td><td className="p-2 font-semibold">{a.swimmer.name}<span className="block text-xs text-text-secondary">{a.swimmer.club}</span></td><td className="p-2 text-center font-bold">{a.gold}</td><td className="p-2 text-center font-bold">{a.silver}</td><td className="p-2 text-center font-bold">{a.bronze}</td></tr>))}</tbody>
                            </table></div> : <p className="text-text-secondary text-center py-6">Belum ada medali diraih.</p>}</Card>
                            <Card><h2 className="text-2xl font-bold mb-4 text-primary">Klasemen Putri</h2>{topFemaleAthletes.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left">
                                <thead><tr className="border-b-2 border-border"><th className="p-2 text-center w-12">#</th><th className="p-2">Nama</th><th className="p-2 text-center">🥇</th><th className="p-2 text-center">🥈</th><th className="p-2 text-center">🥉</th></tr></thead>
                                <tbody>{topFemaleAthletes.map((a, i) => (<tr key={a.swimmer.id} className="border-b border-border last:border-b-0"><td className="p-2 text-center font-bold">{i+1}</td><td className="p-2 font-semibold">{a.swimmer.name}<span className="block text-xs text-text-secondary">{a.swimmer.club}</span></td><td className="p-2 text-center font-bold">{a.gold}</td><td className="p-2 text-center font-bold">{a.silver}</td><td className="p-2 text-center font-bold">{a.bronze}</td></tr>))}</tbody>
                            </table></div> : <p className="text-text-secondary text-center py-6">Belum ada medali diraih.</p>}</Card>
                        </div>}
                    </div>
                )}
            </main>
            <footer className="text-center p-4 mt-8 border-t border-border">
                <p className="text-xs text-text-secondary">&copy; {new Date().getFullYear()} {localCompetitionInfo?.eventName}. Didukung oleh Aquatic Swimtrack 11.</p>
            </footer>
        </div>
    );
};

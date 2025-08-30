import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { SwimEvent, Swimmer, CompetitionInfo, SwimRecord, BrokenRecord } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { formatEventName } from '../constants';
import { useTheme } from '../contexts/ThemeContext';
import { getRecords } from '../services/databaseService';

interface PublicResultsViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
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
    if (rank === 1) return <span title="Emas" className="text-2xl">🥇</span>;
    if (rank === 2) return <span title="Perak" className="text-2xl">🥈</span>;
    if (rank === 3) return <span title="Perunggu" className="text-2xl">🥉</span>;
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

export const PublicResultsView: React.FC<PublicResultsViewProps> = ({ events, swimmers, competitionInfo, isLoading, onAdminLogin }) => {
    const [activeTab, setActiveTab] = useState<Tab>('results');
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    
    const { theme } = useTheme();
    const prevEvents = usePrevious(events);
    
    useEffect(() => {
        const fetchRecords = async () => {
            setRecords(await getRecords());
        };
        fetchRecords();
    }, []);

    // Effect to detect changes and set highlight
    useEffect(() => {
        setLastUpdated(new Date());
        if (prevEvents && prevEvents.length > 0 && events.length > 0) {
            const prevResultsCount = new Map(prevEvents.map(e => [e.id, e.results.length]));
            for (const event of events) {
                if ((prevResultsCount.get(event.id) ?? 0) < event.results.length) {
                    setHighlightedEventId(event.id);
                    setTimeout(() => setHighlightedEventId(null), 2000); // Highlight lasts 2 seconds
                    break;
                }
            }
        }
    }, [events, prevEvents]);


    const { clubMedals, eventsWithResults } = useMemo(() => {
        const clubMedals: Record<string, MedalCounts> = {};
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

        // Calculate broken records first
        const brokenRecordsList: (BrokenRecord & { record: SwimRecord })[] = [];
        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time)[0];
                const winnerSwimmer = winner ? swimmersMap.get(winner.swimmerId) : undefined;
                if (winner && winnerSwimmer) {
                    const checkRecord = (type: RecordType) => {
                        const record = records.find(r => 
                            r.type === type &&
                            r.gender === event.gender &&
                            r.distance === event.distance &&
                            r.style === event.style &&
                            (r.relayLegs ?? null) === (event.relayLegs ?? null) &&
                            (r.category ?? null) === (event.category ?? null)
                        );
                        if (record && winner.time < record.time) {
                            brokenRecordsList.push({
                               record: record,
                               newEventName: formatEventName(event),
                               newHolder: winnerSwimmer,
                               newTime: winner.time,
                           });
                        }
                    };
                    checkRecord(RecordType.PORPROV);
                    checkRecord(RecordType.NASIONAL);
                }
            }
        });

        // Calculate medals first, from ALL events with results.
        events.forEach(event => {
            if (event.results && event.results.length > 0) {
                [...event.results]
                    .filter(r => r.time > 0) // Only process valid times for medals
                    .sort((a, b) => a.time - b.time)
                    .slice(0, 3)
                    .forEach((result, index) => {
                        const rank = index + 1;
                        const swimmer = swimmersMap.get(result.swimmerId);
                        if (swimmer) {
                            if (!clubMedals[swimmer.club]) clubMedals[swimmer.club] = { gold: 0, silver: 0, bronze: 0 };
                            if (rank === 1) clubMedals[swimmer.club].gold++;
                            else if (rank === 2) clubMedals[swimmer.club].silver++;
                            else if (rank === 3) clubMedals[swimmer.club].bronze++;
                        }
                    });
            }
        });

        const processedEvents = events
            .filter(event => {
                 if (!event.results || event.results.length === 0) return false;
                 return !searchQuery || formatEventName(event).toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(event => {
                const sortedResults = [...event.results]
                    .sort((a, b) => {
                        const scoreA = a.time < 0 ? 3 : (a.time === 0 ? 2 : 1);
                        const scoreB = b.time < 0 ? 3 : (b.time === 0 ? 2 : 1);
                        if (scoreA !== scoreB) return scoreA - scoreB;
                        if (scoreA === 1) return a.time - b.time;
                        return 0;
                    })
                    .map(result => {
                        const swimmer = swimmersMap.get(result.swimmerId);
                        let rank = 0;
                        if (result.time > 0) {
                            const sortedValidTimes = event.results.filter(r => r.time > 0).sort((a, b) => a.time - b.time);
                            rank = sortedValidTimes.findIndex(r => r.swimmerId === result.swimmerId) + 1;
                        }
                        
                        const brokenRecordDetails = brokenRecordsList.filter(br => 
                            br.newHolder.id === swimmer?.id && 
                            br.newTime === result.time &&
                            br.record.style === event.style &&
                            br.record.distance === event.distance &&
                            br.record.gender === event.gender &&
                            (br.record.category ?? null) === (event.category ?? null)
                        );
                        
                        return { ...result, rank, swimmer, brokenRecordDetails };
                    });
                return { ...event, sortedResults };
            })
            .sort((a,b) => (b.sessionNumber ?? 0) - (a.sessionNumber ?? 0) || (b.heatOrder ?? 0) - (a.heatOrder ?? 0)); // Show newest sessions first

        const sortedClubMedals = Object.entries(clubMedals)
            .sort(([, a], [, b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
            
        return { clubMedals: sortedClubMedals, eventsWithResults: processedEvents };
    }, [events, swimmers, searchQuery, records]);

    const renderHeader = () => (
        <header className="relative text-center p-4 md:p-6">
            {competitionInfo?.eventLogo && (
                <img 
                    src={competitionInfo.eventLogo} 
                    alt="Logo Acara" 
                    className={`mx-auto h-20 md:h-24 object-contain mb-4 ${theme === 'dark' ? 'bg-white p-2 rounded' : ''}`}
                />
            )}
            <h1 className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName || 'Hasil Lomba'}</h1>
            <p className="text-md md:text-xl text-text-secondary mt-2">{competitionInfo?.eventDate ? new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p>
        </header>
    );

    return (
        <div className="min-h-screen bg-background text-text-primary">
            <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm shadow-sm">
                {renderHeader()}
                <div className="absolute top-4 right-4">
                    <Button variant="secondary" onClick={onAdminLogin}>
                        Login Admin
                    </Button>
                </div>
            </div>
            
            <main className="container mx-auto p-2 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <nav className="border-b border-border">
                        <TabButton label="Hasil Lengkap" isActive={activeTab === 'results'} onClick={() => setActiveTab('results')} />
                        <TabButton label="Klasemen Medali" isActive={activeTab === 'medals'} onClick={() => setActiveTab('medals')} />
                    </nav>
                    <div className="text-right">
                        <p className="text-sm text-text-secondary">Pembaruan Terakhir</p>
                        <p className="font-bold">{lastUpdated.toLocaleTimeString('id-ID')}</p>
                    </div>
                </div>

                {isLoading && events.length === 0 ? (
                    <div className="flex justify-center items-center py-20"><Spinner /></div>
                ) : activeTab === 'results' ? (
                     <div className="space-y-4">
                        <div className="p-4 bg-surface rounded-lg">
                           <Input
                                label="Cari Nomor Lomba"
                                id="results-search"
                                type="text"
                                placeholder="Ketik untuk mencari, cth: 50m Gaya Bebas Putra..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                           />
                        </div>
                        {eventsWithResults.length > 0 ? eventsWithResults.map(event => (
                            <div key={event.id} className={highlightedEventId === event.id ? 'flash-animation' : ''}>
                                <Card>
                                    <h3 className="text-xl md:text-2xl font-bold text-primary">{formatEventName(event)}</h3>
                                    <div className="mt-2 overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b-2 border-border">
                                                    <th className="p-2 text-center w-12 text-sm md:text-base">Peringkat</th>
                                                    <th className="p-2 text-sm md:text-base">Nama</th>
                                                    <th className="p-2 hidden md:table-cell text-sm md:text-base">Klub</th>
                                                    <th className="p-2 text-right text-sm md:text-base">Waktu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {event.sortedResults.map(result => (
                                                    <tr key={result.swimmerId} className={`border-b border-border last:border-b-0 text-base md:text-lg ${result.time < 0 ? 'bg-red-500/10' : ''}`}>
                                                        <td className="p-2 text-center font-bold">
                                                            {result.rank > 0 ? result.rank : '-'}
                                                            {result.rank > 0 && <Medal rank={result.rank} />}
                                                        </td>
                                                        <td className="p-2 font-semibold">
                                                            {result.swimmer?.name || 'N/A'}
                                                            <p className="text-sm text-text-secondary md:hidden">{result.swimmer?.club || 'N/A'}</p>
                                                        </td>
                                                        <td className="p-2 text-text-secondary hidden md:table-cell">{result.swimmer?.club || 'N/A'}</td>
                                                        <td className="p-2 text-right font-mono tracking-tighter">
                                                            {formatTime(result.time)}
                                                             {result.brokenRecordDetails?.map(br => (
                                                                <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                                    {br.record.type}
                                                                </span>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        )) : ( 
                          <Card>
                            <p className="text-text-secondary text-center py-10 text-lg">
                                {searchQuery ? `Tidak ada hasil yang cocok dengan "${searchQuery}".` : 'Menunggu hasil lomba pertama...'}
                            </p>
                          </Card> 
                        )}
                    </div>
                ) : ( // Medal Standings
                    <Card>
                        <h2 className="text-2xl font-bold mb-4 text-primary">Rekapitulasi Medali Klub</h2>
                         {clubMedals.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b-2 border-border">
                                            <th className="p-3 text-center w-12 text-base md:text-lg">#</th>
                                            <th className="p-3 text-base md:text-lg">Klub</th>
                                            <th className="p-3 text-center text-2xl">🥇</th>
                                            <th className="p-3 text-center text-2xl">🥈</th>
                                            <th className="p-3 text-center text-2xl">🥉</th>
                                            <th className="p-3 text-center font-bold text-base md:text-lg">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clubMedals.map(([club, medals], index) => (
                                            <tr key={club} className="border-b border-border last:border-b-0 text-base md:text-lg">
                                                <td className="p-3 text-center font-bold">{index + 1}</td>
                                                <td className="p-3 font-semibold">{club}</td>
                                                <td className="p-3 text-center font-bold">{medals.gold}</td>
                                                <td className="p-3 text-center font-bold">{medals.silver}</td>
                                                <td className="p-3 text-center font-bold">{medals.bronze}</td>
                                                <td className="p-3 text-center font-bold">{medals.gold + medals.silver + medals.bronze}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="text-text-secondary text-center py-10 text-lg">Belum ada medali yang diraih.</p>}
                    </Card>
                )}
            </main>
            <footer className="text-center p-4 mt-8 border-t border-border">
                <Button variant="primary" onClick={onAdminLogin} className="px-6 py-3 text-lg">
                    &larr; Kembali ke Halaman Utama
                </Button>
            </footer>
        </div>
    );
};

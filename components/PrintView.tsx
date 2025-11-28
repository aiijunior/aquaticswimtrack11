import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender } from '../constants';
import { getRecords } from '../services/databaseService';

declare var XLSX: any;

// --- PROPS ---
interface PrintViewProps {
  events: SwimEvent[];
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
  isLoading: boolean;
}

// --- HELPER FUNCTIONS ---
const romanize = (num: number): string => {
    if (isNaN(num) || num <= 0) return '';
    const lookup: { [key: string]: number } = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '';
    for (let i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
};

const formatTime = (ms: number) => {
    if (ms === 0) return 'NT'; // Use NT instead of 99:99.99 for clarity in reports
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
};

const estimateHeatDuration = (distance: number): number => {
    if (distance <= 50) return 2 * 60 * 1000; // 2 menit
    if (distance <= 100) return 3 * 60 * 1000; // 3 menit
    if (distance <= 200) return 5 * 60 * 1000; // 5 menit
    if (distance <= 400) return 7 * 60 * 1000; // 7 menit
    if (distance <= 800) return 11 * 60 * 1000; // 11 menit (dari rentang 11-12)
    if (distance <= 1500) return 24 * 60 * 1000; // 24 menit (dari rentang 23-25)
    return 5 * 60 * 1000; // Default
};


// --- PRINTABLE COMPONENTS ---

const ReportHeader: React.FC<{ info: CompetitionInfo, title: string }> = ({ info, title }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-20 object-contain mx-auto mb-4" />}
        
        <div className="mb-4">
            {/* FIX: Add explicit types to callback parameters to resolve type inference issue. */}
            {info.eventName.split('\n').map((line: string, index: number) => {
                if (index === 0) {
                    return <h1 key={index} className="font-bold tracking-tight" style={{ fontSize: '22px' }}>{line}</h1>;
                } else if (index === 1) {
                    return <p key={index} className="font-semibold tracking-tight" style={{ fontSize: '12px' }}>{line}</p>;
                } else { // index 2 and beyond
                    return <p key={index} className="font-semibold tracking-tight" style={{ fontSize: '11px' }}>{line}</p>;
                }
            })}
            <p className="text-lg text-gray-600 mt-1">{info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <h2 className="text-2xl font-semibold tracking-wide my-4 text-center">{title}</h2>
    </header>
);

const ReportFooter: React.FC<{ info: CompetitionInfo }> = ({ info }) => {
    if (!info.sponsorLogo) return null;
    return (
        <footer className="pt-8 mt-12 border-t-2 border-gray-300 text-center">
             <img src={info.sponsorLogo} alt="Sponsor Logo" className="h-20 object-contain mx-auto" />
        </footer>
    );
}

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) {
        return <p className="uppercase text-xs font-sans">{typeText} | TIDAK ADA REKOR TERCATAT</p>;
    }
    const parts = [
        typeText,
        formatTime(record.time),
        record.holderName,
        record.yearSet,
        record.locationSet
    ].filter(p => p != null && String(p).trim() !== '');

    return (
        <p className="uppercase text-xs font-sans">
            {parts.join(' | ')}
        </p>
    );
};

// Define a type for events that have the global numbering attached
type ScheduledEvent = SwimEvent & { globalEventNumber: number };

const ScheduleOfEvents: React.FC<{ data: { date: string, sessions: [string, ScheduledEvent[]][] }[] }> = ({ data }) => {
    if (data.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;
    }

    return (
        <main className="space-y-6">
            {data.map(({ date, sessions }) => (
                <div key={date}>
                    <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">{date}</h3>
                    {sessions.map(([sessionName, sessionEvents]) => (
                        <div key={sessionName} className="mb-4">
                            <h4 className="text-xl font-semibold mb-2">{sessionName}</h4>
                            <table className="w-full text-left text-sm">
                                <colgroup>
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '85%' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>No. Acara</th>
                                        <th>Nomor Lomba</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionEvents.map(event => (
                                        <tr key={event.id}>
                                            <td className="font-bold">{event.globalEventNumber}</td>
                                            <td>{formatEventName(event)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            ))}
        </main>
    );
};

// --- Interfaces for ProgramBook with timing ---
interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}
interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
}

const ProgramBook: React.FC<{ data: Record<string, TimedEvent[]>, info: CompetitionInfo, records: SwimRecord[] }> = ({ data, info, records }) => {
    if (!data || Object.keys(data).length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;

    return (
        <main className="space-y-8">
            {Object.entries(data).map(([sessionName, sessionEvents]) => {
                const firstEvent = sessionEvents[0];
                const sessionDT = firstEvent?.sessionDateTime ? new Date(firstEvent.sessionDateTime) : null;
                return (
                    <div key={sessionName}>
                        <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">
                            {sessionName}
                            {sessionDT && (
                                <span className="block text-lg font-normal">
                                    {sessionDT.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    {' - '}
                                    {sessionDT.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                            )}
                        </h3>
                        {sessionEvents.map((event: TimedEvent) => {
                            const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            const isRelay = event.relayLegs && event.relayLegs > 1;
                            const hasHeats = (event.heatsWithTimes || []).length > 0;
                            
                            return (
                                <section key={event.id} className="mb-6 print-event-section">
                                    <h4 className="text-lg font-semibold bg-gray-100 p-2 rounded-t-md border-b-2 border-gray-400">
                                       {`Nomor Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                                       {event.estimatedEventStartTime && (
                                            <span className="font-normal text-sm block">
                                                Perkiraan waktu: {new Date(event.estimatedEventStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </h4>
                                    <div className="text-xs text-gray-600 my-2 px-2 border-l-2 border-gray-300 space-y-1">
                                        <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                                        <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                                    </div>
                                    
                                    {hasHeats ? (event.heatsWithTimes || []).map((heat: TimedHeat) => (
                                        <div key={heat.heatNumber} className="mt-3">
                                            <h5 className="font-bold text-center mb-1">
                                                Seri {heat.heatNumber} dari {event.heatsWithTimes?.length || 0}
                                                {heat.estimatedHeatStartTime && (
                                                    <span className="font-normal text-gray-600 text-sm ml-4">
                                                        (Perkiraan waktu: {new Date(heat.estimatedHeatStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
                                                    </span>
                                                )}
                                            </h5>
                                            <table className="w-full text-left text-sm">
                                                <colgroup>
                                                    <col style={{ width: '8%' }} />
                                                    <col style={{ width: '30%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '10%' }} />
                                                    <col style={{ width: '27%' }} />
                                                    <col style={{ width: '15%' }} />
                                                </colgroup>
                                                <thead><tr><th>Lintasan</th><th>Nama Atlet</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu Unggulan</th></tr></thead>
                                                <tbody>
                                                    {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                                        const assignment = heat.assignments.find(a => a.lane === lane);
                                                        const displayName = assignment ? (isRelay ? assignment.entry.swimmer.club : assignment.entry.swimmer.name) : '-';
                                                        const displayClub = assignment ? assignment.entry.swimmer.club : '-';
                                                        return (
                                                            <tr key={lane}>
                                                                <td className="w-12 text-center font-bold">{lane}</td>
                                                                <td>{displayName}</td>
                                                                <td>{assignment && !isRelay ? (assignment.entry.swimmer.ageGroup || '-') : '-'}</td>
                                                                <td>{assignment && !isRelay ? assignment.entry.swimmer.birthYear : '-'}</td>
                                                                <td>{displayClub}</td>
                                                                <td className="text-right font-mono">{assignment ? formatTime(assignment.entry.seedTime) : '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )) : (
                                        <p className="text-center text-sm text-text-secondary py-4 italic border border-dashed border-gray-300 rounded mt-2">
                                            Belum ada peserta terdaftar untuk nomor lomba ini.
                                        </p>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                );
            })}
        </main>
    );
};

const EventResults: React.FC<{ data: any[], records: SwimRecord[] }> = ({ data, records }) => {
    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada hasil lomba yang tercatat untuk nomor yang dipilih.</p>;

    return (
        <main>
            {data.map(event => {
                const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                
                return (
                    <section key={event.id} className="print-event-section">
                        <h3 className="text-xl font-semibold bg-gray-100 p-2 rounded-t-md border-b-2 border-gray-400">
                            {`Hasil Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                        </h3>
                         <div className="text-xs text-gray-600 mt-2 mb-2 px-2 border-l-2 border-gray-300 space-y-1">
                            <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                            <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                        </div>
                        {event.sortedResults.length > 0 ? (
                            <table className="w-full text-left text-sm mt-2">
                                <colgroup>
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '25%' }} />
                                    <col style={{ width: '13%' }} />
                                    <col style={{ width: '8%' }} />
                                </colgroup>
                                <thead><tr><th className="text-center">Peringkat</th><th>Nama Atlet</th><th>KU</th><th>Tahun</th><th>Nama Tim</th><th className="text-right">Waktu</th><th className="text-center">Medali</th></tr></thead>
                                <tbody>
                                    {event.sortedResults.map((res: any) => {
                                        let rankClass = '';
                                        if (res.rank === 1) rankClass = 'print-gold-medal';
                                        else if (res.rank === 2) rankClass = 'print-silver-medal';
                                        else if (res.rank === 3) rankClass = 'print-bronze-medal';

                                        return (
                                            <tr key={res.swimmerId} className={rankClass}>
                                                <td className="text-center font-bold">{res.rank > 0 ? res.rank : '-'}</td>
                                                <td>{res.swimmer?.name || 'N/A'}</td>
                                                <td>{event.relayLegs ? '-' : res.swimmer?.ageGroup || '-'}</td>
                                                <td>{event.relayLegs ? '-' : res.swimmer?.birthYear || ''}</td>
                                                <td>{res.swimmer?.club || 'N/A'}</td>
                                                <td className="text-right font-mono">
                                                    {formatTime(res.time)}
                                                    {res.recordsBroken.map((br: any) => (
                                                        <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                            {br.record.type}
                                                        </span>
                                                    ))}
                                                </td>
                                                <td className="text-center"><Medal rank={res.rank} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-sm text-text-secondary italic mt-2 border p-4 rounded text-center bg-gray-50">
                                Belum ada hasil lomba yang tercatat atau belum ada peserta.
                            </p>
                        )}
                    </section>
                );
            })}
        </main>
    );
};

const RekapJuaraPerKategori: React.FC<{ data: [string, any[]][] }> = ({ data }) => {
    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Tidak ada juara untuk ditampilkan.</p>;

    return (
        <main>
            {data.map(([categoryKey, categoryEvents]) => (
                <section key={categoryKey} className="mb-6">
                    <h3 className="text-2xl font-bold my-4 bg-gray-200 text-black p-2 rounded-md text-center">{categoryKey}</h3>
                    <div className="space-y-4">
                        {categoryEvents.sort((a,b) => formatEventName(a).localeCompare(formatEventName(b))).map(event => (
                            <div key={event.id}>
                                <h4 className="text-lg font-semibold">{formatEventName(event)}</h4>
                                <table className="w-full text-left text-sm mt-1">
                                    <colgroup>
                                        <col style={{ width: '15%' }} />
                                        <col style={{ width: '35%' }} />
                                        <col style={{ width: '35%' }} />
                                        <col style={{ width: '15%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th className="w-16">Peringkat</th>
                                            <th>Nama Atlet</th>
                                            <th>Nama Tim</th>
                                            <th className="text-right">Waktu</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {event.winners.map((winner: any) => (
                                            <tr key={winner.swimmer?.id}>
                                                <td className="font-bold text-center">{winner.rank} <Medal rank={winner.rank} /></td>
                                                <td>{winner.swimmer?.name || 'N/A'}</td>
                                                <td>{winner.swimmer?.club || 'N/A'}</td>
                                                <td className="text-right font-mono">{formatTime(winner.time)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </main>
    )
};

const ClubMedalStandings: React.FC<{ data: [string, { gold: number, silver: number, bronze: number }][] }> = ({ data }) => {
    const grandTotal = useMemo(() => {
        return data.reduce((acc, [, medals]) => {
            acc.gold += medals.gold;
            acc.silver += medals.silver;
            acc.bronze += medals.bronze;
            return acc;
        }, { gold: 0, silver: 0, bronze: 0 });
    }, [data]);

    if (data.length === 0) return <p className="text-center text-text-secondary py-10">Belum ada medali yang diraih.</p>;

    return (
        <main className="print-event-section">
            <table className="w-full text-left">
                <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '45%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                </colgroup>
                <thead><tr><th className="text-center">#</th><th>Nama Tim</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th><th className="text-center">Total</th></tr></thead>
                <tbody>
                    {data.map(([club, medals], i) => (
                        <tr key={club}>
                            <td className="text-center font-bold">{i + 1}</td>
                            <td className="font-semibold">{club}</td>
                            <td className="text-center">{medals.gold}</td>
                            <td className="text-center">{medals.silver}</td>
                            <td className="text-center">{medals.bronze}</td>
                            <td className="text-center font-bold">{medals.gold + medals.silver + medals.bronze}</td>
                        </tr>
                    ))}
                    <tr className="border-t-2 border-black font-bold bg-gray-200">
                        <td colSpan={2} className="text-right pr-4">TOTAL</td>
                        <td className="text-center">{grandTotal.gold}</td>
                        <td className="text-center">{grandTotal.silver}</td>
                        <td className="text-center">{grandTotal.bronze}</td>
                        <td className="text-center">{grandTotal.gold + grandTotal.silver + grandTotal.bronze}</td>
                    </tr>
                </tbody>
            </table>
        </main>
    );
};

// --- NEW COMPONENT: IndividualMedalStandings ---
const IndividualMedalStandings: React.FC<{ data: { male: any[], female: any[] } }> = ({ data }) => {
    const renderTable = (standings: any[], title: string) => (
        <div className="print-event-section">
            <h3 className="text-2xl font-bold mb-4 text-center">{title}</h3>
            {standings.length > 0 ? (
                <table className="w-full text-left">
                    <colgroup><col style={{width: '8%'}} /><col style={{width: '32%'}} /><col style={{width: '30%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /><col style={{width: '10%'}} /></colgroup>
                    <thead><tr><th className="text-center">#</th><th>Nama Atlet</th><th>Nama Tim</th><th className="text-center">🥇</th><th className="text-center">🥈</th><th className="text-center">🥉</th></tr></thead>
                    <tbody>
                        {standings.map((entry, i) => (
                            <tr key={entry.swimmer.id}>
                                <td className="text-center font-bold">{i + 1}</td>
                                <td className="font-semibold">{entry.swimmer.name}</td>
                                <td>{entry.swimmer.club}</td>
                                <td className="text-center">{entry.gold}</td>
                                <td className="text-center">{entry.silver}</td>
                                <td className="text-center">{entry.bronze}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="text-center text-text-secondary py-6">Tidak ada medali yang diraih.</p>}
        </div>
    );

    return (
        <main className="space-y-12">
            {renderTable(data.male, "Klasemen Perorangan Putra")}
            {renderTable(data.female, "Klasemen Perorangan Putri")}
            <p className="text-center text-xs text-gray-500 pt-4">Klasemen perorangan tidak termasuk medali dari nomor lomba campuran.</p>
        </main>
    );
};

// --- NEW COMPONENT: BrokenRecordsReport ---
const BrokenRecordsReport: React.FC<{ data: BrokenRecord[] }> = ({ data }) => {
    if (data.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada rekor yang terpecahkan dalam kompetisi ini.</p>;
    }

    return (
        <main className="space-y-6">
            {data.map(({ record, newEventName, newHolder, newTime }, i) => (
                <section key={i} className="print-event-section bg-gray-50 p-4 rounded-lg border">
                    <h3 className="text-lg font-bold text-primary">{newEventName}</h3>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-green-100 p-3 rounded">
                            <h4 className="font-bold text-green-800">REKOR BARU</h4>
                            <p className="text-2xl font-semibold">{newHolder.name}</p>
                            <p className="text-md text-gray-700">{newHolder.club}</p>
                            <p className="text-3xl font-mono mt-2">{formatTime(newTime)}</p>
                        </div>
                        <div className="bg-red-100 p-3 rounded">
                            <h4 className="font-bold text-red-800">REKOR LAMA</h4>
                            <p className="text-lg font-semibold">{record.holderName}</p>
                            <p className="text-sm text-gray-600">{record.locationSet ? `${record.yearSet} - ${record.locationSet}` : record.yearSet}</p>
                            <p className="text-2xl font-mono mt-2 line-through">{formatTime(record.time)}</p>
                        </div>
                    </div>
                </section>
            ))}
        </main>
    );
};


export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [activeReport, setActiveReport] = useState<'schedule' | 'program' | 'results' | 'winners' | 'medals' | 'individualMedals' | 'brokenRecords'>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);
    
    // Session selection state
    const [selectedSession, setSelectedSession] = useState<number>(0); // 0 means "All Sessions"
    // State for the new specific-event filter (now multi-select)
    const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

     useEffect(() => {
        // When the user switches to a report that doesn't support event-specific filtering,
        // reset the filter to avoid confusion and ensure correct data is shown next time.
        if (!['program', 'results'].includes(activeReport)) {
            setSelectedEventIds([]);
        }
    }, [activeReport]);

    useEffect(() => {
        const fetchRecords = async () => {
            const recordsData = await getRecords();
            setRecords(recordsData);
        };
        fetchRecords();
    }, []);

    const handlePrint = () => {
        window.print();
    };

    // Get unique session numbers for the dropdown
    const sessionOptions = useMemo(() => {
        const sessions = new Set<number>();
        events.forEach(e => {
            if (e.sessionNumber && e.sessionNumber > 0) {
                sessions.add(e.sessionNumber);
            }
        });
        return Array.from(sessions).sort((a, b) => a - b);
    }, [events]);

    // --- GLOBAL NUMBERING & DATA PROCESSING ---
    const eventsWithGlobalNumbers = useMemo<ScheduledEvent[]>(() => {
        let globalCounter = 1;
        const allScheduled = [...events]
            .filter(e => e.sessionNumber && e.sessionNumber > 0)
            .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || (a.heatOrder ?? 0) - (b.heatOrder ?? 0));
        
        return allScheduled.map(e => ({ ...e, globalEventNumber: globalCounter++ }));
    }, [events]);

    const eventsToDisplay = useMemo<ScheduledEvent[]>(() => {
        if (selectedEventIds.length > 0) return eventsWithGlobalNumbers.filter(e => selectedEventIds.includes(e.id));
        if (selectedSession === 0) return eventsWithGlobalNumbers;
        return eventsWithGlobalNumbers.filter(e => e.sessionNumber === selectedSession);
    }, [eventsWithGlobalNumbers, selectedSession, selectedEventIds]);

    const swimmersMap = useMemo(() => new Map(swimmers.map(s => [s.id, s])), [swimmers]);

    // --- Report-specific Data Hooks ---
    const scheduleData = useMemo(() => {
        const groupedByDate = eventsToDisplay.reduce((acc, event) => {
            const dateStr = event.sessionDateTime ? new Date(event.sessionDateTime).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Tanggal Belum Ditentukan';
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {} as Record<string, ScheduledEvent[]>);

        return Object.entries(groupedByDate).map(([date, dateEvents]) => {
            const groupedBySession = dateEvents.reduce((acc, event) => {
                const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
                if (!acc[sessionName]) acc[sessionName] = [];
                acc[sessionName].push(event);
                return acc;
            }, {} as Record<string, ScheduledEvent[]>);
            return { date, sessions: Object.entries(groupedBySession) };
        });
    }, [eventsToDisplay]);

    const programBookData = useMemo(() => {
        if (!competitionInfo) return {};
        const sessionsData = eventsToDisplay.reduce<Record<string, TimedEvent[]>>((acc, event) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
            if (!acc[sessionName]) acc[sessionName] = [];
            
            const eventEntries: Entry[] = (event.entries || []).map(entry => ({ ...entry, swimmer: swimmersMap.get(entry.swimmerId)! })).filter(e => e.swimmer);
            acc[sessionName].push({ ...event, detailedEntries: eventEntries });
            return acc;
        }, {});

        Object.values(sessionsData).forEach(sessionEvents => {
            let runningTime = sessionEvents[0]?.sessionDateTime ? new Date(sessionEvents[0].sessionDateTime).getTime() : null;
            sessionEvents.forEach(event => {
                if (runningTime) event.estimatedEventStartTime = runningTime;
                const heats = generateHeats(event.detailedEntries, competitionInfo.numberOfLanes || 8);
                event.heatsWithTimes = heats.map(heat => {
                    const timedHeat: TimedHeat = { ...heat, estimatedHeatStartTime: runningTime || undefined };
                    if (runningTime) runningTime += estimateHeatDuration(event.distance);
                    return timedHeat;
                });
            });
        });
        return sessionsData;
    }, [eventsToDisplay, swimmersMap, competitionInfo]);

    const { brokenRecords, eventResultsData } = useMemo(() => {
        const broken: BrokenRecord[] = [];
        const results = eventsToDisplay.map(event => {
            (event.results || []).forEach(result => {
                if (result.time > 0) {
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (!swimmer) return;
                    [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                        const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                        if (record && result.time < record.time) {
                            broken.push({ record, newEventName: formatEventName(event), newHolder: swimmer, newTime: result.time });
                        }
                    });
                }
            });

            const validResults = (event.results || []).filter(r => r.time > 0).sort((a,b) => a.time - b.time);
            const getPenalty = (time: number) => time > 0 ? 0 : (time === -1 ? 1 : (time === -2 ? 2 : 3));
            const sortedResults = [...(event.results || [])].sort((a,b) => (a.time > 0 && b.time > 0) ? a.time - b.time : getPenalty(a.time) - getPenalty(b.time))
                .map(r => ({ ...r, swimmer: swimmersMap.get(r.swimmerId), rank: r.time > 0 ? validResults.findIndex(vr => vr.swimmerId === r.swimmerId) + 1 : 0, recordsBroken: broken.filter(br => br.newHolder.id === r.swimmerId && br.newTime === r.time && br.record.style === event.style && br.record.distance === event.distance) }));
            
            return { ...event, sortedResults };
        });
        const uniqueBroken = [...new Map(broken.sort((a,b) => a.newTime - b.newTime).map(item => [item.record.id, item])).values()];
        return { brokenRecords: uniqueBroken, eventResultsData: results };
    }, [eventsToDisplay, swimmersMap, records]);
    
    const winnersData = useMemo(() => {
        const eventsWithWinners = events.filter(e => e.results && e.results.length > 0).map(event => ({ ...event, winners: [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time).slice(0, 3).map((r, i) => ({ ...r, rank: i + 1, swimmer: swimmersMap.get(r.swimmerId) })), categoryKey: event.category?.trim() || 'Umum' })).filter(e => e.winners.length > 0);
        return Object.entries(eventsWithWinners.reduce((acc, event) => {
            if (!acc[event.categoryKey]) acc[event.categoryKey] = [];
            acc[event.categoryKey].push(event);
            return acc;
        }, {} as Record<string, typeof eventsWithWinners>)).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    }, [events, swimmersMap]);

    const clubMedalsData = useMemo(() => {
        // FIX: Add explicit type to `club` parameter to resolve type inference issue with `reduce`.
        const clubMedals = [...new Set(swimmers.map(s => s.club))].reduce((acc, club: string) => ({ ...acc, [club]: { gold: 0, silver: 0, bronze: 0 } }), {} as Record<string, { gold: number, silver: number, bronze: number }>);
        // FIX: Add explicit type to `event` and `r` parameters to resolve type inference issues with `forEach`.
        events.forEach((event: SwimEvent) => {
            if (!event.results) return;
            [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time).slice(0, 3).forEach((r: Result, i: number) => {
                const swimmer = swimmersMap.get(r.swimmerId);
                if (swimmer && clubMedals[swimmer.club]) {
                    if (i === 0) clubMedals[swimmer.club].gold++;
                    else if (i === 1) clubMedals[swimmer.club].silver++;
                    else if (i === 2) clubMedals[swimmer.club].bronze++;
                }
            });
        });
        return Object.entries(clubMedals).sort(([,a], [,b]) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a[0].localeCompare(b[0]));
    }, [events, swimmers, swimmersMap]);

    const individualMedalsData = useMemo(() => {
        const medals: Record<string, { swimmer: Swimmer, gold: number, silver: number, bronze: number }> = {};
        events.forEach(event => {
            if (event.results && event.gender !== Gender.MIXED) {
                [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time).slice(0, 3).forEach((r, i) => {
                    const swimmer = swimmersMap.get(r.swimmerId);
                    if (swimmer) {
                        if (!medals[swimmer.id]) medals[swimmer.id] = { swimmer, gold: 0, silver: 0, bronze: 0 };
                        if (i === 0) medals[swimmer.id].gold++; else if (i === 1) medals[swimmer.id].silver++; else if (i === 2) medals[swimmer.id].bronze++;
                    }
                });
            }
        });
        const sorted = Object.values(medals).sort((a,b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.swimmer.name.localeCompare(b.swimmer.name));
        return { male: sorted.filter(s => s.swimmer.gender === 'Male'), female: sorted.filter(s => s.swimmer.gender === 'Female') };
    }, [events, swimmersMap]);

    // --- EXCEL DOWNLOAD HANDLER ---
    const handleDownloadExcel = () => {
        if (typeof XLSX === 'undefined') return alert('Pustaka Excel belum termuat.');
        setIsDownloading(true);

        try {
            const wb = XLSX.utils.book_new();
            let fileName = `Laporan_${activeReport}.xlsx`;

            switch (activeReport) {
                case 'schedule': {
                    const data = scheduleData.flatMap(({ date, sessions }) => sessions.flatMap(([sessionName, sessionEvents]) => sessionEvents.map(event => ({ 'Tanggal': date, 'Sesi': sessionName, 'No. Acara': event.globalEventNumber, 'Nomor Lomba': formatEventName(event) }))));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 50 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Susunan Acara');
                    fileName = 'Susunan_Acara.xlsx';
                    break;
                }
                case 'program': {
                    // FIX: Add explicit types to callback parameters to resolve numerous property access errors on `unknown` type.
                    const data = Object.values(programBookData).flat().flatMap((event: TimedEvent) => (event.heatsWithTimes || []).flatMap((heat: TimedHeat) => heat.assignments.map(a => ({ 'Sesi': `Sesi ${romanize(event.sessionNumber!)}`, 'No. Acara': event.globalEventNumber, 'Nomor Lomba': formatEventName(event), 'Seri': heat.heatNumber, 'Lintasan': a.lane, 'Nama': event.relayLegs ? a.entry.swimmer.club : a.entry.swimmer.name, 'KU': event.relayLegs ? '' : a.entry.swimmer.ageGroup || '', 'Tahun': event.relayLegs ? '' : a.entry.swimmer.birthYear, 'Klub': a.entry.swimmer.club, 'Waktu Unggulan': formatTime(a.entry.seedTime) }))));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 50 }, { wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 15 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Buku Acara');
                    fileName = 'Buku_Acara.xlsx';
                    break;
                }
                case 'results': {
                    const data = eventResultsData.flatMap(event => event.sortedResults.map(res => ({ 'No. Acara': event.globalEventNumber, 'Nomor Lomba': formatEventName(event), 'Peringkat': res.rank > 0 ? res.rank : formatTime(res.time), 'Nama': res.swimmer?.name, 'Klub': res.swimmer?.club, 'Waktu': formatTime(res.time), 'Rekor': res.recordsBroken.map(br => br.record.type).join(', ') })));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Buku Hasil');
                    fileName = 'Buku_Hasil.xlsx';
                    break;
                }
                case 'winners': {
                    const data = winnersData.flatMap(([category, events]) => events.flatMap(e => e.winners.map((w: any) => ({ 'Kategori': category, 'Nomor Lomba': formatEventName(e), 'Peringkat': w.rank, 'Nama': w.swimmer?.name, 'Klub': w.swimmer?.club, 'Waktu': formatTime(w.time) }))));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 15 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Juara');
                    fileName = 'Rekap_Juara_Kategori.xlsx';
                    break;
                }
                case 'medals': {
                    const data = clubMedalsData.map(([club, medals], i) => ({ 'Peringkat': i + 1, 'Nama Tim': club, 'Emas': medals.gold, 'Perak': medals.silver, 'Perunggu': medals.bronze, 'Total': medals.gold + medals.silver + medals.bronze }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Medali Tim');
                    fileName = 'Rekap_Medali_Tim.xlsx';
                    break;
                }
                 case 'individualMedals': {
                    const maleData = individualMedalsData.male.map((d, i) => ({ 'Peringkat': i + 1, 'Nama Atlet': d.swimmer.name, 'Klub': d.swimmer.club, 'Emas': d.gold, 'Perak': d.silver, 'Perunggu': d.bronze }));
                    const femaleData = individualMedalsData.female.map((d, i) => ({ 'Peringkat': i + 1, 'Nama Atlet': d.swimmer.name, 'Klub': d.swimmer.club, 'Emas': d.gold, 'Perak': d.silver, 'Perunggu': d.bronze }));
                    const wsMale = XLSX.utils.json_to_sheet(maleData);
                    const wsFemale = XLSX.utils.json_to_sheet(femaleData);
                    wsMale['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
                    wsFemale['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
                    XLSX.utils.book_append_sheet(wb, wsMale, 'Klasemen Putra');
                    XLSX.utils.book_append_sheet(wb, wsFemale, 'Klasemen Putri');
                    fileName = 'Klasemen_Perorangan.xlsx';
                    break;
                }
                case 'brokenRecords': {
                    const data = brokenRecords.map(br => ({ 'Nomor Lomba': br.newEventName, 'Rekor Baru Atas Nama': br.newHolder.name, 'Klub': br.newHolder.club, 'Waktu Baru': formatTime(br.newTime), 'Tipe Rekor Lama': br.record.type, 'Waktu Lama': formatTime(br.record.time), 'Pemegang Rekor Lama': br.record.holderName, 'Tahun': br.record.yearSet }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    ws['!cols'] = [{ wch: 50 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 10 }];
                    XLSX.utils.book_append_sheet(wb, ws, 'Rekor Terpecahkan');
                    fileName = 'Rekor_Terpecahkan.xlsx';
                    break;
                }
            }
            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error("Failed to generate Excel file:", error);
            alert("Gagal membuat file Excel. Silakan coba lagi.");
        } finally {
            setIsDownloading(false);
        }
    };
    
    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    if (!competitionInfo) return <p className="text-center mt-8">Data kompetisi tidak tersedia.</p>;

    const getReportTitle = () => {
        if (selectedEventIds.length > 0) {
            const reportType = activeReport === 'program' ? 'Buku Acara' : 'Buku Hasil';
            if (selectedEventIds.length === 1) {
                const specificEvent = eventsWithGlobalNumbers.find(e => e.id === selectedEventIds[0]);
                return specificEvent ? `${reportType}: ${formatEventName(specificEvent)}` : reportType;
            }
            return `${reportType} (Pilihan Ganda)`;
        }
        
        const sessionSuffix = selectedSession > 0 && ['schedule', 'program', 'results'].includes(activeReport) ? ` - Sesi ${romanize(selectedSession)}` : '';
        switch (activeReport) {
            case 'schedule': return `Susunan Acara${sessionSuffix}`;
            case 'program': return `Buku Acara (Start List)${sessionSuffix}`;
            case 'results': return `Buku Hasil${sessionSuffix}`;
            case 'winners': return 'Rekap Juara per Kategori';
            case 'medals': return 'Rekap Medali Tim';
            case 'individualMedals': return 'Klasemen Perorangan';
            case 'brokenRecords': return 'Rekor Terpecahkan';
            default: return '';
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="no-print space-y-4 mb-6">
                <h1 className="text-3xl font-bold">Cetak Laporan</h1>
                <div className="bg-surface p-4 rounded-lg border border-border flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            <Button variant={activeReport === 'schedule' ? 'primary' : 'secondary'} onClick={() => setActiveReport('schedule')}>Susunan Acara</Button>
                            <Button variant={activeReport === 'program' ? 'primary' : 'secondary'} onClick={() => setActiveReport('program')}>Buku Acara</Button>
                            <Button variant={activeReport === 'results' ? 'primary' : 'secondary'} onClick={() => setActiveReport('results')}>Buku Hasil</Button>
                            <Button variant={activeReport === 'winners' ? 'primary' : 'secondary'} onClick={() => setActiveReport('winners')}>Rekap Juara (Kategori)</Button>
                            <Button variant={activeReport === 'medals' ? 'primary' : 'secondary'} onClick={() => setActiveReport('medals')}>Rekap Medali Tim</Button>
                            <Button variant={activeReport === 'individualMedals' ? 'primary' : 'secondary'} onClick={() => setActiveReport('individualMedals')}>Klasemen Perorangan</Button>
                            <Button variant={activeReport === 'brokenRecords' ? 'primary' : 'secondary'} onClick={() => setActiveReport('brokenRecords')}>Rekor Terpecahkan</Button>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button onClick={handleDownloadExcel} variant="secondary" className="flex items-center space-x-2" disabled={isDownloading}>
                                {isDownloading ? <Spinner /> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
                                <span>Unduh Excel</span>
                            </Button>
                            <Button onClick={handlePrint} className="flex items-center space-x-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                <span>Cetak / PDF</span>
                            </Button>
                        </div>
                    </div>
                     {/* Filter Section */}
                    <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-border">
                        {['schedule', 'program', 'results'].includes(activeReport) && (
                            <div>
                                <label htmlFor="session-filter" className="text-sm font-medium text-text-secondary">Filter Sesi</label>
                                <select 
                                    id="session-filter"
                                    value={selectedSession} 
                                    onChange={(e) => setSelectedSession(Number(e.target.value))}
                                    className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={selectedEventIds.length > 0}
                                    title={selectedEventIds.length > 0 ? 'Filter sesi dinonaktifkan saat nomor lomba spesifik dipilih' : 'Pilih sesi untuk dicetak'}
                                >
                                    <option value={0}>Semua Sesi</option>
                                    {sessionOptions.map(s => (
                                        <option key={s} value={s}>Sesi {romanize(s)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                         {['program', 'results'].includes(activeReport) && (
                            <div className="flex-grow max-w-md">
                                <div className="flex justify-between items-center mb-1">
                                    <label htmlFor="event-filter-container" className="text-sm font-medium text-text-secondary">Pilih Nomor Lomba untuk Dicetak</label>
                                    {selectedEventIds.length > 0 && (
                                        <button onClick={() => setSelectedEventIds([])} className="text-xs text-blue-500 hover:underline">Reset Pilihan</button>
                                    )}
                                </div>
                                <div id="event-filter-container" className="w-full bg-background border border-border rounded-md p-2 text-sm h-40 overflow-y-auto space-y-1">
                                    {eventsWithGlobalNumbers.map(event => (
                                        <div key={event.id} className="flex items-center p-1 rounded hover:bg-surface">
                                            <input
                                                type="checkbox"
                                                id={`event-checkbox-${event.id}`}
                                                value={event.id}
                                                checked={selectedEventIds.includes(event.id)}
                                                onChange={(e) => {
                                                    const eventId = e.target.value;
                                                    setSelectedEventIds(prev => 
                                                        prev.includes(eventId) 
                                                            ? prev.filter(id => id !== eventId) 
                                                            : [...prev, eventId]
                                                    );
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <label htmlFor={`event-checkbox-${event.id}`} className="ml-2 text-text-primary select-none cursor-pointer flex-grow">
                                                {`No. ${event.globalEventNumber}: ${formatEventName(event)}`}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Print Preview Area */}
            <div className="flex-grow bg-gray-100 dark:bg-gray-900 overflow-auto p-4 md:p-8 print:p-0 print:bg-white print:overflow-visible">
                <div className="print-preview-content">
                    <ReportHeader info={competitionInfo} title={getReportTitle()} />
                    
                    {activeReport === 'schedule' && <ScheduleOfEvents data={scheduleData} />}
                    {activeReport === 'program' && <ProgramBook data={programBookData} info={competitionInfo} records={records} />}
                    {activeReport === 'results' && <EventResults data={eventResultsData} records={records} />}
                    {activeReport === 'winners' && <RekapJuaraPerKategori data={winnersData} />}
                    {activeReport === 'medals' && <ClubMedalStandings data={clubMedalsData} />}
                    {activeReport === 'individualMedals' && <IndividualMedalStandings data={individualMedalsData} />}
                    {activeReport === 'brokenRecords' && <BrokenRecordsReport data={brokenRecords} />}


                    <ReportFooter info={competitionInfo} />
                </div>
            </div>
        </div>
    );
};

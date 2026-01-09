
import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { Gender, RecordType } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender } from '../constants';
import { getRecords } from '../services/databaseService';
import { useNotification } from './ui/NotificationManager';

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
    if (ms === 0) return '99:99.99';
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
    if (distance <= 800) return 11 * 60 * 1000; // 11 menit
    if (distance <= 1500) return 24 * 60 * 1000; // 24 menit
    return 5 * 60 * 1000; // Default
};


// --- PRINTABLE COMPONENTS ---

const ReportHeader: React.FC<{ info: CompetitionInfo, title: string }> = ({ info, title }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-20 object-contain mx-auto mb-4" />}
        
        <div className="mb-4">
            {info.eventName.split('\n').map((line, index) => {
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

interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}
interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
}

const ScheduleOfEvents: React.FC<{ events: ScheduledEvent[] }> = ({ events }) => {
    const processedData = useMemo(() => {
        const eventsToProcess = events;
        // FIX: Added explicit type to reduce accumulator and current value.
        const groupedByDate = eventsToProcess.reduce((acc: Record<string, ScheduledEvent[]>, event: ScheduledEvent) => {
            const dateStr = event.sessionDateTime 
                ? new Date(event.sessionDateTime).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : 'Tanggal Belum Ditentukan';
            
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(event);
            return acc;
        }, {});

        return Object.entries(groupedByDate).map(([date, dateEvents]) => {
            const groupedBySession = dateEvents.reduce((acc: Record<string, ScheduledEvent[]>, event: ScheduledEvent) => {
                const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
                if (!acc[sessionName]) acc[sessionName] = [];
                acc[sessionName].push(event);
                return acc;
            }, {} as Record<string, ScheduledEvent[]>);
            return { date, sessions: Object.entries(groupedBySession) };
        });
    }, [events]);

    if (processedData.length === 0) {
        return <p className="text-center text-text-secondary py-10">Tidak ada data untuk ditampilkan. Jadwalkan nomor lomba ke dalam sesi terlebih dahulu.</p>;
    }

    return (
        <main className="space-y-6">
            {processedData.map(({ date, sessions }) => (
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

const ProgramBook: React.FC<{ events: ScheduledEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[] }> = ({ events, swimmers, info, records }) => {
    const data = useMemo<Record<string, TimedEvent[]>>(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));

        const sessionsData = (events as ScheduledEvent[]).reduce<Record<string, TimedEvent[]>>((acc, event: ScheduledEvent) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
            if (!acc[sessionName]) {
                acc[sessionName] = [];
            }
            
            // FIX: Explicitly typed entries to avoid 'unknown' mapping error.
            const eventEntries: Entry[] = (event.entries as EventEntry[] || []).map((entry: EventEntry) => {
                const swimmer = swimmersMap.get(entry.swimmerId);
                return swimmer ? { ...entry, swimmer } : null;
            }).filter((e): e is Entry => e !== null);

            acc[sessionName].push({ ...event, detailedEntries: eventEntries });
            return acc;
        }, {});

        Object.values(sessionsData).forEach((sessionEvents: TimedEvent[]) => {
            if (sessionEvents.length === 0) return;

            const firstEvent = sessionEvents[0];
            const sessionDT = firstEvent?.sessionDateTime ? new Date(firstEvent.sessionDateTime) : null;
            let runningTime = sessionDT ? sessionDT.getTime() : null;

            sessionEvents.forEach((event: TimedEvent) => {
                if (runningTime !== null) {
                    event.estimatedEventStartTime = runningTime;
                    
                    const lanes = info.numberOfLanes || 8;
                    const heats = generateHeats(event.detailedEntries, lanes);
                    event.heatsWithTimes = [];
                    
                    (heats || []).forEach((heat: Heat) => {
                        (event.heatsWithTimes as TimedHeat[]).push({
                            ...heat,
                            estimatedHeatStartTime: runningTime || undefined
                        });
                        runningTime = (runningTime || 0) + estimateHeatDuration(event.distance);
                    });
                } else {
                    const lanes = info.numberOfLanes || 8;
                    event.heatsWithTimes = generateHeats(event.detailedEntries, lanes).map(h => ({ ...h }));
                }
            });
        });

        return sessionsData;
    }, [events, swimmers, info]);

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

const EventResults: React.FC<{ events: ScheduledEvent[], swimmers: Swimmer[], info: CompetitionInfo, records: SwimRecord[], brokenRecords: BrokenRecord[] }> = ({ events, swimmers, info, records, brokenRecords }) => {
    const data = useMemo(() => {
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        return (events as ScheduledEvent[]).map((event: ScheduledEvent) => {
            const getPenalty = (time: number) => {
                if (time > 0) return 0; // Valid time
                if (time === -1 || (time < 0 && time !== -2)) return 1; // DQ
                if (time === -2) return 2; // NS
                return 3; // Not yet recorded (NT) or 0
            };
            
            const validResultsForRanking = (event.results || [])
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time);

            const sortedResults = [...(event.results || [])]
                .sort((a: Result, b: Result) => {
                    if (a.time > 0 && b.time > 0) return a.time - b.time;
                    return getPenalty(a.time) - getPenalty(b.time);
                })
                .map((r: Result) => {
                    const swimmer = swimmersMap.get(r.swimmerId);
                    const rank = r.time > 0 ? validResultsForRanking.findIndex((vr: Result) => vr.swimmerId === r.swimmerId) + 1 : 0;
                    const recordsBroken = brokenRecords.filter((br: BrokenRecord) => br.newHolder.id === swimmer?.id && br.newTime === r.time && br.record.style === event.style && br.record.distance === event.distance);
                    return { ...r, rank, swimmer, recordsBroken };
                });

            return { ...event, sortedResults };
        });
    }, [events, swimmers, brokenRecords]);

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
                                    {event.sortedResults.map(res => (
                                        <tr key={res.swimmerId}>
                                            <td className="text-center font-bold">{res.rank > 0 ? res.rank : formatTime(res.time)}</td>
                                            <td>{res.swimmer?.name || 'N/A'}</td>
                                            <td>{event.relayLegs ? '-' : res.swimmer?.ageGroup || '-'}</td>
                                            <td>{event.relayLegs ? '-' : res.swimmer?.birthYear || ''}</td>
                                            <td>{res.swimmer?.club || 'N/A'}</td>
                                            <td className="text-right font-mono">
                                                {formatTime(res.time)}
                                                {res.recordsBroken.map(br => (
                                                    <span key={br.record.id} className={`record-badge ${br.record.type.toLowerCase()}`}>
                                                        {br.record.type}
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="text-center"><Medal rank={res.rank} /></td>
                                        </tr>
                                    ))}
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

const ClubMedalStandings: React.FC<{ events: SwimEvent[], swimmers: Swimmer[], info: CompetitionInfo }> = ({ events, swimmers, info }) => {
    const data = useMemo(() => {
        const allClubs = [...new Set(swimmers.map(s => s.club))];
        
        const clubMedals = allClubs.reduce((acc: Record<string, { gold: number, silver: number, bronze: number }>, club: string) => {
            acc[club] = { gold: 0, silver: 0, bronze: 0 };
            return acc;
        }, {} as Record<string, { gold: number, silver: number, bronze: number }>);
        
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        (events as SwimEvent[]).forEach((event: SwimEvent) => {
            if (!event.results) return;
            [...(event.results as Result[])]
                .filter((r: Result) => r.time > 0)
                .sort((a: Result, b: Result) => a.time - b.time)
                .slice(0, 3)
                .forEach((result: Result, i: number) => {
                    const rank = i + 1;
                    const swimmer = swimmersMap.get(result.swimmerId);
                    if (swimmer && clubMedals[swimmer.club]) {
                        if (rank === 1) clubMedals[swimmer.club].gold++;
                        else if (rank === 2) clubMedals[swimmer.club].silver++;
                        else if (rank === 3) clubMedals[swimmer.club].bronze++;
                    }
                });
        });

        return Object.entries(clubMedals).sort(([clubA, a], [clubB, b]) => 
            b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || clubA.localeCompare(clubB)
        );
    }, [events, swimmers]);

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

export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<'PROGRAM_BOOK' | 'RESULTS' | 'MEDALS' | 'SCHEDULE'>('PROGRAM_BOOK');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const { addNotification } = useNotification();

    useEffect(() => {
        getRecords().then(setRecords);
    }, []);

    const scheduledEvents = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0) || (a.heatOrder || 0) - (b.heatOrder || 0))
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events]);

    const brokenRecords = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        const broken: BrokenRecord[] = [];
        scheduledEvents.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time)[0];
                if (winner) {
                    const swimmer = swimmersMap.get(winner.swimmerId);
                    if (swimmer) {
                         [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                            const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
                            if (record && winner.time < record.time) {
                                broken.push({ record, newEventName: formatEventName(event), newHolder: swimmer, newTime: winner.time });
                            }
                        });
                    }
                }
            }
        });
        return broken;
    }, [scheduledEvents, swimmers, records]);

    const handlePrint = () => window.print();

    if (isLoading) return <div className="flex justify-center p-20"><Spinner /></div>;
    if (!competitionInfo) return null;

    return (
        <div className="print-view-container">
            <div className="no-print space-y-6 mb-8">
                <h1 className="text-3xl font-bold">Menu Laporan & Cetak</h1>
                <Card>
                    <div className="flex flex-wrap gap-4">
                        <Button variant={reportType === 'SCHEDULE' ? 'primary' : 'secondary'} onClick={() => setReportType('SCHEDULE')}>Jadwal Acara</Button>
                        <Button variant={reportType === 'PROGRAM_BOOK' ? 'primary' : 'secondary'} onClick={() => setReportType('PROGRAM_BOOK')}>Buku Acara (Program Book)</Button>
                        <Button variant={reportType === 'RESULTS' ? 'primary' : 'secondary'} onClick={() => setReportType('RESULTS')}>Hasil Lomba</Button>
                        <Button variant={reportType === 'MEDALS' ? 'primary' : 'secondary'} onClick={() => setReportType('MEDALS')}>Klasemen Medali</Button>
                    </div>
                    <div className="mt-6">
                        <Button onClick={handlePrint} className="flex items-center space-x-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                             <span>Cetak Laporan</span>
                        </Button>
                    </div>
                </Card>
            </div>

            <div className="printable-content bg-white p-8 text-black min-h-screen shadow-lg rounded-lg max-w-[210mm] mx-auto">
                <ReportHeader info={competitionInfo} title={
                    reportType === 'SCHEDULE' ? 'Jadwal Acara' :
                    reportType === 'PROGRAM_BOOK' ? 'Buku Acara (Program Book)' :
                    reportType === 'RESULTS' ? 'Hasil Lomba' : 'Klasemen Medali Tim'
                } />
                
                {reportType === 'SCHEDULE' && <ScheduleOfEvents events={scheduledEvents} />}
                {reportType === 'PROGRAM_BOOK' && <ProgramBook events={scheduledEvents} swimmers={swimmers} info={competitionInfo} records={records} />}
                {reportType === 'RESULTS' && <EventResults events={scheduledEvents} swimmers={swimmers} info={competitionInfo} records={records} brokenRecords={brokenRecords} />}
                {reportType === 'MEDALS' && <ClubMedalStandings events={scheduledEvents} swimmers={swimmers} info={competitionInfo} />}

                <ReportFooter info={competitionInfo} />
            </div>
        </div>
    );
};

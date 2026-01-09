// FIX: Explicitly cast sessionEvents to TimedEvent[] to resolve mapping error over unknown.
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
        // Explicitly defining types to ensure proper mapping and reducing
        const groupedByDate = (eventsToProcess as ScheduledEvent[]).reduce((acc: Record<string, ScheduledEvent[]>, event: ScheduledEvent) => {
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
                                    {(sessionEvents as ScheduledEvent[]).map(event => (
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
        // Explicitly typed swimmersMap for better type safety
        const swimmersMap = new Map<string, Swimmer>(swimmers.map((s: Swimmer) => [s.id, s]));

        const sessionsData = (events as ScheduledEvent[]).reduce<Record<string, TimedEvent[]>>((acc, event: ScheduledEvent) => {
            const sessionName = `Sesi ${romanize(event.sessionNumber || 0)}`;
            if (!acc[sessionName]) {
                acc[sessionName] = [];
            }
            
            // Mapping entries with swimmer data while handling potential undefined swimmers
            const eventEntries: Entry[] = (event.entries || []).map((entry: EventEntry) => {
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
                        {(sessionEvents as TimedEvent[]).map((event: TimedEvent) => {
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
        const swimmersMap = new Map<string, Swimmer>(swimmers.map((s: Swimmer) => [s.id, s]));
        
        return events.map(event => {
            const validResults = [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time);
            
            // Explicitly handling result mapping with type safety
            const resultsWithDetails = [...event.results].sort((a,b) => {
                if (a.time > 0 && b.time > 0) return a.time - b.time;
                if (a.time > 0) return -1;
                if (b.time > 0) return 1;
                return b.time - a.time;
            }).map((result: Result) => {
                const swimmer = swimmersMap.get(result.swimmerId);
                const rank = result.time > 0 ? validResults.findIndex(r => r.swimmerId === result.swimmerId) + 1 : 0;
                const brokenRecordDetails = brokenRecords.filter(br => 
                    br.newHolder.id === swimmer?.id && 
                    br.newTime === result.time &&
                    br.record.style === event.style &&
                    br.record.distance === event.distance &&
                    br.record.gender === event.gender &&
                    (br.record.category ?? null) === (event.category ?? null)
                );
                return { ...result, rank, swimmer: swimmer as Swimmer, brokenRecordDetails };
            });

            return { ...event, detailedResults: resultsWithDetails };
        });
    }, [events, swimmers, brokenRecords]);

    return (
        <main className="space-y-10">
            {data.map(event => {
                const porprovRecord = records.find(r => r.type.toUpperCase() === RecordType.PORPROV.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                const nasionalRecord = records.find(r => r.type.toUpperCase() === RecordType.NASIONAL.toUpperCase() && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));

                return (
                    <section key={event.id} className="print-event-section page-break-inside-avoid">
                        <h4 className="text-lg font-bold bg-gray-100 p-2 border-b-2 border-gray-400">
                           {`Nomor Acara ${event.globalEventNumber}: ${formatEventName(event)}`}
                        </h4>
                        <div className="text-[10px] text-gray-600 my-2 px-2 border-l-2 border-gray-300">
                            <PrintRecordRow record={porprovRecord} type={RecordType.PORPROV} />
                            <PrintRecordRow record={nasionalRecord} type={RecordType.NASIONAL} />
                        </div>
                        <table className="w-full text-left text-sm mt-2">
                             <thead>
                                 <tr className="border-b border-gray-300">
                                     <th className="p-1 w-12 text-center">Rank</th>
                                     <th className="p-1">Nama Peserta</th>
                                     <th className="p-1">Klub/Tim</th>
                                     <th className="p-1 text-right">Waktu</th>
                                     <th className="p-1 text-center w-12">Medali</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {event.detailedResults.map(result => (
                                     <tr key={result.swimmerId} className="border-b border-gray-100 last:border-0">
                                         <td className="p-1 text-center font-bold">{result.rank > 0 ? result.rank : formatTime(result.time)}</td>
                                         <td className="p-1">{result.swimmer?.name || 'Unknown'}</td>
                                         <td className="p-1 text-xs">{result.swimmer?.club || 'N/A'}</td>
                                         <td className="p-1 text-right font-mono">
                                            {formatTime(result.time)}
                                            {result.brokenRecordDetails.map(br => (
                                                <span key={br.record.id} className="ml-1 text-[8px] border border-red-500 text-red-500 px-1 rounded uppercase font-bold">
                                                    BR
                                                </span>
                                            ))}
                                         </td>
                                         <td className="p-1 text-center"><Medal rank={result.rank} /></td>
                                     </tr>
                                 ))}
                             </tbody>
                        </table>
                    </section>
                );
            })}
        </main>
    );
};

export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<'schedule' | 'program' | 'results'>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const { addNotification } = useNotification();

    useEffect(() => {
        getRecords().then(setRecords);
    }, []);

    const scheduledEvents = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .sort((a, b) => {
                const sessionDiff = (a.sessionNumber || 0) - (b.sessionNumber || 0);
                if (sessionDiff !== 0) return sessionDiff;
                return (a.heatOrder || 0) - (b.heatOrder || 0);
            })
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events]);

    const brokenRecords = useMemo(() => {
        const list: BrokenRecord[] = [];
        const swimmersMap = new Map<string, Swimmer>(swimmers.map((s: Swimmer) => [s.id, s]));

        scheduledEvents.forEach(event => {
            if (event.results && event.results.length > 0) {
                const winner = [...event.results].filter(r => r.time > 0).sort((a,b) => a.time - b.time)[0];
                if (winner) {
                    const swimmer = swimmersMap.get(winner.swimmerId);
                    if (swimmer) {
                        [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                            const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.relayLegs ?? null) === (event.relayLegs ?? null) && (r.category ?? null) === (event.category ?? null));
                            if (record && winner.time < record.time) {
                                list.push({ record, newEventName: formatEventName(event), newHolder: swimmer, newTime: winner.time });
                            }
                        });
                    }
                }
            }
        });
        return list;
    }, [scheduledEvents, swimmers, records]);

    const handlePrint = () => {
        window.print();
    };

    if (isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
    if (!competitionInfo) return <div className="text-center p-10">Data kompetisi tidak ditemukan.</div>;

    const reportTitles = {
        schedule: 'JADWAL NOMOR LOMBA (ORDER OF EVENTS)',
        program: 'BUKU PROGRAM (MEET PROGRAM)',
        results: 'HASIL LOMBA (MEET RESULTS)'
    };

    return (
        <div className="print-view-container">
            <div className="no-print mb-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Pilih Laporan Cetak</h2>
                    <div className="flex flex-wrap gap-2 mb-6">
                        <Button variant={reportType === 'schedule' ? 'primary' : 'secondary'} onClick={() => setReportType('schedule')}>Jadwal Lomba</Button>
                        <Button variant={reportType === 'program' ? 'primary' : 'secondary'} onClick={() => setReportType('program')}>Buku Program</Button>
                        <Button variant={reportType === 'results' ? 'primary' : 'secondary'} onClick={() => setReportType('results')}>Hasil Lomba</Button>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-border">
                        <p className="text-sm text-text-secondary italic">Gunakan printer browser (Ctrl+P) untuk menyimpan sebagai PDF atau cetak fisik.</p>
                        <Button onClick={handlePrint}>Cetak Laporan</Button>
                    </div>
                </Card>
            </div>

            <div className="print-only bg-white text-black p-4 min-h-screen">
                <ReportHeader info={competitionInfo} title={reportTitles[reportType]} />
                
                {reportType === 'schedule' && <ScheduleOfEvents events={scheduledEvents} />}
                {reportType === 'program' && <ProgramBook events={scheduledEvents} swimmers={swimmers} info={competitionInfo} records={records} />}
                {reportType === 'results' && <EventResults events={scheduledEvents} swimmers={swimmers} info={competitionInfo} records={records} brokenRecords={brokenRecords} />}

                <ReportFooter info={competitionInfo} />
            </div>
        </div>
    );
};
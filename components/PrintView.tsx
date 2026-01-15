import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { RecordType, Gender, SwimStyle } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, translateGender, translateSwimStyle, romanize } from '../constants';
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

// --- TYPES ---
type ReportType = 'schedule' | 'program' | 'results' | 'clubMedals' | 'clubSwimmerMedals' | 'swimmerTotal' | 'swimmerCategory' | 'brokenRecords';

interface ScheduledEvent extends SwimEvent {
    globalEventNumber: number;
}

interface TimedHeat extends Heat {
    estimatedHeatStartTime?: number;
}

interface TimedEvent extends ScheduledEvent {
    detailedEntries: Entry[];
    estimatedEventStartTime?: number;
    heatsWithTimes?: TimedHeat[];
    detailedResults?: any[];
}

// --- HELPER FUNCTIONS ---
const formatTime = (ms: number) => {
    // FIX: Tangani NaN, null, undefined, atau 0 sebagai "No Time" (99:99.99)
    if (isNaN(ms) || ms === null || ms === undefined || ms === 0) return '99:99.99';
    if (ms === -2) return 'NS';
    if (ms < 0) return 'DQ';
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0').slice(0, 2)}`;
};

const estimateHeatDuration = (distance: number): number => {
    if (distance <= 50) return 2 * 60 * 1000;
    if (distance <= 100) return 3 * 60 * 1000;
    return 5 * 60 * 1000;
};

const MedalIcon = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span>🥇</span>;
    if (rank === 2) return <span>🥈</span>;
    if (rank === 3) return <span>🥉</span>;
    return null;
};

// --- PRINTABLE COMPONENTS ---

// FIX: Using regular function instead of React.FC to improve type inference for props
const ReportHeader = ({ info, title }: { info: CompetitionInfo, title: string }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-16 object-contain mx-auto mb-2" />}
        <div className="mb-2">
            {/* FIX: Explicitly cast info.eventName to string to ensure split and map work correctly across environments */}
            {(String(info.eventName || '')).split('\n').map((line: string, index: number) => (
                <p key={index} className={`font-bold uppercase tracking-tight leading-tight ${index === 0 ? 'text-xl' : 'text-xs'}`}>{line}</p>
            ))}
            <p className="text-sm text-gray-600 mt-1 uppercase font-semibold">
                {info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
        </div>
        <h2 className="text-lg font-bold border-y-2 border-black py-1 my-2 text-center bg-gray-50 tracking-widest">{title}</h2>
    </header>
);

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) return <p className="uppercase text-[8px] font-sans text-gray-400 font-bold">{typeText} : -</p>;
    const parts = [formatTime(record.time), record.holderName, record.yearSet, record.locationSet].filter(p => p != null && String(p).trim() !== '');
    return <p className="uppercase text-[8px] font-sans font-bold">{typeText} : {parts.join(' | ')}</p>;
};

// 1. Susunan Acara
const ScheduleReport: React.FC<{ events: ScheduledEvent[] }> = ({ events }) => {
    const grouped = events.reduce((acc: Record<string, ScheduledEvent[]>, e) => {
        const session = `SESI ${romanize(e.sessionNumber || 0)}`;
        if (!acc[session]) acc[session] = [];
        acc[session].push(e);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {Object.entries(grouped).map(([session, sessionEvents]) => (
                <div key={session} className="page-break-inside-avoid">
                    <h3 className="font-bold text-md border-b-2 border-black mb-2 uppercase">{session}</h3>
                    <table className="w-full text-[11px] border-collapse">
                        <thead><tr className="border-b bg-gray-100"><th className="text-left py-1 px-2 w-12">NO</th><th className="text-left px-2">NOMOR LOMBA</th><th className="text-center w-24 px-2">PESERTA</th></tr></thead>
                        <tbody>
                            {sessionEvents.map(e => (
                                <tr key={e.id} className="border-b border-gray-200">
                                    <td className="py-1 px-2 font-bold">{e.globalEventNumber}</td>
                                    <td className="px-2 font-medium">{formatEventName(e)}</td>
                                    <td className="text-center px-2">{e.entries.length}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

// 2 & 3. Buku Acara & Buku Hasil (Unified UI Style)
// FIX: Switched from React.FC to explicit prop typing to fix 'Property map does not exist on type unknown' errors on events and other props
const EventBaseReport = ({ events, info, records, showResults }: { events: TimedEvent[], info: CompetitionInfo, records: SwimRecord[], showResults?: boolean }) => (
    <div className="space-y-8">
        {events.map(event => {
            const porprov = records.find(r => r.type === RecordType.PORPROV && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            const nasional = records.find(r => r.type === RecordType.NASIONAL && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
            
            return (
                <div key={event.id} className="page-break-inside-avoid border-b-2 border-gray-400 pb-4">
                    <div className="bg-black text-white p-1 px-2 font-bold text-xs flex justify-between uppercase">
                        <span>#{event.globalEventNumber} - {formatEventName(event)}</span>
                        {event.estimatedEventStartTime && !showResults && <span>EST: {new Date(event.estimatedEventStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div className="my-1 px-2 border-l-2 border-black bg-gray-50 py-1">
                        <PrintRecordRow record={porprov} type="PORPROV" />
                        <PrintRecordRow record={nasional} type="NASIONAL" />
                    </div>

                    {!showResults ? (
                        (event.heatsWithTimes || []).map(heat => (
                            <div key={heat.heatNumber} className="mt-2">
                                <p className="text-center font-bold text-[9px] uppercase bg-gray-200 py-0.5">Seri {heat.heatNumber} dari {event.heatsWithTimes?.length}</p>
                                <table className="w-full text-[10px] mt-0.5 border-collapse table-fixed">
                                    <thead><tr className="border-y border-black font-bold">
                                        <th className="w-8 text-center">LIN</th>
                                        <th className="text-left px-2">NAMA ATLET</th>
                                        <th className="w-12 text-center">THN</th>
                                        <th className="text-left px-2">TIM</th>
                                        <th className="w-20 text-right px-2">SEED</th>
                                    </tr></thead>
                                    <tbody>
                                        {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                            const ass = heat.assignments.find(a => a.lane === lane);
                                            return (
                                                <tr key={lane} className="border-b border-gray-100 h-6">
                                                    <td className="text-center font-bold border-r border-gray-100">{lane}</td>
                                                    <td className="px-2 truncate font-medium uppercase">{ass ? ass.entry.swimmer.name : '-'}</td>
                                                    <td className="text-center">{ass ? ass.entry.swimmer.birthYear : '-'}</td>
                                                    <td className="px-2 truncate text-[9px] uppercase">{ass ? ass.entry.swimmer.club : '-'}</td>
                                                    <td className="text-right font-mono px-2">{ass ? formatTime(ass.entry.seedTime) : '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    ) : (
                        <div className="mt-2">
                            <table className="w-full text-[10px] border-collapse table-fixed">
                                <thead><tr className="border-y border-black font-bold bg-gray-100">
                                    <th className="w-12 text-center">RANK</th>
                                    <th className="text-left px-2">NAMA ATLET</th>
                                    <th className="w-12 text-center">THN</th>
                                    <th className="text-left px-2">TIM</th>
                                    <th className="w-24 text-right px-2">HASIL</th>
                                    <th className="w-12 text-center">MEDALI</th>
                                </tr></thead>
                                <tbody>
                                    {event.detailedResults?.map((r: any) => (
                                        <tr key={r.swimmerId} className="border-b border-gray-200 h-7">
                                            <td className="text-center font-bold">{r.rank || '-'}</td>
                                            <td className="px-2 uppercase font-medium">{r.swimmer?.name}</td>
                                            <td className="text-center">{r.swimmer?.birthYear}</td>
                                            <td className="px-2 uppercase text-[9px]">{r.swimmer?.club}</td>
                                            <td className="text-right font-mono px-2">{formatTime(r.time)}</td>
                                            <td className="text-center scale-125"><MedalIcon rank={r.rank} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);

// 4. Rekap Medali Klub
const ClubMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <table className="w-full text-[12px] border-collapse">
        <thead><tr className="bg-black text-white border-2 border-black">
            <th className="p-2 w-12 text-center">#</th><th className="text-left px-2">NAMA TIM / KLUB</th><th className="w-16 text-center">🥇</th><th className="w-16 text-center">🥈</th><th className="w-16 text-center">🥉</th><th className="w-16 text-center font-bold">TOTAL</th>
        </tr></thead>
        <tbody>
            {data.map((item, i) => (
                <tr key={i} className="border-b-2 border-gray-300">
                    <td className="text-center font-bold py-2">{i + 1}</td>
                    <td className="font-bold uppercase px-2">{item.name}</td>
                    <td className="text-center">{item.gold}</td>
                    <td className="text-center">{item.silver}</td>
                    <td className="text-center">{item.bronze}</td>
                    <td className="text-center font-bold bg-gray-50">{item.gold + item.silver + item.bronze}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

// 5. Rekap Medali Klub & Atlet (Custom Format)
const ClubSwimmerMedalsReport: React.FC<{ data: any[] }> = ({ data }) => (
    <div className="space-y-8">
        {data.map((club, idx) => (
            <div key={idx} className="page-break-inside-avoid border-2 border-black rounded overflow-hidden shadow-sm">
                <div className="bg-black text-white p-2 flex justify-between items-center font-bold">
                    <span className="text-lg uppercase tracking-tight">{club.name}</span>
                    <span className="text-lg">🥇{club.gold} 🥈{club.silver} 🥉{club.bronze}</span>
                </div>
                <table className="w-full text-[11px]">
                    <thead><tr className="bg-gray-200 border-b border-black">
                        <th className="text-left p-2 w-1/3">NAMA ATLET</th><th className="text-left p-2">NOMOR LOMBA YANG DIMENANGKAN</th>
                    </tr></thead>
                    <tbody>
                        {club.individualDetails.map((swimmer: any, sIdx: number) => (
                            <tr key={sIdx} className="border-b border-gray-200 align-top">
                                <td className="p-2 font-bold uppercase">{swimmer.name}</td>
                                <td className="p-2 py-3 space-y-1">
                                    {swimmer.medals.map((m: any, mIdx: number) => (
                                        <div key={mIdx} className="flex gap-2 items-center">
                                            <MedalIcon rank={m.rank} />
                                            <span className="font-medium uppercase">{m.eventName} - {formatTime(m.time)}</span>
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
    </div>
);

// 6 & 7. Rekap Atlet (Gender Split)
const AthleteRecapReport: React.FC<{ data: any[], title?: string }> = ({ data, title }) => {
    const male = data.filter(i => i.swimmer?.gender === 'Male');
    const female = data.filter(i => i.swimmer?.gender === 'Female');
    
    const RenderTable = ({ list, label }: { list: any[], label: string }) => (
        <div className="mt-4 page-break-inside-avoid">
            <h4 className="bg-gray-800 text-white p-1 px-2 font-bold text-xs uppercase mb-1">{label}</h4>
            <table className="w-full text-[10px] border-collapse">
                <thead><tr className="border-y-2 border-black bg-gray-100 font-bold">
                    <th className="w-8 text-center">#</th><th className="text-left px-2">NAMA ATLET</th><th className="text-left px-2">TIM</th><th className="w-10 text-center">🥇</th><th className="w-10 text-center">🥈</th><th className="w-10 text-center">🥉</th><th className="w-12 text-center font-bold">TOT</th>
                </tr></thead>
                <tbody>
                    {list.map((item, i) => (
                        <tr key={i} className="border-b border-gray-200">
                            <td className="text-center py-1.5 font-bold">{i + 1}</td>
                            <td className="px-2 font-bold uppercase">{item.swimmer?.name}</td>
                            <td className="px-2 uppercase text-[8px]">{item.swimmer?.club}</td>
                            <td className="text-center">{item.gold}</td>
                            <td className="text-center">{item.silver}</td>
                            <td className="text-center">{item.bronze}</td>
                            <td className="text-center font-bold">{item.gold + item.silver + item.bronze}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-8">
            {title && <h3 className="text-center font-black text-xl mb-4 uppercase underline">{title}</h3>}
            <RenderTable list={male} label="KATEGORI PUTRA (MEN'S)" />
            <RenderTable list={female} label="KATEGORI PUTRI (WOMEN'S)" />
        </div>
    );
};

// --- MAIN COMPONENT ---
export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<ReportType>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const [sessionFilter, setSessionFilter] = useState<number>(0); // 0 for All
    const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
    const { addNotification } = useNotification();

    useEffect(() => { getRecords().then(setRecords); }, []);

    // Session helper
    const availableSessions = useMemo(() => {
        const set = new Set(events.map(e => e.sessionNumber || 0).filter(s => s > 0));
        return Array.from(set).sort((a, b) => a - b);
    }, [events]);

    // 1. Filtered Base Events
    const baseEvents = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .filter(e => sessionFilter === 0 || e.sessionNumber === sessionFilter)
            .sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0) || (a.heatOrder || 0) - (b.heatOrder || 0))
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events, sessionFilter]);

    // Selection helper
    const handleToggleAllEvents = (select: boolean) => {
        if (select) setSelectedEventIds(new Set(baseEvents.map(e => e.id)));
        else setSelectedEventIds(new Set());
    };

    const handleToggleEventId = (id: string) => {
        const next = new Set(selectedEventIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedEventIds(next);
    };

    // Final Events to Render (Filtered by ID if type is program/results)
    const renderEvents = useMemo(() => {
        const isSelectionActive = selectedEventIds.size > 0 && ['program', 'results'].includes(reportType);
        return baseEvents.filter(e => !isSelectionActive || selectedEventIds.has(e.id));
    }, [baseEvents, selectedEventIds, reportType]);

    // 2. Data Processing for Reports
    const processedData = useMemo(() => {
        // FIX: Explicitly type swimmersMap as Map<string, Swimmer> to fix 'unknown' property access errors
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));
        
        // Detailed Events (Program & Results)
        const detailedEvents = renderEvents.map(event => {
            const entries: Entry[] = event.entries.map(en => ({ ...en, swimmer: swimmersMap.get(en.swimmerId)! })).filter(e => e.swimmer);
            const heats = generateHeats(entries, competitionInfo?.numberOfLanes || 8);
            
            // Results calculation
            const validRes = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const detailedRes = [...event.results].sort((a, b) => {
                if (a.time > 0 && b.time > 0) return a.time - b.time;
                if (a.time > 0) return -1; if (b.time > 0) return 1;
                return b.time - a.time;
            }).map(r => ({
                ...r,
                swimmer: swimmersMap.get(r.swimmerId),
                rank: r.time > 0 ? validRes.findIndex(v => v.swimmerId === r.swimmerId) + 1 : 0
            }));

            // FIX: Explicitly type runningTime as number | null to handle arithmetic correctly
            let runningTime: number | null = event.sessionDateTime ? new Date(event.sessionDateTime).getTime() : null;
            const heatsWithTimes = heats.map(h => {
                const th = { ...h, estimatedHeatStartTime: runningTime || undefined };
                // FIX: Ensure runningTime is treated as number after null check
                if (runningTime !== null) {
                    runningTime = (runningTime as number) + estimateHeatDuration(event.distance);
                }
                return th;
            });

            return { 
                ...event, 
                detailedEntries: entries, 
                heatsWithTimes, 
                detailedResults: detailedRes,
                estimatedEventStartTime: event.sessionDateTime ? new Date(event.sessionDateTime).getTime() : undefined 
            };
        });

        // Tallying
        // FIX: Defined explicit interfaces for tally objects to prevent 'Property does not exist on type unknown' errors
        interface TallyClubIndividual {
            name: string;
            medals: { rank: number; eventName: string; time: number }[];
        }

        interface TallyClub {
            name: string;
            gold: number;
            silver: number;
            bronze: number;
            individualDetails: Record<string, TallyClubIndividual>;
        }

        interface TallyIndividual {
            swimmer: Swimmer;
            gold: number;
            silver: number;
            bronze: number;
        }

        const clubs: Record<string, TallyClub> = {};
        const individual: Record<string, TallyIndividual> = {};
        const broken: BrokenRecord[] = [];

        // We tally based on ALL base events (ignoring print selection for overall standings)
        baseEvents.forEach(rawEvent => {
            const valid = [...rawEvent.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const winner = valid[0];
            
            if (winner) {
                const ws = swimmersMap.get(winner.swimmerId);
                if (ws) {
                    [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                        const rec = records.find(r => r.type === type && r.gender === rawEvent.gender && r.distance === rawEvent.distance && r.style === rawEvent.style && (r.category ?? null) === (rawEvent.category ?? null));
                        // FIX: Changed 'record.time' to 'rec.time' to fix name error
                        if (rec && winner.time < rec.time) { 
                            broken.push({ record: rec, newEventName: formatEventName(rawEvent), newHolder: ws, newTime: winner.time });
                        }
                    });
                }
            }

            valid.forEach((r, idx) => {
                const rank = idx + 1;
                if (rank > 3) return;
                const s = swimmersMap.get(r.swimmerId);
                if (!s) return;

                // FIX: Used typed keys and explicit object mapping to fix unknown property errors
                if (!clubs[s.club]) {
                    clubs[s.club] = { name: s.club, gold: 0, silver: 0, bronze: 0, individualDetails: {} };
                }
                if (!individual[s.id]) {
                    individual[s.id] = { swimmer: s, gold: 0, silver: 0, bronze: 0 };
                }
                
                const mKey = (rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze') as 'gold' | 'silver' | 'bronze';
                clubs[s.club][mKey]++;
                individual[s.id][mKey]++;

                // Collect data for Club & Swimmer report
                if (!clubs[s.club].individualDetails[s.id]) {
                    clubs[s.club].individualDetails[s.id] = { name: s.name, medals: [] };
                }
                clubs[s.club].individualDetails[s.id].medals.push({ rank, eventName: formatEventName(rawEvent), time: r.time });
            });
        });

        const sortFn = (a: TallyClub | TallyIndividual, b: TallyClub | TallyIndividual) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
        const sortedClubs = Object.values(clubs).sort(sortFn).map((c) => ({
            ...c,
            individualDetails: Object.values(c.individualDetails).sort((a, b) => b.medals.length - a.medals.length)
        }));
        const sortedIndividuals = Object.values(individual).sort(sortFn);

        const categoryLeaderboard = [...new Set(swimmers.map(s => s.ageGroup))].filter(Boolean).sort().map(ku => ({
            ku,
            leaders: sortedIndividuals.filter((i) => i.swimmer.ageGroup === ku)
        }));

        return { 
            detailedEvents, 
            clubs: sortedClubs, 
            individuals: sortedIndividuals, 
            categoryLeaderboard, 
            broken 
        };
    }, [renderEvents, baseEvents, swimmers, competitionInfo, records]);


    const handleExportExcel = () => {
        if (!XLSX) return alert("Pustaka Excel belum siap.");
        let data: any[] = [];
        let fileName = "Laporan";

        switch(reportType) {
            case 'schedule':
                data = renderEvents.map(e => ({ "NO ACARA": e.globalEventNumber, "NOMOR LOMBA": formatEventName(e), "JUMLAH PESERTA": e.entries.length }));
                break;
            case 'results':
                processedData.detailedEvents.forEach(e => e.detailedResults?.forEach(r => data.push({
                    "NOMOR": e.globalEventNumber, "EVENT": formatEventName(e), "RANK": r.rank || '-', "NAMA ATLET": r.swimmer?.name, "TIM": r.swimmer?.club, "WAKTU": formatTime(r.time)
                })));
                break;
            case 'clubMedals':
                data = processedData.clubs.map((c, i) => ({ "PERINGKAT": i+1, "KLUB": c.name, "EMAS": c.gold, "PERAK": c.silver, "PERUNGGU": c.bronze, "TOTAL": c.gold+c.silver+c.bronze }));
                break;
            case 'swimmerTotal':
                processedData.individuals.forEach((i: any, idx) => data.push({
                    "NO": idx+1, "GENDER": i.swimmer.gender === 'Male' ? 'L' : 'P', "NAMA": i.swimmer.name, "TIM": i.swimmer.club, "EMAS": i.gold, "PERAK": i.silver, "PERUNGGU": i.bronze, "TOTAL": i.gold+i.silver+i.bronze
                }));
                break;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan");
        XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
    };

    if (isLoading || !competitionInfo) return <div className="flex justify-center p-20"><Spinner /></div>;

    const reportTitles: Record<ReportType, string> = {
        schedule: 'SUSUNAN ACARA (ORDER OF EVENTS)',
        program: 'BUKU ACARA (MEET PROGRAM)',
        results: 'BUKU HASIL LOMBA (MEET RESULTS)',
        clubMedals: 'REKAPITULASI MEDALI KLUB / TIM',
        clubSwimmerMedals: 'REKAPITULASI MEDALI KLUB & ATLET',
        swimmerTotal: 'REKAPITULASI MEDALI ATLET (TOTAL)',
        swimmerCategory: 'KLASEMEN PERORANGAN (PER KATEGORI)',
        brokenRecords: 'DAFTAR REKOR TERPECAHKAN'
    };

    return (
        <div className="print-view-container">
            <div className="no-print space-y-4 mb-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Pengaturan Laporan</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Pilih Jenis Laporan</label>
                            <select 
                                value={reportType} 
                                onChange={(e) => {
                                    setReportType(e.target.value as ReportType);
                                    setSessionFilter(0);
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                {Object.entries(reportTitles).map(([k, v]) => <option key={k} value={k}>{v.replace(/\(.*\)/, '')}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase text-text-secondary mb-1">Filter Sesi</label>
                            <select 
                                value={sessionFilter} 
                                onChange={(e) => {
                                    setSessionFilter(Number(e.target.value));
                                    setSelectedEventIds(new Set());
                                }}
                                className="w-full bg-background border border-border rounded p-2 text-sm font-bold"
                            >
                                <option value={0}>SEMUA SESI</option>
                                {availableSessions.map(s => <option key={s} value={s}>SESI {romanize(s)}</option>)}
                            </select>
                        </div>
                    </div>

                    {['program', 'results'].includes(reportType) && (
                        <div className="mt-6 border-t pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-black uppercase text-text-secondary">Pilih Nomor Lomba ({selectedEventIds.size || 'Semua'} Dipilih)</label>
                                <div className="space-x-2">
                                    <button onClick={() => handleToggleAllEvents(true)} className="text-[10px] font-bold text-primary hover:underline">PILIH SEMUA</button>
                                    <button onClick={() => handleToggleAllEvents(false)} className="text-[10px] font-bold text-red-500 hover:underline">HAPUS SEMUA</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-background/50 rounded border">
                                {baseEvents.map(e => (
                                    <label key={e.id} className="flex items-center gap-2 p-1 hover:bg-primary/5 cursor-pointer rounded">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedEventIds.has(e.id)} 
                                            onChange={() => handleToggleEventId(e.id)} 
                                            className="h-4 w-4 rounded border-gray-300 text-primary"
                                        />
                                        <span className="text-[10px] font-bold truncate">#{e.globalEventNumber} - {formatEventName(e)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-6 mt-4 border-t border-border">
                        <div className="flex gap-4">
                             <Button onClick={() => window.print()} className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                CETAK / PDF
                            </Button>
                            <Button onClick={handleExportExcel} variant="secondary" className="flex items-center gap-2 px-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                UNDUH EXCEL
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="print-only bg-white text-black p-2 min-h-screen">
                <ReportHeader info={competitionInfo} title={reportTitles[reportType]} />
                
                {reportType === 'schedule' && <ScheduleReport events={baseEvents} />}
                
                {reportType === 'program' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                    />
                )}
                
                {reportType === 'results' && (
                    <EventBaseReport 
                        events={processedData.detailedEvents} 
                        info={competitionInfo} 
                        records={records} 
                        showResults 
                    />
                )}

                {reportType === 'clubMedals' && <ClubMedalsReport data={processedData.clubs} />}
                
                {reportType === 'clubSwimmerMedals' && <ClubSwimmerMedalsReport data={processedData.clubs} />}
                
                {reportType === 'swimmerTotal' && <AthleteRecapReport data={processedData.individuals} />}
                
                {reportType === 'swimmerCategory' && (
                    <div className="space-y-12">
                        {processedData.categoryLeaderboard.map(cat => (
                            <AthleteRecapReport key={cat.ku} data={cat.leaders} title={`KATEGORI: ${cat.ku}`} />
                        ))}
                    </div>
                )}

                {reportType === 'brokenRecords' && (
                    <div className="space-y-4">
                        {processedData.broken.map((br, i) => (
                            <div key={i} className="p-4 border-2 border-black rounded bg-gray-50 flex justify-between items-center">
                                <div>
                                    <p className="font-black text-sm uppercase">{br.newEventName}</p>
                                    <p className="text-lg font-black uppercase tracking-tight">{br.newHolder.name} ({br.newHolder.club})</p>
                                    <p className="text-[10px] mt-1 font-bold italic text-red-600 uppercase">MEMECAHKAN REKOR {br.record.type} ({formatTime(br.record.time)} - {br.record.holderName})</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-3xl font-black">{formatTime(br.newTime)}</p>
                                </div>
                            </div>
                        ))}
                        {processedData.broken.length === 0 && <p className="text-center italic py-10">TIDAK ADA REKOR YANG TERPECAHKAN PADA SESI INI.</p>}
                    </div>
                )}

                <footer className="pt-8 mt-12 border-t-2 border-black text-center opacity-70 text-[9px] font-bold uppercase tracking-widest">
                     DICETAK PADA: {new Date().toLocaleString('id-ID')} | SYSTEM BY R.E.A.C.T | HALAMAN 1
                </footer>
            </div>
        </div>
    );
};
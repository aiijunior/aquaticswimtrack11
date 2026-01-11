import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, Entry, Heat, Result, BrokenRecord, SwimRecord, EventEntry } from '../types';
import { RecordType, Gender } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { formatEventName, generateHeats, translateGender, translateSwimStyle } from '../constants';
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

const estimateHeatDuration = (distance: number): number => {
    if (distance <= 50) return 2 * 60 * 1000;
    if (distance <= 100) return 3 * 60 * 1000;
    if (distance <= 200) return 5 * 60 * 1000;
    return 5 * 60 * 1000;
};

// --- PRINTABLE COMPONENTS ---

// FIX: Added missing Medal component definition.
const Medal = ({ rank }: { rank: number }) => {
    if (rank === 1) return <span title="Emas">🥇</span>;
    if (rank === 2) return <span title="Perak">🥈</span>;
    if (rank === 3) return <span title="Perunggu">🥉</span>;
    return null;
};

const ReportHeader: React.FC<{ info: CompetitionInfo, title: string }> = ({ info, title }) => (
    <header className="border-b-2 border-gray-300 pb-4 mb-6 text-center">
        {info.eventLogo && <img src={info.eventLogo} alt="Event Logo" className="h-20 object-contain mx-auto mb-4" />}
        <div className="mb-4">
            {/* FIX: Cast eventName to string to fix line 109 error where .map was on potentially unknown/incorrectly inferred split result. */}
            {(info.eventName as string || '').split('\n').map((line, index) => (
                <p key={index} className={`font-bold uppercase tracking-tight ${index === 0 ? 'text-2xl' : 'text-sm'}`}>{line}</p>
            ))}
            <p className="text-lg text-gray-600 mt-1">{info.eventDate && new Date(info.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <h2 className="text-xl font-bold border-y border-black py-2 my-4 text-center bg-gray-50">{title}</h2>
    </header>
);

const PrintRecordRow: React.FC<{ record: SwimRecord | undefined; type: string; }> = ({ record, type }) => {
    const typeText = type.toUpperCase() === 'PORPROV' ? 'REKOR PORPROV' : 'REKOR NASIONAL';
    if (!record) return <p className="uppercase text-[9px] font-sans text-gray-400">{typeText} | TIDAK ADA REKOR</p>;
    const parts = [typeText, formatTime(record.time), record.holderName, record.yearSet, record.locationSet].filter(p => p != null && String(p).trim() !== '');
    return <p className="uppercase text-[9px] font-sans">{parts.join(' | ')}</p>;
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
                <div key={session}>
                    <h3 className="font-bold text-lg border-b mb-2">{session}</h3>
                    <table className="w-full text-sm">
                        <thead><tr className="border-b"><th className="text-left py-1 w-16">NO</th><th className="text-left">NOMOR LOMBA</th><th className="text-center w-24">PESERTA</th></tr></thead>
                        <tbody>
                            {sessionEvents.map(e => (
                                <tr key={e.id} className="border-b border-gray-100">
                                    <td className="py-1 font-bold">{e.globalEventNumber}</td>
                                    <td>{formatEventName(e)}</td>
                                    <td className="text-center">{e.entries.length}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

// 2. Buku Acara (Program)
const ProgramReport: React.FC<{ events: TimedEvent[], info: CompetitionInfo, records: SwimRecord[] }> = ({ events, info, records }) => {
    return (
        <div className="space-y-10">
            {events.map(event => {
                const porprov = records.find(r => r.type === RecordType.PORPROV && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
                const nasional = records.find(r => r.type === RecordType.NASIONAL && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
                
                return (
                    <div key={event.id} className="page-break-inside-avoid border-b pb-6">
                        <div className="bg-gray-100 p-2 font-bold text-sm flex justify-between">
                            <span>#{event.globalEventNumber} - {formatEventName(event)}</span>
                            {event.estimatedEventStartTime && <span>Estimasi: {new Date(event.estimatedEventStartTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                        <div className="my-1 px-2 border-l-2 border-gray-300">
                            <PrintRecordRow record={porprov} type="PORPROV" />
                            <PrintRecordRow record={nasional} type="NASIONAL" />
                        </div>
                        {(event.heatsWithTimes || []).map(heat => (
                            <div key={heat.heatNumber} className="mt-4">
                                <p className="text-center font-bold text-xs">Seri {heat.heatNumber} dari {event.heatsWithTimes?.length}</p>
                                <table className="w-full text-[11px] mt-1 border-collapse">
                                    <thead><tr className="bg-gray-50 border-y">
                                        <th className="w-10">LIN</th><th className="text-left">NAMA ATLET</th><th className="w-12">TAHUN</th><th className="text-left">TIM</th><th className="text-right w-20">SEED</th>
                                    </tr></thead>
                                    <tbody>
                                        {Array.from({ length: info.numberOfLanes || 8 }, (_, i) => i + 1).map(lane => {
                                            const ass = heat.assignments.find(a => a.lane === lane);
                                            return (
                                                <tr key={lane} className="border-b border-gray-50">
                                                    <td className="text-center font-bold">{lane}</td>
                                                    <td className="py-1">{ass ? ass.entry.swimmer.name : '-'}</td>
                                                    <td className="text-center">{ass ? ass.entry.swimmer.birthYear : '-'}</td>
                                                    <td>{ass ? ass.entry.swimmer.club : '-'}</td>
                                                    <td className="text-right font-mono">{ass ? formatTime(ass.entry.seedTime) : '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
};

// 3. Buku Hasil
const ResultsReport: React.FC<{ events: any[] }> = ({ events }) => (
    <div className="space-y-8">
        {events.map(event => (
            <div key={event.id} className="page-break-inside-avoid">
                <div className="bg-gray-800 text-white p-2 font-bold text-sm">#{event.globalEventNumber} - {formatEventName(event)}</div>
                <table className="w-full text-xs mt-2 border-collapse">
                    <thead><tr className="border-b-2">
                        <th className="w-10">RANK</th><th>NAMA ATLET</th><th>TIM</th><th className="text-right">HASIL</th><th className="w-10">MEDALI</th>
                    </tr></thead>
                    <tbody>
                        {event.detailedResults.map((r: any) => (
                            <tr key={r.swimmerId} className="border-b">
                                <td className="text-center font-bold">{r.rank || '-'}</td>
                                <td className="py-1">{r.swimmer?.name}</td>
                                <td>{r.swimmer?.club}</td>
                                <td className="text-right font-mono">{formatTime(r.time)}</td>
                                <td className="text-center"><Medal rank={r.rank} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
    </div>
);

// 4 & 5 & 6. Medals
const MedalsReport: React.FC<{ data: any[], title: string, showSwimmers?: boolean }> = ({ data, title, showSwimmers }) => (
    <div>
        <table className="w-full text-sm">
            <thead><tr className="border-b-2 bg-gray-100">
                <th className="w-10">#</th><th className="text-left">NAMA {showSwimmers ? 'ATLET' : 'TIM'}</th>{!showSwimmers && <th>TIM</th>}<th className="w-12">🥇</th><th className="w-12">🥈</th><th className="w-12">🥉</th><th className="w-12">TOTAL</th>
            </tr></thead>
            <tbody>
                {data.map((item, i) => (
                    <tr key={i} className="border-b">
                        <td className="text-center font-bold py-2">{i + 1}</td>
                        <td className="font-bold">{item.name || item.swimmer?.name}</td>
                        {!showSwimmers && <td>{item.swimmer?.club || '-'}</td>}
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

// --- MAIN COMPONENT ---
export const PrintView: React.FC<PrintViewProps> = ({ events, swimmers, competitionInfo, isLoading }) => {
    const [reportType, setReportType] = useState<ReportType>('schedule');
    const [records, setRecords] = useState<SwimRecord[]>([]);
    const { addNotification } = useNotification();

    useEffect(() => { getRecords().then(setRecords); }, []);

    // 1. Scheduled Events with Global numbering
    const scheduledEvents = useMemo(() => {
        return [...events]
            .filter(e => (e.sessionNumber || 0) > 0)
            .sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0) || (a.heatOrder || 0) - (b.heatOrder || 0))
            .map((e, i) => ({ ...e, globalEventNumber: i + 1 }));
    }, [events]);

    // 2. Program Book Data (with Heats)
    const programData = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        return scheduledEvents.map(event => {
            const entries: Entry[] = event.entries.map(en => ({ ...en, swimmer: swimmersMap.get(en.swimmerId)! })).filter(e => e.swimmer);
            const heats = generateHeats(entries, competitionInfo?.numberOfLanes || 8);
            
            // Basic timing estimation
            let runningTime = event.sessionDateTime ? new Date(event.sessionDateTime).getTime() : null;
            const heatsWithTimes = heats.map(h => {
                const th = { ...h, estimatedHeatStartTime: runningTime || undefined };
                if (runningTime) runningTime += estimateHeatDuration(event.distance);
                return th;
            });

            return { ...event, detailedEntries: entries, heatsWithTimes, estimatedEventStartTime: event.sessionDateTime ? new Date(event.sessionDateTime).getTime() : undefined };
        });
    }, [scheduledEvents, swimmers, competitionInfo]);

    // 3. Results Data
    const resultsData = useMemo(() => {
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        return scheduledEvents.map(event => {
            const valid = [...event.results].filter(r => r.time > 0).sort((a, b) => a.time - b.time);
            const detailed = [...event.results].sort((a, b) => {
                if (a.time > 0 && b.time > 0) return a.time - b.time;
                if (a.time > 0) return -1; if (b.time > 0) return 1;
                return b.time - a.time;
            }).map(r => ({
                ...r,
                swimmer: swimmersMap.get(r.swimmerId),
                rank: r.time > 0 ? valid.findIndex(v => v.swimmerId === r.swimmerId) + 1 : 0
            }));
            return { ...event, detailedResults: detailed };
        });
    }, [scheduledEvents, swimmers]);

    // 4. Broken Records
    const brokenRecords = useMemo(() => {
        const list: BrokenRecord[] = [];
        const swimmersMap = new Map(swimmers.map(s => [s.id, s]));
        resultsData.forEach(event => {
            const winner = event.detailedResults.find(r => r.rank === 1);
            if (winner && winner.swimmer) {
                [RecordType.PORPROV, RecordType.NASIONAL].forEach(type => {
                    const record = records.find(r => r.type === type && r.gender === event.gender && r.distance === event.distance && r.style === event.style && (r.category ?? null) === (event.category ?? null));
                    if (record && winner.time < record.time) {
                        list.push({ record, newEventName: formatEventName(event), newHolder: winner.swimmer, newTime: winner.time });
                    }
                });
            }
        });
        return list;
    }, [resultsData, records]);

    // 5. Medal Calculations
    const medalStats = useMemo(() => {
        const clubs: Record<string, any> = {};
        const individual: Record<string, any> = {};
        
        resultsData.forEach(event => {
            event.detailedResults.forEach(r => {
                if (r.rank >= 1 && r.rank <= 3 && r.swimmer) {
                    const cName = r.swimmer.club;
                    const sId = r.swimmer.id;
                    
                    if (!clubs[cName]) clubs[cName] = { name: cName, gold: 0, silver: 0, bronze: 0 };
                    if (!individual[sId]) individual[sId] = { swimmer: r.swimmer, gold: 0, silver: 0, bronze: 0 };
                    
                    const medal = r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : 'bronze';
                    clubs[cName][medal]++;
                    individual[sId][medal]++;
                }
            });
        });

        const sortFn = (a: any, b: any) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze;
        
        const sortedClubs = Object.values(clubs).sort(sortFn);
        const sortedIndividuals = Object.values(individual).sort(sortFn);
        
        const categoryLeaderboard = [...new Set(swimmers.map(s => s.ageGroup))].filter(Boolean).map(ku => ({
            ku,
            leaders: sortedIndividuals.filter(i => i.swimmer.ageGroup === ku).slice(0, 10)
        }));

        return { clubs: sortedClubs, individuals: sortedIndividuals, categoryLeaderboard };
    }, [resultsData, swimmers]);


    const handleExportExcel = () => {
        if (!XLSX) return alert("Pustaka Excel belum siap.");
        let data: any[] = [];
        let fileName = "Laporan";

        switch(reportType) {
            case 'schedule':
                data = scheduledEvents.map(e => ({ "NO ACARA": e.globalEventNumber, "NOMOR LOMBA": formatEventName(e), "PESERTA": e.entries.length }));
                fileName = "Susunan_Acara";
                break;
            case 'results':
                resultsData.forEach(e => e.detailedResults.forEach(r => data.push({
                    "NOMOR": e.globalEventNumber, "EVENT": formatEventName(e), "RANK": r.rank || '-', "ATLET": r.swimmer?.name, "TIM": r.swimmer?.club, "WAKTU": formatTime(r.time)
                })));
                fileName = "Hasil_Lomba_Lengkap";
                break;
            case 'clubMedals':
                data = medalStats.clubs.map((c, i) => ({ "NO": i+1, "TIM": c.name, "EMAS": c.gold, "PERAK": c.silver, "PERUNGGU": c.bronze, "TOTAL": c.gold+c.silver+c.bronze }));
                fileName = "Rekap_Medali_Klub";
                break;
            case 'swimmerTotal':
                data = medalStats.individuals.map((i, idx) => ({ "NO": idx+1, "ATLET": i.swimmer.name, "TIM": i.swimmer.club, "EMAS": i.gold, "PERAK": i.silver, "PERUNGGU": i.bronze, "TOTAL": i.gold+i.silver+i.bronze }));
                fileName = "Rekap_Medali_Atlet";
                break;
            case 'brokenRecords':
                data = brokenRecords.map(br => ({ "EVENT": br.newEventName, "REKOR LAMA": formatTime(br.record.time), "REKOR BARU": formatTime(br.newTime), "PEMEGANG BARU": br.newHolder.name, "TIM": br.newHolder.club }));
                fileName = "Rekor_Terpecahkan";
                break;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

    if (isLoading || !competitionInfo) return <div className="flex justify-center p-20"><Spinner /></div>;

    const reportTitles: Record<ReportType, string> = {
        schedule: 'SUSUNAN ACARA (ORDER OF EVENTS)',
        program: 'BUKU ACARA (MEET PROGRAM)',
        results: 'BUKU HASIL LOMBA (MEET RESULTS)',
        clubMedals: 'REKAPITULASI MEDALI KLUB',
        clubSwimmerMedals: 'REKAPITULASI MEDALI KLUB & ATLET',
        swimmerTotal: 'REKAPITULASI MEDALI ATLET (TOTAL)',
        swimmerCategory: 'KLASEMEN PERORANGAN (PER KATEGORI)',
        brokenRecords: 'DAFTAR REKOR TERPECAHKAN'
    };

    return (
        <div className="print-view-container">
            <div className="no-print mb-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Pilih Laporan Cetak</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                        {Object.entries(reportTitles).map(([key, title]) => (
                            <button
                                key={key}
                                onClick={() => setReportType(key as ReportType)}
                                className={`text-left p-3 rounded-lg border-2 transition-all text-xs font-bold uppercase tracking-tighter ${reportType === key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`}
                            >
                                {title.replace(/\(.*\)/, '')}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-border gap-4">
                        <div className="flex gap-2">
                             <Button onClick={() => window.print()} className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-14a2 2 0 10-4 0v4a2 2 0 104 0V3z" /></svg>
                                Cetak / Simpan PDF
                            </Button>
                            <Button onClick={handleExportExcel} variant="secondary" className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Unduh Excel
                            </Button>
                        </div>
                        <p className="text-[10px] text-text-secondary uppercase font-bold italic">Gunakan Ctrl+P untuk mencetak</p>
                    </div>
                </Card>
            </div>

            <div className="print-only bg-white text-black p-4 min-h-screen">
                <ReportHeader info={competitionInfo} title={reportTitles[reportType]} />
                
                {reportType === 'schedule' && <ScheduleReport events={scheduledEvents} />}
                {reportType === 'program' && <ProgramReport events={programData} info={competitionInfo} records={records} />}
                {reportType === 'results' && <ResultsReport events={resultsData} />}
                {reportType === 'clubMedals' && <MedalsReport data={medalStats.clubs} title="Medali Klub" />}
                {reportType === 'swimmerTotal' && <MedalsReport data={medalStats.individuals} title="Medali Atlet" showSwimmers />}
                {reportType === 'brokenRecords' && (
                    <div className="space-y-4">
                        {brokenRecords.map((br, i) => (
                            <div key={i} className="p-4 border-2 border-black rounded">
                                <p className="font-bold text-lg">{br.newEventName}</p>
                                <p className="text-xl font-black">{br.newHolder.name} ({br.newHolder.club})</p>
                                <p className="font-mono text-2xl mt-2">{formatTime(br.newTime)}</p>
                                <p className="text-xs mt-2 uppercase">Memecahkan Rekor {br.record.type} ({formatTime(br.record.time)}) - {br.record.holderName}</p>
                            </div>
                        ))}
                    </div>
                )}
                {reportType === 'swimmerCategory' && (
                    <div className="space-y-10">
                        {medalStats.categoryLeaderboard.map(cat => (
                            <div key={cat.ku}>
                                <h3 className="bg-gray-200 p-2 font-bold uppercase mb-2">KATEGORI: {cat.ku || 'UMUM'}</h3>
                                <MedalsReport data={cat.leaders} title="" showSwimmers />
                            </div>
                        ))}
                    </div>
                )}
                {reportType === 'clubSwimmerMedals' && (
                    <div className="space-y-10">
                        {medalStats.clubs.map(club => (
                            <div key={club.name}>
                                <h3 className="bg-gray-800 text-white p-2 font-bold uppercase mb-2">{club.name} (E:{club.gold} P:{club.silver} Pr:{club.bronze})</h3>
                                <MedalsReport 
                                    data={medalStats.individuals.filter(i => i.swimmer.club === club.name)} 
                                    title="" 
                                    showSwimmers 
                                />
                            </div>
                        ))}
                    </div>
                )}

                <footer className="pt-8 mt-12 border-t-2 border-gray-300 text-center opacity-50 text-[10px]">
                     DICETAK PADA: {new Date().toLocaleString('id-ID')} | DIDUKUNG OLEH R.E.A.C.T SYSTEM
                </footer>
            </div>
        </div>
    );
};

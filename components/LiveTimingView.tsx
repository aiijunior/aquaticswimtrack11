

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SwimEvent, Swimmer, Result, Heat, Entry, CompetitionInfo } from '../types';
import { getEventById, addOrUpdateEventResults } from '../services/databaseService';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Input } from './ui/Input';
import { formatEventName, generateHeats, formatTime, parseMsToTimeParts } from '../constants';
import { useNotification } from './ui/NotificationManager';

interface LiveTimingViewProps {
  eventId: string;
  onBack: () => void;
  onDataUpdate: () => void;
  swimmers: Swimmer[];
  competitionInfo: CompetitionInfo | null;
}

const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const PauseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const StopIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" /></svg>;
const ResetIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9a9 9 0 0114.24-4.76L20 5M20 15a9 9 0 01-14.24 4.76L4 19" /></svg>;

export const LiveTimingView: React.FC<LiveTimingViewProps> = ({ eventId, onBack, onDataUpdate, swimmers, competitionInfo }) => {
    const [event, setEvent] = useState<SwimEvent | null>(null);
    const [heats, setHeats] = useState<Heat[]>([]);
    const [currentHeatIndex, setCurrentHeatIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [times, setTimes] = useState<Record<string, { min: string, sec: string, ms: string }>>({});
    const [dqSwimmers, setDqSwimmers] = useState(new Set<string>());
    const [nsSwimmers, setNsSwimmers] = useState(new Set<string>());
    const [flashingLane, setFlashingLane] = useState<string | null>(null);
    const { addNotification } = useNotification();

    // Stopwatch state
    const [stopwatchTime, setStopwatchTime] = useState(0);
    const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
    const animationFrameId = useRef<number | undefined>(undefined);
    const startTimeRef = useRef(0);
    const pausedTimeRef = useRef(0);

    const fetchAndSetupEvent = useCallback(async () => {
        setIsLoading(true);
        const eventData = await getEventById(eventId);
        if (eventData) {
            setEvent(eventData);
            const detailedEntries: Entry[] = eventData.entries
                .map(entry => ({...entry, swimmer: swimmers.find(s => s.id === entry.swimmerId)!}))
                .filter(e => e.swimmer);
            
            const lanes = competitionInfo?.numberOfLanes || 8;
            const generated = generateHeats(detailedEntries, lanes);
            setHeats(generated);

            const initialTimes: Record<string, { min: string, sec: string, ms: string }> = {};
            const initialDq = new Set<string>();
            const initialNs = new Set<string>();
            detailedEntries.forEach(entry => { 
                const existingResult = eventData.results.find(r => r.swimmerId === entry.swimmerId);
                if (existingResult) {
                    if (existingResult.time === -1) {
                        initialDq.add(entry.swimmerId);
                        initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                    } else if (existingResult.time === -2) {
                        initialNs.add(entry.swimmerId);
                        initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                    } else if (existingResult.time < 0) {
                        initialDq.add(entry.swimmerId);
                        initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                    } else {
                        initialTimes[entry.swimmerId] = parseMsToTimeParts(existingResult.time);
                    }
                } else {
                    initialTimes[entry.swimmerId] = { min: '0', sec: '0', ms: '000'};
                }
            });
            setTimes(initialTimes);
            setDqSwimmers(initialDq);
            setNsSwimmers(initialNs);
        }
        setIsLoading(false);
    }, [eventId, swimmers, competitionInfo]);
    
    useEffect(() => {
        fetchAndSetupEvent();
    }, [fetchAndSetupEvent]);
    
    // Stopwatch Runner Effect
    useEffect(() => {
        const runStopwatch = (timestamp: number) => {
            const elapsed = timestamp - startTimeRef.current;
            setStopwatchTime(pausedTimeRef.current + elapsed);
            animationFrameId.current = requestAnimationFrame(runStopwatch);
        };
    
        if (isStopwatchRunning) {
            startTimeRef.current = performance.now();
            animationFrameId.current = requestAnimationFrame(runStopwatch);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        }
    
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isStopwatchRunning]);

    const handleStartStop = () => {
        if (isStopwatchRunning) { // Stopping
            pausedTimeRef.current = stopwatchTime;
        }
        setIsStopwatchRunning(!isStopwatchRunning);
    };

    const handleReset = () => {
        setIsStopwatchRunning(false);
        setStopwatchTime(0);
        pausedTimeRef.current = 0;
        startTimeRef.current = 0;
    };
    
    const handleTapLane = (swimmerId: string) => {
        if (!isStopwatchRunning) return;
        setTimes(prev => ({
            ...prev,
            [swimmerId]: parseMsToTimeParts(stopwatchTime)
        }));
        setFlashingLane(swimmerId);
        setTimeout(() => setFlashingLane(null), 1500);
    };

    const handleTimeChange = (swimmerId: string, part: 'min' | 'sec' | 'ms', value: string) => {
        setTimes(prev => ({
            ...prev,
            [swimmerId]: { ...prev[swimmerId], [part]: value }
        }));
    };
    
    const handleToggleDq = (swimmerId: string) => {
        const newDqSwimmers = new Set(dqSwimmers);
        const newNsSwimmers = new Set(nsSwimmers);

        if (newDqSwimmers.has(swimmerId)) {
            newDqSwimmers.delete(swimmerId);
        } else {
            newDqSwimmers.add(swimmerId);
            newNsSwimmers.delete(swimmerId); // Ensure NS is off
        }
        setDqSwimmers(newDqSwimmers);
        setNsSwimmers(newNsSwimmers);
    };
    
    const handleToggleNs = (swimmerId: string) => {
        const newNsSwimmers = new Set(nsSwimmers);
        const newDqSwimmers = new Set(dqSwimmers);
        
        if (newNsSwimmers.has(swimmerId)) {
            newNsSwimmers.delete(swimmerId);
        } else {
            newNsSwimmers.add(swimmerId);
            newDqSwimmers.delete(swimmerId); // Ensure DQ is off
        }
        setNsSwimmers(newNsSwimmers);
        setDqSwimmers(newDqSwimmers);
    };

    const handleSaveResults = async () => {
        const currentHeat = heats[currentHeatIndex];
        if (!currentHeat) return;
        
        setIsSaving(true);
        try {
            const resultsToSave: Result[] = currentHeat.assignments
                .map(a => {
                    const time = times[a.entry.swimmerId];
                    if (dqSwimmers.has(a.entry.swimmerId)) {
                        return { swimmerId: a.entry.swimmerId, time: -1 };
                    }
                     if (nsSwimmers.has(a.entry.swimmerId)) {
                        return { swimmerId: a.entry.swimmerId, time: -2 };
                    }
                    if (!time) return { swimmerId: a.entry.swimmerId, time: -2 }; // Default to NS if no time object
                    const ms = (parseInt(time.min || '0') * 60 * 1000) + (parseInt(time.sec || '0') * 1000) + parseInt(time.ms || '0');
                    
                    // Treat a final time of 0 as a "No Show" or invalid time, rather than a valid result.
                    if (ms === 0) {
                        return { swimmerId: a.entry.swimmerId, time: -2 }; // NS
                    }
                    return { swimmerId: a.entry.swimmerId, time: ms };
                });
            
            await addOrUpdateEventResults(eventId, resultsToSave);
            addNotification(`Hasil untuk Seri ${currentHeat.heatNumber} berhasil disimpan.`, 'info');
            onDataUpdate();
            await fetchAndSetupEvent();
        } catch (error: any) {
            addNotification(`Gagal menyimpan hasil: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const formattedStopwatchTime = useMemo(() => {
        if (stopwatchTime === 0 && !isStopwatchRunning) {
            return '00:00.00';
        }
        return formatTime(stopwatchTime);
    }, [stopwatchTime, isStopwatchRunning]);

    if (isLoading) return <div className="flex justify-center mt-8"><Spinner /></div>;
    if (!event) return <p>Nomor lomba tidak ditemukan.</p>;
    
    const currentHeat = heats[currentHeatIndex];

    return (
        <div>
            <Button onClick={onBack} variant="secondary" className="mb-4">&larr; Kembali</Button>
            <h1 className="text-3xl font-bold">{formatEventName(event)}</h1>
            <h2 className="text-xl text-text-secondary">Chrono-Mode</h2>
            
            <Card className="my-6">
                <div className="text-center">
                    <p className="text-8xl font-mono tracking-tighter text-primary">{formattedStopwatchTime}</p>
                    <div className="flex justify-center space-x-4 mt-4">
                        <Button onClick={handleStartStop} className="px-6 py-3 text-lg">
                            {isStopwatchRunning ? <PauseIcon /> : <PlayIcon />}
                            <span className="ml-2">{isStopwatchRunning ? 'Pause' : 'Start'}</span>
                        </Button>
                        <Button onClick={handleReset} variant="secondary" className="px-6 py-3 text-lg">
                            <ResetIcon />
                            <span className="ml-2">Reset</span>
                        </Button>
                    </div>
                </div>
            </Card>

            {heats.length > 0 && currentHeat ? (
                <>
                <Card className="my-6">
                    <div className="flex justify-between items-center mb-4">
                        <Button onClick={() => setCurrentHeatIndex(p => p - 1)} disabled={currentHeatIndex === 0}>&larr; Seri Sebelumnya</Button>
                        <h2 className="text-2xl font-bold text-center">Seri {currentHeat.heatNumber} dari {heats.length}</h2>
                        <Button onClick={() => setCurrentHeatIndex(p => p + 1)} disabled={currentHeatIndex === heats.length - 1}>Seri Berikutnya &rarr;</Button>
                    </div>
                </Card>

                <div className="space-y-3">
                    {currentHeat.assignments.map(({ lane, entry }) => {
                        const isDq = dqSwimmers.has(entry.swimmer.id);
                        const isNs = nsSwimmers.has(entry.swimmer.id);
                        const isDisabled = isDq || isNs;
                         return (
                         <div key={lane} className={`p-2 rounded-lg grid grid-cols-12 gap-x-3 items-center ${isDq ? 'bg-red-900/50' : isNs ? 'bg-gray-700/50' : 'bg-surface'} ${flashingLane === entry.swimmer.id ? 'flash-animation' : ''} border border-border`}>
                            <div className="col-span-1 font-bold text-2xl text-center text-text-secondary">{lane}</div>
                            <div className="col-span-11 sm:col-span-5">
                                <p className="font-semibold text-lg text-text-primary">{entry.swimmer.name}</p>
                                <p className="text-sm text-text-secondary">{entry.swimmer.club}</p>
                            </div>
                            <div className="col-span-8 sm:col-span-4 flex items-center bg-background rounded-md p-1 border border-border">
                                <Input aria-label="Minutes" className="w-1/3" label="" id={`min-${entry.swimmer.id}`} type="number" min="0" value={times[entry.swimmer.id]?.min || '0'} onChange={e => handleTimeChange(entry.swimmer.id, 'min', e.target.value)} disabled={isDisabled} />
                                <span className="px-1 text-text-secondary">:</span>
                                <Input aria-label="Seconds" className="w-1/3" label="" id={`sec-${entry.swimmer.id}`} type="number" min="0" max="59" value={times[entry.swimmer.id]?.sec || '0'} onChange={e => handleTimeChange(entry.swimmer.id, 'sec', e.target.value)} disabled={isDisabled} />
                                <span className="px-1 text-text-secondary">.</span>
                                <Input aria-label="Milliseconds" className="w-1/3" label="" id={`ms-${entry.swimmer.id}`} type="number" min="0" max="999" value={times[entry.swimmer.id]?.ms || '0'} onChange={e => handleTimeChange(entry.swimmer.id, 'ms', e.target.value)} disabled={isDisabled} />
                            </div>
                            <div className="col-span-4 sm:col-span-2 flex items-center justify-end space-x-2">
                                <Button onClick={() => handleToggleNs(entry.swimmer.id)} className={`px-4 py-2 ${isNs ? 'bg-slate-500' : 'bg-slate-700'}`}>NS</Button>
                                <Button onClick={() => handleToggleDq(entry.swimmer.id)} className={`px-4 py-2 ${isDq ? 'bg-red-600' : 'bg-yellow-600'}`}>DQ</Button>
                                <button
                                    onClick={() => handleTapLane(entry.swimmer.id)}
                                    disabled={!isStopwatchRunning}
                                    className="w-12 h-12 rounded-full flex items-center justify-center bg-primary hover:bg-primary-hover text-white disabled:bg-secondary disabled:cursor-not-allowed transition-colors"
                                    aria-label={`Tap to record time for lane ${lane}`}
                                >
                                    <span className="font-bold">TAP</span>
                                </button>
                            </div>
                         </div>
                         );
                    })}
                </div>
                <div className="mt-8 pt-4 border-t border-border flex justify-end">
                    <Button onClick={handleSaveResults} disabled={isSaving} className="px-6 py-3 text-lg">
                       {isSaving ? <Spinner /> : 'Simpan Hasil Seri Ini'}
                    </Button>
                </div>
                </>
            ) : (
                <Card className="mt-6 text-center py-10 text-text-secondary">
                    Tidak ada peserta terdaftar untuk nomor lomba ini.
                </Card>
            )}
        </div>
    );
};
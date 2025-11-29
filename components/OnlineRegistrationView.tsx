import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration, findSwimmerByName } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, formatTime, translateSwimStyle, AGE_GROUP_OPTIONS } from '../constants';
import { SwimStyle, Gender } from '../types';

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

interface OnlineRegistrationResponse {
    success: boolean;
    message: string;
    swimmer: Swimmer | null;
    previouslyRegisteredEvents?: FormattableEvent[];
}

const parseTimeToMs = (time: RegistrationTime): number => {
    const minutes = parseInt(time.min, 10) || 0;
    const seconds = parseInt(time.sec, 10) || 0;
    const hundredths = parseInt(time.ms, 10) || 0;
    if (minutes === 99 && seconds === 99 && hundredths === 99) {
        return 0; // Treat as No Time
    }
    return (minutes * 60 * 1000) + (seconds * 1000) + (hundredths * 10);
};

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);


export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
    competitionInfo,
    onBackToLogin,
    onRegistrationSuccess,
}) => {
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male' as 'Male' | 'Female',
        club: '',
        ageGroup: '',
    });
    const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    
    // State for auto-fill feature
    const [isCheckingName, setIsCheckingName] = useState(false);
    const [existingSwimmer, setExistingSwimmer] = useState<Swimmer | null>(null);

    // State for deadline countdown
    const [timeLeft, setTimeLeft] = useState('');
    const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
    
    // State for accordion
    const [openAccordion, setOpenAccordion] = useState<SwimStyle | null>(null);

    // Explicitly typed options for rendering to prevent type errors
    const ageGroupOptions: string[] = AGE_GROUP_OPTIONS as string[];

    useEffect(() => {
        const fetchEvents = async () => {
            setIsDataLoading(true);
            const onlineEvents = await getEventsForRegistration();
            setLocalEvents(onlineEvents);
            setIsDataLoading(false);
        };

        fetchEvents();
    }, []);
    
    useEffect(() => {
        if (!competitionInfo?.registrationDeadline) {
            setIsDeadlinePassed(false);
            setTimeLeft('');
            return;
        }

        const deadline = new Date(competitionInfo.registrationDeadline);

        const updateCountdown = () => {
            const now = new Date();
            const difference = deadline.getTime() - now.getTime();

            if (difference <= 0) {
                setIsDeadlinePassed(true);
                setTimeLeft('Batas waktu pendaftaran telah berakhir.');
                if (intervalId) clearInterval(intervalId);
                return;
            }

            const days = Math.floor(difference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);

            setTimeLeft(`${days} hari ${hours} jam ${minutes} menit ${seconds} detik`);
        };

        updateCountdown();
        const intervalId = setInterval(updateCountdown, 1000);

        return () => clearInterval(intervalId);
    }, [competitionInfo?.registrationDeadline]);
    
    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '';
        // FIX: Explicitly type `e` to resolve 'unknown' type error.
        const hasSelectedEvent = Object.values(selectedEvents).some((e: { selected: boolean; }) => e.selected);
        return hasPersonalInfo && hasSelectedEvent;
    }, [formData, selectedEvents]);
    
    const availableEvents = useMemo(() => {
        const registeredEventIds = new Set<string>();
        if (existingSwimmer) {
            localEvents.forEach(event => {
                if (event.entries.some(entry => entry.swimmerId === existingSwimmer.id)) {
                    registeredEventIds.add(event.id);
                }
            });
        }

        return localEvents
            .filter((event: SwimEvent) => {
                if (registeredEventIds.has(event.id)) return false;
                return event.gender === "Mixed" || (formData.gender === "Male" && event.gender === "Men's") || (formData.gender === "Female" && event.gender === "Women's");
            })
            .sort((a,b) => a.distance - b.distance || a.style.localeCompare(b.style));
    }, [localEvents, formData.gender, existingSwimmer]);

    const groupedAvailableEvents = useMemo(() => {
        return availableEvents.reduce((acc: Record<SwimStyle, SwimEvent[]>, event: SwimEvent) => {
            const style = event.style;
            if (!acc[style]) {
                acc[style] = [];
            }
            acc[style].push(event);
            return acc;
        }, {} as Record<SwimStyle, SwimEvent[]>);
    }, [availableEvents]);
    
    const selectedEventCount = useMemo(() => {
        return Object.values(selectedEvents).filter((e: { selected: boolean }) => e.selected).length;
    }, [selectedEvents]);


    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let finalValue: string | number = value;

        if (name === 'birthYear') {
            finalValue = parseInt(value);
        } else if (name === 'name' || name === 'club') {
            finalValue = toTitleCase(value);
        }

        setFormData(prev => ({ ...prev, [name]: finalValue }));
        setError('');
        setSuccessMessage('');
    };

    const handleEventSelectionChange = (eventId: string) => {
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                selected: !prev[eventId]?.selected,
                time: prev[eventId]?.time || { min: '99', sec: '99', ms: '99' },
            },
        }));
    };

    const handleTimeChange = (eventId: string, part: keyof RegistrationTime, value: string) => {
        setSelectedEvents(prev => {
            const currentEvent = prev[eventId] || { selected: true, time: { min: '99', sec: '99', ms: '99' } };
            return {
                ...prev,
                [eventId]: {
                    ...currentEvent,
                    time: { ...currentEvent.time, [part]: value },
                },
            };
        });
    };

    const handleSetNoTime = (eventId: string) => {
        handleTimeChange(eventId, 'min', '99');
        handleTimeChange(eventId, 'sec', '99');
        handleTimeChange(eventId, 'ms', '99');
    };

    const handleNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const swimmerName = e.target.value.trim();
        if (swimmerName.length < 3) {
            if (existingSwimmer) {
                setExistingSwimmer(null);
                setFormData(prev => ({ ...prev, club: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', ageGroup: '' }));
            }
            return;
        }
        setIsCheckingName(true);
        const foundSwimmer = await findSwimmerByName(swimmerName);
        setIsCheckingName(false);
        if (foundSwimmer) {
            setFormData({
                name: foundSwimmer.name,
                club: foundSwimmer.club,
                birthYear: foundSwimmer.birthYear,
                gender: foundSwimmer.gender,
                ageGroup: foundSwimmer.ageGroup || '',
            });
            setExistingSwimmer(foundSwimmer);
        } else if (existingSwimmer) {
            clearAutoFilledData();
        }
    };
    
    const clearAutoFilledData = () => {
        setExistingSwimmer(null);
        setFormData(prev => ({ ...prev, club: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', ageGroup: '' }));
        setTimeout(() => document.getElementById('club')?.focus(), 0);
    };

    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsSubmitting(true);

        if (!formData.name.trim() || !formData.club.trim()) {
            setError('Nama atlet dan nama tim wajib diisi.');
            setIsSubmitting(false);
            return;
        }

        const registrationsToSubmit = [];
        for (const [eventId, val] of Object.entries(selectedEvents)) {
            const eventValue = val as { selected: boolean; time: RegistrationTime };
            if (eventValue.selected) {
                const min = parseInt(eventValue.time.min, 10) || 0;
                const sec = parseInt(eventValue.time.sec, 10) || 0;
                const ms = parseInt(eventValue.time.ms, 10) || 0;

                if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
                    const eventDetails = availableEvents.find(e => e.id === eventId);
                    const eventName = eventDetails ? formatEventName(eventDetails) : `nomor lomba ID ${eventId}`;
                    setError(`Error pada ${eventName}: Input detik harus di bawah 60.`);
                    setIsSubmitting(false);
                    return;
                }

                registrationsToSubmit.push({
                    eventId,
                    seedTime: parseTimeToMs(eventValue.time),
                });
            }
        }

        if (registrationsToSubmit.length === 0) {
            setError('Anda harus memilih setidaknya satu nomor lomba.');
            setIsSubmitting(false);
            return;
        }

        const result: OnlineRegistrationResponse = await processOnlineRegistration(formData, registrationsToSubmit);
        setIsSubmitting(false);

        if (result.success && result.swimmer) {
            const swimmerName = result.swimmer.name;

            // Newly registered events formatted with their seed time
            const newlyRegisteredEventsList = registrationsToSubmit.map(reg => {
                const event = localEvents.find(e => e.id === reg.eventId);
                const eventName = event ? formatEventName(event) : 'Nomor Lomba Tidak Dikenal';
                const time = formatTime(reg.seedTime);
                return `• ${eventName} (Waktu: ${time})`;
            });

            // Previously registered events (without seed time, as we don't have it easily)
            // FIX: Explicitly type the 'event' parameter to resolve 'unknown' type error and handle snake_case property from server response.
            const previouslyRegisteredEventsList = (result.previouslyRegisteredEvents || []).map((event: any) => {
                const formattableEvent: FormattableEvent = {
                    distance: event.distance,
                    style: event.style,
                    gender: event.gender,
                    relayLegs: event.relay_legs, // Use snake_case from server
                    category: event.category,
                };
                return `• ${formatEventName(formattableEvent)}`;
            });

            // Combine all event strings and sort them for a clean list
            const allRegisteredEventsString = [
                ...newlyRegisteredEventsList,
                ...previouslyRegisteredEventsList,
            ].sort().join('\n');

            const successText = (
                <div className="text-left">
                    <p className="font-bold text-lg mb-2">Pendaftaran untuk {swimmerName} berhasil!</p>
                    <p className="mb-2">Anda sekarang terdaftar di nomor lomba berikut:</p>
                    <pre className="bg-background p-2 rounded-md text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {allRegisteredEventsString}
                    </pre>
                </div>
            );

            setSuccessMessage(successText as any); // Cast to any to allow ReactNode
            onRegistrationSuccess();

            // Reset form for next entry
            setFormData({
                name: '',
                birthYear: new Date().getFullYear() - 10,
                gender: 'Male',
                club: '',
                ageGroup: '',
            });
            setSelectedEvents({});
            setExistingSwimmer(null);

        } else {
            setError(result.message || 'Terjadi kesalahan yang tidak diketahui.');
        }
    };
    
    const isRegistrationDisabled = isDeadlinePassed || !competitionInfo?.isRegistrationOpen;

    if (isDataLoading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <Spinner />
                <p className="text-text-secondary mt-4">Memuat data kompetisi...</p>
            </div>
        );
    }
    
     if (isRegistrationDisabled && !isDataLoading) {
        return (
             <div className="min-h-screen bg-gradient-to-br from-gray-100 to-slate-200 dark:from-slate-800 dark:to-gray-900 flex flex-col items-center justify-center p-4 text-center">
                <Card className="max-w-xl">
                    <h1 className="text-2xl font-bold text-primary mb-4">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <p className="text-lg text-red-500 font-semibold mb-2">Pendaftaran Online Saat Ini Ditutup</p>
                    <p className="text-text-secondary mb-6">
                        {timeLeft || 'Pendaftaran untuk kompetisi ini belum dibuka atau sudah berakhir. Silakan hubungi panitia untuk informasi lebih lanjut.'}
                    </p>
                    <Button onClick={onBackToLogin}>Kembali ke Halaman Utama</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                 <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo Acara" className="mx-auto h-20 md:h-24 object-contain mb-4" />}
                    {competitionInfo && (
                        <div>
                            <h1 className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{competitionInfo.eventName.split('\n')[0]}</h1>
                            <h2 className="text-xl md:text-2xl font-semibold text-text-secondary tracking-wide mt-1">{competitionInfo.eventName.split('\n')[1]}</h2>
                        </div>
                    )}
                    <h3 className="text-2xl font-bold text-text-primary mt-4">Formulir Pendaftaran Online</h3>
                </header>

                {timeLeft && (
                    <Card className="text-center mb-4 border-primary/50 bg-primary/5">
                        <p className="font-semibold text-text-secondary">Sisa Waktu Pendaftaran:</p>
                        <p className="text-2xl font-bold text-primary">{timeLeft}</p>
                    </Card>
                )}

                {!successMessage ? (
                    <form onSubmit={handleSubmit}>
                        <Card className="mb-4">
                            <h2 className="text-xl font-bold mb-4">Data Atlet</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Input label="Nama Lengkap Atlet" id="name" name="name" value={formData.name} onChange={handleFormChange} onBlur={handleNameBlur} required />
                                    {isCheckingName && <p className="text-xs text-text-secondary mt-1">Mencari data atlet...</p>}
                                    {existingSwimmer && (
                                        <div className="text-xs text-green-600 dark:text-green-400 mt-1 p-2 bg-green-500/10 rounded-md">
                                            Data ditemukan dan diisi otomatis. Bukan atlet yang benar?{' '}
                                            <button type="button" onClick={clearAutoFilledData} className="underline font-semibold">Klik di sini</button> untuk mengisi manual.
                                        </div>
                                    )}
                                </div>
                                <Input label="Nama Tim" id="club" name="club" value={formData.club} onChange={handleFormChange} required />
                                <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                    <option value="Male">Laki-laki (Male)</option>
                                    <option value="Female">Perempuan (Female)</option>
                                </Select>
                                 <Select label="Kelompok Umur (KU) (Opsional)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange}>
                                    <option value="">-- Tanpa KU --</option>
                                    {/* FIX: Add explicit type to callback parameter to resolve type inference issue. */}
                                    {ageGroupOptions.map((ku: string) => <option key={ku} value={ku}>{ku}</option>)}
                                 </Select>
                            </div>
                        </Card>
                        
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Pilih Nomor Lomba</h2>
                            {Object.entries(groupedAvailableEvents).length > 0 ? (
                                <div className="space-y-2">
                                    {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]) => (
                                        <div key={style} className="border border-border rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => handleAccordionToggle(style as SwimStyle)}
                                                className="w-full flex justify-between items-center p-4 bg-background hover:bg-surface/50"
                                            >
                                                <h3 className="text-lg font-semibold">{translateSwimStyle(style as SwimStyle)}</h3>
                                                <ChevronDownIcon isOpen={openAccordion === style} />
                                            </button>
                                            {openAccordion === style && (
                                                <div className="p-4 space-y-4">
                                                    {eventsInStyle.map(event => (
                                                        <div key={event.id} className="border-b border-border last:border-b-0 pb-4 last:pb-0">
                                                            <div className="flex items-start">
                                                                <input
                                                                    type="checkbox"
                                                                    id={`event-${event.id}`}
                                                                    checked={selectedEvents[event.id]?.selected || false}
                                                                    onChange={() => handleEventSelectionChange(event.id)}
                                                                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary mt-1"
                                                                />
                                                                <label htmlFor={`event-${event.id}`} className="ml-3 flex-grow">
                                                                    <span className="font-semibold text-text-primary">{formatEventName(event)}</span>
                                                                </label>
                                                            </div>
                                                            {selectedEvents[event.id]?.selected && (
                                                                <div className="mt-2 ml-8 grid grid-cols-3 md:grid-cols-4 gap-2 items-end">
                                                                    <Input label="Menit" id={`min-${event.id}`} type="number" min="0" value={selectedEvents[event.id].time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                    <Input label="Detik" id={`sec-${event.id}`} type="number" min="0" max="99" value={selectedEvents[event.id].time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                    <Input label="ss/100" id={`ms-${event.id}`} type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                    <Button type="button" variant="secondary" onClick={() => handleSetNoTime(event.id)} className="whitespace-nowrap">No Time</Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-text-secondary text-center py-4">Tidak ada nomor lomba yang tersedia untuk jenis kelamin yang dipilih, atau semua nomor lomba sudah terdaftar.</p>
                            )}
                        </Card>
                        
                        <div className="mt-6">
                            {error && <p className="text-red-500 text-center mb-4 font-semibold">{error}</p>}
                             <Card className="sticky bottom-4 z-10 shadow-2xl">
                                <div className="flex justify-between items-center">
                                    <p className="text-text-secondary"><span className="font-bold text-text-primary">{selectedEventCount}</span> nomor lomba dipilih.</p>
                                    <Button type="submit" disabled={isSubmitting || !isFormValid}>
                                        {isSubmitting ? <Spinner /> : 'Kirim Pendaftaran'}
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    </form>
                ) : (
                     <Card>
                        <div className="text-center p-4">
                            <div className="text-green-500 mx-auto h-16 w-16 mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="text-text-primary">{successMessage}</div>
                            <Button onClick={() => setSuccessMessage('')} className="mt-6">Daftarkan Atlet Lain</Button>
                        </div>
                    </Card>
                )}
                
                <footer className="text-center p-4 mt-8">
                    <Button variant="secondary" onClick={onBackToLogin}>
                        &larr; Kembali ke Halaman Utama
                    </Button>
                </footer>
            </div>
        </div>
    );
};

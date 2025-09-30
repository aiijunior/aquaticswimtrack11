import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration, findSwimmerByName } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, formatTime, translateSwimStyle } from '../constants';
import { SwimStyle, Gender } from '../types';

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

// FIX: Define the response type for processOnlineRegistration to ensure type safety.
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
        const hasSelectedEvent = Object.values(selectedEvents).some((e: { selected: boolean }) => e.selected);
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
            .filter(event => {
                if (registeredEventIds.has(event.id)) return false;
                return event.gender === "Mixed" || (formData.gender === "Male" && event.gender === "Men's") || (formData.gender === "Female" && event.gender === "Women's");
            })
            .sort((a,b) => a.distance - b.distance || a.style.localeCompare(b.style));
    }, [localEvents, formData.gender, existingSwimmer]);

    const groupedAvailableEvents = useMemo(() => {
        // FIX: Add explicit type to the reduce accumulator to ensure correct type inference.
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
        // FIX: Explicitly type `e` to resolve 'unknown' type error.
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
        // FIX: Rewrote state update to be safer and avoid spreading potentially undefined values, which could cause runtime errors and type issues.
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
                setFormData(prev => ({ ...prev, club: '', birthYear: new Date().getFullYear() - 10, gender: 'Male' }));
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
            });
            setExistingSwimmer(foundSwimmer);
        } else if (existingSwimmer) {
            clearAutoFilledData();
        }
    };
    
    const clearAutoFilledData = () => {
        setExistingSwimmer(null);
        setFormData(prev => ({ ...prev, club: '', birthYear: new Date().getFullYear() - 10, gender: 'Male' }));
        setTimeout(() => document.getElementById('club')?.focus(), 0);
    };

    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsSubmitting(true);

        if (!formData.name.trim() || !formData.club.trim()) {
            setError('Nama lengkap dan klub/tim wajib diisi.');
            setIsSubmitting(false);
            return;
        }

        const registrationsToSubmit = [];
        for (const [eventId, val] of Object.entries(selectedEvents)) {
            // FIX: Explicitly type `val` to resolve `unknown` type errors.
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
            // FIX: Cast `result.previouslyRegisteredEvents` to resolve 'unknown' type error on `.map`.
            const previouslyRegisteredEventsList = ((result.previouslyRegisteredEvents || []) as FormattableEvent[]).map((event: FormattableEvent) => {
                const formattableEvent: FormattableEvent = {
                    distance: event.distance,
                    style: event.style,
                    gender: event.gender,
                    relayLegs: event.relayLegs,
                    category: event.category,
                };
                return `• ${formatEventName(formattableEvent)}`;
            });

            // Combine all event strings and sort them for a clean list
            const allRegisteredEventsString = [
                ...newlyRegisteredEventsList,
                ...previouslyRegisteredEventsList
            ].sort().join('\n');

            const successHeader = `Pendaftaran untuk ${swimmerName} berhasil diterima!`;
            const eventListSection = `\n\nDaftar nomor lomba yang diikuti:\n${allRegisteredEventsString}`;
            const confirmationFooter = `\n\nSelamat! Anda telah terdaftar. Silakan hubungi panitia untuk konfirmasi.`;

            const detailedSuccessMessage = successHeader + eventListSection + confirmationFooter;

            setSuccessMessage(detailedSuccessMessage);
            onRegistrationSuccess(); // Refresh data in the background
            // Reset form
            setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '' });
            setSelectedEvents({});
            setExistingSwimmer(null);
        } else if (result.success) { // Fallback just in case
            setSuccessMessage(`${result.message} Selamat! Anda telah terdaftar. Silakan hubungi panitia untuk konfirmasi.`);
            onRegistrationSuccess();
            setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '' });
            setSelectedEvents({});
            setExistingSwimmer(null);
        } else {
            setError(result.message);
        }
    };

    const renderHeader = () => (
        <header className="relative text-center p-4 md:p-6 mb-6">
            {competitionInfo ? (
                competitionInfo.eventName.split('\n').map((line, index) => (
                    <h1 key={index} className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight">{line}</h1>
                ))
            ) : (
                <h1 className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight">Pendaftaran Lomba Renang</h1>
            )}
            <p className="text-md md:text-lg text-text-secondary mt-2">
                {competitionInfo?.eventDate ? new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Formulir Pendaftaran Online'}
            </p>
            {competitionInfo?.registrationDeadline && (
                <div className={`mt-4 text-lg font-semibold p-3 rounded-md ${isDeadlinePassed ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
                    <p className="text-sm font-normal">{isDeadlinePassed ? 'Batas Waktu Pendaftaran Telah Berakhir' : 'Pendaftaran Ditutup Dalam:'}</p>
                    <p className="text-2xl font-bold tracking-wider">{timeLeft}</p>
                    {!isDeadlinePassed && (
                        <p className="text-xs font-normal mt-1">
                            Batas akhir: {new Date(competitionInfo.registrationDeadline).toLocaleString('id-ID', {
                                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    )}
                </div>
            )}
        </header>
    );
    
    const renderLayout = (content: React.ReactNode) => (
         <div className="min-h-screen bg-background text-text-primary">
            <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm shadow-sm">
                {renderHeader()}
                <div className="absolute top-4 right-4">
                    <Button type="button" variant="secondary" onClick={onBackToLogin}>
                        Login Admin
                    </Button>
                </div>
            </div>
            <main className="container mx-auto max-w-3xl p-4">
                {content}
            </main>
             <footer className="text-center p-4 mt-8 border-t border-border">
                <Button type="button" variant="primary" onClick={onBackToLogin} className="px-6 py-3 text-lg">
                    &larr; Kembali ke Halaman Utama
                </Button>
            </footer>
        </div>
    );

    if (isDataLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }
    
    const isRegistrationOpen = (competitionInfo?.isRegistrationOpen ?? false) && !isDeadlinePassed;

    // Show closed message if not open and success message is not being displayed
    if (!isRegistrationOpen && !successMessage) {
         return renderLayout(
             <Card>
                <div className="text-center p-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h2 className="text-2xl font-bold mb-4">Pendaftaran Ditutup</h2>
                    <p className="text-text-secondary">
                        {isDeadlinePassed 
                            ? 'Batas waktu pendaftaran telah berakhir.' 
                            : 'Pendaftaran online untuk acara ini saat ini sedang ditutup oleh panitia.'
                        }
                        {' '}Silakan kembali lagi nanti atau hubungi panitia untuk informasi lebih lanjut.
                    </p>
                </div>
            </Card>
        );
    }

    if (!successMessage && localEvents.length === 0) {
        return renderLayout(
             <Card>
                <div className="text-center p-10">
                     <h2 className="text-2xl font-bold mb-4">Belum Ada Nomor Lomba Tersedia</h2>
                    <p className="text-text-secondary">Saat ini belum ada nomor lomba yang tersedia untuk pendaftaran. Silakan kembali lagi nanti.</p>
                </div>
            </Card>
        );
    }

    if (successMessage) {
        return renderLayout(
            <Card>
                <div className="text-center p-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-2xl font-bold mb-4">Pendaftaran Berhasil!</h2>
                    <p className="text-text-secondary whitespace-pre-wrap text-left">{successMessage}</p>
                </div>
            </Card>
        );
    }

    return renderLayout(
        <form onSubmit={handleSubmit}>
            <Card>
                <h2 className="text-2xl font-bold mb-4 border-b border-border pb-2">Data Diri Perenang</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                         <Input 
                            label="Nama Lengkap" 
                            id="name" 
                            name="name" 
                            value={formData.name} 
                            onChange={handleFormChange} 
                            onBlur={handleNameBlur} 
                            required 
                        />
                        {isCheckingName && (
                            <div className="absolute right-3 top-8">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            </div>
                        )}
                        {existingSwimmer && !isCheckingName && (
                            <button 
                                type="button" 
                                onClick={clearAutoFilledData} 
                                className="absolute right-2 top-8 text-xs text-blue-500 hover:underline px-2 py-1 bg-background/80 rounded"
                                title="Daftarkan sebagai perenang baru atau ganti data"
                            >
                                Ganti
                            </button>
                        )}
                    </div>
                    <Input label="Klub / Tim" id="club" name="club" value={formData.club} onChange={handleFormChange} required disabled={!!existingSwimmer} />
                    <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required disabled={!!existingSwimmer} />
                    <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange} disabled={!!existingSwimmer}>
                        <option value="Male">Laki-laki (Male)</option>
                        <option value="Female">Perempuan (Female)</option>
                    </Select>
                     {existingSwimmer && (
                        <div className="md:col-span-2 text-sm text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 p-3 rounded-md border border-green-200 dark:border-green-700">
                            <p className="font-semibold">Data perenang ditemukan!</p>
                            <p>Data klub, tahun lahir, dan jenis kelamin telah diisi otomatis. Jika ini bukan perenang yang benar, klik 'Ganti' di atas.</p>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="mt-6">
                <div className="flex justify-between items-center mb-4 border-b border-border pb-2">
                    <h2 className="text-2xl font-bold">Pilih Nomor Lomba</h2>
                    <div className="text-right">
                        <p className="font-bold text-lg text-primary">{selectedEventCount}</p>
                        <p className="text-xs text-text-secondary -mt-1">Terpilih</p>
                    </div>
                </div>
                
                <p className="text-sm text-text-secondary mb-4">Pilih nomor lomba yang akan diikuti dan masukkan waktu unggulan (seed time) Anda. Jika tidak punya, klik tombol "Tanpa Waktu".</p>
                
                <div className="space-y-2">
                    {Object.keys(groupedAvailableEvents).length > 0 ? Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]) => {
                        const isOpen = openAccordion === style;
                        return (
                            <div key={style} className="border border-border rounded-lg overflow-hidden transition-all duration-300">
                                <button
                                    type="button"
                                    onClick={() => handleAccordionToggle(style as SwimStyle)}
                                    className="w-full flex justify-between items-center p-4 bg-background hover:bg-surface transition-colors"
                                    aria-expanded={isOpen}
                                >
                                    <div className="text-left">
                                        <h3 className="font-bold text-lg text-text-primary">{translateSwimStyle(style as SwimStyle)}</h3>
                                        <p className="text-sm text-text-secondary">{eventsInStyle.length} nomor tersedia</p>
                                    </div>
                                    <ChevronDownIcon isOpen={isOpen} />
                                </button>
                                {isOpen && (
                                    <div className="p-4 space-y-3 bg-surface border-t border-border">
                                        {eventsInStyle.map(event => (
                                            <div key={event.id} className="bg-background p-3 rounded-md border border-border">
                                                <div className="flex items-start">
                                                    <input
                                                        type="checkbox"
                                                        id={`event-${event.id}`}
                                                        checked={selectedEvents[event.id]?.selected || false}
                                                        onChange={() => handleEventSelectionChange(event.id)}
                                                        className="h-6 w-6 rounded border-gray-300 text-primary focus:ring-primary mt-1"
                                                    />
                                                    <div className="ml-3 flex-grow">
                                                        <label htmlFor={`event-${event.id}`} className="font-semibold text-md text-text-primary cursor-pointer">
                                                            {formatEventName(event)}
                                                        </label>
                                                        {selectedEvents[event.id]?.selected && (
                                                            <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2 items-end">
                                                                <Input label="Menit" type="number" min="0" value={selectedEvents[event.id].time.min} onChange={(e) => handleTimeChange(event.id, 'min', e.target.value)} id={`min-${event.id}`} />
                                                                <Input label="Detik" type="number" min="0" max="99" value={selectedEvents[event.id].time.sec} onChange={(e) => handleTimeChange(event.id, 'sec', e.target.value)} id={`sec-${event.id}`} />
                                                                <Input label="ss/100" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={(e) => handleTimeChange(event.id, 'ms', e.target.value)} id={`ms-${event.id}`} />
                                                                <Button type="button" variant="secondary" onClick={() => handleSetNoTime(event.id)} className="h-10">Tanpa Waktu</Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }) : (
                        <p className="text-center text-text-secondary py-4">Tidak ada nomor lomba yang tersedia untuk jenis kelamin ini, atau semua nomor lomba yang tersedia sudah Anda ikuti.</p>
                    )}
                </div>
            </Card>

            <div className="mt-6">
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                <div className="flex justify-end items-center">
                    <Button type="submit" disabled={isSubmitting || !isFormValid}>
                        {isSubmitting ? <Spinner /> : 'Kirim Pendaftaran'}
                    </Button>
                </div>
            </div>
        </form>
    );
};

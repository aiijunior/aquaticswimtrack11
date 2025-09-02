

import React, { useState, useMemo } from 'react';
import type { CompetitionInfo, SwimEvent } from '../types';
import { processOnlineRegistration } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName } from '../constants';

interface OnlineRegistrationViewProps {
    events: SwimEvent[];
    competitionInfo: CompetitionInfo | null;
    isLoading: boolean;
    onBackToLogin: () => void;
    onRegistrationSuccess: () => void;
}

type RegistrationTime = { min: string; sec: string; ms: string };
type SelectedEvents = Record<string, { selected: boolean; time: RegistrationTime }>;

const parseTimeToMs = (time: RegistrationTime): number => {
    const minutes = parseInt(time.min, 10) || 0;
    const seconds = parseInt(time.sec, 10) || 0;
    const hundredths = parseInt(time.ms, 10) || 0;
    if (minutes === 99 && seconds === 99 && hundredths === 99) {
        return 0; // Treat as No Time
    }
    return (minutes * 60 * 1000) + (seconds * 1000) + (hundredths * 10);
};

export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
    events,
    competitionInfo,
    isLoading,
    onBackToLogin,
    onRegistrationSuccess,
}) => {
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

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '';
        const hasSelectedEvent = Object.values(selectedEvents).some(e => e.selected);
        return hasPersonalInfo && hasSelectedEvent;
    }, [formData, selectedEvents]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'birthYear' ? parseInt(value) : value }));
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
        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                ...prev[eventId],
                time: { ...prev[eventId].time, [part]: value },
            },
        }));
    };
    
    const availableEvents = useMemo(() => {
        return events
        .filter(event => event.gender === "Mixed" || (formData.gender === "Male" && event.gender === "Men's") || (formData.gender === "Female" && event.gender === "Women's"))
        .sort((a,b) => a.distance - b.distance || a.style.localeCompare(b.style));
    }, [events, formData.gender]);
    
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
            if (val.selected) {
                const min = parseInt(val.time.min, 10) || 0;
                const sec = parseInt(val.time.sec, 10) || 0;
                const ms = parseInt(val.time.ms, 10) || 0;

                if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
                    const eventDetails = availableEvents.find(e => e.id === eventId);
                    const eventName = eventDetails ? formatEventName(eventDetails) : `nomor lomba ID ${eventId}`;
                    setError(`Error pada ${eventName}: Input detik harus di bawah 60.`);
                    setIsSubmitting(false);
                    return;
                }

                registrationsToSubmit.push({
                    eventId,
                    seedTime: parseTimeToMs(val.time),
                });
            }
        }

        if (registrationsToSubmit.length === 0) {
            setError('Anda harus memilih setidaknya satu nomor lomba.');
            setIsSubmitting(false);
            return;
        }

        const result = await processOnlineRegistration(formData, registrationsToSubmit);
        setIsSubmitting(false);

        if (result.success) {
            setSuccessMessage(`${result.message} Selamat! Anda telah terdaftar. Silakan hubungi panitia untuk konfirmasi.`);
            onRegistrationSuccess(); // Refresh data in the background
            // Reset form
            setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '' });
            setSelectedEvents({});
        } else {
            setError(result.message);
        }
    };

    const renderHeader = () => (
        <header className="relative text-center p-4 md:p-6 mb-6">
            <h1 className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName || 'Pendaftaran Lomba Renang'}</h1>
            <p className="text-md md:text-lg text-text-secondary mt-2">
                {competitionInfo?.eventDate ? new Date(competitionInfo.eventDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Formulir Pendaftaran Online'}
            </p>
        </header>
    );
    
    const renderLayout = (content: React.ReactNode) => (
         <div className="min-h-screen bg-background text-text-primary">
            <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm shadow-sm">
                {renderHeader()}
                <div className="absolute top-4 right-4">
                    <Button variant="secondary" onClick={onBackToLogin}>
                        Login Admin
                    </Button>
                </div>
            </div>
            <main className="container mx-auto max-w-3xl p-4">
                {content}
            </main>
             <footer className="text-center p-4 mt-8 border-t border-border">
                <Button variant="primary" onClick={onBackToLogin} className="px-6 py-3 text-lg">
                    &larr; Kembali ke Halaman Utama
                </Button>
            </footer>
        </div>
    );

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }
    
    const isRegistrationOpen = competitionInfo?.isRegistrationOpen ?? false;

    // Show closed message if not open and success message is not being displayed
    if (!isRegistrationOpen && !successMessage) {
         return renderLayout(
             <Card>
                <div className="text-center p-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h2 className="text-2xl font-bold mb-4">Pendaftaran Ditutup</h2>
                    <p className="text-text-secondary">Pendaftaran online untuk acara ini saat ini sedang ditutup oleh panitia. Silakan kembali lagi nanti atau hubungi panitia untuk informasi lebih lanjut.</p>
                </div>
            </Card>
        );
    }

    if (!successMessage && events.length === 0) {
        return renderLayout(
             <Card>
                <div className="text-center p-10">
                     <h2 className="text-2xl font-bold mb-4">Pendaftaran Belum Dibuka</h2>
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
                    <p className="text-text-secondary">{successMessage}</p>
                </div>
            </Card>
        );
    }

    return renderLayout(
        <form onSubmit={handleSubmit}>
            <Card>
                <h2 className="text-2xl font-bold mb-4 border-b border-border pb-2">Data Diri Perenang</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} required />
                    <Input label="Klub / Tim" id="club" name="club" value={formData.club} onChange={handleFormChange} required />
                    <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                    <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                        <option value="Male">Laki-laki (Male)</option>
                        <option value="Female">Perempuan (Female)</option>
                    </Select>
                </div>
            </Card>

            <Card className="mt-6">
                <h2 className="text-2xl font-bold mb-4 border-b border-border pb-2">Pilih Nomor Lomba</h2>
                <p className="text-sm text-text-secondary mb-4">Pilih nomor lomba yang akan diikuti dan masukkan waktu unggulan (seed time) Anda. Jika tidak punya, biarkan maka akan terisi otomatis 99:99.99.</p>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                   {availableEvents.map(event => (
                        <div key={event.id} className="bg-background p-4 rounded-lg border border-border">
                            <div className="flex items-start">
                                <input
                                    type="checkbox"
                                    id={`event-${event.id}`}
                                    checked={selectedEvents[event.id]?.selected || false}
                                    onChange={() => handleEventSelectionChange(event.id)}
                                    className="h-6 w-6 rounded border-gray-300 text-primary focus:ring-primary mt-1"
                                />
                                <div className="ml-4 flex-grow">
                                    <label htmlFor={`event-${event.id}`} className="font-bold text-lg text-text-primary cursor-pointer">
                                        {formatEventName(event)}
                                    </label>
                                    {selectedEvents[event.id]?.selected && (
                                        <div className="mt-2 grid grid-cols-3 gap-2 items-end">
                                            <Input label="Menit" type="number" min="0" value={selectedEvents[event.id].time.min} onChange={(e) => handleTimeChange(event.id, 'min', e.target.value)} id={`min-${event.id}`} />
                                            <Input label="Detik" type="number" min="0" max="99" value={selectedEvents[event.id].time.sec} onChange={(e) => handleTimeChange(event.id, 'sec', e.target.value)} id={`sec-${event.id}`} />
                                            <Input label="ss (1/100)" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={(e) => handleTimeChange(event.id, 'ms', e.target.value)} id={`ms-${event.id}`} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
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
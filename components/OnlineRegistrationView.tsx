
import React, { useState, useMemo, useEffect } from 'react';
import type { CompetitionInfo, SwimEvent, Swimmer, FormattableEvent } from '../types';
import { getEventsForRegistration, processOnlineRegistration } from '../services/databaseService';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Spinner } from './ui/Spinner';
import { formatEventName, toTitleCase, translateSwimStyle, AGE_GROUP_OPTIONS, formatTime } from '../constants';
import { SwimStyle } from '../types';

interface OnlineRegistrationViewProps {
    competitionInfo: CompetitionInfo | null;
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

const ChevronDownIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const UserGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

export const OnlineRegistrationView: React.FC<OnlineRegistrationViewProps> = ({
    competitionInfo,
    onBackToLogin,
    onRegistrationSuccess,
}) => {
    const [regType, setRegType] = useState<'CHOICE' | 'INDIVIDUAL' | 'TEAM'>('CHOICE');
    const [localEvents, setLocalEvents] = useState<SwimEvent[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        birthYear: new Date().getFullYear() - 10,
        gender: 'Male' as 'Male' | 'Female',
        club: '',
        ageGroup: '',
        paymentProof: null as string | null,
        paymentAmount: '' as string
    });
    const [selectedEvents, setSelectedEvents] = useState<SelectedEvents>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState<React.ReactNode | string>('');
    const [openAccordion, setOpenAccordion] = useState<SwimStyle | null>(null);

    const ageOptions = useMemo(() => {
        if (competitionInfo?.ageGroups) {
            return competitionInfo.ageGroups.split('\n').map(s => s.trim()).filter(Boolean);
        }
        return AGE_GROUP_OPTIONS;
    }, [competitionInfo]);

    useEffect(() => {
        const fetchEvents = async () => {
            setIsDataLoading(true);
            const onlineEvents = await getEventsForRegistration();
            setLocalEvents(onlineEvents);
            setIsDataLoading(false);
        };
        fetchEvents();
    }, []);

    const maxAllowedEvents = useMemo(() => {
        if (competitionInfo?.isFree) return 999;
        const amount = parseInt(formData.paymentAmount) || 0;
        const fee = competitionInfo?.feePerEvent || 1;
        return Math.floor(amount / fee);
    }, [formData.paymentAmount, competitionInfo]);

    const selectedEventCount = useMemo(() => {
        return (Object.values(selectedEvents) as any[]).filter((e) => e.selected).length;
    }, [selectedEvents]);

    const isPaymentStepValid = useMemo(() => {
        if (competitionInfo?.isFree) return true;
        return formData.paymentProof !== null && parseInt(formData.paymentAmount) >= (competitionInfo?.feePerEvent || 0);
    }, [formData.paymentProof, formData.paymentAmount, competitionInfo]);

    const isFormValid = useMemo(() => {
        const hasPersonalInfo = formData.name.trim() !== '' && formData.club.trim() !== '' && formData.ageGroup !== '';
        const hasSelectedEvent = selectedEventCount > 0 && selectedEventCount <= maxAllowedEvents;
        return hasPersonalInfo && isPaymentStepValid && hasSelectedEvent;
    }, [formData, selectedEventCount, maxAllowedEvents, isPaymentStepValid]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: (name === 'name' || name === 'club') ? toTitleCase(value) : value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, paymentProof: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAccordionToggle = (style: SwimStyle) => {
        setOpenAccordion(prev => (prev === style ? null : style));
    };

    const handleEventSelectionChange = (eventId: string) => {
        const isCurrentlySelected = !!selectedEvents[eventId]?.selected;
        if (!isCurrentlySelected && selectedEventCount >= maxAllowedEvents && !competitionInfo?.isFree) {
            alert(`Kuota pemilihan nomor sudah habis sesuai nominal transfer Rp ${parseInt(formData.paymentAmount).toLocaleString('id-ID')}.`);
            return;
        }

        setSelectedEvents(prev => ({
            ...prev,
            [eventId]: {
                selected: !isCurrentlySelected,
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const registrationsToSubmit = (Object.entries(selectedEvents) as [string, any][])
            .filter(([_, val]) => val.selected)
            .map(([eventId, val]) => ({
                eventId,
                seedTime: parseTimeToMs(val.time),
            }));

        const swimmerPayload = {
            name: formData.name,
            birthYear: formData.birthYear,
            gender: formData.gender,
            club: formData.club,
            ageGroup: formData.ageGroup,
            paymentProof: formData.paymentProof,
            paymentAmount: parseInt(formData.paymentAmount) || 0
        };

        try {
            const result = await processOnlineRegistration(swimmerPayload, registrationsToSubmit);
            setIsSubmitting(false);
            if (result.success) {
                setSuccessMessage(`Pendaftaran untuk ${formData.name} berhasil dikirim!`);
                onRegistrationSuccess();
                setFormData({ name: '', birthYear: new Date().getFullYear() - 10, gender: 'Male', club: '', ageGroup: '', paymentProof: null, paymentAmount: '' });
                setSelectedEvents({});
            } else {
                setError(result.message);
            }
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan server.');
            setIsSubmitting(false);
        }
    };

    const groupedAvailableEvents = useMemo(() => {
        return localEvents
            .filter(e => {
                const genderMatch = e.gender === "Mixed" || 
                                   (formData.gender === "Male" && e.gender === "Men's") || 
                                   (formData.gender === "Female" && e.gender === "Women's");
                return genderMatch && (!e.category || e.category === formData.ageGroup);
            })
            .reduce((acc, event) => {
                if (!acc[event.style]) acc[event.style] = [];
                acc[event.style].push(event);
                return acc;
            }, {} as Record<string, SwimEvent[]>);
    }, [localEvents, formData.gender, formData.ageGroup]);

    const summaryList = useMemo(() => {
        return (Object.entries(selectedEvents) as [string, any][])
            .filter(([_, val]) => val.selected)
            .map(([eventId, val]) => {
                const event = localEvents.find(e => e.id === eventId);
                return {
                    name: event ? formatEventName(event) : 'Unknown Event',
                    time: `${val.time.min.padStart(2, '0')}:${val.time.sec.padStart(2, '0')}.${val.time.ms.padEnd(2, '0').slice(0, 2)}`
                };
            });
    }, [selectedEvents, localEvents]);

    if (isDataLoading) return <div className="flex justify-center p-20"><Spinner /></div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-100 to-blue-200 dark:from-slate-800 dark:to-sky-900 flex flex-col items-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center py-6">
                    {competitionInfo?.eventLogo && <img src={competitionInfo.eventLogo} alt="Logo" className="mx-auto h-20 mb-4" />}
                    <h1 className="text-3xl font-extrabold text-primary tracking-tight">{competitionInfo?.eventName.split('\n')[0]}</h1>
                    <h3 className="text-xl font-bold mt-2 opacity-80 uppercase tracking-widest">Pendaftaran Online</h3>
                </header>

                {regType === 'CHOICE' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group" onClick={() => setRegType('INDIVIDUAL')}>
                            <UserIcon /><h3 className="text-2xl font-bold mt-4 group-hover:text-primary transition-colors">Pendaftaran Mandiri</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Daftarkan atlet satu per satu</p>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary p-8 text-center transition-all hover:scale-105 group" onClick={() => setRegType('TEAM')}>
                            <UserGroupIcon /><h3 className="text-2xl font-bold mt-4 group-hover:text-primary transition-colors">Pendaftaran Kolektif</h3>
                            <p className="text-text-secondary mt-2 text-sm italic">Gunakan Excel untuk mendaftarkan tim besar</p>
                        </Card>
                    </div>
                )}

                {regType === 'INDIVIDUAL' && !successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
                        <div className="flex justify-start">
                            <Button variant="secondary" onClick={() => setRegType('CHOICE')}>&larr; Kembali ke Pilihan</Button>
                        </div>
                        
                        {/* LANGKAH 1: PROFIL */}
                        <Card className="shadow-xl">
                            <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                                Profil Atlet
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Nama Lengkap" id="name" name="name" value={formData.name} onChange={handleFormChange} placeholder="Sesuai Akta Kelahiran" required />
                                <Input label="Nama Tim / Klub" id="club" name="club" value={formData.club} onChange={handleFormChange} placeholder="Contoh: Sidoarjo Swim Club" required />
                                <Input label="Tahun Lahir" id="birthYear" name="birthYear" type="number" value={formData.birthYear} onChange={handleFormChange} required />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={formData.gender} onChange={handleFormChange}>
                                    <option value="Male">Laki-laki</option>
                                    <option value="Female">Perempuan</option>
                                </Select>
                                <Select label="Kelompok Umur (KU)" id="ageGroup" name="ageGroup" value={formData.ageGroup} onChange={handleFormChange} required>
                                    <option value="">-- Pilih KU --</option>
                                    {ageOptions.map(ku => <option key={ku} value={ku}>{ku}</option>)}
                                </Select>
                            </div>
                        </Card>

                        {/* LANGKAH 2: PEMBAYARAN */}
                        <Card className="shadow-xl border-l-4 border-l-primary">
                            <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                                <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                                Pembayaran & Bukti Transfer
                            </h2>
                            
                            {competitionInfo?.isFree ? (
                                <div className="bg-green-100 p-4 rounded-md text-green-800 font-bold border border-green-200">
                                    ✓ Kompetisi ini Gratis. Lanjutkan ke langkah berikutnya.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-surface p-4 rounded-lg border border-primary/20 shadow-inner">
                                        <p className="text-xs text-text-secondary uppercase font-bold tracking-widest mb-1">Rekening Tujuan</p>
                                        <p className="text-2xl font-black text-text-primary tracking-tighter">{competitionInfo?.accountNumber || '-'}</p>
                                        <p className="text-sm font-bold uppercase text-primary mb-3">{competitionInfo?.recipientName || '-'}</p>
                                        
                                        <div className="pt-3 border-t border-border flex justify-between items-center">
                                            <span className="text-xs font-bold text-text-secondary uppercase tracking-tight">Biaya Pendaftaran</span>
                                            <span className="text-lg font-black text-text-primary">Rp {(competitionInfo?.feePerEvent || 0).toLocaleString('id-ID')} <span className="text-[10px] font-normal text-text-secondary">/ nomor</span></span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-black text-primary uppercase">1. Pratinjau Bukti Bayar (Klik gambar untuk zoom)</label>
                                            <div className="w-full min-h-[400px] max-h-[600px] bg-background border-2 border-border rounded-xl flex items-center justify-center overflow-auto shadow-inner relative group">
                                                {formData.paymentProof ? (
                                                    <img 
                                                        src={formData.paymentProof} 
                                                        alt="Bukti Transfer" 
                                                        className="max-w-full h-auto object-contain cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]" 
                                                        onClick={() => window.open(formData.paymentProof || '', '_blank')} 
                                                    />
                                                ) : (
                                                    <div className="text-center p-10">
                                                        <svg className="mx-auto h-16 w-16 text-text-secondary opacity-20 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                        <p className="text-sm text-text-secondary opacity-50 font-bold uppercase tracking-widest">Silakan Unggah Bukti Bayar Dahulu</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="block text-sm font-bold text-text-secondary uppercase">2. Unggah / Ganti File</label>
                                                <div className="relative border-2 border-dashed border-primary/40 rounded-xl p-6 bg-primary/5 hover:bg-primary/10 transition-all text-center">
                                                    <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" required />
                                                    <p className="text-xs font-black text-primary uppercase">{formData.paymentProof ? '✓ Ganti Bukti Bayar' : 'Klik Untuk Unggah Bukti'}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-bold text-text-secondary uppercase tracking-tight">3. Masukkan Nominal Yang Ditransfer (Rp)</label>
                                                <Input 
                                                    label="" 
                                                    id="paymentAmount" 
                                                    name="paymentAmount" 
                                                    type="number" 
                                                    value={formData.paymentAmount} 
                                                    onChange={handleFormChange} 
                                                    placeholder="Ketik nominal persis sesuai bukti di atas"
                                                    required 
                                                    className="text-xl font-bold"
                                                />
                                                <p className="text-[10px] text-text-secondary italic">Lihat angka pada pratinjau bukti bayar di atas untuk mengisi nominal ini.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* LANGKAH 3: PILIH NOMOR LOMBA */}
                        <Card className="shadow-xl">
                            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                                <h2 className="text-xl font-black flex items-center gap-2">
                                    <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
                                    Pilih Nomor Lomba
                                </h2>
                                {!competitionInfo?.isFree && formData.paymentAmount && (
                                    <div className="text-right bg-primary/10 px-4 py-2 rounded-xl border border-primary/20">
                                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Sisa Kuota Pilihan</p>
                                        <p className={`text-2xl font-black ${maxAllowedEvents - selectedEventCount === 0 ? 'text-red-500' : 'text-primary'}`}>
                                            {maxAllowedEvents - selectedEventCount} <span className="text-xs font-normal">nomor</span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!formData.ageGroup ? (
                                <div className="text-center py-12 bg-yellow-50 rounded-2xl border border-yellow-200">
                                    <p className="text-yellow-700 font-bold">⚠️ Harap pilih Kelompok Umur di Langkah 1</p>
                                </div>
                            ) : !isPaymentStepValid ? (
                                <div className="text-center py-12 bg-red-50 rounded-2xl border border-red-200">
                                    <p className="text-red-700 font-bold">⚠️ Harap lengkapi Bukti Bayar & Nominal di Langkah 2</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {Object.entries(groupedAvailableEvents).map(([style, eventsInStyle]: any) => (
                                        <div key={style} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                                            <button type="button" onClick={() => handleAccordionToggle(style)} className="w-full flex justify-between p-5 bg-surface hover:bg-primary/5 transition-colors">
                                                <h3 className="font-black text-text-primary uppercase text-sm tracking-widest">{translateSwimStyle(style as SwimStyle)}</h3>
                                                <ChevronDownIcon isOpen={openAccordion === style} />
                                            </button>
                                            {openAccordion === style && (
                                                <div className="p-5 space-y-5 bg-background/30 border-t border-border">
                                                    {eventsInStyle.map((event: SwimEvent) => {
                                                        const isSelected = !!selectedEvents[event.id]?.selected;
                                                        const isLocked = !isSelected && selectedEventCount >= maxAllowedEvents && !competitionInfo?.isFree;
                                                        
                                                        return (
                                                            <div key={event.id} className={`flex flex-col border-b border-border last:border-0 pb-5 last:pb-0 ${isLocked ? 'opacity-40 grayscale' : ''}`}>
                                                                <div className="flex items-center">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        id={`check-${event.id}`}
                                                                        checked={isSelected} 
                                                                        onChange={() => handleEventSelectionChange(event.id)} 
                                                                        disabled={isLocked}
                                                                        className="h-7 w-7 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-transform active:scale-90" 
                                                                    />
                                                                    <label htmlFor={`check-${event.id}`} className={`ml-4 font-bold text-text-primary cursor-pointer flex-grow text-lg ${isSelected ? 'text-primary' : ''}`}>
                                                                        {formatEventName(event)}
                                                                        {isLocked && <span className="ml-3 text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black tracking-tighter">KUOTA HABIS</span>}
                                                                    </label>
                                                                </div>
                                                                {isSelected && (
                                                                    <div className="mt-5 ml-11 bg-surface p-5 rounded-2xl border border-primary/20 grid grid-cols-3 gap-4 animate-in slide-in-from-left-4 duration-300">
                                                                        <div className="col-span-3 mb-1 flex items-center gap-2">
                                                                            <span className="text-primary">⏱</span>
                                                                            <p className="text-[10px] font-black uppercase text-text-secondary tracking-widest italic">Waktu Unggulan (Seed Time)</p>
                                                                        </div>
                                                                        <Input label="Menit" type="number" min="0" value={selectedEvents[event.id].time.min} onChange={e => handleTimeChange(event.id, 'min', e.target.value)} />
                                                                        <Input label="Detik" type="number" min="0" max="59" value={selectedEvents[event.id].time.sec} onChange={e => handleTimeChange(event.id, 'sec', e.target.value)} />
                                                                        <Input label="ss/100" type="number" min="0" max="99" value={selectedEvents[event.id].time.ms} onChange={e => handleTimeChange(event.id, 'ms', e.target.value)} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {Object.keys(groupedAvailableEvents).length === 0 && (
                                        <p className="text-center py-12 text-text-secondary italic">Mohon maaf, tidak ada nomor lomba yang tersedia untuk kategori ini.</p>
                                    )}
                                </div>
                            )}
                        </Card>

                        {/* LANGKAH 4: RINGKASAN PENDAFTARAN */}
                        {selectedEventCount > 0 && (
                            <Card className="shadow-2xl bg-gradient-to-br from-primary/10 to-transparent border-primary/30 border-2 rounded-3xl">
                                <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                                    <span className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg">4</span>
                                    Ringkasan Pendaftaran
                                </h2>
                                <div className="space-y-3">
                                    <p className="text-xs font-black text-text-secondary uppercase tracking-widest mb-4">Nomor Lomba Yang Diikuti:</p>
                                    <div className="space-y-2">
                                        {summaryList.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-surface/80 backdrop-blur-sm p-4 rounded-2xl border border-border shadow-sm hover:border-primary/40 transition-colors">
                                                <span className="font-black text-sm text-text-primary tracking-tight">{item.name}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-text-secondary font-bold uppercase">Waktu:</span>
                                                    <span className="font-mono text-sm bg-primary/5 text-primary font-black px-3 py-1 rounded-lg border border-primary/10">{item.time}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-dashed border-primary/30 flex justify-between items-end">
                                        <div>
                                            <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Atlet</p>
                                            <p className="text-xl font-black text-text-primary tracking-tighter">{formData.name || '-'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Total Bayar</p>
                                            <p className="text-3xl font-black text-primary underline decoration-primary/20 underline-offset-8">Rp {parseInt(formData.paymentAmount || '0').toLocaleString('id-ID')}</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {error && <div className="p-5 bg-red-100 border-2 border-red-300 text-red-700 rounded-2xl font-black text-center animate-bounce shadow-lg">{error}</div>}
                        
                        <div className="pt-6">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting || !isFormValid} 
                                className="w-full py-8 text-3xl font-black shadow-2xl rounded-3xl tracking-tighter transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-30"
                            >
                                {isSubmitting ? (
                                    <div className="flex items-center justify-center gap-4">
                                        <Spinner /> <span className="animate-pulse">MENGIRIM DATA...</span>
                                    </div>
                                ) : 'KIRIM PENDAFTARAN SEKARANG'}
                            </Button>
                            <p className="text-center text-[10px] text-text-secondary mt-4 font-bold uppercase tracking-widest opacity-60">Pastikan data sudah benar sebelum mengirim</p>
                        </div>
                    </form>
                )}

                {successMessage && (
                    <Card className="text-center p-16 shadow-2xl border-4 border-green-500 rounded-[3rem] animate-in zoom-in duration-700 bg-white">
                        <div className="bg-green-100 h-32 w-32 rounded-full flex items-center justify-center mx-auto mb-8 border-8 border-green-500 shadow-2xl animate-bounce">
                            <span className="text-green-500 text-7xl font-bold">✓</span>
                        </div>
                        <h2 className="text-4xl font-black text-text-primary mb-4 italic tracking-tighter uppercase">BERHASIL!</h2>
                        <p className="text-xl text-text-secondary font-medium leading-relaxed max-w-md mx-auto">{successMessage}</p>
                        <div className="mt-12 flex flex-col gap-5">
                            <Button onClick={() => { setSuccessMessage(''); setRegType('CHOICE'); }} className="py-6 font-black text-xl rounded-2xl shadow-xl">DAFTARKAN ATLET LAIN</Button>
                            <Button variant="secondary" onClick={onBackToLogin} className="py-4 rounded-xl opacity-70 hover:opacity-100 transition-opacity">KEMBALI KE BERANDA</Button>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

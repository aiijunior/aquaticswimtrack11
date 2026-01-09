
import React, { useState, useEffect, useMemo } from 'react';
import { getRecords, processRecordUpload, updateCompetitionInfo, updateEventSchedule, addOrUpdateRecord, deleteRecord, backupDatabase, clearAllData, restoreDatabase, deleteAllRecords } from '../services/databaseService';
import { login } from '../services/authService';
import type { CompetitionInfo, SwimEvent, SwimRecord } from '../types';
import { RecordType, SwimStyle, Gender } from '../types';
import { SWIM_STYLE_OPTIONS, GENDER_OPTIONS } from '../constants';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { ToggleSwitch } from './ui/ToggleSwitch';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { translateGender, translateSwimStyle, GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, formatTime, toTitleCase } from '../constants';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any;

interface EventSettingsViewProps {
    competitionInfo: CompetitionInfo | null;
    events: SwimEvent[];
    onDataUpdate: () => void;
}

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" />
    </svg>
);
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const ArrowUpIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>);
const ArrowDownIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);


// --- Helper Components ---
const ImageUpload: React.FC<{ label: string; image: string | null; onImageSelect: (file: File) => void; onImageClear: () => void; }> = ({ label, image, onImageSelect, onImageClear }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) onImageSelect(e.target.files[0]);
    };
    return (
        <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">{label}</label>
            <div className="mt-1 flex items-center space-x-4">
                <div className="w-24 h-24 bg-background rounded-md flex items-center justify-center overflow-hidden border border-border">
                    {image ? <img src={image} alt={`${label} preview`} className="object-contain h-full w-full" /> : <span className="text-xs text-text-secondary">Tidak ada logo</span>}
                </div>
                <div className="flex flex-col space-y-2">
                    <input type="file" id={`upload-${label}`} className="hidden" accept="image/*" onChange={handleFileChange} />
                    <Button type="button" onClick={() => document.getElementById(`upload-${label}`)?.click()}>Unggah</Button>
                    {image && <Button type="button" variant="danger" onClick={onImageClear}>Hapus</Button>}
                </div>
            </div>
        </div>
    );
};

const SmallInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, id, ...props }) => (
    <div className="flex-1">
        <label htmlFor={id} className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
        <input id={id} {...props} className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary" />
    </div>
);

const initialRecordFormState = {
    type: RecordType.PORPROV,
    distance: 50,
    style: SwimStyle.FREESTYLE,
    gender: Gender.MALE,
    min: '0',
    sec: '0',
    ms: '00',
    holderName: '',
    yearSet: new Date().getFullYear(),
    isRelay: false,
    relayLegs: 4,
    locationSet: '',
    category: '',
};

// --- Main Component ---
export const EventSettingsView: React.FC<EventSettingsViewProps> = ({ competitionInfo, events, onDataUpdate }) => {
    const romanize = (num: number): string => {
        if (isNaN(num) || num <= 0) return '';
        const lookup: {[key: string]: number} = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
        let roman = '';
        for (let i in lookup ) {
            while ( num >= lookup[i] ) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    }
    
    const getErrorMessage = (error: unknown): string => {
        if (error instanceof Error) return error.message;
        return 'Terjadi kesalahan.';
    };

    const [activeTab, setActiveTab] = useState<'settings' | 'schedule' | 'records' | 'data'>('settings');
    const [info, setInfo] = useState<CompetitionInfo | null>(null);
    const [eventNameLines, setEventNameLines] = useState<string[]>(['', '', '']);
    const [ageGroupsInput, setAgeGroupsInput] = useState('');
    const [schedule, setSchedule] = useState<{ [key: string]: SwimEvent[] }>({});
    const [sessionNames, setSessionNames] = useState<{ [key: string]: string }>({});
    const [sessionDetails, setSessionDetails] = useState<{ [key: string]: { date: string; time: string } }>({});
    const [unscheduledSearchQuery, setUnscheduledSearchQuery] = useState('');
    const { addNotification } = useNotification();

    // Record states
    const [currentRecords, setCurrentRecords] = useState<SwimRecord[]>([]);
    const [isRecordsLoading, setIsRecordsLoading] = useState(false);
    const [recordFile, setRecordFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ success: number, errors: string[] } | null>(null);
    
    // Manual record form states
    const [editingRecord, setEditingRecord] = useState<SwimRecord | null>(null);
    const [isDeleteRecordModalOpen, setIsDeleteRecordModalOpen] = useState(false);
    const [isDeleteAllRecordsModalOpen, setIsDeleteAllRecordsModalOpen] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState<SwimRecord | null>(null);
    const [recordForm, setRecordForm] = useState(initialRecordFormState);

    // Record filter states
    const [recordFilters, setRecordFilters] = useState({
        holderName: '',
        type: 'all',
        gender: 'all',
        style: 'all',
    });

    // Data Management states
    const [isBackupLoading, setIsBackupLoading] = useState(false);
    const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
    const [clearDataCredentials, setClearDataCredentials] = useState({ email: '', password: '' });
    const [clearDataError, setClearDataError] = useState('');
    const [isClearingData, setIsClearingData] = useState(false);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    useEffect(() => {
        setInfo(competitionInfo);
        if (competitionInfo?.eventName) {
            const lines = competitionInfo.eventName.split('\n');
            setEventNameLines([
                lines[0] || '',
                lines[1] || '',
                lines[2] || '',
            ]);
        } else {
            setEventNameLines(['', '', '']);
        }
        if (competitionInfo?.ageGroups) {
            setAgeGroupsInput(competitionInfo.ageGroups);
        } else {
            setAgeGroupsInput('');
        }
    }, [competitionInfo]);

    useEffect(() => {
        const newSchedule: { [key: string]: SwimEvent[] } = { 'unscheduled': [] };
        const newSessionNames: { [key: string]: string } = {};
        const newSessionDetails: { [key: string]: { date: string; time: string } } = {};
        
        events.forEach(event => {
            const sessionKey = `session-${event.sessionNumber}`;
            if (event.sessionNumber && event.sessionNumber > 0) {
                if (!newSchedule[sessionKey]) {
                    newSchedule[sessionKey] = [];
                }
                newSchedule[sessionKey].push(event);

                if (!newSessionNames[sessionKey]) {
                    newSessionNames[sessionKey] = `Sesi ${romanize(event.sessionNumber)}`;
                }

                if (!newSessionDetails[sessionKey] && event.sessionDateTime) {
                    try {
                        const dt = new Date(event.sessionDateTime);
                        if (!isNaN(dt.getTime())) {
                            newSessionDetails[sessionKey] = {
                                date: dt.toISOString().split('T')[0],
                                time: dt.toTimeString().split(' ')[0].substring(0, 5)
                            };
                        }
                    } catch (e) { }
                }
            } else {
                newSchedule['unscheduled'].push(event);
            }
        });

        for (const sessionKey in newSchedule) {
            if (sessionKey.startsWith('session-')) {
                newSchedule[sessionKey].sort((a, b) => (a.heatOrder ?? 999) - (b.heatOrder ?? 999));
            }
        }
        
        setSchedule(newSchedule);
        setSessionNames(newSessionNames);
        setSessionDetails(newSessionDetails);
    }, [events]);
    
    const fetchRecords = async () => {
        setIsRecordsLoading(true);
        getRecords().then(data => {
            setCurrentRecords(data);
            setIsRecordsLoading(false);
        });
    }

     useEffect(() => {
        if (activeTab === 'records') {
            fetchRecords();
        }
    }, [activeTab]);


    const handleEventNameChange = (index: number, value: string) => {
        const newLines = [...eventNameLines];
        newLines[index] = toTitleCase(value);
        setEventNameLines(newLines);
    };

    const handleSaveInfo = async () => {
        if (!info) return;
        try {
            const combinedEventName = eventNameLines.map(line => line.trim()).filter(Boolean).join('\n');
            const infoToSave = { ...info, eventName: combinedEventName, ageGroups: ageGroupsInput };

            await updateCompetitionInfo(infoToSave);
            onDataUpdate();
            addNotification('Pengaturan umum berhasil disimpan!', 'info');
        } catch (error) {
             addNotification(`Gagal menyimpan: ${getErrorMessage(error)}`, 'error');
        }
    };
    
    const handleSaveSchedule = async () => {
        try {
            const finalEvents: SwimEvent[] = [];
            Object.keys(schedule).forEach(key => {
                const sessionNum = key === 'unscheduled' ? 0 : parseInt(key.split('-')[1]);
                const sessionDetail = sessionDetails[key];
                let sessionDT: string | undefined = undefined;

                if (sessionNum > 0 && sessionDetail && sessionDetail.date && sessionDetail.time) {
                    const dt = new Date(`${sessionDetail.date}T${sessionDetail.time}:00`);
                    if (isNaN(dt.getTime())) {
                        throw new Error(`Format tanggal/waktu tidak valid.`);
                    }
                    sessionDT = dt.toISOString();
                }

                schedule[key].forEach((event, index) => {
                    finalEvents.push({
                        ...event,
                        sessionNumber: sessionNum,
                        heatOrder: index,
                        sessionDateTime: sessionNum > 0 ? sessionDT : undefined,
                    });
                });
            });
            
            await updateEventSchedule(finalEvents);
            onDataUpdate();
            addNotification('Jadwal berhasil disimpan!', 'info');
        } catch (error) {
            addNotification(`Gagal menyimpan jadwal: ${getErrorMessage(error)}`, 'error');
        }
    };

    const handleImageSelect = (field: 'eventLogo' | 'sponsorLogo', file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => setInfo(prev => prev ? { ...prev, [field]: reader.result as string } : null);
        reader.readAsDataURL(file);
    };
    
    const handleImageClear = (field: 'eventLogo' | 'sponsorLogo') => setInfo(prev => prev ? { ...prev, [field]: null } : null);
    
    const addSession = () => {
        const nextSessionNum = (Object.keys(schedule).filter(k => k.startsWith('session')).length) + 1;
        const sessionKey = `session-${nextSessionNum}`;
        setSchedule(prev => ({ ...prev, [sessionKey]: [] }));
        setSessionNames(prev => ({...prev, [sessionKey]: `Sesi ${romanize(nextSessionNum)}`}));
        setSessionDetails(prev => ({ ...prev, [sessionKey]: { date: '', time: '' } }));
    };
    
    const removeSession = (sessionKey: string) => {
        const eventsToMove = schedule[sessionKey] || [];
        const newSchedule = { ...schedule };
        delete newSchedule[sessionKey];
        newSchedule['unscheduled'] = [...(newSchedule['unscheduled'] || []), ...eventsToMove];
        setSchedule(newSchedule);

        const newDetails = { ...sessionDetails };
        delete newDetails[sessionKey];
        setSessionDetails(newDetails);
    };
    
    const handleSessionDetailChange = (sessionKey: string, field: 'date' | 'time', value: string) => {
        setSessionDetails(prev => ({
            ...prev,
            [sessionKey]: {
                ...(prev[sessionKey] || { date: '', time: '' }),
                [field]: value
            }
        }));
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setRecordFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleResetFilters = () => {
        setRecordFilters({ holderName: '', type: 'all', gender: 'all', style: 'all' });
    };
    
    const filteredRecords = useMemo(() => {
        return currentRecords
            .filter(record => {
                const { holderName, type, gender, style } = recordFilters;
                if (holderName && !record.holderName.toLowerCase().includes(holderName.toLowerCase().trim())) {
                    return false;
                }
                if (type !== 'all' && record.type.toUpperCase() !== type.toUpperCase()) {
                    return false;
                }
                if (gender !== 'all' && record.gender !== gender) {
                    return false;
                }
                if (style !== 'all' && record.style !== style) {
                    return false;
                }
                return true;
            })
            .sort((a,b) => a.type.localeCompare(b.type) || a.distance - b.distance);
    }, [currentRecords, recordFilters]);

    const handleRecordFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setRecordFile(e.target.files[0]);
            setUploadResult(null);
        }
    };
    
    const handleRecordUpload = () => {
        if (!recordFile) return;
        setIsProcessing(true);
        setUploadResult(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                const result = await processRecordUpload(json);
                setUploadResult(result);
                if (result.errors.length === 0 && result.success > 0) {
                    onDataUpdate(); 
                    fetchRecords();
                    setRecordFile(null);
                    addNotification(`${result.success} data rekor berhasil diperbarui!`, 'info');
                } else if (result.errors.length > 0) {
                    addNotification('Impor selesai dengan galat.', 'error');
                }
            } catch (error) {
                const errorMessage = getErrorMessage(error);
                setUploadResult({ success: 0, errors: [errorMessage] });
                addNotification(`Gagal memproses unggahan: ${errorMessage}`, 'error');
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsArrayBuffer(recordFile);
    };

    const handleRecordFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        // @ts-ignore
        let val: string | number | boolean = isCheckbox ? e.target.checked : value;
        if (!isCheckbox && (name === 'holderName' || name === 'locationSet' || name === 'category')) {
            val = toTitleCase(value);
        }
        setRecordForm(prev => ({...prev, [name]: val}));
    };
    
    const handleEditRecord = (record: SwimRecord) => {
        setEditingRecord(record);
        const totalMs = record.time;
        const minutes = Math.floor(totalMs / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milliseconds = totalMs % 1000;

        setRecordForm({
            type: record.type,
            distance: record.distance,
            style: record.style,
            gender: record.gender,
            min: String(minutes),
            sec: String(seconds),
            ms: String(milliseconds).padStart(3, '0').slice(0, 2),
            holderName: record.holderName,
            yearSet: record.yearSet,
            isRelay: !!record.relayLegs,
            relayLegs: record.relayLegs || 4,
            locationSet: record.locationSet || '',
            category: record.category || '',
        });
    };

    const handleCancelEdit = () => {
        setEditingRecord(null);
        setRecordForm(initialRecordFormState);
    };
    
    const handleDeleteRecord = (record: SwimRecord) => {
        setRecordToDelete(record);
        setIsDeleteRecordModalOpen(true);
    };

    const confirmDeleteRecord = async () => {
        if (!recordToDelete) return;
        try {
            await deleteRecord(recordToDelete.id);
            setIsDeleteRecordModalOpen(false);
            setRecordToDelete(null);
            fetchRecords();
            onDataUpdate();
            addNotification('Rekor berhasil dihapus.', 'error');
        } catch (error) {
             addNotification(`Gagal menghapus rekor: ${getErrorMessage(error)}`, 'error');
        }
    };

    const handleConfirmDeleteAllRecords = async () => {
        try {
            await deleteAllRecords();
            setIsDeleteAllRecordsModalOpen(false);
            fetchRecords();
            onDataUpdate();
            addNotification('Semua rekor berhasil dihapus.', 'error');
        } catch (error) {
            addNotification(`Gagal menghapus semua rekor: ${getErrorMessage(error)}`, 'error');
        }
    };

    const handleRecordFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const time = ((parseInt(recordForm.min, 10) || 0) * 60000) + 
                         ((parseInt(recordForm.sec, 10) || 0) * 1000) + 
                         ((parseInt(recordForm.ms, 10) || 0) * 10);
            
            const recordId = editingRecord?.id || 
                `${recordForm.type.toUpperCase()}_${recordForm.gender}_${recordForm.distance}_${recordForm.style}` + (recordForm.category ? `_${recordForm.category}` : '') + (recordForm.isRelay ? `_R${recordForm.relayLegs}` : '');
    
            const recordData: Partial<SwimRecord> = {
                id: recordId,
                type: recordForm.type as RecordType,
                gender: recordForm.gender,
                distance: Number(recordForm.distance),
                style: recordForm.style,
                time: time,
                holderName: recordForm.holderName,
                yearSet: Number(recordForm.yearSet),
                relayLegs: recordForm.isRelay ? Number(recordForm.relayLegs) : null,
                locationSet: recordForm.locationSet,
                category: recordForm.category || null,
            };
            await addOrUpdateRecord(recordData);
            handleCancelEdit();
            fetchRecords();
            onDataUpdate();
            addNotification(`Rekor berhasil ${editingRecord ? 'diperbarui' : 'ditambahkan'}.`, editingRecord ? 'info' : 'success');
        } catch (error) {
            addNotification(`Gagal menyimpan rekor: ${getErrorMessage(error)}`, 'error');
        }
    };


    const handleMoveEvent = (eventId: string, sourceSessionKey: string, targetSessionKey: string) => {
        if (sourceSessionKey === targetSessionKey) return;

        setSchedule(currentSchedule => {
            const sourceEvents = [...(currentSchedule[sourceSessionKey] || [])];
            const targetEvents = [...(currentSchedule[targetSessionKey] || [])];
            const eventIndex = sourceEvents.findIndex(e => e.id === eventId);
            
            if (eventIndex === -1) return currentSchedule;

            const [eventToMove] = sourceEvents.splice(eventIndex, 1);
            targetEvents.push(eventToMove);

            return {
                ...currentSchedule,
                [sourceSessionKey]: sourceEvents,
                [targetSessionKey]: targetEvents,
            };
        });
    };

    const handleReorderEvent = (eventId: string, sessionKey: string, direction: 'up' | 'down') => {
        setSchedule(currentSchedule => {
            const sessionEvents = [...currentSchedule[sessionKey]];
            const currentIndex = sessionEvents.findIndex(e => e.id === eventId);
            if (currentIndex === -1) return currentSchedule;

            const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex < 0 || newIndex >= sessionEvents.length) return currentSchedule;

            [sessionEvents[currentIndex], sessionEvents[newIndex]] = [sessionEvents[newIndex], sessionEvents[currentIndex]];

            return { ...currentSchedule, [sessionKey]: sessionEvents };
        });
    };

    const sessionOptions = useMemo(() => [
        { value: 'unscheduled', label: 'Belum Terjadwal' },
        ...Object.keys(schedule)
            .filter(k => k.startsWith('session'))
            .sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]))
            .map(key => ({ value: key, label: sessionNames[key] || `Sesi ${romanize(parseInt(key.split('-')[1]))}` }))
    ], [schedule, sessionNames]);
    
    const filteredUnscheduledEvents = useMemo(() => {
        if (!unscheduledSearchQuery) {
            return schedule.unscheduled || [];
        }
        return (schedule.unscheduled || []).filter(event =>
            formatEventName(event).toLowerCase().includes(unscheduledSearchQuery.toLowerCase())
        );
    }, [schedule.unscheduled, unscheduledSearchQuery]);


    const handleBackup = async () => {
        setIsBackupLoading(true);
        try {
            const data = await backupDatabase();
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
            const link = document.createElement('a');
            link.href = jsonString;
            link.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            addNotification('Backup berhasil diunduh.', 'success');
        } catch (error) {
            addNotification(`Gagal membuat backup.`, 'error');
        } finally {
            setIsBackupLoading(false);
        }
    };

    const handleConfirmClearData = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsClearingData(true);
        setClearDataError('');
        try {
            const user = await login(clearDataCredentials.email, clearDataCredentials.password);
            if (user) {
                await clearAllData();
                setIsClearingData(false);
                setIsClearDataModalOpen(false);
                setClearDataCredentials({ email: '', password: '' });
                onDataUpdate();
                addNotification('Semua data telah dihapus.', 'error');
            } else {
                setClearDataError('Kredensial tidak valid.');
                setIsClearingData(false);
            }
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            setClearDataError(errorMessage);
            setIsClearingData(false);
        }
    };
    
    const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setRestoreFile(e.target.files[0]);
        }
    };
    
    const handleRestore = async () => {
        if (!restoreFile) return;
        setIsRestoring(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const data = JSON.parse(content);
                await restoreDatabase(data); 
                addNotification('Data berhasil dipulihkan!', 'info');
                onDataUpdate();
            } catch (error) {
                addNotification(`Gagal memulihkan data.`, 'error');
            } finally {
                setIsRestoring(false);
                setIsRestoreModalOpen(false);
                setRestoreFile(null);
            }
        };
        reader.readAsText(restoreFile);
    };

    if (!info) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    
    const renderTabs = () => (
        <div className="flex border-b border-border mb-6 no-print">
            <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'settings' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Pengaturan Umum</button>
            <button onClick={() => setActiveTab('schedule')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'schedule' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Pengaturan Jadwal</button>
            <button onClick={() => setActiveTab('records')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'records' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Manajemen Rekor</button>
            <button onClick={() => setActiveTab('data')} className={`px-4 py-2 -mb-px border-b-2 ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Manajemen Data</button>
        </div>
    );

    return (
        <div>
            <h1 className="text-3xl font-bold mb-2">Pengaturan Acara & Jadwal</h1>
            {renderTabs()}

            {activeTab === 'settings' && (
                <Card>
                    <div className="space-y-6">
                        <div className="p-4 border border-border rounded-lg bg-background/50 space-y-4">
                             <ToggleSwitch
                                label="Status Pendaftaran Online"
                                enabled={info.isRegistrationOpen ?? false}
                                onChange={(enabled) => setInfo({ ...info, isRegistrationOpen: enabled })}
                                enabledText="DIBUKA"
                                disabledText="DITUTUP"
                            />
                            <div>
                                <Input
                                    label="Batas Waktu Pendaftaran Online"
                                    id="registration-deadline"
                                    type="datetime-local"
                                    value={info.registrationDeadline ? info.registrationDeadline.slice(0, 16) : ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        const isoValue = value ? new Date(value).toISOString() : null;
                                        setInfo({ ...info, registrationDeadline: isoValue });
                                    }}
                                />
                                <p className="text-xs text-text-secondary mt-1">Kosongkan jika tidak ada batas waktu.</p>
                            </div>
                        </div>

                        {/* SECTION: BIAYA KOMPETISI */}
                        <div className="p-4 border-2 border-primary/20 rounded-lg bg-primary/5 space-y-4">
                            <h3 className="font-bold text-primary flex items-center gap-2 uppercase tracking-wider">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                                </svg>
                                Pengaturan Biaya Kompetisi
                            </h3>
                            
                             <ToggleSwitch
                                label="Tipe Kompetisi"
                                enabled={!(info.isFree ?? true)}
                                onChange={(berbayar) => setInfo({ ...info, isFree: !berbayar })}
                                enabledText="BERBAYAR"
                                disabledText="GRATIS"
                            />
                            
                            <p className="text-xs text-text-secondary">
                                {info.isFree ? 'Jika aktif, pendaftaran tidak memerlukan bukti bayar.' : 'Pendaftaran mandiri akan meminta bukti transfer.'}
                            </p>

                            {!(info.isFree ?? true) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 animate-in fade-in duration-300">
                                    <Input 
                                        label="Nama Penerima Transfer" 
                                        id="recipient-name" 
                                        value={info.recipientName || ''} 
                                        onChange={(e) => setInfo({ ...info, recipientName: toTitleCase(e.target.value) })}
                                        placeholder="Contoh: Panitia Renang"
                                    />
                                    <Input 
                                        label="Nomor Rekening" 
                                        id="account-number" 
                                        value={info.accountNumber || ''} 
                                        onChange={(e) => setInfo({ ...info, accountNumber: e.target.value })}
                                        placeholder="Contoh: BCA 1234567890"
                                    />
                                    <Input 
                                        label="Biaya per Nomor Acara (Rp)" 
                                        id="fee-per-event" 
                                        type="number" 
                                        value={info.feePerEvent || 0} 
                                        onChange={(e) => setInfo({ ...info, feePerEvent: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <Input label="Nama Event (Baris 1)" id="event-name-1" type="text" value={eventNameLines[0]} onChange={(e) => handleEventNameChange(0, e.target.value)} style={{ fontSize: '16px' }} />
                            <Input label="Nama Event (Baris 2)" id="event-name-2" type="text" value={eventNameLines[1]} onChange={(e) => handleEventNameChange(1, e.target.value)} className="mt-4" style={{ fontSize: '12px' }}/>
                            <Input label="Nama Event (Baris 3)" id="event-name-3" type="text" value={eventNameLines[2]} onChange={(e) => handleEventNameChange(2, e.target.value)} className="mt-4" style={{ fontSize: '11px' }}/>
                        </div>
                        <Input label="Hari dan Tanggal Event" id="event-date" type="date" value={info.eventDate} onChange={(e) => setInfo({ ...info, eventDate: e.target.value })}/>
                        <Select
                            label="Jumlah Lintasan per Seri"
                            id="number-of-lanes"
                            value={info.numberOfLanes || 8}
                            onChange={(e) => setInfo({ ...info, numberOfLanes: parseInt(e.target.value, 10) })}
                        >
                            <option value="5">5 Lintasan</option>
                            <option value="6">6 Lintasan</option>
                            <option value="8">8 Lintasan</option>
                            <option value="10">10 Lintasan</option>
                        </Select>
                        
                        <div>
                            <label htmlFor="age-groups" className="block text-sm font-medium text-text-secondary mb-1">Atur Kategori Umur (KU)</label>
                            <textarea
                                id="age-groups"
                                rows={6}
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                placeholder={"Contoh:\nKU Senior\nKU 1\nKU 2\nKU 3\nTK\nMaster"}
                                value={ageGroupsInput}
                                onChange={(e) => setAgeGroupsInput(e.target.value)}
                            />
                        </div>

                        <ImageUpload label="Logo Event" image={info.eventLogo} onImageSelect={(file) => handleImageSelect('eventLogo', file)} onImageClear={() => handleImageClear('eventLogo')}/>
                        <ImageUpload label="Logo Sponsor" image={info.sponsorLogo} onImageSelect={(file) => handleImageSelect('sponsorLogo', file)} onImageClear={() => handleImageClear('sponsorLogo')}/>
                        <div className="flex justify-end pt-4 border-t border-border"><Button onClick={handleSaveInfo}>Simpan Pengaturan</Button></div>
                    </div>
                </Card>
            )}

            {activeTab === 'schedule' && (
                 <Card>
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                        <p className="text-text-secondary">Atur nomor lomba ke dalam sesi dan tentukan urutannya.</p>
                        <div className="flex items-center space-x-4">
                            <Button variant="secondary" onClick={addSession}>Tambah Sesi</Button>
                            <Button onClick={handleSaveSchedule}>Simpan Jadwal</Button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            {Object.keys(schedule).filter(k => k.startsWith('session')).sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])).map(key => (
                                <div key={key} className="bg-background p-4 rounded-lg border border-border">
                                    <div className="flex justify-between items-center mb-2 border-b border-border pb-2 flex-wrap gap-2">
                                        <input type="text" value={sessionNames[key] || ''} onChange={(e) => setSessionNames(prev => ({...prev, [key]: toTitleCase(e.target.value)}))} className="font-bold text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 flex-grow" />
                                        <button onClick={() => removeSession(key)} className="text-red-500 hover:text-red-400 text-xs ml-2 flex-shrink-0">Hapus Sesi</button>
                                    </div>
                                    <div className="flex space-x-2 mb-4">
                                        <SmallInput label="Tanggal" type="date" id={`date-${key}`} value={sessionDetails[key]?.date || ''} onChange={(e) => handleSessionDetailChange(key, 'date', e.target.value)} />
                                        <SmallInput label="Waktu Mulai" type="time" id={`time-${key}`} value={sessionDetails[key]?.time || ''} onChange={(e) => handleSessionDetailChange(key, 'time', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        {schedule[key]?.length > 0 ? schedule[key].map((event, index) => (
                                            <div key={event.id} className="flex items-center justify-between bg-surface p-2 rounded-md shadow-sm">
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex flex-col">
                                                        <button onClick={() => handleReorderEvent(event.id, key, 'up')} disabled={index === 0} className="disabled:opacity-20 text-text-secondary hover:text-text-primary"><ArrowUpIcon /></button>
                                                        <button onClick={() => handleReorderEvent(event.id, key, 'down')} disabled={index === schedule[key].length - 1} className="disabled:opacity-20 text-text-secondary hover:text-text-primary"><ArrowDownIcon /></button>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-text-primary text-sm">{formatEventName(event)}</p>
                                                        <p className="text-xs text-text-secondary">{event.entries.length} peserta</p>
                                                    </div>
                                                </div>
                                                <div className="w-40">
                                                    <select
                                                        value={key}
                                                        onChange={(e) => handleMoveEvent(event.id, key, e.target.value)}
                                                        className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                                    >
                                                        {sessionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        )) : <p className="text-sm text-text-secondary text-center py-4">Belum ada nomor lomba.</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="bg-surface p-4 rounded-lg">
                            <h3 className="font-bold text-lg mb-4 border-b border-border pb-2">Lomba Belum Terjadwal</h3>
                            <div className="mb-4">
                                <Input label="Cari nomor lomba" id="unscheduled-search" type="text" placeholder="Ketik untuk mencari..." value={unscheduledSearchQuery} onChange={(e) => setUnscheduledSearchQuery(e.target.value)} />
                            </div>
                            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                                {filteredUnscheduledEvents.length > 0 ? filteredUnscheduledEvents.map(event => (
                                    <div key={event.id} className="flex items-center justify-between bg-background p-2 rounded-md">
                                        <div>
                                            <p className="font-semibold text-text-primary text-sm">{formatEventName(event)}</p>
                                            <p className="text-xs text-text-secondary">{event.entries.length} peserta</p>
                                        </div>
                                        <div className="w-40">
                                            <select
                                                value="unscheduled"
                                                onChange={(e) => handleMoveEvent(event.id, 'unscheduled', e.target.value)}
                                                className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                            >
                                                {sessionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )) : <p className="text-sm text-text-secondary text-center py-4">Kosong.</p>}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'records' && (
                <Card>
                    <h2 className="text-xl font-bold mb-2">Manajemen Rekor</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <form onSubmit={handleRecordFormSubmit} className="bg-background/50 p-4 rounded-lg border border-border space-y-3 mb-4">
                                <Select label="Tipe Rekor" id="record-type" name="type" value={recordForm.type} onChange={handleRecordFormChange}>
                                    <option value={RecordType.PORPROV}>PORPROV</option>
                                    <option value={RecordType.NASIONAL}>Nasional</option>
                                </Select>
                                <div className="flex gap-4">
                                    <Input label="Jarak (m)" id="distance" name="distance" type="number" value={recordForm.distance} onChange={handleRecordFormChange} required />
                                    <Select label="Gaya" id="style" name="style" value={recordForm.style} onChange={handleRecordFormChange}>
                                        {SWIM_STYLE_OPTIONS.map(s => <option key={s} value={s}>{translateSwimStyle(s)}</option>)}
                                    </Select>
                                </div>
                                <Input label="Kategori" id="category" name="category" type="text" value={recordForm.category} onChange={handleRecordFormChange} />
                                <Select label="Jenis Kelamin" id="gender" name="gender" value={recordForm.gender} onChange={handleRecordFormChange}>
                                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{translateGender(g)}</option>)}
                                </Select>
                                <div className="grid grid-cols-3 gap-2">
                                    <Input label="Min" id="min" name="min" type="number" value={recordForm.min} onChange={handleRecordFormChange} />
                                    <Input label="Sec" id="sec" name="sec" type="number" value={recordForm.sec} onChange={handleRecordFormChange} />
                                    <Input label="ms" id="ms" name="ms" type="number" value={recordForm.ms} onChange={handleRecordFormChange} />
                                </div>
                                <Input label="Pemegang Rekor" id="holderName" name="holderName" value={recordForm.holderName} onChange={handleRecordFormChange} required />
                                <Input label="Tahun" id="yearSet" name="yearSet" type="number" value={recordForm.yearSet} onChange={handleRecordFormChange} required />
                                <Button type="submit" className="w-full">Simpan Rekor</Button>
                            </form>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'data' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <h3 className="text-xl font-bold">Backup & Restore</h3>
                        <Button onClick={handleBackup} disabled={isBackupLoading} className="w-full mt-4">Backup Semua Data</Button>
                        <div className="pt-4 border-t border-border mt-4">
                            <input type="file" id="restore-upload" accept=".json" className="hidden" onChange={handleRestoreFileChange} />
                            <Button type="button" variant="secondary" onClick={() => document.getElementById('restore-upload')?.click()} className="w-full">Pilih File Backup</Button>
                            <Button onClick={() => setIsRestoreModalOpen(true)} disabled={!restoreFile || isRestoring} className="w-full mt-2">Pulihkan Data</Button>
                        </div>
                    </Card>
                    <Card className="border-red-500/50 bg-red-500/5">
                        <h3 className="text-xl font-bold text-red-500">Zona Berbahaya</h3>
                        <Button variant="danger" onClick={() => setIsClearDataModalOpen(true)} className="w-full mt-4">Hapus Semua Data</Button>
                    </Card>
                </div>
            )}
        </div>
    );
};

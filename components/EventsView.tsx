import React, { useState, useMemo } from 'react';
import type { SwimEvent } from '../types';
import { SwimStyle, Gender } from '../types';
import { addEvent, deleteEvent, processEventUpload, deleteAllEvents } from '../services/databaseService';
import { SWIM_STYLE_OPTIONS, GENDER_OPTIONS, translateGender, translateSwimStyle, GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, romanize } from '../constants';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';

declare var XLSX: any;

interface EventsViewProps {
  events: SwimEvent[];
  isLoading: boolean;
  onSelectEvent: (id: string) => void;
  onStartTiming: (id: string) => void;
  onDataUpdate: () => void;
}

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const StopwatchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const EventsView: React.FC<EventsViewProps> = ({ events, isLoading, onSelectEvent, onStartTiming, onDataUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<SwimEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<number>(0); // 0 for all, -1 for unscheduled
  const [newEvent, setNewEvent] = useState({
    distance: 100,
    style: SwimStyle.FREESTYLE,
    gender: Gender.MALE,
    isRelay: false,
    relayLegs: 4,
    category: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  
  // State for upload modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: number; errors: string[] } | null>(null);

  const sessions = useMemo(() => {
    if (!events) return { scheduled: [], unscheduledExists: false };
    const sessionNumbers = new Set(events.map(e => e.sessionNumber || 0));
    const scheduled = Array.from(sessionNumbers).filter(s => s > 0).sort((a, b) => a - b);
    const unscheduledExists = sessionNumbers.has(0);
    return { scheduled, unscheduledExists };
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
        const sessionMatch = selectedSession === 0 ||
            (selectedSession === -1 && (!event.sessionNumber || event.sessionNumber === 0)) ||
            (event.sessionNumber === selectedSession);

        if (!sessionMatch) {
            return false;
        }

        return !searchQuery || formatEventName(event).toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [events, searchQuery, selectedSession]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEvent.distance <= 0) {
        setFormError("Jarak lomba harus lebih besar dari 0.");
        return;
    }
    setFormError(null);

    try {
        await addEvent({
            distance: newEvent.distance,
            style: newEvent.style,
            gender: newEvent.gender,
            relayLegs: newEvent.isRelay ? newEvent.relayLegs : null,
            category: newEvent.category || null,
        });
        setNewEvent({
            distance: 100,
            style: SwimStyle.FREESTYLE,
            gender: Gender.MALE,
            isRelay: false,
            relayLegs: 4,
            category: '',
        });
        setIsModalOpen(false);
        onDataUpdate();
    } catch (error) {
        console.error("Gagal menambahkan nomor lomba:", error);
        setFormError(error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan.");
    }
  };
  
  const openDeleteConfirm = (event: SwimEvent) => {
    setEventToDelete(event);
    setIsDeleteModalOpen(true);
  };
  
  const closeDeleteConfirm = () => {
    setEventToDelete(null);
    setIsDeleteModalOpen(false);
  };
  
  const handleDeleteEvent = async () => {
    if (eventToDelete) {
      await deleteEvent(eventToDelete.id);
      closeDeleteConfirm();
      onDataUpdate();
    }
  };

  const handleConfirmDeleteAll = async () => {
    await deleteAllEvents();
    setIsDeleteAllModalOpen(false);
    onDataUpdate();
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadFile(null);
    setUploadResult(null);
    setIsProcessingUpload(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleProcessUpload = () => {
    if (!uploadFile) return;

    setIsProcessingUpload(true);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const result = await processEventUpload(json);
            setUploadResult(result);

            if (result.errors.length === 0 && result.success > 0) {
                onDataUpdate();
                setTimeout(() => {
                    closeUploadModal();
                }, 2000);
            }
        } catch (error: any) {
            setUploadResult({ success: 0, errors: ['Gagal membaca atau memproses file.', error.message] });
        } finally {
            setIsProcessingUpload(false);
        }
    };
    reader.readAsArrayBuffer(uploadFile);
  };

  const handleDownloadTemplate = () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }
    const wb = XLSX.utils.book_new();

    // --- Sheet 2: Petunjuk & Daftar Pilihan ---
    const listsSheetData: any[][] = [
        ["PETUNJUK PENGISIAN"],
        ["1. Isi data nomor lomba pada sheet 'Template Nomor Lomba'."],
        ["2. Kolom 'Jarak (m)', 'Gaya', dan 'Jenis Kelamin' wajib diisi."],
        ["3. Untuk Gaya dan Jenis Kelamin, mohon gunakan pilihan yang tersedia di dropdown."],
        ["4. Kolom 'Kategori' bersifat opsional. Kosongkan jika tidak ada (cth: untuk event senior/open)."],
        ["5. Kolom 'Jumlah Perenang' HANYA diisi untuk nomor estafet (relay), contoh: 4. Kosongkan untuk perorangan."],
        [], // Spacer
        ["DAFTAR PILIHAN VALID"],
        [],
        ["Gaya", "Jenis Kelamin"],
    ];

    const styles = Object.values(SWIM_STYLE_TRANSLATIONS);
    const genders = Object.values(GENDER_TRANSLATIONS);
    const maxLength = Math.max(styles.length, genders.length);

    for (let i = 0; i < maxLength; i++) {
        listsSheetData.push([ styles[i] || "", genders[i] || "" ]);
    }
    const ws_lists = XLSX.utils.aoa_to_sheet(listsSheetData);
    ws_lists['!cols'] = [{ wch: 40 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws_lists, "Petunjuk & Pilihan");


    // --- Sheet 1: Template Nomor Lomba ---
    const templateData = [
        {
            "Jarak (m)": 50,
            "Gaya": "Gaya Kupu-kupu",
            "Jenis Kelamin": "Putri",
            "Kategori": "KU 1-2",
            "Jumlah Perenang": "" // Individual event
        },
        {
            "Jarak (m)": 200,
            "Gaya": "Gaya Bebas",
            "Jenis Kelamin": "Putra",
            "Kategori": "", // Open/Senior event
            "Jumlah Perenang": ""
        },
        {
            "Jarak (m)": 100, // Distance per leg
            "Gaya": "Gaya Ganti",
            "Jenis Kelamin": "Campuran",
            "Kategori": "KU-3",
            "Jumlah Perenang": 4 // Relay event
        }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [ { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];

    // Add Data Validation to Sheet 1
    const maxRows = 1000;
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    ws['!dataValidation'].push({ sqref: `B2:B${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$A$11:$A$${10 + styles.length}` } });
    ws['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: `'Petunjuk & Pilihan'!$B$11:$B$${10 + genders.length}` } });
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Nomor Lomba");
    
    // Reorder sheets to have Template first
    wb.SheetNames.reverse();

    XLSX.writeFile(wb, "Template_Nomor_Lomba.xlsx");
  };


  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-3xl font-bold">Nomor Lomba</h1>
        <div className="flex space-x-2 flex-wrap gap-2">
            <Button onClick={() => setIsUploadModalOpen(true)} variant="secondary">Unggah Nomor Lomba</Button>
            <Button onClick={() => setIsModalOpen(true)}>Buat Nomor Lomba</Button>
            <Button 
                variant="danger" 
                onClick={() => setIsDeleteAllModalOpen(true)}
                disabled={events.length === 0}
                title={events.length === 0 ? "Tidak ada nomor lomba untuk dihapus" : "Hapus semua nomor lomba"}
            >
                Hapus Semua Nomor Lomba
            </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Filter berdasarkan Sesi</p>
                <div className="flex flex-wrap gap-2">
                    <Button variant={selectedSession === 0 ? 'primary' : 'secondary'} onClick={() => setSelectedSession(0)}>Semua</Button>
                    {sessions.scheduled.map(num => (
                        <Button key={num} variant={selectedSession === num ? 'primary' : 'secondary'} onClick={() => setSelectedSession(num)}>Sesi {romanize(num)}</Button>
                    ))}
                    {sessions.unscheduledExists && (
                        <Button variant={selectedSession === -1 ? 'primary' : 'secondary'} onClick={() => setSelectedSession(-1)}>Belum Terjadwal</Button>
                    )}
                </div>
            </div>
            <div>
                <Input
                label="Cari Nomor Lomba"
                id="event-search"
                type="text"
                placeholder="Cth: 50m Gaya Bebas KU 1-2 Putra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>
      </Card>


      {isLoading ? (
        <p>Memuat nomor lomba...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <Card key={event.id} className="flex flex-col justify-between">
                <div>
                    <h2 className="text-xl font-bold text-primary">{formatEventName(event)}</h2>
                    <p className="text-text-secondary mt-2">{event.entries.length} perenang terdaftar</p>
                    <p className="text-text-secondary">{event.results.length > 0 ? `${event.results.length} hasil dicatat` : "Menunggu hasil"}</p>
                </div>
                <div className="mt-4 flex items-center justify-between space-x-2">
                     <Button onClick={() => onSelectEvent(event.id)} variant="secondary" className="flex-grow">
                        Detail
                    </Button>
                    <Button 
                        onClick={() => onStartTiming(event.id)} 
                        disabled={event.entries.length === 0}
                        title={event.entries.length === 0 ? "Tambah peserta untuk memulai timing" : "Mulai timing lomba"}
                        className="flex-grow flex items-center justify-center"
                    >
                        <StopwatchIcon />
                        Timing
                    </Button>
                </div>
                <div className="mt-2">
                    <Button onClick={() => openDeleteConfirm(event)} variant="danger" className="w-full text-xs py-1">
                        Hapus Nomor Lomba
                    </Button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="md:col-span-2 lg:col-span-3 text-center text-text-secondary py-10">
              {searchQuery ? `Tidak ada nomor lomba yang cocok dengan "${searchQuery}".` : "Tidak ada nomor lomba dalam sesi ini."}
            </Card>
          )}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setFormError(null); }} title="Buat Nomor Lomba Baru">
        <form onSubmit={handleAddEvent} className="space-y-4">
            <div className="flex items-center p-2 bg-background rounded-md space-x-3">
                <input 
                    type="checkbox" 
                    id="isRelay" 
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                    checked={newEvent.isRelay} 
                    onChange={e => setNewEvent({...newEvent, isRelay: e.target.checked})} 
                />
                <label htmlFor="isRelay" className="font-medium text-text-primary">Nomor Estafet (Relay)</label>
            </div>

            {newEvent.isRelay && (
                <Input
                    label="Jumlah Perenang per Tim"
                    id="event-relay-legs"
                    type="number"
                    value={newEvent.relayLegs}
                    onChange={(e) => setNewEvent({ ...newEvent, relayLegs: parseInt(e.target.value) || 4 })}
                    required
                />
            )}
            <Input
                label={newEvent.isRelay ? 'Jarak per Perenang (meter)' : 'Jarak (meter)'}
                id="event-distance"
                type="number"
                value={newEvent.distance}
                onChange={(e) => {
                    setNewEvent({ ...newEvent, distance: parseInt(e.target.value) || 0 });
                    setFormError(null);
                }}
                required
            />
             <Input
                label="Kategori (Opsional, cth: KU 1-2, SMP)"
                id="event-category"
                type="text"
                value={newEvent.category}
                onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
            />
            <Select
                label="Gaya"
                id="event-style"
                value={newEvent.style}
                onChange={(e) => setNewEvent({ ...newEvent, style: e.target.value as SwimStyle })}
            >
                {SWIM_STYLE_OPTIONS.map((style) => (
                <option key={style} value={style}>
                    {translateSwimStyle(style)}
                </option>
                ))}
            </Select>
            <Select
                label="Jenis Kelamin"
                id="event-gender"
                value={newEvent.gender}
                onChange={(e) => setNewEvent({ ...newEvent, gender: e.target.value as Gender })}
            >
                {GENDER_OPTIONS.map((gender) => (
                <option key={gender} value={gender}>
                    {translateGender(gender)}
                </option>
                ))}
            </Select>
            {formError && <p className="text-red-500 text-sm text-center">{formError}</p>}
            <div className="flex justify-end pt-2">
                <Button type="submit">Buat Nomor Lomba</Button>
            </div>
        </form>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={closeDeleteConfirm} title="Konfirmasi Hapus Nomor Lomba">
        {eventToDelete && (
          <div className="space-y-6">
            <p className="text-text-secondary">
              Anda yakin ingin menghapus nomor lomba <strong className="text-text-primary">{formatEventName(eventToDelete)}</strong>?
              <br/>
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end space-x-4 mt-4">
              <Button variant="secondary" onClick={closeDeleteConfirm}>
                Batal
              </Button>
              <Button variant="danger" onClick={handleDeleteEvent}>
                Ya, Hapus
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} title="Konfirmasi Hapus Semua Nomor Lomba">
            <div className="space-y-6">
                <p className="text-text-secondary">
                    Anda benar-benar yakin ingin menghapus <strong className="text-text-primary">SEMUA</strong> data nomor lomba?
                    <br/><br/>
                    Tindakan ini akan <strong className="text-red-500">menghapus permanen</strong> semua nomor lomba beserta data pendaftaran dan hasil yang terkait.
                    <br />
                    Tindakan ini <strong className="font-bold">TIDAK DAPAT DIBATALKAN</strong>.
                </p>
                <div className="flex justify-end space-x-4">
                    <Button variant="secondary" onClick={() => setIsDeleteAllModalOpen(false)}>Batal</Button>
                    <Button variant="danger" onClick={handleConfirmDeleteAll}>Ya, Hapus Semua</Button>
                </div>
            </div>
      </Modal>

      <Modal isOpen={isUploadModalOpen} onClose={closeUploadModal} title="Unggah Nomor Lomba dari Excel">
        <div className="space-y-4">
            <div>
                <p className="text-text-secondary mb-2">Unggah file Excel (.xlsx) untuk menambahkan beberapa nomor lomba sekaligus. File harus memiliki kolom berikut:</p>
                <code className="block text-sm bg-surface p-2 rounded-md whitespace-pre">Jarak (m) | Gaya | Jenis Kelamin | Kategori | Jumlah Perenang</code>
                <p className="text-xs text-text-secondary mt-1">Kolom 'Kategori' dan 'Jumlah Perenang' bersifat opsional.</p>
                
                <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm font-semibold text-text-secondary mb-2">Contoh untuk nomor estafet (misal: 4x100m Estafet Gaya Ganti Campuran KU-3):</p>
                    <div className="bg-background p-2 rounded">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr>
                                    <th className="p-1 font-semibold">Jarak (m)</th>
                                    <th className="p-1 font-semibold">Gaya</th>
                                    <th className="p-1 font-semibold">Jenis Kelamin</th>
                                    <th className="p-1 font-semibold">Kategori</th>
                                    <th className="p-1 font-semibold">Jumlah Perenang</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-mono">
                                    <td className="p-1">100</td>
                                    <td className="p-1">Gaya Ganti</td>
                                    <td className="p-1">Campuran</td>
                                    <td className="p-1">KU-3</td>
                                    <td className="p-1">4</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <Button variant="secondary" onClick={handleDownloadTemplate}>
                Unduh Template
            </Button>

            <div className="flex items-center space-x-4 pt-4">
                <input type="file" id="event-upload" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
                <Button type="button" onClick={() => document.getElementById('event-upload')?.click()}>Pilih File</Button>
                {uploadFile && <span className="text-text-secondary text-sm">{uploadFile.name}</span>}
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
                <Button onClick={handleProcessUpload} disabled={!uploadFile || isProcessingUpload}>
                    {isProcessingUpload ? <Spinner /> : 'Proses & Tambahkan'}
                </Button>
            </div>

            {uploadResult && (
                <div className="mt-4 text-sm">
                    {uploadResult.errors.length > 0 ? (
                        <div>
                            <p className="text-red-500 font-bold">Ditemukan {uploadResult.errors.length} galat. {uploadResult.success > 0 ? `${uploadResult.success} nomor lomba berhasil ditambahkan.` : 'Tidak ada nomor lomba yang ditambahkan.'} Harap perbaiki file dan coba lagi.</p>
                            <ul className="list-disc list-inside h-24 overflow-y-auto bg-surface p-2 rounded-md mt-1 text-red-400">
                                {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    ) : (
                        <p className="text-green-500 font-bold">Berhasil! {uploadResult.success} nomor lomba baru telah ditambahkan.</p>
                    )}
                </div>
            )}
        </div>
    </Modal>
    </div>
  );
};
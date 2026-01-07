
import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { processParticipantUpload, getEvents, registerSwimmerToEvent } from '../services/databaseService';
import { formatEventName, formatTime, AGE_GROUP_OPTIONS } from '../constants';
import type { Swimmer, SwimEvent, CompetitionInfo } from '../types';
import { Gender } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useNotification } from './ui/NotificationManager';

declare var XLSX: any; // From script tag

interface ParticipantsViewProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  onUploadSuccess: () => void;
  competitionInfo: CompetitionInfo | null; // Added competitionInfo
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({ swimmers, events, onUploadSuccess, competitionInfo }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ newSwimmers: number; updatedSwimmers: number; errors: string[] } | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const { addNotification } = useNotification();
  
  // State for manual registration
  const [manualForm, setManualForm] = useState({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Dynamic Age Groups Logic
  const ageOptions = useMemo(() => {
      if (competitionInfo?.ageGroups) {
          return competitionInfo.ageGroups.split('\n').map(s => s.trim()).filter(Boolean);
      }
      return AGE_GROUP_OPTIONS;
  }, [competitionInfo]);

  useEffect(() => {
    setCanDownload(events.length > 0);
  }, [events]); 

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    setIsProcessing(true);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        
        const result = await processParticipantUpload(json);
        setUploadResult(result);
        if (result.errors.length === 0 && (result.newSwimmers > 0 || result.updatedSwimmers > 0)) {
            addNotification('File pendaftaran berhasil diproses!', 'success');
        } else if (result.errors.length > 0) {
            addNotification(`Impor selesai dengan ${result.errors.length} galat.`, 'error');
        }
        if (result.newSwimmers > 0 || result.updatedSwimmers > 0) {
          onUploadSuccess(); // Trigger global data refresh
        }
      } catch (error: any) {
        addNotification(`Gagal memproses file: ${error.message}`, 'error');
        setUploadResult({ newSwimmers: 0, updatedSwimmers: 0, errors: ['Gagal membaca atau memproses file.', error.message] });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
  const downloadTemplate = async () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }
    
    setIsDownloading(true);
    try {
        if (events.length === 0) {
             alert("Template tidak dapat dibuat karena belum ada nomor lomba. Silakan buat nomor lomba terlebih dahulu di menu 'Pengaturan Acara'.");
             return;
        }

        const workbook = XLSX.utils.book_new();

        // 1. Persiapan Data untuk Dropdown Pintar
        const allKUs = ageOptions;
        const eventsByKU: Record<string, string[]> = {};
        allKUs.forEach(ku => {
            eventsByKU[ku] = events.filter(e => e.category === ku).map(e => formatEventName(e));
        });
        const openEvents = events.filter(e => !e.category).map(e => formatEventName(e));
        if (openEvents.length > 0) {
            eventsByKU["Open"] = openEvents;
            if (!allKUs.includes("Open")) allKUs.push("Open");
        }

        // 2. Sheet DataMaster (Source data dropdown)
        const masterAOA: any[][] = [
            ["DAFTAR_KU", "", "DATA_NOMOR_LOMBA"],
            ...allKUs.map(ku => [ku])
        ];

        // Masukkan event per kolom sesuai KU
        const maxEventsCount = Math.max(...Object.values(eventsByKU).map(l => l.length));
        for (let i = 0; i < maxEventsCount; i++) {
            allKUs.forEach((ku, kIdx) => {
                if (!masterAOA[i+1]) masterAOA[i+1] = Array(allKUs.length + 2).fill("");
                masterAOA[i+1][kIdx + 2] = eventsByKU[ku][i] || "";
            });
        }
        const wsMaster = XLSX.utils.aoa_to_sheet(masterAOA);
        XLSX.utils.book_append_sheet(workbook, wsMaster, "DataMaster");

        // 3. Named Ranges (Kunci untuk INDIRECT)
        const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
        if (!workbook.Workbook) workbook.Workbook = {};
        if (!workbook.Workbook.Names) workbook.Workbook.Names = [];

        workbook.Workbook.Names.push({ name: "LIST_KU", formula: `DataMaster!$A$2:$A$${allKUs.length + 1}` });
        allKUs.forEach((ku, idx) => {
            const col = String.fromCharCode(67 + idx); // Start column C
            const count = eventsByKU[ku].length;
            if (count > 0) {
                workbook.Workbook.Names.push({ name: sanitize(ku), formula: `DataMaster!$${col}$2:$${col}$${count + 1}` });
            }
        });

        // 4. Sheet Template Pendaftaran
        const templateAOA = [
            ["Nama Atlet", "Tahun Lahir", "Jenis Kelamin (L/P)", "Nama Tim", "KU", "Nomor Lomba", "Waktu Unggulan (mm:ss.SS)"],
            ["CONTOH ATLET", 2010, "L", "TIM CEPAT", allKUs[0], eventsByKU[allKUs[0]]?.[0] || "", "01:25.50"]
        ];
        const wsTemplate = XLSX.utils.aoa_to_sheet(templateAOA);
        wsTemplate['!cols'] = [ { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 50 }, { wch: 25 }];

        // 5. Data Validation
        const maxRows = 1000;
        if (!wsTemplate['!dataValidation']) wsTemplate['!dataValidation'] = [];

        // JK
        wsTemplate['!dataValidation'].push({ sqref: `C2:C${maxRows}`, opts: { type: 'list', formula1: '"L,P"' } });
        // KU
        wsTemplate['!dataValidation'].push({ sqref: `E2:E${maxRows}`, opts: { type: 'list', formula1: 'LIST_KU', showDropDown: true } });
        // Nomor Lomba (Dependent)
        wsTemplate['!dataValidation'].push({ 
            sqref: `F2:F${maxRows}`, 
            opts: { 
                type: 'list', 
                formula1: 'INDIRECT(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(E2," ","_"),"-","_"),"/","_"),".","_"))', 
                showDropDown: true 
            } 
        });

        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Template Pendaftaran");
        XLSX.writeFile(workbook, "Template_Pendaftaran_Lomba_Cerdas.xlsx");

    } catch(error) {
        console.error("Failed to generate template:", error);
        alert("Gagal membuat template.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleDownloadParticipants = () => {
    if (typeof XLSX === 'undefined') {
      alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
      return;
    }

    if (swimmers.length === 0) {
      alert('Tidak ada data atlet untuk diunduh.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    // --- Sheet 1: Rekap Atlet ---
    const sortedSwimmers = [...swimmers].sort((a, b) => a.name.localeCompare(b.name));
    const participantsData = sortedSwimmers.map((swimmer, index) => ({
      "No": index + 1,
      "Nama Atlet": swimmer.name,
      "Nama Tim": swimmer.club,
      "Jenis Kelamin (L/P)": swimmer.gender === 'Male' ? 'L' : 'P'
    }));
    const wsParticipants = XLSX.utils.json_to_sheet(participantsData, { skipHeader: false });
    wsParticipants['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 35 },
        { wch: 20 }
    ];

    const totalMale = swimmers.filter(s => s.gender === 'Male').length;
    const totalFemale = swimmers.filter(s => s.gender === 'Female').length;
    XLSX.utils.sheet_add_aoa(wsParticipants, [
        [], // Spacer row
        ["REKAPITULASI JUMLAH ATLET"],
        ["Total Putra (L)", totalMale],
        ["Total Putri (P)", totalFemale],
        ["Total Keseluruhan", swimmers.length]
    ], { origin: -1 });
    const summaryHeaderRowIndex = participantsData.length + 2;
    if (!wsParticipants['!merges']) wsParticipants['!merges'] = [];
    wsParticipants['!merges'].push({ s: { r: summaryHeaderRowIndex, c: 0 }, e: { r: summaryHeaderRowIndex, c: 1 } });
    XLSX.utils.book_append_sheet(workbook, wsParticipants, "Rekap Atlet");

    // --- Sheet 2: Rekap Tim ---
    const clubRecap: Record<string, { male: number; female: number }> = {};
    swimmers.forEach(swimmer => {
      if (!clubRecap[swimmer.club]) {
        clubRecap[swimmer.club] = { male: 0, female: 0 };
      }
      if (swimmer.gender === 'Male') {
        clubRecap[swimmer.club].male++;
      } else {
        clubRecap[swimmer.club].female++;
      }
    });

    const sortedClubs = Object.entries(clubRecap).sort((a, b) => a[0].localeCompare(b[0]));
    const clubsData = sortedClubs.map(([clubName, counts], index) => ({
      "No": index + 1,
      "Nama Tim": clubName,
      "Jumlah Putra (L)": counts.male,
      "Jumlah Putri (P)": counts.female,
      "Total Atlet": counts.male + counts.female
    }));
    const wsClubs = XLSX.utils.json_to_sheet(clubsData, { skipHeader: false });
    wsClubs['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 }
    ];

    const grandTotalMale = sortedClubs.reduce((acc, [, counts]) => acc + counts.male, 0);
    const grandTotalFemale = sortedClubs.reduce((acc, [, counts]) => acc + counts.female, 0);
    const grandTotal = grandTotalMale + grandTotalFemale;

    XLSX.utils.sheet_add_aoa(wsClubs, [
        [], // Spacer row
        ["", "TOTAL KESELURUHAN", grandTotalMale, grandTotalFemale, grandTotal]
    ], { origin: -1 });

    XLSX.utils.book_append_sheet(workbook, wsClubs, "Rekap Tim");

    XLSX.writeFile(workbook, "Rekap_Peserta_Kompetisi.xlsx");
  };

  const handleDownloadFullRegistration = () => {
    if (typeof XLSX === 'undefined') {
        alert('Pustaka untuk membuat file Excel belum termuat. Periksa koneksi internet Anda dan muat ulang halaman.');
        return;
    }

    if (events.length === 0) {
        alert('Tidak ada data pendaftaran untuk diunduh.');
        return;
    }
    
    setIsDownloading(true);

    try {
        const dataToExport = [];
        // FIX: Explicitly typed the Map to ensure correct type inference for the swimmer object.
        const swimmersMap = new Map<string, Swimmer>(swimmers.map(s => [s.id, s]));

        for (const event of events) {
            for (const entry of event.entries) {
                const swimmer: Swimmer | undefined = swimmersMap.get(entry.swimmerId);
                if (swimmer) {
                    dataToExport.push({
                        "Nama Atlet": swimmer.name,
                        "Jenis Kelamin": swimmer.gender === 'Male' ? 'L' : 'P',
                        "Tahun Lahir": swimmer.birthYear,
                        "Nama Tim": swimmer.club,
                        "Nomor Lomba": formatEventName(event),
                        "Waktu Unggulan": formatTime(entry.seedTime)
                    });
                }
            }
        }
        
        dataToExport.sort((a, b) => {
            const clubCompare = a["Nama Tim"].localeCompare(b["Nama Tim"]);
            if (clubCompare !== 0) return clubCompare;
            const nameCompare = a["Nama Atlet"].localeCompare(b["Nama Atlet"]);
            if (nameCompare !== 0) return nameCompare;
            return a["Nomor Lomba"].localeCompare(b["Nomor Lomba"]);
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!cols'] = [ { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 45 }, { wch: 20 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Pendaftaran Lengkap");
        XLSX.writeFile(workbook, "Rekap_Pendaftaran_Lengkap.xlsx");
    } catch (error) {
        console.error("Failed to generate full registration report:", error);
        alert("Gagal membuat laporan pendaftaran. Silakan coba lagi.");
    } finally {
        setIsDownloading(false);
    }
  };


  // --- Manual Registration Logic ---
  const handleManualFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
  };
  
  const availableCategories = useMemo(() => {
    const categories = new Set(events.map(e => e.category || 'Tanpa Kategori'));
    return Array.from(categories).sort();
  }, [events]);
  
  const availableEventsForManualReg = useMemo(() => {
      if (!manualForm.swimmerId) return [];
      const swimmer = swimmers.find(s => s.id === manualForm.swimmerId);
      if (!swimmer) return [];

      const registeredEventIds = new Set<string>(
          events.filter(e => e.entries.some(en => en.swimmerId === swimmer.id)).map(e => e.id)
      );

      return events.filter(event => {
          const genderMatch =
              event.gender === 'Mixed' ||
              (swimmer.gender === 'Male' && event.gender === "Men's") ||
              (swimmer.gender === 'Female' && event.gender === "Women's");
          
          const categoryMatch = categoryFilter === 'all' || (event.category || 'Tanpa Kategori') === categoryFilter;

          return !registeredEventIds.has(event.id) && genderMatch && categoryMatch;
      });
  }, [manualForm.swimmerId, swimmers, events, categoryFilter]);

  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.swimmerId || !manualForm.eventId) {
        addNotification('Silakan pilih atlet dan nomor lomba.', 'error');
        return;
    }

    const min = parseInt(manualForm.min || '0');
    const sec = parseInt(manualForm.sec || '0');
    const ms = parseInt(manualForm.ms || '0');
    
    if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
        addNotification('Input detik harus di bawah 60, kecuali untuk "No Time" (99:99.99).', 'error');
        return;
    }

    setIsProcessing(true);
    let seedTime = (min * 60000) + (sec * 1000) + (ms * 10);
    if (min === 99 && sec === 99 && ms === 99) {
        seedTime = 0;
    }
    
    try {
        const result = await registerSwimmerToEvent(manualForm.eventId, manualForm.swimmerId, seedTime);
        if (result.success) {
            addNotification('Pendaftaran berhasil ditambahkan!', 'success');
            setManualForm({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
            onUploadSuccess(); // Refresh all data
        } else {
            addNotification(result.message, 'error');
        }
    } catch (err: any) {
        addNotification(`Gagal mendaftar: ${err.message}`, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manajemen Peserta</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-xl font-bold mb-4">Pendaftaran Manual</h2>
          <form onSubmit={handleManualRegister} className="space-y-4">
            <Select label="Pilih Atlet" id="manual-swimmer" name="swimmerId" value={manualForm.swimmerId} onChange={handleManualFormChange}>
                <option value="">-- Pilih Atlet --</option>
                {swimmers.sort((a,b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name} ({s.club})</option>)}
            </Select>
            <Select
                label="Filter berdasarkan Kategori"
                id="manual-category-filter"
                value={categoryFilter}
                onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setManualForm(prev => ({ ...prev, eventId: '' })); // Reset event selection
                }}
                disabled={!manualForm.swimmerId}
            >
                <option value="all">Semua Kategori</option>
                {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                ))}
            </Select>
            <Select 
              label="Pilih Nomor Lomba" 
              id="manual-event" 
              name="eventId" 
              value={manualForm.eventId} 
              onChange={handleManualFormChange} 
              disabled={!manualForm.swimmerId || availableEventsForManualReg.length === 0}
            >
                <option value="">-- Pilih Nomor Lomba --</option>
                {availableEventsForManualReg.map(e => <option key={e.id} value={e.id}>{formatEventName(e)}</option>)}
            </Select>
             <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Waktu Unggulan</label>
                <div className="grid grid-cols-3 gap-2">
                    <Input label="Menit" id="manual-min" name="min" type="number" min="0" value={manualForm.min} onChange={handleManualFormChange} />
                    <Input label="Detik" id="manual-sec" name="sec" type="number" min="0" max="99" value={manualForm.sec} onChange={handleManualFormChange} />
                    <Input label="ss/100" id="manual-ms" name="ms" type="number" min="0" max="99" value={manualForm.ms} onChange={handleManualFormChange} />
                </div>
            </div>
            <div className="pt-2">
                <Button type="submit" className="w-full" disabled={isProcessing}>
                    {isProcessing ? <Spinner/> : 'Daftarkan Atlet'}
                </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-xl font-bold mb-4">Pendaftaran Massal via Excel</h2>
          <div className="bg-background p-4 rounded-md border border-border space-y-3 mb-4">
              <div>
                <p className="text-text-secondary">Unggah file Excel (.xlsx) dengan kolom berikut untuk mendaftarkan peserta ke nomor lomba:</p>
                <code className="block text-sm bg-surface p-2 rounded-md whitespace-pre mt-1">Nama Atlet | Tahun Lahir | Jenis Kelamin (L/P) | Nama Tim | KU | Nomor Lomba | Waktu Unggulan (mm:ss.SS)</code>
              </div>
              <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={downloadTemplate} disabled={isDownloading || !canDownload} title={!canDownload ? "Buat 'Nomor Lomba' terlebih dahulu untuk mengunduh template" : "Unduh template Excel pintar dengan validasi KU dan Nomor Lomba"}>
                      {isDownloading ? <Spinner /> : 'Unduh Template Pendaftaran'}
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadParticipants} disabled={swimmers.length === 0} title={swimmers.length === 0 ? "Tidak ada atlet untuk diunduh" : "Unduh rekap semua atlet"}>
                      Unduh Rekap Atlet
                  </Button>
                   <Button variant="secondary" onClick={handleDownloadFullRegistration} disabled={isDownloading || events.length === 0 || swimmers.length === 0} title="Unduh rekap lengkap semua pendaftaran per nomor lomba">
                      {isDownloading ? <Spinner /> : 'Unduh Rekap Pendaftaran Lengkap'}
                    </Button>
              </div>
              <p className="text-xs text-text-secondary">{canDownload ? "Template Pendaftaran sudah dilengkapi dropdown KU dan Nomor Lomba yang saling terhubung." : "Tombol 'Unduh Template Pendaftaran' akan aktif setelah Anda membuat setidaknya satu nomor lomba."}</p>
          </div>

          <div className="flex items-center space-x-4">
              <input type="file" id="participant-upload" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
              <Button type="button" onClick={() => document.getElementById('participant-upload')?.click()}>Pilih File Pendaftaran</Button>
              {file && <span className="text-text-secondary">{file.name}</span>}
          </div>

          <div className="mt-4"><Button onClick={handleUpload} disabled={!file || isProcessing}>{isProcessing ? <Spinner/> : 'Proses File Pendaftaran'}</Button></div>

          {uploadResult && (
              <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="font-bold text-lg">Hasil Impor:</h3>
                  {(uploadResult.newSwimmers > 0 || uploadResult.updatedSwimmers > 0) && (
                      <div className="text-green-400 space-y-1 my-2"><p><strong>Total entri lomba berhasil diproses: {uploadResult.updatedSwimmers}</strong></p>
                      {uploadResult.newSwimmers > 0 && <p className="text-sm pl-2">({uploadResult.newSwimmers} atlet/tim baru ditambahkan ke database)</p>}
                      </div>
                  )}
                  {uploadResult.errors.length > 0 && (
                      <div className="mt-2"><p className="text-red-500">{uploadResult.errors.length} baris gagal diproses:</p><ul className="list-disc list-inside text-red-500 text-sm h-32 overflow-y-auto bg-surface p-2 rounded-md mt-1">{uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}</ul></div>
                  )}
                  {uploadResult.newSwimmers === 0 && uploadResult.updatedSwimmers === 0 && uploadResult.errors.length === 0 && (<p className="text-text-secondary">Tidak ada data baru yang ditambahkan dari file.</p>)}
              </div>
          )}
        </Card>
      </div>
    </div>
  );
};

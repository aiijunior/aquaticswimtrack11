import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { processParticipantUpload, getEvents, registerSwimmerToEvent } from '../services/databaseService';
import { formatEventName, formatTime } from '../constants';
import type { Swimmer, SwimEvent } from '../types';
import { Gender } from '../types';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

declare var XLSX: any; // From script tag

interface ParticipantsViewProps {
  swimmers: Swimmer[];
  events: SwimEvent[];
  onUploadSuccess: () => void;
}

export const ParticipantsView: React.FC<ParticipantsViewProps> = ({ swimmers, events, onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ newSwimmers: number; updatedSwimmers: number; errors: string[] } | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  
  // State for manual registration
  const [manualForm, setManualForm] = useState({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
  const [statusMessage, setStatusMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

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
        
        const uploadResult = await processParticipantUpload(json);
        setUploadResult(uploadResult);
        if (uploadResult.newSwimmers > 0 || uploadResult.updatedSwimmers > 0) {
          onUploadSuccess(); // Trigger global data refresh
        }
      } catch (error: any) {
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

        const templateData: any[] = [];
        const columnHeaders = {
            "Nama Peserta": "",
            "Tahun Lahir": "",
            "Jenis Kelamin (L/P)": "",
            "Klub/Tim": "",
            "KU": "",
            "Nomor Lomba": "",
            "Waktu Unggulan (mm:ss.SS)": ""
        };

        const addSectionHeader = (title: string) => {
            templateData.push({ ...columnHeaders, "Nama Peserta": `--- ${title.toUpperCase()} ---` });
        };

        // --- EXAMPLE: PERORANGAN PUTRA ---
        const maleEvents = events.filter(e => e.gender === Gender.MALE && !e.relayLegs);
        if (maleEvents.length > 0) {
            addSectionHeader("Contoh Pendaftaran Perorangan Putra");
            const exampleEvents = maleEvents.slice(0, 2); // Take up to 2 examples
            exampleEvents.forEach((event, index) => {
                templateData.push({
                    "Nama Peserta": "Budi Perkasa",
                    "Tahun Lahir": 2005,
                    "Jenis Kelamin (L/P)": "L",
                    "Klub/Tim": "Klub Cepat",
                    "KU": "KU 1",
                    "Nomor Lomba": formatEventName(event),
                    "Waktu Unggulan (mm:ss.SS)": index === 0 ? "01:05.50" : "99:99.99"
                });
            });
            templateData.push(columnHeaders); // Spacer
        }

        // --- EXAMPLE: PERORANGAN PUTRI ---
        const femaleEvents = events.filter(e => e.gender === Gender.FEMALE && !e.relayLegs);
        if (femaleEvents.length > 0) {
            addSectionHeader("Contoh Pendaftaran Perorangan Putri");
            const exampleEvents = femaleEvents.slice(0, 2);
            exampleEvents.forEach((event, index) => {
                templateData.push({
                    "Nama Peserta": "Siti Cepat",
                    "Tahun Lahir": 2006,
                    "Jenis Kelamin (L/P)": "P",
                    "Klub/Tim": "Klub Cepat",
                    "KU": "KU Senior",
                    "Nomor Lomba": formatEventName(event),
                    "Waktu Unggulan (mm:ss.SS)": index === 0 ? "01:15.20" : "00:31.40"
                });
            });
            templateData.push(columnHeaders); // Spacer
        }

        // --- EXAMPLE: ESTAFET (RELAY) ---
        const relayMaleEvent = events.find(e => e.gender === Gender.MALE && e.relayLegs);
        const relayFemaleEvent = events.find(e => e.gender === Gender.FEMALE && e.relayLegs);
        const relayMixedEvent = events.find(e => e.gender === Gender.MIXED && e.relayLegs);

        if (relayMaleEvent || relayFemaleEvent || relayMixedEvent) {
            addSectionHeader("Contoh Pendaftaran Estafet (Relay)");
            templateData.push({
                ...columnHeaders,
                "Nama Peserta": "CATATAN: Untuk Estafet, 'Nama Peserta' diisi NAMA TIM, 'Tahun Lahir' dan 'KU' dikosongkan."
            });

            if (relayMaleEvent) {
                templateData.push({
                    "Nama Peserta": `Tim Putra Klub Cepat`,
                    "Tahun Lahir": "", // Intentionally blank for relays
                    "Jenis Kelamin (L/P)": "L", // Gender is used to identify the team type
                    "Klub/Tim": "Klub Cepat",
                    "KU": "",
                    "Nomor Lomba": formatEventName(relayMaleEvent),
                    "Waktu Unggulan (mm:ss.SS)": "04:10.00"
                });
            }
            if (relayFemaleEvent) {
                templateData.push({
                    "Nama Peserta": `Tim Putri Klub Cepat`,
                    "Tahun Lahir": "",
                    "Jenis Kelamin (L/P)": "P",
                    "Klub/Tim": "Klub Cepat",
                     "KU": "",
                    "Nomor Lomba": formatEventName(relayFemaleEvent),
                    "Waktu Unggulan (mm:ss.SS)": "04:30.00"
                });
            }
            if (relayMixedEvent) {
                templateData.push({
                    "Nama Peserta": `Tim Campuran Klub Cepat`,
                    "Tahun Lahir": "",
                    "Jenis Kelamin (L/P)": "L", // For mixed, can be L or P, often tied to team contact
                    "Klub/Tim": "Klub Cepat",
                     "KU": "",
                    "Nomor Lomba": formatEventName(relayMixedEvent),
                    "Waktu Unggulan (mm:ss.SS)": "04:20.00"
                });
            }
            templateData.push(columnHeaders); // Spacer
        }
        
        // --- If no examples could be generated ---
        if (templateData.length === 0) {
             templateData.push({
                "Nama Peserta": "Contoh Nama",
                "Tahun Lahir": 2005,
                "Jenis Kelamin (L/P)": "L",
                "Klub/Tim": "Klub Contoh",
                "KU": "KU 1",
                "Nomor Lomba": events.length > 0 ? formatEventName(events[0]) : "Tidak ada nomor lomba",
                "Waktu Unggulan (mm:ss.SS)": "01:25.50"
            });
        }

        const workbook = XLSX.utils.book_new();
        
        // --- Sheet 1: Template Pendaftaran ---
        const wsTemplate = XLSX.utils.json_to_sheet(templateData, { skipHeader: true }); // Use skipHeader and manually add it
        
        // Manually create the header row
        const header = ["Nama Peserta", "Tahun Lahir", "Jenis Kelamin (L/P)", "Klub/Tim", "KU", "Nomor Lomba", "Waktu Unggulan (mm:ss.SS)"];
        XLSX.utils.sheet_add_aoa(wsTemplate, [header], { origin: "A1" });

        const maxRows = 2000;
        if (!wsTemplate['!dataValidation']) wsTemplate['!dataValidation'] = [];
        // Data validation for Race Name
        wsTemplate['!dataValidation'].push({
            sqref: `F2:F${maxRows}`, 
            opts: { type: 'list', allowBlank: false, formula1: `'Daftar Nomor Lomba'!$A$6:$A$${events.length + 6}`, showDropDown: true, error: 'Silakan pilih nomor lomba yang valid dari daftar.', errorTitle: 'Pilihan Tidak Valid' }
        });
        // Data validation for Gender
        wsTemplate['!dataValidation'].push({
            sqref: `C2:C${maxRows}`,
            opts: { type: 'list', allowBlank: false, formula1: `"L,P"`, showDropDown: true, error: 'Gunakan "L" untuk Laki-laki atau "P" untuk Perempuan.', errorTitle: 'Pilihan Tidak Valid'}
        });
        
        wsTemplate['!cols'] = [ { wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 50 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Template Pendaftaran");
        
        // --- Sheet 2: Daftar Nomor Lomba ---
        const allEventsFormatted = events.sort((a,b) => formatEventName(a).localeCompare(formatEventName(b))).map(e => [formatEventName(e)]); // Create array of arrays
        
        const raceListAOA = [
            ['PETUNJUK PENGISIAN NOMOR LOMBA'],
            ["Salin (copy) nama nomor lomba dari kolom A di bawah ini, lalu tempel (paste) ke kolom 'Nomor Lomba' di sheet 'Template Pendaftaran'."],
            ["Pastikan nama nomor lomba sesuai persis dengan yang ada di daftar ini."],
            [], // Spacer
            ['DAFTAR LOMBA YANG TERSEDIA']
        ];
        
        const newMerges = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 0 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 0 } },
            { s: { r: 4, c: 0 }, e: { r: 4, c: 0 } }
        ];

        const fullRaceListAOA = raceListAOA.concat(allEventsFormatted);
        
        const wsRaces = XLSX.utils.aoa_to_sheet(fullRaceListAOA);
        wsRaces['!cols'] = [ { wch: 70 } ];
        wsRaces['!merges'] = newMerges;

        XLSX.utils.book_append_sheet(workbook, wsRaces, "Daftar Nomor Lomba");

        // --- Write File ---
        XLSX.writeFile(workbook, "Template_Pendaftaran_Lomba.xlsx");

    } catch(error) {
        console.error("Failed to generate template:", error);
        alert("Gagal membuat template. Silakan coba lagi.");
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
      alert('Tidak ada data peserta untuk diunduh.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    // --- Sheet 1: Rekap Peserta ---
    const sortedSwimmers = [...swimmers].sort((a, b) => a.name.localeCompare(b.name));
    const participantsData = sortedSwimmers.map((swimmer, index) => ({
      "No": index + 1,
      "Nama Peserta": swimmer.name,
      "Klub/Tim": swimmer.club,
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
        ["REKAPITULASI JUMLAH PESERTA"],
        ["Total Putra (L)", totalMale],
        ["Total Putri (P)", totalFemale],
        ["Total Keseluruhan", swimmers.length]
    ], { origin: -1 });
    const summaryHeaderRowIndex = participantsData.length + 2;
    if (!wsParticipants['!merges']) wsParticipants['!merges'] = [];
    wsParticipants['!merges'].push({ s: { r: summaryHeaderRowIndex, c: 0 }, e: { r: summaryHeaderRowIndex, c: 1 } });
    XLSX.utils.book_append_sheet(workbook, wsParticipants, "Rekap Peserta");

    // --- Sheet 2: Rekap Klub ---
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
      "Nama Klub/Tim": clubName,
      "Jumlah Putra (L)": counts.male,
      "Jumlah Putri (P)": counts.female,
      "Total Peserta": counts.male + counts.female
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

    XLSX.utils.book_append_sheet(workbook, wsClubs, "Rekap Klub");

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
                        "Nama Peserta": swimmer.name,
                        "Jenis Kelamin": swimmer.gender === 'Male' ? 'L' : 'P',
                        "Tahun Lahir": swimmer.birthYear,
                        "Klub/Tim": swimmer.club,
                        "Nomor Lomba": formatEventName(event),
                        "Waktu Unggulan": formatTime(entry.seedTime)
                    });
                }
            }
        }
        
        dataToExport.sort((a, b) => {
            const clubCompare = a["Klub/Tim"].localeCompare(b["Klub/Tim"]);
            if (clubCompare !== 0) return clubCompare;
            const nameCompare = a["Nama Peserta"].localeCompare(b["Nama Peserta"]);
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
    setStatusMessage(null); // Clear message on new input
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
    setStatusMessage(null);
    if (!manualForm.swimmerId || !manualForm.eventId) {
        setStatusMessage({type: 'error', text: 'Silakan pilih perenang dan nomor lomba.'});
        return;
    }

    const min = parseInt(manualForm.min || '0');
    const sec = parseInt(manualForm.sec || '0');
    const ms = parseInt(manualForm.ms || '0');
    
    if (sec >= 60 && !(min === 99 && sec === 99 && ms === 99)) {
        setStatusMessage({type: 'error', text: 'Input detik harus di bawah 60, kecuali untuk "No Time" (99:99.99).'});
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
            setStatusMessage({type: 'success', text: 'Pendaftaran berhasil ditambahkan!'});
            setManualForm({ swimmerId: '', eventId: '', min: '99', sec: '99', ms: '99' });
            onUploadSuccess(); // Refresh all data
        } else {
            setStatusMessage({type: 'error', text: result.message});
        }
    } catch (err: any) {
        setStatusMessage({type: 'error', text: `Gagal mendaftar: ${err.message}`});
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
            <Select label="Pilih Perenang" id="manual-swimmer" name="swimmerId" value={manualForm.swimmerId} onChange={handleManualFormChange}>
                <option value="">-- Pilih Perenang --</option>
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
             {statusMessage && <p className={`text-sm text-center ${statusMessage.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{statusMessage.text}</p>}
            <div className="pt-2">
                <Button type="submit" className="w-full" disabled={isProcessing}>
                    {isProcessing ? <Spinner/> : 'Daftarkan Peserta'}
                </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-xl font-bold mb-4">Pendaftaran Massal via Excel</h2>
          <div className="bg-background p-4 rounded-md border border-border space-y-3 mb-4">
              <div>
                <p className="text-text-secondary">Unggah file Excel (.xlsx) dengan kolom berikut untuk mendaftarkan peserta ke nomor lomba:</p>
                <code className="block text-sm bg-surface p-2 rounded-md whitespace-pre mt-1">Nama Peserta | Tahun Lahir | Jenis Kelamin (L/P) | Klub/Tim | KU | Nomor Lomba | Waktu Unggulan (mm:ss.SS)</code>
              </div>
              <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={downloadTemplate} disabled={isDownloading || !canDownload} title={!canDownload ? "Buat 'Nomor Lomba' terlebih dahulu untuk mengunduh template" : "Unduh template Excel dengan daftar nomor lomba"}>
                      {isDownloading ? <Spinner /> : 'Unduh Template Pendaftaran'}
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadParticipants} disabled={swimmers.length === 0} title={swimmers.length === 0 ? "Tidak ada peserta untuk diunduh" : "Unduh rekap semua peserta"}>
                      Unduh Rekap Peserta
                  </Button>
                   <Button variant="secondary" onClick={handleDownloadFullRegistration} disabled={isDownloading || events.length === 0 || swimmers.length === 0} title="Unduh rekap lengkap semua pendaftaran per nomor lomba">
                      {isDownloading ? <Spinner /> : 'Unduh Rekap Pendaftaran Lengkap'}
                    </Button>
              </div>
              <p className="text-xs text-text-secondary">{canDownload ? "Template Pendaftaran akan berisi daftar nomor lomba yang telah dibuat." : "Tombol 'Unduh Template Pendaftaran' akan aktif setelah Anda membuat setidaknya satu nomor lomba."}</p>
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
                      {uploadResult.newSwimmers > 0 && <p className="text-sm pl-2">({uploadResult.newSwimmers} perenang/tim baru ditambahkan ke database)</p>}
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
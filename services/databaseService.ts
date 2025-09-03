// --- START: IndexedDB Offline-First Service ---

import type { Swimmer, SwimEvent, Result, CompetitionInfo, EventEntry, SwimRecord, User, FormattableEvent } from '../types';
import { supabase } from './supabaseClient';
import { Gender, SwimStyle, RecordType } from '../types';
import { GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, toTitleCase } from '../constants';
import { config } from '../config';
import type { Database } from './database.types';

// --- Helper function to map snake_case from DB to camelCase for the app ---
const toCompetitionInfo = (data: any): CompetitionInfo => ({
    eventName: data.event_name,
    eventDate: data.event_date,
    eventLogo: data.event_logo,
    sponsorLogo: data.sponsor_logo,
    isRegistrationOpen: data.is_registration_open,
    numberOfLanes: data.number_of_lanes
});

const toSwimmer = (data: any): Swimmer => ({
    id: data.id,
    name: data.name,
    birthYear: data.birth_year,
    gender: data.gender,
    club: data.club
});

const toEventEntry = (data: any): EventEntry => ({
    swimmerId: data.swimmer_id,
    seedTime: data.seed_time
});

const toResult = (data: any): Result => ({
    swimmerId: data.swimmer_id,
    time: data.time
});

const toSwimEvent = (data: any): SwimEvent => ({
    id: data.id,
    distance: data.distance,
    style: data.style,
    gender: data.gender,
    sessionNumber: data.session_number,
    heatOrder: data.heat_order,
    sessionDateTime: data.session_date_time,
    relayLegs: data.relay_legs,
    category: data.category,
    entries: data.event_entries?.map(toEventEntry) || [],
    results: data.event_results?.map(toResult) || []
});

const toRecord = (data: any): SwimRecord => ({
    id: data.id,
    type: data.type,
    gender: data.gender,
    distance: data.distance,
    style: data.style,
    time: data.time,
    holderName: data.holder_name,
    yearSet: data.year_set,
    locationSet: data.location_set,
    relayLegs: data.relay_legs,
    category: data.category
});

const toUser = (data: any): User => ({
  id: data.id,
  email: undefined,
  role: data.role,
  app_metadata: {},
  user_metadata: {},
  aud: '',
  created_at: data.created_at,
});

const toRecordDbFormat = (r: SwimRecord) => ({
    id: r.id, type: r.type, gender: r.gender, distance: r.distance, style: r.style, time: r.time,
    holder_name: r.holderName, year_set: r.yearSet, location_set: r.locationSet, relay_legs: r.relayLegs,
    category: r.category,
});

// --- Public-facing, Online-only functions ---

// --- Competition Info ---
export const getCompetitionInfo = async (): Promise<CompetitionInfo> => {
    const { data, error } = await supabase.from('competition_info').select('*').eq('id', 1).single();
    if (error || !data) {
        console.error("Error or no data fetching competition info:", error);
        return { 
            eventName: config.competition.defaultName, 
            eventDate: '', 
            eventLogo: null, 
            sponsorLogo: null, 
            isRegistrationOpen: false, 
            numberOfLanes: config.competition.defaultLanes 
        };
    }
    return toCompetitionInfo(data);
};

export const updateCompetitionInfo = async (info: CompetitionInfo): Promise<CompetitionInfo> => {
    const { data, error } = await supabase
        .from('competition_info')
        .upsert([{
            id: 1,
            event_name: info.eventName,
            event_date: info.eventDate,
            event_logo: info.eventLogo,
            sponsor_logo: info.sponsorLogo,
            is_registration_open: info.isRegistrationOpen,
            number_of_lanes: info.numberOfLanes
        }])
        .select()
        .single();
    if (error) throw error;
    return toCompetitionInfo(data);
};

// --- Swimmers ---
export const getSwimmers = async (): Promise<Swimmer[]> => {
  const { data, error } = await supabase.from('swimmers').select('*');
  if (error) throw error;
  return data.map(toSwimmer);
};

export const addSwimmer = async (swimmer: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
  const newSwimmer: Swimmer = { ...swimmer, id: crypto.randomUUID() };
  const payload: Database['public']['Tables']['swimmers']['Insert'] = {
      id: newSwimmer.id,
      name: newSwimmer.name,
      birth_year: newSwimmer.birthYear,
      gender: newSwimmer.gender,
      club: newSwimmer.club
  };
  const { data, error } = await supabase.from('swimmers').insert([payload]).select().single();
  if (error) throw error;
  return toSwimmer(data);
};

export const updateSwimmer = async (swimmerId: string, updatedData: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
    const { data, error } = await supabase
        .from('swimmers')
        .update({ name: updatedData.name, birth_year: updatedData.birthYear, gender: updatedData.gender, club: updatedData.club })
        .eq('id', swimmerId)
        .select()
        .single();
    if (error) throw error;
    return toSwimmer(data);
};

export const deleteSwimmer = async (swimmerId: string): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().eq('id', swimmerId);
    if (error) throw error;
};

export const deleteAllSwimmers = async (): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

export const getSwimmerById = async (id: string): Promise<Swimmer | undefined> => {
    const { data, error } = await supabase.from('swimmers').select('*').eq('id', id).single();
    if (error || !data) return undefined;
    return toSwimmer(data);
};

// --- Events ---
export const getEvents = async (): Promise<SwimEvent[]> => {
  const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)').order('session_number').order('heat_order');
  if (error) throw error;
  return data.map(toSwimEvent);
};

export const addEvent = async (event: Omit<SwimEvent, 'id' | 'entries' | 'results'>): Promise<SwimEvent> => {
  const newEvent: SwimEvent = { ...event, id: crypto.randomUUID(), entries: [], results: [] };
  const payload: Database['public']['Tables']['events']['Insert'] = {
        id: newEvent.id,
        distance: newEvent.distance,
        style: newEvent.style,
        gender: newEvent.gender,
        relay_legs: newEvent.relayLegs,
        category: newEvent.category,
    };
  const { data, error } = await supabase.from('events').insert([payload]).select().single();
  if (error) throw error;
  return toSwimEvent(data);
};

export const deleteEvent = async (eventId: string): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw error;
};

export const deleteAllEvents = async (): Promise<void> => {
    const { error } = await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

export const getEventById = async (id: string): Promise<SwimEvent | undefined> => {
    const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)').eq('id', id).single();
    if (error || !data) return undefined;
    return toSwimEvent(data);
};

export const updateEventSchedule = async (updatedSchedule: SwimEvent[]): Promise<void> => {
    // The payload needs to include all required fields for the 'events' table
    // to prevent 'not-null constraint' violations during the upsert operation.
    // We explicitly map all non-relational properties from the SwimEvent object
    // to the snake_case format expected by the database.
    const payload = updatedSchedule.map(event => ({
        id: event.id,
        distance: event.distance,
        style: event.style,
        gender: event.gender,
        session_number: event.sessionNumber,
        heat_order: event.heatOrder,
        session_date_time: event.sessionDateTime,
        relay_legs: event.relayLegs,
        category: event.category
    }));

    if (payload.length === 0) return;

    const { error } = await supabase.from('events').upsert(payload);
    
    if (error) {
        console.error("Error updating event schedule in Supabase:", error);
        throw error;
    }
};

// --- Entries & Results ---
export const registerSwimmerToEvent = async (eventId: string, swimmerId: string, seedTime: number): Promise<{success: boolean, message: string}> => {
    const { error } = await supabase.from('event_entries').upsert([{ event_id: eventId, swimmer_id: swimmerId, seed_time: seedTime }]);
    if (error) {
        if (error.message.includes('duplicate key')) {
            return { success: false, message: 'Perenang sudah terdaftar.' };
        }
        return { success: false, message: error.message };
    }
    return { success: true, message: 'Pendaftaran berhasil.' };
};

export const unregisterSwimmerFromEvent = async (eventId: string, swimmerId: string): Promise<void> => {
    const { error } = await supabase.from('event_entries').delete().match({ event_id: eventId, swimmer_id: swimmerId });
    if (error) throw error;
};

export const updateSwimmerSeedTime = async (eventId: string, swimmerId: string, seedTime: number): Promise<void> => {
    const { error } = await supabase.from('event_entries').upsert([{ event_id: eventId, swimmer_id: swimmerId, seed_time: seedTime }]);
    if (error) throw error;
};

export const recordEventResults = async (eventId: string, results: Result[]): Promise<SwimEvent> => {
    const payload = results.map(r => ({ event_id: eventId, swimmer_id: r.swimmerId, time: r.time }));
    if (payload.length > 0) {
        const { error } = await supabase.from('event_results').upsert(payload);
        if (error) throw error;
    }
    const event = await getEventById(eventId);
    if (!event) throw new Error('Event not found after recording results');
    return event;
};
export const addOrUpdateEventResults = recordEventResults;

// --- Records ---
export const getRecords = async (): Promise<SwimRecord[]> => {
    const { data, error } = await supabase.from('records').select('*');
    if (error) throw error;
    return data.map(toRecord);
};

export const addOrUpdateRecord = async (recordData: Partial<SwimRecord>): Promise<SwimRecord> => {
    const { data, error } = await supabase.from('records').upsert([toRecordDbFormat(recordData as SwimRecord)]).select().single();
    if (error) throw error;
    return toRecord(data);
};

export const deleteRecord = async (recordId: string): Promise<void> => {
    const { error } = await supabase.from('records').delete().eq('id', recordId);
    if (error) throw error;
};

export const deleteAllRecords = async (): Promise<void> => {
    const { error } = await supabase.from('records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
};

// --- Data Management & Uploads ---
export const backupDatabase = async (): Promise<any> => {
    const [info, swimmers, events, records] = await Promise.all([
        getCompetitionInfo(), getSwimmers(), getEvents(), getRecords()
    ]);
    return { backupDate: new Date().toISOString(), version: "1.1.0-online", competitionInfo: info, swimmers, events, records };
};

export const restoreDatabase = async (backupData: any): Promise<void> => {
    if (!backupData.competitionInfo || !backupData.swimmers || !backupData.events || !backupData.records) {
        throw new Error("File backup tidak valid atau rusak.");
    }
    // Clear existing data
    await clearAllData();

    // Insert new data
    await updateCompetitionInfo(backupData.competitionInfo);

    if (backupData.swimmers.length > 0) {
        const swimmerPayloads = backupData.swimmers.map((s: Swimmer) => ({ id: s.id, name: s.name, birth_year: s.birthYear, gender: s.gender, club: s.club }));
        const { error } = await supabase.from('swimmers').insert(swimmerPayloads);
        if (error) throw error;
    }

    if (backupData.events.length > 0) {
        const eventPayloads = backupData.events.map((e: SwimEvent) => ({ id: e.id, distance: e.distance, style: e.style, gender: e.gender, session_number: e.sessionNumber, heat_order: e.heatOrder, session_date_time: e.sessionDateTime, relay_legs: e.relayLegs, category: e.category }));
        const { error } = await supabase.from('events').insert(eventPayloads);
        if (error) throw error;
    }

    const allEntries = backupData.events.flatMap((e: SwimEvent) => e.entries.map((en: EventEntry) => ({event_id: e.id, swimmer_id: en.swimmerId, seed_time: en.seedTime})));
    if (allEntries.length > 0) {
        const { error } = await supabase.from('event_entries').insert(allEntries);
        if (error) throw error;
    }

    const allResults = backupData.events.flatMap((e: SwimEvent) => e.results.map((r: Result) => ({event_id: e.id, swimmer_id: r.swimmerId, time: r.time})));
    if (allResults.length > 0) {
        const { error } = await supabase.from('event_results').insert(allResults);
        if (error) throw error;
    }

    if (backupData.records.length > 0) {
        const recordPayloads = backupData.records.map(toRecordDbFormat);
        const { error } = await supabase.from('records').insert(recordPayloads);
        if (error) throw error;
    }
};

export const clearAllData = async (): Promise<void> => {
    const { error: resultsError } = await supabase.from('event_results').delete().neq('event_id', '00000000-0000-0000-0000-000000000000');
    if (resultsError) throw resultsError;

    const { error: entriesError } = await supabase.from('event_entries').delete().neq('event_id', '00000000-0000-0000-0000-000000000000');
    if (entriesError) throw entriesError;

    const { error: swimmersError } = await supabase.from('swimmers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (swimmersError) throw swimmersError;

    const { error: eventsError } = await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (eventsError) throw eventsError;

    const { error: recordsError } = await supabase.from('records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (recordsError) throw recordsError;

    const defaultInfo = { id: 1, event_name: config.competition.defaultName, event_date: new Date().toISOString().split('T')[0], event_logo: null, sponsor_logo: null, is_registration_open: false, number_of_lanes: config.competition.defaultLanes };
    const { error: infoError } = await supabase.from('competition_info').upsert(defaultInfo);
    if (infoError) throw infoError;
};

export const processEventUpload = async (data: any[]): Promise<{ success: number; errors:string[] }> => {
    const errors: string[] = [];
    let successCount = 0;
    
    const styleReverseMap = new Map(Object.entries(SWIM_STYLE_TRANSLATIONS).map(([key, value]) => [value, key as SwimStyle]));
    const genderReverseMap = new Map(Object.entries(GENDER_TRANSLATIONS).map(([key, value]) => [value, key as Gender]));

    for (const [index, row] of data.entries()) {
        const rowNum = index + 2;

        try {
            const distance = parseInt(row['Jarak (m)'], 10);
            const styleStr = row['Gaya']?.trim();
            const genderStr = row['Jenis Kelamin']?.trim();
            const category = row['Kategori']?.toString().trim() || null;
            const relayLegsStr = row['Jumlah Perenang']?.toString().trim();
            const relayLegs = relayLegsStr ? parseInt(relayLegsStr, 10) : null;

            if (!distance || isNaN(distance) || distance <= 0) throw new Error("'Jarak (m)' harus berupa angka positif.");
            if (!styleStr || !styleReverseMap.has(styleStr)) throw new Error(`'Gaya' tidak valid. Gunakan salah satu dari: ${Object.values(SWIM_STYLE_TRANSLATIONS).join(', ')}.`);
            if (!genderStr || !genderReverseMap.has(genderStr)) throw new Error(`'Jenis Kelamin' tidak valid. Gunakan salah satu dari: ${Object.values(GENDER_TRANSLATIONS).join(', ')}.`);
            if (relayLegs !== null && (isNaN(relayLegs) || relayLegs <= 1)) throw new Error("'Jumlah Perenang' harus berupa angka lebih dari 1 untuk estafet.");

            await addEvent({
                distance,
                style: styleReverseMap.get(styleStr)!,
                gender: genderReverseMap.get(genderStr)!,
                relayLegs: relayLegs,
                category: category,
            });
            successCount++;
        } catch (error: any) {
            errors.push(`Baris ${rowNum}: ${error.message}`);
        }
    }
    
    return { success: successCount, errors };
};

export const processRecordUpload = async (data: any[]): Promise<{ success: number; errors: string[] }> => {
    const errors: string[] = [];
    let successCount = 0;

    await deleteAllRecords();
    
    const styleReverseMap = new Map(Object.entries(SWIM_STYLE_TRANSLATIONS).map(([key, value]) => [value, key as SwimStyle]));
    const genderReverseMap = new Map(Object.entries(GENDER_TRANSLATIONS).map(([key, value]) => [value, key as Gender]));

    for (const [index, row] of data.entries()) {
        const rowNum = index + 2;

        try {
            const typeStr = row['Tipe Rekor']?.toString().trim().toUpperCase();
            const distance = parseInt(row['Jarak (m)'], 10);
            const styleStr = row['Gaya']?.trim();
            const genderStr = row['Jenis Kelamin']?.trim();
            const category = row['Kategori']?.toString().trim() || null;
            const timeStr = row['Waktu (mm:ss.SS)']?.toString().trim();
            const holderName = toTitleCase(row['Nama Pemegang Rekor']?.toString().trim() || '');
            const yearSet = parseInt(row['Tahun'], 10);
            const relayLegsStr = row['Jumlah Perenang (Estafet)']?.toString().trim();
            const relayLegs = relayLegsStr ? parseInt(relayLegsStr, 10) : null;
            const locationSet = toTitleCase(row['Lokasi']?.toString().trim() || '') || null;

            if (!typeStr || !['PORPROV', 'NASIONAL'].includes(typeStr)) throw new Error("'Tipe Rekor' harus 'PORPROV' atau 'Nasional'.");
            if (!distance || isNaN(distance) || distance <= 0) throw new Error("'Jarak (m)' harus berupa angka positif.");
            if (!styleStr || !styleReverseMap.has(styleStr)) throw new Error(`'Gaya' tidak valid.`);
            if (!genderStr || !genderReverseMap.has(genderStr)) throw new Error(`'Jenis Kelamin' tidak valid.`);
            if (!timeStr) throw new Error("'Waktu (mm:ss.SS)' wajib diisi.");
            if (!holderName) throw new Error("'Nama Pemegang Rekor' wajib diisi.");
            if (!yearSet || isNaN(yearSet) || yearSet < 1900 || yearSet > 2100) throw new Error("'Tahun' harus berupa angka yang valid.");
            
            const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
            if (!timeParts) throw new Error("Format 'Waktu' harus mm:ss.SS (contoh: 01:23.45).");
            const [, min, sec, ms] = timeParts.map(Number);
            const timeInMillis = (min * 60 * 1000) + (sec * 1000) + (ms * 10);

            const gender = genderReverseMap.get(genderStr)!;
            const style = styleReverseMap.get(styleStr)!;
            const type = typeStr === 'PORPROV' ? RecordType.PORPROV : RecordType.NASIONAL;
            const recordId = `${type.toUpperCase()}_${gender}_${distance}_${style}` + (category ? `_${category}` : '') + (relayLegs ? `_R${relayLegs}` : '');
            
            await addOrUpdateRecord({
                id: recordId, type, gender, distance, style, time: timeInMillis, holderName, yearSet,
                relayLegs, category, locationSet
            });
            successCount++;

        } catch (error: any) {
            errors.push(`Baris ${rowNum}: ${error.message}`);
        }
    }
    
    return { success: successCount, errors };
};
export const processParticipantUpload = async (data: any[]): Promise<{ newSwimmers: number; updatedSwimmers: number; errors: string[] }> => {
    let newSwimmersCount = 0;
    let successfulRegistrations = 0;
    const errors: string[] = [];

    const existingSwimmers = await getSwimmers();
    const existingEvents = await getEvents();
    
    const eventNameMap = new Map<string, SwimEvent>(existingEvents.map(event => [formatEventName(event), event]));
    const swimmerMap = new Map<string, Swimmer>(existingSwimmers.map(swimmer => [`${swimmer.name.trim().toLowerCase()}_${swimmer.club.trim().toLowerCase()}_${swimmer.birthYear}_${swimmer.gender}`, swimmer]));
    
    for (const [index, row] of data.entries()) {
        const rowNum = index + 2;

        try {
            const name = toTitleCase(row['Nama Peserta']?.toString().trim() || '');
            const birthYearStr = row['Tahun Lahir']?.toString().trim();
            const genderStr = row['Jenis Kelamin (L/P)']?.toString().trim().toUpperCase();
            const club = toTitleCase(row['Klub/Tim']?.toString().trim() || '');
            const eventName = row['Nomor Lomba']?.toString().trim();
            const seedTimeStr = row['Waktu Unggulan (mm:ss.SS)']?.toString().trim();
            
            const isRelayRegistration = !birthYearStr;
            if (!name || !club || !eventName) throw new Error("Kolom 'Nama Peserta', 'Klub/Tim', dan 'Nomor Lomba' wajib diisi.");
            if (!isRelayRegistration && (!birthYearStr || isNaN(parseInt(birthYearStr)))) throw new Error("'Tahun Lahir' wajib diisi dan harus berupa angka.");
            if (!genderStr || !['L', 'P'].includes(genderStr)) throw new Error("'Jenis Kelamin (L/P)' harus diisi dengan 'L' atau 'P'.");

            const birthYear = isRelayRegistration ? 0 : parseInt(birthYearStr, 10);
            const gender: 'Male' | 'Female' = genderStr === 'L' ? 'Male' : 'Female';

            const targetEvent = eventNameMap.get(eventName);
            if (!targetEvent) throw new Error(`Nomor Lomba '${eventName}' tidak ditemukan.`);
            
            let seedTimeMs = 0;
            if (seedTimeStr && seedTimeStr.toUpperCase() !== 'NT') {
                const timeParts = seedTimeStr.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
                if (!timeParts) throw new Error("Format 'Waktu Unggulan' harus mm:ss.SS (contoh: 01:23.45).");
                const [, min, sec, ms] = timeParts.map(Number);
                if (sec >= 60) throw new Error("'Detik' pada Waktu Unggulan tidak boleh lebih dari 59.");
                seedTimeMs = (min * 60 * 1000) + (sec * 1000) + (ms * 10);
            }

            const swimmerKey = `${name.toLowerCase()}_${club.toLowerCase()}_${birthYear}_${gender}`;
            let swimmer = swimmerMap.get(swimmerKey);
            
            if (!swimmer) {
                swimmer = await addSwimmer({ name, birthYear, gender, club });
                swimmerMap.set(swimmerKey, swimmer); // Add to local map to avoid re-adding
                newSwimmersCount++;
            }

            await registerSwimmerToEvent(targetEvent.id, swimmer.id, seedTimeMs);
            successfulRegistrations++;

        } catch (error: any) {
            errors.push(`Baris ${rowNum}: ${error.message}`);
        }
    }
    
    return { newSwimmers: newSwimmersCount, updatedSwimmers: successfulRegistrations, errors };
};
export const processOnlineRegistration = async (
    swimmerData: Omit<Swimmer, 'id'>,
    registrations: { eventId: string, seedTime: number }[]
): Promise<{ success: boolean; message: string; swimmer: Swimmer | null }> => {
    try {
        const { data: existingSwimmers, error: searchError } = await supabase
            .from('swimmers')
            .select('*')
            .ilike('name', swimmerData.name.trim())
            .ilike('club', swimmerData.club.trim())
            .eq('birth_year', swimmerData.birthYear)
            .eq('gender', swimmerData.gender);
        
        if (searchError) throw searchError;
        
        let swimmer: Swimmer;
        if (existingSwimmers && existingSwimmers.length > 0) {
            swimmer = toSwimmer(existingSwimmers[0]);
        } else {
            swimmer = await addSwimmer(swimmerData);
        }
        
        const entriesToInsert = registrations.map(reg => ({
            event_id: reg.eventId,
            swimmer_id: swimmer.id,
            seed_time: reg.seedTime
        }));
        
        const { error: entriesError } = await supabase.from('event_entries').upsert(entriesToInsert);
        
        if (entriesError) {
            if (entriesError.message.includes('duplicate key value violates unique constraint')) {
                 return { success: false, message: 'Gagal: Salah satu pendaftaran duplikat. Perenang mungkin sudah terdaftar di nomor lomba tersebut.', swimmer: null };
            }
            throw entriesError;
        }

        return { success: true, message: 'Pendaftaran berhasil diterima.', swimmer };

    } catch (error: any) {
        console.error("Error during online registration:", error);
        return { success: false, message: `Terjadi kesalahan: ${error.message}`, swimmer: null };
    }
};
export const getUsers = async (): Promise<User[]> => { const { data, error } = await supabase.from('users').select('*'); if (error) throw error; return data.map(toUser); };
export const addUser = async (user: Omit<User, 'id'>): Promise<User> => { throw new Error("Admin-level user creation from the client is disabled for security. Please use the Supabase dashboard."); };
export const updateUser = async (userId: string, updatedData: Partial<Omit<User, 'id'>>): Promise<User> => { throw new Error("User updates must be done via Supabase dashboard."); };
export const deleteUser = async (userId: string): Promise<void> => { throw new Error("User deletion must be done via Supabase dashboard."); };
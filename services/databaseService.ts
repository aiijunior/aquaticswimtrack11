// --- START: IndexedDB Offline-First Service ---

import type { Swimmer, SwimEvent, Result, CompetitionInfo, EventEntry, SwimRecord, User, FormattableEvent } from '../types';
import { supabase } from './supabaseClient';
import { Gender, SwimStyle, RecordType } from '../types';
import { GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, toTitleCase } from '../constants';
import { config } from '../config';
import type { Database } from './database.types';

const DB_NAME = 'AquaticSwimtrackDB';
const DB_VERSION = 1;
const STORES = ['swimmers', 'events', 'competition_info', 'records', 'sync_queue'];

interface SyncQueueItem {
    id?: number;
    type: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT_MANY' | 'DELETE_MANY';
    table: 'swimmers' | 'events' | 'competition_info' | 'records' | 'event_entries' | 'event_results';
    payload: any;
    timestamp: number;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject("Error opening IndexedDB");
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('swimmers')) db.createObjectStore('swimmers', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('competition_info')) db.createObjectStore('competition_info', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        };
    });
};

const getAll = async <T>(storeName: string): Promise<T[]> => {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
        request.onerror = () => reject(`Error fetching from ${storeName}`);
        request.onsuccess = () => resolve(request.result);
    });
};

const bulkPut = async <T>(storeName: string, data: T[]): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => { throw new Error(`Error writing to ${storeName}`)};
    store.clear();
    data.forEach(item => store.put(item));
    return new Promise(resolve => { transaction.oncomplete = () => resolve() });
};

const putItem = async <T>(storeName: string, item: T): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.put(item);
    return new Promise(resolve => { transaction.oncomplete = () => resolve() });
};

const deleteItem = async (storeName: string, key: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.delete(key);
    return new Promise(resolve => { transaction.oncomplete = () => resolve() });
};

const addChangeToQueue = async (item: Omit<SyncQueueItem, 'id' | 'timestamp'>): Promise<void> => {
    await putItem<SyncQueueItem>('sync_queue', { ...item, timestamp: Date.now() });
};

const getPendingChanges = (): Promise<SyncQueueItem[]> => getAll<SyncQueueItem>('sync_queue');
const deleteChangeFromQueue = async (id: number): Promise<void> => {
     const db = await openDB();
    const transaction = db.transaction('sync_queue', 'readwrite');
    const store = transaction.objectStore('sync_queue');
    store.delete(id);
    return new Promise(resolve => { transaction.oncomplete = () => resolve() });
};

// --- Local DB Accessors ---
const getLocalSwimmers = (): Promise<Swimmer[]> => getAll<Swimmer>('swimmers');
const saveLocalSwimmers = (swimmers: Swimmer[]): Promise<void> => bulkPut<Swimmer>('swimmers', swimmers);
const putLocalSwimmer = (swimmer: Swimmer): Promise<void> => putItem<Swimmer>('swimmers', swimmer);
const deleteLocalSwimmer = (id: string): Promise<void> => deleteItem('swimmers', id);
const getLocalEvents = (): Promise<SwimEvent[]> => getAll<SwimEvent>('events');
const saveLocalEvents = (events: SwimEvent[]): Promise<void> => bulkPut<SwimEvent>('events', events);
const putLocalEvent = (event: SwimEvent): Promise<void> => putItem<SwimEvent>('events', event);
const deleteLocalEvent = (id: string): Promise<void> => deleteItem('events', id);
const getLocalCompetitionInfo = async (): Promise<CompetitionInfo | null> => (await getAll<CompetitionInfo>('competition_info'))[0] || null;
const saveLocalCompetitionInfo = (info: CompetitionInfo): Promise<void> => bulkPut<CompetitionInfo>('competition_info', [{...info, id: 1}]);
const getLocalRecords = (): Promise<SwimRecord[]> => getAll<SwimRecord>('records');
const saveLocalRecords = (records: SwimRecord[]): Promise<void> => bulkPut<SwimRecord>('records', records);
const putLocalRecord = (record: SwimRecord): Promise<void> => putItem<SwimRecord>('records', record);
const deleteLocalRecord = (id: string): Promise<void> => deleteItem('records', id);

// --- END: IndexedDB Offline-First Service ---


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

// --- RENAMED: Supabase-direct functions ---
const supabaseGetCompetitionInfo = async (): Promise<CompetitionInfo> => {
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
}

const supabaseUpdateCompetitionInfo = async (info: CompetitionInfo): Promise<CompetitionInfo> => {
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
}

const supabaseGetSwimmers = async (): Promise<Swimmer[]> => {
  const { data, error } = await supabase.from('swimmers').select('*');
  if (error) throw error;
  return data.map(toSwimmer);
};

const supabaseAddSwimmer = async (swimmer: Swimmer): Promise<Swimmer> => {
  const payload: Database['public']['Tables']['swimmers']['Insert'] = {
      id: swimmer.id, // Use client-generated ID
      name: swimmer.name,
      birth_year: swimmer.birthYear,
      gender: swimmer.gender,
      club: swimmer.club
  };
  const { data, error } = await supabase.from('swimmers').insert([payload]).select();
  if (error) throw error;
  return toSwimmer(data[0]);
};

const supabaseUpdateSwimmer = async (swimmer: Swimmer): Promise<Swimmer> => {
    const { data, error } = await supabase
        .from('swimmers')
        .update({ name: swimmer.name, birth_year: swimmer.birthYear, gender: swimmer.gender, club: swimmer.club })
        .eq('id', swimmer.id)
        .select();
    if (error) throw error;
    return toSwimmer(data[0]);
};

const supabaseDeleteSwimmer = async (swimmerId: string): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().eq('id', swimmerId);
    if (error) throw error;
};

const supabaseGetEvents = async (): Promise<SwimEvent[]> => {
  const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)').order('session_number').order('heat_order');
  if (error) throw error;
  return data.map(toSwimEvent);
};

const supabaseAddEvent = async (event: SwimEvent): Promise<SwimEvent> => {
  const payload: Database['public']['Tables']['events']['Insert'] = {
        id: event.id,
        distance: event.distance,
        style: event.style,
        gender: event.gender,
        relay_legs: event.relayLegs,
        category: event.category,
    };
  const { data, error } = await supabase.from('events').insert([payload]).select();
  if (error) throw error;
  return toSwimEvent(data[0]);
};

const supabaseUpdateEvent = async(event: SwimEvent): Promise<SwimEvent> => {
     const payload: Database['public']['Tables']['events']['Update'] = {
        id: event.id, distance: event.distance, style: event.style, gender: event.gender, relay_legs: event.relayLegs,
        category: event.category, session_number: event.sessionNumber, heat_order: event.heatOrder, session_date_time: event.sessionDateTime
    };
    const {data, error} = await supabase.from('events').update(payload).eq('id', event.id).select();
    if(error) throw error;
    return toSwimEvent(data[0]);
};

const supabaseDeleteEvent = async (eventId: string): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw error;
};

const supabaseUpsertEntries = async (entries: {event_id: string, swimmer_id: string, seed_time: number}[]): Promise<void> => {
    if (entries.length === 0) return;
    const { error } = await supabase.from('event_entries').upsert(entries);
    if (error) throw error;
}
const supabaseDeleteEntries = async (entries: {event_id: string, swimmer_id: string}[]): Promise<void> => {
    if (entries.length === 0) return;
    // This is tricky. Let's do it one by one for simplicity. A stored procedure would be better.
    for (const entry of entries) {
        const { error } = await supabase.from('event_entries').delete().match({ event_id: entry.event_id, swimmer_id: entry.swimmer_id });
        if (error) console.error("Failed to delete entry during sync", error);
    }
}

const supabaseUpsertResults = async (results: {event_id: string, swimmer_id: string, time: number}[]): Promise<void> => {
    if (results.length === 0) return;
    const { error } = await supabase.from('event_results').upsert(results);
    if (error) throw error;
}

const supabaseGetRecords = async (): Promise<SwimRecord[]> => {
    const { data, error } = await supabase.from('records').select('*');
    if (error) throw error;
    return data.map(toRecord);
};

const supabaseAddOrUpdateRecord = async (recordData: SwimRecord): Promise<SwimRecord> => {
    const { data, error } = await supabase.from('records').upsert([toRecordDbFormat(recordData)]).select();
    if (error) throw error;
    return toRecord(data[0]);
};

const supabaseDeleteRecord = async (recordId: string): Promise<void> => {
    const { error } = await supabase.from('records').delete().eq('id', recordId);
    if (error) throw error;
};

const toRecordDbFormat = (r: SwimRecord) => ({
    id: r.id, type: r.type, gender: r.gender, distance: r.distance, style: r.style, time: r.time,
    holder_name: r.holderName, year_set: r.yearSet, location_set: r.locationSet, relay_legs: r.relayLegs,
    category: r.category,
});


// --- NEW Public-facing, IndexedDB-first functions ---

// --- Competition Info ---
export const getCompetitionInfo = async (): Promise<CompetitionInfo> => {
    let info = await getLocalCompetitionInfo();
    if (!info) {
        try {
            info = await supabaseGetCompetitionInfo();
            await saveLocalCompetitionInfo(info);
        } catch (e) {
             console.warn("Could not fetch competition info from server, using defaults.", e);
             return { eventName: config.competition.defaultName, eventDate: '', eventLogo: null, sponsorLogo: null, isRegistrationOpen: false, numberOfLanes: config.competition.defaultLanes };
        }
    }
    return info;
};

export const updateCompetitionInfo = async (info: CompetitionInfo): Promise<CompetitionInfo> => {
    const infoWithId = { ...info, id: 1 };
    await saveLocalCompetitionInfo(infoWithId);
    await addChangeToQueue({ type: 'UPDATE', table: 'competition_info', payload: infoWithId });
    return info;
};

// --- Swimmers ---
export const getSwimmers = (): Promise<Swimmer[]> => getLocalSwimmers();

export const addSwimmer = async (swimmer: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
    const newSwimmer: Swimmer = { ...swimmer, id: crypto.randomUUID() };
    await putLocalSwimmer(newSwimmer);
    await addChangeToQueue({ type: 'CREATE', table: 'swimmers', payload: newSwimmer });
    return newSwimmer;
};

export const updateSwimmer = async (swimmerId: string, updatedData: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
    const swimmer: Swimmer = { id: swimmerId, ...updatedData };
    await putLocalSwimmer(swimmer);
    await addChangeToQueue({ type: 'UPDATE', table: 'swimmers', payload: swimmer });
    return swimmer;
};

export const deleteSwimmer = async (swimmerId: string): Promise<void> => {
    await deleteLocalSwimmer(swimmerId);
    await addChangeToQueue({ type: 'DELETE', table: 'swimmers', payload: { id: swimmerId } });
    // Also remove entries and results locally
    const events = await getLocalEvents();
    for(const event of events) {
        event.entries = event.entries.filter(e => e.swimmerId !== swimmerId);
        event.results = event.results.filter(r => r.swimmerId !== swimmerId);
        await putLocalEvent(event);
    }
};

export const deleteAllSwimmers = async (): Promise<void> => {
    const swimmers = await getLocalSwimmers();
    await saveLocalSwimmers([]);
    await addChangeToQueue({ type: 'DELETE_MANY', table: 'swimmers', payload: swimmers.map(s => ({id: s.id})) });
    const events = await getLocalEvents();
    for (const event of events) {
        event.entries = [];
        event.results = [];
        await putLocalEvent(event);
    }
};

export const getSwimmerById = async (id: string): Promise<Swimmer | undefined> => {
  const swimmers = await getLocalSwimmers();
  return swimmers.find(s => s.id === id);
};

// --- Events ---
export const getEvents = (): Promise<SwimEvent[]> => getLocalEvents();

export const addEvent = async (event: Omit<SwimEvent, 'id' | 'entries' | 'results'>): Promise<SwimEvent> => {
    const newEvent: SwimEvent = { ...event, id: crypto.randomUUID(), entries: [], results: [] };
    await putLocalEvent(newEvent);
    await addChangeToQueue({ type: 'CREATE', table: 'events', payload: newEvent });
    return newEvent;
};

export const deleteEvent = async (eventId: string): Promise<void> => {
    await deleteLocalEvent(eventId);
    await addChangeToQueue({ type: 'DELETE', table: 'events', payload: { id: eventId } });
};

export const deleteAllEvents = async (): Promise<void> => {
    const events = await getLocalEvents();
    await saveLocalEvents([]);
    await addChangeToQueue({ type: 'DELETE_MANY', table: 'events', payload: events.map(e => ({id: e.id})) });
};

export const getEventById = async (id: string): Promise<SwimEvent | undefined> => {
    const events = await getLocalEvents();
    return events.find(e => e.id === id);
};

export const updateEventSchedule = async (updatedSchedule: SwimEvent[]): Promise<void> => {
    const allEvents = await getLocalEvents();
    const scheduleMap = new Map(updatedSchedule.map(e => [e.id, e]));
    const eventsToSave = allEvents.map(e => scheduleMap.get(e.id) || e);
    await saveLocalEvents(eventsToSave);
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'events', payload: updatedSchedule });
};

// --- Entries & Results ---
const updateLocalEventWith = async (eventId: string, updateFn: (event: SwimEvent) => void) => {
    const event = await getEventById(eventId);
    if (event) {
        updateFn(event);
        await putLocalEvent(event);
    }
};

export const registerSwimmerToEvent = async (eventId: string, swimmerId: string, seedTime: number): Promise<{success: boolean, message: string}> => {
    const event = await getEventById(eventId);
    if (!event) return { success: false, message: 'Nomor lomba tidak ditemukan.' };
    if (event.entries.some(e => e.swimmerId === swimmerId)) return { success: false, message: 'Perenang sudah terdaftar.' };
    
    await updateLocalEventWith(eventId, e => e.entries.push({ swimmerId, seedTime }));
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'event_entries', payload: [{ event_id: eventId, swimmer_id: swimmerId, seed_time: seedTime }] });
    return { success: true, message: 'Pendaftaran berhasil.' };
};

export const unregisterSwimmerFromEvent = async (eventId: string, swimmerId: string): Promise<void> => {
    await updateLocalEventWith(eventId, e => {
        e.entries = e.entries.filter(en => en.swimmerId !== swimmerId);
    });
    await addChangeToQueue({ type: 'DELETE_MANY', table: 'event_entries', payload: [{ event_id: eventId, swimmer_id: swimmerId }] });
};

export const updateSwimmerSeedTime = async (eventId: string, swimmerId: string, seedTime: number): Promise<void> => {
    await updateLocalEventWith(eventId, e => {
        const entry = e.entries.find(en => en.swimmerId === swimmerId);
        if (entry) entry.seedTime = seedTime;
    });
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'event_entries', payload: [{ event_id: eventId, swimmer_id: swimmerId, seed_time: seedTime }] });
};

export const recordEventResults = async (eventId: string, results: Result[]): Promise<SwimEvent> => {
    const event = await getEventById(eventId);
    if (!event) throw new Error('Event not found');
    event.results = results;
    await putLocalEvent(event);
    await addChangeToQueue({
        type: 'UPSERT_MANY',
        table: 'event_results',
        payload: results.map(r => ({ event_id: eventId, swimmer_id: r.swimmerId, time: r.time }))
    });
    return event;
};
export const addOrUpdateEventResults = recordEventResults;


// --- Records ---
export const getRecords = (): Promise<SwimRecord[]> => getLocalRecords();

export const addOrUpdateRecord = async (recordData: Partial<SwimRecord>): Promise<SwimRecord> => {
    const record = recordData as SwimRecord; // Assume complete
    await putLocalRecord(record);
    await addChangeToQueue({ type: 'UPDATE', table: 'records', payload: record });
    return record;
};

export const deleteRecord = async (recordId: string): Promise<void> => {
    await deleteLocalRecord(recordId);
    await addChangeToQueue({ type: 'DELETE', table: 'records', payload: { id: recordId } });
};

export const deleteAllRecords = async (): Promise<void> => {
    const records = await getLocalRecords();
    await saveLocalRecords([]);
    await addChangeToQueue({ type: 'DELETE_MANY', table: 'records', payload: records.map(r => ({id: r.id})) });
};

// --- Data Management & Uploads (Online-first for simplicity of implementation) ---
export const backupDatabase = async (): Promise<any> => {
    const [info, swimmers, events, records] = await Promise.all([
        getLocalCompetitionInfo(), getLocalSwimmers(), getLocalEvents(), getLocalRecords()
    ]);
    return { backupDate: new Date().toISOString(), version: "1.1.0-offline", competitionInfo: info, swimmers, events, records };
};

export const restoreDatabase = async (backupData: any): Promise<void> => {
    if (!backupData.competitionInfo || !backupData.swimmers || !backupData.events || !backupData.records) {
        throw new Error("File backup tidak valid atau rusak.");
    }
    // Clear local data
    await Promise.all(STORES.map(s => openDB().then(db => db.transaction(s, 'readwrite').objectStore(s).clear())));

    // Save to local DB
    await saveLocalCompetitionInfo(backupData.competitionInfo);
    await saveLocalSwimmers(backupData.swimmers);
    await saveLocalEvents(backupData.events);
    await saveLocalRecords(backupData.records);
    
    // Queue everything for sync
    await addChangeToQueue({ type: 'UPDATE', table: 'competition_info', payload: backupData.competitionInfo });
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'swimmers', payload: backupData.swimmers });
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'events', payload: backupData.events.map((e: any) => ({...e, entries: [], results: []})) }); // Events without entries/results
    const allEntries = backupData.events.flatMap((e: SwimEvent) => e.entries.map(en => ({event_id: e.id, ...en})));
    const allResults = backupData.events.flatMap((e: SwimEvent) => e.results.map(r => ({event_id: e.id, ...r})));
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'event_entries', payload: allEntries });
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'event_results', payload: allResults });
    await addChangeToQueue({ type: 'UPSERT_MANY', table: 'records', payload: backupData.records });
};

export const clearAllData = async (): Promise<void> => {
    await Promise.all(STORES.map(s => openDB().then(db => db.transaction(s, 'readwrite').objectStore(s).clear())));
    const defaultInfo = { eventName: config.competition.defaultName, eventDate: new Date().toISOString().split('T')[0], eventLogo: null, sponsorLogo: null, isRegistrationOpen: false, numberOfLanes: config.competition.defaultLanes };
    await saveLocalCompetitionInfo(defaultInfo);
    // Queue a full clear for next sync - this needs a server-side function, for now we delete what we know.
    await deleteAllSwimmers();
    await deleteAllEvents();
    await deleteAllRecords();
};

// ... (Other functions like user management and uploads remain largely unchanged as they are less critical for offline event operation)
// ... (The original functions for process uploads, user mgmt, etc would go here, slightly modified to use local data for reads)
// For brevity, these less critical functions are omitted but would need similar offline treatment for full functionality.

// --- SYNC FUNCTIONALITY ---
export const getPendingChangeCount = async (): Promise<number> => {
    const changes = await getPendingChanges();
    return changes.length;
};

export const syncWithSupabase = async (): Promise<{ success: boolean; message: string }> => {
    if (!navigator.onLine) {
        return { success: false, message: "Tidak ada koneksi internet." };
    }

    const changes = await getPendingChanges();
    if (changes.length === 0) {
        // Still fetch latest data even if no local changes
        try {
            const [info, swimmers, events, records] = await Promise.all([supabaseGetCompetitionInfo(), supabaseGetSwimmers(), supabaseGetEvents(), supabaseGetRecords()]);
            await saveLocalCompetitionInfo(info);
            await saveLocalSwimmers(swimmers);
            await saveLocalEvents(events);
            await saveLocalRecords(records);
            return { success: true, message: "Data sudah yang terbaru." };
        } catch (error: any) {
            return { success: false, message: `Gagal mengambil data terbaru: ${error.message}` };
        }
    }
    
    // Process queue
    for (const change of changes) {
        try {
            switch (`${change.type}_${change.table}`) {
                case 'CREATE_swimmers': await supabaseAddSwimmer(change.payload); break;
                case 'UPDATE_swimmers': await supabaseUpdateSwimmer(change.payload); break;
                case 'DELETE_swimmers': await supabaseDeleteSwimmer(change.payload.id); break;
                case 'CREATE_events': await supabaseAddEvent(change.payload); break;
                case 'DELETE_events': await supabaseDeleteEvent(change.payload.id); break;
                case 'UPDATE_records': await supabaseAddOrUpdateRecord(change.payload); break;
                case 'DELETE_records': await supabaseDeleteRecord(change.payload.id); break;
                case 'UPDATE_competition_info': await supabaseUpdateCompetitionInfo(change.payload); break;
                case 'UPSERT_MANY_events': await supabase.from('events').upsert(change.payload.map((p:any) => ({...p, event_entries: undefined, event_results: undefined}))); break;
                case 'UPSERT_MANY_event_entries': await supabaseUpsertEntries(change.payload); break;
                case 'DELETE_MANY_event_entries': await supabaseDeleteEntries(change.payload); break;
                case 'UPSERT_MANY_event_results': await supabaseUpsertResults(change.payload); break;
            }
            await deleteChangeFromQueue(change.id!);
        } catch (error: any) {
            console.error("Sync error for change:", change, error);
            return { success: false, message: `Gagal menyinkronkan perubahan: ${error.message}` };
        }
    }

    // After pushing changes, pull latest state from server to resolve conflicts
    try {
        const [info, swimmers, events, records] = await Promise.all([supabaseGetCompetitionInfo(), supabaseGetSwimmers(), supabaseGetEvents(), supabaseGetRecords()]);
        await saveLocalCompetitionInfo(info);
        await saveLocalSwimmers(swimmers);
        await saveLocalEvents(events);
        await saveLocalRecords(records);
        return { success: true, message: `Sinkronisasi berhasil! ${changes.length} perubahan diunggah.` };
    } catch (error: any) {
        return { success: false, message: `Gagal mengambil data terbaru setelah sinkronisasi: ${error.message}` };
    }
};

export const processEventUpload = async (data: any[]): Promise<{ success: number; errors:string[] }> => {
    const errors: string[] = [];
    let successCount = 0;
    
    // Create reverse mappings from Indonesian text to enum values
    const styleReverseMap = new Map(Object.entries(SWIM_STYLE_TRANSLATIONS).map(([key, value]) => [value, key as SwimStyle]));
    const genderReverseMap = new Map(Object.entries(GENDER_TRANSLATIONS).map(([key, value]) => [value, key as Gender]));

    for (const [index, row] of data.entries()) {
        const rowNum = index + 2; // Excel rows are 1-based, plus header

        try {
            const distance = parseInt(row['Jarak (m)'], 10);
            const styleStr = row['Gaya']?.trim();
            const genderStr = row['Jenis Kelamin']?.trim();
            const category = row['Kategori']?.toString().trim() || null;
            const relayLegsStr = row['Jumlah Perenang']?.toString().trim();
            const relayLegs = relayLegsStr ? parseInt(relayLegsStr, 10) : null;

            // --- Validation ---
            if (!distance || isNaN(distance) || distance <= 0) {
                throw new Error("'Jarak (m)' harus berupa angka positif.");
            }
            if (!styleStr || !styleReverseMap.has(styleStr)) {
                throw new Error(`'Gaya' tidak valid. Gunakan salah satu dari: ${Object.values(SWIM_STYLE_TRANSLATIONS).join(', ')}.`);
            }
            if (!genderStr || !genderReverseMap.has(genderStr)) {
                throw new Error(`'Jenis Kelamin' tidak valid. Gunakan salah satu dari: ${Object.values(GENDER_TRANSLATIONS).join(', ')}.`);
            }
            if (relayLegs !== null && (isNaN(relayLegs) || relayLegs <= 1)) {
                throw new Error("'Jumlah Perenang' harus berupa angka lebih dari 1 untuk estafet.");
            }

            const newEventData: Omit<SwimEvent, 'id' | 'entries' | 'results'> = {
                distance,
                style: styleReverseMap.get(styleStr)!,
                gender: genderReverseMap.get(genderStr)!,
                relayLegs: relayLegs,
                category: category,
            };

            await addEvent(newEventData);
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

    // As per UI, this process overwrites all existing records.
    await deleteAllRecords();
    
    const styleReverseMap = new Map(Object.entries(SWIM_STYLE_TRANSLATIONS).map(([key, value]) => [value, key as SwimStyle]));
    const genderReverseMap = new Map(Object.entries(GENDER_TRANSLATIONS).map(([key, value]) => [value, key as Gender]));

    for (const [index, row] of data.entries()) {
        const rowNum = index + 2; // Excel rows are 1-based, plus header

        try {
            // --- Field Extraction ---
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

            // --- Validation ---
            if (!typeStr || !['PORPROV', 'NASIONAL'].includes(typeStr)) throw new Error("'Tipe Rekor' harus 'PORPROV' atau 'Nasional'.");
            if (!distance || isNaN(distance) || distance <= 0) throw new Error("'Jarak (m)' harus berupa angka positif.");
            if (!styleStr || !styleReverseMap.has(styleStr)) throw new Error(`'Gaya' tidak valid. Gunakan salah satu dari: ${Object.values(SWIM_STYLE_TRANSLATIONS).join(', ')}.`);
            if (!genderStr || !genderReverseMap.has(genderStr)) throw new Error(`'Jenis Kelamin' tidak valid. Gunakan salah satu dari: ${Object.values(GENDER_TRANSLATIONS).join(', ')}.`);
            if (!timeStr) throw new Error("'Waktu (mm:ss.SS)' wajib diisi.");
            if (!holderName) throw new Error("'Nama Pemegang Rekor' wajib diisi.");
            if (!yearSet || isNaN(yearSet) || yearSet < 1900 || yearSet > 2100) throw new Error("'Tahun' harus berupa angka yang valid.");
            if (relayLegs !== null && (isNaN(relayLegs) || relayLegs <= 1)) throw new Error("'Jumlah Perenang (Estafet)' harus berupa angka lebih dari 1.");
            
            // --- Time Parsing ---
            const timeParts = timeStr.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
            if (!timeParts) throw new Error("Format 'Waktu' harus mm:ss.SS (contoh: 01:23.45).");
            const [, min, sec, ms] = timeParts.map(Number);
            const timeInMillis = (min * 60 * 1000) + (sec * 1000) + (ms * 10);

            // --- Record Creation ---
            const gender = genderReverseMap.get(genderStr)!;
            const style = styleReverseMap.get(styleStr)!;
            const type = typeStr === 'PORPROV' ? RecordType.PORPROV : RecordType.NASIONAL;

            const recordId = `${type.toUpperCase()}_${gender}_${distance}_${style}` + (category ? `_${category}` : '') + (relayLegs ? `_R${relayLegs}` : '');
            
            const newRecord: SwimRecord = {
                id: recordId,
                type,
                gender,
                distance,
                style,
                time: timeInMillis,
                holderName,
                yearSet,
                relayLegs,
                category,
                locationSet
            };

            await addOrUpdateRecord(newRecord);
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

    const localSwimmers = await getLocalSwimmers();
    const localEvents = await getLocalEvents();
    
    const eventNameMap = new Map<string, SwimEvent>();
    localEvents.forEach(event => {
        eventNameMap.set(formatEventName(event), event);
    });

    const swimmerMap = new Map<string, Swimmer>();
    localSwimmers.forEach(swimmer => {
        const key = `${swimmer.name.trim().toLowerCase()}_${swimmer.club.trim().toLowerCase()}_${swimmer.birthYear}_${swimmer.gender}`;
        swimmerMap.set(key, swimmer);
    });
    
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

            if (!name || !club || !eventName) {
                throw new Error("Kolom 'Nama Peserta', 'Klub/Tim', dan 'Nomor Lomba' wajib diisi.");
            }
            if (!isRelayRegistration && (!birthYearStr || isNaN(parseInt(birthYearStr)))) {
                throw new Error("'Tahun Lahir' wajib diisi dan harus berupa angka untuk perenang perorangan.");
            }
            if (!genderStr || !['L', 'P'].includes(genderStr)) {
                throw new Error("'Jenis Kelamin (L/P)' harus diisi dengan 'L' atau 'P'.");
            }

            const birthYear = isRelayRegistration ? 0 : parseInt(birthYearStr, 10);
            const gender: 'Male' | 'Female' = genderStr === 'L' ? 'Male' : 'Female';

            const targetEvent = eventNameMap.get(eventName);
            if (!targetEvent) {
                throw new Error(`Nomor Lomba '${eventName}' tidak ditemukan. Pastikan nama sesuai dengan template.`);
            }
            
            let seedTimeMs = 0;
            if (seedTimeStr && seedTimeStr.toUpperCase() !== 'NT') {
                const timeParts = seedTimeStr.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
                if (!timeParts) {
                    throw new Error("Format 'Waktu Unggulan' harus mm:ss.SS (contoh: 01:23.45).");
                }
                const [, min, sec, ms] = timeParts.map(Number);
                if (sec >= 60) throw new Error("'Detik' pada Waktu Unggulan tidak boleh lebih dari 59.");
                seedTimeMs = (min * 60 * 1000) + (sec * 1000) + (ms * 10);
            }

            const swimmerKey = `${name.toLowerCase()}_${club.toLowerCase()}_${birthYear}_${gender}`;
            let swimmer = swimmerMap.get(swimmerKey);
            
            if (!swimmer) {
                const newSwimmerData: Omit<Swimmer, 'id'> = { name, birthYear, gender, club };
                swimmer = await addSwimmer(newSwimmerData);
                swimmerMap.set(swimmerKey, swimmer);
                newSwimmersCount++;
            }

            const registrationResult = await registerSwimmerToEvent(targetEvent.id, swimmer.id, seedTimeMs);
            if (!registrationResult.success) {
                console.warn(`Baris ${rowNum}: ${registrationResult.message} - Entri ini akan tetap dihitung sebagai sukses.`);
            }
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
        // Step 1: Check if swimmer exists (case-insensitive search for name and club)
        let { data: existingSwimmers, error: searchError } = await supabase
            .from('swimmers')
            .select('*')
            .ilike('name', swimmerData.name.trim())
            .ilike('club', swimmerData.club.trim())
            .eq('birth_year', swimmerData.birthYear);
        
        if (searchError) throw searchError;
        
        let swimmer: Swimmer;

        if (existingSwimmers && existingSwimmers.length > 0) {
            // Swimmer exists, use the first match
            swimmer = toSwimmer(existingSwimmers[0]);
        } else {
            // Swimmer does not exist, create a new one
            const newSwimmerData = { ...swimmerData, id: crypto.randomUUID() };
            const { data: newSwimmerResult, error: insertError } = await supabase
                .from('swimmers')
                .insert([{
                    id: newSwimmerData.id,
                    name: newSwimmerData.name.trim(),
                    birth_year: newSwimmerData.birthYear,
                    gender: newSwimmerData.gender,
                    club: newSwimmerData.club.trim(),
                }])
                .select()
                .single();
                
            if (insertError) throw insertError;
            swimmer = toSwimmer(newSwimmerResult);
        }
        
        // Step 2: Register swimmer to selected events
        const entriesToInsert = registrations.map(reg => ({
            event_id: reg.eventId,
            swimmer_id: swimmer.id,
            seed_time: reg.seedTime
        }));
        
        const { error: entriesError } = await supabase.from('event_entries').upsert(entriesToInsert);
        
        if (entriesError) {
             // This could happen if they're already registered. Supabase upsert might handle it,
             // but let's provide a clear message.
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
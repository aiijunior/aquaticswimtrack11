
import type { Swimmer, SwimEvent, Result, CompetitionInfo, EventEntry, SwimRecord, User, FormattableEvent } from '../types';
import { supabase } from './supabaseClient';
import { Gender, SwimStyle, RecordType } from '../types';
import { GENDER_TRANSLATIONS, SWIM_STYLE_TRANSLATIONS, formatEventName, toTitleCase } from '../constants';
import { config } from '../config';

// --- MAPPING FUNCTIONS ---

// FIX: Added toUser mapping function which was missing and causing a reference error in getUsers.
const toUser = (data: any): User => ({
    id: data.id,
    role: data.role,
    created_at: data.created_at || new Date().toISOString(),
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
});

const toCompetitionInfo = (data: any): CompetitionInfo | null => (data ? {
    id: data.id,
    eventName: data.event_name,
    eventDate: data.event_date,
    eventLogo: data.event_logo,
    sponsorLogo: data.sponsor_logo,
    isRegistrationOpen: data.is_registration_open,
    numberOfLanes: data.number_of_lanes,
    registrationDeadline: data.registration_deadline,
    ageGroups: data.age_groups,
    isFree: data.is_free,
    recipientName: data.recipient_name,
    accountNumber: data.account_number,
    feePerEvent: data.fee_per_event
} : null);

const toSwimmer = (data: any): Swimmer => ({
    id: data.id,
    name: data.name,
    birthYear: data.birth_year,
    gender: data.gender,
    club: data.club,
    ageGroup: data.age_group,
    paymentProof: data.payment_proof,
    paymentAmount: data.payment_amount,
    picName: data.pic_name,
    picNamePhone: data.pic_phone
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
    style: data.style as SwimStyle,
    gender: data.gender as Gender,
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
    type: data.type as RecordType,
    gender: data.gender as Gender,
    distance: data.distance,
    style: data.style as SwimStyle,
    time: data.time,
    holderName: data.holder_name,
    yearSet: data.year_set,
    locationSet: data.location_set,
    relayLegs: data.relay_legs,
    category: data.category
});

// --- PUBLIC DATA ---

export const getPublicData = async () => {
    const response = await fetch('/.netlify/functions/getPublicData');
    if (!response.ok) throw new Error('Failed to fetch public data');
    return response.json();
};

// --- SWIMMER SERVICES ---

export const getSwimmers = async (): Promise<Swimmer[]> => {
    const { data, error } = await supabase.from('swimmers').select('*');
    if (error) throw error;
    return data.map(toSwimmer);
};

export const getSwimmerById = async (id: string): Promise<Swimmer | null> => {
    const { data, error } = await supabase.from('swimmers').select('*').eq('id', id).single();
    if (error) return null;
    return toSwimmer(data);
};

export const addSwimmer = async (swimmer: Omit<Swimmer, 'id'>): Promise<Swimmer> => {
    // FIX: Using any cast to bypass type errors when the Supabase client generic fails to resolve table structures properly.
    const { data, error } = await supabase.from('swimmers').insert({
        name: swimmer.name,
        birth_year: swimmer.birthYear,
        gender: swimmer.gender,
        club: swimmer.club,
        age_group: swimmer.ageGroup || null,
        pic_name: swimmer.picName || null,
        pic_phone: swimmer.picPhone || null
    } as any).select('*').single();
    if (error) throw error;
    return toSwimmer(data);
};

export const updateSwimmer = async (id: string, swimmer: Partial<Omit<Swimmer, 'id'>>): Promise<Swimmer> => {
    // FIX: Using any cast to bypass type errors during update.
    const { data, error } = await supabase.from('swimmers').update({
        name: swimmer.name,
        birth_year: swimmer.birthYear,
        gender: swimmer.gender,
        club: swimmer.club,
        age_group: swimmer.ageGroup || null,
        pic_name: swimmer.picName || null,
        pic_phone: swimmer.picPhone || null
    } as any).eq('id', id).select('*').single();
    if (error) throw error;
    return toSwimmer(data);
};

export const deleteSwimmer = async (id: string): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().eq('id', id);
    if (error) throw error;
};

export const deleteAllSwimmers = async (): Promise<void> => {
    const { error } = await supabase.from('swimmers').delete().neq('id', '0');
    if (error) throw error;
};

// --- EVENT SERVICES ---

export const getEvents = async (): Promise<SwimEvent[]> => {
    const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)');
    if (error) throw error;
    return data.map(toSwimEvent);
};

export const getEventById = async (id: string): Promise<SwimEvent | null> => {
    const { data, error } = await supabase.from('events').select('*, event_entries(*), event_results(*)').eq('id', id).single();
    if (error) return null;
    return toSwimEvent(data);
};

export const addEvent = async (event: Omit<SwimEvent, 'id' | 'entries' | 'results'>): Promise<SwimEvent> => {
    // FIX: Using any cast for insert parameters.
    const { data, error } = await supabase.from('events').insert({
        distance: event.distance,
        style: event.style,
        gender: event.gender,
        relay_legs: event.relayLegs || null,
        category: event.category || null
    } as any).select('*, event_entries(*), event_results(*)').single();
    if (error) throw error;
    return toSwimEvent(data);
};

export const deleteEvent = async (id: string): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
};

export const deleteAllEvents = async (): Promise<void> => {
    const { error } = await supabase.from('events').delete().neq('id', '0');
    if (error) throw error;
};

export const registerSwimmerToEvent = async (eventId: string, swimmerId: string, seedTime: number) => {
    // FIX: Using any cast for upsert parameters.
    const { error } = await supabase.from('event_entries').upsert({
        event_id: eventId,
        swimmer_id: swimmerId,
        seed_time: seedTime
    } as any);
    if (error) return { success: false, message: error.message };
    return { success: true };
};

export const unregisterSwimmerFromEvent = async (eventId: string, swimmerId: string) => {
    const { error } = await supabase.from('event_entries').delete().eq('event_id', eventId).eq('swimmer_id', swimmerId);
    if (error) throw error;
};

export const updateSwimmerSeedTime = async (eventId: string, swimmerId: string, seedTime: number) => {
    // FIX: Using any cast for update parameters.
    const { error } = await supabase.from('event_entries').update({ seed_time: seedTime } as any).eq('event_id', eventId).eq('swimmer_id', swimmerId);
    if (error) throw error;
};

export const recordEventResults = async (eventId: string, results: Result[]) => {
    // FIX: Using any cast for bulk upsert operations.
    const { error } = await supabase.from('event_results').upsert(
        results.map(r => ({ event_id: eventId, swimmer_id: r.swimmerId, time: r.time })) as any[]
    );
    if (error) throw error;
};

export const addOrUpdateEventResults = recordEventResults;

export const getEventsForRegistration = async (): Promise<SwimEvent[]> => {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;
    return data.map(toSwimEvent);
};

// --- RECORD SERVICES ---

export const getRecords = async (): Promise<SwimRecord[]> => {
    const { data, error } = await supabase.from('records').select('*');
    if (error) throw error;
    return data.map(toRecord);
};

// FIX: Corrected mapping of camelCase record properties to snake_case database columns.
export const addOrUpdateRecord = async (record: Partial<SwimRecord>): Promise<void> => {
    // FIX: Using any cast for upsert parameters.
    const { error } = await supabase.from('records').upsert({
        id: record.id,
        type: record.type,
        gender: record.gender,
        distance: record.distance,
        style: record.style,
        time: record.time,
        holder_name: record.holderName,
        year_set: record.yearSet,
        location_set: record.locationSet || null,
        relay_legs: record.relayLegs || null,
        category: record.category || null
    } as any);
    if (error) throw error;
};

export const deleteRecord = async (id: string): Promise<void> => {
    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) throw error;
};

export const deleteAllRecords = async (): Promise<void> => {
    const { error } = await supabase.from('records').delete().neq('id', '0');
    if (error) throw error;
};

// --- COMPETITION INFO & SCHEDULE ---

// FIX: Corrected mapping of info.sponsorLogo to sponsor_logo column.
export const updateCompetitionInfo = async (info: CompetitionInfo): Promise<void> => {
    // FIX: Using any cast for upsert parameters.
    const { error } = await supabase.from('competition_info').upsert({
        id: 1,
        event_name: info.eventName,
        event_date: info.eventDate,
        event_logo: info.eventLogo,
        sponsor_logo: info.sponsorLogo,
        is_registration_open: info.isRegistrationOpen,
        number_of_lanes: info.numberOfLanes,
        registration_deadline: info.registrationDeadline,
        age_groups: info.ageGroups,
        is_free: info.isFree,
        recipient_name: info.recipientName,
        account_number: info.accountNumber,
        fee_per_event: info.feePerEvent
    } as any);
    if (error) throw error;
};

export const updateEventSchedule = async (events: SwimEvent[]): Promise<void> => {
    // FIX: Using any cast for bulk upsert operations.
    const { error } = await supabase.from('events').upsert(
        events.map(e => ({
            id: e.id,
            session_number: e.sessionNumber,
            heat_order: e.heatOrder,
            session_date_time: e.sessionDateTime
        })) as any[]
    );
    if (error) throw error;
};

// --- UPLOAD & DATA MANAGEMENT SERVICES ---

export const processEventUpload = async (json: any[]) => {
    let success = 0;
    const errors: string[] = [];
    for (const row of json) {
        try {
            const distance = parseInt(row["Jarak (m)"]);
            const styleName = row["Gaya"];
            const genderName = row["Jenis Kelamin"];
            const category = row["Kategori"] || null;
            const relayLegs = parseInt(row["Jumlah Atlet"]) || null;

            let style: SwimStyle | undefined;
            for (const [s, t] of Object.entries(SW_STYLE_TRANSLATIONS)) {
                if (t === styleName) { style = s as SwimStyle; break; }
            }
            if (!style) throw new Error(`Gaya "${styleName}" tidak valid.`);

            let gender: Gender | undefined;
            for (const [g, t] of Object.entries(GENDER_TRANSLATIONS)) {
                if (t === genderName) { gender = g as Gender; break; }
            }
            if (!gender) throw new Error(`Jenis Kelamin "${genderName}" tidak valid.`);

            await addEvent({ distance, style, gender, category, relayLegs });
            success++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { success, errors };
};

const SW_STYLE_TRANSLATIONS = SWIM_STYLE_TRANSLATIONS;

export const processParticipantUpload = async (json: any[]) => {
    let newSwimmers = 0;
    let updatedSwimmers = 0;
    const errors: string[] = [];

    for (const row of json) {
        try {
            const name = toTitleCase(row["Nama Atlet"] || "");
            const birthYear = parseInt(row["Tahun Lahir"]);
            const genderSymbol = row["Jenis Kelamin (L/P)"];
            const club = toTitleCase(row["Nama Tim"] || "");
            const ageGroup = row["KU"] || null;
            const eventName = row["Nomor Lomba"];
            const seedTimeStr = row["Waktu Unggulan (mm:ss.SS)"] || "99:99.99";

            if (!name || !club || !eventName) throw new Error("Data tidak lengkap.");

            const gender = genderSymbol === 'L' ? 'Male' : 'Female';

            // Find or create swimmer
            const { data: existingSwimmers } = await supabase.from('swimmers').select('*').ilike('name', name).eq('birth_year', birthYear).eq('gender', gender);
            let swimmer: Swimmer;
            if (existingSwimmers && existingSwimmers.length > 0) {
                swimmer = toSwimmer(existingSwimmers[0]);
                updatedSwimmers++;
            } else {
                swimmer = await addSwimmer({ name, birthYear, gender, club, ageGroup });
                newSwimmers++;
            }

            // Find event
            const allEvents = await getEvents();
            const event = allEvents.find(e => formatEventName(e) === eventName);
            if (!event) throw new Error(`Nomor lomba "${eventName}" tidak ditemukan.`);

            // Parse time
            let seedTime = 0;
            if (seedTimeStr.includes(':')) {
                const [min, rest] = seedTimeStr.split(':');
                const [sec, centi] = rest.split('.');
                seedTime = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
            }
            if (seedTimeStr === "99:99.99") seedTime = 0;

            await registerSwimmerToEvent(event.id, swimmer.id, seedTime);
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { newSwimmers, updatedSwimmers, errors };
};

export const processRecordUpload = async (json: any[]) => {
    let success = 0;
    const errors: string[] = [];
    for (const row of json) {
        try {
            const type = row["Tipe"] || RecordType.PORPROV;
            const distance = parseInt(row["Jarak (m)"]);
            const styleName = row["Gaya"];
            const genderName = row["Jenis Kelamin"];
            const category = row["Kategori"] || null;
            const holderName = row["Pemegang Rekor"];
            const yearSet = parseInt(row["Tahun"]);
            const timeStr = row["Waktu"];

            let style: SwimStyle | undefined;
            for (const [s, t] of Object.entries(SWIM_STYLE_TRANSLATIONS)) {
                if (t === styleName) { style = s as SwimStyle; break; }
            }
            if (!style) throw new Error(`Gaya "${styleName}" tidak valid.`);

            let gender: Gender | undefined;
            for (const [g, t] of Object.entries(GENDER_TRANSLATIONS)) {
                if (t === genderName) { gender = g as Gender; break; }
            }
            if (!gender) throw new Error(`Jenis Kelamin "${genderName}" tidak valid.`);

            let time = 0;
            if (timeStr && timeStr.includes(':')) {
                const [min, rest] = timeStr.split(':');
                const [sec, centi] = rest.split('.');
                time = (parseInt(min) * 60000) + (parseInt(sec) * 1000) + (parseInt(centi) * 10);
            }

            await addOrUpdateRecord({
                type: type as RecordType,
                distance,
                style,
                gender,
                category,
                holderName,
                yearSet,
                time
            });
            success++;
        } catch (e: any) {
            errors.push(e.message);
        }
    }
    return { success, errors };
};

export const backupDatabase = async () => {
    const [info, swimmers, events, event_entries, event_results, records] = await Promise.all([
        supabase.from('competition_info').select('*'),
        supabase.from('swimmers').select('*'),
        supabase.from('events').select('*'),
        supabase.from('event_entries').select('*'),
        supabase.from('event_results').select('*'),
        supabase.from('records').select('*'),
    ]);
    return {
        competition_info: info.data,
        swimmers: swimmers.data,
        events: events.data,
        event_entries: event_entries.data,
        event_results: event_results.data,
        records: records.data,
    };
};

export const clearAllData = async () => {
    await Promise.all([
        supabase.from('event_results').delete().neq('event_id', '0'),
        supabase.from('event_entries').delete().neq('event_id', '0'),
        supabase.from('swimmers').delete().neq('id', '0'),
        supabase.from('events').delete().neq('id', '0'),
    ]);
};

export const restoreDatabase = async (data: any) => {
    await clearAllData();
    if (data.competition_info) await supabase.from('competition_info').upsert(data.competition_info);
    if (data.swimmers) await supabase.from('swimmers').insert(data.swimmers);
    if (data.events) await supabase.from('events').insert(data.events);
    if (data.event_entries) await supabase.from('event_entries').insert(data.event_entries);
    if (data.event_results) await supabase.from('event_results').insert(data.event_results);
    if (data.records) await supabase.from('records').insert(data.records);
};

// --- ONLINE REGISTRATION ---

interface OnlineRegistrationResponse {
    success: boolean;
    message: string;
    swimmer: Swimmer | null;
    previouslyRegisteredEvents?: FormattableEvent[];
}

export const processOnlineRegistration = async (
    swimmerData: Omit<Swimmer, 'id'>,
    registrations: { eventId: string, seedTime: number }[]
): Promise<OnlineRegistrationResponse> => {
    try {
        const response = await fetch('/.netlify/functions/submitRegistration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ swimmerData, registrations }),
        });

        if (!response.ok) {
            let errorMessage = `Server error: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || JSON.stringify(errorData);
            } catch (e) {
                const textError = await response.text().catch(() => "Could not read error body.");
                errorMessage = textError.substring(0, 500);
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        console.error("Error submitting online registration:", error.message || error);
        return { success: false, message: `Terjadi kesalahan: ${error.message}`, swimmer: null };
    }
};

export const processCollectiveRegistration = async (
    teamData: { clubName: string, picName: string, picPhone: string, paymentProof: string | null, paymentAmount: number },
    participants: any[]
): Promise<{ success: boolean; message: string }> => {
    try {
        const response = await fetch('/.netlify/functions/submitCollectiveRegistration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ teamData, participants }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Gagal mengirim pendaftaran kolektif.');
        }

        return await response.json();
    } catch (error: any) {
        console.error("Error in processCollectiveRegistration:", error);
        return { success: false, message: error.message };
    }
};

// --- USER MANAGEMENT ---

export const getUsers = async (): Promise<User[]> => { 
    const { data, error } = await supabase.from('users').select('*'); 
    if (error) throw error; 
    return data.map(toUser); 
};

export const addUser = async (user: Omit<User, 'id'>): Promise<User> => { 
    throw new Error("Admin-level user creation disabled."); 
};

export const updateUser = async (userId: string, updatedData: Partial<Omit<User, 'id'>>): Promise<User> => { 
    throw new Error("User updates disabled."); 
};

export const deleteUser = async (userId: string): Promise<void> => { 
    throw new Error("User deletion disabled."); 
};

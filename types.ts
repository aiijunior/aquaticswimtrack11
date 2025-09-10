// We are removing the import of SupabaseUser to break a circular dependency.
// import type { User as SupabaseUser } from '@supabase/supabase-js';

export enum SwimStyle {
  FREESTYLE = 'Freestyle',
  BACKSTROKE = 'Backstroke',
  BREASTSTROKE = 'Breaststroke',
  BUTTERFLY = 'Butterfly',
  MEDLEY = 'Medley',
  PAPAN_LUNCUR = 'Papan Luncur',
}

export enum Gender {
  MALE = "Men's",
  FEMALE = "Women's",
  MIXED = 'Mixed',
}

export interface FormattableEvent {
    distance: number;
    style: SwimStyle;
    gender: Gender;
    relayLegs?: number | null;
    category?: string | null;
}

export interface CompetitionInfo {
    id?: number;
    eventName: string;
    eventDate: string;
    eventLogo: string | null;
    sponsorLogo: string | null;
    isRegistrationOpen?: boolean;
    // FIX: Corrected typo from numberOfLlanes to numberOfLanes
    numberOfLanes?: number;
    registrationDeadline?: string | null;
}

export interface Swimmer {
  id: string;
  name: string;
  birthYear: number;
  gender: 'Male' | 'Female';
  club: string;
}

export interface Result {
  swimmerId: string;
  time: number; // in milliseconds
}

export interface EventEntry {
    swimmerId: string;
    seedTime: number; // in milliseconds
}

export interface SwimEvent {
  id:string;
  distance: number;
  style: SwimStyle;
  gender: Gender;
  entries: EventEntry[]; 
  results: Result[];
  sessionNumber?: number;
  heatOrder?: number;
  sessionDateTime?: string;
  relayLegs?: number | null; // e.g., 4 for a 4x100 relay
  category?: string | null;
}

export enum View {
  LOGIN,
  ADMIN_DASHBOARD,
  EVENT_SETTINGS,
  RACES,
  PARTICIPANTS,
  SWIMMERS_LIST,
  LIVE_TIMING,
  RESULTS,
  PRINT_MENU,
  USER_MANAGEMENT,
  PUBLIC_RESULTS,
  ONLINE_REGISTRATION,
}

// --- User Management Types ---
// User type now represents the Supabase user object, with our custom role data merged in.
// We define it explicitly to avoid a circular type dependency with @supabase/supabase-js,
// which was causing TS to fail resolving Supabase client types.
export interface User {
  id: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  email?: string;
  app_metadata: { [key: string]: any; provider?: string; providers?: string[] };
  user_metadata: { [key: string]: any };
  aud: string;
  created_at: string;
  // Other Supabase User properties can be added here if needed by the app.
  // The user object created in authService will have all properties from the
  // original Supabase user, so this definition is for type safety within our app code.
}


// --- Helper Types for Heat Generation ---
export interface Entry {
    swimmerId: string;
    seedTime: number;
    swimmer: Swimmer;
}
export interface LaneAssignment {
    lane: number;
    entry: Entry;
}
export interface Heat {
    heatNumber: number;
    assignments: LaneAssignment[];
}

// --- Record Keeping Types ---
export enum RecordType {
  PORPROV = 'PORPROV',
  NASIONAL = 'Nasional',
}

export interface SwimRecord {
  id: string; // e.g., 'PORPROV_MALE_50_FREESTYLE'
  type: RecordType;
  gender: Gender;
  distance: number;
  style: SwimStyle;
  time: number; // in ms
  holderName: string;
  yearSet: number;
  locationSet?: string;
  relayLegs?: number | null;
  category?: string | null;
}

export interface BrokenRecord {
    record: SwimRecord;
    newEventName: string;
    newHolder: Swimmer;
    newTime: number;
}
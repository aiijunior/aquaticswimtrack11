
export type Database = {
  public: {
    Tables: {
      competition_info: {
        Row: {
          id: number
          event_name: string
          event_date: string
          event_logo: string | null
          sponsor_logo: string | null
          is_registration_open: boolean
          number_of_lanes: number
          registration_deadline: string | null
        }
        Insert: {
          id?: number
          event_name: string
          event_date: string
          event_logo?: string | null
          sponsor_logo?: string | null
          is_registration_open?: boolean
          number_of_lanes?: number
          registration_deadline?: string | null
        }
        Update: {
          id?: number
          event_name?: string
          event_date?: string
          event_logo?: string | null
          sponsor_logo?: string | null
          is_registration_open?: boolean
          number_of_lanes?: number
          registration_deadline?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          distance: number
          style: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          gender: "Men's" | "Women's" | "Mixed"
          session_number: number | null
          heat_order: number | null
          session_date_time: string | null
          relay_legs: number | null
          category: string | null
        }
        Insert: {
          id?: string
          distance: number
          style: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          gender: "Men's" | "Women's" | "Mixed"
          session_number?: number | null
          heat_order?: number | null
          session_date_time?: string | null
          relay_legs?: number | null
          category?: string | null
        }
        Update: {
          id?: string
          distance?: number
          style?: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          gender?: "Men's" | "Women's" | "Mixed"
          session_number?: number | null
          heat_order?: number | null
          session_date_time?: string | null
          relay_legs?: number | null
          category?: string | null
        }
        Relationships: []
      }
      event_entries: {
        Row: {
          event_id: string
          swimmer_id: string
          seed_time: number
        }
        Insert: {
          event_id: string
          swimmer_id: string
          seed_time: number
        }
        Update: {
          event_id?: string
          swimmer_id?: string
          seed_time?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_entries_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_results: {
        Row: {
          event_id: string
          swimmer_id: string
          time: number
        }
        Insert: {
          event_id: string
          swimmer_id: string
          time: number
        }
        Update: {
          event_id?: string
          swimmer_id?: string
          time?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_swimmer_id_fkey"
            columns: ["swimmer_id"]
            isOneToOne: false
            referencedRelation: "swimmers"
            referencedColumns: ["id"]
          },
        ]
      }
      records: {
        Row: {
          id: string
          type: "PORPROV" | "Nasional"
          gender: "Men's" | "Women's" | "Mixed"
          distance: number
          style: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          time: number
          holder_name: string
          year_set: number
          location_set: string | null
          relay_legs: number | null
          category: string | null
        }
        Insert: {
          id: string
          type: "PORPROV" | "Nasional"
          gender: "Men's" | "Women's" | "Mixed"
          distance: number
          style: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          time: number
          holder_name: string
          year_set: number
          location_set?: string | null
          relay_legs?: number | null
          category?: string | null
        }
        Update: {
          id?: string
          type?: "PORPROV" | "Nasional"
          gender?: "Men's" | "Women's" | "Mixed"
          distance?: number
          style?: "Freestyle" | "Backstroke" | "Breaststroke" | "Butterfly" | "Medley" | "Gaya Papan Luncur"
          time?: number
          holder_name?: string
          year_set?: number
          location_set?: string | null
          relay_legs?: number | null
          category?: string | null
        }
        Relationships: []
      }
      swimmers: {
        Row: {
          id: string
          name: string
          birth_year: number
          gender: "Male" | "Female"
          club: string
        }
        Insert: {
          id?: string
          name: string
          birth_year: number
          gender: "Male" | "Female"
          club: string
        }
        Update: {
          id?: string
          name?: string
          birth_year?: number
          gender?: "Male" | "Female"
          club?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          role: "SUPER_ADMIN" | "ADMIN"
          created_at: string
        }
        Insert: {
          id: string
          role: "SUPER_ADMIN" | "ADMIN"
          created_at?: string
        }
        Update: {
          id?: string
          role?: "SUPER_ADMIN" | "ADMIN"
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

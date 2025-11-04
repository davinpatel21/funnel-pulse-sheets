export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          key_name: string
          last_used_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_name: string
          last_used_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_name?: string
          last_used_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          booked_at: string | null
          closer_form_status: string | null
          closer_id: string | null
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          pipeline: string | null
          post_call_form_url: string | null
          recording_url: string | null
          scheduled_at: string
          setter_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          booked_at?: string | null
          closer_form_status?: string | null
          closer_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          pipeline?: string | null
          post_call_form_url?: string | null
          recording_url?: string | null
          scheduled_at: string
          setter_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          booked_at?: string | null
          closer_form_status?: string | null
          closer_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          pipeline?: string | null
          post_call_form_url?: string | null
          recording_url?: string | null
          scheduled_at?: string
          setter_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          appointment_id: string | null
          caller_id: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          lead_id: string
          notes: string | null
          was_live: boolean | null
        }
        Insert: {
          appointment_id?: string | null
          caller_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          was_live?: boolean | null
        }
        Update: {
          appointment_id?: string | null
          caller_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          was_live?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          appointment_id: string | null
          cash_collected: number | null
          closed_at: string | null
          closer_id: string
          created_at: string
          fees_amount: number | null
          id: string
          lead_id: string
          payment_platform: string | null
          revenue_amount: number
          setter_id: string | null
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          cash_collected?: number | null
          closed_at?: string | null
          closer_id: string
          created_at?: string
          fees_amount?: number | null
          id?: string
          lead_id: string
          payment_platform?: string | null
          revenue_amount: number
          setter_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          cash_collected?: number | null
          closed_at?: string | null
          closer_id?: string
          created_at?: string
          fees_amount?: number | null
          id?: string
          lead_id?: string
          payment_platform?: string | null
          revenue_amount?: number
          setter_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_sheets_imports: {
        Row: {
          created_at: string | null
          errors: Json | null
          field_mappings: Json
          id: string
          last_sync_at: string | null
          rows_failed: number | null
          rows_imported: number | null
          sheet_id: string
          sheet_name: string | null
          sheet_url: string
          sync_status: Database["public"]["Enums"]["import_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          errors?: Json | null
          field_mappings: Json
          id?: string
          last_sync_at?: string | null
          rows_failed?: number | null
          rows_imported?: number | null
          sheet_id: string
          sheet_name?: string | null
          sheet_url: string
          sync_status?: Database["public"]["Enums"]["import_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          errors?: Json | null
          field_mappings?: Json
          id?: string
          last_sync_at?: string | null
          rows_failed?: number | null
          rows_imported?: number | null
          sheet_id?: string
          sheet_name?: string | null
          sheet_url?: string
          sync_status?: Database["public"]["Enums"]["import_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          closer_id: string | null
          created_at: string
          custom_fields: Json | null
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          setter_id: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          utm_source: string | null
        }
        Insert: {
          closer_id?: string | null
          created_at?: string
          custom_fields?: Json | null
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          setter_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_source?: string | null
        }
        Update: {
          closer_id?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          setter_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean | null
          table_name: string
          user_id: string
          view_name: string
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          is_default?: boolean | null
          table_name: string
          user_id: string
          view_name: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          table_name?: string
          user_id?: string
          view_name?: string
        }
        Relationships: []
      }
      sheet_configurations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          mappings: Json
          sheet_type: string
          sheet_url: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          mappings: Json
          sheet_type: string
          sheet_url: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          mappings?: Json
          sheet_type?: string
          sheet_url?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      api_key_status: "active" | "revoked"
      app_role: "admin" | "setter" | "closer"
      appointment_status:
        | "scheduled"
        | "completed"
        | "no_show"
        | "cancelled"
        | "rescheduled"
      deal_status: "pending" | "won" | "lost"
      import_status:
        | "pending"
        | "analyzing"
        | "ready"
        | "importing"
        | "completed"
        | "failed"
      lead_source:
        | "youtube"
        | "instagram"
        | "discord"
        | "email"
        | "vendor_doc"
        | "sms"
        | "facebook"
        | "tiktok"
        | "referral"
        | "other"
      lead_status: "new" | "contacted" | "qualified" | "unqualified"
      user_role: "setter" | "closer" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      api_key_status: ["active", "revoked"],
      app_role: ["admin", "setter", "closer"],
      appointment_status: [
        "scheduled",
        "completed",
        "no_show",
        "cancelled",
        "rescheduled",
      ],
      deal_status: ["pending", "won", "lost"],
      import_status: [
        "pending",
        "analyzing",
        "ready",
        "importing",
        "completed",
        "failed",
      ],
      lead_source: [
        "youtube",
        "instagram",
        "discord",
        "email",
        "vendor_doc",
        "sms",
        "facebook",
        "tiktok",
        "referral",
        "other",
      ],
      lead_status: ["new", "contacted", "qualified", "unqualified"],
      user_role: ["setter", "closer", "admin"],
    },
  },
} as const

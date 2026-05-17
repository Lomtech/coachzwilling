// AUTO-GENERATED via Supabase MCP (generate_typescript_types).
// Bei Schema-Änderungen mit `npm run types:gen` regenerieren.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      coach_profiles: {
        Row: {
          config_md: string
          einstiegsmodus_md: string | null
          generated_at: string
          id: string
          is_active: boolean
          model: string
          source_response_id: string | null
          ton_profil_md: string | null
          user_id: string
          version: number
          source: 'onboarding' | 'manual_refresh' | 'auto_refresh'
          memories_used_count: number
        }
        Insert: {
          config_md: string
          einstiegsmodus_md?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          model: string
          source_response_id?: string | null
          ton_profil_md?: string | null
          user_id: string
          version?: number
          source?: 'onboarding' | 'manual_refresh' | 'auto_refresh'
          memories_used_count?: number
        }
        Update: {
          config_md?: string
          einstiegsmodus_md?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          model?: string
          source_response_id?: string | null
          ton_profil_md?: string | null
          user_id?: string
          version?: number
          source?: 'onboarding' | 'manual_refresh' | 'auto_refresh'
          memories_used_count?: number
        }
        Relationships: []
      }
      coach_memory: {
        Row: {
          id: string
          user_id: string
          conversation_id: string | null
          source_msg_id: string | null
          section: 'motivmuster' | 'stressmuster' | 'ausweich' | 'veraenderung' | 'coaching_stil' | 'breakthrough' | 'blocker' | 'goal' | 'identitaet'
          observation: string
          context_excerpt: string | null
          importance: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_id?: string | null
          source_msg_id?: string | null
          section: 'motivmuster' | 'stressmuster' | 'ausweich' | 'veraenderung' | 'coaching_stil' | 'breakthrough' | 'blocker' | 'goal' | 'identitaet'
          observation: string
          context_excerpt?: string | null
          importance?: number
          is_active?: boolean
        }
        Update: {
          observation?: string
          importance?: number
          is_active?: boolean
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          role: string
          user_id: string
        }
        Insert: {
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          role: string
          user_id: string
        }
        Update: {
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          onboarding_state: string
          trial_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          onboarding_state?: string
          trial_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          onboarding_state?: string
          trial_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      questionnaire_responses: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          price_id: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          price_id?: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          price_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type ActiveSubscriptionStatus = 'active' | 'trialing'
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
])

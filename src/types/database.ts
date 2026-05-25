export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      coach_memory: {
        Row: {
          context_excerpt: string | null
          conversation_id: string | null
          created_at: string
          id: string
          importance: number
          is_active: boolean
          observation: string
          section: string
          source_msg_id: string | null
          user_id: string
        }
        Insert: {
          context_excerpt?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          importance?: number
          is_active?: boolean
          observation: string
          section: string
          source_msg_id?: string | null
          user_id: string
        }
        Update: {
          context_excerpt?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          importance?: number
          is_active?: boolean
          observation?: string
          section?: string
          source_msg_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_profiles: {
        Row: {
          config_md: string
          einstiegsmodus_md: string | null
          generated_at: string
          id: string
          is_active: boolean
          language_mirror: string | null
          memories_used_count: number
          model: string
          share_created_at: string | null
          share_enabled: boolean
          share_token: string | null
          source: string
          source_response_id: string | null
          ton_profil_md: string | null
          tone_oneliner: string | null
          user_id: string
          version: number
        }
        Insert: {
          config_md: string
          einstiegsmodus_md?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          language_mirror?: string | null
          memories_used_count?: number
          model: string
          share_created_at?: string | null
          share_enabled?: boolean
          share_token?: string | null
          source?: string
          source_response_id?: string | null
          ton_profil_md?: string | null
          tone_oneliner?: string | null
          user_id: string
          version?: number
        }
        Update: {
          config_md?: string
          einstiegsmodus_md?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          language_mirror?: string | null
          memories_used_count?: number
          model?: string
          share_created_at?: string | null
          share_enabled?: boolean
          share_token?: string | null
          source?: string
          source_response_id?: string | null
          ton_profil_md?: string | null
          tone_oneliner?: string | null
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      commitments: {
        Row: {
          conversation_id: string | null
          created_at: string
          due_hint: string | null
          id: string
          importance: number
          resolution_note: string | null
          resolved_at: string | null
          source_msg_id: string | null
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          due_hint?: string | null
          id?: string
          importance?: number
          resolution_note?: string | null
          resolved_at?: string | null
          source_msg_id?: string | null
          status?: string
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          due_hint?: string | null
          id?: string
          importance?: number
          resolution_note?: string | null
          resolved_at?: string | null
          source_msg_id?: string | null
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
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
      email_followups: {
        Row: {
          body_html: string | null
          body_text: string
          bounced_at: string | null
          click_target: string | null
          clicked_at: string | null
          complained_at: string | null
          composed_at: string
          expires_at: string
          id: string
          opened_at: string | null
          resend_message_id: string | null
          run_id: string | null
          sent_at: string | null
          signed_token: string
          source_summary: string | null
          subject: string
          user_id: string
        }
        Insert: {
          body_html?: string | null
          body_text: string
          bounced_at?: string | null
          click_target?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          composed_at?: string
          expires_at: string
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          run_id?: string | null
          sent_at?: string | null
          signed_token: string
          source_summary?: string | null
          subject: string
          user_id: string
        }
        Update: {
          body_html?: string | null
          body_text?: string
          bounced_at?: string | null
          click_target?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          composed_at?: string
          expires_at?: string
          id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          run_id?: string | null
          sent_at?: string | null
          signed_token?: string
          source_summary?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          answers: Json
          converted_user_id: string | null
          created_at: string
          email: string | null
          id: string
          ip_country: string | null
          name: string | null
          short_profile: string | null
          source: string
          user_agent: string | null
          utm: Json | null
        }
        Insert: {
          answers?: Json
          converted_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_country?: string | null
          name?: string | null
          short_profile?: string | null
          source?: string
          user_agent?: string | null
          utm?: Json | null
        }
        Update: {
          answers?: Json
          converted_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip_country?: string | null
          name?: string | null
          short_profile?: string | null
          source?: string
          user_agent?: string | null
          utm?: Json | null
        }
        Relationships: []
      }
      message_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: number
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
          followup_enabled: boolean
          followup_frequency_days: number
          followup_unsubscribed_at: string | null
          full_name: string | null
          id: string
          last_followup_at: string | null
          onboarding_state: string
          trial_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          followup_enabled?: boolean
          followup_frequency_days?: number
          followup_unsubscribed_at?: string | null
          full_name?: string | null
          id: string
          last_followup_at?: string | null
          onboarding_state?: string
          trial_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          followup_enabled?: boolean
          followup_frequency_days?: number
          followup_unsubscribed_at?: string | null
          full_name?: string | null
          id?: string
          last_followup_at?: string | null
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
      testimonials: {
        Row: {
          allow_publish: boolean
          approved_by_admin: boolean
          context: string | null
          created_at: string
          decision: string
          display_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          allow_publish?: boolean
          approved_by_admin?: boolean
          context?: string | null
          created_at?: string
          decision: string
          display_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          allow_publish?: boolean
          approved_by_admin?: boolean
          context?: string | null
          created_at?: string
          decision?: string
          display_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      next_profile_version: { Args: { p_user_id: string }; Returns: number }
    }
    Enums: Record<string, never>
    CompositeTypes: { [_ in never]: never }
  }
}

// Active subscription statuses (used by chat-route, settings, billing)
export const ACTIVE_STATUSES = new Set(['active', 'trialing'])

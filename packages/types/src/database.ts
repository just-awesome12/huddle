export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability_dates: {
        Row: {
          event_date: string
          group_id: string
          id: string
          poll_id: string
          position: number
        }
        Insert: {
          event_date: string
          group_id: string
          id?: string
          poll_id: string
          position?: number
        }
        Update: {
          event_date?: string
          group_id?: string
          id?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_dates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_dates_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "availability_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_polls: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          title: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_responses: {
        Row: {
          created_at: string
          date_id: string
          group_id: string
          poll_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_id: string
          group_id: string
          poll_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_id?: string
          group_id?: string
          poll_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_responses_date_id_fkey"
            columns: ["date_id"]
            isOneToOne: false
            referencedRelation: "availability_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_responses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "availability_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_sets: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idea_ids: string[]
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          idea_ids?: string[]
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          idea_ids?: string[]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_sets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          candidate_idea_ids: string[]
          chosen_idea_id: string
          created_at: string
          filters: Json
          group_id: string
          id: string
          run_by: string | null
        }
        Insert: {
          candidate_idea_ids: string[]
          chosen_idea_id: string
          created_at?: string
          filters?: Json
          group_id: string
          id?: string
          run_by?: string | null
        }
        Update: {
          candidate_idea_ids?: string[]
          chosen_idea_id?: string
          created_at?: string
          filters?: Json
          group_id?: string
          id?: string
          run_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_chosen_idea_id_fkey"
            columns: ["chosen_idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          invited_email: string | null
          invited_user_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          id?: string
          invited_email?: string | null
          invited_user_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          invited_email?: string | null
          invited_user_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: Database["public"]["Enums"]["group_member_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_member_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_notification_prefs: {
        Row: {
          group_id: string
          muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_notification_prefs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_posts: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          group_id: string
          id: string
          pinned: boolean
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          group_id: string
          id?: string
          pinned?: boolean
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          color: string | null
          cover_photo_path: string | null
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          last_nudged_at: string | null
          lite_mode: boolean
          location: string | null
          member_count: number
          name: string
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        Insert: {
          color?: string | null
          cover_photo_path?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          emoji?: string | null
          id?: string
          last_nudged_at?: string | null
          lite_mode?: boolean
          location?: string | null
          member_count?: number
          name: string
          tags?: string[]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Update: {
          color?: string | null
          cover_photo_path?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          emoji?: string | null
          id?: string
          last_nudged_at?: string | null
          lite_mode?: boolean
          location?: string | null
          member_count?: number
          name?: string
          tags?: string[]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          group_id: string
          id: string
          idea_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          group_id: string
          id?: string
          idea_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          idea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_comments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_comments_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_rsvps: {
        Row: {
          created_at: string
          group_id: string
          idea_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          idea_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          idea_id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_rsvps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_rsvps_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_votes: {
        Row: {
          created_at: string
          idea_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          idea_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          idea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          category: Database["public"]["Enums"]["idea_category"]
          created_at: string
          description: string | null
          event_date: string | null
          group_id: string
          id: string
          link: string | null
          location: string | null
          photo_path: string | null
          proposed_by: string | null
          status: Database["public"]["Enums"]["idea_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["idea_category"]
          created_at?: string
          description?: string | null
          event_date?: string | null
          group_id: string
          id?: string
          link?: string | null
          location?: string | null
          photo_path?: string | null
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["idea_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["idea_category"]
          created_at?: string
          description?: string | null
          event_date?: string | null
          group_id?: string
          id?: string
          link?: string | null
          location?: string | null
          photo_path?: string | null
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["idea_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          digest: boolean
          group_invite: boolean
          join_approved: boolean
          join_request: boolean
          mention: boolean
          new_comment: boolean
          new_idea: boolean
          nudge: boolean
          picker_ran: boolean
          reaction: boolean
          rsvp: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          digest?: boolean
          group_invite?: boolean
          join_approved?: boolean
          join_request?: boolean
          mention?: boolean
          new_comment?: boolean
          new_idea?: boolean
          nudge?: boolean
          picker_ran?: boolean
          reaction?: boolean
          rsvp?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          digest?: boolean
          group_invite?: boolean
          join_approved?: boolean
          join_request?: boolean
          mention?: boolean
          new_comment?: boolean
          new_idea?: boolean
          nudge?: boolean
          picker_ran?: boolean
          reaction?: boolean
          rsvp?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          group_id: string
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          group_id: string
          id?: string
          label: string
          poll_id: string
          position?: number
        }
        Update: {
          group_id?: string
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          group_id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          question: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          question: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          last_digest_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          last_digest_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_digest_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_token: string
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["push_platform"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_token: string
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["push_platform"]
          user_id: string
        }
        Update: {
          created_at?: string
          expo_token?: string
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["push_platform"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          emoji: string
          group_id: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["reaction_target"]
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          group_id: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["reaction_target"]
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          group_id?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["reaction_target"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          idea_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          idea_id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          idea_id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_token: string }
        Returns: {
          color: string | null
          cover_photo_path: string | null
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          last_nudged_at: string | null
          lite_mode: boolean
          location: string | null
          member_count: number
          name: string
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group: {
        Args: {
          p_description?: string
          p_location?: string
          p_name: string
          p_tags?: string[]
          p_visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Returns: {
          color: string | null
          cover_photo_path: string | null
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          last_nudged_at: string | null
          lite_mode: boolean
          location: string | null
          member_count: number
          name: string
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      digest_eligible_users: {
        Args: { p_cooldown_days?: number }
        Returns: {
          email: string
          last_digest_at: string
          user_id: string
        }[]
      }
      dispatch_inactivity_nudges: {
        Args: { p_cooldown_days?: number; p_inactive_days?: number }
        Returns: number
      }
      dispatch_weekly_digest: { Args: never; Returns: undefined }
      generate_invite_token: { Args: never; Returns: string }
      get_push_recipients: {
        Args: {
          p_explicit_user_ids: string[]
          p_group_id: string
          p_scope: string
        }
        Returns: Json
      }
      get_user_digest: {
        Args: { p_since: string; p_user: string }
        Returns: Json
      }
      groups_needing_nudge: {
        Args: { p_cooldown_days?: number; p_inactive_days?: number }
        Returns: string[]
      }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_valid_username: { Args: { value: string }; Returns: boolean }
      peek_invite: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          group_id: string
          group_name: string
          inviter_display_name: string
          status: string
        }[]
      }
      request_to_join: {
        Args: { p_group_id: string; p_message?: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "group_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_join_request: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "group_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_post_pinned: {
        Args: { p_pinned: boolean; p_post_id: string }
        Returns: undefined
      }
    }
    Enums: {
      group_member_role: "admin" | "member"
      group_visibility: "invite_only" | "public"
      idea_category: "food" | "activity" | "place" | "event" | "other"
      idea_status: "on_radar" | "done" | "dismissed"
      join_request_status: "pending" | "approved" | "rejected"
      push_platform: "ios" | "android"
      reaction_target: "idea" | "decision" | "comment"
      report_reason: "spam" | "inappropriate" | "harassment" | "other"
      report_status: "open" | "reviewed" | "dismissed" | "actioned"
      rsvp_status: "going" | "maybe" | "not_going"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      group_member_role: ["admin", "member"],
      group_visibility: ["invite_only", "public"],
      idea_category: ["food", "activity", "place", "event", "other"],
      idea_status: ["on_radar", "done", "dismissed"],
      join_request_status: ["pending", "approved", "rejected"],
      push_platform: ["ios", "android"],
      reaction_target: ["idea", "decision", "comment"],
      report_reason: ["spam", "inappropriate", "harassment", "other"],
      report_status: ["open", "reviewed", "dismissed", "actioned"],
      rsvp_status: ["going", "maybe", "not_going"],
    },
  },
} as const


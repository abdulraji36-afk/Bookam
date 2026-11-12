// Hand-maintained to match supabase/migrations. Once a Supabase project is
// linked, regenerate with: npx supabase gen types typescript --linked
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "owner" | "admin" | "staff";
export type PlanCode = "trial" | "starter" | "growth" | "business";

export type Database = {
  public: {
    Tables: {
      plans: {
        Row: {
          code: string;
          name: string;
          max_members: number | null;
          max_locations: number | null;
          sort_order: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; full_name: string; email: string | null; created_at: string };
        Insert: never;
        Update: { full_name?: string };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          business_type: string | null;
          country_code: string;
          currency_code: string;
          timezone: string;
          plan_code: string;
          trial_ends_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "organizations_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          }
        ];
      };
      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: MemberRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: MemberRole;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: { p_name: string; p_business_type?: string | null };
        Returns: { id: string; slug: string }[];
      };
      update_organization: {
        Args: { p_organization_id: string; p_name: string; p_business_type?: string | null };
        Returns: undefined;
      };
      create_location: {
        Args: { p_organization_id: string; p_name: string };
        Returns: string;
      };
      invite_member: {
        Args: { p_organization_id: string; p_email: string; p_role: MemberRole };
        Returns: { invitation_id: string; token: string }[];
      };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          organization_name: string;
          email: string;
          role: MemberRole;
          status: "pending" | "accepted" | "revoked" | "expired";
        }[];
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: { organization_id: string; slug: string }[];
      };
      set_member_role: {
        Args: { p_membership_id: string; p_role: MemberRole };
        Returns: undefined;
      };
      set_member_active: {
        Args: { p_membership_id: string; p_is_active: boolean };
        Returns: undefined;
      };
    };
    Enums: { member_role: MemberRole };
    CompositeTypes: Record<string, never>;
  };
};

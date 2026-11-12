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
      returnable_items: {
        Row: { id: string; organization_id: string; name: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sku: string | null;
          unit: string;
          selling_price: number | null;
          low_stock_threshold: number;
          returnable_item_id: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "products_returnable_item_id_fkey";
            columns: ["returnable_item_id"];
            isOneToOne: false;
            referencedRelation: "returnable_items";
            referencedColumns: ["id"];
          }
        ];
      };
      product_costs: {
        Row: { product_id: string; organization_id: string; cost_price: number; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          area: string | null;
          address: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_receipts: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          receipt_no: string;
          received_date: string;
          supplier_name: string | null;
          reference: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "stock_receipts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_receipts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_receipt_items: {
        Row: {
          id: string;
          organization_id: string;
          receipt_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "stock_receipt_items_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "stock_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_receipt_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          product_id: string;
          movement_type: "stock_in" | "sale" | "adjustment";
          qty_in: number;
          qty_out: number;
          source_type: string;
          source_id: string;
          movement_date: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      product_stock_levels: {
        Row: {
          organization_id: string;
          product_id: string;
          location_id: string;
          on_hand: number;
        };
        Relationships: [];
      };
      product_stock_totals: {
        Row: { organization_id: string; product_id: string; on_hand: number };
        Relationships: [];
      };
    };
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
      save_product: {
        Args: {
          p_organization_id: string;
          p_product_id: string | null;
          p_name: string;
          p_sku: string | null;
          p_unit: string;
          p_selling_price: number | null;
          p_cost_price: number | null;
          p_low_stock_threshold: number | null;
          p_requires_return: boolean;
          p_return_item_name: string | null;
        };
        Returns: string;
      };
      set_product_active: {
        Args: { p_product_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      save_customer: {
        Args: {
          p_organization_id: string;
          p_customer_id: string | null;
          p_name: string;
          p_phone: string | null;
          p_area: string | null;
          p_address: string | null;
        };
        Returns: string;
      };
      set_customer_active: {
        Args: { p_customer_id: string; p_is_active: boolean };
        Returns: undefined;
      };
      record_stock_receipt: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_received_date: string;
          p_supplier_name: string | null;
          p_reference: string | null;
          p_note: string | null;
          p_items: Json;
        };
        Returns: { id: string; receipt_no: string }[];
      };
    };
    Enums: { member_role: MemberRole };
    CompositeTypes: Record<string, never>;
  };
};

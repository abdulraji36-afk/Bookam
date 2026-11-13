// Hand-maintained to match supabase/migrations. Once a Supabase project is
// linked, regenerate with: npx supabase gen types typescript --linked
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "owner" | "admin" | "staff";
export type PlanCode = "trial" | "starter" | "growth" | "business";
export type OrderStatus = "pending" | "assigned" | "dispatched" | "completed" | "cancelled";
export type PaymentType = "cash" | "transfer" | "credit";
export type TripStatus = "draft" | "dispatched" | "completed" | "cancelled";
export type ReturnableMovementType =
  | "dispatch"
  | "trip_return"
  | "supplier_exchange"
  | "adjustment"
  | "opening_debt";
export type ReturnableAdjustmentReason =
  | "customer_return"
  | "purchase"
  | "opening_count"
  | "correction"
  | "damaged_or_lost"
  | "given_to_customer";

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
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
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
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
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
          },
          {
            foreignKeyName: "stock_receipts_voided_by_fkey";
            columns: ["voided_by"];
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
      orders: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          order_no: string;
          order_date: string;
          customer_id: string;
          status: OrderStatus;
          payment_type: PaymentType;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          voided_from_status: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          returnable_item_id: string | null;
          line_total: number;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_returnable_item_id_fkey";
            columns: ["returnable_item_id"];
            isOneToOne: false;
            referencedRelation: "returnable_items";
            referencedColumns: ["id"];
          }
        ];
      };
      dispatch_trips: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          trip_no: string;
          dispatch_date: string;
          driver_name: string;
          vehicle: string | null;
          status: TripStatus;
          note: string | null;
          dispatched_at: string | null;
          returned_date: string | null;
          returns_recorded_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "dispatch_trips_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_trips_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      dispatch_trip_orders: {
        Row: { id: string; organization_id: string; trip_id: string; order_id: string };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "dispatch_trip_orders_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_trip_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      returnable_movements: {
        Row: {
          id: string;
          organization_id: string;
          returnable_item_id: string;
          location_id: string | null;
          customer_id: string | null;
          holding_delta: number;
          owed_delta: number;
          movement_type: ReturnableMovementType;
          source_type: string;
          source_id: string;
          movement_date: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "returnable_movements_returnable_item_id_fkey";
            columns: ["returnable_item_id"];
            isOneToOne: false;
            referencedRelation: "returnable_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "returnable_movements_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      trip_return_lines: {
        Row: {
          id: string;
          organization_id: string;
          trip_id: string;
          order_id: string;
          returnable_item_id: string;
          expected_quantity: number;
          returned_quantity: number;
          corrected_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "trip_return_lines_returnable_item_id_fkey";
            columns: ["returnable_item_id"];
            isOneToOne: false;
            referencedRelation: "returnable_items";
            referencedColumns: ["id"];
          }
        ];
      };
      supplier_exchanges: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          exchange_no: string;
          exchange_date: string;
          returnable_item_id: string;
          quantity_taken: number;
          supplier_name: string | null;
          reference: string | null;
          received_by: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      returnable_adjustments: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          adjustment_date: string;
          returnable_item_id: string;
          quantity_delta: number;
          reason: ReturnableAdjustmentReason;
          customer_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      organization_notifications: {
        // The chat id and link code hash are not readable through the API.
        Row: {
          organization_id: string;
          telegram_chat_title: string | null;
          telegram_linked_at: string | null;
          is_enabled: boolean;
          link_code_expires_at: string | null;
          updated_at: string;
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
      order_summaries: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          order_no: string;
          order_date: string;
          status: OrderStatus;
          payment_type: PaymentType;
          customer_id: string;
          customer_name: string;
          customer_area: string | null;
          total_quantity: number;
          total_amount: number;
          has_returns: boolean;
          trip_id: string | null;
          trip_no: string | null;
          created_at: string;
          voided_at: string | null;
        };
        Relationships: [];
      };
      dispatch_trip_summaries: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          trip_no: string;
          dispatch_date: string;
          driver_name: string;
          vehicle: string | null;
          status: TripStatus;
          dispatched_at: string | null;
          created_at: string;
          order_count: number;
          total_quantity: number;
          total_amount: number;
          has_returns: boolean;
        };
        Relationships: [];
      };
      returnable_totals: {
        Row: {
          organization_id: string;
          returnable_item_id: string;
          name: string;
          holding: number;
          owed: number;
          credit: number;
        };
        Relationships: [];
      };
      returnable_holdings: {
        Row: {
          organization_id: string;
          returnable_item_id: string;
          location_id: string;
          holding: number;
        };
        Relationships: [];
      };
      customer_returnable_balances: {
        Row: {
          organization_id: string;
          customer_id: string;
          customer_name: string;
          customer_area: string | null;
          returnable_item_id: string;
          returnable_name: string;
          owed: number;
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
      create_order: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_order_date: string;
          p_customer_id: string;
          p_payment_type: PaymentType;
          p_note: string | null;
          p_items: Json;
        };
        Returns: { id: string; order_no: string }[];
      };
      update_order: {
        Args: {
          p_order_id: string;
          p_order_date: string;
          p_customer_id: string;
          p_payment_type: PaymentType;
          p_note: string | null;
          p_items: Json;
        };
        Returns: undefined;
      };
      cancel_order: { Args: { p_order_id: string }; Returns: undefined };
      create_dispatch_trip: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_dispatch_date: string;
          p_driver_name: string;
          p_vehicle: string | null;
          p_note: string | null;
          p_order_ids: string[];
        };
        Returns: { id: string; trip_no: string }[];
      };
      dispatch_trip: { Args: { p_trip_id: string }; Returns: undefined };
      cancel_dispatch_trip: { Args: { p_trip_id: string }; Returns: undefined };
      record_trip_returns: {
        Args: { p_trip_id: string; p_returned_date: string; p_returns: Json };
        Returns: undefined;
      };
      record_supplier_exchange: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_exchange_date: string;
          p_returnable_item_id: string;
          p_quantity: number;
          p_supplier_name: string | null;
          p_reference: string | null;
          p_received_by: string | null;
          p_note: string | null;
        };
        Returns: { id: string; exchange_no: string }[];
      };
      record_returnable_adjustment: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_adjustment_date: string;
          p_returnable_item_id: string;
          p_direction: "add" | "subtract";
          p_quantity: number;
          p_reason: ReturnableAdjustmentReason;
          p_customer_id: string | null;
          p_note: string | null;
        };
        Returns: string;
      };
      record_customer_opening_debt: {
        Args: {
          p_organization_id: string;
          p_customer_id: string;
          p_returnable_item_id: string;
          p_quantity: number;
          p_note: string | null;
        };
        Returns: undefined;
      };
      void_order: { Args: { p_order_id: string; p_reason: string }; Returns: undefined };
      void_stock_receipt: { Args: { p_receipt_id: string; p_reason: string }; Returns: undefined };
      void_supplier_exchange: { Args: { p_exchange_id: string; p_reason: string }; Returns: undefined };
      void_returnable_adjustment: {
        Args: { p_adjustment_id: string; p_reason: string };
        Returns: undefined;
      };
      correct_trip_return: {
        Args: { p_line_id: string; p_returned_quantity: number; p_reason: string };
        Returns: undefined;
      };
      daily_stock_report: {
        Args: { p_organization_id: string; p_date: string };
        Returns: {
          product_id: string;
          name: string;
          unit: string;
          opening: number;
          received: number;
          sold: number;
          closing: number;
        }[];
      };
      daily_returnables_report: {
        Args: { p_organization_id: string; p_date: string };
        Returns: {
          returnable_item_id: string;
          name: string;
          opening: number;
          came_in: number;
          went_out: number;
          closing: number;
          owed_closing: number;
        }[];
      };
      start_telegram_link: { Args: { p_organization_id: string }; Returns: string };
      complete_telegram_link: {
        Args: { p_code: string; p_chat_id: number; p_chat_title: string | null };
        Returns: string | null;
      };
      disconnect_telegram: { Args: { p_organization_id: string }; Returns: undefined };
      set_notifications_enabled: {
        Args: { p_organization_id: string; p_is_enabled: boolean };
        Returns: undefined;
      };
      get_notification_target: {
        Args: { p_organization_id: string };
        Returns: { chat_id: number; actor_name: string }[];
      };
    };
    Enums: { member_role: MemberRole };
    CompositeTypes: Record<string, never>;
  };
};

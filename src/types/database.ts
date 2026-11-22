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
/** Counts its goods, or sells items one by one by serial number. */
export type SellingMode = "quantity" | "serial";

export type UnitStatus = "in_stock" | "reserved" | "sold" | "written_off";
export type StockAdjustmentReason = "damaged" | "expired" | "lost_or_stolen" | "count_correction" | "found";
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
          tracks_returns: boolean;
          tracks_serials: boolean;
          selling_mode: SellingMode;
          does_delivery: boolean;
          sells_drinks: boolean;
          product_order: string[];
          trade: "drinks" | "goods";
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
      dispatch_workers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          role: "driver" | "loader";
          phone: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      dispatch_trip_loaders: {
        Row: { trip_id: string; worker_id: string; organization_id: string };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "dispatch_trip_loaders_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_workers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_trip_loaders_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_trips";
            referencedColumns: ["id"];
          }
        ];
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
          tracks_serials: boolean;
          warranty_months: number | null;
          category: string | null;
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
      stock_receipt_corrections: {
        Row: {
          id: string;
          organization_id: string;
          receipt_id: string;
          product_id: string;
          old_quantity: number;
          new_quantity: number;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "stock_receipt_corrections_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_receipt_corrections_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_receipt_item_costs: {
        Row: {
          receipt_item_id: string;
          organization_id: string;
          unit_cost: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "stock_receipt_item_costs_receipt_item_id_fkey";
            columns: ["receipt_item_id"];
            isOneToOne: true;
            referencedRelation: "stock_receipt_items";
            referencedColumns: ["id"];
          }
        ];
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
          customer_id: string | null;
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
          buyer_name: string | null;
          buyer_phone: string | null;
          handed_over_at: string | null;
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
          driver_id: string | null;
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
          },
          {
            foreignKeyName: "trip_return_lines_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_return_lines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      empties_followups: {
        Row: {
          id: string;
          organization_id: string;
          trip_return_line_id: string;
          quantity: number;
          received_date: string;
          note: string | null;
          recorded_by: string | null;
          created_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "empties_followups_trip_return_line_id_fkey";
            columns: ["trip_return_line_id"];
            isOneToOne: false;
            referencedRelation: "trip_return_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "empties_followups_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          receipt_id: string | null;
          crates_delivered: number | null;
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
        Relationships: [
          {
            foreignKeyName: "supplier_exchanges_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_exchanges_returnable_item_id_fkey";
            columns: ["returnable_item_id"];
            isOneToOne: false;
            referencedRelation: "returnable_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_exchanges_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: true;
            referencedRelation: "stock_receipts";
            referencedColumns: ["id"];
          }
        ];
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
      stock_adjustments: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          product_id: string;
          adjustment_date: string;
          quantity_delta: number;
          reason: StockAdjustmentReason;
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
            foreignKeyName: "stock_adjustments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_adjustments_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      product_units: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          location_id: string;
          receipt_id: string;
          serial_no: string;
          colour: string | null;
          status: UnitStatus;
          order_id: string | null;
          adjustment_id: string | null;
          sold_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_units_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_units_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "stock_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_units_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_units_adjustment_id_fkey";
            columns: ["adjustment_id"];
            isOneToOne: false;
            referencedRelation: "stock_adjustments";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      empty_shortage_lines: {
        Row: {
          id: string;
          organization_id: string;
          trip_id: string;
          trip_no: string;
          location_id: string;
          order_id: string;
          order_no: string;
          order_date: string;
          customer_id: string | null;
          customer_name: string;
          returnable_item_id: string;
          returnable_name: string;
          returned_date: string | null;
          returned_at: string | null;
          expected: number;
          initial_returned: number;
          followup_returned: number;
          total_returned: number;
          outstanding: number;
          last_followup_at: string | null;
          completed_at: string | null;
        };
        Relationships: [];
      };
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
          customer_id: string | null;
          customer_name: string;
          customer_area: string | null;
          total_quantity: number;
          total_amount: number;
          has_returns: boolean;
          trip_id: string | null;
          trip_no: string | null;
          created_at: string;
          voided_at: string | null;
          customer_phone: string | null;
          handed_over_at: string | null;
          returnable_quantity: number;
          empties_returned: number | null;
          empties_outstanding: number | null;
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
      stock_summary: {
        Args: { p_organization_id: string; p_date: string; p_location_id?: string | null };
        Returns: {
          product_id: string;
          name: string;
          sku: string | null;
          unit: string;
          category: string | null;
          returnable: boolean;
          low_stock_threshold: number;
          tracks_serials: boolean;
          total_in: number;
          total_out: number;
          in_stock: number;
        }[];
      };
      empties_summary: {
        Args: { p_organization_id: string; p_date: string; p_location_id?: string | null };
        Returns: {
          returnable_item_id: string;
          name: string;
          trip_returns: number;
          followups: number;
          taken_by_supplier: number;
          adjustments: number;
          in_store: number;
        }[];
      };
      record_empty_exchange: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_exchange_date: string;
          p_returnable_item_id: string;
          p_quantity: number;
          p_crates_delivered: number | null;
          p_supplier_name: string | null;
          p_reference: string | null;
          p_received_by: string | null;
          p_note: string | null;
        };
        Returns: { id: string; exchange_no: string }[];
      };
      record_empties_followup: {
        Args: { p_line_id: string; p_quantity: number; p_received_date: string; p_note?: string | null };
        Returns: string;
      };
      void_empties_followup: {
        Args: { p_followup_id: string; p_reason: string };
        Returns: undefined;
      };
      create_order_batch: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_order_date: string;
          p_payment_type: PaymentType;
          p_note: string | null;
          p_orders: Json;
        };
        Returns: { id: string; order_no: string }[];
      };
      create_organization: {
        Args: {
          p_name: string;
          p_business_type?: string | null;
          p_tracks_returns?: boolean;
          p_tracks_serials?: boolean;
          p_selling_mode?: SellingMode;
          p_does_delivery?: boolean;
          p_sells_drinks?: boolean;
        };
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
          p_tracks_serials?: boolean;
          p_warranty_months?: number | null;
          p_category?: string | null;
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
      set_receipt_item_cost: { Args: { p_receipt_item_id: string; p_unit_cost: number }; Returns: undefined };
      correct_stock_receipt: {
        Args: {
          p_receipt_id: string;
          p_received_date: string;
          p_supplier_name: string | null;
          p_reference: string | null;
          p_note: string | null;
          p_items: Json;
          p_reason: string;
        };
        Returns: undefined;
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
          p_customer_id: string | null;
          p_payment_type: PaymentType;
          p_note: string | null;
          p_items: Json;
          p_handed_over?: boolean;
          p_buyer_name?: string | null;
          p_buyer_phone?: string | null;
        };
        Returns: { id: string; order_no: string }[];
      };
      update_order: {
        Args: {
          p_order_id: string;
          p_order_date: string;
          p_customer_id: string | null;
          p_payment_type: PaymentType;
          p_note: string | null;
          p_items: Json;
          p_buyer_name?: string | null;
          p_buyer_phone?: string | null;
        };
        Returns: undefined;
      };
      cancel_order: { Args: { p_order_id: string }; Returns: undefined };
      hand_over_order: { Args: { p_order_id: string }; Returns: undefined };
      set_business_features: {
        Args: {
          p_organization_id: string;
          p_tracks_returns: boolean;
          p_tracks_serials: boolean;
          p_selling_mode?: SellingMode | null;
          p_does_delivery?: boolean | null;
          p_sells_drinks?: boolean | null;
        };
        Returns: undefined;
      };
      record_stock_delivery: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_received_date: string;
          p_supplier_name: string | null;
          p_reference: string | null;
          p_note: string | null;
          p_items: Json;
          p_empties_given?: number;
          p_returnable_item_id?: string | null;
        };
        Returns: { id: string; receipt_no: string; exchange_no: string | null }[];
      };
      record_customer_empties_return: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_return_date: string;
          p_returnable_item_id: string;
          p_customer_id: string;
          p_quantity: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      record_stock_adjustment: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_adjustment_date: string;
          p_product_id: string;
          p_direction: "add" | "subtract";
          p_quantity: number | null;
          p_reason: StockAdjustmentReason;
          p_note: string | null;
          p_unit_ids?: string[] | null;
        };
        Returns: string;
      };
      void_stock_adjustment: { Args: { p_adjustment_id: string; p_reason: string }; Returns: undefined };
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
      create_dispatch_trip_with_crew: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_dispatch_date: string;
          p_driver_id: string;
          p_note: string | null;
          p_order_ids: string[];
          p_worker_ids: string[];
        };
        Returns: { id: string; trip_no: string }[];
      };
      save_dispatch_worker: {
        Args: {
          p_organization_id: string;
          p_worker_id: string | null;
          p_name: string;
          p_role: "driver" | "loader";
          p_phone: string | null;
        };
        Returns: string;
      };
      set_dispatch_worker_active: { Args: { p_worker_id: string; p_is_active: boolean }; Returns: undefined };
      set_trip_loaders: { Args: { p_trip_id: string; p_worker_ids: string[] }; Returns: undefined };
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
      correct_order: {
        Args: { p_order_id: string; p_items: { product_id: string; quantity: number }[]; p_reason: string };
        Returns: undefined;
      };
      set_depot_trade: {
        Args: { p_organization_id: string; p_trade: "drinks" | "goods"; p_returnable_name?: string | null; p_has_returnables?: boolean };
        Returns: undefined;
      };
      save_product_order: {
        Args: { p_organization_id: string; p_product_ids: string[] };
        Returns: undefined;
      };
      correct_returnable_adjustment: {
        Args: { p_adjustment_id: string; p_quantity: number; p_reason: string };
        Returns: undefined;
      };
      set_opening_empties: {
        Args: {
          p_organization_id: string;
          p_location_id: string;
          p_returnable_item_id: string;
          p_quantity: number;
          p_date: string;
        };
        Returns: string;
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
          adjusted: number;
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

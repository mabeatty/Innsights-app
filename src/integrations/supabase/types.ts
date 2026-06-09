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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ada_line_items: {
        Row: {
          brand_id: string | null
          id: string
          item_id: string | null
          quantity_per_room: number | null
        }
        Insert: {
          brand_id?: string | null
          id?: string
          item_id?: string | null
          quantity_per_room?: number | null
        }
        Update: {
          brand_id?: string | null
          id?: string
          item_id?: string | null
          quantity_per_room?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ada_line_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ada_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          alert_type: string
          created_at: string
          enabled: boolean
          id: string
          org_id: string
          threshold_value: number | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id: string
          threshold_value?: number | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id?: string
          threshold_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          dismissed_by: string | null
          id: string
          is_read: boolean
          message: string
          project_id: string
          read_by: string[]
          resolved_at: string | null
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
          is_read?: boolean
          message: string
          project_id: string
          read_by?: string[]
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          dismissed_by?: string | null
          id?: string
          is_read?: boolean
          message?: string
          project_id?: string
          read_by?: string[]
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bathroom_type_line_items: {
        Row: {
          bathroom_type_id: string
          id: string
          item_id: string
          quantity_per_room: number
        }
        Insert: {
          bathroom_type_id: string
          id?: string
          item_id: string
          quantity_per_room?: number
        }
        Update: {
          bathroom_type_id?: string
          id?: string
          item_id?: string
          quantity_per_room?: number
        }
        Relationships: [
          {
            foreignKeyName: "bathroom_type_line_items_bathroom_type_id_fkey"
            columns: ["bathroom_type_id"]
            isOneToOne: false
            referencedRelation: "bathroom_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bathroom_type_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bathroom_types: {
        Row: {
          brand_id: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bathroom_types_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      bookkeeping_contacts: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookkeeping_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          code: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          code: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          code?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      budget_transactions: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string
          division_name: string
          division_number: string
          document_url: string | null
          draw_id: string | null
          id: string
          invoice_id: string | null
          net_amount: number
          notes: string | null
          payee: string
          project_id: string
          retainage_amount: number
          retainage_percent: number
          status: string
          transaction_group_id: string | null
          transaction_number: number
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          description?: string
          division_name: string
          division_number: string
          document_url?: string | null
          draw_id?: string | null
          id?: string
          invoice_id?: string | null
          net_amount?: number
          notes?: string | null
          payee?: string
          project_id: string
          retainage_amount?: number
          retainage_percent?: number
          status?: string
          transaction_group_id?: string | null
          transaction_number: number
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string
          division_name?: string
          division_number?: string
          document_url?: string | null
          draw_id?: string | null
          id?: string
          invoice_id?: string | null
          net_amount?: number
          notes?: string | null
          payee?: string
          project_id?: string
          retainage_amount?: number
          retainage_percent?: number
          status?: string
          transaction_group_id?: string | null
          transaction_number?: number
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_transactions_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draw_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_cash_flow: {
        Row: {
          created_at: string
          draw_amount: number
          id: string
          month_year: string
          notes: string | null
          project_id: string
          projected_spend: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          draw_amount?: number
          id?: string
          month_year?: string
          notes?: string | null
          project_id: string
          projected_spend?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          draw_amount?: number
          id?: string
          month_year?: string
          notes?: string | null
          project_id?: string
          projected_spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_cash_flow_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_debt_tranches: {
        Row: {
          amortization_schedule: string
          created_at: string
          extension_options: string | null
          id: string
          index_name: string | null
          interest_rate: number
          lender_name: string
          loan_amount: number
          loan_term: number
          loan_type: string
          maturity_date: string | null
          notes: string | null
          origination_fee: number
          project_id: string
          rate_type: string
          required_reserves: string | null
          spread: number | null
          updated_at: string
        }
        Insert: {
          amortization_schedule?: string
          created_at?: string
          extension_options?: string | null
          id?: string
          index_name?: string | null
          interest_rate?: number
          lender_name?: string
          loan_amount?: number
          loan_term?: number
          loan_type?: string
          maturity_date?: string | null
          notes?: string | null
          origination_fee?: number
          project_id: string
          rate_type?: string
          required_reserves?: string | null
          spread?: number | null
          updated_at?: string
        }
        Update: {
          amortization_schedule?: string
          created_at?: string
          extension_options?: string | null
          id?: string
          index_name?: string | null
          interest_rate?: number
          lender_name?: string
          loan_amount?: number
          loan_term?: number
          loan_type?: string
          maturity_date?: string | null
          notes?: string | null
          origination_fee?: number
          project_id?: string
          rate_type?: string
          required_reserves?: string | null
          spread?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_debt_tranches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_equity_sources: {
        Row: {
          created_at: string
          equity_called: number
          equity_type: string
          id: string
          notes: string | null
          preferred_return: number | null
          project_id: string
          promote_structure: string | null
          source_name: string
          total_commitment: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          equity_called?: number
          equity_type?: string
          id?: string
          notes?: string | null
          preferred_return?: number | null
          project_id: string
          promote_structure?: string | null
          source_name?: string
          total_commitment?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          equity_called?: number
          equity_type?: string
          id?: string
          notes?: string | null
          preferred_return?: number | null
          project_id?: string
          promote_structure?: string | null
          source_name?: string
          total_commitment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_equity_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_investors: {
        Row: {
          created_at: string
          equity_source_id: string | null
          id: string
          investor_name: string
          notes: string | null
          project_id: string
          total_called: number
          total_commitment: number
          total_received: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          equity_source_id?: string | null
          id?: string
          investor_name?: string
          notes?: string | null
          project_id: string
          total_called?: number
          total_commitment?: number
          total_received?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          equity_source_id?: string | null
          id?: string
          investor_name?: string
          notes?: string | null
          project_id?: string
          total_called?: number
          total_commitment?: number
          total_received?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_investors_equity_source_id_fkey"
            columns: ["equity_source_id"]
            isOneToOne: false
            referencedRelation: "capital_equity_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_investors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          amount: number
          co_number: number
          created_at: string
          date: string
          description: string
          division_name: string
          division_number: string
          document_url: string | null
          id: string
          notes: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          co_number: number
          created_at?: string
          date?: string
          description?: string
          division_name?: string
          division_number: string
          document_url?: string | null
          id?: string
          notes?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          co_number?: number
          created_at?: string
          date?: string
          description?: string
          division_name?: string
          division_number?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string | null
          created_at: string
          id: string
          is_custom: boolean
          org_id: string
        }
        Insert: {
          account_code?: string
          account_name?: string
          account_type?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean
          org_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_project_access: {
        Row: {
          created_at: string
          id: string
          member_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultant_project_access_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_history: {
        Row: {
          backup_url: string | null
          created_at: string
          draw_month: string
          draw_number: number
          id: string
          notes: string | null
          project_id: string
          snapshot_json: Json
          status: string
          submission_date: string
          total_amount: number
        }
        Insert: {
          backup_url?: string | null
          created_at?: string
          draw_month?: string
          draw_number: number
          id?: string
          notes?: string | null
          project_id: string
          snapshot_json?: Json
          status?: string
          submission_date?: string
          total_amount?: number
        }
        Update: {
          backup_url?: string | null
          created_at?: string
          draw_month?: string
          draw_number?: number
          id?: string
          notes?: string | null
          project_id?: string
          snapshot_json?: Json
          status?: string
          submission_date?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "draw_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_report_comments: {
        Row: {
          comment_text: string
          created_at: string
          expense_report_id: string
          id: string
          user_id: string
        }
        Insert: {
          comment_text?: string
          created_at?: string
          expense_report_id: string
          id?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          expense_report_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_report_comments_expense_report_id_fkey"
            columns: ["expense_report_id"]
            isOneToOne: false
            referencedRelation: "expense_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          month_year: string
          org_id: string
          status: string
          submitted_at: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          month_year?: string
          org_id: string
          status?: string
          submitted_at?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          month_year?: string
          org_id?: string
          status?: string
          submitted_at?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          created_at: string
          delivery_method: string
          generated_by: string
          id: string
          project_id: string
          recipients: string[] | null
          report_period_end: string
          report_period_start: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          delivery_method?: string
          generated_by: string
          id?: string
          project_id: string
          recipients?: string[] | null
          report_period_end: string
          report_period_start: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          delivery_method?: string
          generated_by?: string
          id?: string
          project_id?: string
          recipients?: string[] | null
          report_period_end?: string
          report_period_start?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      global_vendor_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_vendor_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_vendor_projects_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "global_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      global_vendors: {
        Row: {
          category: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          markets: string | null
          notes: string | null
          org_id: string
          performance_rating: number
          phone: string | null
          updated_at: string
          vendor_name: string
        }
        Insert: {
          category: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          markets?: string | null
          notes?: string | null
          org_id: string
          performance_rating?: number
          phone?: string | null
          updated_at?: string
          vendor_name: string
        }
        Update: {
          category?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          markets?: string | null
          notes?: string | null
          org_id?: string
          performance_rating?: number
          phone?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string
          id: string
          integration_key: string
          org_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_key: string
          org_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_key?: string
          org_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_documents: {
        Row: {
          created_at: string
          id: string
          link: string
          name: string
          notes: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          link: string
          name: string
          notes?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string
          name?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_positions: {
        Row: {
          committed: number
          contact_name: string | null
          contributed: number
          created_at: string
          distributed: number
          id: string
          investing_entity: string
          notes: string | null
          ownership_pct: number
          project_id: string
          source: string
          unreturned_capital: number
          updated_at: string
        }
        Insert: {
          committed?: number
          contact_name?: string | null
          contributed?: number
          created_at?: string
          distributed?: number
          id?: string
          investing_entity?: string
          notes?: string | null
          ownership_pct?: number
          project_id: string
          source?: string
          unreturned_capital?: number
          updated_at?: string
        }
        Update: {
          committed?: number
          contact_name?: string | null
          contributed?: number
          created_at?: string
          distributed?: number
          id?: string
          investing_entity?: string
          notes?: string | null
          ownership_pct?: number
          project_id?: string
          source?: string
          unreturned_capital?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_positions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_audit_trail: {
        Row: {
          action: string
          created_at: string
          id: string
          invoice_id: string
          metadata: Json | null
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          invoice_id: string
          metadata?: Json | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          invoice_id?: string
          metadata?: Json | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_audit_trail_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          invoice_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          invoice_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_comments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_approvals: {
        Row: {
          approver_id: string | null
          approver_role: string
          created_at: string
          decided_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          status: string
        }
        Insert: {
          approver_id?: string | null
          approver_role: string
          created_at?: string
          decided_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          status?: string
        }
        Update: {
          approver_id?: string | null
          approver_role?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_approvals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      project_approvers: {
        Row: {
          approver_id: string | null
          created_at: string
          id: string
          project_id: string
          role: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          id?: string
          project_id: string
          role: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_approvers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          ai_extracted_fields: Json | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          budget_line_item: string | null
          cost_type: string | null
          created_at: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          more_info_request: string | null
          needs_review: boolean
          notes: string | null
          organization_id: string
          partial_approved_amount: number | null
          pdf_path: string | null
          pdf_url: string | null
          project_id: string | null
          rejection_reason: string | null
          routed_at: string | null
          routed_to: string | null
          routed_to_email: string | null
          source: string
          status: string
          submitted_at: string
          submitted_by: string | null
          submitted_by_email: string | null
          type: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          ai_extracted_fields?: Json | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          budget_line_item?: string | null
          cost_type?: string | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          more_info_request?: string | null
          needs_review?: boolean
          notes?: string | null
          organization_id: string
          partial_approved_amount?: number | null
          pdf_path?: string | null
          pdf_url?: string | null
          project_id?: string | null
          rejection_reason?: string | null
          routed_at?: string | null
          routed_to?: string | null
          routed_to_email?: string | null
          source?: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_email?: string | null
          type?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          ai_extracted_fields?: Json | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          budget_line_item?: string | null
          cost_type?: string | null
          created_at?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          more_info_request?: string | null
          needs_review?: boolean
          notes?: string | null
          organization_id?: string
          partial_approved_amount?: number | null
          pdf_path?: string | null
          pdf_url?: string | null
          project_id?: string | null
          rejection_reason?: string | null
          routed_at?: string | null
          routed_to?: string | null
          routed_to_email?: string | null
          source?: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_email?: string | null
          type?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          brand_id: string
          category: Database["public"]["Enums"]["item_category"]
          id: string
          item_number: string
          name: string
          unit: string
          unit_price: number
        }
        Insert: {
          brand_id: string
          category: Database["public"]["Enums"]["item_category"]
          id?: string
          item_number: string
          name: string
          unit?: string
          unit_price?: number
        }
        Update: {
          brand_id?: string
          category?: Database["public"]["Enums"]["item_category"]
          id?: string
          item_number?: string
          name?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          invoice_id: string | null
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_read?: boolean
          link?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          access_level: string
          created_at: string | null
          expense_role: string | null
          id: string
          investment_access: boolean
          organization_id: string | null
          role: string | null
          supervisor_id: string | null
          user_id: string | null
        }
        Insert: {
          access_level?: string
          created_at?: string | null
          expense_role?: string | null
          id?: string
          investment_access?: boolean
          organization_id?: string | null
          role?: string | null
          supervisor_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_level?: string
          created_at?: string | null
          expense_role?: string | null
          id?: string
          investment_access?: boolean
          organization_id?: string | null
          role?: string | null
          supervisor_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      photo_album_photos: {
        Row: {
          album_id: string
          created_at: string
          file_name: string
          id: string
          project_id: string
          sort_order: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          album_id: string
          created_at?: string
          file_name?: string
          id?: string
          project_id: string
          sort_order?: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          album_id?: string
          created_at?: string
          file_name?: string
          id?: string
          project_id?: string
          sort_order?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "photo_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_album_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_albums: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_albums_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_accounts: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          institution_name: string
          mask: string | null
          name: string
          official_name: string | null
          org_id: string
          plaid_account_id: string
          subtype: string | null
          type: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          institution_name?: string
          mask?: string | null
          name?: string
          official_name?: string | null
          org_id: string
          plaid_account_id: string
          subtype?: string | null
          type?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          institution_name?: string
          mask?: string | null
          name?: string
          official_name?: string | null
          org_id?: string
          plaid_account_id?: string
          subtype?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "plaid_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          institution_id: string
          institution_name: string
          item_id: string
          last_synced: string | null
          org_id: string
          status: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          institution_id?: string
          institution_name?: string
          item_id: string
          last_synced?: string | null
          org_id: string
          status?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          institution_id?: string
          institution_name?: string
          item_id?: string
          last_synced?: string | null
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_transactions: {
        Row: {
          account_id: string | null
          amount: number
          assigned_to_user_id: string | null
          assignment_type: string | null
          budget_line_division: string | null
          cardholder_user_id: string | null
          chart_of_accounts_id: string | null
          created_at: string
          date: string
          description: string | null
          expense_report_id: string | null
          id: string
          merchant_name: string
          notes: string | null
          org_id: string
          plaid_category: string | null
          plaid_item_id: string | null
          plaid_transaction_id: string | null
          project_id: string | null
          receipt_url: string | null
          status: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          assigned_to_user_id?: string | null
          assignment_type?: string | null
          budget_line_division?: string | null
          cardholder_user_id?: string | null
          chart_of_accounts_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          expense_report_id?: string | null
          id?: string
          merchant_name?: string
          notes?: string | null
          org_id: string
          plaid_category?: string | null
          plaid_item_id?: string | null
          plaid_transaction_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          assigned_to_user_id?: string | null
          assignment_type?: string | null
          budget_line_division?: string | null
          cardholder_user_id?: string | null
          chart_of_accounts_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          expense_report_id?: string | null
          id?: string
          merchant_name?: string
          notes?: string | null
          org_id?: string
          plaid_category?: string | null
          plaid_item_id?: string | null
          plaid_transaction_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_transactions_chart_of_accounts_id_fkey"
            columns: ["chart_of_accounts_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_expense_report_id_fkey"
            columns: ["expense_report_id"]
            isOneToOne: false
            referencedRelation: "expense_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_development_budget: {
        Row: {
          actual_amount: number
          budget_amount: number
          created_at: string
          id: string
          line_item: string
          notes: string | null
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          actual_amount?: number
          budget_amount?: number
          created_at?: string
          id?: string
          line_item: string
          notes?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          actual_amount?: number
          budget_amount?: number
          created_at?: string
          id?: string
          line_item?: string
          notes?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_development_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          first_name: string | null
          id: string
          is_treasury: boolean
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          first_name?: string | null
          id?: string
          is_treasury?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          first_name?: string | null
          id?: string
          is_treasury?: boolean
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_budget: {
        Row: {
          cost_type: string
          created_at: string
          division_name: string
          division_number: string
          id: string
          notes: string | null
          project_id: string
          scheduled_value: number
          updated_at: string
        }
        Insert: {
          cost_type: string
          created_at?: string
          division_name: string
          division_number: string
          id?: string
          notes?: string | null
          project_id: string
          scheduled_value?: number
          updated_at?: string
        }
        Update: {
          cost_type?: string
          created_at?: string
          division_name?: string
          division_number?: string
          id?: string
          notes?: string | null
          project_id?: string
          scheduled_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          added_by: string
          created_at: string
          document_name: string
          drive_url: string
          folder_name: string
          id: string
          project_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          document_name?: string
          drive_url?: string
          folder_name: string
          id?: string
          project_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          document_name?: string
          drive_url?: string
          folder_name?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_info: {
        Row: {
          architect: string | null
          city: string | null
          created_at: string
          entity_name: string | null
          general_contractor: string | null
          id: string
          interior_designer: string | null
          owner_email: string | null
          owner_name: string | null
          project_id: string
          project_status: string | null
          project_type: string | null
          property_name: string | null
          state: string | null
          street_address: string | null
          target_opening_date: string | null
          total_room_count: number | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          architect?: string | null
          city?: string | null
          created_at?: string
          entity_name?: string | null
          general_contractor?: string | null
          id?: string
          interior_designer?: string | null
          owner_email?: string | null
          owner_name?: string | null
          project_id: string
          project_status?: string | null
          project_type?: string | null
          property_name?: string | null
          state?: string | null
          street_address?: string | null
          target_opening_date?: string | null
          total_room_count?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          architect?: string | null
          city?: string | null
          created_at?: string
          entity_name?: string | null
          general_contractor?: string | null
          id?: string
          interior_designer?: string | null
          owner_email?: string | null
          owner_name?: string | null
          project_id?: string
          project_status?: string | null
          project_type?: string | null
          property_name?: string | null
          state?: string | null
          street_address?: string | null
          target_opening_date?: string | null
          total_room_count?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_info_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_public_area_items: {
        Row: {
          adjusted_quantity: number | null
          id: string
          item_id: string
          last_modified: string | null
          notes: string | null
          project_id: string
          public_area_type_id: string
          quantity_required: number
          takeoff_version_id: string | null
        }
        Insert: {
          adjusted_quantity?: number | null
          id?: string
          item_id: string
          last_modified?: string | null
          notes?: string | null
          project_id: string
          public_area_type_id: string
          quantity_required?: number
          takeoff_version_id?: string | null
        }
        Update: {
          adjusted_quantity?: number | null
          id?: string
          item_id?: string
          last_modified?: string | null
          notes?: string | null
          project_id?: string
          public_area_type_id?: string
          quantity_required?: number
          takeoff_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_public_area_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_public_area_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_public_area_items_public_area_type_id_fkey"
            columns: ["public_area_type_id"]
            isOneToOne: false
            referencedRelation: "public_area_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_public_area_items_takeoff_version_id_fkey"
            columns: ["takeoff_version_id"]
            isOneToOne: false
            referencedRelation: "takeoff_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brand_id: string
          clickup_list_id: string | null
          created_at: string
          hotel_name: string
          id: string
          name: string
          organization_id: string | null
          plaid_account_id: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          clickup_list_id?: string | null
          created_at?: string
          hotel_name: string
          id?: string
          name: string
          organization_id?: string | null
          plaid_account_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          clickup_list_id?: string | null
          created_at?: string
          hotel_name?: string
          id?: string
          name?: string
          organization_id?: string | null
          plaid_account_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_plaid_account_id_fkey"
            columns: ["plaid_account_id"]
            isOneToOne: false
            referencedRelation: "plaid_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      public_area_line_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string | null
          public_area_type_id: string | null
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          public_area_type_id?: string | null
          quantity?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string | null
          public_area_type_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_area_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_area_line_items_public_area_type_id_fkey"
            columns: ["public_area_type_id"]
            isOneToOne: false
            referencedRelation: "public_area_types"
            referencedColumns: ["id"]
          },
        ]
      }
      public_area_type_line_items: {
        Row: {
          id: string
          item_id: string
          public_area_type_id: string
          quantity: number
        }
        Insert: {
          id?: string
          item_id: string
          public_area_type_id: string
          quantity?: number
        }
        Update: {
          id?: string
          item_id?: string
          public_area_type_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_area_type_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_area_type_line_items_public_area_type_id_fkey"
            columns: ["public_area_type_id"]
            isOneToOne: false
            referencedRelation: "public_area_types"
            referencedColumns: ["id"]
          },
        ]
      }
      public_area_types: {
        Row: {
          brand_id: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_area_types_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_connections: {
        Row: {
          access_token: string
          company_name: string | null
          created_at: string
          id: string
          org_id: string
          realm_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          company_name?: string | null
          created_at?: string
          id?: string
          org_id: string
          realm_id: string
          refresh_token: string
          token_expires_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_name?: string | null
          created_at?: string
          id?: string
          org_id?: string
          realm_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_content_config: {
        Row: {
          created_at: string
          id: string
          include_budget_vs_actual: boolean
          include_cash_planning: boolean
          include_draw_status: boolean
          include_project_overview: boolean
          include_schedule_summary: boolean
          include_weekly_summaries: boolean
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          include_budget_vs_actual?: boolean
          include_cash_planning?: boolean
          include_draw_status?: boolean
          include_project_overview?: boolean
          include_schedule_summary?: boolean
          include_weekly_summaries?: boolean
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          include_budget_vs_actual?: boolean
          include_cash_planning?: boolean
          include_draw_status?: boolean
          include_project_overview?: boolean
          include_schedule_summary?: boolean
          include_weekly_summaries?: boolean
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_content_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      room_matrix_entries: {
        Row: {
          bathroom_type_id: string
          id: string
          is_ada: boolean | null
          project_id: string
          quantity: number
          room_type_id: string
        }
        Insert: {
          bathroom_type_id: string
          id?: string
          is_ada?: boolean | null
          project_id: string
          quantity?: number
          room_type_id: string
        }
        Update: {
          bathroom_type_id?: string
          id?: string
          is_ada?: boolean | null
          project_id?: string
          quantity?: number
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_matrix_entries_bathroom_type_id_fkey"
            columns: ["bathroom_type_id"]
            isOneToOne: false
            referencedRelation: "bathroom_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_matrix_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_matrix_entries_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_line_items: {
        Row: {
          id: string
          item_id: string
          quantity_per_room: number
          room_type_id: string
        }
        Insert: {
          id?: string
          item_id: string
          quantity_per_room?: number
          room_type_id: string
        }
        Update: {
          id?: string
          item_id?: string
          quantity_per_room?: number
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_line_items_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          brand_id: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_types_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_milestones: {
        Row: {
          actual_date: string | null
          created_at: string
          id: string
          is_custom: boolean
          name: string
          notes: string | null
          planned_date: string | null
          project_id: string
          status: string
          sub_phase_id: string
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean
          name: string
          notes?: string | null
          planned_date?: string | null
          project_id: string
          status?: string
          sub_phase_id: string
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          created_at?: string
          id?: string
          is_custom?: boolean
          name?: string
          notes?: string | null
          planned_date?: string | null
          project_id?: string
          status?: string
          sub_phase_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_milestones_sub_phase_id_fkey"
            columns: ["sub_phase_id"]
            isOneToOne: false
            referencedRelation: "schedule_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_phases: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          phase_name: string
          phase_number: number
          project_id: string
          start_date: string | null
          sub_phase_name: string
          sub_phase_number: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          phase_name: string
          phase_number: number
          project_id: string
          start_date?: string | null
          sub_phase_name: string
          sub_phase_number: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          phase_name?: string
          phase_number?: number
          project_id?: string
          start_date?: string | null
          sub_phase_name?: string
          sub_phase_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_report_config: {
        Row: {
          created_at: string
          day_of_month: number
          enabled: boolean
          id: string
          project_id: string
          recipients: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number
          enabled?: boolean
          id?: string
          project_id: string
          recipients?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number
          enabled?: boolean
          id?: string
          project_id?: string
          recipients?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_report_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_line_items: {
        Row: {
          adjusted_quantity: number | null
          bathroom_type_id: string | null
          id: string
          is_ada: boolean
          item_id: string
          last_modified: string | null
          notes: string | null
          project_id: string
          quantity_required: number
          room_type_id: string | null
          takeoff_version_id: string | null
        }
        Insert: {
          adjusted_quantity?: number | null
          bathroom_type_id?: string | null
          id?: string
          is_ada?: boolean
          item_id: string
          last_modified?: string | null
          notes?: string | null
          project_id: string
          quantity_required?: number
          room_type_id?: string | null
          takeoff_version_id?: string | null
        }
        Update: {
          adjusted_quantity?: number | null
          bathroom_type_id?: string | null
          id?: string
          is_ada?: boolean
          item_id?: string
          last_modified?: string | null
          notes?: string | null
          project_id?: string
          quantity_required?: number
          room_type_id?: string | null
          takeoff_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_line_items_bathroom_type_id_fkey"
            columns: ["bathroom_type_id"]
            isOneToOne: false
            referencedRelation: "bathroom_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_line_items_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_line_items_takeoff_version_id_fkey"
            columns: ["takeoff_version_id"]
            isOneToOne: false
            referencedRelation: "takeoff_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_versions: {
        Row: {
          created_at: string
          id: string
          project_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bid_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          project_id: string
          segment: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          project_id: string
          segment: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          project_id?: string
          segment?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bid_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_quotes: {
        Row: {
          award_date: string | null
          bid_item_id: string
          created_at: string
          final_quote_amount: number | null
          id: string
          notes: string | null
          round_1_amount: number | null
          round_1_ref: string | null
          round_1_url: string | null
          round_2_amount: number | null
          round_2_ref: string | null
          round_2_url: string | null
          round_3_amount: number | null
          round_3_ref: string | null
          round_3_url: string | null
          round_4_amount: number | null
          round_4_ref: string | null
          round_4_url: string | null
          updated_at: string
          vendor_name: string
          vendor_status: string
        }
        Insert: {
          award_date?: string | null
          bid_item_id: string
          created_at?: string
          final_quote_amount?: number | null
          id?: string
          notes?: string | null
          round_1_amount?: number | null
          round_1_ref?: string | null
          round_1_url?: string | null
          round_2_amount?: number | null
          round_2_ref?: string | null
          round_2_url?: string | null
          round_3_amount?: number | null
          round_3_ref?: string | null
          round_3_url?: string | null
          round_4_amount?: number | null
          round_4_ref?: string | null
          round_4_url?: string | null
          updated_at?: string
          vendor_name: string
          vendor_status?: string
        }
        Update: {
          award_date?: string | null
          bid_item_id?: string
          created_at?: string
          final_quote_amount?: number | null
          id?: string
          notes?: string | null
          round_1_amount?: number | null
          round_1_ref?: string | null
          round_1_url?: string | null
          round_2_amount?: number | null
          round_2_ref?: string | null
          round_2_url?: string | null
          round_3_amount?: number | null
          round_3_ref?: string | null
          round_3_url?: string | null
          round_4_amount?: number | null
          round_4_ref?: string | null
          round_4_url?: string | null
          updated_at?: string
          vendor_name?: string
          vendor_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_quotes_bid_item_id_fkey"
            columns: ["bid_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_bid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          project_id: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          project_id: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          project_id: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          project_id: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          project_id?: string
          report_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          report_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          report_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          content: string
          created_at: string
          created_by: string
          date_range_end: string
          date_range_start: string
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_consultant_project_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_investment_access: { Args: { _user_id: string }; Returns: boolean }
      is_consultant: { Args: { _user_id: string }; Returns: boolean }
      is_org_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      item_category:
        | "Furniture"
        | "Softgoods"
        | "Lighting"
        | "Artwork & Window Treatments"
        | "Bathroom"
        | "Equipment"
        | "Public Area"
      project_status: "Draft" | "Complete"
      project_type: "Development" | "Asset Management"
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
      item_category: [
        "Furniture",
        "Softgoods",
        "Lighting",
        "Artwork & Window Treatments",
        "Bathroom",
        "Equipment",
        "Public Area",
      ],
      project_status: ["Draft", "Complete"],
      project_type: ["Development", "Asset Management"],
    },
  },
} as const

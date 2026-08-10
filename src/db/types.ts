/**
 * Supabase database typings, including the sync-support columns
 * (updated_at, deleted_at) added in migration 00004.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type SyncCols = {
  updated_at: string;
  deleted_at: string | null;
};
type SyncColsInsert = {
  updated_at?: string;
  deleted_at?: string | null;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          units: 'kg' | 'lb';
          created_at: string;
        } & SyncCols;
        Insert: {
          id: string;
          display_name?: string | null;
          units?: 'kg' | 'lb';
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          muscle_group: string | null;
          user_id: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          name: string;
          muscle_group?: string | null;
          user_id?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['exercises']['Insert']>;
        Relationships: [];
      };
      workouts: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          title: string;
          template_id: string | null;
          note: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          user_id: string;
          started_at?: string;
          ended_at?: string | null;
          title: string;
          template_id?: string | null;
          note?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
        Relationships: [];
      };
      workout_exercises: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          note: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          note?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['workout_exercises']['Insert']>;
        Relationships: [];
      };
      sets: {
        Row: {
          id: string;
          workout_exercise_id: string;
          order_index: number;
          weight: number | null;
          reps: number | null;
          units: 'kg' | 'lb' | null;
          completed: boolean;
          completed_at: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          workout_exercise_id: string;
          order_index: number;
          weight?: number | null;
          reps?: number | null;
          units?: 'kg' | 'lb' | null;
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['sets']['Insert']>;
        Relationships: [];
      };
      personal_records: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          type: string;
          value: Json;
          achieved_at: string;
          workout_id: string | null;
          set_id: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          type: string;
          value: Json;
          achieved_at: string;
          workout_id?: string | null;
          set_id?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['personal_records']['Insert']>;
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          exercise_order: string[];
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          exercise_order: string[];
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['templates']['Insert']>;
        Relationships: [];
      };
      training_plans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          plan_type: 'weekly' | 'cycle';
          is_active: boolean;
          cycle_cursor: number;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          plan_type: 'weekly' | 'cycle';
          is_active?: boolean;
          cycle_cursor?: number;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['training_plans']['Insert']>;
        Relationships: [];
      };
      training_plan_slots: {
        Row: {
          id: string;
          plan_id: string;
          template_id: string | null;
          day_of_week: number | null;
          cycle_position: number | null;
          is_rest_day: boolean;
          label: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          plan_id: string;
          template_id?: string | null;
          day_of_week?: number | null;
          cycle_position?: number | null;
          is_rest_day?: boolean;
          label?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['training_plan_slots']['Insert']>;
        Relationships: [];
      };
      plan_presets: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tier: 'generic' | 'program';
          blurb: string | null;
          plan_type: 'weekly' | 'cycle';
          cycle_length: number | null;
          sort_order: number;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          tier: 'generic' | 'program';
          blurb?: string | null;
          plan_type: 'weekly' | 'cycle';
          cycle_length?: number | null;
          sort_order?: number;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['plan_presets']['Insert']>;
        Relationships: [];
      };
      plan_preset_templates: {
        Row: {
          id: string;
          preset_id: string;
          slug: string;
          name: string;
          sort_order: number;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          preset_id: string;
          slug: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['plan_preset_templates']['Insert']>;
        Relationships: [];
      };
      plan_preset_exercises: {
        Row: {
          id: string;
          preset_template_id: string;
          name: string;
          muscle_group: string | null;
          order_index: number;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          preset_template_id: string;
          name: string;
          muscle_group?: string | null;
          order_index: number;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['plan_preset_exercises']['Insert']>;
        Relationships: [];
      };
      plan_preset_slots: {
        Row: {
          id: string;
          preset_id: string;
          preset_template_id: string | null;
          day_of_week: number | null;
          cycle_position: number | null;
          is_rest_day: boolean;
          label: string | null;
          created_at: string;
        } & SyncCols;
        Insert: {
          id?: string;
          preset_id: string;
          preset_template_id?: string | null;
          day_of_week?: number | null;
          cycle_position?: number | null;
          is_rest_day?: boolean;
          label?: string | null;
          created_at?: string;
        } & SyncColsInsert;
        Update: Partial<Database['public']['Tables']['plan_preset_slots']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Exercise = Database['public']['Tables']['exercises']['Row'];
export type Workout = Database['public']['Tables']['workouts']['Row'];
export type WorkoutExercise = Database['public']['Tables']['workout_exercises']['Row'];
export type Set = Database['public']['Tables']['sets']['Row'];
export type PersonalRecord = Database['public']['Tables']['personal_records']['Row'];
export type Template = Database['public']['Tables']['templates']['Row'];
export type TrainingPlan = Database['public']['Tables']['training_plans']['Row'];
export type TrainingPlanSlot = Database['public']['Tables']['training_plan_slots']['Row'];
export type PlanPreset = Database['public']['Tables']['plan_presets']['Row'];
export type PlanPresetTemplate = Database['public']['Tables']['plan_preset_templates']['Row'];
export type PlanPresetExercise = Database['public']['Tables']['plan_preset_exercises']['Row'];
export type PlanPresetSlot = Database['public']['Tables']['plan_preset_slots']['Row'];

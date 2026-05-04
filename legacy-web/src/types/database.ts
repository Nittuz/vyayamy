export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          units: 'kg' | 'lb';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          units?: 'kg' | 'lb';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          units?: 'kg' | 'lb';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          muscle_group: string | null;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          muscle_group?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          muscle_group?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
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
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at?: string;
          ended_at?: string | null;
          title: string;
          template_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          ended_at?: string | null;
          title?: string;
          template_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workouts_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'templates';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_exercises: {
        Row: {
          id: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          exercise_id: string;
          order_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          exercise_id?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      sets: {
        Row: {
          id: string;
          workout_exercise_id: string;
          order_index: number;
          weight: number | null;
          reps: number | null;
          completed: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workout_exercise_id: string;
          order_index: number;
          weight?: number | null;
          reps?: number | null;
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workout_exercise_id?: string;
          order_index?: number;
          weight?: number | null;
          reps?: number | null;
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sets_workout_exercise_id_fkey';
            columns: ['workout_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'workout_exercises';
            referencedColumns: ['id'];
          },
        ];
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
        };
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
        };
        Update: {
          id?: string;
          user_id?: string;
          exercise_id?: string;
          type?: string;
          value?: Json;
          achieved_at?: string;
          workout_id?: string | null;
          set_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_records_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_records_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          exercise_order: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          exercise_order: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          exercise_order?: string[];
          created_at?: string;
          updated_at?: string;
        };
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
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          plan_type: 'weekly' | 'cycle';
          is_active?: boolean;
          cycle_cursor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          plan_type?: 'weekly' | 'cycle';
          is_active?: boolean;
          cycle_cursor?: number;
          created_at?: string;
          updated_at?: string;
        };
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
        };
        Insert: {
          id?: string;
          plan_id: string;
          template_id?: string | null;
          day_of_week?: number | null;
          cycle_position?: number | null;
          is_rest_day?: boolean;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          template_id?: string | null;
          day_of_week?: number | null;
          cycle_position?: number | null;
          is_rest_day?: boolean;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'training_plan_slots_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'training_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'training_plan_slots_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'templates';
            referencedColumns: ['id'];
          },
        ];
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

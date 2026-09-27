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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      fixtures: {
        Row: {
          away_team_fdr: number | null
          away_team_id: number | null
          gameweek: number
          home_team_fdr: number | null
          home_team_id: number | null
          id: number
          is_finished: boolean | null
          match_date: string | null
        }
        Insert: {
          away_team_fdr?: number | null
          away_team_id?: number | null
          gameweek: number
          home_team_fdr?: number | null
          home_team_id?: number | null
          id?: number
          is_finished?: boolean | null
          match_date?: string | null
        }
        Update: {
          away_team_fdr?: number | null
          away_team_id?: number | null
          gameweek?: number
          home_team_fdr?: number | null
          home_team_id?: number | null
          id?: number
          is_finished?: boolean | null
          match_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      gameweek_player_stats: {
        Row: {
          calculated_xp: number | null
          clean_sheet_probability: number | null
          expected_conceded_goals: number | null
          expected_saves: number | null
          gameweek: number
          id: number
          player_id: number | null
          value_score: number | null
          xa_per_90: number | null
          xg_per_90: number | null
        }
        Insert: {
          calculated_xp?: number | null
          clean_sheet_probability?: number | null
          expected_conceded_goals?: number | null
          expected_saves?: number | null
          gameweek: number
          id?: number
          player_id?: number | null
          value_score?: number | null
          xa_per_90?: number | null
          xg_per_90?: number | null
        }
        Update: {
          calculated_xp?: number | null
          clean_sheet_probability?: number | null
          expected_conceded_goals?: number | null
          expected_saves?: number | null
          gameweek?: number
          id?: number
          player_id?: number | null
          value_score?: number | null
          xa_per_90?: number | null
          xg_per_90?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gameweek_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          current_price: number
          full_name: string
          id: number
          is_available: boolean | null
          is_penalty_taker: boolean | null
          is_set_piece_taker: boolean | null
          position: string | null
          team_id: number | null
        }
        Insert: {
          current_price: number
          full_name: string
          id?: number
          is_available?: boolean | null
          is_penalty_taker?: boolean | null
          is_set_piece_taker?: boolean | null
          position?: string | null
          team_id?: number | null
        }
        Update: {
          current_price?: number
          full_name?: string
          id?: number
          is_available?: boolean | null
          is_penalty_taker?: boolean | null
          is_set_piece_taker?: boolean | null
          position?: string | null
          team_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_availability: {
        Row: {
          availability_probability: number
          availability_type: string | null
          checked_at: string | null
          detail_source_label: string | null
          detail_source_updated_at: string | null
          detail_source_url: string | null
          expected_return: string | null
          injury_date: string | null
          player_id: number
          reason: string | null
          run_id: string
          source_reason: string | null
          source_url: string | null
          suspension_end: string | null
          suspension_fixture: string | null
        }
        Insert: {
          availability_probability: number
          availability_type?: string | null
          checked_at?: string | null
          detail_source_label?: string | null
          detail_source_updated_at?: string | null
          detail_source_url?: string | null
          expected_return?: string | null
          injury_date?: string | null
          player_id: number
          reason?: string | null
          run_id: string
          source_reason?: string | null
          source_url?: string | null
          suspension_end?: string | null
          suspension_fixture?: string | null
        }
        Update: {
          availability_probability?: number
          availability_type?: string | null
          checked_at?: string | null
          detail_source_label?: string | null
          detail_source_updated_at?: string | null
          detail_source_url?: string | null
          expected_return?: string | null
          injury_date?: string | null
          player_id?: number
          reason?: string | null
          run_id?: string
          source_reason?: string | null
          source_url?: string | null
          suspension_end?: string | null
          suspension_fixture?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_availability_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_backtest_players: {
        Row: {
          abs_error: number | null
          actual_minutes: number | null
          actual_points: number | null
          actual_rank: number | null
          band_status: string | null
          data_confidence: string | null
          error_component: string | null
          gameweek: number
          notes: string | null
          outside_band_distance: number | null
          p25: number | null
          p75: number | null
          p90: number | null
          player_id: number
          player_name: string | null
          predicted_minutes: number | null
          predicted_rank: number | null
          predicted_xfp: number | null
          prediction_error: number | null
          prediction_mode: string
          run_id: string | null
          six_plus_probability: number | null
          snapshot_at: string | null
          updated_at: string
        }
        Insert: {
          abs_error?: number | null
          actual_minutes?: number | null
          actual_points?: number | null
          actual_rank?: number | null
          band_status?: string | null
          data_confidence?: string | null
          error_component?: string | null
          gameweek: number
          notes?: string | null
          outside_band_distance?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id: number
          player_name?: string | null
          predicted_minutes?: number | null
          predicted_rank?: number | null
          predicted_xfp?: number | null
          prediction_error?: number | null
          prediction_mode: string
          run_id?: string | null
          six_plus_probability?: number | null
          snapshot_at?: string | null
          updated_at?: string
        }
        Update: {
          abs_error?: number | null
          actual_minutes?: number | null
          actual_points?: number | null
          actual_rank?: number | null
          band_status?: string | null
          data_confidence?: string | null
          error_component?: string | null
          gameweek?: number
          notes?: string | null
          outside_band_distance?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id?: number
          player_name?: string | null
          predicted_minutes?: number | null
          predicted_rank?: number | null
          predicted_xfp?: number | null
          prediction_error?: number | null
          prediction_mode?: string
          run_id?: string | null
          six_plus_probability?: number | null
          snapshot_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_backtest_players_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_backtest_weeks: {
        Row: {
          actual_count: number | null
          average_band_width: number | null
          average_outside_distance: number | null
          band_calibration_gap: number | null
          band_hit_rate: number | null
          best_captain_points: number | null
          captain_points: number | null
          core_band_calibration_gap: number | null
          core_band_hit_rate: number | null
          data_confidence: string | null
          fp_bias: number | null
          fp_mae: number | null
          fp_rmse: number | null
          fp_sample: number | null
          gameweek: number
          minute_mae: number | null
          minute_sample: number | null
          model_version: string | null
          notes: string | null
          optimal_xi_points: number | null
          prediction_count: number | null
          prediction_mode: string
          recommended_xi_points: number | null
          run_id: string | null
          six_plus_brier: number | null
          six_plus_calibration_error: number | null
          snapshot_at: string | null
          spearman: number | null
          status: string
          top25_hit_rate: number | null
          training_through_gameweek: number | null
          updated_at: string
        }
        Insert: {
          actual_count?: number | null
          average_band_width?: number | null
          average_outside_distance?: number | null
          band_calibration_gap?: number | null
          band_hit_rate?: number | null
          best_captain_points?: number | null
          captain_points?: number | null
          core_band_calibration_gap?: number | null
          core_band_hit_rate?: number | null
          data_confidence?: string | null
          fp_bias?: number | null
          fp_mae?: number | null
          fp_rmse?: number | null
          fp_sample?: number | null
          gameweek: number
          minute_mae?: number | null
          minute_sample?: number | null
          model_version?: string | null
          notes?: string | null
          optimal_xi_points?: number | null
          prediction_count?: number | null
          prediction_mode: string
          recommended_xi_points?: number | null
          run_id?: string | null
          six_plus_brier?: number | null
          six_plus_calibration_error?: number | null
          snapshot_at?: string | null
          spearman?: number | null
          status?: string
          top25_hit_rate?: number | null
          training_through_gameweek?: number | null
          updated_at?: string
        }
        Update: {
          actual_count?: number | null
          average_band_width?: number | null
          average_outside_distance?: number | null
          band_calibration_gap?: number | null
          band_hit_rate?: number | null
          best_captain_points?: number | null
          captain_points?: number | null
          core_band_calibration_gap?: number | null
          core_band_hit_rate?: number | null
          data_confidence?: string | null
          fp_bias?: number | null
          fp_mae?: number | null
          fp_rmse?: number | null
          fp_sample?: number | null
          gameweek?: number
          minute_mae?: number | null
          minute_sample?: number | null
          model_version?: string | null
          notes?: string | null
          optimal_xi_points?: number | null
          prediction_count?: number | null
          prediction_mode?: string
          recommended_xi_points?: number | null
          run_id?: string | null
          six_plus_brier?: number | null
          six_plus_calibration_error?: number | null
          snapshot_at?: string | null
          spearman?: number | null
          status?: string
          top25_hit_rate?: number | null
          training_through_gameweek?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_backtest_weeks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_goal_distribution_config: {
        Row: {
          active: boolean
          alpha_method: string
          alpha_scale: number
          created_at: string
          distribution: string
          notes: string | null
          trained_through: number
          version: string
        }
        Insert: {
          active?: boolean
          alpha_method: string
          alpha_scale: number
          created_at?: string
          distribution: string
          notes?: string | null
          trained_through: number
          version: string
        }
        Update: {
          active?: boolean
          alpha_method?: string
          alpha_scale?: number
          created_at?: string
          distribution?: string
          notes?: string | null
          trained_through?: number
          version?: string
        }
        Relationships: []
      }
      scout_learning_log: {
        Row: {
          after_gameweek: number
          applied_adjustment: number | null
          component: string
          detected_at: string
          evidence: string | null
          guardrail: string | null
          id: number
          notes: string | null
          proposed_adjustment: number | null
          sample_size: number | null
          segment: string | null
          signal: string
          status: string
          summary_tr: string | null
        }
        Insert: {
          after_gameweek: number
          applied_adjustment?: number | null
          component: string
          detected_at?: string
          evidence?: string | null
          guardrail?: string | null
          id?: number
          notes?: string | null
          proposed_adjustment?: number | null
          sample_size?: number | null
          segment?: string | null
          signal: string
          status?: string
          summary_tr?: string | null
        }
        Update: {
          after_gameweek?: number
          applied_adjustment?: number | null
          component?: string
          detected_at?: string
          evidence?: string | null
          guardrail?: string | null
          id?: number
          notes?: string | null
          proposed_adjustment?: number | null
          sample_size?: number | null
          segment?: string | null
          signal?: string
          status?: string
          summary_tr?: string | null
        }
        Relationships: []
      }
      scout_match_history: {
        Row: {
          away_goals: number | null
          away_team_id: number | null
          away_team_name: string
          fantasy_closure: string | null
          gameweek: number
          home_goals: number | null
          home_team_id: number | null
          home_team_name: string
          kickoff_at: string | null
          match_id: number
          match_status: string | null
          source_updated_at: string
        }
        Insert: {
          away_goals?: number | null
          away_team_id?: number | null
          away_team_name: string
          fantasy_closure?: string | null
          gameweek: number
          home_goals?: number | null
          home_team_id?: number | null
          home_team_name: string
          kickoff_at?: string | null
          match_id: number
          match_status?: string | null
          source_updated_at?: string
        }
        Update: {
          away_goals?: number | null
          away_team_id?: number | null
          away_team_name?: string
          fantasy_closure?: string | null
          gameweek?: number
          home_goals?: number | null
          home_team_id?: number | null
          home_team_name?: string
          kickoff_at?: string | null
          match_id?: number
          match_status?: string | null
          source_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_match_history_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_match_history_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_match_predictions: {
        Row: {
          away_cs_probability: number | null
          away_team_id: number | null
          away_win_probability: number | null
          away_xg: number | null
          btts_probability: number | null
          draw_probability: number | null
          gameweek: number
          home_cs_probability: number | null
          home_team_id: number | null
          home_win_probability: number | null
          home_xg: number | null
          kickoff_at: string | null
          match_id: number
          method: string | null
          model_note: string | null
          over15_probability: number | null
          over25_probability: number | null
          over35_probability: number | null
          run_id: string
          second_score: string | null
          second_score_probability: number | null
          third_score: string | null
          third_score_probability: number | null
          three_goal_margin_probability: number | null
          top_score: string | null
          top_score_probability: number | null
        }
        Insert: {
          away_cs_probability?: number | null
          away_team_id?: number | null
          away_win_probability?: number | null
          away_xg?: number | null
          btts_probability?: number | null
          draw_probability?: number | null
          gameweek: number
          home_cs_probability?: number | null
          home_team_id?: number | null
          home_win_probability?: number | null
          home_xg?: number | null
          kickoff_at?: string | null
          match_id: number
          method?: string | null
          model_note?: string | null
          over15_probability?: number | null
          over25_probability?: number | null
          over35_probability?: number | null
          run_id: string
          second_score?: string | null
          second_score_probability?: number | null
          third_score?: string | null
          third_score_probability?: number | null
          three_goal_margin_probability?: number | null
          top_score?: string | null
          top_score_probability?: number | null
        }
        Update: {
          away_cs_probability?: number | null
          away_team_id?: number | null
          away_win_probability?: number | null
          away_xg?: number | null
          btts_probability?: number | null
          draw_probability?: number | null
          gameweek?: number
          home_cs_probability?: number | null
          home_team_id?: number | null
          home_win_probability?: number | null
          home_xg?: number | null
          kickoff_at?: string | null
          match_id?: number
          method?: string | null
          model_note?: string | null
          over15_probability?: number | null
          over25_probability?: number | null
          over35_probability?: number | null
          run_id?: string
          second_score?: string | null
          second_score_probability?: number | null
          third_score?: string | null
          third_score_probability?: number | null
          three_goal_margin_probability?: number | null
          top_score?: string | null
          top_score_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_match_predictions_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_match_predictions_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_match_predictions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_model_runs: {
        Row: {
          gameweek: number
          generated_at: string
          id: string
          is_current: boolean
          model_version: string
          notes: string | null
          simulation_count: number
          source_updated_at: string | null
          status: string
        }
        Insert: {
          gameweek: number
          generated_at?: string
          id?: string
          is_current?: boolean
          model_version: string
          notes?: string | null
          simulation_count?: number
          source_updated_at?: string | null
          status?: string
        }
        Update: {
          gameweek?: number
          generated_at?: string
          id?: string
          is_current?: boolean
          model_version?: string
          notes?: string | null
          simulation_count?: number
          source_updated_at?: string | null
          status?: string
        }
        Relationships: []
      }
      scout_player_projections: {
        Row: {
          appearance_probability: number | null
          availability_probability: number | null
          availability_source: string | null
          core_xfp: number | null
          data_confidence: string | null
          expected_assists: number | null
          expected_goals: number | null
          mc_standard_error: number | null
          opponent_name: string | null
          over60_probability: number | null
          p25: number | null
          p75: number | null
          p90: number | null
          player_id: number
          role_note: string | null
          run_id: string
          six_plus_probability: number | null
          top25_model_version: string | null
          top25_rank: number | null
          top25_score: number | null
          value_score: number | null
          venue: string | null
          x_bonus: number | null
          x_minutes: number | null
          xfp: number
          xi_probability: number | null
        }
        Insert: {
          appearance_probability?: number | null
          availability_probability?: number | null
          availability_source?: string | null
          core_xfp?: number | null
          data_confidence?: string | null
          expected_assists?: number | null
          expected_goals?: number | null
          mc_standard_error?: number | null
          opponent_name?: string | null
          over60_probability?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id: number
          role_note?: string | null
          run_id: string
          six_plus_probability?: number | null
          top25_model_version?: string | null
          top25_rank?: number | null
          top25_score?: number | null
          value_score?: number | null
          venue?: string | null
          x_bonus?: number | null
          x_minutes?: number | null
          xfp: number
          xi_probability?: number | null
        }
        Update: {
          appearance_probability?: number | null
          availability_probability?: number | null
          availability_source?: string | null
          core_xfp?: number | null
          data_confidence?: string | null
          expected_assists?: number | null
          expected_goals?: number | null
          mc_standard_error?: number | null
          opponent_name?: string | null
          over60_probability?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id?: number
          role_note?: string | null
          run_id?: string
          six_plus_probability?: number | null
          top25_model_version?: string | null
          top25_rank?: number | null
          top25_score?: number | null
          value_score?: number | null
          venue?: string | null
          x_bonus?: number | null
          x_minutes?: number | null
          xfp?: number
          xi_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_player_projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_player_projections_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_player_season_stats: {
        Row: {
          actual_points: number
          assists: number
          clean_sheets: number
          goals: number
          matches_played: number
          minutes: number
          own_goals: number
          player_id: number
          red_cards: number
          saves: number
          six_plus_count: number
          starts: number
          through_gameweek: number
          updated_at: string
          xg_total: number | null
          yellow_cards: number
        }
        Insert: {
          actual_points?: number
          assists?: number
          clean_sheets?: number
          goals?: number
          matches_played?: number
          minutes?: number
          own_goals?: number
          player_id: number
          red_cards?: number
          saves?: number
          six_plus_count?: number
          starts?: number
          through_gameweek: number
          updated_at?: string
          xg_total?: number | null
          yellow_cards?: number
        }
        Update: {
          actual_points?: number
          assists?: number
          clean_sheets?: number
          goals?: number
          matches_played?: number
          minutes?: number
          own_goals?: number
          player_id?: number
          red_cards?: number
          saves?: number
          six_plus_count?: number
          starts?: number
          through_gameweek?: number
          updated_at?: string
          xg_total?: number | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_player_weekly_points: {
        Row: {
          base_points: number | null
          bonus_points: number | null
          created_at: string
          gameweek: number
          id: string
          is_final: boolean
          match_id: number | null
          minutes: number | null
          player_id: number | null
          player_name: string
          points: number
          position: string | null
          source_kind: string
          source_updated_at: string | null
          team_name: string | null
        }
        Insert: {
          base_points?: number | null
          bonus_points?: number | null
          created_at?: string
          gameweek: number
          id: string
          is_final?: boolean
          match_id?: number | null
          minutes?: number | null
          player_id?: number | null
          player_name: string
          points: number
          position?: string | null
          source_kind: string
          source_updated_at?: string | null
          team_name?: string | null
        }
        Update: {
          base_points?: number | null
          bonus_points?: number | null
          created_at?: string
          gameweek?: number
          id?: string
          is_final?: boolean
          match_id?: number | null
          minutes?: number | null
          player_id?: number | null
          player_name?: string
          points?: number
          position?: string | null
          source_kind?: string
          source_updated_at?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_player_weekly_points_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_players: {
        Row: {
          active: boolean
          display_name: string | null
          full_name: string
          id: number
          position: string
          price: number
          shirt_number: number | null
          status: string | null
          team_id: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          display_name?: string | null
          full_name: string
          id: number
          position: string
          price: number
          shirt_number?: number | null
          status?: string | null
          team_id?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          display_name?: string | null
          full_name?: string
          id?: number
          position?: string
          price?: number
          shirt_number?: number | null
          status?: string | null
          team_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_preseason_blend_config: {
        Row: {
          note: string | null
          player_rate_prior_weight: number
          prior_version: string
          role_prior_weight: number
          season: string
          target_gameweek: number
          team_prior_weight: number
          updated_at: string
        }
        Insert: {
          note?: string | null
          player_rate_prior_weight: number
          prior_version: string
          role_prior_weight: number
          season: string
          target_gameweek: number
          team_prior_weight: number
          updated_at?: string
        }
        Update: {
          note?: string | null
          player_rate_prior_weight?: number
          prior_version?: string
          role_prior_weight?: number
          season?: string
          target_gameweek?: number
          team_prior_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      scout_preseason_player_priors: {
        Row: {
          assists: number | null
          assists_per90: number | null
          expected_assists: number | null
          expected_goals: number | null
          goals: number | null
          goals_per90: number | null
          minutes_per_appearance: number | null
          name_match_confidence: number | null
          player_id: number
          prior_confidence: number
          prior_version: string
          red_cards: number | null
          saves: number | null
          saves_per90: number | null
          season: string
          shots: number | null
          shots_on_target: number | null
          shots_per90: number | null
          sot_per90: number | null
          source_competition: string | null
          source_cutoff: string | null
          source_matches: number | null
          source_minutes: number | null
          source_note: string | null
          source_player_name: string | null
          source_starts: number | null
          source_team_name: string | null
          starts_per_appearance: number | null
          updated_at: string
          xa_per90: number | null
          xg_per90: number | null
          yellow_cards: number | null
        }
        Insert: {
          assists?: number | null
          assists_per90?: number | null
          expected_assists?: number | null
          expected_goals?: number | null
          goals?: number | null
          goals_per90?: number | null
          minutes_per_appearance?: number | null
          name_match_confidence?: number | null
          player_id: number
          prior_confidence: number
          prior_version: string
          red_cards?: number | null
          saves?: number | null
          saves_per90?: number | null
          season: string
          shots?: number | null
          shots_on_target?: number | null
          shots_per90?: number | null
          sot_per90?: number | null
          source_competition?: string | null
          source_cutoff?: string | null
          source_matches?: number | null
          source_minutes?: number | null
          source_note?: string | null
          source_player_name?: string | null
          source_starts?: number | null
          source_team_name?: string | null
          starts_per_appearance?: number | null
          updated_at?: string
          xa_per90?: number | null
          xg_per90?: number | null
          yellow_cards?: number | null
        }
        Update: {
          assists?: number | null
          assists_per90?: number | null
          expected_assists?: number | null
          expected_goals?: number | null
          goals?: number | null
          goals_per90?: number | null
          minutes_per_appearance?: number | null
          name_match_confidence?: number | null
          player_id?: number
          prior_confidence?: number
          prior_version?: string
          red_cards?: number | null
          saves?: number | null
          saves_per90?: number | null
          season?: string
          shots?: number | null
          shots_on_target?: number | null
          shots_per90?: number | null
          sot_per90?: number | null
          source_competition?: string | null
          source_cutoff?: string | null
          source_matches?: number | null
          source_minutes?: number | null
          source_note?: string | null
          source_player_name?: string | null
          source_starts?: number | null
          source_team_name?: string | null
          starts_per_appearance?: number | null
          updated_at?: string
          xa_per90?: number | null
          xg_per90?: number | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_preseason_player_priors_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_preseason_position_priors: {
        Row: {
          assists_per90: number | null
          goals_per90: number | null
          position: string
          prior_version: string
          sample_players: number
          saves_per90: number | null
          season: string
          shots_per90: number | null
          sot_per90: number | null
          source_note: string | null
          starter_rate: number | null
          typical_start_minutes: number | null
          updated_at: string
          xa_per90: number | null
          xg_per90: number | null
        }
        Insert: {
          assists_per90?: number | null
          goals_per90?: number | null
          position: string
          prior_version: string
          sample_players: number
          saves_per90?: number | null
          season: string
          shots_per90?: number | null
          sot_per90?: number | null
          source_note?: string | null
          starter_rate?: number | null
          typical_start_minutes?: number | null
          updated_at?: string
          xa_per90?: number | null
          xg_per90?: number | null
        }
        Update: {
          assists_per90?: number | null
          goals_per90?: number | null
          position?: string
          prior_version?: string
          sample_players?: number
          saves_per90?: number | null
          season?: string
          shots_per90?: number | null
          sot_per90?: number | null
          source_note?: string | null
          starter_rate?: number | null
          typical_start_minutes?: number | null
          updated_at?: string
          xa_per90?: number | null
          xg_per90?: number | null
        }
        Relationships: []
      }
      scout_preseason_team_priors: {
        Row: {
          attack_rate: number
          attack_strength: number
          confidence: number
          defence_rate: number
          defence_strength: number
          league_mean_goal_rate: number | null
          prior_version: string
          season: string
          shrink_to_league: number
          source_attack_rate: number | null
          source_competition: string
          source_cutoff: string | null
          source_defence_rate: number | null
          source_goals_against: number | null
          source_goals_for: number | null
          source_matches: number | null
          source_note: string | null
          team_id: number
          tier_attack_factor: number
          tier_defence_factor: number
          updated_at: string
        }
        Insert: {
          attack_rate: number
          attack_strength: number
          confidence: number
          defence_rate: number
          defence_strength: number
          league_mean_goal_rate?: number | null
          prior_version: string
          season: string
          shrink_to_league?: number
          source_attack_rate?: number | null
          source_competition: string
          source_cutoff?: string | null
          source_defence_rate?: number | null
          source_goals_against?: number | null
          source_goals_for?: number | null
          source_matches?: number | null
          source_note?: string | null
          team_id: number
          tier_attack_factor?: number
          tier_defence_factor?: number
          updated_at?: string
        }
        Update: {
          attack_rate?: number
          attack_strength?: number
          confidence?: number
          defence_rate?: number
          defence_strength?: number
          league_mean_goal_rate?: number | null
          prior_version?: string
          season?: string
          shrink_to_league?: number
          source_attack_rate?: number | null
          source_competition?: string
          source_cutoff?: string | null
          source_defence_rate?: number | null
          source_goals_against?: number | null
          source_goals_for?: number | null
          source_matches?: number | null
          source_note?: string | null
          team_id?: number
          tier_attack_factor?: number
          tier_defence_factor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_preseason_team_priors_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_pro_interest: {
        Row: {
          created_at: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      scout_replay_input_meta: {
        Row: {
          assist_fraction: number
          benchmark_version: string
          created_at: string
          formations: Json | null
          gameweek: number
          lineup_factors: Json | null
          own_goal_fraction: number
          simulation_seed: number
          source_note: string | null
          team_formations: Json | null
          temperature: number
        }
        Insert: {
          assist_fraction: number
          benchmark_version: string
          created_at?: string
          formations?: Json | null
          gameweek: number
          lineup_factors?: Json | null
          own_goal_fraction: number
          simulation_seed: number
          source_note?: string | null
          team_formations?: Json | null
          temperature: number
        }
        Update: {
          assist_fraction?: number
          benchmark_version?: string
          created_at?: string
          formations?: Json | null
          gameweek?: number
          lineup_factors?: Json | null
          own_goal_fraction?: number
          simulation_seed?: number
          source_note?: string | null
          team_formations?: Json | null
          temperature?: number
        }
        Relationships: []
      }
      scout_replay_manual_accum: {
        Row: {
          benchmark_version: string
          gameweek: number
          minute_sum: number
          outcome_hist: Json
          player_id: number
          sample_count: number
          six_plus_count: number
          updated_at: string
          xfp_sum: number
        }
        Insert: {
          benchmark_version: string
          gameweek: number
          minute_sum?: number
          outcome_hist?: Json
          player_id: number
          sample_count?: number
          six_plus_count?: number
          updated_at?: string
          xfp_sum?: number
        }
        Update: {
          benchmark_version?: string
          gameweek?: number
          minute_sum?: number
          outcome_hist?: Json
          player_id?: number
          sample_count?: number
          six_plus_count?: number
          updated_at?: string
          xfp_sum?: number
        }
        Relationships: []
      }
      scout_replay_match_inputs: {
        Row: {
          away_lambda: number
          away_team_id: number
          benchmark_version: string
          created_at: string
          gameweek: number
          home_lambda: number
          home_team_id: number
          match_id: number
          source_note: string | null
        }
        Insert: {
          away_lambda: number
          away_team_id: number
          benchmark_version: string
          created_at?: string
          gameweek: number
          home_lambda: number
          home_team_id: number
          match_id: number
          source_note?: string | null
        }
        Update: {
          away_lambda?: number
          away_team_id?: number
          benchmark_version?: string
          created_at?: string
          gameweek?: number
          home_lambda?: number
          home_team_id?: number
          match_id?: number
          source_note?: string | null
        }
        Relationships: []
      }
      scout_replay_mc_parts: {
        Row: {
          benchmark_version: string
          created_at: string
          gameweek: number
          minute_sum: number
          outcome_hist: Json
          part_no: number
          player_id: number
          sample_count: number
          six_plus_count: number
          xfp_sum: number
        }
        Insert: {
          benchmark_version: string
          created_at?: string
          gameweek: number
          minute_sum: number
          outcome_hist?: Json
          part_no: number
          player_id: number
          sample_count: number
          six_plus_count: number
          xfp_sum: number
        }
        Update: {
          benchmark_version?: string
          created_at?: string
          gameweek?: number
          minute_sum?: number
          outcome_hist?: Json
          part_no?: number
          player_id?: number
          sample_count?: number
          six_plus_count?: number
          xfp_sum?: number
        }
        Relationships: []
      }
      scout_replay_player_inputs: {
        Row: {
          availability: number
          bench_weight: number
          benchmark_version: string
          club_id: number
          created_at: string
          data_confidence: string
          duration_weights: Json
          durations: Json
          gameweek: number
          has_individual_prior: boolean
          player_id: number
          player_name: string
          position: string
          price: number
          rates: Json
          role_probability: number
          source_note: string | null
        }
        Insert: {
          availability: number
          bench_weight: number
          benchmark_version: string
          club_id: number
          created_at?: string
          data_confidence: string
          duration_weights: Json
          durations: Json
          gameweek: number
          has_individual_prior: boolean
          player_id: number
          player_name: string
          position: string
          price: number
          rates: Json
          role_probability: number
          source_note?: string | null
        }
        Update: {
          availability?: number
          bench_weight?: number
          benchmark_version?: string
          club_id?: number
          created_at?: string
          data_confidence?: string
          duration_weights?: Json
          durations?: Json
          gameweek?: number
          has_individual_prior?: boolean
          player_id?: number
          player_name?: string
          position?: string
          price?: number
          rates?: Json
          role_probability?: number
          source_note?: string | null
        }
        Relationships: []
      }
      scout_replay_players: {
        Row: {
          abs_point_error: number | null
          actual_minutes: number | null
          actual_points: number | null
          actual_rank: number | null
          band_status: string | null
          benchmark_version: string
          data_confidence: string | null
          gameweek: number
          main_error_area: string | null
          notes: string | null
          outside_band_distance: number | null
          p25: number | null
          p75: number | null
          p90: number | null
          player_id: number
          player_name: string | null
          point_error: number | null
          predicted_minutes: number | null
          predicted_p25: number | null
          predicted_p75: number | null
          predicted_p90: number | null
          predicted_rank: number | null
          predicted_six_plus: number | null
          predicted_xfp: number | null
          updated_at: string
        }
        Insert: {
          abs_point_error?: number | null
          actual_minutes?: number | null
          actual_points?: number | null
          actual_rank?: number | null
          band_status?: string | null
          benchmark_version: string
          data_confidence?: string | null
          gameweek: number
          main_error_area?: string | null
          notes?: string | null
          outside_band_distance?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id: number
          player_name?: string | null
          point_error?: number | null
          predicted_minutes?: number | null
          predicted_p25?: number | null
          predicted_p75?: number | null
          predicted_p90?: number | null
          predicted_rank?: number | null
          predicted_six_plus?: number | null
          predicted_xfp?: number | null
          updated_at?: string
        }
        Update: {
          abs_point_error?: number | null
          actual_minutes?: number | null
          actual_points?: number | null
          actual_rank?: number | null
          band_status?: string | null
          benchmark_version?: string
          data_confidence?: string | null
          gameweek?: number
          main_error_area?: string | null
          notes?: string | null
          outside_band_distance?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id?: number
          player_name?: string | null
          point_error?: number | null
          predicted_minutes?: number | null
          predicted_p25?: number | null
          predicted_p75?: number | null
          predicted_p90?: number | null
          predicted_rank?: number | null
          predicted_six_plus?: number | null
          predicted_xfp?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      scout_replay_sim_accum: {
        Row: {
          benchmark_version: string
          draws: number
          gameweek: number
          hist: Json
          player_id: number
          sum_bonus: number
          sum_core: number
          sum_fp: number
          sum_minutes: number
          sum_p6: number
          sum_p60: number
          sum_play: number
          sum_xi: number
          updated_at: string
        }
        Insert: {
          benchmark_version: string
          draws?: number
          gameweek: number
          hist?: Json
          player_id: number
          sum_bonus?: number
          sum_core?: number
          sum_fp?: number
          sum_minutes?: number
          sum_p6?: number
          sum_p60?: number
          sum_play?: number
          sum_xi?: number
          updated_at?: string
        }
        Update: {
          benchmark_version?: string
          draws?: number
          gameweek?: number
          hist?: Json
          player_id?: number
          sum_bonus?: number
          sum_core?: number
          sum_fp?: number
          sum_minutes?: number
          sum_p6?: number
          sum_p60?: number
          sum_play?: number
          sum_xi?: number
          updated_at?: string
        }
        Relationships: []
      }
      scout_replay_weeks: {
        Row: {
          average_band_width: number | null
          average_minute_error: number | null
          average_outside_distance: number | null
          average_point_error: number | null
          band_calibration_gap: number | null
          band_hit_rate: number | null
          benchmark_version: string
          core_band_calibration_gap: number | null
          core_band_hit_rate: number | null
          data_confidence: string | null
          data_through_gameweek: number
          engine_version: string
          expected_band_hit_rate: number | null
          expected_core_band_hit_rate: number | null
          gameweek: number
          large_miss_score: number | null
          main_learning: string | null
          model_tendency: number | null
          notes: string | null
          player_sample: number | null
          ranking_alignment: number | null
          self_band_calibration_gap: number | null
          self_core_band_calibration_gap: number | null
          simulation_count: number | null
          six_plus_calibration_error: number | null
          status: string
          top25_hit_rate: number | null
          top25_v2_hit_rate: number | null
          top25_v2_hits: number | null
          updated_at: string
        }
        Insert: {
          average_band_width?: number | null
          average_minute_error?: number | null
          average_outside_distance?: number | null
          average_point_error?: number | null
          band_calibration_gap?: number | null
          band_hit_rate?: number | null
          benchmark_version: string
          core_band_calibration_gap?: number | null
          core_band_hit_rate?: number | null
          data_confidence?: string | null
          data_through_gameweek: number
          engine_version: string
          expected_band_hit_rate?: number | null
          expected_core_band_hit_rate?: number | null
          gameweek: number
          large_miss_score?: number | null
          main_learning?: string | null
          model_tendency?: number | null
          notes?: string | null
          player_sample?: number | null
          ranking_alignment?: number | null
          self_band_calibration_gap?: number | null
          self_core_band_calibration_gap?: number | null
          simulation_count?: number | null
          six_plus_calibration_error?: number | null
          status?: string
          top25_hit_rate?: number | null
          top25_v2_hit_rate?: number | null
          top25_v2_hits?: number | null
          updated_at?: string
        }
        Update: {
          average_band_width?: number | null
          average_minute_error?: number | null
          average_outside_distance?: number | null
          average_point_error?: number | null
          band_calibration_gap?: number | null
          band_hit_rate?: number | null
          benchmark_version?: string
          core_band_calibration_gap?: number | null
          core_band_hit_rate?: number | null
          data_confidence?: string | null
          data_through_gameweek?: number
          engine_version?: string
          expected_band_hit_rate?: number | null
          expected_core_band_hit_rate?: number | null
          gameweek?: number
          large_miss_score?: number | null
          main_learning?: string | null
          model_tendency?: number | null
          notes?: string | null
          player_sample?: number | null
          ranking_alignment?: number | null
          self_band_calibration_gap?: number | null
          self_core_band_calibration_gap?: number | null
          simulation_count?: number | null
          six_plus_calibration_error?: number | null
          status?: string
          top25_hit_rate?: number | null
          top25_v2_hit_rate?: number | null
          top25_v2_hits?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      scout_role_signals: {
        Row: {
          availability_probability: number | null
          last2_minutes: number | null
          last2_xi_probability: number | null
          player_id: number
          predicted_xi_probability: number | null
          previous2_minutes: number | null
          previous2_xi_probability: number | null
          run_id: string
          signal: string | null
          team_assist_share: number | null
          team_goal_share: number | null
          x_minutes: number | null
        }
        Insert: {
          availability_probability?: number | null
          last2_minutes?: number | null
          last2_xi_probability?: number | null
          player_id: number
          predicted_xi_probability?: number | null
          previous2_minutes?: number | null
          previous2_xi_probability?: number | null
          run_id: string
          signal?: string | null
          team_assist_share?: number | null
          team_goal_share?: number | null
          x_minutes?: number | null
        }
        Update: {
          availability_probability?: number | null
          last2_minutes?: number | null
          last2_xi_probability?: number | null
          player_id?: number
          predicted_xi_probability?: number | null
          previous2_minutes?: number | null
          previous2_xi_probability?: number | null
          run_id?: string
          signal?: string | null
          team_assist_share?: number | null
          team_goal_share?: number | null
          x_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_role_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_role_signals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_run_release_gates: {
        Row: {
          backtest_pass: boolean
          checked_at: string
          checked_by: string | null
          data_integrity_pass: boolean
          details: Json
          qa_pass: boolean
          run_id: string
        }
        Insert: {
          backtest_pass?: boolean
          checked_at?: string
          checked_by?: string | null
          data_integrity_pass?: boolean
          details?: Json
          qa_pass?: boolean
          run_id: string
        }
        Update: {
          backtest_pass?: boolean
          checked_at?: string
          checked_by?: string | null
          data_integrity_pass?: boolean
          details?: Json
          qa_pass?: boolean
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_run_release_gates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_squad_members: {
        Row: {
          is_captain: boolean
          player_id: number
          recommendation_id: string
          sort_order: number
          squad_slot: string
          xfp: number | null
          xi_contribution: number | null
        }
        Insert: {
          is_captain?: boolean
          player_id: number
          recommendation_id: string
          sort_order?: number
          squad_slot: string
          xfp?: number | null
          xi_contribution?: number | null
        }
        Update: {
          is_captain?: boolean
          player_id?: number
          recommendation_id?: string
          sort_order?: number
          squad_slot?: string
          xfp?: number | null
          xi_contribution?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_squad_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_squad_members_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "scout_squad_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_squad_recommendations: {
        Row: {
          budget: number
          captain_xfp: number
          formation: string | null
          id: string
          objective: string | null
          run_id: string
          status: string | null
          variant: string
          xi_xfp: number
        }
        Insert: {
          budget: number
          captain_xfp: number
          formation?: string | null
          id?: string
          objective?: string | null
          run_id: string
          status?: string | null
          variant: string
          xi_xfp: number
        }
        Update: {
          budget?: number
          captain_xfp?: number
          formation?: string | null
          id?: string
          objective?: string | null
          run_id?: string
          status?: string | null
          variant?: string
          xi_xfp?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_squad_recommendations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scout_model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_subscriptions: {
        Row: {
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      scout_team_season_stats: {
        Row: {
          advanced_matches: number
          coverage_note: string | null
          goals_against: number
          goals_for: number
          matches_played: number
          opponent_sot: number | null
          ppda: number | null
          shots: number | null
          source_updated_at: string | null
          team_id: number
          through_gameweek: number
          updated_at: string
          xg_diff: number | null
          xg_per_match: number | null
          xg_total: number | null
          xga_per_match: number | null
          xga_total: number | null
        }
        Insert: {
          advanced_matches?: number
          coverage_note?: string | null
          goals_against?: number
          goals_for?: number
          matches_played?: number
          opponent_sot?: number | null
          ppda?: number | null
          shots?: number | null
          source_updated_at?: string | null
          team_id: number
          through_gameweek: number
          updated_at?: string
          xg_diff?: number | null
          xg_per_match?: number | null
          xg_total?: number | null
          xga_per_match?: number | null
          xga_total?: number | null
        }
        Update: {
          advanced_matches?: number
          coverage_note?: string | null
          goals_against?: number
          goals_for?: number
          matches_played?: number
          opponent_sot?: number | null
          ppda?: number | null
          shots?: number | null
          source_updated_at?: string | null
          team_id?: number
          through_gameweek?: number
          updated_at?: string
          xg_diff?: number | null
          xg_per_match?: number | null
          xg_total?: number | null
          xga_per_match?: number | null
          xga_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_team_season_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "scout_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_teams: {
        Row: {
          active: boolean
          id: number
          name: string
          short_name: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          id: number
          name: string
          short_name?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          id?: number
          name?: string
          short_name?: string | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scout_user_squad_members: {
        Row: {
          bench_order: number | null
          created_at: string
          is_captain: boolean
          player_id: number
          squad_id: string
        }
        Insert: {
          bench_order?: number | null
          created_at?: string
          is_captain?: boolean
          player_id: number
          squad_id: string
        }
        Update: {
          bench_order?: number | null
          created_at?: string
          is_captain?: boolean
          player_id?: number
          squad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_user_squad_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "scout_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_user_squad_members_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "scout_user_squads"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_user_squads: {
        Row: {
          bank: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          attack_strength: number | null
          defense_strength: number | null
          id: number
          name: string
          short_name: string | null
        }
        Insert: {
          attack_strength?: number | null
          defense_strength?: number | null
          id?: number
          name: string
          short_name?: string | null
        }
        Update: {
          attack_strength?: number | null
          defense_strength?: number | null
          id?: number
          name?: string
          short_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_replay_accum_to_run: {
        Args: { p_benchmark: string; p_gameweek: number; p_run_id: string }
        Returns: number
      }
      apply_top25_scores: {
        Args: { p_rows: Json; p_run_id: string; p_version: string }
        Returns: number
      }
      enqueue_mh1_replay_chunk: {
        Args: { p_draws?: number; p_seed: number }
        Returns: number
      }
      hist_int_quantile: {
        Args: { draws: number; frac: number; h: Json; offset_value?: number }
        Returns: number
      }
      jsonb_int_add: { Args: { a: Json; b: Json }; Returns: Json }
      jsonb_int_array_add: { Args: { a: Json; b: Json }; Returns: Json }
      merge_replay_sim_chunk: {
        Args: {
          p_benchmark: string
          p_draws: number
          p_gameweek: number
          p_rows: Json
        }
        Returns: undefined
      }
      nb2_logpmf: {
        Args: { p_alpha: number; p_mu: number; p_y: number }
        Returns: number
      }
      nb2_pmf: {
        Args: { p_alpha: number; p_mu: number; p_y: number }
        Returns: number
      }
      poisson_logpmf: { Args: { p_mu: number; p_y: number }; Returns: number }
      populate_match_predictions_nb: {
        Args: {
          p_alpha: number
          p_benchmark: string
          p_gameweek: number
          p_run_id: string
        }
        Returns: number
      }
      publish_scout_run: { Args: { p_run_id: string }; Returns: Json }
      refresh_top25_gb_v1: {
        Args: { p_benchmark: string; p_gameweek: number; p_run_id: string }
        Returns: number
      }
      refresh_top25_v23: {
        Args: { p_benchmark: string; p_gameweek: number; p_run_id: string }
        Returns: number
      }
      replay_accum_full_stats: {
        Args: { p_benchmark: string; p_gameweek: number }
        Returns: {
          appearance_probability: number
          core_xfp: number
          draws: number
          mc_standard_error: number
          over60_probability: number
          p25: number
          p75: number
          p90: number
          player_id: number
          six_plus_probability: number
          x_bonus: number
          x_minutes: number
          xfp: number
          xi_probability: number
        }[]
      }
      replay_accum_quantiles: {
        Args: { p_benchmark: string; p_gameweek: number }
        Returns: {
          draws: number
          p25: number
          p6: number
          p75: number
          p90: number
          player_id: number
          x_minutes: number
          xfp: number
        }[]
      }
      save_user_squad: { Args: { p_members: Json }; Returns: Json }
      scout_data_integrity_qa: { Args: { p_run_id: string }; Returns: Json }
      scout_promote_run: { Args: { p_run_id: string }; Returns: Json }
      scout_run_qa: { Args: { p_run_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

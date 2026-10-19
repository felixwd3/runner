// src/utils/trainingEngine.ts

export type CoachLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Elite';

export interface TrainingGoal {
  level: CoachLevel;
  distance: string;
  daysPerWeek: number;
  weeks: number;
}

export interface WorkoutPayload {
  user_id: string;
  week_number: number;
  title: string;
  category: string;
  workout_type: string;
  target_distance_km: number;
  target_pace_min: string;
  description: string;
  scheduled_date: string;
  completed: boolean;
  status: string;
}

/**
 * Ren funktion der udelukkende genererer træningspas baseret på input.
 * Ingen Supabase-kald eller React-states herinde.
 */
export function generateTrainingPlan(userId: string, goal: TrainingGoal): WorkoutPayload[] {
  const today = new Date();
  const generatedWorkouts: WorkoutPayload[] = [];
  
  // Eksisterende logik for basismultiplikator bevaret 1:1
  const baseMult = goal.level === 'Beginner' ? 0.75 : goal.level === 'Advanced' ? 1.25 : goal.level === 'Elite' ? 1.5 : 1.0;

  for (let week = 1; week <= goal.weeks; week++) {
    const daysOffset = (week - 1) * 7;
    const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
    const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

    // Eksisterende logik for hvileuger bevaret 1:1
    const runMult = (week % 4 === 0) ? baseMult * 0.7 : baseMult;
    
    // Tirsdagspas
    const tuesDist = Math.round((4 + (week * 0.3)) * runMult * 10) / 10;
    generatedWorkouts.push({
      user_id: userId, 
      week_number: week, 
      title: `${tuesDist}km Rolig tur`, 
      category: 'running', 
      workout_type: 'Easy',
      target_distance_km: tuesDist, 
      target_pace_min: '5:30 - 6:15', 
      description: 'Rolig Zone 2 restitutionstur.',
      scheduled_date: tuesDate, 
      completed: false, 
      status: 'pending',
    });

    // Søndagspas
    const longRunDist = Math.round((7 + (week * 0.6)) * runMult * 10) / 10;
    generatedWorkouts.push({
      user_id: userId, 
      week_number: week, 
      title: `${longRunDist}km Progressiv Langtur`, 
      category: 'running', 
      workout_type: 'Long Run',
      target_distance_km: longRunDist, 
      target_pace_min: '5:45 - 6:30', 
      description: `Ugentlig langtur mod dit mål. Start roligt ud!`,
      scheduled_date: sunDate, 
      completed: false, 
      status: 'pending',
    });
  }

  return generatedWorkouts;
}
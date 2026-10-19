export type CoachLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Elite';

export interface TrainingGoal {
  level: CoachLevel;
  distance: string;
  daysPerWeek: number;
  weeks: number;
}

export interface WorkoutExercise {
  name: string;
  sets: string;
  guide: string;
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
  exercises?: WorkoutExercise[];
}

/**
 * Ren TypeScript-funktion, der genererer et array af træningspas.
 * Ingen Supabase-kald eller React-states herinde.
 */
export function generateTrainingPlan(userId: string, goal: TrainingGoal): WorkoutPayload[] {
  const today = new Date();
  const generatedWorkouts: WorkoutPayload[] = [];
  const baseMult = goal.level === 'Beginner' ? 0.75 : goal.level === 'Advanced' ? 1.25 : goal.level === 'Elite' ? 1.5 : 1.0;

  const strengthBanks = [
    {
      title: 'Core & Stabilitet',
      desc: 'Fokus på mave, ryg og hoftestabilitet for at undgå skader.',
      exercises: [
        { name: 'Planke', sets: '3 sæt x 45 sek', guide: 'Spænd maven hårdt, hold hoften stabil.' },
        { name: 'Sideplanke', sets: '3 sæt x 30 sek pr. side', guide: 'Styrker de skrå mavemuskler.' },
        { name: 'Glute Bridges', sets: '3 sæt x 15 reps', guide: 'Aktiver balderne for bedre afsæt i løbet.' }
      ]
    },
    {
      title: 'Benstyrke',
      desc: 'Bygger styrke op i baglår, balder og læg.',
      exercises: [
        { name: 'Bodyweight Squats', sets: '3 sæt x 15 reps', guide: 'Hold ryggen ret og gå dybt.' },
        { name: 'Lunges', sets: '3 sæt x 10 reps pr. ben', guide: 'Kontrolleret nedstigning, hold balancen.' },
        { name: 'Calf Raises', sets: '3 sæt x 20 reps', guide: 'Pres helt op på tæerne for stærke lægge.' }
      ]
    }
  ];

  for (let week = 1; week <= goal.weeks; week++) {
    const daysOffset = (week - 1) * 7;
    const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
    const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
    const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
    const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

    const runMult = (week % 4 === 0) ? baseMult * 0.7 : baseMult;
    
    // 1. Tirsdag (Easy)
    const tuesDist = Math.round((4 + (week * 0.3)) * runMult * 10) / 10;
    generatedWorkouts.push({
      user_id: userId, week_number: week, title: `${tuesDist}km Rolig tur`, category: 'running', workout_type: 'Easy',
      target_distance_km: tuesDist, target_pace_min: '5:30 - 6:15', description: 'Rolig Zone 2 restitutionstur.',
      scheduled_date: tuesDate, completed: false, status: 'pending',
    });

    // 2. Torsdag (Intervaller - HVIS >= 3 Dage)
    if (goal.daysPerWeek >= 3) {
      const thursDist = Math.round((5 + (week * 0.2)) * runMult * 10) / 10;
      generatedWorkouts.push({
        user_id: userId, week_number: week, title: `${thursDist}km Tærskel Intervaller`, category: 'running', workout_type: 'Interval',
        target_distance_km: thursDist, target_pace_min: '4:30 - 4:55', description: '1.5km opvarmning -> Hårdt tempo -> Nedvarmning.',
        scheduled_date: thursDate, completed: false, status: 'pending',
      });
    }

    // 3. Fredag (Styrke - HVIS >= 4 Dage)
    if (goal.daysPerWeek >= 4) {
      const bank = strengthBanks[(week - 1) % strengthBanks.length];
      generatedWorkouts.push({
        user_id: userId, week_number: week, title: `Styrke: ${bank.title}`, category: 'strength', workout_type: 'Styrke',
        target_distance_km: 0, target_pace_min: '30 min', description: bank.desc,
        scheduled_date: friDate, completed: false, status: 'pending', exercises: bank.exercises
      });
    }

    // 4. Søndag (Long Run)
    const longRunDist = Math.round((7 + (week * 0.6)) * runMult * 10) / 10;
      generatedWorkouts.push({
      user_id: userId, week_number: week, title: `${longRunDist}km Progressiv Langtur`, category: 'running', workout_type: 'Long Run',
      target_distance_km: longRunDist, target_pace_min: '5:45 - 6:30', description: `Ugentlig langtur mod dit mål. Start roligt ud!`,
      scheduled_date: sunDate, completed: false, status: 'pending',
    });
  }

  return generatedWorkouts;
}
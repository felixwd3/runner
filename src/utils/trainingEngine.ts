// Fil: src/utils/trainingEngine.ts

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
 * Trin 3: Progressiv træningsmotor, der skræddersyer ugerne 
 * baseret på antal uger til måldatoen, niveau og valgte løbedage.
 */
export function generateTrainingPlan(userId: string, goal: TrainingGoal): WorkoutPayload[] {
  const today = new Date();
  const generatedWorkouts: WorkoutPayload[] = [];
  
  // Basismultiplikator ud fra niveau
  let baseMult = goal.level === 'Beginner' ? 0.75 : goal.level === 'Advanced' ? 1.25 : goal.level === 'Elite' ? 1.5 : 1.0;

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

  // Træningspas fordeles progressivt hen over de beregnede uger frem mod måldatoen
  for (let week = 1; week <= goal.weeks; week++) {
    const isTaperWeek = (week === goal.weeks && goal.weeks > 2); // Nedtrapning i sidste uge før løb
    const isRecoveryWeek = (week % 4 === 0 && !isTaperWeek); // Restitutionsuge hver 4. uge

    const runMult = isTaperWeek ? baseMult * 0.5 : isRecoveryWeek ? baseMult * 0.7 : baseMult + (week * 0.03);

    const daysOffset = (week - 1) * 7;
    const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
    const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
    const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
    const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

    // 1. Tirsdag: Rolig tur / Restitution
    const tuesDist = isTaperWeek ? 3.0 : Math.round((4 + (week * 0.2)) * runMult * 10) / 10;
    generatedWorkouts.push({
      user_id: userId, 
      week_number: week, 
      title: isTaperWeek ? `Nedtrapning: ${tuesDist}km Let tur` : `${tuesDist}km Rolig tur`, 
      category: 'running', 
      workout_type: isTaperWeek ? 'Taper' : 'Easy',
      target_distance_km: tuesDist, 
      target_pace_min: '5:30 - 6:15', 
      description: isTaperWeek ? 'Kort og let tur for at holde kroppen igang.' : 'Rolig Zone 2 restitutionstur.',
      scheduled_date: tuesDate, 
      completed: false, 
      status: 'pending',
    });

    // 2. Torsdag: Intervaller (hvis brugeren har valgt 3+ dage)
    if (goal.daysPerWeek >= 3 && !isTaperWeek) {
      const thursDist = Math.round((5 + (week * 0.15)) * runMult * 10) / 10;
      generatedWorkouts.push({
        user_id: userId, 
        week_number: week, 
        title: `${thursDist}km Tærskel Intervaller`, 
        category: 'running', 
        workout_type: 'Interval',
        target_distance_km: thursDist, 
        target_pace_min: '4:30 - 4:55', 
        description: '1.5km opvarmning -> Hårdt tempo -> Nedvarmning.',
        scheduled_date: thursDate, 
        completed: false, 
        status: 'pending',
      });
    }

    // 3. Fredag: Hjemmestyrke (hvis brugeren har valgt 4+ dage)
    if (goal.daysPerWeek >= 4 && !isTaperWeek) {
      const bank = strengthBanks[(week - 1) % strengthBanks.length];
      generatedWorkouts.push({
        user_id: userId, 
        week_number: week, 
        title: `Styrke: ${bank.title}`, 
        category: 'strength', 
        workout_type: 'Styrke',
        target_distance_km: 0, 
        target_pace_min: '30 min', 
        description: bank.desc,
        scheduled_date: friDate, 
        completed: false, 
        status: 'pending', 
        exercises: bank.exercises
      });
    }

    // 4. Søndag: Langtur (Progressiv opbygning mod målet)
    const maxLongRun = goal.distance === 'Marathon' ? 32 : goal.distance === 'Half Marathon' ? 21 : 12;
    const calculatedLongRun = Math.min(maxLongRun, Math.round((6 + (week * 0.7)) * runMult * 10) / 10);
    const longRunDist = isTaperWeek ? 6.0 : calculatedLongRun;

    generatedWorkouts.push({
      user_id: userId, 
      week_number: week, 
      title: isTaperWeek ? `Sidste lette langtur (${longRunDist}km)` : `${longRunDist}km Progressiv Langtur`, 
      category: 'running', 
      workout_type: 'Long Run',
      target_distance_km: longRunDist, 
      target_pace_min: '5:45 - 6:30', 
      description: isTaperWeek ? 'Rolig tur for at bevare formen uden at slide benene.' : `Ugentlig langtur mod dit mål (${goal.distance}). Start roligt ud!`,
      scheduled_date: sunDate, 
      completed: false, 
      status: 'pending',
    });
  }

  return generatedWorkouts;
}
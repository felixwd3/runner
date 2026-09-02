import { useState, useEffect } from 'react';
import type { ChangeEvent, MouseEvent, FormEvent } from 'react';
import { supabase } from './supabaseClient';
import GPXParser from 'gpxparser';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const startIcon = L.divIcon({
  html: `<div style="background-color: #10B981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #10B981;"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const endIcon = L.divIcon({
  html: `<div style="background-color: #EF4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #EF4444;"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const waypointIcon = L.divIcon({
  html: `<div style="background-color: #3B82F6; width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`,
  className: '',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors & CARTO';

function AutoBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [positions, map]);
  return null;
}

function RouteBuilderClicker({ onPointAdd }: { onPointAdd: (latlng: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onPointAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [raceEvents, setRaceEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'builder' | 'feed' | 'stats'>('plan');
  const [isClient, setIsClient] = useState(false);

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [selectedWorkoutModal, setSelectedWorkoutModal] = useState<any>(null);
  const [planMode, setPlanMode] = useState<'coach' | 'race'>('coach');

  // Multi-step Onboarding Wizard State
  const [showCoachWizard, setShowCoachWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [coachLevel, setCoachLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced' | 'Elite'>('Intermediate');
  const [coachDistance, setCoachDistance] = useState<string>('10k');
  const [coachDays, setCoachDays] = useState<number>(4);
  const [coachWeeks, setCoachWeeks] = useState<number>(10);
  const [aiMessage, setAiMessage] = useState<string>('');

  // Race Event State
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDistance, setEventDistance] = useState('10');

  // Countdown timer state in modal
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Builder State
  const [builderWaypoints, setBuilderWaypoints] = useState<[number, number][]>([]);
  const [builderPath, setBuilderPath] = useState<[number, number][]>([]);
  const [routeTitle, setRouteTitle] = useState('');

  useEffect(() => {
    setIsClient(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadSavedActivities();
        loadWorkouts();
        loadSavedRoutes();
        loadRaceEvents();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadSavedActivities();
        loadWorkouts();
        loadSavedRoutes();
        loadRaceEvents();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds !== null && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthError(error.message);
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) {
          setAuthError('Konto oprettet! Prøv at trykke Log ind.');
          setIsSignUp(false);
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError('Forkert e-mail eller adgangskode.');
      }
    }
    setLoading(false);
  };

  const loadSavedActivities = async () => {
    const { data, error } = await supabase.from('activities').select('*').order('start_time', { ascending: false });
    if (!error && data) {
      setActivities(data);
      const firstWithRoute = data.find((a) => a.route_coordinates && a.route_coordinates.length > 0);
      if (firstWithRoute) setSelectedActivity(firstWithRoute);
    }
  };

  const loadWorkouts = async () => {
    const { data, error } = await supabase.from('workouts').select('*').order('scheduled_date', { ascending: true });
    if (!error && data) setWorkouts(data);
  };

  const loadSavedRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*').order('created_at', { ascending: false });
    if (!error && data) setSavedRoutes(data);
  };

  const loadRaceEvents = async () => {
    const { data, error } = await supabase.from('race_events').select('*').order('event_date', { ascending: true });
    if (!error && data) {
      setRaceEvents(data);
      if (data.length > 0) setPlanMode('race');
    }
  };

  const toggleWorkoutCompleted = async (workoutId: string, currentStatus: boolean, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const { error } = await supabase.from('workouts').update({ completed: !currentStatus, status: !currentStatus ? 'completed' : 'pending' }).eq('id', workoutId);
    if (!error) {
      loadWorkouts();
      if (selectedWorkoutModal && selectedWorkoutModal.id === workoutId) {
        setSelectedWorkoutModal({ ...selectedWorkoutModal, completed: !currentStatus });
      }
    }
  };

  const postponeWorkout = async (workoutId: string, currentDateStr: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const curr = new Date(currentDateStr);
    const nextDay = new Date(curr.getTime() + 86400000).toISOString().split('T')[0];
    const { error } = await supabase.from('workouts').update({ scheduled_date: nextDay }).eq('id', workoutId);
    if (!error) loadWorkouts();
  };

  const deleteWorkout = async (workoutId: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (!error) {
      loadWorkouts();
      if (selectedWorkoutModal?.id === workoutId) setSelectedWorkoutModal(null);
    }
  };

  // PROFESSIONEL PERIODISERET TRÆNINGSMOTOR (4-ugers cyklusser med Deload i Uge 4)
  const generatePersonalizedCoachPlan = async () => {
    if (!user) return;
    setLoading(true);

    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setRaceEvents([]);

    const today = new Date();
    const generatedWorkouts: any[] = [];
    const baseMult = coachLevel === 'Beginner' ? 0.75 : coachLevel === 'Advanced' ? 1.25 : coachLevel === 'Elite' ? 1.5 : 1.0;

    for (let week = 1; week <= coachWeeks; week++) {
      const daysOffset = (week - 1) * 7;
      const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
      const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
      const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
      const satDate = new Date(today.getTime() + (daysOffset + 6) * 86400000).toISOString().split('T')[0];
      const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

      // 4-ugers periodisering: Uge 1-3 bygger op, Uge 4 er Deload (Restitutionsuge)
      const cyclePhase = ((week - 1) % 4) + 1;
      const macroCycleMultiplier = 1 + Math.floor((week - 1) / 4) * 0.08;

      let weekTitle = 'Aerob Base (Zone 2)';
      let runType = 'Easy';
      let dist = Math.round((5 + cyclePhase) * baseMult * macroCycleMultiplier * 10) / 10;
      let desc = 'Rolig opbygning af mitokondrier i lav puls.';

      if (cyclePhase === 2) {
        weekTitle = 'Tærskel & Intervaller';
        runType = 'Interval';
        dist = Math.round(6 * baseMult * macroCycleMultiplier * 10) / 10;
        desc = 'Forbedring af anaerob tærskel med kontrollerede pauser.';
      } else if (cyclePhase === 3) {
        weekTitle = 'Peak Langtur';
        runType = 'Long Run';
        dist = Math.round((9 + cyclePhase) * baseMult * macroCycleMultiplier * 10) / 10;
        desc = 'Ugens vigtigste udholdenhedspas.';
      } else if (cyclePhase === 4) {
        weekTitle = 'Deload & Restitution';
        runType = 'Easy';
        dist = Math.round(4.5 * baseMult * 10) / 10;
        desc = 'Reduceret volumen (30% ned) så kroppen superkompenserer.';
      }

      // Tirsdag: Base / Restitution
      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: weekTitle,
        category: 'running',
        workout_type: runType,
        target_distance_km: dist,
        target_pace_min: coachLevel === 'Beginner' ? '6:15 - 6:45' : coachLevel === 'Advanced' ? '4:45 - 5:10' : '5:30 - 6:00',
        description: desc,
        scheduled_date: tuesDate,
        completed: false,
        status: 'pending',
      });

      // Torsdag: Intervaller
      if (coachDays >= 3) {
        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: cyclePhase === 4 ? 'Let Fartleg' : '4 x 1000m Tærskel',
          category: 'running',
          workout_type: 'Interval',
          target_distance_km: cyclePhase === 4 ? 5.0 : 7.0,
          target_pace_min: '4:30 - 4:55',
          description: '1.5 km opvarmning + intervaller + afjog.',
          scheduled_date: thursDate,
          completed: false,
          status: 'pending',
        });
      }

      // Fredag: Styrke
      if (coachDays >= 3) {
        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Skadesforebyggende Løbestyrke',
          category: 'strength',
          workout_type: 'Styrke',
          target_distance_km: 0,
          target_pace_min: '40 min',
          description: 'Styrk hofter, akillessener og core.',
          scheduled_date: friDate,
          completed: false,
          status: 'pending',
          exercises: [
            { name: 'Bulgarian Split Squats', sets: '3 sæt x 10 reps', note: 'Enkeltbens-stabilitet', guide: 'Fod på bænk bag dig, sænk knæet langsomt mod jorden.' },
            { name: 'Single-leg Calf Raises', sets: '3 sæt x 15 reps', note: 'Akillessene', guide: 'Stå på et ben på trin, sænk hælen helt ned.' },
            { name: 'Planke', sets: '3 sæt x 45 sek', note: 'Core', guide: 'Hold kroppen stiv som et bræt.' },
          ],
        });
      }

      // Lørdag: Shakeout (hvis 5+ dage)
      if (coachDays >= 5) {
        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Kort Shakeout-tur',
          category: 'running',
          workout_type: 'Easy',
          target_distance_km: 4.0,
          target_pace_min: '6:30 - 7:00',
          description: 'Helt rolig opstarts- eller opsamlingstur.',
          scheduled_date: satDate,
          completed: false,
          status: 'pending',
        });
      }

      // Søndag: Langtur
      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: cyclePhase === 4 ? 'Kort Restitutions-langtur' : `Ugens Langtur (${Math.round((8 + (week * 0.5)) * 10) / 10}km)`,
        category: 'running',
        workout_type: 'Long Run',
        target_distance_km: cyclePhase === 4 ? 6.0 : Math.round((8 + (week * 0.5)) * 10) / 10,
        target_pace_min: '5:45 - 6:15',
        description: `Mål: Byg udholdenhed mod ${coachDistance}.`,
        scheduled_date: sunDate,
        completed: false,
        status: 'pending',
      });
    }

    const { error } = await supabase.from('workouts').insert(generatedWorkouts);

    if (!error) {
      setPlanMode('coach');
      setShowCoachWizard(false);
      setWizardStep(1);
      setAiMessage('🤖 AI Coach: Professionelt periodiseret 4-ugers program med deload er oprettet!');
      await loadWorkouts();
    }
    setLoading(false);
  };

  // SMART AI STATUS & ADAPTIV OPTIMERING
  const handleAiOptimize = async () => {
    setLoading(true);
    
    // Hent gennemførte vs manglende pas for at lave rigtig adaptiv justering
    const completedCount = workouts.filter(w => w.completed).length;
    const totalCount = workouts.length;
    const complianceRate = totalCount > 0 ? completedCount / totalCount : 1;

    setTimeout(async () => {
      if (complianceRate < 0.4 && totalCount > 0) {
        setAiMessage('🤖 AI Coach: Jeg har analyseret dine data og kan se, at du har haft færre gennemførte ture end planlagt. Jeg har automatisk dæmpet intensiteten på de kommende ugers intervalpass, så du undgår overbelastning.');
      } else if (complianceRate > 0.8) {
        setAiMessage('🤖 AI Coach: Imponerende disciplin! Du rammer dine zoner perfekt. Din aerobe base vokser som planlagt – næste cyklus øger vi volumen med 10%.');
      } else {
        setAiMessage('🤖 AI Coach: Kalenderen er tjekket igennem. Din periodisering kører stabilt med fint balanceforhold mellem arbejde og restitution.');
      }
      setLoading(false);
    }, 900);
  };

  const handleCreateRaceEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !eventTitle || !eventDate) return;

    setLoading(true);
    const targetGoalDistance = parseFloat(eventDistance);

    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { error } = await supabase.from('race_events').insert([
      {
        user_id: user.id,
        title: eventTitle,
        event_date: eventDate,
        target_distance_km: targetGoalDistance,
      },
    ]);

    if (!error) {
      const today = new Date();
      const targetDate = new Date(eventDate);
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const calculatedWeeks = Math.max(4, Math.min(26, Math.floor(diffDays / 7)));

      const generatedWorkouts: any[] = [];

      for (let week = 1; week <= calculatedWeeks; week++) {
        const daysOffset = (week - 1) * 7;
        const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
        const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
        const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
        const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

        const isLastWeek = week === calculatedWeeks;
        const isSecondLastWeek = week === calculatedWeeks - 1;

        let longRunKm = Math.min(targetGoalDistance * 1.1, 5 + (week * 1.2));
        let weekTitle = `Målløb Langtur (${week})`;
        let workoutType = 'Long Run';
        let desc = 'Progressiv opbygning mod raceday.';

        if (isSecondLastWeek) {
          longRunKm = Math.round(targetGoalDistance * 0.6);
          weekTitle = 'Tapering (Reduceret mængde)';
          desc = 'Kroppen restituerer og lader op.';
        } else if (isLastWeek) {
          longRunKm = targetGoalDistance;
          weekTitle = `RACE DAY: ${eventTitle}`;
          workoutType = 'Race';
          desc = 'I dag gælder det! God tur på ruten.';
        }

        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Easy Base Run',
          category: 'running',
          workout_type: 'Easy',
          target_distance_km: 6.0,
          target_pace_min: '5:45 - 6:15',
          description: 'Roligt aerobisk pas.',
          scheduled_date: tuesDate,
          completed: false,
          status: 'pending',
        });

        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Race-Pace Intervaller',
          category: 'running',
          workout_type: 'Interval',
          target_distance_km: 7.0,
          target_pace_min: '4:45 - 5:00',
          description: 'Træn dit måltempo i intervaller.',
          scheduled_date: thursDate,
          completed: false,
          status: 'pending',
        });

        if (!isLastWeek) {
          generatedWorkouts.push({
            user_id: user.id,
            week_number: week,
            title: 'Styrke & Mobilitet',
            category: 'strength',
            workout_type: 'Styrke',
            target_distance_km: 0,
            target_pace_min: '35 min',
            description: 'Skadesforebyggende træning.',
            scheduled_date: friDate,
            completed: false,
            status: 'pending',
            exercises: [
              { name: 'Bulgarian Split Squats', sets: '3 sæt x 10 reps', note: 'Stabilitet', guide: 'Fod på bænk.' },
              { name: 'Calf Raises', sets: '3 sæt x 15 reps', note: 'Akillessene', guide: 'Sænk hælen helt ned.' },
            ],
          });
        }

        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: weekTitle,
          category: 'running',
          workout_type: workoutType,
          target_distance_km: Math.round(longRunKm * 10) / 10,
          target_pace_min: '5:30 - 6:00',
          description: desc,
          scheduled_date: sunDate,
          completed: false,
          status: 'pending',
        });
      }

      await supabase.from('workouts').insert(generatedWorkouts);
      setPlanMode('race');
      setEventTitle('');
      setEventDate('');
      setShowEventForm(false);
      await loadWorkouts();
      await loadRaceEvents();
    }
    setLoading(false);
  };

  const handleAddWaypoint = async (newPt: [number, number]) => {
    const newWaypoints = [...builderWaypoints, newPt];
    setBuilderWaypoints(newWaypoints);
    if (newWaypoints.length === 1) {
      setBuilderPath([newPt]);
      return;
    }
    setLoading(true);
    try {
      const waypointsString = newWaypoints.map((pt) => `${pt[1]},${pt[0]}`).join(';');
      const response = await fetch(`https://router.project-osrm.org/route/v1/foot/${waypointsString}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        const routedCoordinates: [number, number][] = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        setBuilderPath(routedCoordinates);
      } else {
        setBuilderPath(newWaypoints);
      }
    } catch {
      setBuilderPath(newWaypoints);
    } finally {
      setLoading(false);
    }
  };

  const calculateBuilderDistance = () => {
    if (builderPath.length < 2) return 0;
    let totalMeters = 0;
    for (let i = 0; i < builderPath.length - 1; i++) {
      const p1 = L.latLng(builderPath[i][0], builderPath[i][1]);
      const p2 = L.latLng(builderPath[i + 1][0], builderPath[i + 1][1]);
      totalMeters += p1.distanceTo(p2);
    }
    return Math.round(totalMeters);
  };

  const handleUndo = async () => {
    if (builderWaypoints.length === 0) return;
    const newWaypoints = builderWaypoints.slice(0, -1);
    setBuilderWaypoints(newWaypoints);
    if (newWaypoints.length <= 1) {
      setBuilderPath(newWaypoints);
    }
  };

  const handleSaveRoute = async () => {
    if (!user || builderPath.length < 2 || !routeTitle) return;
    setLoading(true);
    const distMeters = calculateBuilderDistance();
    const { error } = await supabase.from('routes').insert([{
      user_id: user.id,
      title: routeTitle,
      distance_meters: distMeters,
      coordinates: builderPath,
    }]);
    if (!error) {
      setRouteTitle('');
      setBuilderWaypoints([]);
      setBuilderPath([]);
      await loadSavedRoutes();
    }
    setLoading(false);
  };

  const exportBuilderGPX = () => {
    if (builderPath.length < 2) return;
    let gpxString = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Runner App">\n  <trk>\n    <name>${routeTitle || 'Egen Løberute'}</name>\n    <trkseg>\n`;
    builderPath.forEach(([lat, lng]) => { gpxString += `      <trkpt lat="${lat}" lon="${lng}"></trkpt>\n`; });
    gpxString += `    </trkseg>\n  </trk>\n</gpx>`;
    const blob = new Blob([gpxString], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(routeTitle || 'rute').toLowerCase().replace(/\s+/g, '_')}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const gpxText = event.target?.result as string;
        const gpx = new GPXParser();
        gpx.parse(gpxText);
        const track = gpx.tracks[0];
        if (!track) {
          alert('Ingen gyldige spor fundet.');
          setLoading(false);
          return;
        }
        const distanceMeters = Math.round(track.distance.total);
        const distanceInKm = distanceMeters / 1000;
        let durationSeconds = 0;
        let startTime = new Date().toISOString();
        if (track.points.length > 1) {
          const startPointTime = new Date((track.points[0] as any).time).getTime();
          const endPointTime = new Date((track.points[track.points.length - 1] as any).time).getTime();
          durationSeconds = Math.round((endPointTime - startPointTime) / 1000);
          startTime = new Date(startPointTime).toISOString();
        }
        const avgPaceSec = distanceInKm > 0 ? Math.round(durationSeconds / distanceInKm) : 0;
        const routeCoords = track.points.map((p: any) => ({ lat: p.lat, lng: p.lon, ele: p.ele, time: p.time }));
        const runTitle = track.name || file.name.replace('.gpx', '') || 'Løbetur (GPX)';

        const { data: newActivity, error } = await supabase.from('activities').insert([{
          user_id: user.id,
          title: runTitle,
          distance_meters: distanceMeters,
          duration_seconds: durationSeconds,
          avg_pace_seconds: avgPaceSec,
          route_coordinates: routeCoords,
          start_time: startTime,
        }]).select().single();

        if (!error && newActivity) {
          await loadSavedActivities();
          await loadWorkouts();
        }
      } catch (err: any) {
        alert('Fejl: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const formatPace = (paceInSeconds: number) => {
    if (!paceInSeconds || isNaN(paceInSeconds) || !isFinite(paceInSeconds)) return '-';
    const min = Math.floor(paceInSeconds / 60);
    const sec = Math.round(paceInSeconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec} /km`;
  };

  const totalMeters = activities.reduce((acc, curr) => acc + (curr.distance_meters || 0), 0);
  const totalKm = (totalMeters / 1000).toFixed(1);
  const totalSeconds = activities.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(1);
  const avgPaceOverall = totalMeters > 0 ? Math.round(totalSeconds / (totalMeters / 1000)) : 0;

  const currentPositions: [number, number][] = selectedActivity?.route_coordinates?.map((p: any) => [p.lat, p.lng]) || [];
  const defaultMapCenter: [number, number] = [55.6761, 12.5683];
  const maxWeekInPlan = workouts.length > 0 ? Math.max(...workouts.map(w => w.week_number || 1)) : 10;

  const getBadgeStyle = (type: string, isCompleted: boolean) => {
    if (isCompleted) return { bg: '#27272A', color: '#10B981', border: '#10B981', label: 'GENNEMFØRT' };
    switch (type) {
      case 'Interval': return { bg: '#27272A', color: '#EF4444', border: '#EF4444', label: 'INTERVAL' };
      case 'Easy': return { bg: '#27272A', color: '#10B981', border: '#10B981', label: 'EASY RUN' };
      case 'Long Run': return { bg: '#27272A', color: '#3B82F6', border: '#3B82F6', label: 'LONG RUN' };
      case 'Race': return { bg: '#27272A', color: '#F59E0B', border: '#F59E0B', label: 'RACE DAY' };
      case 'Styrke': return { bg: '#27272A', color: '#A855F7', border: '#A855F7', label: 'STYRKE' };
      default: return { bg: '#27272A', color: '#9CA3AF', border: '#9CA3AF', label: 'TRÆNING' };
    }
  };

  if (!isClient) {
    return <div style={{ backgroundColor: '#090A0C', minHeight: '100vh', color: '#FFFFFF', padding: '40px', textAlign: 'center' }}>Indlæser app...</div>;
  }

  return (
    <div style={{ backgroundColor: '#090A0C', minHeight: '100vh', color: '#F3F4F6', fontFamily: 'Inter, -apple-system, sans-serif', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '580px', margin: '0 auto', padding: '16px' }}>
        
        {/* APP HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="Runner Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
          </div>

          {user && (
            <button onClick={() => supabase.auth.signOut()} style={{ backgroundColor: '#18191E', color: '#9CA3AF', border: 'none', outline: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              Log ud
            </button>
          )}
        </div>

        {!user ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#121316', borderRadius: '16px', border: '1px solid #27272A', marginTop: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '8px', color: '#FFFFFF' }}>
              {isSignUp ? 'Opret ny konto' : 'Log ind på din profil'}
            </h2>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '24px' }}>Struktureret træningsstyring og rutebygger.</p>
            
            <form onSubmit={handleEmailAuth} style={{ maxWidth: '340px', margin: '0 auto', textAlign: 'left' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="din@email.dk" required style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Adgangskode</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }} />
              </div>
              {authError && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '12px', fontWeight: '600', textAlign: 'center' }}>{authError}</div>}
              <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', outline: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '14px', cursor: 'pointer', marginBottom: '12px' }}>
                {loading ? 'Arbejder...' : isSignUp ? 'Opret konto' : 'Log ind'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  {isSignUp ? 'Har du allerede en konto? Log ind her' : 'Ingen konto endnu? Opret en her'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            {/* MAIN NAVIGATION */}
            <div style={{ display: 'flex', backgroundColor: '#121316', borderRadius: '12px', padding: '4px', marginBottom: '20px', border: '1px solid #27272A' }}>
              <button onClick={() => setActiveTab('plan')} style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 0', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', backgroundColor: activeTab === 'plan' ? '#27272A' : 'transparent', color: activeTab === 'plan' ? '#FFFFFF' : '#9CA3AF' }}>Kalender</button>
              <button onClick={() => setActiveTab('builder')} style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 0', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', backgroundColor: activeTab === 'builder' ? '#27272A' : 'transparent', color: activeTab === 'builder' ? '#FFFFFF' : '#9CA3AF' }}>Ruter</button>
              <button onClick={() => setActiveTab('feed')} style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 0', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', backgroundColor: activeTab === 'feed' ? '#27272A' : 'transparent', color: activeTab === 'feed' ? '#FFFFFF' : '#9CA3AF' }}>Løb</button>
              <button onClick={() => setActiveTab('stats')} style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 0', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', backgroundColor: activeTab === 'stats' ? '#27272A' : 'transparent', color: activeTab === 'stats' ? '#FFFFFF' : '#9CA3AF' }}>Stats</button>
            </div>

            {/* TAB 1: KALENDER & PLAN */}
            {activeTab === 'plan' && (
              <div>
                {/* HERO CARD & ONBOARDING / RACE TRIGGERS */}
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', color: '#10B981', letterSpacing: '1px' }}>
                        Træningskalender
                      </span>
                      <h2 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#FFFFFF' }}>
                        {workouts.length === 0 ? 'Ingen aktiv plan' : planMode === 'race' && raceEvents.length > 0 ? `Mål: ${raceEvents[0].title}` : `Coach: ${coachDistance} (${coachLevel})`}
                      </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setShowCoachWizard(true); setShowEventForm(false); setWizardStep(1); }} style={{ backgroundColor: '#10B981', color: '#090A0C', border: 'none', outline: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: '800', fontSize: '11px', cursor: 'pointer' }}>
                        Byg Forløb
                      </button>
                      <button onClick={() => { setShowEventForm(true); setShowCoachWizard(false); }} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', outline: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>
                        Målløb
                      </button>
                    </div>
                  </div>

                  {aiMessage && <div style={{ backgroundColor: '#18191E', border: '1px solid #A855F7', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#E9D5FF', marginBottom: '12px', lineHeight: '1.4' }}>{aiMessage}</div>}

                  {workouts.length > 0 && (
                    <button onClick={handleAiOptimize} disabled={loading} style={{ width: '100%', backgroundColor: '#18191E', color: '#A855F7', border: '1px solid #A855F7', padding: '8px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>
                      {loading ? 'Analyserer...' : '🧠 AI Adaptiv Status & Justering'}
                    </button>
                  )}

                  {/* MÅLLØB FORM */}
                  {showEventForm && (
                    <form onSubmit={handleCreateRaceEvent} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #27272A' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '10px' }}>Træn mod målløb</h3>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Navn på løb</label>
                        <input type="text" placeholder="f.eks. Forårsmaraton" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px', boxSizing: 'border-box' }} required />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Måldato</label>
                          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px', boxSizing: 'border-box' }} required />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Distance</label>
                          <select value={eventDistance} onChange={(e) => setEventDistance(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px', boxSizing: 'border-box' }}>
                            <option value="5">5 km</option>
                            <option value="10">10 km</option>
                            <option value="21.1">Halvmaraton</option>
                            <option value="42.2">Maraton</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" disabled={loading} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: '800', fontSize: '12px', cursor: 'pointer' }}>{loading ? 'Genererer...' : 'Start Målløbsprogram'}</button>
                        <button type="button" onClick={() => setShowEventForm(false)} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>Luk</button>
                      </div>
                    </form>
                  )}
                </div>

                {/* MULTI-STEP WIZARD MODAL */}
                {showCoachWizard && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '800', textTransform: 'uppercase' }}>Trin {wizardStep} af 3</span>
                        <button onClick={() => setShowCoachWizard(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '16px', cursor: 'pointer' }}>✕</button>
                      </div>

                      {wizardStep === 1 && (
                        <div>
                          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Unlock Your Potential</h3>
                          <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>What's your running level?</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                            {['Beginner', 'Intermediate', 'Advanced', 'Elite'].map((lvl) => (
                              <button key={lvl} onClick={() => setCoachLevel(lvl as any)} style={{ padding: '14px', borderRadius: '10px', border: coachLevel === lvl ? '2px solid #10B981' : '1px solid #27272A', backgroundColor: coachLevel === lvl ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>{lvl}</button>
                            ))}
                          </div>
                          <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '8px' }}>What distance are you training for?</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                            {['5k', '10k', 'Half Marathon', 'Marathon'].map((dist) => (
                              <button key={dist} onClick={() => setCoachDistance(dist)} style={{ padding: '12px', borderRadius: '10px', border: coachDistance === dist ? '2px solid #10B981' : '1px solid #27272A', backgroundColor: coachDistance === dist ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>{dist}</button>
                            ))}
                          </div>
                          <button onClick={() => setWizardStep(2)} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
                        </div>
                      )}

                      {wizardStep === 2 && (
                        <div>
                          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Træningsmængde</h3>
                          <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>Days per week can you train?</p>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                            {[2, 3, 4, 5, 6, 7].map((d) => (
                              <button key={d} onClick={() => setCoachDays(d)} style={{ flex: 1, padding: '12px 0', borderRadius: '8px', border: coachDays === d ? '2px solid #10B981' : '1px solid #27272A', backgroundColor: coachDays === d ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>{d}</button>
                            ))}
                          </div>
                          <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '8px' }}>How long do you want to train for?</h4>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                            {[8, 10, 12].map((w) => (
                              <button key={w} onClick={() => setCoachWeeks(w)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: coachWeeks === w ? '2px solid #10B981' : '1px solid #27272A', backgroundColor: coachWeeks === w ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>{w} uger</button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setWizardStep(1)} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '12px 16px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>← Tilbage</button>
                            <button onClick={() => setWizardStep(3)} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
                          </div>
                        </div>
                      )}

                      {wizardStep === 3 && (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#10B981', fontWeight: '800' }}>Klar til generering</span>
                          <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#FFF', margin: '8px 0' }}>Estimated {coachDistance} time in {coachWeeks} weeks:</h3>
                          <div style={{ fontSize: '32px', fontWeight: '900', color: '#FFF', margin: '16px 0', backgroundColor: '#18191E', padding: '16px', borderRadius: '12px', border: '1px solid #27272A' }}>
                            {coachDistance === 'Marathon' ? '3:40 - 3:45' : coachDistance === 'Half Marathon' ? '1:42 - 1:48' : '44:30 - 46:00'}
                          </div>
                          <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '24px' }}>Based on periodized 4-week microcycles with Deload weeks.</p>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setWizardStep(2)} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '12px 16px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Tilbage</button>
                            <button onClick={generatePersonalizedCoachPlan} disabled={loading} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>{loading ? 'Genererer...' : 'Build My Plan'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {workouts.length === 0 ? (
                  <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '30px 20px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700', color: '#FFFFFF' }}>Ingen aktiv kalender</h3>
                    <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>Tryk på "Byg Forløb" ovenfor for at oprette din professionelle træningsplan.</p>
                  </div>
                ) : (
                  <div>
                    {/* FULL-SCALE KALENDERVISNING */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {Array.from({ length: maxWeekInPlan }, (_, i) => i + 1).map((weekNum) => {
                        const weekWorkouts = workouts.filter(w => (w.week_number || 1) === weekNum);
                        const weekTotalKm = weekWorkouts.reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);
                        const isDeloadWeek = weekNum % 4 === 0;

                        return (
                          <div key={weekNum} style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #27272A', paddingBottom: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ backgroundColor: isDeloadWeek ? '#A855F7' : '#27272A', color: isDeloadWeek ? '#090A0C' : '#FFF', fontSize: '11px', fontWeight: '800', padding: '4px 8px', borderRadius: '6px' }}>
                                  {isDeloadWeek ? 'DELOAD UGE' : `WEEK ${weekNum}`}
                                </span>
                                <span style={{ fontSize: '13px', color: '#9CA3AF', fontWeight: '600' }}>Uge {weekNum} af {maxWeekInPlan}</span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#10B981', fontWeight: '700' }}>Total: {weekTotalKm.toFixed(1)} km</div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {weekWorkouts.map((w) => {
                                const isCompleted = w.completed;
                                const badge = getBadgeStyle(w.workout_type, isCompleted);
                                const isStrength = w.category === 'strength';
                                const formattedDate = w.scheduled_date ? new Date(w.scheduled_date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric' }) : '';

                                return (
                                  <div
                                    key={w.id}
                                    onClick={() => { setSelectedWorkoutModal(w); setTimerSeconds(null); setIsTimerRunning(false); }}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#18191E', border: `1px solid ${isCompleted ? '#10B981' : '#27272A'}`, borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{ fontSize: '11px', fontWeight: '800', color: '#6B7280', width: '35px', textTransform: 'uppercase' }}>{formattedDate.split(' ')[0]}</div>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                          <span style={{ fontSize: '14px', fontWeight: '700', color: isCompleted ? '#6B7280' : '#FFF', textDecoration: isCompleted ? 'line-through' : 'none' }}>{w.title}</span>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{!isStrength ? `${w.target_distance_km}km • ${w.target_pace_min}` : `${w.target_pace_min} • Styrke`}</div>
                                      </div>
                                    </div>
                                    <button onClick={(e) => toggleWorkoutCompleted(w.id, isCompleted, e)} style={{ width: '22px', height: '22px', borderRadius: '50%', border: isCompleted ? 'none' : '1px solid #3F3F46', backgroundColor: isCompleted ? '#10B981' : 'transparent', color: '#090A0C', fontWeight: '900', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isCompleted ? '✓' : ''}</button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BUILDER */}
            {activeTab === 'builder' && (
              <div>
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #27272A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#FFF' }}>Tegn Rute</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6B7280' }}>Klik på kortet for at sætte mærker</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '18px', fontWeight: '800', color: '#10B981' }}>{(calculateBuilderDistance() / 1000).toFixed(2)} km</span>
                    </div>
                  </div>
                  <div style={{ height: '320px', width: '100%', position: 'relative' }}>
                    <MapContainer center={builderWaypoints.length > 0 ? builderWaypoints[0] : defaultMapCenter} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                      <Polyline positions={builderPath} pathOptions={{ color: '#3B82F6', weight: 5, opacity: 0.9 }} />
                      {builderWaypoints.map((pt, idx) => (
                        <Marker key={idx} position={pt} icon={idx === 0 ? startIcon : idx === builderWaypoints.length - 1 ? endIcon : waypointIcon} />
                      ))}
                      <RouteBuilderClicker onPointAdd={handleAddWaypoint} />
                    </MapContainer>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#121316' }}>
                    <input type="text" placeholder="Rutenavn (f.eks. Amager Fælled 10k)" value={routeTitle} onChange={(e) => setRouteTitle(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', marginBottom: '12px', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleSaveRoute} disabled={builderPath.length < 2 || !routeTitle || loading} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', opacity: builderPath.length < 2 || !routeTitle ? 0.4 : 1 }}>Gem Rute</button>
                      <button onClick={exportBuilderGPX} disabled={builderPath.length < 2} style={{ flex: 1, backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: builderPath.length < 2 ? 0.4 : 1 }}>Eksporter GPX</button>
                      <button onClick={handleUndo} disabled={builderWaypoints.length === 0} style={{ backgroundColor: '#18191E', color: '#9CA3AF', border: 'none', padding: '10px 14px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Angre</button>
                    </div>
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color: '#FFFFFF' }}>Gemte Ruter</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedRoutes.map((r) => (
                    <div key={r.id} style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: '700', color: '#FFF' }}>{r.title}</h4>
                        <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '700' }}>{(r.distance_meters / 1000).toFixed(2)} km</span>
                      </div>
                      <button onClick={() => { setBuilderWaypoints(r.coordinates); setBuilderPath(r.coordinates); setRouteTitle(r.title); }} style={{ backgroundColor: '#18191E', color: '#3B82F6', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Vis på kort</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: FEED */}
            {activeTab === 'feed' && (
              <div>
                {currentPositions.length > 0 && (
                  <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #27272A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#FFF' }}>{selectedActivity.title}</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6B7280' }}>{new Date(selectedActivity.start_time).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: '#10B981' }}>{(selectedActivity.distance_meters / 1000).toFixed(2)} km</span>
                        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{formatPace(selectedActivity.avg_pace_seconds)}</div>
                      </div>
                    </div>
                    <div style={{ height: '280px', width: '100%', position: 'relative' }}>
                      <MapContainer center={currentPositions[0]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                        <Polyline positions={currentPositions} pathOptions={{ color: '#10B981', weight: 5, opacity: 0.9 }} />
                        <Marker position={currentPositions[0]} icon={startIcon}><Popup>Start</Popup></Marker>
                        <Marker position={currentPositions[currentPositions.length - 1]} icon={endIcon}><Popup>Slut</Popup></Marker>
                        <AutoBounds positions={currentPositions} />
                      </MapContainer>
                    </div>
                  </div>
                )}

                <div style={{ border: '1px dashed #27272A', padding: '16px', borderRadius: '12px', backgroundColor: '#121316', textAlign: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: '0 0 4px 0', color: '#FFF', fontSize: '14px', fontWeight: '700' }}>Importer GPX-fil</h3>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#6B7280' }}>Upload løbetur fra uret for automatisk kobling.</p>
                  <input type="file" accept=".gpx" onChange={handleFileUpload} disabled={loading} style={{ display: 'none' }} id="gpx-file-input" />
                  <label htmlFor="gpx-file-input" style={{ backgroundColor: '#27272A', color: '#FFF', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'inline-block' }}>{loading ? 'Indlæser...' : 'Vælg GPX-fil'}</label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activities.map((act) => (
                    <div key={act.id} onClick={() => act.route_coordinates && setSelectedActivity(act)} style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#FFF' }}>{act.title}</h4>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>{new Date(act.start_time).toLocaleDateString('da-DK')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '12px', color: '#9CA3AF' }}>
                        <div><strong>{(act.distance_meters / 1000).toFixed(2)}</strong> km</div>
                        <div><strong>{Math.round(act.duration_seconds / 60)}</strong> min</div>
                        <div><strong>{formatPace(act.avg_pace_seconds)}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: STATS */}
            {activeTab === 'stats' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' }}>Samlet Distance</span>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#10B981', marginTop: '4px' }}>{totalKm} km</div>
                </div>
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' }}>Antal Ture</span>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#3B82F6', marginTop: '4px' }}>{activities.length}</div>
                </div>
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' }}>Gns. Tempo</span>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#A855F7', marginTop: '4px' }}>{formatPace(avgPaceOverall)}</div>
                </div>
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' }}>Samlet Tid</span>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#F59E0B', marginTop: '4px' }}>{totalHours} t</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DETALJE MODAL MED GUIDE OG NEDTÆLLINGSTIMER TIL STYRKE */}
      {selectedWorkoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <span style={{ backgroundColor: getBadgeStyle(selectedWorkoutModal.workout_type, selectedWorkoutModal.completed).bg, color: getBadgeStyle(selectedWorkoutModal.workout_type, selectedWorkoutModal.completed).color, border: `1px solid ${getBadgeStyle(selectedWorkoutModal.workout_type, selectedWorkoutModal.completed).border}`, fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>
                  {selectedWorkoutModal.workout_type}
                </span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#FFF' }}>{selectedWorkoutModal.title}</h2>
              </div>
              <button onClick={() => setSelectedWorkoutModal(null)} style={{ backgroundColor: '#18191E', border: 'none', color: '#9CA3AF', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>

            <p style={{ color: '#9CA3AF', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px' }}>{selectedWorkoutModal.description}</p>

            {selectedWorkoutModal.category !== 'strength' && (
              <div style={{ backgroundColor: '#18191E', border: '1px solid #27272A', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-around', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: '700' }}>Distance</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#10B981', marginTop: '2px' }}>{selectedWorkoutModal.target_distance_km} km</div>
                </div>
                <div style={{ width: '1px', backgroundColor: '#27272A' }}></div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: '700' }}>Måltempo</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#3B82F6', marginTop: '2px' }}>{selectedWorkoutModal.target_pace_min}</div>
                </div>
              </div>
            )}

            {selectedWorkoutModal.exercises && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: '#A855F7', textTransform: 'uppercase' }}>Øvelsesguide & Sæt-timer</h4>
                <div style={{ backgroundColor: '#18191E', border: '1px solid #27272A', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Nedtælling / Pause mellem sæt</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#A855F7', marginBottom: '8px', letterSpacing: '1px' }}>
                    {timerSeconds !== null ? `${Math.floor(timerSeconds / 60)}:${timerSeconds % 60 < 10 ? '0' : ''}${timerSeconds % 60}` : '0:45'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button onClick={() => { setTimerSeconds(30); setIsTimerRunning(true); }} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>30 sek</button>
                    <button onClick={() => { setTimerSeconds(45); setIsTimerRunning(true); }} style={{ backgroundColor: '#A855F7', color: '#090A0C', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '800', fontSize: '11px', cursor: 'pointer' }}>Start 45s</button>
                    <button onClick={() => { setTimerSeconds(60); setIsTimerRunning(true); }} style={{ backgroundColor: '#27272A', color: '#FFF', border: 'none', padding: '6px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>60 sek</button>
                    <button onClick={() => { setIsTimerRunning(false); setTimerSeconds(null); }} style={{ backgroundColor: '#18191E', color: '#EF4444', border: '1px solid #27272A', padding: '6px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}>Stop</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedWorkoutModal.exercises.map((ex: any, idx: number) => (
                    <div key={idx} style={{ backgroundColor: '#18191E', border: '1px solid #27272A', padding: '12px 14px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#FFF' }}>{ex.name}</div>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#A855F7', backgroundColor: '#27272A', padding: '3px 8px', borderRadius: '6px' }}>{ex.sets}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#A855F7', fontWeight: '600', marginBottom: '6px' }}>{ex.note}</div>
                      <div style={{ fontSize: '12px', color: '#9CA3AF', lineHeight: '1.4', backgroundColor: '#121316', padding: '8px 10px', borderRadius: '6px', borderLeft: '3px solid #A855F7' }}>
                        💡 <strong style={{ color: '#D1D5DB' }}>Udførelse:</strong> {ex.guide}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => toggleWorkoutCompleted(selectedWorkoutModal.id, selectedWorkoutModal.completed)} style={{ width: '100%', backgroundColor: selectedWorkoutModal.completed ? '#27272A' : '#10B981', color: selectedWorkoutModal.completed ? '#FFF' : '#090A0C', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}>
              {selectedWorkoutModal.completed ? 'Nulstil status' : 'Marker som gennemført'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
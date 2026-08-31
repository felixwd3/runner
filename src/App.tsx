import { useState, useEffect } from 'react';
import type { ChangeEvent, MouseEvent, FormEvent } from 'react';
import { supabase } from './supabaseClient';
import GPXParser from 'gpxparser';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css';

const startIcon = L.divIcon({
  html: `<div style="background-color: #10B981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const endIcon = L.divIcon({
  html: `<div style="background-color: #EF4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
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

const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_ATTRIBUTION = '&copy; OpenStreetMap';

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

  const [selectedWorkoutModal, setSelectedWorkoutModal] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [planFilter, setPlanFilter] = useState<'all' | 'running' | 'strength'>('all');
  const [planMode, setPlanMode] = useState<'maintenance' | 'race'>('maintenance');

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDistance, setEventDistance] = useState('10');

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

  const loadSavedActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('start_time', { ascending: false });

    if (!error && data) {
      setActivities(data);
      const firstWithRoute = data.find((a) => a.route_coordinates && a.route_coordinates.length > 0);
      if (firstWithRoute) setSelectedActivity(firstWithRoute);
    }
  };

  const loadWorkouts = async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .order('scheduled_date', { ascending: true });

    if (!error && data) setWorkouts(data);
  };

  const loadSavedRoutes = async () => {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setSavedRoutes(data);
  };

  const loadRaceEvents = async () => {
    const { data, error } = await supabase
      .from('race_events')
      .select('*')
      .order('event_date', { ascending: true });

    if (!error && data) {
      setRaceEvents(data);
      if (data.length > 0) setPlanMode('race');
    }
  };

  const toggleWorkoutCompleted = async (workoutId: string, currentStatus: boolean, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const { error } = await supabase
      .from('workouts')
      .update({ completed: !currentStatus, status: !currentStatus ? 'completed' : 'pending' })
      .eq('id', workoutId);

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

    const { error } = await supabase
      .from('workouts')
      .update({ scheduled_date: nextDay })
      .eq('id', workoutId);

    if (!error) loadWorkouts();
  };

  const deleteWorkout = async (workoutId: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId);

    if (!error) {
      loadWorkouts();
      if (selectedWorkoutModal?.id === workoutId) setSelectedWorkoutModal(null);
    }
  };

  const generateMaintenancePlan = async () => {
    if (!user) return;
    setLoading(true);

    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setRaceEvents([]);

    const today = new Date();
    const generatedWorkouts: any[] = [];

    for (let week = 1; week <= 4; week++) {
      const daysOffset = (week - 1) * 7;
      const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
      const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
      const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
      const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `Grundform: Roligt Løb`,
        category: 'running',
        workout_type: 'Easy',
        target_distance_km: 6,
        target_pace_min: '5:45 - 6:00',
        description: 'Roligt snakketempo i Zone 2. Bygger udholdenhed uden træningstræthed.',
        scheduled_date: tuesDate,
        completed: false,
        status: 'pending',
      });

      const isFartlek = week % 2 !== 0;
      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: isFartlek ? `Fartleg & Tempo` : `Temporyk (5x3 min)`,
        category: 'running',
        workout_type: 'Interval',
        target_distance_km: 6,
        target_pace_min: '5:00 - 5:15',
        description: isFartlek ? 'Leg med tempoet. Øg farten op ad bakker eller mellem markører.' : '1.5 km opvarmning + 5x3 min i højt tempo m. 90s jog + 1.5 km afjog.',
        scheduled_date: thursDate,
        completed: false,
        status: 'pending',
      });

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `Skadesforebyggelse & Core`,
        category: 'strength',
        workout_type: 'Styrke',
        target_distance_km: 0,
        target_pace_min: '35 min',
        description: 'Styrker sener, akillessener og core for optimal løbeøkonomi.',
        scheduled_date: friDate,
        completed: false,
        status: 'pending',
        exercises: [
          { name: 'Bulgarian Split Squats', sets: '3 sæt x 10 reps', note: 'Enkeltbens-stabilitet' },
          { name: 'Single-leg Calf Raises', sets: '3 sæt x 15 reps', note: 'Akillessene-forebyggelse' },
          { name: 'Sideplanke & Deadbugs', sets: '3 sæt x 45 sek', note: 'Core og lænd' },
        ],
      });

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `Weekend-Langtur (${week % 2 === 0 ? 10 : 8} km)`,
        category: 'running',
        workout_type: 'Long Run',
        target_distance_km: week % 2 === 0 ? 10 : 8,
        target_pace_min: '5:50 - 6:10',
        description: 'Ugens hyggelige langtur i afslappet tempo.',
        scheduled_date: sunDate,
        completed: false,
        status: 'pending',
      });
    }

    const { error } = await supabase.from('workouts').insert(generatedWorkouts);

    if (!error) {
      setPlanMode('maintenance');
      setSelectedWeek(1);
      await loadWorkouts();
    }
    setLoading(false);
  };

  const generateMultiWeekPlan = async (goalKm: number, totalWeeks: number = 8) => {
    if (!user) return;
    setLoading(true);

    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const today = new Date();
    const generatedWorkouts: any[] = [];

    for (let week = 1; week <= totalWeeks; week++) {
      const daysOffset = (week - 1) * 7;
      const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
      const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
      const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
      const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

      const isTaperWeek = week === totalWeeks;
      const longRunKm = isTaperWeek ? Math.round(goalKm * 0.5) : Math.min(goalKm, Math.round(4 + (week * (goalKm - 4)) / (totalWeeks - 1)));
      const easyRunKm = isTaperWeek ? 3 : Math.min(8, 3 + Math.floor(week / 2));

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: isTaperWeek ? 'Taper: Roligt afjog' : `Roligt Løb (Uge ${week})`,
        category: 'running',
        workout_type: 'Easy',
        target_distance_km: easyRunKm,
        target_pace_min: '5:45 - 6:00',
        description: 'Snakketempo. Hold pulsen sikkert i Zone 2.',
        scheduled_date: tuesDate,
        completed: false,
        status: 'pending',
      });

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: isTaperWeek ? 'Taper: Korte vækninger' : `Intervaller (${3 + week}x400m)`,
        category: 'running',
        workout_type: 'Interval',
        target_distance_km: Math.round(easyRunKm + 1.5),
        target_pace_min: '4:40 - 4:55',
        description: isTaperWeek ? '1 km opvarmning + 3x200m i måltempo.' : `1.5 km opvarmning + ${3 + week}x400m i Zone 4/5 m. 90s pause + afjog.`,
        scheduled_date: thursDate,
        completed: false,
        status: 'pending',
      });

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `Løbe-stabilitet & Core`,
        category: 'strength',
        workout_type: 'Styrke',
        target_distance_km: 0,
        target_pace_min: '40 min',
        description: 'Knæstabilitet, lægløft og baldeaktivering for bedre løbedynamik.',
        scheduled_date: friDate,
        completed: false,
        status: 'pending',
        exercises: [
          { name: 'Bulgarian Split Squats', sets: '3 sæt x 10 reps', note: 'Enkeltbens-styrke' },
          { name: 'Single-leg Calf Raises', sets: '3 sæt x 15 reps', note: 'Styrker akillessene og læg' },
          { name: 'Planke m. skulder-taps', sets: '3 sæt x 45 sek', note: 'Core-stabilitet' },
        ],
      });

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: isTaperWeek ? `MÅLLØB: ${goalKm} KM RACE DAY` : `Ugens Langtur (${longRunKm} km)`,
        category: 'running',
        workout_type: isTaperWeek ? 'Race' : 'Long Run',
        target_distance_km: isTaperWeek ? goalKm : longRunKm,
        target_pace_min: '5:50 - 6:10',
        description: isTaperWeek ? `I dag gælder det! Hold din planlagte pacing.` : `Ugens vigtigste udholdenhedspas. Bygger benenes styrke op.`,
        scheduled_date: sunDate,
        completed: false,
        status: 'pending',
      });
    }

    const { error } = await supabase.from('workouts').insert(generatedWorkouts);

    if (!error) {
      setPlanMode('race');
      setSelectedWeek(1);
      await loadWorkouts();
    }
    setLoading(false);
  };

  const handleCreateRaceEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !eventTitle || !eventDate) return;

    setLoading(true);
    const dist = parseFloat(eventDistance);

    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { error } = await supabase.from('race_events').insert([
      {
        user_id: user.id,
        title: eventTitle,
        event_date: eventDate,
        target_distance_km: dist,
      },
    ]);

    if (!error) {
      await generateMultiWeekPlan(dist, 8);
      setEventTitle('');
      setEventDate('');
      setShowEventForm(false);
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
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/foot/${waypointsString}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const routedCoordinates: [number, number][] = data.routes[0].geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );
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
      return;
    }

    setLoading(true);
    try {
      const waypointsString = newWaypoints.map((pt) => `${pt[1]},${pt[0]}`).join(';');
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/foot/${waypointsString}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const routedCoordinates: [number, number][] = data.routes[0].geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]]
        );
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

  const handleSaveRoute = async () => {
    if (!user || builderPath.length < 2 || !routeTitle) return;
    setLoading(true);

    const distMeters = calculateBuilderDistance();

    const { error } = await supabase.from('routes').insert([
      {
        user_id: user.id,
        title: routeTitle,
        distance_meters: distMeters,
        coordinates: builderPath,
      },
    ]);

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

    let gpxString = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Runner App">
  <trk>
    <name>${routeTitle || 'Egen Løberute'}</name>
    <trkseg>
`;

    builderPath.forEach(([lat, lng]) => {
      gpxString += `      <trkpt lat="${lat}" lon="${lng}"></trkpt>\n`;
    });

    gpxString += `    </trkseg>
  </trk>
</gpx>`;

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
          alert('Ingen gyldige spår fundet.');
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

        const splits: any[] = [];
        const elevationData: any[] = [];

        let currentSplitKm = 1;
        let accumDistance = 0;
        let lastSplitTime = track.points[0] ? new Date((track.points[0] as any).time).getTime() : 0;

        track.points.forEach((p: any, idx: number) => {
          if (idx % 5 === 0) {
            elevationData.push({
              dist: (p.cumulDistance / 1000).toFixed(2),
              ele: Math.round(p.ele || 0),
            });
          }

          accumDistance = p.cumulDistance;

          if (accumDistance >= currentSplitKm * 1000) {
            const currentTime = new Date(p.time).getTime();
            const splitDurationSec = Math.round((currentTime - lastSplitTime) / 1000);

            splits.push({
              km: currentSplitKm,
              paceSeconds: splitDurationSec,
              elevation: Math.round(p.ele || 0),
            });

            lastSplitTime = currentTime;
            currentSplitKm++;
          }
        });

        const routeCoords = track.points.map((p: any) => ({
          lat: p.lat,
          lng: p.lon,
          ele: p.ele,
          time: p.time,
        }));

        const runTitle = track.name || file.name.replace('.gpx', '') || 'Løbetur (GPX)';

        const { data: newActivity, error } = await supabase.from('activities').insert([
          {
            user_id: user.id,
            title: runTitle,
            distance_meters: distanceMeters,
            duration_seconds: durationSeconds,
            avg_pace_seconds: avgPaceSec,
            route_coordinates: routeCoords,
            splits: splits,
            elevation_profile: elevationData,
            start_time: startTime,
          },
        ]).select().single();

        if (!error && newActivity) {
          const openRunningWorkouts = workouts.filter(w => !w.completed && (w.category === 'running' || !w.category));
          
          if (openRunningWorkouts.length > 0) {
            let closestWorkout = openRunningWorkouts[0];
            let smallestDiff = Math.abs(closestWorkout.target_distance_km - distanceInKm);

            openRunningWorkouts.forEach(w => {
              const diff = Math.abs(w.target_distance_km - distanceInKm);
              if (diff < smallestDiff) {
                smallestDiff = diff;
                closestWorkout = w;
              }
            });

            await supabase.from('workouts').update({
              completed: true,
              status: 'completed',
              linked_activity_id: newActivity.id,
            }).eq('id', closestWorkout.id);

            alert(`Pas Matched! Turen er koblet på dit planlagte pas: "${closestWorkout.title}"`);
          }

          await loadSavedActivities();
          await loadWorkouts();
        }
      } catch (err: any) {
        alert('Fejl ved læsning af GPX-fil: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
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

  const currentPositions: [number, number][] =
    selectedActivity?.route_coordinates?.map((p: any) => [p.lat, p.lng]) || [];

  const defaultMapCenter: [number, number] = [55.6761, 12.5683];

  const maxWeekInPlan = workouts.length > 0 ? Math.max(...workouts.map(w => w.week_number || 1)) : 4;

  const currentWeekWorkouts = workouts.filter(w => (w.week_number || 1) === selectedWeek).filter(w => {
    if (planFilter === 'running') return w.category === 'running' || !w.category;
    if (planFilter === 'strength') return w.category === 'strength';
    return true;
  });

  const weekTotalKmPlanned = currentWeekWorkouts.reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);
  const weekCompletedKm = currentWeekWorkouts.filter(w => w.completed).reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);
  const weekProgressPct = weekTotalKmPlanned > 0 ? Math.round((weekCompletedKm / weekTotalKmPlanned) * 100) : 0;

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
        
        {/* APP HEADER MED LOGO.PNG */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/logo.png" alt="Runner Logo" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
          </div>

          {user && (
            <button onClick={() => supabase.auth.signOut()} style={{ backgroundColor: '#18191E', color: '#9CA3AF', border: '1px solid #27272A', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              Log ud
            </button>
          )}
        </div>

        {!user ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#121316', borderRadius: '16px', border: '1px solid #27272A', marginTop: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '8px', color: '#FFFFFF' }}>Log ind på din profil</h2>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '24px' }}>Struktureret træningsstyring og rutebygger.</p>
            <button
              onClick={handleGoogleLogin}
              style={{ backgroundColor: '#F3F4F6', color: '#090A0C', border: 'none', padding: '14px 28px', borderRadius: '8px', fontSize: '15px', fontWeight: '800', cursor: 'pointer' }}
            >
              Fortsæt med Google
            </button>
          </div>
        ) : (
          <div>
            {/* MAIN NAVIGATION */}
            <div style={{ display: 'flex', backgroundColor: '#121316', borderRadius: '12px', padding: '4px', marginBottom: '20px', border: '1px solid #27272A' }}>
              <button
                onClick={() => setActiveTab('plan')}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '10px 0',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'plan' ? '#27272A' : 'transparent',
                  color: activeTab === 'plan' ? '#FFFFFF' : '#9CA3AF',
                }}
              >
                Plan
              </button>
              <button
                onClick={() => setActiveTab('builder')}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '10px 0',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'builder' ? '#27272A' : 'transparent',
                  color: activeTab === 'builder' ? '#FFFFFF' : '#9CA3AF',
                }}
              >
                Ruter
              </button>
              <button
                onClick={() => setActiveTab('feed')}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '10px 0',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'feed' ? '#27272A' : 'transparent',
                  color: activeTab === 'feed' ? '#FFFFFF' : '#9CA3AF',
                }}
              >
                Løb
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '10px 0',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'stats' ? '#27272A' : 'transparent',
                  color: activeTab === 'stats' ? '#FFFFFF' : '#9CA3AF',
                }}
              >
                Stats
              </button>
            </div>

            {/* TAB 1: PLAN */}
            {activeTab === 'plan' && (
              <div>
                {/* HERO CARD */}
                <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', color: planMode === 'maintenance' ? '#3B82F6' : '#10B981', letterSpacing: '1px' }}>
                        {planMode === 'maintenance' ? 'Grundtræning' : 'Målløb'}
                      </span>
                      <h2 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: '800', color: '#FFFFFF' }}>
                        {planMode === 'maintenance'
                          ? 'Hold i Form'
                          : raceEvents.length > 0
                          ? `${raceEvents[0].title}`
                          : 'Målløb Forløb'}
                      </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={generateMaintenancePlan}
                        style={{ backgroundColor: planMode === 'maintenance' ? '#27272A' : '#18191E', color: planMode === 'maintenance' ? '#FFFFFF' : '#9CA3AF', border: '1px solid #27272A', padding: '8px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Hold i Form
                      </button>
                      <button
                        onClick={() => setShowEventForm(!showEventForm)}
                        style={{ backgroundColor: planMode === 'race' ? '#27272A' : '#18191E', color: planMode === 'race' ? '#FFFFFF' : '#9CA3AF', border: '1px solid #27272A', padding: '8px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Målløb
                      </button>
                    </div>
                  </div>

                  {showEventForm && (
                    <form onSubmit={handleCreateRaceEvent} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #27272A' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Navn på løb</label>
                        <input
                          type="text"
                          placeholder="f.eks. Copenhagen Half Marathon"
                          value={eventTitle}
                          onChange={(e) => setEventTitle(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }}
                          required
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Dato</label>
                          <input
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }}
                            required
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Distance</label>
                          <select
                            value={eventDistance}
                            onChange={(e) => setEventDistance(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }}
                          >
                            <option value="5">5 km</option>
                            <option value="10">10 km</option>
                            <option value="21.1">Halvmaraton (21.1 km)</option>
                            <option value="42.2">Maraton (42.2 km)</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
                      >
                        Generer Program
                      </button>
                    </form>
                  )}
                </div>

                {workouts.length === 0 ? (
                  <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '30px 20px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700', color: '#FFFFFF' }}>Ingen aktiv træningsplan</h3>
                    <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>Vælg en tilstand for at generere dit træningsforløb.</p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button onClick={generateMaintenancePlan} disabled={loading} style={{ backgroundColor: '#27272A', color: '#FFF', border: '1px solid #3F3F46', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                        Hold i Form
                      </button>
                      <button onClick={() => setShowEventForm(true)} disabled={loading} style={{ backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                        Sæt Målløb
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* WEEK NAVIGATION & PROGRESS */}
                    <div style={{ backgroundColor: '#121316', border: '1px solid #27272A', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <button
                          onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                          disabled={selectedWeek === 1}
                          style={{ backgroundColor: '#18191E', border: '1px solid #27272A', color: '#FFF', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', opacity: selectedWeek === 1 ? 0.3 : 1, fontWeight: 'bold' }}
                        >
                          ‹
                        </button>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', color: '#9CA3AF', letterSpacing: '1px' }}>
                            Uge {selectedWeek} af {maxWeekInPlan}
                          </span>
                          <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: '800', color: '#FFF' }}>
                            {weekCompletedKm} / {weekTotalKmPlanned} km gennemført
                          </h3>
                        </div>
                        <button
                          onClick={() => setSelectedWeek(Math.min(maxWeekInPlan, selectedWeek + 1))}
                          disabled={selectedWeek === maxWeekInPlan}
                          style={{ backgroundColor: '#18191E', border: '1px solid #27272A', color: '#FFF', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', opacity: selectedWeek === maxWeekInPlan ? 0.3 : 1, fontWeight: 'bold' }}
                        >
                          ›
                        </button>
                      </div>

                      <div style={{ backgroundColor: '#18191E', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${weekProgressPct}%`, height: '100%', backgroundColor: '#10B981', transition: 'width 0.3s ease' }}></div>
                      </div>
                    </div>

                    {/* FILTER TABS */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button
                        onClick={() => setPlanFilter('all')}
                        style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', border: '1px solid #27272A', backgroundColor: planFilter === 'all' ? '#27272A' : '#121316', color: planFilter === 'all' ? '#FFFFFF' : '#9CA3AF', cursor: 'pointer' }}
                      >
                        Alle ({currentWeekWorkouts.length})
                      </button>
                      <button
                        onClick={() => setPlanFilter('running')}
                        style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', border: '1px solid #27272A', backgroundColor: planFilter === 'running' ? '#27272A' : '#121316', color: planFilter === 'running' ? '#FFFFFF' : '#9CA3AF', cursor: 'pointer' }}
                      >
                        Løb
                      </button>
                      <button
                        onClick={() => setPlanFilter('strength')}
                        style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', border: '1px solid #27272A', backgroundColor: planFilter === 'strength' ? '#27272A' : '#121316', color: planFilter === 'strength' ? '#FFFFFF' : '#9CA3AF', cursor: 'pointer' }}
                      >
                        Styrke
                      </button>
                    </div>

                    {/* WORKOUT LIST */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {currentWeekWorkouts.map((w) => {
                        const isCompleted = w.completed;
                        const badge = getBadgeStyle(w.workout_type, isCompleted);
                        const isStrength = w.category === 'strength';

                        const formattedDate = w.scheduled_date
                          ? new Date(w.scheduled_date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })
                          : '';

                        return (
                          <div
                            key={w.id}
                            onClick={() => setSelectedWorkoutModal(w)}
                            style={{
                              backgroundColor: '#121316',
                              border: `1px solid ${isCompleted ? '#10B981' : '#27272A'}`,
                              borderRadius: '12px',
                              padding: '16px',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.5px' }}>
                                  {badge.label}
                                </span>
                                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600' }}>
                                  {formattedDate}
                                </span>
                              </div>

                              <button
                                onClick={(e) => toggleWorkoutCompleted(w.id, isCompleted, e)}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  border: isCompleted ? 'none' : '1px solid #3F3F46',
                                  backgroundColor: isCompleted ? '#10B981' : 'transparent',
                                  color: '#090A0C',
                                  fontWeight: '900',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isCompleted ? '✓' : ''}
                              </button>
                            </div>

                            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: isCompleted ? '#6B7280' : '#FFF', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                              {w.title}
                            </h3>

                            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#9CA3AF', lineHeight: '1.4' }}>
                              {w.description}
                            </p>

                            {!isStrength && (
                              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#D1D5DB', fontWeight: '600' }}>
                                <div>Mål: <span style={{ color: '#FFF' }}>{w.target_distance_km} km</span></div>
                                <div>Tempo: <span style={{ color: '#FFF' }}>{w.target_pace_min}</span></div>
                              </div>
                            )}

                            {isStrength && w.exercises && (
                              <div style={{ fontSize: '12px', color: '#A855F7', fontWeight: '600' }}>
                                {w.exercises.length} øvelser i passet
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #18191E' }}>
                              <button
                                onClick={(e) => postponeWorkout(w.id, w.scheduled_date, e)}
                                style={{ backgroundColor: '#18191E', border: '1px solid #27272A', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#9CA3AF', cursor: 'pointer' }}
                              >
                                Udskyd +1 dag
                              </button>
                              <button
                                onClick={(e) => deleteWorkout(w.id, e)}
                                style={{ backgroundColor: '#18191E', border: '1px solid #27272A', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#EF4444', cursor: 'pointer' }}
                              >
                                Drop pas
                              </button>
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
                      <span style={{ fontSize: '18px', fontWeight: '800', color: '#10B981' }}>
                        {(calculateBuilderDistance() / 1000).toFixed(2)} km
                      </span>
                    </div>
                  </div>

                  <div style={{ height: '320px', width: '100%', position: 'relative' }}>
                    <MapContainer
                      center={builderWaypoints.length > 0 ? builderWaypoints[0] : defaultMapCenter}
                      zoom={13}
                      scrollWheelZoom={true}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                      <Polyline positions={builderPath} pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.9 }} />

                      {builderWaypoints.map((pt, idx) => (
                        <Marker
                          key={idx}
                          position={pt}
                          icon={idx === 0 ? startIcon : idx === builderWaypoints.length - 1 ? endIcon : waypointIcon}
                        />
                      ))}

                      <RouteBuilderClicker onPointAdd={handleAddWaypoint} />
                    </MapContainer>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: '#121316' }}>
                    <input
                      type="text"
                      placeholder="Rutenavn (f.eks. Amager Fælled 10k)"
                      value={routeTitle}
                      onChange={(e) => setRouteTitle(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#090A0C', color: '#FFF', marginBottom: '12px', boxSizing: 'border-box' }}
                    />

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleSaveRoute}
                        disabled={builderPath.length < 2 || !routeTitle || loading}
                        style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', opacity: builderPath.length < 2 || !routeTitle ? 0.4 : 1 }}
                      >
                        Gem Rute
                      </button>
                      <button
                        onClick={exportBuilderGPX}
                        disabled={builderPath.length < 2}
                        style={{ flex: 1, backgroundColor: '#27272A', color: '#FFF', border: '1px solid #3F3F46', padding: '10px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: builderPath.length < 2 ? 0.4 : 1 }}
                      >
                        Eksporter GPX
                      </button>
                      <button
                        onClick={handleUndo}
                        disabled={builderWaypoints.length === 0}
                        style={{ backgroundColor: '#18191E', color: '#9CA3AF', border: '1px solid #27272A', padding: '10px 14px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
                      >
                        Angre
                      </button>
                    </div>
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color: '#FFFFFF' }}>Gemte Ruter</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedRoutes.map((r) => (
                    <div key={r.id} style={{ backgroundColor: '#121316', border: '1px solid #27272A', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: '700', color: '#FFF' }}>{r.title}</h4>
                        <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '700' }}>
                          {(r.distance_meters / 1000).toFixed(2)} km
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setBuilderWaypoints(r.coordinates);
                          setBuilderPath(r.coordinates);
                          setRouteTitle(r.title);
                        }}
                        style={{ backgroundColor: '#18191E', color: '#3B82F6', border: '1px solid #27272A', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                      >
                        Vis på kort
                      </button>
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
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
                          {new Date(selectedActivity.start_time).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: '#10B981' }}>
                          {(selectedActivity.distance_meters / 1000).toFixed(2)} km
                        </span>
                        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                          {formatPace(selectedActivity.avg_pace_seconds)}
                        </div>
                      </div>
                    </div>

                    <div style={{ height: '280px', width: '100%', position: 'relative' }}>
                      <MapContainer center={currentPositions[0]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                        <Polyline positions={currentPositions} pathOptions={{ color: '#10B981', weight: 4, opacity: 0.9 }} />
                        <Marker position={currentPositions[0]} icon={startIcon}><Popup>Start</Popup></Marker>
                        <Marker position={currentPositions[currentPositions.length - 1]} icon={endIcon}><Popup>Slut</Popup></Marker>
                        <AutoBounds positions={currentPositions} />
                      </MapContainer>
                    </div>

                    {selectedActivity?.elevation_profile && selectedActivity.elevation_profile.length > 0 && (
                      <div style={{ padding: '16px', borderTop: '1px solid #27272A' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>Højdeprofil (m)</h4>
                        <div style={{ height: '100px', width: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={selectedActivity.elevation_profile}>
                              <XAxis dataKey="dist" unit="km" stroke="#4B5563" tick={{ fontSize: 10 }} />
                              <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                              <Tooltip formatter={(value: any) => [`${value} m`, 'Højde']} />
                              <Area type="monotone" dataKey="ele" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ border: '1px dashed #27272A', padding: '16px', borderRadius: '12px', backgroundColor: '#121316', textAlign: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: '0 0 4px 0', color: '#FFF', fontSize: '14px', fontWeight: '700' }}>Importer GPX-fil</h3>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#6B7280' }}>Upload løbetur fra uret for automatisk kobling.</p>
                  <input type="file" accept=".gpx" onChange={handleFileUpload} disabled={loading} style={{ display: 'none' }} id="gpx-file-input" />
                  <label htmlFor="gpx-file-input" style={{ backgroundColor: '#27272A', color: '#FFF', border: '1px solid #3F3F46', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', display: 'inline-block' }}>
                    {loading ? 'Indlæser...' : 'Vælg GPX-fil'}
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => act.route_coordinates && setSelectedActivity(act)}
                      style={{
                        backgroundColor: '#121316',
                        border: '1px solid #27272A',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
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

      {/* DETALJE MODAL */}
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
              <button onClick={() => setSelectedWorkoutModal(null)} style={{ backgroundColor: '#18191E', border: '1px solid #27272A', color: '#9CA3AF', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
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
                <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '800', color: '#A855F7', textTransform: 'uppercase' }}>Øvelser</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedWorkoutModal.exercises.map((ex: any, idx: number) => (
                    <div key={idx} style={{ backgroundColor: '#18191E', border: '1px solid #27272A', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#FFF' }}>{ex.name}</div>
                        <div style={{ fontSize: '11px', color: '#6B7280' }}>{ex.note}</div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#A855F7' }}>{ex.sets}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => toggleWorkoutCompleted(selectedWorkoutModal.id, selectedWorkoutModal.completed)}
              style={{ width: '100%', backgroundColor: selectedWorkoutModal.completed ? '#27272A' : '#10B981', color: selectedWorkoutModal.completed ? '#FFF' : '#090A0C', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
            >
              {selectedWorkoutModal.completed ? 'Nulstil status' : 'Marker som gennemført'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
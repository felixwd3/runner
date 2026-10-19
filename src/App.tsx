import { useState, useEffect } from 'react';
import type { MouseEvent, FormEvent } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css';
import { generateTrainingPlan } from './utils/trainingEngine';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const startIcon = L.divIcon({ html: `<div style="background-color: var(--accent-primary); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px var(--accent-primary);"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
const endIcon = L.divIcon({ html: `<div style="background-color: var(--text-primary); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(255,255,255,0.5);"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
const waypointIcon = L.divIcon({ html: `<div style="background-color: var(--accent-secondary); width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`, className: '', iconSize: [8, 8], iconAnchor: [4, 4] });

const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors';

function RouteBuilderClicker({ onPointAdd }: { onPointAdd: (latlng: [number, number]) => void }) {
  useMapEvents({ click(e) { onPointAdd([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

const formatDuration = (totalSeconds: number) => {
  if (!totalSeconds) return '--:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// OPPDATERET LOGIK: Smartere frasortering
const getActivityTypeAndPace = (w: any) => {
  if (w.category === 'strength') return { type: 'styrke', paceSecs: 0 };
  
  // Hvis pacet mangler eller er defekt (-:-), smider vi den i gåture
  if (!w.actual_pace_min || w.actual_pace_min === '-:-' || !w.actual_pace_min.includes(':')) {
    return { type: 'gåtur', paceSecs: 0 };
  }
  
  const parts = w.actual_pace_min.split(':');
  const paceSecs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  
  // Sikkerhedsnet mod forkerte tal
  if (isNaN(paceSecs)) return { type: 'gåtur', paceSecs: 0 };
  
  let type = 'løb';
  // Langsommere end 8:00 min/km = Gåtur
  if (paceSecs >= 480) type = 'gåtur';
  // Hurtigere end 3:45 min/km = Cykel
  else if (paceSecs <= 225) type = 'cykel';
  
  return { type, paceSecs };
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [shoes, setShoes] = useState<any[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'hjem' | 'ruter' | 'statistik' | 'coach' | 'mere'>('hjem');
  const [isClient, setIsClient] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [selectedWorkoutModal, setSelectedWorkoutModal] = useState<any>(null);

  const [showCoachWizard, setShowCoachWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [coachDistance, setCoachDistance] = useState<string>('10k');
  const [coachDays, setCoachDays] = useState<number>(4);
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 56);
  const [targetDate, setTargetDate] = useState<string>(defaultDate.toISOString().split('T')[0]);
  const [manualLongestRun, setManualLongestRun] = useState<string>('5');
  const [aiMessage, setAiMessage] = useState<string>('');

  const [bodyIssue, setBodyIssue] = useState('');
  const [aiBodyAdvice, setAiBodyAdvice] = useState('');

  const [shoeName, setShoeName] = useState('');
  const [shoeMaxKm, setShoeMaxKm] = useState('700');

  const [weightVal, setWeightVal] = useState('');
  const [waistVal, setWaistVal] = useState('');
  const [chestVal, setChestVal] = useState('');
  const [thighVal, setThighVal] = useState('');
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);

  const [builderWaypoints, setBuilderWaypoints] = useState<[number, number][]>([]);
  const [builderPath, setBuilderPath] = useState<[number, number][]>([]);
  const [routeTitle, setRouteTitle] = useState('');

  useEffect(() => {
    setIsClient(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData();
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadWorkouts = async () => {
    const { data, error } = await supabase.from('runner_workouts').select('*').order('scheduled_date', { ascending: true });
    if (!error && data) setWorkouts(data);
  };

  const loadSavedRoutes = async () => {
    const { data, error } = await supabase.from('runner_routes').select('*').order('created_at', { ascending: false });
    if (!error && data) setSavedRoutes(data);
  };

  const loadShoes = async () => {
    const { data, error } = await supabase.from('runner_shoes').select('*').order('created_at', { ascending: false });
    if (!error && data) setShoes(data);
  };

  const loadBodyMetrics = async () => {
    const { data, error } = await supabase.from('runner_body_metrics').select('*').order('recorded_date', { ascending: true });
    if (!error && data) setBodyMetrics(data);
  };

  const loadData = async () => {
    await Promise.all([loadWorkouts(), loadSavedRoutes(), loadShoes(), loadBodyMetrics()]);
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) { setAuthError('Konto oprettet! Prøv at trykke Log ind.'); setIsSignUp(false); }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError('Forkert e-mail eller adgangskode.');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const completedWorkoutsAll = workouts.filter(w => w.completed && w.actual_distance_km).sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
  const completedRuns = completedWorkoutsAll.filter(w => getActivityTypeAndPace(w).type === 'løb');
  const completedWalks = completedWorkoutsAll.filter(w => getActivityTypeAndPace(w).type === 'gåtur');
  const completedCycles = completedWorkoutsAll.filter(w => getActivityTypeAndPace(w).type === 'cykel');
  const plannedWorkouts = workouts.filter(w => !w.completed || !w.actual_distance_km);
  const lastWorkout = completedRuns.length > 0 ? completedRuns[0] : null;
  const maxWeekInPlan = plannedWorkouts.length > 0 ? Math.max(...plannedWorkouts.map(w => w.week_number || 1)) : 10;
  
  const totalPlanDistance = workouts.reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);
  const totalActualDistance = completedRuns.reduce((sum, w) => sum + (w.actual_distance_km || 0), 0);
  const userLevel = Math.floor(completedRuns.length / 5) + 1;
  const userXp = completedRuns.length * 150;
  
  let totalRunPaceSecs = 0;
  let validPaceCount = 0;
  completedRuns.forEach(w => {
    const paceSecs = getActivityTypeAndPace(w).paceSecs;
    if (paceSecs > 0) {
      totalRunPaceSecs += paceSecs;
      validPaceCount++;
    }
  });
  const avgRunPace = validPaceCount > 0 ? totalRunPaceSecs / validPaceCount : 0;
  const avgPaceStr = avgRunPace > 0 ? `${Math.floor(avgRunPace/60)}:${Math.floor(avgRunPace%60).toString().padStart(2,'0')}` : '-:-';

  const statChartData = [...completedRuns].reverse().slice(-7).map(w => ({
    name: new Date(w.scheduled_date).toLocaleDateString('da-DK', { day: 'numeric', month: 'numeric' }),
    km: w.actual_distance_km
  }));

  const calculateRunnerProfile = () => {
    const validRuns = completedRuns.filter(w => (w.actual_distance_km || 0) >= 1.5);
    if (validRuns.length === 0) return null;
    
    const longestRun = Math.max(...validRuns.map(w => w.actual_distance_km || 0));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
    const recentRuns = validRuns.filter(w => new Date(w.scheduled_date) >= thirtyDaysAgo);
    
    const recentVolume = recentRuns.reduce((sum, w) => sum + (w.actual_distance_km || 0), 0);
    const avgWeeklyVolume = Math.round((recentVolume / 4) * 10) / 10;

    return {
      longestRun: longestRun > 0 ? longestRun : null,
      avgWeeklyVolume,
      recentRunsCount: recentRuns.length
    };
  };

  const runnerProfile = calculateRunnerProfile();

  const handleAddShoe = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !shoeName) return;
    const { error } = await supabase.from('runner_shoes').insert([{ user_id: user.id, name: shoeName, max_km: parseFloat(shoeMaxKm) || 700, current_km: 0 }]);
    if (!error) { setShoeName(''); loadShoes(); }
  };

  const handleDeleteShoe = async (id: string) => {
    const { error } = await supabase.from('runner_shoes').delete().eq('id', id);
    if (!error) loadShoes();
  };

  const handleSaveWeightAndMetrics = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !weightVal) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const payload: any = { user_id: user.id, weight_kg: parseFloat(weightVal), recorded_date: todayStr };
    if (waistVal) payload.waist_cm = parseFloat(waistVal);
    if (chestVal) payload.chest_cm = parseFloat(chestVal);
    if (thighVal) payload.thigh_cm = parseFloat(thighVal);

    if (editingMetricId) {
      const { error } = await supabase.from('runner_body_metrics').update(payload).eq('id', editingMetricId);
      if (!error) { setEditingMetricId(null); resetWeightForm(); loadBodyMetrics(); }
    } else {
      const { error } = await supabase.from('runner_body_metrics').insert([payload]);
      if (!error) { resetWeightForm(); loadBodyMetrics(); }
    }
  };

  const resetWeightForm = () => { setWeightVal(''); setWaistVal(''); setChestVal(''); setThighVal(''); setEditingMetricId(null); };
  const handleEditMetric = (m: any) => { setEditingMetricId(m.id); setWeightVal(m.weight_kg?.toString() || ''); setWaistVal(m.waist_cm?.toString() || ''); setChestVal(m.chest_cm?.toString() || ''); setThighVal(m.thigh_cm?.toString() || ''); };
  const handleDeleteMetric = async (id: string) => { const { error } = await supabase.from('runner_body_metrics').delete().eq('id', id); if (!error) loadBodyMetrics(); };

  const analyzeBodyIssue = () => {
    if (!bodyIssue) return;
    setAiBodyAdvice('💡 AI Coach Råd: Sørg for at lytte til kroppen. Læg 1-2 ekstra hviledage ind eller fokusér på aktiv restitution.');
  };

  const toggleWorkoutCompleted = async (workoutId: string, currentStatus: boolean, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const { error } = await supabase.from('runner_workouts').update({ completed: !currentStatus, status: !currentStatus ? 'completed' : 'pending' }).eq('id', workoutId);
    if (!error) {
      loadWorkouts();
      if (selectedWorkoutModal && selectedWorkoutModal.id === workoutId) setSelectedWorkoutModal({ ...selectedWorkoutModal, completed: !currentStatus });
    }
  };

  const generatePersonalizedCoachPlan = async () => {
    if (!user) return;
    setLoading(true);
    
    await supabase.from('runner_workouts').delete().eq('user_id', user.id).eq('completed', false);
    
    const today = new Date();
    const target = new Date(targetDate);
    const diffTime = Math.abs(target.getTime() - today.getTime());
    const calculatedWeeks = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)));

    const effectiveLongest = runnerProfile?.longestRun || parseFloat(manualLongestRun) || 5;
    let tempLevel = 'Beginner';
    if (effectiveLongest >= 10) tempLevel = 'Intermediate';
    if (effectiveLongest >= 18) tempLevel = 'Advanced';
    if (effectiveLongest >= 30) tempLevel = 'Elite';

    const generatedWorkouts = generateTrainingPlan(user.id, {
      level: tempLevel as any,
      distance: coachDistance,
      daysPerWeek: coachDays,
      weeks: calculatedWeeks
    });

    const { error } = await supabase.from('runner_workouts').insert(generatedWorkouts);
    if (!error) {
      setShowCoachWizard(false); 
      setWizardStep(1); 
      setAiMessage(`🤖 AI Coach: Din nye ${coachDays}-dages træningsplan frem mod ${new Date(targetDate).toLocaleDateString('da-DK', {day: 'numeric', month: 'short'})} er klar!`);
      setActiveTab('coach'); 
      await loadWorkouts();
    }
    setLoading(false);
  };

  const handleAddWaypoint = async (newPt: [number, number]) => {
    const newWaypoints = [...builderWaypoints, newPt];
    setBuilderWaypoints(newWaypoints);
    if (newWaypoints.length === 1) { setBuilderPath([newPt]); return; }
    setLoading(true);
    try {
      const waypointsString = newWaypoints.map((pt) => `${pt[1]},${pt[0]}`).join(';');
      const response = await fetch(`https://router.project-osrm.org/route/v1/foot/${waypointsString}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        const routedCoordinates: [number, number][] = data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
        setBuilderPath(routedCoordinates);
      } else setBuilderPath(newWaypoints);
    } catch { setBuilderPath(newWaypoints); } finally { setLoading(false); }
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

  const handleSaveRoute = async () => {
    if (!user || builderPath.length < 2 || !routeTitle) return;
    setLoading(true);
    const distMeters = calculateBuilderDistance();
    const { error } = await supabase.from('runner_routes').insert([{ user_id: user.id, title: routeTitle, distance_meters: distMeters, coordinates: builderPath }]);
    if (!error) { setRouteTitle(''); setBuilderWaypoints([]); setBuilderPath([]); await loadSavedRoutes(); }
    setLoading(false);
  };

  const renderWorkoutCard = (w: any, icon: string, defaultTitle: string) => {
    const formattedDate = new Date(w.scheduled_date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
    const displayTitle = w.title === 'Uplanlagt løbetur' ? defaultTitle : w.title;
    return (
      <div key={w.id} onClick={() => setSelectedWorkoutModal(w)} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>{formattedDate}</div>
          <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>{displayTitle}</div>
          <div style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '600' }}>
            {w.actual_distance_km} km • {w.actual_pace_min || '-:-'}/km
          </div>
        </div>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(80, 230, 172, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>{icon}</div>
      </div>
    );
  };

  if (!isClient) return <div style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh' }}></div>;

  return (
    <div style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: 'Inter, -apple-system, sans-serif', paddingBottom: '100px' }}>
      
      {!user ? (
        <div style={{ padding: '40px 20px', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px' }}>RunQuest</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '32px' }}>Bedre løb. Større oplevelser.</p>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', border: '1px solid var(--border-subtle)' }}>
            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '12px', boxSizing: 'border-box' }} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Adgangskode" required style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '20px', boxSizing: 'border-box' }} />
              {authError && <div style={{ color: '#EF4444', fontSize: '13px', fontWeight: '600', textAlign: 'center', marginBottom: '16px' }}>{authError}</div>}
              <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '16px', borderRadius: '14px', fontWeight: '800', fontSize: '15px', cursor: 'pointer', marginBottom: '16px' }}>
                {loading ? 'Indlæser...' : isSignUp ? 'Opret konto' : 'Log ind'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                  {isSignUp ? 'Har du allerede en konto? Log ind' : 'Opret ny konto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          
          {/* HJEM */}
          {activeTab === 'hjem' && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>⛰️</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>RunQuest</span>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)' }}>
                  {user.email.substring(0, 1).toUpperCase()}
                </div>
              </div>

              <div style={{ 
                backgroundImage: 'linear-gradient(to bottom, rgba(7, 17, 22, 0.2) 0%, rgba(7, 17, 22, 0.6) 60%, var(--bg-main) 100%), url("https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=1000&auto=format&fit=crop")',
                backgroundSize: 'cover', backgroundPosition: 'center', height: '500px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '24px', boxSizing: 'border-box'
              }}>
                {lastWorkout ? (
                  <>
                    <h1 style={{ fontSize: '64px', fontWeight: '900', color: 'var(--text-primary)', margin: '0 0 -8px 0', letterSpacing: '-2px' }}>
                      {lastWorkout.actual_distance_km?.toFixed(2).replace('.', ',')} km
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500', margin: '0 0 32px 0' }}>
                      {new Date(lastWorkout.scheduled_date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                    <div style={{ display: 'flex', gap: '32px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Tid</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                          {lastWorkout.actual_duration_seconds ? formatDuration(lastWorkout.actual_duration_seconds) : '--:--'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pace</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                          {lastWorkout.actual_pace_min || '-:-'} <span style={{fontSize:'14px', color:'var(--text-secondary)', fontWeight:'500'}}>/km</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Puls</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                          {lastWorkout.avg_heart_rate || '---'} <span style={{fontSize:'14px', color:'var(--text-secondary)', fontWeight:'500'}}>bpm</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 style={{ fontSize: '48px', fontWeight: '900', color: 'var(--text-primary)', margin: '0 0 8px 0', letterSpacing: '-1px' }}>Klar til start</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500', margin: '0 0 32px 0' }}>Ingen registrerede løbeture endnu.</p>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-35px', marginBottom: '32px', position: 'relative', zIndex: 20 }}>
                <button onClick={() => setActiveTab('ruter')} style={{ 
                  width: '70px', height: '70px', borderRadius: '50%', backgroundColor: 'var(--bg-main)', border: '2px solid var(--accent-primary)', 
                  color: 'var(--accent-primary)', fontSize: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 24px rgba(80, 230, 172, 0.2)'
                }}>▶</button>
              </div>

              {aiMessage && <div style={{ margin: '0 16px 20px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-primary)', padding: '12px', borderRadius: '12px', fontSize: '12px', color: 'var(--accent-primary)' }}>{aiMessage}</div>}

              <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '20px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Næste Mål</h3>
                    <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '600', backgroundColor: 'rgba(80,230,172,0.1)', padding: '4px 8px', borderRadius: '8px' }}>På vej</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', backgroundImage: 'url("https://images.unsplash.com/photo-1551632811-561f3222ef86?q=80&w=200&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>RunQuest Forløb</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{totalActualDistance.toFixed(1)} / {totalPlanDistance.toFixed(1)} km</div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (totalActualDistance / (totalPlanDistance || 1)) * 100)}%`, height: '100%', backgroundColor: 'var(--accent-primary)' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RUTER */}
          {activeTab === 'ruter' && (
            <div style={{ padding: '24px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Ruter</h2>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>Alle</button>
                <button style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>Natur</button>
                <button style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>By</button>
                <button style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', borderRadius: '20px', padding: '8px 16px', fontWeight: '700', fontSize: '13px', border: 'none', whiteSpace: 'nowrap' }}>Mine Ruter</button>
              </div>

              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '24px', overflow: 'hidden', marginBottom: '32px' }}>
                <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                  <MapContainer center={builderWaypoints.length > 0 ? builderWaypoints[0] : [55.6761, 12.5683]} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                    <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                    <Polyline positions={builderPath} pathOptions={{ color: 'var(--accent-primary)', weight: 5, opacity: 0.9 }} />
                    {builderWaypoints.map((pt, idx) => (
                      <Marker key={idx} position={pt} icon={idx === 0 ? startIcon : idx === builderWaypoints.length - 1 ? endIcon : waypointIcon} />
                    ))}
                    <RouteBuilderClicker onPointAdd={handleAddWaypoint} />
                  </MapContainer>
                </div>
                <div style={{ padding: '20px' }}>
                  <input type="text" placeholder="Navngiv ny rute..." value={routeTitle} onChange={(e) => setRouteTitle(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '16px', boxSizing: 'border-box', fontSize: '14px' }} />
                  <button onClick={handleSaveRoute} disabled={builderPath.length < 2 || !routeTitle || loading} style={{ width: '100%', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Gem Rute</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {savedRoutes.map((r) => (
                  <div key={r.id} onClick={() => { setBuilderWaypoints(r.coordinates); setBuilderPath(r.coordinates); setRouteTitle(r.title); }} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', padding: '16px', borderRadius: '20px', display: 'flex', gap: '16px', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ width: '70px', height: '70px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', backgroundImage: 'url("https://images.unsplash.com/photo-1519331379826-f10be5486c6f?q=80&w=200&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>{r.title}</div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        <span>{(r.distance_meters / 1000).toFixed(2)} km</span>
                        <span>•</span>
                        <span>{Math.round((r.distance_meters / 1000) * 5.5)} min</span>
                      </div>
                      <div style={{ display: 'inline-block', backgroundColor: 'rgba(118, 220, 203, 0.1)', color: 'var(--accent-secondary)', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700' }}>
                        Moderat
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STATISTIK & HISTORIK */}
          {activeTab === 'statistik' && (
            <div style={{ padding: '24px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Min udvikling</h2>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>Sidste 4 uger ⌄</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', backgroundColor: 'var(--bg-card)', padding: '4px', borderRadius: '24px', border: '1px solid var(--border-subtle)' }}>
                <button style={{ flex: 1, backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', borderRadius: '20px', padding: '8px', fontWeight: '700', fontSize: '13px', border: 'none' }}>Distance</button>
                <button style={{ flex: 1, backgroundColor: 'transparent', color: 'var(--text-secondary)', borderRadius: '20px', padding: '8px', fontWeight: '600', fontSize: '13px', border: 'none' }}>Tid</button>
                <button style={{ flex: 1, backgroundColor: 'transparent', color: 'var(--text-secondary)', borderRadius: '20px', padding: '8px', fontWeight: '600', fontSize: '13px', border: 'none' }}>Pace</button>
              </div>

              <div style={{ height: '220px', marginBottom: '32px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statChartData.length > 0 ? statChartData : [{name: 'M', km: 0}, {name: 'T', km: 0}]}>
                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: 'var(--bg-card)'}} contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '12px' }} />
                    <Bar dataKey="km" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total løbedistance</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{totalActualDistance.toFixed(1)} <span style={{fontSize: '14px', fontWeight: '500'}}>km</span></div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Gennemsnitlig pace</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{avgPaceStr} <span style={{fontSize: '14px', fontWeight: '500'}}>/km</span></div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Antal rigtige løb</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{completedRuns.length}</div>
                  </div>
                </div>
              </div>

              {/* LØBETURE */}
              {completedRuns.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>🏃 Gennemførte løbeture</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                    {completedRuns.map(w => renderWorkoutCard(w, '👟', 'Løbetur'))}
                  </div>
                </>
              )}

              {/* GÅTURE */}
              {completedWalks.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>🚶 Gåture</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                    {completedWalks.map(w => renderWorkoutCard(w, '🚶', 'Gåtur'))}
                  </div>
                </>
              )}

              {/* CYKELTURE */}
              {completedCycles.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>🚴 Cykelture</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                    {completedCycles.map(w => renderWorkoutCard(w, '🚴', 'Cykeltur'))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* COACH & PLAN */}
          {activeTab === 'coach' && (
            <div style={{ padding: '24px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Løbecoach</h2>
                <button onClick={() => setShowCoachWizard(true)} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)', padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>+ Nyt Forløb</button>
              </div>

              {plannedWorkouts.length === 0 ? (
                <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '24px', padding: '40px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤖</div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>Ingen aktiv plan</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>Få AI-coachen til at bygge et varieret forløb til dig.</p>
                  <button onClick={() => setShowCoachWizard(true)} style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Start Forløb</button>
                </div>
              ) : (
                <>
                  <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', border: '1px solid var(--border-subtle)', marginBottom: '32px', backgroundImage: 'linear-gradient(to right, rgba(16,35,43,0.9), rgba(16,35,43,0.4)), url("https://images.unsplash.com/photo-1551632811-561f3222ef86?q=80&w=400&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--bg-main)', fontWeight: '800', backgroundColor: 'var(--accent-primary)', padding: '4px 10px', borderRadius: '12px' }}>Aktiv</span>
                    </div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '800', color: '#FFF' }}>RunQuest Forløb</h3>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>{totalActualDistance.toFixed(1)} / {totalPlanDistance.toFixed(1)} km fuldført</div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (totalActualDistance / (totalPlanDistance || 1)) * 100)}%`, height: '100%', backgroundColor: 'var(--accent-primary)' }}></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Array.from({ length: maxWeekInPlan }, (_, i) => i + 1).map((weekNum) => {
                      const weekWorkouts = plannedWorkouts.filter(w => (w.week_number || 1) === weekNum);
                      if (weekWorkouts.length === 0) return null;
                      
                      return (
                        <div key={weekNum} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                            <span style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: '800', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>UGE {weekNum}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {weekWorkouts.map((w) => {
                              const formattedDate = new Date(w.scheduled_date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric' });
                              return (
                                <div key={w.id} onClick={() => setSelectedWorkoutModal(w)} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '14px', cursor: 'pointer', gap: '16px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', width: '35px', textTransform: 'uppercase', textAlign: 'center' }}>{formattedDate.split(' ')[0]}<br/><span style={{fontSize:'16px', color:'var(--text-primary)'}}>{formattedDate.split(' ')[1].replace('.','')}</span></div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' }}>{w.title}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{w.category !== 'strength' ? `${w.target_pace_min}` : `${w.target_pace_min} • Styrke`}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* MERE (Profil, Sko, Sundhed) */}
          {activeTab === 'mere' && (
            <div style={{ padding: '24px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '24px', color: 'var(--bg-main)', border: '2px solid var(--border-subtle)' }}>
                  {user.email.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{user.email.split('@')[0]}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Level {userLevel} • {userXp} XP</div>
                </div>
              </div>

              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>Samling</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-primary)', borderRadius: '16px', padding: '16px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏃</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>Første Tur</div>
                </div>
                <div style={{ backgroundColor: totalActualDistance >= 10 ? 'var(--bg-card)' : 'var(--bg-main)', border: `1px solid ${totalActualDistance >= 10 ? 'var(--accent-secondary)' : 'var(--border-subtle)'}`, borderRadius: '16px', padding: '16px 8px', textAlign: 'center', opacity: totalActualDistance >= 10 ? 1 : 0.4 }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', filter: totalActualDistance >= 10 ? 'none' : 'grayscale(100%)' }}>🔟</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>10 km Club</div>
                </div>
                <div style={{ backgroundColor: totalActualDistance >= 50 ? 'var(--bg-card)' : 'var(--bg-main)', border: `1px solid ${totalActualDistance >= 50 ? 'var(--accent-secondary)' : 'var(--border-subtle)'}`, borderRadius: '16px', padding: '16px 8px', textAlign: 'center', opacity: totalActualDistance >= 50 ? 1 : 0.4 }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', filter: totalActualDistance >= 50 ? 'none' : 'grayscale(100%)' }}>🔥</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>50 km Club</div>
                </div>
              </div>

              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>Løbesko</h3>
              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '16px', marginBottom: '32px' }}>
                <form onSubmit={handleAddShoe} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input type="text" placeholder="Skomodel" value={shoeName} onChange={(e) => setShoeName(e.target.value)} style={{ flex: '2 1 140px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px' }} required />
                  <input type="number" placeholder="Max km" value={shoeMaxKm} onChange={(e) => setShoeMaxKm(e.target.value)} style={{ flex: '1 1 80px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px' }} required />
                  <button type="submit" style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '12px', cursor: 'pointer' }}>Tilføj</button>
                </form>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shoes.map((shoe) => {
                    const pct = Math.min(100, Math.round((shoe.current_km / shoe.max_km) * 100));
                    return (
                      <div key={shoe.id} style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', padding: '14px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{shoe.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '700' }}>{shoe.current_km} / {shoe.max_km} km</span>
                            <button onClick={() => handleDeleteShoe(shoe.id)} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                          </div>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct > 85 ? '#EF4444' : 'var(--accent-primary)' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>Krop & Sundhed</h3>
              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '16px', marginBottom: '32px' }}>
                {bodyMetrics.length > 1 && (
                  <div style={{ marginBottom: '20px', backgroundColor: 'var(--bg-main)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '12px', textTransform: 'uppercase' }}>Vægtudvikling</div>
                    <div style={{ height: '140px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={bodyMetrics}>
                          <XAxis dataKey="recorded_date" stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--text-secondary)" fontSize={10} domain={['dataMin - 1', 'dataMax + 1']} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px' }} />
                          <Area type="monotone" dataKey="weight_kg" stroke="var(--accent-primary)" fill="var(--accent-primary)" fillOpacity={0.2} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {bodyMetrics.map((m) => (
                    <div key={m.id} style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{m.recorded_date}</span>
                        <span style={{ fontWeight: '800', fontSize: '13px', color: 'var(--text-primary)' }}>{m.weight_kg} kg</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleEditMetric(m)} style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Ret</button>
                        <button onClick={() => handleDeleteMetric(m.id)} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Slet</button>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSaveWeightAndMetrics} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <input type="number" step="0.1" placeholder="Vægt (kg)*" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px' }} required />
                    <input type="number" step="0.1" placeholder="Talje (cm)" value={waistVal} onChange={(e) => setWaistVal(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px' }} />
                  </div>
                  <button type="submit" style={{ width: '100%', backgroundColor: 'var(--bg-main)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', padding: '12px', borderRadius: '10px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                    {editingMetricId ? 'Opdater Mål' : 'Tilføj Måling'}
                  </button>
                </form>
              </div>

              <h3 style={{ margin: '24px 0 16px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>🩺 Coach Note</h3>
              <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '16px', marginBottom: '32px' }}>
                <textarea placeholder="F.eks. ømhed i højre knæ..." value={bodyIssue} onChange={(e) => setBodyIssue(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '13px', minHeight: '80px', boxSizing: 'border-box', marginBottom: '12px' }} />
                <button onClick={analyzeBodyIssue} style={{ width: '100%', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', marginBottom: '12px' }}>Analyser & Få Øvelser</button>
                {aiBodyAdvice && <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--accent-primary)', padding: '12px', borderRadius: '10px', fontSize: '12px', color: 'var(--accent-primary)', whiteSpace: 'pre-line' }}>{aiBodyAdvice}</div>}
              </div>

              <button onClick={handleLogout} style={{ width: '100%', backgroundColor: 'transparent', color: '#EF4444', border: '1px solid #EF4444', padding: '16px', borderRadius: '16px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>
                Log ud af RunQuest
              </button>
            </div>
          )}
        </div>
      )}

      {/* MULTI-STEP ONBOARDING WIZARD MODAL */}
      {showCoachWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7, 17, 22, 0.85)', backdropFilter: 'blur(8px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '24px', maxWidth: '420px', width: '100%', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '800', textTransform: 'uppercase' }}>Trin {wizardStep} af 3</span>
              <button onClick={() => setShowCoachWizard(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer' }}>✕</button>
            </div>

            {wizardStep === 1 && (
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '16px' }}>Din Løberprofil</h3>
                
                {runnerProfile && runnerProfile.longestRun ? (
                  <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px', marginBottom: '24px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 12px 0' }}>Baseret på dine seneste 4 ugers løbedata:</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Længste tur:</span>
                      <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-primary)' }}>{runnerProfile.longestRun} km</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Ugentlig volumen:</span>
                      <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-primary)' }}>~{runnerProfile.avgWeeklyVolume} km/uge</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px', marginBottom: '24px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 12px 0' }}>Jeg har ikke nok data til at vurdere din grundform endnu.</p>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Hvad var din længste tur for nylig? (km)</label>
                    <input type="number" value={manualLongestRun} onChange={(e) => setManualLongestRun(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                  </div>
                )}

                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Hvad træner du frem mod?</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                  {['5k', '10k', 'Half Marathon', 'Marathon'].map((dist) => (
                    <button key={dist} onClick={() => setCoachDistance(dist)} style={{ padding: '12px', borderRadius: '12px', border: coachDistance === dist ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)', backgroundColor: coachDistance === dist ? 'rgba(80, 230, 172, 0.1)' : 'var(--bg-main)', color: 'var(--text-primary)', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>{dist}</button>
                  ))}
                </div>
                <button onClick={() => setWizardStep(2)} style={{ width: '100%', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>Træningsmængde</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>Hvor mange dage om ugen kan du træne?</p>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                  {[2, 3, 4, 5, 6, 7].map((d) => (
                    <button key={d} onClick={() => setCoachDays(d)} style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: coachDays === d ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)', backgroundColor: coachDays === d ? 'rgba(80, 230, 172, 0.1)' : 'var(--bg-main)', color: 'var(--text-primary)', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>{d}</button>
                  ))}
                </div>
                
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Hvornår er dit løb / din måldato?</h4>
                <div style={{ marginBottom: '24px' }}>
                  <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setWizardStep(1)} style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', padding: '14px 16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>← Tilbage</button>
                  <button onClick={() => setWizardStep(3)} style={{ flex: 1, backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: '800' }}>Klar til generering</span>
                <h3 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: '8px 0' }}>Estimeret tid for {coachDistance}:</h3>
                <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-primary)', margin: '16px 0', backgroundColor: 'var(--bg-main)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                  {coachDistance === 'Marathon' ? '3:40 - 3:45' : coachDistance === 'Half Marathon' ? '1:42 - 1:48' : '44:30 - 46:00'}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '24px' }}>Baseret på dine data og valg.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setWizardStep(2)} style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', padding: '14px 16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>Tilbage</button>
                  <button onClick={generatePersonalizedCoachPlan} disabled={loading} style={{ flex: 1, backgroundColor: 'var(--accent-primary)', color: 'var(--bg-main)', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>{loading ? 'Genererer...' : 'Build My Plan'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETALJE MODAL */}
      {selectedWorkoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7, 17, 22, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '20px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <span style={{ backgroundColor: 'var(--bg-main)', color: 'var(--accent-primary)', border: '1px solid var(--border-subtle)', fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>{selectedWorkoutModal.workout_type}</span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedWorkoutModal.title}</h2>
              </div>
              <button onClick={() => setSelectedWorkoutModal(null)} style={{ backgroundColor: 'var(--bg-main)', border: 'none', color: 'var(--text-secondary)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px' }}>{selectedWorkoutModal.description}</p>
            {selectedWorkoutModal.exercises && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>Øvelsesguide</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedWorkoutModal.exercises.map((ex: any, idx: number) => (
                    <div key={idx} style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', padding: '12px 14px', borderRadius: '10px' }}>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>{ex.name} ({ex.sets})</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>💡 {ex.guide}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={(e) => toggleWorkoutCompleted(selectedWorkoutModal.id, selectedWorkoutModal.completed, e)} style={{ width: '100%', backgroundColor: selectedWorkoutModal.completed ? 'var(--bg-main)' : 'var(--accent-primary)', color: selectedWorkoutModal.completed ? 'var(--text-primary)' : 'var(--bg-main)', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}>
              {selectedWorkoutModal.completed ? 'Nulstil status' : 'Marker som gennemført'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import type { MouseEvent, FormEvent } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
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
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [shoes, setShoes] = useState<any[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'plan' | 'activities' | 'friends' | 'body'>('today');
  const [isClient, setIsClient] = useState(false);

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [selectedWorkoutModal, setSelectedWorkoutModal] = useState<any>(null);

  // Multi-step Onboarding Wizard State
  const [showCoachWizard, setShowCoachWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [coachLevel, setCoachLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced' | 'Elite'>('Intermediate');
  const [coachDistance, setCoachDistance] = useState<string>('10k');
  const [coachDays, setCoachDays] = useState<number>(4);
  const [coachWeeks, setCoachWeeks] = useState<number>(10);
  const [aiMessage, setAiMessage] = useState<string>('');

  // Body & Injury Note State
  const [bodyIssue, setBodyIssue] = useState('');
  const [aiBodyAdvice, setAiBodyAdvice] = useState('');

  // New Shoe Form State
  const [shoeName, setShoeName] = useState('');
  const [shoeMaxKm, setShoeMaxKm] = useState('700');

  // New Weight Form State
  const [weightVal, setWeightVal] = useState('');

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
        loadData();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadData();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadWorkouts(),
      loadSavedRoutes(),
      loadShoes(),
      loadBodyMetrics(),
    ]);
  };

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

  const loadWorkouts = async () => {
    const { data, error } = await supabase.from('workouts').select('*').order('scheduled_date', { ascending: true });
    if (!error && data) setWorkouts(data);
  };

  const loadSavedRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*').order('created_at', { ascending: false });
    if (!error && data) setSavedRoutes(data);
  };

  const loadShoes = async () => {
    const { data, error } = await supabase.from('shoes').select('*').order('created_at', { ascending: false });
    if (!error && data) setShoes(data);
  };

  const loadBodyMetrics = async () => {
    const { data, error } = await supabase.from('body_metrics').select('*').order('recorded_date', { ascending: false });
    if (!error && data) setBodyMetrics(data);
  };

  const handleAddShoe = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !shoeName) return;
    const { error } = await supabase.from('shoes').insert([{
      user_id: user.id,
      name: shoeName,
      max_km: parseFloat(shoeMaxKm) || 700,
      current_km: 0,
    }]);
    if (!error) {
      setShoeName('');
      loadShoes();
    }
  };

  const handleAddWeight = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !weightVal) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('body_metrics').insert([{
      user_id: user.id,
      weight_kg: parseFloat(weightVal),
      recorded_date: todayStr,
    }]);
    if (!error) {
      setWeightVal('');
      loadBodyMetrics();
    }
  };

  const analyzeBodyIssue = () => {
    if (!bodyIssue) return;
    const lower = bodyIssue.toLowerCase();
    if (lower.includes('læg') || lower.includes('calf')) {
      setAiBodyAdvice('💡 AI Coach Råd: Det lyder som overbelastning af lægmusklen. \n• Øvelse: Enkeltbens tå-hævninger (3x15 gentagelser langsomt).\n• Udstrækning: Klassisk læg-stræk mod væg i 30 sekunder.');
    } else if (lower.includes('knæ') || lower.includes('knee')) {
      setAiBodyAdvice('💡 AI Coach Råd: Knæsmerter kræver opmærksomhed.\n• Øvelse: Step-downs på et lavt trin (3x10 per ben).');
    } else {
      setAiBodyAdvice('💡 AI Coach Råd: Sørg for at lytte til kroppen. Læg 1-2 ekstra hviledage ind.');
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

  const generatePersonalizedCoachPlan = async () => {
    if (!user) return;
    setLoading(true);

    await supabase.from('workouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const today = new Date();
    const generatedWorkouts: any[] = [];
    const baseMult = coachLevel === 'Beginner' ? 0.75 : coachLevel === 'Advanced' ? 1.25 : coachLevel === 'Elite' ? 1.5 : 1.0;

    for (let week = 1; week <= coachWeeks; week++) {
      const daysOffset = (week - 1) * 7;
      const tuesDate = new Date(today.getTime() + (daysOffset + 2) * 86400000).toISOString().split('T')[0];
      const thursDate = new Date(today.getTime() + (daysOffset + 4) * 86400000).toISOString().split('T')[0];
      const friDate = new Date(today.getTime() + (daysOffset + 5) * 86400000).toISOString().split('T')[0];
      const sunDate = new Date(today.getTime() + (daysOffset + 7) * 86400000).toISOString().split('T')[0];

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `${Math.round(5 * baseMult * 10) / 10}km Easy Run`,
        category: 'running',
        workout_type: 'Easy',
        target_distance_km: Math.round(5 * baseMult * 10) / 10,
        target_pace_min: '5:30 - 6:00',
        description: 'Rolig aerobisk zone 2 tur.',
        scheduled_date: tuesDate,
        completed: false,
        status: 'pending',
      });

      if (coachDays >= 3) {
        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Fast Interval Session',
          category: 'running',
          workout_type: 'Interval',
          target_distance_km: 6.0,
          target_pace_min: '4:45 - 5:00',
          description: 'Opvarmning + tærskelintervaller.',
          scheduled_date: thursDate,
          completed: false,
          status: 'pending',
        });
      }

      if (coachDays >= 3) {
        generatedWorkouts.push({
          user_id: user.id,
          week_number: week,
          title: 'Full Body Strength Workout',
          category: 'strength',
          workout_type: 'Styrke',
          target_distance_km: 0,
          target_pace_min: '40m - 50m',
          description: 'Skadesforebyggende styrketræning.',
          scheduled_date: friDate,
          completed: false,
          status: 'pending',
          exercises: [
            { name: 'Bulgarian Split Squats', sets: '3 sæt x 10 reps', note: 'Stabilitet', guide: 'Fod på bænk bag dig, sænk knæet mod jorden.' },
            { name: 'Single-leg Calf Raises', sets: '3 sæt x 15 reps', note: 'Akillessene', guide: 'Stå på et ben, sænk hælen helt ned.' },
          ],
        });
      }

      generatedWorkouts.push({
        user_id: user.id,
        week_number: week,
        title: `${Math.round((7 + (week * 0.5)) * baseMult * 10) / 10}km Long Run`,
        category: 'running',
        workout_type: 'Long Run',
        target_distance_km: Math.round((7 + (week * 0.5)) * baseMult * 10) / 10,
        target_pace_min: '5:45 - 6:15',
        description: `Ugentlig langtur mod ${coachDistance}.`,
        scheduled_date: sunDate,
        completed: false,
        status: 'pending',
      });
    }

    const { error } = await supabase.from('workouts').insert(generatedWorkouts);

    if (!error) {
      setShowCoachWizard(false);
      setWizardStep(1);
      setAiMessage('🤖 AI Coach: Dit Runna-forløb er oprettet!');
      setActiveTab('plan');
      await loadWorkouts();
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

  const maxWeekInPlan = workouts.length > 0 ? Math.max(...workouts.map(w => w.week_number || 1)) : 10;
  const totalPlanDistance = workouts.reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);

  if (!isClient) {
    return <div style={{ backgroundColor: '#090A0C', minHeight: '100vh', color: '#FFFFFF', padding: '40px', textAlign: 'center' }}>Indlæser app...</div>;
  }

  return (
    <div style={{ backgroundColor: '#090A0C', minHeight: '100vh', color: '#F3F4F6', fontFamily: 'Inter, -apple-system, sans-serif', paddingBottom: '90px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '16px' }}>
        
        {/* TOP HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#FFF' }}>
              {user ? user.email.substring(0, 1).toUpperCase() : 'F'}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Velkommen tilbage</div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#FFF' }}>{user ? user.email.split('@')[0] : 'Løber'}</div>
            </div>
          </div>
          <button onClick={() => setShowCoachWizard(true)} style={{ backgroundColor: '#1E2028', border: '1px solid #2A2D3A', color: '#FFF', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
            ⚙️ Plan
          </button>
        </div>

        {!user ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#13151C', borderRadius: '20px', border: '1px solid #222530', marginTop: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '8px', color: '#FFFFFF' }}>{isSignUp ? 'Opret ny konto' : 'Log ind på din profil'}</h2>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '24px' }}>Din personlige løbscoach med sko- og vægt-tracker.</p>
            <form onSubmit={handleEmailAuth} style={{ maxWidth: '320px', margin: '0 auto', textAlign: 'left' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="din@email.dk" required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#9CA3AF' }}>Adgangskode</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', boxSizing: 'border-box' }} />
              </div>
              {authError && <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '12px', fontWeight: '600', textAlign: 'center' }}>{authError}</div>}
              <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '800', fontSize: '14px', cursor: 'pointer', marginBottom: '12px' }}>
                {loading ? 'Arbejder...' : isSignUp ? 'Opret konto' : 'Log ind'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
                  {isSignUp ? 'Har du allerede en konto? Log ind' : 'Opret ny konto'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            {/* TAB 1: TODAY */}
            {activeTab === 'today' && (
              <div>
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', color: '#10B981', letterSpacing: '1px' }}>Aktivt Forløb</div>
                      <h2 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#FFFFFF' }}>Run Further Plan</h2>
                    </div>
                    <div style={{ backgroundColor: '#18191E', border: '1px solid #2A2D3A', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', color: '#10B981' }}>RF</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', backgroundColor: '#18191E', padding: '12px', borderRadius: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Total uger</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#FFF' }}>0 / {maxWeekInPlan}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Total Distance</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#10B981' }}>{totalPlanDistance.toFixed(1)} km</div>
                    </div>
                  </div>
                  <button onClick={() => setShowCoachWizard(true)} style={{ width: '100%', backgroundColor: '#1E2028', color: '#FFF', border: '1px solid #2A2D3A', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}>Manage Plan</button>
                </div>

                {aiMessage && <div style={{ backgroundColor: '#18191E', border: '1px solid #A855F7', padding: '12px', borderRadius: '12px', fontSize: '12px', color: '#E9D5FF', marginBottom: '20px' }}>{aiMessage}</div>}

                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#18191E', border: '2px solid #10B981', margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🏃‍♂️</div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: '#FFF' }}>Dagens Træning</h3>
                  <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '16px' }}>Klar til at erobre ruten? Tjek din kalender eller plan.</p>
                  <button onClick={() => setActiveTab('plan')} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Se Træningskalender →</button>
                </div>
              </div>
            )}

            {/* TAB 2: PLAN */}
            {activeTab === 'plan' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#FFF' }}>Training Calendar</h2>
                  <button onClick={() => setShowCoachWizard(true)} style={{ backgroundColor: '#1E2028', border: '1px solid #2A2D3A', color: '#10B981', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>+ Nyt Forløb</button>
                </div>

                {workouts.length === 0 ? (
                  <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '40px 20px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700', color: '#FFFFFF' }}>Ingen kalender oprettet</h3>
                    <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>Tryk ovenfor for at starte dit personlige forløb.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Array.from({ length: maxWeekInPlan }, (_, i) => i + 1).map((weekNum) => {
                      const weekWorkouts = workouts.filter(w => (w.week_number || 1) === weekNum);
                      const weekTotalKm = weekWorkouts.reduce((acc, curr) => acc + (curr.target_distance_km || 0), 0);

                      return (
                        <div key={weekNum} style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #222530', paddingBottom: '10px' }}>
                            <span style={{ backgroundColor: '#1E2028', color: '#FFF', fontSize: '11px', fontWeight: '800', padding: '4px 8px', borderRadius: '6px', border: '1px solid #2A2D3A' }}>WEEK {weekNum}</span>
                            <div style={{ fontSize: '12px', color: '#10B981', fontWeight: '800' }}>Total: {weekTotalKm.toFixed(1)} km</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {weekWorkouts.map((w) => {
                              const isCompleted = w.completed;
                              const formattedDate = w.scheduled_date ? new Date(w.scheduled_date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric' }) : '';
                              return (
                                <div key={w.id} onClick={() => { setSelectedWorkoutModal(w); setTimerSeconds(null); setIsTimerRunning(false); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#18191E', border: `1px solid ${isCompleted ? '#10B981' : '#2A2D3A'}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#6B7280', width: '35px', textTransform: 'uppercase' }}>{formattedDate.split(' ')[0]}</div>
                                    <div>
                                      <div style={{ fontSize: '14px', fontWeight: '700', color: isCompleted ? '#6B7280' : '#FFF', textDecoration: isCompleted ? 'line-through' : 'none' }}>{w.title}</div>
                                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{w.category !== 'strength' ? `${w.target_distance_km}km • ${w.target_pace_min}` : `${w.target_pace_min} • Styrke`}</div>
                                    </div>
                                  </div>
                                  <button onClick={(e) => toggleWorkoutCompleted(w.id, isCompleted, e)} style={{ width: '24px', height: '24px', borderRadius: '50%', border: isCompleted ? 'none' : '1px solid #3F3F46', backgroundColor: isCompleted ? '#10B981' : 'transparent', color: '#090A0C', fontWeight: '900', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isCompleted ? '✓' : ''}</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ACTIVITIES & MAP BUILDER */}
            {activeTab === 'activities' && (
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '16px' }}>Rutebygger</h2>
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ height: '280px', width: '100%', position: 'relative' }}>
                    <MapContainer center={builderWaypoints.length > 0 ? builderWaypoints[0] : [55.6761, 12.5683]} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                      <Polyline positions={builderPath} pathOptions={{ color: '#3B82F6', weight: 5, opacity: 0.9 }} />
                      {builderWaypoints.map((pt, idx) => (
                        <Marker key={idx} position={pt} icon={idx === 0 ? startIcon : idx === builderWaypoints.length - 1 ? endIcon : waypointIcon} />
                      ))}
                      <RouteBuilderClicker onPointAdd={handleAddWaypoint} />
                    </MapContainer>
                  </div>
                  <div style={{ padding: '16px' }}>
                    <input type="text" placeholder="Rutenavn (f.eks. Fælledparken 5k)" value={routeTitle} onChange={(e) => setRouteTitle(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', marginBottom: '12px', boxSizing: 'border-box' }} />
                    <button onClick={handleSaveRoute} disabled={builderPath.length < 2 || !routeTitle || loading} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}>Gem Rute</button>
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color: '#FFF' }}>Gemte Ruter</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedRoutes.map((r) => (
                    <div key={r.id} style={{ backgroundColor: '#13151C', border: '1px solid #222530', padding: '14px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '700', color: '#FFF' }}>{r.title}</div>
                        <div style={{ fontSize: '12px', color: '#10B981' }}>{(r.distance_meters / 1000).toFixed(2)} km</div>
                      </div>
                      <button onClick={() => { setBuilderWaypoints(r.coordinates); setBuilderPath(r.coordinates); setRouteTitle(r.title); }} style={{ backgroundColor: '#1E2028', color: '#3B82F6', border: '1px solid #2A2D3A', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>Vis på kort</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: FRIENDS */}
            {activeTab === 'friends' && (
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '16px' }}>Venner & Feed</h2>
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ color: '#9CA3AF', fontSize: '13px', margin: 0 }}>Her kan du og dine venner dele jeres løbeture og heppe på hinanden i lukkede rammer.</p>
                </div>
              </div>
            )}

            {/* TAB 5: BODY & GEAR */}
            {activeTab === 'body' && (
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '16px' }}>Krop, Vægt & Løbesko</h2>

                {/* SKO TÆLLER */}
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '16px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800', color: '#FFF' }}>👟 Løbesko Kilometræller</h3>
                  <form onSubmit={handleAddShoe} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input type="text" placeholder="Skomodel" value={shoeName} onChange={(e) => setShoeName(e.target.value)} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px' }} required />
                    <input type="number" placeholder="Max km" value={shoeMaxKm} onChange={(e) => setShoeMaxKm(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px' }} required />
                    <button type="submit" style={{ backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '10px 14px', borderRadius: '8px', fontWeight: '800', fontSize: '12px', cursor: 'pointer' }}>Tilføj</button>
                  </form>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {shoes.map((shoe) => {
                      const pct = Math.min(100, Math.round((shoe.current_km / shoe.max_km) * 100));
                      return (
                        <div key={shoe.id} style={{ backgroundColor: '#18191E', border: '1px solid #2A2D3A', padding: '12px', borderRadius: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '700', fontSize: '13px', color: '#FFF' }}>{shoe.name}</span>
                            <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '700' }}>{shoe.current_km} / {shoe.max_km} km</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: '#2A2D3A', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct > 85 ? '#EF4444' : '#10B981' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* VÆGT & MÅL */}
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '16px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800', color: '#FFF' }}>⚖️ Vægt & Mål[cite: 1]</h3>
                  <form onSubmit={handleAddWeight} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input type="number" step="0.1" placeholder="Vægt i kg (f.eks. 75.5)" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px' }} required />
                    <button type="submit" style={{ flex: 1, backgroundColor: '#3B82F6', color: '#FFF', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '800', fontSize: '12px', cursor: 'pointer' }}>Log Vægt</button>
                  </form>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {bodyMetrics.map((m) => (
                      <div key={m.id} style={{ backgroundColor: '#18191E', border: '1px solid #2A2D3A', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{m.recorded_date}</span>
                        <span style={{ fontWeight: '800', fontSize: '13px', color: '#FFF' }}>{m.weight_kg} kg</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COACH NOTE & KROP */}
                <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '800', color: '#FFF' }}>🩺 Coach Note & Krop</h3>
                  <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '12px' }}>Mærker du ømhed eller irritation? Skriv det her og få specifikke øvelser.</p>
                  <textarea placeholder="f.eks. Ømhed i højre læg..." value={bodyIssue} onChange={(e) => setBodyIssue(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #2A2D3A', backgroundColor: '#090A0C', color: '#FFF', fontSize: '12px', minHeight: '80px', boxSizing: 'border-box', marginBottom: '10px' }} />
                  <button onClick={analyzeBodyIssue} style={{ width: '100%', backgroundColor: '#A855F7', color: '#090A0C', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', marginBottom: '12px' }}>Analyser & Få Øvelser</button>
                  {aiBodyAdvice && (
                    <div style={{ backgroundColor: '#18191E', border: '1px solid #A855F7', padding: '12px', borderRadius: '10px', fontSize: '12px', color: '#E9D5FF', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                      {aiBodyAdvice}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MULTI-STEP ONBOARDING WIZARD MODAL */}
      {showCoachWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '24px', maxWidth: '420px', width: '100%', padding: '24px' }}>
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
                    <button key={lvl} onClick={() => setCoachLevel(lvl as any)} style={{ padding: '14px', borderRadius: '12px', border: coachLevel === lvl ? '2px solid #10B981' : '1px solid #2A2D3A', backgroundColor: coachLevel === lvl ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>{lvl}</button>
                  ))}
                </div>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '8px' }}>What distance are you training for?</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                  {['5k', '10k', 'Half Marathon', 'Marathon'].map((dist) => (
                    <button key={dist} onClick={() => setCoachDistance(dist)} style={{ padding: '12px', borderRadius: '12px', border: coachDistance === dist ? '2px solid #10B981' : '1px solid #2A2D3A', backgroundColor: coachDistance === dist ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>{dist}</button>
                  ))}
                </div>
                <button onClick={() => setWizardStep(2)} style={{ width: '100%', backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#FFF', marginBottom: '8px' }}>Træningsmængde</h3>
                <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '20px' }}>Days per week can you train?</p>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                  {[2, 3, 4, 5, 6, 7].map((d) => (
                    <button key={d} onClick={() => setCoachDays(d)} style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: coachDays === d ? '2px solid #10B981' : '1px solid #2A2D3A', backgroundColor: coachDays === d ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>{d}</button>
                  ))}
                </div>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#FFF', marginBottom: '8px' }}>How long do you want to train for?</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                  {[8, 10, 12].map((w) => (
                    <button key={w} onClick={() => setCoachWeeks(w)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: coachWeeks === w ? '2px solid #10B981' : '1px solid #2A2D3A', backgroundColor: coachWeeks === w ? '#1a2e26' : '#18191E', color: '#FFF', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>{w} uger</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setWizardStep(1)} style={{ backgroundColor: '#1E2028', color: '#FFF', border: '1px solid #2A2D3A', padding: '14px 16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>← Tilbage</button>
                  <button onClick={() => setWizardStep(3)} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>Næste trin →</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#10B981', fontWeight: '800' }}>Klar til generering</span>
                <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#FFF', margin: '8px 0' }}>Estimated {coachDistance} time in {coachWeeks} weeks:</h3>
                <div style={{ fontSize: '32px', fontWeight: '900', color: '#FFF', margin: '16px 0', backgroundColor: '#18191E', padding: '16px', borderRadius: '16px', border: '1px solid #2A2D3A' }}>
                  {coachDistance === 'Marathon' ? '3:40 - 3:45' : coachDistance === 'Half Marathon' ? '1:42 - 1:48' : '44:30 - 46:00'}
                </div>
                <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '24px' }}>Baseret på dine valg.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setWizardStep(2)} style={{ backgroundColor: '#1E2028', color: '#FFF', border: '1px solid #2A2D3A', padding: '14px 16px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer' }}>Tilbage</button>
                  <button onClick={generatePersonalizedCoachPlan} disabled={loading} style={{ flex: 1, backgroundColor: '#10B981', color: '#090A0C', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }}>{loading ? 'Genererer...' : 'Build My Plan'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION BAR */}
      {user && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#13151C', borderTop: '1px solid #222530', padding: '8px 0 16px 0', display: 'flex', justifyContent: 'around', zIndex: 900 }}>
          <div style={{ display: 'flex', width: '100%', maxWidth: '480px', margin: '0 auto', justifyContent: 'space-around' }}>
            <button onClick={() => setActiveTab('today')} style={{ background: 'none', border: 'none', color: activeTab === 'today' ? '#10B981' : '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px', marginBottom: '2px' }}>☀️</span> Today
            </button>
            <button onClick={() => setActiveTab('plan')} style={{ background: 'none', border: 'none', color: activeTab === 'plan' ? '#10B981' : '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px', marginBottom: '2px' }}>📅</span> Plan
            </button>
            <button onClick={() => setActiveTab('activities')} style={{ background: 'none', border: 'none', color: activeTab === 'activities' ? '#10B981' : '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px', marginBottom: '2px' }}>🗺️</span> Ruter
            </button>
            <button onClick={() => setActiveTab('friends')} style={{ background: 'none', border: 'none', color: activeTab === 'friends' ? '#10B981' : '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px', marginBottom: '2px' }}>👥</span> Venner
            </button>
            <button onClick={() => setActiveTab('body')} style={{ background: 'none', border: 'none', color: activeTab === 'body' ? '#10B981' : '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              <span style={{ fontSize: '18px', marginBottom: '2px' }}>🩺</span> Krop & Sko
            </button>
          </div>
        </div>
      )}

      {/* DETALJE MODAL */}
      {selectedWorkoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div style={{ backgroundColor: '#13151C', border: '1px solid #222530', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <span style={{ backgroundColor: '#18191E', color: '#10B981', border: '1px solid #2A2D3A', fontSize: '10px', fontWeight: '800', padding: '2px 6px', borderRadius: '4px' }}>{selectedWorkoutModal.workout_type}</span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#FFF' }}>{selectedWorkoutModal.title}</h2>
              </div>
              <button onClick={() => setSelectedWorkoutModal(null)} style={{ backgroundColor: '#1E2028', border: 'none', color: '#9CA3AF', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: '13px', lineHeight: '1.5', marginBottom: '16px' }}>{selectedWorkoutModal.description}</p>
            {selectedWorkoutModal.exercises && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: '#A855F7', textTransform: 'uppercase' }}>Øvelsesguide</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedWorkoutModal.exercises.map((ex: any, idx: number) => (
                    <div key={idx} style={{ backgroundColor: '#18191E', border: '1px solid #2A2D3A', padding: '12px 14px', borderRadius: '10px' }}>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: '#FFF', marginBottom: '4px' }}>{ex.name} ({ex.sets})</div>
                      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>💡 {ex.guide}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => toggleWorkoutCompleted(selectedWorkoutModal.id, selectedWorkoutModal.completed)} style={{ width: '100%', backgroundColor: selectedWorkoutModal.completed ? '#1E2028' : '#10B981', color: selectedWorkoutModal.completed ? '#FFF' : '#090A0C', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}>
              {selectedWorkoutModal.completed ? 'Nulstil status' : 'Marker som gennemført'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
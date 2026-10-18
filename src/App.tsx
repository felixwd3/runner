import { useState, useEffect } from 'react';
import type { MouseEvent, FormEvent } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// RunQuest Ikoner
const startIcon = L.divIcon({ html: `<div style="background-color: var(--accent-primary); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px var(--accent-primary);"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
const endIcon = L.divIcon({ html: `<div style="background-color: var(--text-primary); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(255,255,255,0.5);"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] });
const waypointIcon = L.divIcon({ html: `<div style="background-color: var(--accent-secondary); width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`, className: '', iconSize: [8, 8], iconAnchor: [4, 4] });

const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const MAP_ATTRIBUTION = '&copy; OpenStreetMap contributors & CARTO';

function RouteBuilderClicker({ onPointAdd }: { onPointAdd: (latlng: [number, number]) => void }) {
  useMapEvents({ click(e) { onPointAdd([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [shoes, setShoes] = useState<any[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Ny Navigations-struktur
  const [activeTab, setActiveTab] = useState<'hjem' | 'ruter' | 'statistik' | 'maal' | 'mere'>('hjem');
  const [isClient, setIsClient] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [selectedWorkoutModal, setSelectedWorkoutModal] = useState<any>(null);

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

  const loadData = async () => {
    const [wo, ro, sh, bm] = await Promise.all([
      supabase.from('runner_workouts').select('*').order('scheduled_date', { ascending: true }),
      supabase.from('runner_routes').select('*').order('created_at', { ascending: false }),
      supabase.from('runner_shoes').select('*').order('created_at', { ascending: false }),
      supabase.from('runner_body_metrics').select('*').order('recorded_date', { ascending: true })
    ]);
    if (wo.data) setWorkouts(wo.data);
    if (ro.data) setSavedRoutes(ro.data);
    if (sh.data) setShoes(sh.data);
    if (bm.data) setBodyMetrics(bm.data);
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

  // Find seneste løbetur til forsiden
  const completedWorkouts = workouts.filter(w => w.completed && w.actual_distance_km);
  const lastWorkout = completedWorkouts.length > 0 ? completedWorkouts[completedWorkouts.length - 1] : null;

  if (!isClient) return <div style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh' }}></div>;

  return (
    <div style={{ backgroundColor: 'var(--bg-main)', minHeight: '100vh', paddingBottom: '100px' }}>
      
      {!user ? (
        <div style={{ padding: '40px 20px', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px' }}>RunQuest</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '32px' }}>Bedre løb. Større oplevelser.</p>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '24px', border: '1px solid var(--border-subtle)' }}>
            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '12px', boxSizing: 'border-box' }} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Adgangskode" required style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '20px', boxSizing: 'border-box' }} />
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
          
          {/* FASE 2: HJEM (FORSIDEN) */}
          {activeTab === 'hjem' && (
            <div style={{ position: 'relative' }}>
              
              {/* Top Bar over Hero Billede */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>⛰️</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>RunQuest</span>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', color: 'var(--accent-primary)' }}>
                  {user.email.substring(0, 1).toUpperCase()}
                </div>
              </div>

              {/* Hero Immersive Billede */}
              <div style={{ 
                backgroundImage: 'linear-gradient(to bottom, rgba(7, 17, 22, 0.2) 0%, rgba(7, 17, 22, 0.6) 60%, var(--bg-main) 100%), url("https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=1000&auto=format&fit=crop")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                height: '500px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '24px',
                boxSizing: 'border-box'
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
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>--:--</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pace</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>-:- <span style={{fontSize:'14px', color:'var(--text-secondary)', fontWeight:'500'}}>/km</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Puls</div>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>--- <span style={{fontSize:'14px', color:'var(--text-secondary)', fontWeight:'500'}}>bpm</span></div>
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

              {/* Start Knap Hoverende */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-35px', marginBottom: '32px', position: 'relative', zIndex: 20 }}>
                <button onClick={() => setActiveTab('ruter')} style={{ 
                  width: '70px', height: '70px', borderRadius: '50%', 
                  backgroundColor: 'var(--bg-main)', border: '2px solid var(--accent-primary)', 
                  color: 'var(--accent-primary)', fontSize: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 8px 24px rgba(80, 230, 172, 0.2)'
                }}>
                  ▶
                </button>
              </div>

              {/* Cards Sektion */}
              <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Mål Card */}
                <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '20px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Næste Mål</h3>
                    <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '600', backgroundColor: 'rgba(80,230,172,0.1)', padding: '4px 8px', borderRadius: '8px' }}>På vej</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', backgroundImage: 'url("https://images.unsplash.com/photo-1551632811-561f3222ef86?q=80&w=200&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Halvmaraton</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>12,4 / 21,1 km</div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '58%', height: '100%', backgroundColor: 'var(--accent-primary)' }}></div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* FASE 3 Klargøring - Midlertidig overførsel af de andre faner til det nye farvetema */}
          {activeTab !== 'hjem' && (
             <div style={{ padding: '24px 20px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 24px 0', textTransform: 'capitalize' }}>{activeTab}</h2>
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '32px', borderRadius: '24px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '16px' }}>🛠️</span>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                    Vi bygger RunQuest-designet ind i moduler. <br/>Dette område opdateres i næste fase.
                  </p>
                </div>
             </div>
          )}

        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION - RUNQUEST DESIGN */}
      {user && (
        <div style={{ 
          position: 'fixed', bottom: 0, left: 0, right: 0, 
          backgroundColor: 'rgba(7, 17, 22, 0.85)', backdropFilter: 'blur(20px)', 
          borderTop: '1px solid var(--border-subtle)', 
          padding: '16px 0 24px 0', display: 'flex', justifyContent: 'space-around', zIndex: 900 
        }}>
          <div style={{ display: 'flex', width: '100%', maxWidth: '480px', margin: '0 auto', justifyContent: 'space-around' }}>
            <button onClick={() => setActiveTab('hjem')} style={{ background: 'none', border: 'none', color: activeTab === 'hjem' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', fontWeight: '600', cursor: 'pointer', gap: '6px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Hjem
            </button>
            <button onClick={() => setActiveTab('ruter')} style={{ background: 'none', border: 'none', color: activeTab === 'ruter' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', fontWeight: '600', cursor: 'pointer', gap: '6px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              Ruter
            </button>
            <button onClick={() => setActiveTab('statistik')} style={{ background: 'none', border: 'none', color: activeTab === 'statistik' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', fontWeight: '600', cursor: 'pointer', gap: '6px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="13" width="4" height="8"></rect></svg>
              Statistik
            </button>
            <button onClick={() => setActiveTab('maal')} style={{ background: 'none', border: 'none', color: activeTab === 'maal' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', fontWeight: '600', cursor: 'pointer', gap: '6px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
              Mål
            </button>
            <button onClick={() => setActiveTab('mere')} style={{ background: 'none', border: 'none', color: activeTab === 'mere' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '10px', fontWeight: '600', cursor: 'pointer', gap: '6px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
              Mere
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
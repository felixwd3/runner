import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.39.3"
import GpxParser from "npm:gpxparser@3.0.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const user_id = url.searchParams.get('user_id')
    const gpx_text = await req.text()

    if (!user_id || !gpx_text) {
      throw new Error("Manglende user_id i URL eller gpx_text i body")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const gpx = new GpxParser()
    gpx.parse(gpx_text)
    
    if (!gpx.tracks || gpx.tracks.length === 0) {
      throw new Error("Ugyldig GPX-fil: Ingen ruter fundet")
    }

    // 1. Udregn distance
    const distanceMeters = Math.round(gpx.tracks[0].distance.total)
    const distanceKm = parseFloat((distanceMeters / 1000).toFixed(2))
    const coordinates = gpx.tracks[0].points.map((p: any) => [p.lat, p.lon])
    
    // 2. Udregn tid i sekunder
    const points = gpx.tracks[0].points;
    const startTime = new Date(points[0].time).getTime();
    const endTime = new Date(points[points.length - 1].time).getTime();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    // 3. Udregn Pace (Min/Km)
    let actualPaceMin = "-:-";
    if (distanceKm > 0 && durationSeconds > 0) {
      const paceSeconds = durationSeconds / distanceKm;
      const paceMins = Math.floor(paceSeconds / 60);
      const paceSecsLeft = Math.floor(paceSeconds % 60);
      actualPaceMin = `${paceMins}:${paceSecsLeft.toString().padStart(2, '0')}`;
    }

    // 4. Find gennemsnitspuls (Skjult i GPX extensions)
    const hrMatches = gpx_text.match(/<[^>]*hr>(\d+)<\/[^>]*hr>/ig);
    let avgHr = null;
    if (hrMatches && hrMatches.length > 0) {
      let totalHr = 0;
      hrMatches.forEach((match: string) => {
        const val = match.match(/\d+/);
        if (val) totalHr += parseInt(val[0], 10);
      });
      avgHr = Math.round(totalHr / hrMatches.length);
    }

    const runDate = new Date(points[0].time || Date.now())
    const todayStr = runDate.toISOString().split('T')[0]

    await supabase.from('runner_routes').insert([{
      user_id,
      title: `Løbetur - ${runDate.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`,
      distance_meters: distanceMeters,
      coordinates: coordinates,
    }])

    const { data: workouts } = await supabase
      .from('runner_workouts')
      .select('id, completed')
      .eq('user_id', user_id)
      .eq('scheduled_date', todayStr)
      .eq('completed', false)
      .limit(1)

    const workoutPayload = {
      completed: true,
      status: 'completed',
      actual_distance_km: distanceKm,
      actual_duration_seconds: durationSeconds,
      actual_pace_min: actualPaceMin,
      avg_heart_rate: avgHr
    }

    if (workouts && workouts.length > 0) {
      await supabase.from('runner_workouts').update(workoutPayload).eq('id', workouts[0].id)
    } else {
      await supabase.from('runner_workouts').insert([{
        user_id,
        title: 'Uplanlagt løbetur',
        category: 'running',
        scheduled_date: todayStr,
        ...workoutPayload
      }])
    }

    const { data: shoes } = await supabase
      .from('runner_shoes')
      .select('id, current_km, max_km')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })

    if (shoes && shoes.length > 0) {
      const activeShoe = shoes.find(s => s.current_km < s.max_km) || shoes[0]
      await supabase.from('runner_shoes').update({
        current_km: activeShoe.current_km + distanceKm
      }).eq('id', activeShoe.id)
    }

    return new Response(JSON.stringify({ success: true, message: `Rute gemt med pace ${actualPaceMin}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
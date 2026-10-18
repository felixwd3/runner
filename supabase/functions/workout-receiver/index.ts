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
    // 1. Hent user_id fra selve linket i stedet for JSON
    const url = new URL(req.url)
    const user_id = url.searchParams.get('user_id')
    
    // 2. Hent den rå GPX-fil direkte fra anmodningen
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

    const distanceMeters = Math.round(gpx.tracks[0].distance.total)
    const distanceKm = parseFloat((distanceMeters / 1000).toFixed(2))
    const coordinates = gpx.tracks[0].points.map((p: any) => [p.lat, p.lon])
    const runDate = new Date(gpx.tracks[0].points[0]?.time || Date.now())
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

    if (workouts && workouts.length > 0) {
      await supabase.from('runner_workouts').update({
        completed: true,
        status: 'completed',
        actual_distance_km: distanceKm
      }).eq('id', workouts[0].id)
    } else {
      await supabase.from('runner_workouts').insert([{
        user_id,
        title: 'Uplanlagt løbetur',
        category: 'running',
        scheduled_date: todayStr,
        completed: true,
        status: 'completed',
        actual_distance_km: distanceKm
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

    return new Response(JSON.stringify({ success: true, message: `Rute på ${distanceKm}km gemt!` }), {
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
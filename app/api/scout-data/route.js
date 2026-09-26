import {
  getAvailability,
  getBacktestOverview,
  getMatches,
  getPlayersWithProjection,
  getRecommendation,
  getRoleSignals,
  getWeeklyPoints,
} from '@/lib/data'

export const dynamic = 'force-dynamic'

const headers = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Access-Control-Allow-Origin': '*',
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers })
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const section = String(url.searchParams.get('section') || 'all').toLowerCase()

    const meta = {
      name: 'Fantezi Scout read-only data feed',
      access: 'read-only',
      write_operations: false,
      contains_private_user_data: false,
      generated_at: new Date().toISOString(),
      sections: {
        all: '/api/scout-data',
        players: '/api/scout-data?section=players',
        matches: '/api/scout-data?section=matches',
        squads: '/api/scout-data?section=squads',
        availability: '/api/scout-data?section=availability',
        roles: '/api/scout-data?section=roles',
        weekly: '/api/scout-data?section=weekly',
        performance: '/api/scout-data?section=performance',
      },
    }

    if (section === 'players') {
      const data = await getPlayersWithProjection()
      return json({ meta, section, ...data })
    }

    if (section === 'matches') {
      const data = await getMatches()
      return json({ meta, section, ...data })
    }

    if (section === 'squads') {
      const [recommended, alternative] = await Promise.all([
        getRecommendation('recommended'),
        getRecommendation('alternative'),
      ])
      return json({ meta, section, recommended, alternative })
    }

    if (section === 'availability') {
      const data = await getAvailability()
      return json({ meta, section, ...data })
    }

    if (section === 'roles') {
      const data = await getRoleSignals()
      return json({ meta, section, ...data })
    }

    if (section === 'weekly') {
      const data = await getWeeklyPoints()
      return json({ meta, section, ...data })
    }

    if (section === 'performance') {
      const data = await getBacktestOverview()
      return json({ meta, section, ...data })
    }

    if (section !== 'all') {
      return json({
        error: 'Unknown section',
        allowed_sections: Object.keys(meta.sections),
      }, 400)
    }

    const [
      players,
      matches,
      recommended,
      alternative,
      availability,
      roles,
      weekly,
      performance,
    ] = await Promise.all([
      getPlayersWithProjection(),
      getMatches(),
      getRecommendation('recommended'),
      getRecommendation('alternative'),
      getAvailability(),
      getRoleSignals(),
      getWeeklyPoints(),
      getBacktestOverview(),
    ])

    return json({
      meta,
      current_run: players.run || matches.run || null,
      players: players.players || [],
      matches: matches.matches || [],
      squads: {
        recommended,
        alternative,
      },
      availability: availability.rows || [],
      roles: roles.rows || [],
      weekly: {
        through_gameweek: weekly.throughGameweek || 0,
        final_through_gameweek: weekly.finalThroughGameweek || 0,
        players: weekly.players || [],
      },
      performance,
    })
  } catch (error) {
    console.error('scout-data endpoint failed', error)
    return json({
      error: 'Failed to build read-only Scout payload',
      detail: error instanceof Error ? error.message : String(error),
    }, 500)
  }
}

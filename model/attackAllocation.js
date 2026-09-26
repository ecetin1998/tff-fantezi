// Forecast allocation only. Recorded match xG is never changed.
// A single high-xG shot carries less weight as evidence of a repeatable role.
function attackWeights(player, matches = []) {
  const rates = player.rates;
  const observed = matches.filter(m => Number(m.id) === Number(player.id) && Number(m.mins) > 0);
  const exposure = observed.reduce((sum, m) => sum + Number(m.mins) / 90, 0);
  let excess = 0;
  for (const m of observed) {
    const shots = Number(m.shots);
    const xg = Number(m.xg);
    if (!Number.isFinite(shots) || !Number.isFinite(xg) || shots !== 1 || xg <= 0) continue;
    // The cap is on the forecast influence of one shot, never on historical xG.
    const limit = player.pos === 'DEF' ? 0.27 : player.pos === 'MID' ? 0.33 : 0.42;
    excess += Math.max(0, xg - limit);
  }
  const attenuation = observed.length >= 5 ? 0.55 : 0.85;
  const adjustedXg = Math.max(rates[0] * 0.45, rates[0] - attenuation * excess / (2 + exposure));
  return {
    goal: Math.max(1e-6, 0.75 * adjustedXg + 0.25 * rates[1]),
    assist: Math.max(1e-6, 0.5 * rates[3] + 0.5 * rates[2]),
    adjustedXg,
    singleShotExcess: excess,
  };
}

module.exports = { attackWeights };

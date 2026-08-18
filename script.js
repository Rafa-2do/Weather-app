const form = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const result = document.getElementById('result');

// Maps Open-Meteo's weather codes to plain-English descriptions.
const weatherDescriptions = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

// Maps the same weather codes to an emoji icon, using is_day to pick sun vs moon.
function getWeatherIcon(code, isDay) {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code === 1) return isDay ? '🌤️' : '🌙';
  if (code === 2) return isDay ? '⛅' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '❓';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  searchCity(cityInput.value.trim());
});

async function searchCity(city) {
  if (!city) return;

  result.innerHTML = '<p>Loading...</p>';

  try {
    const location = await getCoordinates(city);
    renderRadar(location.latitude, location.longitude);

    const [forecast, air] = await Promise.all([
      getForecast(location.latitude, location.longitude),
      getAirQuality(location.latitude, location.longitude),
    ]);
    renderWeather(location, forecast, air);
  } catch (error) {
    result.innerHTML = `<p>${error.message}</p>`;
  }
}


async function getCoordinates(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Could not find a city named "${city}".`);
  }

  const { latitude, longitude, name, country } = data.results[0];
  return { latitude, longitude, name, country };
}

async function getForecast(latitude, longitude) {
  const params = [
    `latitude=${latitude}`,
    `longitude=${longitude}`,
    `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day`,
    `hourly=temperature_2m,weather_code,precipitation_probability,visibility,uv_index,is_day`,
    `daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max`,
    `timezone=auto`,
    `wind_speed_unit=ms`,
    `forecast_days=10`,
  ].join('&');

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) {
    throw new Error('Could not fetch weather data. Please try again.');
  }
  return response.json();
}

async function getAirQuality(latitude, longitude) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=european_aqi&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.current;
  } catch {
    return null;
  }
}

function renderWeather(location, forecast, air) {
  const { current, hourly, daily } = forecast;
  const isDay = current.is_day === 1;
  const nowIndex = getClosestHourIndex(hourly.time, current.time);
  const description = weatherDescriptions[current.weather_code] || 'Unknown conditions';

  result.innerHTML = `
    <div class="current">
      <h2>${location.name}, ${location.country}</h2>
      <div class="current-icon">${getWeatherIcon(current.weather_code, isDay)}</div>
      <p class="condition">${description}</p>
      <p class="temp-big">${Math.round(current.temperature_2m)}&deg;C</p>
      <p class="feels-like">Feels like ${Math.round(current.apparent_temperature)}&deg;C</p>
      <p class="hi-lo">High ${Math.round(daily.temperature_2m_max[0])}&deg; &middot; Low ${Math.round(daily.temperature_2m_min[0])}&deg;</p>
    </div>

    <section>
      <h3>Hourly forecast</h3>
      <div class="hourly-scroll">${buildHourly(hourly, nowIndex)}</div>
    </section>

    <section>
      <h3>Details</h3>
      <div class="details-grid">${buildDetails(current, hourly, daily, air, nowIndex)}</div>
    </section>

    <section>
      <h3>Sunrise &amp; sunset</h3>
      <div class="sun-arc-wrap">${buildSunPath(daily, current.time)}</div>
    </section>

    <section>
      <h3>10-day forecast</h3>
      <div class="daily-list">${buildDaily(daily)}</div>
    </section>
  `;
}

function buildHourly(hourly, nowIndex) {
  let html = '';
  const end = Math.min(nowIndex + 24, hourly.time.length);

  for (let i = nowIndex; i < end; i++) {
    const time = new Date(hourly.time[i]);
    const label = i === nowIndex ? 'Now' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const icon = getWeatherIcon(hourly.weather_code[i], hourly.is_day[i] === 1);

    html += `
      <div class="hour-item">
        <div class="hour-label">${label}</div>
        <div class="hour-icon">${icon}</div>
        <div class="hour-temp">${Math.round(hourly.temperature_2m[i])}&deg;</div>
      </div>
    `;
  }

  return html;
}

function buildDetails(current, hourly, daily, air, nowIndex) {
  const windDir = degToCompass(current.wind_direction_10m);
  const windKmh = Math.round(current.wind_speed_10m * 3.6);
  const windPercent = (Math.max(0, Math.min(130, windKmh)) / 130) * 100;

  const uv = hourly.uv_index[nowIndex] != null ? Math.round(hourly.uv_index[nowIndex]) : null;
  const uvPercent = uv != null ? (Math.max(0, Math.min(12, uv)) / 12) * 100 : null;
  const aqi = air && air.european_aqi != null ? Math.round(air.european_aqi) : null;
  const aqiPercent = aqi != null ? (Math.max(0, Math.min(120, aqi)) / 120) * 100 : null;
  const humidityPercent =
    current.relative_humidity_2m != null ? Math.max(0, Math.min(100, current.relative_humidity_2m)) : null;
  const pressureHpa = Math.round(current.surface_pressure);
  const pressurePercent = (Math.max(950, Math.min(1050, pressureHpa)) - 950) / 100 * 100;

  return `
    <div class="detail-card">
      <div class="label">💨 Wind direction ${windDir} <span class="wind-dir-arrow" style="transform: rotate(${current.wind_direction_10m}deg)">↑</span></div>
      <div class="wind-bar-wrap">
        <div class="wind-bar">
          <span class="wind-segment wind-segment-blue"></span>
          <span class="wind-segment wind-segment-green"></span>
          <span class="wind-segment wind-segment-yellow"></span>
          <span class="wind-segment wind-segment-red"></span>
          <span class="wind-segment wind-segment-purple"></span>
          <span class="wind-segment wind-segment-maroon"></span>
        </div>
        <div class="wind-marker" style="left: ${windPercent.toFixed(1)}%">
          <span class="wind-marker-value" style="transform: ${markerAnchor(windPercent)}">${current.wind_speed_10m} m/s <span class="wind-marker-value-secondary">(${windKmh} km/h)</span></span>
        </div>
      </div>
      <div class="sub">${getBeaufortDescription(windKmh)}</div>
    </div>
    <div class="detail-card">
      <div class="label">🔆 UV index</div>
      <div class="uv-bar-wrap">
        <div class="uv-bar">
          <span class="uv-segment uv-segment-green"></span>
          <span class="uv-segment uv-segment-yellow"></span>
          <span class="uv-segment uv-segment-orange"></span>
          <span class="uv-segment uv-segment-red"></span>
          <span class="uv-segment uv-segment-violet"></span>
        </div>
        ${uvPercent != null ? `<div class="uv-marker" style="left: ${uvPercent.toFixed(1)}%">
          <span class="uv-marker-value" style="transform: ${markerAnchor(uvPercent)}">${uv}</span>
        </div>` : ''}
      </div>
      <div class="sub">${getUvLabel(uv)}</div>
    </div>
    <div class="detail-card">
      <div class="label">🍃 Air quality</div>
      <div class="aqi-bar-wrap">
        <div class="aqi-bar">
          <span class="aqi-segment aqi-segment-blue"></span>
          <span class="aqi-segment aqi-segment-green"></span>
          <span class="aqi-segment aqi-segment-yellow"></span>
          <span class="aqi-segment aqi-segment-red"></span>
          <span class="aqi-segment aqi-segment-purple"></span>
          <span class="aqi-segment aqi-segment-maroon"></span>
        </div>
        ${aqiPercent != null ? `<div class="aqi-marker" style="left: ${aqiPercent.toFixed(1)}%">
          <span class="aqi-marker-value" style="transform: ${markerAnchor(aqiPercent)}">${aqi}</span>
        </div>` : ''}
      </div>
      <div class="sub">${getAqiLabel(aqi)}</div>
    </div>
    <div class="detail-card">
      <div class="label">💧 Humidity</div>
      <div class="humidity-bar-wrap">
        <div class="humidity-bar">
          <span class="humidity-segment humidity-segment-blue"></span>
          <span class="humidity-segment humidity-segment-green"></span>
          <span class="humidity-segment humidity-segment-yellow"></span>
          <span class="humidity-segment humidity-segment-red"></span>
          <span class="humidity-segment humidity-segment-purple"></span>
        </div>
        ${humidityPercent != null ? `<div class="humidity-marker" style="left: ${humidityPercent.toFixed(1)}%">
          <span class="humidity-marker-value" style="transform: ${markerAnchor(humidityPercent)}">${current.relative_humidity_2m}%</span>
        </div>` : ''}
      </div>
      <div class="sub">${getHumidityLabel(current.relative_humidity_2m)}</div>
    </div>
    <div class="detail-card detail-card-wide">
      <div class="label">📊 Pressure</div>
      <div class="pressure-bar-wrap">
        <div class="pressure-bar">
          <span class="pressure-segment pressure-segment-red"></span>
          <span class="pressure-segment pressure-segment-yellow"></span>
          <span class="pressure-segment pressure-segment-green"></span>
        </div>
        <div class="pressure-marker" style="left: ${pressurePercent.toFixed(1)}%">
          <span class="pressure-marker-value" style="transform: ${markerAnchor(pressurePercent)}">${pressureHpa} hPa/mbar</span>
        </div>
        <div class="pressure-scale">
          <span class="pressure-scale-tick" style="left: 0%; transform: translateX(0)">950</span>
          <span class="pressure-scale-tick" style="left: 30%; transform: translateX(-50%)">980</span>
          <span class="pressure-scale-tick" style="left: 70%; transform: translateX(-50%)">1020</span>
          <span class="pressure-scale-tick" style="left: 100%; transform: translateX(-100%)">1050</span>
        </div>
      </div>
      <div class="pressure-legend">
        <div class="pressure-legend-item">
          <div class="pressure-legend-main">Stormy/Rainy</div>
          <div class="pressure-legend-sub">(Low Pressure)</div>
        </div>
        <div class="pressure-legend-item">
          <div class="pressure-legend-main">Variable</div>
          <div class="pressure-legend-sub">(Normal Pressure)</div>
        </div>
        <div class="pressure-legend-item">
          <div class="pressure-legend-main">Fair/Sunny</div>
          <div class="pressure-legend-sub">(High Pressure)</div>
        </div>
      </div>
    </div>
  `;
}

// Draws a day arc between sunrise and sunset, with the sunrise/sunset times shown as large
// labels flanking it, tick marks at its base, and a dashed horizon line running the full
// width behind everything. The sun marker's (x,y) is computed with the same ellipse math
// used for the arc's "A" path command, so it always sits exactly on the drawn curve.
function buildSunPath(daily, currentTimeIso) {
  const sunriseIso = daily.sunrise[0];
  const sunsetIso = daily.sunset[0];

  if (!sunriseIso || !sunsetIso) {
    return '<p class="sun-arc-unavailable">Sunrise/sunset data unavailable for this location.</p>';
  }

  const sunriseDate = new Date(sunriseIso);
  const sunsetDate = new Date(sunsetIso);
  const now = new Date(currentTimeIso);

  const dayMs = sunsetDate - sunriseDate;
  const elapsedMs = now - sunriseDate;
  // Sun position along the arc; before sunrise/after sunset it's pinned to the sunrise/sunset
  // tick rather than continuing past it (we have no data for a night-side path).
  const t = Math.max(0, Math.min(1, dayMs > 0 ? elapsedMs / dayMs : 0));

  // Arc geometry, in SVG user units.
  const leftX = 4;
  const rightX = 336;
  const dayLeftX = 80; // sunrise tick
  const dayRightX = 260; // sunset tick
  const baselineY = 85;
  const dayRy = 65; // dome height
  const dayRx = (dayRightX - dayLeftX) / 2; // 90
  const dayCx = (dayLeftX + dayRightX) / 2; // 170

  // Point on the arc at progress t (0 = sunrise/left, 1 = sunset/right).
  const angle = Math.PI - t * Math.PI;
  const sunX = (dayCx + dayRx * Math.cos(angle)).toFixed(1);
  const sunY = (baselineY - dayRy * Math.sin(angle)).toFixed(1);

  const durationMin = Math.max(0, Math.round(dayMs / 60000));
  const durationLabel = `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;
  const sunriseLabel = formatTime(sunriseIso);
  const sunsetLabel = formatTime(sunsetIso);

  // Outside daylight hours, "remaining daylight" doesn't apply — show a countdown to the next
  // sunrise instead (today's if we're still before dawn, otherwise tomorrow's, which `daily`
  // already has since it covers the full 10-day forecast, not just today).
  let bottomLabel;
  let bottomValue;

  if (now < sunriseDate || now > sunsetDate) {
    const nextSunriseIso = now < sunriseDate ? sunriseIso : daily.sunrise[1];
    const untilSunriseMin = nextSunriseIso ? Math.max(0, Math.round((new Date(nextSunriseIso) - now) / 60000)) : 0;
    bottomLabel = 'Daytime in';
    bottomValue = `${Math.floor(untilSunriseMin / 60)}h ${untilSunriseMin % 60}m`;
  } else {
    const remainingMin = Math.max(0, Math.round((dayMs * (1 - t)) / 60000));
    bottomLabel = 'Remaining daylight';
    bottomValue = `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`;
  }

  return `
    <div class="sun-arc-caption">
      <span class="sun-arc-caption-label">Length of day</span>
      <span class="sun-arc-caption-value">${durationLabel}</span>
    </div>
    <svg class="sun-arc" viewBox="0 2 340 98" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="Sun position: ${durationLabel} of daytime, ${bottomLabel.toLowerCase()} ${bottomValue}, sunrise ${sunriseLabel}, sunset ${sunsetLabel}">
      <line class="sun-arc-baseline" x1="${leftX}" y1="${baselineY}" x2="${rightX}" y2="${baselineY}" />
      <path class="sun-arc-elapsed" d="M ${dayLeftX},${baselineY} A ${dayRx},${dayRy} 0 0,1 ${sunX},${sunY}" />
      <path class="sun-arc-remaining" d="M ${sunX},${sunY} A ${dayRx},${dayRy} 0 0,1 ${dayRightX},${baselineY}" />
      <line class="sun-arc-tick" x1="${dayLeftX}" y1="${baselineY - 6}" x2="${dayLeftX}" y2="${baselineY + 6}" />
      <line class="sun-arc-tick" x1="${dayRightX}" y1="${baselineY - 6}" x2="${dayRightX}" y2="${baselineY + 6}" />
      <circle class="sun-arc-glow" cx="${sunX}" cy="${sunY}" r="14" />
      <circle class="sun-arc-marker" cx="${sunX}" cy="${sunY}" r="7" />
      <text class="sun-arc-side-label" x="${leftX}" y="${baselineY - 24}">Sunrise</text>
      <text class="sun-arc-side-value" x="${leftX}" y="${baselineY - 6}">${sunriseLabel}</text>
      <text class="sun-arc-side-label" x="${rightX}" y="${baselineY - 24}" text-anchor="end">Sunset</text>
      <text class="sun-arc-side-value" x="${rightX}" y="${baselineY - 6}" text-anchor="end">${sunsetLabel}</text>
      <text class="sun-arc-horizon-label" x="${rightX}" y="${baselineY + 10}" text-anchor="end">Horizon</text>
    </svg>
    <div class="sun-arc-caption">
      <span class="sun-arc-caption-label">${bottomLabel}</span>
      <span class="sun-arc-caption-value">${bottomValue}</span>
    </div>
  `;
}

function buildDaily(daily) {
  let html = `
    <div class="daily-row daily-header">
      <div class="day">${formatDDMMYYYY(daily.time[0])}</div>
      <div class="icon">Weather</div>
      <div class="prob">🌧️</div>
      <div class="temps">Hi / Lo</div>
    </div>
  `;

  for (let i = 0; i < daily.time.length; i++) {
    const date = new Date(daily.time[i]);
    const label =
      i === 0
        ? 'Today'
        : `${date.toLocaleDateString([], { weekday: 'short' })} <span class="day-date">${formatDDMM(daily.time[i])}</span>`;
    const icon = getWeatherIcon(daily.weather_code[i], true);
    const prob = daily.precipitation_probability_max[i];

    html += `
      <div class="daily-row">
        <div class="day">${label}</div>
        <div class="icon">${icon}</div>
        <div class="prob">${prob != null ? prob + '%' : ''}</div>
        <div class="temps">${Math.round(daily.temperature_2m_max[i])}&deg; / ${Math.round(daily.temperature_2m_min[i])}&deg;</div>
      </div>
    `;
  }

  return html;
}

// current.time often includes real-world minutes (e.g. 14:23) while hourly.time entries
// are always on the hour (14:00), so an exact string match can miss — find the nearest one instead.
function getClosestHourIndex(hourlyTimes, currentTimeIso) {
  const currentDate = new Date(currentTimeIso);
  let closestIndex = 0;
  let smallestDiff = Infinity;

  for (let i = 0; i < hourlyTimes.length; i++) {
    const diff = Math.abs(new Date(hourlyTimes[i]) - currentDate);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
}

function degToCompass(deg) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDDMM(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDDMMYYYY(iso) {
  const d = new Date(iso);
  return `${formatDDMM(iso)}/${d.getFullYear()}`;
}

function getUvLabel(uv) {
  if (uv == null) return '';
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}

function getAqiLabel(aqi) {
  if (aqi == null) return '';
  if (aqi <= 20) return 'Good';
  if (aqi <= 40) return 'Fair';
  if (aqi <= 60) return 'Moderate';
  if (aqi <= 80) return 'Poor';
  if (aqi <= 100) return 'Very poor';
  return 'Extremely poor';
}

function getHumidityLabel(humidity) {
  if (humidity == null) return '';
  if (humidity <= 30) return 'Dry';
  if (humidity <= 50) return 'Comfortable';
  if (humidity <= 65) return 'Tolerable';
  if (humidity <= 80) return 'Humid';
  return 'Oppressive';
}

// Beaufort wind force scale (0-12), thresholds in km/h per the Met Office reference table.
function getBeaufortDescription(kmh) {
  if (kmh == null) return '';
  if (kmh < 1) return 'Calm';
  if (kmh < 6) return 'Light air';
  if (kmh < 12) return 'Light breeze';
  if (kmh < 20) return 'Gentle breeze';
  if (kmh < 29) return 'Moderate breeze';
  if (kmh < 39) return 'Fresh breeze';
  if (kmh < 50) return 'Strong breeze';
  if (kmh < 62) return 'Near gale';
  if (kmh < 75) return 'Gale';
  if (kmh < 89) return 'Strong gale';
  if (kmh < 103) return 'Storm';
  if (kmh < 118) return 'Violent storm';
  return 'Hurricane';
}

// The floating marker label is centered on its tick by default, but centering can push wide
// labels (e.g. wind's "4.7 m/s (17 km/h)") past the card's edge when the tick sits near either
// end of the bar. Anchoring left/right instead near the edges keeps the label fully in bounds
// while it still tracks the tick's exact position.
function markerAnchor(percent) {
  if (percent < 35) return 'translateX(0)';
  if (percent > 65) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

// --- Rain radar map (hand-built interactive "slippy map" using OpenStreetMap + RainViewer tiles) ---

const RADAR_TILE_SIZE = 256;
const RADAR_MAP_SIZE = 544;
const RADAR_DEFAULT_ZOOM = 7;
const RADAR_MIN_ZOOM = 3;
const RADAR_MAX_ZOOM = 18;
const RADAR_TILE_MAX_ZOOM = 7; // RainViewer has no real radar data past this zoom

const radarMapEl = document.getElementById('radar-map');
const radarTilesEl = document.getElementById('radar-tiles');
const radarPlaceholderEl = document.getElementById('radar-placeholder');
const radarCaptionEl = document.getElementById('radar-caption');
const radarZoomInBtn = document.getElementById('radar-zoom-in');
const radarZoomOutBtn = document.getElementById('radar-zoom-out');
const radarTimeSliderEl = document.getElementById('radar-time-slider');
const radarTimeLabelEl = document.getElementById('radar-time-label');
const radarForecastNoteEl = document.getElementById('radar-forecast-note');

// Holds everything needed to redraw the map: null until the first successful search.
let radarState = null;

// Converts a lon/lat pair into pixel coordinates on the standard "slippy map" world grid at a given zoom.
function lonLatToWorldPx(lon, lat, zoom) {
  const scale = 2 ** zoom * RADAR_TILE_SIZE;
  const x = ((lon + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return { x, y };
}

async function renderRadar(lat, lon) {
  radarTilesEl.innerHTML = '';
  radarCaptionEl.textContent = '';
  radarPlaceholderEl.textContent = 'Loading radar...';
  radarPlaceholderEl.style.display = 'block';
  radarTimeSliderEl.disabled = true;

  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await response.json();
    // RainViewer's documented guarantee is "past": 2 hours of history in 10-minute steps.
    // "nowcast" (forecast) isn't in their public docs and is often empty — when it does have
    // frames we use them for the +2h side of the slider, but the app works fine without it.
    const pastFrames = (data.radar && data.radar.past) || [];
    const forecastFrames = (data.radar && data.radar.nowcast) || [];

    if (pastFrames.length === 0) {
      throw new Error('Radar data unavailable.');
    }

    const zoom = RADAR_DEFAULT_ZOOM;
    const centerPx = lonLatToWorldPx(lon, lat, zoom);
    const nowIndex = pastFrames.length - 1;

    radarState = {
      zoom,
      centerPxX: centerPx.x,
      centerPxY: centerPx.y,
      cityLon: lon,
      cityLat: lat,
      frames: [...pastFrames, ...forecastFrames], // chronological: oldest past ... now ... forecast
      nowIndex,
      frameIndex: nowIndex, // slider starts on the most recent real data
    };

    radarPlaceholderEl.style.display = 'none';
    drawRadarTiles();

    radarTimeSliderEl.disabled = false;
    radarTimeSliderEl.min = '0';
    radarTimeSliderEl.max = String(radarState.frames.length - 1);
    radarTimeSliderEl.value = String(nowIndex);
    radarForecastNoteEl.textContent = forecastFrames.length > 0 ? '+2h' : 'forecast unavailable';
    updateRadarTimeLabel();

    radarCaptionEl.textContent = 'Drag to pan, scroll to zoom, use the slider for past/forecast radar';
  } catch (error) {
    radarState = null;
    radarPlaceholderEl.textContent = 'Could not load rain radar.';
    radarPlaceholderEl.style.display = 'block';
  }
}

function updateRadarTimeLabel() {
  if (!radarState) return;
  const frame = radarState.frames[radarState.frameIndex];
  const offsetMin = (radarState.frameIndex - radarState.nowIndex) * 10;
  const timeStr = new Date(frame.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  let offsetLabel = 'Now';
  if (offsetMin > 0) offsetLabel = `+${offsetMin} min (forecast)`;
  else if (offsetMin < 0) offsetLabel = `${offsetMin} min`;

  radarTimeLabelEl.textContent = `${offsetLabel} · ${timeStr}`;
}

radarTimeSliderEl.addEventListener('input', () => {
  if (!radarState) return;
  radarState.frameIndex = parseInt(radarTimeSliderEl.value, 10);
  updateRadarTimeLabel();
  drawRadarOverlayTiles();
});

// The container is responsive (CSS max-width: 100% shrinks it on small screens), so all pixel
// math must use its real rendered size rather than the RADAR_MAP_SIZE constant — otherwise
// positioning (and anything "centered" on the box) drifts on any screen narrower than that.
function getMapSize() {
  return radarMapEl.clientWidth || RADAR_MAP_SIZE;
}

// Rebuilds the base map tiles + radar overlay + city marker for the current radarState
// (zoom/pan position). Used for pan/zoom, where the base map itself needs to change.
function drawRadarTiles() {
  if (!radarState) return;

  radarTilesEl.style.transform = '';
  radarTilesEl.innerHTML = '';

  const { zoom, centerPxX, centerPxY, cityLon, cityLat } = radarState;
  const worldTiles = 2 ** zoom;
  const mapSize = getMapSize();

  const originX = centerPxX - mapSize / 2;
  const originY = centerPxY - mapSize / 2;

  const startTileX = Math.floor(originX / RADAR_TILE_SIZE);
  const endTileX = Math.floor((originX + mapSize) / RADAR_TILE_SIZE);
  const startTileY = Math.floor(originY / RADAR_TILE_SIZE);
  const endTileY = Math.floor((originY + mapSize) / RADAR_TILE_SIZE);

  for (let x = startTileX; x <= endTileX; x++) {
    for (let y = startTileY; y <= endTileY; y++) {
      if (y < 0 || y >= worldTiles) continue; // no tiles beyond the poles

      const left = x * RADAR_TILE_SIZE - originX;
      const top = y * RADAR_TILE_SIZE - originY;
      const wrappedX = ((x % worldTiles) + worldTiles) % worldTiles;

      const baseTile = document.createElement('img');
      baseTile.className = 'tile base-tile';
      baseTile.draggable = false;
      baseTile.onerror = () => baseTile.remove();
      baseTile.src = `https://a.tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
      baseTile.style.left = `${left}px`;
      baseTile.style.top = `${top}px`;
      radarTilesEl.appendChild(baseTile);
    }
  }

  drawRadarOverlayTiles();

  // The marker stays pinned to the searched city's real coordinates, not the map center.
  const cityPx = lonLatToWorldPx(cityLon, cityLat, zoom);
  const marker = document.createElement('div');
  marker.className = 'marker';
  marker.style.left = `${cityPx.x - originX}px`;
  marker.style.top = `${cityPx.y - originY}px`;
  radarTilesEl.appendChild(marker);
}

// Rebuilds just the rain radar overlay for the currently selected time (radarState.frameIndex),
// leaving the base map and marker untouched — this is what the time slider calls on every drag,
// so scrubbing through frames doesn't re-request unchanged OpenStreetMap tiles.
function drawRadarOverlayTiles() {
  if (!radarState) return;

  radarTilesEl.querySelectorAll('.radar-tile').forEach((el) => el.remove());

  const frame = radarState.frames[radarState.frameIndex];
  if (!frame) return;

  const { zoom, centerPxX, centerPxY } = radarState;
  const mapSize = getMapSize();
  const originX = centerPxX - mapSize / 2;
  const originY = centerPxY - mapSize / 2;

  // RainViewer's radar imagery only has real data up to RADAR_TILE_MAX_ZOOM — beyond that
  // it silently returns an identical "not supported" placeholder image. So once the map is
  // zoomed in further than that, we fetch the radar tile at the capped zoom and stretch it
  // with CSS to cover the same ground area as the (now several) higher-zoom base tiles.
  const radarZoom = Math.min(zoom, RADAR_TILE_MAX_ZOOM);
  const radarScale = 2 ** (zoom - radarZoom);
  const radarWorldTiles = 2 ** radarZoom;
  const radarTileSpan = RADAR_TILE_SIZE * radarScale;

  // The further past its native resolution the radar tile gets stretched, the blockier and
  // more visually "loud" it becomes — fade it out so street names stay readable underneath.
  const zoomPastMax = Math.max(0, zoom - RADAR_TILE_MAX_ZOOM);
  const radarOpacity = Math.max(0.3, 1 - zoomPastMax * 0.12);

  const originRX = originX / radarScale;
  const originRY = originY / radarScale;
  const mapSizeR = mapSize / radarScale;

  const startRTileX = Math.floor(originRX / RADAR_TILE_SIZE);
  const endRTileX = Math.floor((originRX + mapSizeR) / RADAR_TILE_SIZE);
  const startRTileY = Math.floor(originRY / RADAR_TILE_SIZE);
  const endRTileY = Math.floor((originRY + mapSizeR) / RADAR_TILE_SIZE);

  for (let x = startRTileX; x <= endRTileX; x++) {
    for (let y = startRTileY; y <= endRTileY; y++) {
      if (y < 0 || y >= radarWorldTiles) continue;

      const left = (x * RADAR_TILE_SIZE - originRX) * radarScale;
      const top = (y * RADAR_TILE_SIZE - originRY) * radarScale;
      const wrappedX = ((x % radarWorldTiles) + radarWorldTiles) % radarWorldTiles;

      const radarTile = document.createElement('img');
      radarTile.className = 'tile radar-tile';
      radarTile.draggable = false;
      radarTile.onerror = () => radarTile.remove();
      radarTile.src = `https://tilecache.rainviewer.com${frame.path}/256/${radarZoom}/${wrappedX}/${y}/2/1_1.png`;
      radarTile.style.left = `${left}px`;
      radarTile.style.top = `${top}px`;
      radarTile.style.width = `${radarTileSpan}px`;
      radarTile.style.height = `${radarTileSpan}px`;
      radarTile.style.opacity = radarOpacity;
      radarTilesEl.appendChild(radarTile);
    }
  }
}

// Zooms toward a specific point on screen (screenX/screenY are pixels inside #radar-map),
// keeping that point stationary — the same trick Google Maps uses for scroll-to-zoom.
function zoomRadar(direction, screenX, screenY) {
  if (!radarState) return;

  const newZoom = Math.min(RADAR_MAX_ZOOM, Math.max(RADAR_MIN_ZOOM, radarState.zoom + direction));
  if (newZoom === radarState.zoom) return;

  const mapSize = getMapSize();
  const originX = radarState.centerPxX - mapSize / 2;
  const originY = radarState.centerPxY - mapSize / 2;
  const worldX = originX + screenX;
  const worldY = originY + screenY;

  const scaleFactor = 2 ** (newZoom - radarState.zoom);

  radarState.centerPxX = worldX * scaleFactor - screenX + mapSize / 2;
  radarState.centerPxY = worldY * scaleFactor - screenY + mapSize / 2;
  radarState.zoom = newZoom;

  drawRadarTiles();
}

// --- Interactions: mouse drag, wheel zoom, touch drag, zoom buttons ---
// Set up once at load; handlers read the shared `radarState`, so they work for every search.

let radarDrag = null;

radarMapEl.addEventListener('mousedown', (event) => {
  if (!radarState) return;
  radarDrag = {
    startX: event.clientX,
    startY: event.clientY,
    startCenterPxX: radarState.centerPxX,
    startCenterPxY: radarState.centerPxY,
  };
  radarMapEl.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (event) => {
  if (!radarDrag) return;
  const dx = event.clientX - radarDrag.startX;
  const dy = event.clientY - radarDrag.startY;
  radarTilesEl.style.transform = `translate(${dx}px, ${dy}px)`;
});

window.addEventListener('mouseup', (event) => {
  if (!radarDrag) return;
  const dx = event.clientX - radarDrag.startX;
  const dy = event.clientY - radarDrag.startY;
  radarState.centerPxX = radarDrag.startCenterPxX - dx;
  radarState.centerPxY = radarDrag.startCenterPxY - dy;
  radarDrag = null;
  radarMapEl.style.cursor = 'grab';
  drawRadarTiles();
});

radarMapEl.addEventListener(
  'wheel',
  (event) => {
    if (!radarState) return;
    event.preventDefault();
    const rect = radarMapEl.getBoundingClientRect();
    zoomRadar(event.deltaY < 0 ? 1 : -1, event.clientX - rect.left, event.clientY - rect.top);
  },
  { passive: false }
);

radarZoomInBtn.addEventListener('click', () => zoomRadar(1, getMapSize() / 2, getMapSize() / 2));
radarZoomOutBtn.addEventListener('click', () => zoomRadar(-1, getMapSize() / 2, getMapSize() / 2));

// Touch: single finger drags, two fingers pinch-to-zoom (anchored at the pinch midpoint,
// so panning while pinching works too — same live-preview-then-snap pattern as mouse drag).
let radarTouch = null;

function touchDistance(t0, t1) {
  const dx = t1.clientX - t0.clientX;
  const dy = t1.clientY - t0.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchMidpoint(t0, t1, rect) {
  return {
    x: (t0.clientX + t1.clientX) / 2 - rect.left,
    y: (t0.clientY + t1.clientY) / 2 - rect.top,
  };
}

radarMapEl.addEventListener(
  'touchstart',
  (event) => {
    if (!radarState) return;
    const mapSize = getMapSize();

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const rect = radarMapEl.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      const touchY = touch.clientY - rect.top;
      const now = Date.now();

      // If this touch lands where/when the last tap did, it's the second tap of a double-tap.
      // Google Maps behavior: a quick lift zooms in one level; holding and dragging afterward
      // (handled in touchmove/touchend below) instead zooms continuously, anchored right here.
      const isSecondTap =
        lastTapPos &&
        now - lastTapTime < DOUBLE_TAP_MAX_GAP_MS &&
        Math.hypot(touchX - lastTapPos.x, touchY - lastTapPos.y) < DOUBLE_TAP_MAX_DISTANCE_PX;

      if (isSecondTap) {
        lastTapTime = 0;
        lastTapPos = null;
        radarTouch = {
          mode: 'doubleTapZoom',
          anchorX: touchX,
          anchorY: touchY,
          startTouchX: touch.clientX,
          startTouchY: touch.clientY,
          startTime: now,
        };
        radarTilesEl.style.transformOrigin = `${touchX}px ${touchY}px`;
      } else {
        radarTouch = {
          mode: 'drag',
          startX: touch.clientX,
          startY: touch.clientY,
          startCenterPxX: radarState.centerPxX,
          startCenterPxY: radarState.centerPxY,
          startTime: now,
        };
      }
    } else if (event.touches.length === 2) {
      const rect = radarMapEl.getBoundingClientRect();
      const startMid = touchMidpoint(event.touches[0], event.touches[1], rect);

      radarTouch = {
        mode: 'pinch',
        startDistance: touchDistance(event.touches[0], event.touches[1]),
        startZoom: radarState.zoom,
        startMid,
        // The real-world point under the pinch midpoint, so it can be kept anchored there
        // (the same "zoom toward a fixed point" trick zoomRadar uses for scroll-to-zoom).
        startWorldMidX: radarState.centerPxX - mapSize / 2 + startMid.x,
        startWorldMidY: radarState.centerPxY - mapSize / 2 + startMid.y,
        lastMid: startMid,
        lastScale: 1,
        startTime: Date.now(),
      };
      radarTilesEl.style.transformOrigin = `${startMid.x}px ${startMid.y}px`;
    }
  },
  { passive: true }
);

radarMapEl.addEventListener(
  'touchmove',
  (event) => {
    if (!radarTouch) return;

    if (radarTouch.mode === 'drag' && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const dx = touch.clientX - radarTouch.startX;
      const dy = touch.clientY - radarTouch.startY;
      radarTilesEl.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (radarTouch.mode === 'doubleTapZoom' && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const dy = touch.clientY - radarTouch.startTouchY;
      // Dragging up zooms in, dragging down zooms out — anchored at the double-tap point,
      // which stays fixed on screen the whole time (no panning from this gesture).
      radarTouch.lastZoomDelta = -dy / DRAG_ZOOM_PX_PER_LEVEL;
      radarTilesEl.style.transform = `scale(${2 ** radarTouch.lastZoomDelta})`;
    } else if (radarTouch.mode === 'pinch' && event.touches.length === 2) {
      event.preventDefault();
      const rect = radarMapEl.getBoundingClientRect();
      const mid = touchMidpoint(event.touches[0], event.touches[1], rect);
      const distance = touchDistance(event.touches[0], event.touches[1]);

      radarTouch.lastMid = mid;
      radarTouch.lastScale = distance / radarTouch.startDistance;

      const dx = mid.x - radarTouch.startMid.x;
      const dy = mid.y - radarTouch.startMid.y;
      radarTilesEl.style.transform = `translate(${dx}px, ${dy}px) scale(${radarTouch.lastScale})`;
    }
  },
  { passive: false }
);

// Tap detection: a touch that ends quickly without much movement counts as a tap.
// Two of those close together in time and position form a double-tap; touchstart above
// already recognizes the second one and switches into 'doubleTapZoom' mode for it, so this
// only needs to record single taps here (see DRAG_ZOOM_PX_PER_LEVEL for the drag-to-zoom rate).
const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_MOVE_PX = 12;
const DOUBLE_TAP_MAX_GAP_MS = 350;
const DOUBLE_TAP_MAX_DISTANCE_PX = 40;
const DRAG_ZOOM_PX_PER_LEVEL = 120;

let lastTapTime = 0;
let lastTapPos = null;

function endRadarTouch(event) {
  if (!radarTouch) return;
  const duration = Date.now() - radarTouch.startTime;

  if (radarTouch.mode === 'drag') {
    const endTouch = event.changedTouches && event.changedTouches[0];
    const rect = radarMapEl.getBoundingClientRect();
    const tapX = endTouch ? endTouch.clientX - rect.left : null;
    const tapY = endTouch ? endTouch.clientY - rect.top : null;
    const moved = endTouch ? Math.hypot(endTouch.clientX - radarTouch.startX, endTouch.clientY - radarTouch.startY) : Infinity;

    if (endTouch && moved < TAP_MAX_MOVE_PX && duration < TAP_MAX_DURATION_MS) {
      radarTilesEl.style.transform = '';
      radarTouch = null;
      lastTapTime = Date.now();
      lastTapPos = { x: tapX, y: tapY };
      return;
    }

    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(radarTilesEl.style.transform);
    if (match) {
      radarState.centerPxX = radarTouch.startCenterPxX - parseFloat(match[1]);
      radarState.centerPxY = radarTouch.startCenterPxY - parseFloat(match[2]);
    }
  } else if (radarTouch.mode === 'doubleTapZoom') {
    const endTouch = event.changedTouches && event.changedTouches[0];
    const dy = endTouch ? endTouch.clientY - radarTouch.startTouchY : 0;
    const dx = endTouch ? endTouch.clientX - radarTouch.startTouchX : 0;
    const moved = Math.hypot(dx, dy);

    radarTilesEl.style.transform = '';
    radarTilesEl.style.transformOrigin = '';

    const anchorX = radarTouch.anchorX;
    const anchorY = radarTouch.anchorY;
    radarTouch = null;

    if (moved < TAP_MAX_MOVE_PX && duration < TAP_MAX_DURATION_MS) {
      zoomRadar(1, anchorX, anchorY); // quick double-tap, no drag: zoom in one level
    } else {
      const deltaLevels = Math.round(-dy / DRAG_ZOOM_PX_PER_LEVEL);
      if (deltaLevels !== 0) {
        zoomRadar(deltaLevels, anchorX, anchorY); // double-tap + drag: zoom by however far it moved
      } else {
        drawRadarTiles();
      }
    }
    return;
  } else if (radarTouch.mode === 'pinch') {
    const mapSize = getMapSize();
    const newZoom = Math.min(
      RADAR_MAX_ZOOM,
      Math.max(RADAR_MIN_ZOOM, Math.round(radarTouch.startZoom + Math.log2(radarTouch.lastScale)))
    );
    const scaleFactor = 2 ** (newZoom - radarTouch.startZoom);

    radarTilesEl.style.transform = '';
    radarTilesEl.style.transformOrigin = '';

    radarState.centerPxX = radarTouch.startWorldMidX * scaleFactor - radarTouch.lastMid.x + mapSize / 2;
    radarState.centerPxY = radarTouch.startWorldMidY * scaleFactor - radarTouch.lastMid.y + mapSize / 2;
    radarState.zoom = newZoom;
  }

  radarTouch = null;
  radarTilesEl.style.transformOrigin = '';
  drawRadarTiles();
}

function cancelRadarTouch() {
  radarTouch = null;
  radarTilesEl.style.transformOrigin = '';
  drawRadarTiles();
}

radarMapEl.addEventListener('touchend', endRadarTouch);
radarMapEl.addEventListener('touchcancel', cancelRadarTouch);

// Show a default city as soon as the page loads.
cityInput.value = 'Tampere';
searchCity('Tampere');

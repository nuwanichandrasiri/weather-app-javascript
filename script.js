const API_KEY = "76e5c16046d652d0a94f873247fcb511";
const BASE = "https://api.openweathermap.org";

const RECENT_KEY = "lunasky.recent";
const FAV_KEY = "lunasky.favorites";
const UNITS_KEY = "lunasky.units";

const state = {
  units: localStorage.getItem(UNITS_KEY) || "metric",
  current: null,
  recent: JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"),
  favorites: JSON.parse(localStorage.getItem(FAV_KEY) || "[]"),
};

const $ = (id) => document.getElementById(id);
const iconUrl = (icon, size = 2) =>
  `https://openweathermap.org/img/wn/${icon}@${size}x.png`;

const fmtHour = (dt) => new Date(dt * 1000).toLocaleTimeString([], { hour: "numeric" });
const fmtDay  = (dt) => new Date(dt * 1000).toLocaleDateString([], { weekday: "short" });
const fmtTime = (dt, tz) => new Date((dt + tz) * 1000).toUTCString().slice(17, 22);

async function ok(r) {
  if (!r.ok) {
    if (r.status === 404) throw new Error("City not found. Try another search.");
    throw new Error("Weather service unavailable. Please try again.");
  }
  return r.json();
}

async function fetchCurrentByCity(city, units) {
  const d = await ok(await fetch(`${BASE}/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${units}`));
  return normalize(d);
}
async function fetchCurrentByCoords(lat, lon, units) {
  const d = await ok(await fetch(`${BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}`));
  return normalize(d);
}
function normalize(d) {
  return {
    name: d.name, country: d.sys?.country || "",
    lat: d.coord.lat, lon: d.coord.lon,
    temp: d.main.temp, feels_like: d.main.feels_like,
    temp_min: d.main.temp_min, temp_max: d.main.temp_max,
    humidity: d.main.humidity, pressure: d.main.pressure,
    visibility: d.visibility || 0,
    wind_speed: d.wind?.speed || 0,
    sunrise: d.sys?.sunrise || 0, sunset: d.sys?.sunset || 0,
    timezone: d.timezone || 0, dt: d.dt,
    description: d.weather[0].description, icon: d.weather[0].icon, id: d.weather[0].id,
  };
}
async function fetchForecast(lat, lon, units) {
  const d = await ok(await fetch(`${BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}`));
  const hourly = d.list.slice(0, 8).map(s => ({
    dt: s.dt, temp: s.main.temp, icon: s.weather[0].icon,
    condition: s.weather[0].main, pop: s.pop || 0,
  }));
  const byDay = new Map();
  for (const s of d.list) {
    const k = new Date(s.dt * 1000).toISOString().slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const daily = [...byDay.values()].slice(0, 6).map(slots => {
    const temps = slots.map(s => s.main.temp);
    const mid = slots[Math.floor(slots.length / 2)];
    return {
      dt: slots[0].dt, min: Math.min(...temps), max: Math.max(...temps),
      condition: mid.weather[0].main, icon: mid.weather[0].icon,
    };
  }).slice(1, 6);
  return { hourly, daily };
}
async function fetchAir(lat, lon) {
  try {
    const d = await ok(await fetch(`${BASE}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`));
    return d.list[0].main.aqi;
  } catch { return null; }
}
const aqiLabel = (a) => ["—","Good","Fair","Moderate","Poor","Very Poor"][a] || "—";

function save() {
  localStorage.setItem(UNITS_KEY, state.units);
  localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));
  localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
}

function showError(msg) {
  const el = $("error");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 5000);
}

async function loadCity(loader, opts = {}) {
  $("loader").hidden = false;
  $("error").hidden = true;
  try {
    const c = await loader();
    state.current = c;
    const [f, aqi] = await Promise.all([fetchForecast(c.lat, c.lon, state.units), fetchAir(c.lat, c.lon)]);
    if (!opts.skipRecent) {
      const label = `${c.name}, ${c.country}`;
      state.recent = [label, ...state.recent.filter(x => x !== label)].slice(0, 6);
    }
    save();
    render(c, f, aqi);
  } catch (e) {
    showError(e.message || "Something went wrong.");
  } finally {
    $("loader").hidden = true;
  }
}

function render(c, f, aqi) {
  const tu = state.units === "metric" ? "°C" : "°F";
  const su = state.units === "metric" ? "m/s" : "mph";
  const label = `${c.name}, ${c.country}`;
  $("content").hidden = false;
  $("loc-name").textContent = label;
  $("temp").textContent = Math.round(c.temp);
  $("temp-unit").textContent = tu;
  $("desc").textContent = c.description;
  $("meta").textContent = `Feels like ${Math.round(c.feels_like)}${tu} · H ${Math.round(c.temp_max)}° / L ${Math.round(c.temp_min)}°`;
  $("hero-icon").src = iconUrl(c.icon, 4);
  $("hero-icon").alt = c.description;

  const isFav = state.favorites.includes(label);
  $("fav-btn").innerHTML = isFav ? "♥ Saved" : "♡ Save";

  $("hourly").innerHTML = f.hourly.map((h, i) => `
    <div class="hour">
      <span class="h-time">${i === 0 ? "Now" : fmtHour(h.dt)}</span>
      <img src="${iconUrl(h.icon)}" alt="" width="44" height="44" />
      <span class="h-temp">${Math.round(h.temp)}°</span>
      ${h.pop > 0.1 ? `<span class="h-pop">💧 ${Math.round(h.pop*100)}%</span>` : ""}
    </div>`).join("");

  $("daily").innerHTML = f.daily.map(d => `
    <li>
      <span class="d-day">${fmtDay(d.dt)}</span>
      <img src="${iconUrl(d.icon)}" alt="" width="40" height="40" />
      <span class="d-cond">${d.condition}</span>
      <span class="d-temps"><span class="lo">${Math.round(d.min)}°</span><span class="sep">/</span>${Math.round(d.max)}°</span>
    </li>`).join("");

  const stats = [
    ["🌡", "Feels like", `${Math.round(c.feels_like)}${tu}`],
    ["💧", "Humidity", `${c.humidity}%`],
    ["💨", "Wind", `${c.wind_speed.toFixed(1)} ${su}`],
    ["📊", "Pressure", `${c.pressure} hPa`],
    ["👁", "Visibility", `${(c.visibility/1000).toFixed(1)} km`],
    ["🌅", "Sunrise", fmtTime(c.sunrise, c.timezone)],
    ["🌇", "Sunset", fmtTime(c.sunset, c.timezone)],
  ];
  if (aqi) stats.push(["⭐", "Air quality", aqiLabel(aqi)]);
  $("stats").innerHTML = stats.map(([i,l,v]) => `
    <div class="stat glass">
      <div class="stat-label">${i} ${l}</div>
      <div class="stat-value">${v}</div>
    </div>`).join("");

  $("footer").textContent = `Data from OpenWeatherMap · Updated ${new Date(c.dt*1000).toLocaleTimeString()}`;

  renderChips();
}

function renderChips() {
  const c = state.current;
  const here = c ? `${c.name}, ${c.country}` : "";
  const chips = [
    ...state.favorites.map(x => ({ label: `♥ ${x}`, city: x.split(",")[0] })),
    ...state.recent.filter(x => x !== here).map(x => ({ label: x, city: x.split(",")[0] })),
  ];
  $("chips").innerHTML = chips.map(c => `<button class="chip glass" data-city="${c.city}">${c.label}</button>`).join("");
  $("chips").querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => loadCity(() => fetchCurrentByCity(b.dataset.city, state.units)));
  });
}

function setUnits(u) {
  state.units = u;
  $("unit-c").classList.toggle("active", u === "metric");
  $("unit-f").classList.toggle("active", u === "imperial");
  save();
  if (state.current) loadCity(() => fetchCurrentByCoords(state.current.lat, state.current.lon, u), { skipRecent: true });
}

function useGeo() {
  if (!navigator.geolocation) { showError("Geolocation isn't supported."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => loadCity(() => fetchCurrentByCoords(pos.coords.latitude, pos.coords.longitude, state.units)),
    () => showError("Couldn't access your location.")
  );
}

function searchCity() {
  const v = $("search-input").value.trim();
  if (!v) return;
  loadCity(() => fetchCurrentByCity(v, state.units));
  $("search-input").value = "";
}

function toggleFav() {
  const c = state.current; if (!c) return;
  const label = `${c.name}, ${c.country}`;
  state.favorites = state.favorites.includes(label)
    ? state.favorites.filter(x => x !== label)
    : [label, ...state.favorites].slice(0, 10);
  save();
  $("fav-btn").innerHTML = state.favorites.includes(label) ? "♥ Saved" : "♡ Save";
  renderChips();
}

// Wire up
$("search-btn").addEventListener("click", searchCity);
$("search-input").addEventListener("keydown", e => { if (e.key === "Enter") searchCity(); });
$("geo-btn").addEventListener("click", useGeo);
$("unit-c").addEventListener("click", () => setUnits("metric"));
$("unit-f").addEventListener("click", () => setUnits("imperial"));
$("fav-btn").addEventListener("click", toggleFav);
setUnits(state.units);

// Initial load: try geo, else Colombo
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => loadCity(() => fetchCurrentByCoords(pos.coords.latitude, pos.coords.longitude, state.units)),
    () => loadCity(() => fetchCurrentByCity("Colombo", state.units)),
    { timeout: 5000 }
  );
} else {
  loadCity(() => fetchCurrentByCity("Colombo", state.units));
}

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getGoogleMapQuery, getTripCoordinates } from "./tripCoordinates.js";
import "./DayOverview.css";

function DayMap({ stops }) {
  const container = useRef(null);

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const route = stops.filter(stop => !stop.alternative).map(stop => stop.coordinates);
    if (route.length > 1) {
      L.polyline(route, { color: "#315d72", weight: 3, dashArray: "6 8" }).addTo(map);
    }

    const byLocation = new Map();
    for (const stop of stops) {
      const key = stop.coordinates.join(",");
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key).push(stop);
    }
    for (const sameLocation of byLocation.values()) {
      const first = sameLocation[0];
      const numbers = sameLocation.map(stop => stop.number).join("·");
      const marker = L.marker(first.coordinates, {
        title: sameLocation.map(stop => stop.name).join("、"),
        icon: L.divIcon({
          className: "day-map-pin",
          html: numbers,
          iconSize: [Math.max(28, 13 + numbers.length * 8), 28]
        })
      }).addTo(map);

      const popup = document.createElement("div");
      for (const stop of sameLocation) {
        const link = document.createElement("a");
        link.href = stop.mapUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = `${stop.number}. ${stop.name} ↗`;
        popup.append(link);
      }
      marker.bindPopup(popup);
    }
    map.fitBounds(stops.map(stop => stop.coordinates), { padding: [30, 30], maxZoom: 16 });
    return () => map.remove();
  }, [stops]);

  return <div ref={container} className="day-map" role="region" aria-label="當日地圖" />;
}

function getDirections(entries) {
  const visits = [];
  for (const entry of entries) {
    const query = getGoogleMapQuery(entry.mapUrl);
    if (!entry.alternative && query && query !== visits.at(-1)?.query) {
      visits.push({ query, number: entry.number });
    }
  }

  const directions = [];
  // Google Maps on mobile supports three intermediate stops per link.
  for (let start = 0; start < visits.length - 1; start += 4) {
    const leg = visits.slice(start, start + 5);
    const end = leg.at(-1);
    const params = new URLSearchParams({
      api: "1",
      origin: leg[0].query,
      destination: end.query
    });
    if (leg.length > 2) params.set("waypoints", leg.slice(1, -1).map(visit => visit.query).join("|"));
    directions.push({
      href: `https://www.google.com/maps/dir/?${params}`,
      label: `第 ${leg[0].number}–${end.number} 站`
    });
  }
  return directions;
}

export default function DayOverview({ items }) {
  const entries = useMemo(() => items.map((item, index) => ({
    ...item,
    name: item.name || "未命名行程",
    number: index + 1,
    coordinates: getTripCoordinates(item.mapUrl),
    alternative: item.name?.includes("備案")
  })), [items]);
  const stops = useMemo(() => entries.filter(entry => entry.coordinates), [entries]);

  const directions = getDirections(entries);
  const hasUnmappedLocations = entries.some(entry => entry.mapUrl && !entry.coordinates);

  return (
    <section className="day-overview" aria-labelledby="day-overview-title">
      <h2 id="day-overview-title">今日行程大綱</h2>
      <div className="day-overview-grid">
        <ol className="day-outline" tabIndex={0} aria-label="今日行程順序">
          {entries.map(entry => (
            <li key={entry.id}>
              <span className={`day-stop-number${entry.coordinates ? " day-stop-number--mapped" : ""}`}>
                {entry.number}
              </span>
              <a href={`#trip-title-${entry.id}`}>
                {entry.reservationTime && <small>{entry.reservationTime}</small>}
                {entry.name}
              </a>
            </li>
          ))}
        </ol>
        {(stops.length > 0 || directions.length > 0) && (
          <div className="day-map-panel">
            {stops.length > 0 && (
              <>
                <DayMap stops={stops} />
                <p>地圖編號對應大綱。虛線表示造訪順序。</p>
              </>
            )}
            {hasUnmappedLocations && <p>部分地點可從下方行程卡片開啟 Google 地圖。</p>}
            {directions.length > 0 && (
              <div className="day-directions">
                {directions.map(direction => (
                  <a key={direction.href} href={direction.href} target="_blank" rel="noreferrer">
                    Google 地圖路線{directions.length > 1 ? ` · ${direction.label}` : ""}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

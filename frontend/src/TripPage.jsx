import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DayOverview from "./DayOverview.jsx";
import { cachePage, getCachedPage } from "./pageCache.js";
import {
  EMPTY_DATE_LABEL,
  formatTripDate,
  getInitialTripDate,
  getTicketStatusTone
} from "./tripDisplay.js";

function getTripDay(date) {
  return date?.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1] ?? EMPTY_DATE_LABEL;
}

function groupByDate(items) {
  return items.reduce((groups, item) => {
    const date = getTripDay(item?.date);
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
    return groups;
  }, {});
}

function getTagLabel(tag) {
  return tag?.replace(/\s*[（(]\s*希望能(?:吃|去)\s*[）)]\s*$/, "").trim() ?? "";
}

function TripTag({ tag }) {
  const label = getTagLabel(tag);
  if (!label) return null;
  let style;
  if (label === "食物") {
    style = { background: "#fce4ec", color: "#9d174d" };
  } else if (label === "景點") {
    style = { background: "#dbeafe", color: "#1e40af" };
  }

  return <span className="tag" style={style}>{label}</span>;
}

function TripMapTag({ item }) {
  const href = item.mapUrl?.trim();
  if (!href || !/^https?:\/\//i.test(href)) return null;

  return (
    <a
      className="tag"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="地圖，在 Google 地圖開啟"
      style={{ background: "#dcfce7", color: "#166534", textDecoration: "none" }}
    >
      <span aria-hidden="true">🗺️</span>&nbsp;地圖
    </a>
  );
}

function TripMetadata({ item }) {
  const { reservationTime, tag, ticketStatus } = item;

  return (
    <>
      {reservationTime && (
        <span className="reservation-time">
          🕒 {reservationTime}
        </span>
      )}
      <TripMapTag item={item} />
      <TripTag tag={tag} />
      {ticketStatus && (
        <span className={`ticket-status ticket-status--${getTicketStatusTone(ticketStatus)}`}>
          🎟️ {ticketStatus}
        </span>
      )}
    </>
  );
}

function TripPage({ onShowShopping, snapshot = null, onLoadFailure }) {
  const [items, setItems] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [pageContent, setPageContent] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const detailRequest = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateLayout = event => setIsMobile(event.matches);
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!previewImage) return undefined;

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") setPreviewImage(null);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    let active = true;
    async function loadTrips() {
      try {
        let data = snapshot?.trips;
        if (!snapshot) {
          const res = await fetch(`/.netlify/functions/notion?refresh=${Date.now()}`, {
            cache: "no-store", signal: AbortSignal.timeout(30000)
          });
          if (!res.ok) throw new Error(`行程 API 回傳 ${res.status}`);
          data = await res.json();
        }
        if (!Array.isArray(data)) throw new Error("行程 API 格式不正確");
        if (!active) return;
        setItems(data);

        const dates = Object.keys(groupByDate(data)).sort();
        setSelectedDate(getInitialTripDate(dates, window.location.pathname));
      } catch (error) {
        if (!active) return;
        console.error(error);
        setItems([]);
        setLoadError("行程載入失敗，請稍後再試");
        onLoadFailure?.(error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTrips();
    return () => { active = false; };
  }, [snapshot, onLoadFailure]);

  async function openItem(item) {
    const request = ++detailRequest.current;
    if (isMobile && selectedItem?.id === item.id) {
      setSelectedItem(null);
      setPageContent([]);
      setDetailLoading(false);
      return;
    }

    setSelectedItem(item);

    if (!item?.id) {
      setPageContent([]);
      setDetailLoading(false);
      return;
    }

    if (snapshot) {
      setPageContent(snapshot.notes[item.id] || []);
      setDetailLoading(false);
      return;
    }

    const cachedContent = getCachedPage(item.id, item.lastEditedTime);
    if (cachedContent) {
      setPageContent(cachedContent);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setPageContent([]);

    try {
      const params = new URLSearchParams({
        id: item.id,
        edited: item.lastEditedTime || ""
      });
      const res = await fetch(`/.netlify/functions/page?${params}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`筆記 API 回傳 ${res.status}`);

      const data = await res.json();
      const content = Array.isArray(data)
        ? data
        : Array.isArray(data?.content)
          ? data.content
          : [];

      cachePage(item.id, content, item.lastEditedTime);
      if (request === detailRequest.current) setPageContent(content);
    } catch (error) {
      console.error(error);
      if (request === detailRequest.current) {
        setPageContent([{ type: "paragraph", text: "內容載入失敗" }]);
        onLoadFailure?.(error);
      }
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  const grouped = useMemo(() => groupByDate(items), [items]);
  const dates = Object.keys(grouped).sort();
  const dayItems = useMemo(() => [...(grouped[selectedDate] || [])]
    .sort((a, b) => (a?.order ?? 9999) - (b?.order ?? 9999)), [grouped, selectedDate]);

  const detailContent = selectedItem && (
    <>
      {!isMobile && (
        <div className="detail-header">
          <p className="detail-date">{formatTripDate(getTripDay(selectedItem.date))}</p>
          <h2>{selectedItem.name || "未命名行程"}</h2>
          <div className="detail-meta">
            <TripMetadata item={selectedItem} />
          </div>
        </div>
      )}

      {selectedItem.annotation?.trim() && (
        <div className="paragraph" style={{ whiteSpace: "pre-wrap" }}>{selectedItem.annotation}</div>
      )}

      {detailLoading && <p className="note" role="status">筆記載入中...</p>}

      {!detailLoading && !selectedItem.annotation?.trim() && pageContent.length === 0 && (
        <p className="note">這個項目目前沒有筆記內容</p>
      )}

      {!detailLoading && pageContent.map((block, index) => {
        if (block.type === "paragraph") {
          return block.text ? <p key={index} className="paragraph">{block.text}</p> : null;
        }

        if (block.type === "image" && block.url) {
          return (
            <figure key={index} className="image-block">
              <button
                type="button"
                className="image-button"
                aria-label={block.caption || "放大筆記圖片"}
                onClick={() => setPreviewImage(block)}
              >
                <img src={block.url} alt={block.caption || ""} className="content-image" />
              </button>
              {block.caption && <figcaption>{block.caption}</figcaption>}
            </figure>
          );
        }

        return null;
      })}
    </>
  );

  if (loading) {
    return (
      <main className="page page--trips view-enter">
        <div className="loading-card">行程載入中 ✈️</div>
      </main>
    );
  }

  return (
    <main className="page page--trips view-enter">
      <header className="hero">
        <div>
          <p className="eyebrow">Travel Planner</p>
          <h1>我的旅行行程</h1>
          <p className="subtitle">從 Notion 同步，手機友善查看</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="view-switch" onClick={onShowShopping}>
            🛍️ 購物清單
          </button>
          <div className="hero-emoji" aria-hidden="true">🧳</div>
        </div>
      </header>

      <nav className="date-tabs">
        {dates.map(date => (
          <button
            key={date}
            className={date === selectedDate ? "active" : ""}
            onClick={event => {
              const tab = event.currentTarget;
              const dateTabs = tab.parentElement;
              const tabBounds = tab.getBoundingClientRect();
              const tabsBounds = dateTabs.getBoundingClientRect();
              const offset = tabBounds.left - tabsBounds.left
                + (tabBounds.width - dateTabs.clientWidth) / 2;
              const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              dateTabs.scrollTo({
                left: dateTabs.scrollLeft + offset,
                behavior: reduceMotion ? "instant" : "smooth"
              });

              detailRequest.current++;
              setSelectedDate(date);
              setSelectedItem(null);
              setPageContent([]);
              setDetailLoading(false);
            }}
          >
            <span>{formatTripDate(date)}</span>
            <small>{grouped[date].length} 項</small>
          </button>
        ))}
      </nav>

      {!loadError && dayItems.length > 0 && <DayOverview items={dayItems} />}

      <section className="content">
        <div className="list">
          <h2>{formatTripDate(selectedDate)} 行程</h2>

          {loadError && <div className="state-card state-card--error">{loadError}</div>}

          {!loadError && dayItems.length === 0 && (
            <div className="state-card">目前沒有可顯示的行程</div>
          )}

          {dayItems.map(item => (
            <article
              key={item.id}
              className={`card ${selectedItem?.id === item.id ? "selected" : ""}`}
            >
              <div className="card-summary">
                <div className="card-main">
                  <div className="card-title" id={`trip-title-${item.id}`}>{item.name || "未命名行程"}</div>

                  <div className="card-meta">
                    <TripMetadata item={item} />
                  </div>
                </div>

                <button
                  type="button"
                  className="card-toggle"
                  aria-labelledby={`trip-title-${item.id}`}
                  aria-expanded={selectedItem?.id === item.id}
                  aria-controls={isMobile ? `trip-note-${item.id}` : "trip-detail"}
                  onClick={() => openItem(item)}
                >
                  <span className="card-arrow" aria-hidden="true">{isMobile ? "⌄" : "›"}</span>
                </button>
              </div>

              {isMobile && (
                <section
                  className="trip-notes"
                  id={`trip-note-${item.id}`}
                  aria-labelledby={`trip-title-${item.id}`}
                  aria-busy={detailLoading && selectedItem?.id === item.id}
                  hidden={selectedItem?.id !== item.id}
                >
                  {selectedItem?.id === item.id && detailContent}
                </section>
              )}
            </article>
          ))}
        </div>

        {!isMobile && <aside className="detail" id="trip-detail" aria-busy={detailLoading}>
          {!selectedItem && (
            <div className="empty-detail">
              <div className="empty-emoji">🗺️</div>
              <p>
                點選左側的行程項目查看筆記
              </p>
            </div>
          )}

          {detailContent}
        </aside>}
      </section>

      {previewImage && createPortal(
        <div className="image-modal" onClick={() => setPreviewImage(null)}>
          <button
            type="button"
            className="image-modal-close"
            onClick={() => setPreviewImage(null)}
          >
            ×
          </button>

          <img
            src={previewImage.url}
            alt={previewImage.caption || ""}
            className="image-modal-img"
            onClick={event => event.stopPropagation()}
          />

          {previewImage.caption && (
            <div
              className="image-modal-caption"
              onClick={event => event.stopPropagation()}
            >
              {previewImage.caption}
            </div>
          )}
        </div>,
        document.body
      )}
    </main>
  );
}

export default TripPage;

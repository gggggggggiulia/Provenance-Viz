let data = [];
let rawRows = [];

function yearLabel(year) {
  if (year < 0) return `${Math.abs(Math.round(year))} BCE`;
  return `${Math.round(year)}`;
}

function normalizeDateString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function stripDateQualifier(value) {
  const str = normalizeDateString(value);
  return str.replace(/[?~%]$/, "");
}

function isCompleteDayDateString(value) {
  const str = normalizeDateString(value);
  if (!str) return false;

  const normalized = stripDateQualifier(str);
  if (/^-?\d{4}-\d{2}-\d{2}$/.test(normalized)) return true;
  if (/^-?\d{4}-\d{2}-\d{2}T/.test(normalized)) return true;

  return false;
}

function sameCalendarDay(a, b) {
  if (!isCompleteDayDateString(a) || !isCompleteDayDateString(b)) return false;
  const aNorm = stripDateQualifier(a).slice(0, 10);
  const bNorm = stripDateQualifier(b).slice(0, 10);
  return aNorm === bNorm;
}

function decimalYearFromDate(value) {
  const str = normalizeDateString(value);
  if (!str || str === "NaN") return null;

  const normalized = stripDateQualifier(str);

  if (/^-?\d{1,4}$/.test(normalized)) return Number(normalized);

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  const nextYearStart = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0);
  const fraction = (d.getTime() - yearStart) / (nextYearStart - yearStart);

  return year + fraction;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgba(hex, alpha) {
  const c = d3.color(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function visibleYearStep(scalePxPerYear) {
  if (scalePxPerYear < 0.08) return 1000;
  if (scalePxPerYear < 0.18) return 500;
  if (scalePxPerYear < 0.4) return 200;
  if (scalePxPerYear < 0.9) return 100;
  if (scalePxPerYear < 2) return 50;
  if (scalePxPerYear < 5) return 20;
  if (scalePxPerYear < 10) return 10;
  if (scalePxPerYear < 22) return 5;
  if (scalePxPerYear < 45) return 2;
  return 1;
}

function patternFromCode(code) {
  if (!code) return "none";
  if (code === "U") return "horizontal";
  if (code === "A") return "diagonal";
  if (code === "AU") return "diamond";
  return "none";
}

function uncertaintySymbolFromCode(code) {
  if (!code) return "";
  if (code === "A") return "~";
  if (code === "U") return "?";
  if (code === "AU") return "%";
  return "";
}

function uncertaintySymbolFromRaw(rawValue = "") {
  const raw = String(rawValue || "");

  if (raw.includes("%")) return "%";
  if (raw.includes("~")) return "~";
  if (raw.includes("?")) return "?";

  return "";
}

function uncertaintySymbolFromEDTFSegment(edtfValue = "", kind = "") {
  const parts = String(edtfValue || "").split("/");

  if (parts.length === 0) return "";

  let segment = "";

  if (parts.length === 1) {
    segment = parts[0];
  } else if (parts.length === 2) {
    if (kind === "start") segment = parts[0];
    else segment = parts[1];
  } else {
    if (kind === "start") segment = parts[0];
    else if (kind === "mid" || kind === "single") segment = parts[1];
    else if (kind === "end") segment = parts[2];
  }

  return uncertaintySymbolFromRaw(segment);
}

function splitPipeValues(value) {
  return normalizeDateString(value)
    .split("|")
    .map((d) => d.trim())
    .filter(Boolean);
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

const CATEGORY_MAP = {
  looted: "#FF3737",
  "field-collected": "#FF3737",
  confiscated: "#FF3737",
  restitution: "#62D221",
  purchase: "#FFAC3F",
  sale: "#FFAC3F",
  auction: "#FFAC3F",
  commission: "#FFAC3F",
  exchange: "#FFAC3F",
  inheritance: "#FFAC3F",
  gift: "#FFAC3F",
  donation: "#FFAC3F",
  bequest: "#FFAC3F",
  loan: "#5D9BFF",
  "long-term-loan": "#5D9BFF",
  exhibition: "#5D9BFF",
  collection: "#5D9BFF",
  rehoused: "#5D9BFF",
  transfer: "#5D9BFF",
  unknown: "#AEAEAE",
  production: "#B95DFF",
  "sacred-use": "#B95DFF",
  ceremony: "#B95DFF",
};

const svg = d3.select("#timeline");
const wrap = document.getElementById("timeline-wrap");
const leftPanelHtml = document.getElementById("left-panel-html");
const toolbarResultsSummary = document.getElementById("toolbar-results-summary");

const eventCard = document.getElementById("event-card");
const eventCardCloseBtn = document.getElementById("event-card-close");
const eventCardCategory = document.getElementById("event-card-category");
const eventCardObject = document.getElementById("event-card-object");
const eventCardBody = document.getElementById("event-card-body");

console.log("event card refs", {
  eventCard,
  eventCardCloseBtn,
  eventCardCategory,
  eventCardObject,
  eventCardBody
});

const filtersToggleBtn = document.getElementById("filters-toggle");
const resetFiltersBtn = document.getElementById("reset-filters");
const activeFilterCount = document.getElementById("active-filter-count");
const filterSummary = document.getElementById("filter-summary");
const navHelpBtn = document.getElementById("nav-help-btn");
const timelineYearForm = document.getElementById("timeline-year-form");
const timelineYearInput = document.getElementById("timeline-year-input");
const timelineYearError = document.getElementById("timeline-year-error");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const rowsShorterBtn = document.getElementById("rows-shorter");
const rowsTallerBtn = document.getElementById("rows-taller");
const zoomRangeLabel = document.getElementById("zoom-range");
const legendBtn = document.getElementById("legend-btn");
const legendPopover = document.getElementById("legend-popover");
const toolbarTitleBlock = document.getElementById("toolbar-title-block");
const toolbarFiltersRow = document.getElementById("toolbar-filters-row");
const objectDetailCrumb = document.getElementById("object-detail-crumb");
const objectDetailMeta = document.getElementById("object-detail-meta");
const mainToolbar = document.getElementById("main-toolbar");
const resetViewBtn = document.getElementById("reset-view");
const navHelpTooltip = document.getElementById("nav-help-tooltip");
const objectDetailBackBtn = document.getElementById("object-detail-back");
const objectSearchForm = document.getElementById("object-search-form");
const objectSearchInput = document.getElementById("object-search-input");
const objectSearchCombobox = document.getElementById("object-search-combobox");
const objectSearchOptions = document.getElementById("object-search-options");
const objectDetailStatus = document.getElementById("object-detail-status");

const stickyWidth = 240;
const axisHeight = 46;
const rowHeight = 32;
const eventHeight = 20;
const OVERVIEW_SQUARE_SIZE = 16;
const OVERVIEW_DIAMOND_SIZE = 16;
const OVERVIEW_LONG_SEGMENT_THRESHOLD = 18;
const OVERVIEW_DOUBLE_DIAMOND_MIN_LINE_BODY_LENGTH = 10;
const OVERVIEW_FIXED_EVENT_HEIGHT = 10;
// Outside Overview, short events are drawn at least this wide so they stay visible and clickable
const MIN_BAR_WIDTH_PX = 6;
const OVERVIEW_FIXED_EVENT_SCALE_Y = OVERVIEW_FIXED_EVENT_HEIGHT / eventHeight;

// Three alpha levels for every event mark, plus one for filtered-out events.
// Filtered-out events fade as a whole group, so the levels are never multiplied.
const ALPHA = {
  solid: 1,     // exact dates, overview lines
  body: 0.55,   // known periods
  edge: 0.25,   // uncertain start/end of a period, open ends
  filteredOut: 0.3
};

const OPACITY = {
  structureStart: ALPHA.edge,
  structureMid: ALPHA.body,
  structureEnd: ALPHA.edge,

  overviewBar: ALPHA.solid,
  overviewSquare: ALPHA.body,
  overviewDiamond: ALPHA.solid,
  overviewLine: ALPHA.solid,

  preciseDiamond: ALPHA.solid,

  filteredOut: ALPHA.filteredOut
};

const SELECTION_DARK = "rgba(15,23,42,0.65)";
const SELECTION_LIGHT = "rgba(255,255,255,0.95)";
const SELECTION_DARK_WIDTH = 4;
const SELECTION_LIGHT_WIDTH = 2;

const SELECTION_BOX_STROKE = "rgba(15,23,42,0.55)";
const SELECTION_BOX_STROKE_WIDTH = 1.5;
const SELECTION_BOX_RADIUS = 5;
const SELECTION_BOX_PAD_X = 6;
const SELECTION_BOX_PAD_Y = 6;

const unmatchedCollapsedEventHeight = 5;
const labelGap = 12;
// Length of the dotted tail drawn for an open start or end
const OPEN_END_LINE_LENGTH = 40;
const OBJECT_VERTICAL_GAP = 20;
const minScale = 0.35;
const minEventHeight = 10;
const maxEventHeight = 40;
const minEventScaleY = minEventHeight / eventHeight;
const maxEventScaleY = maxEventHeight / eventHeight;
const minYear = 1000;
const maxYear = 2800;
const patternMinEventHeight = 9;
const specialYear = 1897;
const objectMetaMinBottomPadding = 10;
const exactDateWidthPx = 5;
const exactDateExtraHeightPx = 6;
const exactDateFillOpacity = ALPHA.edge;
const exactDateStrokeWidth = 1;
const regularMidOpacity = ALPHA.body;
const filteredOutOpacity = OPACITY.filteredOut;
const objectGapExtra = 14;
const targetMaxVisibleYears = 5;
// Most zoomed out = the whole axis, so the zoom-out button disables at the real limit
const targetMinVisibleYears = maxYear - minYear;

let width = wrap.clientWidth;
let height = wrap.clientHeight;

const allEvents = [];
const objectSummaries = [];
const filterOptions = {
  category: [],
  institution: [],
  edo: [],
  actor: [],
  cityStart: [],
  cityEnd: []
};

const filtersState = {
  mode: "focus",
  category: new Set(),
  institution: new Set(),
  edo: new Set(),
  actor: new Set(),
  cityStart: new Set(),
  cityEnd: new Set()
};

const filterPopupMap = {
  category: { inputId: "search-category", popupId: "popup-category" },
  institution: { inputId: "search-institution", popupId: "popup-institution" },
  edo: { inputId: "search-edo", popupId: "popup-edo" },
  actor: { inputId: "search-actor", popupId: "popup-actor" },
  cityStart: { inputId: "search-city-start", popupId: "popup-city-start" },
  cityEnd: { inputId: "search-city-end", popupId: "popup-city-end" }
};

// FILTER PANEL UI HELPERS

const filterUiMap={
  category:{countId:"count-category",clearId:"clear-category",inputId:"search-category"},
  institution:{countId:"count-institution",clearId:"clear-institution",inputId:"search-institution"},
  edo:{countId:"count-edo",clearId:"clear-edo",inputId:"search-edo"},
  actor:{countId:"count-actor",clearId:"clear-actor",inputId:"search-actor"},
  cityStart:{countId:"count-cityStart",clearId:"clear-cityStart",inputId:"search-city-start"},
  cityEnd:{countId:"count-cityEnd",clearId:"clear-cityEnd",inputId:"search-city-end"}
};

function formatFilterLabel(value){

  return String(value)
    .split(/[-_]/g)
    .map(part=>part?part.charAt(0).toUpperCase()+part.slice(1):"")
    .join(" ");

}

function updateFilterFieldUi(key){

  const ui=filterUiMap[key];
  if(!ui) return;

  const input=document.getElementById(ui.inputId);
  const count=document.getElementById(ui.countId);
  const clear=document.getElementById(ui.clearId);

  const selectedCount=filtersState[key].size;

  if(count){
    count.textContent=selectedCount;

    if(selectedCount>0){
      count.classList.add("active");
    }else{
      count.classList.remove("active");
    }

  }

  count?.closest(".filter-dd-btn")?.classList.toggle("is-active", selectedCount>0);

  if(clear){
    if(selectedCount>0){
      clear.classList.add("visible");
    }else{
      clear.classList.remove("visible");
    }
  }

}

function updateAllFilterFieldUi(){

  Object.keys(filterUiMap).forEach(key=>{
    updateFilterFieldUi(key);
  });

}

let baseScale = d3.scaleLinear()
  .domain([minYear, maxYear])
  .range([stickyWidth, Math.max(stickyWidth + 600, width)]);

const root = svg.append("g");
const scrollLayer = root.append("g");
const gridLayer = scrollLayer.append("g").attr("class", "time-grid");
const rowsLayer = scrollLayer.append("g");
const eventsLayer = scrollLayer.append("g");
const labelsLayer = root.append("g");
const stickyLayer = root.append("g");
const axisLayer = root.append("g");

const defs = svg.append("defs");
const plotClip = defs.append("clipPath").attr("id", "plot-clip");
plotClip.append("rect");

const labelClip = defs.append("clipPath").attr("id", "label-clip");
labelClip.append("rect");

// Year labels stop at the object column divider
const AXIS_LABEL_HALF_WIDTH = 16;
const axisClip = defs.append("clipPath").attr("id", "axis-clip");
axisClip.append("rect");

defs.append("pattern")
  .attr("id", "pattern-horizontal")
  .attr("patternUnits", "userSpaceOnUse")
  .attr("patternContentUnits", "userSpaceOnUse")
  .attr("width", 8)
  .attr("height", 8)
  .append("line")
  .attr("x1", 0)
  .attr("y1", 4)
  .attr("x2", 8)
  .attr("y2", 4)
  .attr("stroke", "white")
  .attr("stroke-width", 1.5)
  .attr("stroke-linecap", "square");

const diagonalPattern = defs.append("pattern")
  .attr("id", "pattern-diagonal")
  .attr("patternUnits", "userSpaceOnUse")
  .attr("patternContentUnits", "userSpaceOnUse")
  .attr("width", 12)
  .attr("height", 12);

diagonalPattern.append("path")
  .attr("d", "M -6 12 L 6 0 M 0 12 L 12 0 M 6 12 L 18 0")
  .attr("fill", "none")
  .attr("stroke", "white")
  .attr("stroke-width", 1.5)
  .attr("stroke-linecap", "square");

// Flattened cross-hatch: wide diamonds (about 2:1), lines closer to horizontal
const diamondPattern = defs.append("pattern")
  .attr("id", "pattern-diamond")
  .attr("patternUnits", "userSpaceOnUse")
  .attr("patternContentUnits", "userSpaceOnUse")
  .attr("width", 16)
  .attr("height", 9);

diamondPattern.append("path")
  .attr("d", "M -16 9 L 16 -9 M 0 9 L 16 0 M -16 18 L 16 0 M 0 0 L 16 9 M -16 -9 L 16 9 M 0 -9 L 32 9")
  .attr("fill", "none")
  .attr("stroke", "white")
  .attr("stroke-width", 1.6);

const state = {
  scale: 1,
  offsetX: 0,
  scrollY: 0,
  eventScaleY: 1,

  viewMode: "comparison",          // "comparison" | "objectDetail"
  detailObjectId: null,
  comparisonSnapshot: null,

  selectedEventId: null,
  selectedEventData: null,
};

let dragState = null;
let storedDetailEventScaleY = 1;
let scrollAnimationFrame = null;

const tooltipEl = document.createElement("div");
tooltipEl.className = "timeline-tooltip";
document.body.appendChild(tooltipEl);

function showTooltip(html, clientX, clientY) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add("visible");

  const pad = 14;
  const rect = tooltipEl.getBoundingClientRect();
  let left = clientX + 14;
  let top = clientY + 14;

  if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width - 14;
  if (top + rect.height > window.innerHeight - pad) top = clientY - rect.height - 14;

  tooltipEl.style.left = `${Math.max(pad, left)}px`;
  tooltipEl.style.top = `${Math.max(pad, top)}px`;
}

function hideTooltip() {
  tooltipEl.classList.remove("visible");
}

function tooltipHTMLForEvent(event) {
  return `
    <div class="timeline-tooltip-row"><strong>EDTF:</strong> ${event.edtf || "—"}</div>
  `;
}

const toolbarPopovers = [];

function closeToolbarPopovers(except = null) {
  toolbarPopovers.forEach(({ button, popover }) => {
    if (popover === except) return;
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  });
}

function bindToolbarPopover(button, popover) {
  if (!button || !popover || button._popoverBound) return;

  toolbarPopovers.push({ button, popover });

  button.addEventListener("click", () => {
    const willOpen = popover.hidden;
    closeToolbarPopovers(popover);
    popover.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });

  button._popoverBound = true;
}

function scaledEventHeight() {
  return eventHeight * state.eventScaleY;
}

function scaledMatchedRowHeight() {
  const fixedGap = rowHeight - eventHeight;
  return scaledEventHeight() + fixedGap;
}

function rowHeightForScaleY(scaleY, matched) {
  const scaledH = eventHeight * scaleY;
  const fixedGap = rowHeight - eventHeight;

  if (filtersState.mode === "collapsed" && !matched) {
    return unmatchedCollapsedEventHeight + fixedGap;
  }

  return scaledH + fixedGap;
}

function eventHeightForScaleY(scaleY, matched) {
  if (filtersState.mode === "collapsed" && !matched) {
    return unmatchedCollapsedEventHeight;
  }
  return eventHeight * scaleY;
}

function contentHeightForScaleY(scaleY) {
  let cursorY = axisHeight;

  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];
    const matched = eventMatchesFilters(event);

    if (filtersState.mode === "focus" && !matched) continue;

    const prevEvent = allEvents[i - 1];
    const nextEvent = allEvents[i + 1];

    const isGroupStart = !prevEvent || prevEvent.objectId !== event.objectId;
    const isGroupEnd = !nextEvent || nextEvent.objectId !== event.objectId;

    if (isGroupStart) {
      cursorY += objectGapExtra / 2;
    }

    cursorY += rowHeightForScaleY(scaleY, matched);

    if (isGroupEnd) {
      cursorY += objectGapExtra / 2;
    }
  }

  return cursorY;
}

function buildSection(kind, startRaw, endRaw, opacity, pattern, uncertaintyCode = "") {
  const start = decimalYearFromDate(startRaw);
  const end = decimalYearFromDate(endRaw);

  return {
    kind,
    start,
    end,
    opacity,
    pattern,
    rawStart: startRaw,
    rawEnd: endRaw,
    isExactDate: sameCalendarDay(startRaw, endRaw),
    uncertaintyCode
  };
}

function buildFilterOptions(rows) {
  const categoryOrder = [
    // red
    "looted",
    "field-collected",
    "confiscated",

    // green
    "restitution",
    
    // yellow
    "purchase",
    "sale",
    "auction",
    "commission",
    "exchange",
    "inheritance",
    "gift",
    "donation",
    "bequest",

    // blue
    "loan",
    "long-term-loan",
    "exhibition",
    "collection",
    "rehoused",
    "transfer",

    // purple
    "production",
    "sacred-use",
    "ceremony",

    // gray
    "unknown"
  ];

  const categoriesInData = Array.from(
    new Set(
      rows.map((r) => normalizeDateString(r.category).toLowerCase()).filter(Boolean)
    )
  );

  filterOptions.category = [
    ...categoryOrder.filter((cat) => categoriesInData.includes(cat)),
    ...categoriesInData.filter((cat) => !categoryOrder.includes(cat)).sort((a, b) => a.localeCompare(b))
  ];
  filterOptions.institution = uniqueSorted(rows.map((r) => normalizeDateString(r.institution)).filter(Boolean));
  filterOptions.edo = uniqueSorted(rows.map((r) => normalizeDateString(r.edo_designations)).filter(Boolean));
  filterOptions.actor = uniqueSorted(rows.flatMap((r) => splitPipeValues(r.actors)));
  filterOptions.cityStart = uniqueSorted(rows.map((r) => normalizeDateString(r.city_start)).filter(Boolean));
  filterOptions.cityEnd = uniqueSorted(rows.map((r) => normalizeDateString(r.city_end)).filter(Boolean));
}

function countForFilterOption(key, value) {
  if (key === "category") return rawRows.filter((r) => normalizeDateString(r.category).toLowerCase() === value).length;
  if (key === "institution") return rawRows.filter((r) => normalizeDateString(r.institution) === value).length;
  if (key === "edo") return rawRows.filter((r) => normalizeDateString(r.edo_designations) === value).length;
  if (key === "actor") return rawRows.filter((r) => splitPipeValues(r.actors).includes(value)).length;
  if (key === "cityStart") return rawRows.filter((r) => normalizeDateString(r.city_start) === value).length;
  if (key === "cityEnd") return rawRows.filter((r) => normalizeDateString(r.city_end) === value).length;
  return 0;
}

function buildFilterList(containerId, values, filterKey, searchInputId, showColor = false) {
  const container = document.getElementById(containerId);
  const searchInput = document.getElementById(searchInputId);
  if (!container || !searchInput) return;

  const renderList = () => {
    const q = normalizeDateString(searchInput.value).toLowerCase();
    container.innerHTML = "";

    values
      .filter((value) => value.toLowerCase().includes(q))
      .forEach((value) => {
        const row = document.createElement("label");
        row.className = "filter-option";

        row.addEventListener("mousedown", (event) => {
          event.stopPropagation();
        });

        const left = document.createElement("div");
        left.className = "filter-option-left";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = filtersState[filterKey].has(value);
        input.addEventListener("change",()=>{

          if(input.checked){
            filtersState[filterKey].add(value);
          }else{
            filtersState[filterKey].delete(value);
          }

          updateFilterSummary();
          updateFilterFieldUi(filterKey);

          render();

        });

        left.appendChild(input);

        if (showColor) {
          const dot = document.createElement("span");
          dot.className = "filter-color-dot";
          dot.style.background = CATEGORY_MAP[value] || "#AEAEAE";
          left.appendChild(dot);
        }

        const label = document.createElement("span");
        label.className = "filter-option-label";
        label.textContent = value;

        left.appendChild(label);

        const count = document.createElement("span");
        count.className = "filter-option-count";
        count.textContent = countForFilterOption(filterKey, value);

        row.appendChild(left);
        row.appendChild(count);
        container.appendChild(row);
      });
  };

  searchInput.addEventListener("input", renderList);
  renderList();
}

// The filter bar under the toolbar, opened from the Filters button
let filtersBarOpen = false;

function setFiltersBarOpen(open) {
  filtersBarOpen = open;
  if (!open) closeToolbarPopovers();
  updateObjectDetailToolbar();
}

function updateToolbarResultsSummary() {
  if (!toolbarResultsSummary) return;

  const visibleRows = currentVisibleRows();
  const visibleEvents = visibleRows.length;

  const visibleObjectIds = new Set(visibleRows.map((row) => row.event.objectId));
  const visibleObjects = visibleObjectIds.size;

  const totalEvents = allEvents.length;
  const totalObjects = new Set(allEvents.map((event) => event.objectId)).size;

  const ofTotal = (count, total) => (count === total ? `${total}` : `${count} of ${total}`);

  // With filters on, count what matches rather than every row drawn
  if (state.viewMode !== "objectDetail" && activeFilterTotal() > 0) {
    const { matchingObjectCount, matchingEventCount } = getFilterResultsCounts();
    toolbarResultsSummary.textContent =
      `${ofTotal(matchingObjectCount, totalObjects)} objects · ${ofTotal(matchingEventCount, totalEvents)} events`;
    return;
  }

  toolbarResultsSummary.textContent =
    `${ofTotal(visibleObjects, totalObjects)} objects · ${ofTotal(visibleEvents, totalEvents)} events`;
}

function resetView() {
  if (scrollAnimationFrame !== null) {
    cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
  }

  state.scale = 1;
  state.offsetX = 0;
  state.scrollY = 0;

  storedDetailEventScaleY = 1;
  state.eventScaleY = isOverviewZoomLevel()
    ? OVERVIEW_FIXED_EVENT_SCALE_Y
    : storedDetailEventScaleY;

  clampOffsetX();
  clampScrollY(resizeOverscrollMargin());
  render();
}

// Accepts "1897", "1890-1920", "1890–1920" or "1890 to 1920"
function parseYearQuery(value) {
  const match = String(value || "")
    .trim()
    .match(/^(-?\d{1,4})(?:\s*(?:-|–|—|to)\s*(-?\d{1,4}))?$/i);

  if (!match) return null;

  const start = Number(match[1]);
  const end = match[2] !== undefined ? Number(match[2]) : null;

  if (end === null) return { start, end: null };
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function centerTimelineOnYear(year) {
  const viewportWidth = width - stickyWidth;
  const viewportCenterX = stickyWidth + viewportWidth / 2;

  state.offsetX = viewportCenterX - baseScale(year + 0.5) * state.scale;
  clampOffsetX();
}

function applyToolbarYearNavigation() {
  if (!timelineYearInput) return;

  const query = parseYearQuery(timelineYearInput.value);
  const outOfRange = query && (query.start < minYear || (query.end ?? query.start) > maxYear);

  if (!query || outOfRange) {
    timelineYearInput.setAttribute("aria-invalid", "true");
    if (timelineYearError) {
      timelineYearError.textContent = query
        ? `Use years between ${minYear} and ${maxYear}`
        : "Type a year (1897) or a range (1890–1920)";
    }
    return;
  }

  timelineYearInput.removeAttribute("aria-invalid");
  if (timelineYearError) timelineYearError.textContent = "";

  if (query.end === null) {
    centerTimelineOnYear(query.start);
  } else {
    fitTimelineToYearRange(query.start, query.end + 0.99);
  }

  syncEventHeightForSemanticZoom();
  render();
}

function zoomByStep(direction) {
  const viewportCenterX = stickyWidth + (width - stickyWidth) / 2;
  zoomAround(viewportCenterX, direction > 0 ? -280 : 280);
  syncEventHeightForSemanticZoom();
  clampScrollY(resizeOverscrollMargin());
  render();
}

// Row height: steps through the allowed event heights, anchored on the viewport centre
const ROW_HEIGHT_STEP_SCALE_Y = 5 / eventHeight;

function setRowScaleY(nextScaleY, pointerOffsetY = (height - axisHeight) / 2) {
  if (isOverviewZoomLevel()) return;

  const anchorRatio = verticalAnchorRatio(state.scrollY, pointerOffsetY, state.eventScaleY);
  state.eventScaleY = clamp(nextScaleY, minEventScaleY, maxEventScaleY);
  storedDetailEventScaleY = state.eventScaleY;
  state.scrollY = scrollYFromAnchorRatio(anchorRatio, pointerOffsetY, state.eventScaleY);
  clampScrollY(resizeOverscrollMargin());
  render();
}

function rowHeightByStep(direction) {
  setRowScaleY(state.eventScaleY + direction * ROW_HEIGHT_STEP_SCALE_Y);
}

function panByViewport(fraction) {
  state.offsetX -= (width - stickyWidth) * fraction;
  clampOffsetX();
  render();
}

function scrollRowsBy(deltaY) {
  state.scrollY += deltaY;
  clampScrollY();
  render();
}

function visibleYearRange() {
  const toYear = (x) => baseScale.invert((x - state.offsetX) / state.scale);
  return {
    start: Math.max(minYear, toYear(stickyWidth)),
    end: Math.min(maxYear, toYear(width))
  };
}

function updateZoomControls() {
  if (zoomRangeLabel) {
    const { start, end } = visibleYearRange();
    zoomRangeLabel.textContent = `${Math.round(start)}–${Math.floor(end)}`;
  }

  if (zoomInBtn) zoomInBtn.disabled = state.scale >= maxAllowedScale() - 1e-6;
  if (zoomOutBtn) zoomOutBtn.disabled = state.scale <= minAllowedScale() + 1e-6;

  const overview = isOverviewZoomLevel();
  const overviewHint = "Row height is fixed in Overview: zoom in to change it";
  if (rowsShorterBtn) {
    rowsShorterBtn.disabled = overview || state.eventScaleY <= minEventScaleY + 1e-6;
    rowsShorterBtn.title = overview ? overviewHint : "Shorter rows (Alt + scroll)";
  }
  if (rowsTallerBtn) {
    rowsTallerBtn.disabled = overview || state.eventScaleY >= maxEventScaleY - 1e-6;
    rowsTallerBtn.title = overview ? overviewHint : "Taller rows (Alt + scroll)";
  }
}

// Fit the timeline to the events currently on screen (or the open object)
function fitView() {
  const events =
    state.viewMode === "objectDetail" && state.detailObjectId !== null
      ? allEvents.filter(event => event.objectId === state.detailObjectId)
      : allEvents.filter(event => activeFilterTotal() === 0 || eventMatchesFilters(event));

  const start = d3.min(events, event => event.eventStart);
  const end = d3.max(events, event => event.eventEnd);

  state.scrollY = 0;

  if (start == null || end == null) {
    resetView();
    return;
  }

  const padding = Math.max(2, (end - start) * 0.04);
  fitTimelineToYearRange(start - padding, end + padding);
  syncEventHeightForSemanticZoom();
  clampScrollY(resizeOverscrollMargin());
  render();
}

function updateObjectDetailToolbar() {
  const inDetailMode = state.viewMode === "objectDetail" && state.detailObjectId !== null;

  mainToolbar?.classList.toggle("is-detail", inDetailMode);

  if (toolbarTitleBlock) toolbarTitleBlock.hidden = inDetailMode;
  if (objectDetailCrumb) objectDetailCrumb.hidden = !inDetailMode;
  if (filtersToggleBtn) {
    filtersToggleBtn.hidden = inDetailMode;
    filtersToggleBtn.setAttribute("aria-expanded", String(filtersBarOpen));
  }
  if (toolbarFiltersRow) toolbarFiltersRow.hidden = inDetailMode || !filtersBarOpen;

  if (!inDetailMode) return;

  const summary = objectSummaries.find(object => object.objectId === state.detailObjectId);
  if (objectDetailStatus) objectDetailStatus.textContent = `Object ${state.detailObjectId}`;
  if (objectDetailMeta) {
    objectDetailMeta.textContent = summary
      ? [summary.institution, `${summary.eventCount} events`].filter(Boolean).join(" · ")
      : "";
  }
}

function closeEventCard() {
  state.selectedEventId = null;
  state.selectedEventData = null;

  if (eventCard) eventCard.classList.add("hidden");
  if (eventCardCategory) eventCardCategory.textContent = "Event";
  if (eventCardObject) eventCardObject.textContent = "Object";
  if (eventCardBody) {
    eventCardBody.innerHTML = `<div class="event-card-empty">Click an event to inspect it.</div>`;
  }

  render();
}

function openEventCardShell() {
  console.log("openEventCardShell", eventCard);

  if (eventCard) {
    eventCard.classList.remove("hidden");
  }
}

function renderEventCard(event) {
  console.log("renderEventCard", {
    event,
    eventCard,
    eventCardCategory,
    eventCardObject,
    eventCardBody
  });

  if (!eventCard || !eventCardCategory || !eventCardObject || !eventCardBody) return;
  if (!event) {
    closeEventCard();
    return;
  }

  eventCardCategory.innerHTML = `
    <span class="event-card-category-dot" style="background:${event.categoryColor}"></span>
    ${event.label || ""}
  `;
  eventCardObject.textContent = `Object ${event.objectId ?? ""}`.trim();

  const valueOrDash = (value) => {
    if (value === null || value === undefined) return "—";
    const text = String(value).trim();
    return text === "" ? "—" : text;
  };

  const startText =
    valueOrDash(event.displayStart || event.startLabel || event.startRaw || event.eventStartLabel || event.eventStart);

  const endText =
    valueOrDash(event.displayEnd || event.endLabel || event.endRaw || event.eventEndLabel || event.eventEnd);

  const edtfText = valueOrDash(event.edtf);
  const institutionText = valueOrDash(event.institution);
  const actorText = valueOrDash(event.actor);
  const cityStartText = valueOrDash(event.cityStart);
  const cityEndText = valueOrDash(event.cityEnd);
  const edoText = valueOrDash(event.edoDesignation || event.edoDesignations);

  eventCardBody.innerHTML = `

    <div class="event-card-section">
      <div class="event-card-section-title">Time</div>

      <div class="event-card-row">
        <div class="event-card-label">EDTF</div>
        <div class="event-card-value">${edtfText}</div>
      </div>
    </div>

    <div class="event-card-section">
      <div class="event-card-section-title">Context</div>

      <div class="event-card-row">
        <div class="event-card-label">Institution</div>
        <div class="event-card-value">${institutionText}</div>
      </div>

      <div class="event-card-row">
        <div class="event-card-label">Actor</div>
        <div class="event-card-value">${actorText}</div>
      </div>

      <div class="event-card-row">
        <div class="event-card-label">Start city</div>
        <div class="event-card-value">${cityStartText}</div>
      </div>

      <div class="event-card-row">
        <div class="event-card-label">End city</div>
        <div class="event-card-value">${cityEndText}</div>
      </div>

      <div class="event-card-row">
        <div class="event-card-label">EDO designation</div>
        <div class="event-card-value">${edoText}</div>
      </div>
    </div>

    <div class="event-card-section">
      <div class="event-card-section-title">Actions</div>

      <div class="event-card-actions">
        <button class="event-card-action-btn" type="button" data-action="go-to-event">
          Go to event
        </button>

        <button class="event-card-action-btn" type="button" data-action="filter-category">
          Filter by category
        </button>
      </div>
    </div>
  `;

  openEventCardShell();
}

function selectEvent(event) {
  if (!event) return;

  state.selectedEventId = eventSelectionKey(event);
  state.selectedEventData = event;

  renderEventCard(event);
  render();
}

function goToSelectedEvent() {
  const selected = state.selectedEventData;
  if (!selected) return;

  const rows = currentVisibleRows();
  const selectedKey = eventSelectionKey(selected);

  const targetRow = rows.find((row) => eventSelectionKey(row.event) === selectedKey);
  if (!targetRow) return;

  const viewportHeight = height - axisHeight;
  const targetCenterY = targetRow.rowTop + targetRow.rowHeight / 2;

  const targetScrollY = targetCenterY - axisHeight - viewportHeight / 2;

  animateScrollYTo(targetScrollY, 420);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateScrollYTo(targetScrollY, duration = 420) {
  if (scrollAnimationFrame !== null) {
    cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
  }

  const startScrollY = state.scrollY;
  const delta = targetScrollY - startScrollY;

  if (Math.abs(delta) < 1) {
    state.scrollY = targetScrollY;
    clampScrollY(resizeOverscrollMargin());
    render();
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(t);

    state.scrollY = startScrollY + delta * eased;
    clampScrollY(resizeOverscrollMargin());
    render();

    if (t < 1) {
      scrollAnimationFrame = requestAnimationFrame(step);
    } else {
      state.scrollY = targetScrollY;
      clampScrollY(resizeOverscrollMargin());
      render();
      scrollAnimationFrame = null;
    }
  }

  scrollAnimationFrame = requestAnimationFrame(step);
}

function filterBySelectedEventCategory() {
  const selected = state.selectedEventData;
  if (!selected) return;

  const categoryValue =
    selected.category ??
    selected.categoryLabel ??
    selected.label ??
    selected.type ??
    "";

  console.log("filterBySelectedEventCategory", {
    selected,
    categoryValue,
    availableCategoryOptions: filterOptions.category
  });

  if (!categoryValue) return;

  filtersState.category.clear();
  filtersState.category.add(categoryValue);

  const categorySearchInput = document.getElementById("search-category");
  if (categorySearchInput) {
    categorySearchInput.value = "";
  }

  updateFilterSummary();
  setupFilterUI();
  render();
}

function handleEventSelectionPointerDown(domEvent, event) {
  domEvent.stopPropagation();
  domEvent.preventDefault();
  selectEvent(event);
}

function eventSelectionKey(event) {
  return event.id ?? `${event.objectId || ""}__${event.edtf || ""}__${event.label || ""}`;
}

function isSelectedEvent(event) {
  return state.selectedEventId === eventSelectionKey(event);
}

function enterObjectDetailMode(objectId) {
  if (!objectId) return;

  if (state.viewMode !== "objectDetail") {
    state.comparisonSnapshot = {
      scale: state.scale,
      offsetX: state.offsetX,
      scrollY: state.scrollY,
      eventScaleY: state.eventScaleY
    };
  }

  state.viewMode = "objectDetail";
  state.detailObjectId = objectId;
  state.scrollY = 0;

  const extent = getDetailObjectYearExtent(objectId);
  if (extent) {
    fitTimelineToYearRange(extent.start, extent.end);
  }

  render();
}

const objectSearchState = { matches: [], activeIndex: -1 };

function getObjectSearchMatches(query) {
  const normalized = query.trim().toLowerCase();

  return objectSummaries
    .filter(object =>
      !normalized ||
      String(object.objectId).toLowerCase().includes(normalized) ||
      String(object.institution || "").toLowerCase().includes(normalized)
    )
    .sort((a, b) => String(a.objectId).localeCompare(String(b.objectId), undefined, { numeric: true }));
}

function setObjectSearchPopupOpen(isOpen) {
  objectSearchCombobox?.classList.toggle("open", isOpen);
  objectSearchInput?.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) objectSearchState.activeIndex = -1;
}

function renderObjectSearchOptions() {
  if (!objectSearchOptions || !objectSearchInput) return;

  objectSearchState.matches = getObjectSearchMatches(objectSearchInput.value);
  objectSearchOptions.innerHTML = "";

  if (objectSearchState.matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "object-search-empty";
    empty.textContent = "No matching object";
    objectSearchOptions.appendChild(empty);
    return;
  }

  objectSearchState.matches.forEach((object, index) => {
    const row = document.createElement("div");
    row.className = "object-search-option";
    row.id = `object-search-option-${index}`;
    row.setAttribute("role", "option");
    row.classList.toggle("active", index === objectSearchState.activeIndex);

    const text = document.createElement("div");
    text.className = "object-search-option-text";

    const id = document.createElement("div");
    id.className = "object-search-option-id";
    id.textContent = object.objectId;
    text.appendChild(id);

    if (object.institution) {
      const institution = document.createElement("div");
      institution.className = "object-search-option-meta";
      institution.textContent = object.institution;
      text.appendChild(institution);
    }

    const count = document.createElement("span");
    count.className = "filter-option-count";
    count.textContent = String(object.eventCount);

    row.append(text, count);

    // mousedown so the choice lands before the input loses focus
    row.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectObjectSearchResult(object.objectId);
    });

    objectSearchOptions.appendChild(row);
  });

  const active = objectSearchOptions.querySelector(".object-search-option.active");
  active?.scrollIntoView({ block: "nearest" });
  if (active) objectSearchInput.setAttribute("aria-activedescendant", active.id);
  else objectSearchInput.removeAttribute("aria-activedescendant");
}

function selectObjectSearchResult(objectId) {
  if (objectSearchInput) objectSearchInput.value = objectId;
  setObjectSearchPopupOpen(false);
  objectSearchInput?.blur();
  enterObjectDetailMode(objectId);
}

function findObjectIdByQuery(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const objectIds = objectSummaries.map(object => object.objectId).filter(Boolean);
  const exact = objectIds.find(objectId => String(objectId).toLowerCase() === normalized);
  if (exact) return exact;

  const partial = objectIds.filter(objectId => String(objectId).toLowerCase().includes(normalized));
  return partial.length === 1 ? partial[0] : null;
}

function applyObjectSearch() {
  if (!objectSearchInput) return;

  const objectId = findObjectIdByQuery(objectSearchInput.value);

  // No single match: keep the list open so the user can pick one
  if (objectId) selectObjectSearchResult(objectId);
  else {
    renderObjectSearchOptions();
    setObjectSearchPopupOpen(true);
  }
}

function activeFilterTotal() {
  return (
    filtersState.category.size +
    filtersState.institution.size +
    filtersState.edo.size +
    filtersState.actor.size +
    filtersState.cityStart.size +
    filtersState.cityEnd.size
  );
}

const FILTER_GROUP_LABELS = [
  ["category", "Category"],
  ["institution", "Institution"],
  ["edo", "EDO"],
  ["actor", "Actor"],
  ["cityStart", "Start city"],
  ["cityEnd", "End city"]
];

function refreshAllFilterLists() {
  buildFilterList("list-category", filterOptions.category, "category", "search-category", true);
  buildFilterList("list-institution", filterOptions.institution, "institution", "search-institution");
  buildFilterList("list-edo", filterOptions.edo, "edo", "search-edo");
  buildFilterList("list-actor", filterOptions.actor, "actor", "search-actor");
  buildFilterList("list-city-start", filterOptions.cityStart, "cityStart", "search-city-start");
  buildFilterList("list-city-end", filterOptions.cityEnd, "cityEnd", "search-city-end");
}

function removeFilterValue(key, value) {
  filtersState[key].delete(value);
  updateFilterSummary();
  updateAllFilterFieldUi();
  refreshAllFilterLists();
  render();
}

function setFilterMode(mode) {
  filtersState.mode = mode;

  updateFilterModeButtons();
  render();
}

function updateFilterModeButtons() {
  document.querySelectorAll(".toolbar-segmented [data-mode]").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.mode === filtersState.mode));
  });
}

function updateFilterSummary() {
  const total = activeFilterTotal();

  if (activeFilterCount) {
    activeFilterCount.textContent = String(total);
    activeFilterCount.hidden = total === 0;
  }

  updateFilterModeButtons();
  updateObjectDetailToolbar();

  if (!filterSummary) return;

  filterSummary.innerHTML = "";

  FILTER_GROUP_LABELS.forEach(([key, label]) => {
    filtersState[key].forEach(value => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";

      if (key === "category") {
        const dot = document.createElement("span");
        dot.className = "filter-chip-dot";
        dot.style.background = CATEGORY_MAP[value] || "#AEAEAE";
        chip.appendChild(dot);
      }

      const text = document.createElement("span");
      text.className = "filter-chip-label";
      text.textContent = `${label}: ${value}`;
      text.title = `${label}: ${value}`;
      chip.appendChild(text);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "filter-chip-remove";
      remove.setAttribute("aria-label", `Remove filter ${label}: ${value}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => removeFilterValue(key, value));
      chip.appendChild(remove);

      filterSummary.appendChild(chip);
    });
  });
}

function closeAllFilterPopups() {

  document.querySelectorAll(".filter-combobox").forEach((combobox)=>{
    combobox.classList.remove("open");
  });

  Object.values(filterPopupMap).forEach(({ popupId })=>{
    const popup=document.getElementById(popupId);
    if(popup) popup.classList.remove("open");
  });

}

function openFilterPopup(key){

  closeAllFilterPopups();

  const config=filterPopupMap[key];
  if(!config) return;

  const popup=document.getElementById(config.popupId);

  if(popup){
    popup.classList.add("open");
  }

  const input=document.getElementById(config.inputId);

  if(input){

    const combobox=input.closest(".filter-combobox");

    if(combobox){
      combobox.classList.add("open");
    }

  }

}

function setupFilterUI() {

  buildFilterList("list-category", filterOptions.category, "category", "search-category", true);
  buildFilterList("list-institution", filterOptions.institution, "institution", "search-institution");
  buildFilterList("list-edo", filterOptions.edo, "edo", "search-edo");
  buildFilterList("list-actor", filterOptions.actor, "actor", "search-actor");
  buildFilterList("list-city-start", filterOptions.cityStart, "cityStart", "search-city-start");
  buildFilterList("list-city-end", filterOptions.cityEnd, "cityEnd", "search-city-end");

  // POPUP BEHAVIOR
  Object.entries(filterPopupMap).forEach(([key,{inputId,popupId}])=>{

    const input=document.getElementById(inputId);
    const popup=document.getElementById(popupId);

    if(!input || !popup) return;

    input.onfocus=()=>openFilterPopup(key);
    input.onclick=()=>openFilterPopup(key);

    input.onkeydown=(event)=>{
      if(event.key==="Escape"){
        popup.classList.remove("open");
        input.blur();
      }
    };

    popup.onmousedown=(event)=>{
      event.stopPropagation();
    };

  });

  // CLEAR BUTTONS

  Object.entries(filterUiMap).forEach(([key,ui])=>{

    const clear=document.getElementById(ui.clearId);
    const input=document.getElementById(ui.inputId);

    if(!clear || !input) return;

    clear.onclick=(event)=>{

      event.stopPropagation();

      filtersState[key].clear();

      input.value="";

      // rebuild lists so checkboxes reset
      buildFilterList("list-category",filterOptions.category,"category","search-category",true);
      buildFilterList("list-institution",filterOptions.institution,"institution","search-institution");
      buildFilterList("list-edo",filterOptions.edo,"edo","search-edo");
      buildFilterList("list-actor",filterOptions.actor,"actor","search-actor");
      buildFilterList("list-city-start",filterOptions.cityStart,"cityStart","search-city-start");
      buildFilterList("list-city-end",filterOptions.cityEnd,"cityEnd","search-city-end");

      updateFilterSummary();
      updateAllFilterFieldUi();

      render();

    };

  });

  // MODE SWITCH
  document.querySelectorAll(".toolbar-segmented [data-mode]").forEach((button)=>{
    button.onclick=()=>setFilterMode(button.dataset.mode);
  });

  // PANEL BUTTONS
  if(filtersToggleBtn) filtersToggleBtn.onclick=()=>setFiltersBarOpen(!filtersBarOpen);

  // FILTER DROPDOWNS: one per group, the search field takes focus on open
  document.querySelectorAll(".filter-dd").forEach(dropdown => {
    const key = dropdown.dataset.filterKey;
    const button = dropdown.querySelector(".filter-dd-btn");
    const popover = dropdown.querySelector(".filter-dd-popover");

    bindToolbarPopover(button, popover);

    if (button && !button._focusBound) {
      button.addEventListener("click", () => {
        if (popover.hidden) return;
        openFilterPopup(key);
        document.getElementById(filterPopupMap[key].inputId)?.focus();
      });
      button._focusBound = true;
    }
  });
  if (resetViewBtn) resetViewBtn.onclick = () => fitView();
  if (zoomInBtn) zoomInBtn.onclick = () => zoomByStep(1);
  if (zoomOutBtn) zoomOutBtn.onclick = () => zoomByStep(-1);
  if (rowsShorterBtn) rowsShorterBtn.onclick = () => rowHeightByStep(-1);
  if (rowsTallerBtn) rowsTallerBtn.onclick = () => rowHeightByStep(1);

  // GO TO YEAR
  if (timelineYearForm && !timelineYearForm._bound) {
    timelineYearForm.addEventListener("submit", (event) => {
      event.preventDefault();
      applyToolbarYearNavigation();
    });

    const clearYearError = () => {
      timelineYearInput.removeAttribute("aria-invalid");
      if (timelineYearError) timelineYearError.textContent = "";
    };

    timelineYearInput?.addEventListener("input", clearYearError);
    timelineYearInput?.addEventListener("blur", clearYearError);

    timelineYearForm._bound = true;
  }

  if (objectDetailBackBtn) {
  objectDetailBackBtn.onclick = () => {
    if (state.comparisonSnapshot) {
      state.scale = state.comparisonSnapshot.scale;
      state.offsetX = state.comparisonSnapshot.offsetX;
      state.scrollY = state.comparisonSnapshot.scrollY;
      state.eventScaleY = state.comparisonSnapshot.eventScaleY;
    }

    state.viewMode = "comparison";
    state.detailObjectId = null;
    state.comparisonSnapshot = null;

    if (objectSearchInput) objectSearchInput.value = "";

      render();
    };
  }

  // RESET
  if(resetFiltersBtn){

    resetFiltersBtn.onclick=()=>{

      ["category","institution","edo","actor","cityStart","cityEnd"].forEach(key=>{
        filtersState[key].clear();
      });

      filtersState.mode="focus";

      updateFilterSummary();
      updateAllFilterFieldUi();
      refreshAllFilterLists();

      render();

    };

  }

  // OBJECT SEARCH
  if (objectSearchForm && !objectSearchForm._bound) {
    objectSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const active = objectSearchState.matches[objectSearchState.activeIndex];
      if (active) selectObjectSearchResult(active.objectId);
      else applyObjectSearch();
    });

    objectSearchInput?.addEventListener("input", () => {
      objectSearchState.activeIndex = -1;
      renderObjectSearchOptions();
      setObjectSearchPopupOpen(true);
    });

    objectSearchInput?.addEventListener("focus", () => {
      renderObjectSearchOptions();
      setObjectSearchPopupOpen(true);
    });

    objectSearchInput?.addEventListener("blur", () => setObjectSearchPopupOpen(false));

    objectSearchInput?.addEventListener("keydown", (event) => {
      const total = objectSearchState.matches.length;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!total) return;
        setObjectSearchPopupOpen(true);
        const step = event.key === "ArrowDown" ? 1 : -1;
        objectSearchState.activeIndex = (objectSearchState.activeIndex + step + total) % total;
        renderObjectSearchOptions();
      } else if (event.key === "Escape") {
        setObjectSearchPopupOpen(false);
      }
    });

    objectSearchForm._bound = true;
  }

  // HELP AND LEGEND POPOVERS
  bindToolbarPopover(navHelpBtn, navHelpTooltip);
  bindToolbarPopover(legendBtn, legendPopover);

  if (!setupFilterUI._toolbarKeysBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeToolbarPopovers();

      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        objectSearchInput?.focus();
        return;
      }

      // Timeline navigation: arrows move, + / − zoom, 0 fits
      const rowStep = (event.shiftKey ? 5 : 1) * eventHeight * state.eventScaleY * 2;
      const keyActions = {
        ArrowLeft: () => panByViewport(event.shiftKey ? -0.5 : -0.1),
        ArrowRight: () => panByViewport(event.shiftKey ? 0.5 : 0.1),
        ArrowUp: () => scrollRowsBy(-rowStep),
        ArrowDown: () => scrollRowsBy(rowStep),
        "+": () => zoomByStep(1),
        "=": () => zoomByStep(1),
        "-": () => zoomByStep(-1),
        "0": () => fitView()
      };
      const action = keyActions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".toolbar-popover-anchor")) closeToolbarPopovers();
    });

    setupFilterUI._toolbarKeysBound = true;
  }

  updateFilterSummary();
  updateAllFilterFieldUi();

  if (eventCardBody && !eventCardBody._boundActions) {
    eventCardBody.addEventListener("click", (event) => {
      const actionBtn = event.target.closest(".event-card-action-btn");
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;

      if (action === "go-to-event") {
        goToSelectedEvent();
        return;
      }

      if (action === "filter-category") {
        filterBySelectedEventCategory();
        return;
      }
    });

    eventCardBody._boundActions = true;
  }

  // CLOSE POPUPS OUTSIDE CLICK
  if(!setupFilterUI._outsideClickBound){

    document.addEventListener("mousedown",(event)=>{

      const clickedInside=event.target.closest(".filter-combobox");

      if(!clickedInside){
        closeAllFilterPopups();
      }

    });

    setupFilterUI._outsideClickBound=true;

  }

  if (eventCardCloseBtn && !eventCardCloseBtn._bound) {
    eventCardCloseBtn.addEventListener("click", () => {
      closeEventCard();
    });

    eventCardCloseBtn._bound = true;
  }

  if (!setupFilterUI._eventCardEscapeBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeEventCard();
      }
    });

    setupFilterUI._eventCardEscapeBound = true;
  }

  if (!setupFilterUI._eventCardOutsideBound) {
    document.addEventListener("pointerdown", (event) => {
      const clickedInsideCard = event.target.closest("#event-card");
      const clickedEventShape = event.target.closest(".event-interactive");

      if (!clickedInsideCard && !clickedEventShape && state.selectedEventId !== null) {
        closeEventCard();
      }
    });

    setupFilterUI._eventCardOutsideBound = true;
  }


}

function eventMatchesFilters(event) {
  const hasAnyFilter = activeFilterTotal() > 0;
  if (!hasAnyFilter) return true;

  const matchesCategory =
    filtersState.category.size === 0 ||
    filtersState.category.has(event.categoryKey);

  const matchesInstitution =
    filtersState.institution.size === 0 ||
    filtersState.institution.has(event.institution);

  const matchesEDO =
    filtersState.edo.size === 0 ||
    filtersState.edo.has(event.edoDesignations);

  const matchesActor =
    filtersState.actor.size === 0 ||
    event.actors.some((a) => filtersState.actor.has(a));

  const matchesCityStart =
    filtersState.cityStart.size === 0 ||
    filtersState.cityStart.has(event.cityStart);

  const matchesCityEnd =
    filtersState.cityEnd.size === 0 ||
    filtersState.cityEnd.has(event.cityEnd);

  return (
    matchesCategory &&
    matchesInstitution &&
    matchesEDO &&
    matchesActor &&
    matchesCityStart &&
    matchesCityEnd
  );
}

function getFilterResultsCounts() {
  const totalEvents = allEvents.length;
  const totalObjects = objectSummaries.length;

  const matchingEvents = allEvents.filter(eventMatchesFilters);
  const matchingEventCount = matchingEvents.length;

  const matchingObjectIds = new Set(
    matchingEvents.map(event => event.objectId)
  );
  const matchingObjectCount = matchingObjectIds.size;

  return {
    totalObjects,
    totalEvents,
    matchingObjectCount,
    matchingEventCount
  };
}

function updateFiltersResultsSummary() {
  const el = document.getElementById("filters-results-summary");
  if (!el) return;

  const {
    totalObjects,
    totalEvents,
    matchingObjectCount,
    matchingEventCount
  } = getFilterResultsCounts();

  if (filtersState.mode === "focus") {
    el.textContent =
      `Showing ${matchingObjectCount}/${totalObjects} objects · ${matchingEventCount}/${totalEvents} events`;
  } else {
    el.textContent =
      `${matchingObjectCount}/${totalObjects} matching objects · ${matchingEventCount}/${totalEvents} matching events`;
  }
}

function currentVisibleRows() {
  const matchedRowHeight = scaledMatchedRowHeight();
  const overviewExtraGap = getOverviewExtraGap();
  const unmatchedRowHeight =
    filtersState.mode === "collapsed"
      ? unmatchedCollapsedEventHeight + (rowHeight - eventHeight)
      : matchedRowHeight;

  const rows = [];
  let cursorY = axisHeight;

  const objectGap = OBJECT_VERTICAL_GAP;
  const objectGapHalf = objectGap / 2;

  const sourceEvents =
  state.viewMode === "objectDetail" && state.detailObjectId !== null
    ? allEvents.filter(event => event.objectId === state.detailObjectId)
    : allEvents;

  /* const objectGap = objectGapExtra; */
  /* const objectGapHalf = objectGap / 2; */

  for (let i = 0; i < sourceEvents.length; i++) {
    const event = sourceEvents[i];
    const matched =
      state.viewMode === "objectDetail"
        ? true
        : eventMatchesFilters(event);

    if (
      state.viewMode !== "objectDetail" &&
      filtersState.mode === "focus" &&
      !matched
    ) continue;

    const prevEvent = sourceEvents[i - 1];
    const nextEvent = sourceEvents[i + 1];

    const isGroupStart = !prevEvent || prevEvent.objectId !== event.objectId;
    const isGroupEnd = !nextEvent || nextEvent.objectId !== event.objectId;

    if (isGroupStart) {
      cursorY += objectGapHalf;
    }

    const visibleEventHeight =
      filtersState.mode === "collapsed" && !matched
        ? unmatchedCollapsedEventHeight
        : scaledEventHeight();

    const rowH =
      filtersState.mode === "collapsed" && !matched
        ? unmatchedRowHeight
        : matchedRowHeight;

    rows.push({
      event,
      matched,
      rowTop: cursorY,
      rowHeight: rowH + overviewExtraGap,
      eventHeight: visibleEventHeight
    });

    cursorY += rowH + overviewExtraGap;

    if (isGroupEnd) {
      cursorY += objectGapHalf;
    }
  }

  return rows;
}

function activeObjectSummaries() {
  if (state.viewMode === "objectDetail" && state.detailObjectId !== null) {
    return objectSummaries.filter(object => object.objectId === state.detailObjectId);
  }
  return objectSummaries;
}

function getDetailObjectYearExtent(objectId) {
  const objectEvents = allEvents.filter(event => event.objectId === objectId);

  if (objectEvents.length === 0) return null;

  const minYear = d3.min(objectEvents, event => event.eventStart);
  const maxYear = d3.max(objectEvents, event => event.eventEnd);

  if (minYear == null || maxYear == null) return null;

  return {
    start: Math.floor(minYear) - 1,
    end: Math.ceil(maxYear) + 8
  };
}

function contentHeightFromRows(rows) {
  if (rows.length === 0) return axisHeight;
  const last = rows[rows.length - 1];
  return last.rowTop + last.rowHeight;
}

function maxScrollY() {
  return Math.max(0, contentHeightFromRows(currentVisibleRows()) - height);
}

function resizeOverscrollMargin() {
  return Math.max(0, (height - axisHeight) * 0.5);
}

function verticalAnchorRatio(scrollY, pointerOffsetY, scaleY) {
  const contentSpan = Math.max(1, contentHeightForScaleY(scaleY) - axisHeight);
  return (scrollY + pointerOffsetY) / contentSpan;
}

function scrollYFromAnchorRatio(ratio, pointerOffsetY, scaleY) {
  const contentSpan = Math.max(1, contentHeightForScaleY(scaleY) - axisHeight);
  return ratio * contentSpan - pointerOffsetY;
}

function clampScrollY(extraMargin = 0) {
  state.scrollY = clamp(state.scrollY, -extraMargin, maxScrollY() + extraMargin);
}

function scaledX(year) {
  return baseScale(year) * state.scale + state.offsetX;
}

function visibleDomain() {
  const leftYear = baseScale.invert((stickyWidth - state.offsetX) / state.scale);
  const rightYear = baseScale.invert((width - state.offsetX) / state.scale);
  return [leftYear, rightYear];
}

function minAllowedScale() {
  const basePxPerYear = Math.abs(baseScale(1) - baseScale(0));
  const plotWidth = Math.max(1, width - stickyWidth);
  return plotWidth / (targetMinVisibleYears * basePxPerYear);
}

function maxAllowedScale() {
  const basePxPerYear = Math.abs(baseScale(1) - baseScale(0));
  const plotWidth = Math.max(1, width - stickyWidth);
  return plotWidth / (targetMaxVisibleYears * basePxPerYear);
}

function clampScale() {
  state.scale = clamp(state.scale, minAllowedScale(), maxAllowedScale());
}

function clampOffsetX() {
  const minOffset = width - baseScale(maxYear) * state.scale;
  const maxOffset = stickyWidth - baseScale(minYear) * state.scale;
  state.offsetX = clamp(state.offsetX, minOffset, maxOffset);
}

function fitTimelineToYearRange(startYear, endYear) {
  const safeStart = Math.max(minYear, startYear);
  const safeEnd = Math.min(maxYear, endYear);

  const plotWidth = Math.max(1, width - stickyWidth);
  const baseStart = baseScale(safeStart);
  const baseEnd = baseScale(safeEnd);
  const baseSpan = Math.max(1, baseEnd - baseStart);

  state.scale = clamp(plotWidth / baseSpan, minAllowedScale(), maxAllowedScale());

  const scaledStart = baseScale(safeStart) * state.scale;
  const scaledEnd = baseScale(safeEnd) * state.scale;
  const scaledSpan = scaledEnd - scaledStart;

  const extraSpace = Math.max(0, plotWidth - scaledSpan);
  state.offsetX = stickyWidth - scaledStart + extraSpace / 2;

  clampOffsetX();
}

function patternFill(section, event, sectionIndex, x, y) {
  if (!section.pattern || section.pattern === "none") return null;
  const patternId = `event-${event.id}-section-${sectionIndex}-${section.pattern}`;
  let pattern = defs.select(`#${patternId}`);

  if (pattern.empty()) {
    const source = defs.select(`#pattern-${section.pattern}`);
    pattern = source.clone(true).attr("id", patternId);
  }

  pattern.attr("x", x);
  pattern.attr("y", y);
  return `url(#${patternId})`;
}

function drawPreciseDateDiamond(group, centerX, centerY, event, symbol = "", size = 10, opacityMultiplier = 1) {
  const baseColor = d3.color(event.categoryColor);
  const diamondFillBase = symbol
    ? d3.interpolateRgb(event.categoryColor, "#ffffff")(0)
    : event.categoryColor;

  const diamondFill = d3.color(diamondFillBase);
  const diamondStroke = d3.color(event.categoryColor);

  group.append("rect")
    .attr("x", centerX - size / 2)
    .attr("y", centerY - size / 2)
    .attr("width", size)
    .attr("height", size)
    .attr("rx", 2)
    .attr("ry", 2)
    .attr("fill", rgba(diamondFill.formatHex(), opacityMultiplier))
    .attr("stroke", rgba(diamondStroke.formatHex(), opacityMultiplier))
    .attr("stroke-width", 1)
    .attr("transform", `rotate(45 ${centerX} ${centerY})`)
    .attr("pointer-events", "none");

  if (symbol) {
    group.append("text")
      .attr("x", centerX)
      .attr("y", centerY + 0.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 16)
      .attr("font-weight", 600)
      .attr("fill", rgba("#ffffff", opacityMultiplier))
      .attr("pointer-events", "none")
      .text(symbol);
  }

  /* group.append("rect")
    .attr("x", centerX - size / 2)
    .attr("y", centerY - size / 2)
    .attr("width", size)
    .attr("height", size)
    .attr("rx", 2)
    .attr("ry", 2)
    .attr("fill", diamondFill)
    .attr("stroke", event.categoryColor)
    .attr("stroke-width", 1)
    .attr("transform", `rotate(45 ${centerX} ${centerY})`)
    .attr("pointer-events", "none");

  if (symbol) {
    group.append("text")
      .attr("x", centerX)
      .attr("y", centerY + 0.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 16)
      .attr("font-weight", 800)
      .attr("fill", event.categoryColor)
      .attr("stroke-width", 1.4)
      .attr("paint-order", "stroke")
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text(symbol);
    } */
}

  /* group.append("rect")
    .attr("x", centerX - size / 2)
    .attr("y", centerY - size / 2)
    .attr("width", size)
    .attr("height", size)
    .attr("rx", 2)
    .attr("ry", 2)
    .attr("fill", rgba(event.categoryColor, 1))
    .attr("stroke", rgba(event.categoryColor, 0))
    .attr("stroke-width", 4)
    .attr("transform", `rotate(45 ${centerX} ${centerY})`);

  if (symbol) {
    group.append("text")
      .attr("x", centerX)
      .attr("y", centerY + 0.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 14)
      .attr("font-weight", 700)
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none")
      .text(symbol);
  } */

function getSemanticZoomLevel() {
  const pxPerYear = Math.abs((baseScale(1) - baseScale(0)) * state.scale);

  if (pxPerYear < 1.5) return 1;   // OVERVIEW
  if (pxPerYear < 10) return 2;    // STRUCTURE
  return 3;                        // DETAIL
}

function eventBarWidth(event) {
  return scaledX(event.eventEnd) - scaledX(event.eventStart);
}

// Horizontal extent of what is actually drawn for an event (diamonds and
// widened short bars included), without the open-end dotted tails
function eventVisualSpan(event, drawAsGlyph) {
  if (drawAsGlyph) return getOverviewDisplayedSpan(event);

  let x0 = scaledX(event.eventStart);
  let x1 = scaledX(event.eventEnd);

  if (eventBarWidth(event) < MIN_BAR_WIDTH_PX) {
    const centerX = (x0 + x1) / 2;
    x0 = Math.min(x0, centerX - MIN_BAR_WIDTH_PX / 2);
    x1 = Math.max(x1, centerX + MIN_BAR_WIDTH_PX / 2);
  }

  const sections = event.sections || [];
  const halfDiamond = OVERVIEW_DIAMOND_SIZE / 2;
  const first = sections[0];
  const last = sections[sections.length - 1];

  if (first?.isExactDate === true) {
    x0 = Math.min(x0, scaledX((first.start + first.end) / 2) - halfDiamond);
  }
  if (last?.isExactDate === true) {
    x1 = Math.max(x1, scaledX((last.start + last.end) / 2) + halfDiamond);
  }

  return { x0, x1 };
}

function isOverviewZoomLevel() {
  return getSemanticZoomLevel() === 1;
}

function getOverviewExtraGap() {
  const pxPerYear = Math.abs((baseScale(1) - baseScale(0)) * state.scale);

  const fullOverviewGap = 3;
  const transitionStart = 1.2;
  const transitionEnd = 1.9;

  if (pxPerYear <= transitionStart) return fullOverviewGap;
  if (pxPerYear >= transitionEnd) return 0;

  const t = (pxPerYear - transitionStart) / (transitionEnd - transitionStart);
  return fullOverviewGap * (1 - t);
}

function syncEventHeightForSemanticZoom(pointerClientY = null) {
  const targetScaleY = isOverviewZoomLevel()
    ? OVERVIEW_FIXED_EVENT_SCALE_Y
    : storedDetailEventScaleY;

  if (state.eventScaleY === targetScaleY) return;

  let pointerOffsetY = (height - axisHeight) / 2;

  if (pointerClientY !== null) {
    const rect = svg.node().getBoundingClientRect();
    pointerOffsetY = pointerClientY - rect.top - axisHeight;
  }

  const anchorRatio = verticalAnchorRatio(
    state.scrollY,
    pointerOffsetY,
    state.eventScaleY
  );

  if (isOverviewZoomLevel()) {
    storedDetailEventScaleY = state.eventScaleY;
    state.eventScaleY = OVERVIEW_FIXED_EVENT_SCALE_Y;
  } else {
    state.eventScaleY = storedDetailEventScaleY;
  }

  state.scrollY = scrollYFromAnchorRatio(
    anchorRatio,
    pointerOffsetY,
    state.eventScaleY
  );

  clampScrollY(resizeOverscrollMargin());
}

function getOverviewDisplayedSpan(event) {
  const squareSize = OVERVIEW_SQUARE_SIZE;
  const diamondSize = OVERVIEW_DIAMOND_SIZE;
  const markerGap = 1;
  const defaultMinLineBodyLength = 24;
  const epsilon = 0.000001;

  const sections = event.sections || [];
  const exactSections = sections.filter(section => section.isExactDate === true);

  const firstSection = sections[0];
  const lastSection = sections[sections.length - 1];

  const leftIsExact = firstSection ? firstSection.isExactDate === true : false;
  const rightIsExact = lastSection ? lastSection.isExactDate === true : false;
  const isDoubleDiamondDuration = leftIsExact && rightIsExact;

  // CASE 1 — single-section event
  if (sections.length === 1) {
    const section = sections[0];
    const centerX = scaledX((section.start + section.end) / 2);

    if (section.isExactDate === true) {
      return {
        x0: centerX - diamondSize / 2,
        x1: centerX + diamondSize / 2
      };
    } else {
      const singleSectionWidth = Math.max(2, scaledX(section.end) - scaledX(section.start));
      const markerWidth =
        singleSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD
          ? singleSectionWidth
          : squareSize;

      return {
        x0: centerX - markerWidth / 2,
        x1: centerX + markerWidth / 2
      };
    }
  }

  const hasRealDuration = (event.eventEnd - event.eventStart) > epsilon;

  // CASE 2 — no real duration
  if (!hasRealDuration) {
    const centerX = scaledX((event.eventStart + event.eventEnd) / 2);

    if (exactSections.length > 0) {
      return {
        x0: centerX - diamondSize / 2,
        x1: centerX + diamondSize / 2
      };
    } else {
      const singleMarkerWidth = firstSection
        ? Math.max(2, scaledX(firstSection.end) - scaledX(firstSection.start))
        : squareSize;

      const markerWidth =
        singleMarkerWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD
          ? singleMarkerWidth
          : squareSize;

      return {
        x0: centerX - markerWidth / 2,
        x1: centerX + markerWidth / 2
      };
    }
  }

  // CASE 3 — duration event
  const realStartX = scaledX(event.eventStart);
  const realEndX = scaledX(event.eventEnd);

  const firstSectionWidth = firstSection
    ? Math.max(2, scaledX(firstSection.end) - scaledX(firstSection.start))
    : squareSize;

  const lastSectionWidth = lastSection
    ? Math.max(2, scaledX(lastSection.end) - scaledX(lastSection.start))
    : squareSize;

  const leftMarkerWidth = leftIsExact
    ? diamondSize
    : (firstSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD ? firstSectionWidth : squareSize);

  const rightMarkerWidth = rightIsExact
    ? diamondSize
    : (lastSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD ? lastSectionWidth : squareSize);

  const leftHalf = leftMarkerWidth / 2;
  const rightHalf = rightMarkerWidth / 2;

  const leftMarkerVisualOffset = leftIsExact ? -8 : 0;
  const rightMarkerVisualOffset = rightIsExact ? 8 : 0;

  const lineBodyLength = isDoubleDiamondDuration
    ? OVERVIEW_DOUBLE_DIAMOND_MIN_LINE_BODY_LENGTH
    : defaultMinLineBodyLength;

  const minComposedWidth =
    leftHalf + markerGap + lineBodyLength + markerGap + rightHalf;

  const realWidth = Math.max(2, realEndX - realStartX);
  const composedWidth = Math.max(realWidth, minComposedWidth);

  const composedStartX = realStartX;
  const composedEndX = composedStartX + composedWidth;

  const leftCenterX = composedStartX + leftHalf + leftMarkerVisualOffset;
  const rightCenterX = composedEndX - rightHalf + rightMarkerVisualOffset;

  const leftOuterX = leftCenterX - leftMarkerWidth / 2;
  const rightOuterX = rightCenterX + rightMarkerWidth / 2;

  return {
    x0: leftOuterX,
    x1: rightOuterX
  };
}

function drawOverviewGlyphEvent(group, event, rowCenterY, currentEventHeight, matched, isSelected) {
  const glyphFillOpacity = OPACITY.overviewLine;

  const lineThickness = Math.max(2, Math.min(3, currentEventHeight * 0.16));
  const squareSize = OVERVIEW_SQUARE_SIZE;
  const diamondSize = OVERVIEW_DIAMOND_SIZE;
  const markerGap = 1;
  const defaultMinLineBodyLength = 18;
  const epsilon = 0.000001;

  const sections = event.sections || [];
  const exactSections = sections.filter(section => section.isExactDate === true);
  const selected = isSelectedEvent(event);

  const firstSection = sections[0];
  const lastSection = sections[sections.length - 1];

  const leftIsExact = firstSection ? firstSection.isExactDate === true : false;
  const rightIsExact = lastSection ? lastSection.isExactDate === true : false;
  const isDoubleDiamondDuration = leftIsExact && rightIsExact;

  const symbolForSection = (section) => {
    const fromCode = uncertaintySymbolFromCode(section?.uncertaintyCode || "");
    if (fromCode) return fromCode;

    const fromEDTF = uncertaintySymbolFromEDTFSegment(event?.edtf || "", section?.kind || "");
    if (fromEDTF) return fromEDTF;

    const fromRawStart = uncertaintySymbolFromRaw(section?.rawStart || "");
    if (fromRawStart) return fromRawStart;

    const fromRawEnd = uncertaintySymbolFromRaw(section?.rawEnd || "");
    if (fromRawEnd) return fromRawEnd;

    // last-resort fallback for problematic EDTF cases in Overview:
    // if the event EDTF contains an uncertainty marker anywhere, use it.
    const eventEDTF = String(event?.edtf || "");
    if (eventEDTF.includes("%")) return "%";
    if (eventEDTF.includes("~")) return "~";
    if (eventEDTF.includes("?")) return "?";

    return "";
  };

  const drawSquare = (centerX, symbol = "", markerWidth = squareSize) => {
    group.append("rect")
      .attr("class", "event-interactive")
      .attr("x", centerX - markerWidth / 2)
      .attr("y", rowCenterY - squareSize / 2)
      .attr("width", markerWidth)
      .attr("height", squareSize)
      .attr("rx", 0)
      .attr("ry", 0)
      .attr("fill", rgba(event.categoryColor, OPACITY.overviewSquare))
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .style("cursor", "pointer")
      .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event))
      .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mouseleave", hideTooltip);

    if (symbol) {
      group.append("text")
        .attr("x", centerX)
        .attr("y", rowCenterY + 0.5)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", 16)
        .attr("font-weight", 700)
        .attr("fill", event.categoryColor)
        .attr("pointer-events", "none")
        .text(symbol);
    }
  };

  const drawDiamond = (centerX, symbol = "") => {

    drawPreciseDateDiamond(
      group,
      centerX,
      rowCenterY,
      event,
      symbol,
      diamondSize
    );

    const hitSize = Math.max(16, diamondSize + 6);

    group.append("rect")
      .attr("class", "event-interactive")
      .attr("x", centerX - hitSize / 2)
      .attr("y", rowCenterY - hitSize / 2)
      .attr("width", hitSize)
      .attr("height", hitSize)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event))
      .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mouseleave", hideTooltip);
  };

  // CASE 1 — any single-section event: one marker only
  if (sections.length === 1) {
    const section = sections[0];
    const centerX = scaledX((section.start + section.end) / 2);
    const symbol = symbolForSection(section);

    if (section.isExactDate === true) {
      drawDiamond(centerX, symbol);
    } else {
      const singleSectionWidth = Math.max(2, scaledX(section.end) - scaledX(section.start));
      const markerWidth =
        singleSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD
          ? singleSectionWidth
          : squareSize;

      drawSquare(centerX, symbol, markerWidth);
    }

    return;
  }

  const hasRealDuration = (event.eventEnd - event.eventStart) > epsilon;

    // CASE 2 — fallback for events without real duration: one marker only
    if (!hasRealDuration) {
    const centerX = scaledX((event.eventStart + event.eventEnd) / 2);

    if (exactSections.length > 0) {
      drawDiamond(centerX, symbolForSection(exactSections[0]));
    } else {
      const singleMarkerWidth = firstSection
        ? Math.max(2, scaledX(firstSection.end) - scaledX(firstSection.start))
        : squareSize;

      const markerWidth =
        singleMarkerWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD
          ? singleMarkerWidth
          : squareSize;

      drawSquare(centerX, symbolForSection(firstSection), markerWidth);
    }

    return;
  }

  /* const glyphStartOffset = -8; */

  // CASE 3 — duration event: terminal marker — line — terminal marker
  const realStartX = scaledX(event.eventStart);
  const realEndX = scaledX(event.eventEnd);

  const firstSectionWidth = firstSection
    ? Math.max(2, scaledX(firstSection.end) - scaledX(firstSection.start))
    : squareSize;

  const lastSectionWidth = lastSection
    ? Math.max(2, scaledX(lastSection.end) - scaledX(lastSection.start))
    : squareSize;

  const leftMarkerWidth = leftIsExact
    ? diamondSize
    : (firstSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD ? firstSectionWidth : squareSize);

  const rightMarkerWidth = rightIsExact
    ? diamondSize
    : (lastSectionWidth >= OVERVIEW_LONG_SEGMENT_THRESHOLD ? lastSectionWidth : squareSize);

  const leftHalf = leftMarkerWidth / 2;
  const rightHalf = rightMarkerWidth / 2;

  const leftMarkerVisualOffset = leftIsExact ? -8 : 0;
  const rightMarkerVisualOffset = rightIsExact ? 8 : 0;

  const lineBodyLength = isDoubleDiamondDuration
    ? OVERVIEW_DOUBLE_DIAMOND_MIN_LINE_BODY_LENGTH
    : defaultMinLineBodyLength;

  const minComposedWidth =
    leftHalf + markerGap + lineBodyLength + markerGap + rightHalf;

  const realWidth = Math.max(2, realEndX - realStartX);
  const composedWidth = Math.max(realWidth, minComposedWidth);

  // Keep the composed glyph anchored to the real start
  const composedStartX = realStartX;
  const composedEndX = composedStartX + composedWidth;

  // Offset the markers themselves, not the whole glyph
  const leftCenterX = composedStartX + leftHalf + leftMarkerVisualOffset;
  const rightCenterX = composedEndX - rightHalf + rightMarkerVisualOffset;

  const lineStartX = leftCenterX + leftHalf + markerGap;
  const lineEndX = rightCenterX - rightHalf - markerGap;

  group.append("line")
    .attr("class", "event-interactive")
    .attr("x1", lineStartX)
    .attr("x2", lineEndX)
    .attr("y1", rowCenterY)
    .attr("y2", rowCenterY)
    .attr(
      "stroke",
      isDoubleDiamondDuration
        ? event.categoryColor
        : rgba(event.categoryColor, ALPHA.body)
    )
    .attr("stroke-width", selected ? Math.max(3, lineThickness + 1) : Math.max(2, lineThickness))
    .attr("stroke-linecap", "round")
    .style("cursor", "pointer")
    .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event))
    .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
    .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
    .on("mouseleave", hideTooltip);

  if (leftIsExact) {
    drawDiamond(leftCenterX, symbolForSection(firstSection));
  } else {
    drawSquare(leftCenterX, symbolForSection(firstSection), leftMarkerWidth);
  }

  if (rightIsExact) {
    drawDiamond(rightCenterX, symbolForSection(lastSection));
  } else {
    drawSquare(rightCenterX, symbolForSection(lastSection), rightMarkerWidth);
  }

  // Interior exact sections: show as diamonds on the body, skipping terminals
  const interiorExactSections = exactSections.filter((section) => {
    const isFirst = section === firstSection;
    const isLast = section === lastSection;
    return !isFirst && !isLast;
  });

  interiorExactSections.forEach((section) => {
    const realCenter = scaledX((section.start + section.end) / 2);
    const clampedCenter = Math.max(
      lineStartX + diamondSize / 2,
      Math.min(lineEndX - diamondSize / 2, realCenter)
    );

    drawDiamond(clampedCenter, symbolForSection(section));
  });
}

function showObjectMeta(yTop, yBottom) {
  const institutionY = yTop + 40;
  const edoY = yTop + 54;
  return edoY <= yBottom - objectMetaMinBottomPadding && edoY > institutionY;
}

function objectTextWidth() {
  return stickyWidth - 96;
}

function truncateText(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function charsForWidth(widthPx, fontSizePx = 11) {
  return Math.max(6, Math.floor(widthPx / (fontSizePx * 0.58)));
}

function isOpenLeftEDTF(edtf) {
  return normalizeDateString(edtf).startsWith("/");
}

function isOpenRightEDTF(edtf) {
  return normalizeDateString(edtf).endsWith("/");
}

function initializeFromData() {
  allEvents.length = 0;
  objectSummaries.length = 0;

  let rowIndex = 0;

  data.forEach((object) => {
    object.events
      .sort((a, b) => {
        const aStart = d3.min(a.sections, (d) => d.start);
        const bStart = d3.min(b.sections, (d) => d.start);
        return (aStart ?? Infinity) - (bStart ?? Infinity);
      })
      .forEach((event, eventIndexWithinObject) => {
        const sections = event.sections
          .filter((section) => section.start !== null && section.end !== null)
          .map((section) => {
            let resolvedOpacity = section.opacity ?? (section.kind === "mid" ? regularMidOpacity : ALPHA.edge);
            if (section.kind === "single") resolvedOpacity = ALPHA.body;

            return {
              ...section,
              opacity: resolvedOpacity,
              pattern: section.pattern ?? "none"
            };
          });

        if (sections.length === 0) return;

        const eventStart = d3.min(sections, (d) => d.start);
        const eventEnd = d3.max(sections, (d) => d.end);

        allEvents.push({
          ...event,
          sections,
          eventStart,
          eventEnd,
          objectId: object.objectId,
          institution: object.institution,
          edoDesignations: object.edoDesignations,
          actors: object.actors,
          cityStart: object.cityStart,
          cityEnd: object.cityEnd,
          edtf: object.edtfById[event.id] || "",
          rowIndex,
          eventIndexWithinObject
        });

        rowIndex += 1;
      });
  });

  data.forEach((object) => {
    const count = allEvents.filter((e) => e.objectId === object.objectId).length;
    if (count === 0) return;

    objectSummaries.push({
      objectId: object.objectId,
      institution: object.institution,
      edoDesignations: object.edoDesignations,
      eventCount: count
    });
  });

  render();
}

async function loadCSV() {
  const raw = await fetch("Provenance_Data_Try1.csv");
  const text = await raw.text();
  const rows = d3.csvParse(text);
  rawRows = rows;

  buildFilterOptions(rows);

  const grouped = d3.group(rows, (d) => d.object_id);

  data = Array.from(grouped, ([objectId, events]) => ({
    objectId,
    institution: normalizeDateString(events[0].institution),
    edoDesignations: normalizeDateString(events[0].edo_designations),
    actors: uniqueSorted(events.flatMap((e) => splitPipeValues(e.actors))),
    cityStart: normalizeDateString(events[0].city_start),
    cityEnd: normalizeDateString(events[0].city_end),
    edtfById: Object.fromEntries(events.map((e, i) => [`${objectId}-${i}`, normalizeDateString(e.edtf)])),
    events: events.map((e, i) => {
      const startRaw = e.Date_Start;
      const mid1Raw = e.Date_Mid1;
      const mid2Raw = e.Date_Mid2;
      const endRaw = e.Date_End;
      const categoryKey = normalizeDateString(e.category).toLowerCase() || "unknown";

      let sections;
      if (!normalizeDateString(startRaw) && !normalizeDateString(endRaw)) {
        sections = [
          buildSection("single", mid1Raw, mid2Raw, OPACITY.structureStart, patternFromCode(e.uncertainty_mid), e.uncertainty_mid || "")
        ];
      } else {
        sections = [
          buildSection("start", startRaw, mid1Raw, OPACITY.structureStart, patternFromCode(e.uncertainty_start), e.uncertainty_start || ""),
          buildSection("mid", mid1Raw, mid2Raw, OPACITY.structureMid, patternFromCode(e.uncertainty_mid), e.uncertainty_mid || ""),
          buildSection("end", mid2Raw, endRaw, OPACITY.structureEnd, patternFromCode(e.uncertainty_end), e.uncertainty_end || "")
        ];
      }

      return {
        id: `${objectId}-${i}`,
        label: categoryKey || "unknown",
        categoryKey,
        categoryColor: CATEGORY_MAP[categoryKey] || "#AEAEAE",
        sections
      };
    })
  }));

  initializeFromData();
  setupFilterUI();
}

function render() {
  width = wrap.clientWidth;
  height = wrap.clientHeight;

  syncEventHeightForSemanticZoom();

  baseScale.range([stickyWidth, Math.max(stickyWidth + 600, width)]);
  clampScale();
  clampOffsetX();
  clampScrollY();

  const rows = currentVisibleRows();
  const currentContentHeight = contentHeightFromRows(rows);

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  plotClip.select("rect")
    .attr("x", stickyWidth)
    .attr("y", axisHeight)
    .attr("width", width - stickyWidth)
    .attr("height", height - axisHeight);

  labelClip.select("rect")
    .attr("x", stickyWidth)
    .attr("y", axisHeight)
    .attr("width", width - stickyWidth)
    .attr("height", height - axisHeight);

  axisLayer.selectAll("*").remove();
  stickyLayer.selectAll("*").remove();
  gridLayer.selectAll("*").remove();
  rowsLayer.selectAll("*").remove();
  eventsLayer.selectAll("*").remove();
  labelsLayer.selectAll("*").remove();

  if (leftPanelHtml) {
    leftPanelHtml.innerHTML = "";
  }

  gridLayer.attr("clip-path", "url(#plot-clip)");
  rowsLayer.attr("clip-path", "url(#plot-clip)");
  eventsLayer.attr("clip-path", "url(#plot-clip)");
  labelsLayer.attr("clip-path", "url(#label-clip)");

  stickyLayer.append("rect")
    .attr("class", "sticky-bg")
    .attr("x", 0)
    .attr("y", axisHeight)
    .attr("width", stickyWidth)
    .attr("height", height - axisHeight);

  stickyLayer.append("line")
    .attr("class", "sticky-divider")
    .attr("x1", stickyWidth)
    .attr("x2", stickyWidth)
    .attr("y1", axisHeight)
    .attr("y2", height);

  axisLayer.append("rect")
    .attr("class", "axis-bg")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", axisHeight);

  axisLayer.append("line")
    .attr("class", "axis-divider")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", axisHeight)
    .attr("y2", axisHeight);

  axisClip.select("rect")
    .attr("x", stickyWidth)
    .attr("y", 0)
    .attr("width", Math.max(0, width - stickyWidth))
    .attr("height", axisHeight);

  const axisLabelsLayer = axisLayer.append("g").attr("clip-path", "url(#axis-clip)");

  const pxPerYear = Math.abs((baseScale(1) - baseScale(0)) * state.scale);
  const step = visibleYearStep(pxPerYear);
  const [domainStart, domainEnd] = visibleDomain();
  const firstTick = Math.floor(domainStart / step) * step;
  const ticks = d3.range(firstTick, domainEnd + step, step);

  ticks.forEach((year) => {
    const x = scaledX(year);
    const major = year % (step * 5) === 0 || step >= 100;

    gridLayer.append("line")
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", axisHeight)
      .attr("y2", Math.max(height, currentContentHeight - state.scrollY))
      .attr("class", `${major ? "major " : ""}year-grid-line`);

    // Skip labels that would be cut in half by the divider
    if (x < stickyWidth + AXIS_LABEL_HALF_WIDTH) return;

    axisLabelsLayer.append("text")
      .attr("class", "axis-label")
      .attr("x", x)
      .attr("y", 18)
      .text(yearLabel(year));
  });

  const specialX = scaledX(specialYear);
  const specialVisible = specialX >= stickyWidth && specialX <= width;
  if (specialVisible) {
    gridLayer.append("line")
      .attr("class", "special-year-line")
      .attr("x1", specialX)
      .attr("x2", specialX)
      .attr("y1", axisHeight)
      .attr("y2", Math.max(height, currentContentHeight - state.scrollY));

    axisLabelsLayer.append("text")
      .attr("class", "axis-label-special")
      .attr("x", specialX)
      .attr("y", 34)
      .text(yearLabel(specialYear));
  }

  rows.forEach((row) => {
    const { event, matched, rowTop, rowHeight, eventHeight: currentEventHeight } = row;
    const isSelected =
      state.selectedEventId &&
      eventSelectionKey(event) === state.selectedEventId;
    const rowBaseTop = rowTop - state.scrollY;
    const rowBottom = rowBaseTop + rowHeight;

    if (rowBottom < axisHeight - 10 || rowBaseTop > height + 10) return;

    const eventVisualOpacity = matched ? 1 : filteredOutOpacity;

    const group = eventsLayer.append("g")
      .attr("class", "event-group")
      .attr("opacity", eventVisualOpacity);

    const semanticLevel = getSemanticZoomLevel();
    const drawAsGlyph = semanticLevel === 1;

    const rowCenterY = rowBaseTop + rowHeight / 2;
    const normalRectY = rowCenterY - currentEventHeight / 2;

    const visualSpan = eventVisualSpan(event, drawAsGlyph);
    const openLeft = isOpenLeftEDTF(event.edtf);
    const openRight = isOpenRightEDTF(event.edtf);

    if (isSelected) {
      // The box also wraps the dotted tails of open starts and ends
      const displayedX0 = visualSpan.x0 - (openLeft ? OPEN_END_LINE_LENGTH : 0);
      const displayedX1 = visualSpan.x1 + (openRight ? OPEN_END_LINE_LENGTH : 0);

      const boxX = displayedX0 - SELECTION_BOX_PAD_X;
      const boxWidth = Math.max(8, displayedX1 - displayedX0) + SELECTION_BOX_PAD_X * 2;

      const boxY = normalRectY - SELECTION_BOX_PAD_Y;
      const boxHeight = currentEventHeight + SELECTION_BOX_PAD_Y * 2;

      group.append("rect")
        .attr("x", boxX)
        .attr("y", boxY)
        .attr("width", boxWidth)
        .attr("height", boxHeight)
        .attr("rx", SELECTION_BOX_RADIUS)
        .attr("ry", SELECTION_BOX_RADIUS)
        .attr("fill", "none") /* --- bound-box-fill */
        .attr("stroke", SELECTION_BOX_STROKE)
        .attr("stroke-width", SELECTION_BOX_STROKE_WIDTH)
        .attr("pointer-events", "none");
    }

    // Invisible hit area so the dotted tails select and show the tooltip too
    const addOpenEndHitArea = (x) => {
      group.append("rect")
        .attr("class", "event-interactive")
        .attr("x", x)
        .attr("y", rowCenterY - Math.max(8, currentEventHeight / 2))
        .attr("width", OPEN_END_LINE_LENGTH)
        .attr("height", Math.max(16, currentEventHeight))
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event))
        .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
        .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
        .on("mouseleave", hideTooltip);
    };

    if (openLeft) {
      addOpenEndHitArea(visualSpan.x0 - OPEN_END_LINE_LENGTH);

      group.append("line")
        .attr("x1", visualSpan.x0 - OPEN_END_LINE_LENGTH)
        .attr("x2", visualSpan.x0)
        .attr("y1", rowCenterY)
        .attr("y2", rowCenterY)
        .attr("stroke", rgba(event.categoryColor, ALPHA.edge))
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "0.1 10")
        .attr("stroke-linecap", "round")
        .attr("pointer-events", "none");
    }

    if (openRight) {
      addOpenEndHitArea(visualSpan.x1);

      group.append("line")
        .attr("x1", visualSpan.x1)
        .attr("x2", visualSpan.x1 + OPEN_END_LINE_LENGTH)
        .attr("y1", rowCenterY)
        .attr("y2", rowCenterY)
        .attr("stroke", rgba(event.categoryColor, ALPHA.edge))
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "0.1 10")
        .attr("stroke-linecap", "round")
        .attr("pointer-events", "none");
    }

  if (drawAsGlyph) {

    drawOverviewGlyphEvent(
      group,
      event,
      rowCenterY,
      currentEventHeight,
      matched,
      isSelected
    );

  } else {

    // STRUCTURE + DETAIL LEVELS
    // Draw sections normally. Patterns only in level 3.

    const preciseDiamondsToDraw = [];

    const firstSection = event.sections[0];
    const lastSection = event.sections[event.sections.length - 1];
    const structureDetailDoubleDiamondEvent =
      firstSection?.isExactDate === true && lastSection?.isExactDate === true;

    // A too-short event becomes one bar of MIN_BAR_WIDTH_PX centred on it
    const narrowEvent = eventBarWidth(event) < MIN_BAR_WIDTH_PX;
    let narrowBarDrawn = false;

    event.sections.forEach((section, sectionIndex) => {

      const x0 = scaledX(section.start);
      const x1 = scaledX(section.end);

      const isExactDate = section.isExactDate === true;

      if (isExactDate) {
        const diamondCenterX = scaledX((section.start + section.end) / 2);
        const diamondCenterY = rowCenterY;
        const diamondSymbol = uncertaintySymbolFromCode(section.uncertaintyCode || "");

        preciseDiamondsToDraw.push({
          centerX: diamondCenterX,
          centerY: diamondCenterY,
          symbol: diamondSymbol
        });

      } else {
        if (narrowEvent && narrowBarDrawn) return;

        const rectHeight = currentEventHeight;
        const rectY = normalRectY;
        const eventCenterX = (scaledX(event.eventStart) + scaledX(event.eventEnd)) / 2;
        const rectWidth = narrowEvent ? MIN_BAR_WIDTH_PX : Math.max(2, x1 - x0);
        const rectX = narrowEvent ? eventCenterX - MIN_BAR_WIDTH_PX / 2 : x0;
        if (narrowEvent) narrowBarDrawn = true;

        let rectOpacity = section.opacity;

        if (structureDetailDoubleDiamondEvent && matched) {
          rectOpacity = ALPHA.body;
        }

        if (narrowEvent) rectOpacity = ALPHA.body;


        const rect = group.append("rect")
          .attr("class", "event-rect event-interactive")
          .attr("x", rectX)
          .attr("y", rectY)
          .attr("width", rectWidth)
          .attr("height", rectHeight)
          .attr("fill", rgba(event.categoryColor, rectOpacity))
          .attr("stroke", "none")
          .attr("stroke-width", 0)
          .style("cursor", "pointer")
          .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event));

        rect
          .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
          .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
          .on("mouseleave", hideTooltip);

        const showPattern =
          semanticLevel === 3 &&
          matched &&
          currentEventHeight > patternMinEventHeight &&
          section.pattern !== "none";

        if (showPattern) {

          group.append("rect")
            .attr("x", rectX)
            .attr("y", rectY)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("fill", patternFill(section, event, sectionIndex, rectX, rectY))
            .attr("pointer-events", "none");

        }

        if (semanticLevel === 3 && sectionIndex > 0) {

          const separatorX = x0;

          group.append("line")
            .attr("x1", separatorX)
            .attr("x2", separatorX)
            .attr("y1", rectY + 1)
            .attr("y2", rectY + rectHeight - 1)
            .attr("stroke", "rgba(255,255,255,0.55)")
            .attr("stroke-width", 1)
            .attr("pointer-events", "none");

        }

      }

  });

  preciseDiamondsToDraw.forEach((diamond) => {
    drawPreciseDateDiamond(
      group,
      diamond.centerX,
      diamond.centerY,
      event,
      diamond.symbol,
      OVERVIEW_DIAMOND_SIZE,
      1
    );

    const diamondHit = group.append("rect")
      .attr("class", "event-interactive")
      .attr("x", diamond.centerX - 8)
      .attr("y", diamond.centerY - 8)
      .attr("width", 16)
      .attr("height", 16)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("pointerdown", (ev) => handleEventSelectionPointerDown(ev, event));

    diamondHit
      .on("mouseenter", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mousemove", (ev) => showTooltip(tooltipHTMLForEvent(event), ev.clientX, ev.clientY))
      .on("mouseleave", hideTooltip);
  });

}

  if (semanticLevel >= 2 && matched) {

    // Labels always sit to the left of the event, past any dotted open start
    const labelAnchorX =
      visualSpan.x0 - (openLeft ? OPEN_END_LINE_LENGTH : 0) - labelGap;

    labelsLayer.append("text")
      .attr("class", "event-label")
      .attr("x", labelAnchorX)
      .attr("y", rowCenterY)
      .attr("text-anchor", "end")
      .text(event.label);

  }
  
});

  const groupedRows = d3.group(rows, (d) => d.event.objectId);

  if (leftPanelHtml) {
    const inner = document.createElement("div");
    inner.className = "left-panel-html-inner";
    leftPanelHtml.appendChild(inner);

    activeObjectSummaries().forEach((object) => {
      const objectRows = groupedRows.get(object.objectId);
      if (!objectRows || objectRows.length === 0) return;

      const first = objectRows[0];
      const last = objectRows[objectRows.length - 1];
      const yTop = first.rowTop - state.scrollY;
      const yBottom = last.rowTop + last.rowHeight - state.scrollY;

      if (yBottom < axisHeight - 20 || yTop > height + 20) return;

      // The title shares its line with the event count badge; meta lines run full width
      const titleChars = charsForWidth(objectTextWidth(), 13);
      const metaChars = charsForWidth(stickyWidth - 28, 11);

      const card = document.createElement("div");
      card.className = "left-object-card";
      card.style.top = `${yTop - axisHeight}px`;
      card.style.height = `${Math.max(0, yBottom - yTop)}px`;

      const innerCard = document.createElement("div");
      innerCard.className = "left-object-card-inner";
      innerCard.style.height = `${Math.max(0, yBottom - yTop)}px`;

      const objectIdEl = document.createElement("div");
      objectIdEl.className = "left-object-id";
      objectIdEl.textContent = truncateText(`Object ${object.objectId}`, titleChars);
      objectIdEl.addEventListener("click", () => {
        enterObjectDetailMode(object.objectId);
      });

      innerCard.appendChild(objectIdEl);

      if (showObjectMeta(yTop, yBottom)) {
        const institutionEl = document.createElement("div");
        institutionEl.className = "left-object-meta";
        institutionEl.textContent = truncateText(object.institution, metaChars);
        innerCard.appendChild(institutionEl);

        const edoEl = document.createElement("div");
        edoEl.className = "left-object-meta";
        edoEl.textContent = truncateText(object.edoDesignations, metaChars);
        innerCard.appendChild(edoEl);
      }

      const badgeEl = document.createElement("div");
      badgeEl.className = "left-object-badge";
      // Spell out what the number counts: all known events of the object
      const eventsLabel = `${object.eventCount} ${object.eventCount === 1 ? "event" : "events"}`;
      badgeEl.textContent = eventsLabel;
      badgeEl.title = `${object.eventCount} known ${object.eventCount === 1 ? "event" : "events"} for this object`;
      innerCard.appendChild(badgeEl);

      card.appendChild(innerCard);
      inner.appendChild(card);

      rowsLayer.append("line")
        .attr("class", "row-separator")
        .attr("x1", stickyWidth)
        .attr("x2", width)
        .attr("y1", yBottom)
        .attr("y2", yBottom);
    });
  }

  axisLayer.raise();
  updateFiltersResultsSummary();
  updateObjectDetailToolbar();
  updateToolbarResultsSummary();
  updateZoomControls();
}

function zoomAround(pointerX, deltaY) {
  const zoomFactor = Math.exp(-deltaY * 0.0025);
  const nextScale = clamp(state.scale * zoomFactor, minAllowedScale(), maxAllowedScale());
  const yearAtPointer = baseScale.invert((pointerX - state.offsetX) / state.scale);
  state.scale = nextScale;
  state.offsetX = pointerX - baseScale(yearAtPointer) * state.scale;
  clampOffsetX();
  /* render(); */
}

svg.on("wheel", (event) => {
  event.preventDefault();
  const [pointerX] = d3.pointer(event, svg.node());

  if (event.ctrlKey) {
    const [, pointerY] = d3.pointer(event, svg.node());
    const pointerOffsetY = pointerY - axisHeight;

    const rowsBeforeZoom = currentVisibleRows();
    const contentHeightBefore = contentHeightFromRows(rowsBeforeZoom);

    const verticalAnchorRatio =
      contentHeightBefore > 0
        ? (state.scrollY + pointerOffsetY) / contentHeightBefore
        : 0;

    zoomAround(pointerX, event.deltaY);
    syncEventHeightForSemanticZoom(event.clientY);

    const rowsAfterZoom = currentVisibleRows();
    const contentHeightAfter = contentHeightFromRows(rowsAfterZoom);

    state.scrollY = verticalAnchorRatio * contentHeightAfter - pointerOffsetY;

    clampScrollY(resizeOverscrollMargin());
    render();
    return;
  }

  // Alt + scroll changes the row height (some systems deliver it as deltaX)
  if (event.altKey) {
    const [, pointerY] = d3.pointer(event, svg.node());
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    setRowScaleY(state.eventScaleY - delta * 0.003, pointerY - axisHeight);
    return;
  }

  // Shift + scroll moves through time; macOS already turns it into deltaX
  if (event.shiftKey) {
    state.offsetX -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    clampOffsetX();
    render();
    return;
  }

  const absX = Math.abs(event.deltaX);
  const absY = Math.abs(event.deltaY);

  if (absX > 0.5 || absY > 0.5) {
    state.offsetX -= event.deltaX;
    if (absY > absX) {
      state.scrollY += event.deltaY;
    } else {
      state.offsetX -= event.deltaY;
    }
  }

  clampOffsetX();
  clampScrollY();
  render();
}, { passive: false });

svg.on("pointerdown", (event) => {
  hideTooltip();
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    offsetX: state.offsetX,
    scrollY: state.scrollY,
    eventScaleY: state.eventScaleY,
    /* pointerCanvasY: d3.pointer(event, svg.node())[1], */
    resizeMode: event.altKey
  };
  svg.node().setPointerCapture(event.pointerId);
});

svg.on("pointermove", (event) => {
  if (!dragState) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  const resizeActive = dragState.resizeMode || event.altKey;
  if (resizeActive) {
    if (isOverviewZoomLevel()) {
      return;
    }

    const [, currentPointerY] = d3.pointer(event, svg.node());
    const pointerOffsetY = currentPointerY - axisHeight;

    const anchorRatio = verticalAnchorRatio(
      state.scrollY,
      pointerOffsetY,
      state.eventScaleY
    );

    state.eventScaleY = clamp(
      state.eventScaleY - dy * 0.008,
      minEventScaleY,
      maxEventScaleY
    );

    storedDetailEventScaleY = state.eventScaleY;

    state.scrollY = scrollYFromAnchorRatio(
      anchorRatio,
      pointerOffsetY,
      state.eventScaleY
    );

    dragState.startY = event.clientY;

    clampScrollY(resizeOverscrollMargin());
    render();
    return;
  }

  state.offsetX = dragState.offsetX + dx;
  state.scrollY = dragState.scrollY - dy;
  clampOffsetX();
  clampScrollY();
  render();
});

function endDrag(event) {
  if (!dragState) return;
  dragState = null;
  clampScrollY();
  render();
  if (event && svg.node().hasPointerCapture(event.pointerId)) {
    svg.node().releasePointerCapture(event.pointerId);
  }
}

svg.on("pointerup", endDrag);
svg.on("pointercancel", endDrag);
svg.on("pointerleave", endDrag);

function handleTimelineResize() {
  width = wrap.clientWidth;
  height = wrap.clientHeight;
  render();
}

window.addEventListener("resize", handleTimelineResize);

// The toolbar changes height when the filter bar opens or closes
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    if (wrap.clientWidth !== width || wrap.clientHeight !== height) handleTimelineResize();
  }).observe(wrap);
}

loadCSV();
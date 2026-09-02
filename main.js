/**
 * Matter Logic
 *
 * Two logic structures built on top of the vanilla signal network:
 *
 *   - Matter Scanner      counts every element type inside its 4x4 zone.
 *   - Condition Combinator sums the tallies of every scanner wired into it,
 *                         evaluates a list of "<element> <operator> <value>"
 *                         conditions joined by ALL/ANY, and emits a plain
 *                         on/off signal that every vanilla receiver (gate,
 *                         lamp, AND gate, ...) accepts.
 *
 * Wiring uses the vanilla Signal Linker: link a scanner (sender) into a
 * combinator (receiver). The wire itself only carries a boolean, so the tallies
 * do not travel on it - the combinator reads the signal module's own link table
 * to find which scanners feed it, then reads their tallies directly. Several
 * scanners wired into one combinator add up, the way several wires feeding one
 * Factorio network do.
 */

const api = sandkit.api;
const React = sandkit.react;

const MOD_ID = "kardagan.matter-logic";
const SCANNER_ID = "matterScanner";
const COMBINATOR_ID = "conditionCombinator";

/** Scanners snap to, and read, the 4x4 block they sit on - like vanilla sensors. */
const ZONE_CELLS = 4;
const ZONE_AREA = ZONE_CELLS * ZONE_CELLS;
const MAX_CONDITIONS = 8;
const DEFAULT_INTERVAL_MS = 250;

const OPERATORS = [
  { id: "eq", symbol: "=" },
  { id: "ne", symbol: "≠" },
  { id: "gt", symbol: ">" },
  { id: "ge", symbol: "≥" },
  { id: "lt", symbol: "<" },
  { id: "le", symbol: "≤" },
];

const cellKey = (x, y) => x + "," + y;

/** Swallows API drift: an optional call missing on an older build must not kill the mod. */
function attempt(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return fallback;
  }
}

/**
 * The vanilla internals pass a context as first argument while the stable mod
 * API drops it. Reading the callback's last argument works under both.
 */
const lastArg = (args) => args[args.length - 1];

function readConfig(key, fallback) {
  const value = attempt(() => api.settings.get(key));
  return value === undefined || value === null ? fallback : value;
}

// ---------------------------------------------------------------- translations

const TRANSLATIONS = {
  en: {
    "structures|matterScanner|name": "Matter Scanner",
    "structures|matterScanner|description":
      "Counts every element in its 4 × 4 zone. Wire it into a Condition Combinator to feed it those counts. Emits a signal while the zone holds anything.",
    "structures|conditionCombinator|name": "Condition Combinator",
    "structures|conditionCombinator|description":
      "Emits a signal when the summed tallies of the scanners wired into it satisfy every (or any) of its conditions.",
    "mods|matterLogic|readings": "Readings",
    "mods|matterLogic|empty": "Zone empty",
    "mods|matterLogic|conditions": "Conditions",
    "mods|matterLogic|noConditions": "No condition yet - the output stays off.",
    "mods|matterLogic|addCondition": "Add condition",
    "mods|matterLogic|full": "Condition limit reached ({max}).",
    "mods|matterLogic|modeAll": "ALL",
    "mods|matterLogic|modeAny": "ANY",
    "mods|matterLogic|modeHint": "Join conditions with",
    "mods|matterLogic|output": "Output",
    "mods|matterLogic|on": "ON",
    "mods|matterLogic|off": "OFF",
    "mods|matterLogic|close": "Close",
    "mods|matterLogic|remove": "Remove",
    "mods|matterLogic|element": "Element",
    "mods|matterLogic|linkHint": "Wire the output with the Signal Linker.",
    "mods|matterLogic|scannerLinkHint":
      "Wire this scanner into a combinator with the Signal Linker.",
    "mods|matterLogic|wiredScanners": "Wired scanners",
    "mods|matterLogic|wiredTo": "Wired into",
    "mods|matterLogic|search": "Search elements...",
    "mods|matterLogic|tabAll": "All",
    "mods|matterLogic|back": "Back",
    "mods|matterLogic|noScanners":
      "No scanner wired in - link one with the Signal Linker (scanner first, then this combinator).",
    "mods|matterLogic|config|scanInterval": "Scan interval (ms, takes effect on restart)",
    "mods|matterLogic|config|scanIntervalDescription":
      "How often scanners re-count their zone and combinators re-evaluate.",
    "mods|matterLogic|config|showReadings": "Show live readings in the panel",
  },
  fr: {
    "structures|matterScanner|name": "Analyseur de matière",
    "structures|matterScanner|description":
      "Compte chaque élément de sa zone de 4 × 4. Reliez-le à un combinateur de conditions pour lui transmettre ces comptes. Émet un signal tant que la zone contient quelque chose.",
    "structures|conditionCombinator|name": "Combinateur de conditions",
    "structures|conditionCombinator|description":
      "Émet un signal quand la somme des relevés des analyseurs qui lui sont reliés satisfait toutes (ou l'une) de ses conditions.",
    "mods|matterLogic|readings": "Relevés",
    "mods|matterLogic|empty": "Zone vide",
    "mods|matterLogic|conditions": "Conditions",
    "mods|matterLogic|noConditions": "Aucune condition - la sortie reste éteinte.",
    "mods|matterLogic|addCondition": "Ajouter une condition",
    "mods|matterLogic|full": "Limite de conditions atteinte ({max}).",
    "mods|matterLogic|modeAll": "TOUTES",
    "mods|matterLogic|modeAny": "AU MOINS UNE",
    "mods|matterLogic|modeHint": "Combiner les conditions avec",
    "mods|matterLogic|output": "Sortie",
    "mods|matterLogic|on": "ACTIF",
    "mods|matterLogic|off": "INACTIF",
    "mods|matterLogic|close": "Fermer",
    "mods|matterLogic|remove": "Supprimer",
    "mods|matterLogic|element": "Élément",
    "mods|matterLogic|linkHint": "Reliez la sortie avec le Relieur de signaux.",
    "mods|matterLogic|scannerLinkHint":
      "Reliez cet analyseur à un combinateur avec le Relieur de signaux.",
    "mods|matterLogic|wiredScanners": "Analyseurs reliés",
    "mods|matterLogic|wiredTo": "Relié à",
    "mods|matterLogic|search": "Rechercher un élément...",
    "mods|matterLogic|tabAll": "Tous",
    "mods|matterLogic|back": "Retour",
    "mods|matterLogic|noScanners":
      "Aucun analyseur relié - reliez-en un avec le Relieur de signaux (l'analyseur d'abord, puis ce combinateur).",
    "mods|matterLogic|config|scanInterval": "Intervalle de scan (ms, effectif au redémarrage)",
    "mods|matterLogic|config|scanIntervalDescription":
      "Fréquence à laquelle les analyseurs recomptent leur zone et les combinateurs se réévaluent.",
    "mods|matterLogic|config|showReadings": "Afficher les relevés en direct dans le panneau",
  },
};

function registerTranslations() {
  Object.keys(TRANSLATIONS).forEach((locale) => {
    attempt(() => api.i18n.register(locale, TRANSLATIONS[locale]));
  });
}

const t = (key, params) => attempt(() => api.i18n.t(key, params), key);

// ------------------------------------------------------------------- elements

let elementOptionsCache = null;
const elementTypeById = new Map();
const elementOptionById = new Map();

/**
 * Matter types per tab, copied from the vanilla Advanced Filter so the tabs sort
 * elements identically. Note Wisp counts as solid there, and Static/Particle
 * belong to no tab at all.
 */
const MATTER_GROUPS = {
  solid: [1, 8, 7, 6], // Solid, Powder, Wisp, Slushy
  liquid: [2],         // Liquid
  gas: [4],            // Gas
};

function matterGroupOf(matterType) {
  if (MATTER_GROUPS.liquid.indexOf(matterType) >= 0) return "liquid";
  if (MATTER_GROUPS.gas.indexOf(matterType) >= 0) return "gas";
  if (MATTER_GROUPS.solid.indexOf(matterType) >= 0) return "solid";
  return "other";
}

/**
 * Element types the player has already discovered. The vanilla filter and vacuum
 * pickers both list only these, which is why they show far fewer entries than
 * the raw element registry. There is no stable getter for it, so this reads the
 * engine state directly and returns null when unavailable - in which case the
 * picker falls back to showing everything rather than showing nothing.
 */
function getDiscoveredTypes() {
  const state = attempt(() => sandkit.engine && sandkit.engine.state) || attempt(() => sandkit.state);
  const discovered = state && state.store && state.store.discoveries;
  const list = discovered && discovered.elements;
  return Array.isArray(list) ? new Set(list) : null;
}

/** metaColor is packed as a plain 0xRRGGBB integer. */
function metaColorToCss(metaColor) {
  if (typeof metaColor !== "number" || !Number.isFinite(metaColor)) return "#64748b";
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(metaColor)));
  return "#" + clamped.toString(16).padStart(6, "0");
}

function elementLabel(type, id) {
  const direct = attempt(() => api.elements.getNameByType(type));
  if (direct) return direct;
  const definition = attempt(() => api.elements.getDefinitionByType(type));
  const name = definition && attempt(() => api.i18n.getName(definition));
  return name || id;
}

/**
 * The element roster. getRegisteredTypes covers modded elements too, so it wins
 * over the static enum; the enum stays as a fallback. Sorted by display name so
 * the picker reads the way the player sees the world, not the way it is indexed.
 */
function getElementOptions() {
  if (elementOptionsCache) return elementOptionsCache;

  let types = attempt(() => api.elements.getRegisteredTypes());
  if (!Array.isArray(types) || types.length === 0) {
    const enumTypes = (sandkit.enums && sandkit.enums.ElementType) || {};
    types = Object.keys(enumTypes)
      // TypeScript numeric enums carry reverse mappings; keep the named half only.
      .filter((key) => Number.isNaN(Number(key)))
      .map((key) => enumTypes[key]);
  }

  const options = [];
  const seen = new Set();

  types.forEach((type) => {
    if (typeof type !== "number" || type <= 0 || seen.has(type)) return;
    const id = attempt(() => api.elements.getIdByType(type));
    if (!id) return;
    const definition = attempt(() => api.elements.getDefinitionByType(type)) || {};
    // Internal entries such as the generic particle carry no name of their own.
    if (!definition.nameKey && !definition.name) return;
    seen.add(type);
    elementTypeById.set(id, type);
    const option = {
      id,
      type,
      label: elementLabel(type, id),
      color: metaColorToCss(definition.metaColor),
      group: matterGroupOf(definition.matterType),
    };
    elementOptionById.set(id, option);
    options.push(option);
  });

  options.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  elementOptionsCache = options;
  return options;
}

function getElementOption(elementId) {
  if (!elementOptionById.size) getElementOptions();
  return elementOptionById.get(elementId) || null;
}

/**
 * What the picker offers: discovered elements, plus whatever is already in play
 * (the condition's current element, and anything the wired scanners can see) so
 * a reading can never be impossible to write a condition for.
 */
function getPickerOptions(alwaysInclude) {
  const options = getElementOptions();
  const discovered = getDiscoveredTypes();
  if (!discovered) return options;
  const extra = alwaysInclude instanceof Set ? alwaysInclude : new Set();
  return options.filter((option) => discovered.has(option.type) || extra.has(option.type));
}

function resolveElementType(elementId) {
  if (elementTypeById.has(elementId)) return elementTypeById.get(elementId);
  const type = attempt(() => api.elements.getTypeById(elementId));
  if (typeof type === "number") elementTypeById.set(elementId, type);
  return type;
}

// ---------------------------------------------------------------- wire network

/** Latest per-scanner tally, keyed by cell: Map<"x,y", Map<elementType, count>>. */
const scannerReadings = new Map();

let incomingCache = null;
let incomingCacheTick = -1;

/**
 * Inverts the signal module's own link table into receiver -> sender cells.
 *
 * The module stores links as { "senderX,senderY": [{x, y, on}, ...] }, where the
 * entries are the receivers. That table is the same one the Signal Linker writes
 * and the vanilla sensors read back on load, so it stays correct across saves,
 * moves and demolitions without us tracking anything ourselves.
 */
function getIncomingByReceiver() {
  const tick = attempt(() => api.time.getTick(), null);
  if (incomingCache && tick !== null && tick === incomingCacheTick) return incomingCache;

  const incoming = new Map();
  const state = attempt(() => api.storage.ensure("signals"));
  const links = state && state.links;

  if (links) {
    Object.keys(links).forEach((senderKey) => {
      const receivers = links[senderKey];
      if (!receivers || !receivers.length) return;
      const comma = senderKey.indexOf(",");
      if (comma < 0) return;
      const sender = { x: Number(senderKey.slice(0, comma)), y: Number(senderKey.slice(comma + 1)) };
      if (!Number.isFinite(sender.x) || !Number.isFinite(sender.y)) return;

      for (let i = 0; i < receivers.length; i++) {
        const receiver = receivers[i];
        if (!receiver) continue;
        const key = cellKey(receiver.x, receiver.y);
        const senders = incoming.get(key);
        if (senders) senders.push(sender);
        else incoming.set(key, [sender]);
      }
    });
  }

  incomingCache = incoming;
  incomingCacheTick = tick;
  return incoming;
}

/** The scanner cells wired into this structure, in link order. */
function getWiredScanners(structure) {
  const senders = getIncomingByReceiver().get(cellKey(structure.x, structure.y));
  if (!senders) return [];
  return senders.filter((sender) =>
    attempt(() => api.structures.isTypeAtCell(sender.x, sender.y, SCANNER_ID), false),
  );
}

/** The combinator cells this scanner is wired into, for the scanner's panel. */
function getWiredCombinators(scanner) {
  const state = attempt(() => api.storage.ensure("signals"));
  const links = state && state.links;
  const receivers = links && links[cellKey(scanner.x, scanner.y)];
  if (!receivers || !receivers.length) return [];
  return receivers.filter((receiver) =>
    attempt(() => api.structures.isTypeAtCell(receiver.x, receiver.y, COMBINATOR_ID), false),
  );
}

/** Sums the tallies of every scanner wired into this structure. */
function getWiredTotals(structure) {
  const totals = new Map();
  getWiredScanners(structure).forEach((sender) => {
    const readings = scannerReadings.get(cellKey(sender.x, sender.y));
    if (!readings) return;
    readings.forEach((count, type) => totals.set(type, (totals.get(type) || 0) + count));
  });
  return totals;
}

function countOf(totals, elementId) {
  const type = resolveElementType(elementId);
  return typeof type === "number" ? totals.get(type) || 0 : 0;
}

// ---------------------------------------------------------------- structure data

function ensureData(structure) {
  if (!structure.data) structure.data = {};
  return structure.data;
}

function initScannerData(structure) {
  const data = ensureData(structure);
  if (typeof data.active !== "boolean") data.active = false;
  attempt(() => api.structures.setSpritesheetIndexAtCell(structure.x, structure.y, data.active ? 1 : 0));
}

function initCombinatorData(structure) {
  const data = ensureData(structure);
  if (!Array.isArray(data.conditions)) data.conditions = [];
  if (data.mode !== "all" && data.mode !== "any") data.mode = "all";
  if (typeof data.output !== "boolean") data.output = false;
  attempt(() => api.structures.setSpritesheetIndexAtCell(structure.x, structure.y, data.output ? 1 : 0));
}

/** Persists a structure edit and refreshes anything watching it. */
function commitData(structure) {
  attempt(() => api.structures.updateData(structure, structure.data));
  notifyPanel();
}

// ---------------------------------------------------------------------- scanning

function setScannerActive(structure, active) {
  const data = ensureData(structure);
  if (data.active === active) return;
  data.active = active;
  attempt(() => api.structures.setSpritesheetIndexAtCell(structure.x, structure.y, active ? 1 : 0));
  attempt(() => api.signals.setOutputAtCell(structure.x, structure.y, active));
}

function scanZone(structure, context) {
  const readings = new Map();
  let filled = 0;

  for (let dy = 0; dy < ZONE_CELLS; dy++) {
    for (let dx = 0; dx < ZONE_CELLS; dx++) {
      const type = context.getResolvedTypeAtCell(structure.x + dx, structure.y + dy);
      if (type === null || type === undefined || type === 0) continue;
      readings.set(type, (readings.get(type) || 0) + 1);
      filled++;
    }
  }

  scannerReadings.set(cellKey(structure.x, structure.y), readings);
  setScannerActive(structure, filled > 0);
}

// -------------------------------------------------------------------- combinator

function compare(count, operatorId, value) {
  switch (operatorId) {
    case "eq":
      return count === value;
    case "ne":
      return count !== value;
    case "gt":
      return count > value;
    case "ge":
      return count >= value;
    case "lt":
      return count < value;
    case "le":
      return count <= value;
    default:
      return false;
  }
}

function testCondition(condition, totals) {
  if (!condition || !condition.element) return false;
  return compare(countOf(totals, condition.element), condition.operator, condition.value);
}

function evaluateCombinator(structure) {
  const data = ensureData(structure);
  const conditions = Array.isArray(data.conditions) ? data.conditions : [];
  // An unconfigured combinator stays quiet rather than defaulting to "true".
  if (conditions.length === 0) return false;
  const totals = getWiredTotals(structure);
  const test = (condition) => testCondition(condition, totals);
  return data.mode === "any" ? conditions.some(test) : conditions.every(test);
}

function applyCombinatorOutput(structure) {
  const data = ensureData(structure);
  const output = evaluateCombinator(structure);
  if (data.output === output) return;
  data.output = output;
  attempt(() => api.structures.setSpritesheetIndexAtCell(structure.x, structure.y, output ? 1 : 0));
  attempt(() => api.signals.setOutputAtCell(structure.x, structure.y, output));
  notifyPanel();
}

// --------------------------------------------------------------------- ui store

/** Which structure the config panel is showing, if any. */
let panelTarget = null;
const panelListeners = new Set();

function notifyPanel() {
  panelListeners.forEach((listener) => attempt(listener));
}

function openPanel(kind, structure) {
  panelTarget =
    panelTarget && panelTarget.x === structure.x && panelTarget.y === structure.y
      ? null // interacting with the open structure again closes the panel
      : { kind, x: structure.x, y: structure.y };
  notifyPanel();
}

function closePanel() {
  panelTarget = null;
  notifyPanel();
}

function usePanelTarget() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const listener = () => force((n) => n + 1);
    panelListeners.add(listener);
    return () => panelListeners.delete(listener);
  }, []);
  return panelTarget;
}

/** Re-renders on a timer so live readings tick along with the scan loop. */
function useLiveRefresh(active, intervalMs) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    if (!active) return undefined;
    const handle = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(handle);
  }, [active, intervalMs]);
}

// ------------------------------------------------------------------ ui elements

const h = (...args) => React.createElement(...args);

/**
 * The game ships a purged Tailwind build, so only the classes it uses itself
 * survive into its CSS - anything else silently renders as nothing (which is how
 * this panel first shipped with a transparent background). Everything here is
 * therefore styled inline.
 */
const COLORS = {
  panel: "rgba(15, 23, 42, 0.96)",
  border: "#475569",
  field: "#0b1220",
  text: "#e2e8f0",
  muted: "#94a3b8",
  faint: "#64748b",
  value: "#67e8f9",
  on: "#a3e635",
  warn: "#fbbf24",
  danger: "#fca5a5",
  button: "#334155",
};

const FIELD_STYLE = {
  background: COLORS.field,
  border: "1px solid " + COLORS.border,
  borderRadius: "3px",
  color: COLORS.text,
  fontSize: "12px",
  padding: "2px 4px",
};

const BUTTON_STYLE = {
  background: COLORS.button,
  border: "1px solid " + COLORS.border,
  borderRadius: "3px",
  color: COLORS.text,
  cursor: "pointer",
  fontSize: "12px",
  padding: "2px 8px",
};

const ROW_STYLE = { alignItems: "center", display: "flex", gap: "6px" };

function Select({ value, onChange, options, style, title }) {
  return h(
    "select",
    {
      value,
      title,
      style: Object.assign({}, FIELD_STYLE, style),
      onChange: (event) => onChange(event.target.value),
      onMouseDown: (event) => event.stopPropagation(),
    },
    options.map((option) => h("option", { key: option.value, value: option.value }, option.label)),
  );
}

function StatusPill({ on }) {
  return h(
    "span",
    {
      style: {
        background: on ? COLORS.on : "#1e293b",
        borderRadius: "3px",
        color: on ? "#0b1220" : COLORS.muted,
        fontSize: "10px",
        fontWeight: "bold",
        padding: "1px 6px",
      },
    },
    on ? t("mods|matterLogic|on") : t("mods|matterLogic|off"),
  );
}

function PanelFrame({ title, subtitle, onClose, children }) {
  return h(
    "div",
    {
      style: {
        background: COLORS.panel,
        border: "1px solid " + COLORS.border,
        borderRadius: "4px",
        color: COLORS.text,
        fontSize: "12px",
        maxHeight: "45vh",
        maxWidth: "600px",
        minWidth: "460px",
        overflowY: "auto",
        padding: "8px",
      },
      onMouseDown: (event) => event.stopPropagation(),
    },
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginBottom: "6px" }) },
      h("span", { style: { fontWeight: "bold" } }, title),
      subtitle ? h("span", { style: { color: COLORS.faint } }, subtitle) : null,
      h(
        "button",
        { style: Object.assign({}, BUTTON_STYLE, { marginLeft: "auto" }), onClick: onClose },
        t("mods|matterLogic|close"),
      ),
    ),
    children,
  );
}

// ------------------------------------------------------------- scanner panel

function ScannerPanel({ structure }) {
  useLiveRefresh(readConfig("showZoneOverlay", true), DEFAULT_INTERVAL_MS);

  const readings = scannerReadings.get(cellKey(structure.x, structure.y));
  const rows = [];
  if (readings) {
    readings.forEach((count, type) => {
      const id = attempt(() => api.elements.getIdByType(type), String(type));
      rows.push({ id, label: elementLabel(type, id), count });
    });
    rows.sort((a, b) => b.count - a.count);
  }

  const targets = getWiredCombinators(structure);

  return h(
    PanelFrame,
    {
      title: t("structures|matterScanner|name"),
      subtitle: structure.x + ", " + structure.y,
      onClose: closePanel,
    },
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginBottom: "6px" }) },
      h("span", { style: { color: COLORS.muted } }, t("mods|matterLogic|output")),
      h(StatusPill, { on: !!(structure.data && structure.data.active) }),
      h(
        "span",
        { style: { color: targets.length ? COLORS.on : COLORS.warn, marginLeft: "auto" } },
        targets.length
          ? t("mods|matterLogic|wiredTo") +
              " " +
              targets.map((cell) => cell.x + "," + cell.y).join("  ")
          : t("mods|matterLogic|scannerLinkHint"),
      ),
    ),
    h("div", { style: { color: COLORS.muted, marginBottom: "3px" } }, t("mods|matterLogic|readings")),
    rows.length === 0
      ? h("div", { style: { color: COLORS.faint, fontStyle: "italic" } }, t("mods|matterLogic|empty"))
      : h(
          "div",
          { style: { columnGap: "18px", display: "grid", gridTemplateColumns: "1fr 1fr" } },
          rows.map((row) =>
            h(
              "div",
              { key: row.id, style: { display: "flex", gap: "8px", justifyContent: "space-between" } },
              h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, row.label),
              h(
                "span",
                { style: { color: COLORS.value, fontFamily: "monospace" } },
                row.count + " / " + ZONE_AREA,
              ),
            ),
          ),
        ),
  );
}

// ------------------------------------------------------------- element picker

function ColorSwatch({ color, size }) {
  const side = size || 12;
  return h("span", {
    style: {
      background: color || "#64748b",
      border: "1px solid rgba(0, 0, 0, 0.6)",
      display: "inline-block",
      flex: "0 0 auto",
      height: side + "px",
      width: side + "px",
    },
  });
}

const PICKER_TABS = [
  { id: "all", labelKey: "mods|matterLogic|tabAll" },
  { id: "solid", labelKey: "ui|filter|tab|solid" },
  { id: "liquid", labelKey: "ui|filter|tab|liquid" },
  { id: "gas", labelKey: "ui|filter|tab|gas" },
];

function TabButton({ active, label, onClick }) {
  return h(
    "button",
    {
      style: Object.assign({}, BUTTON_STYLE, {
        background: active ? "#1e293b" : COLORS.button,
        borderColor: active ? COLORS.warn : COLORS.border,
        color: active ? COLORS.warn : COLORS.text,
      }),
      onClick,
    },
    label,
  );
}

/** Full-panel element chooser, modelled on the vanilla Advanced Filter. */
function ElementPicker({ selected, onPick, onCancel, options }) {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const needle = search.trim().toLowerCase();
  const visible = options.filter((option) => {
    if (tab !== "all" && option.group !== tab) return false;
    if (!needle) return true;
    return option.label.toLowerCase().indexOf(needle) >= 0 || option.id.toLowerCase().indexOf(needle) >= 0;
  });

  return h(
    "div",
    null,
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginBottom: "6px" }) },
      PICKER_TABS.map((entry) =>
        h(TabButton, {
          key: entry.id,
          active: tab === entry.id,
          label: t(entry.labelKey),
          onClick: () => setTab(entry.id),
        }),
      ),
      h("input", {
        type: "text",
        value: search,
        placeholder: t("mods|matterLogic|search"),
        style: Object.assign({}, FIELD_STYLE, { flex: "1 1 auto", marginLeft: "auto", minWidth: "120px" }),
        autoFocus: true,
        onMouseDown: (event) => event.stopPropagation(),
        onChange: (event) => setSearch(event.target.value),
      }),
    ),
    visible.length === 0
      ? h(
          "div",
          { style: { color: COLORS.faint, fontStyle: "italic", padding: "8px 0" } },
          t("ui|filter|noElementsAvailable"),
        )
      : h(
          "div",
          {
            style: {
              display: "grid",
              gap: "4px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              maxHeight: "26vh",
              overflowY: "auto",
            },
          },
          visible.map((option) =>
            h(
              "button",
              {
                key: option.id,
                title: option.id,
                style: Object.assign({}, BUTTON_STYLE, {
                  alignItems: "center",
                  borderColor: option.id === selected ? COLORS.on : COLORS.border,
                  display: "flex",
                  gap: "6px",
                  overflow: "hidden",
                  textAlign: "left",
                }),
                onClick: () => onPick(option.id),
              },
              h(ColorSwatch, { color: option.color }),
              h(
                "span",
                { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                option.label,
              ),
            ),
          ),
        ),
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginTop: "6px" }) },
      h("button", { style: BUTTON_STYLE, onClick: onCancel }, t("mods|matterLogic|back")),
      h(
        "span",
        { style: { color: COLORS.faint, marginLeft: "auto" } },
        visible.length + " / " + options.length,
      ),
    ),
  );
}

// ---------------------------------------------------------- combinator panel

function ConditionRow({ structure, condition, index, totals, onPickElement }) {
  const update = (patch) => {
    Object.assign(condition, patch);
    commitData(structure);
    applyCombinatorOutput(structure);
  };

  const option = condition.element ? getElementOption(condition.element) : null;
  const count = condition.element ? countOf(totals, condition.element) : 0;
  const satisfied = testCondition(condition, totals);

  return h(
    "div",
    { style: Object.assign({}, ROW_STYLE, { marginBottom: "4px" }) },
    h(
      "button",
      {
        style: Object.assign({}, BUTTON_STYLE, {
          alignItems: "center",
          display: "flex",
          flex: "1 1 auto",
          gap: "6px",
          minWidth: 0,
          overflow: "hidden",
          textAlign: "left",
        }),
        title: t("mods|matterLogic|element"),
        onClick: onPickElement,
      },
      h(ColorSwatch, { color: option ? option.color : null }),
      h(
        "span",
        { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
        option ? option.label : "—",
      ),
    ),
    h(Select, {
      value: condition.operator,
      onChange: (operator) => update({ operator }),
      options: OPERATORS.map((operator) => ({ value: operator.id, label: operator.symbol })),
      style: { width: "56px" },
    }),
    h("input", {
      type: "number",
      min: 0,
      max: ZONE_AREA * 64,
      value: condition.value,
      style: Object.assign({}, FIELD_STYLE, { width: "64px" }),
      onMouseDown: (event) => event.stopPropagation(),
      onChange: (event) => {
        const parsed = parseInt(event.target.value, 10);
        update({ value: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
      },
    }),
    h(
      "span",
      {
        style: {
          color: satisfied ? COLORS.on : COLORS.muted,
          fontFamily: "monospace",
          textAlign: "right",
          width: "48px",
        },
        title: t("mods|matterLogic|readings"),
      },
      String(count),
    ),
    h(
      "button",
      {
        style: Object.assign({}, BUTTON_STYLE, { color: COLORS.danger }),
        title: t("mods|matterLogic|remove"),
        onClick: () => {
          structure.data.conditions.splice(index, 1);
          commitData(structure);
          applyCombinatorOutput(structure);
        },
      },
      "×",
    ),
  );
}

/** Discovered elements, plus this condition's own pick and anything measured. */
function pickerOptions(structure, condition, totals) {
  const extra = new Set(totals.keys());
  const current = condition && condition.element ? resolveElementType(condition.element) : null;
  if (typeof current === "number") extra.add(current);
  return getPickerOptions(extra);
}

function CombinatorPanel({ structure }) {
  useLiveRefresh(true, DEFAULT_INTERVAL_MS);
  const [pickerIndex, setPickerIndex] = React.useState(-1);
  const elementOptions = getPickerOptions();
  const data = ensureData(structure);
  const conditions = data.conditions || [];
  const wiredCount = getWiredScanners(structure).length;
  const totals = getWiredTotals(structure);

  const addCondition = () => {
    if (conditions.length >= MAX_CONDITIONS) {
      attempt(() => api.ui.toast({ key: "mods|matterLogic|full", params: { max: MAX_CONDITIONS } }));
      return;
    }
    conditions.push({
      element: elementOptions.length ? elementOptions[0].id : "",
      operator: "ge",
      value: 1,
    });
    commitData(structure);
    applyCombinatorOutput(structure);
  };

  // A stale index (its condition was deleted) simply falls back to the list view.
  const editing = pickerIndex >= 0 && pickerIndex < conditions.length ? conditions[pickerIndex] : null;

  if (editing) {
    return h(
      PanelFrame,
      {
        title: t("structures|conditionCombinator|name"),
        subtitle: t("mods|matterLogic|element"),
        onClose: closePanel,
      },
      h(ElementPicker, {
        options: pickerOptions(structure, editing, totals),
        selected: editing.element,
        onPick: (element) => {
          editing.element = element;
          commitData(structure);
          applyCombinatorOutput(structure);
          setPickerIndex(-1);
        },
        onCancel: () => setPickerIndex(-1),
      }),
    );
  }

  return h(
    PanelFrame,
    {
      title: t("structures|conditionCombinator|name"),
      subtitle: structure.x + ", " + structure.y,
      onClose: closePanel,
    },
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginBottom: "6px" }) },
      h("span", { style: { color: COLORS.muted } }, t("mods|matterLogic|modeHint")),
      h(Select, {
        value: data.mode,
        onChange: (mode) => {
          data.mode = mode;
          commitData(structure);
          applyCombinatorOutput(structure);
        },
        options: [
          { value: "all", label: t("mods|matterLogic|modeAll") },
          { value: "any", label: t("mods|matterLogic|modeAny") },
        ],
        style: { width: "132px" },
      }),
      h(
        "span",
        { style: { color: wiredCount ? COLORS.muted : COLORS.warn } },
        t("mods|matterLogic|wiredScanners") + " " + wiredCount,
      ),
      h("span", { style: { color: COLORS.muted, marginLeft: "auto" } }, t("mods|matterLogic|output")),
      h(StatusPill, { on: !!data.output }),
    ),
    wiredCount === 0
      ? h("div", { style: { color: COLORS.warn, marginBottom: "6px" } }, t("mods|matterLogic|noScanners"))
      : null,
    conditions.length === 0
      ? h(
          "div",
          { style: { color: COLORS.faint, fontStyle: "italic", marginBottom: "6px" } },
          t("mods|matterLogic|noConditions"),
        )
      : conditions.map((condition, index) =>
          h(ConditionRow, {
            key: index,
            structure,
            condition,
            index,
            totals,
            onPickElement: () => setPickerIndex(index),
          }),
        ),
    h(
      "div",
      { style: Object.assign({}, ROW_STYLE, { marginTop: "4px" }) },
      h(
        "button",
        {
          style: Object.assign({}, BUTTON_STYLE, {
            opacity: conditions.length >= MAX_CONDITIONS ? 0.5 : 1,
          }),
          disabled: conditions.length >= MAX_CONDITIONS,
          onClick: addCondition,
        },
        "+ " + t("mods|matterLogic|addCondition"),
      ),
      h(
        "span",
        { style: { color: COLORS.faint, marginLeft: "auto" } },
        t("mods|matterLogic|linkHint"),
      ),
    ),
  );
}

function ConfigPanel() {
  const target = usePanelTarget();
  const structure = target ? attempt(() => api.structures.getAtCell(target.x, target.y)) : null;
  const orphaned = !!target && !structure;

  // The structure was removed while its panel was open. Closing has to happen
  // after the render, never during it.
  React.useEffect(() => {
    if (orphaned) closePanel();
  }, [orphaned]);

  if (!target || !structure) return null;

  return target.kind === "scanner"
    ? h(ScannerPanel, { structure })
    : h(CombinatorPanel, { structure });
}

// ------------------------------------------------------------------- structures

const SCANNER_SPRITE = MOD_ID + ":matterScanner";
const COMBINATOR_SPRITE = MOD_ID + ":conditionCombinator";

async function loadSprites() {
  const load = async (spriteId, path) => {
    try {
      await api.sprites.loadFromMod(spriteId, path);
    } catch (error) {
      // A missing sprite is survivable - the structure still builds and works.
      console.warn("[" + MOD_ID + "] could not load " + path, error);
    }
  };
  await load(SCANNER_SPRITE, "assets/matterScanner.png");
  await load(COMBINATOR_SPRITE, "assets/conditionCombinator.png");
}

function registerStructures() {
  api.structures.register({
    id: SCANNER_ID,
    nameKey: "structures|matterScanner|name",
    descriptionKey: "structures|matterScanner|description",
    categoryKey: "logic",
    order: 45,
    buildModes: [
      { type: "line", directions: ["horizontal", "vertical"] },
      { type: "rectangle" },
    ],
    variants: [{ id: SCANNER_ID, angles: [-180, -90, 0, 90, 180] }],
    render: { imageName: SCANNER_SPRITE, size: { width: 16, height: 16 } },
  });

  api.structures.register({
    id: COMBINATOR_ID,
    nameKey: "structures|conditionCombinator|name",
    descriptionKey: "structures|conditionCombinator|description",
    categoryKey: "logic",
    order: 46,
    buildModes: [
      { type: "line", directions: ["horizontal", "vertical"] },
      { type: "rectangle" },
    ],
    variants: [{ id: COMBINATOR_ID, angles: [0, 90, 180, 270] }],
    render: { imageName: COMBINATOR_SPRITE, size: { width: 16, height: 16 } },
    // Solid like the vanilla logic gates: matter should not drift through it.
    shape: [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ],
  });
}

function registerUnlocks() {
  const tech = sandkit.enums && sandkit.enums.Tech && sandkit.enums.Tech.LogicGates;
  const appended =
    tech !== undefined &&
    attempt(() => {
      api.tech.conservatory.appendUnlock(tech, { structures: [SCANNER_ID, COMBINATOR_ID] });
      return true;
    }, false);

  if (appended) return;
  // Without a tech to hang them on, the structures would be unreachable forever.
  attempt(() => api.structures.updateDefinition(SCANNER_ID, { alwaysUnlocked: true }));
  attempt(() => api.structures.updateDefinition(COMBINATOR_ID, { alwaysUnlocked: true }));
}

/**
 * The signal layer matches senders against the numeric structure type, and
 * registerSenderType - unlike interactables.register - does not resolve a name
 * for you. Passing the string id would leave the Signal Linker unable to see
 * either structure as a sender, so resolve the type first.
 */
function resolveStructureType(structureId) {
  const type = attempt(() => api.structures.getTypeById(structureId));
  return typeof type === "number" ? type : structureId;
}

function registerSignals() {
  const scannerType = resolveStructureType(SCANNER_ID);
  const combinatorType = resolveStructureType(COMBINATOR_ID);

  attempt(() =>
    api.signals.registerSenderType(scannerType, (...args) => {
      const structure = lastArg(args);
      return !!(structure && structure.data && structure.data.active);
    }),
  );
  attempt(() =>
    api.signals.registerSenderType(combinatorType, (...args) => {
      const structure = lastArg(args);
      return !!(structure && structure.data && structure.data.output);
    }),
  );

  // Without a target registration the Signal Linker refuses to wire anything
  // into the combinator. The payload itself is ignored: the tallies are read
  // from the scanners, not from the boolean the wire carries.
  attempt(() => api.signals.targets.register(combinatorType, () => {}));

  attempt(() =>
    api.signals.interactables.register(scannerType, (...args) => {
      const structure = lastArg(args);
      if (structure) openPanel("scanner", structure);
    }),
  );
  attempt(() =>
    api.signals.interactables.register(combinatorType, (...args) => {
      const structure = lastArg(args);
      if (structure) openPanel("combinator", structure);
    }),
  );
}

function registerProcessors() {
  const intervalMs = Number(readConfig("scanIntervalMs", DEFAULT_INTERVAL_MS)) || DEFAULT_INTERVAL_MS;

  api.structures.processing.register(MOD_ID + ":scan", {
    structureType: SCANNER_ID,
    intervalMs,
    process: (structure, context) => scanZone(structure, context),
  });

  api.structures.processing.register(MOD_ID + ":evaluate", {
    structureType: COMBINATOR_ID,
    intervalMs,
    process: (structure) => applyCombinatorOutput(structure),
  });
}

// ----------------------------------------------------------------------- events

function initStructure(structure) {
  if (!structure) return;
  if (attempt(() => api.structures.isType(structure, SCANNER_ID), false)) {
    initScannerData(structure);
  } else if (attempt(() => api.structures.isType(structure, COMBINATOR_ID), false)) {
    initCombinatorData(structure);
  }
}

function forgetCell(x, y) {
  scannerReadings.delete(cellKey(x, y));
  incomingCache = null;
  if (panelTarget && panelTarget.x === x && panelTarget.y === y) closePanel();
}

function registerEvents() {
  api.events.on("building:placed", (payload) => {
    initStructure(payload && payload.structure);
  });

  api.events.on("building:removed", (payload) => {
    if (payload) forgetCell(payload.x, payload.y);
  });

  api.events.on("structures:placed", (payload) => {
    const structures = (payload && payload.structures) || [];
    structures.forEach(initStructure);
  });

  api.events.on("structures:removed", (payload) => {
    const structures = (payload && payload.structures) || [];
    structures.forEach((structure) => structure && forgetCell(structure.x, structure.y));
  });

  api.events.on("structures:moved", (payload) => {
    const moved = (payload && payload.moved) || [];
    moved.forEach((entry) => {
      if (!entry || !entry.from) return;
      forgetCell(entry.from.x, entry.from.y);
    });
  });

  // Re-seed defaults for anything already standing when a save is loaded.
  api.events.on("game:ready", () => {
    attempt(() => api.structures.forEachOfType(SCANNER_ID, initScannerData));
    attempt(() => api.structures.forEachOfType(COMBINATOR_ID, initCombinatorData));
  });
}

function mountUi() {
  attempt(() =>
    api.ui.regions.mount("hotbar", MOD_ID + ":panel", {
      placement: "raised",
      order: 20,
      render: () => h(ConfigPanel),
    }),
  );
}

// -------------------------------------------------------------------- bootstrap

(async () => {
  try {
    registerTranslations();
    await loadSprites();
    registerStructures();
    registerUnlocks();
    registerSignals();
    registerProcessors();
    registerEvents();
    mountUi();
  } catch (error) {
    console.error("[" + MOD_ID + "] failed to initialise", error);
  }
})();

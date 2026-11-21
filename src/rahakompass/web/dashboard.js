const categoryNames = {
  Housing: "Eluase", Groceries: "Toidukaubad", "Dining out": "Väljas söömine",
  Transport: "Transport", Shopping: "Ostud", Utilities: "Kommunaalkulud",
  Subscriptions: "Tellimused", Entertainment: "Meelelahutus", Health: "Tervis",
  Uncategorized: "Kategooriata"
};
const categoryColors = {
  Housing: "#6456b1", Groceries: "#157b64", "Dining out": "#ac542c",
  Transport: "#2d6ca6", Shopping: "#a54873", Utilities: "#8a650f",
  Subscriptions: "#625386", Entertainment: "#34776e", Health: "#947145",
  Uncategorized: "#68717f"
};
const demoDescriptions = {
  Cinema: "Kino", "Circle K · lunch": "Circle K · lõuna", "City transit": "Ühistransport",
  "City utilities": "Kommunaalarve", "Department store": "Kaubamaja",
  "Mobile and internet": "Mobiil ja internet", "Neighbourhood café": "Kodukohvik",
  Pharmacy: "Apteek", Rent: "Üür", Salary: "Töötasu", Restaurant: "Restoran", "Seasonal shopping": "Hooajalised ostud"
};
const descriptionLabel = description => demoDescriptions[description] || description;
const categoryLabel = category => categoryNames[category] || category;
const dateLabel = date => new Intl.DateTimeFormat("et-EE", {timeZone: "UTC"}).format(new Date(date));

const byId = id => document.getElementById(id);
const euro = new Intl.NumberFormat("et-EE", {style: "currency", currency: "EUR"});
const monthFormat = new Intl.DateTimeFormat("et-EE", {month: "short", year: "numeric", timeZone: "UTC"});
const money = cents => euro.format(cents / 100);
const prettyMonth = month => monthFormat.format(new Date(month + "-01T00:00:00Z"));
const pageSize = 12;
const state = {data: null, category: null, month: null, page: 0, editing: null, query: ""};

const views = {
  avaleht: "Avaleht", aruanded: "Aruanded", tehingud: "Tehingud", plaan: "Plaan", vordlus: "Võrdlus"
};
let activeView = null;

function expenseRoute(category, month) {
  const query = new URLSearchParams();
  if (category) query.set("kategooria", category);
  if (month) query.set("kuu", month);
  return "#tehingud" + (query.size ? "?" + query : "");
}

function showView(moveFocus = false) {
  const [route, query] = location.hash.slice(1).split("?");
  const view = Object.hasOwn(views, route) ? route : "avaleht";
  const changed = view !== activeView;
  activeView = view;
  document.title = views[view] + " · RahaKompass";
  for (const section of document.querySelectorAll("[data-view]")) {
    section.hidden = section.dataset.view !== view;
  }
  for (const link of document.querySelectorAll("[data-view-link]")) {
    if (link.dataset.viewLink === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (view === "tehingud") {
    const params = new URLSearchParams(query);
    state.category = params.get("kategooria");
    state.month = params.get("kuu");
    state.page = 0;
    if (state.data) renderRows();
  }
  if (moveFocus && changed) {
    const heading = byId("view-" + view).querySelector("h1");
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
    window.scrollTo(0, 0);
  }
}

function openExpenses(category = null, month = null, search = "") {
  byId("search").value = search;
  const route = expenseRoute(category, month);
  if (location.hash === route) showView();
  else location.hash = route;
}

function changeExpenseFilters(category, month) {
  history.replaceState(null, "", expenseRoute(category, month));
  showView();
}

window.addEventListener("hashchange", () => showView(true));

function recentYearStart(end) {
  const date = new Date(end + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() - 11);
  return date.toISOString().slice(0, 7);
}

function quickPeriod(kind) {
  const {first, last} = state.data;
  if (kind === "month") return [last, last];
  if (kind === "all") return [first, last];
  const yearStart = recentYearStart(last);
  return [yearStart < first ? first : yearStart, last];
}

for (const button of document.querySelectorAll("[data-period]")) {
  button.onclick = async () => {
    if (!state.data) return;
    try {
      await load(reportRange(...quickPeriod(button.dataset.period)), true);
      byId("status").textContent = "";
    } catch (error) {
      byId("status").textContent = error.message;
    }
  };
}

function renderOverview() {
  const {trend} = state.data;
  const start = trend[0].month;
  const end = trend.at(-1).month;
  byId("overview-period").textContent = displayRange(start, end);
  for (const button of document.querySelectorAll("[data-period]")) {
    const [first, last] = quickPeriod(button.dataset.period);
    button.setAttribute("aria-pressed", first === start && last === end);
  }
}

async function renderMonthlyBriefing() {
  const data = state.data;
  const month = data.trend.at(-1).month;
  const previousMonth = precedingYear(month);
  const title = byId("briefing-period");
  const message = byId("briefing-message");
  const action = byId("explain-monthly-change");
  title.textContent = prettyMonth(month);
  action.hidden = true;
  if (previousMonth < data.first) {
    message.textContent = "Eelmise aasta sama kuu andmed puuduvad.";
    return;
  }
  message.textContent = "Võrdlen eelmise aasta sama kuuga…";
  try {
    const [current, prior] = await Promise.all([
      data.trend.length === 1 ? data : requestDashboard(reportRange(month, month)),
      requestDashboard(reportRange(previousMonth, previousMonth))
    ]);
    if (state.data !== data) return;
    const change = reportCategoryChanges(current, prior)[0];
    if (!change?.delta) {
      message.textContent = "Kategooriate kulud olid samad kui eelmise aasta samal kuul.";
      return;
    }
    const label = categoryLabel(change.category);
    message.replaceChildren(
      node("strong", label + " " + signedMoney(change.delta)),
      node("span", " võrreldes eelmise aasta sama kuuga.")
    );
    action.hidden = false;
    action.onclick = () => {
      const scope = {start: month, end: month, data: current, category: change.category};
      openAdviser();
      askAdviser("Mis muutus kategoorias „" + label + "“?", () => {
        lastSpendingQuestion = scope;
        byId("adviser-follow-up").hidden = false;
        return compareChatExpenses(scope, chatExpenses(current, scope), prior);
      });
    };
  } catch {
    if (state.data === data) message.textContent = "Eelmise aasta võrdlust ei õnnestunud laadida.";
  }
}

function offsetMonth(month, offset) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthlyPayments(rows) {
  const merchants = new Map();
  for (const row of rows) {
    const name = row.description.trim().toLocaleLowerCase("et-EE");
    const month = row.date.slice(0, 7);
    if (!name || row.amount_cents === 0) continue;
    if (!merchants.has(name)) merchants.set(name, new Map());
    const months = merchants.get(name);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(row);
  }
  return merchants;
}

function threeMonthlyPayments(months, month) {
  const recent = [0, -1, -2].map(offset => months.get(offsetMonth(month, offset)));
  if (recent.some(rows => rows?.length !== 1)) return null;
  const payments = recent.map(rows => rows[0]);
  const days = payments.map(row => Number(row.date.slice(-2)));
  return Math.max(...days) - Math.min(...days) <= 7 ? payments : null;
}

function recurringIncreases(rows, from, through) {
  const merchants = monthlyPayments(rows);
  const increases = [];
  for (const months of merchants.values()) {
    for (const month of months.keys()) {
      if (month < from || month > through) continue;
      const payments = threeMonthlyPayments(months, month);
      if (!payments) continue;
      const [current, previous] = payments;
      const delta = previous.amount_cents - current.amount_cents;
      if (delta < 100 || delta * 100 < -previous.amount_cents * 5) continue;
      increases.push({month, current, previous, delta});
    }
  }
  return increases.sort((a, b) => b.month.localeCompare(a.month) || b.delta - a.delta);
}

async function showRecurringPayments(payment) {
  const before = payment.previous.date.slice(0, 7);
  const query = reportRange(before, payment.month);
  try {
    if (state.query !== query) await load(query, true);
    byId("expense-sort").value = "recent";
    openExpenses(null, null, payment.current.description);
  } catch (error) {
    byId("status").textContent = error.message;
  }
}

async function renderRecurringAlerts() {
  const data = state.data;
  const through = data.trend.at(-1).month;
  const from = offsetMonth(through, -5);
  const start = offsetMonth(from, -2);
  const status = byId("recurring-status");
  const list = byId("recurring-alerts");
  const preview = byId("recurring-preview");
  preview.textContent = "";
  list.replaceChildren();
  if (offsetMonth(through, -2) < data.first) {
    status.textContent = "Korduvkulu tuvastamiseks on vaja vähemalt kolme järjestikuse kuu andmeid.";
    return;
  }
  status.textContent = "Kontrollin korduvmakseid…";
  try {
    const history = await requestDashboard(reportRange(start < data.first ? data.first : start, through));
    if (state.data !== data) return;
    const changes = recurringIncreases(history.transactions, from, through);
    if (!changes.length) {
      status.textContent = "Viimase kuue kuu andmetes ei paista korduvmaksete olulist tõusu.";
      return;
    }
    const latest = changes[0].month;
    preview.textContent = "Viimane tõus " + signedMoney(changes[0].delta);
    status.textContent = latest === through
      ? "Selle kuu korduvmaksed, mille summa suurenes."
      : prettyMonth(through) + " olulist tõusu ei tuvastatud. Viimane tuvastatud tõus oli " + prettyMonth(latest) + ".";
    const percent = new Intl.NumberFormat("et-EE", {style: "percent", maximumFractionDigits: 1});
    list.replaceChildren(...changes.filter(change => change.month === latest).map(change => {
      const {current, previous, delta} = change;
      const item = node("li", "", "recurring-item");
      const payer = node("div");
      payer.append(node("strong", descriptionLabel(current.description)),
        node("p", dateLabel(previous.date) + " · " + money(-previous.amount_cents) +
          " → " + dateLabel(current.date) + " · " + money(-current.amount_cents)));
      const difference = node("strong", signedMoney(delta) + " (+" + percent.format(delta / -previous.amount_cents) + ")", "recurring-delta");
      const button = node("button", "Vaata makseid");
      button.type = "button";
      button.onclick = () => showRecurringPayments(change);
      item.append(payer, difference, button);
      return item;
    }));
  } catch {
    if (state.data === data) status.textContent = "Korduvmakseid ei õnnestunud kontrollida.";
  }
}

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

async function requestDashboard(query) {
  const response = await fetch("/api/dashboard" + query);
  if (!response.ok) throw new Error("Andmeid ei õnnestunud laadida. Kontrolli kuupäevi ja proovi uuesti.");
  return response.json();
}

async function load(query = state.query, resetFilters = false, initial = false) {
  const data = await requestDashboard(query);
  if (initial && activeView === "avaleht") {
    query = reportRange(data.last, data.last);
    state.data = await requestDashboard(query);
  } else {
    state.data = data;
  }
  state.query = query;
  if (resetFilters) {
    state.category = null;
    state.month = null;
    state.page = 0;
    if (activeView === "tehingud") history.replaceState(null, "", expenseRoute(null, null));
  }
  render();
}

function chartScale(id, rows) {
  const peak = Math.max(1, ...rows.map(row => row.cents));
  const roughStep = peak / 4;
  const unit = Math.max(1, 10 ** Math.floor(Math.log10(roughStep)));
  const step = [1, 2, 2.5, 5, 10].find(value => value * unit >= roughStep) * unit;
  const axis = new Intl.NumberFormat("et-EE", {
    style: "currency", currency: "EUR", maximumFractionDigits: step < 100 ? 2 : 0
  });
  byId(id).replaceChildren(...[4, 3, 2, 1, 0].map(tick => node("span", axis.format(tick * step / 100))));
  return step * 4;
}

function render() {
  const {data} = state;
  for (const [id, value] of [["start", data.trend[0].month], ["end", data.trend.at(-1).month]]) {
    Object.assign(byId(id), {min: data.first, max: data.last, value});
  }
  byId("income").textContent = money(data.income_cents);
  byId("spending").textContent = money(data.expense_cents);
  byId("balance").textContent = money(data.income_cents - data.expense_cents);
  byId("export").href = "/api/categories.png" + state.query;
  const categoryMax = Math.max(1, ...data.groups.map(row => row.cents));
  const categories = data.groups.map(row => {
    const button = node("button", "", "category");
    const track = node("span", "", "track");
    const fill = node("span", "", "fill");
    fill.style.width = 100 * row.cents / categoryMax + "%";
    button.style.setProperty("--category-color", categoryColors[row.category] || categoryColors.Uncategorized);
    const share = new Intl.NumberFormat("et-EE", {style: "percent"}).format(row.cents / data.expense_cents);
    button.title = categoryLabel(row.category) + " · " + share + " kõigist kuludest";
    track.append(fill);
    button.append(node("span", categoryLabel(row.category)), track, node("strong", money(row.cents)));
    button.onclick = () => openExpenses(row.category);
    return button;
  });
  byId("categories").replaceChildren(...categories);
  const monthMax = chartScale("trend-scale", data.trend);
  const latest = data.trend.at(-1);
  byId("trend-point").textContent = prettyMonth(latest.month) + " · " + money(latest.cents);
  byId("trend").replaceChildren(...data.trend.map(row => {
    const button = node("button", "", "month");
    button.title = prettyMonth(row.month) + " · " + money(row.cents);
    button.setAttribute("aria-label", button.title);
    button.style.height = Math.max(2, 100 * row.cents / monthMax) + "%";
    const showMonth = () => { byId("trend-point").textContent = button.title; };
    button.onfocus = button.onpointerenter = showMonth;
    button.onclick = () => openExpenses(null, row.month);
    return button;
  }));
  byId("trend-range").replaceChildren(
    node("span", prettyMonth(data.trend[0].month)),
    node("span", data.trend.length > 6 ? prettyMonth(data.trend[Math.floor(data.trend.length / 2)].month) : ""),
    node("span", data.trend.length > 1 ? prettyMonth(data.trend.at(-1).month) : "")
  );
  renderAdviserContext();
  renderOverview();
  renderMonthlyBriefing();
  renderRecurringAlerts();
  configureReport();
  renderReport();
  renderPaymentCalendar();
  renderPlanning();
  configureGoal();
  renderRows();
  renderPeers();
}

let report = null;
const reportRange = (start, end) => "?" + new URLSearchParams({start, end});

function configureReport() {
  const {first, last} = state.data;
  const year = byId("report-year");
  const quarter = byId("report-quarter");
  if (!year.options.length) {
    const firstYear = Number(first.slice(0, 4));
    const lastYear = Number(last.slice(0, 4));
    year.replaceChildren(...Array.from({length: lastYear - firstYear + 1}, (_, index) =>
      new Option(String(lastYear - index), String(lastYear - index))));
  }
  const previous = quarter.value;
  const available = [1, 2, 3, 4].filter(value => {
    const [start, end] = reportBounds(year.value, value);
    return start <= last && end >= first;
  });
  quarter.replaceChildren(...available.map(value => new Option(value + ". kvartal", String(value))));
  quarter.value = available.includes(Number(previous)) ? previous : String(available.at(-1));
  const month = byId("report-month");
  const previousMonth = month.value;
  const availableMonths = Array.from({length: 12}, (_, index) =>
    year.value + "-" + String(index + 1).padStart(2, "0")).filter(value => value >= first && value <= last);
  month.replaceChildren(...availableMonths.map(value => new Option(prettyMonth(value), value)));
  month.value = availableMonths.includes(previousMonth) ? previousMonth : availableMonths.at(-1);
  byId("report-quarter-field").hidden = byId("report-type").value !== "quarter";
  byId("report-month-field").hidden = byId("report-type").value !== "month";
  byId("report-submit").disabled = false;
}

function reportBounds(year, quarter) {
  const month = value => String(value).padStart(2, "0");
  return quarter
    ? [year + "-" + month(quarter * 3 - 2), year + "-" + month(quarter * 3)]
    : [year + "-01", year + "-12"];
}

const precedingYear = month => (Number(month.slice(0, 4)) - 1) + month.slice(4);
const displayRange = (start, end) => start === end ? prettyMonth(start) : prettyMonth(start) + " – " + prettyMonth(end);
const signedMoney = cents => (cents > 0 ? "+" : "") + money(cents);

function reportCategoryChanges(current, previous) {
  const totals = data => new Map((data?.groups || []).map(row => [row.category, row.cents]));
  const own = totals(current);
  const prior = totals(previous);
  return current.categories.map(category => ({
    category,
    current: own.get(category) || 0,
    prior: prior.get(category) || 0,
    delta: (own.get(category) || 0) - (prior.get(category) || 0)
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function renderReportChart(changes, report) {
  const chart = byId("report-bars");
  const largest = changes.filter(row => row.delta).slice(0, 3);
  byId("report-comparison").hidden = !report.previous || !largest.length;
  const max = Math.max(1, ...largest.flatMap(row => [row.current, row.prior]));
  chart.replaceChildren(...largest.map(row => {
    const group = node("div", "", "report-bar-group");
    group.append(node("h4", categoryLabel(row.category) + " · " + signedMoney(row.delta)));
    for (const [label, value, query, prior] of [
      ["Valitud periood", row.current, report.query, false],
      ["Eelmine aasta", row.prior, report.priorQuery, true]
    ]) {
      const button = reportLink(row.category, "", query);
      button.className = prior ? "report-bar prior" : "report-bar";
      button.setAttribute("aria-label", categoryLabel(row.category) + " · " + label + " · " + money(value));
      const track = node("span", "", "track");
      const fill = node("span", "", "fill");
      button.style.setProperty("--category-color", categoryColors[row.category] || categoryColors.Uncategorized);
      fill.style.width = 100 * value / max + "%";
      track.append(fill);
      button.append(node("span", label), track, node("strong", money(value)));
      group.append(button);
    }
    return group;
  }));
}

function downloadReport() {
  if (!report) return;
  const {current, previous, start, end} = report;
  const number = cents => (cents / 100).toFixed(2).replace(".", ",");
  const row = (label, value, prior) => previous
    ? [label, number(value), number(prior), number(value - prior)]
    : [label, number(value)];
  const cells = [
    ["Periood", start, end],
    ...(previous ? [["Võrdlusperiood", precedingYear(start), precedingYear(end)]] : []),
    [],
    previous ? ["Näitaja", "Valitud periood (EUR)", "Eelmine aasta (EUR)", "Muutus (EUR)"] : ["Näitaja", "Valitud periood (EUR)"],
    row("Sissetulekud", current.income_cents, previous?.income_cents),
    row("Kulud", current.expense_cents, previous?.expense_cents),
    row("Ülejääk", current.income_cents - current.expense_cents, previous && previous.income_cents - previous.expense_cents),
    [],
    ...reportCategoryChanges(current, previous).map(item => row(categoryLabel(item.category), item.current, item.prior))
  ];
  const csv = cells.map(line => line.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(";")).join("\r\n");
  const file = new Blob(["\uFEFF", csv, "\r\n"], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(file);
  const link = node("a");
  link.href = url;
  link.download = "rahakompass-" + start + (start === end ? "" : "-" + end) + ".csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId("report-download").onclick = downloadReport;

function reportLink(category, label, query = report.query) {
  const button = node("button", label);
  button.type = "button";
  button.onclick = async () => {
    try {
      if (state.query !== query) await load(query, true);
      openExpenses(category);
    } catch (error) {
      byId("report-status").textContent = error.message;
    }
  };
  return button;
}

function renderReport() {
  const output = byId("report-output");
  output.hidden = !report;
  if (output.hidden) return;
  if (state.query === report.query) report.current = state.data;
  if (state.query === report.priorQuery && report.previous) report.previous = state.data;
  const {title, previous, partial, wantedComparison, start, end, current: data} = report;
  byId("report-title").textContent = title;
  const notes = [displayRange(start, end)];
  if (partial) notes.push("Ülevaade hõlmab ainult andmetes olevaid kuid.");
  if (wantedComparison && !previous) notes.push("Eelmise aasta samade kuude andmed puuduvad või on osalised.");
  byId("report-period").textContent = notes.join(" · ");
  byId("report-change").hidden = byId("report-previous").hidden = !previous;
  byId("report-previous").textContent = previous ? displayRange(precedingYear(start), precedingYear(end)) : "";
  const income = data.income_cents;
  const spending = data.expense_cents;
  const metrics = [
    ["Sissetulekud", income, previous?.income_cents],
    ["Kulud", spending, previous?.expense_cents],
    ["Ülejääk", income - spending, previous && previous.income_cents - previous.expense_cents],
  ];
  byId("report-totals").replaceChildren(...metrics.map(([label, value, prior]) => {
    const row = node("tr");
    const heading = node("th", label);
    heading.scope = "row";
    row.append(heading, node("td", money(value)));
    if (previous) row.append(node("td", money(prior)), node("td", signedMoney(value - prior)));
    return row;
  }));
  const links = byId("report-links");
  const top = data.groups[0];
  const insights = [];
  const buttons = [];
  if (top && spending > 0) {
    const share = new Intl.NumberFormat("et-EE", {style: "percent"}).format(top.cents / spending);
    insights.push("Suurim kulukategooria oli „" + categoryLabel(top.category) + "“ (" + money(top.cents) + ", " + share + " kuludest).");
    buttons.push(reportLink(top.category, "Vaata suurima kategooria tehinguid"));
  }
  const changes = reportCategoryChanges(data, previous);
  renderReportChart(changes, report);
  if (previous) {
    const biggest = changes[0];
    if (biggest?.delta) {
      const direction = biggest.delta > 0 ? "kasvasid" : "vähenesid";
      insights.push("Suurim muutus oli kategoorias „" + categoryLabel(biggest.category) + "“. Kulud " +
        direction + " " + money(Math.abs(biggest.delta)) + " võrra.");
      if (biggest.category !== top?.category) buttons.push(reportLink(biggest.category, "Vaata enim muutunud kategooria tehinguid"));
    }
  }
  byId("report-insight").textContent = insights.join(" ");
  links.replaceChildren(...buttons);
}

byId("report-type").onchange = byId("report-year").onchange = configureReport;
byId("report-form").onsubmit = event => {
  event.preventDefault();
  generateReport();
};
byId("latest-report").onclick = () => {
  if (!state.data) return;
  byId("report-type").value = "month";
  byId("report-year").value = state.data.last.slice(0, 4);
  configureReport();
  byId("report-month").value = state.data.last;
  generateReport();
};

async function generateReport() {
  const button = byId("report-submit");
  if (button.disabled) return;
  button.disabled = true;
  byId("report-status").textContent = "Koostan ülevaadet…";
  try {
    const year = byId("report-year").value;
    const quarter = byId("report-type").value === "quarter" ? Number(byId("report-quarter").value) : null;
    const month = byId("report-type").value === "month" ? byId("report-month").value : null;
    const [requestedStart, requestedEnd] = month ? [month, month] : reportBounds(year, quarter);
    const start = requestedStart < state.data.first ? state.data.first : requestedStart;
    const end = requestedEnd > state.data.last ? state.data.last : requestedEnd;
    const wantedComparison = byId("report-compare").checked;
    const priorStart = precedingYear(start);
    const priorEnd = precedingYear(end);
    const query = reportRange(start, end);
    const priorQuery = reportRange(priorStart, priorEnd);
    const compare = wantedComparison && priorStart >= state.data.first && priorEnd <= state.data.last;
    const [current, previous] = await Promise.all([
      requestDashboard(query),
      compare ? requestDashboard(priorQuery) : null
    ]);
    report = {
      title: month ? prettyMonth(month) + " · kuuaruanne"
        : quarter ? year + " · " + quarter + ". kvartali ülevaade" : year + ". aasta finantsülevaade",
      start, end, query, priorQuery, current, previous, wantedComparison,
      partial: start !== requestedStart || end !== requestedEnd
    };
    renderReport();
    byId("report-status").textContent = "Ülevaade on valmis.";
  } catch (error) {
    byId("report-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

const chatMonths = [
  "jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august",
  "september", "oktoober", "november", "detsember"
];
const chatCategoryTerms = {
  Housing: /\b(eluas|üür)/u, Groceries: /toidukaub|toidupoe|toidupood|toidukul|toidule/u,
  "Dining out": /väljas söö|restoran|kohvik/u, Transport: /transport|kütus|sõidukul/u,
  Shopping: /ostlem|šopp|kaubamaja/u, Utilities: /kommunaal|elektr|veearve/u,
  Subscriptions: /tellimus|püsitasu/u, Entertainment: /meelelahut|kino/u,
  Health: /tervis|apteek/u, Uncategorized: /kategooriata/u
};

function chatRange(text, previous, usePrevious) {
  const {first, last, trend} = state.data;
  const iso = [...new Set(text.match(/\b20\d{2}-(?:0[1-9]|1[0-2])\b/g) || [])];
  if (iso.length) return [iso[0], iso.at(-1)].sort();
  if (/viimas(e|el) kuul|viimas(e|el) andmetes oleva kuu|viimane kuu/.test(text)) return [last, last];
  if (/eelmis(el|e) kuul|eelmis(e|el) kuu/.test(text)) {
    const date = new Date((previous?.end || trend.at(-1).month) + "-01T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() - 1);
    const month = date.toISOString().slice(0, 7);
    return [month, month];
  }
  const year = text.match(/\b20\d{2}\b/)?.[0];
  const words = text.split(/[^\p{L}]+/u);
  const monthIndex = chatMonths.findIndex(month => words.some(word =>
    word.startsWith(month) || (month === "oktoober" && word.startsWith("oktoobr")) ||
    (month === "september" && word.startsWith("septembr")) ||
    (month === "november" && word.startsWith("novembr")) ||
    (month === "detsember" && word.startsWith("detsembr"))));
  if (monthIndex >= 0) {
    const month = String(monthIndex + 1).padStart(2, "0");
    const candidate = last.slice(0, 4) + "-" + month;
    const period = year ? year + "-" + month : candidate <= last ? candidate : precedingYear(candidate);
    return [period, period];
  }
  if (year) return [year + "-01" < first ? first : year + "-01", year + "-12" > last ? last : year + "-12"];
  if (usePrevious && previous) return [previous.start, previous.end];
  return [trend[0].month, trend.at(-1).month];
}

function chatTarget(text, data) {
  const names = [...new Set(data.transactions.map(row => row.description))]
    .sort((a, b) => b.length - a.length);
  const merchants = [];
  for (const name of names) {
    const raw = name.toLocaleLowerCase("et-EE");
    const display = descriptionLabel(name).toLocaleLowerCase("et-EE");
    if ((text.includes(raw) || text.includes(display)) &&
        !merchants.some(match => match.toLocaleLowerCase("et-EE").includes(raw))) merchants.push(name);
  }
  if (merchants.length) return {merchant: merchants[0], ambiguous: merchants.length > 1};
  const category = Object.entries(chatCategoryTerms).find(([, pattern]) => pattern.test(text))?.[0];
  return {category};
}

function chatExpenses(data, scope) {
  const merchant = scope.merchant?.toLocaleLowerCase("et-EE");
  const rows = data.transactions.filter(row =>
    (!scope.category || row.category === scope.category) &&
    (!merchant || row.description.toLocaleLowerCase("et-EE").includes(merchant)));
  const total = rows.reduce((sum, row) => sum - row.amount_cents, 0);
  const largest = rows.reduce((max, row) => !max || row.amount_cents < max.amount_cents ? row : max, null);
  return {rows, total, largest, count: rows.length, average: rows.length ? total / rows.length : 0};
}

function chatSource(scope, label = "Ava aluseks olevad tehingud") {
  return [label, async () => {
    adviserDialog.close();
    try {
      const query = reportRange(scope.start, scope.end);
      if (state.query !== query) await load(query, true);
      byId("expense-sort").value = scope.sort || "recent";
      openExpenses(scope.category, null, scope.merchant || "");
    } catch (error) {
      byId("status").textContent = error.message;
    }
  }];
}

const chatScopeLabel = scope => scope.merchant ? descriptionLabel(scope.merchant)
  : scope.category ? categoryLabel(scope.category) : "Kõik kulud";

async function compareChatExpenses(scope, current, comparisonData = null) {
  const priorStart = precedingYear(scope.start);
  const priorEnd = precedingYear(scope.end);
  if (priorStart < state.data.first || priorEnd > state.data.last) {
    return ["Eelmise aasta samade kuude andmed puuduvad või on osalised. Proovi valida üks hilisem kuu."];
  }
  const priorData = comparisonData || await requestDashboard(reportRange(priorStart, priorEnd));
  const prior = chatExpenses(priorData, scope);
  const delta = current.total - prior.total;
  const change = delta ? signedMoney(delta) : "muutuseta";
  let summary = chatScopeLabel(scope) + " · " + displayRange(scope.start, scope.end) + ": " +
    money(current.total) + ". Eelmise aasta samal perioodil (" + displayRange(priorStart, priorEnd) +
    "): " + money(prior.total) + ". Muutus: " + change + ".";
  let evidenceScope = scope;
  if (!scope.category && !scope.merchant) {
    const biggest = reportCategoryChanges(scope.data, priorData)[0];
    if (biggest?.delta) {
      evidenceScope = {...scope, category: biggest.category};
      summary += " Suurim kategooria muutus: " + categoryLabel(biggest.category) + " " + signedMoney(biggest.delta) + ".";
    }
  }
  const filtered = chatExpenses(scope.data, evidenceScope);
  const baseline = chatExpenses(priorData, evidenceScope);
  summary += " " + chatScopeLabel(evidenceScope) + ": " + filtered.count + " tehingut võrreldes " +
    baseline.count + " tehinguga.";
  if (filtered.count && baseline.count) {
    const volume = Math.round((filtered.count - baseline.count) * (filtered.average + baseline.average) / 2);
    const size = filtered.total - baseline.total - volume;
    summary += " Keskmine tehing " + money(Math.round(filtered.average)) + " vs " +
      money(Math.round(baseline.average)) + ". Arvutuslik mõju: tehingute arv " + signedMoney(volume) +
      ", keskmine summa " + signedMoney(size) + ".";
  }
  if (filtered.count > 1 && -filtered.largest.amount_cents >= filtered.total / 2) {
    summary += " Suurim tehing oli " + descriptionLabel(filtered.largest.description) + " (" +
      money(-filtered.largest.amount_cents) + ", " + dateLabel(filtered.largest.date) + ").";
  }
  return [summary, ...chatSource({...evidenceScope, sort: "largest"}), chatSource({...evidenceScope, start: priorStart, end: priorEnd},
    "Ava eelmise aasta tehingud")];
}

async function adviserResponse(question) {
  const text = question.toLocaleLowerCase("et-EE");
  if (/laen|liising|investeer|pension|pangatoo|inimesega|nõustaja|pangast|pangaga|pangale/.test(text)) {
    return ["Ma saan selgitada ainult RahaKompassis olevaid tehinguid. Pangatoodete või personaalse nõu korral pöördu pangatöötaja poole.",
      "Vaata pangakontakti", () => {
        byId("adviser-contact").open = true;
        byId("adviser-contact").querySelector("a").focus();
      }];
  }
  if (/prognoos|järgmisel kuul|tulevik|ilmaennustus|saan säästa|peaksin säästma/.test(text)) {
    return ["Vestluses saan vastata ainult juba toimunud tehingute põhjal. Proovi näiteks küsida, kui suured olid viimase andmetes oleva kuu kulud."];
  }
  const previous = lastSpendingQuestion;
  const compare = /eelmis(el|e) aasta|mullu|aasta tagasi|võrdle|mis muutus|miks kasvas|miks vähenes/.test(text);
  const average = /keskmi/.test(text);
  const count = /mitu|palju kordi|tehingute arv/.test(text);
  const largest = /suurim|kõige kallim/.test(text);
  const followUp = compare || /^(aga\b|ja\b|mis oli|kui suur oli|mitu)|nendest|sellel perioodil/.test(text);
  const selected = chatTarget(text, state.data);
  const relevant = selected.category || selected.merchant || compare || average || count || largest ||
    /kulu|kulut|raha läheb|raha läks|kulub|sissetulek|laekus|palk|ülejääk|raha üle/.test(text);
  if (!relevant) {
    return ["Saan vastata sinu tehingute kohta. Näiteks küsi „Kui palju kulutasin Circle K-s oktoobris 2026?“ või „Mis oli suurim tehing?“."];
  }
  if (selected.ambiguous) return ["Nimeta korraga üks kaupmees, et saaksin tema tehingud kokku võtta."];
  const [start, end] = chatRange(text, previous, followUp);
  if (start < state.data.first || end > state.data.last || start > end) {
    return ["Selle perioodi kohta ei ole piisavalt tehinguandmeid. Andmed hõlmavad perioodi " +
      displayRange(state.data.first, state.data.last) + "."];
  }
  const query = reportRange(start, end);
  const data = start === state.data.trend[0].month && end === state.data.trend.at(-1).month
    ? state.data : await requestDashboard(query);
  const resolved = selected.category || selected.merchant ? selected : chatTarget(text, data);
  const named = text.match(/kulutasin\s+([\p{L}]+)/u)?.[1];
  const timeWord = named && (chatMonths.some(month => named.startsWith(month === "mai" ? month : month.slice(0, -1))) ||
    /^(kokku|raha|eurot|viimas|eelmis|sel|sellel|valitu|aastal|kuus|nüüd|selle|täna|eile)/.test(named));
  if (!resolved.category && !resolved.merchant && named && !timeWord) {
    return ["Ma ei leidnud sellele nimetusele vastavat kaupmeest ega kategooriat. Proovi kirjutada nimi nii, nagu see tehingute vaates on."];
  }
  const scope = {start, end, data,
    category: resolved.category || (!resolved.merchant && followUp ? previous?.category : null),
    merchant: resolved.merchant || (!resolved.category && followUp ? previous?.merchant : null)};
  if (/sissetulek|laekus|palk|ülejääk|raha üle/.test(text) && !scope.category && !scope.merchant) {
    const detail = /ülejääk|raha üle/.test(text)
      ? "Sissetulekute ja kulude vahe oli " + money(data.income_cents - data.expense_cents)
      : "Sissetulekuid oli kokku " + money(data.income_cents);
    return [displayRange(start, end) + " · " + detail + ". Ülekandeid ei arvestata."];
  }
  const stats = chatExpenses(data, scope);
  lastSpendingQuestion = scope;
  byId("adviser-follow-up").hidden = false;
  if (compare) return compareChatExpenses(scope, stats);
  const title = chatScopeLabel(scope) + " · " + displayRange(start, end) + ". ";
  if (!stats.count) return [title + "Selle valikuga kulutehinguid ei leitud."];
  const amount = "Kulud kokku " + money(stats.total) + " · " + stats.count + " tehingut.";
  if (largest) return [title + "Suurim tehing oli " + money(-stats.largest.amount_cents) + " · " +
    descriptionLabel(stats.largest.description) + " · " + dateLabel(stats.largest.date) + ".",
    ...chatSource({...scope, sort: "largest"})];
  if (average) return [title + "Keskmine tehing oli " + money(Math.round(stats.average)) + ". " + amount, ...chatSource(scope)];
  if (count || scope.category || scope.merchant) return [title + amount, ...chatSource(scope)];
  const top = data.groups[0];
  return [title + amount + (top ? " Suurim kategooria: " + categoryLabel(top.category) +
    " (" + money(top.cents) + ")." : ""), ...chatSource(scope)];
}

let lastSpendingQuestion = null;
const adviserDialog = byId("adviser-dialog");
const adviserLog = byId("adviser-log");
const adviserWelcome = adviserLog.firstElementChild.cloneNode(true);
let adviserBusy = false;
const adviserInput = byId("adviser-question");
const adviserStatus = byId("adviser-send-status");

function fitAdviserViewport() {
  if (!adviserDialog.open) return;
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0));
  adviserDialog.style.setProperty("--chat-viewport", height + "px");
  adviserDialog.style.setProperty("--chat-occlusion", bottom + "px");
  adviserDialog.classList.toggle("chat-compact", height < 450);
  adviserLog.scrollTop = adviserLog.scrollHeight;
}

window.visualViewport?.addEventListener("resize", fitAdviserViewport);
window.visualViewport?.addEventListener("scroll", fitAdviserViewport);
window.addEventListener("resize", fitAdviserViewport);

function renderAdviserContext() {
  if (!state.data) return;
  const {trend} = state.data;
  byId("adviser-context").textContent =
    "Valitud periood · " + displayRange(trend[0].month, trend.at(-1).month);
}

function appendChatMessage(author, text, label, action, secondary) {
  const entry = node("div", "", author === "Sina" ? "chat-message user-message" : "chat-message");
  entry.append(node("strong", author), node("p", text));
  for (const [title, handler] of [[label, action], secondary || []]) {
    if (!handler) continue;
    const button = node("button", title);
    button.type = "button";
    button.onclick = handler;
    entry.append(button);
  }
  adviserLog.append(entry);
  adviserLog.scrollTop = adviserLog.scrollHeight;
}

async function askAdviser(question, respond = adviserResponse) {
  const trimmed = question.trim();
  if (adviserBusy) return;
  if (!trimmed) {
    adviserStatus.textContent = "Kirjuta enne saatmist küsimus.";
    adviserInput.focus();
    return;
  }
  if (!state.data) {
    adviserStatus.textContent = "Andmed pole veel laaditud. Proovi hetke pärast uuesti.";
    return;
  }
  appendChatMessage("Sina", trimmed);
  adviserInput.value = "";
  adviserBusy = true;
  adviserStatus.textContent = "Vaatan tehinguid…";
  byId("send-adviser").disabled = byId("clear-adviser").disabled = true;
  try {
    const result = await respond(trimmed);
    appendChatMessage("Rahaabiline", ...result);
  } catch {
    appendChatMessage("Rahaabiline", "Tehinguandmeid ei õnnestunud laadida. Proovi uuesti.");
  } finally {
    adviserBusy = false;
    adviserStatus.textContent = "";
    byId("send-adviser").disabled = byId("clear-adviser").disabled = false;
    if (adviserDialog.open) adviserInput.focus();
  }
}

function openAdviser() {
  renderAdviserContext();
  if (!adviserDialog.open) adviserDialog.showModal();
  fitAdviserViewport();
}

for (const button of document.querySelectorAll("[data-open-adviser]")) {
  button.onclick = openAdviser;
}
byId("close-adviser").onclick = () => adviserDialog.close();
byId("clear-adviser").onclick = () => {
  lastSpendingQuestion = null;
  adviserLog.replaceChildren(adviserWelcome.cloneNode(true));
  byId("adviser-follow-up").hidden = true;
  adviserInput.value = "";
  adviserStatus.textContent = "";
  adviserInput.focus();
};
byId("adviser-form").onsubmit = event => {
  event.preventDefault();
  askAdviser(adviserInput.value);
};
adviserInput.onkeydown = event => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (!event.repeat) askAdviser(adviserInput.value);
};
adviserInput.oninput = () => { if (!adviserBusy) adviserStatus.textContent = ""; };
for (const button of document.querySelectorAll("[data-question]")) {
  button.onclick = () => askAdviser(button.dataset.question);
}

const forecastLabels = {ridge: "Kalendrimudel", seasonal: "Eelmise aasta sama kuu"};

let calendarHistory = null;
const calendarEdits = new Map();

function dayOfMonth(month, day) {
  const last = new Date(offsetMonth(month, 1) + "-01T00:00:00Z");
  last.setUTCDate(0);
  return month + "-" + String(Math.min(day, last.getUTCDate())).padStart(2, "0");
}

const medianOfThree = values => [...values].sort((a, b) => a - b)[1];

function nextMonthlyPayment(history, reference) {
  const days = history.map(row => Number(row.date.slice(-2)));
  let month = reference.slice(0, 7);
  if (dayOfMonth(month, Math.max(...days)) < reference) month = offsetMonth(month, 1);
  const expected = dayOfMonth(month, medianOfThree(days));
  const earliest = dayOfMonth(month, Math.min(...days));
  return {
    date: expected < reference ? reference : expected,
    earliest: earliest < reference ? reference : earliest,
    latest: dayOfMonth(month, Math.max(...days)),
    amount: medianOfThree(history.map(row => Math.abs(row.amount_cents))),
    description: history[0].description,
    history
  };
}

function forecastMonthlyPayments(rows, last, reference) {
  return [...monthlyPayments(rows).values()]
    .map(months => threeMonthlyPayments(months, last))
    .filter(Boolean)
    .map(history => nextMonthlyPayment(history, reference));
}

function paymentHistory(payment) {
  const history = node("details", "", "calendar-history");
  history.append(node("summary", "Varasemad tehingud"));
  const list = node("ul");
  list.append(...payment.history.map(row =>
    node("li", dateLabel(row.date) + " · " + money(Math.abs(row.amount_cents)))));
  history.append(list);
  return history;
}

function estimatedDate(payment) {
  return payment.earliest === payment.latest ? dateLabel(payment.date)
    : dateLabel(payment.earliest) + " – " + dateLabel(payment.latest);
}

function calendarPaymentCard(payment, payday, reference, key) {
  const card = node("article", "", "calendar-payment");
  const heading = node("div", "", "heading");
  heading.append(node("h3", descriptionLabel(payment.description)), node("strong", money(payment.amount)));
  const timing = payment.date < payday.date ? "Enne palgapäeva"
    : payment.date === payday.date ? "Palgapäeval" : "Pärast palgapäeva";
  const overlaps = payment.earliest < payday.latest && payment.latest >= payday.earliest;
  card.append(heading, node("p", estimatedDate(payment) + " · " + timing +
    (overlaps && (payment.earliest !== payment.latest || payday.earliest !== payday.latest)
      ? " · kuupäevad võivad kattuda" : "") + (payment.edited ? " · muudetud" : "")), paymentHistory(payment));

  const adjustment = node("details", "", "calendar-adjustment");
  adjustment.append(node("summary", "Muuda hinnangut"));
  const form = node("form");
  const date = node("input");
  Object.assign(date, {type: "date", value: payment.date, min: reference, required: true});
  const amount = node("input");
  Object.assign(amount, {type: "number", value: (payment.amount / 100).toFixed(2), min: "0",
    max: "1000000", step: "0.01", required: true});
  const dateLabelNode = node("label", "Kuupäev");
  const amountLabel = node("label", "Summa (€)");
  dateLabelNode.append(date);
  amountLabel.append(amount);
  const apply = node("button", "Rakenda");
  apply.type = "submit";
  form.append(dateLabelNode, amountLabel, apply);
  form.onsubmit = event => {
    event.preventDefault();
    calendarEdits.set(key, {date: date.value, amount: Math.round(amount.valueAsNumber * 100)});
    renderPaymentCalendar();
  };
  if (payment.edited) {
    const reset = node("button", "Taasta hinnang");
    reset.type = "button";
    reset.onclick = () => {
      calendarEdits.delete(key);
      renderPaymentCalendar();
    };
    form.append(reset);
  }
  adjustment.append(form);
  card.append(adjustment);
  return card;
}

async function renderPaymentCalendar() {
  const input = byId("calendar-date");
  const summary = byId("calendar-summary");
  const paydayBox = byId("calendar-payday");
  const bills = byId("calendar-bills");
  const {first, last} = state.data;
  const firstFutureMonth = offsetMonth(last, 1);
  input.min = firstFutureMonth + "-01";
  input.max = dayOfMonth(offsetMonth(last, 3), 31);
  if (!input.value) input.value = firstFutureMonth + "-02";
  const reference = input.value;
  const update = {};
  calendarRender = update;
  paydayBox.replaceChildren();
  bills.replaceChildren();
  if (!reference || !input.validity.valid) {
    summary.textContent = "Vali kuupäev viimase andmetes oleva kuu järgse kolme kuu seast.";
    return;
  }
  const lookback = offsetMonth(last, -2);
  if (lookback < first) {
    summary.textContent = "Kalendriks on vaja vähemalt kolme kuu andmeid.";
    return;
  }
  summary.textContent = "Arvutan eeldatavaid makseid…";
  try {
    calendarHistory ||= requestDashboard(reportRange(lookback, last)).catch(error => {
      calendarHistory = null;
      throw error;
    });
    const data = await calendarHistory;
    if (calendarRender !== update) return;
    const [payday] = forecastMonthlyPayments(data.income_transactions, last, reference)
      .sort((a, b) => b.amount - a.amount);
    if (!payday) {
      summary.textContent = "Korduvat sissetulekut ei tuvastatud, seega ei saa palgapäeva hinnata.";
      return;
    }

    const billCategories = new Set(["Housing", "Utilities", "Subscriptions"]);
    const billHistory = data.transactions.filter(row => billCategories.has(row.original_category));
    const payments = forecastMonthlyPayments(billHistory, last, reference).map(payment => {
      const key = reference + ":" + payment.description;
      const edit = calendarEdits.get(key);
      if (!edit) return {key, payment};
      return {key, payment: {...payment, ...edit, earliest: edit.date, latest: edit.date, edited: true}};
    }).sort((a, b) => a.payment.date.localeCompare(b.payment.date));
    const before = payments.filter(({payment}) => payment.date < payday.date);
    const total = before.reduce((sum, {payment}) => sum + payment.amount, 0);
    summary.textContent = before.length
      ? "Enne eeldatavat palgapäeva: " + before.length + (before.length === 1 ? " makse · " : " makset · ") + money(total)
      : "Enne eeldatavat palgapäeva ei ole varasemate andmete põhjal makseid oodata.";

    const income = node("div", "", "calendar-income");
    income.append(node("h3", "Eeldatav palgapäev"),
      node("p", estimatedDate(payday) + " · " + money(payday.amount) + " · " + descriptionLabel(payday.description)),
      paymentHistory(payday));
    paydayBox.append(income);
    bills.replaceChildren(...payments.map(({key, payment}) => calendarPaymentCard(payment, payday, reference, key)));
  } catch {
    if (calendarRender === update) summary.textContent = "Maksekalendri andmeid ei õnnestunud laadida.";
  }
}

let calendarRender;
byId("calendar-date").onchange = () => { if (state.data) renderPaymentCalendar(); };

function renderPlanning() {
  const {data} = state;
  const outlook = data[byId("forecast-series").value];
  const chart = byId("forecast-chart");
  if (!outlook) {
    chart.replaceChildren();
    byId("forecast-scale").replaceChildren();
    byId("forecast-point").textContent = "";
    byId("outlook-note").textContent = "Prognoosiks on vaja vähemalt 24 kuu andmeid.";
    return;
  }
  const points = [...outlook.recent, ...outlook.months];
  const max = chartScale("forecast-scale", points);
  const describe = (row, forecast) => prettyMonth(row.month) + " · " +
    (forecast ? "Prognoos: " : "Tegelik: ") + money(row.cents);
  chart.replaceChildren(...points.map((row, index) => {
    const forecast = index >= outlook.recent.length;
    const button = node("button", "", forecast ? "forecast-bar projected" : "forecast-bar");
    const fill = node("span", "", "forecast-fill");
    fill.style.height = Math.max(1, row.cents * 100 / max) + "%";
    button.append(fill, node("span", prettyMonth(row.month).split(" ")[0], "forecast-month"));
    button.title = describe(row, forecast);
    button.setAttribute("aria-label", button.title);
    const showPoint = () => { byId("forecast-point").textContent = button.title; };
    button.onclick = button.onfocus = button.onpointerenter = showPoint;
    return button;
  }));
  byId("forecast-point").textContent = describe(outlook.months[0], true);
  byId("outlook-note").textContent = forecastLabels[outlook.method] +
    " andis näidisandmetel keskmiselt väiksema prognoosivea. Kalendrimudel: " +
    money(outlook.errors.ridge) + "; eelmise aasta sama kuu: " + money(outlook.errors.seasonal) +
    ". Kalendrimudel arvestab kuud ning novembrist veebruarini kestvat talveperioodi.";

  const notes = [];
  const {spending_watch: spending, utility_watch: utility, recent_spending: recent,
    recent_utilities: recentUtilities} = data.guidance;
  if (spending) notes.push("Kulude prognoos (" + prettyMonth(spending.month) + "): " +
    money(spending.cents) + ". Viimase kolme kuu keskmine oli " + money(recent) + ".");
  if (utility) notes.push("Kommunaalarvete prognoos on " + money(utility.cents) + " (kuu: " +
    prettyMonth(utility.month) + "). Keskmine arve oli " + money(recentUtilities) +
    " viimase kolme kuu jooksul. Enne raha kõrvale panemist kontrolli järgmist arvet või tariifi.");
  if (!notes.length) notes.push("Prognoositud kasv ei ületa mudeli tavapärast prognoosiviga.");
  byId("watch-list").replaceChildren(...notes.map(note => node("li", note)));

  const select = byId("scenario-category");
  const previous = select.value;
  const discretionary = ["Dining out", "Shopping", "Entertainment", "Subscriptions"];
  select.replaceChildren(...discretionary.map(category => new Option(categoryLabel(category), category)));
  if (discretionary.includes(previous)) select.value = previous;
  renderScenario();
}

function renderScenario() {
  if (!state.data) return;
  const category = byId("scenario-category").value;
  const input = byId("scenario-reduction");
  const cents = Math.round(input.valueAsNumber * 100);
  const result = byId("scenario-result");
  if (!input.validity.valid || !Number.isFinite(cents)) {
    result.textContent = "Sisesta null või positiivne kuine kärbe.";
    return;
  }
  const group = state.data.groups.find(row => row.category === category);
  const average = Math.round((group?.cents || 0) / state.data.trend.length);
  if (cents > average) {
    result.textContent = "See kärbe ületab valitud perioodi kuu keskmist kulu " +
      money(average) + " · " + categoryLabel(category) + ". Proovi väiksemat summat või teist perioodi.";
    return;
  }
  result.textContent = "Valitud perioodi keskmine kulu kuus: " + categoryLabel(category) + " · " + money(average) +
    ". Vähendades kulu " + money(cents) + " võrra kuus, võiks kolme kuuga jääda " +
    money(cents * 3) + " rohkem üle, kui sissetulek ja muud kulud ei muutu.";
}

byId("forecast-series").onchange = renderPlanning;
byId("scenario").oninput = renderScenario;
byId("scenario").onsubmit = event => event.preventDefault();

const goalCategories = ["Dining out", "Shopping", "Entertainment", "Subscriptions"];

const savingsStorageKey = "rahakompass.savings-plan.v1";
let savingsPlan = null;
try {
  const saved = JSON.parse(localStorage.getItem(savingsStorageKey) || "null");
  if (saved && Number.isInteger(saved.target) && saved.target > 0 &&
      Array.isArray(saved.months) && saved.months.length &&
      Array.isArray(saved.items) && saved.recorded && typeof saved.recorded === "object") {
    savingsPlan = saved;
  }
} catch {}

function persistSavings(message) {
  const feedback = byId("savings-status");
  try {
    localStorage.setItem(savingsStorageKey, JSON.stringify(savingsPlan));
    feedback.textContent = message;
  } catch {
    feedback.textContent = message + " Brauseri salvestus pole saadaval. Muudatus kehtib sellel avatud lehel.";
  }
}

function saveSavingsOption(title, items, gap, draft) {
  savingsPlan = {...draft, title, items, gap, recorded: savingsPlan?.recorded || {}};
  persistSavings("Plaan salvestatud.");
  renderSavedSavings();
  byId("saved-savings").scrollIntoView({block: "nearest"});
}

function savingsBudgetText(item) {
  return categoryLabel(item.category) + " · " + money(item.amount) +
    " vähem kuus · kululagi " + money(item.average - item.amount);
}

function renderSavedSavings() {
  const panel = byId("saved-savings");
  panel.hidden = !savingsPlan;
  if (!savingsPlan) return;
  const {target, months, items, protectedCategory, title, gap, recorded, reference} = savingsPlan;
  const saved = months.reduce((sum, month) => sum + (recorded[month] || 0), 0);
  const remaining = Math.max(0, target - saved);
  const unchecked = months.filter(month => !Object.hasOwn(recorded, month)).length;
  byId("savings-title").textContent = money(target) + " · tähtaeg " + prettyMonth(months.at(-1));
  byId("savings-progress").max = target;
  byId("savings-progress").value = Math.min(saved, target);
  byId("savings-preview").textContent = money(saved) + " kogutud · eesmärk " + money(target);
  byId("savings-totals").textContent = "Kõrvale pandud " + money(saved) + " · eesmärgini " + money(remaining) + ".";
  byId("savings-next").textContent = remaining === 0 ? "Eesmärk täidetud."
    : unchecked ? "Puuduolevate kuude vahel jagades on veel vaja keskmiselt " +
      money(Math.ceil(remaining / unchecked)) + " kuus."
    : "Kõik kuud on täidetud. Eesmärgist jääb puudu " + money(remaining) + ".";
  byId("savings-strategy").textContent = title +
    (protectedCategory ? " · hoiad kategooria „" + categoryLabel(protectedCategory) + "“ kulutustaset" : "") + ".";
  byId("savings-limits").replaceChildren(...items.map(item => node("li", savingsBudgetText(item))));
  byId("savings-note").textContent = (items.length ? "Kululaed põhinevad perioodil " + reference + ". " : "") +
    (gap ? "Suuremate kulude stsenaariumis jäi plaani koostamisel katmata " + money(gap) + "." : "");
  byId("savings-months").replaceChildren(...months.map(month => {
    const label = node("label", prettyMonth(month) + " (€)");
    const input = node("input");
    Object.assign(input, {type: "number", min: "0", max: "1000000", step: "0.01", name: month,
      value: Object.hasOwn(recorded, month) ? (recorded[month] / 100).toFixed(2) : ""});
    label.append(input);
    return label;
  }));
}

byId("savings-progress-form").onsubmit = event => {
  event.preventDefault();
  if (!savingsPlan) return;
  const values = new FormData(event.currentTarget);
  for (const month of savingsPlan.months) {
    const raw = values.get(month);
    if (raw === "") delete savingsPlan.recorded[month];
    else savingsPlan.recorded[month] = Math.round(Number(raw) * 100);
  }
  persistSavings("Edenemine salvestatud.");
  renderSavedSavings();
};

function configureGoal() {
  const deadline = byId("goal-deadline");
  const protectedCategory = byId("goal-protected");
  const previous = deadline.value || savingsPlan?.months.at(-1);
  const months = state.data.outlook?.months || [];
  deadline.replaceChildren(...months.map(row => new Option(prettyMonth(row.month), row.month)));
  deadline.value = months.some(row => row.month === previous) ? previous : (months.at(-1)?.month || "");
  if (!protectedCategory.options.length) {
    protectedCategory.replaceChildren(new Option("Kõiki kategooriaid võib muuta", ""),
      ...goalCategories.map(category => new Option(categoryLabel(category), category)));
    protectedCategory.value = savingsPlan?.protectedCategory ?? "Dining out";
    if (savingsPlan) byId("goal-amount").value = (savingsPlan.target / 100).toFixed(2);
  }
  byId("goal-form").hidden = !months.length;
  renderGoal();
  renderSavedSavings();
}

function goalOption(title, items, draft) {
  const card = node("article", "", "goal-option");
  const covered = items.reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(0, draft.gap - covered * draft.months.length);
  card.append(node("h3", title));
  if (items.length) {
    const list = node("ul");
    list.append(...items.map(item => node("li", savingsBudgetText(item))));
    card.append(list);
  }
  card.append(node("p", remaining
    ? "Suuremate kulude korral jääks eesmärgist puudu " + money(remaining) + "."
    : items.length ? "Kärbe jätaks kuus " + money(covered) + " rohkem üle, kui muud kulud ei muutu."
      : "Selle eesmärgi jaoks pole praeguse prognoosi järgi kärpeid vaja."));
  const button = node("button", "Vali ja salvesta");
  button.type = "button";
  button.onclick = () => saveSavingsOption(title, items, remaining, draft);
  card.append(button);
  return card;
}

function renderGoal() {
  if (!state.data) return;
  const {outlook, planning_income_cents: income} = state.data;
  const summary = byId("goal-summary");
  const stress = byId("goal-stress");
  const assumptions = byId("goal-assumptions");
  const options = byId("goal-options");
  options.replaceChildren();
  summary.textContent = stress.textContent = assumptions.textContent = "";
  if (!outlook) {
    summary.textContent = "Eesmärgi hindamiseks on vaja kolme kuu kuluprognoosi.";
    return;
  }
  if (income <= 0) {
    summary.textContent = "Eesmärgi hindamiseks on vaja viimaste kuude sissetulekuandmeid.";
    return;
  }
  const input = byId("goal-amount");
  const target = Math.round(input.valueAsNumber * 100);
  if (!input.validity.valid || !Number.isFinite(target)) {
    summary.textContent = "Sisesta nullist suurem säästueesmärk.";
    return;
  }
  const deadline = byId("goal-deadline").value;
  const months = outlook.months.filter(row => row.month <= deadline);
  const spending = months.reduce((sum, row) => sum + row.cents, 0);
  const projected = income * months.length - spending;
  const error = outlook.errors[outlook.method];
  const higherSpending = projected - error * months.length;
  const gap = Math.max(0, target - higherSpending);
  function describe(available) {
    const amount = money(Math.abs(available));
    const projection = available >= 0 ? amount + " jääb üle" : amount + " jääb puudu juba enne säästmist";
    return projection + " · " + (available >= target
      ? money(available - target) + " üle eesmärgi."
      : money(target - available) + " eesmärgist puudu.");
  }
  summary.textContent = "Praegune prognoos: " + describe(projected);
  stress.textContent = "Kui kulud on " + money(error) + " võrra kuus suuremad: " + describe(higherSpending);
  const protectedCategory = byId("goal-protected").value;
  assumptions.textContent = "Eeldatav sissetulek: " + money(income) +
    " kuus viimase kolme kuu keskmise põhjal. Suuremate kulude stsenaarium lisab " +
    "iga kuu mudeli keskmise prognoosivea. Kuluprognoos sisaldab kommunaalarveid. " +
    "Näited põhinevad valitud perioodi keskmistel kuukuludel ja iga kärbe on kuni 25%. " +
    (protectedCategory ? categoryLabel(protectedCategory) + " jääb kärbetest välja." : "");
  const draft = {target, months: months.map(row => row.month), protectedCategory, gap,
    reference: displayRange(state.data.trend[0].month, state.data.trend.at(-1).month)};
  const needed = Math.ceil(gap / months.length);
  const candidates = state.data.groups
    .filter(row => goalCategories.includes(row.category) && row.category !== protectedCategory)
    .map(row => {
      const average = Math.floor(row.cents / state.data.trend.length);
      return {category: row.category, average, cap: Math.floor(average / 4)};
    })
    .filter(row => row.cap > 0)
    .sort((a, b) => b.cap - a.cap);
  const first = candidates[0];
  if (!gap) {
    options.append(goalOption("Jätka seniste kuludega", [], draft));
    if (first) {
      const amount = Math.min(first.cap, Math.max(1, Math.floor(first.average / 10)));
      options.append(goalOption("Jäta endale lisavaru", [{...first, amount}], draft));
    }
    return;
  }
  options.append(node("p", "Kui kulud on suuremad, tuleb leida veel " + money(needed) + " kuus."));
  if (!first) {
    options.append(node("p", "Valitud perioodil pole muudetavates kategooriates kulusid. Kaalu väiksemat eesmärki või hilisemat tähtaega."),
      goalOption("Salvesta eesmärk praeguse prognoosiga", [], draft));
    return;
  }
  options.append(goalOption("Vähenda ühe kategooria kulu",
    [{...first, amount: Math.min(first.cap, needed)}], draft));
  if (candidates.length > 1) {
    const share = Math.ceil(needed / candidates.length);
    const distributed = candidates.map(item => ({...item, amount: Math.min(item.cap, share)}));
    let remaining = needed - distributed.reduce((sum, item) => sum + item.amount, 0);
    // Balance whole-cent rounding and redistribute any share blocked by a category cap.
    for (const [index, item] of distributed.entries()) {
      const adjustment = Math.max(-item.amount, Math.min(remaining, candidates[index].cap - item.amount));
      item.amount += adjustment;
      remaining -= adjustment;
    }
    const active = distributed.filter(item => item.amount > 0);
    if (active.length > 1) options.append(goalOption("Jaga kärbe mitme kategooria vahel", active, draft));
  }
}

byId("goal-form").oninput = renderGoal;
byId("goal-form").onsubmit = event => event.preventDefault();

function renderPeers() {
  const {data} = state;
  const selected = byId("peer-group").value;
  const group = data.peers?.[selected];
  byId("peer-results").hidden = !group;
  if (!group) {
    byId("peer-note").textContent = "Võrdluseks on vaja vähemalt 10 leibkonda ning sinu sissetulek peab olema positiivne.";
    return;
  }
  const left = data.income_cents - data.expense_cents;
  const rate = left * 100 / data.income_cents;
  byId("peer-note").textContent = selected === "lower_more_left"
    ? group.count + " väiksema sissetulekuga leibkonnal jäi rohkem raha üle kui sinul."
    : group.more_left_count + " / " + group.count + " leibkonnast jäi rohkem raha üle kui sinul.";
  const summary = [
    ["Sissetulekud", money(data.income_cents), money(group.median_income)],
    ["Ülejääk", money(left), money(group.median_surplus)],
    ["Ülejääk sissetulekust", rate.toLocaleString("et-EE", {maximumFractionDigits: 1}) + "%", group.median_surplus_rate.toLocaleString("et-EE", {maximumFractionDigits: 1}) + "%"]
  ];
  byId("peer-summary").replaceChildren(...summary.map(([label, own, peer]) => {
    const row = node("tr");
    const heading = node("th", label);
    heading.scope = "row";
    row.append(heading, node("td", own), node("td", peer));
    return row;
  }));
  const ownByCategory = new Map(data.groups.map(row => [row.category, row.cents]));
  const categories = Object.entries(group.categories).map(([category, median]) => {
    const own = ownByCategory.get(category) || 0;
    return {category, median, own, gap: own - median};
  }).sort((first, second) => Math.abs(second.gap) - Math.abs(first.gap));
  byId("peer-categories").replaceChildren(...categories.map(({category, median, own, gap}) => {
    const row = node("tr");
    const label = node("th");
    label.scope = "row";
    const drill = node("button", categoryLabel(category), "category-link");
    drill.onclick = () => openExpenses(category);
    label.append(drill);
    row.append(label, node("td", money(own)), node("td", money(median)),
      node("td", (gap > 0 ? "+" : "") + money(gap)));
    return row;
  }));
}

byId("peer-group").onchange = () => { if (state.data) renderPeers(); };

function renderRows() {
  const {categories, trend} = state.data;
  const months = trend.map(row => row.month);
  if (state.category && !categories.includes(state.category)) state.category = null;
  if (state.month && !months.includes(state.month)) state.month = null;
  const category = byId("expense-category");
  category.replaceChildren(new Option("Kõik kategooriad", ""),
    ...categories.map(value => new Option(categoryLabel(value), value)));
  category.value = state.category || "";
  const month = byId("expense-month");
  month.replaceChildren(new Option("Kõik kuud", ""), ...months.map(value => new Option(prettyMonth(value), value)));
  month.value = state.month || "";
  const term = byId("search").value.trim().toLowerCase();
  const filtered = state.data.transactions.filter(row =>
    (!state.category || row.category === state.category) &&
    (!state.month || row.date.startsWith(state.month)) &&
    (row.description.toLowerCase().includes(term) || descriptionLabel(row.description).toLowerCase().includes(term))
  );
  const sort = byId("expense-sort").value;
  if (sort === "oldest") filtered.reverse();
  if (sort === "largest") filtered.sort((a, b) => a.amount_cents - b.amount_cents);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.page = Math.min(pages - 1, state.page);
  const start = state.page * pageSize;
  const scope = [state.category && categoryLabel(state.category), state.month && prettyMonth(state.month)].filter(Boolean);
  byId("scope").textContent = [...scope, filtered.length + " kulu"].join(" · ");
  const rows = filtered.slice(start, start + pageSize).map(row => {
    const tr = node("tr");
    for (const value of [dateLabel(row.date), descriptionLabel(row.description), categoryLabel(row.category) + (row.corrected ? " (muudetud)" : ""), money(-row.amount_cents)]) {
      tr.append(node("td", value));
    }
    const action = node("td");
    const edit = node("button", "Muuda");
    edit.setAttribute("aria-label", "Muuda kategooriat: " + descriptionLabel(row.description) + " · " + dateLabel(row.date));
    edit.onclick = () => openEdit(row);
    action.append(edit);
    tr.append(action);
    return tr;
  });
  if (!rows.length) {
    const tr = node("tr");
    const cell = node("td", "Nendele filtritele vastavaid kulusid ei leitud.");
    cell.colSpan = 5;
    tr.append(cell);
    rows.push(tr);
  }
  byId("rows").replaceChildren(...rows);
  byId("page").textContent = "Lehekülg " + (state.page + 1) + " / " + pages;
  byId("previous").disabled = state.page === 0;
  byId("next").disabled = state.page + 1 === pages;
}

function openEdit(row) {
  state.editing = row;
  byId("edit-description").textContent = descriptionLabel(row.description) + " · " + money(-row.amount_cents) +
    " · Algne kategooria: " + categoryLabel(row.original_category);
  byId("edit-category").replaceChildren(...state.data.categories.map(category => new Option(categoryLabel(category), category)));
  byId("edit-category").value = row.category;
  byId("suggestion").hidden = !row.suggestion;
  if (row.suggestion) {
    const {category, reason} = row.suggestion;
    byId("suggestion-reason").textContent = "Soovitatud kategooria: " + categoryLabel(category) + ". " + ({
      "The description mentions food or drink.": "Kirjelduses on mainitud toitu või jooki.",
      "The description mentions fueling or charging.": "Kirjelduses on mainitud tankimist või laadimist."
    }[reason] || "");
    byId("use-suggestion").onclick = () => { byId("edit-category").value = category; };
  }
  byId("edit-error").textContent = "";
  byId("reset").disabled = !row.corrected;
  byId("edit").showModal();
}

async function saveCategory(category) {
  const row = state.editing;
  byId("save").disabled = byId("reset").disabled = byId("cancel").disabled = true;
  try {
    const response = await fetch("/api/transactions/" + row.id + "/category", {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({category})
    });
    if (!response.ok) throw new Error("Kategooriat ei õnnestunud salvestada. Proovi uuesti.");
    byId("edit").close();
    byId("status").textContent = "Kategooria muudetud: " + descriptionLabel(row.description) + ".";
    try {
      await load();
    } catch {
      byId("status").textContent = "Kategooria salvestati. Uuendatud summade nägemiseks laadi leht uuesti.";
    }
  } catch (error) {
    byId("edit-error").textContent = error.message;
  } finally {
    byId("save").disabled = byId("cancel").disabled = false;
    byId("reset").disabled = !row.corrected;
  }
}

byId("period").onsubmit = async event => {
  event.preventDefault();
  try {
    await load("?" + new URLSearchParams({start: byId("start").value, end: byId("end").value}), true);
    byId("status").textContent = "";
  } catch (error) {
    byId("status").textContent = error.message;
  }
};
byId("expense-category").onchange = byId("expense-month").onchange = () =>
  changeExpenseFilters(byId("expense-category").value, byId("expense-month").value);
byId("expense-sort").onchange = () => {
  state.page = 0;
  if (state.data) renderRows();
};
byId("clear-expense-filters").onclick = () => {
  byId("search").value = "";
  byId("expense-sort").value = "recent";
  changeExpenseFilters(null, null);
};

byId("search").oninput = () => {
  state.page = 0;
  if (state.data) renderRows();
};
byId("previous").onclick = () => { state.page--; renderRows(); };
byId("next").onclick = () => { state.page++; renderRows(); };
byId("edit-form").onsubmit = event => {
  event.preventDefault();
  saveCategory(byId("edit-category").value);
};
byId("edit").oncancel = event => {
  if (byId("save").disabled) event.preventDefault();
};
byId("reset").onclick = () => saveCategory(null);
byId("cancel").onclick = () => byId("edit").close();
showView();
load("", false, true).catch(error => { byId("status").textContent = error.message; });

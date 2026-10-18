// לוח חודשי בריבועים, עם התאריך העברי, חגים ומשימות לכל יום.
(function () {
  const MAX_CHIPS = 3;
  const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const gregorianMonth = new Intl.DateTimeFormat("he", { month: "long", year: "numeric" });

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $("month-title"),
    hebrew: $("month-hebrew"),
    grid: $("month-grid"),
    day: $("month-day"),
    prev: $("month-prev"),
    next: $("month-next"),
    today: $("month-today"),
  };

  let monthStart = Dates.todayISO().slice(0, 8) + "01"; // היום הראשון בחודש הלועזי המוצג
  let selected = Dates.todayISO();
  let lastTasks = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function hebrewRange(first, last) {
    const a = Hebrew.parts(first);
    const b = Hebrew.parts(last);
    const yearA = Hebrew.yearLetters(first);
    const yearB = Hebrew.yearLetters(last);
    if (a.monthHe === b.monthHe && yearA === yearB) return `${a.monthHe} ${yearA}`;
    if (yearA === yearB) return `${a.monthHe} – ${b.monthHe} ${yearA}`;
    return `${a.monthHe} ${yearA} – ${b.monthHe} ${yearB}`;
  }

  function chip(item) {
    const cls = "chip" + (item.overdue ? " overdue" : item.actionable ? "" : " future");
    return el("span", cls, item.task.title);
  }

  function renderGrid(active) {
    const today = Dates.todayISO();
    const monthLength = Dates.daysInMonth(Dates.parse(monthStart).y, Dates.parse(monthStart).m);
    const monthEnd = Dates.addDays(monthStart, monthLength - 1);
    const leading = Dates.weekday(monthStart);
    const gridStart = Dates.addDays(monthStart, -leading);
    const weeks = Math.ceil((leading + monthLength) / 7);
    const gridEnd = Dates.addDays(gridStart, weeks * 7 - 1);
    const byDate = window.AgendaView.itemsByDate(active, gridStart, gridEnd, "due");

    els.title.textContent = gregorianMonth.format(Dates.toDate(monthStart));
    els.hebrew.textContent = hebrewRange(monthStart, monthEnd);

    const nodes = WEEKDAY_NAMES.map((name) => el("div", "mg-weekday", name));
    for (let i = 0; i < weeks * 7; i++) {
      const iso = Dates.addDays(gridStart, i);
      const parsed = Dates.parse(iso);
      const items = byDate.get(iso) || [];
      const holidays = Hebrew.holidays(iso);
      const special = holidays.filter((h) => h.kind !== "rc");

      const cell = el("button", "mg-cell");
      cell.type = "button";
      if (iso < monthStart || iso > monthEnd) cell.classList.add("outside");
      if (iso === today) cell.classList.add("today");
      if (iso === selected) cell.classList.add("selected");
      if (special.length) cell.classList.add("has-holiday");

      const top = el("div", "mg-top");
      top.appendChild(el("span", "mg-num", String(parsed.d)));
      top.appendChild(el("span", "mg-heb", Hebrew.dayLetters(iso)));
      cell.appendChild(top);

      if (holidays.length) {
        const label = special.length ? special.map((h) => h.name).join(", ") : "ראש חודש";
        cell.appendChild(el("div", "mg-holiday" + (special.length ? "" : " rc"), label));
      }

      const chips = el("div", "mg-chips");
      items.slice(0, MAX_CHIPS).forEach((item) => chips.appendChild(chip(item)));
      if (items.length > MAX_CHIPS) chips.appendChild(el("span", "chip more", `+${items.length - MAX_CHIPS} נוספות`));
      cell.appendChild(chips);

      cell.addEventListener("click", () => {
        selected = iso;
        render(lastTasks);
      });
      nodes.push(cell);
    }
    els.grid.replaceChildren(...nodes);
    return byDate;
  }

  function renderDay(byDate) {
    const items = byDate.get(selected) || [];
    const wrap = [];
    const head = el("div", "day-head");
    head.appendChild(window.AgendaView.dayHeading(selected));
    if (items.length) head.appendChild(el("span", "muted", window.AgendaView.formatMinutes(window.AgendaView.sumMinutes(items))));
    wrap.push(head);
    if (items.length === 0) {
      wrap.push(el("p", "muted", "אין משימות ביום זה."));
    } else {
      const list = el("ul", "tasks-list");
      items.forEach((item) => list.appendChild(window.AgendaView.renderItem(item)));
      wrap.push(list);
    }
    els.day.replaceChildren(...wrap);
  }

  function render(tasks) {
    lastTasks = tasks;
    const active = tasks.filter((t) => t.status === "active");
    renderDay(renderGrid(active));
  }

  function go(months) {
    monthStart = Dates.addMonths(monthStart, months);
    selected = monthStart;
    render(lastTasks);
  }

  function init() {
    els.prev.addEventListener("click", () => go(-1));
    els.next.addEventListener("click", () => go(1));
    els.today.addEventListener("click", () => {
      selected = Dates.todayISO();
      monthStart = selected.slice(0, 8) + "01";
      render(lastTasks);
    });
    window.TasksView.onLoad(render);
  }

  window.MonthView = { init };
})();

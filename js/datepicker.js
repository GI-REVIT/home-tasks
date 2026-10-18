// בורר תאריך מתוך לוח עברי (חודש עברי, עם התאריך הלועזי והחגים).
(function () {
  const WEEKDAY_HEADERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const gregorianMonth = new Intl.DateTimeFormat("he", { month: "long", year: "numeric" });

  const $ = (id) => document.getElementById(id);
  const els = {
    dialog: $("date-dialog"),
    title: $("picker-title"),
    sub: $("picker-sub"),
    grid: $("picker-grid"),
    holidays: $("picker-holidays"),
    prev: $("picker-prev"),
    next: $("picker-next"),
    today: $("picker-today"),
    close: $("picker-close"),
  };

  let viewStart = null; // היום הראשון של החודש העברי המוצג
  let selected = null;
  let onPick = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function gregorianRange(first, last) {
    const a = gregorianMonth.format(Dates.toDate(first));
    const b = gregorianMonth.format(Dates.toDate(last));
    return a === b ? a : `${a} – ${b}`;
  }

  function render() {
    const length = Hebrew.monthLength(viewStart);
    const last = Dates.addDays(viewStart, length - 1);
    const today = Dates.todayISO();

    els.title.textContent = Hebrew.monthYear(viewStart);
    els.sub.textContent = gregorianRange(viewStart, last);

    const nodes = WEEKDAY_HEADERS.map((name) => el("div", "pk-weekday", name));
    for (let i = 0; i < Dates.weekday(viewStart); i++) nodes.push(el("div", "pk-blank"));

    const listed = [];
    for (let i = 0; i < length; i++) {
      const iso = Dates.addDays(viewStart, i);
      const holidays = Hebrew.holidays(iso);
      const special = holidays.filter((h) => h.kind !== "rc");
      const parsed = Dates.parse(iso);

      const btn = el("button", "pk-day");
      btn.type = "button";
      if (iso === selected) btn.classList.add("selected");
      if (iso === today) btn.classList.add("today");
      if (special.length) btn.classList.add(special.some((h) => h.kind === "yomtov") ? "yomtov" : "holiday");
      if (holidays.length) btn.title = holidays.map((h) => h.name).join(", ");
      btn.appendChild(el("span", "pk-heb", Hebrew.dayLetters(iso)));
      btn.appendChild(el("span", "pk-greg", i === 0 || parsed.d === 1 ? `${parsed.d}/${parsed.m}` : String(parsed.d)));
      btn.addEventListener("click", () => pick(iso));
      nodes.push(btn);

      if (special.length) listed.push({ iso, names: special.map((h) => h.name).join(", ") });
    }
    els.grid.replaceChildren(...nodes);

    els.holidays.replaceChildren(
      ...listed.map(({ iso, names }) => {
        const li = el("li");
        li.appendChild(el("strong", "", `${Hebrew.dayLetters(iso)}: `));
        li.appendChild(document.createTextNode(`${names} (${Dates.formatDate(iso)})`));
        return li;
      })
    );
  }

  function pick(iso) {
    els.dialog.close();
    if (onPick) onPick(iso);
  }

  function open(options) {
    selected = options.value || Dates.todayISO();
    onPick = options.onPick;
    viewStart = Hebrew.monthStart(selected);
    render();
    els.dialog.showModal();
  }

  function init() {
    els.prev.addEventListener("click", () => {
      viewStart = Hebrew.prevMonthStart(viewStart);
      render();
    });
    els.next.addEventListener("click", () => {
      viewStart = Hebrew.nextMonthStart(viewStart);
      render();
    });
    els.today.addEventListener("click", () => pick(Dates.todayISO()));
    els.close.addEventListener("click", () => els.dialog.close());
  }

  init();
  window.DatePicker = { open };
})();

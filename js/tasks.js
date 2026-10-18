// ניהול משימות: רשימה, סינון, הוספה, עריכה ומחיקה.
(function () {
  const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "מוצאי שבת"]; // 0 = ראשון; משימה שבועית ליום שבת מתבצעת במוצאי שבת
  const STATUS_LABELS = { active: "פעילה", paused: "מושהית", completed: "הושלמה" };

  let db = null;
  let tasks = [];
  let editingId = null;
  const loadListeners = [];

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $("tasks-list"),
    message: $("tasks-message"),
    newBtn: $("new-task-btn"),
    filterType: $("filter-type"),
    filterStatus: $("filter-status"),
    filterAssignee: $("filter-assignee"),
    dialog: $("task-dialog"),
    dialogTitle: $("task-dialog-title"),
    form: $("task-form"),
    formError: $("task-form-error"),
    saveBtn: $("task-save-btn"),
    cancelBtn: $("task-cancel-btn"),
    title: $("f-title"),
    description: $("f-description"),
    type: $("f-type"),
    dueDate: $("f-due-date"),
    dueDateBox: $("due-date-box"),
    dueDateBtn: $("f-due-date-btn"),
    monthDay: $("f-month-day"),
    monthDayBox: $("month-day-box"),
    monthDayLabel: $("month-day-label"),
    monthDayHint: $("month-day-hint"),
    monthCalendar: $("f-month-calendar"),
    monthCalendarBox: $("month-calendar-box"),
    modeBox: $("mode-box"),
    dueTime: $("f-due-time"),
    recurrenceBox: $("recurrence-box"),
    kind: $("f-kind"),
    every: $("f-every"),
    everyBox: $("every-box"),
    daysBox: $("days-box"),
    mode: $("f-mode"),
    minutes: $("f-minutes"),
    assignee: $("f-assignee"),
    status: $("f-status"),
  };

  // ---------- עזרים ----------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function recurrenceText(t) {
    if (t.type !== "recurring") return "";
    let text = "";
    switch (t.recurrence_kind) {
      case "daily":
        text = "כל יום";
        break;
      case "interval":
        text = `כל ${t.recurrence_every} ימים`;
        break;
      case "weekly":
        text = "שבועית: " + (t.recurrence_days || []).map((d) => WEEKDAYS[d]).join(", ");
        break;
      case "monthly":
        if (t.recurrence_calendar === "hebrew") {
          text = `חודשית עברית, ${Hebrew.gematriya(t.recurrence_month_day)} בחודש`;
        } else {
          text = t.recurrence_month_day ? `חודשית, ביום ${t.recurrence_month_day}` : "חודשית";
        }
        break;
      case "yearly":
        text = "שנתית";
        break;
    }
    const fixedDay = t.recurrence_kind === "weekly" || t.recurrence_kind === "monthly";
    if (fixedDay && t.recurrence_mode !== "after_completion") return text;
    const mode = t.recurrence_mode === "after_completion" ? "לפי ביצוע" : "לפי לוח";
    return `${text} (${mode})`;
  }

  function friendlyError(error) {
    const msg = (error && error.message) || "";
    if (error && error.code === "42501") {
      return "אין הרשאה לשמור נתונים. יש להריץ את חלק ההרשאות (grant) מקובץ supabase/schema.sql.";
    }
    if (msg.includes("recurrence_calendar")) {
      return "חסר שדה לוח עברי בבסיס הנתונים. יש להריץ ב-Supabase את שורת ה-SQL של recurrence_calendar.";
    }
    if (msg.includes("recurrence_month_day")) {
      return "חסר שדה יום בחודש בבסיס הנתונים. יש להריץ ב-Supabase את שורת ה-SQL של recurrence_month_day.";
    }
    return "הפעולה נכשלה: " + (msg || "שגיאה לא מוכרת");
  }

  // תאריך היעד נשמר כתאריך לועזי (YYYY-MM-DD) ומוצג גם בעברית.
  function setDueDate(iso) {
    els.dueDate.value = iso;
    els.dueDateBtn.textContent = `${Hebrew.format(iso)} · ${Dates.formatDate(iso)}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- טעינה ותצוגה ----------

  async function load() {
    els.message.textContent = "טוען…";
    const { data, error } = await db
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true });
    if (error) {
      els.message.textContent = friendlyError(error);
      return;
    }
    tasks = data || [];
    refreshAssigneeFilter();
    render();
    loadListeners.forEach((fn) => fn(tasks));
  }

  function refreshAssigneeFilter() {
    const current = els.filterAssignee.value;
    const names = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort();
    els.filterAssignee.replaceChildren(new Option("הכל", ""));
    names.forEach((n) => els.filterAssignee.add(new Option(n, n)));
    els.filterAssignee.value = names.includes(current) ? current : "";
  }

  function filteredTasks() {
    const type = els.filterType.value;
    const status = els.filterStatus.value;
    const assignee = els.filterAssignee.value;
    return tasks.filter(
      (t) =>
        (!type || t.type === type) &&
        (!status || t.status === status) &&
        (!assignee || t.assignee === assignee)
    );
  }

  function render() {
    const items = filteredTasks();
    els.list.replaceChildren();
    if (tasks.length === 0) {
      els.message.textContent = "אין עדיין משימות. אפשר להוסיף משימה חדשה.";
      return;
    }
    els.message.textContent = items.length === 0 ? "אין משימות שמתאימות לסינון." : `${items.length} משימות`;
    items.forEach((t) => els.list.appendChild(renderTask(t)));
  }

  function renderTask(t) {
    const li = el("li", "task" + (t.status !== "active" ? " inactive" : ""));

    const main = el("div", "task-main");
    main.appendChild(el("div", "task-title", t.title));
    if (t.description) main.appendChild(el("div", "muted", t.description));

    const meta = el("div", "task-meta");
    const due = `${formatDate(t.due_date)} · ${Hebrew.short(t.due_date)}` + (t.due_time ? " " + t.due_time.slice(0, 5) : "");
    meta.appendChild(el("span", "badge", "יעד: " + due));
    meta.appendChild(el("span", "badge", t.type === "recurring" ? "חוזרת" : "חד-פעמית"));
    if (t.type === "recurring") meta.appendChild(el("span", "badge", recurrenceText(t)));
    if (t.estimated_minutes != null) meta.appendChild(el("span", "badge", `${t.estimated_minutes} דק׳ משוער`));
    if (t.assignee) meta.appendChild(el("span", "badge", "אחראי: " + t.assignee));
    if (t.status !== "active") meta.appendChild(el("span", "badge warn", STATUS_LABELS[t.status]));
    main.appendChild(meta);

    const actions = el("div", "task-actions");
    const editBtn = el("button", "", "עריכה");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => openForm(t));
    const delBtn = el("button", "ghost", "מחיקה");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => removeTask(t));
    actions.append(editBtn, delBtn);

    li.append(main, actions);
    return li;
  }

  // ---------- טופס ----------

  function syncRecurrenceFields() {
    const recurring = els.type.value === "recurring";
    const kind = els.kind.value;
    const fixedDay = recurring && (kind === "weekly" || kind === "monthly");
    els.recurrenceBox.hidden = !recurring;
    els.everyBox.hidden = !recurring || kind !== "interval";
    els.daysBox.hidden = !recurring || kind !== "weekly";
    els.monthDayBox.hidden = !recurring || kind !== "monthly";
    els.monthCalendarBox.hidden = !recurring || kind !== "monthly";
    syncMonthDayField();
    // בשבועית ובחודשית בוחרים יום קבוע, ולכן אין תאריך יעד ידני ואין בחירת אופן חישוב.
    els.dueDateBox.hidden = fixedDay;
    els.modeBox.hidden = fixedDay;
  }

  function isHebrewMonthly() {
    return els.monthCalendar.value === "hebrew";
  }

  // יום בחודש: 1-31 בלוח לועזי, 1-30 בלוח עברי (עם הצגת האות).
  function syncMonthDayField() {
    const hebrew = isHebrewMonthly();
    els.monthDayLabel.textContent = hebrew ? "יום בחודש העברי (1–30)" : "יום בחודש (1–31)";
    els.monthDay.max = hebrew ? 30 : 31;
    const n = Number(els.monthDay.value);
    els.monthDayHint.textContent = hebrew && Number.isInteger(n) && n >= 1 && n <= 30 ? Hebrew.gematriya(n) : "";
  }

  function defaultMonthDay() {
    const iso = els.dueDate.value || todayISO();
    return isHebrewMonthly() ? Hebrew.parts(iso).day : Dates.parse(iso).d;
  }

  function selectedDays() {
    return [...els.daysBox.querySelectorAll("input[name=day]:checked")].map((c) => Number(c.value));
  }

  function openForm(task) {
    editingId = task ? task.id : null;
    els.dialogTitle.textContent = task ? "עריכת משימה" : "משימה חדשה";
    els.formError.textContent = "";

    els.title.value = task ? task.title : "";
    els.description.value = task ? task.description || "" : "";
    els.type.value = task ? task.type : "one_time";
    setDueDate(task ? task.due_date : todayISO());
    els.dueTime.value = task && task.due_time ? task.due_time.slice(0, 5) : "";
    els.kind.value = task && task.recurrence_kind ? task.recurrence_kind : "daily";
    els.every.value = task && task.recurrence_every ? task.recurrence_every : 2;
    els.monthCalendar.value = task && task.recurrence_calendar === "hebrew" ? "hebrew" : "gregorian";
    els.monthDay.value = task && task.recurrence_month_day ? task.recurrence_month_day : defaultMonthDay();
    els.mode.value = task && task.recurrence_mode ? task.recurrence_mode : "schedule";
    const days = task && task.recurrence_days ? task.recurrence_days : [];
    els.daysBox.querySelectorAll("input[name=day]").forEach((c) => {
      c.checked = days.includes(Number(c.value));
    });
    els.minutes.value = task && task.estimated_minutes != null ? task.estimated_minutes : "";
    els.assignee.value = task ? task.assignee || "" : "";
    els.status.value = task ? task.status : "active";

    syncRecurrenceFields();
    els.dialog.showModal();
    els.title.focus();
  }

  function buildPayload() {
    const title = els.title.value.trim();
    if (!title) return { error: "יש להזין כותרת." };

    const recurring = els.type.value === "recurring";
    const kind = els.kind.value;
    const fixedDay = recurring && (kind === "weekly" || kind === "monthly");
    if (!fixedDay && !els.dueDate.value) return { error: "יש להזין תאריך יעד." };

    const existing = editingId ? tasks.find((t) => t.id === editingId) : null;
    const payload = {
      title,
      description: els.description.value.trim() || null,
      type: els.type.value,
      due_date: els.dueDate.value,
      due_time: els.dueTime.value || null,
      recurrence_kind: null,
      recurrence_every: null,
      recurrence_days: null,
      recurrence_mode: null,
      estimated_minutes: els.minutes.value === "" ? null : Number(els.minutes.value),
      assignee: els.assignee.value.trim() || null,
      status: els.status.value,
      updated_at: new Date().toISOString(),
    };

    if (payload.estimated_minutes !== null && (!Number.isInteger(payload.estimated_minutes) || payload.estimated_minutes < 0)) {
      return { error: "זמן משוער חייב להיות מספר שלם, 0 ומעלה." };
    }

    // השדה recurrence_month_day נשלח רק כשצריך, כדי שמשימות אחרות ימשיכו להישמר גם לפני עדכון בסיס הנתונים.
    let monthDay = null;
    if (recurring) {
      payload.recurrence_kind = kind;
      payload.recurrence_mode = fixedDay ? "schedule" : els.mode.value;
      if (kind === "interval") {
        const every = Number(els.every.value);
        if (!Number.isInteger(every) || every < 1) return { error: "מספר הימים חייב להיות 1 ומעלה." };
        payload.recurrence_every = every;
      }
      if (kind === "weekly") {
        const days = selectedDays();
        if (days.length === 0) return { error: "יש לבחור לפחות יום אחד בשבוע." };
        payload.recurrence_days = days;
      }
      if (kind === "monthly") {
        monthDay = Number(els.monthDay.value);
        const max = isHebrewMonthly() ? 30 : 31;
        if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > max) {
          return { error: `היום בחודש חייב להיות בין 1 ל-${max}.` };
        }
      }
    }
    if (monthDay !== null) {
      payload.recurrence_month_day = monthDay;
    } else if (existing && existing.recurrence_month_day != null) {
      payload.recurrence_month_day = null;
    }
    // השדה recurrence_calendar נשלח רק כשצריך, מאותה סיבה.
    const hebrewMonthly = monthDay !== null && isHebrewMonthly();
    if (hebrewMonthly) {
      payload.recurrence_calendar = "hebrew";
    } else if (existing && existing.recurrence_calendar != null) {
      payload.recurrence_calendar = null;
    }

    if (fixedDay) {
      // המועד הראשון נקבע לפי היום שנבחר. בעריכה שומרים את המועד הקיים אם הוא עדיין מתאים.
      const rule = {
        recurrence_kind: kind,
        recurrence_days: payload.recurrence_days,
        recurrence_month_day: monthDay,
        recurrence_calendar: hebrewMonthly ? "hebrew" : null,
      };
      const keep =
        existing &&
        existing.type === "recurring" &&
        existing.recurrence_kind === kind &&
        (existing.recurrence_calendar === "hebrew") === hebrewMonthly &&
        Dates.matchesRule(rule, existing.due_date);
      payload.due_date = keep ? existing.due_date : Dates.firstOnOrAfter(rule, todayISO());
    }
    return { payload };
  }

  async function saveTask(event) {
    event.preventDefault();
    els.formError.textContent = "";
    const { payload, error: validationError } = buildPayload();
    if (validationError) {
      els.formError.textContent = validationError;
      return;
    }

    els.saveBtn.disabled = true;
    const query = editingId
      ? db.from("tasks").update(payload).eq("id", editingId)
      : db.from("tasks").insert(payload);
    const { error } = await query;
    els.saveBtn.disabled = false;

    if (error) {
      els.formError.textContent = friendlyError(error);
      return;
    }
    els.dialog.close();
    await load();
  }

  async function removeTask(task) {
    const ok = window.confirm(`למחוק את "${task.title}"? גם היסטוריית הביצועים שלה תימחק.`);
    if (!ok) return;
    const { error } = await db.from("tasks").delete().eq("id", task.id);
    if (error) {
      els.message.textContent = friendlyError(error);
      return;
    }
    await load();
  }

  // ---------- אתחול ----------

  function init(client) {
    db = client;
    els.newBtn.addEventListener("click", () => openForm(null));
    els.dueDateBtn.addEventListener("click", () =>
      window.DatePicker.open({ value: els.dueDate.value || todayISO(), onPick: setDueDate })
    );
    els.cancelBtn.addEventListener("click", () => els.dialog.close());
    els.form.addEventListener("submit", saveTask);
    els.type.addEventListener("change", syncRecurrenceFields);
    els.kind.addEventListener("change", syncRecurrenceFields);
    els.monthCalendar.addEventListener("change", () => {
      els.monthDay.value = defaultMonthDay();
      syncMonthDayField();
    });
    els.monthDay.addEventListener("input", syncMonthDayField);
    [els.filterType, els.filterStatus, els.filterAssignee].forEach((f) => f.addEventListener("change", render));
  }

  window.TasksView = {
    init,
    load,
    getTasks: () => tasks,
    recurrenceText,
    onLoad: (fn) => loadListeners.push(fn),
  };
})();

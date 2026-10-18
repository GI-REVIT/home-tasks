// מסכי "היום" ו"השבוע", וסימון משימה כבוצעה.
(function () {
  const WEEK_DAYS = 7;
  const $ = (id) => document.getElementById(id);
  const els = {
    todayDate: $("today-date"),
    todayTotal: $("today-total"),
    todayMessage: $("today-message"),
    overdueHeading: $("overdue-heading"),
    overdueList: $("overdue-list"),
    todayHeading: $("today-heading"),
    todayList: $("today-list"),
    weekDays: $("week-days"),
    dialog: $("complete-dialog"),
    dialogTitle: $("complete-title"),
    form: $("complete-form"),
    minutes: $("c-minutes"),
    error: $("complete-error"),
    saveBtn: $("complete-save-btn"),
    cancelBtn: $("complete-cancel-btn"),
  };

  let db = null;
  let completing = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatMinutes(total) {
    if (total < 60) return `${total} דק׳`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} שע׳ ${m} דק׳` : `${h} שע׳`;
  }

  function sumMinutes(items) {
    return items.reduce((sum, i) => sum + (i.task.estimated_minutes || 0), 0);
  }

  function byTimeThenTitle(a, b) {
    const ta = a.task.due_time || "99:99";
    const tb = b.task.due_time || "99:99";
    return ta.localeCompare(tb) || a.task.title.localeCompare(b.task.title, "he");
  }

  function friendlyError(error) {
    if (error && error.code === "42501") {
      return "אין הרשאה לשמור נתונים. יש להריץ את חלק ההרשאות (grant) מקובץ supabase/schema.sql.";
    }
    return "הפעולה נכשלה: " + ((error && error.message) || "שגיאה לא מוכרת");
  }

  // תגיות חגים ומועדים ליום מסוים.
  function holidayTags(iso) {
    return Hebrew.holidays(iso).map((h) => el("span", "holiday-tag kind-" + h.kind, h.name));
  }

  // כותרת יום: "יום ראשון, 18/10 · ז׳ בחשוון" עם תגיות חגים.
  function dayHeading(iso, suffix) {
    const wrap = el("div", "day-title");
    wrap.appendChild(el("h3", "", `${Dates.dayLabel(iso)} · ${Hebrew.short(iso)}${suffix || ""}`));
    holidayTags(iso).forEach((tag) => wrap.appendChild(tag));
    return wrap;
  }

  // משימות לפי תאריך בטווח [from, to]. משימה באיחור מוצבת ב"היום" (overdueAt = "today")
  // או בתאריך היעד המקורי שלה (overdueAt = "due"). מופעים עתידיים של משימה חוזרת אינם ניתנים לסימון.
  function itemsByDate(active, from, to, overdueAt) {
    const today = Dates.todayISO();
    const tomorrow = Dates.addDays(today, 1);
    const map = new Map();
    const put = (date, item) => {
      if (date < from || date > to) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    };
    active.forEach((task) => {
      if (task.due_date < today) {
        put(overdueAt === "today" ? today : task.due_date, { task, overdue: true, actionable: true });
        Dates.occurrences(task, from > tomorrow ? from : tomorrow, to).forEach((d) =>
          put(d, { task, actionable: false })
        );
      } else {
        Dates.occurrences(task, from, to).forEach((d) => put(d, { task, actionable: d === task.due_date }));
      }
    });
    map.forEach((items) => items.sort(byTimeThenTitle));
    return map;
  }

  // ---------- תצוגה ----------

  function renderItem(item) {
    const t = item.task;
    const li = el("li", "task" + (item.actionable ? "" : " inactive"));
    const main = el("div", "task-main");
    main.appendChild(el("div", "task-title", t.title));
    if (t.description) main.appendChild(el("div", "muted", t.description));

    const meta = el("div", "task-meta");
    if (item.overdue) {
      meta.appendChild(el("span", "badge warn", "באיחור מ-" + Dates.formatDate(t.due_date)));
    }
    if (t.due_time) meta.appendChild(el("span", "badge", t.due_time.slice(0, 5)));
    if (t.type === "recurring") meta.appendChild(el("span", "badge", window.TasksView.recurrenceText(t)));
    if (t.estimated_minutes != null) meta.appendChild(el("span", "badge", `${t.estimated_minutes} דק׳ משוער`));
    if (t.assignee) meta.appendChild(el("span", "badge", "אחראי: " + t.assignee));
    main.appendChild(meta);
    li.appendChild(main);

    if (item.actionable) {
      const actions = el("div", "task-actions");
      const doneBtn = el("button", "primary", "בוצע");
      doneBtn.type = "button";
      doneBtn.addEventListener("click", () => openComplete(t));
      actions.appendChild(doneBtn);
      li.appendChild(actions);
    }
    return li;
  }

  function renderToday(active) {
    const today = Dates.todayISO();
    const overdue = active
      .filter((t) => t.due_date < today)
      .map((task) => ({ task, overdue: true, actionable: true }))
      .sort((a, b) => a.task.due_date.localeCompare(b.task.due_date) || byTimeThenTitle(a, b));
    const due = active
      .filter((t) => t.due_date === today)
      .map((task) => ({ task, actionable: true }))
      .sort(byTimeThenTitle);

    els.overdueList.replaceChildren(...overdue.map(renderItem));
    els.todayList.replaceChildren(...due.map(renderItem));
    els.overdueHeading.hidden = overdue.length === 0;
    els.todayHeading.hidden = due.length === 0 || overdue.length === 0;

    const all = overdue.concat(due);
    const heading = dayHeading(today);
    els.todayDate.replaceChildren(...heading.childNodes);
    els.todayMessage.textContent = all.length === 0 ? "אין משימות להיום ואין משימות באיחור." : "";
    els.todayTotal.textContent = all.length ? "סה״כ זמן משוער: " + formatMinutes(sumMinutes(all)) : "";
  }

  function renderWeek(active) {
    const today = Dates.todayISO();
    const end = Dates.addDays(today, WEEK_DAYS - 1);
    const byDate = itemsByDate(active, today, end, "today");

    const nodes = [];
    for (let i = 0; i < WEEK_DAYS; i++) {
      const date = Dates.addDays(today, i);
      const items = byDate.get(date) || [];
      const group = el("section", "day-group");
      const head = el("div", "day-head");
      head.appendChild(dayHeading(date, date === today ? " (היום)" : ""));
      if (items.length) head.appendChild(el("span", "muted", formatMinutes(sumMinutes(items))));
      group.appendChild(head);
      if (items.length === 0) {
        group.appendChild(el("p", "muted", "אין משימות"));
      } else {
        const list = el("ul", "tasks-list");
        items.forEach((i) => list.appendChild(renderItem(i)));
        group.appendChild(list);
      }
      nodes.push(group);
    }
    els.weekDays.replaceChildren(...nodes);
  }

  function render(tasks) {
    const active = tasks.filter((t) => t.status === "active");
    renderToday(active);
    renderWeek(active);
  }

  // ---------- סימון כבוצע ----------

  function openComplete(task) {
    completing = task;
    els.dialogTitle.textContent = "סימון כבוצע: " + task.title;
    els.minutes.value = task.estimated_minutes != null ? task.estimated_minutes : "";
    els.error.textContent = "";
    els.dialog.showModal();
    els.minutes.focus();
    els.minutes.select();
  }

  async function saveCompletion(event) {
    event.preventDefault();
    els.error.textContent = "";
    const task = completing;
    if (!task) return;

    let actual = null;
    if (els.minutes.value !== "") {
      actual = Number(els.minutes.value);
      if (!Number.isInteger(actual) || actual < 0) {
        els.error.textContent = "הזמן חייב להיות מספר שלם, 0 ומעלה.";
        return;
      }
    }

    els.saveBtn.disabled = true;
    try {
      const { error: insertError } = await db.from("completions").insert({
        task_id: task.id,
        occurrence_date: task.due_date,
        actual_minutes: actual,
      });
      // 23505 = המופע כבר נרשם (למשל ניסיון חוזר אחרי כשל). ממשיכים לעדכן את המשימה.
      if (insertError && insertError.code !== "23505") {
        els.error.textContent = friendlyError(insertError);
        return;
      }

      const patch = { updated_at: new Date().toISOString() };
      if (task.type === "one_time") {
        patch.status = "completed";
      } else {
        const next = Dates.nextDueDate(task, Dates.todayISO());
        if (!next) {
          els.error.textContent = "לא ניתן לחשב את המועד הבא של המשימה. יש לבדוק את הגדרות החזרתיות.";
          return;
        }
        patch.due_date = next;
      }
      const { error: updateError } = await db.from("tasks").update(patch).eq("id", task.id);
      if (updateError) {
        els.error.textContent = "הביצוע נרשם, אך עדכון המשימה נכשל. אפשר ללחוץ שוב על שמירה. " + friendlyError(updateError);
        return;
      }
      els.dialog.close();
      await window.TasksView.load();
    } finally {
      els.saveBtn.disabled = false;
    }
  }

  function init(client) {
    db = client;
    els.form.addEventListener("submit", saveCompletion);
    els.cancelBtn.addEventListener("click", () => els.dialog.close());
    window.TasksView.onLoad(render);
  }

  window.AgendaView = { init, renderItem, itemsByDate, holidayTags, dayHeading, formatMinutes, sumMinutes };
})();

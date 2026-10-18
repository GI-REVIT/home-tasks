(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};

  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");
  const configWarning = document.getElementById("config-warning");

  const configured =
    SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.startsWith("PASTE_") && !SUPABASE_ANON_KEY.startsWith("PASTE_");

  if (!configured || !window.supabase) {
    configWarning.hidden = false;
    loginView.hidden = false;
    return;
  }

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  window.TasksView.init(db);
  window.AgendaView.init(db);

  const views = {
    today: document.getElementById("today-view"),
    week: document.getElementById("week-view"),
    all: document.getElementById("tasks-view"),
  };
  const tabs = document.querySelectorAll("#tabs .tab");

  function showView(name) {
    Object.entries(views).forEach(([key, section]) => {
      section.hidden = key !== name;
    });
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    showView("today");
    window.TasksView.load();
  }

  function showLogin() {
    appView.hidden = true;
    loginView.hidden = false;
  }

  function loginErrorText(error) {
    const msg = (error.message || "").toLowerCase();
    if (error.code === "invalid_credentials" || msg.includes("invalid login credentials")) {
      return "המייל או הסיסמה שגויים.";
    }
    if (error.code === "email_not_confirmed" || msg.includes("not confirmed")) {
      return "המשתמש עדיין לא אושר ב-Supabase (יש לסמן Auto Confirm User).";
    }
    if (msg.includes("invalid api key") || msg.includes("apikey")) {
      return "מפתח החיבור ל-Supabase שגוי. יש לבדוק את js/config.js.";
    }
    return "הכניסה נכשלה: " + (error.message || "שגיאה לא מוכרת");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const submitBtn = loginForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    const { error } = await db.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });

    submitBtn.disabled = false;
    if (error) {
      loginError.textContent = loginErrorText(error);
      return;
    }
    loginForm.reset();
    showApp();
  });

  logoutBtn.addEventListener("click", async () => {
    await db.auth.signOut();
    showLogin();
  });

  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      showApp();
    } else {
      showLogin();
    }
  });
})();

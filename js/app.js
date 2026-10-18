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

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
  }

  function showLogin() {
    appView.hidden = true;
    loginView.hidden = false;
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
      loginError.textContent = "הכניסה נכשלה. בדקי את המייל והסיסמה.";
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

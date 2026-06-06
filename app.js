// --- CONFIG ---
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// --- STATE ---
let currentUsername = "";
let currentMonth = new Date();
let parameters = {
    members: 0,
    claims: 0,
    level: 0
};
let commitments = {};

// --- API HELPERS ---
async function apiGet(path) {
    const res = await fetch(`/api/data?path=${path}&_t=${Date.now()}`);
    return res.json();
}

async function apiPost(path, data) {
    const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, data })
    });
    return res.json();
}

async function apiPut(path, data) {
    const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, data })
    });
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch('/api/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    return res.json();
}

// --- AUTH LOGIC ---
function getDisplayName(username) {
    return username === "admin" ? "Mantix" : username;
}

function checkAuthState() {
    const loginOverlay = document.getElementById('login-overlay');
    const appLayout = document.getElementById('app-main-layout');
    const userDisplay = document.getElementById('user-display');

    const savedUser = localStorage.getItem('tax_user');
    const lastActivity = localStorage.getItem('tax_last_activity');
    
    if (savedUser && lastActivity) {
        if (Date.now() - parseInt(lastActivity) > SESSION_TIMEOUT) {
            logout();
            return;
        }
    }

    if (savedUser) {
        currentUsername = savedUser;
        updateActivity();
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appLayout) appLayout.style.display = 'block';
        userDisplay.textContent = `Uživatel: ${getDisplayName(currentUsername)}`;
        initApp();
    } else {
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (appLayout) appLayout.style.display = 'none';
    }
}

// --- MODAL LOGIC ---
function showModal(title, message, onConfirm) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    const close = () => {
        modal.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
        onConfirm();
        close();
    };

    cancelBtn.onclick = close;
}

function updateActivity() {
    localStorage.setItem('tax_last_activity', Date.now().toString());
}

function logout() {
    localStorage.removeItem('tax_user');
    localStorage.removeItem('tax_last_activity');
    currentUsername = "";
    location.reload();
}

function setupLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = loginForm.querySelector('button');
        const loginUsername = document.getElementById('login-username').value;
        const loginPass = document.getElementById('login-password').value;
        const loginError = document.getElementById('login-error');

        submitBtn.textContent = "Přihlašuji...";
        submitBtn.disabled = true;

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPass })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('tax_user', loginUsername);
                localStorage.setItem('tax_last_activity', Date.now().toString());
                location.reload();
            } else {
                loginError.textContent = "Chyba: " + (data.message || "Neplatné údaje");
            }
        } catch (err) {
            loginError.textContent = "Chyba při komunikaci se serverem";
        } finally {
            submitBtn.textContent = "Přihlásit se";
            submitBtn.disabled = false;
        }
    });
}

// --- APP LOGIC ---
async function initApp() {
    await loadData();
    renderCalendar();
    setupEventListeners();
}

async function loadData() {
    try {
        const [paramsData, commitmentsData] = await Promise.all([
            apiGet('parameters'),
            apiGet('commitments')
        ]);
        
        if (paramsData) {
            parameters = { ...parameters, ...paramsData };
            document.getElementById('param-members').value = parameters.members;
            document.getElementById('param-claims').value = parameters.claims;
            document.getElementById('param-level').value = parameters.level;
            updateCalculation();
        }

        if (commitmentsData) {
            commitments = commitmentsData;
        }
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function updateCalculation() {
    const members = parseInt(document.getElementById('param-members').value) || 0;
    const claims = parseInt(document.getElementById('param-claims').value) || 0;
    const level = parseInt(document.getElementById('param-level').value) || 0;
    
    // Vzorec: Počet členů * 0.25 * Počet claimů * Level * 15
    const amount = members * 0.25 * claims * level * 15;
    document.getElementById('tax-amount').textContent = Math.round(amount).toLocaleString() + " $";
}

async function saveParameters() {
    const saveBtn = document.getElementById('save-params');
    saveBtn.disabled = true;
    saveBtn.textContent = "Ukládám...";

    const newParams = {
        members: parseInt(document.getElementById('param-members').value) || 0,
        claims: parseInt(document.getElementById('param-claims').value) || 0,
        level: parseInt(document.getElementById('param-level').value) || 0
    };

    try {
        await apiPut('parameters', newParams);
        parameters = newParams;
        updateCalculation();
    } catch (err) {
        alert("Chyba při ukládání parametrů");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Uložit parametry";
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('current-month-year');
    
    grid.innerHTML = '';
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const monthNames = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    // Header days
    const days = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
    days.forEach(day => {
        const div = document.createElement('div');
        div.className = 'calendar-day header-day';
        div.textContent = day;
        grid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Adjust for Monday start (JS 0 is Sunday)
    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    // Days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        renderDay(day, 'other-month');
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= lastDay.getDate(); i++) {
        let classes = '';
        if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            classes = 'today';
        }
        renderDay(i, classes);
    }

    // Days from next month
    const totalSlots = 42; // 6 rows
    const currentSlots = startDay + lastDay.getDate();
    for (let i = 1; i <= (totalSlots - currentSlots); i++) {
        renderDay(i, 'other-month');
    }
}

function renderDay(dayNumber, classes) {
    const grid = document.getElementById('calendar-grid');
    const div = document.createElement('div');
    div.className = `calendar-day ${classes}`;
    
    const isMainMonth = !classes.includes('other-month');
    const dateStr = isMainMonth ? formatDate(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber) : null;

    div.innerHTML = `<span class="day-number">${dayNumber}</span>`;
    
    if (isMainMonth && commitments[dateStr]) {
        const username = commitments[dateStr];
        const userDiv = document.createElement('div');
        userDiv.className = `day-user ${username === 'admin' ? 'is-admin' : ''}`;
        userDiv.textContent = getDisplayName(username);
        userDiv.title = getDisplayName(username);
        div.appendChild(userDiv);
    }

    if (isMainMonth) {
        div.onclick = () => toggleCommitment(dateStr);
    }

    grid.appendChild(div);
}

function formatDate(year, month, day) {
    const m = (month + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${year}-${m}-${d}`;
}

async function toggleCommitment(dateStr) {
    if (commitments[dateStr]) {
        if (commitments[dateStr] === currentUsername) {
            showModal("Zrušení závazku", `Chcete zrušit svůj závazek na ${dateStr}?`, async () => {
                try {
                    await apiDelete(`commitments/${dateStr}`);
                    delete commitments[dateStr];
                    renderCalendar();
                } catch (err) {
                    alert("Chyba při rušení závazku");
                }
            });
        } else {
            showModal("Obsazeno", `Tento den už si zabral(a) ${getDisplayName(commitments[dateStr])}.`, () => {});
            // Skryjeme tlačítko zrušit pro info modaly
            const cancelBtn = document.getElementById('modal-cancel');
            cancelBtn.style.display = 'none';
            // Obnovíme ho při zavření (řešeno v showModal resetu příště, nebo tady jednoduše)
            const confirmBtn = document.getElementById('modal-confirm');
            const originalConfirmClick = confirmBtn.onclick;
            confirmBtn.onclick = () => {
                if (originalConfirmClick) originalConfirmClick();
                cancelBtn.style.display = 'block';
            };
        }
    } else {
        showModal("Nový závazek", `Chcete se přihlásit k placení daní na ${dateStr}?`, async () => {
            try {
                await apiPut(`commitments/${dateStr}`, currentUsername);
                commitments[dateStr] = currentUsername;
                renderCalendar();
            } catch (err) {
                alert("Chyba při ukládání závazku");
            }
        });
    }
}

function setupEventListeners() {
    document.getElementById('logout-button').onclick = logout;
    document.getElementById('save-params').onclick = saveParameters;
    
    document.getElementById('param-members').oninput = updateCalculation;
    document.getElementById('param-claims').oninput = updateCalculation;
    document.getElementById('param-level').oninput = updateCalculation;

    document.getElementById('prev-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
    };

    document.getElementById('next-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
    };

    // Auto-update activity on mouse/key
    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    checkAuthState();
});

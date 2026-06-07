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
    if (!username) return "";
    let name = username === "admin" ? "Mantix" : username;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

const USER_COLORS = [
    "#2ecc71", "#3498db", "#9b59b6", "#f1c40f", "#e74c3c", 
    "#1abc9c", "#d35400", "#c0392b", "#8e44ad", "#27ae60",
    "#2980b9", "#16a085", "#2c3e50"
];

function getUserColor(username) {
    if (username === "admin") return "#f39c12"; // Mantix orange
    
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % USER_COLORS.length;
    return USER_COLORS[index];
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
function showModal(title, message, onConfirm, isInfo = false) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
    
    cancelBtn.style.display = isInfo ? 'none' : 'block';

    const close = () => {
        modal.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
        if (onConfirm) onConfirm();
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
        const loginUsername = document.getElementById('login-username').value.trim().toLowerCase();
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
    
    // Denní základ (např. daň za claimy a level)
    const dailyBase = 0.25 * claims * level * 15;
    
    // Celková daň za skupinu (vynásobená počtem členů)
    const totalTax = members * dailyBase;
    document.getElementById('tax-amount').textContent = Math.round(totalTax).toLocaleString() + " $";

    // Měsíční nájem na člena: (celková denní daň * 7 / počet členů)
    // Pokud je denní daň počítána jako (dailyBase * members), 
    // pak nájem na člena je prostě dailyBase * 7.
    // Ale pokud se "Denní částka" bere jako fixní základ (dailyBase), pak:
    const rentPerMember = members > 0 ? (dailyBase * 7 / members) : 0;
    
    document.getElementById('rent-per-member').textContent = Math.round(rentPerMember).toLocaleString() + " $";
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
        showModal("Chyba", "Chyba při ukládání parametrů", null, true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Uložit";
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
    
    let startDay = firstDay.getDay() - 1;
    if (startDay === -1) startDay = 6;

    // Days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
        renderDay(prevMonthLastDay - i, 'other-month');
    }

    // Current month days
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        let classes = '';
        const currentIterDate = new Date(year, month, i);
        
        if (currentIterDate.getTime() === today.getTime()) {
            classes = 'today';
        } else if (currentIterDate < today) {
            classes = 'past-day';
        }
        renderDay(i, classes);
    }

    // Days from next month
    const totalSlots = 42;
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
        
        // Apply unique user color
        userDiv.style.background = getUserColor(username);
        
        div.appendChild(userDiv);
    }

    if (isMainMonth && !classes.includes('past-day')) {
        div.onclick = () => toggleCommitment(dateStr);
    }

    grid.appendChild(div);
}

function formatDate(year, month, day) {
    const m = (month + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function formatCzechDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const monthNames = [
        "ledna", "února", "března", "dubna", "května", "června",
        "července", "srpna", "září", "října", "listopadu", "prosince"
    ];
    return `${parseInt(day)}. ${monthNames[parseInt(month) - 1]} ${year}`;
}

async function toggleCommitment(dateStr) {
    const readableDate = formatCzechDate(dateStr);
    
    if (commitments[dateStr]) {
        if (commitments[dateStr] === currentUsername) {
            showModal("Zrušení závazku", `Chcete zrušit svůj závazek na ${readableDate}?`, async () => {
                try {
                    await apiDelete(`commitments/${dateStr}`);
                    delete commitments[dateStr];
                    renderCalendar();
                } catch (err) {
                    showModal("Chyba", "Chyba při rušení závazku", null, true);
                }
            });
        } else {
            showModal("Obsazeno", `Tento den už si zabral(a) ${getDisplayName(commitments[dateStr])}.`, null, true);
        }
    } else {
        showModal("Nový závazek", `Chcete se přihlásit k placení daní na ${readableDate}?`, async () => {
            try {
                await apiPut(`commitments/${dateStr}`, currentUsername);
                commitments[dateStr] = currentUsername;
                renderCalendar();
            } catch (err) {
                showModal("Chyba", "Chyba při ukládání závazku", null, true);
            }
        });
    }
}

function setupEventListeners() {
    document.getElementById('logout-button').onclick = logout;
    document.getElementById('save-params').onclick = saveParameters;
    
    ['param-members', 'param-claims', 'param-level'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.oninput = updateCalculation;
            el.onchange = updateCalculation;
        }
    });

    document.getElementById('prev-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
    };

    document.getElementById('next-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
    };

    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    checkAuthState();
});

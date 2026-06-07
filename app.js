// --- CONFIG ---
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// --- STATE ---
let currentUsername = "";
let currentMonth = new Date();
let currentWeekDate = new Date();
let parameters = {
    members: 0,
    claims: 0,
    level: 0
};
let commitments = {};
let membersList = [];
let payments = {};

// --- HELPERS ---
function getWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Adjust to Thursday in current week to decide year
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${weekNo}`;
}

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const format = (dt) => `${dt.getDate()}.${dt.getMonth() + 1}.`;
    return `${format(monday)} - ${format(sunday)}`;
}

function changeWeek(delta) {
    currentWeekDate.setDate(currentWeekDate.getDate() + (delta * 7));
    renderPayments();
}

function step(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    const newVal = Math.max(0, (parseInt(el.value) || 0) + delta);
    el.value = newVal;
    updateCalculation();
}

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
    matchHeights();
    window.addEventListener('resize', matchHeights);
}

function matchHeights() {
    if (window.innerWidth <= 1024) {
        // Reset heights on mobile
        document.querySelector('.content .card').style.height = 'auto';
        document.querySelector('.right-sidebar .card').style.height = 'auto';
        return;
    }

    const leftSidebar = document.querySelector('.left-sidebar');
    const contentCard = document.querySelector('.content .card');
    const rightCard = document.querySelector('.right-sidebar .card');

    if (leftSidebar && contentCard && rightCard) {
        const targetHeight = leftSidebar.offsetHeight - 32; // -32 for card margin-bottom compensation
        contentCard.style.height = targetHeight + 'px';
        rightCard.style.height = targetHeight + 'px';
    }
}

async function loadData() {
    try {
        const [paramsData, commitmentsData, membersData, paymentsData] = await Promise.all([
            apiGet('parameters'),
            apiGet('commitments'),
            apiGet('members'),
            apiGet('payments')
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

        if (membersData) {
            // Convert object to array if needed (Firebase push keys)
            membersList = Array.isArray(membersData) ? membersData : Object.values(membersData);
        }

        if (paymentsData) {
            payments = paymentsData;
        }

        renderPayments();
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function renderPayments() {
    const listEl = document.getElementById('members-payment-list');
    const adminActions = document.getElementById('admin-member-actions');
    const weekKey = getWeekKey(currentWeekDate);
    const weekRange = getWeekRange(currentWeekDate);
    
    document.getElementById('current-week-display').textContent = weekRange;
    
    listEl.innerHTML = '';
    
    // Everyone who has access is a manager/admin
    const isAdmin = !!currentUsername; 
    if (isAdmin) {
        adminActions.style.display = 'block';
    }

    const weekData = payments[weekKey] || {};
    const weekStatus = weekData.status || weekData || {}; // Handle old data format too

    // Determine which member list to use
    let displayList = [];
    if (weekData.membersSnapshot) {
        displayList = Array.isArray(weekData.membersSnapshot) ? weekData.membersSnapshot : Object.values(weekData.membersSnapshot);
    } else {
        displayList = [...membersList];
    }

    displayList.sort().forEach(member => {
        // Find payment info
        const paidBy = weekStatus[member];
        const isPaid = !!paidBy;

        const div = document.createElement('div');
        div.className = `payment-item ${isPaid ? 'paid' : ''}`;

        let metaHtml = '';
        if (isPaid && typeof paidBy === 'string' && paidBy !== 'true') {
            metaHtml = `<small class="paid-meta">Přijal: ${getDisplayName(paidBy)}</small>`;
        }

        div.innerHTML = `
            <div class="payment-info">
                <span class="member-name">${member}</span>
                ${metaHtml}
            </div>
            <div style="display: flex; align-items: center;">
                <label class="custom-checkbox">
                    <input type="checkbox" ${isPaid ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            </div>
        `;

        // Click on the row to toggle (as long as it's not the checkbox itself)
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('checkmark')) {
                togglePayment(member, !isPaid);
            }
        };
        
        const checkbox = div.querySelector('input');
        checkbox.onchange = (e) => togglePayment(member, e.target.checked);

        listEl.appendChild(div);
    });

    const realCurrentWeekKey = getWeekKey(new Date());
    const viewingPastWeek = weekKey < realCurrentWeekKey;

    if (weekData.membersSnapshot && viewingPastWeek) {
        const info = document.createElement('div');
        info.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 10px; font-style: italic;';
        info.textContent = 'Zobrazen archivovaný seznam pro tento týden';
        listEl.appendChild(info);
    }
}

function openMemberMgmt() {
    const modal = document.getElementById('member-mgmt-modal');
    const listEl = document.getElementById('mgmt-member-list');
    listEl.innerHTML = '';

    membersList.sort().forEach(member => {
        const div = document.createElement('div');
        div.className = 'payment-item';
        div.style.cursor = 'default';
        div.innerHTML = `
            <span class="member-name">${member}</span>
            <button class="remove-member-btn" style="display: block; opacity: 1;">Odebrat</button>
        `;

        div.querySelector('.remove-member-btn').onclick = () => {
            showModal("Smazat člena", `Opravdu chcete navždy odebrat člena "${member}"?`, async () => {
                await removeMember(member);
                openMemberMgmt(); // Refresh mgmt list
            });
        };

        listEl.appendChild(div);
    });

    modal.style.display = 'flex';
}

async function togglePayment(member, status) {
    const weekKey = getWeekKey(currentWeekDate);
    try {
        if (status) {
            // First time this week? Save snapshot of current members
            if (!payments[weekKey] || !payments[weekKey].membersSnapshot) {
                await apiPut(`payments/${weekKey}/membersSnapshot`, membersList);
                if (!payments[weekKey]) payments[weekKey] = {};
                payments[weekKey].membersSnapshot = [...membersList];
            }

            await apiPut(`payments/${weekKey}/status/${member}`, currentUsername);
            if (!payments[weekKey].status) payments[weekKey].status = {};
            payments[weekKey].status[member] = currentUsername;
        } else {
            // Check if data is in the old flat format or new nested format
            const isOldFormat = payments[weekKey] && payments[weekKey][member] && !payments[weekKey].status;
            
            if (isOldFormat) {
                await apiDelete(`payments/${weekKey}/${member}`);
                delete payments[weekKey][member];
            } else {
                await apiDelete(`payments/${weekKey}/status/${member}`);
                if (payments[weekKey] && payments[weekKey].status) {
                    delete payments[weekKey].status[member];
                }
            }
        }
        renderPayments();
    } catch (err) {
        showModal("Chyba", "Chyba při ukládání platby", null, true);
    }
}

async function addMember() {
    const input = document.getElementById('new-member-name');
    const name = input.value.trim();
    if (!name) return;

    if (membersList.includes(name)) {
        showModal("Info", "Tento člen již existuje", null, true);
        return;
    }

    try {
        await apiPost('members', name);
        
        // Refresh local list from server
        const updatedMembers = await apiGet('members');
        membersList = Array.isArray(updatedMembers) ? updatedMembers : Object.values(updatedMembers);
        
        // SYNC WITH CURRENT AND FUTURE SNAPSHOTS:
        const realCurrentWeekKey = getWeekKey(new Date());
        
        // Iterate through all stored weeks and update snapshots for current or future weeks
        for (const [weekKey, weekData] of Object.entries(payments)) {
            if (weekKey >= realCurrentWeekKey && weekData.membersSnapshot) {
                await apiPut(`payments/${weekKey}/membersSnapshot`, membersList);
                payments[weekKey].membersSnapshot = [...membersList];
            }
        }

        input.value = '';
        renderPayments();
    } catch (err) {
        showModal("Chyba", "Chyba při přidávání člena", null, true);
    }
}

async function removeMember(name) {
    try {
        const membersData = await apiGet('members');
        let targetKey = null;
        
        if (membersData && typeof membersData === 'object') {
            for (const [key, val] of Object.entries(membersData)) {
                if (val === name) {
                    targetKey = key;
                    break;
                }
            }
        }

        if (targetKey !== null) {
            await apiDelete(`members/${targetKey}`);
            membersList = membersList.filter(m => m !== name);
            
            // SYNC WITH CURRENT AND FUTURE SNAPSHOTS:
            const realCurrentWeekKey = getWeekKey(new Date());
            for (const [weekKey, weekData] of Object.entries(payments)) {
                if (weekKey >= realCurrentWeekKey && weekData.membersSnapshot) {
                    await apiPut(`payments/${weekKey}/membersSnapshot`, membersList);
                    payments[weekKey].membersSnapshot = [...membersList];
                }
            }

            renderPayments();
        }
    } catch (err) {
        showModal("Chyba", "Chyba při odebírání člena", null, true);
    }
}

function updateCalculation() {
    const members = parseInt(document.getElementById('param-members').value) || 0;
    const claims = parseInt(document.getElementById('param-claims').value) || 0;
    const level = parseInt(document.getElementById('param-level').value) || 0;
    
    // Celková denní daň za celou skupinu
    // Vzorec: Počet členů * 0.25 * Počet claimů * Level * 15
    const totalDailyTax = members * 0.25 * claims * level * 15;
    document.getElementById('tax-amount').textContent = Math.round(totalDailyTax).toLocaleString() + " $";

    // Týdenní nájem na člena: (celková denní daň * 7 / počet členů)
    const rentPerMember = members > 0 ? (totalDailyTax * 7 / members) : 0;
    
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

    document.getElementById('add-member-btn').onclick = addMember;
    document.getElementById('new-member-name').onkeypress = (e) => {
        if (e.key === 'Enter') addMember();
    };

    document.getElementById('prev-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
    };

    document.getElementById('next-month').onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
    };

    document.getElementById('prev-week').onclick = () => changeWeek(-1);
    document.getElementById('next-week').onclick = () => changeWeek(1);

    const mgmtBtn = document.getElementById('manage-members-btn');
    if (mgmtBtn) mgmtBtn.onclick = openMemberMgmt;

    const closeMgmtBtn = document.getElementById('close-mgmt-btn');
    if (closeMgmtBtn) {
        closeMgmtBtn.onclick = () => {
            document.getElementById('member-mgmt-modal').style.display = 'none';
        };
    }

    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keypress', updateActivity);
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    checkAuthState();
});

/**
 * Application Tour de Garde
 * Gère la co-parentalité avec un système de règles et d'exceptions.
 */

let state = {
    step: 1,
    config: {
        standard_mode: 'simple', // simple, custom
        weekday_parent: 'A', // A or B (pour mode simple)
        weekend_type: 'alternating', // alternating, all_a, all_b
        alt_week_transition_day: 3, // 1=Lundi, 2=Mardi, 3=Mercredi, etc.
        alt_week_start_parent: 'A', // Parent en semaine 1
        vacations: [], // { name: '...', start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', type: 'alternating' }
        exceptions: {}, // 'YYYY-MM-DD': 'A' or 'B'
        transfers: {
            standard: {
                type: 'school_transit',
                time: '16:30',
                location: 'École'
            },
            standard_daily: {
                '3': { // Mercredi — récupération au centre de loisirs
                    type: 'pickup',
                    time: '11:30',
                    location: 'Centre de loisirs'
                },
                '0': { // Dimanche — échange direct
                    type: 'direct_exchange',
                    time: '18:00',
                    location: 'Domicile Parent A'
                }
            },
            vacation: {
                type: 'direct_exchange',
                time: '18:00',
                location: 'Gare / Aéroport'
            }
        },
        custom_locations: [],
        weekly_template: ['A', 'A', 'A', 'A', 'A', 'A', 'A'] // Lundi à Dimanche
    },
    today: new Date()
};

state.currentDate = new Date(state.today.getFullYear(), state.today.getMonth(), 1);

let fetchedHolidays = []; // Cache pour les données de l'API
const API_KEY = 'f066877195ab846ece4c7eb85ca75e7a2c84442db5d048c3bab05d58';

// Helpers
function toLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDay = new Date(date.getTime() - (offset * 60 * 1000));
    return localDay.toISOString().split('T')[0];
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    renderStep();
    if (state.step > 3) {
        showCalendar();
    }
});

// --- Gestion du Wizard ---

function goToStep2() {
    if (state.config.standard_mode === 'simple') {
        nextStep('2-simple');
    } else if (state.config.standard_mode === 'alternating_week') {
        nextStep('2-alternating');
    } else {
        nextStep('2-custom');
        renderTemplateGrid();
    }
}

function nextStep(step) {
    state.step = step;
    saveState();
    renderStep();
}

function renderStep() {
    const steps = document.querySelectorAll('.step-content');
    steps.forEach(s => s.classList.remove('active'));

    const currentId = `step-${state.step}`;

    const current = document.getElementById(currentId);
    if (current) {
        current.classList.add('active');
    }

    // S'assurer que les listes de l'étape 4 sont injectées quand on y accède
    if (state.step === 4) {
        if (typeof renderDailyTransfers === 'function') renderDailyTransfers();
        if (typeof renderLocationsList === 'function') renderLocationsList();
    }
}

function toggleTemplateDay(index) {
    const current = state.config.weekly_template[index];
    const next = (current === 'A') ? 'B' : 'A';
    state.config.weekly_template[index] = next;
    renderTemplateGrid();
    saveState();
}

function renderTemplateGrid() {
    state.config.weekly_template.forEach((parent, i) => {
        const el = document.getElementById(`tpl-${i}`);
        if (el) {
            el.className = `day parent-${parent.toLowerCase()}`;
            el.textContent = parent;
            el.style.backgroundColor = (parent === 'A') ? 'var(--parent-a)' : 'var(--parent-b)';
            el.style.color = 'white';
        }
    });
}

function selectOption(el, name, value) {
    const parent = el.closest('.option-group');
    if (parent) {
        parent.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
    }
    state.config[name] = value;
    saveState();
}

/**
 * Affiche un aperçu des vacances officielles pour la zone sélectionnée via l'API.
 */
async function previewHolidays() {
    const zone = document.getElementById('holiday_zone').value;
    const preview = document.getElementById('holiday-preview');
    if (!zone) {
        preview.innerHTML = '';
        return;
    }

    preview.innerHTML = '<div class="loader"></div><span>Récupération des dates officielles...</span>';

    try {
        // Récupération de l'année scolaire actuelle et de la suivante pour une planification longue durée
        const currentYear = new Date().getFullYear();
        const yearCurrent = `${currentYear - 1}-${currentYear}`;
        const yearNext = `${currentYear}-${currentYear + 1}`;
        const yearFollowing = `${currentYear + 1}-${currentYear + 2}`;

        // On construit une requête qui récupère les 3 années potentielles pour couvrir tout le calendrier visible
        const whereClause = `zones = '${zone}' AND annee_scolaire IN ('${yearCurrent}', '${yearNext}', '${yearFollowing}')`;
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=${encodeURIComponent(whereClause)}&order_by=start_date&limit=100`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Apikey ${API_KEY}`
            }
        });
        const data = await response.json();

        // Filtrage des doublons (l'API renvoie parfois une ligne par académie)
        const uniqueHolidays = [];
        const seenHolidays = new Set();

        data.results.forEach(r => {
            if (!r.description.toLowerCase().includes('vacances')) return;
            // On utilise la description et la date de début comme clé d'unicité
            const key = `${r.description}-${r.start_date}`;
            if (!seenHolidays.has(key)) {
                seenHolidays.add(key);
                uniqueHolidays.push({
                    name: r.description.split('-')[0].trim(),
                    start: r.start_date.split('T')[0],
                    end: r.end_date.split('T')[0]
                });
            }
        });

        fetchedHolidays = uniqueHolidays;

        if (fetchedHolidays.length === 0) {
            preview.innerHTML = 'Aucune donnée trouvée pour cette zone.';
            return;
        }

        let html = '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
        fetchedHolidays.forEach(h => {
            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 6px 0; font-weight:600; color:var(--text-primary)">${h.name}</td>
                        <td style="padding: 6px 0; text-align:right; font-size: 0.8rem;">${h.start} au ${h.end}</td>
                    </tr>`;
        });
        html += '</table>';
        preview.innerHTML = html;
    } catch (error) {
        console.error(error);
        preview.innerHTML = '<span style="color:var(--danger)">Erreur de connexion. Vérifiez votre clé API ou saisissez manuellement.</span>';
    }
}

function importOfficialHolidays() {
    if (fetchedHolidays.length === 0) {
        alert("Veuillez d'abord sélectionner une zone et attendre le chargement.");
        return;
    }

    fetchedHolidays.forEach(h => {
        if (!state.config.vacations.some(v => v.start === h.start)) {
            state.config.vacations.push({
                name: h.name,
                start: h.start,
                end: h.end,
                type: 'alternating'
            });
        }
    });

    renderVacations();
    saveState();
}

function setWeekendStart(parent) {
    state.config.weekend_start = parent;

    // UI Update
    document.getElementById('btn-start-a').classList.toggle('btn-primary', parent === 'A');
    document.getElementById('btn-start-a').classList.toggle('btn-secondary', parent !== 'A');
    document.getElementById('btn-start-b').classList.toggle('btn-primary', parent === 'B');
    document.getElementById('btn-start-b').classList.toggle('btn-secondary', parent !== 'B');

    saveState();
}

function updateTransfer(mode, field, value) {
    if (!state.config.transfers[mode]) {
        if (mode === 'vacation') {
            state.config.transfers[mode] = {
                type: 'direct_exchange',
                time: '18:00',
                location: 'Gare / Aéroport'
            };
        } else {
            state.config.transfers[mode] = {
                type: 'school_transit',
                time: '08:30',
                location: 'École'
            };
        }
    }
    state.config.transfers[mode][field] = value;

    if (field === 'location') {
        addCustomLocation(value);
    }

    // Mettre à jour le texte d'aide quand le type change
    if (field === 'type') {
        updateTransferTypeUI(mode);
    }

    saveState();
}

function resetTransfersToDefaults() {
    if (!confirm("Voulez-vous remplacer votre configuration actuelle par des exemples types (École, Mercredi centre, Dimanche soir) ?")) return;

    state.config.transfers = {
        standard: {
            type: 'school_transit',
            time: '16:30',
            location: 'École'
        },
        standard_daily: {
            '3': { // Mercredi
                type: 'pickup',
                time: '11:30',
                location: 'Centre de loisirs'
            },
            '0': { // Dimanche
                type: 'direct_exchange',
                time: '18:00',
                location: 'Domicile Parent A'
            }
        },
        vacation: {
            type: 'direct_exchange',
            time: '18:00',
            location: 'Gare / Aéroport'
        }
    };

    saveState();
    updateWizardUI();
}

function updateTransferTypeUI(mode) {
    const config = state.config.transfers[mode];
    if (!config) return;
    const prefix = mode === 'vacation' ? 'trans_vac' : 'trans_std';
    const helpTexts = {
        'school_transit': "L'enfant transite par l'école. Le parent sortant dépose le matin, le parent entrant récupère le soir.",
        'pickup': "Le parent qui prend la garde se déplace pour récupérer l'enfant.",
        'dropoff': "Le parent qui termine sa garde amène l'enfant à l'autre parent.",
        'direct_exchange': "Les deux parents se retrouvent au même endroit pour le passage de garde."
    };

    const helpEl = document.getElementById(`${prefix}_help`);
    if (helpEl) {
        helpEl.textContent = helpTexts[config.type] || '';
    }
}

function addCustomLocation(loc) {
    const trimmed = loc.trim();
    if (trimmed === '') return;
    const defaults = ['École', 'Domicile Parent A', 'Domicile Parent B', 'Gare', 'Domicile'];
    if (!defaults.includes(trimmed) && !state.config.custom_locations.includes(trimmed)) {
        state.config.custom_locations.push(trimmed);
        renderLocationsList();
        saveState();
    }
}

function removeCustomLocation(index) {
    state.config.custom_locations.splice(index, 1);
    renderLocationsList();
    saveState();
}

function renderLocationsList() {
    const datalist = document.getElementById('suggested-locations');
    if (!datalist) return;
    datalist.innerHTML = `
        <option value="École">
        <option value="Domicile Parent A">
        <option value="Domicile Parent B">
        <option value="Gare">
    `;
    state.config.custom_locations.forEach(loc => {
        datalist.innerHTML += `<option value="${loc}">`;
    });

    const customListUI = document.getElementById('custom-locations-list');
    if (customListUI) {
        customListUI.innerHTML = '';
        state.config.custom_locations.forEach((loc, index) => {
            const tag = document.createElement('div');
            tag.style.display = 'inline-flex';
            tag.style.alignItems = 'center';
            tag.style.gap = '8px';
            tag.style.padding = '4px 12px';
            tag.style.borderRadius = '16px';
            tag.style.background = 'rgba(255,255,255,0.1)';
            tag.style.border = '1px solid var(--glass-border)';
            tag.style.fontSize = '0.8rem';
            tag.style.color = 'white';
            tag.style.marginBottom = '8px';
            tag.style.marginRight = '8px';
            tag.innerHTML = `
                <span>${loc}</span>
                <button onclick="removeCustomLocation(${index})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.2rem;line-height:0;padding:2px;">&times;</button>
            `;
            customListUI.appendChild(tag);
        });

        const container = document.getElementById('custom-locations-container');
        if (container) {
            container.style.display = state.config.custom_locations.length > 0 ? 'block' : 'none';
        }
    }
}

const DAY_NAMES = {
    '1': 'Lundi', '2': 'Mardi', '3': 'Mercredi', '4': 'Jeudi', '5': 'Vendredi', '6': 'Samedi', '0': 'Dimanche'
};

function addDailyTransfer(day) {
    if (!state.config.transfers.standard_daily) {
        state.config.transfers.standard_daily = {};
    }

    if (state.config.transfers.standard_daily[day]) {
        alert("Une exception existe déjà pour ce jour.");
        return;
    }

    const std = state.config.transfers.standard;
    state.config.transfers.standard_daily[day] = {
        type: std.type,
        time: std.time,
        location: std.location
    };

    saveState();
    renderDailyTransfers();
}

function removeDailyTransfer(day) {
    delete state.config.transfers.standard_daily[day];
    saveState();
    renderDailyTransfers();
}

function updateDailyTransfer(day, field, value) {
    state.config.transfers.standard_daily[day][field] = value;
    if (field === 'location') {
        addCustomLocation(value);
    }
    saveState();
    if (field === 'type') {
        renderDailyTransfers();
    }
}

function renderDailyTransfers() {
    const container = document.getElementById('daily-transfers-list');
    if (!container) return;

    container.innerHTML = '';

    if (!state.config.transfers.standard_daily) return;

    const days = Object.keys(state.config.transfers.standard_daily).sort();

    const helpTexts = {
        'school_transit': "L'enfant transite par l'école/crèche",
        'pickup': "Le parent qui prend la garde va chercher l'enfant",
        'dropoff': "Le parent qui finit la garde amène l'enfant",
        'direct_exchange': "Les deux parents se retrouvent au même endroit"
    };

    days.forEach(day => {
        const trans = state.config.transfers.standard_daily[day];
        const dayName = DAY_NAMES[day];

        const block = document.createElement('div');
        block.style.marginBottom = '1rem';
        block.style.padding = '1rem';
        block.style.background = 'rgba(255,255,255,0.05)';
        block.style.borderRadius = '8px';
        block.style.position = 'relative';

        block.innerHTML = `
            <button onclick="removeDailyTransfer('${day}')" style="position:absolute; top:8px; right:8px; background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;">&times;</button>
            <h5 style="margin-bottom: 0.8rem; color: var(--accent-primary);">${dayName}</h5>
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                <select class="btn" style="width:100%; padding:0.5rem; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border);" onchange="updateDailyTransfer('${day}', 'type', this.value)">
                    <option value="school_transit" ${trans.type === 'school_transit' ? 'selected' : ''}>📚 Via l'école</option>
                    <option value="pickup" ${trans.type === 'pickup' ? 'selected' : ''}>🚗 Récupération</option>
                    <option value="dropoff" ${trans.type === 'dropoff' ? 'selected' : ''}>🚗 Dépôt</option>
                    <option value="direct_exchange" ${trans.type === 'direct_exchange' ? 'selected' : ''}>🤝 Échange direct</option>
                </select>
                <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; font-style: italic;">${helpTexts[trans.type] || ''}</p>
                <div style="display: grid; grid-template-columns: 120px 1fr; gap: 0.5rem;">
                    <input type="time" class="btn time-input" value="${trans.time}" style="padding:0.4rem; font-size:0.8rem; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border);" onchange="updateDailyTransfer('${day}', 'time', this.value)">
                    <input type="text" list="suggested-locations" class="btn" value="${trans.location}" placeholder="Lieu..." style="padding:0.4rem; font-size:0.8rem; background: rgba(0,0,0,0.2); color: white; border: 1px solid var(--glass-border);" onchange="updateDailyTransfer('${day}', 'location', this.value)">
                </div>
            </div>
        `;
        container.appendChild(block);
    });
}

function addVacation() {
    const start = document.getElementById('vac_start').value;
    const end = document.getElementById('vac_end').value;
    const type = document.getElementById('vac_type').value;

    if (!start || !end) {
        alert("Veuillez sélectionner des dates.");
        return;
    }

    state.config.vacations.push({ name: 'Manuel', start, end, type });
    renderVacations();
    saveState();
}


function removeVacation(index) {
    state.config.vacations.splice(index, 1);
    renderVacations();
    saveState();
}

function editVacation(index) {
    const v = state.config.vacations[index];
    document.getElementById('vac_start').value = v.start;
    document.getElementById('vac_end').value = v.end;
    document.getElementById('vac_type').value = v.type;

    // On met en forme pour re-modifier
    state.config.vacations.splice(index, 1);
    renderVacations();
    saveState();
}

function renderVacations() {
    const list = document.getElementById('vacation-list');
    list.innerHTML = '';

    if (state.config.vacations.length > 0) {
        const title = document.createElement('h3');
        title.textContent = 'Vacances enregistrées';
        title.style.fontSize = '1rem';
        title.style.marginTop = '1.5rem';
        title.style.marginBottom = '1rem';
        list.appendChild(title);
    }

    state.config.vacations.forEach((v, index) => {
        const item = document.createElement('div');
        item.className = 'vacation-item';
        item.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-weight: 600; color: var(--accent-primary); font-size: 0.8rem;">${v.name || 'Vacances'}</span>
                <span style="font-size: 0.9rem;">${v.start} au ${v.end}</span>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${translateType(v.type)}</span>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <button class="btn-edit" onclick="editVacation(${index})" style="background:transparent; border:none; color:var(--text-primary); cursor:pointer; font-size:1.2rem;">✎</button>
                <button class="btn-remove" onclick="removeVacation(${index})">&times;</button>
            </div>
        `;
        list.appendChild(item);
    });

    // Débloquer le bouton suivant si des vacances existent
    const btnNext = document.getElementById('btn-next-step-3');
    const msg = document.getElementById('import-msg');

    if (btnNext && msg) {
        if (state.config.vacations.length > 0) {
            btnNext.disabled = false;
            msg.innerHTML = '<span style="color:var(--parent-a);">✓ Vacances configurées.</span>';
        } else {
            btnNext.disabled = true;
            msg.innerHTML = '<span style="color:var(--danger);">Veuillez importer ou ajouter des vacances.</span>';
        }
    }
}

function translateType(type) {
    switch (type) {
        case 'alternating': return 'Une semaine sur deux';
        case 'all_a': return 'Parent A uniquement';
        case 'all_b': return 'Parent B uniquement';
        default: return type;
    }
}

function finishWizard() {
    state.step = 4;
    saveState();
    showCalendar();
}

function restartWizard() {
    state.step = 1;
    document.getElementById('calendar-view').style.display = 'none';

    const eventsListView = document.getElementById('events-list-view');
    if (eventsListView) eventsListView.style.display = 'none';

    document.getElementById('wizard').style.display = 'block';
    renderStep();
    saveState();
}

// --- Logique de Calcul du Gardien ---

/**
 * Détermine quel parent a la garde pour une date donnée.
 * Ordre de priorité : Exceptions > Vacances > Week-ends > Semaine
 */
function getGuardian(date) {
    const dateStr = toLocalDateString(date);

    // 1. Vérification des exceptions manuelles (clics sur le calendrier)
    if (state.config.exceptions[dateStr]) {
        return state.config.exceptions[dateStr];
    }

    // 2. Vérification des vacances scolaires
    for (const vac of state.config.vacations) {
        if (dateStr >= vac.start && dateStr <= vac.end) {
            if (vac.type === 'all_a') return 'A';
            if (vac.type === 'all_b') return 'B';
            if (vac.type === 'alternating') {
                // Alternance hebdomadaire à partir du début de la période de vacances
                const startDate = new Date(vac.start);
                const diffTime = Math.abs(date - startDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const weekIndex = Math.floor(diffDays / 7);
                return (weekIndex % 2 === 0) ? 'A' : 'B';
            }
        }
    }

    // 3. Planning Standard
    if (state.config.standard_mode === 'custom') {
        const dayOfWeek = (date.getDay() === 0) ? 6 : date.getDay() - 1; // 0-6 (Mon-Sun)
        return state.config.weekly_template[dayOfWeek] || 'A';
    }

    // 4. Mode Semaine Alternée (Ex: Mercredi au Mercredi)
    if (state.config.standard_mode === 'alternating_week') {
        const refDate = new Date(2024, 0, 1); // Un lundi de référence
        let diffDays = Math.floor((date - refDate) / (1000 * 60 * 60 * 24));

        // Ajuster selon le jour de relève (1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam, 7=Dim)
        const transitionDay = parseInt(state.config.alt_week_transition_day) || 1;
        diffDays -= (transitionDay - 1);

        const weekIndex = Math.floor(diffDays / 7);
        const isStartParent = (weekIndex % 2 === 0);
        const startParent = state.config.alt_week_start_parent || 'A';
        const otherParent = (startParent === 'A') ? 'B' : 'A';

        return isStartParent ? startParent : otherParent;
    }

    // Mode Simple
    const day = date.getDay(); // 0 = Dimanche, 6 = Samedi
    const isWeekend = (day === 0 || day === 6);

    if (isWeekend) {
        if (state.config.weekend_type === 'all_a') return 'A';
        if (state.config.weekend_type === 'all_b') return 'B';
        if (state.config.weekend_type === 'alternating') {
            let refDate = new Date(date);
            if (day === 0) refDate.setDate(refDate.getDate() - 1);

            const globalStart = new Date(2024, 0, 1);
            const diffTime = Math.abs(refDate - globalStart);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const weekIndex = Math.floor(diffDays / 7);

            const isStartParent = (weekIndex % 2 === 0);
            const startParent = state.config.weekend_start || 'A';
            const otherParent = (startParent === 'A') ? 'B' : 'A';

            return isStartParent ? startParent : otherParent;
        }
    }

    return state.config.weekday_parent;
}

// --- Rendu du Calendrier ---

function showCalendar() {
    document.getElementById('wizard').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'block';

    const eventsListView = document.getElementById('events-list-view');
    if (eventsListView) eventsListView.style.display = 'block';

    renderCalendar();
}

function renderCalendar() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    // Header
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

    const daysContainer = document.getElementById('calendar-days');
    daysContainer.innerHTML = '';

    // Premier jour du mois
    const firstDay = new Date(year, month, 1).getDay();
    // Ajustement pour Lundi comme premier jour (0 = Dimanche, donc on veut Lundi = 0)
    const offset = (firstDay === 0) ? 6 : firstDay - 1;

    // Jours vides au début (mois précédent)
    for (let i = 0; i < offset; i++) {
        const d = document.createElement('div');
        d.className = 'day outside';
        daysContainer.appendChild(d);
    }

    // Nombre de jours dans le mois
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
        const currentDate = new Date(year, month, i);
        const guardian = getGuardian(currentDate);
        const dateStr = toLocalDateString(currentDate);
        const isToday = dateStr === toLocalDateString(state.today);

        const dayEl = document.createElement('div');
        dayEl.className = `day parent-${guardian.toLowerCase()}${isToday ? ' today' : ''}`;
        dayEl.innerHTML = `<span>${i}</span>`;

        // Ajouter les badges de transfert
        const transfers = getTransferData(currentDate, guardian);
        if (transfers && transfers.length > 0) {
            const container = document.createElement('div');
            container.className = 'transfers-container';
            container.style.display = 'flex';
            container.style.gap = '4px';
            container.style.justifyContent = 'center';
            container.style.marginTop = '4px';

            transfers.forEach(t => {
                const badge = document.createElement('div');
                badge.style.width = '12px';
                badge.style.height = '12px';
                badge.style.borderRadius = '50%';
                badge.style.margin = '2px';
                badge.style.display = 'inline-block';

                if (t.type === 'direct_exchange') {
                    badge.style.background = `linear-gradient(135deg, var(--parent-${t.parentOut.toLowerCase()}) 50%, var(--parent-${t.parentIn.toLowerCase()}) 50%)`;
                    badge.style.border = '2px solid white';
                } else if (t.type === 'dropoff') {
                    badge.style.background = `var(--parent-${t.parentOut.toLowerCase()})`;
                    badge.style.border = '2px dashed rgba(255,255,255,0.5)';
                } else {
                    badge.style.background = `var(--parent-${t.parentIn.toLowerCase()})`;
                    badge.style.border = '2px solid white';
                }
                badge.title = getTransferTooltip(t);

                container.appendChild(badge);
            });
            dayEl.appendChild(container);
        }

        dayEl.onclick = () => toggleException(dateStr, guardian);

        daysContainer.appendChild(dayEl);
    }

    // Rendre la liste des événements textuelle pour ce mois
    renderMonthlyEvents();
}

function renderMonthlyEvents() {
    const container = document.getElementById('monthly-events-container');
    if (!container) return;
    container.innerHTML = '';

    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let eventsCount = 0;

    for (let i = 1; i <= daysInMonth; i++) {
        const currentDate = new Date(year, month, i);
        const guardian = getGuardian(currentDate);
        const transfers = getTransferData(currentDate, guardian);

        if (transfers && transfers.length > 0) {
            eventsCount++;

            const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
            const formattedDate = currentDate.toLocaleDateString('fr-FR', dateOptions);
            const capDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

            const eventBlock = document.createElement('div');
            eventBlock.style.background = 'rgba(255,255,255,0.03)';
            eventBlock.style.border = '1px solid var(--glass-border)';
            eventBlock.style.borderRadius = '8px';
            eventBlock.style.padding = '1rem';
            eventBlock.style.display = 'flex';
            eventBlock.style.flexDirection = 'column';
            eventBlock.style.gap = '0.5rem';

            let transfersHtml = '';

            transfers.forEach(t => {
                const dotBg = t.type === 'direct_exchange'
                    ? `linear-gradient(135deg, var(--parent-${t.parentOut.toLowerCase()}) 50%, var(--parent-${t.parentIn.toLowerCase()}) 50%)`
                    : t.type === 'dropoff'
                        ? `var(--parent-${t.parentOut.toLowerCase()})`
                        : `var(--parent-${t.parentIn.toLowerCase()})`;

                transfersHtml += `
                    <div style="display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.9rem;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${dotBg}; flex-shrink: 0; position: relative; top: 2px;"></span>
                        <span>${getTransferDescription(t)}</span>
                    </div>
                `;
            });

            eventBlock.innerHTML = `
                <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 0.2rem; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 0.4rem;">${capDate}</div>
                ${transfersHtml}
            `;
            container.appendChild(eventBlock);
        }
    }

    if (eventsCount === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">Aucun échange prévu ce mois-ci.</p>';
    }
}

/**
 * Génère le texte descriptif d'un transfert pour les tooltips du calendrier.
 */
function getTransferTooltip(t) {
    switch (t.type) {
        case 'school_transit':
            return `${t.time} — Passage via ${t.location} (Parent ${t.parentOut} ➔ Parent ${t.parentIn})`;
        case 'pickup':
            return `${t.time} — Parent ${t.parentIn} récupère l'enfant à ${t.location}`;
        case 'dropoff':
            return `${t.time} — Parent ${t.parentOut} dépose l'enfant à ${t.location}`;
        case 'direct_exchange':
            return `${t.time} — Échange direct à ${t.location} (Parent ${t.parentOut} ➔ Parent ${t.parentIn})`;
        default:
            return `${t.time} — Transfert à ${t.location}`;
    }
}

/**
 * Génère le HTML descriptif d'un transfert pour la liste mensuelle.
 */
function getTransferDescription(t) {
    switch (t.type) {
        case 'school_transit':
            return `📚 Passage de garde via <strong style="color: var(--accent-secondary);">${t.location}</strong> — Parent ${t.parentIn} récupère à <strong>${t.time}</strong>`;
        case 'pickup':
            return `🚗 Parent ${t.parentIn} <strong>récupère</strong> l'enfant à <strong style="color: var(--accent-secondary);">${t.location}</strong> à <strong>${t.time}</strong>`;
        case 'dropoff':
            return `🚗 Parent ${t.parentOut} <strong>dépose</strong> l'enfant à <strong style="color: var(--accent-secondary);">${t.location}</strong> à <strong>${t.time}</strong>`;
        case 'direct_exchange':
            return `🤝 Échange direct à <strong style="color: var(--accent-secondary);">${t.location}</strong> à <strong>${t.time}</strong> — Parent ${t.parentOut} ➔ Parent ${t.parentIn}`;
        default:
            return `${t.time} — Transfert à ${t.location}`;
    }
}

/**
 * Migre l'ancien format de transfert { start: {...}, end: {...} } vers le nouveau { type, time, location }.
 */
function migrateTransferConfig(config) {
    if (!config || config.type) return config; // Déjà au nouveau format
    if (!config.start) return config;

    // Si même heure et même lieu → échange direct
    if (config.start.time === config.end.time &&
        config.start.location.trim().toLowerCase() === config.end.location.trim().toLowerCase()) {
        return { type: 'direct_exchange', time: config.start.time, location: config.start.location };
    }
    // Si le lieu contient "école" → transit scolaire
    if (config.start.location.toLowerCase().includes('école') ||
        config.end.location.toLowerCase().includes('école')) {
        return { type: 'school_transit', time: config.start.time, location: config.start.location };
    }
    // Par défaut → récupération
    return { type: 'pickup', time: config.start.time, location: config.start.location };
}

/**
 * Détermine les événements de transfert pour une date donnée.
 * Retourne UN seul événement par changement de garde.
 */
function getTransferData(date, currentGuardian) {
    if (!state.config.transfers) return [];

    const dateStr = toLocalDateString(date);
    let isHol = false;
    for (const vac of state.config.vacations) {
        if (dateStr >= vac.start && dateStr <= vac.end) {
            isHol = true;
            break;
        }
    }

    let config = isHol ? state.config.transfers.vacation : state.config.transfers.standard;
    if (!config) return [];

    const transfers = [];

    // Détecter un changement de garde entre aujourd'hui et demain
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowGuardian = getGuardian(tomorrow);

    if (currentGuardian !== tomorrowGuardian) {
        // Vérifier les exceptions journalières (période scolaire uniquement)
        if (!isHol && state.config.transfers.standard_daily) {
            const dayOfWeek = date.getDay().toString();
            if (state.config.transfers.standard_daily[dayOfWeek]) {
                config = state.config.transfers.standard_daily[dayOfWeek];
            }
        }

        transfers.push({
            type: config.type,
            time: config.time,
            location: config.location,
            parentOut: currentGuardian,
            parentIn: tomorrowGuardian
        });
    }

    return transfers;
}

function toggleException(dateStr, currentGuardian) {
    const nextGuardian = (currentGuardian === 'A') ? 'B' : 'A';

    // Si l'exception rétablit le comportement par défaut, on peut la supprimer facultativement
    // mais ici on va juste alterner explicitement
    state.config.exceptions[dateStr] = nextGuardian;
    saveState();
    renderCalendar();
}

function prevMonth() {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    renderCalendar();
}

// --- Persistance ---

function saveState() {
    localStorage.setItem('tour_de_garde_state', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('tour_de_garde_state');
    if (saved) {
        const parsed = JSON.parse(saved);

        // Migration et fusion sécurisée de la config
        state.config = { ...state.config, ...parsed.config };
        state.step = parsed.step;

        // Migration: structures requises
        if (!state.config.weekly_template) {
            state.config.weekly_template = ['A', 'A', 'A', 'A', 'A', 'A', 'A'];
        }
        if (!state.config.custom_locations) {
            state.config.custom_locations = [];
        }
        if (!state.config.transfers.standard_daily) {
            state.config.transfers.standard_daily = {};
        }

        // Migration: ancien format { start, end } → nouveau format { type, time, location }
        if (state.config.transfers.standard && state.config.transfers.standard.start) {
            state.config.transfers.standard = migrateTransferConfig(state.config.transfers.standard);
        }
        if (state.config.transfers.vacation && state.config.transfers.vacation.start) {
            state.config.transfers.vacation = migrateTransferConfig(state.config.transfers.vacation);
        }
        if (state.config.transfers.standard_daily) {
            Object.keys(state.config.transfers.standard_daily).forEach(day => {
                const daily = state.config.transfers.standard_daily[day];
                if (daily && daily.start) {
                    state.config.transfers.standard_daily[day] = migrateTransferConfig(daily);
                }
            });
        }

        // Peupler les exemples par défaut au premier chargement
        if (!state.config.transfers.example_daily_initialized) {
            state.config.transfers.standard_daily = {
                '3': { type: 'pickup', time: '11:30', location: 'Centre de loisirs' },
                '0': { type: 'direct_exchange', time: '18:00', location: 'Domicile Parent A' }
            };
            state.config.transfers.example_daily_initialized = true;
            saveState();
        }

        // Sync UI for Steps 1 & 2
        renderVacations();
        updateWizardUI();

        if (state.config.vacations.length > 0) {
            renderVacations();
        }

        if (state.config.standard_mode === 'custom') {
            renderTemplateGrid();
        }
    }
}

function updateWizardUI() {
    // Synchronisation du début de l'alternance
    if (state.config.weekend_start) {
        setWeekendStart(state.config.weekend_start);
    }

    // Step 4 Transfer Sync (nouveau format)
    if (state.config.transfers) {
        if (state.config.transfers.standard) {
            const std = state.config.transfers.standard;
            const stdType = document.getElementById('trans_std_type');
            if (stdType) stdType.value = std.type;
            const stdTime = document.getElementById('trans_std_time');
            if (stdTime) stdTime.value = std.time;
            const stdLoc = document.getElementById('trans_std_location');
            if (stdLoc) stdLoc.value = std.location;
            updateTransferTypeUI('standard');
        }
        if (state.config.transfers.vacation) {
            const vac = state.config.transfers.vacation;
            const vacType = document.getElementById('trans_vac_type');
            if (vacType) vacType.value = vac.type;
            const vacTime = document.getElementById('trans_vac_time');
            if (vacTime) vacTime.value = vac.time;
            const vacLoc = document.getElementById('trans_vac_location');
            if (vacLoc) vacLoc.value = vac.location;
            updateTransferTypeUI('vacation');
        }
    }

    renderLocationsList();
    if (typeof renderDailyTransfers === 'function') {
        renderDailyTransfers();
    }
}

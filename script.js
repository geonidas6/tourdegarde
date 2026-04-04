/**
 * Application Tour de Garde
 * Gère la co-parentalité avec un système de règles et d'exceptions.
 */

let state = {
    step: 1,
    config: {
        standard_mode: 'simple', // 'simple' or 'custom'
        weekly_template: ['A', 'A', 'A', 'A', 'A', 'A', 'A'], // Mon-Sun
        weekday_parent: 'A',
        weekend_type: 'alternating', // alternating, all_a, all_b
        weekend_start: 'A', // Parent qui commence l'alternance
        vacations: [], // { name: '...', start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', type: 'alternating' }
        exceptions: {} // 'YYYY-MM-DD': 'A' or 'B'
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
        // Année scolaire demandée (2026-2027)
        const schoolYear = '2026-2027';
        
        // Utilisation du champ 'zones' et année dynamique demandée (2026-2027)
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=zones%20%3D%20'Zone%20${zone}'%20AND%20annee_scolaire%20%3D%20'${schoolYear}'&order_by=start_date&limit=20`;
        
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
            <button class="btn-remove" onclick="removeVacation(${index})">&times;</button>
        `;
        list.appendChild(item);
    });
}

function translateType(type) {
    switch(type) {
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
        dayEl.onclick = () => toggleException(dateStr, guardian);
        
        daysContainer.appendChild(dayEl);
    }
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
        
        // Sync UI for Steps 1 & 2
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
    // Step 1
    const s1 = document.querySelector(`#step-1 .option-card[onclick*="'${state.config.standard_mode}'"]`);
    if (s1) selectOption(s1, 'standard_mode', state.config.standard_mode);

    // Simple Mode Sync
    const s1_simple = document.querySelector(`#step-2-simple .option-card[onclick*="'${state.config.weekday_parent}'"]`);
    if (s1_simple) selectOption(s1_simple, 'weekday_parent', state.config.weekday_parent);

    const s2_simple = document.querySelector(`#step-2-simple .option-card[onclick*="'${state.config.weekend_type}'"]`);
    if (s2_simple) selectOption(s2_simple, 'weekend_type', state.config.weekend_type);
    
    // Sync Weekend Start UI
    setWeekendStart(state.config.weekend_start || 'A');
}

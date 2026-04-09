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
                start: { time: '16:30', location: 'École' },
                end: { time: '08:30', location: 'Domicile' }
            },
            vacation: {
                start: { time: '10:00', location: 'Domicile' },
                end: { time: '18:00', location: 'Domicile' }
            }
        },
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
        // Année scolaire en cours dynamique
        const currentYear = new Date().getFullYear();
        const schoolYear = (new Date().getMonth() >= 7) ? `${currentYear}-${currentYear+1}` : `${currentYear-1}-${currentYear}`;
        
        // Utilisation du champ 'zones' et année dynamique avec limite à 100 pour tout capturer
        const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=zones%20%3D%20'${zone}'%20AND%20annee_scolaire%20%3D%20'${schoolYear}'&order_by=start_date&limit=100`;
        
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

function updateTransfer(mode, type, field, value) {
    if (!state.config.transfers[mode]) {
        state.config.transfers[mode] = {
            start: { time: '10:00', location: 'Domicile' },
            end: { time: '18:00', location: 'Domicile' }
        };
    }
    state.config.transfers[mode][type][field] = value;
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
            const dayName = currentDate.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
            const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);

            transfers.forEach(t => {
                const badge = document.createElement('div');
                badge.className = `transfer-badge transfer-${t.type}`;
                const label = t.type === 'start' ? 'Début' : 'Fin';
                badge.innerHTML = `
                    <span style="font-weight:700;">${dayNameCap} ${t.time}</span>
                    <span style="opacity:0.9; font-size:0.6rem; font-weight:600;">${t.location}</span>
                `;
                badge.title = `${dayNameCap} : ${label} de garde à ${t.location}`;
                container.appendChild(badge);
            });
            dayEl.appendChild(container);
        }

        dayEl.onclick = () => toggleException(dateStr, guardian);
        
        daysContainer.appendChild(dayEl);
    }
}

function getTransferData(date, currentGuardian) {
    if (!state.config.transfers) return [];
    
    // Déterminer si on est en vacances pour choisir le bon set de transfert
    const dateStr = toLocalDateString(date);
    let isHol = false;
    for (const vac of state.config.vacations) {
        if (dateStr >= vac.start && dateStr <= vac.end) {
            isHol = true;
            break;
        }
    }
    
    // On utilise la configuration du jour actuel (ou demain si c'est une transition)
    const config = isHol ? state.config.transfers.vacation : state.config.transfers.standard;
    if (!config) return [];

    const transfers = [];

    // Détecter un changement entre AUJOURD'HUI et DEMAIN
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowGuardian = getGuardian(tomorrow);

    if (currentGuardian !== tomorrowGuardian) {
        // C'est un jour de transition : on affiche la fin du gardien actuel 
        // ET le début du gardien suivant sur ce même jour.
        transfers.push({ ...config.end, type: 'end' });
        transfers.push({ ...config.start, type: 'start' });
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

        // Migration logic: ensure weekly_template exists if missing from saved state
        if (!state.config.weekly_template) {
            state.config.weekly_template = ['A', 'A', 'A', 'A', 'A', 'A', 'A'];
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

    // Step 4 Transfer Sync
    if (state.config.transfers) {
        if (state.config.transfers.standard) {
            document.getElementById('trans_std_start_time').value = state.config.transfers.standard.start.time;
            document.getElementById('trans_std_start_loc').value = state.config.transfers.standard.start.location;
            document.getElementById('trans_std_end_time').value = state.config.transfers.standard.end.time;
            document.getElementById('trans_std_end_loc').value = state.config.transfers.standard.end.location;
        }
        if (state.config.transfers.vacation) {
            document.getElementById('trans_vac_start_time').value = state.config.transfers.vacation.start.time;
            document.getElementById('trans_vac_start_loc').value = state.config.transfers.vacation.start.location;
            document.getElementById('trans_vac_end_time').value = state.config.transfers.vacation.end.time;
            document.getElementById('trans_vac_end_loc').value = state.config.transfers.vacation.end.location;
        }
    }
}

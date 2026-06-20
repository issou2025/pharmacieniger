/**
 * Pharma Niamey - Script d'application principal (JavaScript Vanilla)
 * Intègre Leaflet Map, PWA Install prompt et 15+ fonctions.
 */

document.addEventListener('DOMContentLoaded', () => {
    // -- 1. Enregistrement du Service Worker (PWA Mode Hors-ligne) --
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker enregistré avec succès :', reg.scope))
                .catch(err => console.error('Échec de l\'enregistrement du Service Worker :', err));
        });
    }

    // Éléments du DOM - Moteur de recherche et Grille
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const resetSearchBtn = document.getElementById('reset-search-btn');
    const totalCountEl = document.getElementById('total-count');
    const lastUpdateEl = document.getElementById('last-update');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const emptyState = document.getElementById('empty-state');
    const pharmaciesGrid = document.getElementById('pharmacies-grid');

    // Éléments des fonctionnalités
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const quartierChips = document.getElementById('quartier-chips');
    const communeChips = document.getElementById('commune-chips');
    const gardeToggle = document.getElementById('garde-toggle');
    const gpsBtn = document.getElementById('gps-btn');
    const backToTopBtn = document.getElementById('back-to-top');
    const emergencyToggle = document.getElementById('emergency-toggle');
    const emergencyList = document.getElementById('emergency-list');
    const headerEmergencyBtn = document.getElementById('header-emergency-btn');
    
    // Éléments du Dashboard
    const dashGardeCount = document.getElementById('dash-garde-count');
    const dashGardeProgress = document.getElementById('dash-garde-progress');
    const dashOuverteCount = document.getElementById('dash-ouverte-count');
    const dashOuverteProgress = document.getElementById('dash-ouverte-progress');

    // PWA Install Prompt elements
    const pwaBanner = document.getElementById('pwa-install-banner');
    const pwaInstallBtn = document.getElementById('pwa-install-btn');
    const pwaCloseBtn = document.getElementById('pwa-close-btn');
    let deferredPrompt = null;

    // Éléments du Thème sombre / clair
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = themeToggleBtn.querySelector('.sun-icon');
    const moonIcon = themeToggleBtn.querySelector('.moon-icon');
    const htmlElement = document.documentElement;

    // Base de données locale & Variables d'état
    let pharmaciesData = [];
    let activeCommune = 'all';
    let userCoords = null;
    let isGpsSorting = false;
    let favoritesList = JSON.parse(localStorage.getItem('fav_pharmacies')) || [];

    // Carte Leaflet
    let map = null;
    let markersLayer = null;
    let userLocMarker = null;

    // Coordonnées approximatives des secteurs de Niamey pour le calcul de proximité
    const SECTOR_COORDS = {
        'commune 1': { lat: 13.5350, lon: 2.0833 },
        'commune 2': { lat: 13.5280, lon: 2.1150 },
        'commune 3': { lat: 13.5150, lon: 2.1080 },
        'commune 4': { lat: 13.5020, lon: 2.1380 },
        'commune 5': { lat: 13.4890, lon: 2.0950 },
        'plateau': { lat: 13.5220, lon: 2.1010 },
        'yantala': { lat: 13.5370, lon: 2.0740 },
        'talladje': { lat: 13.4980, lon: 2.1550 },
        'wadata': { lat: 13.5170, lon: 2.1220 },
        'kirkissoye': { lat: 13.4850, lon: 2.0810 },
        'aeroport': { lat: 13.4920, lon: 2.1680 },
        'lazaret': { lat: 13.5320, lon: 2.1310 },
        'goudel': { lat: 13.5410, lon: 2.0620 },
        'gamkalley': { lat: 13.5050, lon: 2.1290 },
        'lamorde': { lat: 13.5010, lon: 2.0910 },
        'koubia': { lat: 13.5590, lon: 2.0880 },
        'tourakou': { lat: 13.5390, lon: 2.1450 }
    };

    // -- Gestion du Thème (Sombre / Clair) --
    const currentHour = new Date().getHours();
    const isNightTime = currentHour >= 18 || currentHour < 6;
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (isNightTime ? 'dark' : (systemPrefersDark ? 'dark' : 'light'));
    
    setTheme(initialTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });

    function setTheme(theme) {
        htmlElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (theme === 'dark') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }

    // -- Gestion de PWA Install Prompt --
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        pwaBanner.hidden = false;
    });

    pwaInstallBtn.addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('Utilisateur a installé la PWA');
                }
                deferredPrompt = null;
                pwaBanner.hidden = true;
            });
        }
    });

    pwaCloseBtn.addEventListener('click', () => {
        pwaBanner.hidden = true;
    });

    // -- Initialisation de la Carte Leaflet --
    function initMap() {
        try {
            map = L.map('map-view', {
                scrollWheelZoom: false,
                zoomControl: true
            }).setView([13.5120, 2.1120], 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            markersLayer = L.layerGroup().addTo(map);
        } catch (e) {
            console.error("Impossible d'initialiser Leaflet :", e);
        }
    }

    // Initialisation
    initMap();
    loadPharmacies();

    // -- Gestionnaires d'Événements (Filtres et Recherche) --

    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        toggleClearButton(query.trim());
        applyFiltersAndRender();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.hidden = true;
        applyFiltersAndRender();
        searchInput.focus();
    });

    resetSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.hidden = true;
        emptyState.hidden = true;
        gardeToggle.checked = false;
        setActiveCommuneChip('all');
        applyFiltersAndRender();
        searchInput.focus();
    });

    // Raccourcis de quartiers populaires
    quartierChips.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (btn) {
            const searchTerm = btn.getAttribute('data-search');
            searchInput.value = searchTerm;
            clearSearchBtn.hidden = false;
            applyFiltersAndRender();
        }
    });

    // Filtre des Communes + Centrage de la carte
    communeChips.addEventListener('click', (e) => {
        const btn = e.target.closest('.commune-chip');
        if (btn) {
            const commune = btn.getAttribute('data-commune');
            setActiveCommuneChip(commune);
            applyFiltersAndRender();
            
            // Centrer la carte sur la commune sélectionnée
            if (commune !== 'all' && map) {
                const lowerCommune = commune.toLowerCase();
                if (SECTOR_COORDS[lowerCommune]) {
                    map.setView([SECTOR_COORDS[lowerCommune].lat, SECTOR_COORDS[lowerCommune].lon], 13.5, { animate: true });
                }
            }
        }
    });

    function setActiveCommuneChip(commune) {
        activeCommune = commune;
        const chips = communeChips.querySelectorAll('.commune-chip');
        chips.forEach(chip => {
            if (chip.getAttribute('data-commune') === commune) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }

    // Toggle switch Garde
    gardeToggle.addEventListener('change', () => {
        applyFiltersAndRender();
    });

    // Urgences Toggle
    emergencyToggle.addEventListener('click', () => {
        emergencyList.hidden = !emergencyList.hidden;
    });

    // Raccourci Urgence En-tête
    headerEmergencyBtn.addEventListener('click', () => {
        emergencyList.hidden = false;
        emergencyList.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // Retour en haut
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.hidden = false;
        } else {
            backToTopBtn.hidden = true;
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // -- Recherche Vocale --
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.interimResults = false;
        
        voiceSearchBtn.addEventListener('click', () => {
            voiceSearchBtn.classList.add('listening');
            recognition.start();
        });

        recognition.addEventListener('result', (e) => {
            const textResult = e.results[0][0].transcript;
            searchInput.value = textResult.replace(/\.$/g, '');
            clearSearchBtn.hidden = false;
            applyFiltersAndRender();
            voiceSearchBtn.classList.remove('listening');
        });

        recognition.addEventListener('speechend', () => {
            recognition.stop();
            voiceSearchBtn.classList.remove('listening');
        });

        recognition.addEventListener('error', () => {
            voiceSearchBtn.classList.remove('listening');
        });
    } else {
        voiceSearchBtn.style.display = 'none';
    }

    // -- Calcul GPS & Proximité --
    gpsBtn.addEventListener('click', () => {
        if (isGpsSorting) {
            isGpsSorting = false;
            userCoords = null;
            gpsBtn.classList.remove('active');
            if (userLocMarker) {
                map.removeLayer(userLocMarker);
                userLocMarker = null;
            }
            applyFiltersAndRender();
            return;
        }

        if (navigator.geolocation) {
            gpsBtn.classList.add('active');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userCoords = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    isGpsSorting = true;
                    applyFiltersAndRender();
                },
                (error) => {
                    console.error('Erreur GPS :', error);
                    alert('Impossible de récupérer votre position GPS. Veuillez vérifier vos autorisations.');
                    gpsBtn.classList.remove('active');
                    isGpsSorting = false;
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        } else {
            alert('La géolocalisation n\'est pas supportée par votre navigateur.');
        }
    });

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function getCoordsForPharmacy(pharma) {
        const address = (pharma.address || '').toLowerCase();
        const name = (pharma.name || '').toLowerCase();
        for (const [key, value] of Object.entries(SECTOR_COORDS)) {
            if (address.includes(key) || name.includes(key)) {
                return value;
            }
        }
        return { lat: 13.5120, lon: 2.1120 };
    }

    // -- Chargement Principal --
    async function loadPharmacies() {
        try {
            const response = await fetch('data/pharmacies.json?v=' + Date.now());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            pharmaciesData = data.pharmacies || [];
            
            lastUpdateEl.textContent = data.updated_at || 'Inconnue';
            totalCountEl.textContent = pharmaciesData.length;
            
            loadingState.hidden = true;
            pharmaciesGrid.hidden = false;
            
            // Initialisation des compteurs de communes dynamiques
            updateCommuneCounts();
            
            updateDashboardMetrics(pharmaciesData);
            applyFiltersAndRender();
        } catch (error) {
            console.error('Erreur de chargement :', error);
            loadingState.hidden = true;
            errorState.hidden = false;
            pharmaciesGrid.hidden = true;
        }
    }

    // Calculer et afficher les compteurs sur chaque bouton de Commune
    function updateCommuneCounts() {
        for (let i = 1; i <= 5; i++) {
            const commName = `Commune ${i}`;
            const count = pharmaciesData.filter(p => p.address && p.address.includes(commName)).length;
            const el = document.getElementById(`count-c${i}`);
            if (el) el.textContent = `(${count})`;
        }
    }

    // -- Filtrage & Rendu Combiné --
    function applyFiltersAndRender() {
        let results = [...pharmaciesData];
        const searchQuery = searchInput.value.trim().toLowerCase();

        // 1. Filtrage par recherche textuelle
        if (searchQuery) {
            results = results.filter(pharma => {
                return (
                    (pharma.name && pharma.name.toLowerCase().includes(searchQuery)) ||
                    (pharma.address && pharma.address.toLowerCase().includes(searchQuery)) ||
                    (pharma.phone && pharma.phone.replace(/\s+/g, '').includes(searchQuery.replace(/\s+/g, ''))) ||
                    (pharma.status && pharma.status.toLowerCase().includes(searchQuery)) ||
                    (pharma.hours && pharma.hours.toLowerCase().includes(searchQuery))
                );
            });
        }

        // 2. Filtrage par Commune
        if (activeCommune !== 'all') {
            results = results.filter(pharma => {
                return pharma.address && pharma.address.includes(activeCommune);
            });
        }

        // 3. Filtrage "De Garde uniquement"
        if (gardeToggle.checked) {
            results = results.filter(pharma => {
                return pharma.status && pharma.status.toLowerCase() === 'garde';
            });
        }

        // 4. Calcul des distances GPS
        if (userCoords) {
            results.forEach(pharma => {
                const pharmaCoords = getCoordsForPharmacy(pharma);
                pharma.distance = calculateDistance(userCoords.lat, userCoords.lon, pharmaCoords.lat, pharmaCoords.lon);
            });
            
            if (isGpsSorting) {
                results.sort((a, b) => a.distance - b.distance);
            }
        } else {
            results.forEach(pharma => delete pharma.distance);
        }

        // 5. Épingler les Favoris
        if (!isGpsSorting) {
            results.sort((a, b) => {
                const aFav = favoritesList.includes(a.name);
                const bFav = favoritesList.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
            });
        }

        // Mettre à jour le compteur affiché
        totalCountEl.textContent = results.length;

        // Rendu final
        if (results.length === 0) {
            emptyState.hidden = false;
            pharmaciesGrid.hidden = true;
            if (markersLayer) markersLayer.clearLayers();
        } else {
            emptyState.hidden = true;
            pharmaciesGrid.hidden = false;
            renderPharmaciesList(results, searchQuery);
            
            // Mettre à jour les marqueurs sur la carte
            updateMapMarkers(results);
        }
    }

    // -- Mise à jour des Marqueurs Leaflet Map (Custom Pins) --
    function updateMapMarkers(list) {
        if (!map || !markersLayer) return;

        markersLayer.clearLayers();
        const bounds = L.latLngBounds();

        list.forEach(pharma => {
            const coords = getCoordsForPharmacy(pharma);
            
            const jitterLat = (Math.random() - 0.5) * 0.002;
            const jitterLon = (Math.random() - 0.5) * 0.002;
            const markerLat = coords.lat + jitterLat;
            const markerLon = coords.lon + jitterLon;

            const statusClass = (pharma.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Rendu de l'aiguille de pin médicale personnalisée en HTML/CSS
            const customIcon = L.divIcon({
                html: `<div class="custom-map-pin ${statusClass}" title="${escapeHtml(pharma.name)}"></div>`,
                className: 'custom-pin-container',
                iconSize: [30, 30],
                iconAnchor: [15, 30],
                popupAnchor: [0, -28]
            });

            const marker = L.marker([markerLat, markerLon], { icon: customIcon });
            
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${pharma.name}, ${pharma.address}, Niamey`)}`;
            const popupContent = `
                <div class="map-popup-title">${escapeHtml(pharma.name)}</div>
                <div class="map-popup-text"><strong>Adresse:</strong> ${escapeHtml(pharma.address)}</div>
                ${pharma.phone ? `<div class="map-popup-text"><strong>Tél:</strong> ${escapeHtml(pharma.phone)}</div>` : ''}
                <div style="margin-top: 0.5rem;">
                    <span class="status-badge ${statusClass}" style="padding: 0.15rem 0.45rem; font-size: 0.65rem;">
                        ${escapeHtml(pharma.status)}
                    </span>
                </div>
                <div style="margin-top: 0.5rem;">
                    <a href="${mapsUrl}" target="_blank" rel="noopener" class="map-popup-btn">Y aller (GPS)</a>
                </div>
            `;
            
            marker.bindPopup(popupContent);
            markersLayer.addLayer(marker);
            bounds.extend([markerLat, markerLon]);
        });

        // Afficher la position de l'utilisateur
        if (isGpsSorting && userCoords) {
            if (userLocMarker) {
                userLocMarker.setLatLng([userCoords.lat, userCoords.lon]);
            } else {
                userLocMarker = L.circleMarker([userCoords.lat, userCoords.lon], {
                    color: '#2563eb',
                    fillColor: '#60a5fa',
                    fillOpacity: 0.8,
                    radius: 8
                }).addTo(map);
                userLocMarker.bindPopup("<strong>Vous êtes ici</strong>");
            }
            bounds.extend([userCoords.lat, userCoords.lon]);
        }

        // Ajuster le niveau de zoom
        if (list.length > 0) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
        }
    }

    // -- Calcul des Horaires d'Ouverture Dynamique --
    function evaluateOpenStatus(hoursStr, statusStr) {
        if (!hoursStr) return 'unknown';
        const cleanHours = hoursStr.toLowerCase().trim();
        if (statusStr.toLowerCase() === 'garde' || cleanHours === '24h/24' || cleanHours.includes('24h')) {
            return 'open';
        }
        const timeMatch = cleanHours.match(/(\d{2})h\s*-\s*(\d{2})h/);
        if (timeMatch) {
            const startHour = parseInt(timeMatch[1], 10);
            const endHour = parseInt(timeMatch[2], 10);
            const currentHour = new Date().getHours();
            if (startHour < endHour) {
                return (currentHour >= startHour && currentHour < endHour) ? 'open' : 'closed';
            } else {
                return (currentHour >= startHour || currentHour < endHour) ? 'open' : 'closed';
            }
        }
        return 'unknown';
    }

    // -- Rendu du Dashboard Analytique --
    function updateDashboardMetrics(list) {
        const total = list.length;
        if (total === 0) return;
        const gardeCount = list.filter(p => (p.status || '').toLowerCase() === 'garde').length;
        const openCount = list.filter(p => evaluateOpenStatus(p.hours, p.status || '') === 'open').length;
        const gardePct = Math.round((gardeCount / total) * 100);
        const openPct = Math.round((openCount / total) * 100);

        dashGardeCount.textContent = `${gardeCount} (${gardePct}%)`;
        dashGardeProgress.style.width = `${gardePct}%`;
        dashOuverteCount.textContent = `${openCount} (${openPct}%)`;
        dashOuverteProgress.style.width = `${openPct}%`;
    }

    // -- Dessiner la liste des cartes --
    function renderPharmaciesList(list, highlightQuery) {
        pharmaciesGrid.innerHTML = '';
        
        list.forEach(pharma => {
            const card = document.createElement('article');
            card.className = 'pharmacy-card';
            
            const rawStatus = pharma.status || 'Info';
            const statusClass = rawStatus.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isFavorite = favoritesList.includes(pharma.name);

            // Surlignage
            const displayName = highlightMatch(pharma.name, highlightQuery);
            const displayAddress = highlightMatch(pharma.address || 'Non spécifiée', highlightQuery);
            const displayPhone = highlightMatch(pharma.phone || 'Non renseigné', highlightQuery);
            const displayHours = highlightMatch(pharma.hours || 'Non précisé', highlightQuery);
            const displaySource = pharma.source ? highlightMatch(pharma.source, highlightQuery) : '';

            // Ouverture dynamique
            const openStatus = evaluateOpenStatus(pharma.hours, rawStatus);
            let openBadgeHtml = '';
            if (openStatus === 'open') {
                openBadgeHtml = '<span class="realtime-badge open">● Ouvert actuellement</span>';
            } else if (openStatus === 'closed') {
                openBadgeHtml = '<span class="realtime-badge closed">● Fermé actuellement</span>';
            }

            // Calcul GPS distance
            let distanceHtml = '';
            if (pharma.distance !== undefined) {
                distanceHtml = `<span class="distance-display">📍 à ${pharma.distance.toFixed(1)} km</span>`;
            }

            const telHref = formatPhoneForHref(pharma.phone || '');
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${pharma.name}, ${pharma.address}, Niamey`)}`;
            
            const errorReportText = encodeURIComponent(`Bonjour Issoufou, je souhaite signaler une erreur sur la pharmacie "${pharma.name}" (Téléphone/Adresse incorrects).`);
            const whatsappReportUrl = `https://wa.me/22796380877?text=${errorReportText}`;
            const shareText = encodeURIComponent(`📍 *${pharma.name}* (${pharma.status})\n📞 Tél: ${pharma.phone}\n🗺️ Adresse: ${pharma.address}\nItinéraire: ${mapsUrl}`);

            card.innerHTML = `
                <button class="btn-fav ${isFavorite ? 'active' : ''}" data-name="${escapeHtml(pharma.name)}" aria-label="Ajouter aux favoris">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>

                <div class="card-header">
                    <h3 class="pharmacy-name">${displayName}</h3>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <span class="status-badge ${statusClass}">
                            <span class="status-dot"></span>
                            ${escapeHtml(rawStatus)}
                        </span>
                        ${distanceHtml}
                    </div>
                    ${openBadgeHtml}
                </div>
                <div class="card-body">
                    <div class="info-item">
                        <svg class="info-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        <div class="info-text">
                            <strong>Adresse :</strong> ${displayAddress}
                        </div>
                    </div>
                    <div class="info-item">
                        <svg class="info-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <div class="info-text">
                            <strong>Téléphone :</strong> ${displayPhone}
                        </div>
                    </div>
                    <div class="info-item">
                        <svg class="info-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <div class="info-text">
                            <strong>Horaires :</strong> ${displayHours}
                        </div>
                    </div>
                    ${pharma.source ? `
                    <div class="info-item">
                        <svg class="info-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                        <div class="info-text">
                            <strong>Source :</strong> ${displaySource}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="card-actions">
                    ${pharma.phone ? `
                        <a href="tel:${telHref}" class="btn btn-call" aria-label="Appeler la pharmacie ${escapeHtml(pharma.name)}">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            Appeler
                        </a>
                    ` : ''}
                    <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-route" aria-label="Itinéraire Google Maps vers la pharmacie ${escapeHtml(pharma.name)}">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                        </svg>
                        Itinéraire
                    </a>
                </div>

                <div class="card-secondary-actions">
                    <button class="btn-icon-action btn-copy" data-text="${escapeHtml(`${pharma.name} - Tél: ${pharma.phone || ''} - Adresse: ${pharma.address || ''}`)}" title="Copier les coordonnées">
                        📋 Copier
                    </button>
                    <a href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer" class="btn-icon-action btn-share-wa" title="Partager sur WhatsApp">
                        💬 WhatsApp
                    </a>
                    <a href="${whatsappReportUrl}" target="_blank" rel="noopener noreferrer" class="btn-icon-action btn-report-error" title="Signaler une erreur">
                        ⚠ Signaler
                    </a>
                </div>
            `;

            const favBtn = card.querySelector('.btn-fav');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(pharma.name);
            });

            const copyBtn = card.querySelector('.btn-copy');
            copyBtn.addEventListener('click', (e) => {
                const text = copyBtn.getAttribute('data-text');
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✅ Copié !';
                    copyBtn.style.color = '#10b981';
                    copyBtn.style.borderColor = '#10b981';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.color = '';
                        copyBtn.style.borderColor = '';
                    }, 1500);
                });
            });

            pharmaciesGrid.appendChild(card);
        });
    }

    function toggleFavorite(name) {
        if (favoritesList.includes(name)) {
            favoritesList = favoritesList.filter(item => item !== name);
        } else {
            favoritesList.push(name);
        }
        localStorage.setItem('fav_pharmacies', JSON.stringify(favoritesList));
        applyFiltersAndRender();
    }

    function highlightMatch(text, query) {
        if (!text) return '';
        const escapedText = escapeHtml(text);
        if (!query) return escapedText;
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
    }

    function formatPhoneForHref(phoneStr) {
        if (!phoneStr) return '';
        let clean = phoneStr.replace(/[^\d+]/g, '');
        if (!clean.startsWith('+')) {
            if (clean.startsWith('00227')) {
                clean = '+' + clean.slice(2);
            } else if (clean.startsWith('227') && clean.length > 8) {
                clean = '+' + clean;
            } else {
                clean = '+227' + clean;
            }
        }
        return clean;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});

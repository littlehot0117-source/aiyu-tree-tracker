// Aiyu Tree Tracker - Core Logic

// State Variables
let records = [];
let editMode = false;
let editId = null;
let currentPhotoBase64 = "";

// WebSocket Variables
let ws = null;
let wsConnected = false;

// Leaflet Map Variables
let map = null;
let markers = {};
let formMarker = null;

// DOM Elements
const aiyuForm = document.getElementById('aiyuForm');
const formTitle = document.getElementById('formTitle');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const submitBtn = document.getElementById('submitBtn');
const treeIdInput = document.getElementById('treeId');
const treeNameInput = document.getElementById('treeName');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const altitudeInput = document.getElementById('altitude');
const recordDateInput = document.getElementById('recordDate');
const healthStatusInput = document.getElementById('healthStatus');
const treePhotoInput = document.getElementById('treePhoto');
const notesInput = document.getElementById('notes');
const varietyWildLocationInput = document.getElementById('varietyWildLocation');

// Image upload preview elements
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImgBtn = document.getElementById('removeImgBtn');

// Statistics elements
const statTotalTrees = document.getElementById('statTotalTrees');
const statHealthyRate = document.getElementById('statHealthyRate');
const statAvgAltitude = document.getElementById('statAvgAltitude');

// Search & Filter elements
const searchQuery = document.getElementById('searchQuery');
const filterHealth = document.getElementById('filterHealth');
const sortBy = document.getElementById('sortBy');
const recordsTableBody = document.getElementById('recordsTableBody');
const emptyState = document.getElementById('emptyState');

// Global controls
const themeToggleBtn = document.getElementById('themeToggleBtn');
const getLocationBtn = document.getElementById('getLocationBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importFileBtn = document.getElementById('importFileBtn');

// Default sample image path
const DEFAULT_IMAGE_PATH = 'assets/aiyu_default_cover.jpg';

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Date input to today's date
    const today = new Date().toISOString().split('T')[0];
    recordDateInput.value = today;

    // 2. Load Theme Preference
    if (localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }

    // 3. Initialize Leaflet Map
    initMap();

    // 4. Load Records from LocalStorage (or seed defaults)
    loadRecords();

    // 5. Setup Event Listeners
    setupEventListeners();

    // 6. Initial render
    updateUI();

    // 7. Silent Startup Sync if auto-sync is enabled
    triggerStartupSync();

    // 8. Connect to local WebSocket sync server if running
    initWebSocket();
});

// Initialize Leaflet Map
function initMap() {
    // Default coordinates center: Taiwan center (Puli/Yushan range)
    const defaultCenter = [23.6978, 120.9605];
    const defaultZoom = 8;

    map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView(defaultCenter, defaultZoom);

    // Light Theme Tile Layer
    const lightTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    lightTiles.addTo(map);

    // Listen for clicks on the map to pin coords
    map.on('click', (e) => {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);

        latitudeInput.value = lat;
        longitudeInput.value = lng;

        updateFormMarker(lat, lng);
        showToast(`已從地圖選取經緯度：${lat}, ${lng}`, 'info');
    });
}

// Update the temporary marker for the Form
function updateFormMarker(lat, lng) {
    if (formMarker) {
        formMarker.setLatLng([lat, lng]);
    } else {
        // Create form temporary marker with a custom orange theme
        const orangeIcon = L.divIcon({
            html: '<i class="fa-solid fa-location-dot" style="color: #ff9f1c; font-size: 28px; text-shadow: 0 0 4px rgba(0,0,0,0.5);"></i>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28],
            className: 'custom-div-icon'
        });

        formMarker = L.marker([lat, lng], { icon: orangeIcon }).addTo(map);
        formMarker.bindPopup("<b>新記錄預定位置</b><br>在左側填寫表單並存檔即可送出。").openPopup();
    }
    map.panTo([lat, lng]);
}

// Remove the Form Marker
function removeFormMarker() {
    if (formMarker) {
        map.removeLayer(formMarker);
        formMarker = null;
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Theme Toggle
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateThemeIcon(isDark);
        showToast(isDark ? '已切換至深色森林模式' : '已切換至白晝森林模式', 'info');
    });

    // Get current location (GPS)
    getLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('您的瀏覽器不支援 GPS 定位服務。', 'error');
            return;
        }

        getLocationBtn.disabled = true;
        getLocationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 定位中...';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(6);
                const lng = position.coords.longitude.toFixed(6);
                const alt = position.coords.altitude ? Math.round(position.coords.altitude) : '';

                latitudeInput.value = lat;
                longitudeInput.value = lng;
                if (alt) altitudeInput.value = alt;

                updateFormMarker(lat, lng);
                showToast('已成功透過 GPS 取得目前定位！', 'success');

                getLocationBtn.disabled = false;
                getLocationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> 取得當前位置 (GPS)';
            },
            (error) => {
                let errorMsg = '無法獲取定位，請檢查 GPS 授權。';
                if (error.code === error.PERMISSION_DENIED) {
                    errorMsg = '定位權限被拒絕，請在瀏覽器設定中啟用定位。';
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    errorMsg = '定位資訊不可用。';
                } else if (error.code === error.TIMEOUT) {
                    errorMsg = '定位請求超時。';
                }
                showToast(errorMsg, 'error');
                
                getLocationBtn.disabled = false;
                getLocationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> 取得當前位置 (GPS)';
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });

    // Compress image helper using canvas
    function compressImage(file, callback) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 800; // Resize to max 800px width/height
                
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Compress as JPEG at 70% quality
                callback(dataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Handle Image Upload & Compression
    treePhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast('正在壓縮圖片檔案，請稍候...', 'info');

        compressImage(file, (dataUrl) => {
            currentPhotoBase64 = dataUrl;
            imagePreview.src = currentPhotoBase64;
            uploadPlaceholder.style.display = 'none';
            previewContainer.style.display = 'block';
            showToast('圖片載入成功（已完成最佳化壓縮）！', 'success');
        });
    });

    // Remove photo from preview
    removeImgBtn.addEventListener('click', () => {
        currentPhotoBase64 = "";
        treePhotoInput.value = "";
        uploadPlaceholder.style.display = 'flex';
        previewContainer.style.display = 'none';
        imagePreview.src = "";
    });

    // Form Submit
    aiyuForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveFormRecord();
    });

    // Reset Form (also handles image resets)
    aiyuForm.addEventListener('reset', () => {
        resetFormState();
    });

    // Cancel Edit Mode
    cancelEditBtn.addEventListener('click', () => {
        resetFormState();
    });

    // Search and Filter updates
    searchQuery.addEventListener('input', () => updateUI());
    filterHealth.addEventListener('change', () => updateUI());
    sortBy.addEventListener('change', () => updateUI());

    // Export JSON
    exportJsonBtn.addEventListener('click', exportToJson);

    // Export CSV
    exportCsvBtn.addEventListener('click', exportToCsv);

    // Import File
    importFileBtn.addEventListener('change', handleImportFile);

    // Toggle Variety Wild Location input
    document.querySelectorAll('input[name="treeVariety"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'wildlife') {
                varietyWildLocationInput.style.display = 'block';
                varietyWildLocationInput.focus();
            } else {
                varietyWildLocationInput.style.display = 'none';
            }
        });
    });
}

// Update the Theme Icon inside button
function updateThemeIcon(isDark) {
    themeToggleBtn.innerHTML = isDark 
        ? '<i class="fa-solid fa-sun" style="color: #ffb703;"></i>' 
        : '<i class="fa-solid fa-moon"></i>';
}

// Reset Form fields and states
function resetFormState() {
    editMode = false;
    editId = null;
    currentPhotoBase64 = "";
    
    // UI Label resets
    formTitle.innerHTML = '<span><i class="fa-solid fa-circle-plus"></i> 新增樹木記錄</span>';
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 儲存記錄';
    cancelEditBtn.style.display = 'none';

    // Image previews reset
    uploadPlaceholder.style.display = 'flex';
    previewContainer.style.display = 'none';
    imagePreview.src = "";

    // Reset date input back to today
    setTimeout(() => {
        const today = new Date().toISOString().split('T')[0];
        recordDateInput.value = today;
    }, 10);

    // Reset gender to female
    const defaultGender = document.querySelector('input[name="treeGender"][value="female"]');
    if (defaultGender) defaultGender.checked = true;

    // Reset origin to wild
    const defaultOrigin = document.querySelector('input[name="treeOrigin"][value="wild"]');
    if (defaultOrigin) defaultOrigin.checked = true;

    // Reset variety to hongjiu
    const defaultVariety = document.querySelector('input[name="treeVariety"][value="hongjiu"]');
    if (defaultVariety) defaultVariety.checked = true;
    varietyWildLocationInput.value = '';
    varietyWildLocationInput.style.display = 'none';

    removeFormMarker();
}

// Load records from LocalStorage
function loadRecords() {
    const localData = localStorage.getItem('aiyu_tree_records');
    
    if (localData) {
        try {
            records = JSON.parse(localData);
        } catch (e) {
            console.error("Error parsing LocalStorage records:", e);
            records = [];
        }
    } else {
        records = [];
    }
}

// Save records database to LocalStorage
function saveRecordsToStorage() {
    localStorage.setItem('aiyu_tree_records', JSON.stringify(records));
    
    // Broadcast changes to local server if WebSocket is connected
    sendWsAction('SYNC_STATE', records);

    // If auto-sync is enabled, trigger upload silently
    if (localStorage.getItem('aiyu_auto_sync') === 'true') {
        uploadRecordsToCloud(true);
    }
}

// Save or Update Record from Form Submission
function saveFormRecord() {
    const name = treeNameInput.value.trim();
    const lat = parseFloat(latitudeInput.value);
    const lng = parseFloat(longitudeInput.value);
    const alt = altitudeInput.value ? parseInt(altitudeInput.value) : null;
    const date = recordDateInput.value;
    const health = healthStatusInput.value;
    const notes = notesInput.value.trim();
    
    // Read gender radio button value
    const genderEl = document.querySelector('input[name="treeGender"]:checked');
    const gender = genderEl ? genderEl.value : 'unknown';

    // Read origin radio button value
    const originEl = document.querySelector('input[name="treeOrigin"]:checked');
    const origin = originEl ? originEl.value : 'wild';

    // Read variety radio button value
    const varietyEl = document.querySelector('input[name="treeVariety"]:checked');
    const variety = varietyEl ? varietyEl.value : 'hongjiu';
    const wildLocation = variety === 'wildlife' ? varietyWildLocationInput.value.trim() : '';

    if (!name || isNaN(lat) || isNaN(lng) || !date || !health) {
        showToast('請填寫所有必填欄位！', 'error');
        return;
    }

    if (editMode && editId) {
        // Update existing record
        const recordIndex = records.findIndex(r => r.id === editId);
        if (recordIndex !== -1) {
            const oldPhoto = records[recordIndex].photo;
            
            records[recordIndex] = {
                id: editId,
                name,
                latitude: lat,
                longitude: lng,
                altitude: alt,
                recordDate: date,
                gender,
                origin,
                variety,
                wildLocation,
                healthStatus: health,
                // Keep the old photo if no new photo was uploaded, otherwise use new photo
                photo: currentPhotoBase64 ? currentPhotoBase64 : oldPhoto,
                notes
            };
            showToast('已更新愛玉樹記錄：' + name, 'success');
        }
    } else {
        // Add new record
        const newId = 'AY-' + Date.now();
        const newRecord = {
            id: newId,
            name,
            latitude: lat,
            longitude: lng,
            altitude: alt,
            recordDate: date,
            gender,
            origin,
            variety,
            wildLocation,
            healthStatus: health,
            photo: currentPhotoBase64 ? currentPhotoBase64 : DEFAULT_IMAGE_PATH,
            notes
        };
        records.push(newRecord);
        showToast('已成功新增愛玉樹記錄：' + name, 'success');
    }

    saveRecordsToStorage();
    aiyuForm.reset();
    resetFormState();
    updateUI();
}

// Start Edit Mode for a specific record
function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;

    editMode = true;
    editId = id;

    // Fill form elements
    treeIdInput.value = record.id;
    treeNameInput.value = record.name;
    latitudeInput.value = record.latitude;
    longitudeInput.value = record.longitude;
    altitudeInput.value = record.altitude !== null ? record.altitude : '';
    recordDateInput.value = record.recordDate;
    healthStatusInput.value = record.healthStatus;
    notesInput.value = record.notes || '';

    // Set gender option radio checked
    const genderVal = record.gender || 'unknown';
    const genderRadio = document.querySelector(`input[name="treeGender"][value="${genderVal}"]`);
    if (genderRadio) genderRadio.checked = true;

    // Set origin option radio checked
    const originVal = record.origin || 'wild';
    const originRadio = document.querySelector(`input[name="treeOrigin"][value="${originVal}"]`);
    if (originRadio) originRadio.checked = true;

    // Set variety option radio checked
    const varietyVal = record.variety || 'hongjiu';
    const varietyRadio = document.querySelector(`input[name="treeVariety"][value="${varietyVal}"]`);
    if (varietyRadio) varietyRadio.checked = true;
    
    if (varietyVal === 'wildlife') {
        varietyWildLocationInput.style.display = 'block';
        varietyWildLocationInput.value = record.wildLocation || '';
    } else {
        varietyWildLocationInput.style.display = 'none';
        varietyWildLocationInput.value = '';
    }

    // Photo preview
    if (record.photo && record.photo !== DEFAULT_IMAGE_PATH) {
        currentPhotoBase64 = record.photo;
        imagePreview.src = record.photo;
        uploadPlaceholder.style.display = 'none';
        previewContainer.style.display = 'block';
    } else {
        currentPhotoBase64 = "";
        uploadPlaceholder.style.display = 'flex';
        previewContainer.style.display = 'none';
        imagePreview.src = "";
    }

    // Set UI Mode
    formTitle.innerHTML = `<span><i class="fa-solid fa-pen-to-square"></i> 編輯記錄 ${record.name}</span>`;
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 更新記錄';
    cancelEditBtn.style.display = 'inline-block';

    // Show temporary edit marker on map and focus there
    updateFormMarker(record.latitude, record.longitude);
    
    // Scroll smoothly to form on mobile devices
    document.getElementById('formTitle').scrollIntoView({ behavior: 'smooth' });
}

// Delete Record
function deleteRecord(id, name) {
    if (confirm(`確定要刪除「${name}」的紀錄嗎？此動作將無法還原！`)) {
        records = records.filter(r => r.id !== id);
        
        // Remove from map markers
        if (markers[id]) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }

        saveRecordsToStorage();
        showToast(`已刪除記錄：${name}`, 'success');
        
        // If we are currently editing the deleted record, cancel edit mode
        if (editId === id) {
            resetFormState();
        }

        updateUI();
    }
}

// Pan map to tree and open its marker popup
function locateRecordOnMap(id) {
    const record = records.find(r => r.id === id);
    if (!record || !markers[id]) return;

    map.setView([record.latitude, record.longitude], 14);
    markers[id].openPopup();

    // Scroll to map card on mobile devices
    document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
}

// Update statistics, maps, tables based on filter states
function updateUI() {
    const filtered = getFilteredRecords();
    
    updateStats(filtered);
    renderTable(filtered);
    updateMapMarkers(filtered);
}

// Get filtered and sorted list of records
function getFilteredRecords() {
    const query = searchQuery.value.trim().toLowerCase();
    const health = filterHealth.value;
    const sort = sortBy.value;

    let result = [...records];

    // Filter by Search Query
    if (query) {
        result = result.filter(r => 
            r.name.toLowerCase().includes(query) || 
            r.id.toLowerCase().includes(query) || 
            (r.notes && r.notes.toLowerCase().includes(query))
        );
    }

    // Filter by Health Status
    if (health !== 'all') {
        result = result.filter(r => r.healthStatus === health);
    }

    // Sort Records
    result.sort((a, b) => {
        if (sort === 'date-desc') {
            return new Date(b.recordDate) - new Date(a.recordDate);
        } else if (sort === 'date-asc') {
            return new Date(a.recordDate) - new Date(b.recordDate);
        } else if (sort === 'altitude-desc') {
            const altA = a.altitude !== null ? a.altitude : -9999;
            const altB = b.altitude !== null ? b.altitude : -9999;
            return altB - altA;
        } else if (sort === 'altitude-asc') {
            const altA = a.altitude !== null ? a.altitude : 99999;
            const altB = b.altitude !== null ? b.altitude : 99999;
            return altA - altB;
        } else if (sort === 'name-asc') {
            return a.name.localeCompare(b.name, 'zh-Hant');
        }
        return 0;
    });

    return result;
}

// Update stats card widgets
function updateStats(filteredList) {
    // 1. Total trees
    statTotalTrees.innerText = filteredList.length;

    // 2. Health percentage (excellent or good)
    if (filteredList.length > 0) {
        const healthyCount = filteredList.filter(r => r.healthStatus === 'excellent' || r.healthStatus === 'good').length;
        const rate = Math.round((healthyCount / filteredList.length) * 100);
        statHealthyRate.innerText = rate + '%';
    } else {
        statHealthyRate.innerText = '0%';
    }

    // 3. Avg Altitude
    const withAlt = filteredList.filter(r => r.altitude !== null && !isNaN(r.altitude));
    if (withAlt.length > 0) {
        const totalAlt = withAlt.reduce((sum, r) => sum + r.altitude, 0);
        const avg = Math.round(totalAlt / withAlt.length);
        statAvgAltitude.innerText = avg + 'm';
    } else {
        statAvgAltitude.innerText = '0m';
    }
}

// Render data records table list
function renderTable(filteredList) {
    recordsTableBody.innerHTML = '';
    
    if (filteredList.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    filteredList.forEach(r => {
        const tr = document.createElement('tr');
        
        // Formatted Status badge
        let badgeHtml = '';
        if (r.healthStatus === 'excellent') {
            badgeHtml = '<span class="badge badge-excellent"><i class="fa-solid fa-circle-check"></i> 優良</span>';
        } else if (r.healthStatus === 'good') {
            badgeHtml = '<span class="badge badge-good"><i class="fa-solid fa-circle-check"></i> 良好</span>';
        } else if (r.healthStatus === 'fair') {
            badgeHtml = '<span class="badge badge-fair"><i class="fa-solid fa-circle-exclamation"></i> 普通</span>';
        } else if (r.healthStatus === 'poor') {
            badgeHtml = '<span class="badge badge-poor"><i class="fa-solid fa-triangle-exclamation"></i> 欠佳</span>';
        }

        // Formatted Gender badge
        let genderBadge = '';
        if (r.gender === 'female') {
            genderBadge = '<span class="badge badge-gender-female"><i class="fa-solid fa-venus"></i> 母株</span>';
        } else if (r.gender === 'male') {
            genderBadge = '<span class="badge badge-gender-male"><i class="fa-solid fa-mars"></i> 公株</span>';
        } else {
            genderBadge = '<span class="badge badge-gender-unknown"><i class="fa-solid fa-circle-question"></i> 未知</span>';
        }

        // Formatted Origin badge
        let originBadge = '';
        const originVal = r.origin || 'wild';
        if (originVal === 'wild') {
            originBadge = '<span class="badge badge-origin-wild">野外</span>';
        } else if (originVal === 'wild_transplant') {
            originBadge = '<span class="badge badge-origin-wild-trans">野外移植</span>';
        } else if (originVal === 'cultivated_transplant') {
            originBadge = '<span class="badge badge-origin-cult-trans">栽植移植</span>';
        }

        // Formatted Variety badge
        let varietyBadge = '';
        const varietyVal = r.variety || 'hongjiu';
        if (varietyVal === 'hongjiu') {
            varietyBadge = '<span class="badge badge-variety-hongjiu">紅九</span>';
        } else if (varietyVal === 'miao1') {
            varietyBadge = '<span class="badge badge-variety-miao">苗1</span>';
        } else if (varietyVal === 'miao2') {
            varietyBadge = '<span class="badge badge-variety-miao">苗2</span>';
        } else if (varietyVal === 'wildlife') {
            const locText = r.wildLocation ? ` (${escapeHtml(r.wildLocation)})` : '';
            varietyBadge = `<span class="badge badge-variety-wild">野生${locText}</span>`;
        }

        const altText = r.altitude !== null ? `${r.altitude} m` : '未記錄';
        
        // Thumbnail Photo preview (uses default cover if base64 empty)
        const imgSrc = r.photo ? r.photo : DEFAULT_IMAGE_PATH;

        tr.innerHTML = `
            <td>
                <img src="${imgSrc}" class="tree-img-thumbnail" alt="${r.name}" onerror="this.src='${DEFAULT_IMAGE_PATH}'">
            </td>
            <td>
                <div class="tree-info-cell">
                    <span class="tree-id-tag">${r.id}</span>
                    <span class="tree-name-text">${escapeHtml(r.name)}</span>
                    <div style="display: flex; gap: 6px; margin: 4px 0; flex-wrap: wrap;">
                        ${genderBadge}
                        ${originBadge}
                        ${varietyBadge}
                    </div>
                    <small style="color: var(--text-secondary); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.notes || '')}">
                        ${escapeHtml(r.notes || '無備註說明')}
                    </small>
                </div>
            </td>
            <td style="font-family: monospace; font-size: 0.85rem;">
                Lat: ${r.latitude.toFixed(5)}<br>
                Lng: ${r.longitude.toFixed(5)}
            </td>
            <td>
                <div class="altitude-display">
                    <i class="fa-solid fa-mountain-sun"></i>
                    <span>${altText}</span>
                </div>
            </td>
            <td>${r.recordDate}</td>
            <td>${badgeHtml}</td>
            <td style="text-align: center;">
                <div class="action-buttons">
                    <button class="btn-table-action locate-btn" onclick="locateRecordOnMap('${r.id}')" title="地圖定位">
                        <i class="fa-solid fa-crosshairs"></i>
                    </button>
                    <button class="btn-table-action edit-btn" onclick="editRecord('${r.id}')" title="編輯記錄">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-table-action delete-btn" onclick="deleteRecord('${r.id}', '${escapeHtml(r.name)}')" title="刪除記錄">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        recordsTableBody.appendChild(tr);
    });
}

// Update markers on the Leaflet map
function updateMapMarkers(filteredList) {
    // 1. Clear existing markers that are not in the filtered list
    const filteredIds = new Set(filteredList.map(r => r.id));
    
    Object.keys(markers).forEach(id => {
        if (!filteredIds.has(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });

    // 2. Add or update current markers
    filteredList.forEach(r => {
        // Build popup HTML structure
        const imgSrc = r.photo ? r.photo : DEFAULT_IMAGE_PATH;
        let statusText = '';
        if (r.healthStatus === 'excellent') statusText = '優良 🟢';
        else if (r.healthStatus === 'good') statusText = '良好 🟢';
        else if (r.healthStatus === 'fair') statusText = '普通 🟡';
        else if (r.healthStatus === 'poor') statusText = '欠佳 🔴';

        let genderText = '未知 ⚪';
        if (r.gender === 'female') genderText = '母株 ♀️ 🔴';
        else if (r.gender === 'male') genderText = '公株 ♂️ 🔵';

        let originText = '野外 🌲';
        const originVal = r.origin || 'wild';
        if (originVal === 'wild_transplant') originText = '野外移植 🌲➡️🏡';
        else if (originVal === 'cultivated_transplant') originText = '栽植移植 🏡➡️🏡';

        let varietyText = '紅九 🔴';
        const varietyVal = r.variety || 'hongjiu';
        if (varietyVal === 'miao1') varietyText = '苗1 🌱';
        else if (varietyVal === 'miao2') varietyText = '苗2 🌿';
        else if (varietyVal === 'wildlife') {
            const loc = r.wildLocation ? ` (${r.wildLocation})` : '';
            varietyText = `野生${loc} 🌲`;
        }

        const popupContent = `
            <div class="map-popup-card">
                <img src="${imgSrc}" alt="${r.name}" onerror="this.src='${DEFAULT_IMAGE_PATH}'">
                <div class="map-popup-title">${escapeHtml(r.name)}</div>
                <div class="map-popup-detail"><i class="fa-solid fa-tag"></i> <span>ID: ${r.id}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-mountain-sun"></i> <span>海拔: ${r.altitude !== null ? r.altitude + ' m' : '未記錄'}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-calendar-days"></i> <span>記錄日期: ${r.recordDate}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-venus-mars"></i> <span>植株性別: ${genderText}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-tree-city"></i> <span>來源分類: ${originText}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-seedling"></i> <span>品種: ${escapeHtml(varietyText)}</span></div>
                <div class="map-popup-detail"><i class="fa-solid fa-heart-pulse"></i> <span>健康狀態: ${statusText}</span></div>
                <div class="map-popup-actions">
                    <button class="map-popup-btn btn-primary" onclick="editRecord('${r.id}')" style="flex: 1;"><i class="fa-solid fa-pen-to-square"></i> 編輯</button>
                    <button class="map-popup-btn btn-secondary" onclick="deleteRecord('${r.id}', '${escapeHtml(r.name)}')" style="color: var(--status-poor);"><i class="fa-solid fa-trash-can"></i> 刪除</button>
                </div>
            </div>
        `;

        if (markers[r.id]) {
            // Update position and popup content
            markers[r.id].setLatLng([r.latitude, r.longitude]);
            markers[r.id].setPopupContent(popupContent);
        } else {
            // Create a gorgeous custom green icon for Aiyu trees
            const greenIcon = L.divIcon({
                html: '<i class="fa-solid fa-location-dot" style="color: #2d6a4f; font-size: 26px; text-shadow: 0 0 4px rgba(0,0,0,0.4);"></i>',
                iconSize: [26, 26],
                iconAnchor: [13, 26],
                popupAnchor: [0, -26],
                className: 'custom-div-icon'
            });

            const marker = L.marker([r.latitude, r.longitude], { icon: greenIcon }).addTo(map);
            marker.bindPopup(popupContent);
            markers[r.id] = marker;
        }
    });

    // Adjust map zoom bounding box to fit markers if there are multiple
    if (filteredList.length > 0 && Object.keys(markers).length > 0) {
        const group = new L.featureGroup(Object.values(markers));
        // Pan and fit, but limit zoom to maximum 15 to prevent excessive zoom-in on single point
        map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 15 });
    }
}

// JSON Backup Exporter
function exportToJson() {
    if (records.length === 0) {
        showToast('目前尚無記錄可供匯出。', 'error');
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records, null, 2));
    const downloadAnchor = document.createElement('a');
    
    // Include current date in filename
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `aiyu_records_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('JSON 完整備份檔匯出成功！', 'success');
}

// CSV Tabular Exporter
function exportToCsv() {
    if (records.length === 0) {
        showToast('目前尚無記錄可供匯出。', 'error');
        return;
    }

    // UTF-8 BOM to prevent excel garbled chinese
    let csvContent = "\uFEFF";
    
    // Header Row
    const headers = ["樹木ID", "樹木名稱/編號", "緯度(Latitude)", "經度(Longitude)", "海拔(Altitude)", "觀測日期", "植株性別", "來源分類", "品種", "野生地點", "健康狀況", "備註說明"];
    csvContent += headers.map(h => `"${h}"`).join(",") + "\r\n";

    // Data Rows
    records.forEach(r => {
        // Translate health status to readable Chinese for tabular sheet
        let statusCn = '';
        if (r.healthStatus === 'excellent') statusCn = '優良';
        else if (r.healthStatus === 'good') statusCn = '良好';
        else if (r.healthStatus === 'fair') statusCn = '普通';
        else if (r.healthStatus === 'poor') statusCn = '欠佳';

        // Translate gender to Chinese
        let genderCn = '未知';
        if (r.gender === 'female') genderCn = '母株';
        else if (r.gender === 'male') genderCn = '公株';

        // Translate origin to Chinese
        let originCn = '野外';
        if (r.origin === 'wild_transplant') originCn = '野外移植';
        else if (r.origin === 'cultivated_transplant') originCn = '栽植移植';

        // Translate variety to Chinese
        let varietyCn = '紅九';
        if (r.variety === 'miao1') varietyCn = '苗1';
        else if (r.variety === 'miao2') varietyCn = '苗2';
        else if (r.variety === 'wildlife') varietyCn = '野生';

        const row = [
            r.id,
            r.name,
            r.latitude,
            r.longitude,
            r.altitude !== null ? r.altitude : "",
            r.recordDate,
            genderCn,
            originCn,
            varietyCn,
            r.wildLocation || "",
            statusCn,
            (r.notes || "").replace(/"/g, '""') // Escape quotes in notes
        ];
        
        csvContent += row.map(val => `"${val}"`).join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `aiyu_records_export_${dateStr}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('CSV 試算表格式資料匯出成功！', 'success');
}

// Import File Handler (JSON / CSV parser)
function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    
    fileReader.onload = function(event) {
        const content = event.target.result;
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'json') {
            parseAndMergeJson(content);
        } else if (extension === 'csv') {
            parseAndMergeCsv(content);
        } else {
            showToast('未知的檔案格式，請匯入 .json 或 .csv 檔案！', 'error');
        }
        
        // Reset file input so same file can be imported again
        importFileBtn.value = '';
    };

    fileReader.readAsText(file);
}

// Parse imported JSON list
function parseAndMergeJson(jsonContent) {
    try {
        const imported = JSON.parse(jsonContent);
        if (!Array.isArray(imported)) {
            showToast('匯入失敗：備份檔格式不正確，應為陣列！', 'error');
            return;
        }

        // Validate basic fields
        const validRecords = imported.filter(r => 
            r.id && r.name && typeof r.latitude === 'number' && typeof r.longitude === 'number'
        );

        if (validRecords.length === 0) {
            showToast('匯入失敗：未在檔案中找到任何有效記錄！', 'error');
            return;
        }

        // Clear existing records and replace with imported ones
        records = [];
        let addedCount = 0;

        validRecords.forEach((newRec, i) => {
            const index = records.findIndex(r => r.id === newRec.id);
            if (index !== -1) {
                const existing = records[index];
                const sameCoords = Math.abs(existing.latitude - newRec.latitude) < 0.00001 && 
                                   Math.abs(existing.longitude - newRec.longitude) < 0.00001;
                if (sameCoords) {
                    // Same ID and same coords: overwrite/update
                    newRec.photo = existing.photo || newRec.photo;
                    records[index] = newRec;
                } else {
                    // Same ID but different coords: treat as a different tree!
                    newRec.id = newRec.id + '-' + (i + 1);
                    records.push(newRec);
                    addedCount++;
                }
            } else {
                records.push(newRec);
                addedCount++;
            }
        });

        saveRecordsToStorage();
        updateUI();
        
        // Trigger auto sync to cloud if enabled
        uploadRecordsToCloud(true);

        showToast(`匯入成功！已清空舊資料並載入 ${addedCount} 筆記錄。`, 'success');

    } catch (e) {
        showToast('JSON 檔案解析失敗，請確認檔案格式是否正確。', 'error');
        console.error(e);
    }
}

// Parse and convert imported CSV sheet
function parseAndMergeCsv(csvContent) {
    try {
        // Remove UTF-8 BOM if present
        const cleanContent = csvContent.replace(/^\uFEFF/, '');
        const lines = parseCSVRows(cleanContent);
        
        if (lines.length < 2) {
            showToast('匯入失敗：CSV 檔案中無有效數據列！', 'error');
            return;
        }

        // Helper to format/normalize date to YYYY-MM-DD
        const normalizeDate = (dateStr) => {
            if (!dateStr) return new Date().toISOString().split('T')[0];
            const clean = dateStr.trim().replace(/\//g, '-').replace(/\./g, '-');
            const parts = clean.split('-');
            if (parts.length === 3) {
                const y = parts[0];
                const m = parts[1].padStart(2, '0');
                const d = parts[2].padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            return clean;
        };

        // Detect headers with keyword matching
        const headers = lines[0].map(h => h.trim());
        const findHeaderIdx = (keywords) => {
            return headers.findIndex(h => {
                const lowerH = h.toLowerCase().trim();
                return keywords.some(k => lowerH.includes(k.toLowerCase()));
            });
        };

        let idIdx = findHeaderIdx(["樹木id", "id", "編號"]);
        let nameIdx = findHeaderIdx(["樹木名稱", "名稱", "name"]);
        let latIdx = findHeaderIdx(["緯度", "latitude", "lat"]);
        let lngIdx = findHeaderIdx(["經度", "longitude", "lng"]);
        let altIdx = findHeaderIdx(["海拔", "altitude", "alt", "高度"]);
        let dateIdx = findHeaderIdx(["日期", "date", "時間", "觀測"]);
        let genderIdx = findHeaderIdx(["性別", "gender"]);
        let originIdx = findHeaderIdx(["來源", "origin", "分類"]);
        let varietyIdx = findHeaderIdx(["品種", "variety"]);
        let wildLocationIdx = findHeaderIdx(["野生地點", "野生位置", "wildlocation"]);
        let healthIdx = findHeaderIdx(["健康狀況", "健康", "狀況", "health"]);
        let notesIdx = findHeaderIdx(["備註說明", "備註", "說明", "notes"]);

        // Smart fallback detection based on actual cell values (useful if headers are shifted/swapped in Excel)
        const sampleRows = lines.slice(1, 6).filter(row => row.length > 2);
        if (sampleRows.length > 0) {
            const colCount = Math.max(...sampleRows.map(r => r.length));
            const colScores = Array.from({ length: colCount }, () => ({
                id: 0, lat: 0, lng: 0, alt: 0, date: 0, gender: 0, health: 0, notes: 0
            }));

            sampleRows.forEach(row => {
                row.forEach((cell, idx) => {
                    if (!cell) return;
                    const val = cell.trim();
                    if (!val) return;

                    // 1. Date check
                    if (val.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/) || val.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
                        colScores[idx].date += 5;
                    }
                    // 2. Lat/Lng check
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        if (num >= 21 && num <= 26) colScores[idx].lat += 5;
                        else if (num >= 118 && num <= 123) colScores[idx].lng += 5;
                        else if (num > 0 && num < 4000) colScores[idx].alt += 2;
                    }
                    // 3. Gender check
                    if (['母', '公', '未知', '母株', '公株', 'female', 'male', 'unknown'].includes(val)) {
                        colScores[idx].gender += 5;
                    }
                    // 4. Health check
                    if (['優良', '良好', '普通', '欠佳', 'excellent', 'good', 'fair', 'poor'].includes(val)) {
                        colScores[idx].health += 5;
                    }
                    // 5. Notes check (longer text description)
                    if (val.length > 8) {
                        colScores[idx].notes += 3;
                    }
                    // 6. ID check
                    if (val.startsWith('AY-') || val.includes('公路') || val.includes('車站') || val.includes('國小')) {
                        colScores[idx].id += 2;
                    }
                });
            });

            const getBestCol = (type, threshold = 2) => {
                let bestIdx = -1;
                let maxScore = threshold;
                for (let i = 0; i < colCount; i++) {
                    if (colScores[i] && colScores[i][type] > maxScore) {
                        maxScore = colScores[i][type];
                        bestIdx = i;
                    }
                }
                return bestIdx;
            };

            // Only override coordinates if we couldn't match them by headers
            if (latIdx === -1) {
                const bestLat = getBestCol('lat');
                if (bestLat !== -1) latIdx = bestLat;
            }
            if (lngIdx === -1) {
                const bestLng = getBestCol('lng');
                if (bestLng !== -1) lngIdx = bestLng;
            }

            // Always trust content scores for gender, health, notes and dates if columns are shifted or mismatched in Excel
            const bestGender = getBestCol('gender');
            if (bestGender !== -1) genderIdx = bestGender;

            const bestHealth = getBestCol('health');
            if (bestHealth !== -1) healthIdx = bestHealth;

            const bestNotes = getBestCol('notes');
            if (bestNotes !== -1) notesIdx = bestNotes;

            const bestDate = getBestCol('date');
            if (bestDate !== -1) dateIdx = bestDate;

            const bestAlt = getBestCol('alt');
            if (bestAlt !== -1 && bestAlt !== latIdx && bestAlt !== lngIdx) altIdx = bestAlt;
            
            const bestId = getBestCol('id');
            if (bestId !== -1 && idIdx === -1) idIdx = bestId;
        }

        // We only require Latitude and Longitude columns to run import
        if (latIdx === -1 || lngIdx === -1) {
            showToast('匯入失敗：找不到或無法識別經緯度欄位，請確認檔案格式。', 'error');
            return;
        }

        // Clear existing records and replace with imported ones
        records = [];
        let addedCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            // Skip rows that are too short or empty
            if (row.length < 2) continue;

            const idVal = idIdx !== -1 && row[idIdx] ? row[idIdx].trim() : '';
            const nameVal = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '';
            
            // Skip row if both ID and Name are empty (likely empty sheet row)
            if (!idVal && !nameVal) continue;

            const id = idVal || 'AY-' + (Date.now() + i);
            const name = nameVal || idVal || '未命名樹木';
            
            const latitude = parseFloat(row[latIdx]);
            const longitude = parseFloat(row[lngIdx]);
            
            // Skip rows with invalid coords
            if (isNaN(latitude) || isNaN(longitude)) continue;

            const altitude = altIdx !== -1 && row[altIdx] ? parseInt(row[altIdx]) : null;
            const recordDate = dateIdx !== -1 && row[dateIdx] ? normalizeDate(row[dateIdx]) : new Date().toISOString().split('T')[0];
            
            // Translate Chinese gender back to database value (tolerant matching)
            let gender = 'unknown';
            if (genderIdx !== -1 && row[genderIdx]) {
                const genderStr = row[genderIdx].trim();
                if (genderStr.includes('母') || genderStr.includes('女') || genderStr.includes('♀')) gender = 'female';
                else if (genderStr.includes('公') || genderStr.includes('男') || genderStr.includes('♂')) gender = 'male';
            }

            // Translate origin back to database value (tolerant matching)
            let origin = 'wild';
            if (originIdx !== -1 && row[originIdx]) {
                const originStr = row[originIdx].trim();
                if (originStr.includes('野外移植')) origin = 'wild_transplant';
                else if (originStr.includes('栽植移植')) origin = 'cultivated_transplant';
                else if (originStr.includes('野外')) origin = 'wild';
            }

            // Translate variety back to database value (tolerant matching)
            let variety = 'hongjiu';
            if (varietyIdx !== -1 && row[varietyIdx]) {
                const varietyStr = row[varietyIdx].trim();
                if (varietyStr.includes('紅九')) variety = 'hongjiu';
                else if (varietyStr.includes('苗1')) variety = 'miao1';
                else if (varietyStr.includes('苗2')) variety = 'miao2';
                else if (varietyStr.includes('野生')) variety = 'wildlife';
            }

            const wildLocation = wildLocationIdx !== -1 && row[wildLocationIdx] ? row[wildLocationIdx].trim() : '';

            // Translate Chinese status back to database value (tolerant matching)
            let healthStatus = 'good';
            if (healthIdx !== -1 && row[healthIdx]) {
                const statusStr = row[healthIdx].trim();
                if (statusStr.includes('優')) healthStatus = 'excellent';
                else if (statusStr.includes('良')) healthStatus = 'good';
                else if (statusStr.includes('普') || statusStr.includes('平')) healthStatus = 'fair';
                else if (statusStr.includes('差') || statusStr.includes('欠')) healthStatus = 'poor';
            }

            const notes = notesIdx !== -1 && row[notesIdx] ? row[notesIdx].trim() : "";

            const newRec = {
                id,
                name,
                latitude,
                longitude,
                altitude: isNaN(altitude) ? null : altitude,
                recordDate,
                gender,
                origin,
                variety,
                wildLocation,
                healthStatus,
                photo: DEFAULT_IMAGE_PATH, // CSV can't hold base64 safely, use default cover
                notes
            };

            const index = records.findIndex(r => r.id === id);
            if (index !== -1) {
                const existing = records[index];
                const sameCoords = Math.abs(existing.latitude - latitude) < 0.00001 && 
                                   Math.abs(existing.longitude - longitude) < 0.00001;
                if (sameCoords) {
                    // Same ID and same coords: overwrite/update
                    newRec.photo = existing.photo;
                    records[index] = newRec;
                } else {
                    // Same ID but different coords: treat as a different tree!
                    newRec.id = id + '-' + (i + 1); 
                    records.push(newRec);
                    addedCount++;
                }
            } else {
                records.push(newRec);
                addedCount++;
            }
        }

        saveRecordsToStorage();
        updateUI();
        
        // Trigger auto sync to cloud if enabled
        uploadRecordsToCloud(true);

        showToast(`CSV 匯入成功！已清空舊資料並載入 ${addedCount} 筆記錄。`, 'success');

    } catch (e) {
        showToast('CSV 檔案解析失敗，請確認編碼與格式是否正確！', 'error');
        console.error(e);
    }
}

// Robust CSV Line parser that handles quotes and commas
function parseCSVRows(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];

        if (c === '"') {
            if (inQuotes && next === '"') { // Double double-quote inside quotes
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') {
                i++;
            }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

// Utility Toast notifier
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    // Remove old classes
    toast.className = 'toast show';
    
    // Set type styling
    if (type === 'success') {
        toast.classList.add('toast-success');
        toastIcon.className = 'fa-solid fa-circle-check';
    } else if (type === 'error') {
        toast.classList.add('toast-error');
        toastIcon.className = 'fa-solid fa-triangle-exclamation';
    } else {
        toast.classList.add('toast-info');
        toastIcon.className = 'fa-solid fa-circle-info';
    }

    toastMessage.innerText = message;

    // Slide out after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

// Escape HTML utility to prevent XSS injection
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// CLOUD SYNC LOGIC (via Google Sheets API)
// ==========================================

const syncModal = document.getElementById('syncModal');
const syncStepConfig = document.getElementById('syncStepConfig');
const syncStepMain = document.getElementById('syncStepMain');
const syncStepNoKey = document.getElementById('syncStepNoKey');
const syncStepHasKey = document.getElementById('syncStepHasKey');
const currentSyncKey = document.getElementById('currentSyncKey');
const inputSyncKey = document.getElementById('inputSyncKey');
const autoSyncCheckbox = document.getElementById('autoSyncCheckbox');
const inputGoogleScriptUrl = document.getElementById('inputGoogleScriptUrl');
const displayGoogleScriptUrl = document.getElementById('displayGoogleScriptUrl');

// Helper to get Google Apps Script URL with a pre-populated default
function getGoogleScriptUrl() {
    let scriptUrl = localStorage.getItem('aiyu_google_script_url');
    if (scriptUrl === null) {
        scriptUrl = "https://script.google.com/macros/s/AKfycbyZAmEm0oipKPpl5MpxNrgRL9HOxmtq-zWYPFoklUvEFRQrchaIXYnVbhi1fNZUTdJm9w/exec";
        localStorage.setItem('aiyu_google_script_url', scriptUrl);
    }
    return scriptUrl;
}

function openCloudSyncModal() {
    const scriptUrl = getGoogleScriptUrl();
    if (scriptUrl === "" || scriptUrl === "none") {
        syncStepConfig.style.display = 'block';
        syncStepMain.style.display = 'none';
        inputGoogleScriptUrl.value = '';
    } else {
        syncStepConfig.style.display = 'none';
        syncStepMain.style.display = 'block';
        displayGoogleScriptUrl.innerText = '已設定 Google 試算表連線';
        
        const key = localStorage.getItem('aiyu_sync_key');
        if (key) {
            currentSyncKey.value = key;
            autoSyncCheckbox.checked = localStorage.getItem('aiyu_auto_sync') === 'true';
            syncStepHasKey.style.display = 'block';
            syncStepNoKey.style.display = 'none';
        } else {
            inputSyncKey.value = '';
            syncStepHasKey.style.display = 'none';
            syncStepNoKey.style.display = 'block';
        }
    }
    syncModal.style.display = 'flex';
}

function closeCloudSyncModal() {
    syncModal.style.display = 'none';
}

function saveGoogleScriptUrl() {
    const url = inputGoogleScriptUrl.value.trim();
    if (!url || !url.startsWith('https://script.google.com/')) {
        showToast('請輸入正確的 Google Apps Script 網頁應用程式網址！', 'error');
        return;
    }
    localStorage.setItem('aiyu_google_script_url', url);
    showToast('已成功保存 Google 試算表網址！', 'success');
    openCloudSyncModal();
}

function clearGoogleScriptUrl() {
    if (confirm('確定要修改或清除 Google 試算表網址嗎？這會中斷目前的雲端同步連結。')) {
        localStorage.setItem('aiyu_google_script_url', 'none');
        localStorage.removeItem('aiyu_sync_key');
        localStorage.removeItem('aiyu_auto_sync');
        showToast('已清除 Google 試算表設定。', 'success');
        openCloudSyncModal();
    }
}

function createNewSyncKey() {
    const scriptUrl = getGoogleScriptUrl();
    if (!scriptUrl || scriptUrl === "none") return;

    showToast('正在向 Google 試算表申請空間並上傳...', 'info');
    
    // Generate a random 8-character key prefixed with "ay-"
    const key = 'ay-' + Math.random().toString(36).substring(2, 10);
    
    fetch(scriptUrl, {
        method: 'POST',
        body: JSON.stringify({
            key: key,
            data: records
        })
    })
    .then(res => {
        if (!res.ok) throw new Error('Create key failed');
        return res.json();
    })
    .then(data => {
        if (data.status !== 'success') throw new Error(data.message || 'Server error');
        
        // Update local records with return data (contains Google Drive URLs instead of base64)
        if (data.data && Array.isArray(data.data)) {
            records = data.data;
            saveRecordsToStorage();
            updateUI();
        }
        
        localStorage.setItem('aiyu_sync_key', key);
        localStorage.setItem('aiyu_auto_sync', 'true');
        showToast('已成功建立同步金鑰！自動同步已啟用。', 'success');
        openCloudSyncModal();
    })
    .catch(err => {
        console.error(err);
        showToast('金鑰建立失敗，請確認您的網路連線與 Google Script 設定。', 'error');
    });
}

function connectExistingSyncKey() {
    const scriptUrl = getGoogleScriptUrl();
    if (!scriptUrl || scriptUrl === "none") return;

    const key = inputSyncKey.value.trim();
    if (!key) {
        showToast('請先輸入您的同步金鑰！', 'error');
        return;
    }

    showToast('正在連結 Google 試算表並下載資料...', 'info');
    
    fetch(`${scriptUrl}?key=${encodeURIComponent(key)}`)
    .then(res => {
        if (!res.ok) throw new Error('Connection failed');
        return res.json();
    })
    .then(cloudRecords => {
        if (!Array.isArray(cloudRecords)) {
            throw new Error('Invalid format');
        }
        
        localStorage.setItem('aiyu_sync_key', key);
        localStorage.setItem('aiyu_auto_sync', 'true');

        // Merge cloud records into local
        let added = 0;
        let updated = 0;
        cloudRecords.forEach(c => {
            const idx = records.findIndex(r => r.id === c.id);
            if (idx !== -1) {
                records[idx] = c;
                updated++;
            } else {
                records.push(c);
                added++;
            }
        });

        saveRecordsToStorage();
        updateUI();
        showToast(`已成功連結！同步下載了 ${added + updated} 筆資料。`, 'success');
        openCloudSyncModal();
    })
    .catch(err => {
        console.error(err);
        showToast('金鑰無效或 Google 讀取失敗，請確認金鑰與網址是否正確。', 'error');
    });
}

function uploadRecordsToCloud(silent = false) {
    const scriptUrl = getGoogleScriptUrl();
    const key = localStorage.getItem('aiyu_sync_key');
    if (!scriptUrl || scriptUrl === "none" || !key) return Promise.resolve();

    if (!silent) showToast('正在同步上傳資料至 Google 試算表...', 'info');

    return fetch(scriptUrl, {
        method: 'POST',
        body: JSON.stringify({
            key: key,
            data: records
        })
    })
    .then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    })
    .then(data => {
        if (data.status !== 'success') throw new Error(data.message || 'Server error');
        
        // Update local records with return data (contains Google Drive URLs instead of base64)
        if (data.data && Array.isArray(data.data)) {
            records = data.data;
            saveRecordsToStorage();
            updateUI();
        }
        
        if (!silent) showToast('上傳雲端成功！', 'success');
    })
    .catch(err => {
        console.error(err);
        if (!silent) showToast('上傳雲端失敗，請檢查網路。', 'error');
    });
}

function downloadRecordsFromCloud() {
    const scriptUrl = getGoogleScriptUrl();
    const key = localStorage.getItem('aiyu_sync_key');
    if (!scriptUrl || scriptUrl === "none" || !key) return;

    showToast('正在從 Google 試算表下載最新資料...', 'info');
    
    fetch(`${scriptUrl}?key=${encodeURIComponent(key)}`)
    .then(res => {
        if (!res.ok) throw new Error('Download failed');
        return res.json();
    })
    .then(cloudRecords => {
        if (!Array.isArray(cloudRecords)) throw new Error('Invalid cloud data');

        let added = 0;
        let updated = 0;
        
        cloudRecords.forEach(c => {
            const idx = records.findIndex(r => r.id === c.id);
            if (idx !== -1) {
                records[idx] = c;
                updated++;
            } else {
                records.push(c);
                added++;
            }
        });

        saveRecordsToStorage();
        updateUI();
        showToast(`同步下載完成！(新增 ${added} 筆，更新 ${updated} 筆資料)`, 'success');
    })
    .catch(err => {
        console.error(err);
        showToast('從雲端下載資料失敗，請檢查網路。', 'error');
    });
}

function copySyncKey() {
    const keyInput = document.getElementById('currentSyncKey');
    keyInput.select();
    keyInput.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(keyInput.value)
    .then(() => {
        showToast('同步金鑰已複製到剪貼簿！', 'success');
    })
    .catch(() => {
        try {
            document.execCommand('copy');
            showToast('同步金鑰已複製到剪貼簿！', 'success');
        } catch (e) {
            showToast('複製失敗，請手動複製金鑰文字。', 'error');
        }
    });
}

function toggleAutoSync(enabled) {
    localStorage.setItem('aiyu_auto_sync', enabled ? 'true' : 'false');
    if (enabled) {
        uploadRecordsToCloud(true);
    }
}

function disconnectSyncKey() {
    if (confirm('確定要斷開與此金鑰的連結嗎？這不會刪除 any 資料，但會停止自動同步。')) {
        localStorage.removeItem('aiyu_sync_key');
        localStorage.removeItem('aiyu_auto_sync');
        showToast('已成功中斷雲端同步連結。', 'success');
        openCloudSyncModal();
    }
}

function triggerStartupSync() {
    const scriptUrl = getGoogleScriptUrl();
    const autoSync = localStorage.getItem('aiyu_auto_sync') === 'true';
    const key = localStorage.getItem('aiyu_sync_key');
    
    if (scriptUrl && scriptUrl !== "none" && autoSync && key) {
        fetch(`${scriptUrl}?key=${encodeURIComponent(key)}`)
        .then(res => {
            if (res.ok) return res.json();
        })
        .then(cloudRecords => {
            if (cloudRecords && Array.isArray(cloudRecords)) {
                let changed = false;
                cloudRecords.forEach(c => {
                    const idx = records.findIndex(r => r.id === c.id);
                    if (idx !== -1) {
                        if (JSON.stringify(records[idx]) !== JSON.stringify(c)) {
                            records[idx] = c;
                            changed = true;
                        }
                    } else {
                        records.push(c);
                        changed = true;
                    }
                });
                if (changed) {
                    localStorage.setItem('aiyu_tree_records', JSON.stringify(records));
                    updateUI();
                }
            }
        })
        .catch(err => console.error("Auto startup sync failed:", err));
    }
}

// ==========================================
// LOCAL WEBSOCKET SYNC LOGIC (Same as Triage System)
// ==========================================

function initWebSocket() {
    // Only connect if served over http/https (e.g. running on local server)
    if (!window.location.protocol.startsWith('http')) {
        console.log("Not running via server, real-time WebSocket sync disabled.");
        updateWsIndicator(false);
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`[WS] Connecting to local sync server at: ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("[WS] Connected to sync server");
        wsConnected = true;
        updateWsIndicator(true);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("[WS] Received message type:", message.type);
            
            if (message.type === 'init') {
                if (message.data && Array.isArray(message.data.records)) {
                    // Update local state if the server has records
                    if (message.data.records.length > 0) {
                        records = message.data.records;
                        localStorage.setItem('aiyu_tree_records', JSON.stringify(records));
                        updateUI();
                        showToast(`已自同步伺服器載入 ${records.length} 筆最新樹木資料。`, 'success');
                    } else if (records.length > 0) {
                        // If server has no records but client has some, initialize server with client records
                        sendWsAction('SYNC_STATE', records);
                    }
                }
            } else if (message.type === 'STATE_UPDATE') {
                if (Array.isArray(message.data)) {
                    records = message.data;
                    localStorage.setItem('aiyu_tree_records', JSON.stringify(records));
                    updateUI();
                    showToast('已自伺服器同步更新最新樹木資料！', 'info');
                }
            }
        } catch (err) {
            console.error("[WS] Error parsing message:", err);
        }
    };

    ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting in 5s...");
        wsConnected = false;
        updateWsIndicator(false);
        setTimeout(initWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error("[WS] Connection error:", err);
        ws.close();
    };
}

function sendWsAction(type, data) {
    if (ws && wsConnected && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

function updateWsIndicator(connected) {
    const badge = document.getElementById('connStatusBadge');
    const btn = document.getElementById('cloudSyncBtn');
    
    if (badge) {
        badge.style.background = connected ? '#10b981' : '#ef4444'; // Green if connected, Red if offline
    }
    
    if (btn) {
        btn.title = connected ? '已連線至本機同步伺服器' : '未連接本機同步伺服器 (單機/雲端金鑰模式)';
    }
}

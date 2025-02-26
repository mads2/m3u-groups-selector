// Main app state
const appState = {
    items: [],
    groups: [],
    selectedIds: new Set(),
    selectedGroupIds: new Set(),
};

// DOM Elements
const fileInput = document.getElementById('fileInput');
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const groupItems = document.getElementById('groupItems');
const groupItemsMessage = document.getElementById('groupItemsMessage');
const printSelectedBtn = document.getElementById('printSelectedBtn');
const selectedOutput = document.getElementById('selectedOutput');
const outputSelectedBtn = document.getElementById('outputSelectedBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const groupsCounter = document.getElementById('groupsCounter');
const selectedCounter = document.getElementById('selectedCounter');
const loadingIndicator = document.getElementById('loading');

// Event Listeners
fileInput.addEventListener('change', handleFileUpload);
fetchBtn.addEventListener('click', fetchFromUrl);
printSelectedBtn.addEventListener('click', printSelectedItems);
outputSelectedBtn.addEventListener('click', outputSelectedGroups);
selectAllBtn.addEventListener('click', selectAllGroups);
deselectAllBtn.addEventListener('click', deselectAllGroups);

// Make toggle functions available globally
window.toggleSelectGroup = toggleSelectGroup;

// Reset appState
function resetAppState() {
    appState.items = [];
    appState.groups = [];
    appState.selectedIds = new Set();
    appState.selectedGroupIds = new Set();
    updateCounters();
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showLoading(true);
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        const lines = text.split(/\r?\n/); // Split by newlines (handles both \n and \r\n)
        try {
            processData(lines);
        } catch (error) {
            showNotification('Error parsing file: ' + error, 'error');
        } finally {
            showLoading(false);
        }
    };
    reader.onerror = function() {
        showNotification('Failed to read file', 'error');
        showLoading(false);
    };
    reader.readAsText(file);
}

// Fetch data from URL
function fetchFromUrl() {
    const url = urlInput.value.trim();
    if (!url) {
        showNotification('Please enter a valid URL', 'error');
        return;
    }

    showLoading(true);
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.text();
        })
        .then(data => {
            const lines = data.split(/\r?\n/);
            processData(lines);
        })
        .catch(error => {
            showNotification('Error fetching data: ' + error.message, 'error');
        })
        .finally(() => {
            showLoading(false);
        });
}

// Process the data into objects
function processData(data) {
    resetAppState();
    
    const startIndex = data.findIndex(line => line.startsWith('#EXTINF'));
    if (startIndex === -1) {
        showNotification('No valid M3U entries found in file', 'error');
        return;
    }
    
    const relevantLines = data.slice(startIndex);
    const groupsSet = new Set();
    
    for (let i = 0; i < relevantLines.length; i += 2) {
        const infoLine = relevantLines[i];
        const urlLine = relevantLines[i + 1];

        if (!infoLine || !urlLine || !infoLine.startsWith('#EXTINF') || urlLine.startsWith('#')) continue;

        // Split into attributes part and title
        const [attributesPart, title] = infoLine.split(/,(.+)/);

        // Extract key-value pairs from attributes
        const attributeRegex = /(\S+?)="(.*?)"/g;
        const attributes = {};
        let match;

        while ((match = attributeRegex.exec(attributesPart)) !== null) {
            attributes[match[1]] = match[2];
        }

        // Create entry object
        const entry = {
            id: appState.items.length + 1,
            tvgId: attributes['tvg-id'] || '',
            tvgName: attributes['tvg-name'] || '',
            tvgLogo: attributes['tvg-logo'] || '',
            groupTitle: attributes['group-title'] || 'Ungrouped',
            title: title?.trim() || 'Unnamed Channel',
            url: urlLine.trim()
        };

        appState.items.push(entry);
        groupsSet.add(entry.groupTitle);
    }

    // Create groups array with IDs
    appState.groups = Array.from(groupsSet).map((groupName, index) => {
        return {
            id: index + 1,
            name: groupName,
            count: appState.items.filter(item => item.groupTitle === groupName).length
        };
    });

    // Sort groups by name
    appState.groups.sort((a, b) => a.name.localeCompare(b.name));
    
    if (appState.items.length > 0) {
        showNotification(`Successfully processed ${appState.items.length} channels in ${appState.groups.length} groups`, 'success');
    } else {
        showNotification('No channels found in file', 'warning');
    }
    
    renderGroups();
    updateCounters();
}

// Render groups in the list
function renderGroups() {
    if (appState.groups.length === 0) {
        groupItemsMessage.style.display = 'block';
        groupItems.innerHTML = '';
        return;
    }

    groupItemsMessage.style.display = 'none';

    const groupHtml = appState.groups.map(group => {
        const isSelected = appState.selectedGroupIds.has(group.id);
        const selectedClass = isSelected ? 'selected' : '';
        const iconClass = isSelected ? 'fa-check-circle' : 'fa-circle';
        
        return `
        <div class="item ${selectedClass}" data-id="${group.id}">
          <div class="item-details">
            <i class="fas ${iconClass}"></i>
            <strong>${escapeHtml(group.name)}</strong>
            <span class="counter-badge">${group.count} channels</span>
          </div>
          <button class="select-btn ${isSelected ? '' : 'secondary'}" onclick="toggleSelectGroup(${group.id})">
            ${isSelected ? 'Selected' : 'Select'}
          </button>
        </div>
      `;
    }).join('');

    groupItems.innerHTML = groupHtml;
}

// Toggle group selection
function toggleSelectGroup(groupId) {
    if (appState.selectedGroupIds.has(groupId)) {
        appState.selectedGroupIds.delete(groupId);
    } else {
        appState.selectedGroupIds.add(groupId);
    }
    renderGroups();
    updateCounters();
}

// Select all groups
function selectAllGroups() {
    appState.groups.forEach(group => {
        appState.selectedGroupIds.add(group.id);
    });
    renderGroups();
    updateCounters();
}

// Deselect all groups
function deselectAllGroups() {
    appState.selectedGroupIds.clear();
    renderGroups();
    updateCounters();
    selectedOutput.innerHTML = '';
}

// Print selected items
function printSelectedItems() {
    const selectedGroups = appState.groups.filter(group => appState.selectedGroupIds.has(group.id));

    if (selectedGroups.length === 0) {
        selectedOutput.innerHTML = '<p class="empty-message">No groups selected.</p>';
        return;
    }

    const selectedGroupNames = selectedGroups.map(group => group.name);
    const selectedChannels = appState.items.filter(item => 
        selectedGroupNames.includes(item.groupTitle)
    );

    if (selectedChannels.length === 0) {
        selectedOutput.innerHTML = '<p class="empty-message">No channels in selected groups.</p>';
        return;
    }

    const output = selectedChannels.map(channel => {
        return `
        <div class="selected-item-card">
            <img src="${channel.tvgLogo || '/api/placeholder/30/30'}" width="30" height="30" 
                 onerror="this.src='/api/placeholder/30/30'; this.onerror=null;">
            <div>
                <strong>${escapeHtml(channel.title)}</strong>
                <div><small>${escapeHtml(channel.groupTitle)}</small></div>
            </div>
        </div>`;
    }).join('');
    
    selectedOutput.innerHTML = output;
    updateCounters();
}

// Output selected groups
function outputSelectedGroups() {
    const selectedGroups = appState.groups.filter(group => appState.selectedGroupIds.has(group.id));
    
    if (selectedGroups.length === 0) {
        showNotification('Please select at least one group to export', 'warning');
        return;
    }
    
    const selectedGroupNames = selectedGroups.map(group => group.name);
    const selectedChannels = appState.items.filter(item => 
        selectedGroupNames.includes(item.groupTitle)
    );
    
    if (selectedChannels.length === 0) {
        showNotification('No channels found in selected groups', 'warning');
        return;
    }
    
    const outputData = generateM3U(selectedChannels);
    const filename = `playlist_${new Date().toISOString().slice(0,10)}.m3u`;
    
    downloadStringAsFile(outputData, filename);
    showNotification(`Exported ${selectedChannels.length} channels to ${filename}`, 'success');
}

// Generate M3U content
function generateM3U(entries) {
    const lines = ['#EXTM3U'];
    
    for (const entry of entries) {
        // Build attributes string
        const attributes = [];
        if (entry.tvgId) attributes.push(`tvg-id="${entry.tvgId}"`);
        if (entry.tvgName) attributes.push(`tvg-name="${entry.tvgName}"`);
        if (entry.tvgLogo) attributes.push(`tvg-logo="${entry.tvgLogo}"`);
        if (entry.groupTitle) attributes.push(`group-title="${entry.groupTitle}"`);
        
        // Build the EXTINF line
        const extinfLine = `#EXTINF:-1 ${attributes.join(' ')},${entry.title}`;
        
        lines.push(extinfLine);
        lines.push(entry.url);
    }
    
    return lines.join('\n');
}

// Download string as file
function downloadStringAsFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show/hide loading indicator
function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
    groupItemsMessage.style.display = show ? 'none' : (appState.groups.length === 0 ? 'block' : 'none');
}

// Show notification (you can add a notification system)
function showNotification(message, type) {
    console.log(`[${type}] ${message}`);
    // In a real application, you would implement a proper notification system
    alert(message);
}

// Update counters
function updateCounters() {
    groupsCounter.textContent = `${appState.groups.length} groups`;
    
    const selectedGroups = appState.groups.filter(group => appState.selectedGroupIds.has(group.id));
    const selectedGroupNames = selectedGroups.map(group => group.name);
    const selectedChannels = appState.items.filter(item => 
        selectedGroupNames.includes(item.groupTitle)
    );
    
    selectedCounter.textContent = `${selectedChannels.length} channels`;
}

// Initialize the application
function initApp() {
    resetAppState();
    renderGroups();
}

// Start the app
initApp();
// --- VARIABLES GLOBALES ---
const cols = 12;
const rows = 12;
const spacing = 50;
let grid = [];
let buses = [];
let missions = [];
let depotNode;
let closedRoads = [];
let totalEnergySaved = 0;
let timeMultiplier = 1;
let isPaused = false;
let simTime = 0;
let hoveredBusId = null;

let clockMins = 300; // Commence à 05:00
let daySpeed = 1440 / (180 * 60); // 3 minutes = 24h
let isAutoMode = false;
let rushMorningDone = false;
let rushEveningDone = false;
let hotspots = [];

// NOUVEAU : Mode Rayons X
let isHeatmapMode = false;

let chartHistory = [];
const maxHistoryPoints = 150;
const MODULE_CAPACITIES = [4, 6, 10, 12];

function setup() {
    let canvas = createCanvas(cols * spacing, rows * spacing);
    canvas.parent('canvas-container');

    // NOUVEAU : Ajout de la variable "heat" pour la température du sol
    for (let i = 0; i < cols; i++) {
        grid[i] = [];
        for (let j = 0; j < rows; j++) {
            grid[i][j] = {
                i: i,
                j: j,
                x: i * spacing + spacing / 2,
                y: j * spacing + spacing / 2,
                neighbors: [],
                heat: 0
            };
        }
    }
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let node = grid[i][j];
            if (i < cols - 1) node.neighbors.push(grid[i + 1][j]);
            if (i > 0) node.neighbors.push(grid[i - 1][j]);
            if (j < rows - 1) node.neighbors.push(grid[i][j + 1]);
            if (j > 0) node.neighbors.push(grid[i][j - 1]);
        }
    }

    removeRoadsWhileConnected(0.35);
    depotNode = grid[0][0];

    hotspots = [
        {node: grid[cols - 2][2], name: "Gare Centrale", color: '#8e44ad', icon: '🚆'},
        {node: grid[2][rows - 2], name: "Université", color: '#f39c12', icon: '🎓'},
        {node: grid[cols - 2][rows - 2], name: "Centre Commercial", color: '#e74c3c', icon: '🛍️'}
    ];

    for (let i = 0; i < 8; i++) buses.push(new Bus(depotNode, random(MODULE_CAPACITIES), i + 1));

    for (let i = 0; i < maxHistoryPoints; i++) chartHistory.push({waiting: 0, inTransit: 0, power: 0, fusionRate: 0});

    logAction("✅ Système initialisé. Simulation de flotte activée.");

    document.getElementById('btn-spawn').addEventListener('click', () => {
        spawnRandomMission();
    });

    // NOUVEAU : Écouteur pour le bouton Rayons X
    const btnHeatmap = document.getElementById('btn-heatmap');
    btnHeatmap.addEventListener('click', () => {
        isHeatmapMode = !isHeatmapMode;
        if (isHeatmapMode) btnHeatmap.classList.add('active');
        else btnHeatmap.classList.remove('active');
        logAction(isHeatmapMode ? "👁️ Vue Thermique (Rayons X) ACTIVÉE." : "👁️ Vue Thermique DÉSACTIVÉE.");
    });

    const btnPause = document.getElementById('btn-pause');
    const btnX1 = document.getElementById('btn-x1');
    const btnX2 = document.getElementById('btn-x2');
    const btnX5 = document.getElementById('btn-x5');

    function updateTimeUI(activeBtn) {
        [btnPause, btnX1, btnX2, btnX5].forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    btnPause.addEventListener('click', () => {
        isPaused = true;
        updateTimeUI(btnPause);
        logAction("⏸️ Pause.");
    });
    btnX1.addEventListener('click', () => {
        isPaused = false;
        timeMultiplier = 1;
        updateTimeUI(btnX1);
        logAction("▶️ Vitesse x1.");
    });
    btnX2.addEventListener('click', () => {
        isPaused = false;
        timeMultiplier = 2;
        updateTimeUI(btnX2);
        logAction("⏩ Vitesse x2.");
    });
    btnX5.addEventListener('click', () => {
        isPaused = false;
        timeMultiplier = 5;
        updateTimeUI(btnX5);
        logAction("⏭️ Vitesse x5.");
    });

    const btnManual = document.getElementById('btn-manual');
    const btnAuto = document.getElementById('btn-auto');
    btnManual.addEventListener('click', () => {
        isAutoMode = false;
        btnManual.classList.add('active');
        btnAuto.classList.remove('active');
        document.getElementById('btn-spawn').style.display = 'block';
        logAction("✋ Mode Manuel activé.");
    });
    btnAuto.addEventListener('click', () => {
        isAutoMode = true;
        btnAuto.classList.add('active');
        btnManual.classList.remove('active');
        document.getElementById('btn-spawn').style.display = 'none';
        logAction("🤖 Mode Automatique activé.");
    });
}

function draw() {
    if (!isPaused) {
        for (let step = 0; step < timeMultiplier; step++) {
            simTime++;
            if (isAutoMode) {
                clockMins += daySpeed;
                if (clockMins >= 1440) {
                    clockMins -= 1440;
                    rushMorningDone = false;
                    rushEveningDone = false;
                }

                if (clockMins >= 480 && clockMins < 490 && !rushMorningDone) {
                    rushMorningDone = true;
                    triggerRushHour("🌅 HEURE DE POINTE (Matin) !");
                }
                if (clockMins >= 1050 && clockMins < 1060 && !rushEveningDone) {
                    rushEveningDone = true;
                    triggerRushHour("🌇 HEURE DE POINTE (Soir) !");
                }

                if (clockMins >= 120 && clockMins < 120 + daySpeed && missions.length > 0) {
                    missions = [];
                    logAction("🛑 02:00 - Fin de service. Toutes les demandes en attente sont annulées.");
                }

                let isNetworkClosed = clockMins >= 120 && clockMins < 300;
                if (!isNetworkClosed) {
                    let spawnRate = 0;
                    if (clockMins >= 300 && clockMins < 1200) spawnRate = 0.008; // Haute fréquence (petits groupes)
                    else if (clockMins >= 1200 && clockMins <= 1440) spawnRate = 0.003;
                    else spawnRate = 0.0005;
                    if (Math.random() < spawnRate) spawnRandomMission();
                }
            }

            dispatchMissions();
            for (let bus of buses) bus.updateMovement();
            for (let bus of buses) bus.checkFusion();
            handleInternalTransfers();

            // NOUVEAU : ALGORITHME THERMIQUE (Refroidissement et Chauffe)
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    grid[i][j].heat *= 0.99; // Le sol refroidit doucement
                }
            }
            for (let m of missions) {
                m.start.heat += m.waiting * 0.15; // Les passagers chauffent le trottoir !
            }

            if (simTime % 60 === 0) updateChartData();
        }
    }

    // --- SÉPARATION DU RENDU VISUEL ---
    if (isHeatmapMode) {
        // VUE THERMIQUE RAYONS X
        background(15, 20, 25); // Nuit d'encre absolue

        // Routes fantomatiques
        stroke(255, 255, 255, 15);
        strokeWeight(2);
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                let node = grid[i][j];
                for (let neighbor of node.neighbors) {
                    line(node.x, node.y, neighbor.x, neighbor.y);
                }
            }
        }
        for (let r of closedRoads) {
            stroke(231, 76, 60, 50);
            strokeWeight(4);
            line(r.a.x, r.a.y, r.b.x, r.b.y);
        }

        // DESSIN DE LA CHALEUR (Blur Gaussien + Fusion de lumières ADD)
        push();
        drawingContext.filter = 'blur(20px)';
        blendMode(ADD);
        noStroke();

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                let heat = grid[i][j].heat;
                if (heat > 0.5) {
                    let intensity = min(heat / 100, 1);
                    let c;
                    if (intensity < 0.5) c = lerpColor(color(0, 150, 255), color(255, 255, 0), intensity * 2);
                    else c = lerpColor(color(255, 255, 0), color(255, 0, 0), (intensity - 0.5) * 2);

                    c.setAlpha(intensity * 180 + 30);
                    fill(c);
                    circle(grid[i][j].x, grid[i][j].y, spacing * 1.5 + (intensity * spacing));
                }
            }
        }
        pop();

        // Affichage épuré des modules
        for (let bus of buses) {
            if (bus.state !== 'IDLE' || bus.isCharging) {
                fill(255, 255, 255, 150);
                noStroke();
                circle(bus.currentX, bus.currentY, 6);
                if (bus.isFused) {
                    fill(230, 126, 34, 255);
                    circle(bus.currentX, bus.currentY, 8);
                }
            }
        }

    } else {
        // VUE CLASSIQUE (Ta version d'origine)
        let bgDarkness = 0;
        if (clockMins < 360 || clockMins > 1140) bgDarkness = 160;
        else if (clockMins > 360 && clockMins < 480) bgDarkness = map(clockMins, 360, 480, 160, 0);
        else if (clockMins > 1020 && clockMins < 1140) bgDarkness = map(clockMins, 1020, 1140, 0, 160);
        background(240 - bgDarkness, 240 - bgDarkness, 245 - (bgDarkness * 0.8));

        stroke(200 - (bgDarkness * 0.5));
        strokeWeight(15);
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                let node = grid[i][j];
                for (let neighbor of node.neighbors) {
                    line(node.x, node.y, neighbor.x, neighbor.y);
                }
            }
        }

        for (let r of closedRoads) {
            stroke(231, 76, 60);
            strokeWeight(15);
            line(r.a.x, r.a.y, r.b.x, r.b.y);
            stroke(241, 196, 15);
            strokeWeight(15);
            drawingContext.setLineDash([15, 15]);
            line(r.a.x, r.a.y, r.b.x, r.b.y);
            drawingContext.setLineDash([]);
        }

        fill(50);
        noStroke();
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                circle(grid[i][j].x, grid[i][j].y, 8);
            }
        }

        fill(149, 165, 166);
        rectMode(CENTER);
        rect(depotNode.x, depotNode.y, 40, 40, 8);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(16);
        text("P", depotNode.x, depotNode.y);

        for (let hs of hotspots) {
            fill(hs.color);
            rect(hs.node.x, hs.node.y, 35, 35, 6);
            fill(255);
            textSize(14);
            text(hs.icon, hs.node.x, hs.node.y);
        }

        for (let m of missions) {
            fill(231, 76, 60);
            rectMode(CENTER);
            rect(m.end.x, m.end.y, 12, 12);
            if (m.waiting > 0) {
                fill(241, 196, 15);
                circle(m.start.x, m.start.y, 20);
                fill(0);
                textSize(12);
                textAlign(CENTER, CENTER);
                text(m.waiting, m.start.x, m.start.y - 20);
                stroke(241, 196, 15, 100);
                strokeWeight(2);
                drawingContext.setLineDash([5, 5]);
                line(m.start.x, m.start.y, m.end.x, m.end.y);
                drawingContext.setLineDash([]);
                noStroke();
            }
        }

        if (hoveredBusId !== null) {
            push();
            fill(240 - bgDarkness, 240 - bgDarkness, 240 - bgDarkness, 200);
            noStroke();
            rectMode(CORNER);
            rect(0, 0, width, height);
            pop();
        }

        for (let bus of buses) bus.showBody();
        for (let bus of buses) bus.showLabel();
    }

    updateUI();
    drawAnalyticsChart();
}

function updateChartData() {
    let totalWaiting = missions.reduce((sum, m) => sum + m.waiting, 0);
    let totalInTransit = missions.reduce((sum, m) => sum + m.inTransit, 0);
    let totalPower = buses.reduce((sum, b) => sum + b.currentKWh, 0);

    let activeBuses = buses.filter(b => b.state !== 'IDLE' && b.state !== 'RETURNING' && !b.isCharging).length;
    let fusedBuses = buses.filter(b => b.isFused).length;
    let fusionRate = activeBuses > 0 ? (fusedBuses / activeBuses) * 100 : 0;

    chartHistory.push({waiting: totalWaiting, inTransit: totalInTransit, power: totalPower, fusionRate: fusionRate});
    if (chartHistory.length > maxHistoryPoints) chartHistory.shift();
}

function drawAnalyticsChart() {
    const canvas = document.getElementById('analytics-chart');
    if (!canvas) return;
    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (chartHistory.length < 2) return;

    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 4);
    ctx.lineTo(w, h / 4);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    let maxPeople = Math.max(...chartHistory.map(d => Math.max(d.waiting || 0, d.inTransit || 0)), 20);
    let maxPower = Math.max(...chartHistory.map(d => d.power || 0), 80);

    function drawLine(key, color, maxValue, isPercentage = false) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < chartHistory.length; i++) {
            let x = (i / (maxHistoryPoints - 1)) * w;
            let val = isPercentage ? chartHistory[i][key] / 100 : chartHistory[i][key] / maxValue;
            let y = h - val * (h - 10) - 5;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    drawLine('power', 'rgba(155, 89, 182, 0.4)', maxPower);
    drawLine('inTransit', 'rgba(52, 152, 219, 0.8)', maxPeople);
    drawLine('waiting', 'rgba(231, 76, 60, 0.9)', maxPeople);
    drawLine('fusionRate', 'rgba(230, 126, 34, 0.9)', 100, true);
}

function triggerRushHour(message) {
    logAction(`🚨 ${message}`);
    // 4 zones au lieu de 6
    for (let i = 0; i < 4; i++) {
        let startNode = Math.random() > 0.5 ? random(hotspots).node : grid[floor(random(cols))][floor(random(rows))];
        let endNode = Math.random() > 0.5 ? random(hotspots).node : grid[floor(random(cols))][floor(random(rows))];
        while (endNode === startNode) endNode = grid[floor(random(cols))][floor(random(rows))];

        // Groupes de 5 à 12 personnes
        let groupSize = floor(random(5, 13));

        missions.push({
            start: startNode,
            end: endNode,
            total: groupSize,
            waiting: groupSize,
            assigned: 0,
            inTransit: 0
        });
    }
}

function mousePressed() {
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
    let closestNode = null;
    let recordDist = Infinity;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let d = dist(mouseX, mouseY, grid[i][j].x, grid[i][j].y);
            if (d < recordDist) {
                recordDist = d;
                closestNode = grid[i][j];
            }
        }
    }
    if (!closestNode) return;
    let secondNode = null;
    let secondDist = Infinity;
    let potentialNeighbors = [];
    if (closestNode.i > 0) potentialNeighbors.push(grid[closestNode.i - 1][closestNode.j]);
    if (closestNode.i < cols - 1) potentialNeighbors.push(grid[closestNode.i + 1][closestNode.j]);
    if (closestNode.j > 0) potentialNeighbors.push(grid[closestNode.i][closestNode.j - 1]);
    if (closestNode.j < rows - 1) potentialNeighbors.push(grid[closestNode.i][closestNode.j + 1]);
    for (let n of potentialNeighbors) {
        let d = dist(mouseX, mouseY, n.x, n.y);
        if (d < secondDist) {
            secondDist = d;
            secondNode = n;
        }
    }
    if (closestNode && secondNode) {
        let idxA = closestNode.neighbors.indexOf(secondNode);
        let idxB = secondNode.neighbors.indexOf(closestNode);
        if (idxA !== -1 && idxB !== -1) {
            closestNode.neighbors.splice(idxA, 1);
            secondNode.neighbors.splice(idxB, 1);
            closedRoads.push({a: closestNode, b: secondNode});
            logAction(`🚧 ALERTE : Route coupée. Déviation activée.`);
        } else {
            closestNode.neighbors.push(secondNode);
            secondNode.neighbors.push(closestNode);
            closedRoads = closedRoads.filter(r => !((r.a === closestNode && r.b === secondNode) || (r.a === secondNode && r.b === closestNode)));
            logAction(`✅ TRAVAUX FINIS.`);
        }
        for (let bus of buses) {
            if (bus.targetNode) bus.setDestination(bus.targetNode);
        }
    }
}

function logAction(message) {
    const logDiv = document.getElementById('action-log');
    const time = new Date().toLocaleTimeString('fr-FR', {hour12: false});
    const p = document.createElement('p');
    p.className = 'log-entry';
    p.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function removeRoadsWhileConnected(percentage) {
    let edges = [];
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let node = grid[i][j];
            for (let neighbor of node.neighbors) {
                if (node.i < neighbor.i || (node.i === neighbor.i && node.j < neighbor.j)) {
                    edges.push({a: node, b: neighbor});
                }
            }
        }
    }

    edges.sort(() => random() - 0.5);
    let edgesToRemove = floor(edges.length * percentage);
    let removedCount = 0;

    for (let edge of edges) {
        if (removedCount >= edgesToRemove) break;

        let idxA = edge.a.neighbors.indexOf(edge.b);
        edge.a.neighbors.splice(idxA, 1);

        let idxB = edge.b.neighbors.indexOf(edge.a);
        edge.b.neighbors.splice(idxB, 1);

        if (isConnected()) {
            removedCount++;
        } else {
            edge.a.neighbors.push(edge.b);
            edge.b.neighbors.push(edge.a);
        }
    }
}

function isConnected() {
    let startNode = grid[0][0];
    let visited = new Set();
    let queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
        let current = queue.shift();
        for (let neighbor of current.neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return visited.size === (cols * rows);
}

function updateUI() {
    let hrs = Math.floor(clockMins / 60);
    let mins = Math.floor(clockMins % 60);
    document.getElementById('clock-display').innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

    let idleCount = 0;
    let activeCount = 0;
    let fusedModulesCount = 0;
    let gridContainer = document.getElementById('bus-grid');
    if (gridContainer.children.length === 0) {
        for (let bus of buses) {
            let card = document.createElement('div');
            card.className = 'bus-card';
            card.id = `bus-card-${bus.id}`;
            card.addEventListener('mouseenter', () => {
                hoveredBusId = bus.id;
            });
            card.addEventListener('mouseleave', () => {
                hoveredBusId = null;
            });
            gridContainer.appendChild(card);
        }
    }

    for (let bus of buses) {
        if (bus.state === 'IDLE' && !bus.isCharging) idleCount++; else activeCount++;
        if (bus.isFused) fusedModulesCount++;

        let stateColor = '#95a5a6';
        let stateText = "Repos / En Attente";
        let batColor = bus.battery > 50 ? '#2ecc71' : (bus.battery > 20 ? '#f39c12' : '#e74c3c');
        let batWarning = '';

        if (bus.battery <= 0) {
            batWarning = '💥 BATTERIE VIDE';
        } else if (bus.battery <= 20) {
            batWarning = '🔌 Besoin charge';
        }

        if (bus.isCharging) {
            stateColor = '#8e44ad';
            stateText = "⚡ EN CHARGE";
            batWarning = "⏳ Recharge...";
            batColor = '#8e44ad';
        } else if (bus.isFused) {
            stateColor = '#e67e22';
            if (bus.state === 'CARRYING') stateText = "🔗 Fusion (Transit)"; else if (bus.state === 'GOING_TO_PICKUP') stateText = "🔗 Fusion (Approche)"; else stateText = "🔗 Fusion (Patrouille)";
        } else if (bus.state === 'GOING_TO_PICKUP') {
            stateColor = '#3498db';
            stateText = "🔵 En approche";
        } else if (bus.state === 'CARRYING') {
            stateColor = '#2ecc71';
            stateText = "🟢 En transit";
        } else if (bus.state === 'RETURNING') {
            stateColor = '#7f8c8d';
            stateText = "⚪ Retour Dépôt";
        } else if (bus.state === 'PREPOSITIONING') {
            stateColor = '#f1c40f';
            stateText = "📍 Patrouille (Hotspot)";
        }

        let card = document.getElementById(`bus-card-${bus.id}`);
        card.style.borderLeftColor = stateColor;
        card.innerHTML = `<h3>Mod. #${bus.id} <span style="font-size: 0.75rem; float: right; color: #7f8c8d;">${bus.maxCapacity} pl.</span></h3><p><b>Passagers :</b> ${bus.currentPassengers} / ${bus.maxCapacity} ${bus.reservedSeats > 0 ? '(+' + bus.reservedSeats + ' résa)' : ''}</p><p><b>État :</b> ${stateText}</p><p><b>🔋 Batterie :</b> <span style="color: ${batColor}; font-weight: bold;">${bus.battery.toFixed(1)}%</span> <span style="font-size: 0.7rem; color: #e74c3c;">${batWarning}</span></p><p><b>⚡ Moteur :</b> ${bus.currentKWh.toFixed(1)} kW ${bus.isFused ? '<span style="color:#e67e22; font-size: 0.75rem;">(ÉCO)</span>' : ''}</p>`;
    }
    document.getElementById('stat-idle').innerText = idleCount;
    document.getElementById('stat-active').innerText = activeCount;
    document.getElementById('stat-fusions').innerText = Math.floor(fusedModulesCount / 2);
    document.getElementById('stat-eco').innerText = totalEnergySaved.toFixed(2);
}

function spawnRandomMission() {
    let startNode = grid[floor(random(cols))][floor(random(rows))];
    let endNode = grid[floor(random(cols))][floor(random(rows))];
    while (endNode === startNode) endNode = grid[floor(random(cols))][floor(random(rows))];

    // Groupes de 1 à 5 personnes max
    let groupSize = floor(random(1, 6));

    logAction(`📡 Appel : Groupe de ${groupSize} personnes.`);
    missions.push({start: startNode, end: endNode, total: groupSize, waiting: groupSize, assigned: 0, inTransit: 0});
}

function dispatchMissions() {
    for (let m of missions) {
        let needed = m.waiting - m.assigned;
        if (needed > 0) {
            let bestBus = null;
            let bestScore = Infinity;
            for (let bus of buses) {
                let available = bus.maxCapacity - bus.currentPassengers - bus.reservedSeats;
                let isNetworkClosed = isAutoMode && (clockMins >= 120 && clockMins < 300);
                if (available > 0 && !bus.isCharging && bus.battery > 0 && !isNetworkClosed) {
                    let take = min(needed, available);
                    let d = heuristic(bus.currentNode, m.start);
                    let score = d;
                    if (bus.missionsToPickup.length > 0 || bus.missionsToDropoff.length > 0) {
                        score += 15;
                        if (bus.targetNode) {
                            let detour = (heuristic(bus.currentNode, m.start) + heuristic(m.start, bus.targetNode)) - heuristic(bus.currentNode, bus.targetNode);
                            score += detour * 3;
                        }
                    }
                    if (take < needed) score += 50 + ((needed - take) * 5); else if (take < available) score += (available - take) * 2;
                    if (score < bestScore) {
                        bestScore = score;
                        bestBus = bus;
                    }
                }
            }
            if (bestBus) {
                let available = bestBus.maxCapacity - bestBus.currentPassengers - bestBus.reservedSeats;
                let take = min(needed, available);
                bestBus.missionsToPickup.push({parent: m, start: m.start, end: m.end, count: take});
                bestBus.reservedSeats += take;
                m.assigned += take;
                bestBus.updateTarget();
                logAction(`🚀 Mod. #${bestBus.id} dispatché. (Bat: ${bestBus.battery.toFixed(0)}%).`);
            }
        }
    }
}

function handleInternalTransfers() {
    let processed = new Set();
    for (let bus of buses) {
        if (bus.isFused && !processed.has(bus)) {
            let convoy = bus.getConvoy();
            convoy.forEach(b => processed.add(b));
            if (convoy.length > 1) optimizeConvoyTransfers(convoy);
        }
    }
}

function optimizeConvoyTransfers(convoy) {
    let allDropoffs = [];
    let totalPass = 0;
    for (let b of convoy) {
        allDropoffs.push(...b.missionsToDropoff);
        totalPass += b.currentPassengers;
    }
    if (totalPass === 0) return;

    let sortedBuses = [...convoy].sort((a, b) => {
        let scoreA = (a.missionsToPickup.length > 0 ? 1000 : 0) + a.maxCapacity;
        let scoreB = (b.missionsToPickup.length > 0 ? 1000 : 0) + b.maxCapacity;
        return scoreB - scoreA;
    });

    let newAssignments = new Map();
    for (let b of sortedBuses) newAssignments.set(b, {missions: [], passengers: 0});
    allDropoffs.sort((a, b) => b.count - a.count);

    for (let sm of allDropoffs) {
        for (let b of sortedBuses) {
            let assignment = newAssignments.get(b);
            if (assignment.passengers + sm.count <= (b.maxCapacity - b.reservedSeats)) {
                assignment.missions.push(sm);
                assignment.passengers += sm.count;
                break;
            }
        }
    }

    let changed = false;
    for (let b of sortedBuses) {
        if (b.currentPassengers !== newAssignments.get(b).passengers) {
            changed = true;
            break;
        }
    }

    if (changed) {
        logAction(`🔄 FUSION : Transfert interne optimisé.`);
        for (let b of sortedBuses) {
            let assignment = newAssignments.get(b);
            let diff = assignment.passengers - b.currentPassengers;
            b.missionsToDropoff = assignment.missions;
            b.currentPassengers = assignment.passengers;
            b.updateTarget();
            if (diff < 0) logAction(`📉 Mod. #${b.id} a transféré ses passagers et se vide.`);
        }
    }
}

class Bus {
    constructor(startNode, maxCapacity, id) {
        this.id = id;
        this.currentNode = startNode;
        this.nextNode = null;
        this.progress = 0;
        this.speed = 0.02;
        this.path = [];
        this.state = 'IDLE';
        this.isFused = false;
        this.wasFused = false;
        this.currentX = startNode.x;
        this.currentY = startNode.y;
        this.maxCapacity = maxCapacity;
        this.currentPassengers = 0;
        this.visualLength = 18 + (this.maxCapacity * 2);
        this.missionsToPickup = [];
        this.missionsToDropoff = [];
        this.reservedSeats = 0;
        this.targetNode = null;
        this.battery = 100.0;
        this.basePower = 8 + (this.maxCapacity * 0.5);
        this.currentKWh = 0.0;
        this.isCharging = false;
        this.assignedHotspot = null;
    }

    setDestination(target) {
        this.path = aStar(this.currentNode, target);
        if (this.path.length > 0) {
            this.path.shift();
            this.nextNode = this.path.shift();
        } else this.nextNode = null;
    }

    updateTarget() {
        let nearestNode = null;
        let recordDist = Infinity;
        for (let sm of this.missionsToPickup) {
            let d = heuristic(this.currentNode, sm.start);
            if (d < recordDist) {
                recordDist = d;
                nearestNode = sm.start;
            }
        }
        for (let sm of this.missionsToDropoff) {
            let d = heuristic(this.currentNode, sm.end);
            if (d < recordDist) {
                recordDist = d;
                nearestNode = sm.end;
            }
        }

        if (nearestNode) {
            this.assignedHotspot = null;
            if (this.targetNode !== nearestNode) {
                this.targetNode = nearestNode;
                this.setDestination(this.targetNode);
            }
        } else {
            let isNetworkClosed = isAutoMode && (clockMins >= 120 && clockMins < 300);
            if (this.battery <= 25 || isNetworkClosed || this.isCharging) {
                this.targetNode = depotNode;
                this.assignedHotspot = null;
            } else {
                if (!this.assignedHotspot) {
                    this.assignedHotspot = random(hotspots);
                    this.targetNode = this.assignedHotspot.node;
                    logAction(`📍 Mod. #${this.id} patrouille vers ${this.assignedHotspot.name}.`);
                }
            }
            if (this.targetNode) this.setDestination(this.targetNode);
        }

        let oldState = this.state;
        if (this.missionsToDropoff.length > 0) this.state = 'CARRYING';
        else if (this.missionsToPickup.length > 0) this.state = 'GOING_TO_PICKUP';
        else if (this.assignedHotspot && this.currentNode !== this.targetNode) this.state = 'PREPOSITIONING';
        else if (this.targetNode === depotNode && this.currentNode !== depotNode) this.state = 'RETURNING';
        else this.state = 'IDLE';

        if (oldState !== 'RETURNING' && this.state === 'RETURNING') logAction(`⚪ Mod. #${this.id} rentre au dépôt.`);
    }

    updateMovement() {
        let isNetworkClosed = isAutoMode && (clockMins >= 120 && clockMins < 300);
        let currentSpeed = this.speed;

        if (this.battery <= 0) {
            currentSpeed = 0.005;
            if (this.missionsToPickup.length > 0) {
                for (let sm of this.missionsToPickup) {
                    sm.parent.assigned -= sm.count;
                }
                this.missionsToPickup = [];
                logAction(`🆘 Mod. #${this.id} batterie à plat ! Annulation des ramassages, retour tortue.`);
                this.updateTarget();
            }
        } else if (this.battery <= 20 && !this.isCharging) {
            this.isCharging = true;
            logAction(`⚠️ Mod. #${this.id} batterie faible. Retour au dépôt forcé !`);
            this.updateTarget();
        }

        if (isNetworkClosed && this.missionsToDropoff.length === 0 && this.missionsToPickup.length === 0 && this.battery < 100 && !this.isCharging) {
            this.isCharging = true;
            logAction(`🌙 Mod. #${this.id} a fini son service. Verrouillage en charge pour la nuit.`);
            this.updateTarget();
        }

        if (isNetworkClosed && this.missionsToPickup.length > 0) {
            for (let sm of this.missionsToPickup) {
                sm.parent.assigned -= sm.count;
            }
            this.missionsToPickup = [];
            logAction(`🌙 Mod. #${this.id} annule ses ramassages (Fin de service).`);
            this.updateTarget();
        }

        if (this.state !== 'IDLE' || this.progress > 0) {
            let oscillation = sin(simTime * 0.05 + this.id) * 2;
            this.currentKWh = this.basePower + oscillation;
            if (this.isFused) {
                let eco = this.currentKWh * 0.40;
                totalEnergySaved += eco * 0.005;
                this.currentKWh -= eco;
            }
            this.battery -= this.currentKWh * 0.0005;
            if (this.battery < 0) this.battery = 0;
        } else {
            this.currentKWh = 0;
            if (this.currentNode === depotNode && this.isCharging) {
                this.battery += 0.3;
                if (this.battery >= 100) {
                    this.battery = 100;
                    this.isCharging = false;
                    logAction(`🔋 Mod. #${this.id} rechargé à 100%.`);
                    this.updateTarget();
                }
            } else if (this.currentNode === depotNode) {
                this.battery += 0.1;
                if (this.battery > 100) this.battery = 100;
            }
        }

        if (!this.nextNode) {
            let changed = false;
            for (let i = this.missionsToDropoff.length - 1; i >= 0; i--) {
                let sm = this.missionsToDropoff[i];
                if (this.currentNode === sm.end) {
                    this.currentPassengers -= sm.count;
                    sm.parent.inTransit -= sm.count;
                    this.missionsToDropoff.splice(i, 1);
                    logAction(`📍 Mod. #${this.id} a déposé ${sm.count} personnes.`);
                    changed = true;
                }
            }
            for (let i = this.missionsToPickup.length - 1; i >= 0; i--) {
                let sm = this.missionsToPickup[i];
                if (this.currentNode === sm.start) {
                    this.currentPassengers += sm.count;
                    this.reservedSeats -= sm.count;
                    sm.parent.waiting -= sm.count;
                    sm.parent.assigned -= sm.count;
                    sm.parent.inTransit += sm.count;
                    this.missionsToPickup.splice(i, 1);
                    this.missionsToDropoff.push(sm);
                    logAction(`🟢 Mod. #${this.id} a embarqué ${sm.count} personnes.`);
                    changed = true;
                }
            }
            missions = missions.filter(m => m.waiting > 0 || m.inTransit > 0);
            this.updateTarget();
            this.currentX = this.currentNode.x;
            this.currentY = this.currentNode.y;
            return;
        }

        this.progress += currentSpeed;
        this.currentX = lerp(this.currentNode.x, this.nextNode.x, this.progress);
        this.currentY = lerp(this.currentNode.y, this.nextNode.y, this.progress);
        if (this.progress >= 1) {
            this.progress = 0;
            this.currentNode = this.nextNode;
            if (this.path.length > 0) this.nextNode = this.path.shift(); else this.nextNode = null;
        }
    }

    getConvoy() {
        return buses.filter(b => b.isFused && dist(this.currentX, this.currentY, b.currentX, b.currentY) < 200 && (b.nextNode === this.nextNode || b.currentNode === this.nextNode || this.currentNode === b.nextNode));
    }

    checkFusion() {
        this.wasFused = this.isFused;
        this.isFused = false;
        if (!this.nextNode) return;
        let wantsToAccelerate = false;
        let lockProgress = -1;
        let targetLimit = undefined;
        for (let other of buses) {
            if (other !== this && other.nextNode) {
                let d = dist(this.currentX, this.currentY, other.currentX, other.currentY);
                let sameEdge = (this.currentNode === other.currentNode && this.nextNode === other.nextNode);
                let iAmFollowing = (this.nextNode === other.currentNode);
                let heIsFollowing = (this.currentNode === other.nextNode);
                let isFrontalCrash = (this.currentNode === other.nextNode && this.nextNode === other.currentNode);
                let idealDist = (this.visualLength + other.visualLength) / 2 + 2;
                if (d < idealDist + 20 && (sameEdge || iAmFollowing || heIsFollowing) && !isFrontalCrash) this.isFused = true;
                if (sameEdge && this.progress < other.progress) {
                    let progressOffset = idealDist / spacing;
                    let targetProgress = other.progress - progressOffset;
                    if (this.progress < targetProgress - 0.01) {
                        wantsToAccelerate = true;
                        targetLimit = max(0, targetProgress);
                    } else if (this.progress >= targetProgress - 0.01 && this.progress <= other.progress) {
                        lockProgress = max(0, targetProgress);
                    }
                } else if (iAmFollowing) {
                    let distFrontBus = other.progress * spacing;
                    let distBackBus = (1 - this.progress) * spacing;
                    let currentPhysicalDist = distFrontBus + distBackBus;
                    if (currentPhysicalDist < idealDist) {
                        lockProgress = this.progress;
                    } else if (currentPhysicalDist > idealDist + 2) {
                        wantsToAccelerate = true;
                    }
                }
            }
        }

        let accel = this.battery <= 0 ? 0.002 : 0.015;
        if (lockProgress !== -1) this.progress = lockProgress; else if (wantsToAccelerate) {
            this.progress += accel;
            if (targetLimit !== undefined && this.progress > targetLimit) this.progress = targetLimit;
        }
        if (this.wasFused && !this.isFused) logAction(`⛓️ Mod. #${this.id} s'est séparé.`);
    }

    showBody() {
        let isHighlighted = (hoveredBusId === null) || (this.id === hoveredBusId) || (this.isFused && this.getConvoy().some(b => b.id === hoveredBusId));
        let alphaBody = isHighlighted ? 255 : 60;
        let alphaPath = isHighlighted ? 150 : 30;

        if (this.targetNode && this.targetNode !== depotNode && !this.assignedHotspot) {
            if (this.state === 'CARRYING') stroke(46, 204, 113, alphaPath); else stroke(52, 152, 219, alphaPath);
            strokeWeight(isHighlighted ? 4 : 2);
            drawingContext.setLineDash([5, 5]);
            line(this.currentX, this.currentY, this.targetNode.x, this.targetNode.y);
            drawingContext.setLineDash([]);
            noStroke();
        }

        let angle = 0;
        if (this.nextNode) angle = atan2(this.nextNode.y - this.currentNode.y, this.nextNode.x - this.currentNode.x);
        push();
        translate(this.currentX, this.currentY);
        rotate(angle);
        noStroke();
        rectMode(CENTER);

        let isNight = (clockMins < 420 || clockMins > 1140);
        if (isNight && (this.state !== 'IDLE' || this.isFused)) {
            fill(255, 255, 100, isHighlighted ? 80 : 20);
            arc(this.visualLength / 2, 0, 100, 60, -PI / 4, PI / 4);
        }

        if (this.isFused) fill(230, 126, 34, alphaBody);
        else {
            if (this.state === 'CARRYING') fill(46, 204, 113, alphaBody);
            else if (this.state === 'PREPOSITIONING') fill(241, 196, 15, alphaBody);
            else if (this.state === 'RETURNING' || this.state === 'IDLE') fill(149, 165, 166, alphaBody);
            else fill(52, 152, 219, alphaBody);
        }
        rect(0, 0, this.visualLength, 14, 4);
        fill(255, 255, 255, isHighlighted ? 120 : 30);
        rect((this.visualLength / 2) - 3, 0, 4, 10, 2);
        pop();
    }

    showLabel() {
        let displayPass = this.currentPassengers;
        let displayCap = this.maxCapacity;
        let drawText = true;
        let textStr = `M#${this.id} (${displayPass}/${displayCap})`;
        let isHighlighted = (hoveredBusId === null) || (this.id === hoveredBusId) || (this.isFused && this.getConvoy().some(b => b.id === hoveredBusId));
        let alphaBg = isHighlighted ? 180 : 40;
        let alphaText = isHighlighted ? 255 : 80;

        if (this.isFused) {
            let convoy = this.getConvoy();
            displayPass = convoy.reduce((sum, b) => sum + b.currentPassengers, 0);
            displayCap = convoy.reduce((sum, b) => sum + b.maxCapacity, 0);
            let caps = convoy.map(b => b.maxCapacity).sort((a, b) => b - a).join('+');
            textStr = displayPass + "/" + displayCap + " (" + caps + ")";
            let leader = convoy.reduce((prev, curr) => buses.indexOf(prev) < buses.indexOf(curr) ? prev : curr, convoy[0]);
            if (this !== leader) drawText = false;
        }
        if (drawText) {
            push();
            textSize(10);
            let w = textWidth(textStr);
            fill(0, 0, 0, alphaBg);
            rectMode(CENTER);
            rect(this.currentX, this.currentY - 18, w + 8, 14, 4);
            fill(255, 255, 255, alphaText);
            textAlign(CENTER, CENTER);
            text(textStr, this.currentX, this.currentY - 18);
            pop();
        }
    }
}

function aStar(start, end) {
    let openSet = [start];
    let closedSet = [];
    let cameFrom = new Map();
    let gScore = new Map();
    let fScore = new Map();
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            gScore.set(grid[i][j], Infinity);
            fScore.set(grid[i][j], Infinity);
        }
    }
    gScore.set(start, 0);
    fScore.set(start, heuristic(start, end));
    while (openSet.length > 0) {
        let lowestIndex = 0;
        for (let i = 0; i < openSet.length; i++) {
            if (fScore.get(openSet[i]) < fScore.get(openSet[lowestIndex])) lowestIndex = i;
        }
        let current = openSet[lowestIndex];
        if (current === end) {
            let path = [current];
            while (cameFrom.has(current)) {
                current = cameFrom.get(current);
                path.push(current);
            }
            return path.reverse();
        }
        openSet.splice(lowestIndex, 1);
        closedSet.push(current);
        for (let neighbor of current.neighbors) {
            if (closedSet.includes(neighbor)) continue;
            let tentative_gScore = gScore.get(current) + 1;
            if (!openSet.includes(neighbor)) openSet.push(neighbor); else if (tentative_gScore >= gScore.get(neighbor)) continue;
            cameFrom.set(neighbor, current);
            gScore.set(neighbor, tentative_gScore);
            fScore.set(neighbor, gScore.get(neighbor) + heuristic(neighbor, end));
        }
    }
    return [];
}

function heuristic(a, b) {
    return abs(a.i - b.i) + abs(a.j - b.j);
}
// --- VARIABLES GLOBALES ---
const cols = 12;
const rows = 12;
const spacing = 50;
let grid = [];
let buses = [];
let missions = [];
let depotNode;

const MODULE_CAPACITIES = [4, 6, 10, 12];

function setup() {
    let canvas = createCanvas(cols * spacing, rows * spacing);
    canvas.parent('canvas-container');

    for (let i = 0; i < cols; i++) {
        grid[i] = [];
        for (let j = 0; j < rows; j++) {
            grid[i][j] = { i: i, j: j, x: i * spacing + spacing / 2, y: j * spacing + spacing / 2, neighbors: [] };
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

    for (let i = 0; i < 8; i++) {
        let capacity = random(MODULE_CAPACITIES);
        buses.push(new Bus(depotNode, capacity));
    }

    document.getElementById('btn-spawn').addEventListener('click', () => {
        spawnRandomMission();
    });
}

function draw() {
    background(240);

    // 1. Rendu du Graphe
    stroke(200);
    strokeWeight(15);
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let node = grid[i][j];
            for (let neighbor of node.neighbors) {
                line(node.x, node.y, neighbor.x, neighbor.y);
            }
        }
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

    // 2. Rendu des Missions
    for (let m of missions) {
        // La destination (Carré rouge) reste toujours affichée tant que la mission n'est pas finie
        fill(231, 76, 60);
        rectMode(CENTER);
        rect(m.end.x, m.end.y, 12, 12);

        // S'il reste des gens à l'arrêt, on affiche le cercle jaune
        if (m.waiting > 0) {
            fill(241, 196, 15);
            circle(m.start.x, m.start.y, 20);

            fill(0);
            textSize(12);
            textAlign(CENTER, CENTER);
            text(m.waiting, m.start.x, m.start.y - 20);

            // Ligne pointillée indicative de la demande
            stroke(241, 196, 15, 100);
            strokeWeight(2);
            drawingContext.setLineDash([5, 5]);
            line(m.start.x, m.start.y, m.end.x, m.end.y);
            drawingContext.setLineDash([]);
            noStroke();
        }
    }

    dispatchMissions();

    for (let bus of buses) bus.updateMovement();
    for (let bus of buses) bus.checkFusion();
    handleInternalTransfers();
    for (let bus of buses) bus.showBody();
    for (let bus of buses) bus.showLabel();

    updateUI();
}

// ... (Les fonctions removeRoadsWhileConnected et isConnected restent identiques)
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
        if (isConnected()) removedCount++;
        else {
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
    let idleCount = 0;
    let activeCount = 0;
    let fusedModulesCount = 0;

    for (let bus of buses) {
        if (bus.missionsToPickup.length === 0 && bus.missionsToDropoff.length === 0) idleCount++;
        else activeCount++;
        if (bus.isFused) fusedModulesCount++;
    }

    document.getElementById('stat-idle').innerText = idleCount;
    document.getElementById('stat-active').innerText = activeCount;
    document.getElementById('stat-fusions').innerText = Math.floor(fusedModulesCount / 2);
}

function spawnRandomMission() {
    let startNode = grid[floor(random(cols))][floor(random(rows))];
    let endNode = grid[floor(random(cols))][floor(random(rows))];
    while(endNode === startNode) endNode = grid[floor(random(cols))][floor(random(rows))];

    let groupSize = floor(random(1, 20));

    // NOUVELLE STRUCTURE DE MISSION
    missions.push({
        start: startNode,
        end: endNode,
        total: groupSize,
        waiting: groupSize,  // Personnes à l'arrêt
        assigned: 0,         // Places réservées dans des bus en route
        inTransit: 0         // Personnes actuellement dans un bus
    });
}

// --- L'IA DE DISPATCH COVOITURAGE (Ridepooling) ---
function dispatchMissions() {
    for (let m of missions) {
        let needed = m.waiting - m.assigned;

        if (needed > 0) {
            let bestBus = null;
            let bestScore = Infinity;

            for (let bus of buses) {
                // Espace totalement libre (non réservé)
                let available = bus.maxCapacity - bus.currentPassengers - bus.reservedSeats;

                if (available > 0) {
                    let take = min(needed, available);
                    let d = heuristic(bus.currentNode, m.start);
                    let score = d;

                    // Pénalité si le bus a DEJA des missions
                    if (bus.missionsToPickup.length > 0 || bus.missionsToDropoff.length > 0) {
                        score += 15; // On préfère réveiller un bus au dépôt

                        // CALCUL DU DÉTOUR : Le bus passe-t-il par là ?
                        if (bus.targetNode) {
                            let detour = (heuristic(bus.currentNode, m.start) + heuristic(m.start, bus.targetNode)) - heuristic(bus.currentNode, bus.targetNode);
                            score += detour * 3; // Grosse pénalité si c'est à l'opposé de sa route !
                        }
                    }

                    if (take < needed) score += 50 + ((needed - take) * 5);
                    else if (take < available) score += (available - take) * 2;

                    if (score < bestScore) {
                        bestScore = score;
                        bestBus = bus;
                    }
                }
            }

            if (bestBus) {
                let available = bestBus.maxCapacity - bestBus.currentPassengers - bestBus.reservedSeats;
                let take = min(needed, available);

                // On ajoute une sous-mission au bus
                bestBus.missionsToPickup.push({
                    parent: m,
                    start: m.start,
                    end: m.end,
                    count: take
                });

                bestBus.reservedSeats += take;
                m.assigned += take;

                // Le bus recalcule immédiatement sa meilleure route !
                bestBus.updateTarget();
            }
        }
    }
}

// --- LE CERVEAU DE L'ESSAIM : TRANSFERT INTERNE ---
function handleInternalTransfers() {
    let processed = new Set();

    for (let bus of buses) {
        if (bus.isFused && !processed.has(bus)) {
            // On récupère tout le convoi
            let convoy = bus.getConvoy();
            convoy.forEach(b => processed.add(b)); // On les marque comme traités

            if (convoy.length > 1) {
                optimizeConvoyTransfers(convoy);
            }
        }
    }
}

function optimizeConvoyTransfers(convoy) {
    let allDropoffs = [];
    let totalPass = 0;

    // 1. On met tous les passagers du convoi dans un pot commun
    for (let b of convoy) {
        allDropoffs.push(...b.missionsToDropoff);
        totalPass += b.currentPassengers;
    }

    if (totalPass === 0) return; // Convoi vide, rien à faire

    // 2. On trie les bus par pertinence.
    // Priorité absolue aux bus qui doivent aller chercher des gens ! Ensuite, priorité aux gros bus.
    let sortedBuses = [...convoy].sort((a, b) => {
        let scoreA = (a.missionsToPickup.length > 0 ? 1000 : 0) + a.maxCapacity;
        let scoreB = (b.missionsToPickup.length > 0 ? 1000 : 0) + b.maxCapacity;
        return scoreB - scoreA;
    });

    // 3. On prépare la nouvelle répartition
    let newAssignments = new Map();
    for (let b of sortedBuses) newAssignments.set(b, { missions: [], passengers: 0 });

    // On trie les groupes de passagers par taille pour bien remplir
    allDropoffs.sort((a, b) => b.count - a.count);

    // 4. On remplit les bus prioritaires jusqu'à ras bord !
    for (let sm of allDropoffs) {
        for (let b of sortedBuses) {
            let assignment = newAssignments.get(b);
            if (assignment.passengers + sm.count <= b.maxCapacity) {
                assignment.missions.push(sm);
                assignment.passengers += sm.count;
                break; // Groupe placé, on passe au suivant
            }
        }
    }

    // 5. On vérifie si ce transfert a permis de libérer un bus
    let changed = false;
    for (let b of sortedBuses) {
        if (b.currentPassengers !== newAssignments.get(b).passengers) {
            changed = true;
            break;
        }
    }

    // 6. Si on a pu optimiser, on applique les changements et on recalcule les GPS !
    if (changed) {
        for (let b of sortedBuses) {
            let assignment = newAssignments.get(b);
            b.missionsToDropoff = assignment.missions;
            b.currentPassengers = assignment.passengers;

            // MAGIE : Le bus recalcule son GPS. S'il est vide, il rentrera au dépôt à la prochaine intersection !
            b.updateTarget();
        }
        console.log("🔄 Transfert interne réussi ! Compaction du convoi.");
    }
}
// --- LA NOUVELLE CLASSE BUS (WAYPOINTS & NEAREST NEIGHBOR) ---
class Bus {
    constructor(startNode, maxCapacity) {
        this.currentNode = startNode;
        this.nextNode = null;
        this.progress = 0;
        this.speed = 0.02;
        this.path = [];
        this.state = 'IDLE';
        this.isFused = false;
        this.currentX = startNode.x;
        this.currentY = startNode.y;

        this.maxCapacity = maxCapacity;
        this.currentPassengers = 0;
        this.visualLength = 18 + (this.maxCapacity * 2);

        // NOUVEAU : Le cerveau multi-tâches !
        this.missionsToPickup = [];
        this.missionsToDropoff = [];
        this.reservedSeats = 0;
        this.targetNode = null; // Sa prochaine étape immédiate
    }

    setDestination(target) {
        this.path = aStar(this.currentNode, target);
        if (this.path.length > 0) {
            this.path.shift();
            this.nextNode = this.path.shift();
        } else {
            this.nextNode = null;
        }
    }

    // L'ALGORITHME DU PLUS PROCHE VOISIN (Nearest Neighbor)
    updateTarget() {
        let nearestNode = null;
        let recordDist = Infinity;

        // 1. Regarder tous les points de collecte
        for (let sm of this.missionsToPickup) {
            let d = heuristic(this.currentNode, sm.start);
            if (d < recordDist) { recordDist = d; nearestNode = sm.start; }
        }
        // 2. Regarder tous les points de dépôt
        for (let sm of this.missionsToDropoff) {
            let d = heuristic(this.currentNode, sm.end);
            if (d < recordDist) { recordDist = d; nearestNode = sm.end; }
        }

        // On se dirige vers le plus proche !
        if (nearestNode) {
            if (this.targetNode !== nearestNode) {
                this.targetNode = nearestNode;
                this.setDestination(this.targetNode);
            }
        } else {
            // Plus de missions = retour au dépôt
            this.targetNode = depotNode;
            this.setDestination(depotNode);
        }

        // Mise à jour de la couleur/état
        if (this.missionsToDropoff.length > 0) this.state = 'CARRYING';
        else if (this.missionsToPickup.length > 0) this.state = 'GOING_TO_PICKUP';
        else if (this.currentNode !== depotNode) this.state = 'RETURNING';
        else this.state = 'IDLE';
    }

    updateMovement() {
        if (!this.nextNode) {
            let changed = false;

            // 1. DÉPOSE DES PASSAGERS (On le fait en premier pour libérer de la place)
            for (let i = this.missionsToDropoff.length - 1; i >= 0; i--) {
                let sm = this.missionsToDropoff[i];
                if (this.currentNode === sm.end) {
                    this.currentPassengers -= sm.count;
                    sm.parent.inTransit -= sm.count;
                    this.missionsToDropoff.splice(i, 1);
                    changed = true;
                }
            }

            // 2. PRISE DES PASSAGERS
            for (let i = this.missionsToPickup.length - 1; i >= 0; i--) {
                let sm = this.missionsToPickup[i];
                if (this.currentNode === sm.start) {
                    this.currentPassengers += sm.count;
                    this.reservedSeats -= sm.count;

                    sm.parent.waiting -= sm.count;
                    sm.parent.assigned -= sm.count;
                    sm.parent.inTransit += sm.count;

                    // La mission passe dans la liste "à déposer"
                    this.missionsToPickup.splice(i, 1);
                    this.missionsToDropoff.push(sm);
                    changed = true;
                }
            }

            // On nettoie les missions globales totalement terminées
            missions = missions.filter(m => m.waiting > 0 || m.inTransit > 0);

            // On cherche la prochaine destination !
            this.updateTarget();

            this.currentX = this.currentNode.x;
            this.currentY = this.currentNode.y;
            return;
        }

        this.progress += this.speed;
        this.currentX = lerp(this.currentNode.x, this.nextNode.x, this.progress);
        this.currentY = lerp(this.currentNode.y, this.nextNode.y, this.progress);

        if (this.progress >= 1) {
            this.progress = 0;
            this.currentNode = this.nextNode;
            if (this.path.length > 0) this.nextNode = this.path.shift();
            else this.nextNode = null;
        }
    }

    checkFusion() {
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

                if (d < idealDist + 20 && (sameEdge || iAmFollowing || heIsFollowing) && !isFrontalCrash) {
                    this.isFused = true;
                }

                if (sameEdge && this.progress < other.progress) {
                    let progressOffset = idealDist / spacing;
                    let targetProgress = other.progress - progressOffset;

                    if (this.progress < targetProgress - 0.01) {
                        wantsToAccelerate = true;
                        targetLimit = max(0, targetProgress);
                    } else if (this.progress >= targetProgress - 0.01 && this.progress <= other.progress) {
                        lockProgress = max(0, targetProgress);
                    }
                }
                else if (iAmFollowing) {
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

        if (lockProgress !== -1) {
            this.progress = lockProgress;
        } else if (wantsToAccelerate) {
            this.progress += 0.015;
            if (targetLimit !== undefined && this.progress > targetLimit) {
                this.progress = targetLimit;
            }
        }
    }

    // (à mettre dans la class Bus)
    getConvoy() {
        // Retourne tous les bus proches (200px) qui partagent la même route que moi
        return buses.filter(b =>
            b.isFused &&
            dist(this.currentX, this.currentY, b.currentX, b.currentY) < 200 &&
            (b.nextNode === this.nextNode || b.currentNode === this.nextNode || this.currentNode === b.nextNode)
        );
    }
    showBody() {
        // Dessine la ligne vers sa PROCHAINE étape
        if (this.targetNode && this.targetNode !== depotNode) {
            if (this.state === 'CARRYING') stroke(46, 204, 113, 150); // Vert
            else stroke(52, 152, 219, 150); // Bleu

            strokeWeight(3);
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

        if (this.isFused) fill(230, 126, 34);
        else {
            if (this.state === 'CARRYING') fill(46, 204, 113);
            else if (this.state === 'RETURNING' || this.state === 'IDLE') fill(149, 165, 166);
            else fill(52, 152, 219);
        }

        rect(0, 0, this.visualLength, 14, 4);
        fill(255, 255, 255, 120);
        rect((this.visualLength/2) - 3, 0, 4, 10, 2);
        pop();
    }

    showLabel() {
        let displayPass = this.currentPassengers;
        let displayCap = this.maxCapacity;
        let drawText = true;
        let textStr = displayPass + "/" + displayCap;

        if (this.isFused) {
            let convoy = buses.filter(b =>
                b.isFused &&
                dist(this.currentX, this.currentY, b.currentX, b.currentY) < 90 &&
                (b.nextNode === this.nextNode || b.currentNode === this.nextNode || this.currentNode === b.nextNode)
            );

            displayPass = convoy.reduce((sum, b) => sum + b.currentPassengers, 0);
            displayCap = convoy.reduce((sum, b) => sum + b.maxCapacity, 0);

            let caps = convoy.map(b => b.maxCapacity).sort((a,b) => b-a).join('+');
            textStr = displayPass + "/" + displayCap + " (" + caps + ")";

            let leader = convoy.reduce((prev, curr) => buses.indexOf(prev) < buses.indexOf(curr) ? prev : curr, convoy[0]);
            if (this !== leader) drawText = false;
        }

        if (drawText) {
            push();
            textSize(10);
            let w = textWidth(textStr);
            fill(0, 0, 0, 180);
            rectMode(CENTER);
            rect(this.currentX, this.currentY - 18, w + 8, 14, 4);
            fill(255);
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
            if (!openSet.includes(neighbor)) openSet.push(neighbor);
            else if (tentative_gScore >= gScore.get(neighbor)) continue;
            cameFrom.set(neighbor, current);
            gScore.set(neighbor, tentative_gScore);
            fScore.set(neighbor, gScore.get(neighbor) + heuristic(neighbor, end));
        }
    }
    return [];
}
function heuristic(a, b) { return abs(a.i - b.i) + abs(a.j - b.j); }
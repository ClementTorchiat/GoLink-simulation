// --- VARIABLES GLOBALES ---
const cols = 12;
const rows = 12;
const spacing = 50;
let grid = [];
let buses = [];
let missions = [];
let depotNode;

// Les tailles de modules disponibles
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

    for (let m of missions) {
        if (m.status === 'waiting' || m.status === 'assigned' || m.status === 'partially_assigned') {
            fill(241, 196, 15);
            circle(m.start.x, m.start.y, 20);

            fill(0);
            textSize(12);
            textAlign(CENTER, CENTER);
            text(m.passengersLeft, m.start.x, m.start.y - 20);

            fill(231, 76, 60);
            rectMode(CENTER);
            rect(m.end.x, m.end.y, 12, 12);

            stroke(241, 196, 15, 150);
            strokeWeight(3);
            drawingContext.setLineDash([5, 5]);
            line(m.start.x, m.start.y, m.end.x, m.end.y);
            drawingContext.setLineDash([]);
            noStroke();
        }
        else if (m.status === 'picked_up') {
            fill(231, 76, 60);
            rectMode(CENTER);
            rect(m.end.x, m.end.y, 12, 12);
        }
    }

    dispatchMissions();

    for (let bus of buses) bus.updateMovement();
    for (let bus of buses) bus.checkFusion();

    // CORRECTION DU BUG VISUEL (LE DOUBLE RENDU)
    for (let bus of buses) bus.showBody();   // 1. On peint tout le monde
    for (let bus of buses) bus.showLabel();  // 2. On écrit le texte par-dessus tout le monde

    updateUI();
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
        if (bus.currentMission === null) idleCount++;
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
    while(endNode === startNode) {
        endNode = grid[floor(random(cols))][floor(random(rows))];
    }

    let groupSize = floor(random(1, 20));

    missions.push({
        start: startNode,
        end: endNode,
        totalPassengers: groupSize,
        passengersLeft: groupSize,
        assignedCapacity: 0,
        status: 'waiting'
    });
}

// --- L'IA DE DISPATCH (Optimisation Distance + Capacité) ---
function dispatchMissions() {
    for (let m of missions) {
        let needed = m.passengersLeft - m.assignedCapacity;

        // S'il y a des gens en attente et qu'il faut encore des places
        if ((m.status === 'waiting' || m.status === 'partially_assigned') && needed > 0) {

            let bestBus = null;
            let bestScore = Infinity; // Le score le plus bas gagne !

            for (let bus of buses) {
                // On ne regarde que les bus libres
                if (bus.currentMission === null) {
                    let d = heuristic(bus.currentNode, m.start); // Distance
                    let capacity = bus.maxCapacity;
                    let score = 0;

                    // 1. Poids de la distance (Plus c'est loin, plus la note monte)
                    score += d;

                    // 2. Poids de la capacité
                    if (capacity >= needed) {
                        // Le bus est assez grand pour finir le travail. C'est bien !
                        // Mais on pénalise un peu s'il est TROP grand, pour éviter le gaspillage.
                        let wastedSeats = capacity - needed;
                        score += wastedSeats * 2;
                    } else {
                        // Le bus est trop petit. Ça va forcer l'envoi d'un 2ème bus. C'est mauvais !
                        // On ajoute une grosse pénalité de base (+50)
                        // Et on pénalise encore plus s'il est VRAIMENT trop petit par rapport à la demande.
                        let unfulfilled = needed - capacity;
                        score += 50 + (unfulfilled * 5);
                    }

                    // Le bus avec le score le plus bas (le plus optimisé) gagne !
                    if (score < bestScore) {
                        bestScore = score;
                        bestBus = bus;
                    }
                }
            }

            // On envoie le vainqueur
            if (bestBus) {
                bestBus.assignMission(m);
                m.assignedCapacity += bestBus.maxCapacity;

                // Vérifier si l'essaim déployé est suffisant
                if (m.assignedCapacity >= m.passengersLeft) {
                    m.status = 'assigned';
                } else {
                    m.status = 'partially_assigned'; // La boucle recommencera pour envoyer un autre bus !
                }
            }
        }
    }
}

// --- LA CLASSE BUS ---
// --- LA CLASSE BUS ---
// --- LA CLASSE BUS (AVEC ROTATION, PLATOONING ET UI AVANCÉE) ---
// --- LA CLASSE BUS (CORRECTION DES BUGS FANTÔME ET JITTERING) ---
class Bus {
    constructor(startNode, maxCapacity) {
        this.currentNode = startNode;
        this.nextNode = null;
        this.progress = 0;
        this.speed = 0.02;
        this.path = [];
        this.currentMission = null;
        this.state = 'IDLE';
        this.isFused = false;
        this.currentX = startNode.x;
        this.currentY = startNode.y;

        this.maxCapacity = maxCapacity;
        this.currentPassengers = 0;
        this.visualLength = 18 + (this.maxCapacity * 2);
    }

    assignMission(mission) {
        this.currentMission = mission;
        this.state = 'GOING_TO_PICKUP';
        this.setDestination(mission.start);
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

    updateMovement() {
        if (!this.nextNode) {
            if (this.currentMission) {
                if (this.state === 'GOING_TO_PICKUP' && this.currentNode === this.currentMission.start) {
                    let spaceAvailable = this.maxCapacity - this.currentPassengers;
                    let peopleToTake = min(spaceAvailable, this.currentMission.passengersLeft);

                    this.currentPassengers += peopleToTake;
                    this.currentMission.passengersLeft -= peopleToTake;

                    // CORRECTION DU BUG 1 : On diminue la capacité réservée par ce bus pour ne pas spammer d'autres bus
                    this.currentMission.assignedCapacity -= this.maxCapacity;
                    if (this.currentMission.assignedCapacity < 0) this.currentMission.assignedCapacity = 0;

                    // CORRECTION DU BUG FANTÔME : Si on arrive et qu'un autre bus a déjà tout pris !
                    if (peopleToTake === 0 && this.currentPassengers === 0) {
                        this.currentMission = null; // On abandonne la mission
                        this.state = 'RETURNING'; // Retour à la base
                        this.setDestination(depotNode);
                        this.currentX = this.currentNode.x;
                        this.currentY = this.currentNode.y;
                        return; // On arrête l'action ici
                    }

                    this.state = 'CARRYING';
                    this.setDestination(this.currentMission.end);

                    if (this.currentMission.passengersLeft <= 0) {
                        this.currentMission.status = 'picked_up';
                    }
                }
                else if (this.state === 'CARRYING' && this.currentNode === this.currentMission.end) {
                    this.currentPassengers = 0;
                    if (this.currentMission.passengersLeft <= 0) {
                        this.currentMission.status = 'completed';
                        missions = missions.filter(m => m.status !== 'completed');
                    }
                    this.currentMission = null;
                    this.state = 'RETURNING';
                    this.setDestination(depotNode);
                }
            } else {
                if (this.currentNode !== depotNode) {
                    this.state = 'RETURNING';
                    this.setDestination(depotNode);
                } else {
                    this.state = 'IDLE';
                }
            }
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

                // CORRECTION DU BUG DE TREMBLEMENT (JITTERING)
                if (sameEdge && this.progress < other.progress) {
                    let progressOffset = idealDist / spacing;
                    let targetProgress = other.progress - progressOffset;

                    if (this.progress < targetProgress - 0.01) {
                        wantsToAccelerate = true;
                        targetLimit = max(0, targetProgress); // Sécurité pour ne pas le traverser !
                    } else if (this.progress >= targetProgress - 0.01 && this.progress <= other.progress) {
                        lockProgress = max(0, targetProgress); // Verrouillage parfait sans recul
                    }
                }
                else if (iAmFollowing) {
                    // Calcul physique dans les virages
                    let distFrontBus = other.progress * spacing;
                    let distBackBus = (1 - this.progress) * spacing;
                    let currentPhysicalDist = distFrontBus + distBackBus;

                    if (currentPhysicalDist < idealDist) {
                        lockProgress = this.progress; // Frein à main ! (Il gèle sa position pour ne pas rentrer dedans)
                    } else if (currentPhysicalDist > idealDist + 2) {
                        wantsToAccelerate = true; // Il accélère pour ne pas perdre le convoi
                    }
                }
            }
        }

        // Application lissée de la vitesse
        if (lockProgress !== -1) {
            this.progress = lockProgress;
        } else if (wantsToAccelerate) {
            this.progress += 0.015;
            // Si on accélère trop d'un coup, on rabote pour s'arrêter pile au bon endroit
            if (targetLimit !== undefined && this.progress > targetLimit) {
                this.progress = targetLimit;
            }
        }
    }

    // (La suite des fonctions showBody et showLabel reste identique à avant)
    showBody() {
        if (this.state === 'CARRYING' && this.currentMission) {
            stroke(46, 204, 113, 150);
            strokeWeight(3);
            drawingContext.setLineDash([5, 5]);
            line(this.currentX, this.currentY, this.currentMission.end.x, this.currentMission.end.y);
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

// --- FONCTIONS EXISTANTES A* ---
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
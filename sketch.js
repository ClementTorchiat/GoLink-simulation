// --- VARIABLES GLOBALES ---
const cols = 12;
const rows = 12;
const spacing = 50;
let grid = [];
let buses = [];
let missions = [];
let depotNode; // NOUVEAU : Le parking des bus

function setup() {
    let canvas = createCanvas(cols * spacing, rows * spacing);
    canvas.parent('canvas-container');

    // 1. Générer le Graphe
    for (let i = 0; i < cols; i++) {
        grid[i] = [];
        for (let j = 0; j < rows; j++) {
            grid[i][j] = { i: i, j: j, x: i * spacing + spacing / 2, y: j * spacing + spacing / 2, neighbors: [] };
        }
    }

    // 2. Connecter tous les voisins
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

    // NOUVEAU : On définit le dépôt en haut à gauche
    depotNode = grid[0][0];

    // NOUVEAU : Les 6 bus commencent tous au dépôt !
    for (let i = 0; i < 6; i++) {
        buses.push(new Bus(depotNode));
    }

    document.getElementById('btn-spawn').addEventListener('click', () => {
        spawnRandomMission();
    });
}

function draw() {
    background(240);

    // Dessiner les routes
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

    // Dessiner les intersections
    fill(50);
    noStroke();
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            circle(grid[i][j].x, grid[i][j].y, 8);
        }
    }

    // NOUVEAU : DESSINER LE DÉPÔT
    fill(149, 165, 166); // Gris bleuté
    rectMode(CENTER);
    rect(depotNode.x, depotNode.y, 40, 40, 8); // Un gros carré
    fill(255); // Texte blanc
    textAlign(CENTER, CENTER);
    textSize(16);
    text("P", depotNode.x, depotNode.y); // La lettre P pour Parking/Dépôt

    // DESSIN DES MISSIONS
    for (let m of missions) {
        if (m.status === 'waiting' || m.status === 'assigned') {
            fill(241, 196, 15);
            circle(m.start.x, m.start.y, 20);
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

            let carrier = buses.find(b => b.currentMission === m);
            if (carrier) {
                stroke(46, 204, 113, 150);
                strokeWeight(3);
                drawingContext.setLineDash([5, 5]);
                line(carrier.currentX, carrier.currentY, m.end.x, m.end.y);
                drawingContext.setLineDash([]);
                noStroke();
            }
        }
    }

    dispatchMissions();

    for (let bus of buses) bus.updateMovement();
    for (let bus of buses) bus.checkFusion();
    for (let bus of buses) bus.show();

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
    let idleCount = 0;
    let activeCount = 0;
    let fusedModulesCount = 0;

    for (let bus of buses) {
        // Un bus est considéré "libre" s'il n'a pas de mission (qu'il soit au dépôt ou en train d'y retourner)
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
    missions.push({ start: startNode, end: endNode, status: 'waiting' });
}

function dispatchMissions() {
    for (let m of missions) {
        if (m.status === 'waiting') {
            let bestBus = null;
            let shortestDistance = Infinity;

            for (let bus of buses) {
                // On peut assigner la mission à n'importe quel bus qui n'a pas de passager, même s'il rentre au dépôt
                if (bus.currentMission === null) {
                    let d = heuristic(bus.currentNode, m.start);
                    if (d < shortestDistance) {
                        shortestDistance = d;
                        bestBus = bus;
                    }
                }
            }
            if (bestBus) {
                bestBus.assignMission(m);
                m.status = 'assigned';
            }
        }
    }
}

// --- LA CLASSE BUS AVEC RETOUR AU DÉPÔT ---
class Bus {
    constructor(startNode) {
        this.currentNode = startNode;
        this.nextNode = null;
        this.progress = 0;
        this.speed = 0.02;
        this.path = [];
        this.currentMission = null;
        this.state = 'IDLE'; // IDLE veut dire "Je suis au dépôt et je n'ai rien à faire"
        this.isFused = false;
        this.currentX = startNode.x;
        this.currentY = startNode.y;
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
                    this.state = 'CARRYING';
                    this.currentMission.status = 'picked_up';
                    this.setDestination(this.currentMission.end);
                } else if (this.state === 'CARRYING' && this.currentNode === this.currentMission.end) {
                    this.currentMission.status = 'completed';
                    missions = missions.filter(m => m.status !== 'completed');
                    this.currentMission = null;

                    // NOUVEAU : Mission terminée, on rentre à la base !
                    this.state = 'RETURNING';
                    this.setDestination(depotNode);
                }
            } else {
                // S'il n'a pas de mission mais qu'il n'est pas au dépôt, il doit y rentrer.
                if (this.currentNode !== depotNode) {
                    this.state = 'RETURNING';
                    this.setDestination(depotNode);
                } else {
                    this.state = 'IDLE'; // Il est bien arrivé au parking, il s'arrête.
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

            if (this.path.length > 0) {
                this.nextNode = this.path.shift();
            } else {
                this.nextNode = null;
            }
        }
    }

    checkFusion() {
        this.isFused = false;
        if (!this.nextNode) return;

        for (let other of buses) {
            if (other !== this && other.nextNode) {
                let d = dist(this.currentX, this.currentY, other.currentX, other.currentY);

                let sameEdge = (this.currentNode === other.currentNode && this.nextNode === other.nextNode);
                let iAmFollowing = (this.nextNode === other.currentNode);
                let heIsFollowing = (this.currentNode === other.nextNode);
                let isFrontalCrash = (this.currentNode === other.nextNode && this.nextNode === other.currentNode);

                if (d < 38 && (sameEdge || iAmFollowing || heIsFollowing) && !isFrontalCrash) {
                    this.isFused = true;
                }

                // NOUVEAU : Accélération modifiée (détecte de plus loin et accélère plus fort)
                if (sameEdge && this.progress < other.progress) {
                    if ((other.progress - this.progress) < 0.85) { // Était à 0.6, détecte de plus loin
                        this.progress += 0.035; // Était à 0.015, rattrape beaucoup plus vite !
                    }
                }
            }
        }
    }

    show() {
        noStroke();
        rectMode(CENTER);

        if (this.isFused) {
            fill(230, 126, 34);
            rect(this.currentX, this.currentY, 26, 26, 5);
        } else {
            if (this.state === 'CARRYING') fill(46, 204, 113); // Vert (Plein)
            else if (this.state === 'RETURNING' || this.state === 'IDLE') fill(149, 165, 166); // Gris (À vide, rentre au dépôt ou au repos)
            else fill(52, 152, 219); // Bleu (Va chercher un client)

            rect(this.currentX, this.currentY, 20, 20, 5);
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
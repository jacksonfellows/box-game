var canvas = document.getElementById("mycanvas");
var ctx = canvas.getContext("2d");

var CONFIG = {
	n_rows: 5,
	n_cols: 7,
	width: canvas.width,
	height: canvas.width
};

canvas.width = CONFIG.width;
canvas.height = CONFIG.height;

var SCALE = 30;
var TRANSFORM = {a: SCALE, b: 0, c: 0, d: SCALE, e: 10, f: 10};

function apply_inverse_transform(t, xy) {
	[x, y] = xy;
	// STUPID!!!
	console.assert(t.b == 0 && t.c == 0);
	return [(x - t.e) / t.a, (y - t.f) / t.d];
}

function draw_dots() {
	ctx.save();
	ctx.setTransform(TRANSFORM);
	ctx.fillStyle = "#ff0000";
	for (let row = 0; row <= 2 * CONFIG.n_rows; row += 2) {
		for (let col = 0; col <= 2 * CONFIG.n_cols; col += 2) {
			ctx.beginPath();
			ctx.arc(col, row, 2 / SCALE, 0, 2*Math.PI);
			ctx.fill();
		}
	}
	ctx.restore();
}

function draw_board(board) {
	ctx.save();
	ctx.setTransform(TRANSFORM);
	ctx.lineWidth = 2 / SCALE;
	for (let [r, c] of board) {
		if (r % 2 == 0) {
			// horizontal
			ctx.beginPath();
			ctx.moveTo(c - 1, r);
			ctx.lineTo(c + 1, r);
			ctx.stroke();
		} else if (c % 2 == 0) {
			// vertical
			ctx.beginPath();
			ctx.moveTo(c, r - 1);
			ctx.lineTo(c, r + 1);
			ctx.stroke();
		}
	}
	ctx.restore();
}

function draw_captured(captured) {
	ctx.save();
	ctx.setTransform(TRANSFORM);
	for (let r = 1; r < 2 * CONFIG.n_rows; r += 2) {
		for (let c = 1; c < 2 * CONFIG.n_cols; c += 2) {
			let cap = STATE.captured[(r - 1) / 2][(c - 1) / 2];
			if (cap) {
				ctx.fillStyle = ["", "#00ff00", "#0000ff"][cap];
				ctx.beginPath();
				ctx.moveTo(c - 1, r - 1);
				ctx.lineTo(c + 1, r - 1);
				ctx.lineTo(c + 1, r + 1);
				ctx.lineTo(c - 1, r + 1);
				ctx.fill();
			}
		}
	}
	ctx.restore();
}

function make_empty_captured() {
	let captured = Array(CONFIG.n_rows);
	for (let r = 0; r < CONFIG.n_rows; r++) {
		captured[r] = Array(CONFIG.n_cols);
		for (let c = 0; c < CONFIG.n_cols; c++) {
			captured[r][c] = 0;
		}
	}
	return captured;
}

var STATE = {
	board: [],
	cycles: [],
	captured: make_empty_captured(),
	currentPlayer: 1
};

function get_captured(cycle) {
	let captured = [];
	for (let r = 1; r < 2 * CONFIG.n_rows; r += 2) {
		for (let c = 1; c < 2 * CONFIG.n_cols; c += 2) {
			if (!STATE.captured[(r - 1) / 2][(c - 1) / 2] &&
				coord_in_cycle(cycle, [r, c])) {
				captured.push([r, c]);
			}
		}
	}
	return captured;
}

canvas.onclick = e => {
	let xy = apply_inverse_transform(TRANSFORM, [e.offsetX, e.offsetY]);
	let [col_near,row_near] = xy.map(Math.round);
	if (col_near % 2 != row_near % 2) {
		STATE.board.push([row_near, col_near]);
		let coord_to_try = col_near % 2 == 0 ?
			[row_near - 1, col_near] :
			[row_near, col_near - 1];
		let all_cycles = find_all_cycles(STATE.board, coord_to_try, []);
		if (all_cycles.length > 0) {
			let captured = all_cycles.map(get_captured).reduce((a, b) => a.length >= b.length ? a : b);
			for (let [r,c] of captured) {
				STATE.captured[(r - 1) / 2][(c - 1) / 2] = STATE.currentPlayer;
			}
		}
		STATE.currentPlayer = STATE.currentPlayer == 1 ? 2 : 1;
	}
	redraw();
};

function redraw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	draw_captured(STATE.captured);
	draw_board(STATE.board);
	draw_dots();
}

redraw();

function coord_eq(a, b) {
	return a[0] == b[0] && a[1] == b[1];
}

function contains_coord(board, coord) {
	let [r_, c_] = coord;
	for (let [r, c] of board) {
		if (r == r_ && c == c_) {
			return true;
		}
	}
	return false;
}

function get_neighbors(board, coord) {
	let [r, c] = coord;
	let neighbors = [];
	for (let [dr,dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
		if (contains_coord(board, [r + dr, c + dc])) {
			neighbors.push([r + 2 * dr, c + 2 * dc]);
		}
	}
	return neighbors;
}

function find_all_cycles(board, coord, visited) {
	if (visited.length > 0 && coord_eq(visited[0], coord)) {
		return [visited];
	}
	let cycles = [];
	for (let neighbor of get_neighbors(board, coord)) {
		if (visited.length == 1 && coord_eq(neighbor, visited[0])) {
			continue;
		}
		if (contains_coord(visited.slice(1), neighbor)) {
			continue;
		}
		cycles = cycles.concat(find_all_cycles(board, neighbor, visited.concat([coord])));
	}
	return cycles;
}

function edge_between(coord1, coord2) {
	let [r1,c1] = coord1;
	let [r2,c2] = coord2;
	if (r1 == r2) {
		return [r1, (c1 + c2) / 2];
	} else {
		return [(r1 + r2) / 2, c1];
	}
}

function cycle_to_edges(cycle) {
	let edges = [];
	for (let i = 0; i < cycle.length - 1; i++) {
		edges.push(edge_between(cycle[i], cycle[i + 1]));
	}
	edges.push(edge_between(cycle[cycle.length - 1], cycle[0]));
	return edges;
}

function coord_in_cycle(cycle, coord) {
	let edges = cycle_to_edges(cycle);
	let [r, c] = coord;
	// up
	let n_crosses = 0;
	for (let r_ = r - 1; r_ >= 0; r_ -= 2) {
		if (contains_coord(edges, [r_, c])) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// down
	n_crosses = 0;
	for (let r_ = r + 1; r_ <= 2 * CONFIG.n_rows; r_ += 2) {
		if (contains_coord(edges, [r_, c])) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// left
	n_crosses = 0;
	for (let c_ = c - 1; c_ >= 0; c_ -= 2) {
		if (contains_coord(edges, [r, c_])) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// right
	n_crosses = 0;
	for (let c_ = c + 1; c_ <= 2 * CONFIG.n_cols; c_ += 2) {
		if (contains_coord(edges, [r, c_])) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// all good
	return true;
}

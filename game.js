var canvas = document.getElementById("mycanvas");
var ctx = canvas.getContext("2d");

var CONFIG = {
	n_rows: 2,
	n_cols: 2,
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
			ctx.arc(col, row, 4 / SCALE, 0, 2*Math.PI);
			ctx.fill();
		}
	}
	ctx.restore();
}

function get_player_stroke(p) {
	return ["#00aa00", "#0000aa"][p - 1];
}

function get_player_fill(p) {
	return ["#ddffdd", "#ddddff"][p - 1];
}

function draw_board(board) {
	ctx.save();
	ctx.setTransform(TRANSFORM);
	let i = 0;
	for (let num of board) {
		let [r, c] = num_to_coord(num);
		let start, end;
		if (r % 2 == 0) {
			// horizontal
			start = [c - 1, r];
			end = [c + 1, r];
		} else if (c % 2 == 0) {
			// vertical
			start = [c, r - 1];
			end = [c, r + 1];
		}
		ctx.strokeStyle = get_player_stroke(i++ % 2 + 1);
		ctx.lineWidth = 4 / SCALE;
		ctx.beginPath();
		ctx.moveTo(...start);
		ctx.lineTo(...end);
		ctx.stroke();
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
				ctx.fillStyle = get_player_fill(cap);
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
	current_player: 1,
	dot_graph: {}
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

function coords_astride(edge) {
	let [r,c] = edge;
	if (r % 2 == 0) {
		return [[r, c - 1], [r, c + 1]];
	} else if (c % 2 == 0) {
		return [[r - 1, c], [r + 1, c]];
	}
	console.assert(true);
	return null;
}

function add_edge(graph, c1, c2) {
	graph[c1] = (graph[c1] || []).concat([c2]);
	graph[c2] = (graph[c2] || []).concat([c1]);
}

function remove_edge(graph, c1, c2) {
	if (graph[c1] && graph[c1].includes(c2)) {
		graph[c1] = (graph[c1] || []).filter(x => x != c2);
		graph[c2] = (graph[c2] || []).filter(x => x != c1);
	}
}

function prune_graph(graph, captured, captured_coord) {
	let [r,c] = captured_coord;
	console.assert(captured[(r - 1) / 2][(c - 1) / 2]);
	if ((c - 1) / 2 > 0 && captured[(r - 1) / 2][(c - 1) / 2 - 1]) {
		remove_edge(graph, coord_to_num([r - 1, c - 1]), coord_to_num([r + 1, c - 1]));
	}
	if ((c - 1) / 2 < CONFIG.n_cols - 1 && captured[(r - 1) / 2][(c - 1) / 2 + 1]) {
		remove_edge(graph, coord_to_num([r - 1, c + 1]), coord_to_num([r + 1, c + 1]));
	}
	if ((r - 1) / 2 > 0 && captured[(r - 1) / 2 - 1][(c - 1) / 2]) {
		remove_edge(graph, coord_to_num([r - 1, c - 1]), coord_to_num([r - 1, c + 1]));
	}
	if ((r - 1) / 2 < CONFIG.n_rows - 1 && captured[(r - 1) / 2 + 1][(c - 1) / 2]) {
		remove_edge(graph, coord_to_num([r + 1, c - 1]), coord_to_num([r + 1, c + 1]));
	}
}

function game_over() {
	let over = true;
	for (let r = 0; r < CONFIG.n_rows; r++) {
		for (let c = 0; c < CONFIG.n_cols; c++) {
			over = over && STATE.captured[r][c];
		}
	}
	return over;
}

function winning_player() {
	let counts = [0, 0];
	for (let r = 0; r < CONFIG.n_rows; r++) {
		for (let c = 0; c < CONFIG.n_cols; c++) {
			let p = STATE.captured[r][c];
			if (0 < p) {
				counts[p - 1]++;
			}
		}
	}
	if (counts[0] > counts[1]) {
		return 1;
	}
	if (counts[1] > counts[0]) {
		return 2;
	}
	return 0;
}

function handle_player() {
	if (STATE.current_player == 1) {
		canvas.onclick = handle_player_click;
	} else if (STATE.current_player == 2) {
		canvas.onclick = null;
		play_line(get_ai_move());
	}
}

function play_line(line) {
	console.log('player ' + STATE.current_player + ' played ' + line);
	
	STATE.board.push(coord_to_num(line));
	let [coord1, coord2] = coords_astride(line);

	// update graph
	add_edge(STATE.dot_graph, coord_to_num(coord1), coord_to_num(coord2));

	// perform capturing
	let coord_to_try = coord1; // could be coord2 doesn't matter
	let all_cycles = find_all_cycles(STATE.dot_graph, coord_to_num(coord_to_try), []);
	if (all_cycles.length > 0) {
		let captured = all_cycles.map(get_captured).reduce((a, b) => a.length >= b.length ? a : b);
		for (let [r,c] of captured) {
			STATE.captured[(r - 1) / 2][(c - 1) / 2] = STATE.current_player;
			prune_graph(STATE.dot_graph, STATE.captured, [r,c]);
		}
	}

	redraw();

	// see if game is over
	if (game_over()) {
		setTimeout(_ => {
			window.alert('player ' + winning_player() + ' won');
			location.reload();
		},
				   10);
	} else {
		// switch turn
		STATE.current_player = STATE.current_player == 1 ? 2 : 1;

		handle_player();
	}
}

window.onload = _ => {
	redraw();
	handle_player();
};

function handle_player_click(e) {
	let xy = apply_inverse_transform(TRANSFORM, [e.offsetX, e.offsetY]);
	let [col_near, row_near] = xy.map(Math.round);
	if (col_near % 2 != row_near % 2) {
		play_line([row_near, col_near]);
	}
};

function redraw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	draw_captured(STATE.captured);
	draw_board(STATE.board);
	draw_dots();
}

function coord_eq(a, b) {
	return a[0] == b[0] && a[1] == b[1];
}

function coord_to_num(coord) {
	let [r,c] = coord;
	return r * (2 * CONFIG.n_cols + 1) + c;
}

function num_to_coord(num) {
	return [Math.floor(num / (2 * CONFIG.n_cols + 1)), num % (2 * CONFIG.n_cols + 1)];
}

function find_all_cycles(graph, num, visited) {
	if (visited.length > 0 && visited[0] == num) {
		return [visited.map(num_to_coord)];
	}
	let cycles = [];
	for (let neighbor_num of graph[num]) {
		if (visited.length == 1 && neighbor_num == visited[0]) {
			continue;
		}
		if (visited.slice(1).includes(neighbor_num)) {
			continue;
		}
		cycles = cycles.concat(find_all_cycles(graph, neighbor_num, visited.concat([num])));
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
	let edges = cycle_to_edges(cycle).map(coord_to_num);
	let [r, c] = coord;
	// up
	let n_crosses = 0;
	for (let n = coord_to_num([r - 1, c]); n >= 0; n -= 2 * (2 * CONFIG.n_cols + 1)) {
		if (edges.includes(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// down
	n_crosses = 0;
	for (let n = coord_to_num([r + 1, c]); n <= (2 * CONFIG.n_rows + 1) * (CONFIG.n_cols * 2 + 1); n += 2 * (2 * CONFIG.n_cols + 1)) {
		if (edges.includes(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// left
	n_crosses = 0;
	for (let n = coord_to_num([r, c - 1]); n >= r * (2 * CONFIG.n_cols + 1); n -= 2) {
		if (edges.includes(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// right
	n_crosses = 0;
	for (let n = coord_to_num([r, c + 1]); n < (r + 1) * (2 * CONFIG.n_cols + 1); n += 2) {
		if (edges.includes(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// all good
	return true;
}

// AI

function get_ai_move() {
	for (let r = 0; r < 2 * CONFIG.n_rows + 1; r++) {
		for (let c = 0; c < 2 * CONFIG.n_cols + 1; c++) {
			if ((r % 2 != c % 2) && !STATE.board.includes(coord_to_num([r, c]))) {
				return [r, c];
			}
		}
	}
}

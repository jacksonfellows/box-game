var canvas = document.getElementById("mycanvas");
var ctx = canvas.getContext("2d");

var CONFIG = {
	n_rows: 2,
	n_cols: 2
};

var PAD = 0.2;
var SCALE = Math.min(canvas.width, canvas.height) / Math.max(2 * CONFIG.n_rows + 2 * PAD, 2 * CONFIG.n_cols + 2 * PAD);
var TRANSFORM = {a: SCALE, b: 0, c: 0, d: SCALE, e: PAD * SCALE, f: PAD * SCALE};

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

function empty_state() {
	return {
		board: [],
		captured: make_empty_captured(),
		current_player: 1,
		graph: {}
	};
}

var STATE = empty_state();

function get_captured(state, cycle) {
	let edges = cycle_to_edges_set(cycle);
	let captured = [];
	for (let r = 1; r < 2 * CONFIG.n_rows; r += 2) {
		for (let c = 1; c < 2 * CONFIG.n_cols; c += 2) {
			if (!state.captured[(r - 1) / 2][(c - 1) / 2] &&
				coord_in_cycle(edges, [r, c])) {
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
	if (!graph[c1]) {
		graph[c1] = new Set();
	}
	if (!graph[c2]) {
		graph[c2] = new Set();
	}
	graph[c1].add(c2);
	graph[c2].add(c1);
}

function remove_edge(graph, c1, c2) {
	if (graph[c1] && graph[c2]) {
		graph[c1].delete(c2);
		if (graph[c1].size == 0) {
			delete graph[c1];
		}
		graph[c2].delete(c1);
		if (graph[c2].size == 0) {
			delete graph[c2];
		}
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

function game_over(state) {
	let over = true;
	for (let r = 0; r < CONFIG.n_rows; r++) {
		for (let c = 0; c < CONFIG.n_cols; c++) {
			over = over && state.captured[r][c];
		}
	}
	return over;
}

function winning_player(state) {
	let counts = [0, 0];
	for (let r = 0; r < CONFIG.n_rows; r++) {
		for (let c = 0; c < CONFIG.n_cols; c++) {
			let p = state.captured[r][c];
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

function handle_human() {
	canvas.onclick = handle_player_click;
}

let MANUAL_OVERRIDE = false;

function handle_ai(ai) {
	return function() {
		if (MANUAL_OVERRIDE) {
			handle_human();
		} else {
			canvas.onclick = null;
			setTimeout(
				_ => play_line(ai(STATE)),
				0
			);
		}
	};
}

let PLAYERS_MAP = {
	1: handle_ai(min_max_ai(1)),
	2: handle_ai(min_max_ai(5)),
};

function handle_player() {
	PLAYERS_MAP[STATE.current_player]();
}

function get_captured_by_move(state, coord_to_try) {
	let all_cycles = find_all_cycles(state.graph, coord_to_num(coord_to_try));
	let captured = [];
	if (all_cycles.length > 0) {
		captured = all_cycles.map(cycle => get_captured(state, cycle)).reduce((a, b) => a.length >= b.length ? a : b);
	}
	return captured;
}

function do_move(state, line, prune = true) {
	state.board.push(coord_to_num(line));
	let [coord1, coord2] = coords_astride(line);

	// update graph
	add_edge(state.graph, coord_to_num(coord1), coord_to_num(coord2));

	// perform capturing
	let captured = get_captured_by_move(state, coord1); // could be coord2 doesn't matter
	for (let [r, c] of captured) {
		state.captured[(r - 1) / 2][(c - 1) / 2] = state.current_player;
		if (prune) {
			prune_graph(state.graph, state.captured, [r, c]);
		}
	}
}

function get_next_player(current_player) {
	return current_player == 1 ? 2 : 1;
}

function play_line(line) {
	do_move(STATE, line);

	redraw();

	// see if game is over
	if (game_over(STATE)) {
		console.log('player ' + winning_player(STATE) + ' won');
	} else {
		// switch turn
		STATE.current_player = get_next_player(STATE.current_player);

		handle_player();
	}
}

function play_ai_game(ai1, ai2) {
	let state = empty_state();
	while (!game_over(state)) {
		do_move(state, (state.current_player == 1 ? ai1 : ai2)(state));
		state.current_player = get_next_player(state.current_player);
	}
	return winning_player(state);
}

function rank_ais(ais, n_rounds) {
	let results = [];
	for (let i = 0; i < ais.length; i++) {
		results.push([]);
		for (let j = 0; j < ais.length; j++) {
			let wins = 0;
			for (let n = 0; n < n_rounds; n++) {
				if (play_ai_game(ais[i], ais[j]) == 1) {
					wins++;
				}
			}
			results[i].push(wins / n_rounds);
		}
	}
	return results;
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
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
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

function find_all_cycles(graph, num) {
	return find_all_cycles_rec(graph, num, new Set(), num);
}

function find_all_cycles_rec(graph, num, visited, first) {
	if (visited.size > 0 && num == first) {
		return [new Set(visited)];	// copy visited
	}
	let cycles = [];
	visited.add(num);
	for (let neighbor_num of graph[num]) {
		if (visited.size == 1 && neighbor_num == first) {
			continue;
		}
		if (neighbor_num != first && visited.has(neighbor_num)) {
			continue;
		}
		for (let cycle of find_all_cycles_rec(graph, neighbor_num, visited, first)) {
			cycles.push(cycle);
		}
	}
	visited.delete(num);
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

function cycle_to_edges_set(cycle) {
	let edges = new Set();
	let last = null;
	for (let val of cycle.values()) {
		if (last !== null) {
			edges.add(coord_to_num(edge_between(num_to_coord(last), num_to_coord(val))));
		}
		last = val;
	}
	edges.add(coord_to_num(edge_between(num_to_coord(last), num_to_coord(cycle.values().next().value))));
	return edges;
}

function coord_in_cycle(edges, coord) {
	let [r, c] = coord;
	// up
	let n_crosses = 0;
	for (let n = coord_to_num([r - 1, c]); n >= 0; n -= 2 * (2 * CONFIG.n_cols + 1)) {
		if (edges.has(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// down
	n_crosses = 0;
	for (let n = coord_to_num([r + 1, c]); n <= (2 * CONFIG.n_rows + 1) * (CONFIG.n_cols * 2 + 1); n += 2 * (2 * CONFIG.n_cols + 1)) {
		if (edges.has(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// left
	n_crosses = 0;
	for (let n = coord_to_num([r, c - 1]); n >= r * (2 * CONFIG.n_cols + 1); n -= 2) {
		if (edges.has(n)) {
			n_crosses += 1;
		}
	}
	if (n_crosses % 2 == 0) {
		return false;
	}
	// right
	n_crosses = 0;
	for (let n = coord_to_num([r, c + 1]); n < (r + 1) * (2 * CONFIG.n_cols + 1); n += 2) {
		if (edges.has(n)) {
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

function randint(max) {
	return Math.floor(Math.random() * max);
}

function edge_inside_captured_area(edge, captured) {
	let [r, c] = edge;
	console.assert(r % 2 != c % 2);
	if (r % 2 == 0) {
		return r > 0 && captured[r / 2 - 1][(c - 1) / 2] && captured[r / 2][(c - 1) / 2];
	} else {
		return c > 0 && captured[(r - 1) / 2][c / 2 - 1] && captured[(r - 1) / 2][c / 2];
	}
}

function get_valid_moves(state) {
	let moves = [];
	for (let r = 0; r < 2 * CONFIG.n_rows + 1; r++) {
		for (let c = 0; c < 2 * CONFIG.n_cols + 1; c++) {
			if ((r % 2 != c % 2) && !state.board.includes(coord_to_num([r, c])) && !edge_inside_captured_area([r, c], state.captured)) {
				moves.push([r, c]);
			}
		}
	}
	return moves;
}

function random_ai(state) {
	let moves = get_valid_moves(state);
	return moves[randint(moves.length)];
}

function seq_ai(state) {
	let moves = get_valid_moves(state);
	return moves[0];
}

function copy_graph(graph) {
	let new_graph = {};
	for (let [k, v] of Object.entries(graph)) {
		new_graph[k] = new Set(v);
	}
	return new_graph;
}

function copy_captured(captured) {
	let new_captured = [];
	for (let row of captured) {
		new_captured.push(row.slice());
	}
	return new_captured;
}

function copy_state(state) {
	return {
		board: state.board.slice(),
		captured: copy_captured(state.captured),
		current_player: state.current_player,
		graph: state.graph, // copy_graph(state.graph),
	};
}

function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		let j = randint(i + 1);
		let tmp = arr[j];
		arr[j] = arr[i];
		arr[i] = tmp;
	}
}

function get_score(state) {
	let score = 0;
	for (let row of state.captured) {
		for (let x of row) {
			if (x) {
				score += x == state.current_player ? 1 : -1;
			}
		}
	}
	return score;
}

function min_max_ai_rec(state, n_steps) {
	let best_score = -Infinity;
	let best_move = null;
	let moves = get_valid_moves(state);
	shuffle(moves);
	for (let line of moves) {
		// see how good this move is
		let state_copy = copy_state(state); // state.graph isn't copied
		
		do_move(state_copy, line, prune = false);
		let score = get_score(state_copy);
		// another level
		if (n_steps > 0) {
			state_copy.current_player = get_next_player(state_copy.current_player);
			let rec = min_max_ai_rec(state_copy, n_steps - 1);
			if (rec[0]) {
				score = -rec[1];
			}
		}

		// risky: undo move from graph!!
		let [n1, n2] = coords_astride(line).map(coord_to_num);
		remove_edge(state.graph, n1, n2);

		if (score > best_score) {
			best_score = score;
			best_move = line;
		}
	}
	return [best_move, best_score];
}

function min_max_ai(n_steps) {
	return function(state) {
		let r = min_max_ai_rec(state, n_steps);
		console.log(r);
		return r[0];
	};
}

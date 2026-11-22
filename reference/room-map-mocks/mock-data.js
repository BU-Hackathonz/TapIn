// Sample room for the mock pages. Same shape as GET /api/graph, plus the extra fields a profile card would show.
const MockData = (() => {
  const P = (id, name, group_id, points, skills, looking_for, extra = {}) => ({ id, name, role: "student", group_id, here: true, focus: false, points, skills, looking_for, ...extra });
  const people = [
    P(1, "Maya", 1, 55, ["backend", "data"], ["design"]), P(2, "Leo", 1, 51, ["frontend"], ["ml"]), P(3, "Aisha", 1, 48, ["design"], ["backend"]), P(4, "Finn", 1, 40, ["hardware"], ["pitch"]), P(5, "Sofia", 1, 36, ["pitch"], ["data"]),
    P(6, "Noah", 2, 60, ["frontend", "design"], ["backend"]), P(7, "Priya", 2, 53, ["data"], ["pitch"]), P(8, "Tomas", 2, 44, ["backend"], ["design"]), P(9, "Ava", 2, 40, ["ml"], ["frontend"]),
    P(10, "Zoe", 3, 57, ["ml", "data"], ["hardware"]), P(11, "Kai", 3, 52, ["hardware"], ["ml"]), P(12, "Ruby", 3, 49, ["backend"], ["design"]), P(13, "Iris", 3, 45, ["design"], ["backend"]), P(14, "Jonah", 3, 38, ["frontend"], ["pitch"]),
    P(15, "Hugo", 4, 41, ["hardware"], ["frontend"]), P(16, "Cole", 4, 35, ["backend"], ["hardware"]), P(17, "Elena", 4, 33, ["design"], ["data"], { focus: true }),
    P(18, "Omar", 5, 30, ["data"], ["design"]), P(19, "Lina", 5, 28, ["pitch"], ["ml"]),
    P(20, "Dev", null, 6, ["frontend", "ml"], ["backend"]), P(21, "Grace", null, 4, ["design"], ["hardware"]), P(22, "Raj", null, 2, ["backend"], ["pitch"]),
    { id: 90, name: "Nina", role: "mentor", group_id: null, here: true, focus: false, points: 0, skills: ["pitch", "design"], looking_for: [] },
    { id: 91, name: "Ben", role: "mentor", group_id: null, here: true, focus: false, points: 0, skills: ["hardware", "firmware"], looking_for: [] },
  ];
  const groups = [
    { id: 1, name: "Table 1", working_on: "bike-lane heatmap", mode: "open", points: 90, station_id: 1, looking_for: ["design"] },
    { id: 2, name: "Table 2", working_on: "lab-bench scheduler", mode: "open", points: 75, station_id: 2, looking_for: ["backend"] },
    { id: 3, name: "Table 3", working_on: "AR campus map", mode: "open", points: 65, station_id: 2, looking_for: ["hardware"] },
    { id: 4, name: "Table 4", working_on: "noise meter for libraries", mode: "open", points: 50, station_id: 1, looking_for: ["frontend"] },
    { id: 5, name: "Table 5", working_on: "study-room finder", mode: "heads_down", points: 30, station_id: 2, looking_for: [] },
  ];
  const L = (a, b, strength = 1) => ({ a, b, strength });
  const links = [L(1, 2, 3), L(1, 3), L(2, 3), L(1, 4), L(3, 5), L(6, 7, 2), L(6, 8), L(7, 9), L(10, 11, 2), L(10, 12), L(11, 13), L(12, 14), L(15, 16), L(15, 17), L(18, 19),
    L(1, 6), L(2, 10), L(5, 15), L(8, 12), L(13, 17), L(7, 18), L(90, 6), L(90, 1), L(91, 15), L(91, 10)];
  const needs = [
    { table: "Table 1", group_id: 1, need: "design", since: "49m" }, { table: "Table 4", group_id: 4, need: "frontend", since: "30m" }, { table: "Table 3", group_id: 3, need: "hardware", since: "12m" },
  ];
  const letter = (n) => String.fromCharCode(64 + n);
  return { graph: { people: people.map((p) => ({ ...p, label: p.role === "student" ? p.name : p.name + ", " + p.role })), groups, links }, people, groups, links, needs, letter,
    byId: new Map(people.map((p) => [p.id, p])), groupOf: (id) => groups.find((g) => g.id === id) };
})();

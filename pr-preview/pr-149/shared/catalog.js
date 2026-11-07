/* Every playground once. `missions` is the mission count of each chapter, in chapter order; `sep` joins chapter and
   mission in the save's `done` keys. tests/trophy/catalog.test.mjs fails when either drifts from the real content. */
(function (root) {
  const SUBJECTS = [
    { id: 'programming', name: 'Programming', href: 'programming/', unit: 'quests', icon: '💻' },
    { id: 'math', name: 'Math', href: 'math/', unit: 'tracks', icon: '📐' },
  ];
  const QUESTS = [
    { key: 'script-quest-v1', name: 'Script Quest', subject: 'programming', href: 'programming/script-quest/', sep: '-', missions: [7, 7, 7, 6, 6, 7, 7, 9, 7, 7, 10, 13] },
    { key: 'python-quest-v1', name: 'Python Quest', subject: 'programming', href: 'programming/python-quest/', sep: '.', missions: [6, 7, 8, 6, 6, 7, 6, 5, 6] },
    { key: 'cpp-quest-v1', name: 'C++ Quest', subject: 'programming', href: 'programming/cpp-quest/', sep: '-', missions: [7, 9, 6, 8, 9, 9, 8, 6, 6] },
    { key: 'shell-quest-v1', name: 'Shell Quest', subject: 'programming', href: 'programming/shell-quest/', sep: '.', missions: [8, 7, 7, 7, 7, 7, 9, 7, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7] },
    { key: 'harbor-quest-v1', name: 'Harbor Quest', subject: 'programming', href: 'programming/harbor-quest/', sep: '.', missions: [6, 6, 9, 8, 10, 9, 7, 7, 8, 7, 7, 7] },
    { key: 'ds-quest-v1', name: 'Data Structures Quest', subject: 'programming', href: 'programming/ds-quest/', sep: '.', missions: [5, 4, 3, 4, 5, 5] },
    { key: 'net-quest-v1', name: 'Network Quest', subject: 'programming', href: 'programming/net-quest/', sep: '.', missions: [8, 5, 6, 6, 7] },
    { key: 'agent-quest-v1', name: 'Agent Quest', subject: 'programming', href: 'programming/agent-quest/', sep: '.', missions: [5, 5, 4, 5, 5, 4, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
    { key: 'math-arithmetic-v1', name: 'Arithmetic', subject: 'math', href: 'math/arithmetic/', sep: '.', missions: [5, 5, 5, 5, 5] },
    { key: 'math-algebra-v1', name: 'Algebra', subject: 'math', href: 'math/algebra/', sep: '.', missions: [5, 5, 5, 5, 5] },
    { key: 'math-geometry-v1', name: 'Geometry', subject: 'math', href: 'math/geometry/', sep: '.', missions: [5, 5, 5, 5] },
    { key: 'math-trigonometry-v1', name: 'Trigonometry', subject: 'math', href: 'math/trigonometry/', sep: '.', missions: [5] },
  ];
  root.Catalog = { SUBJECTS, QUESTS };
})(typeof window !== 'undefined' ? window : globalThis);

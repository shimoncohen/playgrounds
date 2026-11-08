(function (root) {
  root.STORY = {
    world: 'Oakford, a forest village whose old ranger, Ada, hid her gold and retired, leaving a hidden map and a journal full of wolf sightings.',
    places: ['the clearing and forest', 'the cave and the chest', 'the camp and the village square', 'the gatehouse and Mira\'s market stall', 'Ada\'s lodge workshop', 'the watchtower above the cave', 'the vault under the gate'],
    cast: [
      { name: 'Ranger Ada', role: 'left the map, the journal and the clues' },
      { name: 'Mira', role: 'the shopkeeper who keeps the ledgers' },
      { name: 'the Owl', role: 'the forest guide' },
      { name: 'the Wolf', role: 'a curious tail-along, the wolf of the journal' },
    ],
    treasure: 'Ada\'s vault under the Oakford gate, opened with the code from secrets.txt once your own guard script runs safely; the chest\'s gold was only the first lock.',
  };
})(typeof window !== 'undefined' ? window : globalThis);

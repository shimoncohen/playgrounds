(function (root) {
  root.STORY = {
    world: 'Lantern Harbor, a sleepy fishing harbor that wants to become a busy trading town, where Harbormaster Marlow has hidden her sea chest somewhere on the docks and out among the fleet.',
    places: ['the arrivals dock', 'the supply quay', 'the crew deck', 'the signal tower', 'the logbook office', 'the shipyard', 'the dock-schedule hall', 'the open sea', 'the lifeboat station', 'the lighthouse beams', 'the refit slip', 'the harbor shop'],
    cast: [
      { name: 'Harbormaster Marlow', role: 'left the clues and the chest' },
      { name: 'Gull', role: 'chatty courier gull who carries messages between docks' },
      { name: 'Captain Brine', role: 'grumpy rival who locked the chest and lost the key' },
    ],
    treasure: 'The sea chest in the harbor shop, opened with the note found in the very first crate at the arrivals dock.',
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  root.STORY = {
    world: 'The Starlight Circus, a travelling circus whose retired ringmaster, Bellamy, left the big top dark and a trail of tickets to the lantern that lights the show. You are the new stagehand.',
    places: ['the ticket booth', 'the prop wagon and the juggling ring', 'the costume trunk and the strongman\'s belt', 'the clock wagon and the snack wagon', 'the poster press', 'backstage at the big top'],
    cast: [
      { name: 'Ringmaster Bellamy', role: 'left the trail of tickets' },
      { name: 'Pepper', role: 'the tightrope kid who tags along and asks why' },
      { name: 'Mumbles', role: 'the parrot that repeats whatever it hears' },
    ],
    treasure: 'The big-top lantern: dark in chapter 0, lit by the last chapter\'s npm start so the show can begin.',
  };
})(typeof window !== 'undefined' ? window : globalThis);

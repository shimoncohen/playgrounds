(function (root) {
  root.STORY = {
    world: 'The Starlight Circus goes on tour by rail, and you are now the tour\'s engineer: the wagons, the towns and the timetable are yours to keep straight.',
    places: ['the booking depot', 'the rail yard', 'the signal tower', 'the engine wagon'],
    cast: [
      { name: 'Ringmaster Bellamy', role: 'retired from the ring, and sends bookings by telegram from each town' },
      { name: 'Pepper', role: 'the tightrope kid who asks "why?" about everything' },
      { name: 'Mumbles', role: 'the parrot that repeats whatever it hears, and will repeat anything in the timetable too' },
    ],
    treasure: 'The Golden Timetable, a tour timetable that can never double-book a wagon. It starts as a smudged paper copy that books Mumbles twice in the booking depot, and is finished at the engine wagon as a typed command-line tool.',
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  root.STORY = {
    world: 'A cobbled street market where old stallkeeper Pim hid her lucky coin purse, leaving a price-chalk clue at each stall.',
    places: ['the price board', 'the cold cellar', 'the bakery stall', 'the tile-sellers\' yard', 'the sticker and jacket stalls', 'Pim\'s caravan'],
    cast: [
      { name: 'Pim', role: 'retired stallkeeper who left the chalk clues' },
      { name: 'Wick', role: 'the market kid who runs between stalls' },
      { name: 'Dot', role: 'a goose that steals coins and pays them back wrongly' },
    ],
    treasure: 'Pim\'s lucky purse, whose lock opens with the total chalked on the first price card.',
  };
})(typeof window !== 'undefined' ? window : globalThis);

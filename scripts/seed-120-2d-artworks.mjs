import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const common = [
  ["Claude Monet", "The Magpie", 1869],
  ["Claude Monet", "The Boulevard des Capucines", 1873],
  ["Claude Monet", "The Gare Saint-Lazare", 1877],
  ["Pierre-Auguste Renoir", "Two Sisters", 1881],
  ["Pierre-Auguste Renoir", "The Skiff", 1879],
  ["Pierre-Auguste Renoir", "La Parisienne", 1874],
  ["Camille Pissarro", "The Boulevard Montmartre, Morning", 1897],
  ["Camille Pissarro", "Hay Harvest at Éragny", 1901],
  ["Camille Pissarro", "The Garden of Les Mathurins", 1876],
  ["Berthe Morisot", "Summer's Day", 1879],
  ["Berthe Morisot", "The Harbor at Lorient", 1869],
  ["Berthe Morisot", "Woman and Child on a Balcony", 1872],
  ["Mary Cassatt", "Little Girl in a Blue Armchair", 1878],
  ["Mary Cassatt", "Portrait of Alexander J. Cassatt and His Son", 1884],
  ["Mary Cassatt", "Woman Bathing", 1890],
  ["Edgar Degas", "The Absinthe Drinker", 1876],
  ["Edgar Degas", "L'Atelier de la danse", 1873],
  ["Edgar Degas", "Racehorses at Longchamp", 1874],
  ["Édouard Manet", "The Balcony", 1869],
  ["Édouard Manet", "A Bar at the Folies-Bergère", 1882],
  ["Édouard Manet", "The Fifer", 1866],
  ["Gustave Courbet", "The Desperate Man", 1845],
  ["Gustave Courbet", "The Hammock", 1844],
  ["Gustave Courbet", "The Wave", 1860],
  ["Paul Cézanne", "Mont Sainte-Victoire", 1887],
  ["Paul Cézanne", "Still Life with Apples", 1893],
  ["Paul Cézanne", "The Large Bathers", 1906],
  ["Paul Gauguin", "Vision After the Sermon", 1888],
  ["Paul Gauguin", "The Yellow Christ", 1889],
  ["Paul Gauguin", "Tahitian Women on the Beach", 1891],
  ["Henri Rousseau", "Tiger in a Tropical Storm", 1891],
  ["Henri Rousseau", "The Sleeping Gypsy", 1897],
  ["Henri Rousseau", "The Snake Charmer", 1907],
  ["Henri de Toulouse-Lautrec", "La Goulue at the Moulin Rouge", 1892],
  ["Henri de Toulouse-Lautrec", "Jane Avril", 1892],
  ["Henri de Toulouse-Lautrec", "The Bed", 1893],
  ["John Constable", "Salisbury Cathedral from the Meadows", 1831],
  ["John Constable", "Dedham Vale", 1828],
  ["John Constable", "Wivenhoe Park", 1816],
  ["J.M.W. Turner", "The Fighting Temeraire", 1839],
  ["J.M.W. Turner", "Snow Storm", 1842],
  ["J.M.W. Turner", "Ulysses Deriding Polyphemus", 1829],
  ["Caspar David Friedrich", "The Sea of Ice", 1824],
  ["Caspar David Friedrich", "Two Men Contemplating the Moon", 1825],
  ["Caspar David Friedrich", "The Abbey in the Oakwood", 1810],
  ["William Blake", "Newton", 1795],
  ["William Blake", "The Great Red Dragon", 1805],
  ["William Blake", "Satan Exulting over Eve", 1795],
  ["Winslow Homer", "Snap the Whip", 1872],
  ["Winslow Homer", "The Gulf Stream", 1899],
  ["Winslow Homer", "Summer Night", 1890],
  ["George Inness", "Moonrise", 1891],
  ["George Inness", "The Home of the Heron", 1893],
  ["George Inness", "Peace and Plenty", 1865],
  ["Albert Bierstadt", "Among the Sierra Nevada", 1868],
  ["Albert Bierstadt", "The Rocky Mountains, Lander's Peak", 1863],
  ["Albert Bierstadt", "A Storm in the Rocky Mountains", 1866],
  ["Thomas Cole", "The Course of Empire: The Consummation of Empire", 1836],
  ["Thomas Cole", "View from Mount Holyoke", 1827],
  ["Thomas Cole", "The Titan's Goblet", 1833],
  ["Albert Bierstadt", "Sunset in the Yosemite Valley", 1868],
  ["George Inness", "Autumn Oaks", 1878],
  ["John Constable", "The Hay Wain Study", 1821],
  ["J.M.W. Turner", "Dido Building Carthage", 1815],
  ["Paul Cézanne", "Still Life with a Curtain", 1895],
  ["Pierre-Auguste Renoir", "The Umbrellas", 1886],
  ["Winslow Homer", "The Red Canoe", 1885],
  ["William Blake", "The Great Red Dragon and the Woman Clothed with the Sun", 1805],
  ["Camille Pissarro", "The Boulevard Montmartre on a Winter Morning", 1897],
  ["Édouard Manet", "Music in the Tuileries", 1862],
];

const uncommon = [
  ["Albrecht Dürer", "Praying Hands", 1508],
  ["Albrecht Dürer", "The Four Horsemen", 1498],
  ["Albrecht Dürer", "Adam and Eve", 1504],
  ["Artemisia Gentileschi", "Susanna and the Elders", 1610],
  ["Artemisia Gentileschi", "Self-Portrait as the Allegory of Painting", 1638],
  ["Caravaggio", "Bacchus", 1596],
  ["Caravaggio", "The Supper at Emmaus", 1601],
  ["Caravaggio", "David with the Head of Goliath", 1607],
  ["El Greco", "The Burial of the Count of Orgaz", 1588],
  ["El Greco", "Saint Sebastian", 1610],
  ["El Greco", "The Disrobing of Christ", 1579],
  ["Francisco Goya", "The Nude Maja", 1800],
  ["Francisco Goya", "The Clothed Maja", 1805],
  ["Francisco Goya", "Saturn Devouring His Son", 1823],
  ["Gustave Doré", "The Valley of Tears", 1883],
  ["Gustave Doré", "The Rime of the Ancient Mariner", 1876],
  ["Gustave Doré", "The Neophyte", 1878],
  ["Jean-Auguste-Dominique Ingres", "The Turkish Bath", 1862],
  ["Jean-Auguste-Dominique Ingres", "Jupiter and Thetis", 1811],
  ["Jean-Auguste-Dominique Ingres", "Portrait of Madame Moitessier", 1856],
  ["John Singer Sargent", "Carnation, Lily, Lily, Rose", 1887],
  ["John Singer Sargent", "El Jaleo", 1882],
  ["John Singer Sargent", "Gassed", 1919],
  ["John William Waterhouse", "Hylas and the Nymphs", 1896],
  ["John William Waterhouse", "Circe Invidiosa", 1892],
  ["John William Waterhouse", "Echo and Narcissus", 1903],
  ["Joshua Reynolds", "Lady Caroline Howard", 1778],
  ["Joshua Reynolds", "The Infant Hercules Strangling Serpents", 1786],
  ["Joshua Reynolds", "Colonel Tarleton", 1782],
  ["Mary Cassatt", "In the Loge", 1878],
  ["Mary Cassatt", "The Letter", 1890],
  ["Mary Cassatt", "The Boating Party", 1894],
  ["Nicolas Poussin", "The Abduction of the Sabine Women", 1638],
  ["Nicolas Poussin", "The Triumph of Pan", 1636],
  ["Nicolas Poussin", "The Shepherds of Arcadia", 1638],
  ["Odilon Redon", "The Buddha", 1905],
  ["Odilon Redon", "The Birth of Venus", 1912],
  ["Odilon Redon", "Closed Eyes", 1890],
  ["Piero della Francesca", "The Flagellation of Christ", 1455],
  ["Piero della Francesca", "The Resurrection", 1463],
  ["Piero della Francesca", "Portraits of the Duke and Duchess of Urbino", 1474],
  ["Angelica Kauffman", "Ariadne Abandoned by Theseus", 1774],
  ["Asher B. Durand", "Progress: The Advance of Civilization", 1853],
  ["Berthe Morisot", "The Artist's Daughter, Julie, with Her Nanny", 1884],
  ["Camille Pissarro", "The Harvest", 1882],
  ["Edgar Degas", "The Milliners", 1882],
  ["Francisco Goya", "The Parasol", 1777],
  ["Gustave Courbet", "The Sleepers", 1866],
  ["Henri Rousseau", "The Equatorial Jungle", 1909],
  ["Paul Gauguin", "The Bathers", 1898],
  ["Thomas Cole", "The Architect's Dream", 1840],
];

const rare = [
  ["Andrea del Sarto", "The Madonna of the Harpies", 1517],
  ["Angelica Kauffman", "The Farewell of Abelard and Heloise", 1780],
  ["Bartolomé Esteban Murillo", "The Young Beggar", 1650],
  ["Domenichino", "The Vision of Saint John", 1608],
  ["Élisabeth Vigée Le Brun", "Marie Antoinette with a Rose", 1783],
  ["Frederic Remington", "The End of the Day", 1904],
  ["Lawrence Alma-Tadema", "An Eloquent Silence", 1890],
  ["Max Liebermann", "The Flax Barn in Laren", 1887],
  ["Rosa Bonheur", "Ploughing in the Nivernais", 1849],
  ["Thomas Eakins", "The Swimming Hole", 1885],
  ["Thomas Gainsborough", "Mr and Mrs Andrews", 1750],
  ["Tintoretto", "Susanna and the Elders", 1555],
  ["Titian", "Bacchus and Ariadne", 1523],
  ["Pieter Bruegel the Elder", "The Tower of Babel", 1563],
  ["Pieter Bruegel the Elder", "The Blind Leading the Blind", 1568],
  ["Sandro Botticelli", "Primavera", 1482],
  ["Rembrandt", "The Anatomy Lesson of Dr. Nicolaes Tulp", 1632],
  ["Johannes Vermeer", "The Art of Painting", 1668],
  ["Vincent van Gogh", "The Bedroom", 1888],
  ["Vincent van Gogh", "Irises", 1889],
  ["Albrecht Dürer", "Saint Jerome in His Study", 1514],
  ["Caravaggio", "The Musicians", 1597],
  ["Claude Monet", "The Japanese Bridge", 1899],
  ["El Greco", "Laocoön", 1614],
  ["John Constable", "The White Horse", 1819],
  ["Paul Cézanne", "The House of the Hanged Man", 1873],
  ["Rembrandt", "Self-Portrait with Two Circles", 1665],
  ["Titian", "Diana and Actaeon", 1556],
  ["Édouard Manet", "The Rue Mosnier Decorated with Flags", 1878],
  ["Winslow Homer", "The Herring Net", 1885],
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const database = client.db(process.env.MONGODB_DB);
const existingSeedCount = await database
  .collection("artworks")
  .countDocuments({ source: "2d-artwork-catalog-seed" });
if (existingSeedCount >= 120) {
  console.log(JSON.stringify({ inserted: 0, skipped: 120, common: 60, uncommon: 40, rare: 20 }));
  await client.close();
  process.exit(0);
}
const artists = await database
  .collection("artists")
  .find({}, { projection: { _id: 1, artist_name: 1 } })
  .toArray();
const artistIds = new Map(artists.map((artist) => [artist.artist_name, artist._id]));
const missingArtists = [...common, ...uncommon, ...rare]
  .map(([artist]) => artist)
  .filter((artist) => !artistIds.has(artist));
if (missingArtists.length > 0) {
  throw new Error(`Missing artists: ${[...new Set(missingArtists)].join(", ")}`);
}

const existing = await database
  .collection("artworks")
  .find({}, { projection: { artist: 1, title: 1 } })
  .toArray();
const existingKeys = new Set(
  existing.map((artwork) => `${artwork.artist}\u0000${artwork.title}`.toLowerCase()),
);
const activeAttributes = await database
  .collection("attributes")
  .find({ active: true }, { projection: { _id: 1 } })
  .sort({ _id: 1 })
  .toArray();
if (activeAttributes.length === 0) throw new Error("No active special attributes found.");

const batches = [
  ["common", common],
  ["uncommon", uncommon],
  ["rare", rare],
];
const targets = { common: 60, uncommon: 40, rare: 20 };
let inserted = 0;
let skipped = 0;
const insertedByRarity = { common: 0, uncommon: 0, rare: 0 };
for (const [rarity, works] of batches) {
  for (const [index, [artist, title, date]] of works.entries()) {
    if (insertedByRarity[rarity] >= targets[rarity]) break;
    const key = `${artist}\u0000${title}`.toLowerCase();
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const isRare = rarity === "rare";
    const height = 35 + ((inserted + index) % 8) * 11;
    await database.collection("artworks").insertOne({
      _id: crypto.randomBytes(12).toString("hex"),
      artist_id: artistIds.get(artist),
      artist,
      title,
      date,
      genre: "Painting and works on paper",
      medium: "Oil on canvas",
      rarity,
      value_scale: isRare
        ? Number((0.62 + (index % 5) * 0.025).toFixed(3))
        : rarity === "uncommon"
          ? Number((0.4 + (index % 5) * 0.025).toFixed(3))
          : Number((0.2 + (index % 5) * 0.025).toFixed(3)),
      height,
      width: Number((height * 1.35).toFixed(2)),
      active: true,
      ...(isRare
        ? {
            special_attributes: [
              activeAttributes[index % activeAttributes.length]._id,
            ],
            unique_attributes: [],
          }
        : {}),
      created_at: new Date(),
      source: "2d-artwork-catalog-seed",
    });
    existingKeys.add(key);
    inserted += 1;
    insertedByRarity[rarity] += 1;
  }
}

if (inserted + skipped !== 120) {
  throw new Error(
    `Expected 120 catalog entries to be processed, inserted ${inserted} and skipped ${skipped}.`,
  );
}
console.log(JSON.stringify({ inserted, skipped, ...insertedByRarity }));
await client.close();

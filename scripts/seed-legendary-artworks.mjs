import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const works = [
  ["Albrecht Dürer", "Melencolia I", 1514],
  ["Albrecht Dürer", "Self-Portrait at Twenty-Eight", 1500],
  ["Artemisia Gentileschi", "Judith Slaying Holofernes", 1620],
  ["Caravaggio", "The Calling of Saint Matthew", 1600],
  ["Caravaggio", "Medusa", 1597],
  ["Caspar David Friedrich", "Wanderer above the Sea of Fog", 1818],
  ["Claude Monet", "Impression, Sunrise", 1872],
  ["Claude Monet", "Water Lilies", 1916],
  ["Diego Rivera", "Man at the Crossroads", 1934],
  ["Edgar Degas", "The Ballet Class", 1874],
  ["El Greco", "View of Toledo", 1599],
  ["Francisco Goya", "The Third of May 1808", 1814],
  ["Gustave Courbet", "The Artist's Studio", 1855],
  ["Gustave Doré", "The Triumph of Christianity", 1898],
  ["Henri Rousseau", "The Dream", 1910],
  ["Henri de Toulouse-Lautrec", "At the Moulin Rouge", 1895],
  ["J.M.W. Turner", "Rain, Steam and Speed", 1844],
  ["Jean-Auguste-Dominique Ingres", "La Grande Odalisque", 1814],
  ["Jean-Léon Gérôme", "Pollice Verso", 1872],
  ["John Everett Millais", "Ophelia", 1852],
  ["John Singer Sargent", "Madame X", 1884],
  ["John William Waterhouse", "The Lady of Shalott", 1888],
  ["Joshua Reynolds", "The Age of Innocence", 1788],
  ["Mary Cassatt", "The Child's Bath", 1893],
  ["Nicolas Poussin", "Et in Arcadia Ego", 1637],
  ["Odilon Redon", "The Cyclops", 1914],
  ["Paul Cézanne", "The Card Players", 1895],
  ["Paul Gauguin", "Where Do We Come From? What Are We? Where Are We Going?", 1898],
  ["Piero della Francesca", "The Baptism of Christ", 1450],
  ["Pierre-Auguste Renoir", "Luncheon of the Boating Party", 1881],
  ["Pieter Bruegel the Elder", "The Hunters in the Snow", 1565],
  ["Rosa Bonheur", "The Horse Fair", 1855],
  ["Thomas Cole", "The Oxbow", 1836],
  ["Thomas Eakins", "The Gross Clinic", 1875],
  ["Thomas Gainsborough", "The Blue Boy", 1770],
  ["Tintoretto", "The Miracle of the Slave", 1548],
  ["Titian", "Venus of Urbino", 1538],
  ["William Blake", "The Ancient of Days", 1794],
  ["Winslow Homer", "Breezing Up", 1876],
  ["Édouard Manet", "Olympia", 1863],
  ["Élisabeth Vigée Le Brun", "Self-Portrait in a Straw Hat", 1782],
  ["Andrea del Sarto", "The Barber Institute Madonna", 1515],
  ["Angelica Kauffman", "Cornelia Presenting Her Children as Her Treasures", 1785],
  ["Asher B. Durand", "Kindred Spirits", 1849],
  ["Bartolomé Esteban Murillo", "The Immaculate Conception of the Venerables", 1678],
  ["Berthe Morisot", "The Cradle", 1872],
  ["Camille Pissarro", "Boulevard Montmartre at Night", 1897],
  ["Domenichino", "The Last Communion of Saint Jerome", 1614],
  ["Frederic Remington", "The Cheyenne", 1901],
  ["George Inness", "The Lackawanna Valley", 1856],
];

const client = new MongoClient(process.env.MONGODB_URI);
console.log("[MONGO-CONNECT] seed-legendary-artworks.mjs: connecting");
await client.connect();
console.log("[MONGO-CONNECT] seed-legendary-artworks.mjs: connected");
const database = client.db(process.env.MONGODB_DB);
const artists = await database
  .collection("artists")
  .find({}, { projection: { _id: 1, artist_name: 1 } })
  .toArray();
const artistIds = new Map(artists.map((artist) => [artist.artist_name, artist._id]));
const existing = await database
  .collection("artworks")
  .find({}, { projection: { artist: 1, title: 1 } })
  .toArray();
const existingKeys = new Set(
  existing.map((artwork) => `${artwork.artist}\u0000${artwork.title}`.toLowerCase()),
);
const pairs = await database
  .collection("unique_attributes")
  .find({ active: true }, { projection: { _id: 1, linked_pair: 1 } })
  .sort({ linked_pair: 1 })
  .toArray();
const attributes = await database
  .collection("attributes")
  .find({ active: true }, { projection: { _id: 1 } })
  .sort({ _id: 1 })
  .toArray();
if (pairs.length !== 36 || attributes.length < 9) {
  throw new Error("Expected the active legendary attribute configuration.");
}

let inserted = 0;
let skipped = 0;
for (let index = 0; index < works.length; index += 1) {
  const [artist, title, date] = works[index];
  const key = `${artist}\u0000${title}`.toLowerCase();
  if (existingKeys.has(key)) {
    skipped += 1;
    continue;
  }
  const uniqueAttribute = pairs[index % pairs.length];
  const specialAttributes = uniqueAttribute.linked_pair.split(":");

  const id = crypto.randomBytes(12).toString("hex");
  await database.collection("artworks").insertOne({
    _id: id,
    artist_id: artistIds.get(artist),
    artist,
    title,
    date,
    genre: "Academic and historical painting",
    medium: "Oil on canvas",
    rarity: "legendary",
    value_scale: Number((0.72 + (index % 8) * 0.03).toFixed(3)),
    height: 60 + (index % 7) * 12,
    width: 42 + (index % 7) * 9,
    active: true,
    special_attributes: specialAttributes,
    unique_attributes: [uniqueAttribute._id],
    created_at: new Date(),
    source: "legendary-catalog-seed",
  });
  existingKeys.add(key);
  inserted += 1;
}

console.log(JSON.stringify({ inserted, skipped, total: works.length }));
await client.close();

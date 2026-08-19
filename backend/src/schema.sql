CREATE TABLE IF NOT EXISTS utilisateurs (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  identifiant TEXT UNIQUE NOT NULL,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cuisinier', 'serveur'))
);

CREATE TABLE IF NOT EXISTS tables_restaurant (
  id SERIAL PRIMARY KEY,
  numero TEXT NOT NULL,
  code_qr TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS plats (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prix NUMERIC(10,2) NOT NULL,
  photo_url TEXT,
  portions_restantes INTEGER NOT NULL DEFAULT 0,
  disponible BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS commandes (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES tables_restaurant(id),
  statut TEXT NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'en_preparation', 'prete', 'servie')),
  date_creation TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_commande (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id),
  plat_id INTEGER NOT NULL REFERENCES plats(id),
  quantite INTEGER NOT NULL DEFAULT 1
);
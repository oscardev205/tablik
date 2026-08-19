CREATE TABLE parrains (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  code_parrainage TEXT UNIQUE NOT NULL,
  pourcentage_commission NUMERIC(5,2) NOT NULL DEFAULT 10,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE restaurants (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'essai' CHECK (statut IN ('essai', 'actif', 'expire')),
  date_fin_essai TIMESTAMP,
  date_fin_abonnement TIMESTAMP,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  telephone TEXT UNIQUE,
  parrain_id INTEGER REFERENCES parrains(id)
);

CREATE TABLE utilisateurs (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  identifiant TEXT UNIQUE NOT NULL,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cuisinier', 'serveur', 'super_admin', 'parrain')),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  doit_changer_mot_de_passe BOOLEAN NOT NULL DEFAULT TRUE,
  restaurant_id INTEGER REFERENCES restaurants(id),
  parrain_id INTEGER REFERENCES parrains(id)
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  UNIQUE (nom, restaurant_id)
);

CREATE TABLE plats (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prix NUMERIC(10,2) NOT NULL,
  photo_url TEXT,
  portions_restantes INTEGER NOT NULL DEFAULT 0,
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  categorie_id INTEGER REFERENCES categories(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  mis_en_avant BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE tables_restaurant (
  id SERIAL PRIMARY KEY,
  numero TEXT NOT NULL,
  code_qr TEXT UNIQUE NOT NULL,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)
);

CREATE TABLE commandes (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES tables_restaurant(id),
  statut TEXT NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'en_preparation', 'prete', 'servie')),
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  note TEXT
);

CREATE TABLE lignes_commande (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id),
  plat_id INTEGER NOT NULL REFERENCES plats(id),
  quantite INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE parametres_plateforme (
  id SERIAL PRIMARY KEY,
  montant_abonnement NUMERIC(10,2) NOT NULL DEFAULT 6000,
  numero_mtn TEXT,
  numero_moov TEXT,
  numero_celtiis TEXT
);
INSERT INTO parametres_plateforme (montant_abonnement) VALUES (6000);

CREATE TABLE demandes_paiement (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  operateur TEXT NOT NULL CHECK (operateur IN ('mtn', 'moov', 'celtiis')),
  id_transaction TEXT NOT NULL,
  montant NUMERIC(10,2) NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'refusee')),
  raison_refus TEXT,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_traitement TIMESTAMP,
  nombre_mois INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE commissions (
  id SERIAL PRIMARY KEY,
  parrain_id INTEGER NOT NULL REFERENCES parrains(id),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  demande_paiement_id INTEGER NOT NULL REFERENCES demandes_paiement(id),
  montant NUMERIC(10,2) NOT NULL,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE demandes_retrait (
  id SERIAL PRIMARY KEY,
  parrain_id INTEGER NOT NULL REFERENCES parrains(id),
  montant NUMERIC(10,2) NOT NULL,
  operateur TEXT NOT NULL CHECK (operateur IN ('mtn', 'moov', 'celtiis')),
  numero_reception TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'refusee')),
  raison_refus TEXT,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_traitement TIMESTAMP
);
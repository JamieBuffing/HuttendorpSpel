# Mongodb

## Samenvatting

Deze uitleg is automatisch voorbereid op basis van de huidige code in `modules/mongodb`.
De modulemap is volledig meegekopieerd zodat deze direct als template-upload gebruikt kan worden.

## Basis

- Key: `mongodb`
- Naam: Mongodb
- Categorie: Data
- Slug: `mongodb`
- Route pad: `/mongodb`
- Bestanden in modulemap: 8

## Structuur in deze template

- De volledige huidige modulecode staat in deze map.
- `dependencies.md` bevat de afgeleide npm packages uit de code.
- `uitleg.md` bevat deze basisdocumentatie.

## Aanwezig in code

- index.js: ja
- public/: ja
- server/: ja
- views/: ja

## app.js koppeling

- Importregel: `const mongodb = require('./modules/mongodb');`
- Routevariabele: `mongodb`

## ENV variabelen

De volgende ENV keys zijn in de code gevonden:

- `MONGODB_DB_NAME`
- `MONGODB_URI`

## Opmerking

Controleer vooral naam, categorie, slug en eventuele dependencies nog even inhoudelijk voordat je hem definitief op Drive zet.
De technische basis, ENV-keys en module-inhoud zijn al klaargezet op basis van de huidige codebase.

# Vercelblob

## Samenvatting

Deze uitleg is automatisch voorbereid op basis van de huidige code in `modules/vercelblob`.
De modulemap is volledig meegekopieerd zodat deze direct als template-upload gebruikt kan worden.

## Basis

- Key: `vercelblob`
- Naam: Vercelblob
- Categorie: Data
- Slug: `vercelblob`
- Route pad: `/vercelblob`
- Bestanden in modulemap: 9

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

- Importregel: `const vercelblob = require('./modules/vercelblob');`
- Routevariabele: `vercelblob`

## ENV variabelen

De volgende ENV keys zijn in de code gevonden:

- `BLOB_READ_WRITE_TOKEN`
- `BLOB_REQUIRE_LOGIN`

## Opmerking

Controleer vooral naam, categorie, slug en eventuele dependencies nog even inhoudelijk voordat je hem definitief op Drive zet.
De technische basis, ENV-keys en module-inhoud zijn al klaargezet op basis van de huidige codebase.

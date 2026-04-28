# Vercel Blob Upload gebruiken in andere modules

## 1. Script toevoegen in je EJS

Plaats dit in je pagina:

``` html
<script type="module" src="/vercelblob/static/js/uploader.js"></script>
<script src="/jouwmodule/static/js/index.js"></script>
```

------------------------------------------------------------------------

## 2. HTML form maken

``` html
<form id="uploadForm">
  <input type="file" id="file" />
  <button type="submit">Upload</button>
</form>

<div id="status"></div>
```

------------------------------------------------------------------------

## 3. JavaScript in jouw module

``` js
const form = document.getElementById('uploadForm')
const fileInput = document.getElementById('file')
const status = document.getElementById('status')

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const file = fileInput.files[0]
  if (!file) {
    status.textContent = 'Kies een bestand'
    return
  }

  status.textContent = 'Upload bezig...'

  try {
    const result = await window.JaBuvoBlobUploader.uploadWithVercelBlob(file, {
      module: 'nielsen',
      entityType: 'concurrentie',
      entityId: 'algemeen',
      field: 'bestand'
    })

    status.textContent = 'Upload gelukt!'
    console.log(result)

  } catch (err) {
    status.textContent = 'Upload mislukt: ' + err.message
  }
})
```

------------------------------------------------------------------------

## 4. Wat je terugkrijgt

``` js
result.url
result.pathname
result.contentType
```

------------------------------------------------------------------------

## 5. Belangrijk

-   Upload gebeurt direct naar Vercel Blob
-   Gebruiker blijft op dezelfde pagina
-   `/vercelblob` wordt alleen op de achtergrond gebruikt
-   Werkt ook voor bestanden groter dan 4MB

------------------------------------------------------------------------

## 6. Optioneel (opslaan in DB)

Na upload kun je doen:

``` js
await fetch('/api/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: result.url,
    pathname: result.pathname
  })
})
```

# ESP32 Box API

Toegevoegd voor de Huttendorp ESP32 boxen.

De boxen hoeven geen `gameId` mee te sturen. De server koppelt elke aanvraag automatisch aan het spel dat in de webinterface als actief spel is geselecteerd.

## POST /api/box/check-card

Request:

```json
{
  "postId": "p01",
  "boxId": "box-p01",
  "uid": "04AABBCC"
}
```

Response bij succes:

```json
{
  "ok": true,
  "uid": "04AABBCC",
  "postId": "p01",
  "gameId": "...",
  "teamId": "...",
  "teamName": "Team 1",
  "questionTitle": "...",
  "alreadyAnswered": false,
  "existingAnswer": null,
  "answeredAt": null
}
```

## POST /api/box/submit-answer

Request:

```json
{
  "postId": "p01",
  "boxId": "box-p01",
  "uid": "04AABBCC",
  "answer": "R"
}
```

Antwoord mag `R`, `G` of `B` zijn.

Response bij succes:

```json
{
  "ok": true,
  "alreadyAnswered": false,
  "gameId": "...",
  "gameName": "Huttendorp 2026",
  "postId": "p01",
  "uid": "04AABBCC",
  "answer": "R",
  "teamName": "Team 1",
  "questionTitle": "...",
  "isCorrect": true,
  "pointsEarned": 10,
  "totalPoints": 20
}
```

## GET /api/box/status

Geeft simpele serverstatus terug voor testen en toont ook het actieve `gameId`.
